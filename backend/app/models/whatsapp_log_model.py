from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class WhatsAppLog(Base):
    __tablename__ = "whatsapp_log"

    id                  = Column(Integer, primary_key=True, index=True)
    company_unique_id   = Column(Integer, nullable=False, index=True)
    order_id            = Column(Integer, nullable=True)
    order_number        = Column(String(50), nullable=True)
    bill_id             = Column(Integer, nullable=True)
    bill_number         = Column(String(50), nullable=True)
    recipient_phone     = Column(String(20), nullable=True)
    message_type        = Column(String(50), nullable=False)  # 'bill', 'payment_request', 'receipt'
    message_sid         = Column(String(100), nullable=True)  # Twilio message SID
    status              = Column(String(20), default='sent')  # sent, failed, delivered
    error_message       = Column(Text, nullable=True)
    sent_at             = Column(DateTime(timezone=True), server_default=func.now())
    sent_by             = Column(Integer, nullable=True)      # user_id who triggered
