from sqlalchemy import Column, String, Boolean, BigInteger, Integer, Text, TIMESTAMP, ForeignKey, Identity
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base


class FoodCategory(Base):
 
    __tablename__ = "foodcategory"
 
    food_category_id = Column("foodcategoryid", BigInteger, Identity(), primary_key=True)
 
    company_unique_id = Column(
        "companyuniqueid", BigInteger,
        ForeignKey("company.company_unique_id", ondelete="RESTRICT"),
        nullable=False
    )
 
    category_name        = Column("categoryname", String(150), nullable=False)
    category_description = Column("categorydescription", Text)
    category_code        = Column("categorycode", String(50))
    display_order        = Column("displayorder", Integer, default=0, nullable=False)
    icon_url             = Column("iconurl", String(500))
    color_code           = Column("colorcode", String(10))
    is_active            = Column("isactive", Boolean, default=True, nullable=False)
    is_deleted           = Column("isdeleted", Boolean, default=False, nullable=False)
 
    created_date  = Column("createdat", TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    created_by    = Column("createdby", BigInteger)
    modified_date = Column("updatedat", TIMESTAMP(timezone=True))
    modified_by   = Column("updatedby", BigInteger)