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

# ── Excel Bulk Upload ─────────────────────────────────────────────────────────

@router.post("/foodmenu/upload-excel/{company_id}")
async def upload_foodmenu_excel(
    company_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Bulk upload food menu items from Excel.
    Expected columns: name, code, category_name, sale_price, is_veg, description, display_order
    Returns: { created, skipped, errors }
    """
    import io
    import pandas as pd
    from app.models.foodcategory_model import FoodCategory

    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(400, "File must be .xlsx, .xls or .csv")

    content = await file.read()
    try:
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Could not parse file: {e}")

    required = {'name', 'sale_price'}
    missing = required - set(df.columns.str.lower().str.strip())
    if missing:
        raise HTTPException(400, f"Missing required columns: {missing}")

    df.columns = df.columns.str.lower().str.strip()

    # Build category lookup (name → id)
    categories = db.query(FoodCategory).filter(
        FoodCategory.company_unique_id == company_id,
        FoodCategory.is_active == True
    ).all()
    cat_map = {c.category_name.lower().strip(): c.food_category_id for c in categories}

    # Existing codes to prevent duplicates
    existing_codes = {
        m.code for m in db.query(FoodMenu.code).filter(
            FoodMenu.company_unique_id == company_id
        ).all() if m.code
    }

    created, skipped, errors = 0, 0, []

    for idx, row in df.iterrows():
        row_num = idx + 2  # Excel row number (1-indexed + header)
        try:
            name = str(row.get('name', '')).strip()
            if not name:
                errors.append(f"Row {row_num}: name is empty")
                continue

            sale_price = float(row.get('sale_price', 0) or 0)
            code = str(row.get('code', '')).strip() if pd.notna(row.get('code', '')) else ''

            if code and code in existing_codes:
                skipped += 1
                continue

            # Auto-generate code if blank
            if not code:
                base = name[:6].upper().replace(' ', '')
                code = base
                counter = 1
                while code in existing_codes:
                    code = f"{base}{counter}"
                    counter += 1

            # Category resolution
            cat_name = str(row.get('category_name', '') or '').lower().strip()
            category_id = cat_map.get(cat_name)
            if not category_id and categories:
                category_id = categories[0].food_category_id  # fallback to first

            # Veg flag
            veg_raw = row.get('is_veg', True)
            if isinstance(veg_raw, str):
                is_veg = veg_raw.strip().lower() not in ('false', 'no', '0', 'non-veg', 'nonveg')
            else:
                is_veg = bool(veg_raw) if pd.notna(veg_raw) else True

            display_order = int(row.get('display_order', 1) or 1)
            description = str(row.get('description', '') or '').strip()

            menu = FoodMenu(
                company_unique_id=company_id,
                category_id=category_id,
                code=code,
                name=name,
                description=description or None,
                sale_price=sale_price,
                display_order=display_order,
                IsActive=True,
                is_available=True,
                is_veg=is_veg,
            )
            db.add(menu)
            existing_codes.add(code)
            created += 1

        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")

    db.commit()
    return {"created": created, "skipped": skipped, "errors": errors}
