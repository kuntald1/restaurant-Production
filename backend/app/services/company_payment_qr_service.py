from sqlalchemy.orm import Session
from app.models.company_model import CompanyPaymentQR, Company
from app.schemas.company_payment_qr_schema import CompanyPaymentQRCreate, CompanyPaymentQRUpdate


def create_qr(db: Session, company_unique_id: int, data: CompanyPaymentQRCreate):
    company = db.query(Company).filter(Company.company_unique_id == company_unique_id).first()
    if not company:
        return None
    qr = CompanyPaymentQR(company_unique_id=company_unique_id, **data.model_dump())
    db.add(qr)
    db.commit()
    db.refresh(qr)
    return qr


def get_all_qr(db: Session, company_unique_id: int):
    return db.query(CompanyPaymentQR).filter(
        CompanyPaymentQR.company_unique_id == company_unique_id
    ).all()


def get_active_qr(db: Session, company_unique_id: int):
    return db.query(CompanyPaymentQR).filter(
        CompanyPaymentQR.company_unique_id == company_unique_id,
        CompanyPaymentQR.is_active == True
    ).all()


def update_qr(db: Session, company_unique_id: int, qr_id: int, data: CompanyPaymentQRUpdate):
    qr = db.query(CompanyPaymentQR).filter(
        CompanyPaymentQR.company_payment_qr_id == qr_id,
        CompanyPaymentQR.company_unique_id == company_unique_id
    ).first()
    if not qr:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(qr, field, value)
    db.commit()
    db.refresh(qr)
    return qr


def delete_qr(db: Session, company_unique_id: int, qr_id: int):
    qr = db.query(CompanyPaymentQR).filter(
        CompanyPaymentQR.company_payment_qr_id == qr_id,
        CompanyPaymentQR.company_unique_id == company_unique_id
    ).first()
    if not qr:
        return None
    db.delete(qr)
    db.commit()
    return True