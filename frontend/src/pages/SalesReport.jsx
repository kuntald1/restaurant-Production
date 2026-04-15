import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/useApp';
import { posBillAPI, posOrderAPI, posKotAPI, paymentTransactionAPI } from '../services/api';
import { Spinner } from '../components/UI';

const fmt    = (n)  => `₹${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const today  = ()   => new Date().toISOString().slice(0,10);
const nAgo   = (n)  => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };

function buildTree(companies) {
  const parents  = (companies||[]).filter(c => !c.parant_company_unique_id);
  const children = (companies||[]).filter(c =>  c.parant_company_unique_id);
  return parents.map(p => ({ ...p, children: children.filter(c => c.parant_company_unique_id === p.company_unique_id) }));
}

export default function SalesReport() {
  const { allCompanies, user } = useApp();
  const isSuperAdmin = user?.is_super_admin === true;
  const isAdmin      = user?.is_admin      === true;
  const userCid      = user?.company_unique_id;
  const [quickFilter, setQuickFilter] = useState('Today');
  const [fromDate,  setFromDate]  = useState(today());
  const [toDate,    setToDate]    = useState(today());
  const [companyId, setCompanyId] = useState('all');
  const [bills,     setBills]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [fetchNote, setFetchNote] = useState('');
  const [selectedBill, setSelectedBill] = useState(null); // bill detail modal
  const [billDetail,   setBillDetail]   = useState(null); // { bill, order, kots }

  // Admin only sees their own company + its children
  const visibleCompanies = isSuperAdmin
    ? (allCompanies || [])
    : (allCompanies || []).filter(c =>
        c.company_unique_id === userCid ||
        c.parant_company_unique_id === userCid
      );
  const tree = buildTree(visibleCompanies);

  const companiesInScope = companyId === 'all'
    ? visibleCompanies
    : visibleCompanies.filter(c =>
        c.company_unique_id === parseInt(companyId) ||
        c.parant_company_unique_id === parseInt(companyId)
      );

  const load = useCallback(async () => {
    if (!allCompanies?.length) { setFetchNote('No companies loaded. Please log in again.'); return; }
    setLoading(true); setBills([]); setFetchNote('');

    // Build a map of company_unique_id → company name for lookup
    const companyMap = {};
    (allCompanies||[]).forEach(c => { companyMap[c.company_unique_id] = c.name; });

    const allBills = [];
    const seenIds  = new Set(); // deduplicate by bill_id

    // Strategy 1: try GET /pos/bill/company/{cid} for the primary company scope
    const primaryCid = companyId === 'all'
      ? (allCompanies[0]?.company_unique_id)
      : parseInt(companyId);

    try {
      const res = await posBillAPI.getAll(primaryCid);
      if (Array.isArray(res) && res.length > 0) {
        res.forEach(b => {
          if (!seenIds.has(b.bill_id)) {
            seenIds.add(b.bill_id);
            allBills.push({ ...b, company_name: companyMap[b.company_unique_id] || b.company_unique_id });
          }
        });
        setBills(allBills);
        setLoading(false);
        return;
      }
    } catch {}

    // Strategy 2: scan bill IDs once (not per company) — batch 5 at a time, stop on 3 misses
    let misses = 0;
    for (let id = 1; id <= 500 && misses < 3; id += 5) {
      const ids   = [id, id+1, id+2, id+3, id+4];
      const batch = await Promise.allSettled(ids.map(i => posBillAPI.getById(i)));
      let hit = false;
      batch.forEach(r => {
        if (r.status === 'fulfilled' && r.value?.bill_id) {
          const b = r.value;
          // Filter by scope
          const inScope = companyId === 'all' || b.company_unique_id === parseInt(companyId) ||
            (allCompanies||[]).find(c => c.company_unique_id === b.company_unique_id && c.parant_company_unique_id === parseInt(companyId));
          if (inScope && !seenIds.has(b.bill_id)) {
            seenIds.add(b.bill_id);
            allBills.push({ ...b, company_name: companyMap[b.company_unique_id] || `Company ${b.company_unique_id}` });
            hit = true; misses = 0;
          }
        }
      });
      if (!hit) misses++;
    }

    if (allBills.length === 0) {
      setFetchNote('No bills found. Add GET /pos/bill/company/{id} endpoint to your backend for instant loading.');
    }
    setBills(allBills);
    setLoading(false);
  }, [companyId, allCompanies]);

  useEffect(() => { load(); }, [companyId]);

  // Date filter
  const filtered = bills.filter(b => {
    const d = (b.created_at||b.bill_date||'').slice(0,10);
    return (!d || (d >= fromDate && d <= toDate));
  });

  const totalRevenue  = filtered.reduce((s,b)=>s+Number(b.total_payable||b.amount_paid||b.total_amount||0),0);
  const totalDiscount = filtered.reduce((s,b)=>s+Number(b.discount_amount||0),0);
  const totalTax      = filtered.reduce((s,b)=>s+Number(b.tax_amount||0),0);
  const totalSgst     = filtered.reduce((s,b)=>s+Number(b.sgst_amount||0),0);
  const totalCgst     = filtered.reduce((s,b)=>s+Number(b.cgst_amount||0),0);
  const avgOrder      = filtered.length ? totalRevenue/filtered.length : 0;

  const byCompany = {};
  filtered.forEach(b=>{
    const k = b.company_id;
    if(!byCompany[k]) byCompany[k]={name:b.company_name,revenue:0,orders:0};
    byCompany[k].revenue+=Number(b.total_payable||b.amount_paid||b.total_amount||0);
    byCompany[k].orders++;
  });

  const byPayment = {};
  filtered.forEach(b=>{
    const m=(b.payment_method||'CASH').toUpperCase();
    byPayment[m]=(byPayment[m]||0)+Number(b.total_payable||b.amount_paid||b.total_amount||0);
  });

  const byDay = {};
  filtered.forEach(b=>{
    const d=(b.created_at||'').slice(0,10); if(!d) return;
    if(!byDay[d]) byDay[d]={date:d,revenue:0,orders:0};
    byDay[d].revenue+=Number(b.total_payable||b.amount_paid||b.total_amount||0);
    byDay[d].orders++;
  });
  const days   = Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date));
  const maxRev = Math.max(...days.map(d=>d.revenue),1);

  const STATS = [
    { label:'Total Revenue',  value:fmt(totalRevenue),  icon:'💰', accent:'#3d7a3d', bg:'#e8f5e0' },
    { label:'Total Bills',    value:filtered.length,    icon:'🧾', accent:'#1a5ea8', bg:'#e3f0ff' },
    { label:'Average Bill',   value:fmt(avgOrder),      icon:'📈', accent:'#a06020', bg:'#fff3e0' },
    { label:'Total Discount', value:fmt(totalDiscount), icon:'🏷️', accent:'#7030a0', bg:'#f3e8ff' },
    { label:'Total Tax',      value:fmt(totalTax),      icon:'📋', accent:'#555',    bg:'#f5f5f5' },
    ...(totalSgst > 0 ? [{ label:'Total SGST', value:fmt(totalSgst), icon:'🟦', accent:'#1e40af', bg:'#eff6ff' }] : []),
    ...(totalCgst > 0 ? [{ label:'Total CGST', value:fmt(totalCgst), icon:'🟦', accent:'#1e40af', bg:'#eff6ff' }] : []),
  ];

  const openBillDetail = async (bill) => {
    setSelectedBill(bill);
    setBillDetail(null);
    try {
      const [order, kots, freshBill] = await Promise.allSettled([
        posOrderAPI.getById(bill.order_id),
        posKotAPI.getByOrder(bill.order_id),
        posBillAPI.getById(bill.bill_id),
      ]);
      // Load payment transactions from backend
      let transactions = [];
      try {
        transactions = await paymentTransactionAPI.getByOrder(bill.order_id);
      } catch {}
      if (!transactions.length && bill.bill_id) {
        try { transactions = await paymentTransactionAPI.getByBill(bill.bill_id); } catch {}
      }
      setBillDetail({
        order:        order.status    === 'fulfilled' ? order.value    : null,
        kots:         kots.status     === 'fulfilled' ? kots.value     : [],
        bill:         freshBill.status === 'fulfilled' ? freshBill.value : bill,
        transactions,
      });
    } catch {}
  };

  const fmt2 = (n) => `₹${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.topBar}>
        <div>
          <div style={S.pageTitle}>📊 Sales Report</div>
          <div style={S.pageSub}>Revenue & billing summary</div>
        </div>
        <button style={S.btn} onClick={load} disabled={loading}>{loading?'⏳ Loading…':'🔄 Refresh'}</button>
      </div>

      {/* Filters */}
      <div style={S.filterBar}>
        <div style={S.fg}><label style={S.fl}>From</label>
          <input style={S.fi} type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/>
        </div>
        <div style={S.fg}><label style={S.fl}>To</label>
          <input style={S.fi} type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/>
        </div>
        <div style={S.fg}><label style={S.fl}>Company</label>
          <select style={{...S.fi,minWidth:200}} value={companyId} onChange={e=>setCompanyId(e.target.value)}>
            <option value="all">All Companies</option>
            {tree.map(p=>(
              <optgroup key={p.company_unique_id} label={p.name}>
                <option value={p.company_unique_id}>{p.name}{p.children.length?` (+ ${p.children.length} branch)`:''}</option>
                {p.children.map(c=><option key={c.company_unique_id} value={c.company_unique_id}>&nbsp;&nbsp;↳ {c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div style={S.fg}><label style={S.fl}>Quick</label>
          <div style={{display:'flex',gap:6}}>
            {[['Today',today(),today()],['7d',nAgo(7),today()],['30d',nAgo(30),today()],['90d',nAgo(90),today()]].map(([l,f,t])=>(
              <button key={l} style={{...S.qBtn,...(quickFilter===l?S.qBtnA:{})}}
                onClick={()=>{setQuickFilter(l);setFromDate(f);setToDate(t);}}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {loading ? <div style={{padding:40}}><Spinner/></div> : (
        <>
          {fetchNote && <div style={{margin:'0 32px 12px',padding:'10px 14px',background:'#fff8e0',border:'1px solid #f0d080',borderRadius:8,fontSize:13,color:'#7a5500'}}>{fetchNote}</div>}

          {/* Stats */}
          <div style={S.statsGrid}>
            {STATS.map(s=>(
              <div key={s.label} style={{...S.sc,borderTopColor:s.accent}}>
                <div style={{...S.si,background:s.bg}}>{s.icon}</div>
                <div style={{...S.sv,color:s.accent}}>{s.value}</div>
                <div style={S.sl}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={S.twoCol}>
            {/* Daily chart */}
            <div style={S.card}>
              <div style={S.ct}>Daily Revenue <span style={{fontSize:12,fontWeight:400,color:'#999'}}>({days.length} days)</span></div>
              {days.length===0 ? <div style={S.empty}>No data in selected period</div> : (
                <div style={{overflowX:'auto'}}>
                  <div style={{display:'flex',alignItems:'flex-end',gap:5,padding:'12px 0',minWidth:days.length*38}}>
                    {days.map(d=>(
                      <div key={d.date} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,flex:1,minWidth:32}}>
                        <div style={{fontSize:9,color:'#888',fontWeight:600,writingMode:'vertical-lr',transform:'rotate(180deg)',height:32,whiteSpace:'nowrap'}}>{fmt(d.revenue)}</div>
                        <div title={`${d.date}: ${fmt(d.revenue)} (${d.orders} orders)`}
                          style={{width:'80%',background:'var(--primary)',borderRadius:'3px 3px 0 0',height:Math.max(3,(d.revenue/maxRev)*120)}}/>
                        <div style={{fontSize:9,color:'#aaa'}}>{d.date.slice(5)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Payment breakdown */}
            <div style={S.card}>
              <div style={S.ct}>Payment Methods</div>
              {Object.keys(byPayment).length===0 ? <div style={S.empty}>No data</div> : (
                <div style={{display:'flex',flexDirection:'column',gap:12,padding:'8px 0'}}>
                  {Object.entries(byPayment).sort((a,b)=>b[1]-a[1]).map(([m,amt])=>{
                    const pct=totalRevenue?(amt/totalRevenue*100):0;
                    const clr={CASH:'#3d7a3d',UPI:'#1a5ea8',CARD:'#7030a0',ONLINE:'#a06020'}[m]||'#555';
                    return (
                      <div key={m}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{fontSize:13,fontWeight:600,color:'#333'}}>{m}</span>
                          <span style={{fontSize:13,color:'#555'}}>{fmt(amt)} ({pct.toFixed(1)}%)</span>
                        </div>
                        <div style={{background:'#eee',borderRadius:4,height:8}}>
                          <div style={{background:clr,borderRadius:4,height:8,width:`${pct}%`}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Company breakdown */}
          <div style={{...S.card,margin:'0 32px 16px'}}>
            <div style={S.ct}>Company Breakdown</div>
            {Object.keys(byCompany).length===0 ? <div style={S.empty}>No bills found — try refreshing or check the date range</div> : (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead><tr style={{background:'#f8f8f8'}}>
                  {['Company','Bills','Revenue','Avg/Bill','Share'].map(h=>(
                    <th key={h} style={{padding:'9px 12px',textAlign:h==='Company'?'left':'right',fontSize:11,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'.05em',borderBottom:'1px solid #e0e0e0'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {Object.values(byCompany).sort((a,b)=>b.revenue-a.revenue).map((co,i)=>{
                    const share=totalRevenue?(co.revenue/totalRevenue*100).toFixed(1):'0.0';
                    return (
                      <tr key={co.name} style={{borderBottom:'1px solid #f0f0f0',background:i%2?'#fafafa':'#fff'}}>
                        <td style={{padding:'10px 12px',fontWeight:600,color:'#222'}}>{co.name}</td>
                        <td style={{padding:'10px 12px',textAlign:'right',color:'#555'}}>{co.orders}</td>
                        <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:'#3d7a3d'}}>{fmt(co.revenue)}</td>
                        <td style={{padding:'10px 12px',textAlign:'right',color:'#555'}}>{fmt(co.orders?co.revenue/co.orders:0)}</td>
                        <td style={{padding:'10px 12px',textAlign:'right'}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,justifyContent:'flex-end'}}>
                            <div style={{background:'#e0f0e0',borderRadius:3,height:6,width:60}}>
                              <div style={{background:'#3d7a3d',borderRadius:3,height:6,width:`${share}%`}}/>
                            </div>
                            <span style={{color:'#888',fontSize:12,minWidth:36}}>{share}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr style={{background:'#f0f8f0',fontWeight:700}}>
                  <td style={{padding:'10px 12px',color:'#333'}}>TOTAL</td>
                  <td style={{padding:'10px 12px',textAlign:'right',color:'#333'}}>{filtered.length}</td>
                  <td style={{padding:'10px 12px',textAlign:'right',color:'#3d7a3d'}}>{fmt(totalRevenue)}</td>
                  <td style={{padding:'10px 12px',textAlign:'right',color:'#333'}}>{fmt(avgOrder)}</td>
                  <td style={{padding:'10px 12px',textAlign:'right',color:'#3d7a3d'}}>100%</td>
                </tr></tfoot>
              </table>
            )}
          </div>

          {/* Bill list */}
          <div style={{...S.card,margin:'0 32px 32px'}}>
            <div style={S.ct}>All Bills ({filtered.length})</div>
            {filtered.length===0 ? <div style={S.empty}>No bills found for selected filters</div> : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead><tr style={{background:'#f8f8f8'}}>
                    {['Bill No','Company','Order','Table','Payment','Date','Amount'].map(h=>(
                      <th key={h} style={{padding:'8px 10px',textAlign:h==='Amount'?'right':'left',fontSize:11,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'.04em',borderBottom:'1px solid #e0e0e0',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filtered.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')).map((b,i)=>(
                      <tr key={b.bill_id||i} style={{borderBottom:'1px solid #f0f0f0',background:i%2?'#fafafa':'#fff'}}>
                        <td style={{padding:'8px 10px',whiteSpace:'nowrap'}}>
                          <button onClick={() => openBillDetail(b)}
                            style={{background:'none',border:'none',cursor:'pointer',color:'#3d7a3d',fontWeight:700,fontSize:13,textDecoration:'underline',fontFamily:'inherit',padding:0}}>
                            {b.bill_number}
                          </button>
                        </td>
                        <td style={{padding:'8px 10px',color:'#555',whiteSpace:'nowrap'}}>{b.company_name}</td>
                        <td style={{padding:'8px 10px',color:'#555'}}>
                          <button onClick={() => openBillDetail(b)}
                            style={{background:'none',border:'none',cursor:'pointer',color:'#1a5ea8',fontWeight:600,fontSize:13,textDecoration:'underline',fontFamily:'inherit',padding:0}}>
                            {b.order_number || (b.order_id ? `#${b.order_id}` : '—')}
                          </button>
                        </td>
                        <td style={{padding:'8px 10px',color:'#555'}}>{b.table_name||b.order_type||'—'}</td>
                        <td style={{padding:'8px 10px'}}>
                          <span style={{background:'#f0fff4',color:'#166534',fontSize:11,padding:'2px 8px',borderRadius:10,fontWeight:600}}>
                            {(b.payment_method||'CASH').toUpperCase()}
                          </span>
                        </td>
                        <td style={{padding:'8px 10px',color:'#888',whiteSpace:'nowrap',fontSize:12}}>
                          {b.created_at ? new Date(b.created_at).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'}) : '—'}
                        </td>
                        <td style={{padding:'8px 10px',textAlign:'right',fontWeight:700,color:'#3d7a3d'}}>{fmt(b.total_payable||b.amount_paid||b.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      {/* ── Bill / Order Detail Modal ── */}
      {selectedBill && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={()=>setSelectedBill(null)}>
          <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:640,maxHeight:'88vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 64px rgba(0,0,0,.2)'}}
            onClick={e=>e.stopPropagation()}>
            {/* Modal header */}
            <div style={{padding:'16px 20px',borderBottom:'1px solid #eee',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#f8f9fa'}}>
              <div>
                <div style={{fontWeight:800,fontSize:16,color:'#111'}}>{selectedBill.bill_number}</div>
                <div style={{fontSize:12,color:'#888',marginTop:2}}>{selectedBill.company_name} · {selectedBill.table_name||selectedBill.order_type}</div>
              </div>
              <button onClick={()=>setSelectedBill(null)}
                style={{width:30,height:30,border:'1px solid #e0e0e0',borderRadius:8,background:'#fff',cursor:'pointer',fontSize:14}}>✕</button>
            </div>

            <div style={{flex:1,overflowY:'auto',padding:'18px 20px',display:'flex',flexDirection:'column',gap:18}}>
              {!billDetail ? (
                <div style={{textAlign:'center',padding:40,color:'#aaa'}}>⏳ Loading details…</div>
              ) : (
                <>
                  {/* Bill + Order Info */}
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:'#999',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:10}}>Bill & Order Info</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 16px',fontSize:13}}>
                      {[
                        ['Bill Number',  billDetail.bill?.bill_number || selectedBill.bill_number],
                        ['Order Number', billDetail.order?.order_number || `#${selectedBill.order_id}`],
                        ['Table',        billDetail.bill?.table_name || billDetail.order?.table_name || selectedBill.table_name || '—'],
                        ['Order Type',   (billDetail.order?.order_type || selectedBill.order_type || '').replace(/_/g,' ')],
                        ['Payment',      (billDetail.bill?.payment_method || selectedBill.payment_method || '').toUpperCase()],
                        ['Date',         billDetail.bill?.created_at ? new Date(billDetail.bill.created_at).toLocaleString('en-IN') : '—'],
                        ['Created By',   billDetail.order?.created_by || '—'],
                        ['Covers',       billDetail.order?.covers || '—'],
                        ['Customer',     billDetail.order?.customer_name || '—'],
                        ['Phone',        billDetail.order?.customer_phone || '—'],
                      ].map(([k,v]) => (
                        <div key={k} style={{padding:'6px 0',borderBottom:'1px solid #f5f5f5'}}>
                          <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em'}}>{k}</div>
                          <div style={{fontSize:13,color:'#222',fontWeight:500,marginTop:2}}>{v||'—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Items */}
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:'#999',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:10}}>Items</div>
                    {(billDetail.order?.items || []).length === 0 ? (
                      <div style={{color:'#aaa',fontSize:13}}>No item details available</div>
                    ) : (
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                        <thead><tr style={{background:'#f8f9fa'}}>
                          {['Item','Qty','Rate','Total','Status'].map(h=>(
                            <th key={h} style={{padding:'7px 10px',textAlign:h==='Qty'||h==='Rate'||h==='Total'?'right':'left',fontSize:11,fontWeight:700,color:'#888',textTransform:'uppercase',borderBottom:'1px solid #eee'}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {(billDetail.order.items).map((it,i)=>(
                            <tr key={i} style={{borderBottom:'1px solid #f5f5f5',opacity:it.is_cancelled?.5:1}}>
                              <td style={{padding:'7px 10px'}}>{it.is_veg===false?'🔴':'🟢'} {it.item_name||it.name}{it.is_cancelled&&<span style={{fontSize:10,color:'#dc2626',marginLeft:6}}>CANCELLED</span>}</td>
                              <td style={{padding:'7px 10px',textAlign:'right'}}>{it.quantity}</td>
                              <td style={{padding:'7px 10px',textAlign:'right'}}>₹{Number(it.unit_price||0).toFixed(2)}</td>
                              <td style={{padding:'7px 10px',textAlign:'right',fontWeight:600}}>₹{Number(it.total_price||0).toFixed(2)}</td>
                              <td style={{padding:'7px 10px',fontSize:11}}><span style={{background:'#f3f4f6',color:'#555',padding:'2px 7px',borderRadius:8}}>{it.kot_item_status||'—'}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Totals */}
                  <div style={{background:'#f8f9fa',borderRadius:10,padding:'14px 16px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:'#999',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:10}}>Amounts</div>
                    {[
                      ['Subtotal',  fmt2(billDetail.bill?.subtotal)],
                      ...(Number(billDetail.bill?.discount_amount||0)>0 ? [['Discount', `-${fmt2(billDetail.bill.discount_amount)}`]] : []),
                      ...(Number(billDetail.bill?.promo_amount||0)>0 ? [[`🏷️ Promo${billDetail.bill.promo_code?' ('+billDetail.bill.promo_code+')':''}`, `-${fmt2(billDetail.bill.promo_amount)}`]] : []),
                      ...(Number(billDetail.bill?.tax_amount||0)>0 ? [['Tax', `+${fmt2(billDetail.bill.tax_amount)}`]] : []),
                      ...(Number(billDetail.bill?.service_charge||billDetail.bill?.table_surcharge_amount||0)>0 ? [['Surcharge', `+${fmt2(billDetail.bill.service_charge||billDetail.bill.table_surcharge_amount)}`]] : []),
                      ...(Number(billDetail.bill?.sgst_amount||0)>0 ? [[`SGST`, `+${fmt2(billDetail.bill.sgst_amount)}`]] : []),
                      ...(Number(billDetail.bill?.cgst_amount||0)>0 ? [[`CGST`, `+${fmt2(billDetail.bill.cgst_amount)}`]] : []),
                    ].map(([k,v])=>(
                      <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',fontSize:13,color: k.includes('Promo')?'#166534':k==='SGST'||k==='CGST'?'#1e40af':'#555'}}>
                        <span>{k}</span><span>{v}</span>
                      </div>
                    ))}
                    <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0 0',fontSize:15,fontWeight:800,color:'#3d7a3d',borderTop:'1px solid #e0e0e0',marginTop:6}}>
                      <span>Total Payable</span>
                      <span>{(() => {
                        const b = billDetail.bill;
                        const s   = Number(b?.subtotal||0);
                        const d   = Number(b?.discount_amount||0);
                        const p   = Number(b?.promo_amount||0);
                        const sur = Number(b?.service_charge||b?.table_surcharge_amount||0);
                        const tax = Number(b?.tax_amount||0);
                        const sg  = Number(b?.sgst_amount||0);
                        const cg  = Number(b?.cgst_amount||0);
                        return fmt2(Math.round(Number(b?.total_payable||0)));
                      })()}</span>
                    </div>
                  </div>

                  {/* Payment Transactions */}
                  {billDetail.transactions?.length > 0 && (
                    <div>
                      <div style={{fontSize:10,fontWeight:700,color:'#999',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:10}}>
                        PAYMENT HISTORY ({billDetail.transactions.length})
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {billDetail.transactions.map((t, i) => (
                          <div key={i} style={{
                            background: t.status==='success'?'#f0fdf4':'#fff0f0',
                            border:`1px solid ${t.status==='success'?'#bbf7d0':'#fecaca'}`,
                            borderRadius:8, padding:'10px 14px', fontSize:13,
                          }}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <span>{t.status==='success'?'✅':'❌'}</span>
                                <span style={{fontWeight:700,color:t.status==='success'?'#166534':'#991b1b',textTransform:'uppercase'}}>{t.status}</span>
                                <span style={{background:'#e0e7ff',color:'#3730a3',fontSize:11,fontWeight:600,padding:'1px 8px',borderRadius:10}}>
                                  {(t.method||'upi').toUpperCase()}
                                </span>
                              </div>
                              <span style={{fontWeight:700}}>₹{Number(t.amount||0).toFixed(2)}</span>
                            </div>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px 16px',fontSize:12,color:'#777'}}>
                              {t.razorpay_payment_id && <div>Payment ID: <strong style={{color:'#222'}}>{t.razorpay_payment_id}</strong></div>}
                              {t.timestamp && <div>Time: {new Date(t.timestamp).toLocaleString('en-IN')}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* KOTs */}
                  {billDetail.kots?.length > 0 && (
                    <div>
                      <div style={{fontSize:10,fontWeight:700,color:'#999',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:10}}>KOTs ({billDetail.kots.length})</div>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        {billDetail.kots.map(k=>(
                          <div key={k.kot_id} style={{background:'#f5f3ff',border:'1px solid #d4b8f8',borderRadius:8,padding:'8px 12px'}}>
                            <div style={{fontWeight:700,color:'#7c3aed',fontSize:13}}>{k.kot_number}</div>
                            <div style={{fontSize:11,color:'#9880c4',marginTop:2}}>{k.kot_status} · {k.print_count} prints · {k.kot_items?.length||0} items</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  page:     { fontFamily:'var(--font-sans)' },
  topBar:   { display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 32px',borderBottom:'1px solid var(--border)' },
  pageTitle:{ fontSize:20,fontWeight:700,color:'var(--text-1)' },
  pageSub:  { fontSize:12,color:'var(--text-3)',marginTop:2 },
  btn:      { padding:'8px 16px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,fontSize:13,cursor:'pointer',fontWeight:500 },
  filterBar:{ display:'flex',alignItems:'flex-end',gap:16,padding:'12px 32px',background:'var(--bg)',borderBottom:'1px solid var(--border)',flexWrap:'wrap' },
  fg:       { display:'flex',flexDirection:'column',gap:4 },
  fl:       { fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em' },
  fi:       { padding:'7px 10px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'var(--white)' },
  qBtn:     { padding:'6px 12px',border:'1px solid var(--border)',borderRadius:6,background:'var(--white)',fontSize:12,cursor:'pointer',fontWeight:500 },
  qBtnA:    { background:'var(--primary)',color:'#fff',border:'1px solid var(--primary)',fontWeight:700 },
  statsGrid:{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:14,padding:'18px 32px' },
  sc:       { background:'var(--white)',border:'1px solid var(--border)',borderTop:'3px solid',borderRadius:12,padding:'16px 14px',display:'flex',flexDirection:'column',gap:6 },
  si:       { width:38,height:38,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,marginBottom:2 },
  sv:       { fontSize:22,fontWeight:900,lineHeight:1 },
  sl:       { fontSize:12,color:'var(--text-3)' },
  twoCol:   { display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,padding:'0 32px 16px' },
  card:     { background:'var(--white)',border:'1px solid var(--border)',borderRadius:12,padding:'18px 20px' },
  ct:       { fontSize:14,fontWeight:700,color:'var(--text-1)',marginBottom:14,paddingBottom:10,borderBottom:'1px solid var(--border-light)' },
  empty:    { padding:'32px',textAlign:'center',color:'var(--text-3)',fontSize:13 },
};
