"""
app/models/pos_models.py  — COMPLETE FINAL VERSION
"""
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Numeric, Integer, Text, JSON, Enum as SAEnum, ForeignKey, Computed
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base
import enum


# ── Enums ─────────────────────────────────────────────────────

class OrderTypeEnum(str, enum.Enum):
    dine_in   = "dine_in"
    take_away = "take_away"
    delivery  = "delivery"

class OrderStatusEnum(str, enum.Enum):
    draft                       = "draft"
    kot_open                    = "kot_open"
    kot_inprocess               = "kot_inprocess"
    ready                       = "ready"
    billed                      = "billed"
    picked_up                   = "picked_up"
    picked_up_by_delivery_agent = "picked_up_by_delivery_agent"
    cancelled                   = "cancelled"

class TableStatusEnum(str, enum.Enum):
    free     = "free"
    occupied = "occupied"
    reserved = "reserved"

class KOTItemStatusEnum(str, enum.Enum):
    kot_open      = "kot_open"
    kot_inprocess = "kot_inprocess"
    ready         = "ready"

class KOTStatusEnum(str, enum.Enum):
    kot_open      = "kot_open"
    kot_inprocess = "kot_inprocess"
    ready         = "ready"
    cancelled     = "cancelled"

class BillPaymentMethodEnum(str, enum.Enum):
    cash          = "cash"
    upi           = "upi"
    card          = "card"
    split         = "split"
    complimentary = "complimentary"
    credit        = "credit"


# ── RestaurantTable ───────────────────────────────────────────

class RestaurantTable(Base):
    __tablename__ = "restaurant_table"

    table_id            = Column(BigInteger, primary_key=True, autoincrement=True)
    company_unique_id   = Column(BigInteger, nullable=False)
    table_name          = Column(String(50), nullable=False)
    seats               = Column(Integer, default=2)
    table_status        = Column(SAEnum(TableStatusEnum, name="table_status_enum", create_type=False), default=TableStatusEnum.free)
    floor               = Column(String(50))
    section             = Column(String(50))
    is_active           = Column(Boolean, default=True)

    # ── Multi-order support (added via migration) ──────────────
    active_order_count  = Column(Integer, default=0, nullable=False)
    occupied_seats      = Column(Integer, default=0, nullable=False)

    # ── Surcharge config (added via migration) ─────────────────
    section_type        = Column(String(50), default='non_ac')   # ac / non_ac / garden
    surcharge_type      = Column(String(20), default='flat')     # flat / per_cover
    surcharge_amount    = Column(Numeric(10, 2), default=0.00)
    surcharge_label     = Column(String(100), nullable=True)

    created_at          = Column(DateTime, default=datetime.utcnow)
    updated_at          = Column(DateTime, nullable=True)

    orders = relationship("Order", back_populates="table")


# ── Order ─────────────────────────────────────────────────────

