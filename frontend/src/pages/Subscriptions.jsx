import { useEffect, useState, useCallback, useRef } from 'react';
import { useApp } from '../context/useApp';
import { Badge, Spinner, PageHeader, Modal } from '../components/UI';

// ── Plans ─────────────────────────────────────────────────────────────────────
const PLANS = {
  Basic: [
    { branches:1, monthly:600,  yearly:6600  },
    { branches:2, monthly:1000, yearly:11000 },
    { branches:3, monthly:1400, yearly:15000 },
    { branches:4, monthly:2000, yearly:22000 },
  ],
  Pro: [
    { branches:1, monthly:800,  yearly:8800  },
    { branches:2, monthly:1300, yearly:14000 },
    { branches:3, monthly:1800, yearly:20000 },
    { branches:4, monthly:2600, yearly:28000 },
  ],
};

// ── API helpers ───────────────────────────────────────────────────────────────
function buildTree(companies) {
  const parents  = (companies||[]).filter(c => !c.parant_company_unique_id);
  const children = (companies||[]).filter(c =>  c.parant_company_unique_id);
  return parents.map(p => ({
    ...p,
    children: children.filter(c => c.parant_company_unique_id === p.company_unique_id),
  }));
}

async function apiPost(url, body) {
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  return res.json();
}
async function apiGet(url) {
  const res = await fetch(url);
  return res.json();
}
async function apiPatch(url, body) {
  const res = await fetch(url, {
    method:'PATCH',
    headers:{'Content-Type':'application/json'},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ── Payment type badge ────────────────────────────────────────────────────────
function PayTypeBadge({ type }) {
  const isCash = (type||'').toLowerCase() === 'cash';
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding:'2px 10px', borderRadius:20, fontSize:11.5, fontWeight:600,
      background: isCash ? '#fef3c7' : '#e0f2fe',
      color:       isCash ? '#92400e' : '#0369a1',
      border:      isCash ? '1px solid #fcd34d' : '1px solid #bae6fd',
    }}>
      {isCash ? '💵 Cash' : '📱 UPI'}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// SUPERADMIN PAGE
// ════════════════════════════════════════════════════════════════════════════════
function SuperAdminSubscriptions({ allCompanies, user }) {
  const tree = buildTree(allCompanies || []);

  const [subs,       setSubs]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState('all');
  const [modal,      setModal]      = useState(null);
  const [payRef,     setPayRef]     = useState('');
  const [payType,    setPayType]    = useState('UPI');
  const [saving,     setSaving]     = useState(false);
  const [search,     setSearch]     = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // QR upload state
  const [qrUrl,        setQrUrl]        = useState(null);
  const [qrUploading,  setQrUploading]  = useState(false);
  const [qrMsg,        setQrMsg]        = useState(null);
  const qrInputRef = useRef();

  // Create form state
  const [selCompany,  setSelCompany]  = useState('');
  const [selBranches, setSelBranches] = useState([]);
  const [selPlan,     setSelPlan]     = useState('Basic');
  const [selBilling,  setSelBilling]  = useState('monthly');
  const [selPayType,  setSelPayType]  = useState('UPI');
  const [txnId,       setTxnId]       = useState('');
  const [saNote,      setSaNote]      = useState('By Customer Request');
  const [creating,    setCreating]    = useState(false);
  const [createMsg,   setCreateMsg]   = useState(null);

  const companyName = id => (allCompanies||[]).find(c=>c.company_unique_id===id)?.name || `Company ${id}`;

  const load = useCallback(async () => {
    setLoading(true);
    try { setSubs(await apiGet('/subscriptions/getall')); }
    catch { setSubs([]); }
    setLoading(false);
  }, []);

  const loadQr = useCallback(async () => {
    try {
      const r = await apiGet('/subscriptions/qr');
      setQrUrl(r.url || null);
    } catch {}
  }, []);

  useEffect(() => { load(); loadQr(); }, [load, loadQr]);

  // ── QR upload ──────────────────────────────────────────────────────────────
  const handleQrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrUploading(true);
    setQrMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/subscriptions/qr/upload', { method:'POST', body:fd });
      const data = await res.json();
      if (res.ok) {
        setQrUrl(data.url);
        setQrMsg({ ok:true, text:'✓ QR image updated successfully' });
      } else {
        setQrMsg({ ok:false, text: data.detail || 'Upload failed' });
      }
    } catch {
      setQrMsg({ ok:false, text:'Network error during upload' });
    }
    setQrUploading(false);
    e.target.value = '';
  };

  // ── Branch helpers ────────────────────────────────────────────────────────
  const companyBranches = selCompany
    ? (allCompanies||[]).filter(c =>
        c.company_unique_id === parseInt(selCompany) ||
        c.parant_company_unique_id === parseInt(selCompany))
    : [];

  const toggleBranch = id => setSelBranches(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id]);
  const planTiers    = PLANS[selPlan] || [];
  const matchedTier  = planTiers.find(t => t.branches === selBranches.length);
  const saPrice      = matchedTier ? (selBilling==='monthly' ? matchedTier.monthly : matchedTier.yearly) : null;

  // ── Create + Activate ─────────────────────────────────────────────────────
  const createForCompany = async () => {
    if (!selCompany)         { alert('Select a company'); return; }
    if (!selBranches.length) { alert('Select at least one branch'); return; }
    if (!matchedTier)        { alert(`${selPlan} plan supports ${planTiers.map(t=>t.branches).join(', ')} branches. Selected: ${selBranches.length}`); return; }
    if (selPayType === 'UPI' && !txnId) { alert('Enter UPI transaction reference for UPI payment'); return; }
    setCreating(true);
    try {
      const result = await apiPost('/subscriptions/create', {
        parent_company_id: parseInt(selCompany),
        plan_name: selPlan, billing_cycle: selBilling,
        branch_ids: selBranches,
        payment_ref:  selPayType === 'Cash' ? null : (txnId || null),
        payment_type: selPayType,
        created_by: user?.user_id, notes: saNote || 'By Customer Request',
      });
      await apiPatch(`/subscriptions/activate/${result.id}`, {
        subscription_id: result.id, activated_by: user?.user_id,
        payment_ref:  selPayType === 'Cash' ? null : (txnId || null),
        payment_type: selPayType,
      });
      setCreateMsg(`✓ Subscription activated! ₹${result.amount?.toLocaleString('en-IN')} · Valid till ${result.end_date}`);
      setSelCompany(''); setSelBranches([]); setTxnId(''); setSaNote('By Customer Request'); setSelPayType('UPI');
      load();
    } catch(e) { alert('Failed: ' + e.message); }
    setCreating(false);
  };

  const filtered = subs.filter(s => {
    const matchTab    = tab === 'all' || s.status === tab;
    const matchSearch = !search ||
      companyName(s.parent_company_id).toLowerCase().includes(search.toLowerCase()) ||
      (s.plan_name||'').toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const activate = async (sub) => {
    if (payType === 'UPI' && !payRef && !sub.payment_ref) {
      alert('Enter payment reference for UPI payment');
      return;
    }
    setSaving(true);
    await apiPatch(`/subscriptions/activate/${sub.id}`, {
      subscription_id: sub.id, activated_by: user?.user_id,
      payment_ref:  payType === 'Cash' ? null : (payRef || sub.payment_ref),
      payment_type: payType,
    });
    setSaving(false); setModal(null); setPayRef(''); setPayType('UPI'); load();
  };

  const cancel = async (id) => {
    if (!confirm('Cancel this subscription?')) return;
    await apiPatch(`/subscriptions/cancel/${id}`); load();
  };

  const counts = {
    all:     subs.length,
    pending: subs.filter(s=>s.status==='pending').length,
    active:  subs.filter(s=>s.status==='active').length,
    expired: subs.filter(s=>s.status==='expired'||s.status==='cancelled').length,
  };

  return (
    <div>

      {/* ── QR Image Management ───────────────────────────────────────────── */}
      <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:14,padding:22,marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#1a3a1c',marginBottom:3}}>
              📱 Payment QR Code
            </div>
            <div style={{fontSize:12,color:'#888'}}>
              This QR is shown to admin users on the subscription payment screen
            </div>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
            {/* Current QR preview */}
            {qrUrl ? (
              <div style={{textAlign:'center'}}>
                <img src={qrUrl} alt="Payment QR"
                  style={{width:90,height:90,borderRadius:8,border:'1px solid #e5e7eb',objectFit:'contain',display:'block'}} />
                <div style={{fontSize:10,color:'#4ade80',marginTop:4,fontWeight:600}}>✓ QR Active</div>
              </div>
            ) : (
              <div style={{width:90,height:90,borderRadius:8,border:'2px dashed #d1d5db',
                display:'flex',alignItems:'center',justifyContent:'center',
                flexDirection:'column',gap:4,color:'#aaa',fontSize:12}}>
                <span style={{fontSize:24}}>📷</span>
                <span>No QR</span>
              </div>
            )}

            {/* Upload button */}
            <div>
              <input ref={qrInputRef} type="file" accept="image/*"
                style={{display:'none'}} onChange={handleQrUpload} />
              <button
                disabled={qrUploading}
                onClick={() => qrInputRef.current?.click()}
                style={{
                  background:'#1a3a1c', color:'#fff', border:'none',
                  padding:'10px 20px', borderRadius:8, fontSize:13,
                  fontWeight:600, cursor:'pointer',
                  opacity: qrUploading ? 0.7 : 1,
                }}>
                {qrUploading ? '⏳ Uploading...' : (qrUrl ? '🔄 Replace QR Image' : '📤 Upload QR Image')}
              </button>
              {qrMsg && (
                <div style={{
                  marginTop:6, fontSize:12, fontWeight:600,
                  color: qrMsg.ok ? '#16a34a' : '#dc2626',
                }}>
                  {qrMsg.text}
                </div>
              )}
              <div style={{fontSize:11,color:'#aaa',marginTop:4}}>
                JPEG, PNG or WebP · Max 5 MB
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats + New button ────────────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,flex:1,marginRight:16}}>
          {[
            {label:'Total',   value:counts.all,     color:'#1a3a1c'},
            {label:'Pending', value:counts.pending,  color:'#d97706'},
            {label:'Active',  value:counts.active,   color:'#16a34a'},
            {label:'Expired', value:counts.expired,  color:'#888'},
          ].map(({label,value,color})=>(
            <div key={label} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,padding:'14px 18px'}}>
              <div style={{fontSize:11,color:'#888',marginBottom:4}}>{label}</div>
              <div style={{fontSize:26,fontWeight:700,color}}>{value}</div>
            </div>
          ))}
        </div>
        <button onClick={()=>{setShowCreate(!showCreate);setCreateMsg(null);}}
          style={{background:'#1a3a1c',color:'#fff',border:'none',padding:'10px 20px',
            borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',
            boxShadow:'0 2px 8px rgba(26,58,28,0.2)'}}>
          {showCreate ? '✕ Close' : '+ New Subscription'}
        </button>
      </div>

      {/* ── Create Subscription Form ──────────────────────────────────────── */}
      {showCreate && (
        <div style={{background:'#fff',border:'2px solid #1a3a1c',borderRadius:16,padding:28,marginBottom:24,position:'relative'}}>
          <div style={{position:'absolute',top:-12,left:20,background:'#1a3a1c',color:'#fff',
            padding:'3px 14px',borderRadius:100,fontSize:12,fontWeight:700}}>New Subscription</div>

          {createMsg && (
            <div style={{background:'#d1fae5',border:'1px solid #6ee7b7',borderRadius:10,
              padding:'12px 16px',marginBottom:20,fontSize:14,fontWeight:600,color:'#065f46'}}>
              {createMsg}
            </div>
          )}

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
            {/* Left — Company + Branches */}
            <div>
              <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:8}}>Select Company *</div>
              <select value={selCompany} onChange={e=>{setSelCompany(e.target.value);setSelBranches([]);}}
                style={{width:'100%',padding:'9px 12px',border:'1px solid #ddd',borderRadius:8,
                  fontSize:14,marginBottom:16,background:'#fafafa'}}>
                <option value=''>— Choose company —</option>
                {tree.map(parent=>(
                  <optgroup key={parent.company_unique_id} label={parent.name}>
                    <option value={parent.company_unique_id}>{parent.name}</option>
                    {parent.children?.map(child=>(
                      <option key={child.company_unique_id} value={child.company_unique_id}>
                        ↳ {child.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {selCompany && (
                <>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#555'}}>Select Branches *</div>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={()=>setSelBranches(companyBranches.map(c=>c.company_unique_id))}
                        style={{fontSize:12,color:'#1a3a1c',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>
                        Select All
                      </button>
                      <button onClick={()=>setSelBranches([])}
                        style={{fontSize:12,color:'#888',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>
                        Clear
                      </button>
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:160,overflowY:'auto'}}>
                    {companyBranches.map(c => {
                      const isSel = selBranches.includes(c.company_unique_id);
                      return (
                        <div key={c.company_unique_id} onClick={()=>toggleBranch(c.company_unique_id)}
                          style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',
                            border:`1.5px solid ${isSel?'#1a3a1c':'#e5e7eb'}`,borderRadius:8,cursor:'pointer',
                            background:isSel?'#e8f5e0':'#fafafa',transition:'all .15s'}}>
                          <div style={{width:18,height:18,borderRadius:4,flexShrink:0,
                            border:`2px solid ${isSel?'#1a3a1c':'#ccc'}`,
                            background:isSel?'#1a3a1c':'#fff',
                            display:'flex',alignItems:'center',justifyContent:'center'}}>
                            {isSel && <span style={{color:'#fff',fontSize:11,fontWeight:700}}>✓</span>}
                          </div>
                          <div style={{fontSize:13,fontWeight:500,color:'#1a1a1a'}}>{c.name}</div>
                          {c.company_unique_id===parseInt(selCompany) &&
                            <span style={{fontSize:10,color:'#888',marginLeft:'auto'}}>Parent</span>}
                        </div>
                      );
                    })}
                  </div>
                  {selBranches.length > 0 && !matchedTier && (
                    <div style={{marginTop:8,fontSize:12,color:'#dc2626',background:'#fef2f2',
                      padding:'6px 10px',borderRadius:6}}>
                      ⚠ {selPlan} plan supports {planTiers.map(t=>t.branches).join(', ')} branches. Selected: {selBranches.length}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right — Plan + Payment + TxnId + Notes */}
            <div>
              <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:8}}>Plan</div>
              <div style={{display:'flex',gap:8,marginBottom:16}}>
                {['Basic','Pro'].map(p=>(
                  <button key={p} onClick={()=>setSelPlan(p)} style={{
                    flex:1,padding:'9px',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:14,
                    border:`2px solid ${selPlan===p?'#1a3a1c':'#e5e7eb'}`,
                    background:selPlan===p?'#1a3a1c':'#fff',
                    color:selPlan===p?'#fff':'#333',
                  }}>{p}</button>
                ))}
              </div>

              <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:8}}>Billing Cycle</div>
              <div style={{display:'flex',gap:8,marginBottom:16}}>
                {[['monthly','Monthly'],['yearly','Yearly (save 1 month)']].map(([v,l])=>(
                  <button key={v} onClick={()=>setSelBilling(v)} style={{
                    flex:1,padding:'8px',borderRadius:8,cursor:'pointer',fontSize:13,
                    border:`1.5px solid ${selBilling===v?'#1a3a1c':'#e5e7eb'}`,
                    background:selBilling===v?'#e8f5e0':'#fff',
                    fontWeight:selBilling===v?600:400,color:'#333',
                  }}>{l}</button>
                ))}
              </div>

              {/* Payment type */}
              <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:8}}>Payment Type *</div>
              <div style={{display:'flex',gap:8,marginBottom:16}}>
                {[['UPI','📱 UPI'],['Cash','💵 Cash']].map(([v,l])=>(
                  <button key={v} onClick={()=>setSelPayType(v)} style={{
                    flex:1,padding:'9px',borderRadius:8,cursor:'pointer',fontSize:13,
                    border:`2px solid ${selPayType===v?(v==='Cash'?'#d97706':'#0369a1'):'#e5e7eb'}`,
                    background:selPayType===v?(v==='Cash'?'#fef3c7':'#e0f2fe'):'#fff',
                    fontWeight:selPayType===v?600:400,
                    color:selPayType===v?(v==='Cash'?'#92400e':'#0369a1'):'#555',
                  }}>{l}</button>
                ))}
              </div>

              {/* Price preview */}
              {matchedTier && selCompany && (
                <div style={{background:'linear-gradient(135deg,#e8f5e0,#f0fdf4)',border:'1px solid #b8ddb8',
                  borderRadius:10,padding:'12px 16px',marginBottom:14}}>
                  <div style={{fontSize:11,color:'#555',marginBottom:2}}>Amount to Activate</div>
                  <div style={{fontSize:24,fontWeight:800,color:'#1a3a1c'}}>
                    ₹{saPrice?.toLocaleString('en-IN')}
                    <span style={{fontSize:12,fontWeight:400,color:'#555',marginLeft:6}}>
                      /{selBilling==='monthly'?'month':'year'}
                    </span>
                  </div>
                </div>
              )}

              {/* UPI ref — only for UPI */}
              {selPayType === 'UPI' && (
                <>
                  <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:6}}>
                    Transaction / UPI ID *
                  </div>
                  <input value={txnId} onChange={e=>setTxnId(e.target.value)}
                    placeholder="Enter UPI transaction reference..."
                    style={{width:'100%',padding:'9px 12px',border:'1px solid #ddd',
                      borderRadius:8,fontSize:13,marginBottom:14}} />
                </>
              )}

              {selPayType === 'Cash' && (
                <div style={{background:'#fef3c7',border:'1px solid #fcd34d',borderRadius:8,
                  padding:'10px 14px',marginBottom:14,fontSize:13,color:'#92400e'}}>
                  💵 Cash payment — no transaction reference needed
                </div>
              )}

              <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:6}}>Notes</div>
              <input value={saNote} onChange={e=>setSaNote(e.target.value)}
                placeholder="By Customer Request"
                style={{width:'100%',padding:'9px 12px',border:'1px solid #ddd',
                  borderRadius:8,fontSize:13,marginBottom:20}} />

              <button
                disabled={creating || !selCompany || !selBranches.length || !matchedTier}
                onClick={createForCompany}
                style={{width:'100%',padding:12,
                  background:(creating||!selCompany||!selBranches.length||!matchedTier)?'#ccc':'#1a3a1c',
                  color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:700,cursor:'pointer',
                  boxShadow:'0 2px 8px rgba(26,58,28,0.2)'}}>
                {creating ? '⏳ Creating...' : '⚡ Create & Activate Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div style={{display:'flex',gap:12,marginBottom:20,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6}}>
          {['all','pending','active','expired'].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              padding:'7px 16px',borderRadius:100,fontSize:13,cursor:'pointer',textTransform:'capitalize',
              background:tab===t?'#1a3a1c':'#fff',color:tab===t?'#fff':'#555',
              border:tab===t?'none':'1px solid #ddd',fontWeight:tab===t?600:400,
            }}>{t} ({counts[t]||0})</button>
          ))}
        </div>
        <input placeholder="Search company or plan..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{padding:'8px 14px',border:'1px solid #ddd',borderRadius:8,fontSize:14,width:220}} />
        <button className="btn btn-sm btn-outline" onClick={load} style={{marginLeft:'auto'}}>↺ Refresh</button>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {loading ? <Spinner /> : (
        <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}>
            <thead>
              <tr style={{background:'#f9fafb',borderBottom:'1px solid #e5e7eb'}}>
                {['Company','Plan','Branches','Billing','Amount','Valid Till','Status','Pay Type','Txn Ref','Notes','Actions'].map(h=>(
                  <th key={h} style={{padding:'10px 14px',fontSize:12,fontWeight:600,color:'#555',textAlign:'left',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} style={{textAlign:'center',padding:40,color:'#aaa'}}>No subscriptions found</td></tr>
              )}
              {filtered.map(s=>{
                const daysLeft = Math.ceil((new Date(s.end_date)-new Date())/(1000*60*60*24));
                const expiring = s.status==='active' && daysLeft <= 3 && daysLeft >= 0;
                return (
                  <tr key={s.id} style={{borderBottom:'1px solid #f0f0f0',background:expiring?'#fffbeb':undefined}}>
                    <td style={{padding:'10px 14px',fontSize:13,fontWeight:500}}>{companyName(s.parent_company_id)}</td>
                    <td style={{padding:'10px 14px',fontSize:13}}>
                      <Badge variant={s.plan_name==='Pro'?'info':'success'}>{s.plan_name}</Badge>
                    </td>
                    <td style={{padding:'10px 14px',fontSize:13}}>{s.branch_count}</td>
                    <td style={{padding:'10px 14px',fontSize:13,textTransform:'capitalize'}}>{s.billing_cycle}</td>
                    <td style={{padding:'10px 14px',fontSize:13,fontWeight:600}}>₹{s.amount_paid?.toLocaleString('en-IN')}</td>
                    <td style={{padding:'10px 14px',fontSize:12,color:expiring?'#d97706':'#666',fontWeight:expiring?600:400}}>
                      {s.end_date?.slice(0,10)}
                      {expiring && <span style={{marginLeft:5,fontSize:10,background:'#fef3c7',
                        color:'#92400e',padding:'2px 7px',borderRadius:100}}>⚠ {daysLeft}d</span>}
                    </td>
                    <td style={{padding:'10px 14px'}}>
                      <Badge variant={s.status==='active'?'success':s.status==='pending'?'warning':'error'}>
                        {s.status}
                      </Badge>
                    </td>
                    <td style={{padding:'10px 14px'}}>
                      <PayTypeBadge type={s.payment_type} />
                    </td>
                    <td style={{padding:'10px 14px',fontSize:11,color:'#888',fontFamily:'monospace',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {s.payment_ref||'—'}
                    </td>
                    <td style={{padding:'10px 14px',fontSize:11,color:'#888',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {s.notes||'—'}
                    </td>
                    <td style={{padding:'10px 14px'}}>
                      <div style={{display:'flex',gap:6}}>
                        {s.status==='pending' && (
                          <button onClick={()=>{setModal(s);setPayRef(s.payment_ref||'');setPayType(s.payment_type||'UPI');}}
                            style={{background:'#16a34a',color:'#fff',border:'none',padding:'5px 12px',
                              borderRadius:6,fontSize:12,cursor:'pointer',fontWeight:600}}>
                            ✓ Activate
                          </button>
                        )}
                        {s.status==='active' && (
                          <button onClick={()=>cancel(s.id)}
                            style={{background:'#fff',color:'#dc2626',border:'1px solid #dc2626',
                              padding:'5px 12px',borderRadius:6,fontSize:12,cursor:'pointer'}}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Activate Modal ────────────────────────────────────────────────── */}
      {modal && (
        <Modal title="Activate Subscription" onClose={()=>{setModal(null);setPayRef('');setPayType('UPI');}}>
          <div style={{marginBottom:16}}>
            <div style={{background:'#f9fafb',borderRadius:8,padding:14,marginBottom:14}}>
              <div style={{fontSize:13,color:'#555',marginBottom:4}}>Company</div>
              <div style={{fontSize:15,fontWeight:600}}>{companyName(modal.parent_company_id)}</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
              {[['Plan',modal.plan_name],['Branches',modal.branch_count],
                ['Amount',`₹${modal.amount_paid?.toLocaleString('en-IN')}`]].map(([k,v])=>(
                <div key={k} style={{background:'#f9fafb',borderRadius:8,padding:10,textAlign:'center'}}>
                  <div style={{fontSize:11,color:'#888',marginBottom:3}}>{k}</div>
                  <div style={{fontSize:14,fontWeight:600}}>{v}</div>
                </div>
              ))}
            </div>

            {/* Payment type selector in modal */}
            <div style={{fontSize:12,fontWeight:600,color:'#555',display:'block',marginBottom:8}}>
              Payment Type
            </div>
            <div style={{display:'flex',gap:8,marginBottom:14}}>
              {[['UPI','📱 UPI'],['Cash','💵 Cash']].map(([v,l])=>(
                <button key={v} onClick={()=>setPayType(v)} style={{
                  flex:1,padding:'9px',borderRadius:8,cursor:'pointer',fontSize:13,
                  border:`2px solid ${payType===v?(v==='Cash'?'#d97706':'#0369a1'):'#e5e7eb'}`,
                  background:payType===v?(v==='Cash'?'#fef3c7':'#e0f2fe'):'#fff',
                  fontWeight:payType===v?600:400,
                  color:payType===v?(v==='Cash'?'#92400e':'#0369a1'):'#555',
                }}>{l}</button>
              ))}
            </div>

            {modal.notes && (
              <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,
                padding:'8px 12px',marginBottom:12,fontSize:13,color:'#166534'}}>
                📝 Notes: {modal.notes}
              </div>
            )}

            {payType === 'UPI' && (
              <>
                <label style={{fontSize:12,fontWeight:600,color:'#555',display:'block',marginBottom:6}}>
                  UPI / Payment Reference {payType==='UPI'?'*':'(optional)'}
                </label>
                <input value={payRef} onChange={e=>setPayRef(e.target.value)}
                  placeholder="Enter UPI transaction reference..."
                  style={{width:'100%',padding:'10px 12px',border:'1px solid #ddd',borderRadius:8,fontSize:14}} />
              </>
            )}
            {payType === 'Cash' && (
              <div style={{background:'#fef3c7',border:'1px solid #fcd34d',borderRadius:8,
                padding:'10px 14px',fontSize:13,color:'#92400e'}}>
                💵 Cash payment — no transaction reference required
              </div>
            )}
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
            <button className="btn btn-ghost" onClick={()=>{setModal(null);setPayRef('');setPayType('UPI');}}>Cancel</button>
            <button disabled={saving} onClick={()=>activate(modal)}
              style={{background:'#16a34a',color:'#fff',border:'none',padding:'10px 24px',
                borderRadius:8,fontWeight:600,fontSize:14,cursor:'pointer'}}>
              {saving?'Activating…':'✓ Activate Subscription'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ADMIN PAGE — subscribe for own company + branches
// ════════════════════════════════════════════════════════════════════════════════
function AdminSubscriptions({ allCompanies, user, showToast }) {
  const userCid = user?.company_unique_id;

  const myCompanies   = (allCompanies||[]).filter(c =>
    c.company_unique_id === userCid || c.parant_company_unique_id === userCid
  );

  const [subs,        setSubs]        = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [qrUrl,       setQrUrl]       = useState(null);   // ← dynamic from server

  // Form state
  const [selectedBranches, setSelectedBranches] = useState([]);
  const [planName,    setPlanName]    = useState('Basic');
  const [billing,     setBilling]     = useState('monthly');
  const [warnings,    setWarnings]    = useState([]);
  const [step,        setStep]        = useState('select');
  const [createdSub,  setCreatedSub]  = useState(null);
  const [payRef,      setPayRef]      = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [validating,  setValidating]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSubs(await apiGet(`/subscriptions/getbycompany/${userCid}`)); }
    catch { setSubs([]); }
    setLoading(false);
  }, [userCid]);

  const loadQr = useCallback(async () => {
    try {
      const r = await apiGet('/subscriptions/qr');
      setQrUrl(r.url || null);
    } catch {}
  }, []);

  useEffect(() => { load(); loadQr(); }, [load, loadQr]);

  const toggleBranch = (id) => {
    setSelectedBranches(prev =>
      prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]
    );
    setWarnings([]);
  };
  const selectAll   = () => { setSelectedBranches(myCompanies.map(c=>c.company_unique_id)); setWarnings([]); };
  const deselectAll = () => { setSelectedBranches([]); setWarnings([]); };

  const planTiers      = PLANS[planName] || [];
  const branchCount    = selectedBranches.length;
  const matchedTier    = planTiers.find(t => t.branches === branchCount);
  const price          = matchedTier ? (billing==='monthly' ? matchedTier.monthly : matchedTier.yearly) : null;
  const validBranchCounts = planTiers.map(t=>t.branches);

  const proceedToPayment = async () => {
    if (selectedBranches.length === 0) { alert('Please select at least one branch'); return; }
    if (!matchedTier) { alert(`${planName} plan supports: ${validBranchCounts.join(', ')} branches. You selected ${branchCount}.`); return; }
    setValidating(true);
    try {
      const result = await apiPost('/subscriptions/checkvalidity', selectedBranches);
      setWarnings(result.warnings || []);
    } catch {}
    setValidating(false);
    setStep('payment');
  };

  const submitSubscription = async () => {
    setSubmitting(true);
    try {
      const result = await apiPost('/subscriptions/create', {
        parent_company_id: userCid,
        plan_name: planName,
        billing_cycle: billing,
        branch_ids: selectedBranches,
        payment_ref:  payRef || null,
        payment_type: 'UPI',
        created_by: user?.user_id,
      });
      setCreatedSub(result);
      setStep('submitted');
      load();
    } catch {
      alert('Failed to create subscription. Please try again.');
    }
    setSubmitting(false);
  };

  const daysLeft = (endDate) => Math.ceil((new Date(endDate)-new Date())/(1000*60*60*24));

  return (
    <div>
      {/* Active subscriptions */}
      {subs.length > 0 && (
        <div style={{marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:600,color:'#1a3a1c',marginBottom:12}}>Current Subscriptions</div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            {subs.filter(s=>s.status!=='cancelled').map(s=>{
              const dl = daysLeft(s.end_date);
              const expiring = s.status==='active' && dl <= 3 && dl >= 0;
              return (
                <div key={s.id} style={{
                  background:'#fff',border:`1px solid ${expiring?'#f59e0b':'#e5e7eb'}`,
                  borderRadius:12,padding:'16px 20px',minWidth:220,
                  boxShadow:expiring?'0 0 0 3px rgba(245,158,11,0.15)':undefined,
                }}>
                  {expiring && (
                    <div style={{background:'#fef3c7',color:'#92400e',borderRadius:6,padding:'5px 10px',fontSize:12,fontWeight:600,marginBottom:10}}>
                      ⚠️ Expires in {dl} day{dl!==1?'s':''} — Renew now!
                    </div>
                  )}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <Badge variant={s.plan_name==='Pro'?'info':'success'}>{s.plan_name}</Badge>
                    <Badge variant={s.status==='active'?'success':s.status==='pending'?'warning':'error'}>
                      {s.status}
                    </Badge>
                  </div>
                  <div style={{fontSize:13,color:'#555',marginBottom:4}}>{s.branch_count} branch{s.branch_count!==1?'es':''} · {s.billing_cycle}</div>
                  <div style={{fontSize:12,color:'#888'}}>Expires: {s.end_date?.slice(0,10)}</div>
                  {s.status==='pending' && (
                    <div style={{marginTop:8,fontSize:11,color:'#d97706',fontWeight:500}}>
                      ⏳ Awaiting activation by admin
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New subscription form */}
      <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:16,padding:28}}>
        <div style={{fontSize:16,fontWeight:700,color:'#1a3a1c',marginBottom:20}}>
          {step==='submitted' ? '✓ Subscription Submitted' : 'New Subscription'}
        </div>

        {/* STEP 1 — Select branches + plan */}
        {step==='select' && (
          <>
            <div style={{marginBottom:24}}>
              <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:10}}>
                Select Branches
                <button onClick={selectAll}   style={{marginLeft:12,fontSize:12,color:'#1a3a1c',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>Select All</button>
                <button onClick={deselectAll} style={{marginLeft:8,fontSize:12,color:'#888',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>Clear</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {myCompanies.map(c=>{
                  const isSelected = selectedBranches.includes(c.company_unique_id);
                  const isParent   = c.company_unique_id === userCid;
                  return (
                    <div key={c.company_unique_id}
                      onClick={()=>toggleBranch(c.company_unique_id)}
                      style={{
                        display:'flex',alignItems:'center',gap:12,padding:'12px 16px',
                        border:`1px solid ${isSelected?'#1a3a1c':'#e5e7eb'}`,
                        borderRadius:10,cursor:'pointer',
                        background:isSelected?'#e8f5e0':'#fafafa',
                        transition:'all .2s',
                      }}>
                      <div style={{
                        width:20,height:20,borderRadius:4,
                        border:`2px solid ${isSelected?'#1a3a1c':'#ccc'}`,
                        background:isSelected?'#1a3a1c':'#fff',
                        display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
                      }}>
                        {isSelected && <span style={{color:'#fff',fontSize:13,fontWeight:700}}>✓</span>}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:500,color:'#1a1a1a'}}>{c.name}</div>
                        {isParent && <div style={{fontSize:11,color:'#888',marginTop:1}}>Parent Branch</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {branchCount > 0 && !matchedTier && (
                <div style={{marginTop:10,background:'#fef2f2',color:'#991b1b',padding:'8px 14px',borderRadius:8,fontSize:13}}>
                  ⚠ {planName} plan supports {validBranchCounts.join(', ')} branches. You selected {branchCount}. Please adjust.
                </div>
              )}
            </div>

            <div style={{marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:10}}>Select Plan</div>
              <div style={{display:'flex',gap:10}}>
                {['Basic','Pro'].map(p=>(
                  <button key={p} onClick={()=>setPlanName(p)} style={{
                    flex:1,padding:'12px',borderRadius:10,cursor:'pointer',
                    border:`2px solid ${planName===p?'#1a3a1c':'#e5e7eb'}`,
                    background:planName===p?'#1a3a1c':'#fff',
                    color:planName===p?'#fff':'#333',fontWeight:600,fontSize:14,
                  }}>{p}</button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:10}}>Billing Cycle</div>
              <div style={{display:'flex',gap:10}}>
                {[['monthly','Monthly'],['yearly','Yearly (Save 1 month)']].map(([val,lbl])=>(
                  <button key={val} onClick={()=>setBilling(val)} style={{
                    flex:1,padding:'10px',borderRadius:8,cursor:'pointer',
                    border:`1.5px solid ${billing===val?'#1a3a1c':'#e5e7eb'}`,
                    background:billing===val?'#e8f5e0':'#fff',
                    color:'#333',fontSize:13,fontWeight:billing===val?600:400,
                  }}>{lbl}</button>
                ))}
              </div>
            </div>

            {matchedTier && (
              <div style={{background:'#e8f5e0',border:'1px solid #b8ddb8',borderRadius:10,padding:'14px 18px',marginBottom:20}}>
                <div style={{fontSize:13,color:'#555',marginBottom:4}}>Amount to Pay</div>
                <div style={{fontSize:28,fontWeight:800,color:'#1a3a1c'}}>
                  ₹{price?.toLocaleString('en-IN')}
                  <span style={{fontSize:14,fontWeight:400,color:'#555',marginLeft:6}}>/{billing==='monthly'?'month':'year'}</span>
                </div>
                <div style={{fontSize:12,color:'#555',marginTop:4}}>
                  {planName} plan · {branchCount} branch{branchCount!==1?'es':''} · {billing}
                </div>
              </div>
            )}

            <button
              disabled={!matchedTier || selectedBranches.length===0 || validating}
              onClick={proceedToPayment}
              style={{
                width:'100%',padding:14,background:matchedTier?'#1a3a1c':'#ccc',
                color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:600,cursor:'pointer',
              }}>
              {validating ? 'Checking validity…' : 'Proceed to Payment →'}
            </button>
          </>
        )}

        {/* STEP 2 — Payment */}
        {step==='payment' && (
          <>
            {warnings.length > 0 && (
              <div style={{marginBottom:16}}>
                {warnings.map((w,i)=>(
                  <div key={i} style={{background:'#fffbeb',border:'1px solid #f59e0b',borderRadius:8,padding:'10px 14px',marginBottom:8,fontSize:13,color:'#92400e'}}>
                    ⚠️ {w.message}
                  </div>
                ))}
              </div>
            )}

            {/* Order summary */}
            <div style={{background:'#f9fafb',borderRadius:10,padding:16,marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:10}}>Order Summary</div>
              {[['Plan',planName],['Branches',`${branchCount} branch${branchCount!==1?'es':''}`],['Billing',billing],['Amount',`₹${price?.toLocaleString('en-IN')}`]].map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'5px 0',borderBottom:'1px solid #eee'}}>
                  <span style={{color:'#888'}}>{k}</span>
                  <span style={{fontWeight:600,color:'#1a1a1a'}}>{v}</span>
                </div>
              ))}
            </div>

            {/* Dynamic QR Code */}
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:12}}>
                Scan & Pay ₹{price?.toLocaleString('en-IN')} via PhonePe / UPI
              </div>
              {qrUrl ? (
                <img src={qrUrl} alt="Payment QR"
                  style={{width:200,height:'auto',borderRadius:12,border:'1px solid #e5e7eb',display:'inline-block'}} />
              ) : (
                <div style={{width:200,height:200,border:'2px dashed #d1d5db',borderRadius:12,
                  display:'inline-flex',alignItems:'center',justifyContent:'center',
                  flexDirection:'column',gap:8,color:'#aaa',fontSize:13}}>
                  <span style={{fontSize:36}}>📷</span>
                  <span>QR not set yet</span>
                  <span style={{fontSize:11,color:'#ccc'}}>Contact superadmin</span>
                </div>
              )}
              <div style={{fontSize:12,color:'#888',marginTop:8}}>KUNTAL DAS · PhonePe</div>
            </div>

            {/* Payment reference */}
            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,fontWeight:600,color:'#555',display:'block',marginBottom:6}}>
                UPI Transaction Reference (optional — you can add later)
              </label>
              <input value={payRef} onChange={e=>setPayRef(e.target.value)}
                placeholder="Enter UPI transaction ID after payment..."
                style={{width:'100%',padding:'10px 12px',border:'1px solid #ddd',borderRadius:8,fontSize:14}} />
            </div>

            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setStep('select')} style={{
                flex:1,padding:12,background:'#fff',border:'1px solid #ddd',
                borderRadius:10,fontSize:14,cursor:'pointer',color:'#555',
              }}>← Back</button>
              <button onClick={submitSubscription} disabled={submitting} style={{
                flex:2,padding:12,background:'#1a3a1c',color:'#fff',border:'none',
                borderRadius:10,fontSize:15,fontWeight:600,cursor:'pointer',
              }}>
                {submitting ? 'Submitting…' : 'Submit Subscription →'}
              </button>
            </div>
          </>
        )}

        {/* STEP 3 — Submitted */}
        {step==='submitted' && createdSub && (
          <div style={{textAlign:'center',padding:20}}>
            <div style={{fontSize:48,marginBottom:12}}>✅</div>
            <div style={{fontSize:18,fontWeight:700,color:'#1a3a1c',marginBottom:8}}>Subscription Submitted!</div>
            <div style={{fontSize:14,color:'#555',lineHeight:1.6,marginBottom:20}}>
              Your subscription has been submitted for activation.<br/>
              A superadmin will verify your payment and activate it shortly.
            </div>
            <div style={{background:'#e8f5e0',borderRadius:10,padding:16,marginBottom:20,display:'inline-block',textAlign:'left',minWidth:240}}>
              <div style={{fontSize:12,color:'#555',marginBottom:4}}>Reference ID</div>
              <div style={{fontSize:18,fontWeight:700,color:'#1a3a1c'}}>#SUB-{createdSub.id}</div>
              <div style={{fontSize:13,color:'#555',marginTop:8}}>Amount: ₹{createdSub.amount?.toLocaleString('en-IN')}</div>
              <div style={{fontSize:12,color:'#888',marginTop:4}}>Valid till: {createdSub.end_date}</div>
            </div>
            <button onClick={()=>{setStep('select');setSelectedBranches([]);setPayRef('');setCreatedSub(null);load();}}
              style={{display:'block',width:'100%',padding:12,background:'#1a3a1c',color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer'}}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ════════════════════════════════════════════════════════════════════════════════
export default function Subscriptions() {
  const { allCompanies, user, showToast } = useApp();
  const isSuperAdmin = user?.is_super_admin === true;

  return (
    <div className="page">
      <PageHeader
        title="Subscriptions"
        subtitle={isSuperAdmin ? 'Manage all company subscriptions' : 'Manage your subscription plan'}
      />
      {isSuperAdmin
        ? <SuperAdminSubscriptions allCompanies={allCompanies} user={user} />
        : <AdminSubscriptions allCompanies={allCompanies} user={user} showToast={showToast} />
      }
    </div>
  );
}
