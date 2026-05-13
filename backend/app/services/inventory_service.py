"""
Inventory Service Layer — Business Logic for all 8 modules.
Every stock-changing operation updates StockBalance atomically.
"""

from sqlalchemy.orm import Session
from sqlalchemy import func, text
from datetime import datetime, date
from decimal import Decimal
from fastapi import HTTPException

from app.models.inventory_models import (
    UnitOfMeasure, ItemCategory, InventoryItem, InventoryNode,
    StockBalance, Supplier, SupplierRateCard, SupplierPaymentLedger,
    PurchaseOrder, PurchaseOrderItem, GoodsReceiptNote, GoodsReceiptNoteItem,
    StockTransfer, StockTransferItem, Recipe, RecipeIngredient,
    StockConsumption, StockConsumptionItem, WasteEntry, StockAudit, StockAuditItem,
)
from app.schemas.inventory_schemas import (
    UOMCreate, UOMUpdate, ItemCategoryCreate, ItemCategoryUpdate,
    InventoryItemCreate, InventoryItemUpdate, InventoryNodeCreate, InventoryNodeUpdate,
    SupplierCreate, SupplierUpdate, SupplierRateCardCreate, SupplierPaymentLedgerCreate,
    PurchaseOrderCreate, PurchaseOrderUpdate, GRNCreate, GRNUpdate,
    StockTransferCreate, StockTransferUpdate,
    RecipeCreate, RecipeUpdate,
    StockConsumptionCreate, WasteEntryCreate, WasteEntryUpdate,
    StockAuditCreate, StockAuditUpdate,
)


# ─────────────────────────────────────────────
# HELPER — update stock balance atomically
# ─────────────────────────────────────────────

def _adjust_balance(db: Session, company_unique_id: int, node_id: int, item_id: int, delta: Decimal):
    """
    Add delta (positive=in, negative=out) to node's item balance.
    Finds existing row by (node_id, item_id) — unique constraint.
    If not found, creates new row under the given company_unique_id.
    This handles cross-company transfers correctly:
      - Stock at node_id=1 (WH) stored under company_unique_id=1
      - Stock at node_id=3 (Dharmatala) stored under company_unique_id=1 initially
      - After transfer, Dharmatala stock stored under company_unique_id=1, node_id=3
    """
    # Always find by node_id + item_id (unique constraint, ignores company)
    balance = db.query(StockBalance).filter(
        StockBalance.node_id == node_id,
        StockBalance.item_id == item_id,
    ).with_for_update().first()

    if balance:
        balance.qty_on_hand += delta
        balance.last_updated = datetime.utcnow()
    else:
        # Create new balance row under the given company_unique_id
        balance = StockBalance(
            company_unique_id=company_unique_id,
            node_id=node_id,
            item_id=item_id,
            qty_on_hand=max(Decimal("0"), delta),
        )
        db.add(balance)


# ─────────────────────────────────────────────
# 1. UNIT OF MEASURE
# ─────────────────────────────────────────────

