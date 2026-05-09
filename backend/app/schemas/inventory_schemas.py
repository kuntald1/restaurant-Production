"""
Pydantic schemas for all inventory modules.
Follows existing pattern: Create / Update / Response per entity.
"""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal


# ─── Utility base ───────────────────────────────────────────────────

class OrmBase(BaseModel):
    class Config:
        from_attributes = True


# ─────────────────────────────────────────────
# UNIT OF MEASURE
# ─────────────────────────────────────────────

class UOMCreate(BaseModel):
    company_unique_id: int
    uom_name: str
    uom_symbol: Optional[str] = None
    is_active: bool = True
    created_by: Optional[str] = None


class UOMUpdate(BaseModel):
    uom_name: Optional[str] = None
    uom_symbol: Optional[str] = None
    is_active: Optional[bool] = None
    updated_by: Optional[str] = None


class UOMResponse(OrmBase):
    uom_id: int
    company_unique_id: int
    uom_name: str
    uom_symbol: Optional[str]
    is_active: bool
    created_at: datetime


# ─────────────────────────────────────────────
# ITEM CATEGORY
# ─────────────────────────────────────────────

class ItemCategoryCreate(BaseModel):
    company_unique_id: int
    category_name: str
    description: Optional[str] = None
    is_active: bool = True
    created_by: Optional[str] = None


class ItemCategoryUpdate(BaseModel):
    category_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    updated_by: Optional[str] = None


class ItemCategoryResponse(OrmBase):
    item_category_id: int
    company_unique_id: int
    category_name: str
    description: Optional[str]
    is_active: bool
    created_at: datetime


# ─────────────────────────────────────────────
# INVENTORY ITEM
# ─────────────────────────────────────────────

class InventoryItemCreate(BaseModel):
    company_unique_id: int
    item_category_id: Optional[int] = None
    item_code: Optional[str] = None
    item_name: str
    description: Optional[str] = None
    uom_id: Optional[int] = None
    reorder_level: Optional[Decimal] = Decimal("0")
    standard_cost: Optional[Decimal] = Decimal("0")
    is_active: bool = True
    created_by: Optional[str] = None


class InventoryItemUpdate(BaseModel):
    item_category_id: Optional[int] = None
    item_code: Optional[str] = None
    item_name: Optional[str] = None
    description: Optional[str] = None
    uom_id: Optional[int] = None
    reorder_level: Optional[Decimal] = None
    standard_cost: Optional[Decimal] = None
    is_active: Optional[bool] = None
    updated_by: Optional[str] = None


class InventoryItemResponse(OrmBase):
    item_id: int
    company_unique_id: int
    item_category_id: Optional[int]
    item_code: Optional[str]
    item_name: str
    description: Optional[str]
    uom_id: Optional[int]
    reorder_level: Optional[Decimal]
    standard_cost: Optional[Decimal]
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]


# ─────────────────────────────────────────────
# INVENTORY NODE
# ─────────────────────────────────────────────

class InventoryNodeCreate(BaseModel):
    company_unique_id: int
    node_name: str
    node_type: str           # warehouse | cloud_kitchen | branch
    parent_node_id: Optional[int] = None
    address: Optional[str] = None
    is_active: bool = True
    created_by: Optional[str] = None


class InventoryNodeUpdate(BaseModel):
    node_name: Optional[str] = None
    node_type: Optional[str] = None
    parent_node_id: Optional[int] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None
    updated_by: Optional[str] = None


class InventoryNodeResponse(OrmBase):
    node_id: int
    company_unique_id: int
    node_name: str
    node_type: str
    parent_node_id: Optional[int]
    address: Optional[str]
    is_active: bool
    created_at: datetime


# ─────────────────────────────────────────────
# STOCK BALANCE
# ─────────────────────────────────────────────

class StockBalanceResponse(OrmBase):
    balance_id: int
    company_unique_id: int
    node_id: int
    item_id: int
    qty_on_hand: Decimal
    last_updated: Optional[datetime]


