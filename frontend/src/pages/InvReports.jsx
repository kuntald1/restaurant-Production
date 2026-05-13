/**
 * InvReports.jsx — Inventory Reports
 * Clean warehouse-style dashboard with 3-level drill-down.
 * Design: solid colored icon badges with white icons, crisp typography,
 *         no washed-out pastels — based on approved mockup.
 */

import { useEffect, useState, useMemo } from 'react';
import {
  invReportsAPI, invStockAPI, invItemAPI, invCategoryAPI,
  invGrnAPI, invTransferAPI, invConsumptionAPI,
} from '../services/api';
import { useInventoryNodes } from './useInventoryNodes';
import { Spinner, PageHeader, Badge } from '../components/UI';
import { useApp } from '../context/useApp';

const today      = () => new Date().toISOString().split('T')[0];
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; };

// ── Status logic ──────────────────────────────────────────────
const getStatus = (onHand, reorder) => {
  if (onHand <= reorder)                       return 'low';
  if (onHand <= reorder * 1.2 && reorder > 0) return 'warn';
  return 'ok';
};

// Clean, vivid palette — solid backgrounds, white icons
const PALETTE = {
  green:  { solid: '#22c55e', light: '#f0fdf4', text: '#15803d', border: '#86efac' },
  red:    { solid: '#ef4444', light: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
  amber:  { solid: '#f59e0b', light: '#fffbeb', text: '#b45309', border: '#fcd34d' },
  teal:   { solid: '#14b8a6', light: '#f0fdfa', text: '#0f766e', border: '#5eead4' },
  purple: { solid: '#8b5cf6', light: '#faf5ff', text: '#7c3aed', border: '#c4b5fd' },
  blue:   { solid: '#3b82f6', light: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
};

// Status → palette mapping
const STATUS = {
  low:  { ...PALETTE.red,   label: 'Low stock', barColor: '#ef4444', pillBg: '#fee2e2', pillText: '#991b1b' },
  warn: { ...PALETTE.amber, label: 'Near ROL',  barColor: '#f59e0b', pillBg: '#fef3c7', pillText: '#92400e' },
  ok:   { ...PALETTE.green, label: 'OK',        barColor: '#22c55e', pillBg: '#dcfce7', pillText: '#166534' },
};

const worstOf = (rows, reorderFn) => {
  if (rows.some(b => getStatus(parseFloat(b.qty_on_hand), reorderFn(b.item_id)) === 'low'))  return 'low';
  if (rows.some(b => getStatus(parseFloat(b.qty_on_hand), reorderFn(b.item_id)) === 'warn')) return 'warn';
  return 'ok';
};
const countBy = (rows, reorderFn) => {
  const c = { low: 0, warn: 0, ok: 0 };
  rows.forEach(b => c[getStatus(parseFloat(b.qty_on_hand), reorderFn(b.item_id))]++);
  return c;
};

// ── Design tokens ─────────────────────────────────────────────
const CARD = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: '18px 20px',
};

// Icon map — emoji that definitely render everywhere
const ICON_MAP = {
  'box':                '📦',
  'map-pin':            '📍',
  'alert-triangle':     '⚠️',
  'alert-circle':       '🔔',
  'circle-check':       '✅',
  'building-warehouse': '🏭',
  'building-store':     '🏪',
  'package':            '📦',
  'arrow-bar-to-down':  '📥',
  'arrows-transfer-up': '🔄',
  'arrow-bar-up':       '📤',
  'users':              '👥',
  'currency-rupee':     '💰',
  'cloud':              '☁️',
};

// Solid icon badge with emoji
function IB({ color, icon, size = 38 }) {
  const emoji = ICON_MAP[icon] || '📦';
  return (
    <div style={{
      width: size, height: size, borderRadius: 10,
      background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontSize: Math.round(size * 0.46),
      lineHeight: 1,
    }}>
      {emoji}
    </div>
  );
}

// Status pill badge
function Pill({ status, label }) {
  const s = STATUS[status];
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: s.pillBg, color: s.pillText, whiteSpace: 'nowrap' }}>
      {label || s.label}
    </span>
  );
}

// Stock bar with ROL marker
function StockBar({ onHand, reorder, uomSymbol, height = 6 }) {
  const max     = Math.max(onHand, reorder) * 1.3 || 1;
  const fillPct = Math.min(100, (onHand / max) * 100);
  const rolPct  = Math.min(100, (reorder / max) * 100);
  const status  = getStatus(onHand, reorder);
  return (
    <div style={{ position: 'relative', height, background: 'var(--color-border-tertiary)', borderRadius: 99, overflow: 'visible' }}>
      <div style={{ width: `${fillPct}%`, height: '100%', background: STATUS[status].barColor, borderRadius: 99 }} />
      {reorder > 0 && (
        <div style={{ position: 'absolute', top: -3, left: `${rolPct}%`, width: 2, height: height + 6, background: '#ef4444', borderRadius: 1 }}
          title={`ROL: ${reorder.toFixed(3)} ${uomSymbol}`} />
      )}
    </div>
  );
}

