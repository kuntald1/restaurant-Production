"""
REPLACE create_order() in pos_service.py
Changes:
  - Reads surcharge_type + surcharge_amount from restaurant_table
  - Calculates surcharge based on covers (per_cover) or flat
  - Stores surcharge on order.table_surcharge_amount
  - Includes surcharge in total_payable calculation
"""

def create_order(db: Session, data: OrderCreate):
    table_name       = None
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
                400,
                f"Table {table.table_name} is reserved."
            )

        # ── Seat capacity check ───────────────────────────────
        covers_requested = data.covers or 1
        remaining_seats  = table.seats - (table.occupied_seats or 0)

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

        # ── Surcharge calculation ─────────────────────────────
        if table.surcharge_amount and float(table.surcharge_amount) > 0:
            if table.surcharge_type == "per_cover":
                # e.g. ₹30 × 4 covers = ₹120
                surcharge_amount = float(table.surcharge_amount) * covers_requested
            else:
                # flat = fixed amount regardless of covers
                # e.g. ₹30 flat for AC, ₹20 flat for Garden
                surcharge_amount = float(table.surcharge_amount)

            surcharge_label = table.surcharge_label or f"{table.section} Surcharge"

        table_name = table.table_name

    # ── Create order ──────────────────────────────────────────
    order = Order(
        company_unique_id       = data.company_unique_id,
        order_type              = data.order_type,
        order_status            = OrderStatusEnum.draft,
        table_id                = data.table_id,
        covers                  = data.covers or 1,
        customer_name           = data.customer_name,
        customer_phone          = data.customer_phone,
        delivery_address        = data.delivery_address,
        notes                   = data.notes,
        created_by              = data.created_by,
        table_surcharge_amount  = surcharge_amount,
        table_surcharge_label   = surcharge_label,
    )
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
            modifiers         = item_data.modifiers or [],
            is_veg            = item_data.is_veg,
            notes             = item_data.notes,
        )
        db.add(item)

    db.commit()
    db.refresh(order)
    _recalculate_order_totals(db, order)
    return order


# ── ALSO UPDATE this helper ───────────────────────────────────
def _recalculate_order_totals(db: Session, order: Order):
    """
    Recalculate subtotal and total_payable.
    total_payable = subtotal - discount + service_charge + tax + table_surcharge
    """
    active_items = [i for i in order.items if not i.is_cancelled]
    order.subtotal = sum(float(i.unit_price) * i.quantity for i in active_items)
    order.total_payable = (
        float(order.subtotal)
        - float(order.discount_amount or 0)
        + float(order.service_charge or 0)
        + float(order.tax_amount or 0)
        + float(order.table_surcharge_amount or 0)   # ← surcharge added here
    )
    db.commit()
    db.refresh(order)
