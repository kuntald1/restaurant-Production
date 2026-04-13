from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from app.models.companyfoodmenu_model import FoodMenu
from app.schemas.companyfoodmenu_schema import FoodMenuCreate, FoodMenuUpdate


# -------- CREATE FOOD MENU --------
def create_companyfoodmenu(db: Session, payload: FoodMenuCreate):
    new_menu = FoodMenu(
        company_unique_id = payload.company_unique_id,
        category_id       = payload.category_id,
        code              = payload.code,
        name              = payload.name,
        description       = payload.description,
        sale_price        = payload.sale_price,
        image_url         = payload.image_url,
        display_order     = payload.display_order,
        IsActive         = payload.is_active,
        is_available      = payload.is_available,
        created_by        = payload.created_by,
        modified_date     = func.now(),    
        modified_by       = payload.created_by
    )
    db.add(new_menu)
    db.commit()
    db.refresh(new_menu)
    return new_menu


# -------- UPDATE FOOD MENU --------
def update_companyfoodmenu(db: Session, foodmenu_id: int, payload: FoodMenuUpdate):
    menu = get_companyfoodmenu(db, foodmenu_id)
    if not menu:
        return None

    if payload.category_id   is not None: menu.category_id   = payload.category_id
    if payload.code          is not None: menu.code           = payload.code
    if payload.name          is not None: menu.name           = payload.name
    if payload.description   is not None: menu.description    = payload.description
    if payload.sale_price    is not None: menu.sale_price     = payload.sale_price
    if payload.image_url     is not None: menu.image_url      = payload.image_url
    if payload.display_order is not None: menu.display_order  = payload.display_order
    if payload.is_active     is not None: menu.IsActive       = payload.is_active
    if payload.is_available  is not None: menu.is_available   = payload.is_available
    if payload.modified_by   is not None: menu.modified_by    = payload.modified_by

    db.commit()
    db.refresh(menu)
    return menu


# -------- SOFT DELETE FOOD MENU --------
def deactivate_companyfoodmenu(db: Session, foodmenu_id: int):
    menu = get_companyfoodmenu(db, foodmenu_id)
    if not menu:
        return None

    menu.IsActive = False

    db.commit()
    db.refresh(menu)
    return menu


# -------- GET SINGLE FOOD MENU --------
def get_companyfoodmenu(db: Session, foodmenu_id: int):
    return (
        db.query(FoodMenu)
        .filter(
            FoodMenu.food_menu_id == foodmenu_id,
            FoodMenu.IsActive == True
        )
        .first()
    )


# -------- GET ALL FOOD MENUS BY COMPANY --------
def get_allfoodmenu(db: Session, company_id: int):
    return (
        db.query(FoodMenu)
        .filter(
            FoodMenu.company_unique_id == company_id,
            FoodMenu.IsActive == True
        )
        .order_by(FoodMenu.display_order)
        .all()
    )