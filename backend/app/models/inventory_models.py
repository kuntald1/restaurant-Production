"""
Inventory Management Models
Covers all 8 modules:
  1. Item/Ingredient Master
  2. Stock In / Purchase Management (PO → GRN → Stock update)
  3. Stock Out / Consumption (recipe-based auto deduction)
  4. Waste Management
  5. Stock Count / Physical Audit
  6. Recipe Management (costing, sub-recipes)
  7. Supplier Management (rate card, payment ledger, performance)
  8. Reports (view-based, no model needed — served via query)
"""

from sqlalchemy import (
    Column, BigInteger, Integer, String, Text, Boolean,
    Numeric, DateTime, Date, ForeignKey, Identity, Enum
)
from sqlalchemy.sql import func
import enum
from app.database import Base


# ─────────────────────────────────────────────
# 1. ITEM / INGREDIENT MASTER
# ─────────────────────────────────────────────

class UnitOfMeasure(Base):
    """Master list of units: KG, Litre, Pieces, etc."""
    __tablename__ = "inv_unit_of_measure"

    uom_id            = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    uom_name          = Column(String(50), nullable=False)   # e.g. KG, Litre, Pcs
    uom_symbol        = Column(String(20), nullable=True)    # e.g. kg, L, pcs
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    created_by        = Column(String(200), nullable=True)
    updated_at        = Column(DateTime, nullable=True)
    updated_by        = Column(String(200), nullable=True)


class ItemCategory(Base):
    """Category for inventory items: Vegetables, Beverages, etc."""
    __tablename__ = "inv_item_category"

    item_category_id  = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    category_name     = Column(String(100), nullable=False)
    description       = Column(Text, nullable=True)
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    created_by        = Column(String(200), nullable=True)
    updated_at        = Column(DateTime, nullable=True)
    updated_by        = Column(String(200), nullable=True)


class InventoryItem(Base):
    """
    Master list of ingredients / raw materials.
    Each node (WH, CK, Branch) shares the same item master under a company.
    """
    __tablename__ = "inv_item"

    item_id               = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id     = Column(BigInteger, nullable=False)
    item_category_id      = Column(BigInteger, ForeignKey("inv_item_category.item_category_id", ondelete="SET NULL"), nullable=True)
    item_code             = Column(String(50), nullable=True)   # optional barcode / SKU
    item_name             = Column(String(200), nullable=False)
    description           = Column(Text, nullable=True)
    uom_id                = Column(BigInteger, ForeignKey("inv_unit_of_measure.uom_id", ondelete="SET NULL"), nullable=True)
    reorder_level         = Column(Numeric(12, 3), default=0)   # low-stock alert threshold
    standard_cost         = Column(Numeric(12, 2), default=0)   # default cost per UOM unit
    is_active             = Column(Boolean, default=True, nullable=False)
    created_at            = Column(DateTime, server_default=func.now(), nullable=False)
    created_by            = Column(String(200), nullable=True)
    updated_at            = Column(DateTime, nullable=True)
    updated_by            = Column(String(200), nullable=True)


# ─────────────────────────────────────────────
# NODE (Location) MASTER
# We reuse company.company_unique_id as node_id.
# node_type differentiates WH / CK / Branch.
# ─────────────────────────────────────────────

class InventoryNode(Base):
    """
    Represents a physical location: Warehouse, Cloud Kitchen, Branch.
    Linked to company via company_unique_id.
    """
    __tablename__ = "inv_node"

    node_id           = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)          # owner company
    node_name         = Column(String(200), nullable=False)
    node_type         = Column(String(50), nullable=False)          # warehouse | cloud_kitchen | branch
    parent_node_id    = Column(BigInteger, ForeignKey("inv_node.node_id", ondelete="SET NULL"), nullable=True)
    address           = Column(Text, nullable=True)
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    created_by        = Column(String(200), nullable=True)
    updated_at        = Column(DateTime, nullable=True)
    updated_by        = Column(String(200), nullable=True)


