/**
 * InvStockTransfer.jsx — Internal Stock Transfer between Nodes
 * WH → Cloud Kitchen → Branch
 * Approval flow: draft → pending_approval → dispatched
 * Nodes loaded dynamically from useInventoryNodes (WH/CK + company branches)
 */

import { useEffect, useState } from 'react';
import { invTransferAPI, invItemAPI } from '../services/api';
import { useInventoryNodes } from './useInventoryNodes';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Select, Textarea, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const today = () => new Date().toISOString().split('T')[0];

const STATUS_COLOR = {
  draft: 'default',
  pending_approval: 'warning',
  approved: 'info',
  dispatched: 'success',
  rejected: 'error',
  received: 'success',
};

const TYPE_ICON = { warehouse: '🏭', cloud_kitchen: '☁️', branch: '🏪' };

const EMPTY = {
  transfer_number: '',
  from_node_id: '',
  to_node_id: '',
  transfer_date: today(),
  status: 'draft',
  notes: '',
};

function TransferLineEditor({ items, lines, onChange, readOnly }) {
  const addLine    = () => onChange([...lines, { item_id: '', qty: '' }]);
  const removeLine = (i) => onChange(lines.filter((_, idx) => idx !== i));
  const setLine    = (i, k, v) => onChange(lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <b style={{ fontSize: 13 }}>Transfer Items</b>
        {!readOnly && <button type="button" className="btn btn-sm btn-ghost" onClick={addLine}>+ Add Item</button>}
      </div>
      {lines.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: 12 }}>No items added yet.</p>}
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 32px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <Select value={line.item_id} onChange={(e) => setLine(i, 'item_id', e.target.value)} disabled={readOnly}>
            <option value="">— Select Item —</option>
            {items.map(it => <option key={it.item_id} value={it.item_id}>{it.item_name}</option>)}
          </Select>
          <Input
            type="number" step="0.001" placeholder="Qty"
            value={line.qty}
            onChange={(e) => setLine(i, 'qty', e.target.value)}
            disabled={readOnly}
          />
          {!readOnly && (
            <button type="button"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 18 }}
              onClick={() => removeLine(i)}>×</button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function InvStockTransfer() {
  const { selectedCompany, showToast, user } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [transfers, setTransfers] = useState([]);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [modal,     setModal]     = useState(null);
  const [form,      setForm]      = useState(EMPTY);
  const [lines,     setLines]     = useState([]);
  const [editId,    setEditId]    = useState(null);
  const [viewTr,    setViewTr]    = useState(null);
  const [confirm,   setConfirm]   = useState(null);
  const [saving,    setSaving]    = useState(false);

  // Dynamic nodes: WH + CK from inv_node + Branches from company table
  const { nodes, getNodeName, getNodeType } = useInventoryNodes(cid);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [tr, it] = await Promise.allSettled([
        invTransferAPI.getAll(cid),
        invItemAPI.getAll(cid),
      ]);
      setTransfers(tr.status === 'fulfilled' ? (tr.value || []) : []);
      setItems(it.status === 'fulfilled' ? (it.value || []) : []);
    } catch { setTransfers([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Get icon for a node by its id
  const getNodeIcon = (nodeId) => {
    const n = nodes.find(n => String(n.node_id) === String(nodeId));
    return TYPE_ICON[n?.node_type] || '📍';
  };

  // Get full display name with icon for table cells
  const getNodeDisplay = (nodeId) => {
    const name = getNodeName(nodeId);
    const icon = getNodeIcon(nodeId);
    return name === '—' ? '—' : `${icon} ${name}`;
  };

  const getItemName = (id) => items.find(i => i.item_id === id)?.item_name || `Item #${id}`;

  const openCreate = () => {
    const num = `TR-${Date.now().toString().slice(-6)}`;
    setForm({ ...EMPTY, transfer_number: num });
    setLines([]); setEditId(null); setModal('create');
  };

  const openEdit = (row) => {
    setForm({
      transfer_number: row.transfer_number,
      from_node_id:    row.from_node_id || '',
      to_node_id:      row.to_node_id   || '',
      transfer_date:   row.transfer_date,
      status:          row.status,
      notes:           row.notes || '',
    });
    setLines((row.items || []).map(i => ({
      item_id: i.item_id || '',
      qty:     i.requested_qty,
    })));
    setEditId(row.transfer_id);
    setModal('edit');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.from_node_id || !form.to_node_id) { showToast('Please select both From and To nodes', 'error'); return; }
    if (String(form.from_node_id) === String(form.to_node_id)) { showToast('From and To nodes must be different', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        company_unique_id: cid,
        transfer_number:   form.transfer_number,
        from_node_id:      parseInt(form.from_node_id),
        to_node_id:        parseInt(form.to_node_id),
        transfer_date:     form.transfer_date,
        status:            form.status,
        notes:             form.notes,
        created_by:        user?.username,
        items: lines.filter(l => l.item_id && l.qty).map(l => ({
          item_id:       parseInt(l.item_id),
          requested_qty: parseFloat(l.qty),
        })),
      };
      if (editId) {
        await invTransferAPI.update(editId, { ...payload, updated_by: user?.username });
        showToast('Transfer updated!');
      } else {
        await invTransferAPI.create(payload);
        showToast('Transfer created!');
      }
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  const handleApprove = async (tr) => {
    try {
      await invTransferAPI.approve(tr.transfer_id, user?.username);
      showToast('Transfer approved — stock moved! ✅');
      load(); setModal(null);
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleDelete = async (id) => {
    try { await invTransferAPI.delete(id); showToast('Transfer deleted'); load(); }
    catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  // Table columns — From/To show icon + name
  const cols = [
    { key: 'transfer_number', label: 'Transfer #' },
    { key: 'from_node_id', label: 'From', render: (v) => (
      <span style={{ fontWeight: 500 }}>{getNodeDisplay(v)}</span>
    )},
    { key: 'to_node_id', label: 'To', render: (v) => (
      <span style={{ fontWeight: 500 }}>{getNodeDisplay(v)}</span>
    )},
    { key: 'transfer_date', label: 'Date' },
    { key: 'items', label: 'Items', render: (v) => `${(v || []).length} line(s)` },
    { key: 'status', label: 'Status', render: (v) => <Badge variant={STATUS_COLOR[v] || 'default'}>{v?.replace('_', ' ')}</Badge> },
  ];

  if (!selectedCompany) return (
    <div className="page">
      <div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div>
    </div>
  );

  return (
    <div className="page">
      <PageHeader
        title="🔄 Stock Transfer"
        subtitle="Transfer stock between Warehouse, Cloud Kitchen and Branches"
        action={<button className="btn btn-primary" onClick={openCreate}>+ New Transfer</button>}
      />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Draft',            status: 'draft',            color: '#6b8f6b' },
          { label: 'Pending Approval', status: 'pending_approval', color: 'var(--warning)' },
          { label: 'Dispatched',       status: 'dispatched',       color: 'var(--primary)' },
          { label: 'Rejected',         status: 'rejected',         color: 'var(--error)' },
        ].map(({ label, status, color }) => {
          const count = transfers.filter(t => t.status === status).length;
          return (
            <div key={status} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color }}>{count}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
            </div>
          );
        })}
      </div>

      {loading ? <Spinner /> : (
        <Table
          columns={cols}
          data={transfers}
          actions={(row) => (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-sm btn-ghost" onClick={() => { setViewTr(row); setModal('view'); }}>👁️ View</button>
              {(row.status === 'draft' || row.status === 'pending_approval') && (
                <button className="btn btn-sm btn-primary" onClick={() => handleApprove(row)}>✅ Approve</button>
              )}
              {row.status === 'draft' && (
                <>
                  <button className="btn btn-sm btn-ghost" onClick={() => openEdit(row)}>✏️</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.transfer_id, name: row.transfer_number })}>🗑️</button>
                </>
              )}
            </div>
          )}
        />
      )}

      {/* ── Create / Edit Modal ── */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal
          title={modal === 'edit' ? 'Edit Transfer' : 'New Stock Transfer'}
          onClose={() => setModal(null)}
          size="lg"
        >
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="Transfer Number" required>
                <Input value={form.transfer_number} onChange={set('transfer_number')} required />
              </FormField>
              <FormField label="Transfer Date" required>
                <Input type="date" value={form.transfer_date} onChange={set('transfer_date')} required />
              </FormField>
              <FormField label="Status">
                <Select value={form.status} onChange={set('status')}>
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Pending Approval</option>
                </Select>
              </FormField>

              {/* From Node — all nodes with icons */}
              <FormField label="From Node (Sender)" required>
                <Select value={form.from_node_id} onChange={set('from_node_id')} required>
                  <option value="">— Select Source —</option>
                  {nodes.map(n => (
                    <option key={n.node_id} value={n.node_id}>
                      {n.node_name}
                    </option>
                  ))}
                </Select>
              </FormField>

              {/* To Node — exclude selected from_node */}
              <FormField label="To Node (Receiver)" required>
                <Select value={form.to_node_id} onChange={set('to_node_id')} required>
                  <option value="">— Select Destination —</option>
                  {nodes
                    .filter(n => String(n.node_id) !== String(form.from_node_id))
                    .map(n => (
                      <option key={n.node_id} value={n.node_id}>
                        {n.node_name}
                      </option>
                    ))
                  }
                </Select>
              </FormField>
            </div>

            {/* Transfer route preview */}
            {form.from_node_id && form.to_node_id && (
              <div style={{ background: 'var(--primary-light)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>{getNodeDisplay(form.from_node_id)}</span>
                <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 18 }}>→</span>
                <span>{getNodeDisplay(form.to_node_id)}</span>
              </div>
            )}

            <FormField label="Notes">
              <Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Reason for transfer..." />
            </FormField>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <TransferLineEditor items={items} lines={lines} onChange={setLines} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editId ? 'Update Transfer' : 'Create Transfer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── View Modal ── */}
      {modal === 'view' && viewTr && (
        <Modal title={`🔄 ${viewTr.transfer_number}`} onClose={() => setModal(null)} size="md">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>FROM</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{getNodeDisplay(viewTr.from_node_id)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>TO</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{getNodeDisplay(viewTr.to_node_id)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>DATE</div>
              <div style={{ fontWeight: 600 }}>{viewTr.transfer_date}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>STATUS</div>
              <Badge variant={STATUS_COLOR[viewTr.status] || 'default'}>{viewTr.status?.replace('_', ' ')}</Badge>
            </div>
            {viewTr.approved_by && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>APPROVED BY</div>
                <div style={{ fontWeight: 600 }}>{viewTr.approved_by}</div>
              </div>
            )}
          </div>

          <b style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Items</b>
          {(viewTr.items || []).map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>{getItemName(it.item_id)}</span>
              <div style={{ display: 'flex', gap: 16, color: 'var(--text-3)' }}>
                <span>Requested: <b style={{ color: 'var(--text)' }}>{parseFloat(it.requested_qty).toFixed(3)}</b></span>
                {it.approved_qty != null && <span>Approved: <b style={{ color: 'var(--primary)' }}>{parseFloat(it.approved_qty).toFixed(3)}</b></span>}
              </div>
            </div>
          ))}

          {viewTr.notes && (
            <p style={{ marginTop: 12, color: 'var(--text-3)', fontSize: 12, fontStyle: 'italic' }}>📝 {viewTr.notes}</p>
          )}

          {(viewTr.status === 'draft' || viewTr.status === 'pending_approval') && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => handleApprove(viewTr)}>
                ✅ Approve & Dispatch
              </button>
            </div>
          )}
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          message={`Delete transfer "${confirm.name}"?`}
          onConfirm={() => handleDelete(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
