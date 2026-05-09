/**
 * InvStockTransfer.jsx — Stock Transfer + Stock Receive
 *
 * FLOW:
 *   Sender  → Create (draft) → Dispatch → stock deducted from from_node
 *   Receiver → Accept → stock added to to_node   (status: received)
 *   Receiver → Reject → stock returned to from_node (status: rejected)
 *
 * TABS:
 *   📤 Outgoing — transfers FROM my company (I am sender)
 *   📥 Incoming — transfers TO my company (I am receiver) — Stock Receive
 *   📋 All      — admin only, sees everything
 *
 * VISIBILITY:
 *   Admin         → All tab + full actions
 *   Sender roles  → Outgoing tab (Create, Dispatch)
 *   Receiver roles → Incoming tab (Accept, Reject)
 */

import { useEffect, useState } from 'react';
import { invTransferAPI, invItemAPI } from '../services/api';
import { useInventoryNodes, nodeIdToInt } from './useInventoryNodes';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Select, Textarea, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const today = () => new Date().toISOString().split('T')[0];

const STATUS_COLOR = {
  draft: 'default', pending_approval: 'warning',
  dispatched: 'info', received: 'success',
  rejected: 'error',
};

const STATUS_LABEL = {
  draft: '📝 Draft', pending_approval: '⏳ Pending',
  dispatched: '🚚 In Transit', received: '✅ Received',
  rejected: '❌ Rejected',
};

// Roles that can DISPATCH (sender side)
const CAN_DISPATCH_ROLES = ['admin', 'restaurant manager', 'inventory manager', 'store manager', 'purchase manager'];
// Roles that can RECEIVE/REJECT (receiver side)
const CAN_RECEIVE_ROLES  = ['admin', 'restaurant manager', 'inventory manager', 'store manager', 'branch manager'];

const EMPTY = {
  transfer_number: '', from_node_id: '', to_node_id: '',
  transfer_date: today(), status: 'draft', notes: '',
};