class Order(Base):
    __tablename__ = "order"

    order_id          = Column(BigInteger, primary_key=True, autoincrement=True)
    order_number      = Column(String(20), unique=True)
    company_unique_id = Column(BigInteger, nullable=False)
    order_type        = Column(SAEnum(OrderTypeEnum, name="order_type_enum", create_type=False), default=OrderTypeEnum.dine_in)
    order_status      = Column(SAEnum(OrderStatusEnum, name="order_status_enum", create_type=False), default=OrderStatusEnum.draft)

    table_id          = Column(BigInteger, ForeignKey("restaurant_table.table_id"), nullable=True)
    customer_id       = Column(BigInteger, ForeignKey("crm_customer.customer_id", ondelete="SET NULL"), nullable=True)
    covers            = Column(Integer, default=1)

    customer_name         = Column(String(200))
    customer_phone        = Column(String(15))
    delivery_address      = Column(Text)
    delivery_agent_name   = Column(String(200))
    delivery_agent_phone  = Column(String(15))

    subtotal          = Column(Numeric(10, 2), default=0)
    discount_amount   = Column(Numeric(10, 2), default=0)
    discount_percent  = Column(Numeric(5, 2), default=0)
    service_charge    = Column(Numeric(10, 2), default=0)
    tax_amount        = Column(Numeric(10, 2), default=0)
    sgst_amount       = Column(Numeric(10, 2), default=0)
    cgst_amount       = Column(Numeric(10, 2), default=0)
    total_payable     = Column(Numeric(10, 2), default=0)

    # ── Surcharge snapshot (added via migration) ───────────────
    table_surcharge_amount = Column(Numeric(10, 2), default=0.00, nullable=False)
    table_surcharge_label  = Column(String(100), nullable=True)

    notes             = Column(Text)
    is_hold           = Column(Boolean, default=False)

    order_placed_at   = Column(DateTime, default=datetime.utcnow)
    billed_at         = Column(DateTime, nullable=True)
    completed_at      = Column(DateTime, nullable=True)
    cancelled_at      = Column(DateTime, nullable=True)

    created_by        = Column(BigInteger, nullable=True)
    updated_by        = Column(BigInteger, nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow)
    updated_at        = Column(DateTime, nullable=True)

    table  = relationship("RestaurantTable", back_populates="orders")
    items  = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    kots   = relationship("KOT", back_populates="order", cascade="all, delete-orphan")
    bill   = relationship("Bill", back_populates="order", uselist=False)


# ── OrderItem ─────────────────────────────────────────────────

class OrderItem(Base):
    __tablename__ = "order_item"

    order_item_id     = Column(BigInteger, primary_key=True, autoincrement=True)
    order_id          = Column(BigInteger, ForeignKey("order.order_id", ondelete="CASCADE"), nullable=False)
    company_unique_id = Column(BigInteger, nullable=False)

    food_menu_id      = Column(BigInteger, nullable=True)
    item_name         = Column(String(200), nullable=False)
    item_code         = Column(String(50))
    category_id       = Column(BigInteger)
    category_name     = Column(String(200))

    unit_price        = Column(Numeric(10, 2), nullable=False)
    quantity          = Column(Integer, default=1, nullable=False)
    # PostgreSQL GENERATED ALWAYS AS (unit_price * quantity) STORED
    # Computed() tells SQLAlchemy this is read-only — never INSERT/UPDATE
    total_price       = Column(Numeric(10, 2), Computed("unit_price * quantity", persisted=True))

    kot_item_status   = Column(SAEnum(KOTItemStatusEnum, name="kot_item_status_enum", create_type=False), default=KOTItemStatusEnum.kot_open)
    kot_id            = Column(BigInteger, nullable=True)

    modifiers         = Column(JSON, default=list)
    is_veg            = Column(Boolean, default=True)
    notes             = Column(Text)
    is_cancelled      = Column(Boolean, default=False)
    cancelled_reason  = Column(Text)

    created_at        = Column(DateTime, default=datetime.utcnow)
    updated_at        = Column(DateTime, nullable=True)

    order    = relationship("Order", back_populates="items")
    kot_item = relationship("KOTItem", back_populates="order_item", uselist=False)




# ── KOT ──────────────────────────────────────────────────────

class KOT(Base):
    __tablename__ = "kot"

    kot_id            = Column(BigInteger, primary_key=True, autoincrement=True)
    kot_number        = Column(String(30), unique=True)
    order_id          = Column(BigInteger, ForeignKey("order.order_id", ondelete="CASCADE"), nullable=False)
    company_unique_id = Column(BigInteger, nullable=False)

    kot_status        = Column(SAEnum(KOTStatusEnum, name="kot_status_enum", create_type=False), default=KOTStatusEnum.kot_open)
    table_id          = Column(BigInteger, nullable=True)
    table_name        = Column(String(50))

    sent_to_kitchen_at  = Column(DateTime, default=datetime.utcnow)
    kitchen_started_at  = Column(DateTime, nullable=True)
    ready_at            = Column(DateTime, nullable=True)

    print_count         = Column(Integer, default=0)
    last_printed_at     = Column(DateTime, nullable=True)

    notes               = Column(Text)
    created_by          = Column(BigInteger, nullable=True)
    created_at          = Column(DateTime, default=datetime.utcnow)
    updated_at          = Column(DateTime, nullable=True)

    order     = relationship("Order", back_populates="kots")
    kot_items = relationship("KOTItem", back_populates="kot", cascade="all, delete-orphan")


