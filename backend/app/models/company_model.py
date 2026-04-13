from sqlalchemy import Column, String, Boolean, BigInteger, Integer, Text, TIMESTAMP, ForeignKey, Identity, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base
import uuid


class Company(Base):

    __tablename__ = "company"

    company_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_unique_id = Column(BigInteger, Identity(), unique=True)

    name = Column(String(200), nullable=False)
    short_name = Column(String(100))

    address1 = Column(Text, nullable=False)
    address2 = Column(Text)

    pin = Column(String(20))

    country = Column(Text, nullable=False)

    admin_phone = Column(String(20))
    service_phone = Column(String(20))

    admin_email = Column(String(100))
    service_email = Column(String(100))
    secondary_email = Column(String(100))

    image_file_path = Column(Text)
    logo_file_name = Column(Text)
    fav_icon_file_name = Column(Text)

    website = Column(Text)

    is_active = Column(Boolean, default=True, nullable=False)

    created_date = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    created_by = Column(UUID(as_uuid=True))

    modified_date = Column(TIMESTAMP(timezone=True))
    modified_by = Column(UUID(as_uuid=True))

    admin_phone_country_code = Column(String(30))
    service_phone_country_code = Column(String(30))

    currency_id = Column(Integer, nullable=False)

    db_pwd = Column(Text)
    db_user_id = Column(String(50))
    db_server = Column(String(50))
    db_name = Column(String(50))

    domain_url = Column(String(200))

    api_key = Column(UUID(as_uuid=True), default=uuid.uuid4)

    date_format = Column(String(50))
    time_format = Column(String(50))

    latlong = Column(Text)

    parant_company_unique_id = Column(
        BigInteger,
        ForeignKey("company.company_unique_id", ondelete="SET NULL")
    )

    reference_company_unique_id = Column(
        BigInteger,
        ForeignKey("company.company_unique_id", ondelete="SET NULL")
    )

    gstin = Column(String(15))
    fssai = Column(String(14))
    hsn = Column(String(8))

    # ── NEW: Merchant payment flag ─────────────────────────────
    is_merchant_enabled = Column(Boolean, default=False, nullable=False, server_default='false')

    # ── WhatsApp / SMS / UPI flags ──────────────────────────────
    is_sms_enabled   = Column(Boolean, default=False, nullable=False, server_default='false')
    whatsapp_enabled = Column(Boolean, default=False, nullable=False, server_default='false')
    is_upi_enabled   = Column(Boolean, default=False, nullable=False, server_default='false')

    # ── Tax rates ───────────────────────────────────────────────
    sgst = Column(Numeric(5, 2), default=0, nullable=True)
    cgst = Column(Numeric(5, 2), default=0, nullable=True)


class CompanyPaymentQR(Base):
    __tablename__ = "company_payment_qr"

    company_payment_qr_id = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id = Column(
        BigInteger,
        ForeignKey("company.company_unique_id", ondelete="CASCADE"),
        nullable=False
    )
    type = Column(String(50), nullable=False)
    image_url = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())


# ── NEW: Merchant Settings Table ──────────────────────────────

class MerchantSettings(Base):
    __tablename__ = "merchant_settings"

    id                    = Column(BigInteger, Identity(), primary_key=True)
    company_unique_id     = Column(
        BigInteger,
        ForeignKey("company.company_unique_id", ondelete="CASCADE"),
        nullable=False,
        unique=True
    )
    # Razorpay
    razorpay_key_id       = Column(String(100), nullable=True)
    razorpay_key_secret   = Column(Text, nullable=True)   # store encrypted in production
    merchant_name         = Column(String(200), nullable=True)
    merchant_description  = Column(String(500), nullable=True)

    # Personal UPI (backup storage — primary is company_payment_qr)
    upi_id                = Column(String(200), nullable=True)
    upi_name              = Column(String(200), nullable=True)
    upi_qr_image_url      = Column(Text, nullable=True)

    created_at            = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at            = Column(TIMESTAMP(timezone=True), onupdate=func.now())
