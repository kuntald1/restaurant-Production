"""
adv_po_router.py — Advanced Purchase Order API endpoints
Prefix: /adv-po
"""

from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.services import adv_po_service as svc

router = APIRouter(prefix="/adv-po", tags=["Advanced PO"])


# ── Pydantic schemas ──────────────────────────────────────────

class WeatherRuleIn(BaseModel):
    company_unique_id: int
    condition: str          # hot | rain | cold
    temp_min: Optional[float] = None
    temp_max: Optional[float] = None
    rain_threshold: Optional[float] = None
    item_category_id: int
    multiplier: float = 1.0
    description: Optional[str] = None
    is_active: bool = True

class WeatherRuleUpdate(BaseModel):
    condition: Optional[str] = None
    temp_min: Optional[float] = None
    temp_max: Optional[float] = None
    rain_threshold: Optional[float] = None
    multiplier: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class OccasionRuleIn(BaseModel):
    category_id: int
    multiplier: float

class BranchOccasionIn(BaseModel):
    occasion_id: int
    is_active: bool

class AcceptSuggestionIn(BaseModel):
    item_id: int
    accepted_qty: float

class AcceptBulkIn(BaseModel):
    items: List[AcceptSuggestionIn]

class ApplyCorrectionIn(BaseModel):
    log_id: int
    rule_id: int


# ── Weather rules ─────────────────────────────────────────────

@router.get("/weather-rules/{company_id}")
def get_weather_rules(company_id: int, db: Session = Depends(get_db)):
    rules = svc.get_weather_rules(db, company_id)
    return [
        {
            "rule_id":          r.rule_id,
            "condition":        r.condition,
            "temp_min":         float(r.temp_min) if r.temp_min is not None else None,
            "temp_max":         float(r.temp_max) if r.temp_max is not None else None,
            "rain_threshold":   float(r.rain_threshold) if r.rain_threshold is not None else None,
            "item_category_id": r.item_category_id,
            "multiplier":       float(r.multiplier),
            "description":      r.description,
            "is_active":        r.is_active,
        }
        for r in rules
    ]

@router.post("/weather-rules")
def create_weather_rule(body: WeatherRuleIn, db: Session = Depends(get_db)):
    rule = svc.create_weather_rule(db, body.dict())
    return {"rule_id": rule.rule_id, "message": "Weather rule created"}

@router.put("/weather-rules/{rule_id}")
def update_weather_rule(rule_id: int, body: WeatherRuleUpdate, db: Session = Depends(get_db)):
    data = {k: v for k, v in body.dict().items() if v is not None}
    rule = svc.update_weather_rule(db, rule_id, data)
    return {"rule_id": rule.rule_id, "multiplier": float(rule.multiplier), "message": "Updated"}

@router.delete("/weather-rules/{rule_id}")
def delete_weather_rule(rule_id: int, db: Session = Depends(get_db)):
    svc.delete_weather_rule(db, rule_id)
    return {"message": "Deleted"}


# ── Occasions ─────────────────────────────────────────────────

@router.get("/occasions")
def get_all_occasions(db: Session = Depends(get_db)):
    occs = svc.get_all_occasions(db)
    return [
        {
            "occasion_id": o.occasion_id,
            "name":        o.name,
            "month":       o.month,
            "day":         o.day,
            "days_before": o.days_before,
            "days_after":  o.days_after,
            "description": o.description,
        }
        for o in occs
    ]

@router.get("/occasions/{occasion_id}/rules")
def get_occasion_rules(occasion_id: int, db: Session = Depends(get_db)):
    rules = svc.get_occasion_rules(db, occasion_id)
    return [
        {"occ_rule_id": r.occ_rule_id, "category_id": r.item_category_id, "multiplier": float(r.multiplier)}
        for r in rules
    ]

@router.post("/occasions/{occasion_id}/rules")
def upsert_occasion_rule(occasion_id: int, body: OccasionRuleIn, db: Session = Depends(get_db)):
    svc.upsert_occasion_rule(db, occasion_id, body.category_id, body.multiplier)
    return {"message": "Saved"}


# ── Branch occasions ──────────────────────────────────────────

