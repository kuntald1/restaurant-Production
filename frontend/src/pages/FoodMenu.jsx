import { useEffect, useState } from 'react';
import { foodMenuAPI, foodCategoryAPI } from '../services/api';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Textarea, Select, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const EMPTY = { company_unique_id: '', category_id: '', code: '', name: '', description: '', sale_price: '', image_url: '', display_order: 1, is_active: true, is_available: true };

export default function FoodMenu() {
  const { selectedCompany, showToast, user } = useApp();
  const [data, setData] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const [menus, categories] = await Promise.allSettled([
        foodMenuAPI.getAll(selectedCompany.company_unique_id),
        foodCategoryAPI.getAll(selectedCompany.company_unique_id),
      ]);
      setData(menus.status === 'fulfilled' ? menus.value : []);
      setCats(categories.status === 'fulfilled' ? categories.value : []);
    } catch { setData([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [selectedCompany]);

  const openCreate = () => { setForm({...EMPTY, company_unique_id: selectedCompany?.company_unique_id}); setModal('create'); };
  const openEdit = (r) => { setForm({...r}); setEditId(r.food_menu_id); setModal('edit'); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {...form, sale_price: parseFloat(form.sale_price), display_order: parseInt(form.display_order), category_id: parseInt(form.category_id),created_by: user?.user_id, modified_by: user?.user_id};
      if (modal === 'create') { await foodMenuAPI.create(payload); showToast('Menu item created!'); }
      else { await foodMenuAPI.update(editId, payload); showToast('Menu item updated!'); }
      setModal(null); load();
    } catch(e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try { await foodMenuAPI.delete(id); showToast('Menu item deleted'); load(); } catch(e) { showToast(e.message, 'error'); }
    setConfirm(null);
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const getCatName = (id) => cats.find(c => c.food_category_id === id)?.category_name || id;

  const cols = [
    { key: 'food_menu_id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code' },
    { key: 'category_id', label: 'Category', render: (v) => getCatName(v) },
    { key: 'sale_price', label: 'Price', render: (v) => v ? `₹${parseFloat(v).toFixed(2)}` : '—' },
    { key: 'display_order', label: 'Order' },
    { key: 'IsActive', label: 'Active', render: (v) => <Badge variant={v ? 'success' : 'error'}>{v ? 'Active' : 'Inactive'}</Badge> },
    { key: 'is_available', label: 'Available', render: (v) => <Badge variant={v ? 'success' : 'error'}>{v ? 'Yes' : 'No'}</Badge> },
  ];

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3><p>Please select a company from the Companies page first.</p></div></div>
  );

  return (
    <div className="page">
      <PageHeader title="Food Menu" subtitle={`Menu items for ${selectedCompany.name}`} action={<button className="btn btn-primary" onClick={openCreate}>+ New Menu Item</button>} />
      {loading ? <Spinner /> : <Table columns={cols} data={data} actions={(row) => (
        <div className="action-btns">
          <button className="btn btn-sm btn-outline" onClick={() => openEdit(row)}>Edit</button>
          <button className="btn btn-sm btn-danger-ghost" onClick={() => setConfirm(row.food_menu_id)}>Delete</button>
        </div>
      )} />}

      {confirm && <ConfirmDialog message="Delete this menu item?" onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />}

      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'New Menu Item' : 'Edit Menu Item'} onClose={() => setModal(null)} size="lg">
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <FormField label="Name" required><Input value={form.name} onChange={set('name')} required /></FormField>
              <FormField label="Code"><Input value={form.code} onChange={set('code')} /></FormField>
              <FormField label="Category" required>
                <Select value={form.category_id} onChange={set('category_id')} required>
                  <option value="">Select category…</option>
                  {cats.map(c => <option key={c.food_category_id} value={c.food_category_id}>{c.category_name}</option>)}
                </Select>
              </FormField>
              <FormField label="Sale Price (₹)" required><Input type="number" step="0.01" value={form.sale_price} onChange={set('sale_price')} required /></FormField>
              <FormField label="Display Order"><Input type="number" value={form.display_order} onChange={set('display_order')} /></FormField>
              <FormField label="Image">
  {form.image_url && (
    <img src={form.image_url} alt="menu" style={{width:'80px',height:'80px',objectFit:'cover',borderRadius:'8px',marginBottom:'8px',display:'block'}} />
  )}
  {editId ? (
    <input type="file" accept="image/*" onChange={async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await fetch(`/company/foodmenu/${editId}/image`, { method: 'POST', body: fd });
        const data = await res.json();
        setForm(f => ({...f, image_url: data.image_url}));
        showToast('Image uploaded!');
      } catch { showToast('Image upload failed', 'error'); }
    }} style={{display:'block',marginTop:'4px'}} />
  ) : (
    <div style={{fontSize:'12px',color:'#888'}}>Save the item first, then upload image</div>
  )}
</FormField>
              <FormField label="Is Active">
                <Select value={form.is_active} onChange={set('is_active')}>
                <option value={true}>Active</option>
                <option value={false}>Inactive</option>
                </Select>
                </FormField>
                <FormField label="Is Available">
                <Select value={form.is_available} onChange={set('is_available')}>
                <option value={true}>Available</option>
                <option value={false}>Not Available</option>
                </Select>
                </FormField>
            </div>
            <FormField label="Description"><Textarea value={form.description} onChange={set('description')} rows={3} /></FormField>
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
