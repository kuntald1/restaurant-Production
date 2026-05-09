"""
Inventory Router — Fixed version.
Root cause of "No records found" bug:
  FastAPI matches routes top-to-bottom. When you have:
    GET /item/{company_id}          <- catches everything
    GET /item/detail/{item_id}      <- NEVER reached, "detail" treated as company_id = 0

Fix: all "list by company" routes now use /list/{company_id}
  GET /inventory/item/list/{company_id}   <- lists all items for company
  GET /inventory/item/{item_id}           <- gets one item
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date

from app.database import SessionLocal
from app.services import inventory_service as svc
from app.schemas.inventory_schemas import (
    UOMCreate, UOMUpdate, UOMResponse,
    ItemCategoryCreate, ItemCategoryUpdate, ItemCategoryResponse,
    InventoryItemCreate, InventoryItemUpdate, InventoryItemResponse,
    InventoryNodeCreate, InventoryNodeUpdate, InventoryNodeResponse,
    StockBalanceResponse,
    SupplierCreate, SupplierUpdate, SupplierResponse,
    SupplierRateCardCreate, SupplierRateCardResponse,
    SupplierPaymentLedgerCreate, SupplierPaymentLedgerResponse,
    PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderResponse,
    GRNCreate, GRNUpdate, GRNResponse,
    StockTransferCreate, StockTransferUpdate, StockTransferResponse,
    RecipeCreate, RecipeUpdate, RecipeResponse,
    StockConsumptionCreate, StockConsumptionResponse,
    WasteEntryCreate, WasteEntryUpdate, WasteEntryResponse,
    StockAuditCreate, StockAuditUpdate, StockAuditResponse,
)

router = APIRouter(prefix="/inventory", tags=["Inventory"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ════════════════════════════════════════════════════
# UNIT OF MEASURE
# ════════════════════════════════════════════════════

@router.post("/uom", response_model=UOMResponse)
def create_uom(data: UOMCreate, db: Session = Depends(get_db)):
    return svc.create_uom(db, data)

@router.get("/uom/list/{company_id}", response_model=List[UOMResponse])
def list_uoms(company_id: int, db: Session = Depends(get_db)):
    return svc.get_all_uoms(db, company_id)

@router.put("/uom/{uom_id}", response_model=UOMResponse)
def update_uom(uom_id: int, data: UOMUpdate, db: Session = Depends(get_db)):
    result = svc.update_uom(db, uom_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="UOM not found")
    return result

@router.delete("/uom/{uom_id}")
def delete_uom(uom_id: int, db: Session = Depends(get_db)):
    result = svc.delete_uom(db, uom_id)
    if not result:
        raise HTTPException(status_code=404, detail="UOM not found")
    return {"message": "Deleted"}


# ════════════════════════════════════════════════════
# ITEM CATEGORY
# ════════════════════════════════════════════════════

@router.post("/item-category", response_model=ItemCategoryResponse)
def create_item_category(data: ItemCategoryCreate, db: Session = Depends(get_db)):
    return svc.create_item_category(db, data)

@router.get("/item-category/list/{company_id}", response_model=List[ItemCategoryResponse])
def list_item_categories(company_id: int, db: Session = Depends(get_db)):
    return svc.get_all_item_categories(db, company_id)

@router.put("/item-category/{item_category_id}", response_model=ItemCategoryResponse)
def update_item_category(item_category_id: int, data: ItemCategoryUpdate, db: Session = Depends(get_db)):
    result = svc.update_item_category(db, item_category_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Category not found")
    return result

@router.delete("/item-category/{item_category_id}")
def delete_item_category(item_category_id: int, db: Session = Depends(get_db)):
    result = svc.delete_item_category(db, item_category_id)
    if not result:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Deleted"}


# ════════════════════════════════════════════════════
# INVENTORY ITEM
# ════════════════════════════════════════════════════

@router.post("/item", response_model=InventoryItemResponse)
def create_item(data: InventoryItemCreate, db: Session = Depends(get_db)):
    return svc.create_inventory_item(db, data)

@router.get("/item/list/{company_id}", response_model=List[InventoryItemResponse])
def list_items(company_id: int, db: Session = Depends(get_db)):
    return svc.get_all_inventory_items(db, company_id)

@router.get("/item/{item_id}", response_model=InventoryItemResponse)
def get_item(item_id: int, db: Session = Depends(get_db)):
    result = svc.get_inventory_item(db, item_id)
    if not result:
        raise HTTPException(status_code=404, detail="Item not found")
    return result

@router.put("/item/{item_id}", response_model=InventoryItemResponse)
def update_item(item_id: int, data: InventoryItemUpdate, db: Session = Depends(get_db)):
    result = svc.update_inventory_item(db, item_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Item not found")
    return result

@router.delete("/item/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    result = svc.delete_inventory_item(db, item_id)
    if not result:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Deleted"}


# ════════════════════════════════════════════════════
# NODE
# ════════════════════════════════════════════════════

@router.post("/node", response_model=InventoryNodeResponse)
def create_node(data: InventoryNodeCreate, db: Session = Depends(get_db)):
    return svc.create_node(db, data)

@router.get("/node/list/{company_id}", response_model=List[InventoryNodeResponse])
def list_nodes(company_id: int, db: Session = Depends(get_db)):
    return svc.get_all_nodes(db, company_id)

@router.get("/node/{node_id}", response_model=InventoryNodeResponse)
def get_node_by_id(node_id: int, db: Session = Depends(get_db)):
    result = svc.get_node(db, node_id)
    if not result:
        raise HTTPException(status_code=404, detail="Node not found")
    return result

@router.put("/node/{node_id}", response_model=InventoryNodeResponse)
def update_node(node_id: int, data: InventoryNodeUpdate, db: Session = Depends(get_db)):
    result = svc.update_node(db, node_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Node not found")
    return result

@router.delete("/node/{node_id}")
def delete_node(node_id: int, db: Session = Depends(get_db)):
    result = svc.delete_node(db, node_id)
    if not result:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"message": "Deleted"}


# ════════════════════════════════════════════════════
# STOCK BALANCE
# ════════════════════════════════════════════════════

@router.get("/stock-balance/{company_id}", response_model=List[StockBalanceResponse])
def get_stock_balance(
    company_id: int,
    node_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    return svc.get_stock_balance(db, company_id, node_id)

@router.get("/low-stock/{company_id}")
def get_low_stock(company_id: int, db: Session = Depends(get_db)):
    return svc.get_low_stock(db, company_id)


# ════════════════════════════════════════════════════
# SUPPLIER
# ════════════════════════════════════════════════════

@router.post("/supplier", response_model=SupplierResponse)
def create_supplier(data: SupplierCreate, db: Session = Depends(get_db)):
    return svc.create_supplier(db, data)

@router.get("/supplier/list/{company_id}", response_model=List[SupplierResponse])
def list_suppliers(company_id: int, db: Session = Depends(get_db)):
    return svc.get_all_suppliers(db, company_id)

@router.get("/supplier/{supplier_id}/rate-card", response_model=List[SupplierRateCardResponse])
def get_rate_cards(supplier_id: int, db: Session = Depends(get_db)):
    return svc.get_rate_cards(db, supplier_id)

@router.get("/supplier/{supplier_id}/payments", response_model=List[SupplierPaymentLedgerResponse])
def get_payments(supplier_id: int, db: Session = Depends(get_db)):
    return svc.get_payment_ledger(db, supplier_id)

@router.get("/supplier/{supplier_id}/outstanding")
def get_outstanding(supplier_id: int, db: Session = Depends(get_db)):
    return {"supplier_id": supplier_id, "outstanding": svc.get_supplier_outstanding(db, supplier_id)}

@router.get("/supplier/{supplier_id}", response_model=SupplierResponse)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    result = svc.get_supplier(db, supplier_id)
    if not result:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return result

@router.put("/supplier/{supplier_id}", response_model=SupplierResponse)
def update_supplier(supplier_id: int, data: SupplierUpdate, db: Session = Depends(get_db)):
    result = svc.update_supplier(db, supplier_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return result

@router.delete("/supplier/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    result = svc.delete_supplier(db, supplier_id)
    if not result:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"message": "Deleted"}

@router.post("/supplier/rate-card", response_model=SupplierRateCardResponse)
def create_rate_card(data: SupplierRateCardCreate, db: Session = Depends(get_db)):
    return svc.create_rate_card(db, data)

@router.post("/supplier/payment", response_model=SupplierPaymentLedgerResponse)
def create_payment(data: SupplierPaymentLedgerCreate, db: Session = Depends(get_db)):
    return svc.create_payment_ledger(db, data)


# ════════════════════════════════════════════════════
# PURCHASE ORDER
# ════════════════════════════════════════════════════

@router.post("/po", response_model=PurchaseOrderResponse)
def create_po(data: PurchaseOrderCreate, db: Session = Depends(get_db)):
    return svc.create_po(db, data)

@router.get("/po/list/{company_id}", response_model=List[PurchaseOrderResponse])
def list_pos(company_id: int, db: Session = Depends(get_db)):
    return svc.get_all_pos(db, company_id)

@router.get("/po/{po_id}", response_model=PurchaseOrderResponse)
def get_po(po_id: int, db: Session = Depends(get_db)):
    result = svc.get_po(db, po_id)
    if not result:
        raise HTTPException(status_code=404, detail="PO not found")
    return result

@router.put("/po/{po_id}", response_model=PurchaseOrderResponse)
def update_po(po_id: int, data: PurchaseOrderUpdate, db: Session = Depends(get_db)):
    result = svc.update_po(db, po_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="PO not found")
    return result

@router.delete("/po/{po_id}")
def delete_po(po_id: int, db: Session = Depends(get_db)):
    result = svc.delete_po(db, po_id)
    if not result:
        raise HTTPException(status_code=404, detail="PO not found")
    return {"message": "Deleted"}


# ════════════════════════════════════════════════════
# GRN
# ════════════════════════════════════════════════════

@router.post("/grn", response_model=GRNResponse)
def create_grn(data: GRNCreate, db: Session = Depends(get_db)):
    return svc.create_grn(db, data)

@router.get("/grn/list/{company_id}", response_model=List[GRNResponse])
def list_grns(company_id: int, db: Session = Depends(get_db)):
    return svc.get_all_grns(db, company_id)

@router.post("/grn/{grn_id}/post")
def post_grn(grn_id: int, posted_by: Optional[str] = Query(None), db: Session = Depends(get_db)):
    return svc.post_grn(db, grn_id, posted_by)

@router.get("/grn/{grn_id}", response_model=GRNResponse)
def get_grn(grn_id: int, db: Session = Depends(get_db)):
    result = svc.get_grn(db, grn_id)
    if not result:
        raise HTTPException(status_code=404, detail="GRN not found")
    return result

@router.put("/grn/{grn_id}", response_model=GRNResponse)
def update_grn(grn_id: int, data: GRNUpdate, db: Session = Depends(get_db)):
    result = svc.update_grn(db, grn_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="GRN not found")
    return result

@router.delete("/grn/{grn_id}")
def delete_grn(grn_id: int, db: Session = Depends(get_db)):
    result = svc.delete_grn(db, grn_id)
    if not result:
        raise HTTPException(status_code=404, detail="GRN not found")
    return {"message": "Deleted"}


# ════════════════════════════════════════════════════
# STOCK TRANSFER
# ════════════════════════════════════════════════════

@router.post("/transfer", response_model=StockTransferResponse)
def create_transfer(data: StockTransferCreate, db: Session = Depends(get_db)):
    return svc.create_transfer(db, data)

@router.get("/transfer/list/{company_id}", response_model=List[StockTransferResponse])
def list_transfers(company_id: int, db: Session = Depends(get_db)):
    return svc.get_all_transfers(db, company_id)

@router.post("/transfer/{transfer_id}/approve")
def approve_transfer(transfer_id: int, approved_by: Optional[str] = Query(None), db: Session = Depends(get_db)):
    return svc.approve_transfer(db, transfer_id, approved_by)

@router.get("/transfer/{transfer_id}", response_model=StockTransferResponse)
def get_transfer(transfer_id: int, db: Session = Depends(get_db)):
    result = svc.get_transfer(db, transfer_id)
    if not result:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return result

@router.put("/transfer/{transfer_id}", response_model=StockTransferResponse)
def update_transfer(transfer_id: int, data: StockTransferUpdate, db: Session = Depends(get_db)):
    result = svc.update_transfer(db, transfer_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return result

@router.delete("/transfer/{transfer_id}")
def delete_transfer(transfer_id: int, db: Session = Depends(get_db)):
    result = svc.delete_transfer(db, transfer_id)
    if not result:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return {"message": "Deleted"}


# ════════════════════════════════════════════════════
# RECIPE
# ════════════════════════════════════════════════════

@router.post("/recipe", response_model=RecipeResponse)
def create_recipe(data: RecipeCreate, db: Session = Depends(get_db)):
    return svc.create_recipe(db, data)

@router.get("/recipe/list/{company_id}", response_model=List[RecipeResponse])
def list_recipes(company_id: int, db: Session = Depends(get_db)):
    return svc.get_all_recipes(db, company_id)

@router.get("/recipe/{recipe_id}", response_model=RecipeResponse)
def get_recipe(recipe_id: int, db: Session = Depends(get_db)):
    result = svc.get_recipe(db, recipe_id)
    if not result:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return result

@router.put("/recipe/{recipe_id}", response_model=RecipeResponse)
def update_recipe(recipe_id: int, data: RecipeUpdate, db: Session = Depends(get_db)):
    result = svc.update_recipe(db, recipe_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return result

@router.delete("/recipe/{recipe_id}")
def delete_recipe(recipe_id: int, db: Session = Depends(get_db)):
    result = svc.delete_recipe(db, recipe_id)
    if not result:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return {"message": "Deleted"}


# ════════════════════════════════════════════════════
# CONSUMPTION
# ════════════════════════════════════════════════════

@router.post("/consumption", response_model=StockConsumptionResponse)
def create_consumption(data: StockConsumptionCreate, db: Session = Depends(get_db)):
    return svc.create_consumption(db, data)

@router.get("/consumption/list/{company_id}", response_model=List[StockConsumptionResponse])
def list_consumptions(company_id: int, db: Session = Depends(get_db)):
    return svc.get_all_consumptions(db, company_id)


# ════════════════════════════════════════════════════
# WASTE
# ════════════════════════════════════════════════════

@router.post("/waste", response_model=WasteEntryResponse)
def create_waste(data: WasteEntryCreate, db: Session = Depends(get_db)):
    return svc.create_waste(db, data)

@router.get("/waste/list/{company_id}", response_model=List[WasteEntryResponse])
def list_waste(company_id: int, db: Session = Depends(get_db)):
    return svc.get_all_waste(db, company_id)

@router.put("/waste/{waste_id}", response_model=WasteEntryResponse)
def update_waste(waste_id: int, data: WasteEntryUpdate, db: Session = Depends(get_db)):
    result = svc.update_waste(db, waste_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Waste entry not found")
    return result

@router.delete("/waste/{waste_id}")
def delete_waste(waste_id: int, db: Session = Depends(get_db)):
    result = svc.delete_waste(db, waste_id)
    if not result:
        raise HTTPException(status_code=404, detail="Waste entry not found")
    return {"message": "Deleted"}


# ════════════════════════════════════════════════════
# STOCK AUDIT
# ════════════════════════════════════════════════════

@router.post("/audit", response_model=StockAuditResponse)
def create_audit(data: StockAuditCreate, db: Session = Depends(get_db)):
    return svc.create_audit(db, data)

@router.get("/audit/list/{company_id}", response_model=List[StockAuditResponse])
def list_audits(company_id: int, db: Session = Depends(get_db)):
    return svc.get_all_audits(db, company_id)

@router.post("/audit/{audit_id}/post")
def post_audit(audit_id: int, posted_by: Optional[str] = Query(None), db: Session = Depends(get_db)):
    return svc.post_audit(db, audit_id, posted_by)

@router.get("/audit/{audit_id}", response_model=StockAuditResponse)
def get_audit(audit_id: int, db: Session = Depends(get_db)):
    result = svc.get_audit(db, audit_id)
    if not result:
        raise HTTPException(status_code=404, detail="Audit not found")
    return result

@router.delete("/audit/{audit_id}")
def delete_audit(audit_id: int, db: Session = Depends(get_db)):
    result = svc.delete_audit(db, audit_id)
    if not result:
        raise HTTPException(status_code=404, detail="Audit not found")
    return {"message": "Deleted"}


# ════════════════════════════════════════════════════
# REPORTS
# ════════════════════════════════════════════════════

@router.get("/report/stock-movement/{company_id}")
def report_stock_movement(
    company_id: int,
    node_id: Optional[int] = Query(None),
    item_id: Optional[int] = Query(None),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    return svc.report_stock_movement(db, company_id, node_id, item_id, from_date, to_date)

@router.get("/report/low-stock/{company_id}")
def report_low_stock(company_id: int, db: Session = Depends(get_db)):
    return svc.get_low_stock(db, company_id)

@router.get("/report/supplier-outstanding/{company_id}")
def report_supplier_outstanding(company_id: int, db: Session = Depends(get_db)):
    suppliers = svc.get_all_suppliers(db, company_id)
    result = []
    for s in suppliers:
        outstanding = svc.get_supplier_outstanding(db, s.supplier_id)
        result.append({
            "supplier_id": s.supplier_id,
            "supplier_name": s.supplier_name,
            "outstanding": outstanding,
        })
    return result

# ── Branch companies from company table ───────────────────────────────────────
@router.get("/branches/{company_id}")
def get_branch_companies(company_id: int, db: Session = Depends(get_db)):
    """
    Returns all child companies (branches) under a parent company.
    Also returns grandchildren so frontend can build a parent-child tree.
    Result includes: company_unique_id, name, address1, parant_company_unique_id
    """
    from sqlalchemy import text
    result = db.execute(
        text("""
            SELECT c.company_unique_id, c.name, c.address1, c.parant_company_unique_id
            FROM company c
            WHERE c.is_active = true
              AND (
                c.parant_company_unique_id = :cid
                OR c.parant_company_unique_id IN (
                    SELECT company_unique_id FROM company
                    WHERE parant_company_unique_id = :cid
                      AND is_active = true
                )
              )
            ORDER BY c.parant_company_unique_id NULLS FIRST, c.name
        """),
        {"cid": company_id}
    ).fetchall()
    return [
        {
            "company_unique_id":        r[0],
            "name":                     r[1],
            "address":                  r[2] or "",
            "parant_company_unique_id": r[3],
        }
        for r in result
    ]


# ── New Transfer Flow: Dispatch / Receive / Reject ────────────────────────────

@router.post("/transfer/{transfer_id}/dispatch")
def dispatch_transfer(
    transfer_id: int,
    dispatched_by: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Sender dispatches — deducts stock from from_node, status→dispatched."""
    return svc.dispatch_transfer(db, transfer_id, dispatched_by)


