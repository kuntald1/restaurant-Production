import { useEffect, useState } from 'react';
import { crmCustomerAPI } from '../services/api';
import { useApp } from '../context/useApp';
import { PageHeader, Spinner, Table, Modal, FormField, Input, Select, Badge, ConfirmDialog } from '../components/UI';

const EMPTY = { name:'', phone:'', email:'', date_of_birth:'', anniversary_date:'', address:'', notes:'' };

export default function CrmCustomers() {
  const { selectedCompany, showToast } = useApp();
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState('');
  const [modal,   setModal]   = useState(null);
  const [form,    setForm]    = useState(EMPTY);
  const [editId,  setEditId]  = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [saving,  setSaving]  = useState(false);

  const cid = selectedCompany?.company_unique_id;

  const load = async (q = '') => {
    if (!cid) return;
    setLoading(true);
    try { setData(await crmCustomerAPI.getAll(cid, q)); } catch { setData([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.phone)            delete payload.phone;
      if (!payload.email)            delete payload.email;
      if (!payload.date_of_birth)    delete payload.date_of_birth;
      if (!payload.anniversary_date) delete payload.anniversary_date;
      if (modal === 'create') { await crmCustomerAPI.create(cid, payload); showToast('Customer added!'); }
      else                    { await crmCustomerAPI.update(editId, payload); showToast('Customer updated!'); }
      setModal(null); load();
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  const cols = [
    { key: 'customer_id', label: 'ID' },
    { key: 'name',        label: 'Name', render: v => <strong>{v}</strong> },
    { key: 'phone',       label: 'Phone', render: v => v || '—' },
    { key: 'email',       label: 'Email', render: v => v || '—' },
    { key: 'total_visits',label: 'Visits' },
    { key: 'total_spend', label: 'Total Spend', render: v => `₹${Number(v||0).toFixed(2)}` },
    { key: 'loyalty_points', label: 'Points', render: v => <Badge variant="info">{v||0} pts</Badge> },
  ];

  if (!selectedCompany) return <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>;

  return (
    <div className="page">
      <PageHeader title="Customers" subtitle={`CRM — ${selectedCompany.name}`}
        action={<button className="btn btn-primary" onClick={() => { setForm(EMPTY); setModal('create'); }}>+ New Customer</button>} />

      <div style={{ display:'flex', gap:10, marginBottom:16 }}>
        <input className="form-input" style={{ flex:1, maxWidth:400 }} placeholder="Search by name or phone…"
          value={search} onChange={e => { setSearch(e.target.value); load(e.target.value); }} />
      </div>

      {loading ? <Spinner /> : (
        <Table columns={cols} data={data} actions={row => (
          <div className="action-btns">
            <button className="btn btn-sm btn-outline" onClick={() => { setForm({...row, date_of_birth: row.date_of_birth||'', anniversary_date: row.anniversary_date||''}); setEditId(row.customer_id); setModal('edit'); }}>Edit</button>
            <button className="btn btn-sm btn-danger-ghost" onClick={() => setConfirm(row.customer_id)}>Delete</button>
          </div>
        )} />
      )}

      {confirm && <ConfirmDialog message="Deactivate this customer?" onConfirm={async () => { await crmCustomerAPI.delete(confirm); showToast('Customer removed'); setConfirm(null); load(); }} onCancel={() => setConfirm(null)} />}

      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'New Customer' : 'Edit Customer'} onClose={() => setModal(null)} size="lg">
          <form onSubmit={handleSubmit}>
            <div className="form-section-title">Basic Info</div>
            <div className="form-grid">
              <FormField label="Name" required><Input value={form.name} onChange={set('name')} required /></FormField>
              <FormField label="Phone"><Input value={form.phone} onChange={set('phone')} placeholder="+91 9876543210" /></FormField>
              <FormField label="Email"><Input type="email" value={form.email} onChange={set('email')} /></FormField>
              <FormField label="Birthday"><Input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} /></FormField>
              <FormField label="Anniversary"><Input type="date" value={form.anniversary_date} onChange={set('anniversary_date')} /></FormField>
              <FormField label="Address" style={{ gridColumn:'1 / -1' }}><Input value={form.address} onChange={set('address')} /></FormField>
              <FormField label="Notes" style={{ gridColumn:'1 / -1' }}><Input value={form.notes} onChange={set('notes')} /></FormField>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Customer'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
