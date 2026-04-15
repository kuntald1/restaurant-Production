import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/useApp';
import { posTableAPI, posOrderAPI, posKotAPI, posBillAPI, foodMenuAPI, foodCategoryAPI, qrAPI, paymentTransactionAPI, crmCustomerAPI, crmPromoAPI, smsSettingsAPI, paymentLinkAPI } from '../services/api';
import {
  cacheMenu, cacheCategories, cacheTables,
  getCachedMenu, getCachedCategories, getCachedTables,
  createOfflineOrder, addItemToOfflineOrder, removeItemFromOfflineOrder,
  markOfflineOrderBilled, printOfflineBill,
  getUnsyncedOfflineOrders, markOfflineOrderSynced,
} from '../services/offlineStore';

const STATUS_META = {
  draft:                       { label: 'Draft',       bg: '#f3f4f6', color: '#374151' },
  kot_open:                    { label: 'KOT Open',    bg: '#fef3c7', color: '#92400e' },
  kot_inprocess:               { label: 'In Kitchen',  bg: '#dbeafe', color: '#1e40af' },
  ready:                       { label: 'Ready',       bg: '#d1fae5', color: '#065f46' },
  billed:                      { label: 'Billed',      bg: '#ede9fe', color: '#4c1d95' },
  picked_up:                   { label: 'Picked Up',   bg: '#d1fae5', color: '#065f46' },
  picked_up_by_delivery_agent: { label: 'Delivered',   bg: '#d1fae5', color: '#065f46' },
  cancelled:                   { label: 'Cancelled',   bg: '#fee2e2', color: '#991b1b' },
};

const TABLE_META = {
  free:     { bg: '#d1fae5', border: '#34d399', text: '#065f46' },
  occupied: { bg: '#fef3c7', border: '#fbbf24', text: '#92400e' },
  reserved: { bg: '#ede9fe', border: '#a78bfa', text: '#4c1d95' },
};

const METHOD_COLORS = {
  GET:    '#065f46', POST:   '#1e40af',
  PUT:    '#92400e', DELETE: '#991b1b', PATCH: '#4c1d95',
};