# ─────────────────────────────────────────────
# SUPPLIER
# ─────────────────────────────────────────────

class SupplierCreate(BaseModel):
    company_unique_id: int
    supplier_name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    payment_terms: Optional[str] = None
    rating: Optional[Decimal] = None
    is_active: bool = True
    created_by: Optional[str] = None


class SupplierUpdate(BaseModel):
    supplier_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    payment_terms: Optional[str] = None
    rating: Optional[Decimal] = None
    is_active: Optional[bool] = None
    updated_by: Optional[str] = None


class SupplierResponse(OrmBase):
    supplier_id: int
    company_unique_id: int
    supplier_name: str
    contact_person: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    gstin: Optional[str]
    payment_terms: Optional[str]
    rating: Optional[Decimal]
    is_active: bool
    created_at: datetime


class SupplierRateCardCreate(BaseModel):
    company_unique_id: int
    supplier_id: int
    item_id: int
    rate_per_uom: Decimal
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_active: bool = True
    created_by: Optional[str] = None


class SupplierRateCardResponse(OrmBase):
    rate_card_id: int
    company_unique_id: int
    supplier_id: int
    item_id: int
    rate_per_uom: Decimal
    effective_from: Optional[date]
    effective_to: Optional[date]
    is_active: bool
    created_at: datetime


class SupplierPaymentLedgerCreate(BaseModel):
    company_unique_id: int
    supplier_id: int
    transaction_date: date
    amount: Decimal
    transaction_type: str      # invoice | payment | debit_note
    reference_no: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None


class SupplierPaymentLedgerResponse(OrmBase):
    ledger_id: int
    company_unique_id: int
    supplier_id: int
    transaction_date: date
    amount: Decimal
    transaction_type: str
    reference_no: Optional[str]
    notes: Optional[str]
    created_at: datetime


# ─────────────────────────────────────────────
# PURCHASE ORDER
# ─────────────────────────────────────────────

class POItemCreate(BaseModel):
    item_id: Optional[int] = None
    ordered_qty: Decimal
    unit_price: Decimal


class POItemResponse(OrmBase):
    po_item_id: int
    po_id: int
    item_id: Optional[int]
    ordered_qty: Decimal
    unit_price: Decimal
    received_qty: Decimal
    is_active: bool


class PurchaseOrderCreate(BaseModel):
    company_unique_id: int
    po_number: str
    supplier_id: Optional[int] = None
    node_id: Optional[int] = None
    po_date: date
    expected_delivery: Optional[date] = None
    status: str = "draft"
    notes: Optional[str] = None
    total_amount: Optional[Decimal] = Decimal("0")
    is_active: bool = True
    created_by: Optional[str] = None
    items: List[POItemCreate] = []


class PurchaseOrderUpdate(BaseModel):
    supplier_id: Optional[int] = None
    node_id: Optional[int] = None
    expected_delivery: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    total_amount: Optional[Decimal] = None
    is_active: Optional[bool] = None
    updated_by: Optional[str] = None


class PurchaseOrderResponse(OrmBase):
    po_id: int
    company_unique_id: int
    po_number: str
    supplier_id: Optional[int]
    node_id: Optional[int]
    po_date: date
    expected_delivery: Optional[date]
    status: str
    notes: Optional[str]
    total_amount: Optional[Decimal]
    is_active: bool
    created_at: datetime
    items: List[POItemResponse] = []


# ─────────────────────────────────────────────
# GRN
# ─────────────────────────────────────────────

class GRNItemCreate(BaseModel):
    item_id: Optional[int] = None
    received_qty: Decimal
    unit_price: Decimal
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None


class GRNItemResponse(OrmBase):
    grn_item_id: int
    grn_id: int
    item_id: Optional[int]
    received_qty: Decimal
    unit_price: Decimal
    batch_number: Optional[str]
    expiry_date: Optional[date]
    is_active: bool


