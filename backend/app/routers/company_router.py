from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional
from pydantic import BaseModel

from app.database import SessionLocal
from app.schemas.company_schema import CompanyCreate, CompanyUpdate
from app.schemas.company_payment_qr_schema import CompanyPaymentQRCreate, CompanyPaymentQRUpdate
from app.services import company_service, company_payment_qr_service
from app.services.upload_service import upload_image, delete_image
from app.models.company_model import Company, CompanyPaymentQR, MerchantSettings


router = APIRouter(
    prefix="/company",
    tags=["Company"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Pydantic schemas for merchant settings ────────────────────

class MerchantSettingsCreate(BaseModel):
    razorpay_key_id:      Optional[str] = None
    razorpay_key_secret:  Optional[str] = None
    merchant_name:        Optional[str] = None
    merchant_description: Optional[str] = None
    upi_id:               Optional[str] = None
    upi_name:             Optional[str] = None
    upi_qr_image_url:     Optional[str] = None

class MerchantSettingsResponse(BaseModel):
    id:                   int
    company_unique_id:    int
    razorpay_key_id:      Optional[str] = None
    # Never return secret in response
    merchant_name:        Optional[str] = None
    merchant_description: Optional[str] = None
    upi_id:               Optional[str] = None
    upi_name:             Optional[str] = None
    upi_qr_image_url:     Optional[str] = None

    class Config:
        from_attributes = True

class MerchantToggle(BaseModel):
    is_merchant_enabled: bool


# ───────────────────────────── Company CRUD ─────────────────────────────

@router.post("/")
@router.post("")
def create_company(company: CompanyCreate, db: Session = Depends(get_db)):
    return company_service.create_company(db, company)


@router.get("/")
def get_all_companies(db: Session = Depends(get_db)):
    return company_service.get_all_companies(db)


# ── IMPORTANT: specific routes MUST come before /{company_id} wildcard ──

@router.get("/unique/{company_unique_id}")
def get_company_by_unique_id(company_unique_id: int, db: Session = Depends(get_db)):
    result = company_service.get_company_by_unique_id(db, company_unique_id)
    if not result:
        raise HTTPException(status_code=404, detail="Company not found")
    return result


@router.get("/{company_id}")
def get_company(company_id: UUID, db: Session = Depends(get_db)):
    result = company_service.get_company(db, company_id)
    if not result:
        raise HTTPException(status_code=404, detail="Company not found")
    return result


@router.put("/{company_id}")
def update_company(company_id: UUID, company: CompanyUpdate, db: Session = Depends(get_db)):
    result = company_service.update_company(db, company_id, company)
    if not result:
        raise HTTPException(status_code=404, detail="Company not found")
    return result


@router.delete("/{company_id}")
def delete_company(company_id: UUID, db: Session = Depends(get_db)):
    result = company_service.deactivate_company(db, company_id)
    if not result:
        raise HTTPException(status_code=404, detail="Company not found")
    return {"message": "Company deactivated successfully"}


# ───────────────────────────── Company Images ────────────────────────────

@router.post("/{company_unique_id}/logo")
async def upload_logo(
    company_unique_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    company = db.query(Company).filter(
        Company.company_unique_id == company_unique_id,
        Company.is_active == True
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if company.logo_file_name:
        await delete_image(company.logo_file_name)
    url = await upload_image(file, folder=f"company/{company_unique_id}/logo")
    company.logo_file_name = url
    db.commit()
    return {"logo_url": url}


@router.delete("/{company_unique_id}/logo")
async def delete_logo(company_unique_id: int, db: Session = Depends(get_db)):
    company = db.query(Company).filter(
        Company.company_unique_id == company_unique_id,
        Company.is_active == True
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not company.logo_file_name:
        raise HTTPException(status_code=404, detail="No logo found")
    await delete_image(company.logo_file_name)
    company.logo_file_name = None
    db.commit()
    return {"message": "Logo deleted successfully"}


@router.post("/{company_unique_id}/favicon")
async def upload_favicon(
    company_unique_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    company = db.query(Company).filter(
        Company.company_unique_id == company_unique_id,
        Company.is_active == True
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if company.fav_icon_file_name:
        await delete_image(company.fav_icon_file_name)
    url = await upload_image(file, folder=f"company/{company_unique_id}/favicon")
    company.fav_icon_file_name = url
    db.commit()
    return {"favicon_url": url}


@router.delete("/{company_unique_id}/favicon")
async def delete_favicon(company_unique_id: int, db: Session = Depends(get_db)):
    company = db.query(Company).filter(
        Company.company_unique_id == company_unique_id,
        Company.is_active == True
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not company.fav_icon_file_name:
        raise HTTPException(status_code=404, detail="No favicon found")
    await delete_image(company.fav_icon_file_name)
    company.fav_icon_file_name = None
    db.commit()
    return {"message": "Favicon deleted successfully"}


@router.post("/{company_unique_id}/image")
async def upload_company_image(
    company_unique_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    company = db.query(Company).filter(
        Company.company_unique_id == company_unique_id,
        Company.is_active == True
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if company.image_file_path:
        await delete_image(company.image_file_path)
    url = await upload_image(file, folder=f"company/{company_unique_id}/image")
    company.image_file_path = url
    db.commit()
    return {"image_url": url}


@router.delete("/{company_unique_id}/image")
async def delete_company_image(company_unique_id: int, db: Session = Depends(get_db)):
    company = db.query(Company).filter(
        Company.company_unique_id == company_unique_id,
        Company.is_active == True
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not company.image_file_path:
        raise HTTPException(status_code=404, detail="No image found")
    await delete_image(company.image_file_path)
    company.image_file_path = None
    db.commit()
    return {"message": "Image deleted successfully"}


# ───────────────────────── Company Payment QR ──────────────────────────

@router.post("/{company_unique_id}/qr")
def create_qr(company_unique_id: int, qr: CompanyPaymentQRCreate, db: Session = Depends(get_db)):
    result = company_payment_qr_service.create_qr(db, company_unique_id, qr)
    if not result:
        raise HTTPException(status_code=404, detail="Company not found")
    return result


@router.get("/{company_unique_id}/qr/active")
def get_active_qr(company_unique_id: int, db: Session = Depends(get_db)):
    return company_payment_qr_service.get_active_qr(db, company_unique_id)


@router.get("/{company_unique_id}/qr")
def get_all_qr(company_unique_id: int, db: Session = Depends(get_db)):
    return company_payment_qr_service.get_all_qr(db, company_unique_id)


@router.put("/{company_unique_id}/qr/{qr_id}")
def update_qr(company_unique_id: int, qr_id: int, qr: CompanyPaymentQRUpdate, db: Session = Depends(get_db)):
    result = company_payment_qr_service.update_qr(db, company_unique_id, qr_id, qr)
    if not result:
        raise HTTPException(status_code=404, detail="QR record not found")
    return result


@router.delete("/{company_unique_id}/qr/{qr_id}")
def delete_qr(company_unique_id: int, qr_id: int, db: Session = Depends(get_db)):
    result = company_payment_qr_service.delete_qr(db, company_unique_id, qr_id)
    if not result:
        raise HTTPException(status_code=404, detail="QR record not found")
    return {"message": "QR record deleted successfully"}


@router.post("/{company_unique_id}/qr/{qr_id}/image")
async def upload_qr_image(
    company_unique_id: int,
    qr_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    qr = db.query(CompanyPaymentQR).filter(
        CompanyPaymentQR.company_payment_qr_id == qr_id,
        CompanyPaymentQR.company_unique_id == company_unique_id
    ).first()
    if not qr:
        raise HTTPException(status_code=404, detail="QR record not found")
    if qr.image_url:
        await delete_image(qr.image_url)
    url = await upload_image(file, folder=f"company/{company_unique_id}/qr")
    qr.image_url = url
    db.commit()
    return {"qr_url": url}


@router.delete("/{company_unique_id}/qr/{qr_id}/image")
async def delete_qr_image(
    company_unique_id: int,
    qr_id: int,
    db: Session = Depends(get_db)
):
    qr = db.query(CompanyPaymentQR).filter(
        CompanyPaymentQR.company_payment_qr_id == qr_id,
        CompanyPaymentQR.company_unique_id == company_unique_id
    ).first()
    if not qr:
        raise HTTPException(status_code=404, detail="QR record not found")
    if not qr.image_url:
        raise HTTPException(status_code=404, detail="No image found for this QR")
    await delete_image(qr.image_url)
    qr.image_url = None
    db.commit()
    return {"message": "QR image deleted successfully"}


# ─────────────────── NEW: Merchant Settings ───────────────────────────

@router.get("/{company_unique_id}/merchant-settings", response_model=MerchantSettingsResponse)
def get_merchant_settings(company_unique_id: int, db: Session = Depends(get_db)):
    """Get merchant/Razorpay settings for a company."""
    settings = db.query(MerchantSettings).filter(
        MerchantSettings.company_unique_id == company_unique_id
    ).first()
    if not settings:
        raise HTTPException(status_code=404, detail="No merchant settings found")
    return settings


@router.put("/{company_unique_id}/merchant-settings", response_model=MerchantSettingsResponse)
def upsert_merchant_settings(
    company_unique_id: int,
    data: MerchantSettingsCreate,
    db: Session = Depends(get_db)
):
    """Create or update merchant/Razorpay settings for a company."""
    # Verify company exists
    company = db.query(Company).filter(
        Company.company_unique_id == company_unique_id
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    settings = db.query(MerchantSettings).filter(
        MerchantSettings.company_unique_id == company_unique_id
    ).first()

    if settings:
        # Update existing
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(settings, field, value)
    else:
        # Create new
        settings = MerchantSettings(
            company_unique_id=company_unique_id,
            **data.model_dump(exclude_none=True)
        )
        db.add(settings)

    db.commit()
    db.refresh(settings)
    return settings


@router.patch("/{company_unique_id}/merchant-toggle")
def toggle_merchant(
    company_unique_id: int,
    data: MerchantToggle,
    db: Session = Depends(get_db)
):
    """Enable or disable merchant payments for a company."""
    company = db.query(Company).filter(
        Company.company_unique_id == company_unique_id
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    company.is_merchant_enabled = data.is_merchant_enabled
    db.commit()
    return {
        "company_unique_id": company_unique_id,
        "is_merchant_enabled": company.is_merchant_enabled,
        "message": f"Merchant payments {'enabled' if data.is_merchant_enabled else 'disabled'}"
    }
