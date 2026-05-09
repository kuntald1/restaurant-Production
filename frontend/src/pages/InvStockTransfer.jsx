/**
 * InvStockTransfer.jsx — Stock Transfer + Stock Receive
 * Validations:
 *   1. Cannot create transfer without items
 *   2. Shows available qty for each item at From Node
 *   3. Cannot transfer more than available qty
 *   4. Supports decimals (0.500 = 500 grams)
 *   5. To shows correctly from DB integer IDs
 */

import { useEffect, useState, useCallback } from 'react';
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
  draft: '📝 Draft', pending_approval: '⏳ Pending',
  dispatched: '🚚 In Transit', received: '✅ Received', rejected: '❌ Rejected',
};

const EMPTY = {
  transfer_number: '', from_node_id: '', to_node_id: '',
  transfer_date: today(), status: 'draft', notes: '',
};

function LineEditor({ items, lines, onChange, stockBalance, uoms }) {
  const add    = () => onChange([...lines, { item_id: '', qty: '' }]);
  const remove = (i) => onChange(lines.filter((_, idx) => idx !== i));
  const setL   = (i, k, v) => onChange(lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  const getAvailableQty = (itemId) => {
    if (!itemId || !stockBalance) return null;
    const bal = stockBalance.find(b => String(b.item_id) === String(itemId));
    return bal ? parseFloat(bal.qty_on_hand) : 0;
  };

  const getUomName = (itemId) => {
    const item = items.find(i => String(i.item_id) === String(itemId));
    if (!item || !item.uom_id) return '';
    const uom = uoms.find(u => u.uom_id === item.uom_id);
    return uom ? uom.uom_symbol || uom.uom_name : '';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <b style={{ fontSize: 13 }}>Transfer Items</b>
        <button type="button" className="btn btn-sm btn-ghost" onClick={add}>+ Add Item</button>
      </div>
      {lines.length === 0 && (
        <p style={{ color: 'var(--error)', fontSize: 12, fontWeight: 600 }}>
          ⚠️ At least one item is required.
        </p>
      )}
      {lines.map((line, i) => {
        const available = getAvailableQty(line.item_id);
        const qty       = parseFloat(line.qty) || 0;
        const uomName   = getUomName(line.item_id);
        const exceeded  = available !== null && qty > available;

        return (
          <div key={i} style={{ marginBottom: 10, padding: '10px 12px', background: exceeded ? '#fef2f2' : 'var(--bg)', borderRadius: 8, border: `1px solid ${exceeded ? 'var(--error)' : 'var(--border)'}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 32px', gap: 8, alignItems: 'center' }}>
              <Select value={line.item_id} onChange={(e) => setL(i, 'item_id', e.target.value)}>
                <option value="">— Select Item —</option>
                {items.map(it => <option key={it.item_id} value={it.item_id}>{it.item_name}</option>)}
              </Select>
              <Input
                type="number" step="0.001" min="0.001" placeholder="Qty"
                value={line.qty}
                onChange={(e) => setL(i, 'qty', e.target.value)}
                style={{ borderColor: exceeded ? 'var(--error)' : undefined }}
              />
              <button type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 18 }}
                onClick={() => remove(i)}>×</button>
            </div>

            {/* Available qty info */}
            {line.item_id && (
              <div style={{ marginTop: 6, fontSize: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
                {available !== null ? (
                  <span style={{ color: available === 0 ? 'var(--error)' : available < 5 ? 'var(--warning)' : 'var(--success)' }}>
                    📦 Available: <b>{available.toFixed(3)} {uomName}</b>
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-3)' }}>📦 Select from node to see available qty</span>
                )}
                {uomName && (
                  <span style={{ color: 'var(--text-3)' }}>
                    💡 Tip: Enter {uomName === 'kg' ? '0.500 for 500g' : uomName === 'L' ? '0.500 for 500ml' : 'decimals for fractions'}
                  </span>
                )}
                {exceeded && (
                  <span style={{ color: 'var(--error)', fontWeight: 600 }}>
                    ❌ Exceeds available ({available.toFixed(3)} {uomName})
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function InvStockTransfer() {
  const { selectedCompany, user, showToast } = useApp();
  const cid     = selectedCompany?.company_unique_id;
  const isAdmin = user?.is_admin || user?.is_super_admin;
  const myNodeId = cid;

  const [tab,      setTab]      = useState('outgoing');
  const [outgoing, setOutgoing] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [items,    setItems]    = useState([]);
  const [uoms,     setUoms]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [modal,    setModal]    = useState(null);
  const [viewTr,   setViewTr]   = useState(null);
  const [form,     setForm]     = useState(EMPTY);
  const [lines,    setLines]    = useState([]);
  const [editId,   setEditId]   = useState(null);
  const [confirm,  setConfirm]  = useState(null);
  const [saving,   setSaving]   = useState(false);

  // Stock balance for selected From Node
  const [stockBalance,     setStockBalance]     = useState([]);
  const [loadingBalance,   setLoadingBalance]   = useState(false);

  const { nodes, getNodeDisplay, getNodeName } = useInventoryNodes(cid);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [out, inc, it, u] = await Promise.allSettled([
        invTransferAPI.getAll(cid),
        invTransferAPI.getIncoming(myNodeId, cid),
        invItemAPI.getAll(cid),
        invUomAPI.getAll(cid),
      ]);
      setOutgoing(out.status === 'fulfilled' ? (out.value || []) : []);
      setIncoming(inc.status === 'fulfilled' ? (inc.value || []) : []);
      setItems(it.status === 'fulfilled'     ? (it.value  || []) : []);
      setUoms(u.status  === 'fulfilled'      ? (u.value   || []) : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  // Load stock balance when From Node changes
  useEffect(() => {
    const fromNodeInt = nodeIdToInt(form.from_node_id);
    if (!fromNodeInt || !cid) { setStockBalance([]); return; }
    setLoadingBalance(true);
    invStockAPI.getBalance(cid, fromNodeInt)
      .then(rows => setStockBalance(rows || []))
      .catch(() => setStockBalance([]))
      .finally(() => setLoadingBalance(false));
  }, [form.from_node_id, cid]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const getItemName = (id) => items.find(i => i.item_id === id)?.item_name || `Item #${id}`;

  const openCreate = () => {
    setForm({ ...EMPTY, transfer_number: `TR-${Date.now().toString().slice(-6)}` });
    setLines([]); setEditId(null); setStockBalance([]); setModal('form');
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

  // Validate lines
  const validateLines = () => {
    if (lines.length === 0) { showToast('Add at least one item to transfer', 'error'); return false; }
    for (const line of lines) {
      if (!line.item_id) { showToast('Select an item for all lines', 'error'); return false; }
      if (!line.qty || parseFloat(line.qty) <= 0) { showToast('Enter a valid quantity for all items', 'error'); return false; }
      // Check availability
      const bal = stockBalance.find(b => String(b.item_id) === String(line.item_id));
      const available = bal ? parseFloat(bal.qty_on_hand) : 0;
      if (parseFloat(line.qty) > available) {
        const itemName = getItemName(parseInt(line.item_id));
        showToast(`❌ ${itemName}: requested ${line.qty} but only ${available.toFixed(3)} available`, 'error');
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

  const handleDispatch = async (tr) => {
    if (!window.confirm(`Dispatch ${tr.transfer_number}?\nStock will be deducted from ${getNodeDisplay(tr.from_node_id)} immediately.`)) return;
    try {
      await invTransferAPI.dispatch(tr.transfer_id, user?.username);
      showToast('Dispatched! Stock deducted. Waiting for receiver. 🚚');
      load(); setModal(null);
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleReceive = async (tr) => {
    if (!window.confirm(`Accept transfer ${tr.transfer_number}?\nStock will be added to your location.`)) return;
    try {
      await invTransferAPI.receive(tr.transfer_id, user?.username);
      showToast('Transfer accepted! Stock added. ✅');
      load(); setModal(null);
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleReject = async (tr) => {
    if (!window.confirm(`Reject transfer ${tr.transfer_number}?\nStock will be returned to sender.`)) return;
    try {
      await invTransferAPI.reject(tr.transfer_id, user?.username);
      showToast('Transfer rejected. Stock returned. ❌');
      load(); setModal(null);
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
        <button className="btn btn-sm btn-primary" onClick={() => handleDispatch(row)}>🚚 Dispatch</button>
        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(row)}>✏️</button>
        <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.transfer_id, name: row.transfer_number })}>🗑️</button>
      </>}
      {row.status === 'rejected' && <button className="btn btn-sm btn-ghost" onClick={() => openEdit(row)}>✏️ Modify</button>}
    </div>
  );

  const incomingActions = (row) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="btn btn-sm btn-ghost" onClick={() => { setViewTr(row); setModal('view'); }}>👁️</button>
      {row.status === 'dispatched' && <>
        <button className="btn btn-sm btn-primary" onClick={() => handleReceive(row)}>✅ Accept</button>
        <button className="btn btn-sm btn-danger"  onClick={() => handleReject(row)}>❌ Reject</button>
      </>}
    </div>
  );

  const adminActions = (row) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="btn btn-sm btn-ghost" onClick={() => { setViewTr(row); setModal('view'); }}>👁️</button>
      {row.status === 'draft'      && <button className="btn btn-sm btn-primary" onClick={() => handleDispatch(row)}>🚚 Dispatch</button>}
      {row.status === 'dispatched' && <>
        <button className="btn btn-sm btn-primary" onClick={() => handleReceive(row)}>✅ Accept</button>
        <button className="btn btn-sm btn-danger"  onClick={() => handleReject(row)}>❌ Reject</button>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Draft',       count: outgoing.filter(t => t.status === 'draft').length,     color: '#6b8f6b',        emoji: '📝' },
          { label: 'In Transit',  count: outgoing.filter(t => t.status === 'dispatched').length, color: 'var(--warning)', emoji: '🚚' },
          { label: 'Received',    count: outgoing.filter(t => t.status === 'received').length,   color: 'var(--success)', emoji: '✅' },
          { label: 'Need Action', count: pendingReceive,                                          color: 'var(--error)',   emoji: '📥' },
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

              <FormField label="From Node (Sender)" required>
                <Select value={form.from_node_id} onChange={(e) => { set('from_node_id')(e); setLines([]); }} required>
                  <option value="">— Select Source —</option>
                  {nodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_label}</option>)}
                </Select>
                {loadingBalance && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Loading stock...</span>}
              </FormField>

              <FormField label="To Node (Receiver)" required>
                <Select value={form.to_node_id} onChange={set('to_node_id')} required>
                  <option value="">— Select Destination —</option>
                  {nodes
                    .filter(n => String(n.node_id) !== String(form.from_node_id))
                    .map(n => <option key={n.node_id} value={n.node_id}>{n.node_label}</option>)
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
              <LineEditor
                items={items}
                lines={lines}
                onChange={setLines}
                stockBalance={form.from_node_id ? stockBalance : []}
                uoms={uoms}
              />
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

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            {viewTr.status === 'draft'      && <button className="btn btn-primary" onClick={() => handleDispatch(viewTr)}>🚚 Dispatch</button>}
            {viewTr.status === 'dispatched' && <>
              <button className="btn btn-primary" onClick={() => handleReceive(viewTr)}>✅ Accept</button>
              <button className="btn btn-danger"  onClick={() => handleReject(viewTr)}>❌ Reject</button>
            </>}
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
