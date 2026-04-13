import { useEffect, useState } from 'react';
import { posTableAPI } from '../services/api';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Select, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const SECTION_TYPES = ['non_ac', 'ac', 'garden', 'outdoor', 'private', 'other'];
const SURCHARGE_TYPES = ['flat', 'per_cover'];
const FLOORS = ['Ground Floor', '1st Floor', '2nd Floor', 'Terrace', 'Basement'];

const SECTION_META = {
  ac:      { label: 'AC Hall',   bg: '#dbeafe', color: '#1e40af', icon: '❄️' },
  non_ac:  { label: 'Non-AC',    bg: '#f3f4f6', color: '#374151', icon: '🏠' },
  garden:  { label: 'Garden',    bg: '#d1fae5', color: '#065f46', icon: '🌿' },
  outdoor: { label: 'Outdoor',   bg: '#fef3c7', color: '#92400e', icon: '☀️' },
  private: { label: 'Private',   bg: '#ede9fe', color: '#4c1d95', icon: '🔒' },
  other:   { label: 'Other',     bg: '#f3f4f6', color: '#6b7280', icon: '🪑' },
};

const STATUS_META = {
  free:     { label: 'Free',     bg: '#d1fae5', color: '#065f46' },
  occupied: { label: 'Occupied', bg: '#fef3c7', color: '#92400e' },
  reserved: { label: 'Reserved', bg: '#ede9fe', color: '#4c1d95' },
};

const EMPTY = {
  table_name: '', seats: 4, floor: 'Ground Floor', section: 'Indoor',
  section_type: 'non_ac', surcharge_type: 'flat',
  surcharge_amount: 0, surcharge_label: '',
};

