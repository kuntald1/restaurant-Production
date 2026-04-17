from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime, timedelta
from app.database import get_db
from app.models.company_model import Company
import json

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])

# ── Helpers ───────────────────────────────────────────────────────────────────
def get_company_children(db, parent_id):
    return db.execute(
        text("SELECT company_unique_id, name FROM company WHERE parant_company_unique_id = :pid"),
        {"pid": parent_id}
    ).fetchall()

def get_active_subscription(db, company_id):
    """Get active subscription for a branch"""
    rows = db.execute(text("""
        SELECT id, plan_name, billing_cycle, branch_ids, start_date, end_date, status
        FROM subscriptions
        WHERE status = 'active'
          AND end_date >= CURRENT_DATE
          AND branch_ids::text LIKE :cid
        ORDER BY end_date DESC LIMIT 1
    """), {"cid": f"%{company_id}%"}).fetchone()
    return rows

# ── Schemas ───────────────────────────────────────────────────────────────────
class SubscriptionCreate(BaseModel):
    parent_company_id : int
    plan_name         : str           # 'Basic' | 'Pro'
    billing_cycle     : str           # 'monthly' | 'yearly'
    branch_ids        : List[int]
    payment_ref       : Optional[str] = None
    notes             : Optional[str] = None
    created_by        : Optional[int] = None

class SubscriptionActivate(BaseModel):
    subscription_id  : int
    activated_by     : int
    payment_ref      : Optional[str] = None

# ── Plans list ────────────────────────────────────────────────────────────────
@router.get("/plans")
def get_plans(db: Session = Depends(get_db)):
    rows = db.execute(text(
        "SELECT id, plan_name, max_branches, price_monthly, price_yearly, features "
        "FROM subscription_plans WHERE is_active = TRUE ORDER BY plan_name, max_branches"
    )).fetchall()
    return [dict(r._mapping) for r in rows]

# ── Get all subscriptions (SuperAdmin) ────────────────────────────────────────
@router.get("/getall")
def get_all(db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT s.*, c.name as company_name
        FROM subscriptions s
        LEFT JOIN company c ON c.company_unique_id = s.parent_company_id
        ORDER BY s.created_at DESC
    """)).fetchall()
    return [dict(r._mapping) for r in rows]

# ── Get subscriptions for a parent company (Admin) ────────────────────────────
@router.get("/getbycompany/{parent_company_id}")
def get_by_company(parent_company_id: int, db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT * FROM subscriptions
        WHERE parent_company_id = :pid
        ORDER BY created_at DESC
    """), {"pid": parent_company_id}).fetchall()
    return [dict(r._mapping) for r in rows]

# ── Check branch validity before subscribing ─────────────────────────────────
@router.post("/checkvalidity")
def check_validity(branch_ids: List[int], db: Session = Depends(get_db)):
    warnings = []
    for cid in branch_ids:
        row = db.execute(text("""
            SELECT plan_name, end_date FROM subscriptions
            WHERE status = 'active' AND end_date >= CURRENT_DATE
              AND branch_ids::text LIKE :cid
            ORDER BY end_date DESC LIMIT 1
        """), {"cid": f"%{cid}%"}).fetchone()
        if row:
            company = db.execute(
                text("SELECT name FROM company WHERE company_unique_id = :cid"),
                {"cid": cid}
            ).fetchone()
            name = company.name if company else f"Company {cid}"
            warnings.append({
                "company_id": cid,
                "company_name": name,
                "active_plan": row.plan_name,
                "expires": str(row.end_date),
                "message": f"'{name}' validity still not expired (expires {row.end_date}). New subscription will activate after previous plan expires."
            })
    return {"warnings": warnings}

