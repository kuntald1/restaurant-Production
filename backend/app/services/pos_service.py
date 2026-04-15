"""
app/services/pos_service.py  — COMPLETE FINAL VERSION
"""
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from fastapi import HTTPException
from app.models.crm_models import CrmCustomer
from app.models.pos_models import (
    Order, OrderItem, KOT, KOTItem, Bill, RestaurantTable,
    OrderStatusEnum, KOTStatusEnum, KOTItemStatusEnum, TableStatusEnum
)
from app.schemas.pos_schemas import (
    OrderCreate, OrderUpdate, OrderItemCreate, KOTCreate,
    KOTStatusUpdate, KOTItemStatusUpdate, BillCreate, OrderStatusUpdateRequest,TableUpdate
)


# ── Safe attribute getter ─────────────────────────────────────
# Prevents AttributeError if migration hasn't run yet

def _safe_get(obj, attr, default=0):
    """Get attribute safely — returns default if column doesn't exist."""
    try:
        val = getattr(obj, attr, default)
        return val if val is not None else default
    except Exception:
        return default


# ── Helpers ───────────────────────────────────────────────────

def _recalculate_order_totals(db: Session, order: Order):
    """Recalculate subtotal and total_payable from active items."""
    active_items = [i for i in order.items if not i.is_cancelled]
    order.subtotal = sum(float(i.unit_price) * i.quantity for i in active_items)
    order.total_payable = (
        float(order.subtotal)
        - float(order.discount_amount or 0)
        + float(order.service_charge or 0)
        + float(order.tax_amount or 0)
        + float(_safe_get(order, 'table_surcharge_amount', 0))
    )
    db.commit()
    db.refresh(order)


def _assert_order_editable(order: Order):
    if order.order_status == OrderStatusEnum.billed:
        raise HTTPException(400, "Order is billed. No changes allowed.")
    if order.order_status == OrderStatusEnum.cancelled:
        raise HTTPException(400, "Order is cancelled.")
    if order.order_status in (
        OrderStatusEnum.picked_up,
        OrderStatusEnum.picked_up_by_delivery_agent
    ):
        raise HTTPException(400, "Order already completed.")


def _assert_items_editable(order: Order):
    locked = [
        i for i in order.items
        if not i.is_cancelled and i.kot_item_status == KOTItemStatusEnum.kot_inprocess
    ]
    if locked:
        names = ", ".join(i.item_name for i in locked)
        raise HTTPException(
            400,
            f"Cannot modify: kitchen has started preparing — {names}."
        )


# ── Restaurant Tables ─────────────────────────────────────────

def get_all_tables(db: Session, company_id: int):
    return db.query(RestaurantTable).filter(
        RestaurantTable.company_unique_id == company_id,
        RestaurantTable.is_active == True
    ).order_by(RestaurantTable.table_name).all()


def update_table_status(db: Session, table_id: int, status: TableStatusEnum):
    table = db.query(RestaurantTable).filter(
        RestaurantTable.table_id == table_id
    ).first()
    if not table:
        raise HTTPException(404, "Table not found")
    table.table_status = status
    table.updated_at = datetime.now(timezone.utc)  
    db.commit()
    db.refresh(table)
    return table


def delete_table(db: Session, table_id: int):
    table = db.query(RestaurantTable).filter(
        RestaurantTable.table_id == table_id
    ).first()
    if not table:
        raise HTTPException(404, "Table not found")
    db.delete(table)
    db.commit()
    return {"message": f"Table {table_id} deleted successfully"}


def update_table(db: Session, table_id: int, table_data: TableUpdate):  # ✅ fixed name
    table = db.query(RestaurantTable).filter(
        RestaurantTable.table_id == table_id
    ).first()
    if not table:
        raise HTTPException(404, "Table not found")

    update_fields = table_data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(table, field, value)

    table.updated_at = datetime.now(timezone.utc)  # ✅ fixed
    db.commit()
    db.refresh(table)
    return table
# ── Orders ────────────────────────────────────────────────────

