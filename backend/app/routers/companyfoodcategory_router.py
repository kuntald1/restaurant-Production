from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import SessionLocal
from app.schemas.companyfoodcategory_schema import FoodCategoryCreate, FoodCategoryUpdate
from app.services import foodcategory_service


router = APIRouter(
    prefix="/company",
    tags=["company"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Create Food Category
@router.post("/createfoodcategory")
def create_foodcategory(foodcategory: FoodCategoryCreate, db: Session = Depends(get_db)):
    return foodcategory_service.create_companyfoodcategory(db, foodcategory)


# Update Company
@router.put("/updatefoodcategory/{foodcategory_id}")
def update_foodcategory(foodcategory_id: int, foodcategory: FoodCategoryUpdate, db: Session = Depends(get_db)):
    result = foodcategory_service.update_companyfoodcategory(db, foodcategory_id, foodcategory)
    if not result:
        raise HTTPException(status_code=404, detail="Foodcategory not found")
    return result


# Soft Delete foodcategory
@router.delete("/deletefoodcategory/{foodcategory_id}")
def delete_foodcategory(foodcategory_id: int, db: Session = Depends(get_db)):

    result = foodcategory_service.deactivate_companyfoodcategory(db, foodcategory_id)

    if not result:
        raise HTTPException(status_code=404, detail="foodcategory not found")

    return {"message": "Foodcategory deactivated successfully"}


# Get Single foodcategory
@router.get("/getfoodcategory/{foodcategory_id}")
def get_foodcategory(foodcategory_id: int, db: Session = Depends(get_db)):

    result = foodcategory_service.get_companyfoodcategory(db, foodcategory_id)

    if not result:
        raise HTTPException(status_code=404, detail="Foodcategory not found")

    return result


# Get All foodcategory
@router.get("/getallfoodcategory/{company_id}")
def get_all_foodcategory(company_id: int, db: Session = Depends(get_db)):
    result = foodcategory_service.get_allfoodcategory(db, company_id)
    if not result:
        raise HTTPException(status_code=404, detail="Foodcategory not found")
    return result