class GRNCreate(BaseModel):
    company_unique_id: int
    grn_number: str
    po_id: Optional[int] = None
    supplier_id: Optional[int] = None
    node_id: Optional[int] = None
    grn_date: date
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    status: str = "draft"
    notes: Optional[str] = None
    total_amount: Optional[Decimal] = Decimal("0")
    is_active: bool = True
    created_by: Optional[str] = None
    items: List[GRNItemCreate] = []


class GRNUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    total_amount: Optional[Decimal] = None
    is_active: Optional[bool] = None
    updated_by: Optional[str] = None


class GRNResponse(OrmBase):
    grn_id: int
    company_unique_id: int
    grn_number: str
    po_id: Optional[int]
    supplier_id: Optional[int]
    node_id: Optional[int]
    grn_date: date
    invoice_number: Optional[str]
    invoice_date: Optional[date]
    status: str
    notes: Optional[str]
    total_amount: Optional[Decimal]
    is_active: bool
    created_at: datetime
    items: List[GRNItemResponse] = []


# ─────────────────────────────────────────────
# STOCK TRANSFER
# ─────────────────────────────────────────────

class TransferItemCreate(BaseModel):
    item_id: Optional[int] = None
    requested_qty: Decimal


class TransferItemResponse(OrmBase):
    transfer_item_id: int
    transfer_id: int
    item_id: Optional[int]
    requested_qty: Decimal
    approved_qty: Optional[Decimal]
    received_qty: Optional[Decimal]
    is_active: bool


class StockTransferCreate(BaseModel):
    company_unique_id: int
    transfer_number: str
    from_node_id: Optional[int] = None
    to_node_id: Optional[int] = None
    transfer_date: date
    status: str = "draft"
    notes: Optional[str] = None
    is_active: bool = True
    created_by: Optional[str] = None
    items: List[TransferItemCreate] = []


class StockTransferUpdate(BaseModel):
    transfer_number: Optional[str] = None
    from_node_id:    Optional[int] = None
    to_node_id:      Optional[int] = None
    transfer_date:   Optional[date] = None
    status:          Optional[str] = None
    notes:           Optional[str] = None
    approved_by:     Optional[str] = None
    is_active:       Optional[bool] = None
    updated_by:      Optional[str] = None
    items:           Optional[List[TransferItemCreate]] = None


class StockTransferResponse(OrmBase):
    transfer_id: int
    company_unique_id: int
    transfer_number: str
    from_node_id: Optional[int]
    to_node_id: Optional[int]
    transfer_date: date
    status: str
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    approved_by: Optional[str]
    approved_at: Optional[datetime]
    items: List[TransferItemResponse] = []


# ─────────────────────────────────────────────
# RECIPE
# ─────────────────────────────────────────────

class RecipeIngredientCreate(BaseModel):
    item_id: Optional[int] = None
    sub_recipe_id: Optional[int] = None
    qty: Decimal
    uom_id: Optional[int] = None
    unit_cost: Optional[Decimal] = Decimal("0")


class RecipeIngredientResponse(OrmBase):
    ingredient_id: int
    recipe_id: int
    item_id: Optional[int]
    sub_recipe_id: Optional[int]
    qty: Decimal
    uom_id: Optional[int]
    unit_cost: Decimal
    is_active: bool


class RecipeCreate(BaseModel):
    company_unique_id: int
    recipe_name: str
    food_menu_id: Optional[int] = None
    yield_qty: Optional[Decimal] = Decimal("1")
    yield_uom_id: Optional[int] = None
    preparation_time: Optional[int] = None
    is_sub_recipe: bool = False
    notes: Optional[str] = None
    is_active: bool = True
    created_by: Optional[str] = None
    ingredients: List[RecipeIngredientCreate] = []


class RecipeUpdate(BaseModel):
    recipe_name: Optional[str] = None
    food_menu_id: Optional[int] = None
    yield_qty: Optional[Decimal] = None
    yield_uom_id: Optional[int] = None
    preparation_time: Optional[int] = None
    is_sub_recipe: Optional[bool] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    updated_by: Optional[str] = None