def create_order(db: Session, data: OrderCreate):
    surcharge_amount = 0.0
    surcharge_label  = None

    if data.order_type.value == "dine_in" and data.table_id:
        table = db.query(RestaurantTable).filter(
            RestaurantTable.table_id == data.table_id,
            RestaurantTable.is_active == True
        ).first()

        if not table:
            raise HTTPException(404, "Table not found")

        if table.table_status == TableStatusEnum.reserved:
            raise HTTPException(
                400, f"Table {table.table_name} is reserved."
            )

        # ── Seat capacity check (safe — works even before migration) ──
        covers_requested = data.covers or 1
        occupied         = _safe_get(table, 'occupied_seats', 0)
        remaining_seats  = table.seats - occupied

        if remaining_seats <= 0:
            raise HTTPException(
                400,
                f"Table {table.table_name} is full "
                f"({table.seats}/{table.seats} seats occupied)."
            )

        if covers_requested > remaining_seats:
            raise HTTPException(
                400,
                f"Table {table.table_name} only has {remaining_seats} "
                f"seat(s) remaining, but you requested {covers_requested}."
            )

        # ── Surcharge (safe — works even before migration) ────────────
        s_amount = _safe_get(table, 'surcharge_amount', 0)
        s_type   = _safe_get(table, 'surcharge_type', 'flat')
        s_label  = _safe_get(table, 'surcharge_label', None)

        if s_amount and float(s_amount) > 0:
            if s_type == "per_cover":
                surcharge_amount = float(s_amount) * covers_requested
            else:
                surcharge_amount = float(s_amount)
            surcharge_label = s_label or "Table Surcharge"

        # ── Occupy table ──────────────────────────────────────────────
        try:
            table.table_status     = TableStatusEnum.occupied
            table.active_order_count = _safe_get(table, 'active_order_count', 0) + 1
            table.occupied_seats   = occupied + covers_requested
            table.updated_at       = datetime.utcnow()
        except Exception:
            # Columns don't exist yet — just set status
            table.table_status = TableStatusEnum.occupied
            table.updated_at   = datetime.utcnow()

    # ── Build order dict safely ───────────────────────────────
    order_kwargs = dict(
        company_unique_id = data.company_unique_id,
        order_type        = data.order_type,
        order_status      = OrderStatusEnum.draft,
        table_id          = data.table_id,
        covers            = data.covers or 1,
        customer_name     = data.customer_name,
        customer_phone    = data.customer_phone,
        delivery_address  = data.delivery_address,
        notes             = data.notes,
        created_by        = data.created_by,
    )

    # Add surcharge fields only if columns exist on the model
    try:
        order_kwargs['table_surcharge_amount'] = surcharge_amount
        order_kwargs['table_surcharge_label']  = surcharge_label
        order = Order(**order_kwargs)
        db.add(order)
        db.flush()
        # Test that the columns actually exist in DB
        _ = order.table_surcharge_amount
    except Exception:
        # Columns not in DB yet — create without them
        order_kwargs.pop('table_surcharge_amount', None)
        order_kwargs.pop('table_surcharge_label', None)
        db.rollback()
        order = Order(**order_kwargs)
        db.add(order)
        db.flush()

    order.order_number = f"#{str(order.order_id).zfill(6)}"

    for item_data in (data.items or []):
        item = OrderItem(
            order_id          = order.order_id,
            company_unique_id = data.company_unique_id,
            food_menu_id      = item_data.food_menu_id,
            item_name         = item_data.item_name,
            item_code         = item_data.item_code,
            category_id       = item_data.category_id,
            category_name     = item_data.category_name,
            unit_price        = item_data.unit_price,
            quantity          = item_data.quantity,
            total_price       = round(float(item_data.unit_price)) * item_data.quantity,
            modifiers         = item_data.modifiers or [],
            is_veg            = item_data.is_veg,
            notes             = item_data.notes,
        )
        db.add(item)

    db.commit()
    db.refresh(order)
    _recalculate_order_totals(db, order)
    return order


