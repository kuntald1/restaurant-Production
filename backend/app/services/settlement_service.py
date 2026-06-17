"""
app/services/settlement_service.py

Bill Settlement — edit an already-billed order (add / soft-remove items),
recompute SGST/CGST + total from the company's GST rates, and cascade the
net change to customer_credit_log (by bill number) and crm_customer.due_amount
(by customer id).  Every add/remove is written to bill_settlement_log so the
Bill Settlement Report can show exactly what changed.

Kept deliberately separate from pos_service so the normal POS billing path
is untouched (pos_service._assert_order_editable blocks billed orders — this
flow is the sanctioned exception for post-bill corrections).
"""
import math
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.pos_models import Order, OrderItem, Bill
from app.models.company_model import Company
from app.models.crm_models import CrmCustomer, CustomerCreditLog
from app.models.bill_settlement_model import BillSettlementLog


# ── number helpers (mirror pos_service rounding) ──────────────────────────
def round_half_up(n) -> int:
    """Whole-rupee rounding, identical to pos_service.round_half_up."""
    return math.floor(float(n) + 0.5)


def _r2(n) -> float:
    return float(Decimal(str(float(n))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


# ── bill detail (same shape as GET /pos/bill/{bill_id}) ───────────────────
def get_bill_detail(db: Session, bill_id: int) -> dict:
    bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    order = db.query(Order).filter(Order.order_id == bill.order_id).first()
    items = db.query(OrderItem).filter(OrderItem.order_id == bill.order_id).all()

    bill_dict = {c.name: getattr(bill, c.name) for c in bill.__table__.columns}
    if order:
        order_dict = {c.name: getattr(order, c.name) for c in order.__table__.columns}
        order_dict["order_items"] = [
            {c.name: getattr(i, c.name) for c in i.__table__.columns} for i in items
        ]
        bill_dict["order"] = order_dict
    return bill_dict


# ── core: settle a bill ───────────────────────────────────────────────────
def settle_bill(db: Session, bill_id: int, req) -> dict:
    bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    order = db.query(Order).filter(Order.order_id == bill.order_id).first()
    if not order:
        raise HTTPException(404, "Underlying order not found")

    company = (
        db.query(Company)
        .filter(Company.company_unique_id == order.company_unique_id)
        .first()
    )
    sgst_rate = float(getattr(company, "sgst", 0) or 0) if company else 0.0
    cgst_rate = float(getattr(company, "cgst", 0) or 0) if company else 0.0

    old_total = float(bill.total_payable or 0)
    now = datetime.utcnow()
    pending_logs = []   # filled with dicts, written after totals known

    # 1) Removals — soft cancel (keep row for audit) ──────────────────────
    for rm in (req.removes or []):
        item = (
            db.query(OrderItem)
            .filter(
                OrderItem.order_item_id == rm.order_item_id,
                OrderItem.order_id == order.order_id,
            )
            .first()
        )
        if not item or item.is_cancelled:
            continue
        item.is_cancelled = True
        item.cancelled_reason = rm.reason or "Removed during settlement"
        item.updated_at = now
        pending_logs.append({
            "action": "removed",
            "order_item_id": item.order_item_id,
            "food_menu_id": item.food_menu_id,
            "item_name": item.item_name,
            "quantity": item.quantity,
            "unit_price": float(item.unit_price or 0),
            "line_amount": round(float(item.unit_price or 0)) * int(item.quantity or 0),
            "reason": item.cancelled_reason,
        })

    # 2) Additions ────────────────────────────────────────────────────────
    for ad in (req.adds or []):
        rounded_price = round(float(ad.unit_price))
        item = OrderItem(
            order_id          = order.order_id,
            company_unique_id = req.company_id,
            food_menu_id      = ad.food_menu_id,
            item_name         = ad.item_name,
            item_code         = ad.item_code or "",
            category_id       = ad.category_id,
            category_name     = ad.category_name or "",
            unit_price        = rounded_price,
            quantity          = ad.quantity,
            total_price       = rounded_price * ad.quantity,
            modifiers         = [],
            is_veg            = ad.is_veg,
            notes             = ad.notes,
        )
        db.add(item)
        db.flush()   # get order_item_id
        pending_logs.append({
            "action": "added",
            "order_item_id": item.order_item_id,
            "food_menu_id": item.food_menu_id,
            "item_name": item.item_name,
            "quantity": item.quantity,
            "unit_price": rounded_price,
            "line_amount": rounded_price * int(item.quantity or 0),
            "reason": None,
        })

    db.flush()

    # 3) Recompute totals (GST from company rates; base = subtotal - disc - promo)
    active = (
        db.query(OrderItem)
        .filter(OrderItem.order_id == order.order_id, OrderItem.is_cancelled == False)  # noqa: E712
        .all()
    )
    subtotal  = sum(round(float(i.unit_price or 0)) * int(i.quantity or 0) for i in active)
    discount  = float(order.discount_amount or 0)
    promo     = float(getattr(bill, "promo_amount", 0) or 0)
    surcharge = float(getattr(order, "table_surcharge_amount", 0) or 0) or float(order.service_charge or 0)

    gst_base  = max(0.0, subtotal - discount - promo)
    sgst_amt  = _r2(gst_base * sgst_rate / 100.0)
    cgst_amt  = _r2(gst_base * cgst_rate / 100.0)
    tax_amt   = _r2(sgst_amt + cgst_amt)
    new_total = round_half_up(subtotal - discount - promo + surcharge + tax_amt)

    # ── write back to order ──
    order.subtotal      = subtotal
    order.sgst_amount   = sgst_amt
    order.cgst_amount   = cgst_amt
    order.tax_amount    = tax_amt
    order.total_payable = new_total
    order.updated_at    = now
    order.updated_by    = req.settled_by

    # ── write back to bill ──
    bill.subtotal      = subtotal
    bill.sgst_amount   = sgst_amt
    bill.cgst_amount   = cgst_amt
    bill.tax_amount    = tax_amt
    bill.total_payable = new_total
    bill.item_count    = len(active)
    bill.updated_at    = now

    delta = float(new_total) - float(old_total)

    # 4) Customer cascade — dues + credit log (by bill number / customer id)
    customer_id = bill.customer_id or order.customer_id
    if customer_id and abs(delta) > 0.001:
        cust = db.query(CrmCustomer).filter(CrmCustomer.customer_id == customer_id).first()
        if cust:
            cust.due_amount = float(cust.due_amount or 0) + delta
            db.add(CustomerCreditLog(
                company_unique_id = order.company_unique_id,
                customer_id       = customer_id,
                order_id          = order.order_id,
                order_number      = order.order_number,
                bill_id           = bill.bill_id,
                bill_number       = bill.bill_number,
                amount            = delta,
                payment_status    = "adjustment",
                notes             = f"Bill settlement adjustment ({bill.bill_number}): net {delta:+.2f}",
            ))

    # 5) Settlement audit log
    for r in pending_logs:
        db.add(BillSettlementLog(
            company_unique_id = order.company_unique_id,
            bill_id           = bill.bill_id,
            bill_number       = bill.bill_number,
            order_id          = order.order_id,
            order_number      = order.order_number,
            order_item_id     = r["order_item_id"],
            food_menu_id      = r["food_menu_id"],
            item_name         = r["item_name"],
            quantity          = r["quantity"],
            unit_price        = r["unit_price"],
            line_amount       = r["line_amount"],
            action            = r["action"],
            reason            = r["reason"],
            customer_id       = customer_id,
            amount_delta      = delta,
            settled_by        = req.settled_by,
            settled_at        = now,
        ))

    db.commit()
    return get_bill_detail(db, bill_id)


# ── report: items added / removed, grouped by bill ────────────────────────
def get_settlement_report(
    db: Session,
    company_id: int,
    from_date: str = None,
    to_date: str = None,
    branch_id: int = None,
    bill_number: str = None,
):
    sql = text(
        """
        WITH scope AS (
            SELECT company_unique_id, name FROM company
            WHERE company_unique_id = :cid OR parant_company_unique_id = :cid
        )
        SELECT
            l.log_id, l.company_unique_id, l.bill_id, l.bill_number,
            l.order_id, l.order_number, l.order_item_id, l.food_menu_id,
            l.item_name, l.quantity, l.unit_price, l.line_amount,
            l.action, l.reason, l.customer_id, l.amount_delta,
            l.settled_by, l.settled_at::TEXT AS settled_at,
            s.name AS branch_name
        FROM bill_settlement_log l
        JOIN scope s ON s.company_unique_id = l.company_unique_id
        WHERE l.company_unique_id IN (SELECT company_unique_id FROM scope)
          AND (:from_date IS NULL OR l.settled_at::date >= CAST(:from_date AS date))
          AND (:to_date   IS NULL OR l.settled_at::date <= CAST(:to_date   AS date))
          AND (:branch_id IS NULL OR l.company_unique_id = :branch_id)
          AND (:bill_number IS NULL OR l.bill_number ILIKE '%' || :bill_number || '%')
        ORDER BY l.settled_at DESC, l.log_id DESC
        """
    )
    params = {
        "cid": company_id,
        "from_date": (from_date.strip() if from_date and from_date.strip() else None),
        "to_date": (to_date.strip() if to_date and to_date.strip() else None),
        "branch_id": branch_id,
        "bill_number": (bill_number.strip() if bill_number and bill_number.strip() else None),
    }
    rows = db.execute(sql, params).fetchall()

    groups: dict = {}
    for r in rows:
        m = r._mapping
        key = (m["bill_number"] or f"bill-{m['bill_id']}")
        g = groups.get(key)
        if g is None:
            g = {
                "bill_number": m["bill_number"] or "",
                "bill_id": int(m["bill_id"]) if m["bill_id"] else None,
                "order_number": m["order_number"] or "",
                "branch_name": m["branch_name"] or "",
                "company_unique_id": int(m["company_unique_id"]),
                "settled_at": m["settled_at"] or "",
                "net_delta": float(m["amount_delta"] or 0),
                "added": [],
                "removed": [],
            }
            groups[key] = g
        entry = {
            "item_name": m["item_name"],
            "quantity": int(m["quantity"] or 0),
            "unit_price": float(m["unit_price"] or 0),
            "line_amount": float(m["line_amount"] or 0),
            "reason": m["reason"] or "",
            "settled_at": m["settled_at"] or "",
        }
        if m["action"] == "removed":
            g["removed"].append(entry)
        else:
            g["added"].append(entry)

    # most recent settlement first
    return sorted(groups.values(), key=lambda x: x["settled_at"], reverse=True)
