from pydantic import BaseModel
from typing import Optional


class CompanyPaymentQRCreate(BaseModel):
    type: str
    image_url: str
    is_active: bool = True


class CompanyPaymentQRUpdate(BaseModel):
    type: Optional[str] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None


class CompanyPaymentQRResponse(BaseModel):
    company_payment_qr_id: int
    company_unique_id: int
    type: str
    image_url: str
    is_active: bool

    class Config:
        from_attributes = True