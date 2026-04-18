"""
app/routers/pos_router.py
All POS endpoints — Tables, Orders, KOT, Bill
"""
from fastapi import APIRouter, Depends, HTTPException,Body
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from decimal import Decimal
from app.database import SessionLocal
from app.schemas.pos_schemas import (
    TableCreate, TableUpdate, TableResponse,
    OrderCreate, OrderUpdate, OrderResponse,
    OrderItemCreate,
    KOTCreate, KOTResponse, KOTStatusUpdate, KOTItemStatusUpdate,
    BillCreate, BillResponse,
    OrderStatusUpdateRequest,
)
from app.services import pos_service
from app.models.pos_models import TableStatusEnum

router = APIRouter(prefix="/pos", tags=["POS"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ═══════════════════════════════════════════════
# TABLES
# ═══════════════════════════════════════════════

@router.get("/tables/{company_id}", response_model=list[TableResponse])
def get_tables(company_id: int, db: Session = Depends(get_db)):
    """Get all active tables — includes status (free/occupied/reserved)"""
    return pos_service.get_all_tables(db, company_id)

@router.post("/tables", response_model=TableResponse)
def create_table(data: TableCreate, db: Session = Depends(get_db)):
    from app.models.pos_models import RestaurantTable
    table = RestaurantTable(**data.model_dump())
    db.add(table)
    db.commit()
    db.refresh(table)
    return table

@router.patch("/tables/{table_id}/status")
def update_table_status(table_id: int, status: TableStatusEnum, db: Session = Depends(get_db)):
    """Manually set table status"""
    return pos_service.update_table_status(db, table_id, status)

@router.patch("/tables/{table_id}")
def deactivate_table(table_id: int, db: Session = Depends(get_db)):
    """Soft-delete a table — sets is_active=False. No FK issues."""
    from app.models.pos_models import RestaurantTable
    table = db.query(RestaurantTable).filter(RestaurantTable.table_id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    table.is_active = False
    db.commit()
    db.refresh(table)
    return table

@router.put("/tables/{table_id}")
def update_table(table_id: int, table_data: TableUpdate = Body(...), db: Session = Depends(get_db)):
    """Update table details by ID"""
    return pos_service.update_table(db, table_id, table_data)
# ═══════════════════════════════════════════════
# ORDERS
# ═══════════════════════════════════════════════

@router.get("/orders/running/{company_id}", response_model=list[OrderResponse])
def get_running_orders(company_id: int, db: Session = Depends(get_db)):
    """Running orders panel — all non-completed orders"""
    return pos_service.get_running_orders(db, company_id)

@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(order_id: int, db: Session = Depends(get_db)):
    return pos_service.get_order(db, order_id)

@router.post("/orders", response_model=OrderResponse)
def create_order(data: OrderCreate, db: Session = Depends(get_db)):
    """
    Create new order.
    - dine_in: requires table_id
    - take_away / delivery: requires customer details
    """
    return pos_service.create_order(db, data)

@router.put("/orders/{order_id}", response_model=OrderResponse)
def update_order(order_id: int, data: OrderUpdate, db: Session = Depends(get_db)):
    """Update order notes, discount, service charge. Blocked after billed."""
    return pos_service.update_order(db, order_id, data)

@router.patch("/orders/{order_id}/hold")
def toggle_hold(order_id: int, hold: bool, db: Session = Depends(get_db)):
    """Hold / unhold an order"""
    return pos_service.hold_order(db, order_id, hold)

@router.delete("/orders/{order_id}/cancel")
def cancel_order(order_id: int, db: Session = Depends(get_db)):
    """Cancel order and free the table"""
    return pos_service.cancel_order(db, order_id)

@router.patch("/orders/{order_id}/status")
def update_order_status_post_bill(
    order_id: int,
    data: OrderStatusUpdateRequest,
    db: Session = Depends(get_db)
):
    """
    After billing:
    Take Away  → picked_up
    Delivery   → picked_up_by_delivery_agent
    """
    return pos_service.update_order_post_bill_status(db, order_id, data)


# ═══════════════════════════════════════════════
# ORDER ITEMS
# ═══════════════════════════════════════════════

@router.post("/orders/{order_id}/items")
def add_item(order_id: int, item: OrderItemCreate, company_id: int, db: Session = Depends(get_db)):
    """Add item to existing order. Blocked if any item is in KOT Inprocess."""
    return pos_service.add_item_to_order(db, order_id, item, company_id)

@router.patch("/orders/{order_id}/items/{order_item_id}/quantity")
def update_quantity(order_id: int, order_item_id: int, quantity: int, db: Session = Depends(get_db)):
    """
    Change item quantity.
    - quantity = 0 → soft cancel item
    - blocked if item status is kot_inprocess (kitchen started)
    """
    return pos_service.update_item_quantity(db, order_id, order_item_id, quantity)

@router.patch("/orders/{order_id}/items/{order_item_id}/notes")
def update_item_notes(order_id: int, order_item_id: int, notes: str = "", db: Session = Depends(get_db)):
    """Update the kitchen note for a specific order item (e.g. 'less chilli', 'no onion')."""
    from app.models.pos_models import OrderItem
    item = db.query(OrderItem).filter(
        OrderItem.order_item_id == order_item_id,
        OrderItem.order_id == order_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.notes = notes.strip() if notes else None
    db.commit()
    db.refresh(item)
    return {"order_item_id": order_item_id, "notes": item.notes, "message": "Notes updated"}

@router.delete("/orders/{order_id}/items/{order_item_id}")
def cancel_item(order_id: int, order_item_id: int, reason: str = "Removed by staff", db: Session = Depends(get_db)):
    """Remove item from order. Blocked if item is being cooked."""
    return pos_service.cancel_item(db, order_id, order_item_id, reason)


# ═══════════════════════════════════════════════
# KOT
# ═══════════════════════════════════════════════

@router.post("/kot", response_model=KOTResponse)
def create_kot(data: KOTCreate, db: Session = Depends(get_db)):
    """
    Send items to kitchen.
    - Creates KOT record
    - Sets order_item.kot_item_status = kot_open
    - Sets order.order_status = kot_open
    - Prints KOT (print_count = 1)
    """
    return pos_service.create_kot(db, data)

@router.get("/kot/{kot_id}", response_model=KOTResponse)
def get_kot(kot_id: int, db: Session = Depends(get_db)):
    from app.models.pos_models import KOT
    kot = db.query(KOT).filter(KOT.kot_id == kot_id).first()
    if not kot:
        raise HTTPException(404, "KOT not found")
    return kot

@router.get("/kot/order/{order_id}", response_model=list[KOTResponse])
def get_kots_for_order(order_id: int, db: Session = Depends(get_db)):
    """All KOTs for an order"""
    from app.models.pos_models import KOT
    return db.query(KOT).filter(KOT.order_id == order_id).all()

@router.patch("/kot/{kot_id}/print", response_model=KOTResponse)
def print_kot(kot_id: int, db: Session = Depends(get_db)):
    """
    Re-print KOT — increments print_count.
    KOT can be printed unlimited times.
    """
    return pos_service.print_kot(db, kot_id)

@router.patch("/kot/{kot_id}/status", response_model=KOTResponse)
def update_kot_status(kot_id: int, data: KOTStatusUpdate, db: Session = Depends(get_db)):
    """
    Kitchen updates KOT status:
    kot_open → kot_inprocess  : Kitchen started (LOCKS order for edits)
    kot_inprocess → ready     : All items done
    """
    return pos_service.update_kot_status(db, kot_id, data)

@router.patch("/kot/items/{kot_item_id}/status")
def update_kot_item_status(kot_item_id: int, data: KOTItemStatusUpdate, db: Session = Depends(get_db)):
    """
    Update individual item status:
    kot_open → kot_inprocess → ready
    Auto-updates KOT and order status when all items ready.
    """
    return pos_service.update_kot_item_status(db, kot_item_id, data)


# ═══════════════════════════════════════════════
# BILL
# ═══════════════════════════════════════════════

@router.post("/bill", response_model=BillResponse)
def generate_bill(data: BillCreate, db: Session = Depends(get_db)):
    """
    Generate Bill:
    - Order status → billed
    - Table freed automatically
    - Bill is locked — no further changes to order
    """
    return pos_service.generate_bill(db, data)

@router.get("/bill/order/{order_id}", response_model=BillResponse)
def get_bill_by_order(order_id: int, db: Session = Depends(get_db)):
    from app.models.pos_models import Bill
    bill = db.query(Bill).filter(Bill.order_id == order_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    return bill

@router.get("/bill/{bill_id}")
def get_bill(bill_id: int, db: Session = Depends(get_db)):
    from app.models.pos_models import Bill, Order, OrderItem
    bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    order = db.query(Order).filter(Order.order_id == bill.order_id).first()
    order_items = db.query(OrderItem).filter(OrderItem.order_id == bill.order_id).all()
    bill_dict = {c.name: getattr(bill, c.name) for c in bill.__table__.columns}
    if order:
        order_dict = {c.name: getattr(order, c.name) for c in order.__table__.columns}
        order_dict['order_items'] = [
            {c.name: getattr(item, c.name) for c in item.__table__.columns}
            for item in order_items
        ]
        bill_dict['order'] = order_dict
    return bill_dict

@router.patch("/bill/{bill_id}/print", response_model=BillResponse)
def print_bill(bill_id: int, db: Session = Depends(get_db)):
    """Re-print bill — increments print_count"""
    return pos_service.print_bill(db, bill_id)
