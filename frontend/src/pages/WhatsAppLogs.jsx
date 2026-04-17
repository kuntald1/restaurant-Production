import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/useApp';
import { request } from '../services/api';
import { Table, Badge, Spinner, PageHeader } from '../components/UI';

const whatsappAPI = {
  getLogs: (companyId, isSuperAdmin) =>
    request('GET', `/whatsapplogs/getlogs/${companyId}?is_super_admin=${isSuperAdmin}&limit=500`),
};

const TYPE_LABELS = {
  bill:            { label: 'Bill',             variant: 'success' },
  payment_request: { label: 'Payment Request',  variant: 'info'    },
  receipt:         { label: 'Receipt',           variant: 'warning' },
};

const STATUS_LABELS = {
  sent:      { label: 'Sent',     variant: 'success' },
  failed:    { label: 'Failed',   variant: 'error'   },
  delivered: { label: 'Delivered',variant: 'success' },
};

export default function WhatsAppLogs() {
  const { selectedCompany, user, allCompanies } = useApp();
  const isSuperAdmin = user?.is_super_admin === true;
  const cid          = selectedCompany?.company_unique_id;

  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('all'); // all | bill | payment_request | receipt

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const logs = await whatsappAPI.getLogs(cid, isSuperAdmin);
      setData(Array.isArray(logs) ? logs : []);
    } catch { setData([]); }
    setLoading(false);
  }, [cid, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  const companyName = (id) =>
    allCompanies?.find(c => c.company_unique_id === id)?.name || `Company ${id}`;

  const filtered = data.filter(row => {
    const matchType   = filter === 'all' || row.message_type === filter;
    const matchSearch = !search ||
      (row.order_number  || '').toLowerCase().includes(search.toLowerCase()) ||
      (row.bill_number   || '').toLowerCase().includes(search.toLowerCase()) ||
      (row.recipient_phone || '').includes(search);
    return matchType && matchSearch;
  });

  // Summary cards
  const total    = data.length;
  const bills    = data.filter(r => r.message_type === 'bill').length;
  const payments = data.filter(r => r.message_type === 'payment_request').length;
  const failed   = data.filter(r => r.status === 'failed').length;

  const cols = [
    { key: 'sent_at',     label: 'Date & Time', render: v => new Date(v).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) },
    ...(isSuperAdmin ? [{ key: 'company_unique_id', label: 'Company', render: v => companyName(v) }] : []),
    { key: 'order_number', label: 'Order No.',  render: v => v ? <span style={{ fontWeight:600 }}>{v}</span> : '—' },
    { key: 'bill_number',  label: 'Bill No.',   render: v => v ? <Badge variant="info">{v}</Badge> : '—' },
    { key: 'recipient_phone', label: 'Phone',   render: v => v || '—' },
    { key: 'message_type', label: 'Type', render: v => {
      const t = TYPE_LABELS[v] || { label: v, variant: 'default' };
      return <Badge variant={t.variant}>{t.label}</Badge>;
    }},
    { key: 'status', label: 'Status', render: v => {
      const s = STATUS_LABELS[v] || { label: v, variant: 'default' };
      return <Badge variant={s.variant}>{s.label}</Badge>;
    }},
    { key: 'message_sid', label: 'Twilio SID', render: v => v
      ? <span style={{ fontSize:11, color:'#888', fontFamily:'monospace' }}>{v.slice(0,20)}…</span>
      : '—'
    },
  ];

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader
        title="WhatsApp Logs"
        subtitle={isSuperAdmin ? 'All companies — WhatsApp messages sent' : `${selectedCompany.name} — WhatsApp messages sent`}
        action={<button className="btn btn-sm btn-outline" onClick={load}>↺ Refresh</button>}
      />

      {/* Summary Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          { label:'Total Sent',       value:total,    color:'#1a3a1c' },
          { label:'Bill Messages',    value:bills,    color:'#2d6a30' },
          { label:'Payment Requests', value:payments, color:'#1e40af' },
          { label:'Failed',           value:failed,   color:'#dc2626' },
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
          placeholder="Search order, bill, phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding:'8px 14px', border:'1px solid #ddd', borderRadius:8, fontSize:14, width:260 }}
        />
        <div style={{ display:'flex', gap:8 }}>
          {[['all','All'],['bill','Bills'],['payment_request','Payment Requests'],['receipt','Receipts']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              style={{
                padding:'7px 16px', borderRadius:100, fontSize:13, cursor:'pointer',
                background: filter === val ? '#1a3a1c' : '#fff',
                color:      filter === val ? '#fff'    : '#555',
                border:     filter === val ? 'none'    : '1px solid #ddd',
                fontWeight: filter === val ? 600       : 400,
              }}
            >{label}</button>
          ))}
        </div>
        <span style={{ marginLeft:'auto', fontSize:13, color:'#888' }}>{filtered.length} records</span>
      </div>

      {loading ? <Spinner /> : (
        <Table columns={cols} data={filtered} />
      )}
    </div>
  );
}
