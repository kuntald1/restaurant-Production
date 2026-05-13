/**
 * InvReports.jsx — Inventory Reports
 * Warehouse-style dashboard with 3-level drill-down.
 *
 * Level 1 → Hero stats + Node cards + Low Stock Alerts + Recent Activity
 * Level 2 → Branch detail: category cards (click to drill)
 * Level 3 → Item view: ItemCards with stock bars sorted low→warn→ok
 *
 * Movement and Supplier Outstanding tabs unchanged.
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

// ── Status helpers ────────────────────────────────────────────
const getStatus = (onHand, reorder) => {
  if (onHand <= reorder)                       return 'low';
  if (onHand <= reorder * 1.2 && reorder > 0) return 'warn';
  return 'ok';
};

const S = {
  low:  { bar: '#E24B4A', badgeBg: '#F7C1C1', badgeText: '#791F1F', cardBg: '#FCEBEB', cardBorder: '#F09595', iconBg: '#FCEBEB', iconColor: '#A32D2D', label: 'Low stock' },
  warn: { bar: '#BA7517', badgeBg: '#FAC775', badgeText: '#633806', cardBg: '#FAEEDA', cardBorder: '#FAC775', iconBg: '#FAEEDA', iconColor: '#854F0B', label: 'Near ROL'  },
  ok:   { bar: '#639922', badgeBg: '#C0DD97', badgeText: '#27500A', cardBg: 'var(--color-background-primary)', cardBorder: 'var(--color-border-tertiary)', iconBg: '#EAF3DE', iconColor: '#3B6D11', label: 'OK' },
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

// ── Shared design tokens ──────────────────────────────────────
const card  = { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 16, padding: '18px 20px' };
const iconBox = (bg) => ({ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 });
const pill  = (bg, color) => ({ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 99, background: bg, color });

// ── Sub-components ────────────────────────────────────────────

function IconBox({ bg, color, icon }) {
  return (
    <div style={iconBox(bg)}>
      <i className={`ti ti-${icon}`} style={{ color, fontSize: 18 }} aria-hidden="true" />
    </div>
  );
}

function StockBar({ onHand, reorder, uomSymbol, height = 6 }) {
  const max     = Math.max(onHand, reorder) * 1.3 || 1;
  const fillPct = Math.min(100, (onHand / max) * 100);
  const rolPct  = Math.min(100, (reorder / max) * 100);
  const status  = getStatus(onHand, reorder);
  return (
    <div>
      <div style={{ position: 'relative', height, background: '#F1EFE8', borderRadius: 99, overflow: 'visible' }}>
        <div style={{ width: `${fillPct}%`, height: '100%', background: S[status].bar, borderRadius: 99 }} />
        {reorder > 0 && (
          <div style={{ position: 'absolute', top: -3, left: `${rolPct}%`, width: 2, height: height + 6, background: '#E24B4A', borderRadius: 1 }}
            title={`ROL: ${reorder.toFixed(3)} ${uomSymbol}`} />
        )}
      </div>
    </div>
  );
}

// Level 3 item card — warehouse alert style
function ItemCard({ b, itemName, uomSymbol, nodeName, reorder }) {
  const onHand = parseFloat(b.qty_on_hand);
  const status = getStatus(onHand, reorder);
  const meta   = S[status];
  return (
    <div style={{ ...card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <IconBox bg={meta.iconBg} color={meta.iconColor} icon="package" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 1 }}>{itemName}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 7 }}>{nodeName}</div>
        <StockBar onHand={onHand} reorder={reorder} uomSymbol={uomSymbol} height={6} />
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: meta.bar, lineHeight: 1 }}>{onHand.toFixed(2)}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{uomSymbol}</div>
        {reorder > 0 && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Min: {reorder.toFixed(2)}</div>}
      </div>
    </div>
  );
}

// Breadcrumb
function Breadcrumb({ items, onNavigate }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 16, flexWrap: 'wrap' }}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ color: 'var(--color-text-tertiary)' }}>›</span>}
            {isLast
              ? <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{item.label}</span>
              : <button onClick={() => onNavigate(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1D9E75', fontSize: 13, padding: 0 }}>{item.label}</button>}
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
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
      {steps.map((label, i) => {
        const active = i === current, done = i < current;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, background: active ? '#1D9E75' : done ? '#EAF3DE' : 'var(--color-background-secondary)', color: active ? '#fff' : done ? '#3B6D11' : 'var(--color-text-tertiary)', border: done ? '0.5px solid #C0DD97' : 'none' }}>{i + 1}</div>
              <div style={{ fontSize: 10, color: active ? '#1D9E75' : 'var(--color-text-tertiary)', fontWeight: active ? 500 : 400, whiteSpace: 'nowrap' }}>{label}</div>
            </div>
            {i < steps.length - 1 && <div style={{ flex: 1, height: 1, background: done ? '#C0DD97' : 'var(--color-border-tertiary)', margin: '0 8px', marginBottom: 14 }} />}
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
  const [activity,    setActivity]    = useState([]);   // recent activity feed
  const [loading,     setLoading]     = useState(false);

  // drill state
  const [drillNode, setDrillNode] = useState(null);
  const [drillCat,  setDrillCat]  = useState(null);
  const drillLevel = drillNode === null ? 0 : drillCat === null ? 1 : 2;

  const { nodes } = useInventoryNodes(cid, selectedCompany, allCompanies);

  // ── Loaders ───────────────────────────────────────────────
  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [i, ls, cats, grns, transfers, conss] = await Promise.allSettled([
        invItemAPI.getAll(cid),
        invStockAPI.getLowStock(cid),
        invCategoryAPI.getAll(cid),
        invGrnAPI.getAll(cid),
        invTransferAPI.getAllAdmin(cid),
        invConsumptionAPI.getAll(cid),
      ]);
      const itemsData     = i.status       === 'fulfilled' ? (i.value       || []) : [];
      const grnData       = grns.status    === 'fulfilled' ? (grns.value    || []) : [];
      const transferData  = transfers.status === 'fulfilled' ? (transfers.value || []) : [];
      const consData      = conss.status   === 'fulfilled' ? (conss.value   || []) : [];

      setItems(itemsData);
      setLowStock(ls.status === 'fulfilled' ? (ls.value || []) : []);
      setCategories(cats.status === 'fulfilled' ? (cats.value || []) : []);

      // Build recent activity feed — last 8 events across all types
      const feed = [];
      grnData.filter(g => g.status === 'posted').slice(0, 5).forEach(g => {
        feed.push({ type: 'grn', label: 'GRN posted', sub: `${getNodeName_static(g.node_id, nodes)} · ${formatDate(g.grn_date)}`, qty: `+${(g.items || []).reduce((s, it) => s + parseFloat(it.received_qty || 0), 0).toFixed(0)}`, color: '#3B6D11', iconBg: '#EAF3DE', iconColor: '#3B6D11', icon: 'arrow-bar-to-down', ts: new Date(g.grn_date) });
      });
      transferData.slice(0, 5).forEach(t => {
        const label = t.status === 'received' ? 'Transfer received' : t.status === 'dispatched' ? 'Transfer dispatched' : t.status === 'rejected' ? 'Transfer rejected' : 'Transfer';
        const qty   = (t.items || []).reduce((s, it) => s + parseFloat(it.requested_qty || 0), 0).toFixed(0);
        const iconColor = t.status === 'received' ? '#3B6D11' : t.status === 'rejected' ? '#A32D2D' : '#854F0B';
        const iconBg    = t.status === 'received' ? '#EAF3DE' : t.status === 'rejected' ? '#FCEBEB' : '#FAEEDA';
        feed.push({ type: 'transfer', label, sub: formatDate(t.transfer_date), qty, color: iconColor, iconBg, iconColor, icon: 'arrows-transfer-up', ts: new Date(t.transfer_date) });
      });
      consData.slice(0, 5).forEach(c => {
        const qty = (c.items || []).reduce((s, it) => s + parseFloat(it.qty_consumed || 0), 0).toFixed(0);
        feed.push({ type: 'consumption', label: 'Consumption posted', sub: formatDate(c.consumption_date), qty: `-${qty}`, color: '#E24B4A', iconBg: '#FCEBEB', iconColor: '#A32D2D', icon: 'arrow-bar-up', ts: new Date(c.consumption_date) });
      });
      feed.sort((a, b) => b.ts - a.ts);
      setActivity(feed.slice(0, 6));
    } catch {}
    setLoading(false);
  };

  const loadBalance = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const nodeInt = filterNode ? parseInt(String(filterNode).replace('b_', '')) : null;
      const b = await invStockAPI.getBalance(cid, nodeInt);
      setBalance(b || []);
    } catch { setBalance([]); }
    setLoading(false);
  };

  const loadMovement = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const m = await invReportsAPI.stockMovement(cid, { from_date: fromDate, to_date: toDate, node_id: filterNode || null });
      setMovement(m || []);
    } catch { setMovement([]); }
    setLoading(false);
  };

  const loadOutstanding = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const o = await invReportsAPI.supplierOutstanding(cid);
      setOutstanding(o || []);
    } catch { setOutstanding([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);
  useEffect(() => { if (tab === 'balance')     loadBalance(); }, [tab, cid, filterNode]);
  useEffect(() => { if (tab === 'movement')    loadMovement(); }, [tab, cid]);
  useEffect(() => { if (tab === 'outstanding') loadOutstanding(); }, [tab, cid]);
  // re-build activity feed node names once nodes resolve
  useEffect(() => { if (nodes.length > 0 && cid) load(); }, [nodes.length]);

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
    const num = s.replace('b_', '');
    n = nodes.find(n => String(n.node_id).replace('b_', '') === num);
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
        const order = { low: 0, warn: 1, ok: 2 };
        return order[getStatus(parseFloat(a.qty_on_hand), getItemReorder(a.item_id))]
             - order[getStatus(parseFloat(b.qty_on_hand), getItemReorder(b.item_id))];
      });
  }, [drillNodeBalance, drillCat, items]);

  const allLow   = filteredBalance.filter(b => getStatus(parseFloat(b.qty_on_hand), getItemReorder(b.item_id)) === 'low').length;
  const allWarn  = filteredBalance.filter(b => getStatus(parseFloat(b.qty_on_hand), getItemReorder(b.item_id)) === 'warn').length;

  // Movement summary
  const movementSummary = {};
  movement.forEach(m => {
    if (!movementSummary[m.item_id]) movementSummary[m.item_id] = { in: 0, out: 0, waste: 0, in_value: 0, out_value: 0 };
    if (m.type === 'grn_in')          { movementSummary[m.item_id].in    += parseFloat(m.qty || 0); movementSummary[m.item_id].in_value  += parseFloat(m.value || 0); }
    if (m.type === 'consumption_out') { movementSummary[m.item_id].out   += parseFloat(m.qty || 0); movementSummary[m.item_id].out_value += parseFloat(m.value || 0); }
    if (m.type === 'waste_out')       { movementSummary[m.item_id].waste += parseFloat(m.qty || 0); }
  });

  // Breadcrumb items
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

  return (
    <div className="page">
      <PageHeader title="📊 Inventory Reports" subtitle="Stock balance · movement analysis · supplier outstanding" />

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 22, borderBottom: '1.5px solid var(--color-border-tertiary)' }}>
        {[['balance', '📦 Stock Balance'], ['movement', '📈 Movement'], ['outstanding', '💸 Supplier Outstanding']].map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setDrillNode(null); setDrillCat(null); }} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === key ? 500 : 400, fontSize: 13,
            borderBottom: tab === key ? '2px solid #1D9E75' : '2px solid transparent',
            color: tab === key ? '#1D9E75' : 'var(--color-text-tertiary)', marginBottom: -1.5,
          }}>{label}</button>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {(tab === 'balance' || tab === 'movement') && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>FILTER BY NODE</div>
            <select className="input select" value={filterNode} onChange={e => { setFilterNode(e.target.value); setDrillNode(null); setDrillCat(null); }} style={{ padding: '6px 10px', fontSize: 13 }}>
              <option value="">All Nodes</option>
              {nodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_label || n.node_name}</option>)}
            </select>
          </div>
        )}
        {tab === 'balance' && (
          <>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>FILTER BY CATEGORY</div>
              <select className="input select" value={filterCat} onChange={e => { setFilterCat(e.target.value); setDrillCat(null); }} style={{ padding: '6px 10px', fontSize: 13 }}>
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.category_id || c.item_category_id} value={c.category_id || c.item_category_id}>{c.category_name}</option>)}
              </select>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={() => setViewMode('dashboard')} className={`btn btn-sm ${viewMode === 'dashboard' ? 'btn-primary' : 'btn-ghost'}`}>📊 Dashboard</button>
              <button onClick={() => setViewMode('table')}    className={`btn btn-sm ${viewMode === 'table'     ? 'btn-primary' : 'btn-ghost'}`}>📋 Table</button>
            </div>
          </>
        )}
        {tab === 'movement' && (
          <>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>FROM</div>
              <input type="date" className="input" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>TO</div>
              <input type="date" className="input" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }} />
            </div>
            <button className="btn btn-primary" onClick={loadMovement} style={{ alignSelf: 'flex-end' }}>Apply</button>
          </>
        )}
      </div>

      {loading ? <Spinner /> : (
        <>

          {/* ════════════════════════════════════════
              STOCK BALANCE TAB
          ════════════════════════════════════════ */}
          {tab === 'balance' && (
            <div>
              {filteredBalance.length === 0 && (
                <div className="empty-state"><div className="empty-icon">📦</div><h3>No Stock Data</h3><p>Post a GRN to see stock balances.</p></div>
              )}

              {/* ── DASHBOARD MODE ── */}
              {filteredBalance.length > 0 && viewMode === 'dashboard' && (
                <>
                  <LevelStepper current={drillLevel} />
                  {drillLevel > 0 && <Breadcrumb items={breadcrumbItems} onNavigate={handleBreadcrumb} />}

                  {/* ══ LEVEL 1 ══ */}
                  {drillLevel === 0 && (
                    <>
                      {/* Hero stat cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 22 }}>
                        {[
                          { icon: 'box',            iconBg: '#EAF3DE', iconColor: '#3B6D11', trend: '+8.2%', trendUp: true,  val: filteredBalance.length, lbl: 'Total stock items' },
                          { icon: 'map-pin',         iconBg: '#E1F5EE', iconColor: '#0F6E56', trend: '+12%',  trendUp: true,  val: Object.keys(balanceByNode).length, lbl: 'Active nodes' },
                          { icon: 'alert-triangle',  iconBg: '#FCEBEB', iconColor: '#A32D2D', trend: `+${allLow}`, trendUp: false, val: allLow,  lbl: 'Low stock alerts' },
                          { icon: 'alert-circle',    iconBg: '#FAEEDA', iconColor: '#854F0B', trend: `+${allWarn}`, trendUp: false, val: allWarn, lbl: 'Near reorder' },
                        ].map((c, i) => (
                          <div key={i} style={{ ...card, padding: '16px 18px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                              <IconBox bg={c.iconBg} color={c.iconColor} icon={c.icon} />
                              <span style={{ fontSize: 12, fontWeight: 500, color: c.trendUp ? '#3B6D11' : '#E24B4A', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <i className={`ti ti-trending-${c.trendUp ? 'up' : 'down'}`} style={{ fontSize: 12 }} aria-hidden="true" />
                                {c.trend}
                              </span>
                            </div>
                            <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1, marginBottom: 4 }}>{c.val}</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{c.lbl}</div>
                          </div>
                        ))}
                      </div>

                      {/* Section label */}
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 12 }}>
                        Nodes &amp; warehouses
                        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>click a card to drill in</span>
                      </div>

                      {/* Node cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 24 }}>
                        {Object.entries(balanceByNode)
                          .sort((a, b) => { const o = { low: 0, warn: 1, ok: 2 }; return o[worstOf(a[1], reorderFn)] - o[worstOf(b[1], reorderFn)]; })
                          .map(([nodeId, rows]) => {
                            const worst  = worstOf(rows, reorderFn);
                            const counts = countBy(rows, reorderFn);
                            const okPct  = Math.round((counts.ok / rows.length) * 100);
                            const isWH   = !String(nodeId).startsWith('b_');
                            return (
                              <div key={nodeId} onClick={() => setDrillNode(nodeId)}
                                style={{ ...card, cursor: 'pointer', borderLeft: `3px solid ${S[worst].bar}`, borderRadius: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                                  <IconBox bg={S[worst].iconBg} color={S[worst].iconColor} icon={isWH ? 'building-warehouse' : 'building-store'} />
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    {counts.low  > 0 && <span style={pill('#F7C1C1', '#791F1F')}>{counts.low} low</span>}
                                    {counts.warn > 0 && <span style={pill('#FAC775', '#633806')}>{counts.warn} warn</span>}
                                    {counts.ok   > 0 && <span style={pill('#C0DD97', '#27500A')}>{counts.ok} ok</span>}
                                  </div>
                                </div>
                                <div style={{ fontSize: 26, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1, marginBottom: 4 }}>{rows.length}</div>
                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 14 }}>items · {getNodeName(nodeId)}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ flex: 1, height: 5, background: '#F1EFE8', borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{ width: `${okPct}%`, height: '100%', background: S[worst].bar, borderRadius: 99 }} />
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                    <i className="ti ti-chevron-right" style={{ fontSize: 13, verticalAlign: -2, color: 'var(--color-text-tertiary)' }} aria-hidden="true" /> {okPct}% ok
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      {/* Bottom 2-column: Low Stock Alerts + Recent Activity */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                        {/* Low Stock Alerts panel */}
                        <div style={{ ...card }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>Low stock alerts</div>
                            {lowStock.length > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 99, background: '#FCEBEB', color: '#791F1F' }}>
                                {lowStock.length} item{lowStock.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          {lowStock.length === 0 && (
                            <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13, padding: '20px 0' }}>
                              <i className="ti ti-circle-check" style={{ fontSize: 28, display: 'block', marginBottom: 6, color: '#639922' }} aria-hidden="true" />
                              All stock levels healthy
                            </div>
                          )}

                          {lowStock.slice(0, 5).map((l, idx) => {
                            const onHand  = parseFloat(l.qty_on_hand);
                            const reorder = parseFloat(l.reorder_level || getItemReorder(l.item_id));
                            const status  = getStatus(onHand, reorder);
                            const uom     = getItemUom(l.item_id);
                            const fillPct = reorder > 0 ? Math.min(100, (onHand / (reorder * 1.3)) * 100) : 0;
                            return (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: idx === 0 ? 'none' : '0.5px solid var(--color-border-tertiary)' }}>
                                <IconBox bg={S[status].iconBg} color={S[status].iconColor} icon="package" />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {l.item_name || getItemName(l.item_id)}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>{getNodeName(l.node_id)}</div>
                                  <div style={{ height: 5, background: '#F1EFE8', borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{ width: `${fillPct}%`, height: '100%', background: S[status].bar, borderRadius: 99 }} />
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontSize: 18, fontWeight: 500, color: S[status].bar, lineHeight: 1 }}>{onHand.toFixed(2)}</div>
                                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1 }}>Min: {reorder.toFixed(2)} {uom}</div>
                                </div>
                              </div>
                            );
                          })}

                          {lowStock.length > 5 && (
                            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', paddingTop: 10, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                              +{lowStock.length - 5} more items below reorder level
                            </div>
                          )}
                        </div>

                        {/* Recent Activity panel */}
                        <div style={{ ...card }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>Recent activity</div>
                            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Latest events</span>
                          </div>

                          {activity.length === 0 && (
                            <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13, padding: '20px 0' }}>No recent activity</div>
                          )}

                          {activity.map((a, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: idx === 0 ? 'none' : '0.5px solid var(--color-border-tertiary)' }}>
                              <IconBox bg={a.iconBg} color={a.iconColor} icon={a.icon} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
                                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{a.sub}</div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: 16, fontWeight: 500, color: a.color, lineHeight: 1 }}>{a.qty}</div>
                                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{timeAgo(a.ts)}</div>
                              </div>
                            </div>
                          ))}
                        </div>

                      </div>
                    </>
                  )}

                  {/* ══ LEVEL 2: Category cards inside node ══ */}
                  {drillLevel === 1 && (
                    <>
                      {/* Node summary stats */}
                      {(() => {
                        const c = countBy(drillNodeBalance, reorderFn);
                        return (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 22 }}>
                            {[
                              { icon: 'box',           iconBg: '#EAF3DE', iconColor: '#3B6D11', val: drillNodeBalance.length, lbl: 'Items in node', color: 'var(--color-text-primary)' },
                              { icon: 'alert-triangle', iconBg: '#FCEBEB', iconColor: '#A32D2D', val: c.low,  lbl: 'Low stock',   color: '#E24B4A' },
                              { icon: 'alert-circle',   iconBg: '#FAEEDA', iconColor: '#854F0B', val: c.warn, lbl: 'Near ROL',    color: '#BA7517' },
                              { icon: 'circle-check',   iconBg: '#EAF3DE', iconColor: '#3B6D11', val: c.ok,   lbl: 'Healthy',     color: '#639922' },
                            ].map((s, i) => (
                              <div key={i} style={{ ...card, padding: '16px 18px' }}>
                                <IconBox bg={s.iconBg} color={s.iconColor} icon={s.icon} />
                                <div style={{ fontSize: 26, fontWeight: 500, color: s.color, lineHeight: 1, marginTop: 12, marginBottom: 4 }}>{s.val}</div>
                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{s.lbl}</div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 12 }}>
                        Categories
                        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>click to see items</span>
                      </div>

                      {Object.keys(drillNodeByCat).length === 0 && (
                        <div className="empty-state"><div className="empty-icon">📦</div><h3>No items in this node</h3></div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                        {Object.entries(drillNodeByCat)
                          .sort((a, b) => { const o = { low: 0, warn: 1, ok: 2 }; return o[worstOf(a[1], reorderFn)] - o[worstOf(b[1], reorderFn)]; })
                          .map(([catId, rows]) => {
                            const worst  = worstOf(rows, reorderFn);
                            const counts = countBy(rows, reorderFn);
                            return (
                              <div key={catId} onClick={() => setDrillCat(catId)}
                                style={{ ...card, cursor: 'pointer', borderLeft: `3px solid ${S[worst].bar}`, borderRadius: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                    {getCatName(catId === 'none' ? null : catId)}
                                  </div>
                                  <i className="ti ti-chevron-right" style={{ fontSize: 16, color: 'var(--color-text-tertiary)' }} aria-hidden="true" />
                                </div>
                                <div style={{ display: 'flex', gap: 10 }}>
                                  {[
                                    { key: 'low',  label: 'Low',  color: '#E24B4A' },
                                    { key: 'warn', label: 'Near', color: '#BA7517' },
                                    { key: 'ok',   label: 'OK',   color: '#639922' },
                                  ].map(s => (
                                    <div key={s.key} style={{ flex: 1, textAlign: 'center', background: 'var(--color-background-secondary)', borderRadius: 10, padding: '8px 4px' }}>
                                      <div style={{ fontSize: 20, fontWeight: 500, color: counts[s.key] > 0 && s.key !== 'ok' ? s.color : 'var(--color-text-primary)', lineHeight: 1 }}>{counts[s.key]}</div>
                                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 3 }}>{s.label}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </>
                  )}

                  {/* ══ LEVEL 3: Items ══ */}
                  {drillLevel === 2 && (
                    <>
                      {drillCatItems.length === 0 && (
                        <div className="empty-state"><div className="empty-icon">📦</div><h3>No items here</h3></div>
                      )}

                      {drillCatItems.length > 0 && (() => {
                        const c = countBy(drillCatItems, reorderFn);
                        return (
                          <>
                            <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
                              {[
                                { label: 'Total', value: drillCatItems.length, iconBg: '#EAF3DE', iconColor: '#3B6D11', icon: 'box',            vc: 'var(--color-text-primary)' },
                                { label: 'Low',   value: c.low,                iconBg: '#FCEBEB', iconColor: '#A32D2D', icon: 'alert-triangle',  vc: '#E24B4A' },
                                { label: 'Near',  value: c.warn,               iconBg: '#FAEEDA', iconColor: '#854F0B', icon: 'alert-circle',    vc: '#BA7517' },
                                { label: 'OK',    value: c.ok,                 iconBg: '#EAF3DE', iconColor: '#3B6D11', icon: 'circle-check',    vc: '#639922' },
                              ].map(s => (
                                <div key={s.label} style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 120px' }}>
                                  <IconBox bg={s.iconBg} color={s.iconColor} icon={s.icon} />
                                  <div>
                                    <div style={{ fontSize: 22, fontWeight: 500, color: s.vc, lineHeight: 1 }}>{s.value}</div>
                                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{s.label}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                              {drillCatItems.map(b => (
                                <ItemCard
                                  key={`${b.node_id}-${b.item_id}`}
                                  b={b}
                                  itemName={getItemName(b.item_id)}
                                  uomSymbol={getItemUom(b.item_id)}
                                  nodeName={getNodeName(b.node_id)}
                                  reorder={getItemReorder(b.item_id)}
                                />
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </>
                  )}
                </>
              )}

              {/* ── TABLE MODE ── */}
              {filteredBalance.length > 0 && viewMode === 'table' && (
                Object.entries(balanceByNode).map(([nodeId, rows]) => (
                  <div key={nodeId} style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10, color: '#1D9E75', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="ti ti-map-pin" style={{ fontSize: 14 }} aria-hidden="true" /> {getNodeName(parseInt(nodeId))}
                      <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', fontSize: 12 }}>{rows.length} item(s)</span>
                    </h3>
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
                              <tr key={b.balance_id} style={{ background: status === 'low' ? '#FEF2F2' : status === 'warn' ? '#FFFBEB' : undefined }}>
                                <td style={{ fontWeight: 500 }}>{getItemName(b.item_id)}</td>
                                <td style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{getCatName(getItemCatId(b.item_id))}</td>
                                <td style={{ fontWeight: 500, color: status === 'low' ? '#A32D2D' : status === 'warn' ? '#854F0B' : 'var(--color-text-primary)' }}>
                                  {onHand.toFixed(3)} {uom}
                                  {status === 'low'  && <span style={{ marginLeft: 6, fontSize: 10, background: '#F7C1C1', color: '#791F1F', padding: '2px 6px', borderRadius: 4 }}>LOW</span>}
                                  {status === 'warn' && <span style={{ marginLeft: 6, fontSize: 10, background: '#FAC775', color: '#633806', padding: '2px 6px', borderRadius: 4 }}>NEAR</span>}
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

          {/* ════════════════════════════════════════
              MOVEMENT TAB
          ════════════════════════════════════════ */}
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
                        <th style={{ color: 'var(--color-success)' }}>In (GRN)</th>
                        <th style={{ color: 'var(--color-error)' }}>Out (Consumption)</th>
                        <th style={{ color: 'var(--color-warning)' }}>Waste</th>
                        <th>In Value</th><th>Out Value</th><th>Net Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(movementSummary).map(([itemId, m]) => {
                        const net = m.in - m.out - m.waste;
                        return (
                          <tr key={itemId}>
                            <td style={{ fontWeight: 500 }}>{getItemName(parseInt(itemId))}</td>
                            <td style={{ color: 'var(--color-success)', fontWeight: 500 }}>+{m.in.toFixed(3)}</td>
                            <td style={{ color: 'var(--color-error)',   fontWeight: 500 }}>-{m.out.toFixed(3)}</td>
                            <td style={{ color: 'var(--color-warning)' }}>{m.waste.toFixed(3)}</td>
                            <td>₹{m.in_value.toFixed(2)}</td>
                            <td>₹{m.out_value.toFixed(2)}</td>
                            <td style={{ fontWeight: 500, color: net >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
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

          {/* ════════════════════════════════════════
              SUPPLIER OUTSTANDING TAB
          ════════════════════════════════════════ */}
          {tab === 'outstanding' && (
            <div>
              {outstanding.length === 0 && (
                <div className="empty-state"><div className="empty-icon">💸</div><h3>No Data</h3><p>No supplier payment records found.</p></div>
              )}
              {outstanding.length > 0 && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
                    {[
                      { label: 'Total suppliers',   value: outstanding.length, color: '#1D9E75', iconBg: '#E1F5EE', iconColor: '#0F6E56', icon: 'users' },
                      { label: 'With outstanding',  value: outstanding.filter(o => parseFloat(o.outstanding) > 0).length, color: '#BA7517', iconBg: '#FAEEDA', iconColor: '#854F0B', icon: 'alert-circle' },
                      { label: 'Total due',         value: `₹${outstanding.reduce((s, o) => s + Math.max(0, parseFloat(o.outstanding)), 0).toFixed(2)}`, color: '#E24B4A', iconBg: '#FCEBEB', iconColor: '#A32D2D', icon: 'currency-rupee' },
                    ].map(c => (
                      <div key={c.label} style={{ ...card, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'center' }}>
                        <IconBox bg={c.iconBg} color={c.iconColor} icon={c.icon} />
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 22, color: c.color, lineHeight: 1 }}>{c.value}</div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{c.label}</div>
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
                              <td style={{ fontWeight: 500 }}>{o.supplier_name}</td>
                              <td style={{ fontWeight: 500, color: amt > 0 ? '#A32D2D' : amt < 0 ? '#3B6D11' : 'var(--color-text-tertiary)' }}>
                                ₹{Math.abs(amt).toFixed(2)}
                                {amt < 0 && <span style={{ fontSize: 11, color: '#3B6D11', marginLeft: 4 }}>(Credit)</span>}
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

// ── Pure utility functions (outside component, no hooks) ──────
function getNodeName_static(nodeId, nodes) {
  if (!nodeId || !nodes?.length) return `Node #${nodeId}`;
  const s = String(nodeId);
  let n = nodes.find(n => String(n.node_id) === s);
  if (n) return n.node_name;
  const num = s.replace('b_', '');
  n = nodes.find(n => String(n.node_id).replace('b_', '') === num);
  return n ? n.node_name : `Node #${nodeId}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

function timeAgo(date) {
  if (!date) return '';
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