export default function Tables() {
  const { selectedCompany, showToast } = useApp();
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal,   setModal]   = useState(null); // 'create' | 'edit' | 'status'
  const [form,    setForm]    = useState(EMPTY);
  const [editId,  setEditId]  = useState(null);
  const [confirm,       setConfirm]       = useState(null); // { table_id, new_status, table_name }
  const [deleteConfirm, setDeleteConfirm] = useState(null); // table_id to delete
  const [saving,  setSaving]  = useState(false);
  const [filter,  setFilter]  = useState('all'); // all | free | occupied | reserved

  const cid = selectedCompany?.company_unique_id;

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try { setData(await posTableAPI.getAll(cid)); } catch (e) { showToast(e.message, 'error'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const openCreate = () => { setForm({ ...EMPTY, company_unique_id: cid }); setModal('create'); };
  const openEdit   = (r)  => { setForm({ ...r, surcharge_amount: r.surcharge_amount || 0, surcharge_label: r.surcharge_label || '' }); setEditId(r.table_id); setModal('edit'); };

  const handleDelete = async (id) => {
    try { await posTableAPI.delete(id); showToast('Table deleted'); load(); }
    catch (e) { showToast(e.message, 'error'); }
    setConfirm(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        ...form,
        company_unique_id: cid,
        seats:             parseInt(form.seats) || 2,
        surcharge_amount:  parseFloat(form.surcharge_amount) || 0,
      };
      if (modal === 'create') { await posTableAPI.create(payload); showToast('Table created!'); }
      else                    { await posTableAPI.update(editId, payload); showToast('Table updated!'); }
      setModal(null); load();
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  const handleStatusChange = async (tableId, status) => {
    try {
      await posTableAPI.setStatus(tableId, status);
      showToast(`Table status → ${status}`);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    setConfirm(null);
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // ── Filtered + stats ─────────────────────────────────────
  const filtered = data.filter(t => filter === 'all' || t.table_status === filter);
  const stats = {
    total:    data.length,
    free:     data.filter(t => t.table_status === 'free').length,
    occupied: data.filter(t => t.table_status === 'occupied').length,
    reserved: data.filter(t => t.table_status === 'reserved').length,
  };

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader
        title="Tables"
        subtitle={`Manage restaurant tables for ${selectedCompany.name}`}
        action={<button className="btn btn-primary" onClick={openCreate}>+ New Table</button>}
      />

      {/* Stats row */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Tables', value: stats.total, icon: '🪑', color: '#3b82f6' },
          { label: 'Free',         value: stats.free,     icon: '🟢', color: '#16a34a' },
          { label: 'Occupied',     value: stats.occupied, icon: '🟡', color: '#d97706' },
          { label: 'Reserved',     value: stats.reserved, icon: '🟣', color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ '--accent': s.color }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-info">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['all','All Tables'],['free','Free'],['occupied','Occupied'],['reserved','Reserved']].map(([val, lbl]) => (
          <button key={val}
            style={{ padding: '6px 16px', borderRadius: 20, border: `1px solid ${filter===val?'var(--primary)':'var(--border)'}`, background: filter===val?'var(--primary-light)':'var(--white)', color: filter===val?'var(--primary)':'var(--text-2)', fontWeight: filter===val?700:500, fontSize: 13, cursor: 'pointer' }}
            onClick={() => setFilter(val)}>
            {lbl} {val!=='all' && `(${stats[val]||0})`}
          </button>
        ))}
      </div>

      {/* Table grid */}
      {loading ? <Spinner /> : (
        <>
          {filtered.length === 0 && <div className="empty-state"><div className="empty-icon">🪑</div><h3>No tables found</h3></div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {filtered.map(t => {
              const sm = STATUS_META[t.table_status] || STATUS_META.free;
              const sec = SECTION_META[t.section_type] || SECTION_META.other;
              const hasSurcharge = parseFloat(t.surcharge_amount || 0) > 0;
              const occupancyPct = t.seats ? Math.round(((t.occupied_seats || 0) / t.seats) * 100) : 0;

              return (
                <div key={t.table_id} style={{ background: 'var(--white)', border: `1px solid ${sm.color}40`, borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                  {/* Header strip */}
                  <div style={{ background: sm.bg, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 22 }}>🪑</span>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: sm.color }}>{t.table_name}</div>
                        <div style={{ fontSize: 11, color: sm.color, opacity: .8 }}>{t.seats} seats · {t.floor || 'Ground Floor'}</div>
                      </div>
                    </div>
                    <span style={{ background: 'rgba(255,255,255,.8)', color: sm.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                      {sm.label}
                    </span>
                  </div>

                  {/* Body */}
                  <div style={{ padding: '12px 14px' }}>
                    {/* Section type */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ background: sec.bg, color: sec.color, fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {sec.icon} {sec.label}
                      </span>
                      {hasSurcharge && (
                        <span style={{ background: '#fff7ed', color: '#92400e', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10 }}>
                          +₹{parseFloat(t.surcharge_amount).toFixed(0)} {t.surcharge_label || ''}
                        </span>
                      )}
                    </div>

                    {/* Occupancy bar */}
                    {t.table_status === 'occupied' && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>
                          <span>Occupancy</span>
                          <span>{t.occupied_seats || 0}/{t.seats} seats · {t.active_order_count || 0} order(s)</span>
                        </div>
                        <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${occupancyPct}%`, background: occupancyPct >= 100 ? '#dc2626' : 'var(--primary)', borderRadius: 3, transition: 'width .3s' }} />
                        </div>
                      </div>
                    )}

                    {/* Section / surcharge info */}
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                      {t.section && <div>📍 {t.section}</div>}
                      {hasSurcharge && (
                        <div>💰 {t.surcharge_type === 'per_cover' ? 'Per cover' : 'Flat'} surcharge · {t.surcharge_label}</div>
                      )}
                    </div>

                    {/* Status change buttons */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      {['free','occupied','reserved'].filter(s => s !== t.table_status).map(s => {
                        const m = STATUS_META[s];
                        return (
                          <button key={s}
                            style={{ flex: 1, padding: '5px', background: m.bg, color: m.color, border: `1px solid ${m.color}30`, borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                            onClick={() => setConfirm({ table_id: t.table_id, table_name: t.table_name, new_status: s })}>
                            → {m.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Edit button */}
                    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                      <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => openEdit(t)}>
                        ✏️ Edit Table
                      </button>
                      <button
                        style={{ padding: '6px 10px', border: '1px solid #fecaca', borderRadius: 7, background: '#fff5f5', color: '#dc2626', fontSize: 15, cursor: 'pointer', flexShrink: 0, transition: 'all .15s' }}
                        onClick={() => setDeleteConfirm(t)}
                        title={`Deactivate ${t.table_name}`}
                        onMouseEnter={e => { e.currentTarget.style.background='#fee2e2'; }}
                        onMouseLeave={e => { e.currentTarget.style.background='#fff5f5'; }}
                      >🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Confirm status change ── */}
      {confirm && (
        <ConfirmDialog
          message={`Change ${confirm.table_name} status to "${confirm.new_status}"?`}
          confirmLabel={confirm.new_status === 'free' ? '→ Free' : confirm.new_status === 'reserved' ? '→ Reserved' : '→ Occupied'}
          danger={false}
          onConfirm={() => handleStatusChange(confirm.table_id, confirm.new_status)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* ── Confirm delete ── */}
      {deleteConfirm && (
        <ConfirmDialog
          message={`⚠️ Delete table "${deleteConfirm.table_name}"? This cannot be undone.`}
          onConfirm={() => handleDelete(deleteConfirm.table_id)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* ── Create / Edit Modal ── */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'New Table' : `Edit ${form.table_name}`} onClose={() => setModal(null)} size="lg">
          <form onSubmit={handleSubmit}>
            <div className="form-section-title">Basic Info</div>
            <div className="form-grid">
              <FormField label="Table Name" required><Input value={form.table_name} onChange={set('table_name')} placeholder="e.g. T-1" required /></FormField>
              <FormField label="Seats" required><Input type="number" min={1} max={20} value={form.seats} onChange={set('seats')} required /></FormField>
              <FormField label="Floor">
                <Select value={form.floor} onChange={set('floor')}>
                  {FLOORS.map(f => <option key={f} value={f}>{f}</option>)}
                </Select>
              </FormField>
              <FormField label="Section / Area"><Input value={form.section} onChange={set('section')} placeholder="e.g. Indoor, Window Side" /></FormField>
            </div>

            <div className="form-section-title">Section Type & Surcharge</div>
            <div className="form-grid">
              <FormField label="Section Type">
                <Select value={form.section_type} onChange={set('section_type')}>
                  {SECTION_TYPES.map(s => {
                    const m = SECTION_META[s] || SECTION_META.other;
                    return <option key={s} value={s}>{m.icon} {m.label}</option>;
                  })}
                </Select>
              </FormField>
              <FormField label="Surcharge Type">
                <Select value={form.surcharge_type} onChange={set('surcharge_type')}>
                  <option value="flat">Flat (fixed per order)</option>
                  <option value="per_cover">Per Cover (× guests)</option>
                </Select>
              </FormField>
              <FormField label="Surcharge Amount (₹)">
                <Input type="number" step="0.01" min={0} value={form.surcharge_amount} onChange={set('surcharge_amount')} placeholder="0 = no surcharge" />
              </FormField>
              <FormField label="Surcharge Label">
                <Input value={form.surcharge_label} onChange={set('surcharge_label')} placeholder="e.g. AC Surcharge, Garden Fee" />
              </FormField>
            </div>

            {/* Preview surcharge */}
            {parseFloat(form.surcharge_amount) > 0 && (
              <div style={{ background: '#fff7ed', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                ⚡ <strong>{form.surcharge_label || 'Surcharge'}</strong> of ₹{parseFloat(form.surcharge_amount).toFixed(2)}{' '}
                {form.surcharge_type === 'per_cover' ? 'per guest will be added to every order' : 'flat will be added to every order'} at this table.
              </div>
            )}

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : modal === 'create' ? 'Create Table' : 'Save Changes'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
