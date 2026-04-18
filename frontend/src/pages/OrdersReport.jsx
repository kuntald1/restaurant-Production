import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/useApp';
import { posOrderAPI, posKotAPI, posBillAPI, paymentTransactionAPI } from '../services/api';
import { Spinner } from '../components/UI';

const STATUS_META = {
  draft:           { bg:'#f3f4f6', color:'#374151', label:'Draft' },
  kot_open:        { bg:'#fef3c7', color:'#92400e', label:'KOT Open' },
  kot_inprocess:   { bg:'#dbeafe', color:'#1e40af', label:'In Kitchen' },
  ready:           { bg:'#d1fae5', color:'#065f46', label:'Ready' },
  billed:          { bg:'#ede9fe', color:'#5b21b6', label:'Billed' },
  cancelled:       { bg:'#fee2e2', color:'#991b1b', label:'Cancelled' },
  picked_up:       { bg:'#d1fae5', color:'#065f46', label:'Picked Up' },
};

const TYPE_META = {
  dine_in:    { icon:'🪑', label:'Dine In' },
  take_away:  { icon:'🥡', label:'Take Away' },
  delivery:   { icon:'🛵', label:'Delivery' },
};

const fmt = (n) => `₹${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2})}`;

const today  = ()   => new Date().toISOString().slice(0,10);
const nAgo   = (n)  => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };

