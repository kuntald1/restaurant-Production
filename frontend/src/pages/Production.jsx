/**
 * Production.jsx — Central Kitchen Production Entry
 *
 * Smart flow:
 *  1. Select node + recipe + finished item + planned qty
 *  2. Click "Check Stock" → system checks CK stock vs recipe requirements
 *     - Shows ingredient table: required vs available vs short
 *     - Shows max producible qty
 *     - BLOCKS create if stock insufficient
 *  3. If sufficient → Create Entry → review → Post
 */

import { useEffect, useState } from 'react';
import { productionAPI, invItemAPI, invCategoryAPI, invUomAPI, invRecipeAPI } from '../services/api';
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

  const [entries,  setEntries]  = useState([]);
  const [items,    setItems]    = useState([]);
  const [recipes,  setRecipes]  = useState([]);
  const [uoms,     setUoms]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [modal,    setModal]    = useState(null);
  const [selected, setSelected] = useState(null);
  const [posting,  setPosting]  = useState(false);
  const [confirm,  setConfirm]  = useState(null);
  const [shortage, setShortage] = useState(null);

  const { nodes } = useInventoryNodes(cid, selectedCompany, allCompanies);
  const productionNodes = nodes.filter(n =>
    (n.node_type||'').toLowerCase().includes('cloud') ||
    (n.node_type||'').toLowerCase().includes('kitchen') ||
    (n.node_name||'').toLowerCase().includes('kitchen') ||
    (n.node_name||'').toLowerCase().includes('ck')
  );
  const availableNodes = productionNodes.length > 0 ? productionNodes : nodes;

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [e, it, u, cats, rec] = await Promise.allSettled([
        productionAPI.getAll(cid),
        invItemAPI.getAll(cid),
        invUomAPI.getAll(cid),
        invCategoryAPI.getAll(cid),
        invRecipeAPI.getAll(cid),
      ]);
      const itemsData = it.status === 'fulfilled' ? (it.value || []) : [];
      const catsData  = cats.status === 'fulfilled' ? (cats.value || []) : [];
      const enriched  = itemsData.map(item => {
        const cat = catsData.find(c => (c.category_id||c.item_category_id) === (item.item_category_id||item.category_id));
        return { ...item, category_name: cat?.category_name || '' };
      });
      setEntries(e.status === 'fulfilled'   ? (e.value   || []) : []);
      setItems(enriched);
      setUoms(u.status === 'fulfilled'      ? (u.value   || []) : []);
      setRecipes(rec.status === 'fulfilled' ? (rec.value || []) : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const finishedItems = items.filter(i => (i.category_name||'').toLowerCase().includes('finish'));
  const finishedItemOptions = finishedItems.length > 0 ? finishedItems : items;
  const getNodeName  = id => nodes.find(n => String(n.node_id).replace('b_','') === String(id).replace('b_',''))?.node_name || `Node #${id}`;
  const getUomSymbol = id => { const u = uoms.find(u => u.uom_id === id); return u?.uom_symbol || ''; };

  // ── Form state ────────────────────────────────────────────
  const [form, setForm] = useState({
    node_id: '', recipe_id: '', finished_item_id: '',
    production_date: today(), planned_qty: '', yield_uom_id: '', notes: '',
  });
  const [preCheck,  setPreCheck]  = useState(null);
  const [checking,  setChecking]  = useState(false);

  const resetForm = () => {
    setForm({ node_id: '', recipe_id: '', finished_item_id: '', production_date: today(), planned_qty: '', yield_uom_id: '', notes: '' });
    setPreCheck(null);
  };

  // ── Smart stock pre-check ─────────────────────────────────
  const handlePreCheck = async () => {
    if (!form.node_id || !form.planned_qty || !form.recipe_id) {
      showToast('Select node, recipe and planned quantity first', 'error'); return;
    }
    setChecking(true); setPreCheck(null);
    try {
      const nodeInt    = parseInt(String(form.node_id).replace('b_',''));
      const plannedQty = parseFloat(form.planned_qty);
      const recipe     = recipes.find(r => r.recipe_id === parseInt(form.recipe_id));
      const recipeYield = parseFloat(recipe?.yield_qty || 1);
      const scale       = plannedQty / recipeYield;

      // Fetch recipe ingredients with item details
      const [ingRes, stockRes] = await Promise.allSettled([
        invRecipeAPI.getById(parseInt(form.recipe_id)),
        productionAPI.getNodeStock(cid, nodeInt),
      ]);

      const recipeDetail = ingRes.status === 'fulfilled' ? ingRes.value : null;
      const ingredients  = recipeDetail?.ingredients || recipeDetail?.items || [];
      const stockList    = stockRes.status === 'fulfilled' ? (stockRes.value || []) : [];

      const stockMap = {};
      stockList.forEach(s => { stockMap[s.item_id] = parseFloat(s.qty_on_hand || 0); });

      let minRatio = Infinity;
      const rows = ingredients.map(ing => {
        const required  = parseFloat((parseFloat(ing.qty || ing.quantity || 0) * scale).toFixed(3));
        const available = parseFloat((stockMap[ing.item_id] || 0).toFixed(3));
        const ratio     = required > 0 ? available / required : 1;
        if (ratio < minRatio) minRatio = ratio;
        const itemObj = items.find(i => i.item_id === ing.item_id);
        return {
          item_id:   ing.item_id,
          item_name: ing.item_name || itemObj?.item_name || `Item #${ing.item_id}`,
          uom:       ing.uom_symbol || ing.uom_name || getUomSymbol(ing.uom_id),
          required,
          available,
          short_by:  parseFloat(Math.max(0, required - available).toFixed(3)),
          sufficient: available >= required,
        };
      });

      const maxQty    = minRatio === Infinity ? plannedQty : parseFloat((plannedQty * Math.min(minRatio, 1)).toFixed(2));
      const sufficient = rows.every(r => r.sufficient);

      setPreCheck({ rows, maxQty, sufficient, plannedQty, recipeName: recipe?.recipe_name });
    } catch (e) { showToast(e.message || 'Stock check failed', 'error'); }
    setChecking(false);
  };

  // Clear pre-check when key fields change
  const updateForm = (field, val) => {
    setForm(p => ({ ...p, [field]: val }));
    if (['node_id','recipe_id','planned_qty'].includes(field)) setPreCheck(null);
  };

  // ── Create entry ──────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.node_id || !form.planned_qty) {
      showToast('Node and planned quantity are required', 'error'); return;
    }
    if (form.recipe_id && preCheck && !preCheck.sufficient) {
      showToast('Insufficient stock — fix shortages first', 'error'); return;
    }
    if (form.recipe_id && !preCheck) {
      showToast('Please click "Check Stock" first', 'error'); return;
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
      showToast('Production entry created! ✅');
      setModal('view'); setSelected(res); setPreCheck(null);
      load();
    } catch (e) { showToast(e.message || 'Error', 'error'); }
  };

  // ── Update line qty ───────────────────────────────────────
  const updateLineQty = async (entry, prodItemId, actualQty) => {
    try {
      await productionAPI.update(entry.production_id, {
        items: [{ prod_item_id: prodItemId, actual_qty: parseFloat(actualQty) }]
      });
      const updated = await productionAPI.getById(entry.production_id);
      setSelected(updated);
    } catch (e) { showToast(e.message || 'Error', 'error'); }
  };

  // ── Post entry ────────────────────────────────────────────
  const handlePost = async (entry) => {
    setPosting(true); setShortage(null);
    try {
      const check = await productionAPI.checkStock(entry.production_id);
      if (!check.sufficient) {
        setShortage({ ...check, maxProducible: check.max_producible });
        setPosting(false); return;
      }
      const res = await productionAPI.post(entry.production_id, user?.username || 'admin');
      showToast('Production posted! Stock updated. ✅');
      setSelected(res); setShortage(null); load();
    } catch (e) { showToast(e.message || 'Error posting', 'error'); }
    setPosting(false);
  };

  // ── Delete ────────────────────────────────────────────────
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
        action={<button className="btn btn-primary" onClick={() => { resetForm(); setModal('create'); }}>+ New Production</button>}
      />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
        {[
          { emoji: '📝', label: 'Draft entries',    value: entries.filter(e => e.status === 'draft').length,  color: '#f59e0b', bg: '#fffbeb' },
          { emoji: '✅', label: 'Posted today',     value: entries.filter(e => e.status === 'posted' && e.production_date === today()).length, color: '#22c55e', bg: '#f0fdf4' },
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

      {loading ? <Spinner /> : entries.length === 0 ? (
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
                <th>Production #</th><th>Date</th><th>CK Node</th>
                <th>Finished Item</th><th>Recipe</th>
                <th>Planned Qty</th><th>Raw Cost</th><th>Status</th><th>Actions</th>
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
                  <td>{parseFloat(e.planned_qty||0).toFixed(2)} {e.uom_symbol||''}</td>
                  <td>₹{parseFloat(e.total_raw_cost||0).toFixed(2)}</td>
                  <td><Badge variant={STATUS_COLOR[e.status]}>{STATUS_ICON[e.status]} {e.status}</Badge></td>
                  <td>
                    <div className="action-btns">
                      <button className="btn btn-sm btn-outline" title="View details" onClick={async () => { const d = await productionAPI.getById(e.production_id); setSelected(d); setShortage(null); setModal('view'); }}>👁️</button>
                      {e.status === 'draft' && (
                        <button className="btn btn-sm btn-primary" title="Post production" onClick={async () => { const d = await productionAPI.getById(e.production_id); setSelected(d); setShortage(null); setModal('view'); setTimeout(() => document.getElementById('post-btn')?.click(), 300); }}>
                          ✅ Post
                        </button>
                      )}
                      {e.status === 'draft' && <button className="btn btn-sm btn-danger-ghost" onClick={() => setConfirm(e.production_id)}>🗑️</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirm && <ConfirmDialog message="Delete this production entry?" onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />}

      {/* ════════════════════════════════════════
          CREATE MODAL — Smart pre-check flow
      ════════════════════════════════════════ */}
      {modal === 'create' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '30px 20px', overflowY: 'auto' }}
          onClick={() => { setModal(null); resetForm(); }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 620, maxWidth: '95vw' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>🏭 New Production Entry</div>

            {/* Form fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              {/* CK Node */}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>CK / KITCHEN NODE *</div>
                <select value={form.node_id} onChange={e => updateForm('node_id', e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
                  <option value="">-- Select node --</option>
                  {availableNodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_label || n.node_name}</option>)}
                </select>
              </div>

              {/* Recipe */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>RECIPE (OPTIONAL)</div>
                <select value={form.recipe_id} onChange={e => updateForm('recipe_id', e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
                  <option value="">-- Select recipe --</option>
                  {recipes.map(r => <option key={r.recipe_id} value={r.recipe_id}>{r.recipe_name}</option>)}
                </select>
              </div>

              {/* Finished Item */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>FINISHED ITEM *</div>
                <select value={form.finished_item_id} onChange={e => updateForm('finished_item_id', e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
                  <option value="">-- Select finished item --</option>
                  {finishedItemOptions.map(i => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}
                </select>
              </div>

              {/* Planned Qty */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>PLANNED QUANTITY *</div>
                <input type="number" min="1" step="1" value={form.planned_qty}
                  onChange={e => updateForm('planned_qty', e.target.value)}
                  placeholder="e.g. 10"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              {/* Date */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>PRODUCTION DATE *</div>
                <input type="date" value={form.production_date}
                  onChange={e => updateForm('production_date', e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              {/* UOM */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>UNIT OF MEASURE</div>
                <select value={form.yield_uom_id} onChange={e => updateForm('yield_uom_id', e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
                  <option value="">-- Select UOM --</option>
                  {uoms.map(u => <option key={u.uom_id} value={u.uom_id}>{u.uom_name} ({u.uom_symbol})</option>)}
                </select>
              </div>

              {/* Notes */}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>NOTES</div>
                <textarea value={form.notes} onChange={e => updateForm('notes', e.target.value)}
                  rows={2} placeholder="Optional notes..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Check Stock button */}
            {form.recipe_id && form.node_id && form.planned_qty && (
              <button onClick={handlePreCheck} disabled={checking}
                style={{ width: '100%', padding: '10px', borderRadius: 8, background: checking ? '#e5e7eb' : '#3b82f6', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: checking ? 'not-allowed' : 'pointer', marginBottom: 16 }}>
                {checking ? '⏳ Checking stock…' : '🔍 Check Stock Availability'}
              </button>
            )}

            {/* Pre-check result */}
            {preCheck && (
              <div style={{ marginBottom: 16 }}>
                {/* Max producible banner */}
                <div style={{ background: preCheck.sufficient ? '#f0fdf4' : '#fef2f2', border: `2px solid ${preCheck.sufficient ? '#22c55e' : '#ef4444'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
                  {preCheck.sufficient ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 24 }}>✅</span>
                      <div>
                        <div style={{ fontWeight: 700, color: '#15803d', fontSize: 14 }}>
                          Sufficient stock! You can produce {preCheck.plannedQty} packets.
                        </div>
                        <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>
                          All ingredients available at {getNodeName(form.node_id)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 24 }}>🚫</span>
                        <div>
                          <div style={{ fontWeight: 700, color: '#b91c1c', fontSize: 14 }}>
                            Insufficient stock for {preCheck.plannedQty} packets
                          </div>
                          <div style={{ fontSize: 13, color: '#7f1d1d', marginTop: 2 }}>
                            Maximum you can produce: <strong style={{ fontSize: 15 }}>{preCheck.maxQty} packets</strong>
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#b91c1c', background: '#fff', borderRadius: 6, padding: '8px 10px' }}>
                        💡 Either reduce planned quantity to <strong>{preCheck.maxQty}</strong> or transfer more stock from Main Warehouse to {getNodeName(form.node_id)} first.
                        <button onClick={() => updateForm('planned_qty', preCheck.maxQty)}
                          style={{ marginLeft: 10, padding: '2px 10px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Use {preCheck.maxQty}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Ingredient table */}
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                  📋 Ingredient consumption for {preCheck.plannedQty} packets ({preCheck.recipeName}):
                </div>
                <div className="table-wrapper">
                  <table className="data-table" style={{ marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th>Ingredient</th>
                        <th>Required</th>
                        <th>Available at CK</th>
                        <th>After Production</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preCheck.rows.map((r, i) => (
                        <tr key={i} style={{ background: r.sufficient ? undefined : '#fef2f2' }}>
                          <td style={{ fontWeight: 500 }}>{r.item_name}</td>
                          <td style={{ fontWeight: 600 }}>{r.required.toFixed(3)} {r.uom}</td>
                          <td style={{ fontWeight: 600, color: r.sufficient ? '#22c55e' : '#ef4444' }}>
                            {r.available.toFixed(3)} {r.uom}
                          </td>
                          <td style={{ fontWeight: 600, color: r.sufficient ? 'var(--color-text-primary)' : '#b91c1c' }}>
                            {r.sufficient
                              ? `${(r.available - r.required).toFixed(3)} ${r.uom}`
                              : `-${r.short_by.toFixed(3)} ${r.uom} ⚠️`
                            }
                          </td>
                          <td>
                            {r.sufficient
                              ? <span style={{ color: '#22c55e', fontWeight: 700 }}>✅ OK</span>
                              : <span style={{ color: '#ef4444', fontWeight: 700 }}>🚫 Short {r.short_by.toFixed(3)} {r.uom}</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={() => { setModal(null); resetForm(); }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={handleCreate}
                disabled={form.recipe_id && preCheck && !preCheck.sufficient}
                style={{
                  padding: '8px 24px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  background: (form.recipe_id && preCheck && !preCheck.sufficient) ? '#e5e7eb' : '#22c55e',
                  color: (form.recipe_id && preCheck && !preCheck.sufficient) ? '#9ca3af' : '#fff',
                }}>
                {form.recipe_id && !preCheck ? '🔍 Check Stock First' : (form.recipe_id && !preCheck?.sufficient) ? '🚫 Insufficient Stock' : '✅ Create Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          VIEW / POST MODAL
      ════════════════════════════════════════ */}
      {modal === 'view' && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '30px 20px', overflowY: 'auto' }}
          onClick={() => { setModal(null); setShortage(null); }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 720, maxWidth: '95vw' }}
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

            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Finished Item',     value: selected.finished_item_name || '—' },
                { label: 'Recipe',            value: selected.recipe_name || '—'       },
                { label: 'Planned Qty',       value: `${parseFloat(selected.planned_qty||0).toFixed(2)} ${selected.uom_symbol||''}` },
                { label: 'Raw Material Cost', value: `₹${parseFloat(selected.total_raw_cost||0).toFixed(2)}` },
                { label: 'Notes',             value: selected.notes || '—'             },
                { label: 'Posted By',         value: selected.posted_by || '—'         },
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
              {selected.status === 'draft' && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>— adjust actual quantities if needed</span>}
            </div>

            {(!selected.items || selected.items.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                No raw material lines — no recipe was selected
              </div>
            ) : (
              <div className="table-wrapper" style={{ marginBottom: 16 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Raw Material</th><th>Required Qty</th><th>Actual Qty</th>
                      <th>UOM</th><th>Stock on Hand</th><th>Unit Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map(it => {
                      const stockOk = parseFloat(it.stock_on_hand) >= parseFloat(it.actual_qty || it.required_qty);
                      return (
                        <tr key={it.prod_item_id} style={{ background: !stockOk ? '#fef2f2' : undefined }}>
                          <td style={{ fontWeight: 500 }}>{it.item_name}</td>
                          <td>{parseFloat(it.required_qty||0).toFixed(3)}</td>
                          <td>
                            {selected.status === 'draft' ? (
                              <input type="number" min="0" step="0.001"
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
                              {parseFloat(it.stock_on_hand||0).toFixed(3)}
                            </span>
                            {!stockOk && <span style={{ fontSize: 10, color: '#ef4444', marginLeft: 4 }}>⚠️</span>}
                          </td>
                          <td style={{ fontSize: 12 }}>₹{parseFloat(it.unit_cost||0).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Shortage blocking panel */}
            {shortage && (
              <div style={{ background: '#fef2f2', border: '2px solid #ef4444', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#b91c1c', marginBottom: 10 }}>
                  🚫 Cannot Post — Insufficient Stock at {selected.node_name}
                </div>
                <table className="data-table" style={{ marginBottom: 12 }}>
                  <thead><tr><th>Ingredient</th><th style={{color:'#ef4444'}}>Needed</th><th style={{color:'#22c55e'}}>Available</th><th style={{color:'#ef4444'}}>Short by</th></tr></thead>
                  <tbody>
                    {shortage.shortages?.map((s, i) => (
                      <tr key={i} style={{ background: '#fef2f2' }}>
                        <td style={{ fontWeight: 600 }}>{s.item_name}</td>
                        <td style={{ color: '#ef4444', fontWeight: 600 }}>{s.needed?.toFixed(3)}</td>
                        <td style={{ color: '#22c55e', fontWeight: 600 }}>{s.available?.toFixed(3)}</td>
                        <td style={{ color: '#b91c1c', fontWeight: 700 }}>-{s.short_by?.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 13, color: '#7f1d1d', background: '#fff', borderRadius: 8, padding: '10px 14px' }}>
                  📦 Transfer more stock from Main Warehouse → {selected.node_name}<br/>
                  📉 Or reduce planned qty to <strong>{shortage.maxProducible?.toFixed(2)}</strong> packets (max with current stock)
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => { setModal(null); setShortage(null); }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                Close
              </button>
              {selected.status === 'draft' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setConfirm(selected.production_id)}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    🗑️ Delete
                  </button>
                  <button id="post-btn" onClick={() => handlePost(selected)} disabled={posting}
                    style={{ padding: '8px 24px', borderRadius: 8, background: posting ? '#86efac' : '#22c55e', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: posting ? 'not-allowed' : 'pointer' }}>
                    {posting ? '⏳ Checking & Posting…' : '✅ Post Production'}
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
