"""
app/routers/settlement_router.py
Bill Settlement endpoints — edit an already-billed order and audit report.

Routes (prefix /settlement):
  GET  /settlement/bill/{bill_id}            → full bill + order + items
  PUT  /settlement/bill/{bill_id}/settle     → apply adds/removes, recompute, cascade
  GET  /settlement/report/{company_id}       → added/removed audit, grouped by bill
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.schemas.settlement_schema import SettleRequest
from app.services import settlement_service

router = APIRouter(prefix="/settlement", tags=["Bill Settlement"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/bill/{bill_id}")
def get_bill_detail(bill_id: int, db: Session = Depends(get_db)):
    """Full bill incl. the underlying order and all (incl. cancelled) items."""
    return jsonable_encoder(settlement_service.get_bill_detail(db, bill_id))


@router.put("/bill/{bill_id}/settle")
def settle_bill(bill_id: int, req: SettleRequest, db: Session = Depends(get_db)):
    """
    Apply additions / soft-removals to a billed order:
      • soft-cancel removed items (kept for audit)
      • recompute SGST/CGST + total from the company's GST rates
      • cascade the net change to crm_customer.due_amount + customer_credit_log
      • record every change in bill_settlement_log
    """
    try:
        return jsonable_encoder(settlement_service.settle_bill(db, bill_id, req))
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Settlement failed: {e} | {traceback.format_exc()}")


@router.get("/report/{company_id}")
def settlement_report(
    company_id: int,
    from_date: str = None,
    to_date: str = None,
    branch_id: int = None,
    bill_number: str = None,
    db: Session = Depends(get_db),
):
    """Items added / removed during settlement, grouped per bill (branch-aware)."""
    return jsonable_encoder(
        settlement_service.get_settlement_report(
            db, company_id,
            from_date=from_date, to_date=to_date,
            branch_id=branch_id, bill_number=bill_number,
        )
    )
