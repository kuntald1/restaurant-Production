"""
app/schemas/settlement_schema.py
"""
from pydantic import BaseModel
from typing import List, Optional


class SettleItemAdd(BaseModel):
    food_menu_id: Optional[int] = None
    item_name: str
    item_code: Optional[str] = ""
    category_id: Optional[int] = None
    category_name: Optional[str] = ""
    unit_price: float
    quantity: int = 1
    is_veg: bool = True
    notes: Optional[str] = None


class SettleItemRemove(BaseModel):
    order_item_id: int
    reason: Optional[str] = "Removed during settlement"


class SettleRequest(BaseModel):
    company_id: int
    settled_by: Optional[int] = None
    adds: List[SettleItemAdd] = []
    removes: List[SettleItemRemove] = []