def get_order(db: Session, order_id: int):
    order = db.query(Order).filter(Order.order_id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    return order


def get_running_orders(db: Session, company_id: int):
    return db.query(Order).filter(
        Order.company_unique_id == company_id,
        Order.order_status.notin_([
            OrderStatusEnum.billed,
            OrderStatusEnum.picked_up,
            OrderStatusEnum.picked_up_by_delivery_agent,
            OrderStatusEnum.cancelled,
        ])
    ).order_by(Order.order_placed_at.desc()).all()


def add_item_to_order(db: Session, order_id: int, item_data: OrderItemCreate, company_id: int):
    order = get_order(db, order_id)
    _assert_order_editable(order)
    _assert_items_editable(order)

    item = OrderItem(
        order_id          = order_id,
        company_unique_id = company_id,
        food_menu_id      = item_data.food_menu_id,
        item_name         = item_data.item_name,
        item_code         = item_data.item_code,
        category_id       = item_data.category_id,
        category_name     = item_data.category_name,
        unit_price        = item_data.unit_price,
        quantity          = item_data.quantity,
        total_price       = round(float(item_data.unit_price)) * item_data.quantity,
        modifiers         = item_data.modifiers or [],
        is_veg            = item_data.is_veg,
        notes             = item_data.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    _recalculate_order_totals(db, order)
    return item


def update_item_quantity(db: Session, order_id: int, order_item_id: int, quantity: int):
    order = get_order(db, order_id)
    _assert_order_editable(order)

    item = db.query(OrderItem).filter(
        OrderItem.order_item_id == order_item_id,
        OrderItem.order_id == order_id
    ).first()
    if not item:
        raise HTTPException(404, "Item not found")

    if item.kot_item_status == KOTItemStatusEnum.kot_inprocess:
        raise HTTPException(
            400, f"'{item.item_name}' is being prepared. Cannot change quantity."
        )

    if quantity <= 0:
        item.is_cancelled     = True
        item.cancelled_reason = "Removed by staff"
    else:
        item.quantity = quantity
        item.total_price = float(item.unit_price) * quantity
    item.updated_at = datetime.utcnow()
    db.commit()
    _recalculate_order_totals(db, order)
    return item


def cancel_item(db: Session, order_id: int, order_item_id: int, reason: str = "Removed"):
    order = get_order(db, order_id)
    _assert_order_editable(order)

    item = db.query(OrderItem).filter(
        OrderItem.order_item_id == order_item_id,
        OrderItem.order_id == order_id
    ).first()
    if not item:
        raise HTTPException(404, "Item not found")

    if item.kot_item_status == KOTItemStatusEnum.kot_inprocess:
        raise HTTPException(400, f"'{item.item_name}' is being prepared. Cannot cancel.")

    item.is_cancelled     = True
    item.cancelled_reason = reason
    item.updated_at       = datetime.utcnow()
    db.commit()
    _recalculate_order_totals(db, order)
    return {"message": f"Item '{item.item_name}' cancelled"}


def update_order(db: Session, order_id: int, data: OrderUpdate):
    order = get_order(db, order_id)
    _assert_order_editable(order)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(order, key, value)
    order.updated_at = datetime.utcnow()
    db.commit()
    _recalculate_order_totals(db, order)
    return order


def hold_order(db: Session, order_id: int, hold: bool):
    order = get_order(db, order_id)
    _assert_order_editable(order)
    order.is_hold    = hold
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    return order


def cancel_order(db: Session, order_id: int):
    order = get_order(db, order_id)
    if order.order_status == OrderStatusEnum.billed:
        raise HTTPException(400, "Cannot cancel a billed order")

    order.order_status  = OrderStatusEnum.cancelled
    order.cancelled_at  = datetime.utcnow()

    if order.table_id:
        table = db.query(RestaurantTable).filter(
            RestaurantTable.table_id == order.table_id
        ).first()
        if table:
            try:
                table.active_order_count = max(_safe_get(table, 'active_order_count', 1) - 1, 0)
                table.occupied_seats     = max(_safe_get(table, 'occupied_seats', 0) - (order.covers or 1), 0)
                table.table_status       = TableStatusEnum.free if table.active_order_count == 0 else TableStatusEnum.occupied
            except Exception:
                table.table_status = TableStatusEnum.free
            table.updated_at = datetime.utcnow()

    db.commit()
    return {"message": "Order cancelled"}


# ── KOT ──────────────────────────────────────────────────────

def create_kot(db: Session, data: KOTCreate):
    order = get_order(db, data.order_id)
    _assert_order_editable(order)

    if not data.item_ids:
        raise HTTPException(400, "No items selected for KOT")

    items = db.query(OrderItem).filter(
        OrderItem.order_item_id.in_(data.item_ids),
        OrderItem.order_id == data.order_id,
        OrderItem.is_cancelled == False
    ).all()

    if not items:
        raise HTTPException(400, "No valid items found for KOT")

    # Count BEFORE insert
    kot_count = db.query(KOT).filter(KOT.order_id == data.order_id).count()

    # FIX 1: Build kot_number BEFORE inserting — avoids NULL unique constraint clash
    order_num_clean = (order.order_number or str(order.order_id)).lstrip("#")
    kot_number = f"KOT-{order_num_clean}-{kot_count + 1}"

    # FIX 2: Fetch table_name safely via explicit query — don't use .table relationship
    table_name = None
    if order.table_id:
        tbl = db.query(RestaurantTable).filter(
            RestaurantTable.table_id == order.table_id
        ).first()
        table_name = tbl.table_name if tbl else None

    kot = KOT(
        kot_number         = kot_number,   # FIX: set before flush, not after
        order_id           = data.order_id,
        company_unique_id  = data.company_unique_id,
        kot_status         = KOTStatusEnum.kot_open,
        table_id           = order.table_id,
        table_name         = table_name,
        notes              = data.notes,
        created_by         = data.created_by,
        print_count        = 1,
        last_printed_at    = datetime.utcnow(),
    )
    db.add(kot)
    db.flush()  # get kot.kot_id — kot_number already set, no NULL issue

    for item in items:
        kot_item = KOTItem(
            kot_id            = kot.kot_id,
            order_item_id     = item.order_item_id,
            order_id          = data.order_id,
            company_unique_id = data.company_unique_id,
            item_name         = item.item_name,
            quantity          = item.quantity,
            notes             = item.notes,
            is_veg            = item.is_veg if item.is_veg is not None else True,
            kot_item_status   = KOTItemStatusEnum.kot_open,
        )
        db.add(kot_item)
        item.kot_item_status = KOTItemStatusEnum.kot_open
        item.kot_id          = kot.kot_id
        item.updated_at      = datetime.utcnow()

    order.order_status = OrderStatusEnum.kot_open
    order.updated_at   = datetime.utcnow()

    db.commit()
    db.refresh(kot)
    return kot


def print_kot(db: Session, kot_id: int):
    kot = db.query(KOT).filter(KOT.kot_id == kot_id).first()
    if not kot:
        raise HTTPException(404, "KOT not found")
    kot.print_count    += 1
    kot.last_printed_at = datetime.utcnow()
    db.commit()
    db.refresh(kot)
    return kot


def update_kot_status(db: Session, kot_id: int, data: KOTStatusUpdate):
    kot = db.query(KOT).filter(KOT.kot_id == kot_id).first()
    if not kot:
        raise HTTPException(404, "KOT not found")

    order = get_order(db, kot.order_id)

    if data.kot_status == KOTStatusEnum.kot_inprocess:
        kot.kitchen_started_at  = datetime.utcnow()
        order.order_status      = OrderStatusEnum.kot_inprocess
        for ki in kot.kot_items:
            ki.kot_item_status = KOTItemStatusEnum.kot_inprocess
            ki.started_at      = datetime.utcnow()
            if ki.order_item:
                ki.order_item.kot_item_status = KOTItemStatusEnum.kot_inprocess

    elif data.kot_status == KOTStatusEnum.ready:
        kot.ready_at = datetime.utcnow()
        for ki in kot.kot_items:
            ki.kot_item_status = KOTItemStatusEnum.ready
            ki.ready_at        = datetime.utcnow()
            if ki.order_item:
                ki.order_item.kot_item_status = KOTItemStatusEnum.ready

        all_items = [i for i in order.items if not i.is_cancelled]
        if all(i.kot_item_status == KOTItemStatusEnum.ready for i in all_items):
            order.order_status = OrderStatusEnum.ready

    kot.kot_status  = data.kot_status
    kot.updated_at  = datetime.utcnow()
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(kot)
    return kot


def update_kot_item_status(db: Session, kot_item_id: int, data: KOTItemStatusUpdate):
    kot_item = db.query(KOTItem).filter(KOTItem.kot_item_id == kot_item_id).first()
    if not kot_item:
        raise HTTPException(404, "KOT item not found")

    kot_item.kot_item_status = data.kot_item_status
    if data.kot_item_status == KOTItemStatusEnum.kot_inprocess:
        kot_item.started_at = datetime.utcnow()
    elif data.kot_item_status == KOTItemStatusEnum.ready:
        kot_item.ready_at = datetime.utcnow()

    if kot_item.order_item:
        kot_item.order_item.kot_item_status = data.kot_item_status
        kot_item.order_item.updated_at      = datetime.utcnow()

    kot_item.updated_at = datetime.utcnow()

    kot      = kot_item.kot
    all_ki   = kot.kot_items
    if all(ki.kot_item_status == KOTItemStatusEnum.ready for ki in all_ki):
        kot.kot_status = KOTStatusEnum.ready
        kot.ready_at   = datetime.utcnow()
        order = get_order(db, kot.order_id)
        all_items = [i for i in order.items if not i.is_cancelled]
        if all(i.kot_item_status == KOTItemStatusEnum.ready for i in all_items):
            order.order_status = OrderStatusEnum.ready
            order.updated_at   = datetime.utcnow()
    elif any(ki.kot_item_status == KOTItemStatusEnum.kot_inprocess for ki in all_ki):
        if kot.kot_status == KOTStatusEnum.kot_open:
            kot.kot_status         = KOTStatusEnum.kot_inprocess
            kot.kitchen_started_at = datetime.utcnow()

    db.commit()
    db.refresh(kot_item)
    return kot_item


# ── Bill ─────────────────────────────────────────────────────

def generate_bill(db: Session, data: BillCreate):
    order = get_order(db, data.order_id)

    if order.order_status == OrderStatusEnum.billed:
        raise HTTPException(400, "Bill already generated for this order")
    if order.order_status == OrderStatusEnum.cancelled:
        raise HTTPException(400, "Cannot bill a cancelled order")

    existing = db.query(Bill).filter(Bill.order_id == data.order_id).first()
    if existing:
        raise HTTPException(400, "Bill already exists")

    if data.discount_amount is not None:
        order.discount_amount = data.discount_amount
    if data.discount_percent is not None:
        order.discount_percent = data.discount_percent
    if data.service_charge is not None:
        order.service_charge = data.service_charge
    _recalculate_order_totals(db, order)

    # Recalculate total_payable to include promo discount + SGST + CGST
    promo_amt  = float(getattr(data, 'promo_amount', 0) or 0)
    promo_code = getattr(data, 'promo_code', None) or None
    customer_id = getattr(data, 'customer_id', None)
    sgst_amt   = float(getattr(data, 'sgst_amount', 0) or 0)
    cgst_amt   = float(getattr(data, 'cgst_amount', 0) or 0)

    if promo_amt > 0:
        order.total_payable = max(0, float(order.total_payable) - promo_amt)
    if sgst_amt > 0 or cgst_amt > 0:
        order.total_payable = float(order.total_payable) + sgst_amt + cgst_amt

    db.commit()  # commit recalculated totals first

    # Now update new columns via raw SQL to avoid SQLAlchemy model mapping issues
    from sqlalchemy import text
    update_parts = ["updated_at = NOW()"]
    update_vals  = {"oid": order.order_id}
    if promo_code:
        update_parts.append("promo_code = :promo_code")
        update_vals["promo_code"] = promo_code
    if promo_amt > 0:
        update_parts.append("promo_amount = :promo_amount")
        update_vals["promo_amount"] = promo_amt
    if sgst_amt > 0:
        update_parts.append("sgst_amount = :sgst_amount")
        update_vals["sgst_amount"] = sgst_amt
    if cgst_amt > 0:
        update_parts.append("cgst_amount = :cgst_amount")
        update_vals["cgst_amount"] = cgst_amt
    if customer_id:
        update_parts.append("customer_id = :customer_id")
        update_vals["customer_id"] = customer_id
    if len(update_parts) > 1:
        try:
            db.execute(text(f'UPDATE "order" SET {", ".join(update_parts)} WHERE order_id = :oid'), update_vals)
            db.commit()
        except Exception as e:
            db.rollback()
            pass

    active_items = [i for i in order.items if not i.is_cancelled]

    bill_kwargs = dict(
        order_id          = data.order_id,
        company_unique_id = data.company_unique_id,
        subtotal          = order.subtotal,
        discount_amount   = order.discount_amount,
        discount_percent  = order.discount_percent,
        service_charge    = order.service_charge,
        tax_amount        = order.tax_amount,
        total_payable     = order.total_payable,
        amount_paid       = data.amount_paid,
        payment_method    = data.payment_method,
        payment_reference = data.payment_reference,
        is_paid           = float(data.amount_paid) >= float(order.total_payable),
        paid_at           = datetime.utcnow() if float(data.amount_paid) >= float(order.total_payable) else None,
        order_type        = order.order_type,
        table_name        = order.table.table_name if order.table else None,
        customer_name     = order.customer_name,
        customer_phone    = order.customer_phone,
        item_count        = len(active_items),
        print_count       = 1,
        last_printed_at   = datetime.utcnow(),
        created_by        = data.created_by,
    )

    # Add surcharge snapshot safely
    try:
        bill_kwargs['table_surcharge_amount'] = _safe_get(order, 'table_surcharge_amount', 0)
        bill_kwargs['table_surcharge_label']  = _safe_get(order, 'table_surcharge_label', None)
    except Exception:
        pass

    # Add SGST / CGST safely via raw SQL after insert (column may not exist on older DBs)
    _sgst_to_save = sgst_amt
    _cgst_to_save = cgst_amt

    bill = Bill(**bill_kwargs)
    db.add(bill)
    db.flush()

    from sqlalchemy import func, extract
    year  = datetime.utcnow().year
    count = db.query(func.count(Bill.bill_id)).filter(
        extract('year', Bill.created_at) == year
    ).scalar() or 0
    bill.bill_number = f"BILL-{year}-{str(count).zfill(4)}"

    order.order_status = OrderStatusEnum.billed
    order.billed_at    = datetime.utcnow()
    order.updated_at   = datetime.utcnow()

    # Update new bill columns via raw SQL
    bill_update_parts = ["updated_at = NOW()"]
    bill_update_vals  = {"bid": bill.bill_id}
    if promo_code:
        bill_update_parts.append("promo_code = :promo_code")
        bill_update_vals["promo_code"] = promo_code
    if promo_amt > 0:
        bill_update_parts.append("promo_amount = :promo_amount")
        bill_update_vals["promo_amount"] = promo_amt
    if _sgst_to_save > 0:
        bill_update_parts.append("sgst_amount = :sgst_amount")
        bill_update_vals["sgst_amount"] = _sgst_to_save
    if _cgst_to_save > 0:
        bill_update_parts.append("cgst_amount = :cgst_amount")
        bill_update_vals["cgst_amount"] = _cgst_to_save
    if customer_id:
        bill_update_parts.append("customer_id = :customer_id")
        bill_update_vals["customer_id"] = customer_id
    if len(bill_update_parts) > 1:
        try:
            db.execute(text(f'UPDATE bill SET {", ".join(bill_update_parts)} WHERE bill_id = :bid'), bill_update_vals)
        except Exception:
            pass

    # Update CRM customer stats
    if customer_id:
        try:
            crm_cust = db.query(CrmCustomer).filter(CrmCustomer.customer_id == customer_id).first()
            if crm_cust:
                crm_cust.total_visits = (crm_cust.total_visits or 0) + 1
                crm_cust.total_spend  = float(crm_cust.total_spend or 0) + float(order.total_payable or 0)
                crm_cust.updated_at   = datetime.utcnow()
        except Exception:
            pass

    # Free table
    if order.table_id:
        table = db.query(RestaurantTable).filter(
            RestaurantTable.table_id == order.table_id
        ).first()
        if table:
            try:
                table.active_order_count = max(_safe_get(table, 'active_order_count', 1) - 1, 0)
                table.occupied_seats     = max(_safe_get(table, 'occupied_seats', 0) - (order.covers or 1), 0)
                table.table_status       = TableStatusEnum.free if table.active_order_count == 0 else TableStatusEnum.occupied
            except Exception:
                table.table_status = TableStatusEnum.free
            table.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(bill)
    return bill


def print_bill(db: Session, bill_id: int):
    bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    bill.print_count    += 1
    bill.last_printed_at = datetime.utcnow()
    db.commit()
    db.refresh(bill)
    return bill


def update_order_post_bill_status(db: Session, order_id: int, data: OrderStatusUpdateRequest):
    order = get_order(db, order_id)
    if order.order_status != OrderStatusEnum.billed:
        raise HTTPException(400, "Order must be billed before marking as picked up")

    allowed = {OrderStatusEnum.picked_up, OrderStatusEnum.picked_up_by_delivery_agent}
    if data.order_status not in allowed:
        raise HTTPException(400, f"Status must be one of: {[s.value for s in allowed]}")

    order.order_status = data.order_status
    order.completed_at = datetime.utcnow()
    if data.delivery_agent_name:
        order.delivery_agent_name  = data.delivery_agent_name
    if data.delivery_agent_phone:
        order.delivery_agent_phone = data.delivery_agent_phone
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    return order