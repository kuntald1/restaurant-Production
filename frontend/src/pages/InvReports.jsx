/**
 * InvReports.jsx — Inventory Reports
 * Enhanced Stock Balance tab with visual dashboard
 */

import { useEffect, useState } from 'react';
import { invReportsAPI, invStockAPI, invItemAPI, invCategoryAPI } from '../services/api';
import { useInventoryNodes } from './useInventoryNodes';
import { Spinner, PageHeader, Badge } from '../components/UI';
import { useApp } from '../context/useApp';

const today      = () => new Date().toISOString().split('T')[0];
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; };

// ── Stock status helper ───────────────────────────────────────
const getStatus = (onHand, reorder) => {
  if (onHand <= reorder)                        return 'low';
  if (onHand <= reorder * 1.2 && reorder > 0)  return 'warn';
  return 'ok';
};

// ── Horizontal bar per item ───────────────────────────────────
function StockBar({ onHand, reorder, uomSymbol }) {
  const max      = Math.max(onHand, reorder) * 1.3 || 1;
  const fillPct  = Math.min(100, (onHand / max) * 100);
  const rolPct   = Math.min(100, (reorder / max) * 100);
  const status   = getStatus(onHand, reorder);
  const barColor = status === 'low' ? '#E24B4A' : status === 'warn' ? '#BA7517' : '#639922';

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ position: 'relative', height: 8, background: 'var(--color-background-secondary)', borderRadius: 99, overflow: 'visible' }}>
        <div style={{ width: `${fillPct}%`, height: '100%', background: barColor, borderRadius: 99, transition: 'width 0.4s' }} />
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

// ── Item card ─────────────────────────────────────────────────
function ItemCard({ b, itemName, uomSymbol, nodeName, reorder }) {
  const onHand = parseFloat(b.qty_on_hand);
  const status = getStatus(onHand, reorder);

  const bg     = status === 'low'  ? '#FCEBEB' : status === 'warn' ? '#FAEEDA' : 'var(--color-background-primary)';
  const border = status === 'low'  ? '#F09595' : status === 'warn' ? '#FAC775' : 'var(--color-border-tertiary)';
  const qtyCl  = status === 'low'  ? '#A32D2D' : status === 'warn' ? '#854F0B' : '#27500A';
  const badge  = status === 'low'
    ? { bg: '#F7C1C1', color: '#791F1F', label: 'Low Stock' }
    : status === 'warn'
    ? { bg: '#FAC775', color: '#633806', label: 'Near ROL' }
    : { bg: '#C0DD97', color: '#27500A', label: 'OK' };

  return (
    <div style={{ background: bg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{itemName}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>📍 {nodeName}</div>
          </div>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: badge.bg, color: badge.color, fontWeight: 500, whiteSpace: 'nowrap', marginLeft: 6 }}>
            {badge.label}
          </span>
        </div>
        <StockBar onHand={onHand} reorder={reorder} uomSymbol={uomSymbol} />
      </div>
    </div>
  );
}

