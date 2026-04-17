from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class WhatsAppLogCreate(BaseModel):
    company_unique_id : int
    order_id          : Optional[int] = None
    order_number      : Optional[str] = None
    bill_id           : Optional[int] = None
    bill_number       : Optional[str] = None
    recipient_phone   : Optional[str] = None
    message_type      : str           # 'bill' | 'payment_request' | 'receipt'
    message_sid       : Optional[str] = None
    status            : Optional[str] = 'sent'
    error_message     : Optional[str] = None
    sent_by           : Optional[int] = None

class WhatsAppLogResponse(BaseModel):
    id                : int
    company_unique_id : int
    order_id          : Optional[int]
    order_number      : Optional[str]
    bill_id           : Optional[int]
    bill_number       : Optional[str]
    recipient_phone   : Optional[str]
    message_type      : str
    message_sid       : Optional[str]
    status            : str
    error_message     : Optional[str]
    sent_at           : datetime
    sent_by           : Optional[int]

    class Config:
        from_attributes = True