@router.get("/branch-occasions/{company_id}")
def get_branch_occasions(company_id: int, db: Session = Depends(get_db)):
    all_occ  = svc.get_all_occasions(db)
    branch   = svc.get_branch_occasions(db, company_id)
    active_ids = {b.occasion_id: b.is_active for b in branch}
    return [
        {
            "occasion_id": o.occasion_id,
            "name":        o.name,
            "month":       o.month,
            "day":         o.day,
            "days_before": o.days_before,
            "description": o.description,
            "is_active":   active_ids.get(o.occasion_id, False),
        }
        for o in all_occ
    ]

@router.post("/branch-occasions/{company_id}")
def set_branch_occasion(company_id: int, body: BranchOccasionIn, db: Session = Depends(get_db)):
    svc.set_branch_occasion(db, company_id, body.occasion_id, body.is_active)
    return {"message": "Updated"}


# ── Suggestions ───────────────────────────────────────────────

@router.post("/suggest/{company_id}/{node_id}/{po_id}")
def generate_suggestions(
    company_id: int, node_id: int, po_id: int,
    po_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """Generate AI quantity suggestions for all items in a PO."""
    target_date = date.fromisoformat(po_date) if po_date else date.today()
    try:
        suggestions = svc.generate_suggestions(db, company_id, node_id, po_id, target_date)
        return {"suggestions": suggestions, "count": len(suggestions)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/suggestions/{po_id}")
def get_suggestions(po_id: int, db: Session = Depends(get_db)):
    """Get existing suggestions for a PO."""
    from app.models.inventory_models import AdvPoSuggestion, InventoryItem
    rows = db.query(AdvPoSuggestion).filter_by(po_id=po_id).all()
    result = []
    for s in rows:
        item = db.query(InventoryItem).filter_by(item_id=s.item_id).first()
        weather = {}
        try:
            weather = __import__('json').loads(s.weather_data) if s.weather_data else {}
        except Exception:
            pass
        result.append({
            "suggestion_id":     s.suggestion_id,
            "item_id":           s.item_id,
            "item_name":         item.item_name if item else f"Item #{s.item_id}",
            "base_qty_30d":      float(s.base_qty_30d),
            "weather_multiplier":float(s.weather_multiplier),
            "occasion_multiplier":float(s.occasion_multiplier),
            "final_multiplier":  float(s.final_multiplier),
            "suggested_qty":     float(s.suggested_qty),
            "accepted_qty":      float(s.accepted_qty) if s.accepted_qty else None,
            "reason":            s.reason,
            "weather":           weather,
        })
    return result

@router.post("/suggestions/{po_id}/accept")
def accept_suggestions(po_id: int, body: AcceptBulkIn, db: Session = Depends(get_db)):
    """Save manager's accepted/edited quantities."""
    svc.accept_suggestions(db, po_id, [a.dict() for a in body.items])
    return {"message": "Accepted quantities saved"}


# ── Accuracy & Phase 1.5 ──────────────────────────────────────

@router.get("/accuracy/{company_id}")
def get_accuracy_report(company_id: int, days_back: int = Query(default=14), db: Session = Depends(get_db)):
    """Compute and return accuracy report — suggested vs actual."""
    report = svc.compute_accuracy(db, company_id, days_back)
    return {"report": report, "count": len(report)}

@router.post("/accuracy/apply-correction")
def apply_correction(body: ApplyCorrectionIn, db: Session = Depends(get_db)):
    """Admin applies recommended multiplier correction to a weather rule."""
    svc.apply_accuracy_correction(db, body.log_id, body.rule_id)
    return {"message": "Correction applied to rule"}

@router.get("/weather-preview/{company_id}")
def preview_weather(company_id: int, db: Session = Depends(get_db)):
    """Preview tomorrow's weather for a branch (for testing/display)."""
    latlong = svc._get_latlong(db, company_id)
    if not latlong:
        return {"error": "No lat/lng set for this company. Add it in Company Settings."}
    weather = svc.fetch_weather(*latlong)
    condition = svc._weather_condition(weather)
    return {**weather, "classified_condition": condition}
