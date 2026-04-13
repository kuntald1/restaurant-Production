from pydantic import BaseModel
from typing import Optional

# -------- CREATE FOOD MENU --------
class FoodMenuCreate(BaseModel):
    company_unique_id: int
    category_id: int
    code: str
    name: str
    description: Optional[str] = None
    sale_price: float = 0.0
    image_url: Optional[str] = None
    display_order: Optional[int] = 0
    is_active: Optional[bool] = True
    is_available: Optional[bool] = True
    created_by: Optional[int] = None

# -------- UPDATE FOOD MENU --------
class FoodMenuUpdate(BaseModel):
    category_id: Optional[int] = None
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    sale_price: Optional[float] = None
    image_url: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    is_available: Optional[bool] = None
    is_deleted: Optional[bool] = None
    modified_by: Optional[int] = None

# -------- RESPONSE MODEL --------
class FoodMenuResponse(BaseModel):
    company_unique_id: int
    food_menu_id: int
    category_id: int
    code: str
    name: str
    description: Optional[str]
    sale_price: float
    image_url: Optional[str]
    display_order: int
    is_active: bool
    is_deleted: bool
    is_available: bool

    class Config:
        from_attributes = True