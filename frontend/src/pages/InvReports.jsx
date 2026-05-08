/**
 * InvReports.jsx — Inventory Module 8: Reports + Live Stock Balance
 * - Live stock balance per node with low-stock alerts
 * - Supplier outstanding
 * - Stock movement summary
 */

import { useEffect, useState } from 'react';
import { invReportsAPI, invStockAPI, invItemAPI, invSupplierAPI } from '../services/api';
import { useInventoryNodes } from './useInventoryNodes';
import { Spinner, PageHeader, Select, FormField, Badge } from '../components/UI';
import { useApp } from '../context/useApp';

const today = () => new Date().toISOString().split('T')[0];
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; };

export default function InvReports() {
  const { selectedCompany } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [tab, setTab] = useState('balance');

  // Stock Balance
  const [balance,   setBalance]   = useState([]);
  const [lowStock,  setLowStock]  = useState([]);
  const [items,     setItems]     = useState([]);
  const [filterNode, setFilterNode] = useState('');
  const { nodes } = useInventoryNodes(cid);

  // Movement
  const [movement,  setMovement]  = useState([]);
  const [fromDate,  setFromDate]  = useState(monthStart());
  const [toDate,    setToDate]    = useState(today());

  // Supplier outstanding
  const [outstanding, setOutstanding] = useState([]);

  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [i, ls] = await Promise.allSettled([
        invItemAPI.getAll(cid),
        invStockAPI.getLowStock(cid),
      ]);
      setItems(i.status === 'fulfilled' ? (i.value || []) : []);
      setLowStock(ls.status === 'fulfilled' ? (ls.value || []) : []);
    } catch {}
    setLoading(false);
  };

  const loadBalance = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const b = await invStockAPI.getBalance(cid, filterNode ? parseInt(filterNode) : null);
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
  useEffect(() => { if (tab === 'balance') loadBalance(); }, [tab, cid, filterNode]);
  useEffect(() => { if (tab === 'movement') loadMovement(); }, [tab, cid]);
  useEffect(() => { if (tab === 'outstanding') loadOutstanding(); }, [tab, cid]);

  const getItemName = (id) => items.find(i => i.item_id === id)?.item_name || `Item #${id}`;
  const getNodeName = (id) => nodes.find(n => n.node_id === id)?.node_name || `Node #${id}`;
  const getItemReorder = (id) => {
    const item = items.find(i => i.item_id === id);
    return item ? parseFloat(item.reorder_level || 0) : 0;
  };

  // Group balance by node
  const balanceByNode = {};
  balance.forEach(b => {
    if (!balanceByNode[b.node_id]) balanceByNode[b.node_id] = [];
    balanceByNode[b.node_id].push(b);
  });

  // Group movement by type
  const movementSummary = {};
  movement.forEach(m => {
    if (!movementSummary[m.item_id]) movementSummary[m.item_id] = { in: 0, out: 0, waste: 0, in_value: 0, out_value: 0 };
    if (m.type === 'grn_in') { movementSummary[m.item_id].in += parseFloat(m.qty || 0); movementSummary[m.item_id].in_value += parseFloat(m.value || 0); }
    if (m.type === 'consumption_out') { movementSummary[m.item_id].out += parseFloat(m.qty || 0); movementSummary[m.item_id].out_value += parseFloat(m.value || 0); }
    if (m.type === 'waste_out') { movementSummary[m.item_id].waste += parseFloat(m.qty || 0); }
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
          <span style={{ fontSize: 24 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: '#c2410c' }}>{lowStock.length} item(s) below reorder level</div>
            <div style={{ fontSize: 12, color: '#9a3412', marginTop: 2 }}>
              {lowStock.slice(0, 5).map(l => `${getItemName(l.item_id)} (${l.qty_on_hand} at ${getNodeName(l.node_id)})`).join(' · ')}
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
          <div style={{ minWidth: 200 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>FILTER BY NODE</label>
            <select className="input select" value={filterNode} onChange={(e) => setFilterNode(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }}>
              <option value="">All Nodes</option>
              {nodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_name}</option>)}
            </select>
          </div>
        )}
        {tab === 'movement' && (
          <>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>FROM DATE</label>
              <input type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>TO DATE</label>
              <input type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }} />
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
              {Object.keys(balanceByNode).length === 0 && (
                <div className="empty-state"><div className="empty-icon">📦</div><h3>No Stock Data</h3><p>Post a GRN to see stock balances.</p></div>
              )}
              {Object.entries(balanceByNode).map(([nodeId, rows]) => (
                <div key={nodeId} style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    📍 {getNodeName(parseInt(nodeId))}
                    <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 12 }}>{rows.length} item(s)</span>
                  </h3>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>On Hand</th>
                          <th>Reorder Level</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(b => {
                          const onHand = parseFloat(b.qty_on_hand);
                          const reorder = getItemReorder(b.item_id);
                          const isLow = onHand <= reorder;
                          return (
                            <tr key={b.balance_id} style={{ background: isLow ? '#fff7ed' : undefined }}>
                              <td>{getItemName(b.item_id)}</td>
                              <td style={{ fontWeight: 700, color: isLow ? 'var(--warning)' : 'var(--text)' }}>
                                {onHand.toFixed(3)}
                                {isLow && <span style={{ marginLeft: 6, fontSize: 10, background: '#fed7aa', color: '#c2410c', padding: '2px 6px', borderRadius: 4 }}>LOW</span>}
                              </td>
                              <td>{reorder.toFixed(3)}</td>
                              <td>
                                <Badge variant={isLow ? 'warning' : 'success'}>{isLow ? 'Low Stock' : 'OK'}</Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
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
                            <td style={{ color: 'var(--error)', fontWeight: 600 }}>-{m.out.toFixed(3)}</td>
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
                  {/* Summary card */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                    {[
                      { label: 'Total Suppliers', value: outstanding.length, color: 'var(--primary)' },
                      { label: 'With Outstanding', value: outstanding.filter(o => parseFloat(o.outstanding) > 0).length, color: 'var(--warning)' },
                      { label: 'Total Due', value: `₹${outstanding.reduce((s, o) => s + Math.max(0, parseFloat(o.outstanding)), 0).toFixed(2)}`, color: 'var(--error)' },
                    ].map(c => (
                      <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: 22, color: c.color }}>{c.value}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{c.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Supplier</th>
                          <th>Outstanding (₹)</th>
                          <th>Status</th>
                        </tr>
                      </thead>
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
