/**
 * InvConsumptionWaste.jsx — Inventory Modules 3 & 4
 * Stock Out / Consumption (Module 3) + Waste Management (Module 4)
 * Also includes Recipe Management (Module 6) as a tab
 */

import { useEffect, useState } from 'react';
import {
  invConsumptionAPI, invWasteAPI, invRecipeAPI,
  invItemAPI, invNodeAPI, invUomAPI
} from '../services/api';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Select, Textarea, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const today = () => new Date().toISOString().split('T')[0];

const EMPTY_WASTE = {
  node_id: '', waste_date: today(), item_id: '', uom_id: '',
  qty_wasted: '', unit_cost: '0', waste_reason: '', notes: '',
};

const WASTE_REASONS = ['spoilage', 'overcooked', 'expired', 'dropped', 'quality_reject', 'other'];

const EMPTY_RECIPE = {
  recipe_name: '', food_menu_id: '', yield_qty: '1', yield_uom_id: '',
  preparation_time: '', is_sub_recipe: false, notes: '',
};

export default function InvConsumptionWaste() {
  const { selectedCompany, showToast, user } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [tab, setTab]         = useState('consumption');
  const [consumptions, setConsumptions] = useState([]);
  const [wastes, setWastes]   = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [items, setItems]     = useState([]);
  const [nodes, setNodes]     = useState([]);
  const [uoms, setUoms]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal]     = useState(null);
  const [form, setForm]       = useState(EMPTY_WASTE);
  const [lines, setLines]     = useState([]);
  const [editId, setEditId]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving]   = useState(false);
  const [viewRecipe, setViewRecipe] = useState(null);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [c, w, r, i, n, u] = await Promise.allSettled([
        invConsumptionAPI.getAll(cid), invWasteAPI.getAll(cid), invRecipeAPI.getAll(cid),
        invItemAPI.getAll(cid), invNodeAPI.getAll(cid), invUomAPI.getAll(cid),
      ]);
      setConsumptions(c.status === 'fulfilled' ? (c.value || []) : []);
      setWastes(w.status === 'fulfilled' ? (w.value || []) : []);
      setRecipes(r.status === 'fulfilled' ? (r.value || []) : []);
      setItems(i.status === 'fulfilled' ? (i.value || []) : []);
      setNodes(n.status === 'fulfilled' ? (n.value || []) : []);
      setUoms(u.status === 'fulfilled' ? (u.value || []) : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const getItemName = (id) => items.find(i => i.item_id === id)?.item_name || '—';
  const getNodeName = (id) => nodes.find(n => n.node_id === id)?.node_name || '—';
  const getUomName  = (id) => uoms.find(u => u.uom_id === id)?.uom_name || '—';

  // ── Consumption ──────────────────────────────────────────────
  const handleConsumptionSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        company_unique_id: cid,
        node_id: form.node_id ? parseInt(form.node_id) : null,
        consumption_date: form.consumption_date || today(),
        reference_type: 'manual',
        notes: form.notes,
        created_by: user?.username,
        items: lines.filter(l => l.item_id && l.qty).map(l => ({
          item_id: parseInt(l.item_id),
          qty_consumed: parseFloat(l.qty),
          unit_cost: parseFloat(l.unit_cost || 0),
        })),
      };
      await invConsumptionAPI.create(payload);
      showToast('Consumption recorded! Stock deducted ✅');
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  // ── Waste ────────────────────────────────────────────────────
  const handleWasteSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const qty = parseFloat(form.qty_wasted || 0);
      const cost = parseFloat(form.unit_cost || 0);
      const payload = {
        ...form, company_unique_id: cid,
        node_id: form.node_id ? parseInt(form.node_id) : null,
        item_id: form.item_id ? parseInt(form.item_id) : null,
        uom_id: form.uom_id ? parseInt(form.uom_id) : null,
        qty_wasted: qty, unit_cost: cost, total_cost: qty * cost,
        created_by: user?.username,
      };
      if (editId) { await invWasteAPI.update(editId, { ...payload, updated_by: user?.username }); showToast('Waste updated!'); }
      else { await invWasteAPI.create(payload); showToast('Waste recorded! Stock deducted ✅'); }
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };
  const handleWasteDelete = async (id) => {
    try { await invWasteAPI.delete(id); showToast('Deleted'); load(); } catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  // ── Recipe ───────────────────────────────────────────────────
  const handleRecipeSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        ...form, company_unique_id: cid,
        yield_qty: parseFloat(form.yield_qty || 1),
        yield_uom_id: form.yield_uom_id ? parseInt(form.yield_uom_id) : null,
        preparation_time: form.preparation_time ? parseInt(form.preparation_time) : null,
        created_by: user?.username,
        ingredients: lines.filter(l => l.item_id && l.qty).map(l => ({
          item_id: parseInt(l.item_id),
          qty: parseFloat(l.qty),
          uom_id: l.uom_id ? parseInt(l.uom_id) : null,
          unit_cost: parseFloat(l.unit_cost || 0),
        })),
      };
      if (editId) { await invRecipeAPI.update(editId, { ...payload, updated_by: user?.username }); showToast('Recipe updated!'); }
      else { await invRecipeAPI.create(payload); showToast('Recipe created!'); }
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };
  const handleRecipeDelete = async (id) => {
    try { await invRecipeAPI.delete(id); showToast('Recipe deleted'); load(); } catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  // ── Consumption lines ─────────────────────────────────────
  const ConsumptionLineEditor = () => {
    const addLine = () => setLines(l => [...l, { item_id: '', qty: '', unit_cost: '0' }]);
    const removeLine = (i) => setLines(l => l.filter((_, idx) => idx !== i));
    const setLine = (i, k, v) => setLines(l => l.map((row, idx) => idx === i ? { ...row, [k]: v } : row));
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <b style={{ fontSize: 13 }}>Items Consumed</b>
          <button type="button" className="btn btn-sm btn-ghost" onClick={addLine}>+ Add</button>
        </div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 32px', gap: 8, marginBottom: 6 }}>
            <Select value={line.item_id} onChange={(e) => setLine(i, 'item_id', e.target.value)}>
              <option value="">— Item —</option>
              {items.map(it => <option key={it.item_id} value={it.item_id}>{it.item_name}</option>)}
            </Select>
            <Input type="number" step="0.001" placeholder="Qty" value={line.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
            <Input type="number" step="0.01" placeholder="₹ Cost" value={line.unit_cost} onChange={(e) => setLine(i, 'unit_cost', e.target.value)} />
            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 18 }} onClick={() => removeLine(i)}>×</button>
          </div>
        ))}
        {lines.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: 12 }}>No items added.</p>}
      </div>
    );
  };

  // ── Recipe ingredient editor ──────────────────────────────
  const RecipeLineEditor = () => {
    const addLine = () => setLines(l => [...l, { item_id: '', qty: '', uom_id: '', unit_cost: '0' }]);
    const removeLine = (i) => setLines(l => l.filter((_, idx) => idx !== i));
    const setLine = (i, k, v) => setLines(l => l.map((row, idx) => idx === i ? { ...row, [k]: v } : row));
    const total = lines.reduce((sum, l) => sum + (parseFloat(l.qty || 0) * parseFloat(l.unit_cost || 0)), 0);
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <b style={{ fontSize: 13 }}>Ingredients</b>
          <button type="button" className="btn btn-sm btn-ghost" onClick={addLine}>+ Add</button>
        </div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 32px', gap: 8, marginBottom: 6 }}>
            <Select value={line.item_id} onChange={(e) => setLine(i, 'item_id', e.target.value)}>
              <option value="">— Ingredient —</option>
              {items.map(it => <option key={it.item_id} value={it.item_id}>{it.item_name}</option>)}
            </Select>
            <Input type="number" step="0.001" placeholder="Qty" value={line.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
            <Select value={line.uom_id} onChange={(e) => setLine(i, 'uom_id', e.target.value)}>
              <option value="">— UOM —</option>
              {uoms.map(u => <option key={u.uom_id} value={u.uom_id}>{u.uom_name}</option>)}
            </Select>
            <Input type="number" step="0.01" placeholder="₹/unit" value={line.unit_cost} onChange={(e) => setLine(i, 'unit_cost', e.target.value)} />
            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 18 }} onClick={() => removeLine(i)}>×</button>
          </div>
        ))}
        {lines.length > 0 && (
          <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)', marginTop: 8 }}>
            Total Cost: ₹{total.toFixed(2)}
          </div>
        )}
      </div>
    );
  };

  const consumptionCols = [
    { key: 'consumption_date', label: 'Date' },
    { key: 'node_id', label: 'Node', render: (v) => getNodeName(v) },
    { key: 'reference_type', label: 'Type', render: (v) => <Badge variant="info">{v || 'manual'}</Badge> },
    { key: 'items', label: 'Items', render: (v) => `${(v || []).length} item(s)` },
    { key: 'notes', label: 'Notes', render: (v) => v || '—' },
  ];

  const wasteCols = [
    { key: 'waste_date', label: 'Date' },
    { key: 'node_id', label: 'Node', render: (v) => getNodeName(v) },
    { key: 'item_id', label: 'Item', render: (v) => getItemName(v) },
    { key: 'qty_wasted', label: 'Qty', render: (v) => parseFloat(v).toFixed(3) },
    { key: 'waste_reason', label: 'Reason', render: (v) => v || '—' },
    { key: 'total_cost', label: 'Cost', render: (v) => `₹${parseFloat(v || 0).toFixed(2)}` },
  ];

  const recipeCols = [
    { key: 'recipe_name', label: 'Recipe Name' },
    { key: 'yield_qty', label: 'Yield', render: (v) => parseFloat(v || 1).toFixed(2) },
    { key: 'preparation_time', label: 'Prep Time', render: (v) => v ? `${v} min` : '—' },
    { key: 'is_sub_recipe', label: 'Type', render: (v) => <Badge variant={v ? 'warning' : 'info'}>{v ? 'Sub-Recipe' : 'Main'}</Badge> },
    { key: 'total_cost', label: 'Total Cost', render: (v) => `₹${parseFloat(v || 0).toFixed(2)}` },
    { key: 'ingredients', label: 'Ingredients', render: (v) => `${(v || []).length}` },
  ];

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader
        title="📤 Consumption, Waste & Recipes"
        subtitle="Track stock out, waste entries and manage recipes with costing"
        action={
          tab === 'consumption' ? <button className="btn btn-primary" onClick={() => { setForm({ node_id: '', consumption_date: today(), notes: '' }); setLines([]); setModal('consumption'); }}>+ Record Consumption</button>
          : tab === 'waste' ? <button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY_WASTE }); setEditId(null); setModal('waste'); }}>+ Record Waste</button>
          : <button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY_RECIPE }); setLines([]); setEditId(null); setModal('recipe'); }}>+ New Recipe</button>
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[['consumption', '📤 Consumption'], ['waste', '🗑️ Waste'], ['recipe', '📖 Recipes']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === key ? 700 : 400, fontSize: 13,
            borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
            color: tab === key ? 'var(--primary)' : 'var(--text-3)', marginBottom: -2,
          }}>{label}</button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          {tab === 'consumption' && <Table columns={consumptionCols} data={consumptions} />}
          {tab === 'waste' && (
            <Table columns={wasteCols} data={wastes} actions={(row) => (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => {
                  setForm({ ...row, node_id: row.node_id || '', item_id: row.item_id || '', uom_id: row.uom_id || '' });
                  setEditId(row.waste_id); setModal('waste');
                }}>✏️</button>
                <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.waste_id, name: `Waste #${row.waste_id}`, type: 'waste' })}>🗑️</button>
              </div>
            )} />
          )}
          {tab === 'recipe' && (
            <Table columns={recipeCols} data={recipes} actions={(row) => (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setViewRecipe(row)}>👁️ View</button>
                <button className="btn btn-sm btn-ghost" onClick={() => {
                  setForm({ ...row }); setLines((row.ingredients || []).map(i => ({ item_id: i.item_id || '', qty: i.qty, uom_id: i.uom_id || '', unit_cost: i.unit_cost || '0' })));
                  setEditId(row.recipe_id); setModal('recipe');
                }}>✏️</button>
                <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.recipe_id, name: row.recipe_name, type: 'recipe' })}>🗑️</button>
              </div>
            )} />
          )}
        </>
      )}

      {/* ── Consumption Modal ── */}
      {modal === 'consumption' && (
        <Modal title="Record Consumption" onClose={() => setModal(null)} size="md">
          <form onSubmit={handleConsumptionSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="Node" required>
                <Select value={form.node_id} onChange={set('node_id')} required>
                  <option value="">— Select Node —</option>
                  {nodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_name}</option>)}
                </Select>
              </FormField>
              <FormField label="Date" required>
                <Input type="date" value={form.consumption_date} onChange={set('consumption_date')} required />
              </FormField>
            </div>
            <FormField label="Notes"><Textarea value={form.notes} onChange={set('notes')} rows={2} /></FormField>
            <div style={{ marginTop: 12 }}><ConsumptionLineEditor /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Record'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Waste Modal ── */}
      {modal === 'waste' && (
        <Modal title={editId ? 'Edit Waste Entry' : 'Record Waste'} onClose={() => setModal(null)} size="md">
          <form onSubmit={handleWasteSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Node">
                <Select value={form.node_id} onChange={set('node_id')}>
                  <option value="">— Select Node —</option>
                  {nodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_name}</option>)}
                </Select>
              </FormField>
              <FormField label="Date" required>
                <Input type="date" value={form.waste_date} onChange={set('waste_date')} required />
              </FormField>
              <FormField label="Item" required>
                <Select value={form.item_id} onChange={set('item_id')} required>
                  <option value="">— Select Item —</option>
                  {items.map(i => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}
                </Select>
              </FormField>
              <FormField label="UOM">
                <Select value={form.uom_id} onChange={set('uom_id')}>
                  <option value="">— UOM —</option>
                  {uoms.map(u => <option key={u.uom_id} value={u.uom_id}>{u.uom_name}</option>)}
                </Select>
              </FormField>
              <FormField label="Qty Wasted" required>
                <Input type="number" step="0.001" value={form.qty_wasted} onChange={set('qty_wasted')} required placeholder="0.000" />
              </FormField>
              <FormField label="Unit Cost (₹)">
                <Input type="number" step="0.01" value={form.unit_cost} onChange={set('unit_cost')} placeholder="0.00" />
              </FormField>
              <FormField label="Reason">
                <Select value={form.waste_reason} onChange={set('waste_reason')}>
                  <option value="">— Reason —</option>
                  {WASTE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </Select>
              </FormField>
            </div>
            <FormField label="Notes"><Textarea value={form.notes} onChange={set('notes')} rows={2} /></FormField>
            {form.qty_wasted && form.unit_cost && (
              <div style={{ background: 'var(--error-bg)', padding: '8px 12px', borderRadius: 6, marginTop: 8, fontWeight: 600, color: 'var(--error)' }}>
                Total Waste Value: ₹{(parseFloat(form.qty_wasted || 0) * parseFloat(form.unit_cost || 0)).toFixed(2)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Record'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Recipe Modal ── */}
      {modal === 'recipe' && (
        <Modal title={editId ? 'Edit Recipe' : 'New Recipe'} onClose={() => setModal(null)} size="lg">
          <form onSubmit={handleRecipeSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="Recipe Name" required>
                <Input value={form.recipe_name} onChange={set('recipe_name')} required placeholder="e.g. Chicken Biryani" />
              </FormField>
              <FormField label="Yield Quantity">
                <Input type="number" step="0.001" value={form.yield_qty} onChange={set('yield_qty')} placeholder="1" />
              </FormField>
              <FormField label="Yield UOM">
                <Select value={form.yield_uom_id} onChange={set('yield_uom_id')}>
                  <option value="">— None —</option>
                  {uoms.map(u => <option key={u.uom_id} value={u.uom_id}>{u.uom_name}</option>)}
                </Select>
              </FormField>
              <FormField label="Prep Time (min)">
                <Input type="number" value={form.preparation_time} onChange={set('preparation_time')} placeholder="30" />
              </FormField>
              <FormField label="Type">
                <Select value={form.is_sub_recipe ? 'true' : 'false'} onChange={(e) => setForm(f => ({ ...f, is_sub_recipe: e.target.value === 'true' }))}>
                  <option value="false">Main Recipe</option>
                  <option value="true">Sub-Recipe</option>
                </Select>
              </FormField>
            </div>
            <FormField label="Notes"><Textarea value={form.notes} onChange={set('notes')} rows={2} /></FormField>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}><RecipeLineEditor /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Recipe View Modal ── */}
      {viewRecipe && (
        <Modal title={`📖 ${viewRecipe.recipe_name}`} onClose={() => setViewRecipe(null)} size="md">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ textAlign: 'center', background: 'var(--primary-light)', padding: '10px 0', borderRadius: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>{parseFloat(viewRecipe.yield_qty || 1).toFixed(1)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Yield</div>
            </div>
            <div style={{ textAlign: 'center', background: 'var(--info-bg)', padding: '10px 0', borderRadius: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--info)' }}>{viewRecipe.preparation_time || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Min Prep</div>
            </div>
            <div style={{ textAlign: 'center', background: 'var(--warning-bg)', padding: '10px 0', borderRadius: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--warning)' }}>₹{parseFloat(viewRecipe.total_cost || 0).toFixed(2)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Total Cost</div>
            </div>
          </div>
          <b style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Ingredients</b>
          {(viewRecipe.ingredients || []).map((ing, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>{getItemName(ing.item_id)}</span>
              <span style={{ color: 'var(--text-3)' }}>{parseFloat(ing.qty).toFixed(3)} {getUomName(ing.uom_id)} · ₹{parseFloat(ing.unit_cost || 0).toFixed(2)}/unit</span>
            </div>
          ))}
          {viewRecipe.notes && <p style={{ marginTop: 12, color: 'var(--text-3)', fontSize: 12 }}>{viewRecipe.notes}</p>}
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          message={`Delete "${confirm.name}"?`}
          onConfirm={() => {
            if (confirm.type === 'waste') handleWasteDelete(confirm.id);
            else if (confirm.type === 'recipe') handleRecipeDelete(confirm.id);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
