import { useEffect, useState } from 'react';
import { usersAPI, userRolesAPI } from '../services/api';
import CryptoJS from 'crypto-js';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Select, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const SECRET_KEY = 'MyRestaurant@SecretKey123';

const EMPTY = {
  company_unique_id: '', first_name: '', last_name: '', phone_number: '', email: '',
  email_2: '', address: '', city: '', state: '', zip_code: '', country: '',
  username: '', password: '', role_id: '',
  is_super_admin: false, is_admin: false,
  employment_type: 'full-time', shift_preference: 'morning',
  hire_date: '', salary: '', emergency_contact_name: '', emergency_contact_phone: '', notes: '',
};

function buildTree(companies) {
  const parents  = (companies||[]).filter(c => !c.parant_company_unique_id);
  const children = (companies||[]).filter(c =>  c.parant_company_unique_id);
  return parents.map(p => ({ ...p, children: children.filter(c => c.parant_company_unique_id === p.company_unique_id) }));
}

export default function Users() {
  const { selectedCompany, allCompanies, user, showToast } = useApp();
  const [data,     setData]     = useState([]);
  const [roles,    setRoles]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [modal,    setModal]    = useState(null);
  const [form,     setForm]     = useState(EMPTY);
  const [editId,   setEditId]   = useState(null);
  const [confirm,  setConfirm]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [viewUser, setViewUser] = useState(null);

  const isSuperAdmin = user?.is_super_admin === true;
  const isAdmin      = user?.is_admin      === true;

  const tree = buildTree(allCompanies || []);
  const childCompanies = (allCompanies||[]).filter(c => c.parant_company_unique_id === user?.company_unique_id);
  const adminCompany   = (allCompanies||[]).find(c => c.company_unique_id === user?.company_unique_id);

  // Load users — Super Admin sees selected company, Admin sees own + children
  const load = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      if (isSuperAdmin) {
        setData(await usersAPI.getAll(selectedCompany.company_unique_id));
      } else {
        // Admin: load users from own company + all children
        const cidsToLoad = [
          user.company_unique_id,
          ...childCompanies.map(c => c.company_unique_id)
        ];
        const results = await Promise.allSettled(cidsToLoad.map(cid => usersAPI.getAll(cid)));
        const merged = results.flatMap(r => r.status === 'fulfilled' ? (r.value || []) : []);
        // Deduplicate by user_id, and hide Super Admin users from Admin view
        const seen = new Set();
        setData(merged.filter(u => {
          if (seen.has(u.user_id)) return false;
          seen.add(u.user_id);
          if (u.is_super_admin) return false; // Admin cannot see Super Admin users
          return true;
        }));
      }
    } catch { setData([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [selectedCompany]);

  // Load roles from API
  useEffect(() => {
    const loadRoles = async () => {
      if (!selectedCompany) return;
      try {
        const r = await userRolesAPI.getAll(selectedCompany.company_unique_id);
        setRoles(Array.isArray(r) ? r.filter(r => r.is_active) : []);
      } catch { setRoles([]); }
    };
    loadRoles();
  }, [selectedCompany]);

  const openCreate = () => {
    setForm({ ...EMPTY, company_unique_id: selectedCompany?.company_unique_id || '' });
    setModal('create');
  };
  const openEdit = (r) => { setForm({ ...r, password: '' }); setEditId(r.user_id); setModal('edit'); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form };
      // Encrypt password
      if (payload.password) {
        payload.password = CryptoJS.AES.encrypt(payload.password, SECRET_KEY).toString();
      } else { delete payload.password; }
      // Convert empty strings → null
      ['email','email_2','address','city','state','zip_code','country','phone_number',
       'emergency_contact_name','emergency_contact_phone','notes','hire_date'].forEach(k => {
        if (!payload[k]) payload[k] = null;
      });
      // Numeric fields
      payload.salary             = payload.salary     ? parseFloat(payload.salary)  : null;
      payload.role_id            = payload.role_id    ? parseInt(payload.role_id)   : null;
      payload.company_unique_id  = payload.company_unique_id ? parseInt(payload.company_unique_id) : null;
      // Admin always creates plain users — enforce flags
      if (isAdmin) { payload.is_admin = false; payload.is_super_admin = false; }

      if (modal === 'create') { await usersAPI.create(payload); showToast('User created!'); }
      else                    { await usersAPI.update(editId, payload); showToast('User updated!'); }
      setModal(null); load();
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try { await usersAPI.delete(id); showToast('User deactivated'); load(); }
    catch (e) { showToast(e.message, 'error'); }
    setConfirm(null);
  };

  const set = (k) => (e) => setForm(f => ({
    ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  }));

  // Roles visible in the dropdown — filtered by who is logged in
  // role_name detection
  const rn   = (r) => (r.role_name || '').toLowerCase();
  const isSup = (r) => rn(r).includes('super');
  const isAdm = (r) => rn(r).includes('admin') && !isSup(r);

  const visibleRoles = roles.filter(r => {
    if (isSuperAdmin) return !isSup(r);            // SA: all except Super Admin roles
    if (isAdmin)      return !isSup(r) && !isAdm(r); // Admin: only plain user/staff roles
    return false;
  });

  const selectedRole = roles.find(r => r.userrole_id === parseInt(form.role_id));
  const selIsAdm = selectedRole ? isAdm(selectedRole) : false;

  const cols = [
    { key: 'user_id',    label: 'ID' },
    { key: 'first_name', label: 'Name',   render: (v, row) => `${v} ${row.last_name || ''}` },
    { key: 'username',   label: 'Username' },
    { key: 'email',      label: 'Email' },
    { key: 'employment_type', label: 'Type', render: (v) => v ? <Badge variant="info">{v}</Badge> : '—' },
    { key: 'is_admin',   label: 'Role', render: (v, row) =>
        row.is_super_admin ? <Badge variant="warning">Super Admin</Badge>
        : v ? <Badge variant="info">Admin</Badge>
        : <Badge>Staff</Badge>
    },
    { key: 'is_active',  label: 'Status', render: (v) => <Badge variant={v ? 'success' : 'error'}>{v ? 'Active' : 'Inactive'}</Badge> },
  ];

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader title="Users" subtitle={`Staff for ${selectedCompany.name}`}
        action={<button className="btn btn-primary" onClick={openCreate}>+ New User</button>} />

      {loading ? <Spinner /> : (
        <Table columns={cols} data={data} actions={(row) => (
          <div className="action-btns">
            <button className="btn btn-sm btn-ghost" onClick={() => { setViewUser(row); setModal('view'); }}>View</button>
            <button className="btn btn-sm btn-outline" onClick={() => openEdit(row)}>Edit</button>
            <button className="btn btn-sm btn-danger-ghost" onClick={() => setConfirm(row.user_id)}>Delete</button>
          </div>
        )} />
      )}

      {confirm && <ConfirmDialog message="Deactivate this user?" onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />}

      {/* ── View Modal ── */}
      {modal === 'view' && viewUser && (
        <Modal title="User Details" onClose={() => setModal(null)} size="lg">
          <div className="user-profile">
            <div className="user-avatar">{viewUser.first_name?.[0]}{viewUser.last_name?.[0]}</div>
            <div className="user-profile-info">
              <h2>{viewUser.first_name} {viewUser.last_name}</h2>
              <p>@{viewUser.username}</p>
              <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.5rem' }}>
                {viewUser.is_super_admin && <Badge variant="warning">Super Admin</Badge>}
                {viewUser.is_admin       && <Badge variant="info">Admin</Badge>}
                {!viewUser.is_admin && !viewUser.is_super_admin && <Badge>Staff / User</Badge>}
                <Badge variant={viewUser.is_active ? 'success' : 'error'}>{viewUser.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
            </div>
          </div>
          <div className="detail-grid">
            {[['Email',viewUser.email],['Phone',viewUser.phone_number],['City',viewUser.city],
              ['State',viewUser.state],['Country',viewUser.country],['Employment',viewUser.employment_type],
              ['Shift',viewUser.shift_preference],['Salary',viewUser.salary?`₹${viewUser.salary}`:'—'],
              ['Hire Date',viewUser.hire_date],['Emergency Contact',viewUser.emergency_contact_name],['Notes',viewUser.notes],
            ].map(([k,v]) => (
              <div key={k} className="detail-item">
                <span className="detail-key">{k}</span><span className="detail-val">{v||'—'}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* ── Create / Edit Modal ── */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'New User' : 'Edit User'} onClose={() => setModal(null)} size="xl">
          <form onSubmit={handleSubmit}>

            <div className="form-section-title">Personal Information</div>
            <div className="form-grid">
              <FormField label="First Name" required><Input value={form.first_name} onChange={set('first_name')} required /></FormField>
              <FormField label="Last Name"><Input value={form.last_name} onChange={set('last_name')} /></FormField>
              <FormField label="Phone"><Input value={form.phone_number} onChange={set('phone_number')} /></FormField>
              <FormField label="Email"><Input type="email" value={form.email} onChange={set('email')} /></FormField>
              <FormField label="City"><Input value={form.city} onChange={set('city')} /></FormField>
              <FormField label="State"><Input value={form.state} onChange={set('state')} /></FormField>
              <FormField label="Country"><Input value={form.country} onChange={set('country')} /></FormField>
            </div>

            <div className="form-section-title">Account</div>
            <div className="form-grid">
              <FormField label="Username" required><Input value={form.username} onChange={set('username')} required /></FormField>
              <FormField label={modal === 'edit' ? 'New Password (leave blank to keep)' : 'Password'} required={modal === 'create'}>
                <Input type="password" value={form.password} onChange={set('password')} required={modal === 'create'} />
              </FormField>

              {/* Company dropdown */}
              <FormField label="Company" required>
                <Select value={form.company_unique_id} onChange={set('company_unique_id')} required>
                  <option value="">— Select Company —</option>
                  {isSuperAdmin ? (
                    tree.map(parent => (
                      <optgroup key={parent.company_unique_id} label={parent.name}>
                        <option value={parent.company_unique_id}>{parent.name} (Parent)</option>
                        {parent.children.map(child => (
                          <option key={child.company_unique_id} value={child.company_unique_id}>
                            &nbsp;&nbsp;↳ {child.name}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  ) : isAdmin ? (
                    childCompanies.length === 0
                      ? <option value={user?.company_unique_id}>{adminCompany?.name || 'My Company'}</option>
                      : childCompanies.map(c => <option key={c.company_unique_id} value={c.company_unique_id}>{c.name}</option>)
                  ) : null}
                </Select>
              </FormField>

              {/* Role dropdown — dynamic, filtered by login role */}
              <FormField label="Role" required>
                {visibleRoles.length === 0 ? (
                  <div style={{ padding:'10px 14px', borderRadius:8, fontSize:13,
                    background:'#fffbeb', color:'#92400e', border:'1px solid #fde68a' }}>
                    ⚠️ No assignable roles found. Create roles in Role &amp; Permission first.
                  </div>
                ) : (
                  <>
                    <Select value={form.role_id || ''} onChange={e => {
                      const sel = roles.find(r => r.userrole_id === parseInt(e.target.value));
                      const name = (sel?.role_name || '').toLowerCase();
                      setForm(f => ({
                        ...f,
                        role_id:        parseInt(e.target.value) || '',
                        is_admin:        name.includes('admin') && !name.includes('super'),
                        is_super_admin:  name.includes('super'),
                      }));
                    }} required>
                      <option value="">— Select Role —</option>
                      {visibleRoles.map(r => (
                        <option key={r.userrole_id} value={r.userrole_id}>
                          {r.role_name}{r.description ? ` — ${r.description}` : ''}
                        </option>
                      ))}
                    </Select>
                    {form.role_id && (
                      <div style={{ marginTop:7, padding:'7px 12px', borderRadius:7, fontSize:12,
                        background: selIsAdm ? '#eff6ff' : '#f0fdf4',
                        color:      selIsAdm ? '#1e40af' : '#166534',
                        border: `1px solid ${selIsAdm ? '#bfdbfe' : '#bbf7d0'}` }}>
                        {selIsAdm ? '🛡️ Admin: full access' : '👤 User: limited access'}
                      </div>
                    )}
                  </>
                )}
              </FormField>

              <FormField label="Employment Type">
                <Select value={form.employment_type} onChange={set('employment_type')}>
                  <option value="full-time">Full Time</option>
                  <option value="part-time">Part Time</option>
                  <option value="contract">Contract</option>
                </Select>
              </FormField>
              <FormField label="Shift Preference">
                <Select value={form.shift_preference} onChange={set('shift_preference')}>
                  <option value="morning">Morning</option>
                  <option value="evening">Evening</option>
                  <option value="night">Night</option>
                </Select>
              </FormField>
              <FormField label="Hire Date"><Input type="date" value={form.hire_date} onChange={set('hire_date')} /></FormField>
              <FormField label="Salary (₹)"><Input type="number" step="0.01" value={form.salary} onChange={set('salary')} /></FormField>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save User'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