# ─────────────────────────────────────────────
# STOCK BALANCE (live running balance per node per item)
# ─────────────────────────────────────────────

class StockBalance(Base):
    """
    Current stock balance of each item at each node.
    Updated by every stock-in, stock-out, transfer and waste transaction.
    """
    __tablename__ = "inv_stock_balance"

    balance_id        = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    node_id           = Column(BigInteger, nullable=False)  # no FK — supports branch company IDs
    item_id           = Column(BigInteger, ForeignKey("inv_item.item_id", ondelete="CASCADE"), nullable=False)
    qty_on_hand       = Column(Numeric(14, 3), default=0, nullable=False)
    last_updated      = Column(DateTime, server_default=func.now(), onupdate=func.now())


# ─────────────────────────────────────────────
# 7. SUPPLIER MANAGEMENT
# ─────────────────────────────────────────────

class Supplier(Base):
    __tablename__ = "inv_supplier"

    supplier_id       = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    supplier_name     = Column(String(200), nullable=False)
    contact_person    = Column(String(200), nullable=True)
    phone             = Column(String(20), nullable=True)
    email             = Column(String(100), nullable=True)
    address           = Column(Text, nullable=True)
    gstin             = Column(String(15), nullable=True)
    payment_terms     = Column(String(100), nullable=True)   # e.g. "Net 30"
    rating            = Column(Numeric(3, 1), nullable=True) # 1.0 – 5.0
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    created_by        = Column(String(200), nullable=True)
    updated_at        = Column(DateTime, nullable=True)
    updated_by        = Column(String(200), nullable=True)


class SupplierRateCard(Base):
    """Price agreed with supplier for each item."""
    __tablename__ = "inv_supplier_rate_card"

    rate_card_id      = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    supplier_id       = Column(BigInteger, ForeignKey("inv_supplier.supplier_id", ondelete="CASCADE"), nullable=False)
    item_id           = Column(BigInteger, ForeignKey("inv_item.item_id", ondelete="CASCADE"), nullable=False)
    rate_per_uom      = Column(Numeric(12, 2), nullable=False)
    effective_from    = Column(Date, nullable=True)
    effective_to      = Column(Date, nullable=True)
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    created_by        = Column(String(200), nullable=True)


class SupplierPaymentLedger(Base):
    """Tracks payments made to / owed to suppliers."""
    __tablename__ = "inv_supplier_payment_ledger"

    ledger_id         = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    supplier_id       = Column(BigInteger, ForeignKey("inv_supplier.supplier_id", ondelete="CASCADE"), nullable=False)
    transaction_date  = Column(Date, nullable=False)
    amount            = Column(Numeric(14, 2), nullable=False)
    transaction_type  = Column(String(20), nullable=False)  # invoice | payment | debit_note
    reference_no      = Column(String(100), nullable=True)
    notes             = Column(Text, nullable=True)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    created_by        = Column(String(200), nullable=True)


# ─────────────────────────────────────────────
# 2. STOCK IN / PURCHASE MANAGEMENT
# ─────────────────────────────────────────────

class PurchaseOrder(Base):
    __tablename__ = "inv_purchase_order"

    po_id             = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    po_number         = Column(String(50), nullable=False)
    supplier_id       = Column(BigInteger, ForeignKey("inv_supplier.supplier_id", ondelete="SET NULL"), nullable=True)
    node_id           = Column(BigInteger, ForeignKey("inv_node.node_id", ondelete="SET NULL"), nullable=True)   # delivery to
    po_date           = Column(Date, nullable=False)
    expected_delivery = Column(Date, nullable=True)
    status            = Column(String(30), default="draft", nullable=False)  # draft|sent|partially_received|received|cancelled
    notes             = Column(Text, nullable=True)
    total_amount      = Column(Numeric(14, 2), default=0)
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    created_by        = Column(String(200), nullable=True)
    updated_at        = Column(DateTime, nullable=True)
    updated_by        = Column(String(200), nullable=True)