// ── Collapsible Customer Panel ──────────────────────────────
function CustomerPanel({ cid, order, companySettings, onPhoneChange, onCustomerFound, onCustomerChange }) {
  const [open,    setOpen]    = useState(false);
  const [phone,   setPhone]   = useState('');
  const [customer,setCustomer]= useState(null);
  const [loading, setLoading] = useState(false);
  const [form,    setForm]    = useState({ name:'', email:'', date_of_birth:'', anniversary_date:'' });
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    const p = order?.customer_phone || '';
    setPhone(p);
    setCustomer(null);
    setSaved(false);
    if (p) onPhoneChange(p);
  }, [order?.order_id]);

  const lookup = async () => {
    if (!phone.trim()) return;
    setLoading(true); setCustomer(null); setSaved(false);
    try {
      const c = await crmCustomerAPI.lookupPhone(cid, phone.replace(/[^0-9]/g, ''));
      setCustomer(c);
      setForm({ name: c.name||'', email: c.email||'', date_of_birth: c.date_of_birth||'', anniversary_date: c.anniversary_date||'' });
      onPhoneChange(phone);
      if (onCustomerFound) onCustomerFound(c.customer_id);
      if (onCustomerChange) onCustomerChange(c);
    } catch {
      setCustomer({ notFound: true });
      setForm({ name: order?.customer_name||'', email:'', date_of_birth:'', anniversary_date:'' });
      onPhoneChange(phone);
      if (onCustomerChange) onCustomerChange(null);
    }
    setLoading(false);
  };

  const saveCustomer = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: form.name, phone: phone.replace(/[^0-9]/g,''),
        email: form.email||undefined, date_of_birth: form.date_of_birth||undefined,
        anniversary_date: form.anniversary_date||undefined };
      const c = await crmCustomerAPI.create(cid, payload);
      setCustomer(c); setSaved(true);
      if (onCustomerFound) onCustomerFound(c.customer_id);
      if (onCustomerChange) onCustomerChange(c);
    } catch(e) { console.error(e); }
    setSaving(false);
  };

  const smsEnabled = companySettings?.is_whatsapp_enabled === true;

  return (
    <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', background:'var(--white)' }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span>👤</span>
          <span style={{ fontWeight:600, color:'var(--text-1)' }}>
            {customer && !customer.notFound ? customer.name : (phone ? phone : 'Customer')}
          </span>
          {customer && !customer.notFound && (
            <span style={{ fontSize:11, color:'var(--primary)', background:'#ede9fe', padding:'1px 8px', borderRadius:10 }}>CRM ✓</span>
          )}
          {smsEnabled && phone && (
            <span style={{ fontSize:11, color:'#166534', background:'#dcfce7', padding:'1px 8px', borderRadius:10 }}>📱 WhatsApp</span>
          )}
        </div>
        <span style={{ fontSize:12, color:'var(--text-3)', display:'inline-block', transform: open?'rotate(180deg)':'none', transition:'transform .15s' }}>▼</span>
      </button>

      {open && (
        <div style={{ padding:'12px 14px', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:10 }}>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'.04em' }}>
              Phone {smsEnabled && <span style={{ color:'#166534', fontWeight:400 }}>(WhatsApp bill)</span>}
            </label>
            <div style={{ display:'flex', gap:8, marginTop:4 }}>
              <input value={phone} onChange={e => { setPhone(e.target.value); setCustomer(null); onPhoneChange(e.target.value); }}
                style={{ flex:1, padding:'8px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13 }}
                placeholder="+91 9876543210" />
              <button type="button" onClick={lookup} disabled={loading}
                style={{ padding:'8px 14px', background:'var(--primary)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13 }}>
                {loading ? '⏳' : '🔍'}
              </button>
            </div>
          </div>

          {customer && !customer.notFound && (
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'10px 14px', fontSize:13 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 16px' }}>
                <div>👤 <strong>{customer.name}</strong></div>
                <div>📱 {customer.phone||'—'}</div>
                <div>✉️ {customer.email||'—'}</div>
                <div>🎂 {customer.date_of_birth||'—'}</div>
                <div>💍 {customer.anniversary_date||'—'}</div>
                <div>🏆 {customer.loyalty_points||0} pts · {customer.total_visits||0} visits</div>
              </div>
              <div style={{ marginTop:6, fontSize:12, color:'#166534' }}>₹{Number(customer.total_spend||0).toFixed(0)} lifetime spend</div>
            </div>
          )}

          {customer?.notFound && (
            <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:8, padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ fontSize:12, color:'#92400e', fontWeight:600 }}>⚠️ New customer — fill details to save in CRM (optional)</div>
              {[
                { k:'name', label:'Name', type:'text', placeholder:'Customer name' },
                { k:'email', label:'Email', type:'email', placeholder:'email@example.com' },
                { k:'date_of_birth', label:'Birthday', type:'date' },
                { k:'anniversary_date', label:'Anniversary', type:'date' },
              ].map(({k,label,type,placeholder=''}) => (
                <div key={k} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <label style={{ fontSize:12, width:90, color:'var(--text-2)', flexShrink:0 }}>{label}</label>
                  <input type={type} value={form[k]} onChange={e => setForm(f=>({...f,[k]:e.target.value}))}
                    style={{ flex:1, padding:'6px 10px', border:'1px solid var(--border)', borderRadius:7, fontSize:13 }}
                    placeholder={placeholder} />
                </div>
              ))}
              {saved
                ? <div style={{ fontSize:12, color:'#166534', fontWeight:600 }}>✅ Saved to CRM!</div>
                : <button type="button" onClick={saveCustomer} disabled={saving || !form.name.trim()}
                    style={{ padding:'7px 14px', background:'#7c3aed', color:'#fff', border:'none', borderRadius:8, fontSize:12, cursor:'pointer', alignSelf:'flex-start' }}>
                    {saving ? 'Saving…' : '💾 Save to CRM'}
                  </button>
              }
            </div>
          )}

          {!customer && !phone && (
            <div style={{ fontSize:12, color:'var(--text-3)', textAlign:'center', padding:'4px 0' }}>
              Enter phone number and click 🔍 to lookup customer
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Proper rounding (avoids JS banker's rounding on .5) ──────
const roundHalfUp = (n) => Math.floor(Number(n) + 0.5);

export default function POS({ onNavigate }) {
  const { selectedCompany, showToast, user, companySettings } = useApp();
  const cid = selectedCompany?.company_unique_id;

  // ── State ─────────────────────────────────────────────────
  const [tables,     setTables]     = useState([]);
  const [orders,     setOrders]     = useState([]);
  const [activeOrder,setActiveOrder]= useState(null);
  const [menuItems,  setMenuItems]  = useState([]);
  const [categories, setCategories] = useState([]);
  const [kots,       setKots]       = useState([]);
  const [bill,       setBill]       = useState(null);

  const [loading,    setLoading]    = useState(false);
  const [category,   setCategory]   = useState('All');
  const [search,     setSearch]     = useState('');
  const [vegFilter,  setVegFilter]  = useState(null);

  const [modal,      setModal]      = useState(null); // 'table' | 'neworder' | 'bill' | 'kot'
  const [saving,     setSaving]     = useState(false);

  // Bill form
  const [payMethod,  setPayMethod]  = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [payRef,     setPayRef]     = useState('');

  // ── Payment settings — merge login API response + localStorage ──
  const paySettings = (() => {
    try {
      const cid   = selectedCompany?.company_unique_id;
      const local = cid ? JSON.parse(localStorage.getItem(`rms_payment_settings_${cid}`) || '{}') : {};
      // companySettings from login API takes priority for flags + key_id
      return { ...local, ...companySettings };
    } catch { return {}; }
  })();
  // is_merchant_enabled comes from login API response (companySettings) — authoritative
  // razorpay_key_id comes from localStorage or login response
  const merchantEnabled = (companySettings?.is_merchant_enabled === true) &&
    !!(paySettings.razorpay_key_id || companySettings?.razorpay_key_id);

  // Sub-method for Merchant: 'merchant_upi' | 'merchant_card'
  const [merchantSub, setMerchantSub] = useState('merchant_upi');
  // UPI QR screen state
  const [showUpiQr, setShowUpiQr] = useState(false);
  // Razorpay payment status
  const [rzpStatus,    setRzpStatus]    = useState(''); // '' | 'loading' | 'success' | 'failed'
  const [companyQrUrl, setCompanyQrUrl] = useState('');
  const [billCustPhone,     setBillCustPhone]     = useState('');
  const [billCustomerId,   setBillCustomerId]   = useState(null);
  const [headerCustomer,   setHeaderCustomer]   = useState(null); // customer found in CustomerPanel for header display
  const [custLookup,        setCustLookup]        = useState(null);
  const [custLookupLoading, setCustLookupLoading] = useState(false);
  const [orderCustPhone,    setOrderCustPhone]    = useState('');
  const [orderCustLookup,   setOrderCustLookup]   = useState(null);  // found CRM customer for new order
  const [orderCustLoading,  setOrderCustLoading]  = useState(false);

  // Load company QR for Personal UPI section
  useEffect(() => {
    if (!cid) return;
    qrAPI.getActive(cid).then(qrs => {
      if (qrs?.length) setCompanyQrUrl(qrs[0].image_url || qrs[0].qr_image_url || '');
    }).catch(() => {});
  }, [cid]);
  const [discount,     setDiscount]     = useState(0);
  const [promoCode,    setPromoCode]    = useState('');
  const [promoResult,  setPromoResult]  = useState(null);  // { valid, promo_id, discount_amount, description }
  const [promoLoading, setPromoLoading] = useState(false);
  const [waSendLoading, setWaSendLoading] = useState(false);
  const [payLinkId,    setPayLinkId]    = useState(null);  // active payment link id
  const [payLinkPolling, setPayLinkPolling] = useState(false); // polling in progress

  // New order form
  const [orderType,  setOrderType]  = useState('dine_in');
  const [selectedTable, setSelectedTable] = useState(null);
  const [custName,   setCustName]   = useState('');
  const [custPhone,  setCustPhone]  = useState('');
  const [covers,     setCovers]     = useState(2);
  const [deliveryAddr, setDeliveryAddr] = useState('');

  // ── Offline state ─────────────────────────────────────────
  const [isOnline,             setIsOnline]             = useState(navigator.onLine);
  const [isOfflineOrder,       setIsOfflineOrder]       = useState(false);
  const [showOfflineBillModal, setShowOfflineBillModal] = useState(false);
  const [offlinePayMethod,     setOfflinePayMethod]     = useState('cash');
  const [offlineAmountPaid,    setOfflineAmountPaid]    = useState('');
  const [syncStatus,           setSyncStatus]           = useState({ total: 0, remaining: 0, syncing: false });
  const [pendingCount,         setPendingCount]         = useState(0);
  const [showSyncedMsg,        setShowSyncedMsg]        = useState(false);

  // ── Load data ─────────────────────────────────────────────
const loadTables = useCallback(async () => {
  if (!cid) return;
  try {
    const t = await posTableAPI.getAll(cid);
    setTables(t);
    cacheTables(t); // ── Cache for offline ──
  } catch {
    const cached = getCachedTables();
    if (cached.length > 0) setTables(cached);
  }
}, [cid]);

  const loadOrders = useCallback(async () => {
    if (!cid) return;
    try {
      const data = await posOrderAPI.getRunning(cid);
      setOrders(data);
      // Cache for offline use
      localStorage.setItem(`rms_running_orders_${cid}`, JSON.stringify(data));
    } catch {
      // Load from cache when offline
      try {
        const cached = JSON.parse(localStorage.getItem(`rms_running_orders_${cid}`) || '[]');
        if (cached.length > 0) setOrders(cached);
      } catch {}
    }
  }, [cid]);

const loadMenu = useCallback(async () => {
  if (!cid) return;
  try {
    const [items, cats] = await Promise.all([
      foodMenuAPI.getAll(cid),
      foodCategoryAPI.getAll(cid),
    ]);
    const filtered = (items || []).filter(i => i.IsActive && i.is_available);
    setMenuItems(filtered);
    setCategories([{ id: 'All', name: 'All' }, ...(cats || []).map(c => ({ id: c.food_category_id, name: c.category_name }))]);
    // ── Cache for offline use ──
    cacheMenu(filtered);
    cacheCategories(cats || []);
  } catch {
    // ── Load from cache if offline ──
    const cached = getCachedMenu();
    const cachedCats = getCachedCategories();
    if (cached.length > 0) {
      setMenuItems(cached);
      setCategories([{ id: 'All', name: 'All' }, ...cachedCats.map(c => ({ id: c.food_category_id, name: c.category_name }))]);
      showToast('📴 Showing cached menu (offline)', 'info');
    }
  }
}, [cid]);

  const loadOrderDetail = useCallback(async (orderId, fallbackOrder = null) => {
    try {
      const [order, kts] = await Promise.all([
        posOrderAPI.getById(orderId),
        posKotAPI.getByOrder(orderId),
      ]);
      setActiveOrder(order);
      setIsOfflineOrder(false);
      setKots(kts || []);
      if (order.order_status === 'billed') {
        try { setBill(await posBillAPI.getByOrder(orderId)); } catch { setBill(null); }
      } else { setBill(null); }
    } catch (e) {
      // If offline, use the fallback order data from the running orders list
      if (fallbackOrder) {
        setActiveOrder(fallbackOrder);
        setIsOfflineOrder(false);
        setKots([]);
        setBill(null);
        showToast('📴 Showing cached order data (offline)', 'info');
      } else {
        showToast('📴 Cannot load order details while offline', 'error');
      }
    }
  }, []);

  useEffect(() => {
    loadTables(); loadOrders(); loadMenu();
  }, [cid]);

  // ── Track pending sync count ─────────────────────────────
  const updatePendingCount = () => {
    try {
      const offlineOrders  = getUnsyncedOfflineOrders().length;
      const pendingBills   = JSON.parse(localStorage.getItem(`rms_pending_bills_${cid}`) || '[]').length;
      const pendingItems   = JSON.parse(localStorage.getItem(`rms_pending_items_${cid}`) || '[]').length;
      const pendingDels    = JSON.parse(localStorage.getItem(`rms_pending_deletions_${cid}`) || '[]').length;
      const pendingUpdates = JSON.parse(localStorage.getItem(`rms_pending_updates_${cid}`) || '[]').length;
      const total = offlineOrders + pendingBills + pendingItems + pendingDels + pendingUpdates;
      setPendingCount(total);
      return total;
    } catch { return 0; }
  };

  // ── Online/Offline detection + auto-sync ──────────────────
  useEffect(() => {
    const goOffline = () => { setIsOnline(false); updatePendingCount(); };
    const goOnline  = () => {
      setIsOnline(true);
      const count = updatePendingCount();
      if (count > 0) {
        setSyncStatus({ total: count, remaining: count, syncing: true });
        setShowSyncedMsg(false);
      }
      syncOfflineOrders();
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, []);

  // ── Count all pending items for sync ────────────────────
  const getPendingCount = () => {
    try {
      const offlineOrders  = getUnsyncedOfflineOrders().length;
      const pendingBills   = JSON.parse(localStorage.getItem(`rms_pending_bills_${cid}`) || '[]').length;
      const pendingItems   = JSON.parse(localStorage.getItem(`rms_pending_items_${cid}`) || '[]').length;
      const pendingDels    = JSON.parse(localStorage.getItem(`rms_pending_deletions_${cid}`) || '[]').length;
      const pendingUpdates = JSON.parse(localStorage.getItem(`rms_pending_updates_${cid}`) || '[]').length;
      return offlineOrders + pendingBills + (pendingItems > 0 ? 1 : 0) + (pendingDels > 0 ? 1 : 0) + (pendingUpdates > 0 ? 1 : 0);
    } catch { return 0; }
  };

  const syncOfflineOrders = async () => {
    // Sync pending item changes for existing online orders
    try {
      let anySynced = false;

      // 1. Sync deletions first
      const delKey = `rms_pending_deletions_${cid}`;
      const pendingDeletions = JSON.parse(localStorage.getItem(delKey) || '[]');
      const syncedDels = [];
      for (const del of pendingDeletions) {
        try {
          // Set qty to 0 = delete
          await posOrderAPI.updateQty(del.order_id, del.order_item_id, 0);
          syncedDels.push(del);
          anySynced = true;
        } catch(e) { console.error('Deletion sync failed:', e); }
      }
      if (syncedDels.length > 0) {
        localStorage.setItem(delKey, JSON.stringify(pendingDeletions.filter(d => !syncedDels.includes(d))));
      }

      // 2. Sync qty updates
      const updateKey = `rms_pending_updates_${cid}`;
      const pendingUpdates = JSON.parse(localStorage.getItem(updateKey) || '[]');
      const syncedUpdates = [];
      for (const upd of pendingUpdates) {
        try {
          await posOrderAPI.updateQty(upd.order_id, upd.order_item_id, upd.new_qty);
          syncedUpdates.push(upd);
          anySynced = true;
        } catch(e) { console.error('Update sync failed:', e); }
      }
      if (syncedUpdates.length > 0) {
        localStorage.setItem(updateKey, JSON.stringify(pendingUpdates.filter(u => !syncedUpdates.includes(u))));
      }

      // 3. Sync new item additions
      const key = `rms_pending_items_${cid}`;
      const pendingItems = JSON.parse(localStorage.getItem(key) || '[]');
      const synced = [];
      for (const item of pendingItems) {
        try {
          await posOrderAPI.addItem(item.order_id, cid, {
            food_menu_id:  item.food_menu_id,
            item_name:     item.item_name,
            item_code:     item.item_code || '',
            category_name: item.category_name || '',
            unit_price:    item.unit_price,
            quantity:      item.quantity,
            is_veg:        item.is_veg !== false,
          });
          synced.push(item);
          anySynced = true;
        } catch(e) { console.error('Item sync failed:', e); }
      }
      if (synced.length > 0) {
        localStorage.setItem(key, JSON.stringify(pendingItems.filter(i => !synced.includes(i))));
      }

      if (anySynced) showToast('✅ Offline changes synced to server!');
      const rem = updatePendingCount();
      setSyncStatus(prev => ({ ...prev, remaining: rem }));
    } catch {}

    // Sync existing online orders that were billed while offline
    try {
      const pendingBills = JSON.parse(localStorage.getItem(`rms_pending_bills_${cid}`) || '[]');
      for (const bill of pendingBills) {
        try {
          await posBillAPI.generate({
            order_id:          bill.order_id,
            company_unique_id: cid,
            payment_method:    bill.payment_method,
            amount_paid:       bill.amount_paid,
            discount_amount:   bill.discount || 0,
            service_charge:    bill.surcharge || 0,
            sgst_amount:       bill.sgst_amount || 0,
            cgst_amount:       bill.cgst_amount || 0,
            created_by:        user?.user_id || null,
          });
        } catch(e) { console.error('Pending bill sync failed:', e); }
      }
      localStorage.removeItem(`rms_pending_bills_${cid}`);
      loadOrders();
    } catch {}

    const pending = getUnsyncedOfflineOrders();
    if (!pending.length) return;
    showToast(`🔄 Syncing ${pending.length} offline order(s)...`);
    let synced = 0;
    for (const order of pending) {
      try {
        // Step 1 — Create order on server
        const serverOrder = await posOrderAPI.create({
          company_unique_id: order.company_unique_id,
          order_type:        order.order_type,
          table_id:          order.table_id || undefined,
          covers:            order.covers || 1,
          customer_name:     order.customer_name || '',
          customer_phone:    order.customer_phone || '',
          created_by:        order.created_by || null,
        });

        // Step 2 — Add all items
        for (const item of order.items || []) {
          await posOrderAPI.addItem(serverOrder.order_id, order.company_unique_id, {
            food_menu_id:  item.food_menu_id,
            item_name:     item.item_name,
            item_code:     item.item_code || '',
            category_name: item.category_name || '',
            unit_price:    item.unit_price,
            quantity:      item.quantity,
            is_veg:        item.is_veg !== false,
          });
        }

        // Step 3 — If order was billed offline, generate bill on server too
        if (order.order_status === 'billed' && order.payment_method) {
          try {
            await posBillAPI.generate({
              order_id:          serverOrder.order_id,
              company_unique_id: order.company_unique_id,
              payment_method:    order.payment_method,
              amount_paid:       parseFloat(order.amount_paid || order.total_payable || 0),
              discount_amount:   parseFloat(order.discount_amount || order.discount || 0),
              service_charge:    parseFloat(order.surcharge || 0),
              sgst_amount:       parseFloat(order.sgst_amount || 0),
              cgst_amount:       parseFloat(order.cgst_amount || 0),
              created_by:        order.created_by || null,
            });
          } catch(billErr) {
            console.error('Bill sync failed for order:', serverOrder.order_id, billErr);
          }
        }

        markOfflineOrderSynced(order.offline_id);
        synced++;
      } catch(e) { console.error('Sync failed:', order.offline_id, e); }
    }
    if (synced > 0) {
      showToast(`✅ ${synced} offline order(s) fully synced to server!`);
      loadOrders();
      loadTables();
    }
    // Clear sync status when done
    const remaining = updatePendingCount();
    setSyncStatus(prev => ({ ...prev, remaining, syncing: remaining > 0 }));
    if (remaining === 0) {
      setShowSyncedMsg(true);
      setTimeout(() => setShowSyncedMsg(false), 4000); // auto-hide after 4 seconds
    }
  };

  const refresh = async () => {
    await Promise.all([loadTables(), loadOrders()]);
    if (activeOrder) await loadOrderDetail(activeOrder.order_id);
  };

  // ── Order selection ───────────────────────────────────────
  const selectOrder = async (order) => {
    setRzpStatus('');
    setMerchantSub('merchant_upi');
    setPayMethod('cash');
    setBillCustPhone(order?.customer_phone || '');
    setBillCustomerId(null);
    setHeaderCustomer(null);
    setDiscount(0); setAmountPaid(''); setPayRef(''); setPayMethod('cash');
    // Pass the order object as fallback for offline use
    await loadOrderDetail(order.order_id, order);
  };

  // ── Create order ──────────────────────────────────────────
  const createOrder = async () => {
    setSaving(true);
    const resetForm = () => { setOrderType('dine_in'); setSelectedTable(null); setCustName(''); setCustPhone(''); setCovers(2); setDeliveryAddr(''); setOrderCustPhone(''); setOrderCustLookup(null); };

    // Clear previous bill state when creating new order
    setBill(null);
    setIsOfflineOrder(false);

    if (!isOnline) {
      // ── Offline order creation ──
      const order = createOfflineOrder({
        company_unique_id: cid,
        order_type: orderType,
        table_id:   orderType === 'dine_in' && selectedTable ? selectedTable.table_id : null,
        table_name: orderType === 'dine_in' && selectedTable ? selectedTable.table_name : null,
        covers:     parseInt(covers) || 1,
        customer_name:  orderType !== 'dine_in' ? (custName || '') : '',
        customer_phone: orderType !== 'dine_in' ? (custPhone || '') : '',
        created_by: user?.user_id || null,
      });
      setActiveOrder(order);
      setIsOfflineOrder(true);
      setModal(null);
      showToast('📴 Offline order created — syncs when online');
      resetForm();
      setSaving(false);
      updatePendingCount();
      return;
    }

    try {
      const payload = {
        company_unique_id: cid,
        order_type: orderType,
        covers: parseInt(covers) || 1,
        created_by: user?.user_id || null,
      };
      if (orderType === 'dine_in' && selectedTable) payload.table_id = selectedTable.table_id;
      if (orderType !== 'dine_in') { payload.customer_name = custName || orderCustLookup?.name || ''; payload.customer_phone = orderCustPhone || custPhone; }
      if (orderType === 'delivery') payload.delivery_address = deliveryAddr;

      const order = await posOrderAPI.create(payload);
      setIsOfflineOrder(false);
      await refresh();
      setModal(null);
      await loadOrderDetail(order.order_id);
      showToast(`Order ${order.order_number} created!`);
      resetForm();
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  // ── Add item ─────────────────────────────────────────────
  const addItem = async (menuItem) => {
    if (!activeOrder) { showToast('Select or create an order first', 'error'); return; }
    const st = activeOrder.order_status;
    if (st === 'billed' || st === 'cancelled') { showToast('Order is locked', 'error'); return; }
    if (st === 'kot_inprocess') { showToast('Kitchen is cooking — cannot add items', 'error'); return; }

    if (isOfflineOrder) {
      const updated = addItemToOfflineOrder(activeOrder.offline_id, menuItem);
      if (updated) setActiveOrder({ ...updated });
      return;
    }

    // For online orders that are now offline — update local state AND save to pending queue
    if (!isOnline) {
      showToast('📴 Offline — item added, will sync when online', 'info');
      // Save to pending items queue for sync
      try {
        const key = `rms_pending_items_${cid}`;
        const pendingItems = JSON.parse(localStorage.getItem(key) || '[]');
        pendingItems.push({
          order_id:      activeOrder.order_id,
          food_menu_id:  menuItem.food_menu_id,
          item_name:     menuItem.name,
          item_code:     menuItem.code || '',
          category_name: menuItem.category_name || '',
          unit_price:    Math.round(parseFloat(menuItem.sale_price || 0)),
          quantity:      1,
          is_veg:        menuItem.is_veg !== false,
        });
        localStorage.setItem(key, JSON.stringify(pendingItems));
      } catch {}
      // Update local UI state
      setActiveOrder(prev => {
        if (!prev) return prev;
        const items = [...(prev.items || [])];
        const ex = items.find(i => i.food_menu_id === menuItem.food_menu_id);
        if (ex) { ex.quantity += 1; }
        else { items.push({ food_menu_id: menuItem.food_menu_id, item_name: menuItem.name, item_code: menuItem.code || '', unit_price: Math.round(parseFloat(menuItem.sale_price || 0)), quantity: 1, is_veg: menuItem.is_veg !== false, is_cancelled: false, order_item_id: Date.now() }); }
        return { ...prev, items };
      });
      return;
    }

    try {
      await posOrderAPI.addItem(activeOrder.order_id, cid, {
        food_menu_id:  menuItem.food_menu_id,
        item_name:     menuItem.name,
        item_code:     menuItem.code || '',
        category_name: menuItem.category_name || '',
        unit_price:    menuItem.sale_price,
        quantity:      1,
        is_veg:        menuItem.is_veg !== false,
      });
      await loadOrderDetail(activeOrder.order_id);
      await loadOrders();
    } catch (e) { showToast(e.message, 'error'); }
  };

  // ── Change quantity ───────────────────────────────────────
  const changeQty = async (item, delta) => {
    if (!activeOrder) return;
    const st = activeOrder.order_status;
    if (st === 'billed' || st === 'cancelled') return;
    if (item.kot_item_status === 'kot_inprocess') { showToast(`"${item.item_name}" is being cooked`, 'error'); return; }

    if (isOfflineOrder) {
      if (delta > 0) {
        const updated = addItemToOfflineOrder(activeOrder.offline_id, { ...item, food_menu_id: item.food_menu_id, name: item.item_name, sale_price: item.unit_price });
        if (updated) setActiveOrder({ ...updated });
      } else {
        const updated = removeItemFromOfflineOrder(activeOrder.offline_id, item.food_menu_id);
        if (updated) setActiveOrder({ ...updated });
      }
      return;
    }

    // For online orders that are now offline — update local state AND pending queue
    if (!isOnline) {
      // Save qty change / deletion to pending queue
      try {
        const key = `rms_pending_items_${cid}`;
        const pendingItems = JSON.parse(localStorage.getItem(key) || '[]');
        const delKey = `rms_pending_deletions_${cid}`;
        const pendingDeletions = JSON.parse(localStorage.getItem(delKey) || '[]');

        const newQtyOnServer = item.quantity + delta; // what qty should be on server

        if (newQtyOnServer <= 0) {
          // Full deletion — track order_item_id for server deletion
          if (item.order_item_id && !String(item.order_item_id).startsWith('OFFLINE')) {
            const alreadyTracked = pendingDeletions.find(d => d.order_item_id === item.order_item_id);
            if (!alreadyTracked) {
              pendingDeletions.push({
                order_id:      activeOrder.order_id,
                order_item_id: item.order_item_id,
                food_menu_id:  item.food_menu_id,
              });
              localStorage.setItem(delKey, JSON.stringify(pendingDeletions));
            }
          }
          // Also remove from pending additions if it was added offline
          const addIdx = pendingItems.findIndex(i => i.order_id === activeOrder.order_id && i.food_menu_id === item.food_menu_id);
          if (addIdx !== -1) pendingItems.splice(addIdx, 1);
        } else {
          // Qty change — track as update
          const ex = pendingItems.find(i => i.order_id === activeOrder.order_id && i.food_menu_id === item.food_menu_id);
          if (ex) {
            ex.quantity += delta;
            if (ex.quantity <= 0) {
              const idx = pendingItems.indexOf(ex);
              pendingItems.splice(idx, 1);
            }
          } else if (delta > 0) {
            pendingItems.push({
              order_id:      activeOrder.order_id,
              food_menu_id:  item.food_menu_id,
              item_name:     item.item_name,
              item_code:     item.item_code || '',
              category_name: item.category_name || '',
              unit_price:    parseFloat(item.unit_price || 0),
              quantity:      delta,
              is_veg:        item.is_veg !== false,
            });
          } else {
            // Decrease qty on existing server item — track as qty update
            const updateKey = `rms_pending_updates_${cid}`;
            const pendingUpdates = JSON.parse(localStorage.getItem(updateKey) || '[]');
            const exUpdate = pendingUpdates.find(u => u.order_item_id === item.order_item_id);
            if (exUpdate) { exUpdate.new_qty = newQtyOnServer; }
            else if (item.order_item_id && !String(item.order_item_id).startsWith('OFFLINE')) {
              pendingUpdates.push({ order_id: activeOrder.order_id, order_item_id: item.order_item_id, new_qty: newQtyOnServer });
            }
            localStorage.setItem(updateKey, JSON.stringify(pendingUpdates));
          }
        }
        localStorage.setItem(key, JSON.stringify(pendingItems));
      } catch {}
      setActiveOrder(prev => {
        if (!prev) return prev;
        const items = [...(prev.items || [])];
        const idx = items.findIndex(i => i.food_menu_id === item.food_menu_id);
        if (idx === -1) return prev;
        const newQty = items[idx].quantity + delta;
        if (newQty <= 0) items.splice(idx, 1);
        else items[idx] = { ...items[idx], quantity: newQty };
        return { ...prev, items };
      });
      return;
    }

    const newQty = item.quantity + delta;
    try {
      await posOrderAPI.updateQty(activeOrder.order_id, item.order_item_id, newQty);
      await loadOrderDetail(activeOrder.order_id);
      await loadOrders();
    } catch (e) { showToast(e.message, 'error'); }
  };

  // ── Send KOT ─────────────────────────────────────────────
  const sendKOT = async () => {
    if (!activeOrder) return;
    // Send all active items that haven't been sent to kitchen yet
    // kot_id is null = never sent | kot_item_status not set = new item added after last KOT
    const itemIds = (activeOrder.items || [])
      .filter(i => !i.is_cancelled && !i.kot_id)
      .map(i => i.order_item_id);
    if (!itemIds.length) { showToast('All items already sent to kitchen', 'error'); return; }

    setSaving(true);
    try {
      const newKot = await posKotAPI.create({
        order_id: activeOrder.order_id,
        company_unique_id: cid,
        item_ids: itemIds,
        created_by: user?.user_id || null,
      });
      await loadOrderDetail(activeOrder.order_id);
      await loadOrders();
      showToast('🍳 KOT sent to kitchen!');
      // Auto-print KOT ticket — newKot from POST already has table_name
      if (newKot) {
        const tableName = newKot.table_name ||
          activeOrder?.table_name ||
          tables.find(t => t.table_id === activeOrder?.table_id)?.table_name || '';
        printKotTicket({ ...newKot, table_name: tableName }, activeOrder, selectedCompany);
      }
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  // ── Update KOT status ─────────────────────────────────────
  const updateKotStatus = async (kotId, status) => {
    setSaving(true);
    try {
      await posKotAPI.updateStatus(kotId, { kot_status: status });
      await loadOrderDetail(activeOrder.order_id);
      await loadOrders();
      showToast(`KOT marked: ${status}`);
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(false);
  };


  // ── Print KOT Ticket ──────────────────────────────────────
  const printKotTicket = (kot, order, company) => {
    const w = window.open('', '_blank', 'width=360,height=520');
    if (!w) { showToast('Allow popups to print KOT', 'error'); return; }
    const items = kot.kot_items || [];
    const now   = new Date().toLocaleString('en-IN');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>KOT - ${kot.kot_number}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',monospace;font-size:13px;color:#111;width:300px;margin:0 auto;padding:8px}
  .center{text-align:center} .bold{font-weight:700} .big{font-size:18px;font-weight:900}
  .line{border-top:2px dashed #333;margin:8px 0} .line-thin{border-top:1px dashed #aaa;margin:6px 0}
  .row{display:flex;justify-content:space-between;padding:2px 0}
  .item{padding:6px 0;border-bottom:1px dotted #ccc}
  .item-name{font-size:14px;font-weight:700}
  .item-qty{font-size:22px;font-weight:900;min-width:36px;text-align:right}
  .item-row{display:flex;justify-content:space-between;align-items:center}
  .note{font-size:11px;color:#555;padding-left:8px;margin-top:2px}
  .badge{display:inline-block;border:2px solid #111;padding:2px 10px;font-weight:700;font-size:12px;margin-top:4px}
  @media print{body{width:100%}button{display:none}}
</style></head><body>
<div class="center">
  <div style="font-size:11px;font-weight:700;letter-spacing:.1em">KITCHEN ORDER TICKET</div>
  <div class="big">${kot.kot_number}</div>
  <div style="font-size:11px;margin-top:2px">${company?.name || 'Restaurant OS'}</div>
</div>
<div class="line"></div>
<div class="row"><span class="bold">Order:</span><span>${order?.order_number || ''}</span></div>
<div class="row"><span class="bold">Table:</span><span>${
  kot.table_name && kot.table_name !== ''
    ? kot.table_name
    : order?.table_name && order.table_name !== ''
      ? order.table_name
      : (order?.order_type === 'take_away' ? 'Take Away'
        : order?.order_type === 'delivery' ? 'Delivery'
        : 'Dine In')
}</span></div>
<div class="row"><span class="bold">Type:</span><span>${order?.order_type  || ''}</span></div>
<div class="row"><span class="bold">Time:</span><span>${now}</span></div>
<div class="row"><span class="bold">Print #:</span><span>${(kot.print_count || 0) + 1}</span></div>
<div class="line"></div>
<div class="bold" style="margin-bottom:6px;font-size:14px">ITEMS (${items.length})</div>
${items.map(it => `
<div class="item">
  <div class="item-row">
    <div class="item-name">${it.is_veg === false ? '🔴' : '🟢'} ${it.item_name || ''}</div>
    <div class="item-qty">x${it.quantity}</div>
  </div>
  ${it.notes ? `<div class="note">📝 ${it.notes}</div>` : ''}
</div>`).join('')}
<div class="line"></div>
${kot.notes ? `<div style="padding:4px 0"><span class="bold">Note: </span>${kot.notes}</div><div class="line-thin"></div>` : ''}
<div class="center" style="margin-top:6px">
  <div class="badge">${kot.kot_status?.toUpperCase().replace('_',' ') || 'KOT OPEN'}</div>
</div>
<br/>
<div class="center">
  <button onclick="window.print();setTimeout(()=>window.close(),500)" style="padding:8px 24px;background:#111;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;font-family:inherit">🖨️ Print KOT</button>
</div>
</body></html>`);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch {} }, 500);
  };

  // ── Print Bill Receipt (called after generation) ───────────
  const printBillReceipt = async (billData, orderData, company, promoAmt = 0, promoCodeLabel = '', manualDiscountAmt = 0) => {
    try {
      // Fetch fresh data in parallel
      let qrUrl = null;
      let freshOrder = orderData;
      let freshBill  = billData;
      try {
        const [qrs, fullOrder, fullBill] = await Promise.allSettled([
          qrAPI.getActive(company.company_unique_id),
          posOrderAPI.getById(orderData?.order_id || billData?.order_id),
          posBillAPI.getById(billData.bill_id),
        ]);
        if (qrs.status === 'fulfilled' && qrs.value?.length) qrUrl = qrs.value[0].image_url;
        if (fullOrder.status === 'fulfilled') freshOrder = fullOrder.value;
        if (fullBill.status  === 'fulfilled') freshBill  = fullBill.value;
      } catch {}

      // Items come from the order's order_items array
      const items    = freshOrder?.order_items || freshOrder?.items || [];

      // Resolve table name: bill API has table_name directly
      const tableName = freshBill.table_name
        || (freshOrder?.table_name && freshOrder.table_name !== '' ? freshOrder.table_name : null)
        || (() => { const t = tables.find(t => t.table_id === (freshOrder?.table_id || orderData?.table_id)); return t?.table_name; })()
        || (freshBill.order_type === 'dine_in'   ? 'Dine In'
          : freshBill.order_type === 'take_away' ? 'Take Away'
          : freshBill.order_type === 'delivery'  ? 'Delivery'
          : '—');

      // Bill amounts — use exact API field names from /pos/bill/{id}
      // API: subtotal, total_payable, amount_paid, discount_amount, tax_amount, service_charge
      const subtotal          = Number(freshBill.subtotal          || freshBill.subtotal_amount  || 0);
      // Read promo from bill API response first, fall back to passed params (covers old schema)
      const promoDiscountPrint= Number(freshBill.promo_amount) > 0
        ? Number(freshBill.promo_amount)
        : Number(promoAmt || 0);
      const discount          = Number(freshBill.discount_amount) > 0
        ? Number(freshBill.discount_amount)
        : Number(manualDiscountAmt || 0);
      const promoCodeLabel2   = freshBill.promo_code || promoCodeLabel || '';
      const surcharge         = Number(freshBill.service_charge || freshBill.table_surcharge_amount || freshOrder?.table_surcharge_amount || 0);
      const tax               = Number(freshBill.tax_amount        || 0);

      // SGST / CGST from company settings
      const sgstRate = parseFloat(companySettings?.sgst || selectedCompany?.sgst || 0);
      const cgstRate = parseFloat(companySettings?.cgst || selectedCompany?.cgst || 0);
      const taxableAmt = Math.max(0, subtotal - discount - promoDiscountPrint);
      const sgstAmt  = sgstRate > 0 ? (taxableAmt * sgstRate / 100) : 0;
      const cgstAmt  = cgstRate > 0 ? (taxableAmt * cgstRate / 100) : 0;
      const total    = Math.round(Math.max(0, taxableAmt + surcharge + tax + sgstAmt + cgstAmt));

      const w = window.open('', '_blank', 'width=400,height=700');
      if (!w) { showToast('Allow popups to print bill', 'error'); return; }

      w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bill - ${billData.bill_number}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',monospace;font-size:12px;color:#111;background:#fff;padding:0;width:300px;margin:0 auto}
  .center{text-align:center}.bold{font-weight:700}.line{border-top:1px dashed #888;margin:8px 0}
  .row{display:flex;justify-content:space-between;padding:2px 0}
  .row-item{display:flex;gap:4px;padding:3px 0}
  .logo{max-width:80px;max-height:60px;display:block;margin:0 auto 6px}
  .qr{width:200px;height:200px;display:block;margin:8px auto;object-fit:contain}
  .big{font-size:16px;font-weight:700}.med{font-size:13px;font-weight:700}
  .muted{color:#555;font-size:10px}.total-row{font-size:14px;font-weight:700}
  @media print{body{width:100%}button{display:none}}
</style></head><body>
<div class="center">
  ${company.logo_file_name ? `<img src="${company.logo_file_name}" class="logo" onerror="this.style.display='none'"/>` : ''}
  <div class="big">${company.name}</div>
  ${company.address1 ? `<div class="muted">${company.address1}${company.address2 ? ', ' + company.address2 : ''}${company.pin ? ' - ' + company.pin : ''}</div>` : ''}
  ${company.country  ? `<div class="muted">${company.country}</div>` : ''}
  ${company.admin_phone ? `<div class="muted">Ph: ${company.admin_phone}</div>` : ''}
  ${company.admin_email ? `<div class="muted">${company.admin_email}</div>` : ''}
  ${company.website   ? `<div class="muted">${company.website}</div>` : ''}
  ${company.gstin     ? `<div class="muted">GSTIN: ${company.gstin}</div>` : ''}
  ${company.fssai     ? `<div class="muted">FSSAI: ${company.fssai}</div>` : ''}
</div>

<div class="line"></div>
<div class="row"><span class="bold">Bill No:</span><span>${billData.bill_number}</span></div>
<div class="row"><span class="bold">Order:</span><span>${orderData?.order_number || ''}</span></div>
<div class="row"><span class="bold">Table:</span><span>${tableName}</span></div>
<div class="row"><span class="bold">Type:</span><span>${orderData?.order_type || ''}</span></div>
<div class="row"><span class="bold">Date:</span><span>${new Date().toLocaleString('en-IN')}</span></div>
<div class="row"><span class="bold">Payment:</span><span>${billData.payment_method || 'Cash'}</span></div>
<div class="line"></div>

<div class="bold" style="margin-bottom:4px">ITEMS</div>
${items.filter(i => !i.is_cancelled).map(it => `
  <div class="row-item">
    <div style="flex:1">${it.is_veg === false ? '🔴' : '🟢'} ${it.item_name || it.name || ''}</div>
    <div style="white-space:nowrap;text-align:right">${it.quantity} x ₹${Number(it.unit_price||it.price||0).toFixed(2)} = ₹${Number(it.total_price||0).toFixed(2)}</div>
  </div>`).join('')}
${items.filter(i => !i.is_cancelled).length === 0 ? '<div style="color:#aaa;text-align:center;padding:6px">No items</div>' : ''}

<div class="line"></div>
<div class="row"><span>Subtotal</span><span>₹${Number(subtotal).toFixed(2)}</span></div>
${discount > 0  ? `<div class="row"><span>Discount</span><span>-₹${Number(discount).toFixed(2)}</span></div>` : ''}
${promoDiscountPrint > 0 ? `<div class="row" style="color:#166534"><span>🏷️ Promo${promoCodeLabel2 ? ' (' + promoCodeLabel2 + ')' : ''}</span><span>-₹${Number(promoDiscountPrint).toFixed(2)}</span></div>` : ''}
${surcharge ? `<div class="row"><span>${billData.table_surcharge_label || 'Surcharge'}</span><span>+₹${Number(surcharge).toFixed(2)}</span></div>` : ''}
${tax       ? `<div class="row"><span>Tax</span><span>+₹${Number(tax).toFixed(2)}</span></div>` : ''}
${sgstAmt > 0 ? `<div class="row"><span>SGST (${sgstRate}%)</span><span>+₹${sgstAmt.toFixed(2)}</span></div>` : ''}
${cgstAmt > 0 ? `<div class="row"><span>CGST (${cgstRate}%)</span><span>+₹${cgstAmt.toFixed(2)}</span></div>` : ''}
<div class="line"></div>
<div class="row total-row"><span>TOTAL PAYABLE</span><span>₹${Number(total).toFixed(2)}</span></div>
<div class="line"></div>

${qrUrl ? `<div class="center"><div class="muted" style="margin-bottom:4px">Scan to Pay</div><img src="${qrUrl}" class="qr" onerror="this.style.display='none'"/></div>` : ''}
${company.hsn ? `<div class="center muted" style="margin-top:4px">HSN: ${company.hsn}</div>` : ''}

<div class="line"></div>
<div class="center muted">Thank you for dining with us!</div>
<div class="center muted" style="margin-top:4px">Powered by Restaurant OS</div>
<br/>
<div class="center"><button onclick="window.print();setTimeout(()=>window.close(),500)" style="padding:8px 24px;background:#1a3a1c;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer">🖨️ Print</button></div>
</body></html>`);
      w.document.close();
      setTimeout(() => { try { w.print(); } catch {} }, 600);
    } catch (e) { console.error('Print error', e); }
  };

  // ── Shared WhatsApp Bill Sender ────────────────────────────
  const sendWhatsAppBill = async (billObj, customerPhone, customerName, promoInfo = {}, orderSnapshot = null) => {
    const waEnabled = companySettings?.is_whatsapp_enabled === true;
    if (!waEnabled || !customerPhone) return;

    const company   = selectedCompany || {};
    const order     = orderSnapshot || activeOrder || {};
    const items     = (order.items || []).filter(i => !i.is_cancelled);

    const line = '─────────────────────────';

    // Header
    let msg = '';
    msg += `*${company.name || 'Restaurant'}*\n`;
    if (company.address1)    msg += `${company.address1}\n`;
    if (company.admin_phone) msg += `Ph: ${company.admin_phone}\n`;
    if (company.gstin)       msg += `GSTIN: ${company.gstin}\n`;
    msg += `${line}\n`;

    // Bill info
    msg += `*Bill No:* ${billObj.bill_number || ''}\n`;
    msg += `*Order:*   #${String(order.order_number || '').padStart(6,'0')}\n`;
    if (billObj.table_name)  msg += `*Table:*   ${billObj.table_name}\n`;
    msg += `*Type:*    ${order.order_type || 'dine_in'}\n`;
    msg += `*Date:*    ${new Date().toLocaleString('en-IN')}\n`;
    msg += `*Payment:* ${billObj.payment_method || ''}\n`;
    msg += `${line}\n`;

    // Items
    msg += `*ITEMS*\n`;
    items.forEach(item => {
      const name      = item.item_name || item.name || item.food_name || 'Item';
      const itemTotal = (parseFloat(item.unit_price) * item.quantity).toFixed(2);
      msg += `• ${name}\n`;
      msg += `  ${item.quantity} x ₹${parseFloat(item.unit_price).toFixed(2)} = ₹${itemTotal}\n`;
    });
    msg += `${line}\n`;

    // Totals
    const subtotal  = parseFloat(billObj.subtotal        || 0);
    const disc      = parseFloat(billObj.discount_amount || 0);
    const promoAmt  = parseFloat(promoInfo.amount  ?? billObj.promo_amount  ?? 0);
    const promoCode = promoInfo.code   || billObj.promo_code || '';
    const surcharge = parseFloat(billObj.service_charge  || 0);
    const waSgstAmt = parseFloat(billObj.sgst_amount || 0);
    const waCgstAmt = parseFloat(billObj.cgst_amount || 0);
    // Calculate correct total — backend total_payable may not reflect promo deduction
    const total     = Math.max(0, subtotal - disc - promoAmt + surcharge + waSgstAmt + waCgstAmt);

    msg += `Subtotal          ₹${subtotal.toFixed(2)}\n`;
    if (disc > 0)      msg += `Discount          -₹${disc.toFixed(2)}\n`;
    if (promoAmt > 0)  msg += `🏷️ Promo${promoCode ? ` (${promoCode})` : ''}   -₹${promoAmt.toFixed(2)}\n`;
    if (surcharge > 0) msg += `Surcharge         +₹${surcharge.toFixed(2)}\n`;
    if (waSgstAmt > 0) msg += `SGST              +₹${waSgstAmt.toFixed(2)}\n`;
    if (waCgstAmt > 0) msg += `CGST              +₹${waCgstAmt.toFixed(2)}\n`;
    msg += `${line}\n`;
    msg += `*TOTAL PAYABLE    ₹${Math.round(total)}*\n`;
    msg += `${line}\n`;
    // UPI payment info if available
    const upiId   = companySettings?.upi_id   || paySettings?.upi_id;
    const upiName = companySettings?.upi_name  || paySettings?.upi_name;
    if (upiId) {
      msg += `💳 *Pay via UPI:* ${upiId}\n`;
      if (upiName) msg += `   UPI Name: ${upiName}\n`;
      msg += `${line}\n`;
    }
    msg += `_Thank you for dining with us!_\n`;
    msg += `_Powered by Restaurant OS_`;

    // Send via Twilio backend
    try {
      await smsSettingsAPI.sendWhatsApp({
        company_id: parseInt(cid),
        to_phone:   customerPhone,
        message:    msg,
      });
      showToast('📱 WhatsApp bill sent!');
    } catch (err) {
      console.error('WhatsApp send failed:', err.message);
      showToast('⚠️ WhatsApp not sent — check SMS Settings credentials', 'error');
    }
  };

  // ── Send WhatsApp Payment Request (Merchant UPI/Card) ────
  const sendWhatsAppPaymentRequest = async () => {
    const phone = billCustPhone || activeOrder?.customer_phone;
    if (!phone) { showToast('Enter customer WhatsApp number first', 'error'); return; }
    setWaSendLoading(true);
    try {
      const company  = selectedCompany || {};
      const items    = (activeOrder?.items || []).filter(i => !i.is_cancelled);
      const subtotal = items.reduce((s, i) => s + parseFloat(i.unit_price) * i.quantity, 0);
      const disc     = parseFloat(discount || 0);
      const promoAmt = promoResult?.valid ? parseFloat(promoResult.discount_amount || 0) : 0;
      const promoC   = promoResult?.code || '';
      const surge    = surcharge || 0;
      const wasgstRate = parseFloat(companySettings?.sgst || selectedCompany?.sgst || 0);
      const wacgstRate = parseFloat(companySettings?.cgst || selectedCompany?.cgst || 0);
      const taxBase    = Math.max(0, subtotal - disc - promoAmt);
      const wasgstAmt  = wasgstRate > 0 ? (taxBase * wasgstRate / 100) : 0;
      const wacgstAmt  = wacgstRate > 0 ? (taxBase * wacgstRate / 100) : 0;
      const totalAmt = Math.round(Math.max(0, taxBase + surge + wasgstAmt + wacgstAmt));
      const line     = '─────────────────────────';

      // Step 1 — Create Razorpay Payment Link from backend
      let shortUrl = null;
      let linkId   = null;
      try {
        const link = await paymentLinkAPI.create({
          company_id:     parseInt(cid),
          amount:         totalAmt,
          customer_name:  activeOrder?.customer_name || 'Customer',
          customer_phone: phone,
          order_number:   String(activeOrder?.order_number || ''),
          description:    `Bill for Order #${activeOrder?.order_number || ''} at ${company.name || 'Restaurant'}`,
        });
        shortUrl = link.short_url;
        linkId   = link.payment_link_id;
        setPayLinkId(linkId);
      } catch (e) {
        console.error('Payment link creation failed:', e.message);
        showToast('⚠️ Could not create payment link — check Razorpay credentials', 'error');
        setWaSendLoading(false);
        return;
      }

      // Step 2 — Build WhatsApp message with the link
      let msg = '';
      msg += `*${company.name || 'Restaurant'}*\n`;
      msg += `${line}\n`;
      msg += `Hi *${activeOrder?.customer_name || 'Customer'}*, your order is ready! 🍽️\n\n`;
      msg += `*Order:* #${String(activeOrder?.order_number || '').padStart(6,'0')}\n`;
      if (activeOrder?.table_name) msg += `*Table:* ${activeOrder.table_name}\n`;
      msg += `${line}\n`;
      items.forEach(item => {
        const name = item.item_name || item.name || 'Item';
        msg += `• ${name}  ${item.quantity} x ₹${parseFloat(item.unit_price).toFixed(2)} = ₹${(parseFloat(item.unit_price)*item.quantity).toFixed(2)}\n`;
      });
      msg += `${line}\n`;
      msg += `Subtotal          ₹${subtotal.toFixed(2)}\n`;
      if (disc > 0)      msg += `Discount          -₹${disc.toFixed(2)}\n`;
      if (promoAmt > 0)  msg += `🏷️ Promo${promoC ? ` (${promoC})` : ''}   -₹${promoAmt.toFixed(2)}\n`;
      if (surge > 0)     msg += `Surcharge         +₹${surge.toFixed(2)}\n`;
      if (wasgstAmt > 0) msg += `SGST (${wasgstRate}%)      +₹${wasgstAmt.toFixed(2)}\n`;
      if (wacgstAmt > 0) msg += `CGST (${wacgstRate}%)      +₹${wacgstAmt.toFixed(2)}\n`;
      msg += `${line}\n`;
      msg += `*AMOUNT TO PAY    ₹${totalAmt}*\n`;
      msg += `${line}\n`;
      msg += `💳 *Click to Pay (Razorpay):*\n${shortUrl}\n`;
      msg += `${line}\n`;
      msg += `_Supports UPI, Card, NetBanking & Wallets_\n`;
      msg += `_Powered by Restaurant OS_`;

      // Step 3 — Send on WhatsApp
      await smsSettingsAPI.sendWhatsApp({
        company_id: parseInt(cid),
        to_phone:   phone,
        message:    msg,
      });
      showToast('📲 Payment link sent on WhatsApp! Waiting for customer payment…');

      // Step 4 — Poll for payment status every 5 seconds
      setPayLinkPolling(true);
      let attempts = 0;
      const maxAttempts = 60; // 5 min timeout
      const poll = setInterval(async () => {
        attempts++;
        try {
          const s = await paymentLinkAPI.status(linkId, parseInt(cid));
          if (s.status === 'paid') {
            clearInterval(poll);
            setPayLinkPolling(false);
            setPayLinkId(null);

            // Save successful transaction to DB
            const payment = s.payments?.[0] || {};
            try {
              await paymentTransactionAPI.create({
                company_unique_id:   parseInt(cid),
                order_id:            activeOrder?.order_id,
                order_number:        String(activeOrder?.order_number || ''),
                razorpay_payment_id: payment.payment_id || linkId,
                razorpay_order_id:   linkId,
                amount:              totalAmt,
                currency:            'INR',
                method:              payment.method || 'payment_link',
                status:              'success',
                timestamp:           new Date().toISOString(),
              });
            } catch(e) { console.error('Failed to save transaction:', e); }

            showToast('✅ Payment received! Generating bill…');
            // Auto-fire Generate Bill
            await generateBill();

          } else if (s.status === 'cancelled' || s.status === 'expired') {
            clearInterval(poll);
            setPayLinkPolling(false);
            setPayLinkId(null);

            // Save failed/cancelled transaction
            try {
              await paymentTransactionAPI.create({
                company_unique_id:   parseInt(cid),
                order_id:            activeOrder?.order_id,
                order_number:        String(activeOrder?.order_number || ''),
                razorpay_order_id:   linkId,
                amount:              totalAmt,
                currency:            'INR',
                method:              'payment_link',
                status:              s.status, // 'cancelled' or 'expired'
                error_description:   `Payment link ${s.status}`,
                timestamp:           new Date().toISOString(),
              });
            } catch(e) { console.error('Failed to save transaction:', e); }

            showToast(`⚠️ Payment ${s.status} — generate bill manually if needed`, 'error');

          } else if (attempts >= maxAttempts) {
            clearInterval(poll);
            setPayLinkPolling(false);

            // Save timeout transaction
            try {
              await paymentTransactionAPI.create({
                company_unique_id:   parseInt(cid),
                order_id:            activeOrder?.order_id,
                order_number:        String(activeOrder?.order_number || ''),
                razorpay_order_id:   linkId,
                amount:              totalAmt,
                currency:            'INR',
                method:              'payment_link',
                status:              'timeout',
                error_description:   'Payment link polling timeout after 5 minutes',
                timestamp:           new Date().toISOString(),
              });
            } catch(e) { console.error('Failed to save transaction:', e); }

            showToast('⏱️ Payment link expired — please generate bill manually', 'error');
          }
        } catch { /* keep polling */ }
      }, 5000);

    } catch (err) {
      console.error('WA payment request failed:', err.message);
      showToast('⚠️ Failed to send payment request', 'error');
    }
    setWaSendLoading(false);
  };

  // ── Generate Bill ─────────────────────────────────────────
  const generateBill = async () => {
    if (!activeOrder) return;

    // ── If offline — show offline bill modal instead ──
    if (!isOnline) {
      setModal(null);
      setOfflineAmountPaid(subtotal.toFixed(2));
      setOfflinePayMethod(payMethod === 'cash' ? 'cash' : 'upi');
      setShowOfflineBillModal(true);
      return;
    }

    setSaving(true);
    try {
      const paid = parseFloat(amountPaid) || totalRounded;
      const manualDiscountAmt = parseFloat(discount) || 0;
      const b = await posBillAPI.generate({
        order_id:          activeOrder.order_id,
        company_unique_id: cid,
        payment_method:    payMethod === 'merchant' ? (merchantSub === 'merchant_upi' ? 'upi' : 'card') : payMethod,
        payment_reference: payRef || undefined,
        amount_paid:       paid,
        discount_amount:   manualDiscountAmt,   // manual discount only → discount_amount column
        service_charge:    surcharge,
        promo_code:        promoResult?.code || null,
        promo_amount:      promoDiscount || 0,
        sgst_amount:       Math.round(sgstAmt * 100) / 100 || 0,
        cgst_amount:       Math.round(cgstAmt * 100) / 100 || 0,
        customer_id:       billCustomerId || null,
        created_by:        user?.user_id || null,
      });
      setBill(b);
      await refresh();
      setModal(null);
      showToast(`🧾 Bill ${b.bill_number} generated! Table freed.`);
      // Auto-print receipt
      if (selectedCompany) {
        await printBillReceipt(b, activeOrder, selectedCompany, promoDiscount, promoResult?.code, parseFloat(discount) || 0);
      }
      // Send WhatsApp bill via shared helper — snapshot order BEFORE refresh
      const phone         = billCustPhone || activeOrder?.customer_phone;
      const orderSnapshot = { ...activeOrder, items: [...(activeOrder?.items || [])] };
      // Inject sgst/cgst into bill object in case API doesn't return them
      const billWithGst = { ...b, sgst_amount: b.sgst_amount ?? sgstAmt, cgst_amount: b.cgst_amount ?? cgstAmt };
      await sendWhatsAppBill(billWithGst, phone, activeOrder.customer_name, {
        amount: promoDiscount,
        code:   promoResult?.code || '',
      }, orderSnapshot);
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  // ── Hold / Cancel ─────────────────────────────────────────
  const holdOrder = async (hold) => {
    try {
      await posOrderAPI.hold(activeOrder.order_id, hold);
      await loadOrderDetail(activeOrder.order_id);
      showToast(hold ? 'Order held' : 'Order resumed');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const cancelOrder = async () => {
    if (!window.confirm('Cancel this order?')) return;
    try {
      await posOrderAPI.cancel(activeOrder.order_id);
      setActiveOrder(null); setKots([]); setBill(null);
      await refresh();
      showToast('Order cancelled');
    } catch (e) { showToast(e.message, 'error'); }
  };

  // ── Post-bill status ──────────────────────────────────────
  const markPickedUp = async (status) => {
    try {
      await posOrderAPI.updateStatus(activeOrder.order_id, { order_status: status });
      await loadOrderDetail(activeOrder.order_id);
      await loadOrders();
      showToast(status === 'picked_up' ? '✅ Picked up!' : '🛵 Picked up by delivery agent!');
    } catch (e) { showToast(e.message, 'error'); }
  };

  // ── Computed ──────────────────────────────────────────────
  const activeItems  = isOfflineOrder
    ? (activeOrder?.items || [])
    : (activeOrder?.items || []).filter(i => !i.is_cancelled);
  const subtotal     = activeItems.reduce((s, i) => s + parseFloat(i.unit_price || i.sale_price || 0) * i.quantity, 0);
  // Surcharge: from order snapshot, or from the selected table
  const surcharge = parseFloat(
    activeOrder?.table_surcharge_amount ||
    tables.find(t => t.table_id === activeOrder?.table_id)?.surcharge_amount || 0
  );
  const discountAmt  = parseFloat(discount || 0);
  const promoDiscount = promoResult?.valid ? parseFloat(promoResult.discount_amount || 0) : 0;

  // SGST / CGST from company settings
  const sgstRate = parseFloat(companySettings?.sgst || selectedCompany?.sgst || 0);
  const cgstRate = parseFloat(companySettings?.cgst || selectedCompany?.cgst || 0);
  const taxableBase = Math.max(0, subtotal - discountAmt - promoDiscount);
  const sgstAmt = sgstRate > 0 ? Math.round(taxableBase * sgstRate) / 100 : 0;
  const cgstAmt = cgstRate > 0 ? Math.round(taxableBase * cgstRate) / 100 : 0;

  const total        = Math.max(0, taxableBase + surcharge + sgstAmt + cgstAmt);
  const roundOff     = roundHalfUp(total) - total; // e.g. -0.49 or +0.51
  const totalRounded = roundHalfUp(total);

  // Keep amountPaid in sync with total when bill modal open (e.g. promo applied)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (modal === 'bill') setAmountPaid(totalRounded.toFixed(2));
  }, [totalRounded, modal]);
  const isLocked     = ['billed','cancelled','picked_up','picked_up_by_delivery_agent'].includes(activeOrder?.order_status);
  const isCooking    = activeOrder?.order_status === 'kot_inprocess';
  const canSendKOT   = activeOrder && !isLocked && activeItems.length > 0;

  const filteredMenu = menuItems.filter(item => {
    const matchCat  = category === 'All' || item.category_id === category;
    const matchSrch = item.name?.toLowerCase().includes(search.toLowerCase());
    const matchVeg  = vegFilter === null || (vegFilter ? item.is_veg !== false : item.is_veg === false);
    return matchCat && matchSrch && matchVeg;
  });

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3><p>Select a company first to use the POS.</p></div></div>
  );

  const sm = activeOrder ? STATUS_META[activeOrder.order_status] || STATUS_META.draft : null;

  return (
    <div style={S.root}>

      {/* ── Sync Status Banners — fixed below the offline red bar ── */}
      {!isOnline && pendingCount > 0 && (
        <div style={{
          position:'fixed', bottom:0, left:240, right:0, zIndex:150,
          background: pendingCount > 50 ? '#7f1d1d' : '#78350f',
          color: pendingCount > 50 ? '#fecaca' : '#fef3c7',
          padding:'4px 16px', fontSize:11, fontWeight:600,
          display:'flex', alignItems:'center', justifyContent:'center', gap:6,
          borderTop:'1px solid rgba(255,255,255,0.1)',
        }}>
          {pendingCount > 50 ? '⚠️' : '📴'}
          <span>{pendingCount} order{pendingCount !== 1 ? 's' : ''} pending sync</span>
          {pendingCount > 50 && <span style={{ opacity:0.8 }}>— Restore internet soon!</span>}
        </div>
      )}
      {isOnline && syncStatus.syncing && (
        <div style={{
          position:'fixed', bottom:0, left:240, right:0, zIndex:150,
          background:'#1e3a5f', color:'#bfdbfe',
          padding:'4px 16px', fontSize:11, fontWeight:600,
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          borderTop:'1px solid rgba(255,255,255,0.1)',
        }}>
          <span>🔄 Syncing offline data...</span>
          <div style={{ width:80, height:4, background:'rgba(255,255,255,0.2)', borderRadius:3, overflow:'hidden' }}>
            <div style={{ height:'100%', background:'#60a5fa', borderRadius:3, transition:'width 0.5s',
              width: syncStatus.total > 0 ? `${Math.round(((syncStatus.total-syncStatus.remaining)/syncStatus.total)*100)}%` : '0%'
            }}/>
          </div>
          <span>{syncStatus.total > 0 ? Math.round(((syncStatus.total-syncStatus.remaining)/syncStatus.total)*100) : 0}%</span>
          <span style={{ background:'rgba(255,255,255,0.15)', borderRadius:12, padding:'1px 7px' }}>{syncStatus.remaining} left</span>
        </div>
      )}
      {isOnline && showSyncedMsg && (
        <div style={{
          position:'fixed', bottom:0, left:240, right:0, zIndex:150,
          background:'#14532d', color:'#bbf7d0',
          padding:'4px 16px', fontSize:11, fontWeight:600,
          display:'flex', alignItems:'center', justifyContent:'center', gap:6,
          borderTop:'1px solid rgba(255,255,255,0.1)',
        }}>
          ✅ All offline data synced successfully!
        </div>
      )}

      {/* ── LEFT: Running Orders ── */}
      <div style={S.left}>
        <div style={S.leftHead}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--text-3)', textTransform: 'uppercase' }}>Running Orders</span>
          <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{orders.length}</span>
        </div>

        <button style={S.newBtn} onClick={() => setModal('neworder')}>+ New Order</button>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {orders.length === 0 && <div style={{ padding: '20px 12px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>No running orders</div>}
          {orders.map(o => {
            const meta = STATUS_META[o.order_status] || STATUS_META.draft;
            const isAct = activeOrder?.order_id === o.order_id;
            return (
              <div key={o.order_id} style={{ ...S.orderCard, ...(isAct ? S.orderCardActive : {}) }} onClick={() => selectOrder(o)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{o.order_number}</span>
                  {o.table_name && <span style={S.tag}>{o.table_name}</span>}
                  {o.order_type !== 'dine_in' && <span style={{ ...S.tag, background: '#fef3c7', color: '#92400e' }}>{o.order_type === 'take_away' ? '🥡' : '🛵'}</span>}
                  {o.is_hold && <span style={{ ...S.tag, background: '#fee2e2', color: '#991b1b' }}>Hold</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{o.order_placed_at ? new Date(o.order_placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ ...S.pill, background: meta.bg, color: meta.color }}>{meta.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>₹{parseFloat(o.total_payable || 0).toFixed(0)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick actions */}
        {/* Kitchen shortcut */}
        <button style={{ margin: '4px 8px', padding: '7px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onClick={() => onNavigate && onNavigate('/kitchen')}>
          🍳 Kitchen Display
        </button>
        {activeOrder && (
          <div style={{ borderTop: '1px solid var(--border-light)', padding: '8px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Quick Actions</div>
            <button style={S.qaBtn} onClick={sendKOT} disabled={!canSendKOT || saving}>🖨️ Send KOT</button>
            <button style={S.qaBtn} onClick={() => holdOrder(!activeOrder.is_hold)} disabled={isLocked}>
              {activeOrder.is_hold ? '▶ Resume' : '⏸ Hold'}
            </button>
            <button style={{ ...S.qaBtn, color: 'var(--error)' }} onClick={cancelOrder} disabled={isLocked}>✕ Cancel Order</button>
          </div>
        )}
      </div>

      {/* ── CENTER: Order Detail ── */}
      <div style={S.center}>
        {!activeOrder ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Select an order or create a new one</div>
          </div>
        ) : (
          <>
            {/* Order type tabs */}
            <div style={S.typeTabs}>
              {['dine_in','take_away','delivery'].map(t => (
                <div key={t} style={{ ...S.typeTab, ...(activeOrder.order_type === t ? S.typeTabActive : {}) }}>
                  {t === 'dine_in' ? '🪑 Dine In' : t === 'take_away' ? '🥡 Take Away' : '🛵 Delivery'}
                </div>
              ))}
            </div>

            {/* Order header — Order number | Customer dropdown | Draft badge */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 0, gap: 8 }}>
              {/* Left: order number + hold */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>Order {activeOrder.order_number}</div>
                {activeOrder.is_hold && <span style={{ ...S.pill, background: '#fee2e2', color: '#991b1b' }}>⏸ Hold</span>}
              </div>

              {/* Center: CustomerPanel inline */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <CustomerPanel
                  cid={cid}
                  order={activeOrder}
                  companySettings={companySettings}
                  onPhoneChange={setBillCustPhone}
                  onCustomerFound={setBillCustomerId}
                  onCustomerChange={setHeaderCustomer}
                />
              </div>

              {/* Right: Draft/status badge */}
              <span style={{ ...S.pill, background: sm.bg, color: sm.color, fontSize: 12, fontWeight: 700, padding: '4px 12px', flexShrink: 0 }}>● {sm.label}</span>
            </div>

            {/* Info bar — items count + conditional surcharge on same line */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 12px', marginTop: 6, marginBottom: 8, borderRadius: 8,
              background: surcharge > 0 ? '#fff7ed' : 'var(--bg-2)',
              border: `1px solid ${surcharge > 0 ? '#fed7aa' : 'var(--border)'}`,
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>
                {activeItems.length} item{activeItems.length !== 1 ? 's' : ''}
              </span>
              {activeOrder.table_name && (
                <>
                  <span style={{ fontSize: 12, color: 'var(--border)' }}>|</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>🪑 {activeOrder.table_name}</span>
                </>
              )}
              {surcharge > 0 && (
                <>
                  <span style={{ fontSize: 12, color: '#fed7aa' }}>|</span>
                  <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>
                    ⚡ {activeOrder.table_surcharge_label || 'Table Surcharge'}: +₹{surcharge.toFixed(2)} applied
                  </span>
                </>
              )}
            </div>

            {/* Lock banner */}
            {(isLocked || isCooking) && (
              <div style={{ background: isCooking ? '#fef3c7' : '#ede9fe', color: isCooking ? '#92400e' : '#4c1d95', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
                {isCooking ? '🔒 Kitchen is cooking — item edits locked' : '🧾 Order billed — no changes allowed'}
              </div>
            )}

            {/* Items list */}
            <div style={{ ...S.itemsTable, flex: 1 }}>
              <div style={S.itemsHeader}>
                <span style={{ flex: 1 }}>ITEM</span>
                <span style={{ width: 70, textAlign: 'right' }}>RATE</span>
                <span style={{ width: 90, textAlign: 'center' }}>QTY</span>
                <span style={{ width: 70, textAlign: 'right' }}>TOTAL</span>
                {!isLocked && <span style={{ width: 28 }}></span>}
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeItems.length === 0 && (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Add items from the menu →</div>
                )}
                {activeItems.map(item => {
                  const kotColor = item.kot_item_status === 'kot_inprocess' ? '#dbeafe'
                    : item.kot_item_status === 'ready' ? '#d1fae5'
                    : item.kot_item_status === 'kot_open' ? '#fef9c3'
                    : 'transparent';
                  return (
                    <div key={item.order_item_id} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid var(--border-light)', background: kotColor, gap: 6 }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: item.is_veg !== false ? 'var(--primary)' : '#dc2626', fontSize: 9 }}>●</span>
                        <span style={{ fontSize: 13 }}>{item.item_name}</span>
                        {item.notes && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>({item.notes})</span>}
                        {item.kot_item_status && item.kot_item_status !== 'draft' && (
                          <span style={{ fontSize: 10, background: 'rgba(0,0,0,.07)', padding: '1px 5px', borderRadius: 8, color: 'var(--text-3)' }}>{item.kot_item_status}</span>
                        )}
                      </div>
                      <span style={{ width: 70, textAlign: 'right', color: 'var(--text-3)', fontSize: 12 }}>₹{parseFloat(item.unit_price).toFixed(0)}</span>
                      <div style={{ width: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        {!isLocked && <button style={S.qtyBtn} onClick={() => changeQty(item, -1)}>−</button>}
                        <span style={{ fontWeight: 700, minWidth: 18, textAlign: 'center', fontSize: 13 }}>{item.quantity}</span>
                        {!isLocked && <button style={S.qtyBtn} onClick={() => changeQty(item, 1)}>+</button>}
                      </div>
                      <span style={{ width: 70, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>₹{(parseFloat(item.unit_price) * item.quantity).toFixed(0)}</span>
                      {!isLocked && (
                        <button style={{ width: 28, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 13 }}
                          onClick={() => changeQty(item, -item.quantity)}>✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* KOT status section */}
            {kots.length > 0 && (
              <div style={{ background: 'var(--green-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>KOTs</div>
                {kots.map(kot => (
                  <div key={kot.kot_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{kot.kot_number}</span>
                    <span style={{ ...S.pill, ...(() => { const m = {kot_open:{bg:'#fef3c7',color:'#92400e'},kot_inprocess:{bg:'#dbeafe',color:'#1e40af'},ready:{bg:'#d1fae5',color:'#065f46'}}; return m[kot.kot_status]||{}; })() }}>{kot.kot_status}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Prints: {kot.print_count}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                      {kot.kot_status === 'kot_open' && <button style={S.smallBtn} onClick={() => updateKotStatus(kot.kot_id, 'kot_inprocess')}>Start</button>}
                      {kot.kot_status === 'kot_inprocess' && <button style={{ ...S.smallBtn, background: 'var(--primary)', color: '#fff' }} onClick={() => updateKotStatus(kot.kot_id, 'ready')}>Ready ✓</button>}
                      <button style={S.smallBtn} onClick={async () => {
                          try {
                            // PATCH /pos/kot/{id}/print returns full KOT with table_name
                            const printResponse = await posKotAPI.print(kot.kot_id);
                            await loadOrderDetail(activeOrder.order_id);
                            // printResponse has table_name: "T-15" directly from API
                            const tableName = printResponse?.table_name || kot.table_name ||
                              activeOrder?.table_name ||
                              tables.find(t => t.table_id === activeOrder?.table_id)?.table_name || '';
                            printKotTicket({ ...kot, ...printResponse, table_name: tableName }, activeOrder, selectedCompany);
                            showToast('KOT reprinted');
                          } catch(e) { showToast(e.message, 'error'); }
                        }}>🖨️ Reprint</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Totals */}
            <div style={S.totals}>
              <div style={S.totalRow}><span style={{ color: 'var(--text-3)' }}>Subtotal ({activeItems.reduce((s,i)=>s+i.quantity,0)} items)</span><span>₹{subtotal.toFixed(2)}</span></div>
              {surcharge > 0 && <div style={S.totalRow}><span style={{ color: '#92400e' }}>{activeOrder.table_surcharge_label || 'Table Surcharge'}</span><span style={{ color: '#92400e' }}>+₹{surcharge.toFixed(2)}</span></div>}
              <div style={S.totalRow}>
                <span style={{ color: 'var(--text-3)' }}>Discount (₹)</span>
                {!isLocked
                  ? <input type="number" value={discount} min={0} onChange={e => setDiscount(e.target.value)} style={{ width: 70, textAlign: 'right', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 13 }} />
                  : <span>−₹{discountAmt.toFixed(2)}</span>}
              </div>
              {promoDiscount > 0 && (
                <div style={{ ...S.totalRow, color: '#166534' }}>
                  <span>🏷️ Promo {promoResult?.code ? `(${promoResult.code})` : 'Discount'}</span>
                  <span>−₹{promoDiscount.toFixed(2)}</span>
                </div>
              )}
              {sgstAmt > 0 && (
                <div style={{ ...S.totalRow, color: '#1e40af' }}>
                  <span>SGST ({sgstRate}%)</span>
                  <span>+₹{sgstAmt.toFixed(2)}</span>
                </div>
              )}
              {cgstAmt > 0 && (
                <div style={{ ...S.totalRow, color: '#1e40af' }}>
                  <span>CGST ({cgstRate}%)</span>
                  <span>+₹{cgstAmt.toFixed(2)}</span>
                </div>
              )}
              <div style={{ ...S.totalRow, borderTop: '2px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                <span style={{ fontWeight: 800, fontSize: 15 }}>Total Payable</span>
                <span style={{ fontWeight: 800, fontSize: 19, color: 'var(--primary)' }}>₹{totalRounded.toFixed(2)}</span>
              </div>
            </div>

            {/* Offline order badge */}
            {isOfflineOrder && (
              <div style={{ background:'#fff3cd', border:'1px solid #ffc107', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#856404', fontWeight:600, marginTop:4 }}>
                📴 Offline Order — will sync to server when internet is restored
              </div>
            )}

            {/* Action buttons */}
            {!isLocked && !isOfflineOrder && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button style={S.cancelBtn} onClick={cancelOrder}>✕ Cancel</button>
                <button style={S.holdBtn} onClick={() => holdOrder(!activeOrder.is_hold)}>
                  {activeOrder.is_hold ? '▶ Resume' : '⏸ Hold'}
                </button>
              </div>
            )}
            {isOfflineOrder && activeItems.length > 0 && (
              <button style={{ ...S.billBtn, background: 'linear-gradient(135deg,#856404,#b45309)' }} onClick={() => { setOfflineAmountPaid(totalRounded.toFixed(2)); setShowOfflineBillModal(true); }}>
                🧾 Generate Offline Bill · ₹{totalRounded.toFixed(2)}
              </button>
            )}
            {!isLocked && !isOfflineOrder && (
              <button style={S.billBtn} onClick={() => {
                if (!isOnline) {
                  setOfflineAmountPaid(totalRounded.toFixed(2));
                  setOfflinePayMethod('cash');
                  setShowOfflineBillModal(true);
                } else {
                  setAmountPaid(totalRounded.toFixed(2));
                  setModal('bill');
                }
              }} disabled={activeItems.length === 0}>
                🧾 Generate Bill · ₹{totalRounded.toFixed(2)}
              </button>
            )}
            {!isLocked && !isCooking && (
              <button style={S.kotBtn} onClick={sendKOT} disabled={saving || activeItems.length === 0}>
                🍳 Send to Kitchen (KOT)
              </button>
            )}

            {/* Post-bill actions */}
            {activeOrder.order_status === 'billed' && activeOrder.order_type === 'take_away' && (
              <button style={{ ...S.billBtn, background: 'var(--primary)', marginTop: 8 }} onClick={() => markPickedUp('picked_up')}>✅ Mark as Picked Up</button>
            )}
            {activeOrder.order_status === 'billed' && activeOrder.order_type === 'delivery' && (
              <button style={{ ...S.billBtn, background: 'var(--primary)', marginTop: 8 }} onClick={() => markPickedUp('picked_up_by_delivery_agent')}>🛵 Picked Up by Delivery Agent</button>
            )}

            {/* Bill details if billed */}
            {bill && (
              <div style={{ background: bill.is_offline ? '#fff9e6' : '#f0fdf4', border: `1px solid ${bill.is_offline ? '#ffc107' : '#a7f3d0'}`, borderRadius: 10, padding: '10px 14px', marginTop: 8 }}>
                {bill.is_offline && (
                  <div style={{ fontSize: 11, color: '#856404', fontWeight: 600, marginBottom: 6 }}>
                    📴 Offline Bill — will sync to server when internet restored
                  </div>
                )}
                <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>🧾 {bill.bill_number}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 16 }}>
                  <span>Payment: <strong>{bill.payment_method?.toUpperCase()}</strong></span>
                  <span>Paid: <strong>₹{parseFloat(bill.amount_paid || 0).toFixed(2)}</strong></span>
                  {!bill.is_offline && <span>Prints: {bill.print_count}</span>}
                </div>
                <button style={{ ...S.smallBtn, marginTop: 6 }} onClick={async () => {
                  if (bill.is_offline) {
                    // Reprint offline bill
                    const offlineOrder = bill._offlineOrder || bill._billData;
                    if (offlineOrder) printOfflineBill(offlineOrder, selectedCompany || {});
                    else showToast('Cannot reprint — bill data not found', 'error');
                    return;
                  }
                  try {
                    const freshBill = await posBillAPI.print(bill.bill_id);
                    await loadOrderDetail(activeOrder.order_id);
                    const billForPrint = freshBill || bill;
                    const promoAmt  = Number(billForPrint.promo_amount  || bill.promo_amount  || 0);
                    const promoCode = billForPrint.promo_code || bill.promo_code || '';
                    const manualDisc = Number(billForPrint.discount_amount || bill.discount_amount || 0);
                    if (selectedCompany) printBillReceipt(billForPrint, activeOrder, selectedCompany, promoAmt, promoCode, manualDisc);
                    showToast('Bill reprinted');
                  } catch(e) { showToast(e.message, 'error'); }
                }}>🖨️ Reprint Bill</button>
                <button style={{ ...S.smallBtn, marginTop: 4, background: '#1a3a1c', color: '#a3e6a3' }} onClick={async () => {
                  if (bill.is_offline) {
                    const offlineOrder = bill._offlineOrder || bill._billData;
                    if (offlineOrder) printOfflineBill(offlineOrder, selectedCompany || {});
                    else showToast('Cannot print — bill data not found', 'error');
                    return;
                  }
                  if (!selectedCompany) return;
                  try {
                    const freshBill = await posBillAPI.getById(bill.bill_id);
                    const billForPrint = freshBill || bill;
                    const promoAmt   = Number(billForPrint.promo_amount  || bill.promo_amount  || 0);
                    const promoCode  = billForPrint.promo_code || bill.promo_code || '';
                    const manualDisc = Number(billForPrint.discount_amount || bill.discount_amount || 0);
                    printBillReceipt(billForPrint, activeOrder, selectedCompany, promoAmt, promoCode, manualDisc);
                  } catch {
                    printBillReceipt(bill, activeOrder, selectedCompany);
                  }
                }}>🖨️ Print Receipt</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── RIGHT: Menu ── */}
      <div style={S.right}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-3)' }}>🔍</span>
          <input style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, background: 'transparent' }} placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
          <button style={{ ...S.vegBtn, background: vegFilter === true ? 'var(--primary)' : 'var(--bg)', color: vegFilter === true ? '#fff' : 'var(--text-2)' }} onClick={() => setVegFilter(v => v === true ? null : true)}>🟢 Veg</button>
          <button style={{ ...S.vegBtn, background: vegFilter === false ? '#dc2626' : 'var(--bg)', color: vegFilter === false ? '#fff' : 'var(--text-2)' }} onClick={() => setVegFilter(v => v === false ? null : false)}>🔴 Non-Veg</button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', overflowX: 'auto', borderBottom: '1px solid var(--border)' }}>
          {categories.map(c => (
            <button key={c.id} style={{ ...S.catBtn, ...(category === c.id ? S.catActive : {}) }} onClick={() => setCategory(c.id)}>{c.name}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 10, padding: 14, gridAutoRows: 'min-content' }}>
          {filteredMenu.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>No items found</div>}
          {filteredMenu.map(item => {
            const inOrder = activeItems.find(i => i.food_menu_id === item.food_menu_id);
            return (
              <div key={item.food_menu_id} style={{ ...S.menuCard, ...(inOrder ? { border: '2px solid var(--primary)', background: 'var(--primary-light)' } : {}) }} onClick={() => addItem(item)}>
                {inOrder && <div style={{ position: 'absolute', top: 6, left: 6, background: 'var(--primary)', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×{inOrder.quantity}</div>}
                <div style={{ position:'relative', marginBottom:4 }}>
                  {item.image_url
                    ? <img src={item.image_url} alt="" style={{ width:'100%', height:80, objectFit:'cover', borderRadius:6, display:'block' }} onError={e => e.target.style.display='none'} />
                    : <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f5f5', borderRadius:6, fontSize:28 }}>🍱</div>
                  }
                  <div style={{ position:'absolute', top:6, right:6, width:10, height:10, borderRadius:'50%', background:item.is_veg !== false ? 'var(--primary)' : '#dc2626', border:'2px solid #fff' }} />
                </div>
                <div style={{ fontSize:12, fontWeight:500, lineHeight:1.3, marginBottom:4 }}>{item.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>₹{parseFloat(item.sale_price || 0).toFixed(0)}</span>
                  <button style={S.addBtn} onClick={e => { e.stopPropagation(); addItem(item); }}>+ Add</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── TABLE SELECTION MODAL ── */}
      {modal === 'table' && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={{ ...S.modalBox, maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}><span style={{ fontWeight: 700, fontSize: 17 }}>🪑 Select Table</span><button style={S.closeBtn} onClick={() => setModal(null)}>✕</button></div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, marginBottom: 14 }}>
              {[['#d1fae5','Free'],['#fef3c7','Occupied'],['#ede9fe','Reserved']].map(([bg,label]) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: bg, display: 'inline-block' }}/>{label}</span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 12 }}>
              {tables.map(t => {
                const tm = TABLE_META[t.table_status] || TABLE_META.free;
                const canSelect = t.table_status === 'free' || (t.table_status === 'occupied' && t.remaining_seats > 0);
                return (
                  <div key={t.table_id} style={{ ...S.tableCard, background: tm.bg, borderColor: tm.border, opacity: t.table_status === 'reserved' ? .6 : 1, cursor: canSelect ? 'pointer' : 'not-allowed' }}
                    onClick={() => { if (!canSelect) return; setSelectedTable(t); setModal('neworder'); }}>
                    <div style={{ fontSize: 28 }}>🪑</div>
                    <div style={{ fontWeight: 700, color: tm.text }}>{t.table_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.seats} seats</div>
                    {t.surcharge_amount > 0 && <div style={{ fontSize: 10, color: '#92400e', fontWeight: 600 }}>+₹{t.surcharge_amount} {t.surcharge_label || ''}</div>}
                    <div style={{ fontSize: 10, fontWeight: 600, color: tm.text, background: 'rgba(255,255,255,.6)', padding: '2px 7px', borderRadius: 8, marginTop: 4 }}>
                      {t.table_status === 'occupied' && t.occupied_seats ? `${t.occupied_seats}/${t.seats} seats` : t.table_status}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={S.cancelBtn} onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW ORDER MODAL ── */}
      {modal === 'neworder' && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={{ ...S.modalBox, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}><span style={{ fontWeight: 700, fontSize: 17 }}>🍽️ New Order</span><button style={S.closeBtn} onClick={() => setModal(null)}>✕</button></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Order type */}
              <div>
                <label style={S.label}>Order Type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['dine_in','🪑 Dine In'],['take_away','🥡 Take Away'],['delivery','🛵 Delivery']].map(([t,l]) => (
                    <button key={t} style={{ flex: 1, padding: '8px 4px', border: `1.5px solid ${orderType===t?'var(--primary)':'var(--border)'}`, borderRadius: 8, background: orderType===t?'var(--primary-light)':'var(--white)', color: orderType===t?'var(--primary)':'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => { setOrderType(t); if (t!=='dine_in') setSelectedTable(null); }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* Table selection for dine_in */}
              {orderType === 'dine_in' && (
                <div>
                  <label style={S.label}>Table</label>
                  <button style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}
                    onClick={() => setModal('table')}>
                    {selectedTable ? <span>🪑 {selectedTable.table_name} ({selectedTable.seats} seats){selectedTable.surcharge_amount > 0 ? ` · +₹${selectedTable.surcharge_amount} ${selectedTable.surcharge_label||''}` : ''}</span>
                      : <span style={{ color: 'var(--text-3)' }}>Select table…</span>}
                    <span>›</span>
                  </button>
                </div>
              )}

              {/* Covers */}
              <div>
                <label style={S.label}>No. of Covers (Guests)</label>
                <input type="number" min={1} value={covers} onChange={e => setCovers(e.target.value)} style={S.input} />
              </div>

              {/* Customer details for take_away / delivery */}
              {orderType !== 'dine_in' && (
                <>
                  <div><label style={S.label}>Customer Name</label><input value={custName} onChange={e => setCustName(e.target.value)} style={S.input} placeholder="Customer name" /></div>
                  <div><label style={S.label}>Phone</label><input value={custPhone} onChange={e => setCustPhone(e.target.value)} style={S.input} placeholder="Phone number" /></div>
                </>
              )}
              {orderType === 'delivery' && (
                <div><label style={S.label}>Delivery Address</label><textarea value={deliveryAddr} onChange={e => setDeliveryAddr(e.target.value)} rows={2} style={{ ...S.input, resize: 'vertical' }} placeholder="Full delivery address" /></div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button style={S.cancelBtn} onClick={() => setModal(null)}>Cancel</button>
                <button style={S.primaryBtn} onClick={createOrder} disabled={saving || (orderType==='dine_in' && !selectedTable)}>
                  {saving ? 'Creating…' : 'Create Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BILL MODAL ── */}
      {modal === 'bill' && activeOrder && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={{ ...S.modalBox, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}><span style={{ fontWeight: 700, fontSize: 17 }}>🧾 Generate Bill</span><button style={S.closeBtn} onClick={() => setModal(null)}>✕</button></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Bill summary */}
              <div style={{ background: 'var(--green-50)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:5, color:'var(--text-2)' }}>
                  <span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span>
                </div>
                {discountAmt > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:5, color:'var(--text-2)' }}>
                    <span>Discount</span><span>−₹{discountAmt.toFixed(2)}</span>
                  </div>
                )}
                {surcharge > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#92400e', padding:'2px 0', marginBottom:5 }}>
                    <span>⚡ {activeOrder.table_surcharge_label || 'Table Surcharge'}</span>
                    <span>+₹{surcharge.toFixed(2)}</span>
                  </div>
                )}
                {promoResult?.valid && (
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#166534', padding:'2px 0' }}>
                    <span>🏷️ Promo ({promoResult.code})</span>
                    <span>−₹{promoDiscount.toFixed(2)}</span>
                  </div>
                )}
                {sgstAmt > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#1e40af', padding:'2px 0' }}>
                    <span>SGST ({sgstRate}%)</span>
                    <span>+₹{sgstAmt.toFixed(2)}</span>
                  </div>
                )}
                {cgstAmt > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#1e40af', padding:'2px 0' }}>
                    <span>CGST ({cgstRate}%)</span>
                    <span>+₹{cgstAmt.toFixed(2)}</span>
                  </div>
                )}
                {Math.abs(roundOff) >= 0.01 && (
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#6b7280', padding:'2px 0' }}>
                    <span>Round Off</span>
                    <span>{roundOff > 0 ? '+' : ''}₹{roundOff.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 17, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                  <span>Total</span><span style={{ color: 'var(--primary)' }}>₹{totalRounded.toFixed(2)}</span>
                </div>

              {/* Promo Code field */}
              <div style={{ marginTop:4 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'.04em' }}>Promo / Coupon Code</label>
                <div style={{ display:'flex', gap:8, marginTop:4 }}>
                  <input value={promoCode} onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoResult(null); }}
                    style={{ flex:1, padding:'8px 12px', border:`1px solid ${promoResult?.valid?'#bbf7d0':promoResult?'#fecaca':'var(--border)'}`, borderRadius:8, fontSize:13, textTransform:'uppercase', letterSpacing:2 }}
                    placeholder="Enter promo code" />
                  <button type="button" disabled={promoLoading || !promoCode.trim()}
                    onClick={async () => {
                      setPromoLoading(true); setPromoResult(null);
                      try {
                        const r = await crmPromoAPI.validate(cid, promoCode, subtotal - discountAmt);
                        setPromoResult({ ...r, code: promoCode });
                      } catch(e) {
                        let errMsg = 'Invalid or expired promo code';
                        const msg = typeof e.message === 'string' ? e.message : '';
                        // Ignore backend validation parse errors (old backend) — show friendly message
                        if (msg.includes('integer') || msg.includes('parse') || msg.includes('Field required')) {
                          errMsg = 'Promo code not found or expired';
                        } else if (msg && !msg.includes('object Object')) {
                          errMsg = msg;
                        }
                        setPromoResult({ valid: false, error: errMsg });
                      }
                      setPromoLoading(false);
                    }}
                    style={{ padding:'8px 14px', background: promoResult?.valid?'#166534':'var(--primary)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13 }}>
                    {promoLoading ? '⏳' : promoResult?.valid ? '✓' : 'Apply'}
                  </button>
                  {promoResult?.valid && (
                    <button type="button" onClick={() => { setPromoCode(''); setPromoResult(null); }}
                      style={{ padding:'8px 10px', background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:8, cursor:'pointer', fontSize:13 }}>✕</button>
                  )}
                </div>
                {promoResult && !promoResult.valid && (
                  <div style={{ marginTop:4, fontSize:12, color:'#dc2626' }}>
                    ❌ {typeof promoResult.error === 'string' ? promoResult.error : 'Invalid or expired promo code'}
                  </div>
                )}
                {promoResult?.valid && (
                  <div style={{ marginTop:4, fontSize:12, color:'#166534' }}>✅ {promoResult.description || `Saving ₹${promoDiscount.toFixed(2)}`}</div>
                )}
              </div>
              </div>

              {/* ── Payment Method Buttons ── */}
              <div>
                <label style={S.label}>Payment Method</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { id: 'cash',         label: '💵 Cash' },
                    { id: 'upi',          label: '📲 Personal UPI' },
                    { id: 'merchant',     label: '🏦 Merchant', show: merchantEnabled },
                    { id: 'split',        label: 'Split' },
                    { id: 'complimentary',label: 'Complimentary' },
                  ].filter(m => m.show !== false).map(m => (
                    <button key={m.id} type="button"
                      style={{ padding: '7px 14px', border: `1.5px solid ${payMethod===m.id?'var(--primary)':'var(--border)'}`, borderRadius: 8, background: payMethod===m.id?'var(--primary-light)':'var(--white)', color: payMethod===m.id?'var(--primary)':'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => { setPayMethod(m.id); setShowUpiQr(false); setRzpStatus(''); }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── PERSONAL UPI — show QR ── */}
              {payMethod === 'upi' && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    {/* QR code */}
                    <div style={{ flexShrink: 0, textAlign: 'center' }}>
                      {(companyQrUrl || paySettings.upi_qr_url) ? (
                        <div style={{ background: '#fff', border: '2px solid #7c3aed', borderRadius: 12, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 200, height: 200 }}>
                          <img src={companyQrUrl || paySettings.upi_qr_url} alt="UPI QR"
                            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                            onError={e => e.target.style.display='none'} />
                        </div>
                      ) : (
                        <div style={{ width: 200, height: 200, border: '2px dashed var(--border)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-3)', background: '#fafafa' }}>
                          <span style={{ fontSize: 44 }}>📲</span>
                          <span style={{ fontSize: 11, textAlign: 'center', padding: '0 12px', lineHeight: 1.5 }}>Upload QR in<br/>Payment QR Codes</span>
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', marginBottom: 6 }}>
                        {paySettings.upi_name || 'Scan to Pay'}
                      </div>
                      {paySettings.upi_id && (
                        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>
                          UPI ID: <strong>{paySettings.upi_id}</strong>
                        </div>
                      )}
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', marginBottom: 10 }}>
                        ₹{totalRounded.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
                        Customer scans QR → pays → confirm below
                      </div>
                    </div>
                  </div>
                  <div>
                    <label style={S.label}>UPI Transaction ID (after payment)</label>
                    <input value={payRef} onChange={e => setPayRef(e.target.value)} style={S.input}
                      placeholder="Enter UTR / Transaction ID from customer" />
                  </div>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#166534', fontWeight: 500 }}>
                    ✅ Once customer pays, enter Transaction ID above and click Generate Bill
                  </div>
                </div>
              )}

              {/* ── MERCHANT (Razorpay) ── */}
              {payMethod === 'merchant' && (
                <div style={{ border: '1px solid #d4b8f8', borderRadius: 10, padding: 14, background: '#faf9ff', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Sub-method tabs */}
                  <div>
                    <label style={S.label}>Payment via</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {[
                        { id: 'merchant_upi',  label: '📱 UPI (Razorpay)' },
                        { id: 'merchant_card', label: '💳 Card' },
                      ].map(s => (
                        <button key={s.id} type="button"
                          style={{ padding: '7px 14px', border: `1.5px solid ${merchantSub===s.id?'#7c3aed':'var(--border)'}`, borderRadius: 8, background: merchantSub===s.id?'#ede9fe':'var(--white)', color: merchantSub===s.id?'#7c3aed':'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => { setMerchantSub(s.id); setRzpStatus(''); }}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Razorpay pay button */}
                  {rzpStatus === 'success' ? (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, marginBottom: 4 }}>✅</div>
                      <div style={{ fontWeight: 700, color: '#166534' }}>Payment Confirmed!</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Ref: {payRef}</div>
                      <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>Click "Generate Bill" to complete</div>
                    </div>
                  ) : rzpStatus === 'failed' ? (
                    <div style={{ background: '#fff0f0', border: '1px solid #fcc', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, marginBottom: 4 }}>❌</div>
                      <div style={{ fontWeight: 700, color: '#cc2222' }}>Payment Failed</div>
                      <button type="button" style={{ marginTop: 8, padding: '6px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                        onClick={() => setRzpStatus('')}>Try Again</button>
                    </div>
                  ) : (
                    <button type="button"
                      style={{ padding: '12px', background: 'linear-gradient(135deg,#7c3aed,#9f5fff)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: rzpStatus==='loading'?'not-allowed':'pointer', opacity: rzpStatus==='loading'?0.7:1 }}
                      disabled={rzpStatus === 'loading'}
                      onClick={() => {
                        const rzpKey = companySettings?.razorpay_key_id || paySettings.razorpay_key_id;
                        if (!rzpKey) { alert('Add Razorpay Key ID in Payment Methods settings'); return; }
                        setRzpStatus('loading');
                        // Load Razorpay SDK dynamically
                        const script = document.createElement('script');
                        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                        script.onload = () => {
                          const options = {
                            key:         companySettings?.razorpay_key_id || paySettings.razorpay_key_id,
                            amount:      totalRounded * 100, // paise (already rounded)
                            currency:    'INR',
                            name:        companySettings?.merchant_name || paySettings.merchant_name || selectedCompany?.name || 'Restaurant',
                            description: paySettings.merchant_description || `Order ${activeOrder?.order_number}`,
                            order_id:    '', // optional — set if you create Razorpay order from backend
                            method:      merchantSub === 'merchant_upi' ? { upi: true, card: false } : { card: true, upi: false },
                            prefill: {
                              name:  activeOrder?.customer_name || '',
                              email: '',
                              contact: activeOrder?.customer_phone || '',
                            },
                            theme: { color: '#7c3aed' },
                            handler: async function(response) {
                              // ✅ Auto-confirmed — Razorpay returns payment_id
                              const rzpPaymentId = response.razorpay_payment_id;
                              setPayRef(rzpPaymentId);
                              setAmountPaid(totalRounded.toFixed(2));
                              setRzpStatus('success');

                              // Save transaction to backend DB only
                              const txn = {
                                razorpay_payment_id: rzpPaymentId,
                                razorpay_order_id:   response.razorpay_order_id || null,
                                razorpay_signature:  response.razorpay_signature || null,
                                amount:              total,
                                currency:            'INR',
                                method:              merchantSub === 'merchant_upi' ? 'upi' : 'card',
                                status:              'success',
                                company_unique_id:   cid,
                                order_id:            activeOrder?.order_id,
                                order_number:        activeOrder?.order_number,
                                timestamp:           new Date().toISOString(),
                              };
                              try { await paymentTransactionAPI.create(txn); } catch(e) { console.error('Failed to save transaction:', e); }

                              // ✅ AUTO-GENERATE BILL immediately
                              try {
                                const billPayload = {
                                  order_id:          activeOrder.order_id,
                                  company_unique_id: cid,
                                  payment_method:    merchantSub === 'merchant_upi' ? 'upi' : 'card',
                                  payment_reference: rzpPaymentId,
                                  amount_paid:       totalRounded,
                                  discount_amount:   parseFloat(discount) || 0,
                                  service_charge:    surcharge,
                                  promo_code:        promoResult?.code || null,
                                  promo_amount:      promoDiscount || 0,
                                  sgst_amount:       sgstAmt || 0,
                                  cgst_amount:       cgstAmt || 0,
                                  customer_id:       billCustomerId || null,
                                  created_by:        user?.user_id || null,
                                };
                                const b = await posBillAPI.generate(billPayload);
                                await loadOrders();
                                await loadOrderDetail(activeOrder.order_id);
                                showToast(`✅ Payment confirmed & Bill ${b.bill_number} generated!`);
                                setModal(null);
                                // Print receipt
                                if (selectedCompany) setTimeout(() => printBillReceipt(b, activeOrder, selectedCompany, promoDiscount, promoResult?.code, parseFloat(discount) || 0), 300);
                                // Send WhatsApp bill — snapshot order BEFORE loadOrders/loadOrderDetail replace it
                                const waPhone       = billCustPhone || activeOrder?.customer_phone;
                                const orderSnapshot = { ...activeOrder, items: [...(activeOrder?.items || [])] };
                                const rzpBillWithGst = { ...b, sgst_amount: b.sgst_amount ?? sgstAmt, cgst_amount: b.cgst_amount ?? cgstAmt };
                                sendWhatsAppBill(rzpBillWithGst, waPhone, activeOrder.customer_name, {
                                  amount: promoDiscount,
                                  code:   promoResult?.code || '',
                                }, orderSnapshot).catch(e => console.error('WA send error:', e));
                              } catch (err) {
                                // Auto-generate failed — show manual button
                                showToast('Payment confirmed! Click Generate Bill to complete.', 'info');
                              }
                            },
                            modal: {
                              ondismiss: async () => {
                                // User dismissed — save as cancelled transaction
                                const txn = {
                                  razorpay_payment_id: null,
                                  razorpay_order_id:   null,
                                  razorpay_signature:  null,
                                  amount:              total,
                                  currency:            'INR',
                                  method:              merchantSub === 'merchant_upi' ? 'upi' : 'card',
                                  status:              'cancelled',
                                  company_unique_id:   cid,
                                  order_id:            activeOrder?.order_id,
                                  order_number:        activeOrder?.order_number,
                                  timestamp:           new Date().toISOString(),
                                  error_description:   'Customer dismissed payment',
                                };
                                try { await paymentTransactionAPI.create(txn); } catch(e) { console.error('Failed to save transaction:', e); }
                                setRzpStatus('');
                              },
                            },
                          };
                          const rzp = new window.Razorpay(options);
                          rzp.on('payment.failed', async (response) => {
                            setRzpStatus('failed');
                            const txn = {
                              razorpay_payment_id: response?.error?.metadata?.payment_id || null,
                              razorpay_order_id:   response?.error?.metadata?.order_id   || null,
                              amount:              total,
                              currency:            'INR',
                              method:              merchantSub === 'merchant_upi' ? 'upi' : 'card',
                              status:              'failed',
                              company_unique_id:   cid,
                              order_id:            activeOrder?.order_id,
                              order_number:        activeOrder?.order_number,
                              timestamp:           new Date().toISOString(),
                              error_code:          response?.error?.code        || null,
                              error_description:   response?.error?.description || null,
                            };
                            try { await paymentTransactionAPI.create(txn); } catch(e) { console.error('Failed to save transaction:', e); }
                          });
                          rzp.open();
                        };
                        script.onerror = () => { setRzpStatus('failed'); };
                        document.body.appendChild(script);
                      }}>
                      {rzpStatus === 'loading' ? '⏳ Opening Razorpay…' : `🏦 Pay ₹${totalRounded.toFixed(2)} via ${merchantSub === 'merchant_upi' ? 'UPI' : 'Card'}`}
                    </button>
                  )}
                </div>
              )}

              {/* ── Amount + reference for Cash/Split/Complimentary ── */}
              {!['upi','merchant'].includes(payMethod) && (
                <>
                  <div><label style={S.label}>Amount Received (₹)</label>
                    <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} style={S.input} />
                  </div>
                  {payMethod === 'card' && (
                    <div><label style={S.label}>Card last 4 digits</label>
                      <input value={payRef} onChange={e => setPayRef(e.target.value)} style={S.input} placeholder="1234" />
                    </div>
                  )}
                </>
              )}

              {parseFloat(amountPaid) > totalRounded && (
                <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>
                  Change to return: ₹{(parseFloat(amountPaid) - totalRounded).toFixed(2)}
                </div>
              )}

              {/* WhatsApp number — only shown if WhatsApp enabled */}
              {companySettings?.is_whatsapp_enabled && (
                <div>
                  <label style={S.label}>📱 WhatsApp Number for Bill</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={billCustPhone || activeOrder?.customer_phone || ''}
                      onChange={e => setBillCustPhone(e.target.value)}
                      style={{ ...S.input, flex: 1 }}
                      placeholder="+91 9876543210" />
                    {payMethod === 'merchant' ? (
                      // Merchant: send payment request with UPI link
                      <button type="button"
                        onClick={sendWhatsAppPaymentRequest}
                        disabled={waSendLoading}
                        style={{ padding: '9px 14px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', opacity: waSendLoading ? 0.7 : 1 }}>
                        {waSendLoading ? '⏳' : '📲 Send Bill'}
                      </button>
                    ) : (
                      // Cash/UPI: send final bill immediately
                      <button type="button"
                        onClick={async () => {
                          const phone = billCustPhone || activeOrder?.customer_phone;
                          if (!phone) { showToast('Enter WhatsApp number first', 'error'); return; }
                          setWaSendLoading(true);
                          // Build a preview bill object from current values
                          const previewBill = {
                            bill_number:      '(preview)',
                            table_name:       activeOrder?.table_name || activeOrder?.table?.table_name,
                            payment_method:   payMethod,
                            subtotal:         activeOrder?.items?.filter(i=>!i.is_cancelled).reduce((s,i)=>s+parseFloat(i.unit_price)*i.quantity,0) || 0,
                            discount_amount:  parseFloat(discount || 0),
                            service_charge:   surcharge || 0,
                            sgst_amount:      sgstAmt || 0,
                            cgst_amount:      cgstAmt || 0,
                            total_payable:    total,
                          };
                          const orderSnapshot = { ...activeOrder, items: [...(activeOrder?.items || [])] };
                          await sendWhatsAppBill(previewBill, phone, activeOrder?.customer_name, {
                            amount: promoDiscount,
                            code:   promoResult?.code || '',
                          }, orderSnapshot);
                          setWaSendLoading(false);
                        }}
                        disabled={waSendLoading}
                        style={{ padding: '9px 14px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', opacity: waSendLoading ? 0.7 : 1 }}>
                        {waSendLoading ? '⏳' : '📲 Send Bill'}
                      </button>
                    )}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-3)',marginTop:3}}>
                    {payMethod === 'merchant'
                      ? '📲 Send Bill → sends payment request with UPI link to customer'
                      : 'Leave blank to skip WhatsApp · Number pre-filled from order if available'}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                {payLinkPolling && (
                  <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                    Waiting for customer payment…
                  </div>
                )}
                <button style={S.cancelBtn} onClick={() => { setModal(null); setRzpStatus(''); setMerchantSub('merchant_upi'); setPayLinkId(null); setPayLinkPolling(false); }}>Cancel</button>
                <button style={{ ...S.primaryBtn, background: 'linear-gradient(135deg,var(--green-700),var(--green-500))', border: 'none' }} onClick={generateBill} disabled={saving}>
                  {saving ? 'Generating…' : '🧾 Generate Bill'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── OFFLINE BILL MODAL ── */}
      {showOfflineBillModal && (
        <div style={S.overlay} onClick={() => setShowOfflineBillModal(false)}>
          <div style={{ ...S.modalBox, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={{ fontWeight:700, fontSize:17 }}>🧾 Offline Bill</span>
              <button style={S.closeBtn} onClick={() => setShowOfflineBillModal(false)}>✕</button>
            </div>
            <div style={{ background:'#fff3cd', border:'1px solid #ffc107', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:13, color:'#856404' }}>
              📴 Offline Bill — will sync to server when internet is restored
            </div>
            <div style={{ background:'var(--bg)', borderRadius:8, padding:12, marginBottom:14 }}>
              {activeItems.map(item => (
                <div key={item.food_menu_id || item.order_item_id} style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                  <span>{item.item_name || item.name} x{item.quantity}</span>
                  <span>₹{(parseFloat(item.unit_price || item.sale_price || 0) * item.quantity).toFixed(0)}</span>
                </div>
              ))}
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, marginTop:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
                {surcharge > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4, color:'#92400e' }}><span>{activeOrder?.table_surcharge_label || 'Table Surcharge'}</span><span>+₹{surcharge.toFixed(2)}</span></div>}
                {sgstAmt > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4, color:'#1e40af' }}><span>SGST ({sgstRate}%)</span><span>+₹{sgstAmt.toFixed(2)}</span></div>}
                {cgstAmt > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4, color:'#1e40af' }}><span>CGST ({cgstRate}%)</span><span>+₹{cgstAmt.toFixed(2)}</span></div>}
                <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:16, borderTop:'1px solid var(--border)', paddingTop:8, marginTop:4 }}>
                  <span>Total</span><span style={{ color:'var(--primary)' }}>₹{totalRounded.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Payment Method</label>
              <div style={{ display:'flex', gap:8 }}>
                {[['cash','💵 Cash'],['upi','📲 UPI']].map(([id,label]) => (
                  <button key={id}
                    style={{ flex:1, padding:'10px', border:`2px solid ${offlinePayMethod===id?'var(--primary)':'var(--border)'}`, borderRadius:8, background:offlinePayMethod===id?'var(--primary-light)':'var(--white)', color:offlinePayMethod===id?'var(--primary)':'var(--text-2)', fontWeight:offlinePayMethod===id?700:400, cursor:'pointer', fontSize:13 }}
                    onClick={() => setOfflinePayMethod(id)}>{label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={S.label}>Amount Received (₹)</label>
              <input type="number" value={offlineAmountPaid} onChange={e => setOfflineAmountPaid(e.target.value)} style={S.input} />
              {parseFloat(offlineAmountPaid) > totalRounded && (
                <div style={{ marginTop:6, fontSize:13, color:'var(--primary)', fontWeight:600 }}>
                  Change: ₹{(parseFloat(offlineAmountPaid) - totalRounded).toFixed(0)}
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button style={S.cancelBtn} onClick={() => setShowOfflineBillModal(false)}>Cancel</button>
              <button style={{ ...S.primaryBtn, background:'linear-gradient(135deg,var(--green-700),var(--green-500))', border:'none' }}
                onClick={() => {
                  const paid = parseFloat(offlineAmountPaid) || totalRounded;
                  if (isOfflineOrder) {
                    // Offline order — save locally and print (with full amounts for server sync)
                    const updated = markOfflineOrderBilled(activeOrder.offline_id, offlinePayMethod, paid, {
                      discount:    discountAmt,
                      surcharge:   surcharge,
                      sgst_amount: sgstAmt,
                      cgst_amount: cgstAmt,
                      sgst_rate:   sgstRate,
                      cgst_rate:   cgstRate,
                      total:       totalRounded,
                    });
                    if (updated) {
                      printOfflineBill(updated, selectedCompany || {});
                      showToast('🧾 Offline bill generated & printed!');
                      setShowOfflineBillModal(false);
                      updatePendingCount();
                      // Show bill details in center panel instead of going blank
                      setActiveOrder({ ...updated, order_status: 'billed', items: updated.items || [] });
                      setBill({
                        bill_number:    updated.order_number + '-OFFLINE',
                        payment_method: updated.payment_method,
                        amount_paid:    updated.amount_paid,
                        print_count:    1,
                        is_offline:     true,
                        _offlineOrder:  updated,
                      });
                      // Remove from running orders
                      setOrders(prev => prev.filter(o => o.offline_id !== updated.offline_id && o.order_id !== updated.order_id));
                      loadOrders();
                    }
                  } else {
                    // Online order billed while offline
                    // Save to pending bills queue for sync when online
                    try {
                      const pendingBills = JSON.parse(localStorage.getItem(`rms_pending_bills_${cid}`) || '[]');
                      pendingBills.push({
                        order_id:       activeOrder?.order_id,
                        order_number:   activeOrder?.order_number,
                        payment_method: offlinePayMethod,
                        amount_paid:    paid,
                        discount:       discountAmt,
                        surcharge:      surcharge,
                        sgst_amount:    sgstAmt,
                        cgst_amount:    cgstAmt,
                        total:          totalRounded,
                      });
                      localStorage.setItem(`rms_pending_bills_${cid}`, JSON.stringify(pendingBills));
                    } catch {}
                    // Print offline receipt
                    const billData = {
                      order_number:   activeOrder?.order_number,
                      order_type:     activeOrder?.order_type,
                      table_name:     activeOrder?.table_name,
                      customer_name:  activeOrder?.customer_name,
                      payment_method: offlinePayMethod,
                      amount_paid:    paid,
                      items:          activeItems.map(i => ({ item_name: i.item_name, quantity: i.quantity, unit_price: parseFloat(i.unit_price), is_veg: i.is_veg })),
                      subtotal,
                      discount:       discountAmt,
                      surcharge,
                      sgst_amount:    sgstAmt,
                      cgst_amount:    cgstAmt,
                      sgst_rate:      sgstRate,
                      cgst_rate:      cgstRate,
                      total_payable:  totalRounded,
                    };
                    printOfflineBill(billData, selectedCompany || {});
                    showToast('🧾 Bill printed! Will auto-sync when online.');
                    setShowOfflineBillModal(false);
                    // Show bill details in center panel
                    setActiveOrder(prev => prev ? { ...prev, order_status: 'billed' } : prev);
                    setBill({
                      bill_number:    billData.order_number + '-OFFLINE',
                      payment_method: offlinePayMethod,
                      amount_paid:    paid,
                      print_count:    1,
                      is_offline:     true,
                      _billData:      billData,
                    });
                    // Remove from running orders UI and cache
                    setOrders(prev => prev.filter(o => o.order_id !== activeOrder?.order_id));
                    try {
                      const cached = JSON.parse(localStorage.getItem(`rms_running_orders_${cid}`) || '[]');
                      localStorage.setItem(`rms_running_orders_${cid}`, JSON.stringify(cached.filter(o => o.order_id !== activeOrder?.order_id)));
                    } catch {}
                  }
                }}>
                🖨️ Print & Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────
const S = {
  root:   { display: 'flex', height: 'calc(100vh - 0px)', overflow: 'hidden', fontFamily: 'var(--font-sans)' },
  left:   { width: 200, minWidth: 200, background: 'var(--white)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  center: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '14px 16px', gap: 8, background: 'var(--bg)' },
  right:  { width: 580, minWidth: 580, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--white)' },

  leftHead:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 6px' },
  newBtn:    { margin: '6px 10px', padding: '7px', background: 'linear-gradient(135deg,var(--green-700),var(--green-500))', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  orderCard: { padding: '8px 10px', borderRadius: 8, marginBottom: 4, cursor: 'pointer', border: '1px solid transparent', transition: 'all .15s', margin: '2px 8px' },
  orderCardActive: { background: 'var(--primary-light)', border: '1px solid var(--border-mid)' },
  tag:  { background: 'var(--green-100)', color: 'var(--green-800)', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4 },
  pill: { fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, display: 'inline-block' },
  qaBtn: { display: 'block', width: '100%', textAlign: 'left', padding: '7px 8px', background: 'var(--bg)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', marginBottom: 4, color: 'var(--text-2)' },

  typeTabs:    { display: 'flex', background: 'var(--bg)', borderRadius: 10, padding: 3, gap: 2 },
  typeTab:     { flex: 1, padding: '7px', border: 'none', background: 'none', borderRadius: 8, fontWeight: 500, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' },
  typeTabActive: { background: 'var(--primary)', color: '#fff', fontWeight: 700 },

  itemsTable:  { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 },
  itemsHeader: { display: 'flex', alignItems: 'center', padding: '8px 14px', background: 'var(--green-50)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em', textTransform: 'uppercase', gap: 6 },
  qtyBtn:    { width: 24, height: 24, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer', fontWeight: 700, fontSize: 13 },

  totals:    { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 },
  totalRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 },

  cancelBtn: { padding: '8px 16px', border: '1px solid #fca5a5', background: 'var(--white)', color: '#dc2626', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  holdBtn:   { flex: 1, padding: '8px', border: '1px solid var(--border-mid)', background: 'var(--green-50)', color: 'var(--primary)', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  billBtn:   { width: '100%', padding: 13, background: 'linear-gradient(135deg,var(--green-700),var(--green-500))', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  kotBtn:    { width: '100%', padding: 10, border: '1.5px solid var(--primary)', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  smallBtn:  { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', fontSize: 12, cursor: 'pointer', color: 'var(--text-2)' },

  vegBtn:  { padding: '4px 9px', border: '1px solid var(--border)', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  catBtn:  { padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 20, fontSize: 12, fontWeight: 500, background: 'var(--bg)', cursor: 'pointer', whiteSpace: 'nowrap' },
  catActive: { background: 'var(--primary)', color: '#fff', border: '1px solid var(--primary)', fontWeight: 700 },
  menuCard: { border: '1px solid var(--border)', borderRadius: 10, padding: 8, cursor: 'pointer', position: 'relative', background: 'var(--bg)', transition: 'all .15s', display: 'flex', flexDirection: 'column', height: 158 },
  addBtn:   { background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--border-mid)', borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 600, cursor: 'pointer' },

  overlay:  { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalBox: { background: 'var(--white)', borderRadius: 16, padding: 24, width: '90%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)' },
  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  closeBtn:  { background: 'none', border: '1px solid var(--border)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 13 },

  tableCard: { borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, border: '1.5px solid', transition: 'all .15s' },
  label:     { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5 },
  input:     { width: '100%', padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'var(--font-sans)' },
  primaryBtn:{ padding: '9px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
};
