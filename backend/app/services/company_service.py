from sqlalchemy.orm import Session
from datetime import datetime
from app.models.company_model import Company


def create_company(db: Session, company):

    db_company = Company(**company.model_dump())

    db.add(db_company)
    db.commit()
    db.refresh(db_company)

    return db_company


def update_company(db: Session, company_id, company):

    db_company = db.query(Company).filter(
        Company.company_id == company_id,
        Company.is_active == True
    ).first()

    if not db_company:
        return None

    update_data = company.dict(exclude_unset=True)

    for key, value in update_data.items():
        setattr(db_company, key, value)

    db_company.modified_date = datetime.utcnow()

    db.commit()
    db.refresh(db_company)

    return db_company


def deactivate_company(db: Session, company_id):

    db_company = db.query(Company).filter(
        Company.company_id == company_id,
        Company.is_active == True
    ).first()

    if not db_company:
        return None

    db_company.is_active = False
    db_company.modified_date = datetime.utcnow()

    db.commit()
    db.refresh(db_company)

    return db_company


def get_company(db: Session, company_id):

    return db.query(Company).filter(
        Company.company_id == company_id,
        Company.is_active == True
    ).first()


def get_all_companies(db: Session):

    return db.query(Company).filter(
        Company.is_active == True
    ).all()

def get_company_by_unique_id(db: Session, company_unique_id: int):
    return db.query(Company).filter(
        Company.company_unique_id == company_unique_id,
        Company.is_active == True
    ).first()