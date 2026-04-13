from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from decimal import Decimal


# -------- CREATE COMPANY --------
class CompanyCreate(BaseModel):

    name: str
    short_name: Optional[str] = None

    address1: str
    address2: Optional[str] = None
    pin: Optional[str] = None

    country: str

    admin_phone: Optional[str] = None
    service_phone: Optional[str] = None

    admin_phone_country_code: Optional[str] = None
    service_phone_country_code: Optional[str] = None

    admin_email: Optional[str] = None
    service_email: Optional[str] = None
    secondary_email: Optional[str] = None

    website: Optional[str] = None

    image_file_path: Optional[str] = None
    logo_file_name: Optional[str] = None
    fav_icon_file_name: Optional[str] = None

    currency_id: int

    db_pwd: Optional[str] = None
    db_user_id: Optional[str] = None
    db_server: Optional[str] = None
    db_name: Optional[str] = None

    domain_url: Optional[str] = None

    date_format: Optional[str] = None
    time_format: Optional[str] = None

    latlong: Optional[str] = None

    parant_company_unique_id: Optional[int] = None
    reference_company_unique_id: Optional[int] = None

    created_by: Optional[UUID] = None
    gstin: Optional[str] = None
    fssai: Optional[str] = None
    hsn: Optional[str] = None

    # ── New fields ──────────────────────────────────────────────
    sgst:                Optional[Decimal] = None
    cgst:                Optional[Decimal] = None
    is_merchant_enabled: Optional[bool]    = False
    is_upi_enabled:      Optional[bool]    = False
    is_sms_enabled:      Optional[bool]    = False
    whatsapp_enabled:    Optional[bool]    = False


# -------- UPDATE COMPANY --------
class CompanyUpdate(BaseModel):

    name: Optional[str] = None
    short_name: Optional[str] = None

    address1: Optional[str] = None
    address2: Optional[str] = None
    pin: Optional[str] = None

    country: Optional[str] = None

    admin_phone: Optional[str] = None
    service_phone: Optional[str] = None

    admin_phone_country_code: Optional[str] = None
    service_phone_country_code: Optional[str] = None

    admin_email: Optional[str] = None
    service_email: Optional[str] = None
    secondary_email: Optional[str] = None

    website: Optional[str] = None

    image_file_path: Optional[str] = None
    logo_file_name: Optional[str] = None
    fav_icon_file_name: Optional[str] = None

    currency_id: Optional[int] = None

    db_pwd: Optional[str] = None
    db_user_id: Optional[str] = None
    db_server: Optional[str] = None
    db_name: Optional[str] = None

    domain_url: Optional[str] = None

    date_format: Optional[str] = None
    time_format: Optional[str] = None

    latlong: Optional[str] = None

    parant_company_unique_id: Optional[int] = None
    reference_company_unique_id: Optional[int] = None

    modified_by: Optional[UUID] = None
    gstin: Optional[str] = None
    fssai: Optional[str] = None
    hsn: Optional[str] = None

    # ── New fields ──────────────────────────────────────────────
    sgst:                Optional[Decimal] = None
    cgst:                Optional[Decimal] = None
    is_merchant_enabled: Optional[bool]    = None
    is_upi_enabled:      Optional[bool]    = None
    is_sms_enabled:      Optional[bool]    = None
    whatsapp_enabled:    Optional[bool]    = None


# -------- RESPONSE MODEL --------
class CompanyResponse(BaseModel):

    company_id: UUID
    company_unique_id: int
    name: str
    short_name: Optional[str]

    address1: str
    address2: Optional[str]

    country: str

    admin_phone: Optional[str]
    service_phone: Optional[str]

    admin_email: Optional[str]
    service_email: Optional[str]

    website: Optional[str]

    is_active: bool
    gstin: Optional[str]
    fssai: Optional[str]
    hsn: Optional[str]

    # ── New fields ──────────────────────────────────────────────
    sgst:                Optional[Decimal] = None
    cgst:                Optional[Decimal] = None
    is_merchant_enabled: Optional[bool]    = False
    is_upi_enabled:      Optional[bool]    = False
    is_sms_enabled:      Optional[bool]    = False
    whatsapp_enabled:    Optional[bool]    = False

    class Config:
        from_attributes = True