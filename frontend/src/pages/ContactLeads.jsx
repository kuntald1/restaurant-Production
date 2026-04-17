import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/useApp';
import { request } from '../services/api';
import { Table, Badge, Spinner, PageHeader, Modal } from '../components/UI';

const leadsAPI = {
  getAll:  ()             => request('GET',   '/contactleads/getall'),
  update:  (id, data)     => request('PATCH', `/contactleads/update/${id}`, data),
};

export default function ContactLeads() {
  const { user } = useApp();
  const isSuperAdmin = user?.is_super_admin === true;

  const [data,     setData]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState('all'); // all | contacted | pending
  const [viewLead, setViewLead] = useState(null);
  const [note,     setNote]     = useState('');
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await leadsAPI.getAll()); }
    catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { if (isSuperAdmin) load(); }, [load, isSuperAdmin]);

  const openLead = (row) => { setViewLead(row); setNote(row.contacted_note || ''); };

  const markContacted = async (id, contacted) => {
    setSaving(true);
    try {
      const updated = await leadsAPI.update(id, { is_contacted: contacted, contacted_note: note });
      setData(prev => prev.map(r => r.id === id ? updated : r));
      setViewLead(updated);
    } catch {}
    setSaving(false);
  };

  const saveNote = async () => {
    if (!viewLead) return;
    setSaving(true);
    try {
      const updated = await leadsAPI.update(viewLead.id, { contacted_note: note });
      setData(prev => prev.map(r => r.id === viewLead.id ? updated : r));
      setViewLead(updated);
    } catch {}
    setSaving(false);
  };

  const filtered = data.filter(row => {
    const matchFilter = filter === 'all'
      ? true
      : filter === 'contacted' ? row.is_contacted : !row.is_contacted;
    const matchSearch = !search ||
      row.restaurant_name.toLowerCase().includes(search.toLowerCase()) ||
      row.first_name.toLowerCase().includes(search.toLowerCase()) ||
      (row.phone || '').includes(search) ||
      (row.city  || '').toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const total     = data.length;
  const pending   = data.filter(r => !r.is_contacted).length;
  const contacted = data.filter(r =>  r.is_contacted).length;

  const cols = [
    { key: 'submitted_at', label: 'Date', render: v => new Date(v).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) },
    { key: 'first_name', label: 'Name', render: (v, row) => `${v} ${row.last_name || ''}` },
    { key: 'restaurant_name', label: 'Restaurant', render: v => <strong>{v}</strong> },
    { key: 'phone',    label: 'Phone' },
    { key: 'city',     label: 'City',   render: v => v || '—' },
    { key: 'branches', label: 'Branches', render: v => v || '—' },
    { key: 'interest', label: 'Interest', render: v => v ? <Badge variant="info">{v}</Badge> : '—' },
    { key: 'is_contacted', label: 'Status', render: v =>
      <Badge variant={v ? 'success' : 'warning'}>{v ? 'Contacted ✓' : 'Pending'}</Badge>
    },
  ];

  if (!isSuperAdmin) return (
    <div className="page"><div className="empty-state"><h3>Super Admin access only</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader
        title="Contact Leads"
        subtitle="Enquiries submitted from the CurryCloud website"
        action={<button className="btn btn-sm btn-outline" onClick={load}>↺ Refresh</button>}
      />

      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24 }}>
        {[
          { label:'Total Leads',  value:total,     color:'#1a3a1c' },
          { label:'Pending',      value:pending,   color:'#d97706' },
          { label:'Contacted',    value:contacted, color:'#16a34a' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'16px 20px' }}>
            <div style={{ fontSize:12, color:'#888', marginBottom:6 }}>{label}</div>
            <div style={{ fontSize:28, fontWeight:700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        <input
          placeholder="Search restaurant, name, phone, city..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding:'8px 14px', border:'1px solid #ddd', borderRadius:8, fontSize:14, width:300 }}
        />
        <div style={{ display:'flex', gap:8 }}>
          {[['all','All'],['pending','Pending'],['contacted','Contacted']].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{
              padding:'7px 16px', borderRadius:100, fontSize:13, cursor:'pointer',
              background: filter === val ? '#1a3a1c' : '#fff',
              color:      filter === val ? '#fff'    : '#555',
              border:     filter === val ? 'none'    : '1px solid #ddd',
              fontWeight: filter === val ? 600       : 400,
            }}>{label}</button>
          ))}
        </div>
        <span style={{ marginLeft:'auto', fontSize:13, color:'#888' }}>{filtered.length} leads</span>
      </div>

      {loading ? <Spinner /> : (
        <Table
          columns={cols}
          data={filtered}
          actions={(row) => (
            <button className="btn btn-sm btn-ghost" onClick={() => openLead(row)}>View</button>
          )}
        />
      )}

      {/* View / Edit Modal */}
      {viewLead && (
        <Modal title="Lead Details" onClose={() => setViewLead(null)} size="lg">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
            {[
              ['Name',        `${viewLead.first_name} ${viewLead.last_name || ''}`],
              ['Restaurant',  viewLead.restaurant_name],
              ['Phone',       viewLead.phone],
              ['Email',       viewLead.email || '—'],
              ['City',        viewLead.city  || '—'],
              ['Branches',    viewLead.branches || '—'],
              ['Interest',    viewLead.interest || '—'],
              ['Submitted',   new Date(viewLead.submitted_at).toLocaleString('en-IN')],
            ].map(([k, v]) => (
              <div key={k} style={{ background:'#f9fafb', borderRadius:8, padding:'10px 14px' }}>
                <div style={{ fontSize:11, color:'#888', marginBottom:3 }}>{k}</div>
                <div style={{ fontSize:14, color:'#1a1a1a', fontWeight:500 }}>{v}</div>
              </div>
            ))}
          </div>
          {viewLead.message && (
            <div style={{ background:'#f9fafb', borderRadius:8, padding:'12px 14px', marginBottom:16 }}>
              <div style={{ fontSize:11, color:'#888', marginBottom:4 }}>Message</div>
              <div style={{ fontSize:14, color:'#333', lineHeight:1.6 }}>{viewLead.message}</div>
            </div>
          )}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, fontWeight:600, color:'#555', display:'block', marginBottom:6 }}>Follow-up Note</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="Add a note about this lead..."
              style={{ width:'100%', padding:'10px 12px', border:'1px solid #ddd', borderRadius:8, fontSize:14, resize:'vertical' }}
            />
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setViewLead(null)}>Close</button>
            <button className="btn btn-outline" onClick={saveNote} disabled={saving}>
              {saving ? 'Saving…' : 'Save Note'}
            </button>
            {!viewLead.is_contacted ? (
              <button
                onClick={() => markContacted(viewLead.id, true)}
                disabled={saving}
                style={{ background:'#16a34a', color:'#fff', border:'none', padding:'10px 20px', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:14 }}
              >
                ✓ Mark Contacted
              </button>
            ) : (
              <button
                onClick={() => markContacted(viewLead.id, false)}
                disabled={saving}
                style={{ background:'#d97706', color:'#fff', border:'none', padding:'10px 20px', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:14 }}
              >
                ↩ Mark Pending
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