// Level 3 item card
function ItemCard({ b, itemName, uomSymbol, nodeName, reorder }) {
  const onHand = parseFloat(b.qty_on_hand);
  const status = getStatus(onHand, reorder);
  const s      = STATUS[status];
  return (
    <div style={{ ...CARD, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: '#ffffff', borderLeft: `3px solid ${s.solid}` }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: s.light, border: '2px solid ' + s.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📦</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemName}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>{nodeName}</div>
        <StockBar onHand={onHand} reorder={reorder} uomSymbol={uomSymbol} height={5} />
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: s.solid, lineHeight: 1 }}>{onHand.toFixed(2)}</div>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{uomSymbol}</div>
        {reorder > 0 && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Min: {reorder.toFixed(2)}</div>}
      </div>
    </div>
  );
}

// Breadcrumb
function Breadcrumb({ items, onNavigate }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 18, flexWrap: 'wrap' }}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ color: 'var(--color-text-tertiary)' }}>›</span>}
            {isLast
              ? <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{item.label}</span>
              : <button onClick={() => onNavigate(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: PALETTE.green.solid, fontSize: 13, padding: 0, fontWeight: 500 }}>{item.label}</button>}
          </span>
        );
      })}
    </div>
  );
}

// Level stepper
function LevelStepper({ current }) {
  const steps = ['All nodes', 'Branch detail', 'Item view'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 22 }}>
      {steps.map((label, i) => {
        const active = i === current, done = i < current;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: active ? PALETTE.green.solid : done ? PALETTE.green.light : 'var(--color-background-secondary)',
                color: active ? '#fff' : done ? PALETTE.green.text : 'var(--color-text-tertiary)',
                border: done ? `1.5px solid ${PALETTE.green.border}` : active ? 'none' : '1.5px solid var(--color-border-tertiary)',
              }}>{done ? '✓' : i + 1}</div>
              <div style={{ fontSize: 10, color: active ? PALETTE.green.solid : 'var(--color-text-tertiary)', fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>{label}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1.5, background: done ? PALETTE.green.border : 'var(--color-border-tertiary)', margin: '0 10px', marginBottom: 18 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function InvReports() {
  const { selectedCompany, allCompanies } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [tab,         setTab]         = useState('balance');
  const [filterNode,  setFilterNode]  = useState('');
  const [filterCat,   setFilterCat]   = useState('');
  const [viewMode,    setViewMode]    = useState('dashboard');

  const [balance,     setBalance]     = useState([]);
  const [lowStock,    setLowStock]    = useState([]);
  const [items,       setItems]       = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [movement,    setMovement]    = useState([]);
  const [fromDate,    setFromDate]    = useState(monthStart());
  const [toDate,      setToDate]      = useState(today());
  const [outstanding, setOutstanding] = useState([]);
  const [activity,    setActivity]    = useState([]);
  const [loading,     setLoading]     = useState(false);

  const [drillNode, setDrillNode] = useState(null);
  const [drillCat,  setDrillCat]  = useState(null);
  const drillLevel = drillNode === null ? 0 : drillCat === null ? 1 : 2;

  const { nodes } = useInventoryNodes(cid, selectedCompany, allCompanies);

  // ── Loaders ───────────────────────────────────────────────
  const buildActivity = (grnData, transferData, consData, nodesList) => {
    const feed = [];
    grnData.filter(g => g.status === 'posted').forEach(g => {
      const qty = (g.items || []).reduce((s, it) => s + parseFloat(it.received_qty || 0), 0);
      feed.push({ label: 'GRN posted', sub: `${staticNodeName(g.node_id, nodesList)} · ${fmtDate(g.grn_date)}`, qty: `+${qty.toFixed(0)}`, color: PALETTE.green.solid, lightBg: PALETTE.green.light, borderColor: PALETTE.green.border, emoji: '📥', ts: new Date(g.grn_date) });
    });
    transferData.forEach(t => {
      const qty  = (t.items || []).reduce((s, it) => s + parseFloat(it.requested_qty || 0), 0);
      const isOk = t.status === 'received';
      const isRj = t.status === 'rejected';
      const clr  = isOk ? PALETTE.green.solid : isRj ? PALETTE.red.solid : PALETTE.amber.solid;
      const lb   = isOk ? PALETTE.green.light : isRj ? PALETTE.red.light : PALETTE.amber.light;
      const bc   = isOk ? PALETTE.green.border : isRj ? PALETTE.red.border : PALETTE.amber.border;
      feed.push({ label: isOk ? 'Transfer received' : isRj ? 'Transfer rejected' : 'Transfer dispatched', sub: fmtDate(t.transfer_date), qty: `${qty.toFixed(0)}`, color: clr, lightBg: lb, borderColor: bc, emoji: '🔄', ts: new Date(t.transfer_date) });
    });
    consData.forEach(c => {
      const qty = (c.items || []).reduce((s, it) => s + parseFloat(it.qty_consumed || 0), 0);
      feed.push({ label: 'Consumption posted', sub: fmtDate(c.consumption_date), qty: `-${qty.toFixed(0)}`, color: PALETTE.red.solid, lightBg: PALETTE.red.light, borderColor: PALETTE.red.border, emoji: '📤', ts: new Date(c.consumption_date) });
    });
    feed.sort((a, b) => b.ts - a.ts);
    return feed.slice(0, 6);
  };

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [iR, lsR, catsR, grnsR, trR, consR] = await Promise.allSettled([
        invItemAPI.getAll(cid),
        invStockAPI.getLowStock(cid),
        invCategoryAPI.getAll(cid),
        invGrnAPI.getAll(cid),
        invTransferAPI.getAllAdmin(cid),
        invConsumptionAPI.getAll(cid),
      ]);
      const itemsData    = iR.status    === 'fulfilled' ? (iR.value    || []) : [];
      const grnData      = grnsR.status === 'fulfilled' ? (grnsR.value || []) : [];
      const transferData = trR.status   === 'fulfilled' ? (trR.value   || []) : [];
      const consData     = consR.status === 'fulfilled' ? (consR.value || []) : [];
      setItems(itemsData);
      setLowStock(lsR.status    === 'fulfilled' ? (lsR.value    || []) : []);
      setCategories(catsR.status === 'fulfilled' ? (catsR.value || []) : []);
      setActivity(buildActivity(grnData, transferData, consData, nodes));
    } catch {}
    setLoading(false);
  };

  const loadBalance = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const nodeInt = filterNode ? parseInt(String(filterNode).replace('b_', '')) : null;
      setBalance((await invStockAPI.getBalance(cid, nodeInt)) || []);
    } catch { setBalance([]); }
    setLoading(false);
  };

  const loadMovement = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      setMovement((await invReportsAPI.stockMovement(cid, { from_date: fromDate, to_date: toDate, node_id: filterNode || null })) || []);
    } catch { setMovement([]); }
    setLoading(false);
  };

  const loadOutstanding = async () => {
    if (!cid) return;
    setLoading(true);
    try { setOutstanding((await invReportsAPI.supplierOutstanding(cid)) || []); }
    catch { setOutstanding([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);
  useEffect(() => { if (nodes.length && cid) load(); }, [nodes.length]);
  useEffect(() => { if (tab === 'balance')     loadBalance();    }, [tab, cid, filterNode]);
  useEffect(() => { if (tab === 'movement')    loadMovement();   }, [tab, cid]);
  useEffect(() => { if (tab === 'outstanding') loadOutstanding();}, [tab, cid]);

  // ── Lookup helpers ────────────────────────────────────────
  const getItem        = id => items.find(i => i.item_id === id);
  const getItemName    = id => getItem(id)?.item_name || `Item #${id}`;
  const getItemReorder = id => parseFloat(getItem(id)?.reorder_level || 0);
  const getItemCatId   = id => { const it = getItem(id); return it?.item_category_id ?? it?.category_id ?? null; };
  const getItemUom     = id => { const it = getItem(id); return it?.uom_symbol || it?.uom_name || ''; };
  const reorderFn      = id => getItemReorder(id);

  const getCatName = id => {
    if (!id || id === 'none') return 'Uncategorised';
    const c = categories.find(c => (c.category_id || c.item_category_id) === parseInt(id));
    return c?.category_name || `Category #${id}`;
  };
  const getNodeName = id => {
    if (!id) return '—';
    const s = String(id);
    let n = nodes.find(n => String(n.node_id) === s);
    if (n) return n.node_name;
    n = nodes.find(n => String(n.node_id).replace('b_', '') === s.replace('b_', ''));
    return n ? n.node_name : `Node #${id}`;
  };

  // ── Computed ──────────────────────────────────────────────
  const filteredBalance = useMemo(() =>
    balance.filter(b => !filterCat || String(getItemCatId(b.item_id)) === String(filterCat)),
    [balance, filterCat, items]
  );

  const balanceByNode = useMemo(() => {
    const map = {};
    filteredBalance.forEach(b => { const k = String(b.node_id); if (!map[k]) map[k] = []; map[k].push(b); });
    return map;
  }, [filteredBalance]);

  const drillNodeBalance = useMemo(() => {
    if (!drillNode) return [];
    const ns = String(drillNode).replace('b_', '');
    return filteredBalance.filter(b => String(b.node_id).replace('b_', '') === ns);
  }, [filteredBalance, drillNode]);

  const drillNodeByCat = useMemo(() => {
    const map = {};
    drillNodeBalance.forEach(b => { const k = String(getItemCatId(b.item_id) ?? 'none'); if (!map[k]) map[k] = []; map[k].push(b); });
    return map;
  }, [drillNodeBalance, items]);

  const drillCatItems = useMemo(() => {
    if (!drillCat) return [];
    return drillNodeBalance
      .filter(b => String(getItemCatId(b.item_id) ?? 'none') === String(drillCat))
      .sort((a, b) => {
        const o = { low: 0, warn: 1, ok: 2 };
        return o[getStatus(parseFloat(a.qty_on_hand), getItemReorder(a.item_id))]
             - o[getStatus(parseFloat(b.qty_on_hand), getItemReorder(b.item_id))];
      });
  }, [drillNodeBalance, drillCat, items]);

  const allLow  = filteredBalance.filter(b => getStatus(parseFloat(b.qty_on_hand), getItemReorder(b.item_id)) === 'low').length;
  const allWarn = filteredBalance.filter(b => getStatus(parseFloat(b.qty_on_hand), getItemReorder(b.item_id)) === 'warn').length;

  const movementSummary = {};
  movement.forEach(m => {
    if (!movementSummary[m.item_id]) movementSummary[m.item_id] = { in: 0, out: 0, waste: 0, in_value: 0, out_value: 0 };
    if (m.type === 'grn_in')          { movementSummary[m.item_id].in    += parseFloat(m.qty || 0); movementSummary[m.item_id].in_value  += parseFloat(m.value || 0); }
    if (m.type === 'consumption_out') { movementSummary[m.item_id].out   += parseFloat(m.qty || 0); movementSummary[m.item_id].out_value += parseFloat(m.value || 0); }
    if (m.type === 'waste_out')       { movementSummary[m.item_id].waste += parseFloat(m.qty || 0); }
  });

  const breadcrumbItems = [{ label: 'All nodes' }];
  if (drillNode !== null) breadcrumbItems.push({ label: getNodeName(drillNode) });
  if (drillCat  !== null) breadcrumbItems.push({ label: getCatName(drillCat) });

  const handleBreadcrumb = idx => {
    if (idx === 0) { setDrillNode(null); setDrillCat(null); }
    if (idx === 1) { setDrillCat(null); }
  };

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  // ── Section heading helper ────────────────────────────────
  const SectionHead = ({ title, hint }) => (
    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 12 }}>
      {title}
      {hint && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>{hint}</span>}
    </div>
  );

  return (
    <div className="page">
      <PageHeader title="📊 Inventory Reports" subtitle="Stock balance · movement analysis · supplier outstanding" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1.5px solid var(--color-border-tertiary)' }}>
        {[['balance', '📦 Stock Balance'], ['movement', '📈 Movement'], ['outstanding', '💸 Supplier Outstanding']].map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setDrillNode(null); setDrillCat(null); }} style={{
            padding: '9px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === key ? 600 : 400, fontSize: 13,
            borderBottom: tab === key ? `2.5px solid ${PALETTE.green.solid}` : '2.5px solid transparent',
            color: tab === key ? PALETTE.green.solid : 'var(--color-text-tertiary)', marginBottom: -1.5,
            transition: 'color .15s',
          }}>{label}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {(tab === 'balance' || tab === 'movement') && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 5, letterSpacing: '0.05em' }}>FILTER BY NODE</div>
            <select className="input select" value={filterNode} onChange={e => { setFilterNode(e.target.value); setDrillNode(null); setDrillCat(null); }} style={{ padding: '7px 12px', fontSize: 13, borderRadius: 8 }}>
              <option value="">All Nodes</option>
              {nodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_label || n.node_name}</option>)}
            </select>
          </div>
        )}
        {tab === 'balance' && (
          <>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 5, letterSpacing: '0.05em' }}>FILTER BY CATEGORY</div>
              <select className="input select" value={filterCat} onChange={e => { setFilterCat(e.target.value); setDrillCat(null); }} style={{ padding: '7px 12px', fontSize: 13, borderRadius: 8 }}>
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.category_id || c.item_category_id} value={c.category_id || c.item_category_id}>{c.category_name}</option>)}
              </select>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={() => setViewMode('dashboard')} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: viewMode === 'dashboard' ? 600 : 400, background: viewMode === 'dashboard' ? PALETTE.green.solid : 'transparent', color: viewMode === 'dashboard' ? '#fff' : 'var(--color-text-secondary)', border: `1px solid ${viewMode === 'dashboard' ? PALETTE.green.solid : 'var(--color-border-secondary)'}`, cursor: 'pointer' }}>
                📊 Dashboard
              </button>
              <button onClick={() => setViewMode('table')} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: viewMode === 'table' ? 600 : 400, background: viewMode === 'table' ? PALETTE.green.solid : 'transparent', color: viewMode === 'table' ? '#fff' : 'var(--color-text-secondary)', border: `1px solid ${viewMode === 'table' ? PALETTE.green.solid : 'var(--color-border-secondary)'}`, cursor: 'pointer' }}>
                📋 Table
              </button>
            </div>
          </>
        )}
        {tab === 'movement' && (
          <>
            {[['FROM', fromDate, setFromDate], ['TO', toDate, setToDate]].map(([lbl, val, setter]) => (
              <div key={lbl}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 5, letterSpacing: '0.05em' }}>{lbl}</div>
                <input type="date" className="input" value={val} onChange={e => setter(e.target.value)} style={{ padding: '7px 12px', fontSize: 13, borderRadius: 8 }} />
              </div>
            ))}
            <button onClick={loadMovement} style={{ alignSelf: 'flex-end', padding: '7px 16px', borderRadius: 8, background: PALETTE.green.solid, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
          </>
        )}
      </div>

      {loading ? <Spinner /> : (
        <>

          {/* ══════════════════ STOCK BALANCE ══════════════════ */}
          {tab === 'balance' && (
            <div>
              {filteredBalance.length === 0 && (
                <div className="empty-state"><div className="empty-icon">📦</div><h3>No Stock Data</h3><p>Post a GRN to see stock balances.</p></div>
              )}

              {filteredBalance.length > 0 && viewMode === 'dashboard' && (
                <>
                  <LevelStepper current={drillLevel} />
                  {drillLevel > 0 && <Breadcrumb items={breadcrumbItems} onNavigate={handleBreadcrumb} />}

                  {/* ── LEVEL 1: All nodes ── */}
                  {drillLevel === 0 && (
                    <>
                      {/* 4 hero stat cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 24 }}>
                        {[
                          { emoji: '📦', accent: PALETTE.green.solid, lightBg: PALETTE.green.light, val: filteredBalance.length,            lbl: 'Total stock items', trend: '+8.2%', up: true  },
                          { emoji: '📍', accent: PALETTE.teal.solid,  lightBg: PALETTE.teal.light,  val: Object.keys(balanceByNode).length, lbl: 'Active nodes',      trend: '+12%',  up: true  },
                          { emoji: '⚠️', accent: PALETTE.red.solid,   lightBg: PALETTE.red.light,   val: allLow,                            lbl: 'Low stock alerts',  trend: '+' + allLow,  up: false },
                          { emoji: '🔔', accent: PALETTE.amber.solid, lightBg: PALETTE.amber.light, val: allWarn,                           lbl: 'Near reorder',      trend: '+' + allWarn, up: false },
                        ].map((c, i) => (
                          <div key={i} style={{ ...CARD, borderTop: '3px solid ' + c.accent }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                                {c.emoji}
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 600, color: c.up ? PALETTE.green.text : PALETTE.red.text }}>
                                {c.up ? '↑' : '↓'} {c.trend}
                              </span>
                            </div>
                            <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1, marginBottom: 5 }}>{c.val}</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{c.lbl}</div>
                          </div>
                        ))}
                      </div>

                      <SectionHead title="Nodes & warehouses" hint="click a card to drill in" />

                      {/* Node cards grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12, marginBottom: 24 }}>
                        {Object.entries(balanceByNode)
                          .sort((a, b) => { const o = { low: 0, warn: 1, ok: 2 }; return o[worstOf(a[1], reorderFn)] - o[worstOf(b[1], reorderFn)]; })
                          .map(([nodeId, rows]) => {
                            const worst  = worstOf(rows, reorderFn);
                            const counts = countBy(rows, reorderFn);
                            const s      = STATUS[worst];
                            const okPct  = Math.round((counts.ok / rows.length) * 100);
                            const isWH   = !String(nodeId).startsWith('b_');
                            return (
                              <div key={nodeId} onClick={() => setDrillNode(nodeId)} style={{
                                ...CARD, cursor: 'pointer',
                                borderLeft: `4px solid ${s.solid}`, background: '#ffffff',
                                transition: 'box-shadow .15s',
                              }}
                                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
                                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                  <div style={{ width: 38, height: 38, borderRadius: 10, background: s.solid, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{isWH ? '🏭' : '🏪'}</div>
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    {counts.low  > 0 && <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 99, background: STATUS.low.pillBg,  color: STATUS.low.pillText  }}>{counts.low} low</span>}
                                    {counts.warn > 0 && <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 99, background: STATUS.warn.pillBg, color: STATUS.warn.pillText }}>{counts.warn} warn</span>}
                                    {counts.ok   > 0 && <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 99, background: STATUS.ok.pillBg,   color: STATUS.ok.pillText   }}>{counts.ok} ok</span>}
                                  </div>
                                </div>
                                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1, marginBottom: 4 }}>{rows.length}</div>
                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 14 }}>items · {getNodeName(nodeId)}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ flex: 1, height: 6, background: 'var(--color-border-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{ width: `${okPct}%`, height: '100%', background: s.barColor, borderRadius: 99 }} />
                                  </div>
                                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{okPct}% ok</span>
                                  ›
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      {/* Bottom row: Low Stock Alerts + Recent Activity */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                        {/* Low Stock Alerts */}
                        <div style={{ ...CARD }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Low stock alerts</div>
                            {lowStock.length > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: STATUS.low.pillBg, color: STATUS.low.pillText }}>
                                {lowStock.length} item{lowStock.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          {lowStock.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '24px 0' }}>
                              <div style={{ fontSize: 44, textAlign: 'center', marginBottom: 8 }}>✅</div>
                              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 10 }}>All stock levels healthy</div>
                            </div>
                          ) : (
                            lowStock.slice(0, 5).map((l, idx) => {
                              const onHand  = parseFloat(l.qty_on_hand);
                              const reorder = parseFloat(l.reorder_level || getItemReorder(l.item_id));
                              const status  = getStatus(onHand, reorder);
                              const s       = STATUS[status];
                              const uom     = getItemUom(l.item_id);
                              const fillPct = reorder > 0 ? Math.min(100, (onHand / (reorder * 1.5)) * 100) : 5;
                              return (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: idx === 0 ? 'none' : '1px solid var(--color-border-tertiary)' }}>
                                  <div style={{ width: 36, height: 36, borderRadius: 9, background: s.light, border: '2px solid ' + s.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📦</div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {l.item_name || getItemName(l.item_id)}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 7 }}>{getNodeName(l.node_id)}</div>
                                    <div style={{ height: 5, background: 'var(--color-border-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
                                      <div style={{ width: `${fillPct}%`, height: '100%', background: s.barColor, borderRadius: 99 }} />
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: s.solid, lineHeight: 1 }}>{onHand.toFixed(2)}</div>
                                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>Min: {reorder.toFixed(2)} {uom}</div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                          {lowStock.length > 5 && (
                            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', paddingTop: 10, borderTop: '1px solid var(--color-border-tertiary)' }}>
                              +{lowStock.length - 5} more below reorder level
                            </div>
                          )}
                        </div>

                        {/* Recent Activity */}
                        <div style={{ ...CARD }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Recent activity</div>
                            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Latest events</span>
                          </div>
                          {activity.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-tertiary)', fontSize: 13 }}>No recent activity</div>
                          ) : (
                            activity.map((a, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: idx === 0 ? 'none' : '1px solid var(--color-border-tertiary)' }}>
                                <div style={{ width: 36, height: 36, borderRadius: 9, background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{a.emoji}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
                                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{a.sub}</div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontSize: 18, fontWeight: 700, color: a.color, lineHeight: 1 }}>{a.qty}</div>
                                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{timeAgo(a.ts)}</div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                      </div>
                    </>
                  )}

                  {/* ── LEVEL 2: Categories inside node ── */}
                  {drillLevel === 1 && (
                    <>
                      {(() => {
                        const c = countBy(drillNodeBalance, reorderFn);
                        return (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 24 }}>
                            {[
                              { emoji: '📦', accent: PALETTE.green.solid, lightBg: PALETTE.green.light, val: drillNodeBalance.length, lbl: 'Items in node' },
                              { emoji: '⚠️', accent: PALETTE.red.solid,   lightBg: PALETTE.red.light,   val: c.low,  lbl: 'Low stock'   },
                              { emoji: '🔔', accent: PALETTE.amber.solid, lightBg: PALETTE.amber.light, val: c.warn, lbl: 'Near ROL'    },
                              { emoji: '✅', accent: PALETTE.green.solid, lightBg: PALETTE.green.light, val: c.ok,   lbl: 'Healthy'     },
                            ].map((s, i) => (
                              <div key={i} style={{ ...CARD, borderTop: '3px solid ' + s.accent }}>
                                <div style={{ width: 36, height: 36, borderRadius: 9, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 12 }}>{s.emoji}</div>
                                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1, marginBottom: 4 }}>{s.val}</div>
                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{s.lbl}</div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      <SectionHead title="Categories" hint="click to see items" />

                      {Object.keys(drillNodeByCat).length === 0 && (
                        <div className="empty-state"><div className="empty-icon">📦</div><h3>No items in this node</h3></div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
                        {Object.entries(drillNodeByCat)
                          .sort((a, b) => { const o = { low: 0, warn: 1, ok: 2 }; return o[worstOf(a[1], reorderFn)] - o[worstOf(b[1], reorderFn)]; })
                          .map(([catId, rows]) => {
                            const worst  = worstOf(rows, reorderFn);
                            const counts = countBy(rows, reorderFn);
                            const s      = STATUS[worst];
                            return (
                              <div key={catId} onClick={() => setDrillCat(catId)} style={{
                                ...CARD, cursor: 'pointer', background: '#ffffff', borderLeft: `4px solid ${s.solid}`,
                              }}
                                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
                                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                    {getCatName(catId === 'none' ? null : catId)}
                                  </div>
                                  ›
                                </div>
                                <div style={{ display: 'flex', gap: 10 }}>
                                  {[
                                    { key: 'low',  label: 'Low',  color: PALETTE.red.solid   },
                                    { key: 'warn', label: 'Near', color: PALETTE.amber.solid  },
                                    { key: 'ok',   label: 'OK',   color: PALETTE.green.solid  },
                                  ].map(st => (
                                    <div key={st.key} style={{ flex: 1, textAlign: 'center', background: 'var(--color-background-secondary)', borderRadius: 10, padding: '8px 4px' }}>
                                      <div style={{ fontSize: 22, fontWeight: 700, color: counts[st.key] > 0 ? st.color : 'var(--color-text-tertiary)', lineHeight: 1 }}>{counts[st.key]}</div>
                                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{st.label}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </>
                  )}

                  {/* ── LEVEL 3: Items ── */}
                  {drillLevel === 2 && (
                    <>
                      {drillCatItems.length === 0 && (
                        <div className="empty-state"><div className="empty-icon">📦</div><h3>No items here</h3></div>
                      )}
                      {drillCatItems.length > 0 && (() => {
                        const c = countBy(drillCatItems, reorderFn);
                        return (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 20 }}>
                              {[
                                { emoji: '📦', accent: PALETTE.green.solid, lightBg: PALETTE.green.light, val: drillCatItems.length, lbl: 'Total'    },
                                { emoji: '⚠️', accent: PALETTE.red.solid,   lightBg: PALETTE.red.light,   val: c.low,               lbl: 'Low'      },
                                { emoji: '🔔', accent: PALETTE.amber.solid, lightBg: PALETTE.amber.light, val: c.warn,              lbl: 'Near ROL' },
                                { emoji: '✅', accent: PALETTE.green.solid, lightBg: PALETTE.green.light, val: c.ok,                lbl: 'Healthy'  },
                              ].map((s, i) => (
                                <div key={i} style={{ ...CARD, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <div style={{ width: 36, height: 36, borderRadius: 9, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{s.emoji}</div>
                                  <div>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1 }}>{s.val}</div>
                                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 3 }}>{s.lbl}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
                              {drillCatItems.map(b => (
                                <ItemCard key={`${b.node_id}-${b.item_id}`} b={b}
                                  itemName={getItemName(b.item_id)} uomSymbol={getItemUom(b.item_id)}
                                  nodeName={getNodeName(b.node_id)} reorder={getItemReorder(b.item_id)} />
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </>
                  )}
                </>
              )}

              {/* TABLE MODE */}
              {filteredBalance.length > 0 && viewMode === 'table' && (
                Object.entries(balanceByNode).map(([nodeId, rows]) => (
                  <div key={nodeId} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: PALETTE.green.solid, display: 'flex', alignItems: 'center', gap: 8 }}>
                      📍 {getNodeName(parseInt(nodeId))}
                      <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', fontSize: 12 }}>{rows.length} item(s)</span>
                    </div>
                    <div className="table-wrapper">
                      <table className="data-table">
                        <thead><tr><th>Item</th><th>Category</th><th>On Hand</th><th>Reorder Level</th><th>Status</th></tr></thead>
                        <tbody>
                          {rows.map(b => {
                            const onHand  = parseFloat(b.qty_on_hand);
                            const reorder = getItemReorder(b.item_id);
                            const status  = getStatus(onHand, reorder);
                            const uom     = getItemUom(b.item_id);
                            return (
                              <tr key={b.balance_id} style={{ background: status === 'low' ? '#fef2f2' : status === 'warn' ? '#fffbeb' : undefined }}>
                                <td style={{ fontWeight: 600 }}>{getItemName(b.item_id)}</td>
                                <td style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{getCatName(getItemCatId(b.item_id))}</td>
                                <td style={{ fontWeight: 600, color: status === 'low' ? PALETTE.red.solid : status === 'warn' ? PALETTE.amber.solid : 'var(--color-text-primary)' }}>
                                  {onHand.toFixed(3)} {uom}
                                  {status === 'low'  && <span style={{ marginLeft: 6, fontSize: 10, background: STATUS.low.pillBg,  color: STATUS.low.pillText,  padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>LOW</span>}
                                  {status === 'warn' && <span style={{ marginLeft: 6, fontSize: 10, background: STATUS.warn.pillBg, color: STATUS.warn.pillText, padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>NEAR</span>}
                                </td>
                                <td>{reorder.toFixed(3)} {uom}</td>
                                <td><Badge variant={status === 'low' ? 'error' : status === 'warn' ? 'warning' : 'success'}>{status === 'low' ? 'Low Stock' : status === 'warn' ? 'Near ROL' : 'OK'}</Badge></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ══════════════════ MOVEMENT ══════════════════ */}
          {tab === 'movement' && (
            <div>
              {Object.keys(movementSummary).length === 0 && (
                <div className="empty-state"><div className="empty-icon">📈</div><h3>No Movement Data</h3><p>No GRN or consumption entries in this period.</p></div>
              )}
              {Object.keys(movementSummary).length > 0 && (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th style={{ color: PALETTE.green.solid }}>In (GRN)</th>
                        <th style={{ color: PALETTE.red.solid }}>Out (Consumption)</th>
                        <th style={{ color: PALETTE.amber.solid }}>Waste</th>
                        <th>In Value</th><th>Out Value</th><th>Net Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(movementSummary).map(([itemId, m]) => {
                        const net = m.in - m.out - m.waste;
                        return (
                          <tr key={itemId}>
                            <td style={{ fontWeight: 600 }}>{getItemName(parseInt(itemId))}</td>
                            <td style={{ color: PALETTE.green.solid, fontWeight: 600 }}>+{m.in.toFixed(3)}</td>
                            <td style={{ color: PALETTE.red.solid,   fontWeight: 600 }}>-{m.out.toFixed(3)}</td>
                            <td style={{ color: PALETTE.amber.solid }}>{m.waste.toFixed(3)}</td>
                            <td>₹{m.in_value.toFixed(2)}</td>
                            <td>₹{m.out_value.toFixed(2)}</td>
                            <td style={{ fontWeight: 700, color: net >= 0 ? PALETTE.green.solid : PALETTE.red.solid }}>
                              {net > 0 ? '+' : ''}{net.toFixed(3)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════ OUTSTANDING ══════════════════ */}
          {tab === 'outstanding' && (
            <div>
              {outstanding.length === 0 && (
                <div className="empty-state"><div className="empty-icon">💸</div><h3>No Data</h3><p>No supplier payment records found.</p></div>
              )}
              {outstanding.length > 0 && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14, marginBottom: 22 }}>
                    {[
                      { emoji: '👥', accent: PALETTE.teal.solid,  lightBg: PALETTE.teal.light,  val: outstanding.length,                                                                                             lbl: 'Total suppliers'  },
                      { emoji: '🔔', accent: PALETTE.amber.solid, lightBg: PALETTE.amber.light, val: outstanding.filter(o => parseFloat(o.outstanding) > 0).length,                                                  lbl: 'With outstanding' },
                      { emoji: '💰', accent: PALETTE.red.solid,   lightBg: PALETTE.red.light,   val: `₹${outstanding.reduce((s, o) => s + Math.max(0, parseFloat(o.outstanding)), 0).toFixed(2)}`,                  lbl: 'Total due'        },
                    ].map((c, i) => (
                      <div key={i} style={{ ...CARD, borderTop: '3px solid ' + c.accent, display: 'flex', gap: 14, alignItems: 'center' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{c.emoji}</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--color-text-primary)', lineHeight: 1 }}>{c.val}</div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 5 }}>{c.lbl}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead><tr><th>Supplier</th><th>Outstanding (₹)</th><th>Status</th></tr></thead>
                      <tbody>
                        {outstanding.sort((a, b) => parseFloat(b.outstanding) - parseFloat(a.outstanding)).map(o => {
                          const amt = parseFloat(o.outstanding);
                          return (
                            <tr key={o.supplier_id}>
                              <td style={{ fontWeight: 600 }}>{o.supplier_name}</td>
                              <td style={{ fontWeight: 700, color: amt > 0 ? PALETTE.red.solid : amt < 0 ? PALETTE.green.solid : 'var(--color-text-tertiary)' }}>
                                ₹{Math.abs(amt).toFixed(2)}
                                {amt < 0 && <span style={{ fontSize: 11, color: PALETTE.green.solid, marginLeft: 6 }}>(Credit)</span>}
                              </td>
                              <td><Badge variant={amt > 0 ? 'error' : amt < 0 ? 'success' : 'default'}>{amt > 0 ? 'Due' : amt < 0 ? 'Advance' : 'Settled'}</Badge></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Pure utilities ────────────────────────────────────────────
function staticNodeName(nodeId, nodes) {
  if (!nodeId || !nodes?.length) return `Node #${nodeId}`;
  const s = String(nodeId);
  let n = nodes.find(n => String(n.node_id) === s);
  if (n) return n.node_name;
  n = nodes.find(n => String(n.node_id).replace('b_', '') === s.replace('b_', ''));
  return n ? n.node_name : `Node #${nodeId}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  try { return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return dateStr; }
}

function timeAgo(date) {
  if (!date) return '';
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
