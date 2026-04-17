from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from app.database import Base

class ContactLead(Base):
    __tablename__ = "contact_leads"

    id             = Column(Integer, primary_key=True, index=True)
    first_name     = Column(String(100), nullable=False)
    last_name      = Column(String(100), nullable=True)
    restaurant_name= Column(String(200), nullable=False)
    phone          = Column(String(20), nullable=False)
    email          = Column(String(200), nullable=True)
    city           = Column(String(100), nullable=True)
    branches       = Column(String(50), nullable=True)   # "1 branch", "2-5 branches" etc
    interest       = Column(String(100), nullable=True)  # "Schedule a Demo" etc
    message        = Column(Text, nullable=True)
    is_contacted   = Column(Boolean, default=False)      # for superadmin follow-up tracking
    contacted_note = Column(Text, nullable=True)
    submitted_at   = Column(DateTime(timezone=True), server_default=func.now())
