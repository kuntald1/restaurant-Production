from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, date


class UserCreate(BaseModel):
    company_unique_id: Optional[int] = None
    first_name: str
    last_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[EmailStr] = None
    email_2: Optional[EmailStr] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    username: str
    password: str
    image_path: Optional[str] = None
    role_id: Optional[int] = None
    is_super_admin: bool = False
    is_admin: bool = False
    employment_type: Optional[str] = None
    shift_preference: Optional[str] = None
    hire_date: Optional[date] = None
    salary: Optional[float] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    notes: Optional[str] = None


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[EmailStr] = None
    email_2: Optional[EmailStr] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    username: Optional[str] = None
    image_path: Optional[str] = None
    role_id: Optional[int] = None
    is_super_admin: Optional[bool] = None
    is_admin: Optional[bool] = None
    employment_type: Optional[str] = None
    shift_preference: Optional[str] = None
    hire_date: Optional[date] = None
    salary: Optional[float] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    notes: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    user_id: int
    company_unique_id: Optional[int] = None
    first_name: str
    last_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    email_2: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    username: str
    image_path: Optional[str] = None
    role_id: Optional[int] = None
    is_active: bool
    is_admin: bool
    is_super_admin: bool
    employment_type: Optional[str] = None
    shift_preference: Optional[str] = None
    hire_date: Optional[date] = None
    salary: Optional[float] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Replaces MenuMappingInfo — now includes joined menu detail fields ──────────
class MenuMappingInfo(BaseModel):
    # UserRoleMapping fields
    userrolemapping_id: int
    userrole_id:        int
    menu_id:            int
    company_unique_id:  int
    is_active:          bool

    # Menu detail fields (joined from menus table)
    menuname:           str
    menudesc:           Optional[str] = None
    menuurl:            Optional[str] = None
    menuicon:           Optional[str] = None
    parentmenuid:       Optional[int] = None

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    message:      str
    user_details: UserResponse
    menus:        List[MenuMappingInfo]


UserResponse.model_rebuild()
LoginResponse.model_rebuild()
