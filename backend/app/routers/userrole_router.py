from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.schemas.userrole_schema import UserRoleCreate, UserRoleUpdate, UserRoleResponse
from app.services import userrole_service

router = APIRouter(
    prefix="/userroles",
    tags=["userroles"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Create UserRole
@router.post("/createuserrole", response_model=UserRoleResponse)
def create_userrole(role: UserRoleCreate, db: Session = Depends(get_db)):
    return userrole_service.create_userrole(db, role)


# Update UserRole
@router.put("/updateuserrole/{userrole_id}", response_model=UserRoleResponse)
def update_userrole(userrole_id: int, role: UserRoleUpdate, db: Session = Depends(get_db)):
    result = userrole_service.update_userrole(db, userrole_id, role)
    if not result:
        raise HTTPException(status_code=404, detail="UserRole not found")
    return result


# Soft Delete UserRole
@router.delete("/deleteuserrole/{userrole_id}")
def delete_userrole(userrole_id: int, db: Session = Depends(get_db)):
    result = userrole_service.deactivate_userrole(db, userrole_id)
    if not result:
        raise HTTPException(status_code=404, detail="UserRole not found")
    return {"message": "UserRole deactivated successfully"}


# Get Single UserRole
@router.get("/getuserrole/{userrole_id}", response_model=UserRoleResponse)
def get_userrole(userrole_id: int, db: Session = Depends(get_db)):
    result = userrole_service.get_userrole(db, userrole_id)
    if not result:
        raise HTTPException(status_code=404, detail="UserRole not found")
    return result


# Get All UserRoles by Company
@router.get("/getalluserroles/{company_id}", response_model=list[UserRoleResponse])
def get_all_userroles(company_id: int, db: Session = Depends(get_db)):
    result = userrole_service.get_all_userroles(db, company_id)
    if not result:
        raise HTTPException(status_code=404, detail="No UserRoles found")
    return result


# Check Duplicate Role Name
@router.get("/checkrolename/{company_id}/{role_name}")
def check_rolename(company_id: int, role_name: str, db: Session = Depends(get_db)):
    return userrole_service.check_duplicate_rolename(db, company_id, role_name)
