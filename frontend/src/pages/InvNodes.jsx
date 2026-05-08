/**
 * InvNodes.jsx — Inventory Node (Location) Management
 * Manages Warehouse, Cloud Kitchen, Branch locations
 * Stock balance can be viewed per node
 */

import { useEffect, useState } from 'react';
import { invNodeAPI, invStockAPI, invItemAPI } from '../services/api';
import { useInventoryNodes } from './useInventoryNodes';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Select, Textarea, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const NODE_TYPES = ['warehouse', 'cloud_kitchen', 'branch'];
const TYPE_ICON  = { warehouse: '🏭', cloud_kitchen: '☁️', branch: '🏪' };
const TYPE_COLOR = { warehouse: 'info', cloud_kitchen: 'warning', branch: 'success' };

const EMPTY = { node_name: '', node_type: 'branch', parent_node_id: '', address: '', is_active: true };

export default function InvNodes() {
  const { selectedCompany, showToast, user } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const { nodes } = useInventoryNodes(cid);
  const [modal,   setModal]   = useState(null); // 'form' | 'stock'
  const [form,    setForm]    = useState(EMPTY);
  const [editId,  setEditId]  = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [stockNode, setStockNode]   = useState(null);
  const [stockRows, setStockRows]   = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [i] = await Promise.allSettled([
        invItemAPI.getAll(cid),
      ]);
      setItems(i.status === 'fulfilled' ? (i.value || []) : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const openCreate = () => { setForm({ ...EMPTY }); setEditId(null); setModal('form'); };
  const openEdit   = (row) => { setForm({ ...row, parent_node_id: row.parent_node_id || '' }); setEditId(row.node_id); setModal('form'); };

  const openStock = async (node) => {
    setStockNode(node); setModal('stock'); setLoadingStock(true);
    try {
      const rows = await invStockAPI.getBalance(cid, node.node_id);
      setStockRows(rows || []);
    } catch { setStockRows([]); }
    setLoadingStock(false);
  };

  const handleSubmit = async (e) => {
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

  const handleDelete = async (id) => {
    try { await invNodeAPI.delete(id); showToast('Node deleted'); load(); } catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  const getItemName    = (id) => items.find(i => i.item_id === id)?.item_name || `Item #${id}`;
  const getParentName  = (id) => nodes.find(n => n.node_id === id)?.node_name || '—';

  const cols = [
    { key: 'node_name', label: 'Node Name', render: (v, row) => <span>{TYPE_ICON[row.node_type] || '📍'} {v}</span> },
    { key: 'node_type', label: 'Type', render: (v) => <Badge variant={TYPE_COLOR[v] || 'default'}>{v?.replace('_', ' ')}</Badge> },
    { key: 'parent_node_id', label: 'Parent Node', render: (v) => v ? getParentName(v) : '—' },
    { key: 'address', label: 'Address', render: (v) => v ? (v.length > 40 ? v.slice(0, 40) + '…' : v) : '—' },
    { key: 'is_active', label: 'Status', render: (v) => <Badge variant={v ? 'success' : 'error'}>{v ? 'Active' : 'Inactive'}</Badge> },
  ];

  // Group nodes by type for the visual overview
  const grouped = NODE_TYPES.reduce((acc, t) => {
    acc[t] = nodes.filter(n => n.node_type === t && n.is_active);
    return acc;
  }, {});

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader
        title="🗺️ Inventory Nodes"
        subtitle="Manage warehouse, cloud kitchen, and branch locations"
        action={<button className="btn btn-primary" onClick={openCreate}>+ Add Node</button>}
      />

      {/* Visual summary cards */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          {NODE_TYPES.map(t => (
            <div key={t} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{TYPE_ICON[t]}</div>
              <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--primary)' }}>{grouped[t]?.length || 0}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'capitalize' }}>{t.replace('_', ' ')}(s)</div>
            </div>
          ))}
        </div>
      )}

      {loading ? <Spinner /> : (
        <Table columns={cols} data={nodes} actions={(row) => (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => openStock(row)}>📦 Stock</button>
            <button className="btn btn-sm btn-ghost" onClick={() => openEdit(row)}>✏️</button>
            <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.node_id, name: row.node_name })}>🗑️</button>
          </div>
        )} />
      )}

      {/* ── Node Form Modal ── */}
      {modal === 'form' && (
        <Modal title={editId ? 'Edit Node' : 'Add Node'} onClose={() => setModal(null)} size="md">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Node Name" required>
                <Input value={form.node_name} onChange={set('node_name')} required placeholder="e.g. Main Warehouse" />
              </FormField>
              <FormField label="Type" required>
                <Select value={form.node_type} onChange={set('node_type')}>
                  {NODE_TYPES.map(t => <option key={t} value={t}>{TYPE_ICON[t]} {t.replace('_', ' ')}</option>)}
                </Select>
              </FormField>
              <FormField label="Parent Node (optional)">
                <Select value={form.parent_node_id} onChange={set('parent_node_id')}>
                  <option value="">— None (top level) —</option>
                  {nodes.filter(n => n.node_id !== editId).map(n => (
                    <option key={n.node_id} value={n.node_id}>{n.node_name}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Status">
                <Select value={form.is_active ? 'true' : 'false'} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </Select>
              </FormField>
            </div>
            <FormField label="Address">
              <Textarea value={form.address} onChange={set('address')} rows={2} placeholder="Physical address of this location" />
            </FormField>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Stock View Modal ── */}
      {modal === 'stock' && stockNode && (
        <Modal title={`📦 Stock at ${stockNode.node_name}`} onClose={() => { setModal(null); setStockNode(null); }} size="md">
          {loadingStock ? <Spinner /> : (
            stockRows.length === 0
              ? <div className="empty-state"><div className="empty-icon">📦</div><h3>No stock recorded yet</h3><p>Post a GRN to this node to see stock.</p></div>
              : (
                <div>
                  <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-3)' }}>
                    {stockRows.length} item(s) in stock
                  </div>
                  {stockRows.map(row => {
                    const item = items.find(i => i.item_id === row.item_id);
                    const isLow = item && row.qty_on_hand <= (item.reorder_level || 0);
                    return (
                      <div key={row.balance_id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 0', borderBottom: '1px solid var(--border)',
                        background: isLow ? 'rgba(220,38,38,0.03)' : 'transparent',
                      }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{getItemName(row.item_id)}</span>
                          {isLow && <Badge variant="error" style={{ marginLeft: 8 }}>⚠️ Low</Badge>}
                        </div>
                        <span style={{ fontWeight: 700, color: isLow ? 'var(--error)' : 'var(--primary)', fontSize: 14 }}>
                          {parseFloat(row.qty_on_hand).toFixed(3)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )
          )}
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          message={`Delete node "${confirm.name}"? This will not delete stock records.`}
          onConfirm={() => handleDelete(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
