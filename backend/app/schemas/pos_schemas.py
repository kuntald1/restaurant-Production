"""
app/schemas/pos_schemas.py
Pydantic schemas for POS request/response validation
"""
from pydantic import BaseModel,Field, model_validator
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from app.models.pos_models import (
    OrderTypeEnum, OrderStatusEnum, TableStatusEnum,
    KOTItemStatusEnum, KOTStatusEnum, BillPaymentMethodEnum
)


# ── Restaurant Table ──────────────────────────────────────────

class TableCreate(BaseModel):
    company_unique_id: int
    table_name: str
    seats: int = 2
    floor: Optional[str] = None
    section: Optional[str] = None
    section_type: str = "non_ac"
    surcharge_type: str = "flat"
    surcharge_amount: Decimal = Decimal("0.00")
    surcharge_label: Optional[str] = None

class TableUpdate(BaseModel):
    table_name: Optional[str] = Field(None, max_length=50)
    seats: Optional[int] = Field(None, gt=0)
    table_status: Optional[TableStatusEnum] = None
    floor: Optional[str] = Field(None, max_length=50)
    section: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None
    section_type: Optional[str] = Field(None, max_length=50)        # ← must exist
    surcharge_type: Optional[str] = Field(None, max_length=20)      # ← must exist
    surcharge_amount: Optional[Decimal] = Field(None, ge=0)         # ← must exist
    surcharge_label: Optional[str] = Field(None, max_length=100)    # ← must exist

    @model_validator(mode="after")
    def check_at_least_one_field(self):
        if not any(v is not None for v in self.model_dump().values()):
            raise ValueError("At least one field must be provided for update")
        return self

class TableResponse(BaseModel):
    table_id: int
    company_unique_id: int
    table_name: str
    seats: int
    table_status: TableStatusEnum
    floor: Optional[str] = None
    section: Optional[str] = None
    is_active: bool
    active_order_count: int
    occupied_seats: int
    section_type: str
    surcharge_type: str
    surcharge_amount: Decimal
    surcharge_label: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Order Item ────────────────────────────────────────────────

class OrderItemCreate(BaseModel):
    food_menu_id: Optional[int] = None
    item_name: str
    item_code: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    unit_price: Decimal
    quantity: int = 1
    modifiers: Optional[List[dict]] = []
    is_veg: bool = True
    notes: Optional[str] = None

class OrderItemUpdate(BaseModel):
    quantity: Optional[int] = None
    notes: Optional[str] = None

class OrderItemResponse(BaseModel):
    order_item_id: int
    order_id: int
    food_menu_id: Optional[int] = None
    item_name: str
    item_code: Optional[str] = None
    category_name: Optional[str] = None
    unit_price: Decimal
    quantity: int
    total_price: Optional[float] = None   # GENERATED column — may be None on first flush
    kot_item_status: KOTItemStatusEnum
    kot_id: Optional[int] = None
    is_veg: bool
    notes: Optional[str] = None
    is_cancelled: bool

    @property
    def total_price_safe(self) -> float:
        """Fallback if DB generated column not yet populated."""
        if self.total_price is not None:
            return float(self.total_price)
        return float(self.unit_price) * self.quantity

    class Config: from_attributes = True


# ── Order ─────────────────────────────────────────────────────

class OrderCreate(BaseModel):
    company_unique_id: int
    order_type: OrderTypeEnum = OrderTypeEnum.dine_in
    table_id: Optional[int] = None
    covers: Optional[int] = 1
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[int] = None
    items: Optional[List[OrderItemCreate]] = []

class OrderUpdate(BaseModel):
    notes: Optional[str] = None
    discount_amount: Optional[Decimal] = None
    discount_percent: Optional[Decimal] = None
    service_charge: Optional[Decimal] = None
    is_hold: Optional[bool] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_agent_name: Optional[str] = None
    delivery_agent_phone: Optional[str] = None
    updated_by: Optional[int] = None