class RecipeResponse(OrmBase):
    recipe_id: int
    company_unique_id: int
    recipe_name: str
    food_menu_id: Optional[int]
    yield_qty: Optional[Decimal]
    yield_uom_id: Optional[int]
    preparation_time: Optional[int]
    is_sub_recipe: bool
    total_cost: Optional[Decimal]
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    ingredients: List[RecipeIngredientResponse] = []


# ─────────────────────────────────────────────
# CONSUMPTION
# ─────────────────────────────────────────────

class ConsumptionItemCreate(BaseModel):
    item_id: Optional[int] = None
    qty_consumed: Decimal
    unit_cost: Optional[Decimal] = Decimal("0")


class ConsumptionItemResponse(OrmBase):
    consumption_item_id: int
    consumption_id: int
    item_id: Optional[int]
    qty_consumed: Decimal
    unit_cost: Decimal
    is_active: bool


class StockConsumptionCreate(BaseModel):
    company_unique_id: int
    node_id: Optional[int] = None
    consumption_date: date
    reference_type: Optional[str] = "manual"
    reference_id: Optional[int] = None
    recipe_id: Optional[int] = None
    notes: Optional[str] = None
    is_active: bool = True
    created_by: Optional[str] = None
    items: List[ConsumptionItemCreate] = []


class StockConsumptionResponse(OrmBase):
    consumption_id: int
    company_unique_id: int
    node_id: Optional[int]
    consumption_date: date
    reference_type: Optional[str]
    reference_id: Optional[int]
    recipe_id: Optional[int]
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    items: List[ConsumptionItemResponse] = []


# ─────────────────────────────────────────────
# WASTE
# ─────────────────────────────────────────────

class WasteEntryCreate(BaseModel):
    company_unique_id: int
    node_id: Optional[int] = None
    waste_date: date
    item_id: Optional[int] = None
    qty_wasted: Decimal
    uom_id: Optional[int] = None
    waste_reason: Optional[str] = None
    unit_cost: Optional[Decimal] = Decimal("0")
    total_cost: Optional[Decimal] = Decimal("0")
    notes: Optional[str] = None
    is_active: bool = True
    created_by: Optional[str] = None


class WasteEntryUpdate(BaseModel):
    waste_date: Optional[date] = None
    qty_wasted: Optional[Decimal] = None
    waste_reason: Optional[str] = None
    unit_cost: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    updated_by: Optional[str] = None


class WasteEntryResponse(OrmBase):
    waste_id: int
    company_unique_id: int
    node_id: Optional[int]
    waste_date: date
    item_id: Optional[int]
    qty_wasted: Decimal
    uom_id: Optional[int]
    waste_reason: Optional[str]
    unit_cost: Decimal
    total_cost: Decimal
    notes: Optional[str]
    is_active: bool
    created_at: datetime


# ─────────────────────────────────────────────
# STOCK AUDIT
# ─────────────────────────────────────────────

class AuditItemCreate(BaseModel):
    item_id: Optional[int] = None
    system_qty: Decimal
    physical_qty: Decimal
    unit_cost: Optional[Decimal] = Decimal("0")
    notes: Optional[str] = None


class AuditItemResponse(OrmBase):
    audit_item_id: int
    audit_id: int
    item_id: Optional[int]
    system_qty: Decimal
    physical_qty: Decimal
    variance_qty: Decimal
    unit_cost: Decimal
    variance_value: Decimal
    notes: Optional[str]
    is_active: bool


class StockAuditCreate(BaseModel):
    company_unique_id: int
    node_id: Optional[int] = None
    audit_date: date
    status: str = "draft"
    notes: Optional[str] = None
    is_active: bool = True
    created_by: Optional[str] = None
    items: List[AuditItemCreate] = []


class StockAuditUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    posted_by: Optional[str] = None


class StockAuditResponse(OrmBase):
    audit_id: int
    company_unique_id: int
    node_id: Optional[int]
    audit_date: date
    status: str
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    posted_at: Optional[datetime]
    posted_by: Optional[str]
    items: List[AuditItemResponse] = []
