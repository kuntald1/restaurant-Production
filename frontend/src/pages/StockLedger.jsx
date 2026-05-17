/**
 * StockLedger.jsx — Complete stock movement history
 * 
 * Features:
 *  1. Table view — every IN/OUT with running balance
 *  2. Flow diagram — Sankey-style source→destination per item
 *     e.g. CK produced 10 → Waste 1 → Dharmatala 5 → Remaining 4
 */

import { useEffect, useState, useMemo } from 'react';
import { invLedgerAPI, invItemAPI, invCategoryAPI } from '../services/api';
import { useInventoryNodes } from './useInventoryNodes';
import { Spinner, PageHeader } from '../components/UI';
import { useApp } from '../context/useApp';

const today      = () => new Date().toISOString().split('T')[0];
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; };

const TXN_META = {
  grn_in:          { label: 'GRN In',           color: '#16a34a', bg: '#dcfce7', icon: '📥', dir: 'in'  },
  production_in:   { label: 'Production',       color: '#2563eb', bg: '#dbeafe', icon: '🏭', dir: 'in'  },
  transfer_in:     { label: 'Transfer In',      color: '#0891b2', bg: '#cffafe', icon: '📦', dir: 'in'  },
  transfer_out:    { label: 'Transfer Out',     color: '#d97706', bg: '#fef3c7', icon: '🚚', dir: 'out' },
  consumption_out: { label: 'Consumption',      color: '#7c3aed', bg: '#ede9fe', icon: '🍳', dir: 'out' },
  waste_out:       { label: 'Waste',            color: '#dc2626', bg: '#fee2e2', icon: '🗑️', dir: 'out' },
  audit_in:        { label: 'Audit Adj (+)',    color: '#059669', bg: '#d1fae5', icon: '📋', dir: 'in'  },
  audit_out:       { label: 'Audit Adj (-)',    color: '#b45309', bg: '#fef3c7', icon: '📋', dir: 'out' },
};

const LEDGER_CARD = { background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, padding: '16px 18px' };

