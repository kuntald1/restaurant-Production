/**
 * InvTransfer.jsx — Stock Transfer between Nodes + Node Management
 * Stock flows: WH → CK → Branch (any direction, configurable)
 * Approval: draft → pending_approval → approved (stock moves) / rejected
 */

import { useEffect, useState } from 'react';
import { invTransferAPI, invNodeAPI, invItemAPI } from '../services/api';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Select, Textarea, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const today = () => new Date().toISOString().split('T')[0];

const STATUS_COLOR = {
  draft: 'default', pending_approval: 'warning', approved: 'info',
  rejected: 'error', dispatched: 'success', received: 'success',
};

const NODE_TYPES = ['warehouse', 'cloud_kitchen', 'branch'];

const EMPTY_NODE = { node_name: '', node_type: 'branch', parent_node_id: '', address: '', is_active: true };

export default function InvTransfer() {
  const { selectedCompany, showToast, user } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [tab,       setTab]       = useState('transfers');
  const [transfers, setTransfers] = useState([]);
  const [nodes,     setNodes]     = useState([]);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [modal,     setModal]     = useState(null);
  const [form,      setForm]      = useState({});
  const [lines,     setLines]     = useState([]);
  const [editId,    setEditId]    = useState(null);
  const [confirm,   setConfirm]   = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [viewTransfer, setViewTransfer] = useState(null);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [t, n, i] = await Promise.allSettled([
        invTransferAPI.getAll(cid),
        invNodeAPI.getAll(cid),
        invItemAPI.getAll(cid),
      ]);
      setTransfers(t.status === 'fulfilled' ? (t.value || []) : []);
      setNodes(n.status === 'fulfilled' ? (n.value || []) : []);
      setItems(i.status === 'fulfilled' ? (i.value || []) : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const getNodeName = (id) => nodes.find(n => n.node_id === id)?.node_name || '—';
  const getItemName = (id) => items.find(i => i.item_id === id)?.item_name || '—';

  // ── Transfer ──────────────────────────────────────────────
  const openCreateTransfer = () => {
    const num = `TR-${Date.now().toString().slice(-6)}`;
    setForm({ transfer_number: num, from_node_id: '', to_node_id: '', transfer_date: today(), notes: '' });
    setLines([]); setEditId(null); setModal('transfer');
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        ...form, company_unique_id: cid,
        from_node_id: form.from_node_id ? parseInt(form.from_node_id) : null,
        to_node_id: form.to_node_id ? parseInt(form.to_node_id) : null,
        status: 'draft',
        created_by: user?.username,
        items: lines.filter(l => l.item_id && l.qty).map(l => ({
          item_id: parseInt(l.item_id),
          requested_qty: parseFloat(l.qty),
        })),
      };
      if (editId) { await invTransferAPI.update(editId, { ...payload, updated_by: user?.username }); showToast('Transfer updated!'); }
      else { await invTransferAPI.create(payload); showToast('Transfer created!'); }
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  const handleApprove = async (transfer) => {
    if (!window.confirm(`Approve transfer ${transfer.transfer_number}? Stock will move from ${getNodeName(transfer.from_node_id)} to ${getNodeName(transfer.to_node_id)}.`)) return;
    try {
      await invTransferAPI.approve(transfer.transfer_id, user?.username);
      showToast('Transfer approved! Stock moved ✅');
      load();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleReject = async (transfer) => {
    try {
      await invTransferAPI.update(transfer.transfer_id, { status: 'rejected', updated_by: user?.username });
      showToast('Transfer rejected');
      load();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleTransferDelete = async (id) => {
    try { await invTransferAPI.delete(id); showToast('Transfer deleted'); load(); }
    catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  // ── Node ──────────────────────────────────────────────────
  const openCreateNode = () => { setForm({ ...EMPTY_NODE }); setEditId(null); setModal('node'); };
  const openEditNode   = (row) => { setForm({ ...row, parent_node_id: row.parent_node_id || '' }); setEditId(row.node_id); setModal('node'); };

  const handleNodeSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        ...form, company_unique_id: cid,
        parent_node_id: form.parent_node_id ? parseInt(form.parent_node_id) : null,
        created_by: user?.username,
      };
      if (editId) { await invNodeAPI.update(editId, { ...payload, updated_by: user?.username }); showToast('Node updated!'); }
      else { await invNodeAPI.create(payload); showToast('Node created!'); }
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  const handleNodeDelete = async (id) => {
    try { await invNodeAPI.delete(id); showToast('Node deleted'); load(); }
    catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  const NODE_TYPE_ICON = { warehouse: '🏭', cloud_kitchen: '☁️', branch: '🏪' };

  const transferCols = [
    { key: 'transfer_number', label: 'Transfer #' },
    { key: 'from_node_id', label: 'From', render: (v) => getNodeName(v) },
    { key: 'to_node_id',   label: 'To',   render: (v) => getNodeName(v) },
    { key: 'transfer_date', label: 'Date' },
    { key: 'status', label: 'Status', render: (v) => <Badge variant={STATUS_COLOR[v] || 'default'}>{v}</Badge> },
    { key: 'items', label: 'Items', render: (v) => `${(v || []).length} line(s)` },
  ];

  const nodeCols = [
    { key: 'node_name', label: 'Node Name' },
    { key: 'node_type', label: 'Type', render: (v) => <span>{NODE_TYPE_ICON[v] || '📍'} {v}</span> },
    { key: 'parent_node_id', label: 'Parent', render: (v) => v ? getNodeName(v) : '— Root —' },
    { key: 'address', label: 'Address', render: (v) => v || '—' },
    { key: 'is_active', label: 'Status', render: (v) => <Badge variant={v ? 'success' : 'error'}>{v ? 'Active' : 'Inactive'}</Badge> },
  ];

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader
        title="🔄 Stock Transfer & Nodes"
        subtitle="Transfer stock between nodes and manage location hierarchy"
        action={
          tab === 'transfers'
            ? <button className="btn btn-primary" onClick={openCreateTransfer}>+ New Transfer</button>
            : <button className="btn btn-primary" onClick={openCreateNode}>+ Add Node</button>
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[['transfers', '🔄 Transfers'], ['nodes', '📍 Nodes / Locations']].map(([key, label]) => (
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
          {tab === 'transfers' && (
            <Table columns={transferCols} data={transfers} actions={(row) => (
              <div style={{ display: 'flex', gap: 6 }}>
                {row.status === 'draft' && (
                  <>
                    <button className="btn btn-sm btn-primary" onClick={() => handleApprove(row)}>✅ Approve</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleReject(row)}>❌ Reject</button>
                  </>
                )}
                {row.status === 'draft' && <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.transfer_id, name: row.transfer_number, type: 'transfer' })}>🗑️</button>}
              </div>
            )} />
          )}

          {tab === 'nodes' && (
            <>
              {/* Node hierarchy visual */}
              {nodes.filter(n => !n.parent_node_id).map(root => (
                <div key={root.node_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{NODE_TYPE_ICON[root.node_type] || '📍'}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{root.node_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase' }}>{root.node_type}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => openEditNode(root)}>✏️</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: root.node_id, name: root.node_name, type: 'node' })}>🗑️</button>
                    </div>
                  </div>
                  {/* Children */}
                  {nodes.filter(c => c.parent_node_id === root.node_id).map(child => (
                    <div key={child.node_id} style={{ marginLeft: 32, marginTop: 8, padding: '8px 12px', background: 'var(--bg)', borderLeft: '2px solid var(--border)', borderRadius: '0 6px 6px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{NODE_TYPE_ICON[child.node_type] || '📍'}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{child.node_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{child.node_type}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => openEditNode(child)}>✏️</button>
                        <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: child.node_id, name: child.node_name, type: 'node' })}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {nodes.length === 0 && <div className="empty-state"><div className="empty-icon">📍</div><h3>No Nodes Yet</h3><p>Add a Warehouse, Cloud Kitchen, or Branch to get started.</p></div>}
            </>
          )}
        </>
      )}

      {/* ── Transfer Modal ── */}
      {modal === 'transfer' && (
        <Modal title={editId ? 'Edit Transfer' : 'New Stock Transfer'} onClose={() => setModal(null)} size="md">
          <form onSubmit={handleTransferSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="Transfer Number" required>
                <Input value={form.transfer_number} onChange={set('transfer_number')} required />
              </FormField>
              <FormField label="Transfer Date" required>
                <Input type="date" value={form.transfer_date} onChange={set('transfer_date')} required />
              </FormField>
              <FormField label="From Node" required>
                <Select value={form.from_node_id} onChange={set('from_node_id')} required>
                  <option value="">— Select Source —</option>
                  {nodes.map(n => <option key={n.node_id} value={n.node_id}>{NODE_TYPE_ICON[n.node_type]} {n.node_name}</option>)}
                </Select>
              </FormField>
              <FormField label="To Node" required>
                <Select value={form.to_node_id} onChange={set('to_node_id')} required>
                  <option value="">— Select Destination —</option>
                  {nodes.map(n => <option key={n.node_id} value={n.node_id}>{NODE_TYPE_ICON[n.node_type]} {n.node_name}</option>)}
                </Select>
              </FormField>
            </div>
            <FormField label="Notes">
              <Textarea value={form.notes} onChange={set('notes')} rows={2} />
            </FormField>
            {/* Line Items */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>Items to Transfer</b>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLines(ls => [...ls, { item_id: '', qty: '' }])}>+ Add</button>
              </div>
              {lines.map((line, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 32px', gap: 8, marginBottom: 6 }}>
                  <Select value={line.item_id} onChange={(e) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, item_id: e.target.value } : l))}>
                    <option value="">— Item —</option>
                    {items.map(it => <option key={it.item_id} value={it.item_id}>{it.item_name}</option>)}
                  </Select>
                  <Input type="number" step="0.001" placeholder="Qty" value={line.qty} onChange={(e) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, qty: e.target.value } : l))} />
                  <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 18 }} onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
              {lines.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: 12 }}>No items added.</p>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Node Modal ── */}
      {modal === 'node' && (
        <Modal title={editId ? 'Edit Node' : 'Add Location Node'} onClose={() => setModal(null)} size="sm">
          <form onSubmit={handleNodeSubmit}>
            <FormField label="Node Name" required>
              <Input value={form.node_name} onChange={set('node_name')} required placeholder="e.g. Main Warehouse" />
            </FormField>
            <FormField label="Type" required>
              <Select value={form.node_type} onChange={set('node_type')}>
                {NODE_TYPES.map(t => <option key={t} value={t}>{NODE_TYPE_ICON[t]} {t.replace('_', ' ')}</option>)}
              </Select>
            </FormField>
            <FormField label="Parent Node (optional)">
              <Select value={form.parent_node_id} onChange={set('parent_node_id')}>
                <option value="">— None (Root) —</option>
                {nodes.filter(n => n.node_id !== editId).map(n => <option key={n.node_id} value={n.node_id}>{NODE_TYPE_ICON[n.node_type]} {n.node_name}</option>)}
              </Select>
            </FormField>
            <FormField label="Address">
              <Textarea value={form.address} onChange={set('address')} rows={2} placeholder="Full address" />
            </FormField>
            <FormField label="Status">
              <Select value={form.is_active ? 'true' : 'false'} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </FormField>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          message={`Delete "${confirm.name}"?`}
          onConfirm={() => {
            if (confirm.type === 'transfer') handleTransferDelete(confirm.id);
            else if (confirm.type === 'node') handleNodeDelete(confirm.id);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
