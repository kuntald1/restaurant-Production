from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware  # ✅ ADD THIS

from app.routers import company_router
from app.routers import companymenu_router
from app.routers import companyfoodcategory_router
from app.routers import companyfoodmenu_router
from app.routers import companyuser_router
from app.routers import userrole_router
from app.routers import userrolemapping_router
from app.routers import payment_transaction_router
from fastapi.staticfiles import StaticFiles
from app.routers import pos_router
from app.routers import crm_router
from app.routers import whatsapp_log_router
from app.routers import contact_lead_router
from app.routers import subscription_router
import os

app = FastAPI(redirect_slashes=False)

# ✅ ADD THIS BLOCK (VERY IMPORTANT)
origins = [
    "http://localhost:5173",
    "https://restaurant-management-ui-lj7y.vercel.app",
    "https://restaurant-management-ui-lj7y-f6vme4ou0-resturant1.vercel.app"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # ✅ allow all origins (permanent fix)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# existing code
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(company_router.router)
app.include_router(companymenu_router.router)
app.include_router(companyfoodcategory_router.router)
app.include_router(companyfoodmenu_router.router)
app.include_router(companyuser_router.router)
app.include_router(userrole_router.router)
app.include_router(userrolemapping_router.router)
app.include_router(pos_router.router)
app.include_router(payment_transaction_router.router)
app.include_router(crm_router.router)
app.include_router(whatsapp_log_router.router)
app.include_router(contact_lead_router.router)
app.include_router(subscription_router.router)