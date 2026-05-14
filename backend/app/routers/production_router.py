"""
production_router.py — Production Entry API
Prefix: /production
"""

from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.services import production_service as svc

router = APIRouter(prefix="/production", tags=["Production"])


# ── Schemas ───────────────────────────────────────────────────

class ProductionCreateIn(BaseModel):
    company_unique_id: int
    node_id:           int
    recipe_id:         Optional[int] = None
    finished_item_id:  Optional[int] = None
    production_date:   date
    planned_qty:       float
    yield_uom_id:      Optional[int] = None
    notes:             Optional[str] = None
    created_by:        Optional[str] = None

class ProductionItemUpdate(BaseModel):
    prod_item_id: int
    actual_qty:   float

class ProductionUpdateIn(BaseModel):
    node_id:          Optional[int]    = None
    recipe_id:        Optional[int]    = None
    finished_item_id: Optional[int]    = None
    production_date:  Optional[date]   = None
    planned_qty:      Optional[float]  = None
    yield_uom_id:     Optional[int]    = None
    notes:            Optional[str]    = None
    items:            Optional[List[ProductionItemUpdate]] = None


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/list/{company_id}")
def get_all(company_id: int, db: Session = Depends(get_db)):
    return svc.get_all(db, company_id)

@router.get("/{production_id}")
def get_by_id(production_id: int, db: Session = Depends(get_db)):
    entry = svc.get_by_id(db, production_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")
    return entry

@router.post("")
def create(body: ProductionCreateIn, db: Session = Depends(get_db)):
    try:
        return svc.create(db, body.dict())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{production_id}")
def update(production_id: int, body: ProductionUpdateIn, db: Session = Depends(get_db)):
    try:
        data = {k: v for k, v in body.dict().items() if v is not None}
        return svc.update(db, production_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{production_id}/check-stock")
def check_stock(production_id: int, db: Session = Depends(get_db)):
    """Check if CK has enough stock before posting."""
    try:
        return svc.check_stock_sufficiency(db, production_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{production_id}/post")
def post_entry(
    production_id: int,
    posted_by: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    try:
        return svc.post(db, production_id, posted_by)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{production_id}")
def delete(production_id: int, db: Session = Depends(get_db)):
    try:
        svc.delete(db, production_id)
        return {"message": "Deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