# ── Create subscription (Admin submits, pending payment) ─────────────────────
@router.post("/create")
def create_subscription(data: SubscriptionCreate, db: Session = Depends(get_db)):
    branch_count = len(data.branch_ids)

    # Validate branch count vs plan
    plan = db.execute(text("""
        SELECT id, price_monthly, price_yearly, max_branches
        FROM subscription_plans
        WHERE plan_name = :pname AND max_branches = :bc AND is_active = TRUE
    """), {"pname": data.plan_name, "bc": branch_count}).fetchone()

    if not plan:
        # Find nearest valid plan
        valid = db.execute(text("""
            SELECT max_branches FROM subscription_plans
            WHERE plan_name = :pname AND is_active = TRUE
            ORDER BY max_branches
        """), {"pname": data.plan_name}).fetchall()
        valid_counts = [r.max_branches for r in valid]
        raise HTTPException(400,
            f"No '{data.plan_name}' plan for {branch_count} branches. "
            f"Available branch counts: {valid_counts}"
        )

    # Calculate amount and dates
    amount = plan.price_monthly if data.billing_cycle == 'monthly' else plan.price_yearly
    start  = date.today()
    if data.billing_cycle == 'monthly':
        end = date(start.year + (start.month // 12), (start.month % 12) + 1, start.day) \
              if start.month < 12 else date(start.year + 1, 1, start.day)
    else:
        end = date(start.year + 1, start.month, start.day)

    # Check if any branch already has active subscription — get warnings but still allow
    result = db.execute(text("""
        INSERT INTO subscriptions
            (parent_company_id, plan_id, plan_name, billing_cycle, branch_ids,
             branch_count, amount_paid, start_date, end_date, status, payment_ref, created_by, notes)
        VALUES
            (:pcid, :pid, :pname, :bcycle, :bids,
             :bc, :amount, :start, :end, 'pending', :pref, :created_by, :notes)
        RETURNING id
    """), {
        "pcid": data.parent_company_id,
        "pid":  plan.id,
        "pname": data.plan_name,
        "bcycle": data.billing_cycle,
        "bids": json.dumps(data.branch_ids),
        "bc": branch_count,
        "amount": amount,
        "start": start,
        "end": end,
        "pref": data.payment_ref,
        "created_by": data.created_by,
        "notes": data.notes,
    })
    db.commit()
    sub_id = result.fetchone()[0]
    return {
        "id": sub_id,
        "amount": amount,
        "start_date": str(start),
        "end_date": str(end),
        "status": "pending",
        "message": f"Subscription created. Amount: ₹{amount}. Please complete payment and submit reference."
    }

# ── Update payment ref (Admin adds UPI ref after paying) ─────────────────────
@router.patch("/updatepayment/{sub_id}")
def update_payment(sub_id: int, payment_ref: str, db: Session = Depends(get_db)):
    db.execute(text("""
        UPDATE subscriptions SET payment_ref = :ref WHERE id = :id
    """), {"ref": payment_ref, "id": sub_id})
    db.commit()
    return {"message": "Payment reference updated"}

# ── Activate subscription (SuperAdmin) ───────────────────────────────────────
@router.patch("/activate/{sub_id}")
def activate(sub_id: int, data: SubscriptionActivate, db: Session = Depends(get_db)):
    db.execute(text("""
        UPDATE subscriptions
        SET status = 'active', activated_by = :ab, activated_at = NOW(),
            payment_ref = COALESCE(:pref, payment_ref)
        WHERE id = :id
    """), {"ab": data.activated_by, "pref": data.payment_ref, "id": sub_id})
    db.commit()
    return {"message": "Subscription activated successfully"}

# ── Expire/cancel (SuperAdmin) ────────────────────────────────────────────────
@router.patch("/cancel/{sub_id}")
def cancel(sub_id: int, db: Session = Depends(get_db)):
    db.execute(text("UPDATE subscriptions SET status = 'cancelled' WHERE id = :id"), {"id": sub_id})
    db.commit()
    return {"message": "Subscription cancelled"}

# ── Expiry warnings — branches expiring in 3 days ────────────────────────────
@router.get("/expirywarnings/{company_id}")
def expiry_warnings(company_id: int, is_super_admin: bool = Query(False), db: Session = Depends(get_db)):
    warning_date = date.today() + timedelta(days=3)
    if is_super_admin:
        rows = db.execute(text("""
            SELECT s.id, s.plan_name, s.end_date, s.branch_ids, c.name as company_name
            FROM subscriptions s
            LEFT JOIN company c ON c.company_unique_id = s.parent_company_id
            WHERE s.status = 'active'
              AND s.end_date BETWEEN CURRENT_DATE AND :wd
            ORDER BY s.end_date
        """), {"wd": warning_date}).fetchall()
    else:
        rows = db.execute(text("""
            SELECT s.id, s.plan_name, s.end_date, s.branch_ids, c.name as company_name
            FROM subscriptions s
            LEFT JOIN company c ON c.company_unique_id = s.parent_company_id
            WHERE s.status = 'active'
              AND s.parent_company_id = :cid
              AND s.end_date BETWEEN CURRENT_DATE AND :wd
            ORDER BY s.end_date
        """), {"cid": company_id, "wd": warning_date}).fetchall()

    return [dict(r._mapping) for r in rows]
