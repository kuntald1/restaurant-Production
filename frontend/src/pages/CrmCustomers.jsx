import { useEffect, useState } from 'react';
import { crmCustomerAPI } from '../services/api';
import { useApp } from '../context/useApp';
import { PageHeader, Spinner, Table, Modal, FormField, Input, Badge, ConfirmDialog } from '../components/UI';

const EMPTY = { name:'', phone:'', email:'', date_of_birth:'', anniversary_date:'', address:'', notes:'', due_amount:'' };

// ── Customer Credit Log Modal ──────────────────────────────
function CreditLogModal({ customer, cid, onClose, showToast }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addingPayment, setAddingPayment] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentDue, setCurrentDue] = useState(Number(customer.due_amount || 0));

  const load = async () => {
    setLoading(true);
    try {
      const data = await crmCustomerAPI.getCreditLog(cid, customer.customer_id);
      setLogs(data);
    } catch { setLogs([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [customer.customer_id]);

  const totalCredit = logs.filter(l => l.payment_status === 'credit').reduce((s, l) => s + Number(l.amount), 0);
  const totalPaid   = logs.filter(l => l.payment_status === 'paid').reduce((s, l) => s + Math.abs(Number(l.amount)), 0);

  const handleAddPayment = async () => {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { showToast('Enter valid amount', 'error'); return; }
    setSaving(true);
    try {
      const res = await crmCustomerAPI.addCreditLog(cid, {
        customer_id:    customer.customer_id,
        amount:         -amt,
        payment_status: 'paid',
        notes:          payNotes || 'Payment received',
      });
      if (res.due_amount !== undefined) setCurrentDue(Number(res.due_amount));
      showToast('Payment recorded!');
      setPayAmount(''); setPayNotes(''); setAddingPayment(false);
      load();
    } catch(e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  return (
    <Modal title={`Credit Log — ${customer.name}`} onClose={onClose} size="lg">
      {/* Summary cards */}
      <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:120, background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:10, padding:'12px 16px' }}>
          <div style={{ fontSize:11, color:'#dc2626', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em' }}>Total Credit</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#dc2626', marginTop:4 }}>₹{totalCredit.toFixed(2)}</div>
        </div>
        <div style={{ flex:1, minWidth:120, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'12px 16px' }}>
          <div style={{ fontSize:11, color:'#166534', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em' }}>Total Paid</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#166534', marginTop:4 }}>₹{totalPaid.toFixed(2)}</div>
        </div>
        <div style={{ flex:1, minWidth:120, background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'12px 16px' }}>
          <div style={{ fontSize:11, color:'#92400e', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em' }}>Current Due</div>
          <div style={{ fontSize:20, fontWeight:800, color: currentDue > 0 ? '#dc2626' : '#166534', marginTop:4 }}>₹{currentDue.toFixed(2)}</div>
        </div>
      </div>

      {/* Add Payment */}
      {!addingPayment ? (
        <button className="btn btn-primary" style={{ marginBottom:14 }} onClick={() => setAddingPayment(true)}>
          + Record Payment Received
        </button>
      ) : (
        <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:14, marginBottom:14 }}>
          <div style={{ fontWeight:600, fontSize:14, color:'#166534', marginBottom:10 }}>💵 Record Payment Received</div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:10 }}>
            <div style={{ flex:1, minWidth:120 }}>
              <label style={{ fontSize:12, fontWeight:600, color:'var(--text-2)', display:'block', marginBottom:4 }}>Amount (₹)</label>
              <input className="form-input" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div style={{ flex:2, minWidth:180 }}>
              <label style={{ fontSize:12, fontWeight:600, color:'var(--text-2)', display:'block', marginBottom:4 }}>Notes</label>
              <input className="form-input" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="e.g. Cash payment, UPI..." />
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost" onClick={() => setAddingPayment(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddPayment} disabled={saving}>{saving ? 'Saving…' : 'Save Payment'}</button>
          </div>
        </div>
      )}

      {/* Log table */}
      {loading ? <Spinner /> : logs.length === 0 ? (
        <div style={{ textAlign:'center', color:'var(--text-3)', padding:'24px 0', fontSize:14 }}>No credit logs yet.</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--bg-2)', borderBottom:'2px solid var(--border)' }}>
                {['Date','Order #','Bill #','Amount','Status','Notes'].map(h => (
                  <th key={h} style={{ padding:'8px 12px', textAlign: h === 'Amount' ? 'right' : h === 'Status' ? 'center' : 'left', fontWeight:700, color:'var(--text-2)', fontSize:11, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const amt = Number(log.amount);
                const isCredit = log.payment_status === 'credit';
                return (
                  <tr key={log.log_id} style={{ borderBottom:'1px solid var(--border-light)' }}>
                    <td style={{ padding:'8px 12px', color:'var(--text-3)', fontSize:12, whiteSpace:'nowrap' }}>
                      {log.created_at ? new Date(log.created_at).toLocaleString('en-IN', { dateStyle:'short', timeStyle:'short' }) : '—'}
                    </td>
                    <td style={{ padding:'8px 12px' }}>{log.order_number || '—'}</td>
                    <td style={{ padding:'8px 12px' }}>{log.bill_number || '—'}</td>
                    <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:700, color: isCredit ? '#dc2626' : '#166534' }}>
                      {isCredit ? <span style={{ color:'#dc2626' }}>−₹{Math.abs(amt).toFixed(2)}</span>
                                : <span style={{ color:'#166534' }}>+₹{Math.abs(amt).toFixed(2)}</span>}
                    </td>
                    <td style={{ padding:'8px 12px', textAlign:'center' }}>
                      <Badge variant={isCredit ? 'danger' : 'success'}>{isCredit ? 'Credit' : 'Paid'}</Badge>
                    </td>
                    <td style={{ padding:'8px 12px', color:'var(--text-3)', fontSize:12 }}>{log.notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'var(--bg-2)', borderTop:'2px solid var(--border)', fontWeight:700 }}>
                <td colSpan={3} style={{ padding:'10px 12px', fontSize:13 }}>Balance</td>
                <td style={{ padding:'10px 12px', textAlign:'right', fontSize:14, color: currentDue > 0 ? '#dc2626' : '#166534' }}>
                  Due: ₹{currentDue.toFixed(2)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Modal>
  );
}

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
  const [logCustomer, setLogCustomer] = useState(null);

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
      if (payload.due_amount === '' || payload.due_amount === null || payload.due_amount === undefined)
        delete payload.due_amount;
      else
        payload.due_amount = parseFloat(payload.due_amount) || 0;

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
    {
      key: 'due_amount',
      label: 'Due Amount',
      render: v => (
        <span style={{ fontWeight:700, color: Number(v||0) > 0 ? '#dc2626' : '#166534' }}>
          ₹{Number(v||0).toFixed(2)}
        </span>
      ),
    },
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
            <button className="btn btn-sm btn-outline" onClick={() => setLogCustomer(row)}>Log Details</button>
            <button className="btn btn-sm btn-outline" onClick={() => {
              setForm({...row, date_of_birth: row.date_of_birth||'', anniversary_date: row.anniversary_date||'', due_amount: row.due_amount||''});
              setEditId(row.customer_id); setModal('edit');
            }}>Edit</button>
            <button className="btn btn-sm btn-danger-ghost" onClick={() => setConfirm(row.customer_id)}>Delete</button>
          </div>
        )} />
      )}

      {confirm && <ConfirmDialog message="Deactivate this customer?" onConfirm={async () => { await crmCustomerAPI.delete(confirm); showToast('Customer removed'); setConfirm(null); load(); }} onCancel={() => setConfirm(null)} />}

      {logCustomer && (
        <CreditLogModal
          customer={logCustomer}
          cid={cid}
          showToast={showToast}
          onClose={() => { setLogCustomer(null); load(); }}
        />
      )}

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
            <div className="form-section-title" style={{ marginTop:16 }}>💳 Credit / Due Balance</div>
            <div className="form-grid">
              <FormField label="Due Amount (₹)" hint="Outstanding balance for this customer">
                <Input type="number" step="0.01" min="0" value={form.due_amount} onChange={set('due_amount')} placeholder="0.00" />
              </FormField>
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
