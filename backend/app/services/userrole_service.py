from sqlalchemy.orm import Session
from datetime import datetime
from fastapi import HTTPException
from app.models.userrole_model import UserRole
from app.schemas.userrole_schema import UserRoleCreate, UserRoleUpdate


# Create UserRole
def create_userrole(db: Session, data: UserRoleCreate):
    existing = db.query(UserRole).filter(
        UserRole.company_unique_id == data.company_unique_id,
        UserRole.role_name == data.role_name,
        UserRole.is_active == True
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Role name already exists in this company")

    new_role = UserRole(
        company_unique_id=data.company_unique_id,
        role_name=data.role_name,
        description=data.description,
        is_active=True,
        created_at=datetime.utcnow(),
        created_by=data.created_by
    )
    db.add(new_role)
    db.commit()
    db.refresh(new_role)
    return new_role


# Update UserRole
def update_userrole(db: Session, userrole_id: int, data: UserRoleUpdate):
    role = db.query(UserRole).filter(
        UserRole.userrole_id == userrole_id,
        UserRole.is_active == True
    ).first()
    if not role:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(role, key, value)

    role.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(role)
    return role


# Soft Delete UserRole
def deactivate_userrole(db: Session, userrole_id: int):
    role = db.query(UserRole).filter(
        UserRole.userrole_id == userrole_id,
        UserRole.is_active == True
    ).first()
    if not role:
        return None

    role.is_active = False
    role.updated_at = datetime.utcnow()
    db.commit()
    return role


# Get Single UserRole
def get_userrole(db: Session, userrole_id: int):
    return db.query(UserRole).filter(
        UserRole.userrole_id == userrole_id,
        UserRole.is_active == True
    ).first()


# Get All UserRoles by Company
def get_all_userroles(db: Session, company_id: int):
    return db.query(UserRole).filter(
        UserRole.company_unique_id == company_id,
        UserRole.is_active == True
    ).all()


# Check Duplicate Role Name
def check_duplicate_rolename(db: Session, company_id: int, role_name: str):
    existing = db.query(UserRole).filter(
        UserRole.company_unique_id == company_id,
        UserRole.role_name == role_name,
        UserRole.is_active == True
    ).first()

    if existing:
        return {
            "is_duplicate": True,
            "message": f"Role name '{role_name}' already exists in this company"
        }

    return {
        "is_duplicate": False,
        "message": f"Role name '{role_name}' is available"
    }