export default function InvReports() {
  const { selectedCompany, allCompanies } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [tab,         setTab]         = useState('balance');
  const [balance,     setBalance]     = useState([]);
  const [lowStock,    setLowStock]    = useState([]);
  const [items,       setItems]       = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [filterNode,  setFilterNode]  = useState('');
  const [filterCat,   setFilterCat]   = useState('');
  const [viewMode,    setViewMode]    = useState('dashboard'); // 'dashboard' | 'table'
  const [movement,    setMovement]    = useState([]);
  const [fromDate,    setFromDate]    = useState(monthStart());
  const [toDate,      setToDate]      = useState(today());
  const [outstanding, setOutstanding] = useState([]);
  const [loading,     setLoading]     = useState(false);

  const { nodes } = useInventoryNodes(cid, selectedCompany, allCompanies);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [i, ls, cats] = await Promise.allSettled([
        invItemAPI.getAll(cid),
        invStockAPI.getLowStock(cid),
        invCategoryAPI.getAll(cid),
      ]);
      setItems(i.status === 'fulfilled' ? (i.value || []) : []);
      setLowStock(ls.status === 'fulfilled' ? (ls.value || []) : []);
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

  const getItemName    = (id) => items.find(i => i.item_id === id)?.item_name || `Item #${id}`;
  const getItemReorder = (id) => parseFloat(items.find(i => i.item_id === id)?.reorder_level || 0);
  const getItemCatId   = (id) => items.find(i => i.item_id === id)?.category_id;
  const getItemUom     = (id) => {
    const item = items.find(i => i.item_id === id);
    return item?.uom_symbol || item?.uom_name || '';
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

  // Filter balance by category
  const filteredBalance = balance.filter(b => {
    if (!filterCat) return true;
    return String(getItemCatId(b.item_id)) === String(filterCat);
  });

  // Derived stats
  const lowItems   = filteredBalance.filter(b => getStatus(parseFloat(b.qty_on_hand), getItemReorder(b.item_id)) === 'low');
  const warnItems  = filteredBalance.filter(b => getStatus(parseFloat(b.qty_on_hand), getItemReorder(b.item_id)) === 'warn');
  const okItems    = filteredBalance.filter(b => getStatus(parseFloat(b.qty_on_hand), getItemReorder(b.item_id)) === 'ok');
  const nodeCount  = [...new Set(filteredBalance.map(b => b.node_id))].length;

  // Group by node for table view
  const balanceByNode = {};
  filteredBalance.forEach(b => {
    if (!balanceByNode[b.node_id]) balanceByNode[b.node_id] = [];
    balanceByNode[b.node_id].push(b);
  });

  // Top items for bar chart (sorted by on_hand)
  const topItems = [...filteredBalance]
    .sort((a, b) => parseFloat(b.qty_on_hand) - parseFloat(a.qty_on_hand))
    .slice(0, 10);
  const maxQty = topItems.length ? parseFloat(topItems[0].qty_on_hand) * 1.2 || 1 : 1;

  // Movement
  const movementSummary = {};
  movement.forEach(m => {
    if (!movementSummary[m.item_id]) movementSummary[m.item_id] = { in: 0, out: 0, waste: 0, in_value: 0, out_value: 0 };
    if (m.type === 'grn_in')          { movementSummary[m.item_id].in    += parseFloat(m.qty || 0); movementSummary[m.item_id].in_value  += parseFloat(m.value || 0); }
    if (m.type === 'consumption_out') { movementSummary[m.item_id].out   += parseFloat(m.qty || 0); movementSummary[m.item_id].out_value += parseFloat(m.value || 0); }
    if (m.type === 'waste_out')       { movementSummary[m.item_id].waste += parseFloat(m.qty || 0); }
  });

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader title="📊 Inventory Reports" subtitle="Stock balance, movement analysis, and supplier outstanding" />

      {/* Low Stock Alert Banner */}
      {lowStock.length > 0 && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: '#c2410c' }}>{lowStock.length} item(s) below reorder level</div>
            <div style={{ fontSize: 12, color: '#9a3412', marginTop: 2 }}>
              {lowStock.slice(0, 5).map(l => `${getItemName(l.item_id)} (${parseFloat(l.qty_on_hand).toFixed(3)} at ${getNodeName(l.node_id)})`).join(' · ')}
              {lowStock.length > 5 && ` +${lowStock.length - 5} more`}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[['balance', '📦 Stock Balance'], ['movement', '📈 Movement'], ['outstanding', '💸 Supplier Outstanding']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === key ? 700 : 400, fontSize: 13,
            borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
            color: tab === key ? 'var(--primary)' : 'var(--text-3)', marginBottom: -2,
          }}>{label}</button>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {(tab === 'balance' || tab === 'movement') && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>FILTER BY NODE</label>
            <select className="input select" value={filterNode} onChange={e => setFilterNode(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }}>
              <option value="">All Nodes</option>
              {nodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_label || n.node_name}</option>)}
            </select>
          </div>
        )}
        {tab === 'balance' && (
          <>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>FILTER BY CATEGORY</label>
              <select className="input select" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }}>
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
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
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>FROM DATE</label>
              <input type="date" className="input" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>TO DATE</label>
              <input type="date" className="input" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }} />
            </div>
            <button className="btn btn-primary" onClick={loadMovement} style={{ alignSelf: 'flex-end' }}>Apply</button>
          </>
        )}
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* ── STOCK BALANCE ── */}
          {tab === 'balance' && (
            <div>
              {filteredBalance.length === 0 && (
                <div className="empty-state"><div className="empty-icon">📦</div><h3>No Stock Data</h3><p>Post a GRN to see stock balances.</p></div>
              )}

              {filteredBalance.length > 0 && viewMode === 'dashboard' && (
                <>
                  {/* Summary cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                    {[
                      { label: '🔴 Low Stock',    value: lowItems.length,  sub: 'Below reorder level', bg: '#FCEBEB', vc: '#A32D2D', lc: '#791F1F' },
                      { label: '🟡 Near Reorder', value: warnItems.length, sub: 'Within 20% of level',  bg: '#FAEEDA', vc: '#854F0B', lc: '#633806' },
                      { label: '✅ OK',           value: okItems.length,   sub: 'Sufficient stock',     bg: '#EAF3DE', vc: '#3B6D11', lc: '#27500A' },
                      { label: '📍 With Stock',     value: nodeCount,        sub: 'Locations with stock',    bg: 'var(--color-background-secondary)', vc: 'var(--color-text-primary)', lc: 'var(--color-text-secondary)' },
                    ].map(c => (
                      <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: '14px 16px' }}>
                        <div style={{ fontSize: 12, color: c.lc, marginBottom: 6 }}>{c.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 500, color: c.vc }}>{c.value}</div>
                        <div style={{ fontSize: 11, color: c.lc, marginTop: 2 }}>{c.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Low stock section */}
                  {lowItems.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E24B4A', display: 'inline-block' }} />
                        Low stock — action needed immediately
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                        {lowItems.map(b => (
                          <ItemCard key={`${b.node_id}-${b.item_id}`} b={b}
                            itemName={getItemName(b.item_id)} uomSymbol={getItemUom(b.item_id)}
                            nodeName={getNodeName(b.node_id)} reorder={getItemReorder(b.item_id)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Near reorder section */}
                  {warnItems.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#BA7517', display: 'inline-block' }} />
                        Near reorder level — monitor closely
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                        {warnItems.map(b => (
                          <ItemCard key={`${b.node_id}-${b.item_id}`} b={b}
                            itemName={getItemName(b.item_id)} uomSymbol={getItemUom(b.item_id)}
                            nodeName={getNodeName(b.node_id)} reorder={getItemReorder(b.item_id)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Horizontal bar chart — all items */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#639922', display: 'inline-block' }} />
                      Stock level vs reorder level — all items
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10, display: 'flex', gap: 16 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 12, height: 4, background: '#639922', borderRadius: 2, display: 'inline-block' }} /> On hand
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 2, height: 12, background: '#E24B4A', display: 'inline-block', borderRadius: 1 }} /> Reorder level
                      </span>
                    </div>
                    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 10, padding: '12px 16px' }}>
                      {topItems.map(b => {
                        const onHand  = parseFloat(b.qty_on_hand);
                        const reorder = getItemReorder(b.item_id);
                        const fillPct = Math.min(100, (onHand / maxQty) * 100);
                        const rolPct  = Math.min(100, (reorder / maxQty) * 100);
                        const status  = getStatus(onHand, reorder);
                        const barClr  = status === 'low' ? '#E24B4A' : status === 'warn' ? '#BA7517' : '#639922';
                        const uom     = getItemUom(b.item_id);
                        return (
                          <div key={`${b.node_id}-${b.item_id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', width: 140, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {getItemName(b.item_id)}
                              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', display: 'block' }}>{getNodeName(b.node_id)}</span>
                            </div>
                            <div style={{ flex: 1, position: 'relative', height: 14, background: 'var(--color-background-secondary)', borderRadius: 99, overflow: 'visible' }}>
                              <div style={{ width: `${fillPct}%`, height: '100%', background: barClr, borderRadius: 99 }} />
                              {reorder > 0 && (
                                <div style={{ position: 'absolute', top: -3, left: `${rolPct}%`, width: 2, height: 20, background: '#E24B4A', borderRadius: 1 }} />
                              )}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 500, width: 70, textAlign: 'right', flexShrink: 0, color: barClr }}>
                              {onHand.toFixed(3)} {uom}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Table view */}
              {filteredBalance.length > 0 && viewMode === 'table' && (
                Object.entries(balanceByNode).map(([nodeId, rows]) => (
                  <div key={nodeId} style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      📍 {getNodeName(parseInt(nodeId))}
                      <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 12 }}>{rows.length} item(s)</span>
                    </h3>
                    <div className="table-wrapper">
                      <table className="data-table">
                        <thead><tr><th>Item</th><th>On Hand</th><th>Reorder Level</th><th>Status</th></tr></thead>
                        <tbody>
                          {rows.map(b => {
                            const onHand  = parseFloat(b.qty_on_hand);
                            const reorder = getItemReorder(b.item_id);
                            const status  = getStatus(onHand, reorder);
                            const uom     = getItemUom(b.item_id);
                            return (
                              <tr key={b.balance_id} style={{ background: status === 'low' ? '#FEF2F2' : status === 'warn' ? '#FFFBEB' : undefined }}>
                                <td>{getItemName(b.item_id)}</td>
                                <td style={{ fontWeight: 700, color: status === 'low' ? '#A32D2D' : status === 'warn' ? '#854F0B' : 'var(--text)' }}>
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

          {/* ── MOVEMENT ── */}
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
                        <th style={{ color: 'var(--success)' }}>In (GRN)</th>
                        <th style={{ color: 'var(--error)' }}>Out (Consumption)</th>
                        <th style={{ color: 'var(--warning)' }}>Waste</th>
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
                            <td style={{ fontWeight: 600 }}>{getItemName(parseInt(itemId))}</td>
                            <td style={{ color: 'var(--success)', fontWeight: 600 }}>+{m.in.toFixed(3)}</td>
                            <td style={{ color: 'var(--error)',   fontWeight: 600 }}>-{m.out.toFixed(3)}</td>
                            <td style={{ color: 'var(--warning)' }}>{m.waste.toFixed(3)}</td>
                            <td>₹{m.in_value.toFixed(2)}</td>
                            <td>₹{m.out_value.toFixed(2)}</td>
                            <td style={{ fontWeight: 700, color: net >= 0 ? 'var(--success)' : 'var(--error)' }}>
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

          {/* ── OUTSTANDING ── */}
          {tab === 'outstanding' && (
            <div>
              {outstanding.length === 0 && (
                <div className="empty-state"><div className="empty-icon">💸</div><h3>No Data</h3><p>No supplier payment records found.</p></div>
              )}
              {outstanding.length > 0 && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                    {[
                      { label: 'Total Suppliers',  value: outstanding.length, color: 'var(--primary)' },
                      { label: 'With Outstanding', value: outstanding.filter(o => parseFloat(o.outstanding) > 0).length, color: 'var(--warning)' },
                      { label: 'Total Due',        value: `₹${outstanding.reduce((s, o) => s + Math.max(0, parseFloat(o.outstanding)), 0).toFixed(2)}`, color: 'var(--error)' },
                    ].map(c => (
                      <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: 22, color: c.color }}>{c.value}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{c.label}</div>
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
                              <td style={{ fontWeight: 700, color: amt > 0 ? 'var(--error)' : amt < 0 ? 'var(--success)' : 'var(--text-3)' }}>
                                ₹{Math.abs(amt).toFixed(2)}
                                {amt < 0 && <span style={{ fontSize: 11, color: 'var(--success)', marginLeft: 4 }}>(Credit)</span>}
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
