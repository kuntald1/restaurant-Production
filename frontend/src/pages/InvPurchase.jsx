/**
 * InvPurchase.jsx — Inventory Module 2: Stock In / Purchase Management
 * Covers: Purchase Orders (PO) and Goods Receipt Notes (GRN)
 * GRN posting updates StockBalance automatically on the backend.
 */

import { useEffect, useState } from 'react';
import { invPoAPI, invGrnAPI, invSupplierAPI, invItemAPI } from '../services/api';
import { useInventoryNodes } from './useInventoryNodes';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Select, Textarea, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const today = () => new Date().toISOString().split('T')[0];

const EMPTY_PO = {
  po_number: '', supplier_id: '', node_id: '', po_date: today(),
  expected_delivery: '', status: 'draft', notes: '', total_amount: 0,
};

const EMPTY_GRN = {
  grn_number: '', po_id: '', supplier_id: '', node_id: '', grn_date: today(),
  invoice_number: '', invoice_date: '', status: 'draft', notes: '', total_amount: 0,
};

const STATUS_COLOR = {
  draft: 'default', sent: 'info', partially_received: 'warning',
  received: 'success', cancelled: 'error', posted: 'success',
};

function ItemLineEditor({ items, lines, onChange }) {
  const addLine = () => onChange([...lines, { item_id: '', qty: '', unit_price: '' }]);
  const removeLine = (i) => onChange(lines.filter((_, idx) => idx !== i));
  const setLine = (i, k, v) => {
    const updated = lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l);
    onChange(updated);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <b style={{ fontSize: 13 }}>Line Items</b>
        <button type="button" className="btn btn-sm btn-ghost" onClick={addLine}>+ Add Line</button>
      </div>
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <Select value={line.item_id} onChange={(e) => setLine(i, 'item_id', e.target.value)}>
            <option value="">— Item —</option>
            {items.map(it => <option key={it.item_id} value={it.item_id}>{it.item_name}</option>)}
          </Select>
          <Input type="number" step="0.001" placeholder="Qty" value={line.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
          <Input type="number" step="0.01" placeholder="₹ Price" value={line.unit_price} onChange={(e) => setLine(i, 'unit_price', e.target.value)} />
          <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 18 }} onClick={() => removeLine(i)}>×</button>
        </div>
      ))}
      {lines.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: 12 }}>No items added yet. Click "+ Add Line".</p>}
    </div>
  );
}