function LineEditor({ items, lines, onChange, readOnly }) {
  const add    = () => onChange([...lines, { item_id: '', qty: '' }]);
  const remove = (i) => onChange(lines.filter((_, idx) => idx !== i));
  const setL   = (i, k, v) => onChange(lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <b style={{ fontSize: 13 }}>Transfer Items</b>
        {!readOnly && <button type="button" className="btn btn-sm btn-ghost" onClick={add}>+ Add Item</button>}
      </div>
      {lines.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: 12 }}>No items added yet.</p>}
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 32px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <Select value={line.item_id} onChange={(e) => setL(i, 'item_id', e.target.value)} disabled={readOnly}>
            <option value="">— Select Item —</option>
            {items.map(it => <option key={it.item_id} value={it.item_id}>{it.item_name}</option>)}
          </Select>
          <Input type="number" step="0.001" placeholder="Qty" value={line.qty}
            onChange={(e) => setL(i, 'qty', e.target.value)} disabled={readOnly} />
          {!readOnly && (
            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 18 }}
              onClick={() => remove(i)}>×</button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function InvStockTransfer() {
  const { selectedCompany, user } = useApp();
  const [showToast, setShowToast] = useState(null);

  const toast = (msg, type = 'success') => {
    setShowToast({ msg, type });
    setTimeout(() => setShowToast(null), 3000);
  };

  const cid       = selectedCompany?.company_unique_id;
  const isAdmin   = user?.is_admin || user?.is_super_admin;
  const userRole  = (user?.role_name || '').toLowerCase();
  const myNodeId  = cid; // user's company_unique_id IS their node_id for branches

  // Tab: admin sees all 3; others see outgoing + incoming
  const [tab,       setTab]       = useState('outgoing');
  const [outgoing,  setOutgoing]  = useState([]);
  const [incoming,  setIncoming]  = useState([]);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [modal,     setModal]     = useState(null);
  const [viewTr,    setViewTr]    = useState(null);
  const [form,      setForm]      = useState(EMPTY);
  const [lines,     setLines]     = useState([]);
  const [editId,    setEditId]    = useState(null);
  const [confirm,   setConfirm]   = useState(null);
  const [saving,    setSaving]    = useState(false);

  const { nodes, getNodeDisplay } = useInventoryNodes(cid);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [out, inc, it] = await Promise.allSettled([
        invTransferAPI.getAll(cid),          // outgoing: from_node = my company
        invTransferAPI.getIncoming(myNodeId, cid), // incoming: to_node = my company
        invItemAPI.getAll(cid),
      ]);
      setOutgoing(out.status === 'fulfilled' ? (out.value || []) : []);
      setIncoming(inc.status === 'fulfilled' ? (inc.value || []) : []);
      setItems(it.status === 'fulfilled'     ? (it.value  || []) : []);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const getItemName = (id) => items.find(i => i.item_id === id)?.item_name || `Item #${id}`;

  const openCreate = () => {
    setForm({ ...EMPTY, transfer_number: `TR-${Date.now().toString().slice(-6)}` });
    setLines([]); setEditId(null); setModal('form');
  };

  const openEdit = (row) => {
    setForm({
      transfer_number: row.transfer_number,
      from_node_id:    String(row.from_node_id || ''),
      to_node_id:      String(row.to_node_id   || ''),
      transfer_date:   row.transfer_date,
      status:          row.status,
      notes:           row.notes || '',
    });
    setLines((row.items || []).map(i => ({ item_id: String(i.item_id || ''), qty: i.requested_qty })));
    setEditId(row.transfer_id);
    setModal('form');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.from_node_id || !form.to_node_id) { toast('Select both From and To nodes', 'error'); return; }
    if (String(form.from_node_id) === String(form.to_node_id)) { toast('From and To must be different', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        company_unique_id: cid,
        transfer_number:   form.transfer_number,
        from_node_id:      nodeIdToInt(form.from_node_id),
        to_node_id:        nodeIdToInt(form.to_node_id),
        transfer_date:     form.transfer_date,
        status:            'draft',
        notes:             form.notes,
        created_by:        user?.username,
        items: lines.filter(l => l.item_id && l.qty).map(l => ({
          item_id: parseInt(l.item_id), requested_qty: parseFloat(l.qty),
        })),
      };
      if (editId) {
        await invTransferAPI.update(editId, { ...payload, updated_by: user?.username });
        toast('Transfer updated!');
      } else {
        await invTransferAPI.create(payload);
        toast('Transfer created!');
      }
      setModal(null); load();
    } catch (err) { toast(err.message, 'error'); }
    setSaving(false);
  };

  const handleDispatch = async (tr) => {
    if (!window.confirm(`Dispatch ${tr.transfer_number}?\nStock will be deducted from ${getNodeDisplay(tr.from_node_id)} immediately.`)) return;
    try {
      await invTransferAPI.dispatch(tr.transfer_id, user?.username);
      toast('Dispatched! Stock deducted. Waiting for receiver to accept. 🚚');
      load(); setModal(null);
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleReceive = async (tr) => {
    if (!window.confirm(`Accept transfer ${tr.transfer_number}?\nStock will be added to your location.`)) return;
    try {
      await invTransferAPI.receive(tr.transfer_id, user?.username);
      toast('Transfer accepted! Stock added to your location. ✅');
      load(); setModal(null);
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleReject = async (tr) => {
    if (!window.confirm(`Reject transfer ${tr.transfer_number}?\nStock will be returned to sender.`)) return;
    try {
      await invTransferAPI.reject(tr.transfer_id, user?.username);
      toast('Transfer rejected. Stock returned to sender. ❌');
      load(); setModal(null);
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleDelete = async (id) => {
    try { await invTransferAPI.delete(id); toast('Transfer deleted'); load(); }
    catch (err) { toast(err.message, 'error'); }
    setConfirm(null);
  };

  // ── Table columns ──────────────────────────────────────────
  const cols = (showReceiveActions = false) => [
    { key: 'transfer_number', label: 'Transfer #' },
    { key: 'from_node_id', label: 'From', render: (v) => <span style={{ fontWeight: 500 }}>{getNodeDisplay(v)}</span> },
    { key: 'to_node_id',   label: 'To',   render: (v) => <span style={{ fontWeight: 500 }}>{getNodeDisplay(v)}</span> },
    { key: 'transfer_date', label: 'Date' },
    { key: 'items', label: 'Items', render: (v) => `${(v || []).length} line(s)` },
    { key: 'status', label: 'Status', render: (v) => (
      <Badge variant={STATUS_COLOR[v] || 'default'}>{STATUS_LABEL[v] || v}</Badge>
    )},
  ];

  const outgoingActions = (row) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="btn btn-sm btn-ghost" onClick={() => { setViewTr(row); setModal('view'); }}>👁️</button>
      {row.status === 'draft' && (
        <>
          <button className="btn btn-sm btn-primary" onClick={() => handleDispatch(row)}>🚚 Dispatch</button>
          <button className="btn btn-sm btn-ghost" onClick={() => openEdit(row)}>✏️</button>
          <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.transfer_id, name: row.transfer_number })}>🗑️</button>
        </>
      )}
      {row.status === 'rejected' && (
        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(row)}>✏️ Modify</button>
      )}
    </div>
  );

  const incomingActions = (row) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="btn btn-sm btn-ghost" onClick={() => { setViewTr(row); setModal('view'); }}>👁️</button>
      {row.status === 'dispatched' && (
        <>
          <button className="btn btn-sm btn-primary" onClick={() => handleReceive(row)}>✅ Accept</button>
          <button className="btn btn-sm btn-danger" onClick={() => handleReject(row)}>❌ Reject</button>
        </>
      )}
    </div>
  );

  const adminActions = (row) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="btn btn-sm btn-ghost" onClick={() => { setViewTr(row); setModal('view'); }}>👁️</button>
      {row.status === 'draft' && <button className="btn btn-sm btn-primary" onClick={() => handleDispatch(row)}>🚚 Dispatch</button>}
      {row.status === 'dispatched' && (
        <>
          <button className="btn btn-sm btn-primary" onClick={() => handleReceive(row)}>✅ Accept</button>
          <button className="btn btn-sm btn-danger" onClick={() => handleReject(row)}>❌ Reject</button>
        </>
      )}
      {row.status === 'draft' && <button className="btn btn-sm btn-ghost" onClick={() => openEdit(row)}>✏️</button>}
    </div>
  );

  // Counts
  const inTransitCount  = [...outgoing, ...incoming].filter(t => t.status === 'dispatched').length;
  const pendingReceive  = incoming.filter(t => t.status === 'dispatched').length;

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  const allTransfers = isAdmin
    ? [...new Map([...outgoing, ...incoming].map(t => [t.transfer_id, t])).values()]
    : [];

  return (
    <div className="page">
      {/* Toast */}
      {showToast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: showToast.type === 'error' ? 'var(--error)' : 'var(--success)',
          color: '#fff', padding: '12px 20px', borderRadius: 8, fontWeight: 600, fontSize: 13,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>{showToast.msg}</div>
      )}

      <PageHeader
        title="🔄 Stock Transfer"
        subtitle="Transfer stock between Warehouse, Cloud Kitchen and Branches"
        action={<button className="btn btn-primary" onClick={openCreate}>+ New Transfer</button>}
      />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Draft',       count: outgoing.filter(t => t.status === 'draft').length,      color: '#6b8f6b', emoji: '📝' },
          { label: 'In Transit',  count: inTransitCount,                                          color: 'var(--warning)', emoji: '🚚' },
          { label: 'Received',    count: outgoing.filter(t => t.status === 'received').length,    color: 'var(--success)', emoji: '✅' },
          { label: 'Need Action', count: pendingReceive,                                           color: 'var(--error)', emoji: '📥' },
        ].map(({ label, count, color, emoji }) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>{emoji}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color }}>{count}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[
          ['outgoing', `📤 Outgoing (${outgoing.length})`],
          ['incoming', `📥 Incoming${pendingReceive > 0 ? ` ⚠️${pendingReceive}` : ` (${incoming.length})`}`],
          ...(isAdmin ? [['all', '📋 All Transfers']] : []),
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === key ? 700 : 400, fontSize: 13,
            borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
            color: tab === key ? 'var(--primary)' : 'var(--text-3)', marginBottom: -2,
          }}>{label}</button>
        ))}
      </div>

      {/* Incoming alert */}
      {tab === 'incoming' && pendingReceive > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600, color: '#92400e' }}>
          ⚠️ {pendingReceive} transfer(s) waiting for your acceptance. Please Accept or Reject.
        </div>
      )}

      {loading ? <Spinner /> : (
        <>
          {tab === 'outgoing' && (
            <Table columns={cols(false)} data={outgoing} actions={outgoingActions} />
          )}
          {tab === 'incoming' && (
            <Table columns={cols(true)} data={incoming} actions={incomingActions} />
          )}
          {tab === 'all' && isAdmin && (
            <Table columns={cols(false)} data={allTransfers} actions={adminActions} />
          )}
        </>
      )}

      {/* ── Create / Edit Modal ── */}
      {modal === 'form' && (
        <Modal title={editId ? 'Edit Transfer' : 'New Stock Transfer'} onClose={() => setModal(null)} size="lg">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="Transfer Number" required>
                <Input value={form.transfer_number} onChange={set('transfer_number')} required />
              </FormField>
              <FormField label="Transfer Date" required>
                <Input type="date" value={form.transfer_date} onChange={set('transfer_date')} required />
              </FormField>
              <div /> {/* spacer */}

              <FormField label="From Node (Sender)" required>
                <Select value={form.from_node_id} onChange={set('from_node_id')} required>
                  <option value="">— Select Source —</option>
                  {nodes.map(n => (
                    <option key={n.node_id} value={n.node_id}>{n.node_label}</option>
                  ))}
                </Select>
              </FormField>

              <FormField label="To Node (Receiver)" required>
                <Select value={form.to_node_id} onChange={set('to_node_id')} required>
                  <option value="">— Select Destination —</option>
                  {nodes
                    .filter(n => String(n.node_id) !== String(form.from_node_id))
                    .map(n => (
                      <option key={n.node_id} value={n.node_id}>{n.node_label}</option>
                    ))
                  }
                </Select>
              </FormField>
            </div>

            {/* Route preview */}
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
              <LineEditor items={items} lines={lines} onChange={setLines} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editId ? 'Update' : 'Create Transfer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── View Modal ── */}
      {modal === 'view' && viewTr && (
        <Modal title={`🔄 ${viewTr.transfer_number}`} onClose={() => setModal(null)} size="md">
          {/* Status banner */}
          <div style={{
            background: STATUS_COLOR[viewTr.status] === 'success' ? 'var(--success-bg)' : STATUS_COLOR[viewTr.status] === 'error' ? 'var(--error-bg)' : 'var(--info-bg)',
            borderRadius: 8, padding: '10px 16px', marginBottom: 16, textAlign: 'center', fontWeight: 700, fontSize: 15,
          }}>
            {STATUS_LABEL[viewTr.status] || viewTr.status}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              ['FROM',   getNodeDisplay(viewTr.from_node_id)],
              ['TO',     getNodeDisplay(viewTr.to_node_id)],
              ['DATE',   viewTr.transfer_date],
              ['DISPATCHED BY', viewTr.approved_by || '—'],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{val}</div>
              </div>
            ))}
          </div>

          <b style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Items</b>
          {(viewTr.items || []).map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>{getItemName(it.item_id)}</span>
              <div style={{ display: 'flex', gap: 12, color: 'var(--text-3)' }}>
                <span>Requested: <b style={{ color: 'var(--text)' }}>{parseFloat(it.requested_qty || 0).toFixed(3)}</b></span>
                {it.approved_qty  != null && <span>Dispatched: <b style={{ color: 'var(--warning)' }}>{parseFloat(it.approved_qty).toFixed(3)}</b></span>}
                {it.received_qty != null && <span>Received: <b style={{ color: 'var(--success)' }}>{parseFloat(it.received_qty).toFixed(3)}</b></span>}
              </div>
            </div>
          ))}

          {viewTr.notes && <p style={{ marginTop: 12, color: 'var(--text-3)', fontSize: 12, fontStyle: 'italic' }}>📝 {viewTr.notes}</p>}

          {/* Action buttons in view modal */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            {viewTr.status === 'draft' && (
              <button className="btn btn-primary" onClick={() => handleDispatch(viewTr)}>🚚 Dispatch</button>
            )}
            {viewTr.status === 'dispatched' && (
              <>
                <button className="btn btn-primary" onClick={() => handleReceive(viewTr)}>✅ Accept</button>
                <button className="btn btn-danger" onClick={() => handleReject(viewTr)}>❌ Reject</button>
              </>
            )}
          </div>
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
