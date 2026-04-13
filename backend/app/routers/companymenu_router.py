from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import SessionLocal
from app.services import companymenu_service


router = APIRouter(
    prefix="/menu",
    tags=["Menu"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Get Company Menu
@router.get("/{company_id}")
def get_menu(company_id: int, db: Session = Depends(get_db)):
    result = companymenu_service.get_companymenu(db, company_id)
    if not result:
        raise HTTPException(status_code=404, detail="Menu not found")
    return result
