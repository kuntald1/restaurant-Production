import { useEffect, useState } from 'react';
import { roleMappingAPI, userRolesAPI, menuAPI } from '../services/api';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Select, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const EMPTY = { userrole_id: '', menu_id: '', company_unique_id: '', is_active: true };

const flattenMenus = (nodes, result = []) => {
  for (const n of nodes) {
    result.push({ id: n.menuid, name: n.menuname });
    if (n.children?.length) flattenMenus(n.children, result);
  }
  return result;
};

export default function RoleMappings() {
  const { selectedCompany, showToast } = useApp();
  const [data, setData] = useState([]);
  const [roles, setRoles] = useState([]);
  const [menus, setMenus] = useState([]);
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
      const [mappings, rls, mns] = await Promise.allSettled([
        roleMappingAPI.getAll(selectedCompany.company_unique_id),
        userRolesAPI.getAll(selectedCompany.company_unique_id),
        menuAPI.getByCompany(selectedCompany.company_unique_id),
      ]);
      setData(mappings.status === 'fulfilled' ? mappings.value : []);
      setRoles(rls.status === 'fulfilled' ? rls.value : []);
      setMenus(mns.status === 'fulfilled' ? flattenMenus(mns.value) : []);
    } catch { setData([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [selectedCompany]);

  const openCreate = () => { setForm({...EMPTY, company_unique_id: selectedCompany?.company_unique_id}); setModal('create'); };
  const openEdit = (r) => { setForm({...r}); setEditId(r.userrolemapping_id); setModal('edit'); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {...form, userrole_id: parseInt(form.userrole_id), menu_id: parseInt(form.menu_id)};
      if (modal === 'create') { await roleMappingAPI.create(payload); showToast('Mapping created!'); }
      else { await roleMappingAPI.update(editId, payload); showToast('Mapping updated!'); }
      setModal(null); load();
    } catch(e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try { await roleMappingAPI.delete(id); showToast('Mapping deleted'); load(); } catch(e) { showToast(e.message, 'error'); }
    setConfirm(null);
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const getRoleName = (id) => roles.find(r => r.userrole_id === id)?.role_name || id;
  const getMenuName = (id) => menus.find(m => m.id === id)?.name || id;

  const cols = [
    { key: 'userrolemapping_id', label: 'ID' },
    { key: 'userrole_id', label: 'Role', render: (v) => getRoleName(v) },
    { key: 'menu_id', label: 'Menu', render: (v) => getMenuName(v) },
    { key: 'is_active', label: 'Status', render: (v) => <Badge variant={v ? 'success' : 'error'}>{v ? 'Active' : 'Inactive'}</Badge> },
    { key: 'created_at', label: 'Created', render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
  ];

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader title="Role Mappings" subtitle={`Menu access per role for ${selectedCompany.name}`} action={<button className="btn btn-primary" onClick={openCreate}>+ New Mapping</button>} />
      {loading ? <Spinner /> : <Table columns={cols} data={data} actions={(row) => (
        <div className="action-btns">
          <button className="btn btn-sm btn-outline" onClick={() => openEdit(row)}>Edit</button>
          <button className="btn btn-sm btn-danger-ghost" onClick={() => setConfirm(row.userrolemapping_id)}>Delete</button>
        </div>
      )} />}

      {confirm && <ConfirmDialog message="Delete this mapping?" onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />}

      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'New Role Mapping' : 'Edit Mapping'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit}>
            <FormField label="Role" required>
              <Select value={form.userrole_id} onChange={set('userrole_id')} required>
                <option value="">Select role…</option>
                {roles.map(r => <option key={r.userrole_id} value={r.userrole_id}>{r.role_name}</option>)}
              </Select>
            </FormField>
            <FormField label="Menu Item" required>
              <Select value={form.menu_id} onChange={set('menu_id')} required>
                <option value="">Select menu…</option>
                {menus.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </FormField>
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