class OrderResponse(BaseModel):
    order_id: int
    order_number: str
    company_unique_id: int
    order_type: OrderTypeEnum
    order_status: OrderStatusEnum
    table_id: Optional[int] = None
    table_name: Optional[str] = None
    covers: Optional[int] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    subtotal: Decimal
    discount_amount: Decimal
    service_charge: Decimal
    tax_amount: Decimal
    total_payable: Decimal
    promo_code: Optional[str] = None
    promo_amount: Optional[Decimal] = Decimal("0")
    customer_id: Optional[int] = None
    is_hold: bool
    notes: Optional[str] = None
    order_placed_at: datetime
    billed_at: Optional[datetime] = None
    items: List[OrderItemResponse] = []
    class Config: from_attributes = True


# ── KOT ──────────────────────────────────────────────────────

class KOTCreate(BaseModel):
    order_id: int
    company_unique_id: int
    item_ids: List[int]           # order_item_ids to include in this KOT
    notes: Optional[str] = None
    created_by: Optional[int] = None

class KOTItemResponse(BaseModel):
    kot_item_id: int
    kot_id: int
    order_item_id: int
    item_name: str
    quantity: int
    is_veg: bool
    notes: Optional[str] = None
    kot_item_status: KOTItemStatusEnum
    started_at: Optional[datetime] = None
    ready_at: Optional[datetime] = None
    class Config: from_attributes = True

class KOTResponse(BaseModel):
    kot_id: int
    kot_number: str
    order_id: int
    company_unique_id: int
    kot_status: KOTStatusEnum
    table_name: Optional[str] = None
    sent_to_kitchen_at: Optional[datetime] = None
    kitchen_started_at: Optional[datetime] = None
    ready_at: Optional[datetime] = None
    print_count: int
    last_printed_at: Optional[datetime] = None
    notes: Optional[str] = None
    kot_items: List[KOTItemResponse] = []
    class Config: from_attributes = True

class KOTStatusUpdate(BaseModel):
    """Update overall KOT status"""
    kot_status: KOTStatusEnum
    updated_by: Optional[int] = None

class KOTItemStatusUpdate(BaseModel):
    """Update individual item status on KOT"""
    kot_item_status: KOTItemStatusEnum
    updated_by: Optional[int] = None


# ── Bill ─────────────────────────────────────────────────────

class BillCreate(BaseModel):
    order_id: int
    company_unique_id: int
    payment_method: BillPaymentMethodEnum = BillPaymentMethodEnum.cash
    payment_reference: Optional[str] = None
    amount_paid: Decimal = Decimal("0")
    discount_amount: Optional[Decimal] = None
    discount_percent: Optional[Decimal] = None
    service_charge: Optional[Decimal] = None
    promo_code: Optional[str] = None
    promo_amount: Optional[Decimal] = Decimal("0")
    sgst_amount: Optional[Decimal] = Decimal("0")
    cgst_amount: Optional[Decimal] = Decimal("0")
    customer_id: Optional[int] = None
    created_by: Optional[int] = None

class BillResponse(BaseModel):
    bill_id: int
    bill_number: str
    order_id: int
    company_unique_id: int
    subtotal: Decimal
    discount_amount: Decimal
    service_charge: Decimal
    tax_amount: Decimal
    sgst_amount: Optional[Decimal] = Decimal("0")
    cgst_amount: Optional[Decimal] = Decimal("0")
    total_payable: Decimal
    amount_paid: Decimal
    payment_method: BillPaymentMethodEnum
    payment_reference: Optional[str] = None
    promo_code: Optional[str] = None
    promo_amount: Optional[Decimal] = Decimal("0")
    customer_id: Optional[int] = None
    is_paid: bool
    paid_at: Optional[datetime] = None
    order_type: OrderTypeEnum
    table_name: Optional[str] = None
    customer_name: Optional[str] = None
    item_count: int
    print_count: int
    created_at: datetime
    class Config: from_attributes = True

class OrderStatusUpdateRequest(BaseModel):
    """For picked_up / delivery transitions after billing"""
    order_status: OrderStatusEnum
    delivery_agent_name: Optional[str] = None
    delivery_agent_phone: Optional[str] = None
    updated_by: Optional[int] = None
