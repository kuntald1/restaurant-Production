// ── Cache Keys ──────────────────────────────────────────────
const KEYS = {
  menu:           'rms_offline_menu',
  categories:     'rms_offline_categories',
  company:        'rms_offline_company',
  tables:         'rms_offline_tables',
  orders:         'rms_offline_orders',
  offline_orders: 'rms_offline_local_orders',
};

// ── Save to cache ────────────────────────────────────────────
export const cacheMenu       = (data) => localStorage.setItem(KEYS.menu,       JSON.stringify(data));
export const cacheCategories = (data) => localStorage.setItem(KEYS.categories, JSON.stringify(data));
export const cacheCompany    = (data) => localStorage.setItem(KEYS.company,    JSON.stringify(data));
export const cacheTables     = (data) => localStorage.setItem(KEYS.tables,     JSON.stringify(data));

// ── Load from cache ──────────────────────────────────────────
export const getCachedMenu       = () => { try { return JSON.parse(localStorage.getItem(KEYS.menu))       || []; } catch { return []; } };
export const getCachedCategories = () => { try { return JSON.parse(localStorage.getItem(KEYS.categories)) || []; } catch { return []; } };
export const getCachedCompany    = () => { try { return JSON.parse(localStorage.getItem(KEYS.company))    || null; } catch { return null; } };
export const getCachedTables     = () => { try { return JSON.parse(localStorage.getItem(KEYS.tables))     || []; } catch { return []; } };
export const hasCachedData       = () => !!localStorage.getItem(KEYS.menu);

// ── Pending Sync Queue ───────────────────────────────────────
export const getPendingOrders    = () => { try { return JSON.parse(localStorage.getItem(KEYS.orders)) || []; } catch { return []; } };
export const addPendingOrder     = (order) => { const orders = getPendingOrders(); const o = { ...order, offline_id: Date.now(), created_offline: true }; orders.push(o); localStorage.setItem(KEYS.orders, JSON.stringify(orders)); return o; };
export const removePendingOrder  = (id) => { localStorage.setItem(KEYS.orders, JSON.stringify(getPendingOrders().filter(o => o.offline_id !== id))); };
export const clearPendingOrders  = () => localStorage.removeItem(KEYS.orders);

// ── Offline Local Orders ─────────────────────────────────────
export const getOfflineOrders  = () => { try { return JSON.parse(localStorage.getItem(KEYS.offline_orders)) || []; } catch { return []; } };
export const saveOfflineOrders = (orders) => localStorage.setItem(KEYS.offline_orders, JSON.stringify(orders));
export const getOfflineOrder   = (id) => getOfflineOrders().find(o => o.offline_id === id) || null;
export const getUnsyncedOfflineOrders = () => getOfflineOrders().filter(o => !o.is_synced);

export const createOfflineOrder = ({ company_unique_id, order_type, table_id, table_name, covers, customer_name, customer_phone, created_by }) => {
  const orders = getOfflineOrders();
  const offlineId = `OFFLINE-${Date.now()}`;
  const order = {
    offline_id: offlineId, order_number: offlineId, company_unique_id,
    order_type: order_type || 'dine_in', table_id: table_id || null,
    table_name: table_name || null, covers: covers || 1,
    customer_name: customer_name || '', customer_phone: customer_phone || '',
    created_by: created_by || null, order_status: 'draft', items: [],
    subtotal: 0, total_payable: 0,
    created_at: new Date().toISOString(), is_offline: true, is_synced: false,
  };
  orders.push(order);
  saveOfflineOrders(orders);
  return order;
};

export const addItemToOfflineOrder = (offlineId, menuItem) => {
  const orders = getOfflineOrders();
  const order  = orders.find(o => o.offline_id === offlineId);
  if (!order) return null;
  const existing = order.items.find(i => i.food_menu_id === (menuItem.food_menu_id || menuItem.foodmenuid));
  if (existing) {
    existing.quantity++;
    existing.total_price = existing.unit_price * existing.quantity;
  } else {
    order.items.push({
      food_menu_id:  menuItem.food_menu_id || menuItem.foodmenuid,
      item_name:     menuItem.name,
      item_code:     menuItem.code || '',
      unit_price:    parseFloat(menuItem.sale_price || menuItem.saleprice || 0),
      quantity:      1,
      total_price:   parseFloat(menuItem.sale_price || menuItem.saleprice || 0),
      is_veg:        menuItem.is_veg !== false,
      category_name: menuItem.category_name || '',
    });
  }
  order.subtotal      = order.items.reduce((s, i) => s + Math.round(i.unit_price) * i.quantity, 0);
  order.total_payable = order.subtotal;
  saveOfflineOrders(orders);
  return order;
};

export const removeItemFromOfflineOrder = (offlineId, food_menu_id) => {
  const orders = getOfflineOrders();
  const order  = orders.find(o => o.offline_id === offlineId);
  if (!order) return null;
  const existing = order.items.find(i => i.food_menu_id === food_menu_id);
  if (!existing) return order;
  if (existing.quantity > 1) {
    existing.quantity--;
    existing.total_price = existing.unit_price * existing.quantity;
  } else {
    order.items = order.items.filter(i => i.food_menu_id !== food_menu_id);
  }
  order.subtotal      = order.items.reduce((s, i) => s + Math.round(i.unit_price) * i.quantity, 0);
  order.total_payable = order.subtotal;
  saveOfflineOrders(orders);
  return order;
};

