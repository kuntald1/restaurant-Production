from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.whatsapp_log_model import WhatsAppLog
from app.schemas.whatsapp_log_schema import WhatsAppLogCreate

# ── Create a log entry (call this every time you send WhatsApp) ──────────────
def log_whatsapp(db: Session, data: WhatsAppLogCreate) -> WhatsAppLog:
    entry = WhatsAppLog(**data.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry

# ── Get logs for a single company ────────────────────────────────────────────
def get_logs_by_company(db: Session, company_id: int, skip: int = 0, limit: int = 200):
    return (
        db.query(WhatsAppLog)
        .filter(WhatsAppLog.company_unique_id == company_id)
        .order_by(WhatsAppLog.sent_at.desc())
        .offset(skip).limit(limit)
        .all()
    )

# ── Get logs for company + all child branches ────────────────────────────────
def get_logs_by_company_and_children(db: Session, company_id: int, child_ids: list[int],
                                      skip: int = 0, limit: int = 500):
    all_ids = [company_id] + child_ids
    return (
        db.query(WhatsAppLog)
        .filter(WhatsAppLog.company_unique_id.in_(all_ids))
        .order_by(WhatsAppLog.sent_at.desc())
        .offset(skip).limit(limit)
        .all()
    )

# ── Get ALL logs (Super Admin) ────────────────────────────────────────────────
def get_all_logs(db: Session, skip: int = 0, limit: int = 1000):
    return (
        db.query(WhatsAppLog)
        .order_by(WhatsAppLog.sent_at.desc())
        .offset(skip).limit(limit)
        .all()
    )

# ── Summary counts per company ────────────────────────────────────────────────
def get_summary_by_company(db: Session):
    return (
        db.query(
            WhatsAppLog.company_unique_id,
            func.count(WhatsAppLog.id).label("total"),
            func.sum(func.cast(WhatsAppLog.status == 'sent', db.bind.dialect.Integer if hasattr(db.bind,'dialect') else int)).label("sent"),
        )
        .group_by(WhatsAppLog.company_unique_id)
        .all()
    )
