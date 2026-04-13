from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Text
from datetime import datetime
from app.database import Base


class UserRole(Base):
    __tablename__ = "userrole"

    userrole_id       = Column("userroleid",        BigInteger,    primary_key=True, index=True, autoincrement=True)
    company_unique_id = Column("company_unique_id", BigInteger,    nullable=False)
    role_name         = Column("rolename",          String(100),   nullable=False)
    description       = Column("description",       Text,          nullable=True)
    is_active         = Column("isactive",          Boolean,       default=True, nullable=False)

    # Audit
    created_at        = Column("created_at",        DateTime,      default=datetime.utcnow, nullable=False)
    created_by        = Column("created_by",        String(200),   nullable=True)
    updated_at        = Column("updated_at",        DateTime,      nullable=True)
    updated_by        = Column("updated_by",        String(200),   nullable=True)