export default function OrdersReport() {
  const { selectedCompany, allCompanies, user } = useApp();
  const isSuperAdmin = user?.is_super_admin === true;
  const userCid      = user?.company_unique_id;
  const [orders,    setOrders]    = useState([]);
  const [expanded,  setExpanded]  = useState(null); // order_id
  const [detail,    setDetail]    = useState({});   // order_id → { kots, bill }
  const [loading,   setLoading]   = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType,   setFilterType]   = useState('all');
  const [search,   setSearch]     = useState('');
  const [companyId, setCompanyId] = useState(() => selectedCompany?.company_unique_id || 'all');
  const [quickFilter, setQuickFilter] = useState('Today');
  const [fromDate,  setFromDate]  = useState(today());
  const [toDate,    setToDate]    = useState(today());

  // Build company list — Admin only sees own company + children
  const allCo     = allCompanies || [];
  const companies = isSuperAdmin
    ? allCo
    : allCo.filter(c => c.company_unique_id === userCid || c.parant_company_unique_id === userCid);
  const parents   = companies.filter(c => !c.parant_company_unique_id);
  const children  = companies.filter(c =>  c.parant_company_unique_id);
  const tree      = parents.map(p => ({ ...p, children: children.filter(c => c.parant_company_unique_id === p.company_unique_id) }));

  const scopeIds = companyId === 'all'
    ? companies.map(c => c.company_unique_id)
    : [parseInt(companyId), ...children.filter(c => c.parant_company_unique_id === parseInt(companyId)).map(c => c.company_unique_id)];

  // Scan ALL orders in batches of 5 — stops after 5 consecutive misses
  const load = useCallback(async () => {
    setLoading(true); setOrders([]);
    const all = [];
    const seen = new Set();
    let misses = 0;

    for (let id = 1; id <= 2000 && misses < 5; id += 5) {
      const ids   = [id, id+1, id+2, id+3, id+4];
      const batch = await Promise.allSettled(ids.map(i => posOrderAPI.getById(i)));
      let hit = false;
      batch.forEach(r => {
        if (r.status === 'fulfilled' && r.value?.order_id) {
          const o = r.value;
          if (!seen.has(o.order_id) && (scopeIds.includes(o.company_unique_id) || companyId === 'all')) {
            seen.add(o.order_id);
            all.push(o);
            hit = true; misses = 0;
          }
        }
      });
      if (!hit) misses++;
    }

    all.sort((a, b) => (b.created_at||'').localeCompare(a.created_at||''));
    setOrders(all);
    setLoading(false);
  }, [companyId, allCompanies]);

  // Fast load: running orders only
  const loadFast = useCallback(async () => {
    setLoading(true); setOrders([]);
    const all = [];
    const seen = new Set();
    const cids = companyId === 'all' ? (allCompanies||[]).map(c=>c.company_unique_id) : scopeIds;
    for (const cid of cids) {
      try {
        const running = await posOrderAPI.getRunning(cid);
        if (Array.isArray(running)) running.forEach(o => { if (!seen.has(o.order_id)) { seen.add(o.order_id); all.push(o); } });
      } catch {}
    }
    all.sort((a, b) => (b.created_at||'').localeCompare(a.created_at||''));
    setOrders(all);
    setLoading(false);
  }, [companyId, allCompanies]);

  useEffect(() => { load(); }, [companyId]);

  const loadDetail = async (orderId) => {
    if (detail[orderId]) { setExpanded(expanded === orderId ? null : orderId); return; }
    setExpanded(orderId);
    setDetailLoading(true);
    try {
      const [kots, bill, fullOrder] = await Promise.allSettled([
        posKotAPI.getByOrder(orderId),
        posBillAPI.getByOrder(orderId),
        posOrderAPI.getById(orderId),
      ]);
      const billData = bill.status === 'fulfilled' ? bill.value : null;
      // Load payment transactions from backend
      let transactions = [];
      try {
        // Try by order_id first (always available)
        transactions = await paymentTransactionAPI.getByOrder(orderId);
      } catch {}
      // Also try by bill_id if we have a bill
      if (!transactions.length && billData?.bill_id) {
        try { transactions = await paymentTransactionAPI.getByBill(billData.bill_id); } catch {}
      }
      setDetail(prev => ({
        ...prev,
        [orderId]: {
          kots:         kots.status      === 'fulfilled' ? (kots.value || []) : [],
          bill:         billData,
          fullOrder:    fullOrder.status  === 'fulfilled' ? fullOrder.value    : null,
          transactions,
        }
      }));
    } catch {}
    setDetailLoading(false);
  };

  // Filter
  const filtered = orders.filter(o => {
    if (filterStatus !== 'all' && o.order_status !== filterStatus) return false;
    if (filterType   !== 'all' && o.order_type   !== filterType)   return false;
    // Date filter
    const d = (o.created_at||o.order_placed_at||'').slice(0,10);
    if (d && (d < fromDate || d > toDate)) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(o.order_number||'').toLowerCase().includes(s) &&
          !(o.table_name||'').toLowerCase().includes(s) &&
          !(o.customer_name||'').toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const counts = {};
  orders.forEach(o => { counts[o.order_status] = (counts[o.order_status]||0)+1; });

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.topBar}>
        <div>
          <div style={S.title}>📋 All Orders</div>
          <div style={S.sub}>Full order history with KOTs and bills</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button style={S.btn} onClick={load} disabled={loading} title="Scan all order IDs">🔍 Full Scan</button>
          <button style={S.btn} onClick={loadFast} disabled={loading}>🔄 Refresh</button>
        </div>
      </div>

      {/* Filters */}
      <div style={S.filterBar}>
        <input style={S.search} placeholder="🔍  Search order, table, customer…"
          value={search} onChange={e => setSearch(e.target.value)} />

        <select style={S.sel} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          {Object.entries(STATUS_META).map(([k,v]) => (
            <option key={k} value={k}>{v.label} {counts[k] ? `(${counts[k]})` : ''}</option>
          ))}
        </select>

        <select style={S.sel} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          {Object.entries(TYPE_META).map(([k,v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>

        <select style={S.sel} value={companyId} onChange={e => setCompanyId(e.target.value)}>
          <option value="all">{isSuperAdmin ? "All Companies" : "My Companies"}</option>
          {tree.map(p => (
            <optgroup key={p.company_unique_id} label={p.name}>
              <option value={p.company_unique_id}>{p.name}</option>
              {p.children.map(c => <option key={c.company_unique_id} value={c.company_unique_id}>&nbsp;&nbsp;↳ {c.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Date Quick Filter */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 32px', background:'var(--bg)', borderBottom:'1px solid var(--border)', flexWrap:'wrap' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.05em' }}>Date:</span>
        <div style={{ display:'flex', gap:6 }}>
          {[['Today',today(),today()],['7d',nAgo(7),today()],['30d',nAgo(30),today()],['All','2000-01-01',today()]].map(([l,f,t])=>(
            <button key={l}
              style={{ padding:'5px 12px', border:`1.5px solid ${quickFilter===l?'var(--primary)':'var(--border)'}`, borderRadius:6, background: quickFilter===l?'var(--primary)':'var(--white)', color: quickFilter===l?'#fff':'var(--text-2)', fontSize:12, cursor:'pointer', fontWeight: quickFilter===l?700:500 }}
              onClick={()=>{ setQuickFilter(l); setFromDate(f); setToDate(t); }}>
              {l}
            </button>
          ))}
        </div>
        <input type="date" value={fromDate} onChange={e=>{setFromDate(e.target.value);setQuickFilter('');}}
          style={{ padding:'5px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:12, fontFamily:'inherit', outline:'none', background:'var(--white)' }} />
        <span style={{ fontSize:12, color:'var(--text-3)' }}>→</span>
        <input type="date" value={toDate} onChange={e=>{setToDate(e.target.value);setQuickFilter('');}}
          style={{ padding:'5px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:12, fontFamily:'inherit', outline:'none', background:'var(--white)' }} />
        <span style={{ fontSize:12, color:'var(--text-3)', marginLeft:4 }}>{filtered.length} order{filtered.length!==1?'s':''}</span>
      </div>

      {/* Summary pills */}
      <div style={S.pills}>
        {Object.entries(STATUS_META).map(([k, v]) => counts[k] ? (
          <div key={k} style={{ ...S.pill, background: v.bg, color: v.color,
            cursor:'pointer', outline: filterStatus === k ? `2px solid ${v.color}` : 'none' }}
            onClick={() => setFilterStatus(filterStatus===k?'all':k)}>
            {v.label} <strong>{counts[k]}</strong>
          </div>
        ) : null)}
        <div style={{ ...S.pill, background:'#f3f4f6', color:'#374151' }}>
          Total <strong>{orders.length}</strong>
        </div>
      </div>

      {loading ? <div style={{padding:40}}><Spinner/></div> : filtered.length === 0 ? (
        <div style={S.empty}>
          <div style={{fontSize:44,marginBottom:12}}>📋</div>
          <div style={{fontWeight:600,fontSize:16}}>{orders.length === 0 ? 'No orders loaded' : 'No orders match filters'}</div>
          <div style={{color:'var(--text-3)',marginTop:6,fontSize:13}}>
            {orders.length === 0 ? 'Click Refresh to load running orders, or Full Scan for all historical orders' : 'Try clearing the filters'}
          </div>
        </div>
      ) : (
        <div style={S.list}>
          {filtered.map(order => {
            const sm   = STATUS_META[order.order_status] || STATUS_META.draft;
            const tm   = TYPE_META[order.order_type]     || TYPE_META.dine_in;
            const isEx = expanded === order.order_id;
            const det  = detail[order.order_id];
            const items= order.order_items || order.items || [];

            return (
              <div key={order.order_id} style={{ ...S.orderCard, ...(isEx ? S.orderCardOpen : {}) }}>
                {/* Order header row */}
                <div style={S.orderRow} onClick={() => loadDetail(order.order_id)}>
                  <div style={S.orderLeft}>
                    <div style={{ ...S.statusDot, background: sm.color }}/>
                    <div>
                      <div style={S.orderNum}>{order.order_number || `#${order.order_id}`}</div>
                      <div style={S.orderMeta}>
                        {tm.icon} {order.table_name || tm.label}
                        {order.customer_name && <> · {order.customer_name}</>}
                        {order.covers        && <> · {order.covers} covers</>}
                      </div>
                    </div>
                  </div>
                  <div style={S.orderMiddle}>
                    <span style={{ ...S.badge, background: sm.bg, color: sm.color }}>{sm.label}</span>
                    <span style={{ ...S.badge, background:'#f3f4f6', color:'#374151' }}>{order.order_type?.replace(/_/g,' ')}</span>
                  </div>
                  <div style={S.orderRight}>
                    <div style={S.orderAmt}>
                      {order.order_items?.length || order.item_count || 0} items
                    </div>
                    <div style={{fontSize:11,color:'var(--text-3)'}}>
                      {order.created_at ? new Date(order.created_at).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'}) : ''}
                    </div>
                  </div>
                  <div style={S.chevron}>{isEx ? '▲' : '▼'}</div>
                </div>

                {/* Expanded detail */}
                {isEx && (
                  <div style={S.detail}>
                    {detailLoading && !det ? <div style={{padding:'16px',color:'var(--text-3)'}}>Loading details…</div> : det ? (
                      <>
                        {/* Items */}
                        <div style={S.section}>
                          <div style={S.sectionTitle}>ORDER ITEMS</div>
                          {(det.fullOrder?.order_items || items).length === 0 ? (
                            <div style={{color:'var(--text-3)',fontSize:13}}>No items</div>
                          ) : (
                            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                              <thead><tr>
                                {['Item','Rate','Qty','Total','Status','Note'].map(h=>(
                                  <th key={h} style={{padding:'6px 10px',textAlign:h==='Rate'||h==='Qty'||h==='Total'?'right':'left',fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',borderBottom:'1px solid var(--border)'}}>{h}</th>
                                ))}
                              </tr></thead>
                              <tbody>
                                {(det.fullOrder?.order_items || items).map((it,i) => (
                                  <tr key={i} style={{borderBottom:'1px solid var(--border-light)',opacity:it.is_cancelled?0.4:1}}>
                                    <td style={{padding:'7px 10px'}}>
                                      {it.is_veg===false?'🔴':'🟢'} {it.item_name||it.name}
                                      {it.is_cancelled && <span style={{fontSize:10,color:'#dc2626',marginLeft:6}}>CANCELLED</span>}
                                    </td>
                                    <td style={{padding:'7px 10px',textAlign:'right'}}>₹{Number(it.unit_price||it.price||0).toFixed(2)}</td>
                                    <td style={{padding:'7px 10px',textAlign:'right'}}>{it.quantity}</td>
                                    <td style={{padding:'7px 10px',textAlign:'right',fontWeight:600}}>₹{Number(it.total_price||0).toFixed(2)}</td>
                                    <td style={{padding:'7px 10px'}}>
                                      <span style={{fontSize:11,background:'#f3f4f6',color:'#555',padding:'2px 7px',borderRadius:8}}>{it.kot_item_status||'—'}</span>
                                    </td>
                                    <td style={{padding:'7px 10px'}}>
                                      {it.notes
                                        ? <span style={{fontSize:11,color:'#92400e',background:'#fef3c7',padding:'2px 8px',borderRadius:8,display:'inline-flex',alignItems:'center',gap:3}}><span>📝</span>{it.notes}</span>
                                        : <span style={{color:'var(--text-3)',fontSize:11}}>—</span>
                                      }
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                        {/* Payment Transactions */}
                        {det.transactions?.length > 0 && (
                          <div style={S.section}>
                            <div style={S.sectionTitle}>PAYMENT HISTORY ({det.transactions.length})</div>
                            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                              {det.transactions.map((t, i) => (
                                <div key={i} style={{
                                  background: t.status==='success' ? '#f0fdf4' : '#fff0f0',
                                  border: `1px solid ${t.status==='success' ? '#bbf7d0' : '#fecaca'}`,
                                  borderRadius:8, padding:'10px 14px', fontSize:13,
                                }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                      <span style={{ fontSize:16 }}>{t.status==='success' ? '✅' : '❌'}</span>
                                      <span style={{ fontWeight:700, color: t.status==='success' ? '#166534' : '#991b1b', textTransform:'uppercase' }}>
                                        {t.status}
                                      </span>
                                      <span style={{ background:'#e0e7ff', color:'#3730a3', fontSize:11, fontWeight:600, padding:'1px 8px', borderRadius:10 }}>
                                        {(t.method || 'upi').toUpperCase()}
                                      </span>
                                    </div>
                                    <span style={{ fontWeight:700, color:'var(--text-1)' }}>₹{Number(t.amount||0).toFixed(2)}</span>
                                  </div>
                                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 16px', fontSize:12, color:'var(--text-3)' }}>
                                    {t.razorpay_payment_id && <div>Payment ID: <strong style={{ color:'var(--text-1)' }}>{t.razorpay_payment_id}</strong></div>}
                                    {t.razorpay_order_id   && <div>Razorpay Order: <strong style={{ color:'var(--text-1)' }}>{t.razorpay_order_id}</strong></div>}
                                    {t.timestamp && <div>Time: {new Date(t.timestamp).toLocaleString('en-IN')}</div>}
                                    {t.currency  && <div>Currency: {t.currency}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* KOTs */}
                        {det.kots?.length > 0 && (
                          <div style={S.section}>
                            <div style={S.sectionTitle}>KOTS ({det.kots.length})</div>
                            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                              {det.kots.map(k => {
                                const ks = STATUS_META[k.kot_status]||STATUS_META.draft;
                                return (
                                  <div key={k.kot_id} style={{background:ks.bg,border:`1px solid ${ks.color}40`,borderRadius:8,padding:'8px 12px',minWidth:140}}>
                                    <div style={{fontWeight:700,color:ks.color,fontSize:13}}>{k.kot_number}</div>
                                    <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>{ks.label} · Prints: {k.print_count}</div>
                                    <div style={{fontSize:11,color:'var(--text-3)'}}>{k.kot_items?.length||0} items</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Bill */}
                        {det.bill && (
                          <div style={S.section}>
                            <div style={S.sectionTitle}>BILL</div>
                            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px 16px',fontSize:13}}>
                              {[
                                ['Bill No',   det.bill.bill_number],
                                ['Payment',   (det.bill.payment_method||'—').toUpperCase()],
                                ['Subtotal',  fmt(det.bill.subtotal)],
                                ...(Number(det.bill.discount_amount||0) > 0 ? [['Discount', `-${fmt(det.bill.discount_amount)}`]] : []),
                                ...(Number(det.bill.promo_amount||0) > 0 ? [[`🏷️ Promo${det.bill.promo_code?' ('+det.bill.promo_code+')':''}`, `-${fmt(det.bill.promo_amount)}`]] : []),
                                ...(Number(det.bill.discount_amount||0)===0 && Number(det.bill.promo_amount||0)===0 && Number(det.bill.discount_amount||0)>0 ? [['Discount', `-${fmt(det.bill.discount_amount)}`]] : []),
                                ...(Number(det.bill.service_charge||det.bill.table_surcharge_amount||0) > 0
                                  ? [['Surcharge', `+${fmt(det.bill.service_charge||det.bill.table_surcharge_amount)}`]]
                                  : []),
                                ['Tax',       fmt(det.bill.tax_amount)],
                                ...(Number(det.bill.sgst_amount||0) > 0 ? [['SGST', `+${fmt(det.bill.sgst_amount)}`]] : []),
                                ...(Number(det.bill.cgst_amount||0) > 0 ? [['CGST', `+${fmt(det.bill.cgst_amount)}`]] : []),
                                ['Total', (() => {
                                  const s   = Number(det.bill.subtotal||0);
                                  const d   = Number(det.bill.discount_amount||0);
                                  const p   = Number(det.bill.promo_amount||0);
                                  const sur = Number(det.bill.service_charge||det.bill.table_surcharge_amount||0);
                                  const tax = Number(det.bill.tax_amount||0);
                                  const sg  = Number(det.bill.sgst_amount||0);
                                  const cg  = Number(det.bill.cgst_amount||0);
                                  return fmt(Math.round(Number(det.bill.total_payable||0)));
                                })()],
                                ['Paid At',   det.bill.paid_at ? new Date(det.bill.paid_at).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'}) : '—'],
                                ['Prints',    det.bill.print_count],
                              ].map(([k,v]) => (
                                <div key={k} style={{padding:'6px 0',borderBottom:'1px solid var(--border-light)'}}>
                                  <div style={{fontSize:10,color: k==='SGST'||k==='CGST'?'#1e40af':'var(--text-3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em'}}>{k}</div>
                                  <div style={{fontSize:13,fontWeight:k==='Total'?700:400,color:k==='Total'?'var(--primary)':k==='SGST'||k==='CGST'?'#1e40af':'var(--text-1)',marginTop:2}}>{v}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : <div style={{padding:'16px',color:'var(--text-3)'}}>Click again to load details</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const S = {
  page:      { fontFamily:'var(--font-sans)' },
  topBar:    { display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 32px',borderBottom:'1px solid var(--border)' },
  title:     { fontSize:20,fontWeight:700,color:'var(--text-1)' },
  sub:       { fontSize:12,color:'var(--text-3)',marginTop:2 },
  btn:       { padding:'7px 14px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,fontSize:12,cursor:'pointer',fontWeight:500 },
  filterBar: { display:'flex',alignItems:'center',gap:10,padding:'12px 32px',background:'var(--bg)',borderBottom:'1px solid var(--border)',flexWrap:'wrap' },
  search:    { flex:1,minWidth:200,padding:'8px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none' },
  sel:       { padding:'7px 10px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'var(--white)' },
  pills:     { display:'flex',gap:7,padding:'10px 32px',flexWrap:'wrap',borderBottom:'1px solid var(--border-light)' },
  pill:      { fontSize:12,padding:'3px 10px',borderRadius:20,display:'flex',gap:5,alignItems:'center' },
  list:      { padding:'16px 32px',display:'flex',flexDirection:'column',gap:8 },
  orderCard: { background:'var(--white)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden' },
  orderCardOpen: { border:'1px solid var(--primary)',boxShadow:'0 2px 12px rgba(22,163,74,.08)' },
  orderRow:  { display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer',userSelect:'none' },
  orderLeft: { flex:2,display:'flex',alignItems:'center',gap:10,minWidth:0 },
  statusDot: { width:9,height:9,borderRadius:'50%',flexShrink:0 },
  orderNum:  { fontSize:14,fontWeight:700,color:'var(--text-1)' },
  orderMeta: { fontSize:12,color:'var(--text-3)',marginTop:2 },
  orderMiddle:{ flex:1,display:'flex',gap:6,flexWrap:'wrap' },
  orderRight:{ textAlign:'right',flexShrink:0 },
  orderAmt:  { fontSize:13,fontWeight:600,color:'var(--text-1)' },
  badge:     { fontSize:11,fontWeight:600,padding:'2px 9px',borderRadius:20 },
  chevron:   { fontSize:12,color:'var(--text-3)',flexShrink:0,width:20,textAlign:'center' },
  detail:    { borderTop:'1px solid var(--border)',padding:'16px 20px',background:'var(--bg)',display:'flex',flexDirection:'column',gap:16 },
  section:   { },
  sectionTitle:{ fontSize:10,fontWeight:700,color:'var(--text-3)',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:8 },
  empty:     { padding:'60px',textAlign:'center',color:'var(--text-3)' },
};