export default function InvPurchase() {
  const { selectedCompany, showToast, user } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [tab,       setTab]       = useState('po');
  const [pos,       setPos]       = useState([]);
  const [grns,      setGrns]      = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const { nodes } = useInventoryNodes(cid);
  const [modal,     setModal]     = useState(null);
  const [form,      setForm]      = useState(EMPTY_PO);
  const [lines,     setLines]     = useState([]);
  const [editId,    setEditId]    = useState(null);
  const [confirm,   setConfirm]   = useState(null);
  const [saving,    setSaving]    = useState(false);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [p, g, s, i] = await Promise.allSettled([
        invPoAPI.getAll(cid), invGrnAPI.getAll(cid),
        invSupplierAPI.getAll(cid), invItemAPI.getAll(cid),
      ]);
      setPos(p.status === 'fulfilled' ? (p.value || []) : []);
      setGrns(g.status === 'fulfilled' ? (g.value || []) : []);
      setSuppliers(s.status === 'fulfilled' ? (s.value || []) : []);
      setItems(i.status === 'fulfilled' ? (i.value || []) : []);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const calcTotal = (ls) => ls.reduce((sum, l) => sum + (parseFloat(l.qty || 0) * parseFloat(l.unit_price || 0)), 0);

  // ── PO ────────────────────────────────────────────────────
  const openCreatePO = () => {
    const num = `PO-${Date.now().toString().slice(-6)}`;
    setForm({ ...EMPTY_PO, po_number: num }); setLines([]); setEditId(null); setModal('po');
  };
  const openEditPO = (row) => {
    setForm({ ...row, supplier_id: row.supplier_id || '', node_id: row.node_id || '' });
    setLines((row.items || []).map(i => ({ item_id: i.item_id || '', qty: i.ordered_qty, unit_price: i.unit_price })));
    setEditId(row.po_id); setModal('po');
  };
  const handlePoSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        ...form, company_unique_id: cid,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        node_id: form.node_id ? parseInt(form.node_id) : null,
        total_amount: calcTotal(lines),
        created_by: user?.username,
        items: lines.filter(l => l.item_id && l.qty).map(l => ({
          item_id: parseInt(l.item_id), ordered_qty: parseFloat(l.qty), unit_price: parseFloat(l.unit_price || 0),
        })),
      };
      if (editId) { await invPoAPI.update(editId, { ...payload, updated_by: user?.username }); showToast('PO updated!'); }
      else { await invPoAPI.create(payload); showToast('PO created!'); }
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };
  const handlePoDelete = async (id) => {
    try { await invPoAPI.delete(id); showToast('PO deleted'); load(); } catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  // ── GRN ───────────────────────────────────────────────────
  const openCreateGRN = () => {
    const num = `GRN-${Date.now().toString().slice(-6)}`;
    setForm({ ...EMPTY_GRN, grn_number: num }); setLines([]); setEditId(null); setModal('grn');
  };
  const openEditGRN = (row) => {
    setForm({ ...row, supplier_id: row.supplier_id || '', node_id: row.node_id || '', po_id: row.po_id || '' });
    setLines((row.items || []).map(i => ({ item_id: i.item_id || '', qty: i.received_qty, unit_price: i.unit_price })));
    setEditId(row.grn_id); setModal('grn');
  };
  const handleGrnSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        ...form, company_unique_id: cid,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        node_id: form.node_id ? parseInt(form.node_id) : null,
        po_id: form.po_id ? parseInt(form.po_id) : null,
        total_amount: calcTotal(lines),
        created_by: user?.username,
        items: lines.filter(l => l.item_id && l.qty).map(l => ({
          item_id: parseInt(l.item_id), received_qty: parseFloat(l.qty), unit_price: parseFloat(l.unit_price || 0),
        })),
      };
      if (editId) { await invGrnAPI.update(editId, { ...payload, updated_by: user?.username }); showToast('GRN updated!'); }
      else { await invGrnAPI.create(payload); showToast('GRN created!'); }
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };
  const handleGrnPost = async (grn) => {
    if (grn.status === 'posted') { showToast('Already posted', 'error'); return; }
    try { await invGrnAPI.post(grn.grn_id, user?.username); showToast('GRN posted — stock updated! ✅'); load(); }
    catch (err) { showToast(err.message, 'error'); }
  };
  const handleGrnDelete = async (id) => {
    try { await invGrnAPI.delete(id); showToast('GRN deleted'); load(); } catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  const getSupplierName = (id) => suppliers.find(s => s.supplier_id === id)?.supplier_name || '—';
  const getNodeName     = (id) => nodes.find(n => n.node_id === id)?.node_name || '—';
  const getItemName     = (id) => items.find(i => i.item_id === id)?.item_name || id;

  const poCols = [
    { key: 'po_number', label: 'PO #' },
    { key: 'supplier_id', label: 'Supplier', render: (v) => getSupplierName(v) },
    { key: 'node_id', label: 'Deliver To', render: (v) => getNodeName(v) },
    { key: 'po_date', label: 'Date' },
    { key: 'status', label: 'Status', render: (v) => <Badge variant={STATUS_COLOR[v] || 'default'}>{v}</Badge> },
    { key: 'total_amount', label: 'Total', render: (v) => `₹${parseFloat(v || 0).toFixed(2)}` },
  ];

  const grnCols = [
    { key: 'grn_number', label: 'GRN #' },
    { key: 'supplier_id', label: 'Supplier', render: (v) => getSupplierName(v) },
    { key: 'node_id', label: 'Received At', render: (v) => getNodeName(v) },
    { key: 'grn_date', label: 'Date' },
    { key: 'invoice_number', label: 'Invoice #', render: (v) => v || '—' },
    { key: 'status', label: 'Status', render: (v) => <Badge variant={STATUS_COLOR[v] || 'default'}>{v}</Badge> },
    { key: 'total_amount', label: 'Total', render: (v) => `₹${parseFloat(v || 0).toFixed(2)}` },
  ];

  const PoGrnModal = ({ type }) => {
    const isGrn = type === 'grn';
    return (
      <Modal title={editId ? `Edit ${isGrn ? 'GRN' : 'PO'}` : `Create ${isGrn ? 'GRN' : 'Purchase Order'}`} onClose={() => setModal(null)} size="lg">
        <form onSubmit={isGrn ? handleGrnSubmit : handlePoSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <FormField label={isGrn ? 'GRN Number' : 'PO Number'} required>
              <Input value={isGrn ? form.grn_number : form.po_number} onChange={isGrn ? set('grn_number') : set('po_number')} required />
            </FormField>
            <FormField label="Supplier">
              <Select value={form.supplier_id} onChange={set('supplier_id')}>
                <option value="">— None —</option>
                {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
              </Select>
            </FormField>
            <FormField label={isGrn ? 'Receive At Node' : 'Deliver To Node'}>
              <Select value={form.node_id} onChange={set('node_id')}>
                <option value="">— None —</option>
                {nodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_name} ({n.node_type})</option>)}
              </Select>
            </FormField>
            <FormField label={isGrn ? 'GRN Date' : 'PO Date'} required>
              <Input type="date" value={isGrn ? form.grn_date : form.po_date} onChange={isGrn ? set('grn_date') : set('po_date')} required />
            </FormField>
            {isGrn ? (
              <>
                <FormField label="Against PO">
                  <Select value={form.po_id} onChange={set('po_id')}>
                    <option value="">— None —</option>
                    {pos.map(p => <option key={p.po_id} value={p.po_id}>{p.po_number}</option>)}
                  </Select>
                </FormField>
                <FormField label="Invoice #">
                  <Input value={form.invoice_number} onChange={set('invoice_number')} placeholder="Supplier invoice number" />
                </FormField>
              </>
            ) : (
              <FormField label="Expected Delivery">
                <Input type="date" value={form.expected_delivery} onChange={set('expected_delivery')} />
              </FormField>
            )}
            <FormField label="Status">
              <Select value={form.status} onChange={set('status')}>
                {isGrn
                  ? ['draft', 'posted'].map(s => <option key={s} value={s}>{s}</option>)
                  : ['draft', 'sent', 'partially_received', 'received', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)
                }
              </Select>
            </FormField>
          </div>
          <FormField label="Notes"><Textarea value={form.notes} onChange={set('notes')} rows={2} /></FormField>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <ItemLineEditor items={items} lines={lines} onChange={setLines} />
          </div>
          <div style={{ marginTop: 12, textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
            Total: ₹{calcTotal(lines).toFixed(2)}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    );
  };

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader
        title="📥 Stock In / Purchase"
        subtitle="Manage Purchase Orders and Goods Receipt Notes"
        action={
          <button className="btn btn-primary" onClick={tab === 'po' ? openCreatePO : openCreateGRN}>
            + Create {tab === 'po' ? 'PO' : 'GRN'}
          </button>
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[['po', '📋 Purchase Orders'], ['grn', '📦 Goods Receipt (GRN)']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === key ? 700 : 400, fontSize: 13,
            borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
            color: tab === key ? 'var(--primary)' : 'var(--text-3)', marginBottom: -2,
          }}>{label}</button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          {tab === 'po' && (
            <Table columns={poCols} data={pos} actions={(row) => (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => openEditPO(row)}>✏️ Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.po_id, name: row.po_number, type: 'po' })}>🗑️</button>
              </div>
            )} />
          )}
          {tab === 'grn' && (
            <Table columns={grnCols} data={grns} actions={(row) => (
              <div style={{ display: 'flex', gap: 6 }}>
                {row.status !== 'posted' && (
                  <button className="btn btn-sm btn-primary" onClick={() => handleGrnPost(row)}>✅ Post</button>
                )}
                <button className="btn btn-sm btn-ghost" onClick={() => openEditGRN(row)}>✏️</button>
                <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.grn_id, name: row.grn_number, type: 'grn' })}>🗑️</button>
              </div>
            )} />
          )}
        </>
      )}

      {modal === 'po' && <PoGrnModal type="po" />}
      {modal === 'grn' && <PoGrnModal type="grn" />}

      {confirm && (
        <ConfirmDialog
          message={`Delete "${confirm.name}"?`}
          onConfirm={() => confirm.type === 'po' ? handlePoDelete(confirm.id) : handleGrnDelete(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