class PurchaseOrderItem(Base):
    __tablename__ = "inv_purchase_order_item"

    po_item_id        = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    po_id             = Column(BigInteger, ForeignKey("inv_purchase_order.po_id", ondelete="CASCADE"), nullable=False)
    item_id           = Column(BigInteger, ForeignKey("inv_item.item_id", ondelete="SET NULL"), nullable=True)
    ordered_qty       = Column(Numeric(12, 3), nullable=False)
    unit_price        = Column(Numeric(12, 2), nullable=False)
    received_qty      = Column(Numeric(12, 3), default=0)
    is_active         = Column(Boolean, default=True, nullable=False)


class GoodsReceiptNote(Base):
    """GRN — actual receipt against a PO."""
    __tablename__ = "inv_grn"

    grn_id            = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    grn_number        = Column(String(50), nullable=False)
    po_id             = Column(BigInteger, ForeignKey("inv_purchase_order.po_id", ondelete="SET NULL"), nullable=True)
    supplier_id       = Column(BigInteger, ForeignKey("inv_supplier.supplier_id", ondelete="SET NULL"), nullable=True)
    node_id           = Column(BigInteger, ForeignKey("inv_node.node_id", ondelete="SET NULL"), nullable=True)
    grn_date          = Column(Date, nullable=False)
    invoice_number    = Column(String(100), nullable=True)
    invoice_date      = Column(Date, nullable=True)
    status            = Column(String(30), default="draft", nullable=False)  # draft|posted
    notes             = Column(Text, nullable=True)
    total_amount      = Column(Numeric(14, 2), default=0)
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    created_by        = Column(String(200), nullable=True)
    updated_at        = Column(DateTime, nullable=True)
    updated_by        = Column(String(200), nullable=True)


class GoodsReceiptNoteItem(Base):
    __tablename__ = "inv_grn_item"

    grn_item_id       = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    grn_id            = Column(BigInteger, ForeignKey("inv_grn.grn_id", ondelete="CASCADE"), nullable=False)
    item_id           = Column(BigInteger, ForeignKey("inv_item.item_id", ondelete="SET NULL"), nullable=True)
    received_qty      = Column(Numeric(12, 3), nullable=False)
    unit_price        = Column(Numeric(12, 2), nullable=False)
    batch_number      = Column(String(100), nullable=True)
    expiry_date       = Column(Date, nullable=True)
    is_active         = Column(Boolean, default=True, nullable=False)


# ─────────────────────────────────────────────
# INTERNAL STOCK TRANSFER (between nodes)
# ─────────────────────────────────────────────

class StockTransfer(Base):
    """
    Transfer from WH → CK → Branch.
    Approval flow: receiver requests → sender approves → stock moves.
    """
    __tablename__ = "inv_stock_transfer"

    transfer_id       = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    transfer_number   = Column(String(50), nullable=False)
    from_node_id      = Column(BigInteger, nullable=True)   # no FK — supports branch company IDs
    to_node_id        = Column(BigInteger, nullable=True)   # no FK — supports branch company IDs
    transfer_date     = Column(Date, nullable=False)
    status            = Column(String(30), default="draft", nullable=False)
    # draft | pending_approval | approved | rejected | dispatched | received
    notes             = Column(Text, nullable=True)
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    created_by        = Column(String(200), nullable=True)
    approved_by       = Column(String(200), nullable=True)
    approved_at       = Column(DateTime, nullable=True)
    updated_at        = Column(DateTime, nullable=True)
    updated_by        = Column(String(200), nullable=True)


class StockTransferItem(Base):
    __tablename__ = "inv_stock_transfer_item"

    transfer_item_id  = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    transfer_id       = Column(BigInteger, ForeignKey("inv_stock_transfer.transfer_id", ondelete="CASCADE"), nullable=False)
    item_id           = Column(BigInteger, ForeignKey("inv_item.item_id", ondelete="SET NULL"), nullable=True)
    requested_qty     = Column(Numeric(12, 3), nullable=False)
    approved_qty      = Column(Numeric(12, 3), nullable=True)
    received_qty      = Column(Numeric(12, 3), nullable=True)
    is_active         = Column(Boolean, default=True, nullable=False)


