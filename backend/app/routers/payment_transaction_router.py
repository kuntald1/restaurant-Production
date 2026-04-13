"""
app/routers/payment_transaction_router.py
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from app.database import SessionLocal
from app.models.payment_transaction_model import PaymentTransaction

router = APIRouter(prefix="/pos", tags=["Payment Transactions"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class PaymentTransactionCreate(BaseModel):
    company_unique_id:    int
    order_id:             Optional[int]    = None
    order_number:         Optional[str]    = None
    bill_id:              Optional[int]    = None
    bill_number:          Optional[str]    = None
    razorpay_payment_id:  Optional[str]    = None
    razorpay_order_id:    Optional[str]    = None
    razorpay_signature:   Optional[str]    = None
    amount:               Decimal
    currency:             str              = 'INR'
    method:               Optional[str]    = None
    status:               str
    error_code:           Optional[str]    = None
    error_description:    Optional[str]    = None
    timestamp:            Optional[str]    = None


class PaymentTransactionResponse(BaseModel):
    id:                   int
    company_unique_id:    int
    order_id:             Optional[int]    = None
    order_number:         Optional[str]    = None
    bill_id:              Optional[int]    = None
    bill_number:          Optional[str]    = None
    razorpay_payment_id:  Optional[str]    = None
    razorpay_order_id:    Optional[str]    = None
    amount:               Decimal
    currency:             str
    method:               Optional[str]    = None
    status:               str
    error_code:           Optional[str]    = None
    error_description:    Optional[str]    = None
    created_at:           Optional[str]    = None  # serialized as ISO string

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_safe(cls, obj):
        data = {
            "id":                   obj.id,
            "company_unique_id":    obj.company_unique_id,
            "order_id":             obj.order_id,
            "order_number":         obj.order_number,
            "bill_id":              obj.bill_id,
            "bill_number":          obj.bill_number,
            "razorpay_payment_id":  obj.razorpay_payment_id,
            "razorpay_order_id":    obj.razorpay_order_id,
            "amount":               obj.amount,
            "currency":             obj.currency,
            "method":               obj.method,
            "status":               obj.status,
            "error_code":           obj.error_code,
            "error_description":    obj.error_description,
            "created_at":           obj.created_at.isoformat() if obj.created_at else None,
        }
        return cls(**data)


@router.post("/payment-transaction")
def create_transaction(data: PaymentTransactionCreate, db: Session = Depends(get_db)):
    """Save a payment transaction record."""
    payload = data.model_dump(exclude={'timestamp'})
    txn = PaymentTransaction(**payload)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return PaymentTransactionResponse.from_orm_safe(txn)


@router.get("/payment-transaction/bill/{bill_id}")
def get_by_bill(bill_id: int, db: Session = Depends(get_db)):
    rows = db.query(PaymentTransaction).filter(
        PaymentTransaction.bill_id == bill_id
    ).order_by(PaymentTransaction.created_at.desc()).all()
    return [PaymentTransactionResponse.from_orm_safe(r) for r in rows]


@router.get("/payment-transaction/order/{order_id}")
def get_by_order(order_id: int, db: Session = Depends(get_db)):
    rows = db.query(PaymentTransaction).filter(
        PaymentTransaction.order_id == order_id
    ).order_by(PaymentTransaction.created_at.desc()).all()
    return [PaymentTransactionResponse.from_orm_safe(r) for r in rows]


@router.get("/payment-transaction/company/{company_id}")
def get_by_company(company_id: int, limit: int = 100, db: Session = Depends(get_db)):
    rows = db.query(PaymentTransaction).filter(
        PaymentTransaction.company_unique_id == company_id
    ).order_by(PaymentTransaction.created_at.desc()).limit(limit).all()
    return [PaymentTransactionResponse.from_orm_safe(r) for r in rows]