export const markOfflineOrderBilled = (offlineId, paymentMethod, amountPaid, extra = {}) => {
  const orders = getOfflineOrders();
  const order  = orders.find(o => o.offline_id === offlineId);
  if (!order) return null;
  order.order_status   = 'billed';
  order.payment_method = paymentMethod;
  order.amount_paid    = amountPaid;
  order.billed_at      = new Date().toISOString();
  // Store extra info for server sync
  if (extra.surcharge)   order.surcharge   = extra.surcharge;
  if (extra.sgst_amount) order.sgst_amount = extra.sgst_amount;
  if (extra.cgst_amount) order.cgst_amount = extra.cgst_amount;
  if (extra.sgst_rate)   order.sgst_rate   = extra.sgst_rate;
  if (extra.cgst_rate)   order.cgst_rate   = extra.cgst_rate;
  if (extra.total)       order.total_payable = extra.total;
  saveOfflineOrders(orders);
  return order;
};

export const markOfflineOrderSynced = (offlineId) => {
  const orders = getOfflineOrders();
  const order  = orders.find(o => o.offline_id === offlineId);
  if (order) { order.is_synced = true; saveOfflineOrders(orders); }
};

export const deleteOfflineOrder = (offlineId) => {
  saveOfflineOrders(getOfflineOrders().filter(o => o.offline_id !== offlineId));
};

// ── Print Offline Bill ────────────────────────────────────────
export const printOfflineBill = (order, company = {}) => {
  const w = window.open('', '_blank', 'width=400,height=600');
  if (!w) return;
  const items    = order.items || [];
  const subtotal = order.subtotal || 0;
  const surcharge = parseFloat(order.surcharge || 0);
  const sgstAmt  = parseFloat(order.sgst_amount || 0);
  const cgstAmt  = parseFloat(order.cgst_amount || 0);
  const sgstRate = parseFloat(order.sgst_rate || 0);
  const cgstRate = parseFloat(order.cgst_rate || 0);
  const total    = order.total_payable || (subtotal + surcharge + sgstAmt + cgstAmt);
  const now      = new Date().toLocaleString('en-IN');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Offline Bill</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',monospace;font-size:12px;color:#111;background:#fff;padding:8px;width:300px;margin:0 auto}
  .center{text-align:center}.bold{font-weight:700}
  .line{border-top:1px dashed #888;margin:8px 0}
  .row{display:flex;justify-content:space-between;padding:2px 0}
  .big{font-size:16px;font-weight:700}.muted{color:#555;font-size:10px}
  .total-row{font-size:14px;font-weight:700}
  .badge{background:#fef3c7;border:1px solid #fbbf24;color:#92400e;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:700;display:inline-block}
  @media print{body{width:100%}button{display:none}}
</style></head><body>
<div class="center">
  <div class="big">${company.name || 'Restaurant'}</div>
  ${company.address1 ? `<div class="muted">${company.address1}</div>` : ''}
  ${company.admin_phone ? `<div class="muted">Ph: ${company.admin_phone}</div>` : ''}
</div>
<div class="line"></div>
<div class="center"><span class="badge">📴 OFFLINE BILL</span></div>
<div class="line"></div>
<div class="row"><span class="bold">Order:</span><span>${order.order_number}</span></div>
${order.table_name ? `<div class="row"><span class="bold">Table:</span><span>${order.table_name}</span></div>` : ''}
<div class="row"><span class="bold">Type:</span><span>${order.order_type || 'dine_in'}</span></div>
${order.customer_name ? `<div class="row"><span class="bold">Customer:</span><span>${order.customer_name}</span></div>` : ''}
<div class="row"><span class="bold">Payment:</span><span>${order.payment_method || 'Cash'}</span></div>
<div class="row"><span class="bold">Date:</span><span>${now}</span></div>
<div class="line"></div>
<div class="bold" style="margin-bottom:6px">ITEMS</div>
${items.map(it => `<div class="row"><span>${it.is_veg === false ? '🔴' : '🟢'} ${it.item_name} x${it.quantity}</span><span>₹${(Math.round(it.unit_price) * it.quantity)}</span></div>`).join('')}
<div class="line"></div>
<div class="row"><span>Subtotal</span><span>₹${Math.round(subtotal)}</span></div>
${surcharge > 0 ? `<div class="row"><span>Table Surcharge</span><span>+₹${surcharge.toFixed(2)}</span></div>` : ''}
${sgstAmt > 0 ? `<div class="row"><span>SGST (${sgstRate}%)</span><span>+₹${sgstAmt.toFixed(2)}</span></div>` : ''}
${cgstAmt > 0 ? `<div class="row"><span>CGST (${cgstRate}%)</span><span>+₹${cgstAmt.toFixed(2)}</span></div>` : ''}
<div class="line"></div>
<div class="row total-row"><span>TOTAL</span><span>₹${total.toFixed(2)}</span></div>
<div class="row"><span>Amount Paid</span><span>₹${parseFloat(order.amount_paid || total).toFixed(2)}</span></div>
${parseFloat(order.amount_paid || 0) > total ? `<div class="row"><span>Change</span><span>₹${(parseFloat(order.amount_paid) - total).toFixed(2)}</span></div>` : ''}
<div class="line"></div>
<div class="center muted">⚠️ Offline bill — will sync when internet restored</div>
<div class="center muted">Thank you for dining with us!</div>
<br/>
<div class="center"><button onclick="window.print();setTimeout(()=>window.close(),500)" style="padding:8px 24px;background:#1a3a1c;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer">🖨️ Print</button></div>
</body></html>`);
  w.document.close();
  setTimeout(() => { try { w.print(); } catch {} }, 500);
};
