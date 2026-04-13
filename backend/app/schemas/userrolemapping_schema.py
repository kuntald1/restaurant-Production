from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class UserRoleMappingCreate(BaseModel):
    userrole_id: int
    menu_id: int
    company_unique_id: int
    is_active: bool = True
    created_by: Optional[int] = None


class UserRoleMappingUpdate(BaseModel):
    userrole_id: Optional[int] = None
    menu_id: Optional[int] = None
    is_active: Optional[bool] = None
    updated_by: Optional[int] = None


class UserRoleMappingResponse(BaseModel):
    userrolemapping_id: int
    userrole_id: int
    menu_id: int
    company_unique_id: int
    is_active: bool
    created_at: datetime
    created_by: Optional[int] = None
    updated_at: Optional[datetime] = None
    updated_by: Optional[int] = None

    class Config:
        from_attributes = True


UserRoleMappingResponse.model_rebuild()
