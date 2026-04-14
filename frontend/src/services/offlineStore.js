// ── Cache Keys ──────────────────────────────────────────────
const KEYS = {
  menu:       'rms_offline_menu',
  categories: 'rms_offline_categories',
  company:    'rms_offline_company',
  tables:     'rms_offline_tables',
  orders:     'rms_offline_orders', // pending orders queue
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

// ── Offline Order Queue ──────────────────────────────────────
export const getPendingOrders = () => { try { return JSON.parse(localStorage.getItem(KEYS.orders)) || []; } catch { return []; } };

export const addPendingOrder = (order) => {
  const orders = getPendingOrders();
  const newOrder = { ...order, offline_id: Date.now(), created_offline: true };
  orders.push(newOrder);
  localStorage.setItem(KEYS.orders, JSON.stringify(orders));
  return newOrder;
};

export const removePendingOrder = (offlineId) => {
  const orders = getPendingOrders().filter(o => o.offline_id !== offlineId);
  localStorage.setItem(KEYS.orders, JSON.stringify(orders));
};

export const clearPendingOrders = () => localStorage.removeItem(KEYS.orders);

// ── Check if we have cached data ─────────────────────────────
export const hasCachedData = () => !!localStorage.getItem(KEYS.menu);