import { useEffect, useState } from 'react';
import { foodCategoryAPI } from '../services/api';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Textarea, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const EMPTY = { company_unique_id: '', category_name: '', category_description: '', category_code: '', display_order: 1, icon_url: '', color_code: '#FF5733', is_active: true };

export default function FoodCategories() {
  const { selectedCompany, showToast } = useApp();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try { setData(await foodCategoryAPI.getAll(selectedCompany.company_unique_id)); } catch { setData([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [selectedCompany]);

  const openCreate = () => { setForm({...EMPTY, company_unique_id: selectedCompany?.company_unique_id}); setModal('create'); };
  const openEdit = (r) => { setForm({...r}); setEditId(r.food_category_id); setModal('edit'); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (modal === 'create') { await foodCategoryAPI.create(form); showToast('Category created!'); }
      else { await foodCategoryAPI.update(editId, form); showToast('Category updated!'); }
      setModal(null); load();
    } catch(e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try { await foodCategoryAPI.delete(id); showToast('Category deleted'); load(); } catch(e) { showToast(e.message, 'error'); }
    setConfirm(null);
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const cols = [
    { key: 'food_category_id', label: 'ID' },
    { key: 'category_name', label: 'Name' },
    { key: 'category_code', label: 'Code' },
    { key: 'display_order', label: 'Order' },
    { key: 'color_code', label: 'Color', render: (v) => v ? <span style={{display:'inline-flex',alignItems:'center',gap:'6px'}}><span style={{width:16,height:16,borderRadius:3,background:v,display:'inline-block',border:'1px solid #ddd'}}/>{v}</span> : '—' },
    { key: 'is_active', label: 'Status', render: (v) => <Badge variant={v ? 'success' : 'error'}>{v ? 'Active' : 'Inactive'}</Badge> },
  ];

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3><p>Please select a company from the Companies page first.</p></div></div>
  );

  return (
    <div className="page">
      <PageHeader title="Food Categories" subtitle={`Categories for ${selectedCompany.name}`} action={<button className="btn btn-primary" onClick={openCreate}>+ New Category</button>} />
      {loading ? <Spinner /> : <Table columns={cols} data={data} actions={(row) => (
        <div className="action-btns">
          <button className="btn btn-sm btn-outline" onClick={() => openEdit(row)}>Edit</button>
          <button className="btn btn-sm btn-danger-ghost" onClick={() => setConfirm(row.food_category_id)}>Delete</button>
        </div>
      )} />}

      {confirm && <ConfirmDialog message="Delete this food category?" onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />}

      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'New Food Category' : 'Edit Category'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <FormField label="Category Name" required><Input value={form.category_name} onChange={set('category_name')} required /></FormField>
              <FormField label="Category Code"><Input value={form.category_code} onChange={set('category_code')} /></FormField>
              <FormField label="Display Order"><Input type="number" value={form.display_order} onChange={set('display_order')} /></FormField>
              <FormField label="Color Code"><Input type="color" value={form.color_code || '#FF5733'} onChange={set('color_code')} /></FormField>
              <FormField label="Icon URL"><Input value={form.icon_url} onChange={set('icon_url')} /></FormField>
            </div>
            <FormField label="Description"><Textarea value={form.category_description} onChange={set('category_description')} rows={3} /></FormField>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
