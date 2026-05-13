/**
 * InvReports.jsx — Inventory Reports
 * 3-level drill-down stock dashboard:
 *   Level 1 → All nodes overview (node cards)
 *   Level 2 → Branch detail (categories inside selected node)
 *   Level 3 → Item drill-down (items inside selected category)
 *
 * Movement and Supplier Outstanding tabs unchanged.
 */

import { useEffect, useState, useMemo } from 'react';
import { invReportsAPI, invStockAPI, invItemAPI, invCategoryAPI } from '../services/api';
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

const STATUS_META = {
  low:  { label: 'Low stock', bg: '#FCEBEB', border: '#F09595', textColor: '#A32D2D', badgeBg: '#F7C1C1', badgeText: '#791F1F', bar: '#E24B4A' },
  warn: { label: 'Near ROL',  bg: '#FAEEDA', border: '#FAC775', textColor: '#854F0B', badgeBg: '#FAC775', badgeText: '#633806', bar: '#BA7517' },
  ok:   { label: 'OK',        bg: 'var(--color-background-primary)', border: 'var(--color-border-tertiary)', textColor: '#3B6D11', badgeBg: '#C0DD97', badgeText: '#27500A', bar: '#639922' },
};

const NODE_BORDER = { low: '#E24B4A', warn: '#BA7517', ok: '#639922' };

// ── Stock bar ─────────────────────────────────────────────────
function StockBar({ onHand, reorder, uomSymbol }) {
  const max     = Math.max(onHand, reorder) * 1.3 || 1;
  const fillPct = Math.min(100, (onHand / max) * 100);
  const rolPct  = Math.min(100, (reorder / max) * 100);
  const status  = getStatus(onHand, reorder);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ position: 'relative', height: 8, background: 'var(--color-background-secondary)', borderRadius: 99, overflow: 'visible' }}>
        <div style={{ width: `${fillPct}%`, height: '100%', background: STATUS_META[status].bar, borderRadius: 99, transition: 'width 0.4s' }} />
        {reorder > 0 && (
          <div style={{ position: 'absolute', top: -3, left: `${rolPct}%`, width: 2, height: 14, background: '#E24B4A', borderRadius: 1 }}
            title={`Reorder level: ${reorder.toFixed(3)} ${uomSymbol}`} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
        <span>{onHand.toFixed(3)} {uomSymbol}</span>
        {reorder > 0 && <span>ROL: {reorder.toFixed(3)}</span>}
      </div>
    </div>
  );
}

