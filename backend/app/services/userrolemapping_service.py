from sqlalchemy.orm import Session
from datetime import datetime
from fastapi import HTTPException
from app.models.userrolemapping_model import UserRoleMapping
from app.schemas.userrolemapping_schema import UserRoleMappingCreate, UserRoleMappingUpdate


# Create UserRoleMapping (UPSERT — reactivates soft-deleted rows)
def create_userrolemapping(db: Session, data: UserRoleMappingCreate):
    # Check for ANY existing row — active OR soft-deleted
    existing = db.query(UserRoleMapping).filter(
        UserRoleMapping.userrole_id       == data.userrole_id,
        UserRoleMapping.menu_id           == data.menu_id,
        UserRoleMapping.company_unique_id == data.company_unique_id,
    ).first()

    if existing:
        if existing.is_active:
            # Already active — return as-is (idempotent, no error)
            return existing
        else:
            # Soft-deleted → reactivate instead of INSERT (avoids UniqueViolation)
            existing.is_active  = True
            existing.updated_at = datetime.utcnow()
            existing.updated_by = data.created_by
            db.commit()
            db.refresh(existing)
            return existing

    # No existing row — create fresh
    new_mapping = UserRoleMapping(
        userrole_id       = data.userrole_id,
        menu_id           = data.menu_id,
        company_unique_id = data.company_unique_id,
        is_active         = True,
        created_at        = datetime.utcnow(),
        created_by        = data.created_by,
    )
    db.add(new_mapping)
    db.commit()
    db.refresh(new_mapping)
    return new_mapping


# Update UserRoleMapping
def update_userrolemapping(db: Session, userrolemapping_id: int, data: UserRoleMappingUpdate):
    mapping = db.query(UserRoleMapping).filter(
        UserRoleMapping.userrolemapping_id == userrolemapping_id,
    ).first()
    if not mapping:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(mapping, key, value)

    mapping.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(mapping)
    return mapping


# Soft Delete UserRoleMapping
def deactivate_userrolemapping(db: Session, userrolemapping_id: int):
    mapping = db.query(UserRoleMapping).filter(
        UserRoleMapping.userrolemapping_id == userrolemapping_id,
        UserRoleMapping.is_active          == True,
    ).first()
    if not mapping:
        return None

    mapping.is_active  = False
    mapping.updated_at = datetime.utcnow()
    db.commit()
    return mapping


# Get Single UserRoleMapping
def get_userrolemapping(db: Session, userrolemapping_id: int):
    return db.query(UserRoleMapping).filter(
        UserRoleMapping.userrolemapping_id == userrolemapping_id,
        UserRoleMapping.is_active          == True,
    ).first()


# Get All UserRoleMappings by Company
def get_all_userrolemappings(db: Session, company_id: int):
    return db.query(UserRoleMapping).filter(
        UserRoleMapping.company_unique_id == company_id,
        UserRoleMapping.is_active         == True,
    ).all()


# Get All UserRoleMappings by UserRole
def get_mappings_by_userrole(db: Session, userrole_id: int):
    return db.query(UserRoleMapping).filter(
        UserRoleMapping.userrole_id == userrole_id,
        UserRoleMapping.is_active   == True,
    ).all()


# Check Duplicate Mapping
def check_duplicate_mapping(db: Session, userrole_id: int, menu_id: int, company_id: int):
    existing = db.query(UserRoleMapping).filter(
        UserRoleMapping.userrole_id       == userrole_id,
        UserRoleMapping.menu_id           == menu_id,
        UserRoleMapping.company_unique_id == company_id,
        UserRoleMapping.is_active         == True,
    ).first()

    if existing:
        return {
            "is_duplicate": True,
            "message": f"Mapping for role '{userrole_id}' and menu '{menu_id}' already exists"
        }
    return {
        "is_duplicate": False,
        "message": "Mapping is available"
    }


# Get All Menus Against a Role for a Company
def get_all_menu_against_role(db: Session, company_id: int, userrole_id: int):
    return db.query(UserRoleMapping).filter(
        UserRoleMapping.company_unique_id == company_id,
        UserRoleMapping.userrole_id       == userrole_id,
        UserRoleMapping.is_active         == True,
    ).all()
