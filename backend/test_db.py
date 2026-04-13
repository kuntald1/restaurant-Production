from sqlalchemy import text
from app.database import SessionLocal

try:
    db = SessionLocal()
    
    # Wrap raw SQL in text()
    result = db.execute(text("SELECT NOW();"))
    print("Database connected! Current time:", result.fetchone())
    
    db.close()
except Exception as e:
    print("Database connection failed:", e)