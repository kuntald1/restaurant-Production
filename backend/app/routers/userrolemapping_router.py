from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.schemas.userrolemapping_schema import UserRoleMappingCreate, UserRoleMappingUpdate, UserRoleMappingResponse
from app.services import userrolemapping_service

router = APIRouter(
    prefix="/userrolemappings",
    tags=["userrolemappings"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Create UserRoleMapping
@router.post("/createuserrolemapping", response_model=UserRoleMappingResponse)
def create_userrolemapping(mapping: UserRoleMappingCreate, db: Session = Depends(get_db)):
    return userrolemapping_service.create_userrolemapping(db, mapping)


# Update UserRoleMapping
@router.put("/updateuserrolemapping/{userrolemapping_id}", response_model=UserRoleMappingResponse)
def update_userrolemapping(userrolemapping_id: int, mapping: UserRoleMappingUpdate, db: Session = Depends(get_db)):
    result = userrolemapping_service.update_userrolemapping(db, userrolemapping_id, mapping)
    if not result:
        raise HTTPException(status_code=404, detail="UserRoleMapping not found")
    return result


# Soft Delete UserRoleMapping
@router.delete("/deleteuserrolemapping/{userrolemapping_id}")
def delete_userrolemapping(userrolemapping_id: int, db: Session = Depends(get_db)):
    result = userrolemapping_service.deactivate_userrolemapping(db, userrolemapping_id)
    if not result:
        raise HTTPException(status_code=404, detail="UserRoleMapping not found")
    return {"message": "UserRoleMapping deactivated successfully"}


# Get Single UserRoleMapping
@router.get("/getuserrolemapping/{userrolemapping_id}", response_model=UserRoleMappingResponse)
def get_userrolemapping(userrolemapping_id: int, db: Session = Depends(get_db)):
    result = userrolemapping_service.get_userrolemapping(db, userrolemapping_id)
    if not result:
        raise HTTPException(status_code=404, detail="UserRoleMapping not found")
    return result


# Get All UserRoleMappings by Company
@router.get("/getalluserrolemappings/{company_id}", response_model=list[UserRoleMappingResponse])
def get_all_userrolemappings(company_id: int, db: Session = Depends(get_db)):
    result = userrolemapping_service.get_all_userrolemappings(db, company_id)
    if not result:
        raise HTTPException(status_code=404, detail="No UserRoleMappings found")
    return result


# Get All UserRoleMappings by UserRole
@router.get("/getmappingsbyuserrole/{userrole_id}", response_model=list[UserRoleMappingResponse])
def get_mappings_by_userrole(userrole_id: int, db: Session = Depends(get_db)):
    result = userrolemapping_service.get_mappings_by_userrole(db, userrole_id)
    if not result:
        raise HTTPException(status_code=404, detail="No mappings found for this UserRole")
    return result


# Get All Menus Against a Role for a Company
@router.get("/getallmenuagainstrole/{company_id}/{userrole_id}", response_model=list[UserRoleMappingResponse])
def get_all_menu_against_role(company_id: int, userrole_id: int, db: Session = Depends(get_db)):
    result = userrolemapping_service.get_all_menu_against_role(db, company_id, userrole_id)
    if not result:
        raise HTTPException(status_code=404, detail="No menus found for this role in the given company")
    return result


# Check Duplicate Mapping
@router.get("/checkmapping/{company_id}/{userrole_id}/{menu_id}")
def check_mapping(company_id: int, userrole_id: int, menu_id: int, db: Session = Depends(get_db)):
    return userrolemapping_service.check_duplicate_mapping(db, userrole_id, menu_id, company_id)
