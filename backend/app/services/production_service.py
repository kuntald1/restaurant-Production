"""
production_service.py — Central Kitchen Production Entry

Flow:
  1. Create draft entry — select recipe + finished item + planned qty
     → system auto-calculates raw material lines from recipe
  2. Manager reviews/adjusts raw material quantities
  3. Post entry:
     → raw materials deducted from CK stock
     → finished goods added to CK stock
     → status → posted
"""

from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.inventory_models import (
    ProductionEntry, ProductionEntryItem,
    Recipe, RecipeIngredient, InventoryItem, StockBalance,
)
from app.services.inventory_service import _adjust_balance


# ── Auto-generate production number ──────────────────────────
def _next_production_number(db: Session, company_id: int) -> str:
    result = db.execute(text("""
        SELECT COUNT(*) as cnt FROM inv_production_entry
        WHERE company_unique_id = :cid
    """), {"cid": company_id}).fetchone()
    seq = (result.cnt or 0) + 1
    return f"PRD-{str(seq).zfill(6)}"


# ── Get all production entries ────────────────────────────────
def get_all(db: Session, company_id: int) -> list:
    entries = db.execute(text("""
        SELECT
            pe.production_id, pe.production_number, pe.production_date,
            pe.planned_qty, pe.produced_qty, pe.status, pe.notes,
            pe.total_raw_cost, pe.node_id, pe.recipe_id, pe.finished_item_id,
            pe.created_at, pe.posted_at, pe.yield_uom_id,
            ii.item_name   AS finished_item_name,
            r.recipe_name,
            n.node_name,
            u.uom_symbol
        FROM inv_production_entry pe
        LEFT JOIN inv_item ii    ON ii.item_id = pe.finished_item_id
        LEFT JOIN inv_recipe r   ON r.recipe_id = pe.recipe_id
        LEFT JOIN inv_node n     ON n.node_id = pe.node_id
        LEFT JOIN inv_unit_of_measure u ON u.uom_id = pe.yield_uom_id
        WHERE pe.company_unique_id = :cid
          AND pe.is_active = TRUE
        ORDER BY pe.production_date DESC, pe.production_id DESC
    """), {"cid": company_id}).fetchall()

    return [dict(r._mapping) for r in entries]


# ── Get single entry with items ───────────────────────────────
def get_by_id(db: Session, production_id: int) -> dict:
    entry = db.execute(text("""
        SELECT
            pe.production_id, pe.production_number, pe.production_date,
            pe.planned_qty, pe.produced_qty, pe.status, pe.notes,
            pe.total_raw_cost, pe.node_id, pe.recipe_id, pe.finished_item_id,
            pe.yield_uom_id, pe.created_at, pe.posted_at,
            ii.item_name AS finished_item_name,
            r.recipe_name, n.node_name,
            u.uom_symbol
        FROM inv_production_entry pe
        LEFT JOIN inv_item ii    ON ii.item_id = pe.finished_item_id
        LEFT JOIN inv_recipe r   ON r.recipe_id = pe.recipe_id
        LEFT JOIN inv_node n     ON n.node_id = pe.node_id
        LEFT JOIN inv_unit_of_measure u ON u.uom_id = pe.yield_uom_id
        WHERE pe.production_id = :pid
    """), {"pid": production_id}).fetchone()

    if not entry:
        return None

    items = db.execute(text("""
        SELECT
            pei.prod_item_id, pei.item_id, pei.required_qty,
            pei.actual_qty, pei.uom_id, pei.unit_cost,
            ii.item_name,
            u.uom_symbol,
            COALESCE(sb.qty_on_hand, 0) AS stock_on_hand
        FROM inv_production_entry_item pei
        LEFT JOIN inv_item ii ON ii.item_id = pei.item_id
        LEFT JOIN inv_unit_of_measure u ON u.uom_id = pei.uom_id
        LEFT JOIN inv_stock_balance sb ON sb.item_id = pei.item_id
            AND sb.node_id = (
                SELECT node_id FROM inv_production_entry
                WHERE production_id = :pid
            )
        WHERE pei.production_id = :pid
          AND pei.is_active = TRUE
    """), {"pid": production_id}).fetchall()

    return {
        **dict(entry._mapping),
        "items": [dict(i._mapping) for i in items],
    }