# ─────────────────────────────────────────────
# 6. RECIPE MANAGEMENT
# ─────────────────────────────────────────────

class Recipe(Base):
    """Recipe for a menu item — links food menu → ingredients."""
    __tablename__ = "inv_recipe"

    recipe_id         = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    recipe_name       = Column(String(200), nullable=False)
    food_menu_id      = Column(BigInteger, nullable=True)    # FK to companyfoodmenu
    yield_qty         = Column(Numeric(10, 3), default=1)    # how many portions this recipe makes
    yield_uom_id      = Column(BigInteger, ForeignKey("inv_unit_of_measure.uom_id", ondelete="SET NULL"), nullable=True)
    preparation_time  = Column(Integer, nullable=True)       # minutes
    is_sub_recipe     = Column(Boolean, default=False)       # true = this recipe is an ingredient in another
    total_cost        = Column(Numeric(12, 2), default=0)    # auto-calculated
    notes             = Column(Text, nullable=True)
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    created_by        = Column(String(200), nullable=True)
    updated_at        = Column(DateTime, nullable=True)
    updated_by        = Column(String(200), nullable=True)


class RecipeIngredient(Base):
    """Each ingredient line in a recipe. Can be a raw item OR a sub-recipe."""
    __tablename__ = "inv_recipe_ingredient"

    ingredient_id     = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    recipe_id         = Column(BigInteger, ForeignKey("inv_recipe.recipe_id", ondelete="CASCADE"), nullable=False)
    item_id           = Column(BigInteger, ForeignKey("inv_item.item_id", ondelete="SET NULL"), nullable=True)
    sub_recipe_id     = Column(BigInteger, ForeignKey("inv_recipe.recipe_id", ondelete="SET NULL"), nullable=True)
    qty               = Column(Numeric(12, 3), nullable=False)
    uom_id            = Column(BigInteger, ForeignKey("inv_unit_of_measure.uom_id", ondelete="SET NULL"), nullable=True)
    unit_cost         = Column(Numeric(12, 2), default=0)
    is_active         = Column(Boolean, default=True, nullable=False)


# ─────────────────────────────────────────────
# 3. STOCK OUT / CONSUMPTION
# ─────────────────────────────────────────────

class StockConsumption(Base):
    """
    Recorded when food is produced (POS sale triggers this via recipe).
    Can also be manual consumption entry.
    """
    __tablename__ = "inv_stock_consumption"

    consumption_id    = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    node_id           = Column(BigInteger, ForeignKey("inv_node.node_id", ondelete="SET NULL"), nullable=True)
    consumption_date  = Column(Date, nullable=False)
    reference_type    = Column(String(30), nullable=True)    # pos_order | manual
    reference_id      = Column(BigInteger, nullable=True)    # pos order id if applicable
    recipe_id         = Column(BigInteger, ForeignKey("inv_recipe.recipe_id", ondelete="SET NULL"), nullable=True)
    notes             = Column(Text, nullable=True)
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    created_by        = Column(String(200), nullable=True)


class StockConsumptionItem(Base):
    __tablename__ = "inv_stock_consumption_item"

    consumption_item_id = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id   = Column(BigInteger, nullable=False)
    consumption_id      = Column(BigInteger, ForeignKey("inv_stock_consumption.consumption_id", ondelete="CASCADE"), nullable=False)
    item_id             = Column(BigInteger, ForeignKey("inv_item.item_id", ondelete="SET NULL"), nullable=True)
    qty_consumed        = Column(Numeric(12, 3), nullable=False)
    unit_cost           = Column(Numeric(12, 2), default=0)
    is_active           = Column(Boolean, default=True, nullable=False)


# ─────────────────────────────────────────────
# 4. WASTE MANAGEMENT
# ─────────────────────────────────────────────

