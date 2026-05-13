/**
 * Production.jsx — Central Kitchen Production Entry
 *
 * Flow:
 *  1. Create production entry — select CK node, recipe, finished item, qty
 *  2. System auto-fills raw material lines from recipe
 *  3. Manager reviews/adjusts actual quantities
 *  4. Post → raw materials deducted from CK, finished goods added to CK
 */

import { useEffect, useState } from 'react';
import { productionAPI, invItemAPI, invCategoryAPI, invUomAPI } from '../services/api';
import { useInventoryNodes } from './useInventoryNodes';
import { Spinner, PageHeader, Badge, Table, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const today = () => new Date().toISOString().split('T')[0];

const STATUS_COLOR = { draft: 'default', posted: 'success' };
const STATUS_ICON  = { draft: '📝', posted: '✅' };

const CARD = { background: '#ffffff', border: '1px solid #f0f0f0', borderRadius: 12, padding: '18px 20px' };

export default function Production() {
  const { selectedCompany, allCompanies, showToast, user } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [entries,    setEntries]    = useState([]);
  const [items,      setItems]      = useState([]);
  const [recipes,    setRecipes]    = useState([]);
  const [uoms,       setUoms]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [modal,      setModal]      = useState(null);  // 'create' | 'view'
  const [selected,   setSelected]   = useState(null);  // entry being viewed/edited
  const [posting,    setPosting]    = useState(false);
  const [confirm,    setConfirm]    = useState(null);

  const { nodes } = useInventoryNodes(cid, selectedCompany, allCompanies);

  // CK nodes only for production
  const ckNodes = nodes.filter(n =>
    (n.node_type || '').toLowerCase().includes('cloud') ||
    (n.node_type || '').toLowerCase().includes('kitchen') ||
    (n.node_name || '').toLowerCase().includes('kitchen') ||
    (n.node_name || '').toLowerCase().includes('ck')
  );
  // If no CK nodes found, show all nodes
  const productionNodes = ckNodes.length > 0 ? ckNodes : nodes;

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [e, it, u] = await Promise.allSettled([
        productionAPI.getAll(cid),
        invItemAPI.getAll(cid),
        invUomAPI.getAll(cid),
      ]);
      setEntries(e.status === 'fulfilled' ? (e.value || []) : []);
      setItems(it.status === 'fulfilled'  ? (it.value || []) : []);
      setUoms(u.status === 'fulfilled'    ? (u.value || []) : []);
    } catch {}
    setLoading(false);
  };

  // Load recipes from inv_recipe via items API (reuse item API endpoint)
  const loadRecipes = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/inventory/recipe/list/${cid}`);
      const data = await res.json();
      setRecipes(data || []);
    } catch { setRecipes([]); }
  };

  useEffect(() => { load(); loadRecipes(); }, [cid]);

  const getItemName = id => items.find(i => i.item_id === id)?.item_name || `Item #${id}`;
  const getUomSymbol = id => { const u = uoms.find(u => u.uom_id === id); return u?.uom_symbol || u?.uom_name || ''; };
  const getNodeName = id => nodes.find(n => String(n.node_id).replace('b_','') === String(id).replace('b_',''))?.node_name || `Node #${id}`;

  // ── Create entry ─────────────────────────────────────────────
  const [form, setForm] = useState({
    node_id: '', recipe_id: '', finished_item_id: '',
    production_date: today(), planned_qty: '', yield_uom_id: '', notes: '',
  });

  const handleCreate = async () => {
    if (!form.node_id || !form.planned_qty) {
      showToast('Node and planned quantity are required', 'error'); return;
    }
    try {
      const res = await productionAPI.create({
        company_unique_id: cid,
        node_id:           parseInt(String(form.node_id).replace('b_','')),
        recipe_id:         form.recipe_id ? parseInt(form.recipe_id) : null,
        finished_item_id:  form.finished_item_id ? parseInt(form.finished_item_id) : null,
        production_date:   form.production_date,
        planned_qty:       parseFloat(form.planned_qty),
        yield_uom_id:      form.yield_uom_id ? parseInt(form.yield_uom_id) : null,
        notes:             form.notes,
        created_by:        user?.username || user?.name || 'admin',
      });
      showToast('Production entry created!');
      setModal('view'); setSelected(res);
      load();
    } catch (e) { showToast(e.message || 'Error', 'error'); }
  };

  // ── Update actual qty of a line ──────────────────────────────
  const updateLineQty = async (entry, prodItemId, actualQty) => {
    try {
      await productionAPI.update(entry.production_id, {
        items: [{ prod_item_id: prodItemId, actual_qty: parseFloat(actualQty) }]
      });
      // Refresh selected entry
      const updated = await productionAPI.getById(entry.production_id);
      setSelected(updated);
    } catch (e) { showToast(e.message || 'Error', 'error'); }
  };

  // ── Post entry ───────────────────────────────────────────────
  const handlePost = async (entry) => {
    setPosting(true);
    try {
      const res = await productionAPI.post(entry.production_id, user?.username || 'admin');
      showToast('Production posted! Stock updated.');
      setSelected(res); load();
    } catch (e) { showToast(e.message || 'Error', 'error'); }
    setPosting(false);
  };

  // ── Delete ───────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await productionAPI.delete(id);
      showToast('Entry deleted'); load();
      if (selected?.production_id === id) { setModal(null); setSelected(null); }
    } catch (e) { showToast(e.message || 'Error', 'error'); }
    setConfirm(null);
  };

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No company selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader
        title="🏭 Production Entry"
        subtitle="Central Kitchen — convert raw materials into finished goods"
        action={<button className="btn btn-primary" onClick={() => { setForm({ node_id: '', recipe_id: '', finished_item_id: '', production_date: today(), planned_qty: '', yield_uom_id: '', notes: '' }); setModal('create'); }}>+ New Production</button>}
      />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
        {[
          { emoji: '📝', label: 'Draft entries',  value: entries.filter(e => e.status === 'draft').length,  color: '#f59e0b', bg: '#fffbeb' },
          { emoji: '✅', label: 'Posted today',   value: entries.filter(e => e.status === 'posted' && e.production_date === today()).length, color: '#22c55e', bg: '#f0fdf4' },
          { emoji: '🏭', label: 'Total this month', value: entries.filter(e => e.production_date?.startsWith(today().slice(0,7))).length, color: '#3b82f6', bg: '#eff6ff' },
        ].map(c => (
          <div key={c.label} style={{ ...CARD, borderTop: `3px solid ${c.color}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{c.emoji}</div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          {entries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🏭</div>
              <h3>No production entries yet</h3>
              <p>Create a production entry to convert raw materials into finished goods at your Central Kitchen.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Production #</th>
                    <th>Date</th>
                    <th>CK Node</th>
                    <th>Finished Item</th>
                    <th>Recipe</th>
                    <th>Planned Qty</th>
                    <th>Raw Material Cost</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.production_id}>
                      <td style={{ fontWeight: 600, color: '#22c55e' }}>{e.production_number}</td>
                      <td style={{ fontSize: 12 }}>{e.production_date}</td>
                      <td style={{ fontSize: 12 }}>{e.node_name || getNodeName(e.node_id)}</td>
                      <td style={{ fontWeight: 500 }}>{e.finished_item_name || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{e.recipe_name || '—'}</td>
                      <td>{parseFloat(e.planned_qty || 0).toFixed(2)} {e.uom_symbol || ''}</td>
                      <td>₹{parseFloat(e.total_raw_cost || 0).toFixed(2)}</td>
                      <td>
                        <Badge variant={STATUS_COLOR[e.status]}>
                          {STATUS_ICON[e.status]} {e.status}
                        </Badge>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="btn btn-sm btn-outline" onClick={async () => { const d = await productionAPI.getById(e.production_id); setSelected(d); setModal('view'); }}>
                            View
                          </button>
                          {e.status === 'draft' && (
                            <button className="btn btn-sm btn-danger-ghost" onClick={() => setConfirm(e.production_id)}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {confirm && <ConfirmDialog message="Delete this production entry?" onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />}

      {/* ── Create Modal ── */}
      {modal === 'create' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setModal(null)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>🏭 New Production Entry</div>

            {[
              { label: 'CK / Kitchen Node *', field: 'node_id', type: 'nodeselect' },
              { label: 'Recipe (optional)', field: 'recipe_id', type: 'recipeselect' },
              { label: 'Finished Item *', field: 'finished_item_id', type: 'itemselect' },
              { label: 'Production Date *', field: 'production_date', type: 'date' },
              { label: 'Planned Quantity *', field: 'planned_qty', type: 'number', placeholder: 'e.g. 500' },
              { label: 'Unit of Measure', field: 'yield_uom_id', type: 'uomselect' },
              { label: 'Notes', field: 'notes', type: 'textarea' },
            ].map(f => (
              <div key={f.field} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 5, letterSpacing: '0.05em' }}>{f.label.toUpperCase()}</div>
                {f.type === 'nodeselect' ? (
                  <select value={form.node_id} onChange={e => setForm(p => ({ ...p, node_id: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
                    <option value="">-- Select node --</option>
                    {productionNodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_label || n.node_name}</option>)}
                  </select>
                ) : f.type === 'recipeselect' ? (
                  <select value={form.recipe_id} onChange={e => setForm(p => ({ ...p, recipe_id: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
                    <option value="">-- Select recipe (auto-fills ingredients) --</option>
                    {recipes.map(r => <option key={r.recipe_id} value={r.recipe_id}>{r.recipe_name}</option>)}
                  </select>
                ) : f.type === 'itemselect' ? (
                  <select value={form.finished_item_id} onChange={e => setForm(p => ({ ...p, finished_item_id: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
                    <option value="">-- Select finished item --</option>
                    {items.map(i => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}
                  </select>
                ) : f.type === 'uomselect' ? (
                  <select value={form.yield_uom_id} onChange={e => setForm(p => ({ ...p, yield_uom_id: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
                    <option value="">-- Select UOM --</option>
                    {uoms.map(u => <option key={u.uom_id} value={u.uom_id}>{u.uom_name} ({u.uom_symbol})</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea value={form[f.field]} onChange={e => setForm(p => ({ ...p, [f.field]: e.target.value }))}
                    rows={2} placeholder="Optional notes..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                ) : (
                  <input type={f.type} value={form[f.field]} onChange={e => setForm(p => ({ ...p, [f.field]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box' }} />
                )}
              </div>
            ))}

            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', background: '#f0fdf4', padding: '8px 12px', borderRadius: 8, marginBottom: 20 }}>
              💡 If a recipe is selected, raw material lines will be auto-calculated from the recipe × planned quantity.
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleCreate} style={{ padding: '8px 24px', borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Create Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View / Post Modal ── */}
      {modal === 'view' && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setModal(null)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 720, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#22c55e' }}>{selected.production_number}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  📍 {selected.node_name} · 📅 {selected.production_date}
                </div>
              </div>
              <Badge variant={STATUS_COLOR[selected.status]}>{STATUS_ICON[selected.status]} {selected.status}</Badge>
            </div>

            {/* Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Finished Item', value: selected.finished_item_name || '—' },
                { label: 'Recipe',        value: selected.recipe_name || '—' },
                { label: 'Planned Qty',   value: `${parseFloat(selected.planned_qty || 0).toFixed(2)} ${selected.uom_symbol || ''}` },
                { label: 'Raw Material Cost', value: `₹${parseFloat(selected.total_raw_cost || 0).toFixed(2)}` },
                { label: 'Notes',         value: selected.notes || '—' },
                { label: 'Posted By',     value: selected.posted_by || '—' },
              ].map(d => (
                <div key={d.label} style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>{d.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{d.value}</div>
                </div>
              ))}
            </div>

            {/* Raw material lines */}
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
              🥬 Raw materials consumed
              {selected.status === 'draft' && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>— adjust actual quantities before posting</span>}
            </div>

            {(!selected.items || selected.items.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                No raw material lines — add a recipe or add items manually
              </div>
            ) : (
              <div className="table-wrapper" style={{ marginBottom: 20 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Raw Material</th>
                      <th>Required Qty</th>
                      <th>Actual Qty</th>
                      <th>UOM</th>
                      <th>Stock on Hand</th>
                      <th>Unit Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map(it => {
                      const stockOk = parseFloat(it.stock_on_hand) >= parseFloat(it.actual_qty || it.required_qty);
                      return (
                        <tr key={it.prod_item_id} style={{ background: !stockOk ? '#fef2f2' : undefined }}>
                          <td style={{ fontWeight: 500 }}>{it.item_name}</td>
                          <td>{parseFloat(it.required_qty || 0).toFixed(3)}</td>
                          <td>
                            {selected.status === 'draft' ? (
                              <input
                                type="number" min="0" step="0.001"
                                defaultValue={parseFloat(it.actual_qty || it.required_qty).toFixed(3)}
                                onBlur={e => updateLineQty(selected, it.prod_item_id, e.target.value)}
                                style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: `1px solid ${!stockOk ? '#fca5a5' : '#e5e7eb'}`, fontSize: 13, textAlign: 'right' }}
                              />
                            ) : (
                              <span style={{ fontWeight: 500 }}>{parseFloat(it.actual_qty || it.required_qty || 0).toFixed(3)}</span>
                            )}
                          </td>
                          <td style={{ fontSize: 12 }}>{it.uom_symbol || getUomSymbol(it.uom_id)}</td>
                          <td>
                            <span style={{ fontWeight: 500, color: stockOk ? '#22c55e' : '#ef4444' }}>
                              {parseFloat(it.stock_on_hand || 0).toFixed(3)}
                            </span>
                            {!stockOk && <span style={{ fontSize: 10, color: '#ef4444', marginLeft: 4 }}>⚠️ Low</span>}
                          </td>
                          <td style={{ fontSize: 12 }}>₹{parseFloat(it.unit_cost || 0).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Warning if any stock is insufficient */}
            {selected.status === 'draft' && selected.items?.some(it => parseFloat(it.stock_on_hand) < parseFloat(it.actual_qty || it.required_qty)) && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b91c1c' }}>
                ⚠️ Some raw materials have insufficient stock at this node. Posting will proceed but stock may go negative.
              </div>
            )}

            {/* Footer actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => setModal(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Close</button>
              {selected.status === 'draft' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setConfirm(selected.production_id)}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    🗑️ Delete
                  </button>
                  <button onClick={() => handlePost(selected)} disabled={posting}
                    style={{ padding: '8px 24px', borderRadius: 8, background: posting ? '#86efac' : '#22c55e', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: posting ? 'not-allowed' : 'pointer' }}>
                    {posting ? '⏳ Posting…' : '✅ Post Production'}
                  </button>
                </div>
              )}
              {selected.status === 'posted' && (
                <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
                  ✅ Posted at {selected.posted_at ? new Date(selected.posted_at).toLocaleString() : '—'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