# ── Create production entry (draft) ──────────────────────────
def create(db: Session, data: dict) -> dict:
    company_id  = data["company_unique_id"]
    recipe_id   = data.get("recipe_id")
    planned_qty = Decimal(str(data["planned_qty"]))

    # Auto-generate number
    prod_number = _next_production_number(db, company_id)

    entry = ProductionEntry(
        company_unique_id = company_id,
        production_number = prod_number,
        node_id           = data.get("node_id"),
        recipe_id         = recipe_id,
        finished_item_id  = data.get("finished_item_id"),
        production_date   = data.get("production_date", date.today()),
        planned_qty       = planned_qty,
        yield_uom_id      = data.get("yield_uom_id"),
        status            = "draft",
        notes             = data.get("notes"),
        created_by        = data.get("created_by"),
    )
    db.add(entry)
    db.flush()

    # Auto-populate raw material lines from recipe
    if recipe_id:
        recipe = db.query(Recipe).filter_by(recipe_id=recipe_id).first()
        ingredients = db.query(RecipeIngredient).filter_by(
            recipe_id=recipe_id, is_active=True
        ).all()

        # recipe.yield_qty = qty the recipe produces for given ingredient amounts
        # scale factor = planned_qty / recipe.yield_qty
        recipe_yield = Decimal(str(recipe.yield_qty or 1))
        scale = planned_qty / recipe_yield

        total_cost = Decimal("0")
        for ing in ingredients:
            if not ing.item_id:
                continue
            required = Decimal(str(ing.qty)) * scale
            item = db.query(InventoryItem).filter_by(item_id=ing.item_id).first()
            unit_cost = Decimal(str(item.standard_cost or 0)) if item else Decimal("0")
            line_cost = required * unit_cost
            total_cost += line_cost

            pei = ProductionEntryItem(
                company_unique_id = company_id,
                production_id     = entry.production_id,
                item_id           = ing.item_id,
                required_qty      = round(required, 3),
                actual_qty        = round(required, 3),  # default = required
                uom_id            = ing.uom_id,
                unit_cost         = unit_cost,
            )
            db.add(pei)

        entry.total_raw_cost = total_cost

    db.commit()
    return get_by_id(db, entry.production_id)


# ── Update draft entry ────────────────────────────────────────
def update(db: Session, production_id: int, data: dict) -> dict:
    entry = db.query(ProductionEntry).filter_by(
        production_id=production_id, is_active=True
    ).first()
    if not entry or entry.status == "posted":
        raise ValueError("Cannot edit a posted production entry")

    updatable = ["node_id", "recipe_id", "finished_item_id", "production_date",
                 "planned_qty", "yield_uom_id", "notes", "updated_at"]
    for k in updatable:
        if k in data:
            setattr(entry, k, data[k])
    entry.updated_at = datetime.utcnow()

    # Update individual item actual_qty overrides
    if "items" in data:
        for it in data["items"]:
            pei = db.query(ProductionEntryItem).filter_by(
                prod_item_id=it["prod_item_id"]
            ).first()
            if pei:
                pei.actual_qty = Decimal(str(it.get("actual_qty", pei.required_qty)))

    db.commit()
    return get_by_id(db, production_id)


