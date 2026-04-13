from sqlalchemy import Column, String, Boolean, BigInteger, Integer, Text, TIMESTAMP, Numeric, ForeignKey, Identity
from sqlalchemy.sql import func
from app.database import Base

class FoodMenu(Base):

    __tablename__ = "foodmenu"

    food_menu_id = Column("foodmenuid", BigInteger, Identity(), primary_key=True)

    company_unique_id = Column(
        "companyuniqueid", BigInteger,
        ForeignKey("company.company_unique_id", ondelete="RESTRICT"),
        nullable=False
    )

    category_id = Column(
        "categoryid", BigInteger,
        ForeignKey("foodcategory.foodcategoryid", ondelete="RESTRICT"),
        nullable=False
    )

    code          = Column("code",         String(50),     nullable=False, unique=True)
    name          = Column("name",         String(200),    nullable=False)
    description   = Column("description",  Text)
    sale_price    = Column("saleprice",    Numeric(12, 2), default=0,     nullable=False)
    image_url     = Column("imageurl",     String(500))
    display_order = Column("displayorder", Integer,        default=0,     nullable=False)
    IsActive      = Column("isactive",     Boolean,        default=True,  nullable=False)

    created_date  = Column("createdat",  TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    created_by    = Column("createdby",  BigInteger)
    modified_date = Column("updatedat",  TIMESTAMP(timezone=True))
    modified_by   = Column("updatedby",  BigInteger)
    is_available  = Column("isavailable",  Boolean,        default=True,  nullable=False)