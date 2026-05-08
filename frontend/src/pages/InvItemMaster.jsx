/**
 * InvItemMaster.jsx — Inventory Module 1: Item/Ingredient Master
 * Covers: Unit of Measure, Item Categories, and Inventory Items (ingredients)
 * Follows existing code patterns exactly.
 */

import { useEffect, useState } from 'react';
import { invItemAPI, invCategoryAPI, invUomAPI } from '../services/api';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Select, Textarea, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const EMPTY_ITEM = {
  company_unique_id: '',
  item_category_id: '',
  item_code: '',
  item_name: '',
  description: '',
  uom_id: '',
  reorder_level: '0',
  standard_cost: '0',
  is_active: true,
};

const EMPTY_CAT = { company_unique_id: '', category_name: '', description: '', is_active: true };
const EMPTY_UOM = { company_unique_id: '', uom_name: '', uom_symbol: '', is_active: true };

export default function InvItemMaster() {
  const { selectedCompany, showToast, user } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [tab,       setTab]       = useState('items');   // 'items' | 'categories' | 'uom'
  const [items,     setItems]     = useState([]);
  const [cats,      setCats]      = useState([]);
  const [uoms,      setUoms]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [modal,     setModal]     = useState(null);
  const [form,      setForm]      = useState(EMPTY_ITEM);
  const [editId,    setEditId]    = useState(null);
  const [confirm,   setConfirm]   = useState(null);
  const [saving,    setSaving]    = useState(false);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [i, c, u] = await Promise.allSettled([
        invItemAPI.getAll(cid),
        invCategoryAPI.getAll(cid),
        invUomAPI.getAll(cid),
      ]);
      setItems(i.status === 'fulfilled' ? (i.value || []) : []);
      setCats(c.status === 'fulfilled' ? (c.value || []) : []);
      setUoms(u.status === 'fulfilled' ? (u.value || []) : []);
    } catch { setItems([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // ── Item handlers ─────────────────────────────────────────
  const openCreateItem = () => {
    setForm({ ...EMPTY_ITEM, company_unique_id: cid });
    setEditId(null); setModal('item');
  };
  const openEditItem = (row) => {
    setForm({ ...row, item_category_id: row.item_category_id || '', uom_id: row.uom_id || '' });
    setEditId(row.item_id); setModal('item');
  };
  const handleItemSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        ...form,
        item_category_id: form.item_category_id ? parseInt(form.item_category_id) : null,
        uom_id: form.uom_id ? parseInt(form.uom_id) : null,
        reorder_level: parseFloat(form.reorder_level) || 0,
        standard_cost: parseFloat(form.standard_cost) || 0,
        created_by: user?.username,
      };
      if (editId) {
        await invItemAPI.update(editId, payload);
        showToast('Item updated!');
      } else {
        await invItemAPI.create(payload);
        showToast('Item created!');
      }
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };
  const handleItemDelete = async (id) => {
    try { await invItemAPI.delete(id); showToast('Item deleted'); load(); } catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  // ── Category handlers ─────────────────────────────────────
  const openCreateCat = () => { setForm({ ...EMPTY_CAT, company_unique_id: cid }); setEditId(null); setModal('cat'); };
  const openEditCat = (row) => { setForm({ ...row }); setEditId(row.item_category_id); setModal('cat'); };
  const handleCatSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, created_by: user?.username };
      if (editId) { await invCategoryAPI.update(editId, payload); showToast('Category updated!'); }
      else { await invCategoryAPI.create(payload); showToast('Category created!'); }
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };
  const handleCatDelete = async (id) => {
    try { await invCategoryAPI.delete(id); showToast('Category deleted'); load(); } catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  // ── UOM handlers ──────────────────────────────────────────
  const openCreateUom = () => { setForm({ ...EMPTY_UOM, company_unique_id: cid }); setEditId(null); setModal('uom'); };
  const openEditUom = (row) => { setForm({ ...row }); setEditId(row.uom_id); setModal('uom'); };
  const handleUomSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, created_by: user?.username };
      if (editId) { await invUomAPI.update(editId, payload); showToast('UOM updated!'); }
      else { await invUomAPI.create(payload); showToast('UOM created!'); }
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };
  const handleUomDelete = async (id) => {
    try { await invUomAPI.delete(id); showToast('UOM deleted'); load(); } catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  const getCatName = (id) => cats.find(c => c.item_category_id === id)?.category_name || '—';
  const getUomName = (id) => {
    const u = uoms.find(u => u.uom_id === id);
    return u ? `${u.uom_name}${u.uom_symbol ? ` (${u.uom_symbol})` : ''}` : '—';
  };

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  const itemCols = [
    { key: 'item_code', label: 'Code', render: (v) => v || '—' },
    { key: 'item_name', label: 'Name' },
    { key: 'item_category_id', label: 'Category', render: (v) => getCatName(v) },
    { key: 'uom_id', label: 'UOM', render: (v) => getUomName(v) },
    { key: 'reorder_level', label: 'Reorder Level', render: (v) => v ?? 0 },
    { key: 'standard_cost', label: 'Std Cost (₹)', render: (v) => v != null ? `₹${parseFloat(v).toFixed(2)}` : '—' },
    { key: 'is_active', label: 'Status', render: (v) => <Badge variant={v ? 'success' : 'error'}>{v ? 'Active' : 'Inactive'}</Badge> },
  ];

  const catCols = [
    { key: 'category_name', label: 'Category Name' },
    { key: 'description', label: 'Description', render: (v) => v || '—' },
    { key: 'is_active', label: 'Status', render: (v) => <Badge variant={v ? 'success' : 'error'}>{v ? 'Active' : 'Inactive'}</Badge> },
  ];

  const uomCols = [
    { key: 'uom_name', label: 'Unit Name' },
    { key: 'uom_symbol', label: 'Symbol', render: (v) => v || '—' },
    { key: 'is_active', label: 'Status', render: (v) => <Badge variant={v ? 'success' : 'error'}>{v ? 'Active' : 'Inactive'}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader
        title="📦 Ingredient Master"
        subtitle="Manage inventory items, categories, and units of measure"
        action={
          <button className="btn btn-primary" onClick={
            tab === 'items' ? openCreateItem : tab === 'categories' ? openCreateCat : openCreateUom
          }>
            + Add {tab === 'items' ? 'Item' : tab === 'categories' ? 'Category' : 'Unit'}
          </button>
        }
      />

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[['items', '🥕 Items'], ['categories', '🗂️ Categories'], ['uom', '📏 Units (UOM)']].map(([key, label]) => (
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
          {tab === 'items' && (
            <Table columns={itemCols} data={items} actions={(row) => (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => openEditItem(row)}>✏️ Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.item_id, name: row.item_name, type: 'item' })}>🗑️</button>
              </div>
            )} />
          )}
          {tab === 'categories' && (
            <Table columns={catCols} data={cats} actions={(row) => (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => openEditCat(row)}>✏️ Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.item_category_id, name: row.category_name, type: 'cat' })}>🗑️</button>
              </div>
            )} />
          )}
          {tab === 'uom' && (
            <Table columns={uomCols} data={uoms} actions={(row) => (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => openEditUom(row)}>✏️ Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.uom_id, name: row.uom_name, type: 'uom' })}>🗑️</button>
              </div>
            )} />
          )}
        </>
      )}

      {/* ── Item Modal ── */}
      {modal === 'item' && (
        <Modal title={editId ? 'Edit Item' : 'Add Item'} onClose={() => setModal(null)} size="md">
          <form onSubmit={handleItemSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Item Name" required>
                <Input value={form.item_name} onChange={set('item_name')} required placeholder="e.g. Onion" />
              </FormField>
              <FormField label="Item Code">
                <Input value={form.item_code} onChange={set('item_code')} placeholder="e.g. VEG001" />
              </FormField>
              <FormField label="Category">
                <Select value={form.item_category_id} onChange={set('item_category_id')}>
                  <option value="">— None —</option>
                  {cats.map(c => <option key={c.item_category_id} value={c.item_category_id}>{c.category_name}</option>)}
                </Select>
              </FormField>
              <FormField label="Unit of Measure">
                <Select value={form.uom_id} onChange={set('uom_id')}>
                  <option value="">— None —</option>
                  {uoms.map(u => <option key={u.uom_id} value={u.uom_id}>{u.uom_name}{u.uom_symbol ? ` (${u.uom_symbol})` : ''}</option>)}
                </Select>
              </FormField>
              <FormField label="Reorder Level">
                <Input type="number" step="0.001" value={form.reorder_level} onChange={set('reorder_level')} placeholder="0" />
              </FormField>
              <FormField label="Standard Cost (₹)">
                <Input type="number" step="0.01" value={form.standard_cost} onChange={set('standard_cost')} placeholder="0" />
              </FormField>
            </div>
            <FormField label="Description">
              <Textarea value={form.description} onChange={set('description')} rows={2} placeholder="Optional notes..." />
            </FormField>
            <FormField label="Status">
              <Select value={form.is_active ? 'true' : 'false'} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </FormField>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Category Modal ── */}
      {modal === 'cat' && (
        <Modal title={editId ? 'Edit Category' : 'Add Category'} onClose={() => setModal(null)} size="sm">
          <form onSubmit={handleCatSubmit}>
            <FormField label="Category Name" required>
              <Input value={form.category_name} onChange={set('category_name')} required placeholder="e.g. Vegetables" />
            </FormField>
            <FormField label="Description">
              <Textarea value={form.description} onChange={set('description')} rows={2} />
            </FormField>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── UOM Modal ── */}
      {modal === 'uom' && (
        <Modal title={editId ? 'Edit Unit' : 'Add Unit'} onClose={() => setModal(null)} size="sm">
          <form onSubmit={handleUomSubmit}>
            <FormField label="Unit Name" required>
              <Input value={form.uom_name} onChange={set('uom_name')} required placeholder="e.g. Kilogram" />
            </FormField>
            <FormField label="Symbol">
              <Input value={form.uom_symbol} onChange={set('uom_symbol')} placeholder="e.g. kg" />
            </FormField>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Confirm Delete ── */}
      {confirm && (
        <ConfirmDialog
          message={`Delete "${confirm.name}"? This cannot be undone.`}
          onConfirm={() => {
            if (confirm.type === 'item') handleItemDelete(confirm.id);
            else if (confirm.type === 'cat') handleCatDelete(confirm.id);
            else handleUomDelete(confirm.id);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
