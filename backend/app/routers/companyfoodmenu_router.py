from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.schemas.companyfoodmenu_schema import FoodMenuCreate, FoodMenuUpdate
from app.services import foodmenu_service
from app.services.upload_service import upload_image, delete_image
from app.models.companyfoodmenu_model import  FoodMenu


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


# ───────────────────────────── Food Menu CRUD ────────────────────────

@router.post("/createfoodmenu")
def create_foodmenu(foodmenu: FoodMenuCreate, db: Session = Depends(get_db)):
    return foodmenu_service.create_companyfoodmenu(db, foodmenu)


@router.put("/updatefoodmenu/{foodmenu_id}")
def update_foodmenu(foodmenu_id: int, foodmenu: FoodMenuUpdate, db: Session = Depends(get_db)):
    result = foodmenu_service.update_companyfoodmenu(db, foodmenu_id, foodmenu)
    if not result:
        raise HTTPException(status_code=404, detail="Foodmenu not found")
    return result


@router.delete("/deletefoodmenu/{foodmenu_id}")
def delete_foodmenu(foodmenu_id: int, db: Session = Depends(get_db)):
    result = foodmenu_service.deactivate_companyfoodmenu(db, foodmenu_id)
    if not result:
        raise HTTPException(status_code=404, detail="Foodmenu not found")
    return {"message": "Foodmenu deactivated successfully"}


@router.get("/getfoodmenu/{foodmenu_id}")
def get_foodmenu(foodmenu_id: int, db: Session = Depends(get_db)):
    result = foodmenu_service.get_companyfoodmenu(db, foodmenu_id)
    if not result:
        raise HTTPException(status_code=404, detail="Foodmenu not found")
    return result


@router.get("/getallfoodmenu/{company_id}")
def get_all_foodmenu(company_id: int, db: Session = Depends(get_db)):
    result = foodmenu_service.get_allfoodmenu(db, company_id)
    if not result:
        raise HTTPException(status_code=404, detail="Foodmenu not found")
    return result


# ───────────────────────────── Food Menu Image ───────────────────────

@router.post("/foodmenu/{foodmenu_id}/image")
async def upload_foodmenu_image(
    foodmenu_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    menu = db.query(FoodMenu).filter(
        FoodMenu.food_menu_id == foodmenu_id,
        FoodMenu.IsActive == True
    ).first()
    if not menu:
        raise HTTPException(status_code=404, detail="Foodmenu not found")

    if menu.image_url:
        await delete_image(menu.image_url)

    url = await upload_image(file, folder=f"foodmenu/{foodmenu_id}")
    menu.image_url = url
    db.commit()
    return {"image_url": url}


@router.delete("/foodmenu/{foodmenu_id}/image")
async def delete_foodmenu_image(
    foodmenu_id: int,
    db: Session = Depends(get_db)
):
    menu = db.query(FoodMenu).filter(
        FoodMenu.food_menu_id == foodmenu_id,
        FoodMenu.IsActive == True
    ).first()
    if not menu:
        raise HTTPException(status_code=404, detail="Foodmenu not found")

    if not menu.image_url:
        raise HTTPException(status_code=404, detail="No image found for this food menu")

    await delete_image(menu.image_url)
    menu.image_url = None
    db.commit()
    return {"message": "Food menu image deleted successfully"}