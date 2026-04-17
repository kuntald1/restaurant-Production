from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.schemas.whatsapp_log_schema import WhatsAppLogCreate, WhatsAppLogResponse
from app.services import whatsapp_log_service
from app.models.company_model import Company

router = APIRouter(prefix="/whatsapplogs", tags=["WhatsApp Logs"])

# ── Log a new WhatsApp message (called internally from pos_service etc.) ──────
@router.post("/log", response_model=WhatsAppLogResponse)
def create_log(data: WhatsAppLogCreate, db: Session = Depends(get_db)):
    return whatsapp_log_service.log_whatsapp(db, data)

# ── Get logs — Super Admin sees all, Admin sees own + children ────────────────
@router.get("/getlogs/{company_id}", response_model=list[WhatsAppLogResponse])
def get_logs(
    company_id: int,
    is_super_admin: bool = Query(False),
    skip: int = Query(0),
    limit: int = Query(500),
    db: Session = Depends(get_db)
):
    if is_super_admin:
        return whatsapp_log_service.get_all_logs(db, skip=skip, limit=limit)

    # Get child company IDs
    children = db.query(Company.company_unique_id).filter(
        Company.parant_company_unique_id == company_id
    ).all()
    child_ids = [c.company_unique_id for c in children]

    return whatsapp_log_service.get_logs_by_company_and_children(
        db, company_id, child_ids, skip=skip, limit=limit
    )

# ── Summary count per company (for dashboard) ─────────────────────────────────
@router.get("/summary")
def get_summary(db: Session = Depends(get_db)):
    rows = whatsapp_log_service.get_summary_by_company(db)
    return [{"company_unique_id": r[0], "total": r[1]} for r in rows]
