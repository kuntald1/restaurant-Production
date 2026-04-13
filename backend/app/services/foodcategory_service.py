from sqlalchemy.orm import Session
from datetime import datetime
from app.models.companyfoodcategory_model import FoodCategory


def create_companyfoodcategory(db: Session, foodcategory):
    db_food_category = FoodCategory(**foodcategory.dict())
    db.add(db_food_category)
    db.commit()
    db.refresh(db_food_category)
    return db_food_category


def update_companyfoodcategory(db: Session, foodcategory_id: int, foodcategory):
    db_food_category = db.query(FoodCategory).filter(
        FoodCategory.food_category_id == foodcategory_id,
        FoodCategory.is_active == True,
        FoodCategory.is_deleted == False
    ).first()
    if not db_food_category:
        return None
    update_data = foodcategory.dict(exclude_unset=True)  # ✅ Pydantic object, not SQLAlchemy model
    for key, value in update_data.items():
        setattr(db_food_category, key, value)
    db_food_category.modified_date = datetime.utcnow()
    db.commit()
    db.refresh(db_food_category)
    return db_food_category



def deactivate_companyfoodcategory(db: Session, foodcategory_id: int):
    db_food_category = db.query(FoodCategory).filter(
        FoodCategory.food_category_id == foodcategory_id,
        FoodCategory.is_active == True,
        FoodCategory.is_deleted == False
    ).first()
    if not db_food_category:
        return None
    db_food_category.is_active = False
    db_food_category.is_deleted = True
    db_food_category.modified_date = datetime.utcnow()
    db.commit()
    db.refresh(db_food_category)
    return db_food_category

def get_companyfoodcategory(db: Session, foodcategory_id: int):
    db_food_category = db.query(FoodCategory).filter(
        FoodCategory.food_category_id == foodcategory_id,
        FoodCategory.is_active == True,
        FoodCategory.is_deleted == False
    ).first()
    if not db_food_category:
        return None
    return db_food_category

def get_allfoodcategory(db: Session, company_id: int):
    db_food_category = db.query(FoodCategory).filter(
        FoodCategory.company_unique_id == company_id,
        FoodCategory.is_active == True,
        FoodCategory.is_deleted == False
    ).order_by(FoodCategory.display_order).all()
    if not db_food_category:
        return None
    return db_food_category