@router.post("/transfer/{transfer_id}/receive")
def receive_transfer(
    transfer_id: int,
    received_by: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Receiver accepts — adds stock to to_node, status→received."""
    return svc.receive_transfer(db, transfer_id, received_by)


@router.post("/transfer/{transfer_id}/reject")
def reject_transfer(
    transfer_id: int,
    rejected_by: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Receiver rejects — returns stock to from_node, status→rejected."""
    return svc.reject_transfer(db, transfer_id, rejected_by)


@router.get("/transfer/incoming/{to_node_id}")
def get_incoming_transfers(
    to_node_id: int,
    company_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """Incoming transfers for a receiver node (Stock Receive page)."""
    return svc.get_incoming_transfers(db, to_node_id, company_id)


@router.get("/transfer/all/{company_id}")
def get_all_transfers_admin(
    company_id: int,
    db: Session = Depends(get_db)
):
    """Admin view — all transfers for company regardless of node."""
    return svc.get_all_transfers_admin(db, company_id)


# ── All nodes for cross-company display (used by receiver to see sender node name) ──
@router.get("/nodes/all/{company_id}")
def get_all_nodes_for_display(company_id: int, db: Session = Depends(get_db)):
    """
    Returns all inv_node records + branch companies visible to this company.
    Used by receivers to display FROM node names in incoming transfers.
    """
    from sqlalchemy import text
    # Get all inv_node records (any company)
    inv_nodes = db.execute(
        text("SELECT node_id, node_name, node_type FROM inv_node WHERE is_active = true")
    ).fetchall()
    # Get all company names (for branch node display)
    companies = db.execute(
        text("SELECT company_unique_id, name FROM company WHERE is_active = true")
    ).fetchall()
    result = {}
    for r in inv_nodes:
        type_icon = {"warehouse": "🏭", "cloud_kitchen": "☁️", "branch": "🏪"}.get(r[2], "📍")
        result[str(r[0])] = f"{type_icon} {r[1]}"
    for r in companies:
        result[str(r[0])] = f"🏪 {r[1]}"
    return result
