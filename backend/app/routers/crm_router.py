
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from decimal import Decimal
from datetime import date, datetime
from app.database import SessionLocal
from app.models.crm_models import CrmCustomer, PromoCode, PromoUsage, CrmFeedback, CrmReservation, SmsSettings, CustomerCreditLog
from app.models.company_model import Company

router = APIRouter(prefix="/crm", tags=["CRM"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def to_str(val):
    if val is None: return None
    if isinstance(val, (datetime,)): return val.isoformat()
    if isinstance(val, date): return val.isoformat()
    return str(val)


# ─────────────────── SMS SETTINGS ───────────────────

class SmsSettingsIn(BaseModel):
    provider:          Optional[str] = 'twilio'
    account_sid:       Optional[str] = None
    auth_token:        Optional[str] = None
    from_number:       Optional[str] = None
    whatsapp_enabled:  Optional[bool] = False
    sms_enabled:       Optional[bool] = False
    template_bill:     Optional[str] = None
    template_promo:    Optional[str] = None
    template_birthday: Optional[str] = None

@router.get("/sms-settings/{company_id}")
def get_sms_settings(company_id: int, db: Session = Depends(get_db)):
    s = db.query(SmsSettings).filter(SmsSettings.company_unique_id == company_id).first()
    if not s: raise HTTPException(404, "Not found")
    return { "id": s.id, "company_unique_id": s.company_unique_id, "provider": s.provider,
             "account_sid": s.account_sid, "from_number": s.from_number,
             "whatsapp_enabled": s.whatsapp_enabled, "sms_enabled": s.sms_enabled,
             "template_bill": s.template_bill, "template_promo": s.template_promo,
             "template_birthday": s.template_birthday }

@router.put("/sms-settings/{company_id}")
def upsert_sms_settings(company_id: int, data: SmsSettingsIn, db: Session = Depends(get_db)):
    s = db.query(SmsSettings).filter(SmsSettings.company_unique_id == company_id).first()
    if s:
        for k, v in data.model_dump(exclude_none=True).items(): setattr(s, k, v)
    else:
        s = SmsSettings(company_unique_id=company_id, **data.model_dump(exclude_none=True))
        db.add(s)
    # Also update company flags
    company = db.query(Company).filter(Company.company_unique_id == company_id).first()
    if company:
        company.is_sms_enabled   = data.sms_enabled or False
        company.whatsapp_enabled = data.whatsapp_enabled or False
    db.commit()
    db.refresh(s)
    return {"message": "SMS settings saved", "whatsapp_enabled": s.whatsapp_enabled}


# ─────────────────── WHATSAPP SEND ───────────────────

class WhatsAppSendIn(BaseModel):
    company_id  : int
    to_phone    : str
    message     : str
    order_id    : Optional[int] = None
    order_number: Optional[str] = None
    bill_id     : Optional[int] = None
    bill_number : Optional[str] = None
    message_type: Optional[str] = 'bill'   # 'bill' | 'payment_request' | 'receipt'
    sent_by     : Optional[int] = None

@router.post("/whatsapp/send")
def send_whatsapp(data: WhatsAppSendIn, db: Session = Depends(get_db)):
    """Send a WhatsApp message via Twilio on behalf of a company."""
    s = db.query(SmsSettings).filter(
        SmsSettings.company_unique_id == data.company_id,
        SmsSettings.whatsapp_enabled == True
    ).first()
    if not s:
        raise HTTPException(400, "WhatsApp not enabled or settings not found")
    if not s.account_sid or not s.auth_token or not s.from_number:
        raise HTTPException(400, "Twilio credentials not configured")

    try:
        from twilio.rest import Client
        client = Client(s.account_sid, s.auth_token)

        # Normalise phone — add India country code if 10 digits
        clean = ''.join(filter(str.isdigit, data.to_phone))
        if len(clean) == 10:
            clean = '91' + clean

        from_wa = s.from_number if s.from_number.startswith('whatsapp:') else f'whatsapp:{s.from_number}'
        to_wa   = f'whatsapp:+{clean}'

        message = client.messages.create(
            from_=from_wa,
            to=to_wa,
            body=data.message
        )
        # ── Log WhatsApp message ──────────────────────────────────────────
        try:
            from app.models.whatsapp_log_model import WhatsAppLog
            log = WhatsAppLog(
                company_unique_id = data.company_id,
                order_id          = data.order_id,
                order_number      = data.order_number,
                bill_id           = data.bill_id,
                bill_number       = data.bill_number,
                recipient_phone   = data.to_phone,
                message_type      = data.message_type or 'bill',
                message_sid       = message.sid,
                status            = message.status or 'sent',
                sent_by           = data.sent_by,
            )
            db.add(log)
            db.commit()
        except Exception as log_err:
            print(f"WhatsApp log error (non-fatal): {log_err}")
        # ─────────────────────────────────────────────────────────────────
        return {"success": True, "sid": message.sid, "status": message.status}

    except Exception as e:
        raise HTTPException(500, f"WhatsApp send failed: {str(e)}")


# ─────────────────── CUSTOMERS ───────────────────

class CustomerIn(BaseModel):
    name:             str
    phone:            Optional[str] = None
    email:            Optional[str] = None
    date_of_birth:    Optional[str] = None
    anniversary_date: Optional[str] = None
    address:          Optional[str] = None
    notes:            Optional[str] = None
    due_amount:       Optional[Decimal] = None

def customer_to_dict(c):
    return {
        "customer_id": c.customer_id, "company_unique_id": c.company_unique_id,
        "name": c.name, "phone": c.phone, "email": c.email,
        "date_of_birth": to_str(c.date_of_birth), "anniversary_date": to_str(c.anniversary_date),
        "address": c.address, "notes": c.notes, "total_visits": c.total_visits,
        "total_spend": str(c.total_spend), "loyalty_points": c.loyalty_points,
        "due_amount": str(c.due_amount or 0),
        "is_active": c.is_active, "created_at": to_str(c.created_at),
    }

@router.get("/customers/{company_id}")
def get_customers(company_id: int, search: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(CrmCustomer).filter(CrmCustomer.company_unique_id == company_id, CrmCustomer.is_active == True)
    if search:
        q = q.filter((CrmCustomer.name.ilike(f'%{search}%')) | (CrmCustomer.phone.ilike(f'%{search}%')))
    return [customer_to_dict(c) for c in q.order_by(CrmCustomer.name).all()]

@router.get("/customer/phone/{company_id}/{phone}")
def lookup_by_phone(company_id: int, phone: str, db: Session = Depends(get_db)):
    c = db.query(CrmCustomer).filter(CrmCustomer.company_unique_id == company_id, CrmCustomer.phone == phone).first()
    if not c: raise HTTPException(404, "Customer not found")
    return customer_to_dict(c)

@router.post("/customers/{company_id}")
def create_customer(company_id: int, data: CustomerIn, db: Session = Depends(get_db)):
    c = CrmCustomer(company_unique_id=company_id, **{
        k: (date.fromisoformat(v) if v and k in ('date_of_birth','anniversary_date') else v)
        for k, v in data.model_dump().items()
    })
    db.add(c)
    db.commit()
    db.refresh(c)
    return customer_to_dict(c)

@router.put("/customers/{customer_id}")
def update_customer(customer_id: int, data: CustomerIn, db: Session = Depends(get_db)):
    c = db.query(CrmCustomer).filter(CrmCustomer.customer_id == customer_id).first()
    if not c: raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(c, k, date.fromisoformat(v) if v and k in ('date_of_birth','anniversary_date') else v)
    db.commit()
    return customer_to_dict(c)

@router.delete("/customers/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    c = db.query(CrmCustomer).filter(CrmCustomer.customer_id == customer_id).first()
    if not c: raise HTTPException(404, "Not found")
    c.is_active = False
    db.commit()
    return {"message": "Customer deactivated"}


# ─────────────────── CUSTOMER CREDIT LOG ───────────────────

class CreditLogIn(BaseModel):
    customer_id:   int
    order_id:      Optional[int] = None
    order_number:  Optional[str] = None
    bill_id:       Optional[int] = None
    bill_number:   Optional[str] = None
    amount:        Decimal          # positive = credit added, negative = payment received
    payment_status: str = 'credit'  # 'credit' | 'paid'
    notes:         Optional[str] = None

@router.post("/customers/{company_id}/credit-log")
def add_credit_log(company_id: int, data: CreditLogIn, db: Session = Depends(get_db)):
    """Add a credit/payment log entry and update customer's due_amount."""
    c = db.query(CrmCustomer).filter(CrmCustomer.customer_id == data.customer_id,
                                      CrmCustomer.company_unique_id == company_id).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    log = CustomerCreditLog(
        company_unique_id = company_id,
        customer_id       = data.customer_id,
        order_id          = data.order_id,
        order_number      = data.order_number,
        bill_id           = data.bill_id,
        bill_number       = data.bill_number,
        amount            = data.amount,
        payment_status    = data.payment_status,
        notes             = data.notes,
    )
    db.add(log)
    # Update customer's running due amount
    current_due = float(c.due_amount or 0)
    c.due_amount = round(current_due + float(data.amount), 2)
    db.commit()
    db.refresh(log)
    return {"log_id": log.log_id, "due_amount": str(c.due_amount)}

@router.get("/customers/{company_id}/{customer_id}/credit-log")
def get_credit_log(company_id: int, customer_id: int, db: Session = Depends(get_db)):
    """Get credit log for a customer."""
    logs = db.query(CustomerCreditLog).filter(
        CustomerCreditLog.company_unique_id == company_id,
        CustomerCreditLog.customer_id == customer_id,
    ).order_by(CustomerCreditLog.created_at.desc()).all()
    return [{
        "log_id":         l.log_id,
        "order_id":       l.order_id,
        "order_number":   l.order_number,
        "bill_id":        l.bill_id,
        "bill_number":    l.bill_number,
        "amount":         str(l.amount),
        "payment_status": l.payment_status,
        "notes":          l.notes,
        "created_at":     to_str(l.created_at),
    } for l in logs]

@router.put("/customers/{company_id}/due/{customer_id}")
def update_customer_due(company_id: int, customer_id: int, data: dict, db: Session = Depends(get_db)):
    """Directly update a customer's due amount (manual adjustment)."""
    c = db.query(CrmCustomer).filter(CrmCustomer.customer_id == customer_id,
                                      CrmCustomer.company_unique_id == company_id).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    c.due_amount = round(float(data.get("due_amount", 0)), 2)
    db.commit()
    return customer_to_dict(c)


# ─────────────────── PROMO CODES ───────────────────

class PromoIn(BaseModel):
    code:             str
    description:      Optional[str] = None
    discount_type:    str = 'percent'
    discount_value:   Decimal
    min_bill_amount:  Optional[Decimal] = Decimal('0')
    max_discount:     Optional[Decimal] = None
    valid_from:       Optional[str] = None
    valid_till:       Optional[str] = None
    max_uses:         Optional[int] = None
    trigger_type:     str = 'manual'
    is_active:        bool = True

def promo_to_dict(p):
    return {
        "promo_id": p.promo_id, "company_unique_id": p.company_unique_id,
        "code": p.code, "description": p.description, "discount_type": p.discount_type,
        "discount_value": str(p.discount_value), "min_bill_amount": str(p.min_bill_amount or 0),
        "max_discount": str(p.max_discount) if p.max_discount else None,
        "valid_from": to_str(p.valid_from), "valid_till": to_str(p.valid_till),
        "max_uses": p.max_uses, "used_count": p.used_count,
        "trigger_type": p.trigger_type, "is_active": p.is_active,
        "created_at": to_str(p.created_at),
    }

@router.post("/promos/validate")
def validate_promo(company_id: int, code: str, bill_amount: float, db: Session = Depends(get_db)):
    p = db.query(PromoCode).filter(PromoCode.company_unique_id == company_id, PromoCode.code == code.upper(), PromoCode.is_active == True).first()
    if not p: raise HTTPException(404, "Invalid promo code")
    today = date.today()
    if p.valid_from and today < p.valid_from: raise HTTPException(400, "Promo not yet active")
    if p.valid_till and today > p.valid_till: raise HTTPException(400, "Promo expired")
    if p.max_uses and p.used_count >= p.max_uses: raise HTTPException(400, "Promo usage limit reached")
    bill_amt = Decimal(str(bill_amount))
    if bill_amt < (p.min_bill_amount or 0): raise HTTPException(400, f"Minimum bill amount ₹{p.min_bill_amount} required")
    discount = (bill_amt * p.discount_value / 100) if p.discount_type == 'percent' else p.discount_value
    if p.max_discount: discount = min(discount, p.max_discount)
    return {"valid": True, "promo_id": p.promo_id, "code": p.code, "discount_type": p.discount_type,
            "discount_value": str(p.discount_value), "discount_amount": str(discount), "description": p.description}

@router.post("/promos/use")
def use_promo(promo_id: int, company_id: int, discount_applied: Decimal,
              customer_id: Optional[int] = None, order_id: Optional[int] = None,
              bill_id: Optional[int] = None, bill_number: Optional[str] = None,
              db: Session = Depends(get_db)):
    p = db.query(PromoCode).filter(PromoCode.promo_id == promo_id).first()
    if not p: raise HTTPException(404, "Not found")
    p.used_count = (p.used_count or 0) + 1
    usage = PromoUsage(promo_id=promo_id, company_unique_id=company_id, customer_id=customer_id,
                       order_id=order_id, bill_id=bill_id, bill_number=bill_number, discount_applied=discount_applied)
    db.add(usage)
    db.commit()
    return {"message": "Promo used", "used_count": p.used_count}

@router.get("/promos/{company_id}")
def get_promos(company_id: int, db: Session = Depends(get_db)):
    return [promo_to_dict(p) for p in db.query(PromoCode).filter(PromoCode.company_unique_id == company_id).order_by(PromoCode.created_at.desc()).all()]

@router.post("/promos/{company_id}")
def create_promo(company_id: int, data: PromoIn, db: Session = Depends(get_db)):
    p = PromoCode(company_unique_id=company_id, **{
        k: (date.fromisoformat(v) if v and k in ('valid_from','valid_till') else v)
        for k, v in data.model_dump().items()
    })
    db.add(p)
    db.commit()
    db.refresh(p)
    return promo_to_dict(p)

@router.put("/promos/{promo_id}")
def update_promo(promo_id: int, data: PromoIn, db: Session = Depends(get_db)):
    p = db.query(PromoCode).filter(PromoCode.promo_id == promo_id).first()
    if not p: raise HTTPException(404, "Not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(p, k, date.fromisoformat(v) if v and k in ('valid_from','valid_till') else v)
    db.commit()
    return promo_to_dict(p)


# ─────────────────── RAZORPAY PAYMENT LINK ───────────────────

class PaymentLinkIn(BaseModel):
    company_id:    int
    amount:        float
    customer_name: Optional[str] = None
    customer_phone:Optional[str] = None
    order_number:  Optional[str] = None
    description:   Optional[str] = None

@router.post("/payment-link/create")
def create_payment_link(data: PaymentLinkIn, db: Session = Depends(get_db)):
    """Create a Razorpay Payment Link and return the short URL."""
    from app.models.company_model import MerchantSettings
    import requests, base64

    merchant = db.query(MerchantSettings).filter(
        MerchantSettings.company_unique_id == data.company_id
    ).first()
    if not merchant or not merchant.razorpay_key_id or not merchant.razorpay_key_secret:
        raise HTTPException(400, "Razorpay credentials not configured")

    auth = base64.b64encode(
        f"{merchant.razorpay_key_id}:{merchant.razorpay_key_secret}".encode()
    ).decode()

    # Clean phone — add country code
    phone = (data.customer_phone or '').replace('+', '').replace(' ', '').replace('-', '')
    if len(phone) == 10:
        phone = '91' + phone

    payload = {
        "amount":      int(round(data.amount * 100)),  # paise
        "currency":    "INR",
        "description": data.description or f"Order #{data.order_number or ''}",
        "customer": {
            "name":    data.customer_name or "Customer",
            "contact": f"+{phone}" if phone else "",
        },
        "notify": { "sms": False, "email": False },  # we send via WhatsApp
        "reminder_enable": False,
        "options": {
            "checkout": {
                "name": merchant.merchant_name or "Restaurant",
            }
        }
    }

    try:
        resp = requests.post(
            "https://api.razorpay.com/v1/payment_links",
            json=payload,
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type":  "application/json",
            },
            timeout=10
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(500, f"Razorpay error: {resp.text}")
        result = resp.json()
        return {
            "payment_link_id": result.get("id"),
            "short_url":       result.get("short_url"),
            "status":          result.get("status"),
        }
    except requests.RequestException as e:
        raise HTTPException(500, f"Network error: {str(e)}")


@router.get("/payment-link/{link_id}/status")
def check_payment_link_status(link_id: str, company_id: int, db: Session = Depends(get_db)):
    """Poll Razorpay Payment Link status — returns paid/created/cancelled."""
    from app.models.company_model import MerchantSettings
    import requests, base64

    merchant = db.query(MerchantSettings).filter(
        MerchantSettings.company_unique_id == company_id
    ).first()
    if not merchant or not merchant.razorpay_key_id or not merchant.razorpay_key_secret:
        raise HTTPException(400, "Razorpay credentials not configured")

    auth = base64.b64encode(
        f"{merchant.razorpay_key_id}:{merchant.razorpay_key_secret}".encode()
    ).decode()

    try:
        resp = requests.get(
            f"https://api.razorpay.com/v1/payment_links/{link_id}",
            headers={"Authorization": f"Basic {auth}"},
            timeout=10
        )
        if resp.status_code != 200:
            raise HTTPException(500, f"Razorpay error: {resp.text}")
        result = resp.json()
        return {
            "payment_link_id": result.get("id"),
            "status":          result.get("status"),   # created | paid | cancelled | expired
            "amount_paid":     result.get("amount_paid", 0) / 100,
            "payments":        result.get("payments", []),
        }
    except requests.RequestException as e:
        raise HTTPException(500, f"Network error: {str(e)}")
