import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/useApp';
import { posTableAPI, posOrderAPI, foodMenuAPI, foodCategoryAPI, crmCustomerAPI } from '../services/api';
import {
  cacheMenu, cacheCategories, cacheTables,
  getCachedMenu, getCachedCategories, getCachedTables,
  createOfflineOrder, addItemToOfflineOrder, removeItemFromOfflineOrder,
  markOfflineOrderBilled, printOfflineBill,
  getUnsyncedOfflineOrders, markOfflineOrderSynced,
} from '../services/offlineStore';

// ── Offline Banner ────────────────────────────────────────────
function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBack, setShowBack] = useState(false);
  useEffect(() => {
    const goOffline = () => { setIsOnline(false); setShowBack(false); };
    const goOnline  = () => { setIsOnline(true); setShowBack(true); setTimeout(() => setShowBack(false), 4000); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, []);
  if (isOnline && !showBack) return null;
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:9999, padding:'10px 20px', textAlign:'center', fontWeight:600, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8, background: isOnline ? '#16a34a' : '#dc2626', color:'#fff', boxShadow:'0 2px 8px rgba(0,0,0,0.2)' }}>
      {isOnline ? '✅ Back online! Syncing orders...' : '📴 Offline — Cash & UPI orders still work!'}
    </div>
  );
}

