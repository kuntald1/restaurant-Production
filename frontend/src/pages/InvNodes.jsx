/**
 * InvNodes.jsx — Inventory Node / Location Management
 *
 * Warehouse & Cloud Kitchen → managed here (Add / Edit / Delete)
 * Branches                  → read-only, auto-populated from company table
 *                             shown in parent-child tree format
 */

import { useEffect, useState } from 'react';
import { invNodeAPI, invStockAPI, invItemAPI } from '../services/api';
import { useInventoryNodes, nodeIdToInt } from './useInventoryNodes';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Select, Textarea, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const ALL_TYPES   = ['warehouse', 'cloud_kitchen'];
const TYPE_ICON   = { warehouse: '🏭', cloud_kitchen: '☁️', branch: '🏪' };
const TYPE_COLOR  = { warehouse: 'info', cloud_kitchen: 'warning', branch: 'success' };

const EMPTY = { node_name: '', node_type: 'warehouse', address: '', is_active: true, selected_branch_company_id: '' };

export default function InvNodes() {
  const { selectedCompany, showToast, user } = useApp();
  const cid = selectedCompany?.company_unique_id;

  // WH + CK nodes from inv_node (editable)
  const [whCkNodes,    setWhCkNodes]    = useState([]);
  const [items,        setItems]        = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [modal,        setModal]        = useState(null); // 'form' | 'stock'
  const [form,         setForm]         = useState(EMPTY);
  const [editId,       setEditId]       = useState(null);
  const [confirm,      setConfirm]      = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [stockNode,    setStockNode]    = useState(null);
  const [stockRows,    setStockRows]    = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [tab,          setTab]          = useState('wh'); // 'wh' | 'branches'

  // All nodes including branches from company table
  const { nodes: allNodes, loadingNodes } = useInventoryNodes(cid);

  // Branches (read-only) from company table
  const branchNodes = allNodes.filter(n => n.is_branch);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [n, i] = await Promise.allSettled([
        invNodeAPI.getAll(cid),
        invItemAPI.getAll(cid),
      ]);
      const rawNodes = n.status === 'fulfilled' ? (n.value || []) : [];
      setWhCkNodes(rawNodes.filter(nd => nd.node_type !== 'branch'));
      setItems(i.status === 'fulfilled' ? (i.value || []) : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const openCreate = () => { setForm({ ...EMPTY }); setEditId(null); setModal('form'); };
  const openEdit   = (row) => { setForm({ ...row }); setEditId(row.node_id); setModal('form'); };

  const openStock = async (node) => {
    setStockNode(node); setModal('stock'); setLoadingStock(true);
    try {
      const rows = await invStockAPI.getBalance(cid, nodeIdToInt(node.node_id));
      setStockRows(rows || []);
    } catch { setStockRows([]); }
    setLoadingStock(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        company_unique_id: cid,
        node_name:         form.node_name,
        node_type:         form.node_type,
        address:           form.address || '',
        is_active:         form.is_active,
        created_by:        user?.username,
      };
      if (editId) {
        await invNodeAPI.update(editId, { ...payload, updated_by: user?.username });
        showToast('Node updated!');
      } else {
        await invNodeAPI.create(payload);
        showToast('Node created!');
      }
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try { await invNodeAPI.delete(id); showToast('Node deleted'); load(); }
    catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  const getItemName = (id) => items.find(i => i.item_id === id)?.item_name || `Item #${id}`;

  // Summary counts
  const warehouseCount   = whCkNodes.filter(n => n.node_type === 'warehouse').length;
  const cloudKitchenCount = whCkNodes.filter(n => n.node_type === 'cloud_kitchen').length;
  const branchCount      = branchNodes.length;

  const whCkCols = [
    { key: 'node_name', label: 'Name', render: (v, row) => <span>{TYPE_ICON[row.node_type] || '📍'} {v}</span> },
    { key: 'node_type', label: 'Type', render: (v) => <Badge variant={TYPE_COLOR[v] || 'default'}>{v?.replace('_', ' ')}</Badge> },
    { key: 'address',   label: 'Address', render: (v) => v ? (v.length > 40 ? v.slice(0, 40) + '…' : v) : '—' },
    { key: 'is_active', label: 'Status', render: (v) => <Badge variant={v ? 'success' : 'error'}>{v ? 'Active' : 'Inactive'}</Badge> },
  ];

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader
        title="🗺️ Nodes / Locations"
        subtitle="Manage warehouses and cloud kitchens. Branches are auto-populated from your company setup."
        action={
          tab === 'wh'
            ? <button className="btn btn-primary" onClick={openCreate}>+ Add Node</button>
            : null
        }
      />

      {/* Summary cards */}
      {!loading && !loadingNodes && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { icon: '🏭', label: 'Warehouses',     count: warehouseCount,    color: 'var(--info)' },
            { icon: '☁️', label: 'Cloud Kitchens', count: cloudKitchenCount, color: 'var(--warning)' },
            { icon: '🏪', label: 'Branches',        count: branchCount,       color: 'var(--success)' },
          ].map(({ icon, label, count, color }) => (
            <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontWeight: 700, fontSize: 24, color }}>{count}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[['wh', '🏭 Warehouse & Cloud Kitchen'], ['branches', '🏪 Branches']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === key ? 700 : 400, fontSize: 13,
            borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
            color: tab === key ? 'var(--primary)' : 'var(--text-3)', marginBottom: -2,
          }}>{label}</button>
        ))}
      </div>

      {/* ── Tab: Warehouse & Cloud Kitchen ── */}
      {tab === 'wh' && (
        loading ? <Spinner /> : (
          <Table columns={whCkCols} data={whCkNodes} actions={(row) => (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => openStock(row)}>📦 Stock</button>
              <button className="btn btn-sm btn-ghost" onClick={() => openEdit(row)}>✏️</button>
              <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.node_id, name: row.node_name })}>🗑️</button>
            </div>
          )} />
        )
      )}

      {/* ── Tab: Branches (read-only from company table) ── */}
      {tab === 'branches' && (
        loadingNodes ? <Spinner /> : (
          <div>
            <div style={{ background: 'var(--info-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: 'var(--text-2)' }}>
              ℹ️ Branches are automatically loaded from your company setup. To add or remove branches, update the Company Management section.
            </div>

            {branchNodes.length === 0
              ? <div className="empty-state"><div className="empty-icon">🏪</div><h3>No branches found</h3><p>Child companies will appear here automatically.</p></div>
              : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>
                    <span>Branch Name</span>
                    <span>Type</span>
                    <span>Actions</span>
                  </div>
                  {branchNodes.map((node) => (
                    <div key={node.node_id} style={{
                      display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12,
                      padding: '12px 16px', borderBottom: '1px solid var(--border)',
                      paddingLeft: node.depth === 2 ? 40 : 16,
                      background: node.depth === 2 ? 'var(--bg)' : 'var(--surface)',
                    }}>
                      <span style={{ fontWeight: node.depth === 1 ? 600 : 400, fontSize: 13 }}>
                        {node.node_name}
                      </span>
                      <span><Badge variant="success">Branch</Badge></span>
                      <span>
                        <button className="btn btn-sm btn-ghost" onClick={() => openStock({ node_id: node.node_id, node_name: node.node_name.replace(/^[🏭☁️🏪📍\u3000\u21b3]\s*/g, '') })}>
                          📦 Stock
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        )
      )}

      {/* ── Add/Edit Node Modal ── */}
      {modal === 'form' && (
        <Modal title={editId ? 'Edit Node' : 'Add Node'} onClose={() => setModal(null)} size="md">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

              {/* Type selector — always shown */}
              <FormField label="Type" required>
                <Select value={form.node_type} onChange={(e) => setForm(f => ({ ...f, node_type: e.target.value, node_name: '', selected_branch_company_id: '' }))}>
                  {ALL_TYPES.map(t => (
                    <option key={t} value={t}>{TYPE_ICON[t]} {t.replace('_', ' ')}</option>
                  ))}
                </Select>
              </FormField>

              {/* Status */}
              <FormField label="Status">
                <Select value={form.is_active ? 'true' : 'false'} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </Select>
              </FormField>
            </div>

            {/* Branch type → show company dropdown instead of text input */}
            {form.node_type === 'branch' ? (
              <FormField label="Select Branch (from Company)" required>
                <Select
                  value={form.selected_branch_company_id}
                  onChange={(e) => {
                    const selected = branchNodes.find(n => String(n.node_id) === e.target.value);
                    setForm(f => ({
                      ...f,
                      selected_branch_company_id: e.target.value,
                      node_name: selected ? selected.node_name.replace(/^[🏭☁️🏪📍　↳]\s*/g, '').trim() : '',
                    }));
                  }}
                  required
                >
                  <option value="">— Select Branch —</option>
                  {branchNodes.map(n => (
                    <option key={n.node_id} value={n.node_id}>{n.node_name}</option>
                  ))}
                </Select>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  Branches are loaded from your Company Management setup.
                </p>
              </FormField>
            ) : (
              /* WH / CK → show text input */
              <FormField label="Node Name" required>
                <Input
                  value={form.node_name}
                  onChange={set('node_name')}
                  required
                  placeholder={form.node_type === 'warehouse' ? 'e.g. Main Warehouse' : 'e.g. Central Cloud Kitchen'}
                />
              </FormField>
            )}

            {form.node_type !== 'branch' && (
              <FormField label="Address">
                <Textarea value={form.address} onChange={set('address')} rows={2} placeholder="Physical address" />
              </FormField>
            )}

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
                  <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-3)' }}>{stockRows.length} item(s) in stock</div>
                  {stockRows.map(row => {
                    const item = items.find(i => i.item_id === row.item_id);
                    const isLow = item && parseFloat(row.qty_on_hand) <= parseFloat(item.reorder_level || 0);
                    return (
                      <div key={row.balance_id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 0', borderBottom: '1px solid var(--border)',
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
          message={`Delete node "${confirm.name}"?`}
          onConfirm={() => handleDelete(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
