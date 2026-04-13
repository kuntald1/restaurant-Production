import { useEffect, useState } from 'react';
import { companyAPI } from '../services/api';
import { Modal, Badge, Spinner, PageHeader, FormField, Input, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const EMPTY = { name:'', short_name:'', address1:'', address2:'', pin:'', country:'', admin_phone:'', service_phone:'', admin_phone_country_code:'+91', service_phone_country_code:'+91', admin_email:'', service_email:'', secondary_email:'', website:'', currency_id:1, date_format:'DD-MM-YYYY', time_format:'HH:mm:ss', latlong:'', gstin:'', fssai:'', hsn:'', sgst:'', cgst:'', is_merchant_enabled:false, is_upi_enabled:false, is_sms_enabled:false, whatsapp_enabled:false };

// Build parent-child tree from flat list
function buildTree(companies) {
  const parents  = companies.filter(c => !c.parant_company_unique_id);
  const children = companies.filter(c =>  c.parant_company_unique_id);
  return parents.map(p => ({
    ...p,
    children: children.filter(c => c.parant_company_unique_id === p.company_unique_id),
  }));
}

export default function Companies() {
  const { setSelectedCompany, selectedCompany, user, showToast } = useApp();
  const [companies, setCompanies]   = useState([]);
  const [loading,   setLoading]     = useState(true);
  const [modal,     setModal]       = useState(null);
  const [form,      setForm]        = useState(EMPTY);
  const [editId,    setEditId]      = useState(null);
  const [confirm,   setConfirm]     = useState(null);
  const [saving,    setSaving]      = useState(false);

  const isSuperAdmin = user?.is_super_admin === true;
  const isAdmin      = user?.is_admin      === true;
  const userCid      = user?.company_unique_id;

  const load = async () => {
    setLoading(true);
    try {
      const all = await companyAPI.getAll();
      if (isSuperAdmin) {
        setCompanies(all);
      } else {
        // Admin: own company + its children only
        setCompanies(all.filter(c =>
          c.company_unique_id === userCid ||
          c.parant_company_unique_id === userCid
        ));
      }
    } catch (e) { showToast(e.message, 'error'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(EMPTY); setModal('create'); };
  const openEdit   = (c) => { setForm({...c}); setEditId(c.company_id); setModal('edit'); };
  const openView   = (c) => { setForm(c); setModal('view'); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (modal === 'create') { await companyAPI.create(form); showToast('Company created!'); }
      else                    { await companyAPI.update(editId, form); showToast('Company updated!'); }
      setModal(null); load();
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try { await companyAPI.delete(id); showToast('Company deactivated'); load(); }
    catch (e) { showToast(e.message, 'error'); }
    setConfirm(null);
  };

  const doSelect = (row) => {
    setSelectedCompany(row);
    showToast(`✓ Selected: ${row.name}`);
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const tree = buildTree(companies);

  const CompanyRow = ({ c, isChild = false }) => {
    const isSelected = selectedCompany?.company_id === c.company_id;
    return (
      <div style={{ ...S.row, ...(isChild ? S.childRow : {}), ...(isSelected ? S.selectedRow : {}) }}>
        {/* Tree indent + icon */}
        <div style={S.nameCell}>
          {isChild && <div style={S.treeConnector}><div style={S.treeLine}/><div style={S.treeElbow}/></div>}
          <div style={{ ...S.compLogo, ...(isChild ? S.compLogoSm : {}) }}>
            {c.name[0]}
          </div>
          <div>
            <div style={S.compName}>
              {c.name}
              {isSelected && <span style={S.selectedBadge}>✓ Selected</span>}
            </div>
            <div style={S.compMeta}>
              #{c.company_unique_id}
              {c.short_name && ` · ${c.short_name}`}
              {c.country    && ` · ${c.country}`}
            </div>
          </div>
        </div>
        <div style={S.cell}>{c.admin_email || '—'}</div>
        <div style={S.cell}>{c.admin_phone || '—'}</div>
        <div style={S.cell}>
          <span style={{ ...S.badge, background: c.is_active ? '#dcfce7' : '#fee2e2', color: c.is_active ? '#166534' : '#991b1b' }}>
            {c.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div style={S.actionsCell}>
          <button style={S.btn}          onClick={() => openView(c)}>View</button>
          <button style={S.btnOutline}   onClick={() => openEdit(c)}>Edit</button>
          <button style={{ ...S.btn, ...(isSelected ? S.btnSelected : S.btnSelect) }}
            onClick={() => doSelect(c)}>
            {isSelected ? '✓ Selected' : 'Select'}
          </button>
          <button style={S.btnDanger}    onClick={() => setConfirm(c.company_id)}>Delete</button>
        </div>
      </div>
    );
  };

  return (
    <div style={S.page}>
      <PageHeader
        title="Companies"
        subtitle="Manage restaurant companies"
        action={<button className="btn btn-primary" onClick={openCreate}>+ New Company</button>}
      />

      {loading ? <Spinner /> : (
        <div style={S.tableWrap}>
          {/* Header */}
          <div style={S.header}>
            <div style={{ ...S.hCell, flex: 3 }}>Company Name</div>
            <div style={S.hCell}>Email</div>
            <div style={S.hCell}>Phone</div>
            <div style={S.hCell}>Status</div>
            <div style={{ ...S.hCell, flex: 2 }}>Actions</div>
          </div>

          {/* Tree rows */}
          {tree.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>No companies found.</div>
          ) : (
            tree.map(parent => (
              <div key={parent.company_id}>
                <CompanyRow c={parent} isChild={false} />
                {parent.children.map(child => (
                  <CompanyRow key={child.company_id} c={child} isChild={true} />
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {confirm && <ConfirmDialog message="Deactivate this company?" onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />}

      {/* View modal */}
      {modal === 'view' && (
        <Modal title="Company Details" onClose={() => setModal(null)} size="lg">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
            {[['Name', form.name], ['Short Name', form.short_name], ['Address 1', form.address1], ['Address 2', form.address2], ['City/PIN', form.pin], ['Country', form.country], ['Admin Phone', form.admin_phone], ['Service Phone', form.service_phone], ['Admin Email', form.admin_email], ['Service Email', form.service_email], ['Website', form.website], ['GSTIN', form.gstin], ['FSSAI', form.fssai], ['HSN', form.hsn]].map(([k, v]) => (
              <div key={k} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{v || '—'}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Create / Edit modal */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'Create Company' : 'Edit Company'} onClose={() => setModal(null)} size="xl">
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <FormField label="Company Name" required><Input value={form.name}          onChange={set('name')}          required /></FormField>
              <FormField label="Short Name">          <Input value={form.short_name}     onChange={set('short_name')}    /></FormField>
              <FormField label="Address 1" required>  <Input value={form.address1}       onChange={set('address1')}      required /></FormField>
              <FormField label="Address 2">           <Input value={form.address2}       onChange={set('address2')}      /></FormField>
              <FormField label="PIN">                 <Input value={form.pin}            onChange={set('pin')}           /></FormField>
              <FormField label="Country" required>    <Input value={form.country}        onChange={set('country')}       required /></FormField>
              <FormField label="Admin Phone">         <Input value={form.admin_phone}    onChange={set('admin_phone')}   /></FormField>
              <FormField label="Country Code">        <Input value={form.admin_phone_country_code} onChange={set('admin_phone_country_code')} /></FormField>
              <FormField label="Service Phone">       <Input value={form.service_phone}  onChange={set('service_phone')} /></FormField>
              <FormField label="Admin Email">         <Input type="email" value={form.admin_email}  onChange={set('admin_email')}  /></FormField>
              <FormField label="Service Email">       <Input type="email" value={form.service_email} onChange={set('service_email')} /></FormField>
              <FormField label="Website">             <Input value={form.website}        onChange={set('website')}       /></FormField>
              <FormField label="GSTIN">               <Input value={form.gstin}          onChange={set('gstin')}         /></FormField>
              <FormField label="FSSAI">               <Input value={form.fssai}          onChange={set('fssai')}         /></FormField>
              <FormField label="HSN">                 <Input value={form.hsn}            onChange={set('hsn')}           /></FormField>
              <FormField label="SGST %">              <Input type="number" step="0.01" min="0" max="100" value={form.sgst} onChange={set('sgst')} placeholder="e.g. 9" /></FormField>
              <FormField label="CGST %">              <Input type="number" step="0.01" min="0" max="100" value={form.cgst} onChange={set('cgst')} placeholder="e.g. 9" /></FormField>
              <FormField label="Currency ID" required><Input type="number" value={form.currency_id} onChange={set('currency_id')} required /></FormField>

              {/* ── Feature Toggles ── */}
              <FormField label="Feature Toggles" style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 4 }}>
                  {[
                    { k: 'is_merchant_enabled', label: '🏦 Merchant (Razorpay)' },
                    { k: 'is_upi_enabled',      label: '💳 UPI Payments' },
                    { k: 'is_sms_enabled',      label: '📱 SMS' },
                    { k: 'whatsapp_enabled',    label: '💬 WhatsApp' },
                  ].map(({ k, label }) => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-1)' }}>
                      <input type="checkbox" checked={!!form[k]}
                        onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))}
                        style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                      {label}
                    </label>
                  ))}
                </div>
              </FormField>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Company'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

const S = {
  page:        { fontFamily: 'var(--font-sans)' },
  tableWrap:   { margin: '0 0 32px', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--white)' },
  header:      { display: 'flex', alignItems: 'center', background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '10px 16px', gap: 12 },
  hCell:       { flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em', textTransform: 'uppercase' },
  row:         { display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12, borderBottom: '1px solid var(--border-light)', transition: 'background .12s' },
  childRow:    { background: 'var(--bg)', paddingLeft: 24 },
  selectedRow: { background: '#f0fdf4' },
  nameCell:    { flex: 3, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  cell:        { flex: 1, fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  actionsCell: { flex: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },

  treeConnector: { display: 'flex', alignItems: 'center', flexDirection: 'column', marginRight: 4, flexShrink: 0, gap: 0 },
  treeLine:    { width: 1, height: 10, background: 'var(--border)', marginLeft: 8 },
  treeElbow:   { width: 14, height: 1, background: 'var(--border)', marginLeft: 1, alignSelf: 'flex-start' },

  compLogo:    { width: 38, height: 38, borderRadius: 9, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 700, flexShrink: 0 },
  compLogoSm:  { width: 30, height: 30, borderRadius: 7, fontSize: 12 },
  compName:    { fontSize: 13, fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 7 },
  compMeta:    { fontSize: 11, color: 'var(--text-3)', marginTop: 2 },

  badge:       { fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20 },
  selectedBadge: { background: '#dcfce7', color: '#166534', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10 },

  btn:         { padding: '5px 11px', border: 'none', borderRadius: 6, background: 'var(--bg)', color: 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  btnOutline:  { padding: '5px 11px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  btnSelect:   { background: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)' },
  btnSelected: { background: '#dcfce7', color: '#166534', border: '1px solid #86efac', fontWeight: 700 },
  btnDanger:   { padding: '5px 11px', border: 'none', borderRadius: 6, background: 'transparent', color: '#dc2626', fontSize: 12, fontWeight: 500, cursor: 'pointer' },
};