// ── Level 3: Item card ────────────────────────────────────────
function ItemCard({ b, itemName, uomSymbol, nodeName, reorder }) {
  const onHand = parseFloat(b.qty_on_hand);
  const status = getStatus(onHand, reorder);
  const meta   = STATUS_META[status];
  return (
    <div style={{ background: meta.bg, border: `0.5px solid ${meta.border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{itemName}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>📍 {nodeName}</div>
        </div>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: meta.badgeBg, color: meta.badgeText, fontWeight: 500, whiteSpace: 'nowrap', marginLeft: 8 }}>
          {meta.label}
        </span>
      </div>
      <StockBar onHand={onHand} reorder={reorder} uomSymbol={uomSymbol} />
    </div>
  );
}

// ── Breadcrumb ────────────────────────────────────────────────
function Breadcrumb({ items, onNavigate }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 14, flexWrap: 'wrap' }}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ color: 'var(--color-text-tertiary)' }}>›</span>}
            {isLast
              ? <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{item.label}</span>
              : <button onClick={() => onNavigate(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1D9E75', fontSize: 13, padding: 0 }}>{item.label}</button>
            }
          </span>
        );
      })}
    </div>
  );
}

// ── Level stepper ─────────────────────────────────────────────
function LevelStepper({ current }) {
  const steps = ['All nodes', 'Branch detail', 'Item view'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 16 }}>
      {steps.map((label, i) => {
        const active = i === current;
        const done   = i < current;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 500,
                background: active ? '#1D9E75' : done ? '#EAF3DE' : 'var(--color-background-secondary)',
                color: active ? '#fff' : done ? '#3B6D11' : 'var(--color-text-tertiary)',
                border: done ? '0.5px solid #C0DD97' : 'none',
              }}>{i + 1}</div>
              <div style={{ fontSize: 10, color: active ? '#1D9E75' : 'var(--color-text-tertiary)', fontWeight: active ? 500 : 400, whiteSpace: 'nowrap' }}>{label}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: done ? '#C0DD97' : 'var(--color-border-tertiary)', margin: '0 6px', marginBottom: 14 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Utility: worst status and counts ─────────────────────────
const worstStatus = (rows, reorderFn) => {
  if (rows.some(b => getStatus(parseFloat(b.qty_on_hand), reorderFn(b.item_id)) === 'low'))  return 'low';
  if (rows.some(b => getStatus(parseFloat(b.qty_on_hand), reorderFn(b.item_id)) === 'warn')) return 'warn';
  return 'ok';
};
const statusCounts = (rows, reorderFn) => {
  const c = { low: 0, warn: 0, ok: 0 };
  rows.forEach(b => c[getStatus(parseFloat(b.qty_on_hand), reorderFn(b.item_id))]++);
  return c;
};


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
  const [loading,     setLoading]     = useState(false);

  // drill state: null = level 1, nodeId = level 2, both = level 3
  const [drillNode, setDrillNode] = useState(null);
  const [drillCat,  setDrillCat]  = useState(null);

  const drillLevel = drillNode === null ? 0 : drillCat === null ? 1 : 2;

  const { nodes } = useInventoryNodes(cid, selectedCompany, allCompanies);

  // ── Loaders ───────────────────────────────────────────────
  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [i, ls, cats] = await Promise.allSettled([
        invItemAPI.getAll(cid),
        invStockAPI.getLowStock(cid),
        invCategoryAPI.getAll(cid),
      ]);
      setItems(i.status === 'fulfilled'     ? (i.value    || []) : []);
      setLowStock(ls.status === 'fulfilled' ? (ls.value   || []) : []);
      setCategories(cats.status === 'fulfilled' ? (cats.value || []) : []);
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

  // ── Lookup helpers ────────────────────────────────────────
  const getItem        = (id) => items.find(i => i.item_id === id);
  const getItemName    = (id) => getItem(id)?.item_name || `Item #${id}`;
  const getItemReorder = (id) => parseFloat(getItem(id)?.reorder_level || 0);
  const getItemCatId   = (id) => { const it = getItem(id); return it?.item_category_id ?? it?.category_id ?? null; };
  const getItemUom     = (id) => { const it = getItem(id); return it?.uom_symbol || it?.uom_name || ''; };
  const getCatName     = (id) => {
    if (id === null || id === undefined || id === 'none') return 'Uncategorised';
    const c = categories.find(c => (c.category_id || c.item_category_id) === parseInt(id));
    return c?.category_name || `Category #${id}`;
  };
  const getNodeName = (id) => {
    if (!id) return '—';
    const s = String(id);
    let n = nodes.find(n => String(n.node_id) === s);
    if (n) return n.node_name;
    const num = s.replace('b_', '');
    n = nodes.find(n => String(n.node_id).replace('b_', '') === num);
    return n ? n.node_name : `Node #${id}`;
  };

  // ── Computed data ─────────────────────────────────────────
  const filteredBalance = useMemo(() =>
    balance.filter(b => {
      if (filterCat && String(getItemCatId(b.item_id)) !== String(filterCat)) return false;
      return true;
    }),
    [balance, filterCat, items]
  );

  const balanceByNode = useMemo(() => {
    const map = {};
    filteredBalance.forEach(b => {
      const key = String(b.node_id);
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return map;
  }, [filteredBalance]);

  const drillNodeBalance = useMemo(() => {
    if (!drillNode) return [];
    const nodeStr = String(drillNode).replace('b_', '');
    return filteredBalance.filter(b => String(b.node_id).replace('b_', '') === nodeStr);
  }, [filteredBalance, drillNode]);

  const drillNodeByCat = useMemo(() => {
    const map = {};
    drillNodeBalance.forEach(b => {
      const key = String(getItemCatId(b.item_id) ?? 'none');
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
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

  const reorderFn = (id) => getItemReorder(id);
  const allLow    = filteredBalance.filter(b => getStatus(parseFloat(b.qty_on_hand), getItemReorder(b.item_id)) === 'low').length;
  const allWarn   = filteredBalance.filter(b => getStatus(parseFloat(b.qty_on_hand), getItemReorder(b.item_id)) === 'warn').length;

  // ── Movement summary ──────────────────────────────────────
  const movementSummary = {};
  movement.forEach(m => {
    if (!movementSummary[m.item_id]) movementSummary[m.item_id] = { in: 0, out: 0, waste: 0, in_value: 0, out_value: 0 };
    if (m.type === 'grn_in')          { movementSummary[m.item_id].in    += parseFloat(m.qty || 0); movementSummary[m.item_id].in_value  += parseFloat(m.value || 0); }
    if (m.type === 'consumption_out') { movementSummary[m.item_id].out   += parseFloat(m.qty || 0); movementSummary[m.item_id].out_value += parseFloat(m.value || 0); }
    if (m.type === 'waste_out')       { movementSummary[m.item_id].waste += parseFloat(m.qty || 0); }
  });

  // ── Navigation ────────────────────────────────────────────
  const breadcrumbItems = [{ label: 'All nodes' }];
  if (drillNode !== null) breadcrumbItems.push({ label: getNodeName(drillNode) });
  if (drillCat  !== null) breadcrumbItems.push({ label: getCatName(drillCat) });

  const handleBreadcrumb = (idx) => {
    if (idx === 0) { setDrillNode(null); setDrillCat(null); }
    if (idx === 1) { setDrillCat(null); }
  };

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader title="📊 Inventory Reports" subtitle="Stock balance, movement analysis, and supplier outstanding" />

      {/* Low Stock Alert Banner */}
      {lowStock.length > 0 && (
        <div style={{ background: '#FAEEDA', border: '0.5px solid #FAC775', borderRadius: 10, padding: '10px 14px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13, color: '#633806' }}>{lowStock.length} item(s) below reorder level</div>
            <div style={{ fontSize: 11, color: '#854F0B', marginTop: 2 }}>
              {lowStock.slice(0, 5).map(l => `${getItemName(l.item_id)} (${parseFloat(l.qty_on_hand).toFixed(3)} at ${getNodeName(l.node_id)})`).join(' · ')}
              {lowStock.length > 5 && ` +${lowStock.length - 5} more`}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1.5px solid var(--color-border-tertiary)' }}>
        {[['balance', '📦 Stock Balance'], ['movement', '📈 Movement'], ['outstanding', '💸 Supplier Outstanding']].map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setDrillNode(null); setDrillCat(null); }} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === key ? 500 : 400, fontSize: 13,
            borderBottom: tab === key ? '2px solid #1D9E75' : '2px solid transparent',
            color: tab === key ? '#1D9E75' : 'var(--color-text-tertiary)', marginBottom: -1.5,
          }}>{label}</button>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>FROM DATE</div>
              <input type="date" className="input" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>TO DATE</div>
              <input type="date" className="input" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }} />
            </div>
            <button className="btn btn-primary" onClick={loadMovement} style={{ alignSelf: 'flex-end' }}>Apply</button>
          </>
        )}
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* ══ STOCK BALANCE TAB ══ */}
          {tab === 'balance' && (
            <div>
              {filteredBalance.length === 0 && (
                <div className="empty-state"><div className="empty-icon">📦</div><h3>No Stock Data</h3><p>Post a GRN to see stock balances.</p></div>
              )}

              {/* DASHBOARD MODE */}
              {filteredBalance.length > 0 && viewMode === 'dashboard' && (
                <>
                  <LevelStepper current={drillLevel} />

                  {drillLevel > 0 && <Breadcrumb items={breadcrumbItems} onNavigate={handleBreadcrumb} />}

                  {/* ── LEVEL 1: All nodes ── */}
                  {drillLevel === 0 && (
                    <>
                      {/* Summary stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
                        {[
                          { label: 'All items',     value: filteredBalance.length,                                  sub: 'across all nodes',    vc: 'var(--color-text-primary)' },
                          { label: '🔴 Low stock',  value: allLow,                                                  sub: 'below reorder level', vc: '#A32D2D', bg: '#FCEBEB' },
                          { label: '🟡 Near ROL',   value: allWarn,                                                 sub: 'within 20% of level', vc: '#854F0B', bg: '#FAEEDA' },
                          { label: '📍 Nodes',      value: Object.keys(balanceByNode).length,                       sub: 'with stock data',     vc: 'var(--color-text-primary)' },
                        ].map(c => (
                          <div key={c.label} style={{ background: c.bg || 'var(--color-background-secondary)', borderRadius: 8, padding: '12px 14px' }}>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{c.label}</div>
                            <div style={{ fontSize: 22, fontWeight: 500, color: c.vc }}>{c.value}</div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{c.sub}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1D9E75', display: 'inline-block' }} />
                        Click a node card to drill into branch stock
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                        {Object.entries(balanceByNode)
                          .sort((a, b) => {
                            const order = { low: 0, warn: 1, ok: 2 };
                            return order[worstStatus(a[1], reorderFn)] - order[worstStatus(b[1], reorderFn)];
                          })
                          .map(([nodeId, rows]) => {
                            const worst      = worstStatus(rows, reorderFn);
                            const counts     = statusCounts(rows, reorderFn);
                            const borderClr  = NODE_BORDER[worst];
                            const okPct      = rows.length > 0 ? Math.round((counts.ok / rows.length) * 100) : 0;
                            const barClr     = STATUS_META[worst].bar;
                            return (
                              <div key={nodeId}
                                onClick={() => setDrillNode(nodeId)}
                                style={{
                                  background: 'var(--color-background-primary)',
                                  border: `0.5px solid var(--color-border-tertiary)`,
                                  borderLeft: `3px solid ${borderClr}`,
                                  borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                    {getNodeName(nodeId)}
                                  </div>
                                  <span style={{ fontSize: 18, color: 'var(--color-text-tertiary)' }}>›</span>
                                </div>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                                  {counts.low  > 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: '#F7C1C1', color: '#791F1F', fontWeight: 500 }}>{counts.low} low</span>}
                                  {counts.warn > 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: '#FAC775', color: '#633806', fontWeight: 500 }}>{counts.warn} warn</span>}
                                  {counts.ok   > 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: '#C0DD97', color: '#27500A', fontWeight: 500 }}>{counts.ok} ok</span>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ flex: 1, height: 5, background: 'var(--color-background-secondary)', borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{ width: `${okPct}%`, height: '100%', background: barClr, borderRadius: 99 }} />
                                  </div>
                                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', width: 50, textAlign: 'right', flexShrink: 0 }}>
                                    {rows.length} item{rows.length !== 1 ? 's' : ''}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        }
                      </div>
                    </>
                  )}

                  {/* ── LEVEL 2: Categories inside a node ── */}
                  {drillLevel === 1 && (
                    <>
                      {(() => {
                        const c = statusCounts(drillNodeBalance, reorderFn);
                        return (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
                            {[
                              { label: 'Total items', value: drillNodeBalance.length, vc: 'var(--color-text-primary)' },
                              { label: '🔴 Low',      value: c.low,  vc: '#A32D2D', bg: '#FCEBEB' },
                              { label: '🟡 Near ROL', value: c.warn, vc: '#854F0B', bg: '#FAEEDA' },
                              { label: '✅ OK',        value: c.ok,   vc: '#3B6D11', bg: '#EAF3DE' },
                            ].map(s => (
                              <div key={s.label} style={{ background: s.bg || 'var(--color-background-secondary)', borderRadius: 8, padding: '12px 14px' }}>
                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{s.label}</div>
                                <div style={{ fontSize: 22, fontWeight: 500, color: s.vc }}>{s.value}</div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1D9E75', display: 'inline-block' }} />
                        Click a category to see items
                      </div>

                      {Object.keys(drillNodeByCat).length === 0 && (
                        <div className="empty-state"><div className="empty-icon">📦</div><h3>No items in this node</h3></div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                        {Object.entries(drillNodeByCat)
                          .sort((a, b) => {
                            const order = { low: 0, warn: 1, ok: 2 };
                            return order[worstStatus(a[1], reorderFn)] - order[worstStatus(b[1], reorderFn)];
                          })
                          .map(([catId, rows]) => {
                            const worst   = worstStatus(rows, reorderFn);
                            const counts  = statusCounts(rows, reorderFn);
                            const borderClr = NODE_BORDER[worst];
                            return (
                              <div key={catId}
                                onClick={() => setDrillCat(catId)}
                                style={{
                                  background: 'var(--color-background-primary)',
                                  border: `0.5px solid var(--color-border-tertiary)`,
                                  borderLeft: `3px solid ${borderClr}`,
                                  borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                    {getCatName(catId === 'none' ? null : catId)}
                                  </div>
                                  <span style={{ fontSize: 18, color: 'var(--color-text-tertiary)' }}>›</span>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  {[
                                    { key: 'low',  label: 'low',  textClr: '#791F1F' },
                                    { key: 'warn', label: 'warn', textClr: '#633806' },
                                    { key: 'ok',   label: 'ok',   textClr: '#27500A' },
                                  ].map(s => (
                                    <div key={s.key} style={{ flex: 1, textAlign: 'center', background: 'var(--color-background-secondary)', borderRadius: 6, padding: '6px 4px' }}>
                                      <div style={{ fontSize: 16, fontWeight: 500, color: counts[s.key] > 0 && s.key !== 'ok' ? s.textClr : 'var(--color-text-primary)' }}>{counts[s.key]}</div>
                                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{s.label}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })
                        }
                      </div>
                    </>
                  )}

                  {/* ── LEVEL 3: Items in selected node + category ── */}
                  {drillLevel === 2 && (
                    <>
                      {drillCatItems.length === 0 && (
                        <div className="empty-state"><div className="empty-icon">📦</div><h3>No items here</h3></div>
                      )}

                      {drillCatItems.length > 0 && (() => {
                        const c = statusCounts(drillCatItems, reorderFn);
                        return (
                          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                            {[
                              { label: 'Total', value: drillCatItems.length, vc: 'var(--color-text-primary)' },
                              { label: 'Low',   value: c.low,  vc: '#A32D2D', bg: '#FCEBEB' },
                              { label: 'Near',  value: c.warn, vc: '#854F0B', bg: '#FAEEDA' },
                              { label: 'OK',    value: c.ok,   vc: '#3B6D11', bg: '#EAF3DE' },
                            ].map(s => (
                              <div key={s.label} style={{ background: s.bg || 'var(--color-background-secondary)', borderRadius: 8, padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: 18, fontWeight: 500, color: s.vc }}>{s.value}</span>
                                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{s.label}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
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
                  )}
                </>
              )}

              {/* TABLE MODE */}
              {filteredBalance.length > 0 && viewMode === 'table' && (
                Object.entries(balanceByNode).map(([nodeId, rows]) => (
                  <div key={nodeId} style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10, color: '#1D9E75', display: 'flex', alignItems: 'center', gap: 8 }}>
                      📍 {getNodeName(parseInt(nodeId))}
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

          {/* ══ MOVEMENT TAB ══ */}
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
                        <th>In Value</th>
                        <th>Out Value</th>
                        <th>Net Qty</th>
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

          {/* ══ SUPPLIER OUTSTANDING TAB ══ */}
          {tab === 'outstanding' && (
            <div>
              {outstanding.length === 0 && (
                <div className="empty-state"><div className="empty-icon">💸</div><h3>No Data</h3><p>No supplier payment records found.</p></div>
              )}
              {outstanding.length > 0 && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
                    {[
                      { label: 'Total Suppliers',  value: outstanding.length, color: '#1D9E75' },
                      { label: 'With Outstanding', value: outstanding.filter(o => parseFloat(o.outstanding) > 0).length, color: '#BA7517' },
                      { label: 'Total Due',        value: `₹${outstanding.reduce((s, o) => s + Math.max(0, parseFloat(o.outstanding)), 0).toFixed(2)}`, color: '#E24B4A' },
                    ].map(c => (
                      <div key={c.label} style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
                        <div style={{ fontWeight: 500, fontSize: 22, color: c.color }}>{c.value}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{c.label}</div>
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
                              <td>
                                <Badge variant={amt > 0 ? 'error' : amt < 0 ? 'success' : 'default'}>
                                  {amt > 0 ? 'Due' : amt < 0 ? 'Advance' : 'Settled'}
                                </Badge>
                              </td>
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
