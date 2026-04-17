from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import get_db
from app.models.contact_lead_model import ContactLead

router = APIRouter(prefix="/contactleads", tags=["Contact Leads"])

class ContactLeadCreate(BaseModel):
    first_name      : str
    last_name       : Optional[str] = None
    restaurant_name : str
    phone           : str
    email           : Optional[str] = None
    city            : Optional[str] = None
    branches        : Optional[str] = None
    interest        : Optional[str] = None
    message         : Optional[str] = None

class ContactLeadResponse(ContactLeadCreate):
    id              : int
    is_contacted    : bool
    contacted_note  : Optional[str]
    submitted_at    : datetime
    class Config:
        from_attributes = True

class ContactLeadUpdate(BaseModel):
    is_contacted   : Optional[bool] = None
    contacted_note : Optional[str] = None

# ── Submit from landing page (public, no auth needed) ─────────────────────────
@router.post("/submit", response_model=ContactLeadResponse)
def submit_contact(data: ContactLeadCreate, db: Session = Depends(get_db)):
    lead = ContactLead(**data.model_dump())
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead

# ── Get all leads (Super Admin only) ──────────────────────────────────────────
@router.get("/getall", response_model=list[ContactLeadResponse])
def get_all_leads(db: Session = Depends(get_db)):
    return db.query(ContactLead).order_by(ContactLead.submitted_at.desc()).all()

# ── Mark contacted / add note ─────────────────────────────────────────────────
@router.patch("/update/{lead_id}", response_model=ContactLeadResponse)
def update_lead(lead_id: int, data: ContactLeadUpdate, db: Session = Depends(get_db)):
    lead = db.query(ContactLead).filter(ContactLead.id == lead_id).first()
    if not lead:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Lead not found")
    if data.is_contacted is not None:
        lead.is_contacted = data.is_contacted
    if data.contacted_note is not None:
        lead.contacted_note = data.contacted_note
    db.commit()
    db.refresh(lead)
    return lead
