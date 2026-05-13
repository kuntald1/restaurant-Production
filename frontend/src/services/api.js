const BACKEND_URL = 'https://currycloud.mooo.com';

const buildUrl = (endpoint) => {
  if (import.meta.env.DEV) return endpoint;
  return `${BACKEND_URL}${endpoint}`;
};

const request = async (method, endpoint, body = null, isFormData = false) => {
  const options = {
    method,
    headers: isFormData ? {} : { 'Content-Type': 'application/json' },
  };
  if (body) options.body = isFormData ? body : JSON.stringify(body);
  const res = await fetch(buildUrl(endpoint), options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    const errMsg = Array.isArray(err.detail) ? err.detail.map(e => e.msg || e).join(', ') : (err.detail || err.message || 'Request failed');
    const error = new Error(errMsg);
    error.status = res.status;
    throw error;
  }
  return res.json();
};

// ── Company ───────────────────────────────────────────────────
export const companyAPI = {
  getAll: () => request('GET', '/company/'),
  getById: (id) => request('GET', `/company/${id}`),
  getByUniqueId: (uid) => request('GET', `/company/unique/${uid}`),
  create: (data) => request('POST', '/company/', data),
  update: (id, data) => request('PUT', `/company/${id}`, data),
  delete: (id) => request('DELETE', `/company/${id}`),
  uploadLogo: (uid, file) => { const fd = new FormData(); fd.append('file', file); return request('POST', `/company/${uid}/logo`, fd, true); },
  deleteLogo: (uid) => request('DELETE', `/company/${uid}/logo`),
  uploadFavicon: (uid, file) => { const fd = new FormData(); fd.append('file', file); return request('POST', `/company/${uid}/favicon`, fd, true); },
  deleteFavicon: (uid) => request('DELETE', `/company/${uid}/favicon`),
  uploadImage: (uid, file) => { const fd = new FormData(); fd.append('file', file); return request('POST', `/company/${uid}/image`, fd, true); },
  deleteImage: (uid) => request('DELETE', `/company/${uid}/image`),
};

export const paymentSettingsAPI = {
  get:    (companyId) => request('GET',  `/company/${companyId}/payment-settings`),
  update: (companyId, data) => request('PUT', `/company/${companyId}/payment-settings`, data),
};

export const merchantSettingsAPI = {
  get:    (companyId)       => request('GET', `/company/${companyId}/merchant-settings`),
  save:   (companyId, data) => request('PUT', `/company/${companyId}/merchant-settings`, data),
  toggle: (companyId, data) => request('PATCH', `/company/${companyId}/merchant-toggle`, data),
};

export const paymentTransactionAPI = {
  create: (data)            => request('POST', '/pos/payment-transaction', data),
  getByBill: (billId)       => request('GET', `/pos/payment-transaction/bill/${billId}`),
  getByOrder: (orderId)     => request('GET', `/pos/payment-transaction/order/${orderId}`),
  getByCompany: (companyId) => request('GET', `/pos/payment-transaction/company/${companyId}`),
};

export const qrAPI = {
  getAll:      (uid)              => request('GET', `/company/${uid}/qr`),
  getActive:   (uid)              => request('GET', `/company/${uid}/qr/active`),
  create:      (uid, data)        => request('POST', `/company/${uid}/qr`, data),
  update:      (uid, qrId, data)  => request('PUT', `/company/${uid}/qr/${qrId}`, data),
  delete:      (uid, qrId)        => request('DELETE', `/company/${uid}/qr/${qrId}`),
  uploadImage: (uid, qrId, file)  => { const fd = new FormData(); fd.append('file', file); return request('POST', `/company/${uid}/qr/${qrId}/image`, fd, true); },
  deleteImage: (uid, qrId)        => request('DELETE', `/company/${uid}/qr/${qrId}/image`),
};

// ── Menu ──────────────────────────────────────────────────────
export const menuAPI = {
  getByCompany: (companyId) => request('GET', `/companymenu/${companyId}`),
};

export const foodCategoryAPI = {
  getAll:  (companyId)      => request('GET', `/company/getallfoodcategory/${companyId}`),
  getById: (id)             => request('GET', `/company/getfoodcategory/${id}`),
  create:  (data)           => request('POST', '/company/createfoodcategory', data),
  update:  (id, data)       => request('PUT', `/company/updatefoodcategory/${id}`, data),
  delete:  (id)             => request('DELETE', `/company/deletefoodcategory/${id}`),
};