// ─────────────────────────────────────────────────────────────
// SANKEY FLOW COMPONENT
// Shows: Source → [transactions] → Remaining
// ─────────────────────────────────────────────────────────────
function SankeyFlow({ itemName, rows, nodeName }) {
  if (!rows || rows.length === 0) return null;

  // Compute totals per transaction type
  const totals = {};
  rows.forEach(r => {
    if (!totals[r.txn_code]) totals[r.txn_code] = { qty: 0, meta: TXN_META[r.txn_code], refs: [] };
    totals[r.txn_code].qty  += r.qty_in + r.qty_out;
    totals[r.txn_code].refs.push(r.ref_number);
  });

  const totalIn    = rows.reduce((s, r) => s + r.qty_in,  0);
  const totalOut   = rows.reduce((s, r) => s + r.qty_out, 0);
  const remaining  = Math.max(0, totalIn - totalOut);
  const maxFlow    = totalIn || 1;

  // Separate sources (IN) and destinations (OUT)
  const sources = Object.entries(totals).filter(([, v]) => v.meta?.dir === 'in');
  const dests   = Object.entries(totals).filter(([, v]) => v.meta?.dir === 'out');

  const W = 700;
  const H = Math.max(220, (Math.max(sources.length, dests.length + 1)) * 80 + 60);
  const MID_X = W / 2;
  const BOX_W = 140;
  const BOX_H = 44;

  // Layout source nodes
  const srcNodes = sources.map(([code, v], i) => ({
    code, ...v,
    x: 20, y: 30 + i * 72,
    w: BOX_W, h: BOX_H,
  }));

  // Layout destination nodes (OUT types + remaining)
  const destItems = [
    ...dests.map(([code, v]) => ({ code, ...v, isRemain: false })),
    { code: 'remaining', qty: remaining, meta: { label: 'Remaining Stock', color: '#22c55e', bg: '#f0fdf4', icon: '📊' }, refs: [], isRemain: true },
  ].filter(d => d.qty > 0);

  const destNodes = destItems.map((d, i) => ({
    ...d,
    x: W - BOX_W - 20, y: 30 + i * 72,
    w: BOX_W, h: BOX_H,
  }));

  // Central item box
  const ctrY = H / 2 - BOX_H / 2;

  // Build flow lines: src → center → dest
  const lineWidth = (qty) => Math.max(2, Math.round((qty / maxFlow) * 28));

  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 520, height: H }}>
        <defs>
          {Object.entries(TXN_META).map(([code, m]) => (
            <linearGradient key={code} id={`grad_${code}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={m.color} stopOpacity="0.6" />
              <stop offset="100%" stopColor={m.color} stopOpacity="0.15" />
            </linearGradient>
          ))}
          <linearGradient id="grad_remaining" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.6" />
          </linearGradient>
        </defs>

        {/* ── Flow lines: SOURCE → CENTER ── */}
        {srcNodes.map((sn, i) => {
          const srcMidY = sn.y + sn.h / 2;
          const lw = lineWidth(sn.qty);
          const ctrlX = MID_X - BOX_W / 2;
          return (
            <path key={`sl_${i}`}
              d={`M ${sn.x + sn.w} ${srcMidY} C ${ctrlX - 40} ${srcMidY}, ${ctrlX - 40} ${ctrY + BOX_H / 2}, ${ctrlX} ${ctrY + BOX_H / 2}`}
              fill="none" stroke={`url(#grad_${sn.code})`} strokeWidth={lw} strokeLinecap="round" opacity="0.7"
            />
          );
        })}

        {/* ── Flow lines: CENTER → DESTINATION ── */}
        {destNodes.map((dn, i) => {
          const dstMidY = dn.y + dn.h / 2;
          const lw = lineWidth(dn.qty);
          const ctrlX = MID_X + BOX_W / 2;
          const color = dn.isRemain ? '#22c55e' : (dn.meta?.color || '#888');
          const gradId = dn.isRemain ? 'grad_remaining' : `grad_${dn.code}`;
          return (
            <path key={`dl_${i}`}
              d={`M ${ctrlX} ${ctrY + BOX_H / 2} C ${ctrlX + 40} ${ctrY + BOX_H / 2}, ${ctrlX + 40} ${dstMidY}, ${dn.x} ${dstMidY}`}
              fill="none" stroke={`url(#${gradId})`} strokeWidth={lw} strokeLinecap="round" opacity="0.7"
            />
          );
        })}

        {/* ── Central item box ── */}
        <rect x={MID_X - BOX_W / 2} y={ctrY} width={BOX_W} height={BOX_H}
          rx="10" fill="#1e293b" />
        <text x={MID_X} y={ctrY + 16} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700">
          {itemName.length > 18 ? itemName.slice(0, 16) + '…' : itemName}
        </text>
        <text x={MID_X} y={ctrY + 30} textAnchor="middle" fill="#94a3b8" fontSize="10">
          {nodeName}
        </text>

        {/* ── Source nodes (LEFT) ── */}
        {srcNodes.map((sn, i) => (
          <g key={`sbox_${i}`}>
            <rect x={sn.x} y={sn.y} width={sn.w} height={sn.h}
              rx="8" fill={sn.meta?.bg || '#f5f5f5'} stroke={sn.meta?.color || '#888'} strokeWidth="1.5" />
            <text x={sn.x + 10} y={sn.y + 17} fontSize="14">{sn.meta?.icon}</text>
            <text x={sn.x + 28} y={sn.y + 16} fontSize="10" fontWeight="700" fill={sn.meta?.color || '#333'}>
              {sn.meta?.label}
            </text>
            <text x={sn.x + 28} y={sn.y + 30} fontSize="11" fontWeight="800" fill="#111">
              +{sn.qty.toFixed(2)}
            </text>
          </g>
        ))}

        {/* ── Destination nodes (RIGHT) ── */}
        {destNodes.map((dn, i) => {
          const color = dn.isRemain ? '#16a34a' : (dn.meta?.color || '#888');
          const bg    = dn.isRemain ? '#f0fdf4' : (dn.meta?.bg || '#f5f5f5');
          const icon  = dn.isRemain ? '📊' : dn.meta?.icon;
          const lbl   = dn.isRemain ? 'Remaining' : dn.meta?.label;
          return (
            <g key={`dbox_${i}`}>
              <rect x={dn.x} y={dn.y} width={dn.w} height={dn.h}
                rx="8" fill={bg} stroke={color} strokeWidth={dn.isRemain ? 2.5 : 1.5} />
              <text x={dn.x + 10} y={dn.y + 17} fontSize="14">{icon}</text>
              <text x={dn.x + 28} y={dn.y + 16} fontSize="10" fontWeight="700" fill={color}>
                {lbl}
              </text>
              <text x={dn.x + 28} y={dn.y + 30} fontSize="11" fontWeight="800" fill="#111">
                {dn.isRemain ? dn.qty.toFixed(2) : `-${dn.qty.toFixed(2)}`}
              </text>
            </g>
          );
        })}

        {/* ── Flow qty labels on lines ── */}
        {srcNodes.map((sn, i) => (
          <text key={`stxt_${i}`}
            x={(sn.x + sn.w + MID_X - BOX_W / 2) / 2}
            y={sn.y + sn.h / 2 - 6}
            fontSize="9" fill={sn.meta?.color} fontWeight="600" textAnchor="middle">
            {sn.qty.toFixed(2)}
          </text>
        ))}
        {destNodes.map((dn, i) => (
          <text key={`dtxt_${i}`}
            x={(MID_X + BOX_W / 2 + dn.x) / 2}
            y={dn.y + dn.h / 2 - 6}
            fontSize="9" fill={dn.isRemain ? '#16a34a' : dn.meta?.color} fontWeight="600" textAnchor="middle">
            {dn.qty.toFixed(2)}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RUNNING BALANCE SPARKLINE
// ─────────────────────────────────────────────────────────────
function BalanceSparkline({ rows }) {
  if (!rows || rows.length < 2) return null;
  const W = 500, H = 100, PAD = 32;
  const balances = rows.map(r => r.balance);
  const minB = Math.min(0, ...balances);
  const maxB = Math.max(...balances, 1);
  const range = maxB - minB || 1;
  const toX = i => PAD + (i / (rows.length - 1)) * (W - PAD * 2);
  const toY = v => PAD + ((maxB - v) / range) * (H - PAD * 2);
  const zeroY = toY(0);
  const pts  = rows.map((r, i) => `${toX(i)},${toY(r.balance)}`).join(' ');
  const area = `${toX(0)},${zeroY} ${pts} ${toX(rows.length-1)},${zeroY}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
      <polygon points={area} fill="#22c55e" opacity="0.1" />
      <polyline points={pts} fill="none" stroke="#22c55e" strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
      {rows.map((r, i) => {
        const m = TXN_META[r.txn_code] || {};
        return <circle key={i} cx={toX(i)} cy={toY(r.balance)} r="3"
          fill={m.color || '#22c55e'} stroke="#fff" strokeWidth="1.5">
          <title>{r.txn_date} · {m.label || r.txn_type} · {r.qty_in > 0 ? '+' : '-'}{r.qty_in || r.qty_out} · Balance: {r.balance}</title>
        </circle>;
      })}
      {[minB, maxB].map((v, i) => (
        <text key={i} x={4} y={toY(v) + 4} fontSize="9" fill="#9ca3af">{v.toFixed(1)}</text>
      ))}
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
export default function StockLedger() {
  const { selectedCompany, allCompanies, user } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const myParentId    = selectedCompany?.parant_company_unique_id;
  const isChildBranch = !!(myParentId && Number(myParentId) !== 0);
  const rootCid       = isChildBranch ? myParentId : cid;
  const isAdmin       = !!user?.is_admin || !!user?.is_super_admin;

  const [ledger,     setLedger]     = useState([]);
  const [items,      setItems]      = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(false);

  const [filterNode, setFilterNode] = useState('');
  const [filterItem, setFilterItem] = useState('');
  const [filterCat,  setFilterCat]  = useState('');
  const [fromDate,   setFromDate]   = useState(monthStart());
  const [toDate,     setToDate]     = useState(today());
  const [viewMode,   setViewMode]   = useState('flow');

  const { nodes } = useInventoryNodes(cid, selectedCompany, allCompanies);

  // visibleNodes MUST be after nodes declaration
  const visibleNodes = (() => {
    if (!nodes.length) return nodes;
    if (isAdmin) return nodes;
    if (isChildBranch) return nodes.filter(n => String(n.node_id).replace('b_','') === String(cid));
    return nodes.filter(n => !String(n.node_id).startsWith('b_') || n.depth === 1 || Number(String(n.node_id).replace('b_','')) === Number(cid));
  })();

  // Define load before useEffects to avoid TDZ in minified bundle
  async function load() {
    if (!cid) return;
    setLoading(true);
    try {
      // Ledger uses own cid — transactions (consumption, GRN, transfers) are stored under own company
      // For child branch: also fetch parent's transactions (transfers come from parent)
      const nodeInt = filterNode ? parseInt(String(filterNode).replace('b_','')) : null;
      const itemInt = filterItem ? parseInt(filterItem) : null;
      const data    = await invLedgerAPI.get(cid, { node_id: nodeInt, item_id: itemInt, from_date: fromDate, to_date: toDate });
      setLedger(data || []);
    } catch (e) { setLedger([]); }
    setLoading(false);
  }

  useEffect(() => {
    if (!cid) return;
    const api = rootCid || cid;  // items/categories from root company
    Promise.allSettled([invItemAPI.getAll(api), invCategoryAPI.getAll(api)]).then(([it, ca]) => {
      setItems(it.status === 'fulfilled' ? it.value || [] : []);
      setCategories(ca.status === 'fulfilled' ? ca.value || [] : []);
    });
  }, [cid]);

  useEffect(() => { load(); }, [cid]);

  const filteredItems = filterCat
    ? items.filter(i => String(i.item_category_id||i.category_id) === String(filterCat))
    : items;

  const filtered = useMemo(() => {
    let rows = ledger;
    if (filterCat) {
      rows = rows.filter(r => {
        const it = items.find(i => i.item_id === r.item_id);
        return String(it?.item_category_id||it?.category_id) === String(filterCat);
      });
    }
    return rows;
  }, [ledger, filterCat, items]);

  // Group by item+node for flow diagram
  const byItemNode = useMemo(() => {
    const map = {};
    filtered.forEach(r => {
      const key = `${r.item_id}_${r.node_id}`;
      if (!map[key]) map[key] = { itemName: r.item_name, nodeName: r.node_name, rows: [] };
      map[key].rows.push(r);
    });
    return Object.values(map);
  }, [filtered]);

  const totalIn   = filtered.reduce((s, r) => s + r.qty_in,  0);
  const totalOut  = filtered.reduce((s, r) => s + r.qty_out, 0);
  const waste     = filtered.filter(r => r.txn_code === 'waste_out').reduce((s,r) => s + r.qty_out, 0);

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">📒</div><h3>No company selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader title="📒 Stock Ledger" subtitle="Complete movement history — GRN · Production · Transfer · Consumption · Waste" />

      {/* ── Filters ── */}
      <div style={{ ...LEDGER_CARD, marginBottom: 18, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {[
          { lbl: 'BRANCH / NODE', el: <select value={filterNode} onChange={e => setFilterNode(e.target.value)}
              style={{ padding: '7px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <option value="">All Nodes</option>
              {visibleNodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_label||n.node_name}</option>)}
            </select> },
          { lbl: 'CATEGORY', el: <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setFilterItem(''); }}
              style={{ padding: '7px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.category_id||c.item_category_id} value={c.category_id||c.item_category_id}>{c.category_name}</option>)}
            </select> },
          { lbl: 'ITEM', el: <select value={filterItem} onChange={e => setFilterItem(e.target.value)}
              style={{ padding: '7px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <option value="">All Items</option>
              {filteredItems.map(i => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}
            </select> },
          { lbl: 'FROM', el: <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              style={{ padding: '7px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #e5e7eb' }} /> },
          { lbl: 'TO',   el: <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              style={{ padding: '7px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #e5e7eb' }} /> },
        ].map(f => (
          <div key={f.lbl}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 5, letterSpacing: '.05em' }}>{f.lbl}</div>
            {f.el}
          </div>
        ))}
        <button onClick={load} style={{ padding: '7px 18px', borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-end' }}>
          Apply
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignSelf: 'flex-end' }}>
          {[['flow','🔀 Flow'],['table','📋 Table']].map(([v,l]) => (
            <button key={v} onClick={() => setViewMode(v)}
              style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: viewMode === v ? 700 : 400,
                background: viewMode === v ? '#22c55e' : '#fff', color: viewMode === v ? '#fff' : '#6b7280',
                border: '1px solid #e5e7eb', cursor: 'pointer' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { e:'📥', l:'Total In',     v: totalIn.toFixed(2),        c:'#22c55e', bg:'#f0fdf4' },
          { e:'📤', l:'Total Out',    v: totalOut.toFixed(2),       c:'#ef4444', bg:'#fef2f2' },
          { e:'🗑️', l:'Waste',        v: waste.toFixed(2),          c:'#f59e0b', bg:'#fffbeb' },
          { e:'📊', l:'Transactions', v: filtered.length,           c:'#3b82f6', bg:'#eff6ff' },
        ].map(c => (
          <div key={c.l} style={{ ...LEDGER_CARD, borderTop:`3px solid ${c.c}`, display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:c.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{c.e}</div>
            <div>
              <div style={{ fontSize:22, fontWeight:700, color:c.c, lineHeight:1 }}>{c.v}</div>
              <div style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>{c.l}</div>
            </div>
          </div>
        ))}
      </div>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📒</div>
          <h3>No ledger entries found</h3>
          <p>Adjust the date range or filters and click Apply.</p>
        </div>
      ) : viewMode === 'flow' ? (
        /* ══════════════════════════════════
           FLOW VIEW — one card per item+node
        ══════════════════════════════════ */
        <div>
          {byItemNode.map((grp, idx) => {
            const tin  = grp.rows.reduce((s,r) => s + r.qty_in,  0);
            const tout = grp.rows.reduce((s,r) => s + r.qty_out, 0);
            const rem  = Math.max(0, tin - tout).toFixed(2);
            return (
              <div key={idx} style={{ ...LEDGER_CARD, marginBottom: 20 }}>
                {/* Card header */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:16 }}>📦 {grp.itemName}</div>
                    <div style={{ fontSize:12, color:'#9ca3af', marginTop:2 }}>📍 {grp.nodeName} · {grp.rows.length} transactions</div>
                  </div>
                  <div style={{ display:'flex', gap:12 }}>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:700, color:'#22c55e' }}>+{tin.toFixed(2)}</div>
                      <div style={{ fontSize:10, color:'#9ca3af' }}>Total In</div>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:700, color:'#ef4444' }}>-{tout.toFixed(2)}</div>
                      <div style={{ fontSize:10, color:'#9ca3af' }}>Total Out</div>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:700, color:'#22c55e' }}>{rem}</div>
                      <div style={{ fontSize:10, color:'#9ca3af' }}>Remaining</div>
                    </div>
                  </div>
                </div>

                {/* Sankey flow */}
                <div style={{ background:'#fafafa', borderRadius:10, padding:'12px 8px', marginBottom:12 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#6b7280', marginBottom:8, paddingLeft:8 }}>
                    Stock flow diagram
                  </div>
                  <SankeyFlow itemName={grp.itemName} rows={grp.rows} nodeName={grp.nodeName} />
                </div>

                {/* Balance sparkline */}
                <div style={{ background:'#fafafa', borderRadius:10, padding:'12px 8px', marginBottom:12 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#6b7280', marginBottom:4, paddingLeft:8 }}>
                    Running balance over time
                  </div>
                  <BalanceSparkline rows={grp.rows} />
                </div>

                {/* Timeline pills */}
                <div style={{ fontSize:11, fontWeight:600, color:'#6b7280', marginBottom:6 }}>Transaction timeline</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {grp.rows.map((r, i) => {
                    const m = TXN_META[r.txn_code] || { color:'#888', bg:'#f5f5f5', icon:'•', label:r.txn_type };
                    return (
                      <div key={i}
                        title={`${r.txn_date} · ${m.label} · ${r.ref_number || ''} · ${r.qty_in > 0 ? '+' : '-'}${r.qty_in || r.qty_out} · Balance: ${r.balance}`}
                        style={{ padding:'3px 10px', borderRadius:99, background:m.bg, color:m.color,
                          fontSize:11, fontWeight:600, border:`1px solid ${m.color}30`, cursor:'default', whiteSpace:'nowrap' }}>
                        {m.icon} {r.txn_date?.slice(5)} &nbsp;
                        <span style={{ fontWeight:800 }}>
                          {r.qty_in > 0 ? `+${r.qty_in.toFixed(2)}` : `-${r.qty_out.toFixed(2)}`}
                        </span>
                        &nbsp;→ {r.balance.toFixed(2)}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ══════════════════════════════════
           TABLE VIEW
        ══════════════════════════════════ */
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th><th>Type</th><th>Reference</th><th>Node</th>
                <th>Item</th><th>Category</th>
                <th style={{ color:'#22c55e' }}>In (+)</th>
                <th style={{ color:'#ef4444' }}>Out (−)</th>
                <th>Unit Cost</th><th>Value</th>
                <th style={{ color:'#3b82f6' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const m = TXN_META[r.txn_code] || { color:'#888', bg:'#f5f5f5', icon:'•', label:r.txn_type };
                return (
                  <tr key={i} style={{ background: r.balance < 0 ? '#fef2f2' : undefined }}>
                    <td style={{ fontSize:12, color:'#9ca3af', whiteSpace:'nowrap' }}>{r.txn_date}</td>
                    <td>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px',
                        borderRadius:99, background:m.bg, color:m.color, fontSize:11, fontWeight:600 }}>
                        {m.icon} {m.label}
                      </span>
                    </td>
                    <td style={{ fontSize:12, fontFamily:'monospace', color:'#9ca3af' }}>{r.ref_number||'—'}</td>
                    <td style={{ fontSize:12 }}>{r.node_name}</td>
                    <td style={{ fontWeight:600 }}>{r.item_name}</td>
                    <td style={{ fontSize:12, color:'#9ca3af' }}>{r.category_name}</td>
                    <td style={{ fontWeight:700, color:'#22c55e' }}>{r.qty_in  > 0 ? `+${r.qty_in.toFixed(3)}`  : '—'}</td>
                    <td style={{ fontWeight:700, color:'#ef4444' }}>{r.qty_out > 0 ? `-${r.qty_out.toFixed(3)}` : '—'}</td>
                    <td style={{ fontSize:12 }}>₹{r.unit_cost.toFixed(2)}</td>
                    <td style={{ fontSize:12 }}>₹{r.value.toFixed(2)}</td>
                    <td>
                      <span style={{ fontWeight:700, fontSize:14,
                        color: r.balance < 0 ? '#ef4444' : r.balance === 0 ? '#9ca3af' : '#22c55e' }}>
                        {r.balance.toFixed(3)}
                      </span>
                      {r.balance < 0 && <span style={{ fontSize:10, color:'#ef4444', marginLeft:3 }}>⚠️</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'#f9fafb', fontWeight:700 }}>
                <td colSpan={6} style={{ textAlign:'right', fontSize:12, color:'#9ca3af' }}>TOTAL</td>
                <td style={{ color:'#22c55e' }}>+{totalIn.toFixed(3)}</td>
                <td style={{ color:'#ef4444' }}>-{totalOut.toFixed(3)}</td>
                <td colSpan={2}></td>
                <td style={{ color:'#3b82f6' }}>{(totalIn - totalOut).toFixed(3)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
