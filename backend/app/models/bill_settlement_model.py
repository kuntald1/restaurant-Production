"""
app/models/bill_settlement_model.py
Audit log of items added / removed while settling an already-billed order.
"""
from sqlalchemy import Column, BigInteger, String, Integer, Numeric, Text, TIMESTAMP, Identity
from sqlalchemy.sql import func
from app.database import Base


class BillSettlementLog(Base):
    __tablename__ = "bill_settlement_log"

    log_id            = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    bill_id           = Column(BigInteger, nullable=True)
    bill_number       = Column(String(30), nullable=True)
    order_id          = Column(BigInteger, nullable=True)
    order_number      = Column(String(20), nullable=True)
    order_item_id     = Column(BigInteger, nullable=True)
    food_menu_id      = Column(BigInteger, nullable=True)
    item_name         = Column(String(200), nullable=False)
    quantity          = Column(Integer, default=1, nullable=False)
    unit_price        = Column(Numeric(10, 2), default=0, nullable=False)
    line_amount       = Column(Numeric(12, 2), default=0, nullable=False)
    action            = Column(String(10), nullable=False)   # 'added' | 'removed'
    reason            = Column(Text, nullable=True)
    customer_id       = Column(BigInteger, nullable=True)
    amount_delta      = Column(Numeric(12, 2), default=0)
    settled_by        = Column(BigInteger, nullable=True)
    settled_at        = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
