from sqlalchemy.orm import Session
from datetime import datetime
from fastapi import HTTPException
from app.models.user_model import User
from app.models.userrolemapping_model import UserRoleMapping
from app.models.companymenu_model import Menu                          # ← ADD THIS IMPORT
from app.schemas.user_schema import UserCreate, UserUpdate
from app.utils.crypto_helper import decrypt_password
import bcrypt


def hash_password(plain_password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed.encode("utf-8"))


# Create User
def create_user(db: Session, data: UserCreate):
    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    # Decrypt AES from frontend → then bcrypt hash for DB
    decrypted_password = decrypt_password(data.password)
    hashed = hash_password(decrypted_password)

    new_user = User(
        company_unique_id=data.company_unique_id,
        first_name=data.first_name,
        last_name=data.last_name,
        phone_number=data.phone_number,
        email=data.email,
        email_2=data.email_2,
        address=data.address,
        city=data.city,
        state=data.state,
        zip_code=data.zip_code,
        country=data.country,
        username=data.username,
        password_hash=hashed,
        image_path=data.image_path,
        role_id=data.role_id,
        employment_type=data.employment_type,
        shift_preference=data.shift_preference,
        hire_date=data.hire_date,
        salary=data.salary,
        emergency_contact_name=data.emergency_contact_name,
        emergency_contact_phone=data.emergency_contact_phone,
        notes=data.notes,
        is_active=True,
        is_super_admin=data.is_super_admin,
        is_admin=data.is_admin,
        created_at=datetime.utcnow(),
        created_by=data.username
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


# Update User
def update_user(db: Session, user_id: int, data: UserUpdate):
    user = db.query(User).filter(User.user_id == user_id, User.is_active == True).first()
    if not user:
        return None

    update_data = data.model_dump(exclude_unset=True)

    # If password is being updated, decrypt + re-hash
    if "password" in update_data:
        decrypted_password = decrypt_password(update_data["password"])
        update_data["password_hash"] = hash_password(decrypted_password)
        del update_data["password"]

    for key, value in update_data.items():
        setattr(user, key, value)

    user.updated_at = datetime.utcnow()
    user.updated_by = user.username
    db.commit()
    db.refresh(user)
    return user


# Soft Delete User
def deactivate_user(db: Session, user_id: int):
    user = db.query(User).filter(User.user_id == user_id, User.is_active == True).first()
    if not user:
        return None

    user.is_active = False
    user.updated_at = datetime.utcnow()
    db.commit()
    return user


# Get Single User
def get_user(db: Session, user_id: int):
    return db.query(User).filter(User.user_id == user_id, User.is_active == True).first()


# Get All Users by Company
def get_all_users(db: Session, company_id: int):
    return db.query(User).filter(
        User.company_unique_id == company_id,
        User.is_active == True
    ).all()


# Login User — enriched with user details + menu mappings (including menu info)
def login_user(db: Session, username: str, encrypted_password: str):
    user = db.query(User).filter(
        User.username == username,
        User.is_active == True
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Decrypt AES from frontend → compare with bcrypt hash in DB
    decrypted_password = decrypt_password(encrypted_password)

    if not verify_password(decrypted_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")

    # ── JOIN UserRoleMapping with Menu to include menu details ──────────────
    results = (
        db.query(UserRoleMapping, Menu)
        .join(Menu, Menu.menuid == UserRoleMapping.menu_id)
        .filter(
            UserRoleMapping.userrole_id == user.role_id,
            UserRoleMapping.company_unique_id == user.company_unique_id,
            UserRoleMapping.is_active == True,
            Menu.isactive == True                                # only active menus
        )
        .all()
    )

    # Build enriched menu list with mapping fields + menu detail fields
    enriched_menus = []
    for mapping, menu in results:
        enriched_menus.append({
            # UserRoleMapping fields
            "userrolemapping_id":  mapping.userrolemapping_id,
            "userrole_id":         mapping.userrole_id,
            "menu_id":             mapping.menu_id,
            "company_unique_id":   mapping.company_unique_id,
            "is_active":           mapping.is_active,
            # Menu detail fields  ← NEW
            "menuname":            menu.menuname,
            "menudesc":            menu.menudesc,
            "menuurl":             menu.menuurl,
            "menuicon":            menu.menuicon,
            "parentmenuid":        menu.parentmenuid,
        })
    # ────────────────────────────────────────────────────────────────────────

    return {
        "message": "Login successful",
        "user_details": user,
        "menus": enriched_menus
    }


# Check Duplicate Username
def check_duplicate_username(db: Session, company_id: int, username: str):
    existing = db.query(User).filter(
        User.company_unique_id == company_id,
        User.username == username,
        User.is_active == True
    ).first()

    if existing:
        return {
            "is_duplicate": True,
            "message": f"Username '{username}' already exists in this company"
        }

    return {
        "is_duplicate": False,
        "message": f"Username '{username}' is available"
    }


# Check Username Exists (global - no company filter)
def check_username_exists(db: Session, username: str):
    existing = db.query(User).filter(
        User.username == username,
        User.is_active == True
    ).first()

    if existing:
        return {
            "exists": True,
            "message": f"Username '{username}' is already taken"
        }

    return {
        "exists": False,
        "message": f"Username '{username}' is available"
    }
