import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/useApp';
import { settlementAPI, foodMenuAPI } from '../services/api';
import { PageHeader, Modal, Spinner } from '../components/UI';

const fmt   = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = ()  => new Date().toISOString().slice(0, 10);
const nAgo  = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

function buildTree(companies) {
  const parents  = (companies || []).filter(c => !c.parant_company_unique_id);
  const children = (companies || []).filter(c =>  c.parant_company_unique_id);
  return parents.map(p => ({ ...p, children: children.filter(c => c.parant_company_unique_id === p.company_unique_id) }));
}

export default function BillSettlement() {
  const { allCompanies, user, showToast } = useApp();
  const isSuperAdmin = user?.is_super_admin === true;
  const userCid      = user?.company_unique_id;

  // ── branch scope (mirrors SalesReport) ──────────────────────────────────
  const visibleCompanies = isSuperAdmin
    ? (allCompanies || [])
    : (allCompanies || []).filter(c =>
        c.company_unique_id === userCid || c.parant_company_unique_id === userCid);
  const myCompany   = (allCompanies || []).find(c => c.company_unique_id === userCid);
  const myParentId  = myCompany?.parant_company_unique_id;
  const isChildBranch = !!myParentId && Number(myParentId) !== 0;
  const rootCid     = isChildBranch ? Number(myParentId) : userCid;
  const tree        = buildTree(visibleCompanies);

  // ── filters ─────────────────────────────────────────────────────────────
  const [fromDate,   setFromDate]   = useState(nAgo(7));
  const [toDate,     setToDate]     = useState(today());
  const [branchId,   setBranchId]   = useState('all');
  const [billSearch, setBillSearch] = useState('');

  const [bills,   setBills]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [note,    setNote]    = useState('');

  // ── editor state ──────────────────────────────────────────────────────────
  const [editing,  setEditing]  = useState(null);   // bill detail dict
  const [items,    setItems]    = useState([]);     // working copy of order items
  const [adds,     setAdds]     = useState([]);     // new items staged for add
  const [menu,     setMenu]     = useState([]);     // food menu of the bill's branch
  const [menuLoad, setMenuLoad] = useState(false);
  const [picker,   setPicker]   = useState('');     // food_menu_id selected in picker
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    if (!allCompanies?.length) { setNote('No companies loaded. Please log in again.'); return; }
    setLoading(true); setBills([]); setNote('');
    try {
      const p = new URLSearchParams();
      if (fromDate) p.append('from_date', fromDate);
      if (toDate)   p.append('to_date',   toDate);
      const url = `/pos/bill/company/${rootCid}${p.toString() ? `?${p}` : ''}`;
      const res = await fetch(url).then(r => (r.ok ? r.json() : []));
      const list = Array.isArray(res) ? res : [];
      setBills(isChildBranch ? list.filter(b => b.company_unique_id === userCid) : list);
      if (!list.length) setNote('No billed orders found for this range.');
    } catch {
      setNote('Error loading bills. Please try again.');
    }
    setLoading(false);
  }, [allCompanies, rootCid, fromDate, toDate, isChildBranch, userCid]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = bills.filter(b => {
    if (branchId !== 'all') {
      const inScope = (allCompanies || []).some(c =>
        (Number(c.company_unique_id) === Number(branchId) || Number(c.parant_company_unique_id) === Number(branchId))
        && Number(c.company_unique_id) === Number(b.company_unique_id));
      if (!inScope) return false;
    }
    if (billSearch.trim() && !(b.bill_number || '').toLowerCase().includes(billSearch.trim().toLowerCase())) return false;
    return true;
  });

  // ── open editor ───────────────────────────────────────────────────────────
  const openEditor = async (bill) => {
    setSaving(false); setAdds([]); setPicker('');
    try {
      const detail = await settlementAPI.getBillDetail(bill.bill_id);
      setEditing(detail);
      setItems((detail.order?.order_items || []).map(i => ({ ...i, _remove: false })));
      // load the branch food menu for the add picker
      setMenuLoad(true);
      try {
        const m = await foodMenuAPI.getAll(detail.company_unique_id);
        setMenu(Array.isArray(m) ? m.filter(x => x.is_available !== false) : []);
      } catch { setMenu([]); }
      setMenuLoad(false);
    } catch (e) {
      showToast?.(e.message || 'Could not open bill', 'error');
    }
  };

  const closeEditor = () => { setEditing(null); setItems([]); setAdds([]); setMenu([]); };

  const toggleRemove = (id) =>
    setItems(prev => prev.map(i => (i.order_item_id === id ? { ...i, _remove: !i._remove } : i)));

  const addFromPicker = () => {
    const m = menu.find(x => String(x.food_menu_id) === String(picker));
    if (!m) return;
    setAdds(prev => [...prev, {
      food_menu_id: m.food_menu_id,
      item_name:    m.name,
      item_code:    m.code || '',
      category_id:  m.category_id ?? null,
      category_name: m.category_name || '',
      unit_price:   Number(m.sale_price || 0),
      quantity:     1,
      is_veg:       m.is_veg !== false,
      notes:        null,
    }]);
    setPicker('');
  };
  const setAddQty = (idx, q) =>
    setAdds(prev => prev.map((a, i) => (i === idx ? { ...a, quantity: Math.max(1, Number(q) || 1) } : a)));
  const dropAdd = (idx) => setAdds(prev => prev.filter((_, i) => i !== idx));

  // ── live preview (server still re-computes GST authoritatively) ───────────
  const keptSubtotal = items
    .filter(i => !i.is_cancelled && !i._remove)
    .reduce((s, i) => s + Math.round(Number(i.unit_price || 0)) * Number(i.quantity || 0), 0);
  const addsSubtotal = adds.reduce((s, a) => s + Math.round(Number(a.unit_price || 0)) * Number(a.quantity || 0), 0);
  const newSubtotal  = keptSubtotal + addsSubtotal;
  const hasChanges   = items.some(i => i._remove) || adds.length > 0;

  const save = async () => {
    if (!hasChanges) { showToast?.('No changes to settle', 'error'); return; }
    setSaving(true);
    const payload = {
      company_id: editing.company_unique_id,
      settled_by: user?.user_id ?? null,
      adds,
      removes: items.filter(i => i._remove && !i.is_cancelled)
                    .map(i => ({ order_item_id: i.order_item_id, reason: 'Removed during settlement' })),
    };
    try {
      await settlementAPI.settle(editing.bill_id, payload);
      showToast?.('Bill settled — order, bill, dues & audit updated', 'success');
      closeEditor();
      load();
    } catch (e) {
      showToast?.(e.message || 'Settlement failed', 'error');
    }
    setSaving(false);
  };

  return (
    <div className="page">
      <PageHeader title="Bill Settlement" subtitle="Edit a billed order — add or remove items and re-settle dues" />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <label style={lbl}>From</label>
          <input type="date" className="input" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>To</label>
          <input type="date" className="input" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Branch</label>
          <select className="input" value={branchId} onChange={e => setBranchId(e.target.value)}>
            <option value="all">All branches</option>
            {tree.map(p => (
              <optgroup key={p.company_unique_id} label={p.name}>
                <option value={p.company_unique_id}>{p.name}{p.children.length ? ` (+ ${p.children.length} branch)` : ''}</option>
                {p.children.map(c => (
                  <option key={c.company_unique_id} value={c.company_unique_id}>&nbsp;&nbsp;↳ {c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={lbl}>Bill number</label>
          <input className="input" placeholder="e.g. BILL-2026-0021" value={billSearch} onChange={e => setBillSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Search'}
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill #</th><th>Date</th><th>Branch</th><th>Table</th>
                <th>Customer</th><th>Type</th><th>Payment</th>
                <th style={{ textAlign: 'right' }}>Total</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#888' }}>{note || 'No bills'}</td></tr>
              ) : filtered.map(b => (
                <tr key={b.bill_id}>
                  <td style={{ fontWeight: 600 }}>{b.bill_number}</td>
                  <td>{(b.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td>{b.company_name}</td>
                  <td>{b.table_name || '—'}</td>
                  <td>{b.customer_name || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{(b.order_type || '').replace('_', ' ')}</td>
                  <td style={{ textTransform: 'uppercase' }}>{b.payment_method}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(b.total_payable)}</td>
                  <td><button className="btn btn-sm btn-ghost" onClick={() => openEditor(b)}>✏️ Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor modal */}
      {editing && (
        <Modal title={`Settle ${editing.bill_number || 'Bill'}`} onClose={closeEditor} size="lg">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#555', marginBottom: 12 }}>
            <span><strong>Order:</strong> {editing.order?.order_number || '—'}</span>
            <span><strong>Branch:</strong> {editing.company_name || editing.company_unique_id}</span>
            <span><strong>Customer:</strong> {editing.customer_name || editing.order?.customer_name || '—'}</span>
            <span><strong>Current total:</strong> {fmt(editing.total_payable)}</span>
          </div>

          {/* current items */}
          <div style={sect}>Current items</div>
          <table className="data-table" style={{ marginBottom: 16 }}>
            <thead><tr><th>Item</th><th style={{ textAlign: 'center' }}>Qty</th><th style={{ textAlign: 'right' }}>Price</th><th style={{ textAlign: 'right' }}>Line</th><th></th></tr></thead>
            <tbody>
              {items.map(i => {
                const cancelled = i.is_cancelled;
                const strike = cancelled || i._remove;
                return (
                  <tr key={i.order_item_id} style={{ opacity: strike ? 0.5 : 1 }}>
                    <td style={{ textDecoration: strike ? 'line-through' : 'none' }}>
                      {i.item_name}{cancelled && <span style={tag}>already removed</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>{i.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(i.unit_price)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(Math.round(Number(i.unit_price || 0)) * Number(i.quantity || 0))}</td>
                    <td style={{ textAlign: 'right' }}>
                      {!cancelled && (
                        <button className={`btn btn-sm ${i._remove ? 'btn-secondary' : 'btn-danger'}`} onClick={() => toggleRemove(i.order_item_id)}>
                          {i._remove ? 'Undo' : 'Remove'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* add items */}
          <div style={sect}>Add items</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <select className="input" value={picker} onChange={e => setPicker(e.target.value)} style={{ flex: 1 }} disabled={menuLoad}>
              <option value="">{menuLoad ? 'Loading menu…' : 'Select an item to add…'}</option>
              {menu.map(m => (
                <option key={m.food_menu_id} value={m.food_menu_id}>{m.name} — {fmt(m.sale_price)}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={addFromPicker} disabled={!picker}>Add</button>
          </div>
          {adds.length > 0 && (
            <table className="data-table" style={{ marginBottom: 16 }}>
              <tbody>
                {adds.map((a, idx) => (
                  <tr key={idx} style={{ background: 'rgba(34,197,94,.06)' }}>
                    <td>{a.item_name}<span style={{ ...tag, background: '#16a34a' }}>new</span></td>
                    <td style={{ textAlign: 'center', width: 90 }}>
                      <input type="number" min={1} className="input" style={{ width: 64, padding: '4px 6px' }}
                             value={a.quantity} onChange={e => setAddQty(idx, e.target.value)} />
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmt(a.unit_price)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(Math.round(a.unit_price) * a.quantity)}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn btn-sm btn-danger" onClick={() => dropAdd(idx)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* preview + actions */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: '#555' }}>
              New subtotal: <strong>{fmt(newSubtotal)}</strong>
              <span style={{ marginLeft: 10, color: '#999' }}>(SGST/CGST &amp; final total recomputed on save)</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={closeEditor}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !hasChanges}>
                {saving ? 'Settling…' : 'Settle bill'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const lbl  = { display: 'block', fontSize: 12, color: '#666', marginBottom: 4 };
const sect = { fontWeight: 600, fontSize: 13, margin: '4px 0 8px', color: '#333' };
const tag  = { fontSize: 10, background: '#dc2626', color: '#fff', padding: '1px 6px', borderRadius: 8, marginLeft: 8, verticalAlign: 'middle' };
