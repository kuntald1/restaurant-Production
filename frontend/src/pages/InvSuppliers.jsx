/**
 * InvSuppliers.jsx — Inventory Module 7: Supplier Management
 * Covers: Supplier master, Rate Card, Payment Ledger, Outstanding
 */

import { useEffect, useState } from 'react';
import { invSupplierAPI, invItemAPI } from '../services/api';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Select, Textarea, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const EMPTY = {
  company_unique_id: '', supplier_name: '', contact_person: '', phone: '', email: '',
  address: '', gstin: '', payment_terms: '', rating: '', is_active: true,
};

const EMPTY_RATE = { company_unique_id: '', supplier_id: '', item_id: '', rate_per_uom: '', effective_from: '', effective_to: '', is_active: true };
const EMPTY_PAY  = { company_unique_id: '', supplier_id: '', transaction_date: '', amount: '', transaction_type: 'invoice', reference_no: '', notes: '' };

export default function InvSuppliers() {
  const { selectedCompany, showToast, user } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [suppliers, setSuppliers] = useState([]);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [modal,     setModal]     = useState(null); // 'create'|'edit'|'rate'|'payment'|'ledger'
  const [form,      setForm]      = useState(EMPTY);
  const [editId,    setEditId]    = useState(null);
  const [confirm,   setConfirm]   = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [detail,    setDetail]    = useState(null); // selected supplier for sub-panel
  const [rateCards, setRateCards] = useState([]);
  const [ledger,    setLedger]    = useState([]);
  const [outstanding, setOutstanding] = useState(null);
  const [rateForm,  setRateForm]  = useState(EMPTY_RATE);
  const [payForm,   setPayForm]   = useState(EMPTY_PAY);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [s, i] = await Promise.allSettled([
        invSupplierAPI.getAll(cid),
        invItemAPI.getAll(cid),
      ]);
      setSuppliers(s.status === 'fulfilled' ? (s.value || []) : []);
      setItems(i.status === 'fulfilled' ? (i.value || []) : []);
    } catch { setSuppliers([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const openDetail = async (sup) => {
    setDetail(sup);
    try {
      const [rc, led, out] = await Promise.allSettled([
        invSupplierAPI.getRateCards(sup.supplier_id),
        invSupplierAPI.getPayments(sup.supplier_id),
        invSupplierAPI.getOutstanding(sup.supplier_id),
      ]);
      setRateCards(rc.status === 'fulfilled' ? (rc.value || []) : []);
      setLedger(led.status === 'fulfilled' ? (led.value || []) : []);
      setOutstanding(out.status === 'fulfilled' ? out.value?.outstanding : null);
    } catch {}
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, company_unique_id: cid, rating: form.rating ? parseFloat(form.rating) : null, created_by: user?.username };
      if (editId) { await invSupplierAPI.update(editId, payload); showToast('Supplier updated!'); }
      else { await invSupplierAPI.create(payload); showToast('Supplier created!'); }
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  const handleRateSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await invSupplierAPI.createRateCard({
        ...rateForm, company_unique_id: cid, supplier_id: detail.supplier_id,
        item_id: parseInt(rateForm.item_id), rate_per_uom: parseFloat(rateForm.rate_per_uom),
        created_by: user?.username,
      });
      showToast('Rate card added!');
      setModal(null);
      openDetail(detail);
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await invSupplierAPI.createPayment({
        ...payForm, company_unique_id: cid, supplier_id: detail.supplier_id,
        amount: parseFloat(payForm.amount), created_by: user?.username,
      });
      showToast('Payment recorded!');
      setModal(null);
      openDetail(detail);
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try { await invSupplierAPI.delete(id); showToast('Supplier deleted'); load(); if (detail?.supplier_id === id) setDetail(null); }
    catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  const getItemName = (id) => items.find(i => i.item_id === id)?.item_name || id;

  const cols = [
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'contact_person', label: 'Contact', render: (v) => v || '—' },
    { key: 'phone', label: 'Phone', render: (v) => v || '—' },
    { key: 'gstin', label: 'GSTIN', render: (v) => v || '—' },
    { key: 'payment_terms', label: 'Terms', render: (v) => v || '—' },
    { key: 'rating', label: 'Rating', render: (v) => v ? `⭐ ${v}` : '—' },
    { key: 'is_active', label: 'Status', render: (v) => <Badge variant={v ? 'success' : 'error'}>{v ? 'Active' : 'Inactive'}</Badge> },
  ];

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader
        title="🚚 Supplier Management"
        subtitle="Manage suppliers, rate cards, and payment ledger"
        action={<button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY, company_unique_id: cid }); setEditId(null); setModal('create'); }}>+ Add Supplier</button>}
      />

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: detail ? '1fr 420px' : '1fr', gap: 20 }}>
          {/* Supplier Table */}
          <Table columns={cols} data={suppliers} actions={(row) => (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => openDetail(row)}>📋 Details</button>
              <button className="btn btn-sm btn-ghost" onClick={() => { setForm({ ...row, rating: row.rating || '' }); setEditId(row.supplier_id); setModal('create'); }}>✏️</button>
              <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.supplier_id, name: row.supplier_name })}>🗑️</button>
            </div>
          )} />

          {/* Detail Panel */}
          {detail && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontWeight: 700, fontSize: 15 }}>📋 {detail.supplier_name}</h3>
                <button className="btn-icon" onClick={() => setDetail(null)}>✕</button>
              </div>

              {/* Outstanding */}
              <div style={{ background: outstanding > 0 ? 'var(--warning-bg)' : 'var(--success-bg)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Outstanding Balance</span>
                <span style={{ fontWeight: 700, fontSize: 16, color: outstanding > 0 ? 'var(--warning)' : 'var(--success)' }}>
                  ₹{outstanding != null ? parseFloat(outstanding).toFixed(2) : '—'}
                </span>
              </div>

              {/* Rate Card */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <b style={{ fontSize: 13 }}>Rate Card</b>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setRateForm({ ...EMPTY_RATE }); setModal('rate'); }}>+ Add Rate</button>
                </div>
                {rateCards.length === 0
                  ? <p style={{ color: 'var(--text-3)', fontSize: 12 }}>No rates configured yet.</p>
                  : rateCards.map(rc => (
                    <div key={rc.rate_card_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 13 }}>{getItemName(rc.item_id)}</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>₹{parseFloat(rc.rate_per_uom).toFixed(2)}</span>
                    </div>
                  ))
                }
              </div>

              {/* Payment Ledger */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <b style={{ fontSize: 13 }}>Payment Ledger</b>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setPayForm({ ...EMPTY_PAY, transaction_date: new Date().toISOString().split('T')[0] }); setModal('payment'); }}>+ Add Entry</button>
                </div>
                {ledger.length === 0
                  ? <p style={{ color: 'var(--text-3)', fontSize: 12 }}>No transactions yet.</p>
                  : ledger.slice(0, 8).map(l => (
                    <div key={l.ledger_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      <div>
                        <Badge variant={l.transaction_type === 'payment' ? 'success' : l.transaction_type === 'debit_note' ? 'warning' : 'info'}>
                          {l.transaction_type}
                        </Badge>
                        <span style={{ marginLeft: 6, color: 'var(--text-3)' }}>{l.transaction_date}</span>
                      </div>
                      <span style={{ fontWeight: 600, color: l.transaction_type === 'payment' ? 'var(--success)' : 'var(--error)' }}>
                        {l.transaction_type === 'payment' ? '-' : '+'}₹{parseFloat(l.amount).toFixed(2)}
                      </span>
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Supplier Form Modal ── */}
      {modal === 'create' && (
        <Modal title={editId ? 'Edit Supplier' : 'Add Supplier'} onClose={() => setModal(null)} size="md">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Supplier Name" required>
                <Input value={form.supplier_name} onChange={set('supplier_name')} required placeholder="ABC Traders" />
              </FormField>
              <FormField label="Contact Person">
                <Input value={form.contact_person} onChange={set('contact_person')} placeholder="Ramesh Kumar" />
              </FormField>
              <FormField label="Phone">
                <Input value={form.phone} onChange={set('phone')} placeholder="+91 9876543210" />
              </FormField>
              <FormField label="Email">
                <Input type="email" value={form.email} onChange={set('email')} placeholder="abc@example.com" />
              </FormField>
              <FormField label="GSTIN">
                <Input value={form.gstin} onChange={set('gstin')} placeholder="27AAAAA0000A1Z5" />
              </FormField>
              <FormField label="Payment Terms">
                <Input value={form.payment_terms} onChange={set('payment_terms')} placeholder="Net 30" />
              </FormField>
              <FormField label="Rating (1-5)">
                <Input type="number" min="1" max="5" step="0.1" value={form.rating} onChange={set('rating')} placeholder="4.5" />
              </FormField>
              <FormField label="Status">
                <Select value={form.is_active ? 'true' : 'false'} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </Select>
              </FormField>
            </div>
            <FormField label="Address">
              <Textarea value={form.address} onChange={set('address')} rows={2} />
            </FormField>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Rate Card Modal ── */}
      {modal === 'rate' && (
        <Modal title="Add Rate Card" onClose={() => setModal(null)} size="sm">
          <form onSubmit={handleRateSubmit}>
            <FormField label="Item" required>
              <Select value={rateForm.item_id} onChange={(e) => setRateForm(f => ({ ...f, item_id: e.target.value }))} required>
                <option value="">— Select Item —</option>
                {items.map(i => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}
              </Select>
            </FormField>
            <FormField label="Rate per UOM (₹)" required>
              <Input type="number" step="0.01" value={rateForm.rate_per_uom} onChange={(e) => setRateForm(f => ({ ...f, rate_per_uom: e.target.value }))} required placeholder="0.00" />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Effective From">
                <Input type="date" value={rateForm.effective_from} onChange={(e) => setRateForm(f => ({ ...f, effective_from: e.target.value }))} />
              </FormField>
              <FormField label="Effective To">
                <Input type="date" value={rateForm.effective_to} onChange={(e) => setRateForm(f => ({ ...f, effective_to: e.target.value }))} />
              </FormField>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add Rate'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Payment Modal ── */}
      {modal === 'payment' && (
        <Modal title="Record Transaction" onClose={() => setModal(null)} size="sm">
          <form onSubmit={handlePaymentSubmit}>
            <FormField label="Type" required>
              <Select value={payForm.transaction_type} onChange={(e) => setPayForm(f => ({ ...f, transaction_type: e.target.value }))}>
                <option value="invoice">Invoice (Payable)</option>
                <option value="payment">Payment (Made)</option>
                <option value="debit_note">Debit Note</option>
              </Select>
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Date" required>
                <Input type="date" value={payForm.transaction_date} onChange={(e) => setPayForm(f => ({ ...f, transaction_date: e.target.value }))} required />
              </FormField>
              <FormField label="Amount (₹)" required>
                <Input type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm(f => ({ ...f, amount: e.target.value }))} required placeholder="0.00" />
              </FormField>
            </div>
            <FormField label="Reference No.">
              <Input value={payForm.reference_no} onChange={(e) => setPayForm(f => ({ ...f, reference_no: e.target.value }))} placeholder="Invoice # / Cheque #" />
            </FormField>
            <FormField label="Notes">
              <Textarea value={payForm.notes} onChange={(e) => setPayForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </FormField>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Record'}</button>
            </div>
          </form>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          message={`Delete supplier "${confirm.name}"?`}
          onConfirm={() => handleDelete(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