def create_uom(db: Session, data: UOMCreate):
    obj = UnitOfMeasure(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj

def get_all_uoms(db: Session, company_id: int):
    return db.query(UnitOfMeasure).filter(
        UnitOfMeasure.company_unique_id == company_id,
        UnitOfMeasure.is_active == True,
    ).order_by(UnitOfMeasure.uom_name).all()

def get_uom(db: Session, uom_id: int):
    return db.query(UnitOfMeasure).filter(UnitOfMeasure.uom_id == uom_id).first()

def update_uom(db: Session, uom_id: int, data: UOMUpdate):
    obj = get_uom(db, uom_id)
    if not obj: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    obj.updated_at = datetime.utcnow()
    db.commit(); db.refresh(obj)
    return obj

def delete_uom(db: Session, uom_id: int):
    obj = get_uom(db, uom_id)
    if not obj: return None
    obj.is_active = False; obj.updated_at = datetime.utcnow()
    db.commit(); return obj


# ─────────────────────────────────────────────
# 1b. ITEM CATEGORY
# ─────────────────────────────────────────────

def create_item_category(db: Session, data: ItemCategoryCreate):
    obj = ItemCategory(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj

def get_all_item_categories(db: Session, company_id: int):
    return db.query(ItemCategory).filter(
        ItemCategory.company_unique_id == company_id,
        ItemCategory.is_active == True,
    ).order_by(ItemCategory.category_name).all()

def get_item_category(db: Session, item_category_id: int):
    return db.query(ItemCategory).filter(ItemCategory.item_category_id == item_category_id).first()

def update_item_category(db: Session, item_category_id: int, data: ItemCategoryUpdate):
    obj = get_item_category(db, item_category_id)
    if not obj: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    obj.updated_at = datetime.utcnow()
    db.commit(); db.refresh(obj)
    return obj

def delete_item_category(db: Session, item_category_id: int):
    obj = get_item_category(db, item_category_id)
    if not obj: return None
    obj.is_active = False; obj.updated_at = datetime.utcnow()
    db.commit(); return obj


# ─────────────────────────────────────────────
# 1c. INVENTORY ITEM
# ─────────────────────────────────────────────

def create_inventory_item(db: Session, data: InventoryItemCreate):
    obj = InventoryItem(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj

def get_all_inventory_items(db: Session, company_id: int):
    return db.query(InventoryItem).filter(
        InventoryItem.company_unique_id == company_id,
        InventoryItem.is_active == True,
    ).order_by(InventoryItem.item_name).all()

def get_inventory_item(db: Session, item_id: int):
    return db.query(InventoryItem).filter(InventoryItem.item_id == item_id).first()

def update_inventory_item(db: Session, item_id: int, data: InventoryItemUpdate):
    obj = get_inventory_item(db, item_id)
    if not obj: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    obj.updated_at = datetime.utcnow()
    db.commit(); db.refresh(obj)
    return obj

def delete_inventory_item(db: Session, item_id: int):
    obj = get_inventory_item(db, item_id)
    if not obj: return None
    obj.is_active = False; obj.updated_at = datetime.utcnow()
    db.commit(); return obj


# ─────────────────────────────────────────────
# NODE
# ─────────────────────────────────────────────

def create_node(db: Session, data: InventoryNodeCreate):
    obj = InventoryNode(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj

def get_all_nodes(db: Session, company_id: int):
    return db.query(InventoryNode).filter(
        InventoryNode.company_unique_id == company_id,
        InventoryNode.is_active == True,
    ).all()

def get_node(db: Session, node_id: int):
    return db.query(InventoryNode).filter(InventoryNode.node_id == node_id).first()

def update_node(db: Session, node_id: int, data: InventoryNodeUpdate):
    obj = get_node(db, node_id)
    if not obj: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    obj.updated_at = datetime.utcnow()
    db.commit(); db.refresh(obj)
    return obj

def delete_node(db: Session, node_id: int):
    obj = get_node(db, node_id)
    if not obj: return None
    obj.is_active = False; obj.updated_at = datetime.utcnow()
    db.commit(); return obj


# ─────────────────────────────────────────────
# STOCK BALANCE READ
# ─────────────────────────────────────────────

def get_stock_balance(db: Session, company_id: int, node_id: int = None):
    q = db.query(StockBalance).filter(StockBalance.company_unique_id == company_id)
    if node_id:
        q = q.filter(StockBalance.node_id == node_id)
    return q.all()

def get_low_stock(db: Session, company_id: int):
    """Items where balance ≤ reorder_level."""
    results = (
        db.query(StockBalance, InventoryItem)
        .join(InventoryItem, InventoryItem.item_id == StockBalance.item_id)
        .filter(
            StockBalance.company_unique_id == company_id,
            InventoryItem.is_active == True,
            StockBalance.qty_on_hand <= InventoryItem.reorder_level,
        )
        .all()
    )
    out = []
    for bal, item in results:
        out.append({
            "item_id": item.item_id,
            "item_name": item.item_name,
            "node_id": bal.node_id,
            "qty_on_hand": bal.qty_on_hand,
            "reorder_level": item.reorder_level,
        })
    return out


# ─────────────────────────────────────────────
# 7. SUPPLIER
# ─────────────────────────────────────────────

def create_supplier(db: Session, data: SupplierCreate):
    obj = Supplier(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj

def get_all_suppliers(db: Session, company_id: int):
    return db.query(Supplier).filter(
        Supplier.company_unique_id == company_id,
        Supplier.is_active == True,
    ).order_by(Supplier.supplier_name).all()

def get_supplier(db: Session, supplier_id: int):
    return db.query(Supplier).filter(Supplier.supplier_id == supplier_id).first()

def update_supplier(db: Session, supplier_id: int, data: SupplierUpdate):
    obj = get_supplier(db, supplier_id)
    if not obj: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    obj.updated_at = datetime.utcnow()
    db.commit(); db.refresh(obj)
    return obj

def delete_supplier(db: Session, supplier_id: int):
    obj = get_supplier(db, supplier_id)
    if not obj: return None
    obj.is_active = False; obj.updated_at = datetime.utcnow()
    db.commit(); return obj

def create_rate_card(db: Session, data: SupplierRateCardCreate):
    obj = SupplierRateCard(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj

def get_rate_cards(db: Session, supplier_id: int):
    return db.query(SupplierRateCard).filter(
        SupplierRateCard.supplier_id == supplier_id,
        SupplierRateCard.is_active == True,
    ).all()

def create_payment_ledger(db: Session, data: SupplierPaymentLedgerCreate):
    obj = SupplierPaymentLedger(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj

def get_payment_ledger(db: Session, supplier_id: int):
    return db.query(SupplierPaymentLedger).filter(
        SupplierPaymentLedger.supplier_id == supplier_id,
    ).order_by(SupplierPaymentLedger.transaction_date.desc()).all()

def get_supplier_outstanding(db: Session, supplier_id: int):
    """
    Outstanding = invoices - payments - debit_notes
    invoice    → increases outstanding (you owe supplier)
    payment    → decreases outstanding (you paid supplier)
    debit_note → decreases outstanding (supplier owes you credit)
    """
    rows = db.query(
        SupplierPaymentLedger.transaction_type,
        func.sum(SupplierPaymentLedger.amount).label("total")
    ).filter(
        SupplierPaymentLedger.supplier_id == supplier_id
    ).group_by(SupplierPaymentLedger.transaction_type).all()

    totals = {row.transaction_type: row.total for row in rows}
    invoices     = totals.get("invoice",    Decimal("0")) or Decimal("0")
    payments     = totals.get("payment",    Decimal("0")) or Decimal("0")
    debit_notes  = totals.get("debit_note", Decimal("0")) or Decimal("0")
    return invoices - payments - debit_notes


# ─────────────────────────────────────────────
# 2. PURCHASE ORDER
# ─────────────────────────────────────────────

def create_po(db: Session, data: PurchaseOrderCreate):
    items = data.items
    po_data = data.model_dump(exclude={"items"})
    po = PurchaseOrder(**po_data)
    db.add(po); db.flush()
    for it in items:
        poi = PurchaseOrderItem(
            company_unique_id=po.company_unique_id,
            po_id=po.po_id,
            **it.model_dump()
        )
        db.add(poi)
    db.commit(); db.refresh(po)
    return _po_with_items(db, po.po_id)

def _po_with_items(db: Session, po_id: int):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.po_id == po_id).first()
    if po:
        po.items = db.query(PurchaseOrderItem).filter(PurchaseOrderItem.po_id == po_id, PurchaseOrderItem.is_active == True).all()
    return po

def get_all_pos(db: Session, company_id: int):
    pos = db.query(PurchaseOrder).filter(
        PurchaseOrder.company_unique_id == company_id,
        PurchaseOrder.is_active == True,
    ).order_by(PurchaseOrder.po_date.desc()).all()
    for po in pos:
        po.items = db.query(PurchaseOrderItem).filter(PurchaseOrderItem.po_id == po.po_id, PurchaseOrderItem.is_active == True).all()
    return pos

def get_po(db: Session, po_id: int):
    return _po_with_items(db, po_id)

def update_po(db: Session, po_id: int, data: PurchaseOrderUpdate):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.po_id == po_id).first()
    if not po: return None

    update_data = data.model_dump(exclude_unset=True)
    items_data  = update_data.pop('items', None)

    # Update header fields
    for k, v in update_data.items():
        setattr(po, k, v)
    po.updated_at = datetime.utcnow()

    # Update line items if provided
    if items_data is not None:
        # Soft-delete existing items
        db.query(PurchaseOrderItem).filter(
            PurchaseOrderItem.po_id == po_id,
            PurchaseOrderItem.is_active == True,
        ).update({'is_active': False})

        # Insert new items
        for it in items_data:
            new_item = PurchaseOrderItem(
                company_unique_id = po.company_unique_id,
                po_id             = po_id,
                item_id           = it.get('item_id'),
                ordered_qty       = it.get('ordered_qty'),
                unit_price        = it.get('unit_price', 0),
            )
            db.add(new_item)

    db.commit()
    return _po_with_items(db, po_id)

def delete_po(db: Session, po_id: int):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.po_id == po_id).first()
    if not po: return None
    po.is_active = False; po.updated_at = datetime.utcnow()
    db.commit(); return po


# ─────────────────────────────────────────────
# 2b. GRN — posts to StockBalance on status=posted
# ─────────────────────────────────────────────

def create_grn(db: Session, data: GRNCreate):
    items = data.items
    grn_data = data.model_dump(exclude={"items"})
    grn = GoodsReceiptNote(**grn_data)
    db.add(grn); db.flush()
    for it in items:
        gi = GoodsReceiptNoteItem(
            company_unique_id=grn.company_unique_id,
            grn_id=grn.grn_id,
            **it.model_dump()
        )
        db.add(gi)
    db.commit(); db.refresh(grn)
    return _grn_with_items(db, grn.grn_id)

def _grn_with_items(db: Session, grn_id: int):
    grn = db.query(GoodsReceiptNote).filter(GoodsReceiptNote.grn_id == grn_id).first()
    if grn:
        grn.items = db.query(GoodsReceiptNoteItem).filter(GoodsReceiptNoteItem.grn_id == grn_id, GoodsReceiptNoteItem.is_active == True).all()
    return grn

def get_all_grns(db: Session, company_id: int):
    grns = db.query(GoodsReceiptNote).filter(
        GoodsReceiptNote.company_unique_id == company_id,
        GoodsReceiptNote.is_active == True,
    ).order_by(GoodsReceiptNote.grn_date.desc()).all()
    for grn in grns:
        grn.items = db.query(GoodsReceiptNoteItem).filter(GoodsReceiptNoteItem.grn_id == grn.grn_id, GoodsReceiptNoteItem.is_active == True).all()
    return grns

def get_grn(db: Session, grn_id: int):
    return _grn_with_items(db, grn_id)

def post_grn(db: Session, grn_id: int, posted_by: str = None):
    """
    Post a GRN:
    1. Block if already posted
    2. Block if over-receipt vs PO ordered qty
    3. Add items to StockBalance
    4. Auto-update PO status (received / partially_received)
    5. Create Payment Ledger invoice entry automatically
    """
    grn = _grn_with_items(db, grn_id)
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    if grn.status == "posted":
        raise HTTPException(status_code=400, detail="GRN already posted — cannot post again")
    if not grn.node_id:
        raise HTTPException(status_code=400, detail="GRN has no receiving node")

    # ── Validate: check over-receipt vs PO ordered qty ────────
    if grn.po_id:
        po = db.query(PurchaseOrder).filter(PurchaseOrder.po_id == grn.po_id).first()
        if po:
            po_items_map = {pi.item_id: pi.ordered_qty for pi in
                           db.query(PurchaseOrderItem).filter(
                               PurchaseOrderItem.po_id == po.po_id,
                               PurchaseOrderItem.is_active == True
                           ).all()}

            # Sum all previously posted GRNs for this PO
            posted_grns = db.query(GoodsReceiptNote).filter(
                GoodsReceiptNote.po_id == grn.po_id,
                GoodsReceiptNote.status == "posted",
                GoodsReceiptNote.is_active == True,
                GoodsReceiptNote.grn_id != grn_id,
            ).all()

            already_received = {}
            for pg in posted_grns:
                pg_items = db.query(GoodsReceiptNoteItem).filter(
                    GoodsReceiptNoteItem.grn_id == pg.grn_id,
                    GoodsReceiptNoteItem.is_active == True,
                ).all()
                for pi in pg_items:
                    already_received[pi.item_id] = already_received.get(pi.item_id, Decimal("0")) + pi.received_qty

            # Check this GRN won't exceed PO qty
            for item in grn.items:
                if item.item_id and item.item_id in po_items_map:
                    ordered = po_items_map[item.item_id]
                    prev_received = already_received.get(item.item_id, Decimal("0"))
                    total_after = prev_received + item.received_qty
                    if total_after > ordered:
                        inv_item = db.query(InventoryItem).filter(InventoryItem.item_id == item.item_id).first()
                        item_name = inv_item.item_name if inv_item else f"Item #{item.item_id}"
                        raise HTTPException(
                            status_code=400,
                            detail=f"Over-receipt for '{item_name}': PO ordered {ordered}, "
                                   f"already received {prev_received}, this GRN adds {item.received_qty} "
                                   f"(total would be {total_after})"
                        )

    # ── Add stock to balance ──────────────────────────────────
    for item in grn.items:
        if item.item_id:
            _adjust_balance(db, grn.company_unique_id, grn.node_id, item.item_id, item.received_qty)

    grn.status = "posted"
    grn.updated_at = datetime.utcnow()
    if posted_by:
        grn.updated_by = posted_by

    # ── Auto-update PO status ────────────────────────────────
    if grn.po_id:
        po = db.query(PurchaseOrder).filter(PurchaseOrder.po_id == grn.po_id).first()
        if po:
            po_items = db.query(PurchaseOrderItem).filter(
                PurchaseOrderItem.po_id == po.po_id,
                PurchaseOrderItem.is_active == True,
            ).all()
            po_ordered = {pi.item_id: pi.ordered_qty for pi in po_items}

            # Sum ALL posted GRNs including this one
            all_posted_grns = db.query(GoodsReceiptNote).filter(
                GoodsReceiptNote.po_id == grn.po_id,
                GoodsReceiptNote.is_active == True,
            ).all()

            total_received = {}
            for pg in all_posted_grns:
                grn_items_q = db.query(GoodsReceiptNoteItem).filter(
                    GoodsReceiptNoteItem.grn_id == pg.grn_id,
                    GoodsReceiptNoteItem.is_active == True,
                ).all()
                for gi in grn_items_q:
                    total_received[gi.item_id] = total_received.get(gi.item_id, Decimal("0")) + gi.received_qty
            # Include current GRN items
            for item in grn.items:
                if item.item_id:
                    total_received[item.item_id] = total_received.get(item.item_id, Decimal("0")) + item.received_qty

            # Check if all items fully received
            fully_received = all(
                total_received.get(item_id, Decimal("0")) >= ordered_qty
                for item_id, ordered_qty in po_ordered.items()
            )
            po.status = "received" if fully_received else "partially_received"
            po.updated_at = datetime.utcnow()

    # ── Auto-create Payment Ledger invoice entry ─────────────
    if grn.supplier_id and grn.total_amount and grn.total_amount > 0:
        invoice_entry = SupplierPaymentLedger(
            company_unique_id  = grn.company_unique_id,
            supplier_id        = grn.supplier_id,
            transaction_type   = "invoice",
            amount             = grn.total_amount,
            transaction_date   = grn.grn_date,
            reference_no       = grn.invoice_number or grn.grn_number,
            notes              = f"Auto-created from GRN {grn.grn_number}",
        )
        db.add(invoice_entry)

    db.commit()
    return _grn_with_items(db, grn_id)

def update_grn(db: Session, grn_id: int, data: GRNUpdate):
    grn = db.query(GoodsReceiptNote).filter(GoodsReceiptNote.grn_id == grn_id).first()
    if not grn: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(grn, k, v)
    grn.updated_at = datetime.utcnow()
    db.commit()
    return _grn_with_items(db, grn_id)

def delete_grn(db: Session, grn_id: int):
    grn = db.query(GoodsReceiptNote).filter(GoodsReceiptNote.grn_id == grn_id).first()
    if not grn: return None
    if grn.status == "posted":
        raise HTTPException(status_code=400, detail="Cannot delete a posted GRN")
    grn.is_active = False; grn.updated_at = datetime.utcnow()
    db.commit(); return grn


# ─────────────────────────────────────────────
# STOCK TRANSFER
# ─────────────────────────────────────────────

def create_transfer(db: Session, data: StockTransferCreate):
    items = data.items
    tr_data = data.model_dump(exclude={"items"})
    tr = StockTransfer(**tr_data)
    db.add(tr); db.flush()
    for it in items:
        sti = StockTransferItem(
            company_unique_id=tr.company_unique_id,
            transfer_id=tr.transfer_id,
            **it.model_dump()
        )
        db.add(sti)
    db.commit(); db.refresh(tr)
    return _transfer_with_items(db, tr.transfer_id)

def _transfer_with_items(db: Session, transfer_id: int):
    tr = db.query(StockTransfer).filter(StockTransfer.transfer_id == transfer_id).first()
    if tr:
        tr.items = db.query(StockTransferItem).filter(StockTransferItem.transfer_id == transfer_id, StockTransferItem.is_active == True).all()
    return tr

def get_all_transfers(db: Session, company_id: int):
    trs = db.query(StockTransfer).filter(
        StockTransfer.company_unique_id == company_id,
        StockTransfer.is_active == True,
    ).order_by(StockTransfer.transfer_date.desc()).all()
    for tr in trs:
        tr.items = db.query(StockTransferItem).filter(StockTransferItem.transfer_id == tr.transfer_id, StockTransferItem.is_active == True).all()
    return trs

def get_transfer(db: Session, transfer_id: int):
    return _transfer_with_items(db, transfer_id)

def approve_transfer(db: Session, transfer_id: int, approved_by: str = None):
    tr = _transfer_with_items(db, transfer_id)
    if not tr:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if tr.status not in ("draft", "pending_approval"):
        raise HTTPException(status_code=400, detail=f"Cannot approve transfer in status: {tr.status}")
    if not tr.from_node_id or not tr.to_node_id:
        raise HTTPException(status_code=400, detail="Transfer must have both from and to nodes")

    # Deduct from sender, credit to receiver
    for item in tr.items:
        if item.item_id:
            qty = item.approved_qty if item.approved_qty is not None else item.requested_qty
            _adjust_balance(db, tr.company_unique_id, tr.from_node_id, item.item_id, -qty)
            _adjust_balance(db, tr.company_unique_id, tr.to_node_id, item.item_id, qty)
            item.approved_qty = qty

    tr.status = "dispatched"
    tr.approved_by = approved_by
    tr.approved_at = datetime.utcnow()
    tr.updated_at = datetime.utcnow()
    db.commit()
    return _transfer_with_items(db, transfer_id)

def update_transfer(db: Session, transfer_id: int, data: StockTransferUpdate):
    tr = db.query(StockTransfer).filter(StockTransfer.transfer_id == transfer_id).first()
    if not tr: return None

    # Update header fields
    update_data = data.model_dump(exclude_unset=True)
    items_data  = update_data.pop('items', None)  # extract items separately
    for k, v in update_data.items():
        setattr(tr, k, v)
    tr.updated_at = datetime.utcnow()

    # Update line items if provided
    if items_data is not None:
        # Soft-delete existing items
        existing = db.query(StockTransferItem).filter(
            StockTransferItem.transfer_id == transfer_id,
            StockTransferItem.is_active   == True,
        ).all()
        for item in existing:
            item.is_active = False

        # Insert new items
        for it in items_data:
            new_item = StockTransferItem(
                company_unique_id = tr.company_unique_id,
                transfer_id       = transfer_id,
                item_id           = it.get('item_id'),
                requested_qty     = it.get('requested_qty'),
            )
            db.add(new_item)

    db.commit()
    return _transfer_with_items(db, transfer_id)

def delete_transfer(db: Session, transfer_id: int):
    tr = db.query(StockTransfer).filter(StockTransfer.transfer_id == transfer_id).first()
    if not tr: return None
    if tr.status == "dispatched":
        raise HTTPException(status_code=400, detail="Cannot delete a dispatched transfer")
    tr.is_active = False; tr.updated_at = datetime.utcnow()
    db.commit(); return tr


# ─────────────────────────────────────────────
# 6. RECIPE
# ─────────────────────────────────────────────

def _calc_recipe_cost(db: Session, ingredients):
    """Sum ingredient costs."""
    total = Decimal("0")
    for ing in ingredients:
        total += Decimal(str(ing.qty)) * Decimal(str(ing.unit_cost or 0))
    return total

def create_recipe(db: Session, data: RecipeCreate):
    ingredients = data.ingredients
    recipe_data = data.model_dump(exclude={"ingredients"})
    recipe = Recipe(**recipe_data)
    db.add(recipe); db.flush()
    for ing in ingredients:
        ri = RecipeIngredient(
            company_unique_id=recipe.company_unique_id,
            recipe_id=recipe.recipe_id,
            **ing.model_dump()
        )
        db.add(ri)
    db.flush()
    # Calculate cost
    all_ings = db.query(RecipeIngredient).filter(RecipeIngredient.recipe_id == recipe.recipe_id).all()
    recipe.total_cost = _calc_recipe_cost(db, all_ings)
    db.commit(); db.refresh(recipe)
    return _recipe_with_ingredients(db, recipe.recipe_id)

def _recipe_with_ingredients(db: Session, recipe_id: int):
    recipe = db.query(Recipe).filter(Recipe.recipe_id == recipe_id).first()
    if recipe:
        recipe.ingredients = db.query(RecipeIngredient).filter(
            RecipeIngredient.recipe_id == recipe_id,
            RecipeIngredient.is_active == True
        ).all()
    return recipe

def get_all_recipes(db: Session, company_id: int):
    recipes = db.query(Recipe).filter(
        Recipe.company_unique_id == company_id,
        Recipe.is_active == True,
    ).order_by(Recipe.recipe_name).all()
    for r in recipes:
        r.ingredients = db.query(RecipeIngredient).filter(
            RecipeIngredient.recipe_id == r.recipe_id,
            RecipeIngredient.is_active == True
        ).all()
    return recipes

def get_recipe(db: Session, recipe_id: int):
    return _recipe_with_ingredients(db, recipe_id)

def update_recipe(db: Session, recipe_id: int, data: RecipeUpdate):
    recipe = db.query(Recipe).filter(Recipe.recipe_id == recipe_id).first()
    if not recipe: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(recipe, k, v)
    recipe.updated_at = datetime.utcnow()
    db.commit()
    return _recipe_with_ingredients(db, recipe_id)

def delete_recipe(db: Session, recipe_id: int):
    recipe = db.query(Recipe).filter(Recipe.recipe_id == recipe_id).first()
    if not recipe: return None
    recipe.is_active = False; recipe.updated_at = datetime.utcnow()
    db.commit(); return recipe


# ─────────────────────────────────────────────
# 3. STOCK CONSUMPTION
# ─────────────────────────────────────────────

def create_consumption(db: Session, data: StockConsumptionCreate):
    items = data.items
    cons_data = data.model_dump(exclude={"items"})
    cons = StockConsumption(**cons_data)
    db.add(cons); db.flush()
    for it in items:
        ci = StockConsumptionItem(
            company_unique_id=cons.company_unique_id,
            consumption_id=cons.consumption_id,
            **it.model_dump()
        )
        db.add(ci)
        # Deduct from stock
        if it.item_id and cons.node_id:
            _adjust_balance(db, cons.company_unique_id, cons.node_id, it.item_id, -it.qty_consumed)
    db.commit(); db.refresh(cons)
    return _consumption_with_items(db, cons.consumption_id)

def _consumption_with_items(db: Session, consumption_id: int):
    cons = db.query(StockConsumption).filter(StockConsumption.consumption_id == consumption_id).first()
    if cons:
        cons.items = db.query(StockConsumptionItem).filter(
            StockConsumptionItem.consumption_id == consumption_id,
            StockConsumptionItem.is_active == True
        ).all()
    return cons

def get_all_consumptions(db: Session, company_id: int):
    conss = db.query(StockConsumption).filter(
        StockConsumption.company_unique_id == company_id,
        StockConsumption.is_active == True,
    ).order_by(StockConsumption.consumption_date.desc()).all()
    for c in conss:
        c.items = db.query(StockConsumptionItem).filter(
            StockConsumptionItem.consumption_id == c.consumption_id,
            StockConsumptionItem.is_active == True
        ).all()
    return conss


# ─────────────────────────────────────────────
# 4. WASTE
# ─────────────────────────────────────────────

def create_waste(db: Session, data: WasteEntryCreate):
    waste = WasteEntry(**data.model_dump())
    db.add(waste); db.flush()
    # Deduct from stock
    if waste.item_id and waste.node_id:
        _adjust_balance(db, waste.company_unique_id, waste.node_id, waste.item_id, -waste.qty_wasted)
    db.commit(); db.refresh(waste)
    return waste

def get_all_waste(db: Session, company_id: int):
    return db.query(WasteEntry).filter(
        WasteEntry.company_unique_id == company_id,
        WasteEntry.is_active == True,
    ).order_by(WasteEntry.waste_date.desc()).all()

def get_waste(db: Session, waste_id: int):
    return db.query(WasteEntry).filter(WasteEntry.waste_id == waste_id).first()

def update_waste(db: Session, waste_id: int, data: WasteEntryUpdate):
    waste = get_waste(db, waste_id)
    if not waste: return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(waste, k, v)
    waste.updated_at = datetime.utcnow()
    db.commit(); db.refresh(waste)
    return waste

def delete_waste(db: Session, waste_id: int):
    waste = get_waste(db, waste_id)
    if not waste: return None
    waste.is_active = False; waste.updated_at = datetime.utcnow()
    db.commit(); return waste


# ─────────────────────────────────────────────
# 5. STOCK AUDIT
# ─────────────────────────────────────────────

def create_audit(db: Session, data: StockAuditCreate):
    items = data.items
    audit_data = data.model_dump(exclude={"items"})
    audit = StockAudit(**audit_data)
    db.add(audit); db.flush()
    for it in items:
        variance_qty = it.physical_qty - it.system_qty
        variance_value = variance_qty * (it.unit_cost or Decimal("0"))
        ai = StockAuditItem(
            company_unique_id=audit.company_unique_id,
            audit_id=audit.audit_id,
            item_id=it.item_id,
            system_qty=it.system_qty,
            physical_qty=it.physical_qty,
            variance_qty=variance_qty,
            unit_cost=it.unit_cost or Decimal("0"),
            variance_value=variance_value,
            notes=it.notes,
        )
        db.add(ai)
    db.commit(); db.refresh(audit)
    return _audit_with_items(db, audit.audit_id)

def _audit_with_items(db: Session, audit_id: int):
    audit = db.query(StockAudit).filter(StockAudit.audit_id == audit_id).first()
    if audit:
        audit.items = db.query(StockAuditItem).filter(
            StockAuditItem.audit_id == audit_id,
            StockAuditItem.is_active == True
        ).all()
    return audit

def get_all_audits(db: Session, company_id: int):
    audits = db.query(StockAudit).filter(
        StockAudit.company_unique_id == company_id,
        StockAudit.is_active == True,
    ).order_by(StockAudit.audit_date.desc()).all()
    for a in audits:
        a.items = db.query(StockAuditItem).filter(
            StockAuditItem.audit_id == a.audit_id,
            StockAuditItem.is_active == True
        ).all()
    return audits

def get_audit(db: Session, audit_id: int):
    return _audit_with_items(db, audit_id)

def post_audit(db: Session, audit_id: int, posted_by: str = None):
    """
    Post audit: adjust StockBalance by variance for each item at node.
    variance_qty = physical - system; positive means we have more, negative less.
    """
    audit = _audit_with_items(db, audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    if audit.status == "posted":
        raise HTTPException(status_code=400, detail="Audit already posted")
    if not audit.node_id:
        raise HTTPException(status_code=400, detail="Audit has no node")

    for item in audit.items:
        if item.item_id and item.variance_qty != 0:
            _adjust_balance(db, audit.company_unique_id, audit.node_id, item.item_id, item.variance_qty)

    audit.status = "posted"
    audit.posted_at = datetime.utcnow()
    audit.posted_by = posted_by
    db.commit()
    return _audit_with_items(db, audit_id)

def delete_audit(db: Session, audit_id: int):
    audit = db.query(StockAudit).filter(StockAudit.audit_id == audit_id).first()
    if not audit: return None
    if audit.status == "posted":
        raise HTTPException(status_code=400, detail="Cannot delete a posted audit")
    audit.is_active = False
    db.commit(); return audit


# ─────────────────────────────────────────────
# 8. REPORTS (SQL queries, no extra tables)
# ─────────────────────────────────────────────

def report_stock_movement(db: Session, company_id: int, node_id: int = None, item_id: int = None, from_date: date = None, to_date: date = None):
    """Aggregated stock movement: GRN (in), consumption (out), waste (out), transfer (in/out)."""
    rows = []

    # GRN IN
    q = db.query(
        GoodsReceiptNoteItem.item_id,
        func.sum(GoodsReceiptNoteItem.received_qty).label("qty"),
        func.sum(GoodsReceiptNoteItem.received_qty * GoodsReceiptNoteItem.unit_price).label("value"),
    ).join(GoodsReceiptNote, GoodsReceiptNote.grn_id == GoodsReceiptNoteItem.grn_id).filter(
        GoodsReceiptNote.company_unique_id == company_id,
        GoodsReceiptNote.status == "posted",
        GoodsReceiptNote.is_active == True,
    )
    if node_id: q = q.filter(GoodsReceiptNote.node_id == node_id)
    if item_id: q = q.filter(GoodsReceiptNoteItem.item_id == item_id)
    if from_date: q = q.filter(GoodsReceiptNote.grn_date >= from_date)
    if to_date: q = q.filter(GoodsReceiptNote.grn_date <= to_date)
    for r in q.group_by(GoodsReceiptNoteItem.item_id).all():
        rows.append({"item_id": r.item_id, "type": "grn_in", "qty": r.qty, "value": r.value})

    # Consumption OUT
    q2 = db.query(
        StockConsumptionItem.item_id,
        func.sum(StockConsumptionItem.qty_consumed).label("qty"),
        func.sum(StockConsumptionItem.qty_consumed * StockConsumptionItem.unit_cost).label("value"),
    ).join(StockConsumption, StockConsumption.consumption_id == StockConsumptionItem.consumption_id).filter(
        StockConsumption.company_unique_id == company_id,
        StockConsumption.is_active == True,
    )
    if node_id: q2 = q2.filter(StockConsumption.node_id == node_id)
    if item_id: q2 = q2.filter(StockConsumptionItem.item_id == item_id)
    if from_date: q2 = q2.filter(StockConsumption.consumption_date >= from_date)
    if to_date: q2 = q2.filter(StockConsumption.consumption_date <= to_date)
    for r in q2.group_by(StockConsumptionItem.item_id).all():
        rows.append({"item_id": r.item_id, "type": "consumption_out", "qty": r.qty, "value": r.value})

    # Waste OUT
    q3 = db.query(
        WasteEntry.item_id,
        func.sum(WasteEntry.qty_wasted).label("qty"),
        func.sum(WasteEntry.total_cost).label("value"),
    ).filter(
        WasteEntry.company_unique_id == company_id,
        WasteEntry.is_active == True,
    )
    if node_id: q3 = q3.filter(WasteEntry.node_id == node_id)
    if item_id: q3 = q3.filter(WasteEntry.item_id == item_id)
    if from_date: q3 = q3.filter(WasteEntry.waste_date >= from_date)
    if to_date: q3 = q3.filter(WasteEntry.waste_date <= to_date)
    for r in q3.group_by(WasteEntry.item_id).all():
        rows.append({"item_id": r.item_id, "type": "waste_out", "qty": r.qty, "value": r.value})

    return rows


# ─────────────────────────────────────────────
# STOCK TRANSFER — NEW FLOW
# dispatch  → deduct from sender, stock goes "in transit"
# receive   → add to receiver (accept) OR return to sender (reject)
# ─────────────────────────────────────────────

def dispatch_transfer(db: Session, transfer_id: int, dispatched_by: str = None):
    """
    Sender clicks Dispatch:
    - Validates available stock before deducting
    - Deducts stock from from_node
    - Status → dispatched (in transit)
    - Does NOT add to to_node yet
    """
    tr = _transfer_with_items(db, transfer_id)
    if not tr:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if tr.status not in ("draft", "pending_approval"):
        raise HTTPException(status_code=400, detail=f"Cannot dispatch transfer in status: {tr.status}")
    if not tr.from_node_id or not tr.to_node_id:
        raise HTTPException(status_code=400, detail="Transfer must have both from and to nodes")

    # ── Validate stock availability before deducting ──────────
    # Note: stock balance uses node_id only — company_unique_id may differ
    # for branch transfers (branch cid=3 but stock stored under parent cid=1)
    for item in tr.items:
        if item.item_id:
            qty = item.requested_qty
            # Search by node_id + item_id only (not company_unique_id)
            balance = db.query(StockBalance).filter(
                StockBalance.node_id == tr.from_node_id,
                StockBalance.item_id == item.item_id,
            ).first()
            available = balance.qty_on_hand if balance else Decimal("0")
            if qty > available:
                from app.models.inventory_models import InventoryItem
                inv_item = db.query(InventoryItem).filter(InventoryItem.item_id == item.item_id).first()
                item_name = inv_item.item_name if inv_item else f"Item #{item.item_id}"
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for '{item_name}': requested {qty}, available {available}"
                )

    # Deduct from sender — _adjust_balance finds by node_id+item_id automatically
    for item in tr.items:
        if item.item_id:
            qty = item.requested_qty
            _adjust_balance(db, tr.company_unique_id, tr.from_node_id, item.item_id, -qty)
            item.approved_qty = qty

    tr.status     = "dispatched"
    tr.approved_by = dispatched_by
    tr.approved_at = datetime.utcnow()
    tr.updated_at  = datetime.utcnow()
    db.commit()
    return _transfer_with_items(db, transfer_id)


def receive_transfer(db: Session, transfer_id: int, received_by: str = None):
    """
    Receiver clicks Accept:
    - Adds stock to to_node
    - Status → received
    """
    tr = _transfer_with_items(db, transfer_id)
    if not tr:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if tr.status != "dispatched":
        raise HTTPException(status_code=400, detail="Only dispatched transfers can be received")

    for item in tr.items:
        if item.item_id:
            qty = item.approved_qty if item.approved_qty is not None else item.requested_qty
            _adjust_balance(db, tr.company_unique_id, tr.to_node_id, item.item_id, qty)
            item.received_qty = qty

    tr.status     = "received"
    tr.updated_by = received_by
    tr.updated_at = datetime.utcnow()
    db.commit()
    return _transfer_with_items(db, transfer_id)


def reject_transfer(db: Session, transfer_id: int, rejected_by: str = None):
    """
    Receiver clicks Reject:
    - Returns stock back to from_node
    - Status → rejected
    """
    tr = _transfer_with_items(db, transfer_id)
    if not tr:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if tr.status != "dispatched":
        raise HTTPException(status_code=400, detail="Only dispatched transfers can be rejected")

    # Return stock to sender
    for item in tr.items:
        if item.item_id:
            qty = item.approved_qty if item.approved_qty is not None else item.requested_qty
            _adjust_balance(db, tr.company_unique_id, tr.from_node_id, item.item_id, qty)

    tr.status     = "rejected"
    tr.updated_by = rejected_by
    tr.updated_at = datetime.utcnow()
    db.commit()
    return _transfer_with_items(db, transfer_id)


def get_incoming_transfers(db: Session, to_node_id: int, company_unique_id: int):
    """
    Incoming transfers for a receiver node.
    For company_unique_id=1 (parent/admin company), also include transfers
    going to any inv_node owned by that company (e.g. WH node_id=1, CK node_id=2).
    """
    from sqlalchemy import or_
    # Get all inv_node ids owned by this company
    owned_node_ids = [
        r[0] for r in db.execute(
            text("SELECT node_id FROM inv_node WHERE company_unique_id = :cid"),
            {"cid": company_unique_id}
        ).fetchall()
    ]
    # Always include the to_node_id itself (branch companies use their cid as node_id)
    all_node_ids = list(set([to_node_id] + owned_node_ids))

    trs = db.query(StockTransfer).filter(
        StockTransfer.to_node_id.in_(all_node_ids),
        StockTransfer.is_active == True,
    ).order_by(StockTransfer.transfer_date.desc()).all()
    for tr in trs:
        tr.items = db.query(StockTransferItem).filter(
            StockTransferItem.transfer_id == tr.transfer_id,
            StockTransferItem.is_active == True
        ).all()
    return trs


def get_all_transfers_admin(db: Session, company_id: int):
    """Admin sees ALL transfers for the company regardless of node."""
    trs = db.query(StockTransfer).filter(
        StockTransfer.company_unique_id == company_id,
        StockTransfer.is_active == True,
    ).order_by(StockTransfer.transfer_date.desc()).all()
    for tr in trs:
        tr.items = db.query(StockTransferItem).filter(
            StockTransferItem.transfer_id == tr.transfer_id,
            StockTransferItem.is_active == True
        ).all()
    return trs
