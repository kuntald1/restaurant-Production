import uuid
from sqlalchemy import (
    Boolean, Column, ForeignKey,
    Integer, String
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import TIMESTAMP
from app.database import Base


class Menu(Base):
    __tablename__ = "menu"

    menuid          = Column(Integer, primary_key=True, autoincrement=True)
    menuname        = Column(String(100), nullable=False)
    menudesc        = Column(String(255))
    menuurl         = Column(String(255))
    menuicon        = Column(String(100))
    sortorder       = Column(Integer, default=0, nullable=False)
    isactive        = Column(Boolean, default=True, nullable=False)
    createdat       = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    updatedat       = Column(TIMESTAMP)

    companyuniqueid = Column(
        Integer,
        ForeignKey("company.company_unique_id", ondelete="SET NULL")
    )

    parentmenuid    = Column(
        Integer,
        ForeignKey("menu.menuid", ondelete="SET NULL")
    )

    # Self-referential relationship
    children = relationship(
        "Menu",
        foreign_keys=[parentmenuid],
        remote_side=[menuid],
        lazy="selectin"
    )