class WasteEntry(Base):
    __tablename__ = "inv_waste"

    waste_id          = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    node_id           = Column(BigInteger, ForeignKey("inv_node.node_id", ondelete="SET NULL"), nullable=True)
    waste_date        = Column(Date, nullable=False)
    item_id           = Column(BigInteger, ForeignKey("inv_item.item_id", ondelete="SET NULL"), nullable=True)
    qty_wasted        = Column(Numeric(12, 3), nullable=False)
    uom_id            = Column(BigInteger, ForeignKey("inv_unit_of_measure.uom_id", ondelete="SET NULL"), nullable=True)
    waste_reason      = Column(String(100), nullable=True)  # spoilage | overcooked | expired | other
    unit_cost         = Column(Numeric(12, 2), default=0)
    total_cost        = Column(Numeric(14, 2), default=0)
    notes             = Column(Text, nullable=True)
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    created_by        = Column(String(200), nullable=True)
    updated_at        = Column(DateTime, nullable=True)
    updated_by        = Column(String(200), nullable=True)


# ─────────────────────────────────────────────
# 5. STOCK COUNT / PHYSICAL AUDIT
# ─────────────────────────────────────────────

class StockAudit(Base):
    __tablename__ = "inv_stock_audit"

    audit_id          = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    node_id           = Column(BigInteger, ForeignKey("inv_node.node_id", ondelete="SET NULL"), nullable=True)
    audit_date        = Column(Date, nullable=False)
    status            = Column(String(30), default="draft", nullable=False)  # draft | posted
    notes             = Column(Text, nullable=True)
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, server_default=func.now(), nullable=False)
    created_by        = Column(String(200), nullable=True)
    posted_at         = Column(DateTime, nullable=True)
    posted_by         = Column(String(200), nullable=True)


class StockAuditItem(Base):
    """Each counted item in an audit. System qty vs physical count."""
    __tablename__ = "inv_stock_audit_item"

    audit_item_id     = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    audit_id          = Column(BigInteger, ForeignKey("inv_stock_audit.audit_id", ondelete="CASCADE"), nullable=False)
    item_id           = Column(BigInteger, ForeignKey("inv_item.item_id", ondelete="SET NULL"), nullable=True)
    system_qty        = Column(Numeric(12, 3), nullable=False)   # balance as per software
    physical_qty      = Column(Numeric(12, 3), nullable=False)   # actual counted by staff
    variance_qty      = Column(Numeric(12, 3), nullable=False)   # physical - system
    unit_cost         = Column(Numeric(12, 2), default=0)
    variance_value    = Column(Numeric(14, 2), default=0)
    notes             = Column(Text, nullable=True)
    is_active         = Column(Boolean, default=True, nullable=False)


# ══════════════════════════════════════════════════════════════════════════════
# ADVANCED PO — Rule Engine Models (Phase 1.5)
# ══════════════════════════════════════════════════════════════════════════════

class AdvWeatherRule(Base):
    """Weather-based multiplier rules per item category."""
    __tablename__ = "adv_weather_rule"

    rule_id           = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    condition         = Column(String(20), nullable=False)   # hot|rain|cold
    temp_min          = Column(Numeric(5,1), nullable=True)  # null = no lower bound
    temp_max          = Column(Numeric(5,1), nullable=True)  # null = no upper bound
    rain_threshold    = Column(Numeric(5,2), nullable=True)  # rain probability 0-1
    item_category_id  = Column(BigInteger, ForeignKey("inv_item_category.item_category_id", ondelete="CASCADE"), nullable=False)
    multiplier        = Column(Numeric(5,3), nullable=False, default=1.0)
    description       = Column(String(200), nullable=True)
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, server_default=func.now())
    updated_at        = Column(DateTime, nullable=True)


