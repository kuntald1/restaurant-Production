import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/useApp';
import { Table, Badge, Spinner, PageHeader } from '../components/UI';

function buildTree(companies) {
  const parents  = (companies || []).filter(c => !c.parant_company_unique_id);
  const children = (companies || []).filter(c =>  c.parant_company_unique_id);
  return parents.map(p => ({
    ...p,
    children: children.filter(c => c.parant_company_unique_id === p.company_unique_id),
  }));
}

const TYPE_LABELS = {
  bill:            { label: 'Bill',            variant: 'success' },
  payment_request: { label: 'Payment Request', variant: 'info'    },
  receipt:         { label: 'Receipt',         variant: 'warning' },
};

export default function WhatsAppLogs() {
  const { allCompanies, user } = useApp();

  const isSuperAdmin = user?.is_super_admin === true;
  const userCid      = user?.company_unique_id;

  // ── Visible companies — same logic as SalesReport ────────────────────────
  // SuperAdmin → all companies
  // Admin      → own company + children (parant_company_unique_id === userCid)
  const visibleCompanies = isSuperAdmin
    ? (allCompanies || [])
    : (allCompanies || []).filter(c =>
        c.company_unique_id === userCid ||
        c.parant_company_unique_id === userCid
      );
  const tree = buildTree(visibleCompanies);

  const [data,          setData]          = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [companyFilter, setCompanyFilter] = useState('all');
  const [typeFilter,    setTypeFilter]    = useState('all');
  const [search,        setSearch]        = useState('');

  // ── Load logs ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!userCid) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/whatsapplogs/getlogs/${userCid}?is_super_admin=${isSuperAdmin}&limit=500`
      );
      const logs = res.ok ? await res.json() : [];
      setData(Array.isArray(logs) ? logs : []);
    } catch { setData([]); }
    setLoading(false);
  }, [userCid, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  // ── Company name lookup ───────────────────────────────────────────────────
  const companyName = (id) =>
    (allCompanies || []).find(c => c.company_unique_id === id)?.name || `Company ${id}`;

  // ── Company IDs in scope for selected filter ──────────────────────────────
  const companiesInScope = companyFilter === 'all'
    ? visibleCompanies.map(c => c.company_unique_id)
    : [
        parseInt(companyFilter),
        ...(allCompanies || [])
          .filter(c => c.parant_company_unique_id === parseInt(companyFilter))
          .map(c => c.company_unique_id),
      ];

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = data.filter(row => {
    const matchCompany = companiesInScope.includes(row.company_unique_id);
    const matchType    = typeFilter === 'all' || row.message_type === typeFilter;
    const matchSearch  = !search ||
      (row.order_number    || '').toLowerCase().includes(search.toLowerCase()) ||
      (row.bill_number     || '').toLowerCase().includes(search.toLowerCase()) ||
      (row.recipient_phone || '').includes(search) ||
      companyName(row.company_unique_id).toLowerCase().includes(search.toLowerCase());
    return matchCompany && matchType && matchSearch;
  });

  // ── Summary stats (on filtered) ───────────────────────────────────────────
  const totalSent   = filtered.length;
  const billCount   = filtered.filter(r => r.message_type === 'bill').length;
  const payReqCount = filtered.filter(r => r.message_type === 'payment_request').length;
  const failedCount = filtered.filter(r => r.status === 'failed').length;

  // ── Per-company summary ───────────────────────────────────────────────────
  const companySummary = Object.values(
    filtered.reduce((acc, row) => {
      const id = row.company_unique_id;
      if (!acc[id]) acc[id] = { id, name: companyName(id), total: 0, bill: 0, payment: 0 };
      acc[id].total++;
      if (row.message_type === 'bill') acc[id].bill++;
      if (row.message_type === 'payment_request') acc[id].payment++;
      return acc;
    }, {})
  );

  // ── Table columns ─────────────────────────────────────────────────────────
  const showCompanyCol = isSuperAdmin || visibleCompanies.length > 1;
  const cols = [
    {
      key: 'sent_at', label: 'Date & Time',
      render: v => new Date(v).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }),
    },
    ...(showCompanyCol ? [{
      key: 'company_unique_id', label: 'Company',
      render: v => <span style={{ fontWeight: 500, color: '#1a3a1c' }}>{companyName(v)}</span>,
    }] : []),
    {
      key: 'order_number', label: 'Order No.',
      render: v => v ? <span style={{ fontWeight: 600 }}>{v}</span> : '—',
    },
    {
      key: 'bill_number', label: 'Bill No.',
      render: v => v ? <Badge variant="info">{v}</Badge> : '—',
    },
    { key: 'recipient_phone', label: 'Phone', render: v => v || '—' },
    {
      key: 'message_type', label: 'Type',
      render: v => {
        const t = TYPE_LABELS[v] || { label: v, variant: 'default' };
        return <Badge variant={t.variant}>{t.label}</Badge>;
      },
    },
    {
      key: 'status', label: 'Status',
      render: v => (
        <Badge variant={v === 'failed' ? 'error' : 'success'}>
          {v === 'failed' ? 'Failed' : 'Sent ✓'}
        </Badge>
      ),
    },
  ];

  const subtitle = isSuperAdmin
    ? `All companies — ${data.length} total messages`
    : `${companyName(userCid)} + branches — ${data.length} total messages`;

  return (
    <div className="page">
      <PageHeader
        title="WhatsApp Logs"
        subtitle={subtitle}
        action={<button className="btn btn-sm btn-outline" onClick={load}>↺ Refresh</button>}
      />

      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Sent',       value: totalSent,   color: '#1a3a1c' },
          { label: 'Bill Messages',    value: billCount,   color: '#2d6a30' },
          { label: 'Payment Requests', value: payReqCount, color: '#1e40af' },
          { label: 'Failed',           value: failedCount, color: failedCount > 0 ? '#dc2626' : '#888' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: 12, padding: '16px 20px',
          }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Per-Company Breakdown ── */}
      {companySummary.length > 1 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 10 }}>
            By Company
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {companySummary.map(c => (
              <div key={c.id} style={{
                background: '#fff', border: '1px solid #e5e7eb',
                borderRadius: 10, padding: '12px 18px', minWidth: 160,
                cursor: 'pointer',
              }}
                onClick={() => setCompanyFilter(String(c.id))}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a3a1c', marginBottom: 4 }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1a3a1c' }}>{c.total}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  Bills: {c.bill} · Payments: {c.payment}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>

        {/* Company dropdown — same as SalesReport */}
        <select
          value={companyFilter}
          onChange={e => setCompanyFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13 }}
        >
          <option value="all">{isSuperAdmin ? 'All Companies' : 'My Companies'}</option>
          {tree.map(parent => (
            <optgroup key={parent.company_unique_id} label={parent.name}>
              <option value={parent.company_unique_id}>{parent.name}</option>
              {parent.children?.map(child => (
                <option key={child.company_unique_id} value={child.company_unique_id}>
                  ↳ {child.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Message type filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13 }}
        >
          <option value="all">All Types</option>
          <option value="bill">Bills</option>
          <option value="payment_request">Payment Requests</option>
          <option value="receipt">Receipts</option>
        </select>

        {/* Search */}
        <input
          placeholder="Search order no, bill no, phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '8px 14px', border: '1px solid #ddd',
            borderRadius: 8, fontSize: 14, width: 260,
          }}
        />

        {/* Reset */}
        {(companyFilter !== 'all' || typeFilter !== 'all' || search) && (
          <button
            onClick={() => { setCompanyFilter('all'); setTypeFilter('all'); setSearch(''); }}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#555' }}
          >
            ✕ Clear
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#888' }}>
          {filtered.length} records
        </span>
      </div>

      {/* ── Table ── */}
      {loading ? <Spinner /> : <Table columns={cols} data={filtered} />}
    </div>
  );
}
