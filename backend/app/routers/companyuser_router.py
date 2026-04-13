from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.schemas.user_schema import UserCreate, UserUpdate, UserResponse, LoginRequest, LoginResponse
from app.services import user_service
from app.services.upload_service import upload_image, delete_image
from app.models.user_model import User
from app.models.company_model import Company, MerchantSettings


router = APIRouter(
    prefix="/users",
    tags=["users"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ───────────────────────────── User CRUD ─────────────────────────────

@router.post("/createuser", response_model=UserResponse)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    return user_service.create_user(db, user)


@router.put("/updateuser/{user_id}", response_model=UserResponse)
def update_user(user_id: int, user: UserUpdate, db: Session = Depends(get_db)):
    result = user_service.update_user(db, user_id, user)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.delete("/deleteuser/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    result = user_service.deactivate_user(db, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deactivated successfully"}


@router.get("/getuser/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    result = user_service.get_user(db, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.get("/getallusers/{company_id}", response_model=list[UserResponse])
def get_all_users(company_id: int, db: Session = Depends(get_db)):
    result = user_service.get_all_users(db, company_id)
    if not result:
        raise HTTPException(status_code=404, detail="No users found")
    return result


# ───────────────────────────── Auth ──────────────────────────────────

@router.post("/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Login endpoint — returns user_details, menus, and company_settings.
    company_settings includes is_merchant_enabled flag.
    """
    # Get the base login response from user_service
    base_response = user_service.login_user(db, request.username, request.password)

    # Extract company_unique_id from user_details
    user_details = base_response.get("user_details") if isinstance(base_response, dict) else base_response.user_details
    if hasattr(user_details, "__dict__"):
        cid = getattr(user_details, "company_unique_id", None)
    else:
        cid = user_details.get("company_unique_id") if isinstance(user_details, dict) else None

    # Fetch company settings
    company_settings = {
        "is_merchant_enabled": False,
        "merchant_name": None,
        "razorpay_key_id": None,
        "is_sms_enabled": False,
        "whatsapp_enabled": False,
        "is_upi_enabled": False,
        "sgst": 0,
        "cgst": 0,
    }

    if cid:
        company = db.query(Company).filter(
            Company.company_unique_id == cid
        ).first()
        if company:
            company_settings["is_merchant_enabled"] = bool(getattr(company, "is_merchant_enabled", False))
            company_settings["is_sms_enabled"]      = bool(getattr(company, "is_sms_enabled", False))
            company_settings["whatsapp_enabled"]    = bool(getattr(company, "whatsapp_enabled", False))
            company_settings["is_upi_enabled"]      = bool(getattr(company, "is_upi_enabled", False))
            company_settings["sgst"]                = float(getattr(company, "sgst", 0) or 0)
            company_settings["cgst"]                = float(getattr(company, "cgst", 0) or 0)

        # Also fetch merchant settings (razorpay key id — NOT secret)
        merchant = db.query(MerchantSettings).filter(
            MerchantSettings.company_unique_id == cid
        ).first()
        if merchant:
            company_settings["merchant_name"]    = merchant.merchant_name
            company_settings["razorpay_key_id"]  = merchant.razorpay_key_id
            company_settings["upi_id"]            = merchant.upi_id
            company_settings["upi_name"]          = merchant.upi_name
            company_settings["upi_qr_image_url"]  = merchant.upi_qr_image_url

    # Merge into response
    if isinstance(base_response, dict):
        base_response["company_settings"] = company_settings
        return base_response
    else:
        # If LoginResponse is a Pydantic model, convert to dict and add
        result = base_response.model_dump() if hasattr(base_response, "model_dump") else dict(base_response)
        result["company_settings"] = company_settings
        return result


@router.get("/checkusername/{company_id}/{username}")
def check_username(company_id: int, username: str, db: Session = Depends(get_db)):
    return user_service.check_duplicate_username(db, company_id, username)


@router.get("/usernameexists/{username}")
def username_exists(username: str, db: Session = Depends(get_db)):
    return user_service.check_username_exists(db, username)


# ───────────────────────────── User Image ────────────────────────────

@router.post("/{user_id}/image")
async def upload_user_image(
    user_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.user_id == user_id,
        User.is_active == True
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.image_file_path:
        await delete_image(user.image_file_path)
    url = await upload_image(file, folder=f"users/{user_id}")
    user.image_file_path = url
    db.commit()
    return {"image_url": url}


@router.delete("/{user_id}/image")
async def delete_user_image(
    user_id: int,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.user_id == user_id,
        User.is_active == True
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.image_file_path:
        raise HTTPException(status_code=404, detail="No image found for this user")
    await delete_image(user.image_file_path)
    user.image_file_path = None
    db.commit()
    return {"message": "User image deleted successfully"}
