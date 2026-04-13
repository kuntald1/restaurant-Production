from pydantic import BaseModel
from typing import Optional


# -------- CREATE FOOD CATEGORY --------
class FoodCategoryCreate(BaseModel):
    company_unique_id: int
    category_name: str
    category_description: Optional[str] = None
    category_code: Optional[str] = None
    display_order: Optional[int] = 0
    icon_url: Optional[str] = None
    color_code: Optional[str] = None
    is_active: Optional[bool] = True
    created_by: Optional[int] = None


# -------- UPDATE FOOD CATEGORY --------
class FoodCategoryUpdate(BaseModel):
    category_name: Optional[str] = None
    category_description: Optional[str] = None
    category_code: Optional[str] = None
    display_order: Optional[int] = None
    icon_url: Optional[str] = None
    color_code: Optional[str] = None
    is_active: Optional[bool] = None
    is_deleted: Optional[bool] = None
    modified_by: Optional[int] = None


# -------- RESPONSE MODEL --------
class FoodCategoryResponse(BaseModel):
    food_category_id: int
    company_unique_id: int
    category_name: str
    category_description: Optional[str]
    category_code: Optional[str]
    display_order: int
    icon_url: Optional[str]
    color_code: Optional[str]
    is_active: bool
    is_deleted: bool

    class Config:
        from_attributes = True