export const foodMenuAPI = {
  getAll:  (companyId)      => request('GET', `/company/getallfoodmenu/${companyId}`),
  getById: (id)             => request('GET', `/company/getfoodmenu/${id}`),
  create:  (data)           => request('POST', '/company/createfoodmenu', data),
  update:  (id, data)       => request('PUT', `/company/updatefoodmenu/${id}`, data),
  delete:  (id)             => request('DELETE', `/company/deletefoodmenu/${id}`),
};

// ── Users ─────────────────────────────────────────────────────
export const usersAPI = {
  getAll:         (companyId)            => request('GET', `/users/getallusers/${companyId}`),
  getById:        (id)                   => request('GET', `/users/getuser/${id}`),
  create:         (data)                 => request('POST', '/users/createuser', data),
  update:         (id, data)             => request('PUT', `/users/updateuser/${id}`, data),
  delete:         (id)                   => request('DELETE', `/users/deleteuser/${id}`),
  login:          (data)                 => request('POST', '/users/login', data),
  checkUsername:  (companyId, username)  => request('GET', `/users/checkusername/${companyId}/${username}`),
  usernameExists: (username)             => request('GET', `/users/usernameexists/${username}`),
};

export const userRolesAPI = {
  getAll:        (companyId)             => request('GET', `/userroles/getalluserroles/${companyId}`),
  getById:       (id)                    => request('GET', `/userroles/getuserrole/${id}`),
  create:        (data)                  => request('POST', '/userroles/createuserrole', data),
  update:        (id, data)              => request('PUT', `/userroles/updateuserrole/${id}`, data),
  delete:        (id)                    => request('DELETE', `/userroles/deleteuserrole/${id}`),
  checkRoleName: (companyId, name)       => request('GET', `/userroles/checkrolename/${companyId}/${name}`),
};

export const roleMappingAPI = {
  getAll:        (companyId)             => request('GET', `/userrolemappings/getalluserrolemappings/${companyId}`),
  getById:       (id)                    => request('GET', `/userrolemappings/getuserrolemapping/${id}`),
  getMenusByRole:(companyId, roleId)     => request('GET', `/userrolemappings/getallmenuagainstrole/${companyId}/${roleId}`),
  create:        (data)                  => request('POST', '/userrolemappings/createuserrolemapping', data),
  update:        (id, data)              => request('PUT', `/userrolemappings/updateuserrolemapping/${id}`, data),
  delete:        (id)                    => request('DELETE', `/userrolemappings/deleteuserrolemapping/${id}`),
  checkMapping:  (companyId, roleId, menuId) => request('GET', `/userrolemappings/checkmapping/${companyId}/${roleId}/${menuId}`),
};

// ── POS ───────────────────────────────────────────────────────
export const posTableAPI = {
  getAll:    (companyId)         => request('GET', `/pos/tables/${companyId}`),
  create:    (data)              => request('POST', '/pos/tables', data),
  update:    (tableId, data)     => request('PUT', `/pos/tables/${tableId}`, data),
  delete:    (tableId)           => request('PATCH', `/pos/tables/${tableId}`, { is_active: false }),
  setStatus: (tableId, status)   => request('PATCH', `/pos/tables/${tableId}/status?status=${status}`),
};

export const posOrderAPI = {
  getRunning:     (companyId)            => request('GET', `/pos/orders/running/${companyId}`),
  getAllByCompany: (companyId)            => request('GET', `/pos/orders/company/${companyId}`),
  getById:        (orderId)              => request('GET', `/pos/orders/${orderId}`),
  create:         (data)                 => request('POST', '/pos/orders', data),
  update:         (id, data)             => request('PUT', `/pos/orders/${id}`, data),
  hold:           (id, hold)             => request('PATCH', `/pos/orders/${id}/hold?hold=${hold}`),
  cancel:         (id)                   => request('DELETE', `/pos/orders/${id}/cancel`),
  updateStatus:   (id, data)             => request('PATCH', `/pos/orders/${id}/status`, data),
  addItem:        (orderId, companyId, data) => request('POST', `/pos/orders/${orderId}/items?company_id=${companyId}`, data),
  updateQty:      (orderId, itemId, qty)    => request('PATCH', `/pos/orders/${orderId}/items/${itemId}/quantity?quantity=${qty}`),
  updateItemNotes:(orderId, itemId, notes)  => request('PATCH', `/pos/orders/${orderId}/items/${itemId}/notes?notes=${encodeURIComponent(notes||'')}`),
  cancelItem:     (orderId, itemId, reason) => request('DELETE', `/pos/orders/${orderId}/items/${itemId}?reason=${encodeURIComponent(reason)}`),
};

