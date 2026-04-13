from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class UserRoleCreate(BaseModel):
    company_unique_id: int
    role_name: str
    description: Optional[str] = None
    is_active: bool = True
    created_by: Optional[int] = None


class UserRoleUpdate(BaseModel):
    role_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    updated_by: Optional[int] = None


class UserRoleResponse(BaseModel):
    userrole_id: int
    company_unique_id: int
    role_name: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime
    created_by: Optional[int] = None
    updated_at: Optional[datetime] = None
    updated_by: Optional[int] = None

    class Config:
        from_attributes = True


UserRoleResponse.model_rebuild()