class AdvOccasion(Base):
    """Global occasions (Eid, Durga Puja, Diwali, etc.)."""
    __tablename__ = "adv_occasion"

    occasion_id   = Column(BigInteger, Identity(), primary_key=True)
    name          = Column(String(100), nullable=False)
    month         = Column(Integer, nullable=True)         # 1-12, null = floating
    day           = Column(Integer, nullable=True)         # 1-31, null = floating
    days_before   = Column(Integer, default=3)             # effect starts N days before
    days_after    = Column(Integer, default=1)             # effect ends N days after
    description   = Column(String(300), nullable=True)
    is_active     = Column(Boolean, default=True, nullable=False)
    created_at    = Column(DateTime, server_default=func.now())


class AdvOccasionRule(Base):
    """Multiplier rules per category per occasion."""
    __tablename__ = "adv_occasion_rule"

    occ_rule_id       = Column(BigInteger, Identity(), primary_key=True)
    occasion_id       = Column(BigInteger, ForeignKey("adv_occasion.occasion_id", ondelete="CASCADE"), nullable=False)
    item_category_id  = Column(BigInteger, ForeignKey("inv_item_category.item_category_id", ondelete="CASCADE"), nullable=False)
    multiplier        = Column(Numeric(5,3), nullable=False, default=1.0)
    is_active         = Column(Boolean, default=True, nullable=False)


class AdvBranchOccasion(Base):
    """Which occasions each branch has opted into."""
    __tablename__ = "adv_branch_occasion"

    id                = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    occasion_id       = Column(BigInteger, ForeignKey("adv_occasion.occasion_id", ondelete="CASCADE"), nullable=False)
    is_active         = Column(Boolean, default=True, nullable=False)
    updated_at        = Column(DateTime, server_default=func.now())


class AdvPoSuggestion(Base):
    """AI-generated quantity suggestions per PO item."""
    __tablename__ = "adv_po_suggestion"

    suggestion_id     = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    po_id             = Column(BigInteger, ForeignKey("inv_purchase_order.po_id", ondelete="CASCADE"), nullable=True)
    node_id           = Column(BigInteger, nullable=True)
    item_id           = Column(BigInteger, ForeignKey("inv_item.item_id", ondelete="SET NULL"), nullable=True)
    po_date           = Column(Date, nullable=False)
    base_qty_30d      = Column(Numeric(12,3), nullable=False, default=0)  # 30-day avg
    weather_multiplier= Column(Numeric(5,3), nullable=False, default=1.0)
    occasion_multiplier=Column(Numeric(5,3), nullable=False, default=1.0)
    final_multiplier  = Column(Numeric(5,3), nullable=False, default=1.0)
    suggested_qty     = Column(Numeric(12,3), nullable=False, default=0)
    accepted_qty      = Column(Numeric(12,3), nullable=True)   # what manager finalised
    reason            = Column(String(500), nullable=True)      # "Hot 45°C +50% + Durga Puja +30%"
    weather_data      = Column(Text, nullable=True)             # JSON snapshot of weather
    created_at        = Column(DateTime, server_default=func.now())


class AdvAccuracyLog(Base):
    """Phase 1.5 — tracks suggestion vs actual to recommend rule corrections."""
    __tablename__ = "adv_accuracy_log"

    log_id            = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    suggestion_id     = Column(BigInteger, ForeignKey("adv_po_suggestion.suggestion_id", ondelete="SET NULL"), nullable=True)
    item_id           = Column(BigInteger, ForeignKey("inv_item.item_id", ondelete="SET NULL"), nullable=True)
    po_date           = Column(Date, nullable=False)
    suggested_qty     = Column(Numeric(12,3), nullable=False)
    actual_sold_qty   = Column(Numeric(12,3), nullable=True)    # from order_item after the fact
    variance_pct      = Column(Numeric(8,3), nullable=True)     # (actual-suggested)/suggested*100
    rule_correction   = Column(Numeric(5,3), nullable=True)     # recommended new multiplier
    is_applied        = Column(Boolean, default=False)          # admin clicked Apply
    created_at        = Column(DateTime, server_default=func.now())