export const posKotAPI = {
  create:           (data)          => request('POST', '/pos/kot', data),
  getById:          (kotId)         => request('GET', `/pos/kot/${kotId}`),
  getByOrder:       (orderId)       => request('GET', `/pos/kot/order/${orderId}`),
  print:            (kotId)         => request('PATCH', `/pos/kot/${kotId}/print`),
  updateStatus:     (kotId, data)     => request('PATCH', `/pos/kot/${kotId}/status`, data),
  updateItemStatus: (kotItemId, data) => request('PATCH', `/pos/kot/items/${kotItemId}/status`, data),
};

export const posBillAPI = {
  generate:   (data)        => request('POST', '/pos/bill', data),
  getByOrder: (orderId)     => request('GET', `/pos/bill/order/${orderId}`),
  getById:    (billId)      => request('GET', `/pos/bill/${billId}`),
  getAll:     (companyId)   => request('GET', `/pos/bill/company/${companyId}`),
  print:      (billId)      => request('PATCH', `/pos/bill/${billId}/print`),
};

// ── CRM ───────────────────────────────────────────────────────
export const crmCustomerAPI = {
  getAll:      (cid, search)             => request('GET', `/crm/customers/${cid}${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  lookupPhone: (cid, phone)              => request('GET', `/crm/customer/phone/${cid}/${phone}`),
  create:      (cid, data)               => request('POST', `/crm/customers/${cid}`, data),
  update:      (id, data)                => request('PUT',  `/crm/customers/${id}`, data),
  delete:      (id)                      => request('DELETE', `/crm/customers/${id}`),
  getCreditLog:(cid, customerId)         => request('GET', `/crm/customers/${cid}/${customerId}/credit-log`),
  addCreditLog:(cid, data)               => request('POST', `/crm/customers/${cid}/credit-log`, data),
  updateDue:   (cid, customerId, due_amount) => request('PUT', `/crm/customers/${cid}/due/${customerId}`, { due_amount }),
};

export const crmPromoAPI = {
  getAll:   (cid)               => request('GET',  `/crm/promos/${cid}`),
  create:   (cid, data)         => request('POST', `/crm/promos/${cid}`, data),
  update:   (id, data)          => request('PUT',  `/crm/promos/${id}`, data),
  validate: (cid, code, amount) => request('POST', `/crm/promos/validate?company_id=${cid}&code=${encodeURIComponent(code)}&bill_amount=${Number(amount).toFixed(2)}`),
  use:      (params)            => request('POST', `/crm/promos/use?${new URLSearchParams(params)}`),
  getUsage: (cid)               => request('GET',  `/crm/promos/usage/${cid}`),
};

export const smsSettingsAPI = {
  get:          (cid)       => request('GET', `/crm/sms-settings/${cid}`),
  save:         (cid, data) => request('PUT', `/crm/sms-settings/${cid}`, data),
  sendWhatsApp: (data)      => request('POST', '/crm/whatsapp/send', data),
};

export const paymentLinkAPI = {
  create: (data)              => request('POST', '/crm/payment-link/create', data),
  status: (linkId, companyId) => request('GET', `/crm/payment-link/${linkId}/status?company_id=${companyId}`),
};

export const whatsAppSettingsAPI = {
  get:  (cid)       => request('GET', `/crm/whatsapp-settings/${cid}`),
  save: (cid, data) => request('PUT', `/crm/whatsapp-settings/${cid}`, data),
};

// ══════════════════════════════════════════════════════════════
// INVENTORY APIs
// ══════════════════════════════════════════════════════════════

// ── UOM ───────────────────────────────────────────────────────
export const invUomAPI = {
  getAll:  (companyId) => request('GET', `/inventory/uom/list/${companyId}`),
  create:  (data)      => request('POST', '/inventory/uom', data),
  update:  (id, data)  => request('PUT', `/inventory/uom/${id}`, data),
  delete:  (id)        => request('DELETE', `/inventory/uom/${id}`),
};

// ── Item Category ─────────────────────────────────────────────
export const invCategoryAPI = {
  getAll:  (companyId) => request('GET', `/inventory/item-category/list/${companyId}`),
  create:  (data)      => request('POST', '/inventory/item-category', data),
  update:  (id, data)  => request('PUT', `/inventory/item-category/${id}`, data),
  delete:  (id)        => request('DELETE', `/inventory/item-category/${id}`),
};

// ── Ingredient / Item ─────────────────────────────────────────
export const invItemAPI = {
  getAll:  (companyId) => request('GET', `/inventory/item/list/${companyId}`),
  getById: (id)        => request('GET', `/inventory/item/${id}`),
  create:  (data)      => request('POST', '/inventory/item', data),
  update:  (id, data)  => request('PUT', `/inventory/item/${id}`, data),
  delete:  (id)        => request('DELETE', `/inventory/item/${id}`),
};

// ── Node (Warehouse / Cloud Kitchen) ─────────────────────────
// Branches come from company table via getBranches
export const invNodeAPI = {
  getAll:      (companyId) => request('GET', `/inventory/node/list/${companyId}`),
  getById:     (id)        => request('GET', `/inventory/node/${id}`),
  create:      (data)      => request('POST', '/inventory/node', data),
  update:      (id, data)  => request('PUT', `/inventory/node/${id}`, data),
  delete:      (id)        => request('DELETE', `/inventory/node/${id}`),
  getBranches: (companyId) => request('GET', `/inventory/branches/${companyId}`),
};

// ── Stock Balance ─────────────────────────────────────────────
export const invStockAPI = {
  getBalance:  (companyId, nodeId) => request('GET', `/inventory/stock-balance/${companyId}${nodeId ? `?node_id=${nodeId}` : ''}`),
  getLowStock: (companyId)         => request('GET', `/inventory/low-stock/${companyId}`),
};

// ── Supplier ──────────────────────────────────────────────────
export const invSupplierAPI = {
  getAll:         (companyId)  => request('GET', `/inventory/supplier/list/${companyId}`),
  getById:        (id)         => request('GET', `/inventory/supplier/${id}`),
  create:         (data)       => request('POST', '/inventory/supplier', data),
  update:         (id, data)   => request('PUT', `/inventory/supplier/${id}`, data),
  delete:         (id)         => request('DELETE', `/inventory/supplier/${id}`),
  getRateCards:   (supplierId) => request('GET', `/inventory/supplier/${supplierId}/rate-card`),
  createRateCard: (data)       => request('POST', '/inventory/supplier/rate-card', data),
  getPayments:    (supplierId) => request('GET', `/inventory/supplier/${supplierId}/payments`),
  createPayment:  (data)       => request('POST', '/inventory/supplier/payment', data),
  getOutstanding: (supplierId) => request('GET', `/inventory/supplier/${supplierId}/outstanding`),
};

// ── Purchase Order ────────────────────────────────────────────
export const invPoAPI = {
  getAll:  (companyId) => request('GET', `/inventory/po/list/${companyId}`),
  getById: (id)        => request('GET', `/inventory/po/${id}`),
  create:  (data)      => request('POST', '/inventory/po', data),
  update:  (id, data)  => request('PUT', `/inventory/po/${id}`, data),
  delete:  (id)        => request('DELETE', `/inventory/po/${id}`),
};

// ── GRN ───────────────────────────────────────────────────────
export const invGrnAPI = {
  getAll:  (companyId) => request('GET', `/inventory/grn/list/${companyId}`),
  getById: (id)        => request('GET', `/inventory/grn/${id}`),
  create:  (data)      => request('POST', '/inventory/grn', data),
  update:  (id, data)  => request('PUT', `/inventory/grn/${id}`, data),
  post:    (id, by)    => request('POST', `/inventory/grn/${id}/post${by ? `?posted_by=${by}` : ''}`),
  delete:  (id)        => request('DELETE', `/inventory/grn/${id}`),
};

// ── Stock Transfer ────────────────────────────────────────────
// Flow: Create (draft) → Dispatch (deducts from sender) → Receive/Reject (receiver action)
export const invTransferAPI = {
  getAll:        (companyId)           => request('GET', `/inventory/transfer/list/${companyId}`),
  getById:       (id)                  => request('GET', `/inventory/transfer/${id}`),
  getIncoming:   (toNodeId, companyId) => request('GET', `/inventory/transfer/incoming/${toNodeId}?company_id=${companyId}`),
  getAllAdmin:    (companyId)           => request('GET', `/inventory/transfer/all/${companyId}`),
  getNodeLookup: (companyId)           => request('GET', `/inventory/nodes/all/${companyId}`),
  create:        (data)                => request('POST', '/inventory/transfer', data),
  update:        (id, data)            => request('PUT', `/inventory/transfer/${id}`, data),
  delete:        (id)                  => request('DELETE', `/inventory/transfer/${id}`),
  dispatch:      (id, by)              => request('POST', `/inventory/transfer/${id}/dispatch${by ? `?dispatched_by=${by}` : ''}`),
  receive:       (id, by)              => request('POST', `/inventory/transfer/${id}/receive${by ? `?received_by=${by}` : ''}`),
  reject:        (id, by)              => request('POST', `/inventory/transfer/${id}/reject${by ? `?rejected_by=${by}` : ''}`),
};

// ── Recipe ────────────────────────────────────────────────────
export const invRecipeAPI = {
  getAll:  (companyId) => request('GET', `/inventory/recipe/list/${companyId}`),
  getById: (id)        => request('GET', `/inventory/recipe/${id}`),
  create:  (data)      => request('POST', '/inventory/recipe', data),
  update:  (id, data)  => request('PUT', `/inventory/recipe/${id}`, data),
  delete:  (id)        => request('DELETE', `/inventory/recipe/${id}`),
};

// ── Consumption ───────────────────────────────────────────────
export const invConsumptionAPI = {
  getAll:  (companyId) => request('GET', `/inventory/consumption/list/${companyId}`),
  create:  (data)      => request('POST', '/inventory/consumption', data),
};

// ── Waste ─────────────────────────────────────────────────────
export const invWasteAPI = {
  getAll:  (companyId) => request('GET', `/inventory/waste/list/${companyId}`),
  create:  (data)      => request('POST', '/inventory/waste', data),
  update:  (id, data)  => request('PUT', `/inventory/waste/${id}`, data),
  delete:  (id)        => request('DELETE', `/inventory/waste/${id}`),
};

// ── Stock Audit ───────────────────────────────────────────────
export const invAuditAPI = {
  getAll:  (companyId) => request('GET', `/inventory/audit/list/${companyId}`),
  getById: (id)        => request('GET', `/inventory/audit/${id}`),
  create:  (data)      => request('POST', '/inventory/audit', data),
  post:    (id, by)    => request('POST', `/inventory/audit/${id}/post${by ? `?posted_by=${by}` : ''}`),
  delete:  (id)        => request('DELETE', `/inventory/audit/${id}`),
};

// ── Reports ───────────────────────────────────────────────────
export const invReportsAPI = {
  stockMovement:       (companyId, params) => request('GET', `/inventory/report/stock-movement/${companyId}?${new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v != null)))}`),
  lowStock:            (companyId)         => request('GET', `/inventory/report/low-stock/${companyId}`),
  supplierOutstanding: (companyId)         => request('GET', `/inventory/report/supplier-outstanding/${companyId}`),
};

// ── Advanced PO — Rule Engine (Phase 1.5) ────────────────────
export const advPoAPI = {
  // Weather rules
  getWeatherRules:  (cid)                => request('GET',    `/adv-po/weather-rules/${cid}`),
  createWeatherRule:(data)               => request('POST',   '/adv-po/weather-rules', data),
  updateWeatherRule:(id, data)           => request('PUT',    `/adv-po/weather-rules/${id}`, data),
  deleteWeatherRule:(id)                 => request('DELETE', `/adv-po/weather-rules/${id}`),
  // Occasions
  getOccasions:     ()                   => request('GET',    '/adv-po/occasions'),
  getOccasionRules: (occ_id)            => request('GET',    `/adv-po/occasions/${occ_id}/rules`),
  upsertOccasionRule:(occ_id, data)     => request('POST',   `/adv-po/occasions/${occ_id}/rules`, data),
  // Branch occasions
  getBranchOccasions:(cid)              => request('GET',    `/adv-po/branch-occasions/${cid}`),
  setBranchOccasion: (cid, data)        => request('POST',   `/adv-po/branch-occasions/${cid}`, data),
  // Suggestions
  generateSuggestions:(cid, nid, poId, poDate) => request('POST', `/adv-po/suggest/${cid}/${nid}/${poId}?po_date=${poDate}`),
  getSuggestions:    (poId)             => request('GET',    `/adv-po/suggestions/${poId}`),
  acceptSuggestions: (poId, items)      => request('POST',   `/adv-po/suggestions/${poId}/accept`, { items }),
  // Accuracy (Phase 1.5)
  getAccuracyReport: (cid, days)        => request('GET',    `/adv-po/accuracy/${cid}?days_back=${days || 14}`),
  applyCorrection:   (data)             => request('POST',   '/adv-po/accuracy/apply-correction', data),
  // Weather preview
  previewWeather:    (cid)              => request('GET',    `/adv-po/weather-preview/${cid}`),
};

// ── Production Entry ──────────────────────────────────────────
export const productionAPI = {
  getAll:   (cid)          => request('GET',    `/production/list/${cid}`),
  getById:  (id)           => request('GET',    `/production/${id}`),
  create:   (data)         => request('POST',   '/production', data),
  update:   (id, data)     => request('PUT',    `/production/${id}`, data),
  post:     (id, by)       => request('POST',   `/production/${id}/post${by ? `?posted_by=${by}` : ''}`),
  delete:   (id)           => request('DELETE', `/production/${id}`),
};
