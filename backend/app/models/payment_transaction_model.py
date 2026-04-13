"""
app/models/payment_transaction_model.py
Stores every Razorpay payment attempt (success + failure) for full audit trail.
"""
from sqlalchemy import Column, BigInteger, String, Boolean, Numeric, Text, TIMESTAMP, ForeignKey, Identity
from sqlalchemy.sql import func
from app.database import Base


class PaymentTransaction(Base):
    __tablename__ = "payment_transaction"

    id                   = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id    = Column(BigInteger, nullable=False)
    order_id             = Column(BigInteger, nullable=True)
    order_number         = Column(String(30), nullable=True)
    bill_id              = Column(BigInteger, nullable=True)
    bill_number          = Column(String(30), nullable=True)

    # Razorpay fields
    razorpay_payment_id  = Column(String(100), nullable=True)   # pay_xxxxx
    razorpay_order_id    = Column(String(100), nullable=True)   # order_xxxxx
    razorpay_signature   = Column(Text, nullable=True)

    # Payment details
    amount               = Column(Numeric(10, 2), nullable=False)
    currency             = Column(String(10), default='INR')
    method               = Column(String(20), nullable=True)    # upi / card
    status               = Column(String(20), nullable=False)   # success / failed / pending

    # Error info (for failures)
    error_code           = Column(String(100), nullable=True)
    error_description    = Column(Text, nullable=True)

    created_at           = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
