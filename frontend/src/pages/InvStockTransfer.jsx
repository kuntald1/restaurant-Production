/**
 * InvStockTransfer.jsx — Stock Transfer + Stock Receive
 * Features:
 *   - Custom confirm modals (no window.confirm)
 *   - Reject with reason textbox
 *   - Cross-company node display (global lookup)
 *   - Available qty shown per item
 *   - Qty validation (cannot exceed available)
 */

import { useEffect, useState } from 'react';
import { invTransferAPI, invItemAPI, invStockAPI, invUomAPI } from '../services/api';
import { useInventoryNodes, nodeIdToInt } from './useInventoryNodes';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Select, Textarea, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const today = () => new Date().toISOString().split('T')[0];

const STATUS_COLOR = {
  draft: 'default', pending_approval: 'warning',
  dispatched: 'info', received: 'success', rejected: 'error',
};
const STATUS_LABEL = {
  draft: '📝 Draft', dispatched: '🚚 In Transit',
  received: '✅ Received', rejected: '❌ Rejected',
};

const EMPTY = { transfer_number: '', from_node_id: '', to_node_id: '', transfer_date: today(), status: 'draft', notes: '' };

// ── Custom Confirm Modal ──────────────────────────────────────
function ConfirmModal({ title, message, detail, onConfirm, onCancel, withReason = false }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 24, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>{title}</h3>
        <p style={{ margin: '0 0 12px', color: 'var(--text-2)', fontSize: 14 }}>{message}</p>
        {detail && (
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
            {detail}
          </div>
        )}
        {withReason && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Reason for rejection <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Enter reason for rejecting this transfer..."
              rows={3}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => onConfirm(reason)}
            disabled={withReason && !reason.trim()}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Line Item Editor ──────────────────────────────────────────
function LineEditor({ items, lines, onChange, stockBalance, uoms }) {
  const add    = () => onChange([...lines, { item_id: '', qty: '' }]);
  const remove = (i) => onChange(lines.filter((_, idx) => idx !== i));
  const setL   = (i, k, v) => onChange(lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  const getAvailable = (itemId) => {
    if (!itemId || !stockBalance?.length) return null;
    const b = stockBalance.find(b => String(b.item_id) === String(itemId));
    return b ? parseFloat(b.qty_on_hand) : 0;
  };

  const getUomSymbol = (itemId) => {
    const item = items.find(i => String(i.item_id) === String(itemId));
    if (!item?.uom_id) return '';
    const uom = uoms.find(u => u.uom_id === item.uom_id);
    return uom?.uom_symbol || uom?.uom_name || '';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <b style={{ fontSize: 13 }}>Transfer Items</b>
        <button type="button" className="btn btn-sm btn-ghost" onClick={add}>+ Add Item</button>
      </div>
      {lines.length === 0 && (
        <p style={{ color: 'var(--error)', fontSize: 12, fontWeight: 600 }}>⚠️ At least one item is required.</p>
      )}
      {lines.map((line, i) => {
        const available = getAvailable(line.item_id);
        const qty       = parseFloat(line.qty) || 0;
        const uom       = getUomSymbol(line.item_id);
        const exceeded  = available !== null && qty > available;
        return (
          <div key={i} style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${exceeded ? 'var(--error)' : 'var(--border)'}`, background: exceeded ? '#fef2f2' : 'var(--bg)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 32px', gap: 8, alignItems: 'center' }}>
              <Select value={line.item_id} onChange={e => setL(i, 'item_id', e.target.value)}>
                <option value="">— Select Item —</option>
                {items.map(it => <option key={it.item_id} value={it.item_id}>{it.item_name}</option>)}
              </Select>
              <Input type="number" step="0.001" min="0.001" placeholder="Qty" value={line.qty}
                onChange={e => setL(i, 'qty', e.target.value)}
                style={{ borderColor: exceeded ? 'var(--error)' : undefined }} />
              <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 18 }} onClick={() => remove(i)}>×</button>
            </div>
            {line.item_id && (
              <div style={{ marginTop: 6, fontSize: 12, display: 'flex', gap: 16 }}>
                {available !== null ? (
                  <span style={{ color: available === 0 ? 'var(--error)' : available < 5 ? 'var(--warning)' : 'var(--success)' }}>
                    📦 Available: <b>{available.toFixed(3)} {uom}</b>
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-3)' }}>📦 Select From Node first</span>
                )}
                {uom && <span style={{ color: 'var(--text-3)' }}>💡 {uom === 'kg' ? '0.500 = 500g' : uom === 'L' ? '0.500 = 500ml' : 'decimals supported'}</span>}
                {exceeded && <span style={{ color: 'var(--error)', fontWeight: 600 }}>❌ Max: {available.toFixed(3)} {uom}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function InvStockTransfer() {
  const { selectedCompany, user, showToast } = useApp();
  const cid     = selectedCompany?.company_unique_id;
  const isAdmin = user?.is_admin || user?.is_super_admin;
  const myNodeId = cid;

  const [tab,         setTab]         = useState('outgoing');
  const [outgoing,    setOutgoing]    = useState([]);
  const [incoming,    setIncoming]    = useState([]);
  const [items,       setItems]       = useState([]);
  const [uoms,        setUoms]        = useState([]);
  const [nodeLookup,  setNodeLookup]  = useState({});  // global {nodeId: "🏭 Name"}
  const [loading,     setLoading]     = useState(false);
  const [modal,       setModal]       = useState(null);
  const [viewTr,      setViewTr]      = useState(null);
  const [form,        setForm]        = useState(EMPTY);
  const [lines,       setLines]       = useState([]);
  const [editId,      setEditId]      = useState(null);
  const [pendingEdit, setPendingEdit] = useState(null);
  const [confirm,     setConfirm]     = useState(null); // {type, tr}
  const [saving,      setSaving]      = useState(false);
  const [stockBalance,setStockBalance]= useState([]);

  const { nodes, getNodeDisplay: _getNodeDisplay } = useInventoryNodes(cid, selectedCompany);

  // Use global lookup for cross-company display (e.g. Alok seeing Main Warehouse)
  const getNodeDisplay = (nodeId) => {
    const local = _getNodeDisplay(nodeId);
    if (local && local !== '—' && !local.startsWith('Node #')) return local;
    return nodeLookup[String(nodeIdToInt(nodeId))] || nodeLookup[String(nodeId)] || (nodeId ? `Node #${nodeId}` : '—');
  };

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [out, inc, it, u, nl] = await Promise.allSettled([
        invTransferAPI.getAll(cid),
        invTransferAPI.getIncoming(myNodeId, cid),
        invItemAPI.getAll(cid),
        invUomAPI.getAll(cid),
        invTransferAPI.getNodeLookup(cid),
      ]);
      setOutgoing(out.status === 'fulfilled' ? (out.value || []) : []);
      setIncoming(inc.status === 'fulfilled' ? (inc.value || []) : []);
      setItems(it.status === 'fulfilled'     ? (it.value  || []) : []);
      setUoms(u.status  === 'fulfilled'      ? (u.value   || []) : []);
      setNodeLookup(nl.status === 'fulfilled' ? (nl.value || {}) : {});
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  // Load stock balance when From Node changes
  useEffect(() => {
    const fromInt = nodeIdToInt(form.from_node_id);
    if (!fromInt || !cid) { setStockBalance([]); return; }
    invStockAPI.getBalance(cid, fromInt)
      .then(rows => setStockBalance(rows || []))
      .catch(() => setStockBalance([]));
  }, [form.from_node_id, cid]);

  // Apply pending edit when nodes load
  useEffect(() => {
    if (pendingEdit && nodes.length > 0) {
      const row = pendingEdit;
      setForm({
        transfer_number: row.transfer_number,
        from_node_id:    toFormNodeId(row.from_node_id),
        to_node_id:      toFormNodeId(row.to_node_id),
        transfer_date:   row.transfer_date,
        status:          row.status,
        notes:           row.notes || '',
      });
      setLines((row.items || []).map(i => ({ item_id: String(i.item_id || ''), qty: i.requested_qty })));
      setEditId(row.transfer_id);
      setModal('form');
      setPendingEdit(null);
    }
  }, [nodes, pendingEdit]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const getItemName = (id) => items.find(i => i.item_id === id)?.item_name || `Item #${id}`;

  const toFormNodeId = (rawId) => {
    if (!rawId) return '';
    const n = nodes.find(nd => {
      const nid = String(nd.node_id);
      const num = nid.startsWith('b_') ? nid.slice(2) : nid;
      return num === String(rawId);
    });
    return n ? String(n.node_id) : String(rawId);
  };

  const openCreate = () => {
    // Auto-select logged-in user's company as From Node
    const myNode = nodes.find(n => String(n.node_id) === `b_${cid}` || n.node_id === cid);
    const defaultFrom = myNode ? String(myNode.node_id) : '';
    setForm({ ...EMPTY, transfer_number: `TR-${Date.now().toString().slice(-6)}`, from_node_id: defaultFrom });
    setLines([]); setEditId(null); setStockBalance([]); setModal('form');
  };

  const openEdit = (row) => {
    if (nodes.length === 0) { setPendingEdit(row); setModal('form'); return; }
    setForm({
      transfer_number: row.transfer_number,
      from_node_id:    toFormNodeId(row.from_node_id),
      to_node_id:      toFormNodeId(row.to_node_id),
      transfer_date:   row.transfer_date,
      status:          row.status,
      notes:           row.notes || '',
    });
    setLines((row.items || []).map(i => ({ item_id: String(i.item_id || ''), qty: i.requested_qty })));
    setEditId(row.transfer_id);
    setModal('form');
  };

  const validateLines = () => {
    if (lines.length === 0) { showToast('Add at least one item', 'error'); return false; }
    for (const line of lines) {
      if (!line.item_id) { showToast('Select item for all lines', 'error'); return false; }
      if (!line.qty || parseFloat(line.qty) <= 0) { showToast('Enter valid qty for all items', 'error'); return false; }
      const bal = stockBalance.find(b => String(b.item_id) === String(line.item_id));
      const available = bal ? parseFloat(bal.qty_on_hand) : 0;
      if (parseFloat(line.qty) > available) {
        showToast(`❌ ${getItemName(parseInt(line.item_id))}: only ${available.toFixed(3)} available`, 'error');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.from_node_id || !form.to_node_id) { showToast('Select both From and To nodes', 'error'); return; }
    if (String(form.from_node_id) === String(form.to_node_id)) { showToast('From and To must be different', 'error'); return; }
    if (!validateLines()) return;
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
      if (editId) { await invTransferAPI.update(editId, { ...payload, updated_by: user?.username }); showToast('Updated!'); }
      else        { await invTransferAPI.create(payload); showToast('Transfer created!'); }
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  const handleDispatch = async (tr, reason) => {
    try {
      await invTransferAPI.dispatch(tr.transfer_id, user?.username);
      showToast('Dispatched! Stock deducted. Waiting for receiver. 🚚');
      setConfirm(null); load();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleReceive = async (tr, reason) => {
    try {
      await invTransferAPI.receive(tr.transfer_id, user?.username);
      showToast('Transfer accepted! Stock added. ✅');
      setConfirm(null); load();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleReject = async (tr, reason) => {
    try {
      await invTransferAPI.reject(tr.transfer_id, `${user?.username}${reason ? `: ${reason}` : ''}`);
      showToast('Transfer rejected. Stock returned. ❌');
      setConfirm(null); load();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleDelete = async (id) => {
    try { await invTransferAPI.delete(id); showToast('Transfer deleted'); load(); }
    catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  const tableCols = [
    { key: 'transfer_number', label: 'Transfer #' },
    { key: 'from_node_id', label: 'From', render: (v) => <span style={{ fontWeight: 500 }}>{getNodeDisplay(v)}</span> },
    { key: 'to_node_id',   label: 'To',   render: (v) => <span style={{ fontWeight: 500 }}>{getNodeDisplay(v)}</span> },
    { key: 'transfer_date', label: 'Date' },
    { key: 'items', label: 'Items', render: (v) => `${(v || []).length} line(s)` },
    { key: 'status', label: 'Status', render: (v) => <Badge variant={STATUS_COLOR[v] || 'default'}>{STATUS_LABEL[v] || v}</Badge> },
  ];

  const outgoingActions = (row) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="btn btn-sm btn-ghost" onClick={() => { setViewTr(row); setModal('view'); }}>👁️</button>
      {row.status === 'draft' && <>
        <button className="btn btn-sm btn-primary" onClick={() => setConfirm({ type: 'dispatch', tr: row })}>🚚 Dispatch</button>
        <button className="btn btn-sm btn-ghost"   onClick={() => openEdit(row)}>✏️</button>
        <button className="btn btn-sm btn-danger"  onClick={() => setConfirm({ type: 'delete', tr: row })}>🗑️</button>
      </>}
      {row.status === 'rejected' && <button className="btn btn-sm btn-ghost" onClick={() => openEdit(row)}>✏️ Modify</button>}
    </div>
  );

  const incomingActions = (row) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="btn btn-sm btn-ghost" onClick={() => { setViewTr(row); setModal('view'); }}>👁️</button>
      {row.status === 'dispatched' && <>
        <button className="btn btn-sm btn-primary" onClick={() => setConfirm({ type: 'receive', tr: row })}>✅ Accept</button>
        <button className="btn btn-sm btn-danger"  onClick={() => setConfirm({ type: 'reject',  tr: row })}>❌ Reject</button>
      </>}
    </div>
  );

  const adminActions = (row) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="btn btn-sm btn-ghost" onClick={() => { setViewTr(row); setModal('view'); }}>👁️</button>
      {row.status === 'draft'      && <button className="btn btn-sm btn-primary" onClick={() => setConfirm({ type: 'dispatch', tr: row })}>🚚 Dispatch</button>}
      {row.status === 'dispatched' && <>
        <button className="btn btn-sm btn-primary" onClick={() => setConfirm({ type: 'receive', tr: row })}>✅ Accept</button>
        <button className="btn btn-sm btn-danger"  onClick={() => setConfirm({ type: 'reject',  tr: row })}>❌ Reject</button>
      </>}
      {row.status === 'draft' && <button className="btn btn-sm btn-ghost" onClick={() => openEdit(row)}>✏️</button>}
    </div>
  );

  const pendingReceive = incoming.filter(t => t.status === 'dispatched').length;
  const allTransfers   = isAdmin
    ? [...new Map([...outgoing, ...incoming].map(t => [t.transfer_id, t])).values()]
    : [];

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader
        title="🔄 Stock Transfer"
        subtitle="Transfer stock between Warehouse, Cloud Kitchen and Branches"
        action={<button className="btn btn-primary" onClick={openCreate}>+ New Transfer</button>}
      />

      {/* Summary cards */}
      {/* Summary — 2 sections: Outgoing (sender view) + Incoming (receiver view) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>

        {/* Outgoing summary */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>📤 Outgoing (Sender)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { label: 'Draft',      count: outgoing.filter(t => t.status === 'draft').length,      color: '#6b8f6b',        emoji: '📝' },
              { label: 'In Transit', count: outgoing.filter(t => t.status === 'dispatched').length,  color: 'var(--warning)', emoji: '🚚' },
              { label: 'Completed',  count: outgoing.filter(t => t.status === 'received').length,    color: 'var(--success)', emoji: '✅' },
            ].map(({ label, count, color, emoji }) => (
              <div key={label} style={{ textAlign: 'center', padding: '8px 4px' }}>
                <div style={{ fontSize: 22, marginBottom: 2 }}>{emoji}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color }}>{count}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Incoming summary */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>📥 Incoming (Receiver)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { label: 'Pending',   count: incoming.filter(t => t.status === 'dispatched').length, color: 'var(--error)',   emoji: '⏳' },
              { label: 'Received',  count: incoming.filter(t => t.status === 'received').length,   color: 'var(--success)', emoji: '✅' },
              { label: 'Rejected',  count: incoming.filter(t => t.status === 'rejected').length,   color: 'var(--error)',   emoji: '❌' },
            ].map(({ label, count, color, emoji }) => (
              <div key={label} style={{ textAlign: 'center', padding: '8px 4px' }}>
                <div style={{ fontSize: 22, marginBottom: 2 }}>{emoji}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color }}>{count}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[
          ['outgoing', `📤 Outgoing (${outgoing.length})`],
          ['incoming', `📥 Incoming${pendingReceive > 0 ? ` ⚠️ ${pendingReceive}` : ` (${incoming.length})`}`],
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

      {pendingReceive > 0 && tab === 'incoming' && (
        <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600, color: '#92400e' }}>
          ⚠️ {pendingReceive} transfer(s) waiting for your acceptance.
        </div>
      )}

      {loading ? <Spinner /> : (
        <>
          {tab === 'outgoing' && <Table columns={tableCols} data={outgoing} actions={outgoingActions} />}
          {tab === 'incoming' && <Table columns={tableCols} data={incoming} actions={incomingActions} />}
          {tab === 'all' && isAdmin && <Table columns={tableCols} data={allTransfers} actions={adminActions} />}
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
              <div />
              {/* From Node — locked to logged-in user's own company/node */}
              <FormField label="From Node (Sender)" required>
                <Select value={form.from_node_id} onChange={(e) => { set('from_node_id')(e); setLines([]); }} required>
                  <option value="">— Select Source —</option>
                  {nodes.filter(n => {
                    // Show only nodes that belong to the logged-in company
                    // Branch users: only their own branch (b_{cid})
                    // Admin/WH users: all nodes
                    if (isAdmin) return true;
                    return String(n.node_id) === `b_${cid}` || n.node_id === cid;
                  }).map(n => <option key={n.node_id} value={n.node_id}>{n.node_label}</option>)}
                </Select>
              </FormField>
              {/* To Node — all nodes except selected From Node */}
              <FormField label="To Node (Receiver)" required>
                <Select value={form.to_node_id} onChange={set('to_node_id')} required>
                  <option value="">— Select Destination —</option>
                  {nodes.filter(n => String(n.node_id) !== String(form.from_node_id))
                    .map(n => <option key={n.node_id} value={n.node_id}>{n.node_label}</option>)}
                </Select>
              </FormField>
            </div>

            {form.from_node_id && form.to_node_id && (
              <div style={{ background: 'var(--primary-light)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>{_getNodeDisplay(form.from_node_id)}</span>
                <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 18 }}>→</span>
                <span>{_getNodeDisplay(form.to_node_id)}</span>
              </div>
            )}

            <FormField label="Notes">
              <Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Reason for transfer..." />
            </FormField>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <LineEditor items={items} lines={lines} onChange={setLines}
                stockBalance={form.from_node_id ? stockBalance : []} uoms={uoms} />
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
          <div style={{
            background: STATUS_COLOR[viewTr.status] === 'success' ? '#f0fdf4' : STATUS_COLOR[viewTr.status] === 'error' ? '#fef2f2' : '#eff6ff',
            borderRadius: 8, padding: '10px 16px', marginBottom: 16, textAlign: 'center', fontWeight: 700, fontSize: 15,
          }}>
            {STATUS_LABEL[viewTr.status] || viewTr.status}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              ['FROM',         getNodeDisplay(viewTr.from_node_id)],
              ['TO',           getNodeDisplay(viewTr.to_node_id)],
              ['DATE',         viewTr.transfer_date],
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
          {/* Actions in view — based on role */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            {viewTr.status === 'draft' && (
              <button className="btn btn-primary" onClick={() => { setModal(null); setConfirm({ type: 'dispatch', tr: viewTr }); }}>🚚 Dispatch</button>
            )}
            {viewTr.status === 'dispatched' && (nodeIdToInt(viewTr.to_node_id) === parseInt(cid) || isAdmin) && <>
              <button className="btn btn-primary" onClick={() => { setModal(null); setConfirm({ type: 'receive', tr: viewTr }); }}>✅ Accept</button>
              <button className="btn btn-danger"  onClick={() => { setModal(null); setConfirm({ type: 'reject',  tr: viewTr }); }}>❌ Reject</button>
            </>}
          </div>
        </Modal>
      )}

      {/* ── Custom Confirm Modals ── */}
      {confirm?.type === 'dispatch' && (
        <ConfirmModal
          title="🚚 Dispatch Transfer"
          message={`Transfer ${confirm.tr.transfer_number}`}
          detail={
            <div>
              <div>From: <b>{getNodeDisplay(confirm.tr.from_node_id)}</b></div>
              <div>To: <b>{getNodeDisplay(confirm.tr.to_node_id)}</b></div>
              <div style={{ marginTop: 8, color: 'var(--warning)', fontSize: 12 }}>
                ⚠️ Stock will be deducted from sender immediately. Receiver must Accept to complete.
              </div>
            </div>
          }
          onConfirm={() => handleDispatch(confirm.tr)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm?.type === 'receive' && (
        <ConfirmModal
          title="✅ Accept Transfer"
          message={`Accept ${confirm.tr.transfer_number}?`}
          detail={
            <div>
              <div>From: <b>{getNodeDisplay(confirm.tr.from_node_id)}</b></div>
              <div>To: <b>{getNodeDisplay(confirm.tr.to_node_id)}</b></div>
              <div style={{ marginTop: 8, color: 'var(--success)', fontSize: 12 }}>
                Stock will be added to your location.
              </div>
            </div>
          }
          onConfirm={() => handleReceive(confirm.tr)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm?.type === 'reject' && (
        <ConfirmModal
          title="❌ Reject Transfer"
          message={`Reject ${confirm.tr.transfer_number}?`}
          detail={
            <div>
              <div>From: <b>{getNodeDisplay(confirm.tr.from_node_id)}</b></div>
              <div style={{ marginTop: 8, color: 'var(--error)', fontSize: 12 }}>
                Stock will be returned to sender.
              </div>
            </div>
          }
          withReason={true}
          onConfirm={(reason) => handleReject(confirm.tr, reason)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm?.type === 'delete' && (
        <ConfirmModal
          title="🗑️ Delete Transfer"
          message={`Delete ${confirm.tr.transfer_number}? This cannot be undone.`}
          onConfirm={() => handleDelete(confirm.tr.transfer_id)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
