import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/useApp';
import { settlementAPI } from '../services/api';
import { PageHeader, Spinner } from '../components/UI';

const fmt   = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = ()  => new Date().toISOString().slice(0, 10);
const nAgo  = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

function buildTree(companies) {
  const parents  = (companies || []).filter(c => !c.parant_company_unique_id);
  const children = (companies || []).filter(c =>  c.parant_company_unique_id);
  return parents.map(p => ({ ...p, children: children.filter(c => c.parant_company_unique_id === p.company_unique_id) }));
}

export default function BillSettlementReport() {
  const { allCompanies, user } = useApp();
  const isSuperAdmin = user?.is_super_admin === true;
  const userCid      = user?.company_unique_id;

  const visibleCompanies = isSuperAdmin
    ? (allCompanies || [])
    : (allCompanies || []).filter(c =>
        c.company_unique_id === userCid || c.parant_company_unique_id === userCid);
  const myCompany    = (allCompanies || []).find(c => c.company_unique_id === userCid);
  const myParentId   = myCompany?.parant_company_unique_id;
  const isChildBranch = !!myParentId && Number(myParentId) !== 0;
  const rootCid      = isChildBranch ? Number(myParentId) : userCid;
  const tree         = buildTree(visibleCompanies);

  const [fromDate,   setFromDate]   = useState(nAgo(30));
  const [toDate,     setToDate]     = useState(today());
  const [branchId,   setBranchId]   = useState('all');
  const [billSearch, setBillSearch] = useState('');

  const [groups,  setGroups]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [note,    setNote]    = useState('');

  const load = useCallback(async () => {
    setLoading(true); setGroups([]); setNote('');
    try {
      const data = await settlementAPI.report(rootCid, {
        from_date: fromDate, to_date: toDate,
        branch_id: branchId !== 'all' ? branchId : undefined,
        bill_number: billSearch.trim() || undefined,
      });
      const list = Array.isArray(data) ? data : [];
      setGroups(isChildBranch ? list.filter(g => g.company_unique_id === userCid) : list);
      if (!list.length) setNote('No settlement activity for this range.');
    } catch (e) {
      setNote(e.message || 'Error loading report.');
    }
    setLoading(false);
  }, [rootCid, fromDate, toDate, branchId, billSearch, isChildBranch, userCid]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalAdded   = groups.reduce((s, g) => s + g.added.length, 0);
  const totalRemoved = groups.reduce((s, g) => s + g.removed.length, 0);

  return (
    <div className="page">
      <PageHeader title="Bill Settlement Report" subtitle="Items added or removed after billing, per bill" />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div><label style={lbl}>From</label><input type="date" className="input" value={fromDate} onChange={e => setFromDate(e.target.value)} /></div>
        <div><label style={lbl}>To</label><input type="date" className="input" value={toDate} onChange={e => setToDate(e.target.value)} /></div>
        <div>
          <label style={lbl}>Branch</label>
          <select className="input" value={branchId} onChange={e => setBranchId(e.target.value)}>
            <option value="all">All branches</option>
            {tree.map(p => (
              <optgroup key={p.company_unique_id} label={p.name}>
                <option value={p.company_unique_id}>{p.name}{p.children.length ? ` (+ ${p.children.length} branch)` : ''}</option>
                {p.children.map(c => (
                  <option key={c.company_unique_id} value={c.company_unique_id}>&nbsp;&nbsp;↳ {c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={lbl}>Bill number</label>
          <input className="input" placeholder="e.g. BILL-2026-0021" value={billSearch} onChange={e => setBillSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Search'}</button>
      </div>

      {!loading && groups.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 13 }}>
          <span style={{ ...pill, background: 'rgba(34,197,94,.12)', color: '#16a34a' }}>{totalAdded} items added</span>
          <span style={{ ...pill, background: 'rgba(220,38,38,.12)', color: '#dc2626' }}>{totalRemoved} items removed</span>
          <span style={{ ...pill, background: 'rgba(124,58,237,.10)', color: '#7c3aed' }}>{groups.length} bills settled</span>
        </div>
      )}

      {loading ? <Spinner /> : groups.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: '#888' }}>{note}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map((g, gi) => (
            <div className="card" key={gi} style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{g.bill_number}</span>
                  <span style={{ color: '#888', marginLeft: 10, fontSize: 13 }}>Order {g.order_number || '—'} · {g.branch_name}</span>
                </div>
                <div style={{ fontSize: 13, color: '#555' }}>
                  {(g.settled_at || '').slice(0, 16).replace('T', ' ')}
                  <span style={{ marginLeft: 12, fontWeight: 600, color: g.net_delta >= 0 ? '#16a34a' : '#dc2626' }}>
                    Net {g.net_delta >= 0 ? '+' : ''}{fmt(g.net_delta)}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Added */}
                <div>
                  <div style={{ ...colHead, color: '#16a34a' }}>＋ Added ({g.added.length})</div>
                  {g.added.length === 0 ? <div style={empty}>none</div> : g.added.map((it, i) => (
                    <div key={i} style={{ ...row, borderLeft: '3px solid #16a34a' }}>
                      <span>{it.item_name} <span style={qty}>×{it.quantity}</span></span>
                      <span>{fmt(it.line_amount)}</span>
                    </div>
                  ))}
                </div>
                {/* Removed */}
                <div>
                  <div style={{ ...colHead, color: '#dc2626' }}>－ Removed ({g.removed.length})</div>
                  {g.removed.length === 0 ? <div style={empty}>none</div> : g.removed.map((it, i) => (
                    <div key={i} style={{ ...row, borderLeft: '3px solid #dc2626' }}>
                      <span style={{ textDecoration: 'line-through', color: '#999' }}>
                        {it.item_name} <span style={qty}>×{it.quantity}</span>
                      </span>
                      <span style={{ color: '#dc2626' }}>−{fmt(it.line_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const lbl     = { display: 'block', fontSize: 12, color: '#666', marginBottom: 4 };
const pill    = { padding: '4px 10px', borderRadius: 12, fontWeight: 600 };
const colHead = { fontWeight: 600, fontSize: 13, marginBottom: 6 };
const row     = { display: 'flex', justifyContent: 'space-between', padding: '6px 10px', marginBottom: 4, background: '#fafafa', borderRadius: 4, fontSize: 13 };
const empty   = { color: '#bbb', fontSize: 13, fontStyle: 'italic', padding: '6px 0' };
const qty     = { color: '#888', fontSize: 12 };