# ── KOTItem ───────────────────────────────────────────────────

class KOTItem(Base):
    __tablename__ = "kot_item"

    kot_item_id       = Column(BigInteger, primary_key=True, autoincrement=True)
    kot_id            = Column(BigInteger, ForeignKey("kot.kot_id", ondelete="CASCADE"), nullable=False)
    order_item_id     = Column(BigInteger, ForeignKey("order_item.order_item_id", ondelete="CASCADE"), nullable=False)
    order_id          = Column(BigInteger, nullable=False)
    company_unique_id = Column(BigInteger, nullable=False)

    item_name         = Column(String(200), nullable=False)
    quantity          = Column(Integer, nullable=False)
    notes             = Column(Text)
    is_veg            = Column(Boolean, default=True)

    kot_item_status   = Column(SAEnum(KOTItemStatusEnum, name="kot_item_status_enum", create_type=False), default=KOTItemStatusEnum.kot_open)
    started_at        = Column(DateTime, nullable=True)
    ready_at          = Column(DateTime, nullable=True)

    created_at        = Column(DateTime, default=datetime.utcnow)
    updated_at        = Column(DateTime, nullable=True)

    kot        = relationship("KOT", back_populates="kot_items")
    order_item = relationship("OrderItem", back_populates="kot_item")


# ── Bill ─────────────────────────────────────────────────────

class Bill(Base):
    __tablename__ = "bill"

    bill_id           = Column(BigInteger, primary_key=True, autoincrement=True)
    bill_number       = Column(String(30), unique=True)
    order_id          = Column(BigInteger, ForeignKey("order.order_id"), unique=True, nullable=False)
    customer_id       = Column(BigInteger, ForeignKey("crm_customer.customer_id", ondelete="SET NULL"), nullable=True)
    company_unique_id = Column(BigInteger, nullable=False)

    subtotal          = Column(Numeric(10, 2), nullable=False)
    discount_amount   = Column(Numeric(10, 2), default=0)
    discount_percent  = Column(Numeric(5, 2), default=0)
    service_charge    = Column(Numeric(10, 2), default=0)
    tax_amount        = Column(Numeric(10, 2), default=0)
    sgst_amount       = Column(Numeric(10, 2), default=0)
    cgst_amount       = Column(Numeric(10, 2), default=0)
    total_payable     = Column(Numeric(10, 2), nullable=False)
    amount_paid       = Column(Numeric(10, 2), default=0)

    # ── Surcharge snapshot (added via migration) ───────────────
    table_surcharge_amount = Column(Numeric(10, 2), default=0.00, nullable=False)
    table_surcharge_label  = Column(String(100), nullable=True)

    payment_method    = Column(SAEnum(BillPaymentMethodEnum, name="bill_payment_method_enum", create_type=False), default=BillPaymentMethodEnum.cash)
    payment_reference = Column(String(100))
    is_paid           = Column(Boolean, default=False)
    paid_at           = Column(DateTime, nullable=True)

    order_type        = Column(SAEnum(OrderTypeEnum, name="order_type_enum", create_type=False), nullable=False)
    table_name        = Column(String(50))
    customer_name     = Column(String(200))
    customer_phone    = Column(String(15))
    item_count        = Column(Integer, default=0)

    gstin             = Column(String(20))
    fssai             = Column(String(20))
    hsn               = Column(String(20))

    print_count       = Column(Integer, default=0)
    last_printed_at   = Column(DateTime, nullable=True)

    created_by        = Column(BigInteger, nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow)
    updated_at        = Column(DateTime, nullable=True)
    payment_reference = Column(String(100))
    promo_code        = Column(String(50), nullable=True)
    promo_amount      = Column(Numeric(10, 2), default=0)
    is_paid           = Column(Boolean, default=False)

    order = relationship("Order", back_populates="bill")