# ── Stock sufficiency check ──────────────────────────────────
def check_stock_sufficiency(db: Session, production_id: int) -> dict:
    """
    Check if CK node has enough stock for all raw materials.
    Returns: { sufficient: bool, shortages: [...] }
    """
    entry = db.query(ProductionEntry).filter_by(production_id=production_id).first()
    if not entry:
        raise ValueError("Production entry not found")

    items = db.query(ProductionEntryItem).filter_by(
        production_id=production_id, is_active=True
    ).all()

    shortages = []
    for it in items:
        if not it.item_id:
            continue
        needed = Decimal(str(it.actual_qty or it.required_qty))
        # Get current stock at CK node
        balance = db.query(StockBalance).filter_by(
            item_id=it.item_id, node_id=entry.node_id
        ).first()
        on_hand = Decimal(str(balance.qty_on_hand)) if balance else Decimal("0")

        if on_hand < needed:
            item = db.query(InventoryItem).filter_by(item_id=it.item_id).first()
            shortages.append({
                "item_id":    it.item_id,
                "item_name":  item.item_name if item else f"Item #{it.item_id}",
                "needed":     float(needed),
                "available":  float(on_hand),
                "short_by":   float(needed - on_hand),
            })

    return {
        "sufficient": len(shortages) == 0,
        "shortages":  shortages,
        # Max producible qty based on most constrained ingredient
        "max_producible": _calc_max_producible(db, entry, items),
    }


def _calc_max_producible(db: Session, entry: ProductionEntry, items: list) -> float:
    """Calculate maximum producible qty based on available stock."""
    if not items or not entry.planned_qty:
        return 0.0
    planned = Decimal(str(entry.planned_qty))
    min_ratio = Decimal("1.0")
    for it in items:
        if not it.item_id:
            continue
        needed = Decimal(str(it.actual_qty or it.required_qty))
        if needed == 0:
            continue
        balance = db.query(StockBalance).filter_by(
            item_id=it.item_id, node_id=entry.node_id
        ).first()
        on_hand = Decimal(str(balance.qty_on_hand)) if balance else Decimal("0")
        ratio = on_hand / needed
        if ratio < min_ratio:
            min_ratio = ratio
    return float((planned * min_ratio).quantize(Decimal("0.001")))


# ── Post production entry ─────────────────────────────────────
def post(db: Session, production_id: int, posted_by: str = None) -> dict:
    """
    Post the entry:
    1. Check stock sufficiency — BLOCK if any shortage
    2. Deduct each raw material from CK node stock
    3. Add finished goods to CK node stock
    4. Mark as posted
    """
    entry = db.query(ProductionEntry).filter_by(
        production_id=production_id, is_active=True
    ).first()
    if not entry:
        raise ValueError("Production entry not found")
    if entry.status == "posted":
        raise ValueError("Already posted")

    # ── STRICT CHECK: block if any ingredient is insufficient ──
    check = check_stock_sufficiency(db, production_id)
    if not check["sufficient"]:
        shortage_lines = "\n".join([
            f"• {s['item_name']}: Need {s['needed']:.3f}, Available {s['available']:.3f}, Short by {s['short_by']:.3f}"
            for s in check["shortages"]
        ])
        raise ValueError(
            f"INSUFFICIENT_STOCK:{len(check['shortages'])} ingredient(s) have insufficient stock at this node:\n{shortage_lines}"
            f"\n\nMax producible with current stock: {check['max_producible']:.2f} units."
            f"\nPlease transfer more stock from Main Warehouse or reduce planned quantity."
        )

    node_id    = entry.node_id
    company_id = entry.company_unique_id

    items = db.query(ProductionEntryItem).filter_by(
        production_id=production_id, is_active=True
    ).all()

    # 1. Deduct raw materials from CK node
    for it in items:
        if not it.item_id:
            continue
        qty_used = Decimal(str(it.actual_qty or it.required_qty))
        _adjust_balance(db, company_id, node_id, it.item_id, -qty_used)

    # 2. Add finished goods to CK node
    produced_qty = Decimal(str(entry.planned_qty))
    if entry.finished_item_id:
        _adjust_balance(db, company_id, node_id, entry.finished_item_id, produced_qty)

    # 3. Update entry status
    entry.status       = "posted"
    entry.produced_qty = produced_qty
    entry.posted_at    = datetime.utcnow()
    entry.posted_by    = posted_by

    db.commit()
    return get_by_id(db, production_id)


# ── Delete (soft) ─────────────────────────────────────────────
def delete(db: Session, production_id: int) -> None:
    entry = db.query(ProductionEntry).filter_by(production_id=production_id).first()
    if not entry or entry.status == "posted":
        raise ValueError("Cannot delete a posted entry")
    entry.is_active = False
    db.commit()
