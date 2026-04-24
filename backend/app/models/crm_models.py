"""
app/models/crm_models.py
"""
from sqlalchemy import Column, BigInteger, String, Boolean, Numeric, Integer, Text, Date, Time, TIMESTAMP, ForeignKey, Identity, CheckConstraint
from sqlalchemy.sql import func
from app.database import Base


class SmsSettings(Base):
    __tablename__ = "sms_settings"
    id                = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, ForeignKey("company.company_unique_id", ondelete="CASCADE"), nullable=False, unique=True)
    provider          = Column(String(50), default='twilio')
    account_sid       = Column(String(200))
    auth_token        = Column(Text)
    from_number       = Column(String(50))
    whatsapp_enabled  = Column(Boolean, default=False)
    sms_enabled       = Column(Boolean, default=False)
    template_bill     = Column(Text, default='Dear {name}, your bill at {restaurant} is ₹{amount}. Bill No: {bill_no}. Thank you!')
    template_promo    = Column(Text, default='Hi {name}! Promo code: {code} for {discount}% off. Valid till {expiry}.')
    template_birthday = Column(Text, default='Happy Birthday {name}! 🎂 Enjoy {discount}% off. Code: {code}')
    created_at        = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at        = Column(TIMESTAMP(timezone=True), onupdate=func.now())


class CrmCustomer(Base):
    __tablename__ = "crm_customer"
    customer_id       = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, ForeignKey("company.company_unique_id", ondelete="CASCADE"), nullable=False)
    name              = Column(String(200), nullable=False)
    phone             = Column(String(20))
    email             = Column(String(200))
    date_of_birth     = Column(Date)
    anniversary_date  = Column(Date)
    address           = Column(Text)
    notes             = Column(Text)
    total_visits      = Column(Integer, default=0)
    total_spend       = Column(Numeric(12, 2), default=0)
    loyalty_points    = Column(Integer, default=0)
    due_amount        = Column(Numeric(12, 2), default=0)
    is_active         = Column(Boolean, default=True)
    created_at        = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at        = Column(TIMESTAMP(timezone=True), onupdate=func.now())


class PromoCode(Base):
    __tablename__ = "promo_code"
    promo_id          = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, ForeignKey("company.company_unique_id", ondelete="CASCADE"), nullable=False)
    code              = Column(String(50), nullable=False)
    description       = Column(Text)
    discount_type     = Column(String(20), default='percent')
    discount_value    = Column(Numeric(10, 2), nullable=False)
    min_bill_amount   = Column(Numeric(10, 2), default=0)
    max_discount      = Column(Numeric(10, 2))
    valid_from        = Column(Date)
    valid_till        = Column(Date)
    max_uses          = Column(Integer)
    used_count        = Column(Integer, default=0)
    trigger_type      = Column(String(30), default='manual')
    is_active         = Column(Boolean, default=True)
    created_at        = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at        = Column(TIMESTAMP(timezone=True), onupdate=func.now())


class PromoUsage(Base):
    __tablename__ = "promo_usage"
    usage_id          = Column(BigInteger, Identity(), primary_key=True)
    promo_id          = Column(BigInteger, ForeignKey("promo_code.promo_id", ondelete="CASCADE"), nullable=False)
    company_unique_id = Column(BigInteger, nullable=False)
    customer_id       = Column(BigInteger, ForeignKey("crm_customer.customer_id"), nullable=True)
    order_id          = Column(BigInteger)
    bill_id           = Column(BigInteger)
    bill_number       = Column(String(30))
    discount_applied  = Column(Numeric(10, 2))
    used_at           = Column(TIMESTAMP(timezone=True), server_default=func.now())




class CustomerCreditLog(Base):
    __tablename__ = "customer_credit_log"
    log_id            = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, ForeignKey("company.company_unique_id", ondelete="CASCADE"), nullable=False)
    customer_id       = Column(BigInteger, ForeignKey("crm_customer.customer_id", ondelete="CASCADE"), nullable=False)
    order_id          = Column(BigInteger, nullable=True)
    order_number      = Column(String(50), nullable=True)
    bill_id           = Column(BigInteger, nullable=True)
    bill_number       = Column(String(50), nullable=True)
    amount            = Column(Numeric(12, 2), nullable=False)
    payment_status    = Column(String(20), default='credit')
    notes             = Column(Text, nullable=True)
    created_at        = Column(TIMESTAMP(timezone=True), server_default=func.now())

class CrmFeedback(Base):
    __tablename__ = "crm_feedback"
    feedback_id       = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    customer_id       = Column(BigInteger, ForeignKey("crm_customer.customer_id"), nullable=True)
    order_id          = Column(BigInteger)
    bill_id           = Column(BigInteger)
    rating            = Column(Integer, CheckConstraint('rating BETWEEN 1 AND 5'))
    comment           = Column(Text)
    category          = Column(String(50))
    status            = Column(String(20), default='new')
    created_at        = Column(TIMESTAMP(timezone=True), server_default=func.now())


class CrmReservation(Base):
    __tablename__ = "crm_reservation"
    reservation_id    = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(BigInteger, nullable=False)
    customer_id       = Column(BigInteger, ForeignKey("crm_customer.customer_id"), nullable=True)
    customer_name     = Column(String(200))
    customer_phone    = Column(String(20))
    reservation_date  = Column(Date, nullable=False)
    reservation_time  = Column(Time, nullable=False)
    covers            = Column(Integer, default=2)
    table_preference  = Column(String(100))
    notes             = Column(Text)
    status            = Column(String(20), default='confirmed')
    created_at        = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at        = Column(TIMESTAMP(timezone=True), onupdate=func.now())