export default function DineIn() {
  const { selectedCompany, user, showToast } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [tables, setTables]               = useState([]);
  const [activeOrder, setActiveOrder]     = useState(null);
  const [isOfflineOrder, setIsOfflineOrder] = useState(false);
  const [items, setItems]                 = useState([]);
  const [menus, setMenus]                 = useState([]);
  const [cats, setCats]                   = useState([]);
  const [selCat, setSelCat]               = useState('all');
  const [search, setSearch]               = useState('');
  const [phone, setPhone]                 = useState('');
  const [customer, setCustomer]           = useState(null);
  const [showCustForm, setShowCustForm]   = useState(false);
  const [newCust, setNewCust]             = useState({ name: '', phone: '', email: '' });
  const [loading, setLoading]             = useState(false);
  const [step, setStep]                   = useState('tables');
  const [isOnline, setIsOnline]           = useState(navigator.onLine);
  const [showBillModal, setShowBillModal] = useState(false);
  const [payMethod, setPayMethod]         = useState('cash');
  const [amountPaid, setAmountPaid]       = useState('');

  // Track online/offline
  useEffect(() => {
    const goOffline = () => setIsOnline(false);
    const goOnline  = () => { setIsOnline(true); syncOfflineOrders(); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, []);

  // ── Auto-sync when back online ────────────────────────────
  const syncOfflineOrders = async () => {
    const pending = getUnsyncedOfflineOrders();
    if (!pending.length) return;
    showToast(`🔄 Syncing ${pending.length} offline order(s)...`);
    let synced = 0;
    for (const order of pending) {
      try {
        const serverOrder = await posOrderAPI.create({
          company_unique_id: order.company_unique_id,
          order_type:        order.order_type,
          table_id:          order.table_id || undefined,
          covers:            order.covers || 1,
          customer_name:     order.customer_name || '',
          customer_phone:    order.customer_phone || '',
          created_by:        order.created_by || null,
        });
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
        markOfflineOrderSynced(order.offline_id);
        synced++;
      } catch (e) { console.error('Sync failed:', order.offline_id, e); }
    }
    if (synced > 0) showToast(`✅ ${synced} offline order(s) synced to server!`);
  };

  const loadTables = useCallback(async () => {
    if (!cid) return;
    try {
      const t = await posTableAPI.getAll(cid);
      setTables(t.filter(t => t.table_status === 'free' && t.is_active));
      cacheTables(t);
    } catch {
      const cached = getCachedTables();
      if (cached.length > 0) setTables(cached.filter(t => t.table_status === 'free' && t.is_active));
    }
  }, [cid]);

  const loadMenus = useCallback(async () => {
    if (!cid) return;
    try {
      const [m, c] = await Promise.all([foodMenuAPI.getAll(cid), foodCategoryAPI.getAll(cid)]);
      const filtered = m.filter(x => x.IsActive && x.is_available);
      setMenus(filtered); setCats(c);
      cacheMenu(filtered); cacheCategories(c);
    } catch {
      const cachedMenus = getCachedMenu();
      const cachedCats  = getCachedCategories();
      if (cachedMenus.length > 0) {
        setMenus(cachedMenus); setCats(cachedCats);
        showToast('📴 Showing cached menu (offline)', 'info');
      }
    }
  }, [cid]);

  useEffect(() => { loadTables(); loadMenus(); }, [loadTables, loadMenus]);

  // ── Select Table ─────────────────────────────────────────
  const selectTable = async (table) => {
    setLoading(true);
    if (isOnline) {
      try {
        const order = await posOrderAPI.create({
          company_unique_id: cid, order_type: 'dine_in',
          table_id: table.table_id, covers: 2, created_by: user?.user_id,
        });
        setActiveOrder(order); setIsOfflineOrder(false); setItems([]); setStep('order');
      } catch {
        showToast('Server error — creating offline order', 'error');
        createLocalOrder(table);
      }
    } else {
      createLocalOrder(table);
    }
    setLoading(false);
  };

  const createLocalOrder = (table) => {
    const order = createOfflineOrder({
      company_unique_id: cid, order_type: 'dine_in',
      table_id: table.table_id, table_name: table.table_name,
      covers: 2, created_by: user?.user_id,
    });
    setActiveOrder(order); setIsOfflineOrder(true); setItems([]); setStep('order');
    showToast('📴 Offline order created — syncs when online');
  };

  // ── Customer Search ───────────────────────────────────────
  const searchCustomer = async () => {
    if (!phone) return;
    if (!isOnline) { showToast('📴 Customer search not available offline', 'error'); return; }
    try {
      const c = await crmCustomerAPI.lookupPhone(cid, phone.replace(/[^0-9]/g, ''));
      setCustomer(c); setShowCustForm(false);
      showToast(`Customer found: ${c.name}`);
    } catch { setShowCustForm(true); setNewCust(p => ({ ...p, phone })); }
  };

  const saveNewCustomer = async () => {
    if (!isOnline) { showToast('📴 Cannot save customer offline', 'error'); return; }
    try {
      const c = await crmCustomerAPI.create(cid, { ...newCust, company_unique_id: cid });
      setCustomer(c); setShowCustForm(false); showToast('Customer saved!');
    } catch { showToast('Failed to save customer', 'error'); }
  };

  // ── Add Item ─────────────────────────────────────────────
  const addItem = async (menu) => {
    if (!activeOrder) return;
    if (isOfflineOrder) {
      const updated = addItemToOfflineOrder(activeOrder.offline_id, menu);
      if (updated) { setActiveOrder({ ...updated }); }
      return;
    }
    try {
      await posOrderAPI.addItem(activeOrder.order_id, cid, {
        food_menu_id: menu.food_menu_id || menu.foodmenuid, item_name: menu.name,
        item_code: menu.code, category_id: menu.categoryid || menu.category_id,
        category_name: '', unit_price: menu.sale_price || menu.saleprice,
        quantity: 1, is_veg: true, modifiers: [],
      });
      setItems(prev => {
        const ex = prev.find(i => i.food_menu_id === (menu.food_menu_id || menu.foodmenuid));
        if (ex) return prev.map(i => i.food_menu_id === ex.food_menu_id ? { ...i, quantity: i.quantity + 1 } : i);
        return [...prev, { ...menu, food_menu_id: menu.food_menu_id || menu.foodmenuid, quantity: 1 }];
      });
    } catch { showToast('Failed to add item', 'error'); }
  };

  // ── Remove Item ──────────────────────────────────────────
  const removeItem = async (item) => {
    if (!activeOrder) return;
    if (isOfflineOrder) {
      const updated = removeItemFromOfflineOrder(activeOrder.offline_id, item.food_menu_id);
      if (updated) { setActiveOrder({ ...updated }); }
      return;
    }
    try {
      const orderData = await posOrderAPI.getById(activeOrder.order_id);
      const orderItem = orderData.items?.find(i => i.food_menu_id === item.food_menu_id);
      if (!orderItem) return;
      await posOrderAPI.updateQty(activeOrder.order_id, orderItem.order_item_id, orderItem.quantity > 1 ? orderItem.quantity - 1 : 0);
      setItems(prev => {
        const ex = prev.find(i => i.food_menu_id === item.food_menu_id);
        if (!ex) return prev;
        if (ex.quantity <= 1) return prev.filter(i => i.food_menu_id !== item.food_menu_id);
        return prev.map(i => i.food_menu_id === item.food_menu_id ? { ...i, quantity: i.quantity - 1 } : i);
      });
    } catch { showToast('Failed to remove item', 'error'); }
  };

  // ── Generate Bill (offline only) ─────────────────────────
  const generateBill = () => {
    const paid = parseFloat(amountPaid) || subtotal;
    const updated = markOfflineOrderBilled(activeOrder.offline_id, payMethod, paid);
    if (updated) {
      printOfflineBill(updated, selectedCompany || {});
      showToast('🧾 Offline bill generated & printed!');
      setShowBillModal(false);
      done();
    }
  };

  // ── Done ─────────────────────────────────────────────────
  const done = () => {
    showToast('Order saved!');
    setStep('tables'); setActiveOrder(null); setIsOfflineOrder(false);
    setItems([]); setCustomer(null); setPhone('');
    setShowCustForm(false); setShowBillModal(false);
    loadTables();
  };

  const filteredMenus = menus.filter(m => {
    const matchCat    = selCat === 'all' || m.categoryid === parseInt(selCat) || m.category_id === parseInt(selCat);
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const currentItems = isOfflineOrder ? (activeOrder?.items || []) : items;
  const subtotal = currentItems.reduce((s, i) => s + (parseFloat(i.unit_price || i.sale_price || i.saleprice || 0) * i.quantity), 0);

  if (!selectedCompany) return (
    <div style={S.page}><div style={S.empty}><h3>No Company Selected</h3></div></div>
  );

  // ── TABLE SELECTION ──
  if (step === 'tables') return (
    <div style={S.page}>
      <OfflineBanner />
      {!isOnline && (
        <div style={{ background:'#fff3cd', border:'1px solid #ffc107', borderRadius:8, padding:'10px 16px', marginBottom:16, fontSize:13, color:'#856404' }}>
          📴 <strong>Offline Mode</strong> — You can still take orders and accept Cash / UPI payments!
        </div>
      )}
      <div style={S.header}>
        <h2 style={S.title}>🍽️ Dine In — Select Table</h2>
        <p style={S.sub}>Select a free table to start an order</p>
      </div>
      {loading && <div style={S.loading}>Creating order...</div>}
      <div style={S.tableGrid}>
        {tables.length === 0 && <div style={S.empty}>No free tables available</div>}
        {tables.map(t => (
          <div key={t.table_id} style={S.tableCard} onClick={() => !loading && selectTable(t)}>
            <div style={S.tableIcon}>🪑</div>
            <div style={S.tableName}>{t.table_name}</div>
            <div style={S.tableSub}>{t.seats} seats</div>
            {t.surcharge_amount > 0 && <div style={S.surcharge}>+₹{t.surcharge_amount} {t.surcharge_label}</div>}
            <div style={{ ...S.freeTag, background: isOnline ? '#e8f5e9' : '#fff3cd', color: isOnline ? '#2e7d32' : '#856404' }}>
              {isOnline ? 'Free' : '📴 Tap to order'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── ORDER SCREEN ──
  return (
    <div style={S.orderPage}>
      <OfflineBanner />

      {/* LEFT — Cart */}
      <div style={S.left}>
        <div style={S.orderHeader}>
          <div>
            <div style={S.orderNum}>{isOfflineOrder ? '📴 ' : ''}Order {activeOrder?.order_number}</div>
            <div style={S.orderSub}>Table: {activeOrder?.table_name || tables.find(t => t.table_id === activeOrder?.table_id)?.table_name || '—'}</div>
            {isOfflineOrder && (
              <div style={{ fontSize:11, color:'#856404', background:'#fff3cd', padding:'2px 6px', borderRadius:4, marginTop:4, display:'inline-block' }}>
                📴 Offline — will sync when online
              </div>
            )}
          </div>
          <button style={S.doneBtn} onClick={done}>✓ Done</button>
        </div>

        {/* Customer Search */}
        <div style={S.custBox}>
          <div style={S.custRow}>
            <input style={S.phoneInput} placeholder="Customer phone number..." value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchCustomer()} />
            <button style={{ ...S.searchBtn, opacity: !isOnline ? 0.5 : 1 }} onClick={searchCustomer} disabled={!isOnline}>
              {isOnline ? 'Search' : '📴'}
            </button>
          </div>
          {customer && <div style={S.custFound}>✅ {customer.name} — {customer.phone}</div>}
          {showCustForm && (
            <div style={S.custForm}>
              <input style={S.inp} placeholder="Name *" value={newCust.name} onChange={e => setNewCust(p => ({ ...p, name: e.target.value }))} />
              <input style={S.inp} placeholder="Email" value={newCust.email} onChange={e => setNewCust(p => ({ ...p, email: e.target.value }))} />
              <button style={S.saveBtn} onClick={saveNewCustomer} disabled={!isOnline}>Save Customer</button>
            </div>
          )}
        </div>

        {/* Items List */}
        <div style={S.cartList}>
          {currentItems.length === 0 && <div style={S.emptyCart}>Add items from the menu →</div>}
          {currentItems.map(item => (
            <div key={item.food_menu_id} style={S.cartItem}>
              <div style={S.cartName}>{item.item_name || item.name}</div>
              <div style={S.cartQtyRow}>
                <button style={S.qtyBtn} onClick={() => removeItem(item)}>−</button>
                <span style={S.qty}>{item.quantity}</span>
                <button style={S.qtyBtn} onClick={() => addItem(item)}>+</button>
              </div>
              <div style={S.cartPrice}>₹{(parseFloat(item.unit_price || item.sale_price || item.saleprice || 0) * item.quantity).toFixed(2)}</div>
            </div>
          ))}
        </div>

        {/* Subtotal */}
        <div style={S.total}>
          <span>Subtotal ({currentItems.length} items)</span>
          <span>₹{subtotal.toFixed(2)}</span>
        </div>

        {/* Bill Button — for offline orders only */}
        {isOfflineOrder && currentItems.length > 0 && (
          <button
            style={{ width:'100%', padding:'12px', background:'linear-gradient(135deg,#1a3a1c,#2d6a30)', color:'#fff', border:'none', borderRadius:10, fontWeight:700, fontSize:15, cursor:'pointer', marginTop:8 }}
            onClick={() => { setAmountPaid(subtotal.toFixed(2)); setShowBillModal(true); }}
          >
            🧾 Generate Bill · ₹{subtotal.toFixed(2)}
          </button>
        )}
      </div>

      {/* RIGHT — Menu */}
      <div style={S.right}>
        <input style={S.searchBox} placeholder="🔍 Search items..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={S.catRow}>
          <button style={selCat === 'all' ? S.catActive : S.cat} onClick={() => setSelCat('all')}>All</button>
          {cats.map(c => (
            <button key={c.food_category_id} style={selCat === String(c.food_category_id) ? S.catActive : S.cat} onClick={() => setSelCat(String(c.food_category_id))}>
              {c.category_name}
            </button>
          ))}
        </div>
        <div style={S.menuGrid}>
          {filteredMenus.map(m => (
            <div key={m.food_menu_id || m.foodmenuid} style={S.menuCard}>
              <div style={{ position:'relative', width:'100%', marginBottom:'6px' }}>
                {m.image_url || m.imageurl
                  ? <img src={m.image_url || m.imageurl} alt={m.name} style={S.menuImg} onError={e => e.target.style.display='none'} />
                  : <div style={S.menuImgPlaceholder}>🍽️</div>
                }
                <div style={{ position:'absolute', top:6, right:6, width:10, height:10, borderRadius:'50%', background: m.is_veg !== false ? '#16a34a' : '#dc2626', border:'2px solid #fff' }} />
              </div>
              <div style={S.menuName}>{m.name}</div>
              <div style={S.menuPrice}>₹{parseFloat(m.sale_price || m.saleprice || 0).toFixed(0)}</div>
              <button style={S.addBtn} onClick={() => addItem(m)}>+ Add</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── OFFLINE BILL MODAL ── */}
      {showBillModal && isOfflineOrder && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'90%', maxWidth:380, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight:700, fontSize:18, marginBottom:16 }}>🧾 Generate Bill</div>
            <div style={{ background:'#fff3cd', border:'1px solid #ffc107', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:13, color:'#856404' }}>
              📴 Offline Bill — will sync to server when internet is restored
            </div>
            {/* Items Summary */}
            <div style={{ background:'#f8f9fa', borderRadius:8, padding:12, marginBottom:16 }}>
              {currentItems.map(item => (
                <div key={item.food_menu_id} style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                  <span>{item.item_name || item.name} x{item.quantity}</span>
                  <span>₹{(parseFloat(item.unit_price || item.sale_price || 0) * item.quantity).toFixed(0)}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:16, borderTop:'1px solid #ddd', paddingTop:8, marginTop:8 }}>
                <span>Total</span><span style={{ color:'#1a3a1c' }}>₹{subtotal.toFixed(2)}</span>
              </div>
            </div>
            {/* Payment Method */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#555', marginBottom:8 }}>Payment Method</div>
              <div style={{ display:'flex', gap:8 }}>
                {[['cash','💵 Cash'],['upi','📲 UPI']].map(([id, label]) => (
                  <button key={id}
                    style={{ flex:1, padding:'10px', border:`2px solid ${payMethod===id?'#1a3a1c':'#ddd'}`, borderRadius:8, background:payMethod===id?'#e8f5e9':'#fff', color:payMethod===id?'#1a3a1c':'#555', fontWeight:payMethod===id?700:400, cursor:'pointer', fontSize:14 }}
                    onClick={() => setPayMethod(id)}>{label}
                  </button>
                ))}
              </div>
            </div>
            {/* Amount Paid */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#555', marginBottom:6 }}>Amount Received (₹)</div>
              <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                style={{ width:'100%', padding:'10px 12px', border:'1.5px solid #ddd', borderRadius:8, fontSize:16, outline:'none' }} />
              {parseFloat(amountPaid) > subtotal && (
                <div style={{ marginTop:6, fontSize:13, color:'#1a3a1c', fontWeight:600 }}>
                  Change: ₹{(parseFloat(amountPaid) - subtotal).toFixed(2)}
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button style={{ flex:1, padding:'10px', border:'1px solid #ddd', borderRadius:8, background:'#fff', cursor:'pointer', fontSize:14 }} onClick={() => setShowBillModal(false)}>Cancel</button>
              <button style={{ flex:2, padding:'10px', background:'linear-gradient(135deg,#1a3a1c,#2d6a30)', color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:14, cursor:'pointer' }} onClick={generateBill}>
                🖨️ Print & Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  page: { padding:'16px', minHeight:'100vh', background:'#f8f9fa' },
  header: { marginBottom:'20px' },
  title: { fontSize:'20px', fontWeight:'600', color:'#1a1a1a', margin:0 },
  sub: { color:'#888', marginTop:'4px', fontSize:'13px' },
  loading: { textAlign:'center', padding:'20px', color:'#666' },
  empty: { textAlign:'center', padding:'40px', color:'#aaa', gridColumn:'1/-1' },
  tableGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:'12px' },
  tableCard: { background:'#fff', borderRadius:'12px', padding:'16px', textAlign:'center', cursor:'pointer', border:'2px solid #e8f5e9', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', WebkitTapHighlightColor:'transparent' },
  tableIcon: { fontSize:'28px', marginBottom:'6px' },
  tableName: { fontSize:'16px', fontWeight:'600', color:'#1a1a1a' },
  tableSub: { fontSize:'11px', color:'#888', marginTop:'4px' },
  surcharge: { fontSize:'10px', color:'#f59e0b', marginTop:'4px' },
  freeTag: { display:'inline-block', background:'#e8f5e9', color:'#2e7d32', fontSize:'11px', fontWeight:'600', padding:'2px 10px', borderRadius:'20px', marginTop:'6px' },
  orderPage: { display:'flex', flexDirection:'column', minHeight:'100vh', background:'#f8f9fa' },
  left: { background:'#fff', borderBottom:'1px solid #eee', display:'flex', flexDirection:'column', padding:'12px' },
  orderHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' },
  orderNum: { fontSize:'15px', fontWeight:'600', color:'#1a1a1a' },
  orderSub: { fontSize:'12px', color:'#888' },
  doneBtn: { background:'#4caf50', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 20px', cursor:'pointer', fontWeight:'600', fontSize:'15px', minHeight:'44px' },
  custBox: { background:'#f8f9fa', borderRadius:'8px', padding:'10px', marginBottom:'10px' },
  custRow: { display:'flex', gap:'8px' },
  phoneInput: { flex:1, padding:'10px 12px', border:'1px solid #ddd', borderRadius:'6px', fontSize:'16px', minHeight:'44px' },
  searchBtn: { background:'#6366f1', color:'#fff', border:'none', borderRadius:'6px', padding:'10px 14px', cursor:'pointer', minHeight:'44px', fontSize:'14px' },
  custFound: { marginTop:'8px', fontSize:'13px', color:'#2e7d32' },
  custForm: { marginTop:'8px', display:'flex', flexDirection:'column', gap:'6px' },
  inp: { padding:'10px', border:'1px solid #ddd', borderRadius:'6px', fontSize:'16px', minHeight:'44px' },
  saveBtn: { background:'#4caf50', color:'#fff', border:'none', borderRadius:'6px', padding:'10px', cursor:'pointer', fontWeight:'600', minHeight:'44px' },
  cartList: { maxHeight:'200px', overflowY:'auto', marginBottom:'10px' },
  emptyCart: { textAlign:'center', padding:'20px', color:'#aaa', fontSize:'13px' },
  cartItem: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f5f5f5' },
  cartName: { flex:1, fontSize:'13px', color:'#1a1a1a' },
  cartQtyRow: { display:'flex', alignItems:'center', gap:'8px' },
  qtyBtn: { width:'32px', height:'32px', borderRadius:'50%', border:'1px solid #ddd', background:'#fff', cursor:'pointer', fontSize:'18px', display:'flex', alignItems:'center', justifyContent:'center', minWidth:'32px' },
  qty: { fontSize:'14px', fontWeight:'600', minWidth:'20px', textAlign:'center' },
  cartPrice: { fontSize:'13px', fontWeight:'600', color:'#1a1a1a', marginLeft:'8px', minWidth:'60px', textAlign:'right' },
  total: { display:'flex', justifyContent:'space-between', padding:'10px 0', borderTop:'2px solid #eee', fontWeight:'600', fontSize:'15px' },
  right: { flex:1, display:'flex', flexDirection:'column', padding:'12px', overflow:'hidden' },
  searchBox: { padding:'10px 16px', border:'1px solid #ddd', borderRadius:'8px', fontSize:'16px', marginBottom:'10px', width:'100%', boxSizing:'border-box', minHeight:'44px' },
  catRow: { display:'flex', gap:'8px', marginBottom:'12px', overflowX:'auto', paddingBottom:'4px', WebkitOverflowScrolling:'touch' },
  cat: { padding:'8px 16px', borderRadius:'20px', border:'1px solid #ddd', background:'#fff', cursor:'pointer', fontSize:'13px', whiteSpace:'nowrap', minHeight:'36px' },
  catActive: { padding:'8px 16px', borderRadius:'20px', border:'none', background:'#4caf50', color:'#fff', cursor:'pointer', fontSize:'13px', fontWeight:'600', whiteSpace:'nowrap', minHeight:'36px' },
  menuGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))', gap:'10px', overflowY:'auto', flex:1, paddingBottom:'16px' },
  menuCard: { background:'#fff', borderRadius:'10px', padding:'10px', textAlign:'center', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', display:'flex', flexDirection:'column', alignItems:'center' },
  menuImg: { width:'100%', height:'80px', objectFit:'cover', borderRadius:'8px', marginBottom:'6px', display:'block' },
  menuImgPlaceholder: { width:'100%', height:'80px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'28px', background:'#f5f5f5', borderRadius:'8px', marginBottom:'6px' },
  menuName: { fontSize:'12px', fontWeight:'500', color:'#1a1a1a', marginBottom:'4px' },
  menuPrice: { fontSize:'13px', fontWeight:'600', color:'#4caf50', marginBottom:'6px' },
  addBtn: { background:'#4caf50', color:'#fff', border:'none', borderRadius:'6px', padding:'8px 12px', cursor:'pointer', fontWeight:'600', fontSize:'13px', width:'100%', minHeight:'36px' },
};
