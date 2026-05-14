/**
 * InvStockAudit.jsx — Inventory Module 5: Stock Count / Physical Audit
 * Allows staff to do physical count, compare with system qty, post to adjust balance.
 */

import { useEffect, useState } from 'react';
import { invAuditAPI, invItemAPI, invStockAPI } from '../services/api';
import { useInventoryNodes } from './useInventoryNodes';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Select, Textarea, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const today = () => new Date().toISOString().split('T')[0];

export default function InvStockAudit() {
  const { selectedCompany, showToast, user, allCompanies } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [audits,  setAudits]  = useState([]);
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const { nodes } = useInventoryNodes(cid);

  const isAdmin = !!user?.is_admin || !!user?.is_super_admin;
  const myParentId = selectedCompany?.parant_company_unique_id;
  const isChildBranch = !!(myParentId && Number(myParentId) !== 0);
  const visibleNodes = (() => {
    if (isAdmin) return nodes;
    if (isChildBranch) return nodes.filter(n => String(n.node_id).replace('b_','') === String(cid));
    return nodes.filter(n => !String(n.node_id).startsWith('b_') || n.depth === 1 || Number(String(n.node_id).replace('b_','')) === Number(cid));
  })();
  const [modal,   setModal]   = useState(null);  // 'create' | 'view'
  const [viewAudit, setViewAudit] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [saving,  setSaving]  = useState(false);

  // Form state for new audit
  const [auditNode, setAuditNode]   = useState('');
  const [auditDate, setAuditDate]   = useState(today());
  const [auditNotes, setAuditNotes] = useState('');
  const [auditLines, setAuditLines] = useState([]); // { item_id, system_qty, physical_qty, unit_cost }

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [a, i] = await Promise.allSettled([
        invAuditAPI.getAll(cid),
        invItemAPI.getAll(cid),
      ]);
      setAudits(a.status === 'fulfilled' ? (a.value || []) : []);
      setItems(i.status === 'fulfilled' ? (i.value || []) : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const getItemName = (id) => items.find(i => i.item_id === id)?.item_name || '—';
  const getNodeName = (id) => nodes.find(n => n.node_id === id)?.node_name || '—';

  // When node is selected, pre-load ALL items from master + current balance
  const handleNodeSelect = async (nodeId) => {
    setAuditNode(nodeId);
    if (!nodeId) { setAuditLines([]); return; }
    try {
      // Items from root company (master data)
      // Balance scoped to selected node only
      const nodeInt = parseInt(String(nodeId).replace('b_',''));
      const [balance, allItems] = await Promise.all([
        invStockAPI.getBalance(cid, nodeInt),
        invItemAPI.getAll(cid),
      ]);
      const balMap = {};
      // Only include balance rows matching this specific node
      (balance || []).filter(b => String(b.node_id) === String(nodeInt)).forEach(b => {
        balMap[b.item_id] = parseFloat(b.qty_on_hand);
      });

      // Show ALL items — with balance (even negative) or zero if no balance
      const lines = (allItems || []).map(it => {
        const sysQty = balMap[it.item_id] !== undefined ? balMap[it.item_id] : 0;
        return {
          item_id:      it.item_id,
          system_qty:   sysQty.toFixed(3),
          physical_qty: sysQty.toFixed(3),  // default = same as system
          unit_cost:    String(it.standard_cost || '0'),
          notes:        '',
        };
      });
      setAuditLines(lines);
    } catch {
      setAuditLines([]);
    }
  };

  const setLine = (i, k, v) => setAuditLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  const addLine = () => setAuditLines(ls => [...ls, { item_id: '', system_qty: '0', physical_qty: '0', unit_cost: '0', notes: '' }]);

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        company_unique_id: cid,
        node_id: auditNode ? parseInt(auditNode) : null,
        audit_date: auditDate,
        notes: auditNotes,
        status: 'draft',
        created_by: user?.username,
        items: auditLines.filter(l => l.item_id).map(l => ({
          item_id: parseInt(l.item_id),
          system_qty: parseFloat(l.system_qty || 0),
          physical_qty: parseFloat(l.physical_qty || 0),
          unit_cost: parseFloat(l.unit_cost || 0),
          notes: l.notes || '',
        })),
      };
      await invAuditAPI.create(payload);
      showToast('Audit created! Review and post when ready.');
      setModal(null); load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  const handlePost = async (audit) => {
    if (audit.status === 'posted') { showToast('Already posted', 'error'); return; }
    if (!window.confirm('Post this audit? This will adjust stock balances permanently.')) return;
    try {
      await invAuditAPI.post(audit.audit_id, user?.username);
      showToast('Audit posted! Stock balances updated ✅');
      load();
      if (viewAudit?.audit_id === audit.audit_id) {
        const updated = await invAuditAPI.getById(audit.audit_id);
        setViewAudit(updated);
      }
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleDelete = async (id) => {
    try { await invAuditAPI.delete(id); showToast('Audit deleted'); load(); setViewAudit(null); }
    catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  const openView = async (audit) => {
    try {
      const detail = await invAuditAPI.getById(audit.audit_id);
      setViewAudit(detail);
      setModal('view');
    } catch { setViewAudit(audit); setModal('view'); }
  };

  const cols = [
    { key: 'audit_date', label: 'Audit Date' },
    { key: 'node_id', label: 'Node', render: (v) => getNodeName(v) },
    { key: 'status', label: 'Status', render: (v) => <Badge variant={v === 'posted' ? 'success' : 'warning'}>{v}</Badge> },
    { key: 'items', label: 'Items', render: (v) => `${(v || []).length}` },
    { key: 'notes', label: 'Notes', render: (v) => v || '—' },
    { key: 'created_at', label: 'Created', render: (v) => v ? new Date(v).toLocaleDateString('en-IN') : '—' },
  ];

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader
        title="🔍 Stock Count / Audit"
        subtitle="Physical stock count and variance adjustment"
        action={<button className="btn btn-primary" onClick={() => { setAuditNode(''); setAuditDate(today()); setAuditNotes(''); setAuditLines([]); setModal('create'); }}>+ New Audit</button>}
      />

      {loading ? <Spinner /> : (
        <Table columns={cols} data={audits} actions={(row) => (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => openView(row)}>👁️ View</button>
            {row.status !== 'posted' && (
              <button className="btn btn-sm btn-primary" onClick={() => handlePost(row)}>✅ Post</button>
            )}
            {row.status !== 'posted' && (
              <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: row.audit_id, name: `Audit ${row.audit_date}` })}>🗑️</button>
            )}
          </div>
        )} />
      )}

      {/* ── Create Audit Modal ── */}
      {modal === 'create' && (
        <Modal title="New Stock Audit" onClose={() => setModal(null)} size="lg">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <FormField label="Branch / Node" required>
                <Select value={auditNode} onChange={(e) => handleNodeSelect(e.target.value)} required>
                  <option value="">— Select Node —</option>
                  {visibleNodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_label || n.node_name}</option>)}
                </Select>
              </FormField>
              <FormField label="Audit Date" required>
                <Input type="date" value={auditDate} onChange={(e) => setAuditDate(e.target.value)} required />
              </FormField>
            </div>
            <FormField label="Notes">
              <Textarea value={auditNotes} onChange={(e) => setAuditNotes(e.target.value)} rows={2} placeholder="Monthly audit, spot check, etc." />
            </FormField>

            {/* Line Items */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                <b style={{ fontSize: 13 }}>Item Count
                  {auditNode && <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>(pre-filled from system balance)</span>}
                </b>
                <button type="button" className="btn btn-sm btn-ghost" onClick={addLine}>+ Add Row</button>
              </div>

              {/* Header */}
              {auditLines.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr', gap: 8, marginBottom: 4, fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>
                  <span>Item</span><span>System Qty</span><span>Physical Qty</span><span>₹ Cost/Unit</span><span>Variance</span>
                </div>
              )}

              {auditLines.map((line, i) => {
                const sysQty = parseFloat(line.system_qty || 0);
                const physQty = parseFloat(line.physical_qty || 0);
                const variance = physQty - sysQty;
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <Select value={line.item_id} onChange={(e) => setLine(i, 'item_id', e.target.value)}>
                      <option value="">— Item —</option>
                      {items.map(it => <option key={it.item_id} value={it.item_id}>{it.item_name}</option>)}
                    </Select>
                    <Input type="number" step="0.001" value={line.system_qty} onChange={(e) => setLine(i, 'system_qty', e.target.value)} placeholder="0.000" readOnly style={{ background: 'var(--bg)', color: 'var(--text-3)' }} />
                    <Input type="number" step="0.001" value={line.physical_qty} onChange={(e) => setLine(i, 'physical_qty', e.target.value)} placeholder="0.000" />
                    <Input type="number" step="0.01" value={line.unit_cost} onChange={(e) => setLine(i, 'unit_cost', e.target.value)} placeholder="0.00" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontWeight: 700, fontSize: 13,
                        color: variance === 0 ? 'var(--text-3)' : variance > 0 ? 'var(--success)' : 'var(--error)',
                      }}>
                        {variance > 0 ? '+' : ''}{variance.toFixed(3)}
                      </span>
                      <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 16 }} onClick={() => setAuditLines(ls => ls.filter((_, idx) => idx !== i))}>×</button>
                    </div>
                  </div>
                );
              })}
              {auditLines.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: 12 }}>Select a node to auto-load stock, or click "+ Add Row".</p>}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create Audit'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── View Audit Modal ── */}
      {modal === 'view' && viewAudit && (
        <Modal title={`Audit — ${viewAudit.audit_date} · ${getNodeName(viewAudit.node_id)}`} onClose={() => setModal(null)} size="lg">
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <Badge variant={viewAudit.status === 'posted' ? 'success' : 'warning'}>{viewAudit.status}</Badge>
            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Created: {viewAudit.created_at ? new Date(viewAudit.created_at).toLocaleString('en-IN') : '—'}</span>
            {viewAudit.posted_at && <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Posted: {new Date(viewAudit.posted_at).toLocaleString('en-IN')} by {viewAudit.posted_by}</span>}
          </div>

          {/* Summary cards */}
          {(() => {
            const auditItems = viewAudit.items || [];
            const totalVarianceValue = auditItems.reduce((sum, it) => sum + parseFloat(it.variance_value || 0), 0);
            const shortages = auditItems.filter(it => parseFloat(it.variance_qty || 0) < 0).length;
            const excesses  = auditItems.filter(it => parseFloat(it.variance_qty || 0) > 0).length;
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Items Audited', value: auditItems.length, color: 'var(--info)' },
                  { label: 'Shortages', value: shortages, color: 'var(--error)' },
                  { label: 'Excesses', value: excesses, color: 'var(--success)' },
                  { label: 'Variance Value', value: `₹${totalVarianceValue.toFixed(2)}`, color: totalVarianceValue < 0 ? 'var(--error)' : 'var(--success)' },
                ].map(c => (
                  <div key={c.label} style={{ textAlign: 'center', background: 'var(--bg)', padding: '10px', borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: c.color }}>{c.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.label}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Item table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Item', 'System Qty', 'Physical Qty', 'Variance', 'Cost/Unit', 'Variance Value'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(viewAudit.items || []).map((it, i) => {
                  const variance = parseFloat(it.variance_qty || 0);
                  const varColor = variance === 0 ? 'var(--text-3)' : variance > 0 ? 'var(--success)' : 'var(--error)';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '8px 10px' }}>{getItemName(it.item_id)}</td>
                      <td style={{ padding: '8px 10px' }}>{parseFloat(it.system_qty).toFixed(3)}</td>
                      <td style={{ padding: '8px 10px' }}>{parseFloat(it.physical_qty).toFixed(3)}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: varColor }}>{variance > 0 ? '+' : ''}{variance.toFixed(3)}</td>
                      <td style={{ padding: '8px 10px' }}>₹{parseFloat(it.unit_cost || 0).toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: varColor }}>₹{parseFloat(it.variance_value || 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            {viewAudit.status !== 'posted' && (
              <>
                <button className="btn btn-danger" onClick={() => { setModal(null); setConfirm({ id: viewAudit.audit_id, name: `Audit ${viewAudit.audit_date}` }); }}>🗑️ Delete</button>
                <button className="btn btn-primary" onClick={() => handlePost(viewAudit)}>✅ Post Audit</button>
              </>
            )}
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Close</button>
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          message={`Delete "${confirm.name}"? This cannot be undone.`}
          onConfirm={() => handleDelete(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
