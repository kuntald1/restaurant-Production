from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Numeric, Date, Text
from datetime import datetime
from app.database import Base


class User(Base):
    __tablename__ = "users"

    user_id               = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    company_unique_id     = Column(BigInteger, nullable=True)
    first_name            = Column(String(500), nullable=False)
    last_name             = Column(String(500), nullable=True)
    phone_number          = Column(String(15), nullable=True)
    email                 = Column(String(200), nullable=True)
    email_2               = Column(String(250), nullable=True)
    address               = Column(Text, nullable=True)
    city                  = Column(String(100), nullable=True)
    state                 = Column(String(100), nullable=True)
    zip_code              = Column(String(50), nullable=True)
    country               = Column(String(100), nullable=True)
    username              = Column(String(50), nullable=False, unique=True)
    password_hash         = Column(String(255), nullable=False)
    image_path            = Column(Text, nullable=True)
    role_id               = Column(BigInteger, nullable=True)
    is_active             = Column(Boolean, default=True, nullable=False)

    # Restaurant-specific
    employment_type       = Column(String(50), nullable=True)   # full-time, part-time
    shift_preference      = Column(String(50), nullable=True)   # morning, evening, night
    hire_date             = Column(Date, nullable=True)
    salary                = Column(Numeric(10, 2), nullable=True)
    emergency_contact_name  = Column(String(200), nullable=True)
    emergency_contact_phone = Column(String(15), nullable=True)
    notes                 = Column(Text, nullable=True)

    # Audit
    created_at            = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by            = Column(String(200), nullable=True)
    updated_at            = Column(DateTime, nullable=True)
    updated_by            = Column(String(200), nullable=True)
    is_super_admin  = Column(Boolean, default=False, nullable=False)
    is_admin        = Column(Boolean, default=False, nullable=False)
