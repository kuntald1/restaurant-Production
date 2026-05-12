/**
 * InvPurchase.jsx — Stock In / Purchase Management
 * Features:
 *   - PO cannot be created without line items
 *   - GRN cannot be created without line items or 0 amount
 *   - When Against PO selected → auto-populate GRN lines from PO
 *   - PO PDF generation + download link in list
 *   - WhatsApp PO to supplier via existing Twilio integration
 *   - PO PDF preview when selecting Against PO in GRN
 *   - GRN line items show PO qty (read-only) + editable received qty
 */

import { useEffect, useState } from 'react';
import { invPoAPI, invGrnAPI, invSupplierAPI, invItemAPI, smsSettingsAPI } from '../services/api';
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
  invoice_number: '', invoice_date: null, status: 'draft', notes: '', total_amount: 0,
};

const STATUS_COLOR = {
  draft: 'default', sent: 'info', partially_received: 'warning',
  received: 'success', cancelled: 'error', posted: 'success',
};

// ── Generate PO PDF as HTML ───────────────────────────────────
function generatePoHtml(po, supplier, items, nodeLabel, companyName) {
  const rows = (po.items || []).map(it => {
    const item = items.find(i => i.item_id === it.item_id);
    const total = (parseFloat(it.ordered_qty || 0) * parseFloat(it.unit_price || 0)).toFixed(2);
    return `<tr>
      <td>${item?.item_name || it.item_id}</td>
      <td style="text-align:center">${parseFloat(it.ordered_qty || 0).toFixed(3)}</td>
      <td style="text-align:right">₹${parseFloat(it.unit_price || 0).toFixed(2)}</td>
      <td style="text-align:right">₹${total}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 13px; color: #333; padding: 32px; }
    h1 { font-size: 22px; color: #1a7a4a; margin: 0; }
    .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .company { font-size: 12px; color: #666; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .meta-box { background: #f9f9f9; padding: 12px; border-radius: 6px; }
    .meta-box label { font-size: 11px; color: #888; text-transform: uppercase; }
    .meta-box p { margin: 4px 0 0; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { background: #1a7a4a; color: #fff; padding: 8px 12px; text-align: left; font-size: 12px; }
    td { padding: 8px 12px; border-bottom: 1px solid #eee; }
    .total-row { background: #f0fdf4; font-weight: 700; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; }
  </style></head><body>
  <div class="header">
    <div><h1>Purchase Order</h1><div class="company">${companyName}</div></div>
    <div style="text-align:right">
      <div style="font-size:20px;font-weight:700;color:#1a7a4a">${po.po_number}</div>
      <div style="font-size:12px;color:#888">Date: ${po.po_date}</div>
    </div>
  </div>
  <div class="meta">
    <div class="meta-box">
      <label>Supplier</label>
      <p>${supplier?.supplier_name || '—'}</p>
      <p style="font-weight:400;font-size:12px">${supplier?.phone || ''}</p>
      <p style="font-weight:400;font-size:12px">GSTIN: ${supplier?.gstin || '—'}</p>
    </div>
    <div class="meta-box">
      <label>Deliver To</label><p>${nodeLabel}</p>
      <label style="margin-top:8px;display:block">Expected Delivery</label>
      <p>${po.expected_delivery || '—'}</p>
      <label style="margin-top:8px;display:block">Payment Terms</label>
      <p>${supplier?.payment_terms || '—'}</p>
    </div>
  </div>
  <table>
    <thead><tr>
      <th>Item</th><th style="text-align:center">Qty</th>
      <th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="3" style="text-align:right">Grand Total</td>
      <td style="text-align:right">₹${parseFloat(po.total_amount || 0).toFixed(2)}</td>
    </tr></tfoot>
  </table>
  ${po.notes ? `<p style="margin-top:16px;font-size:12px;color:#666">📝 Notes: ${po.notes}</p>` : ''}
  <div class="footer">This is a computer generated Purchase Order — ${companyName}</div>
  </body></html>`;
}

function printPo(html) {
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.print(); };
}

// ── GRN Line Editor with PO reference ────────────────────────
function GrnLineEditor({ items, lines, onChange, poLines }) {
  const addLine = () => onChange([...lines, { item_id: '', po_qty: 0, po_price: 0, qty: '', unit_price: '' }]);
  const removeLine = (i) => onChange(lines.filter((_, idx) => idx !== i));
  const setLine = (i, k, v) => onChange(lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const hasPo = poLines && poLines.length > 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <b style={{ fontSize: 13 }}>Line Items {hasPo && <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>— PO qty shown for reference</span>}</b>
        {!hasPo && <button type="button" className="btn btn-sm btn-ghost" onClick={addLine}>+ Add Line</button>}
      </div>

      {hasPo && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 0.8fr 0.8fr 32px', gap: 6, marginBottom: 6, padding: '4px 0' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>ITEM</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>PO QTY</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>PO PRICE</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>RECV QTY ✏️</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>RECV PRICE ✏️</span>
          <span />
        </div>
      )}

      {lines.map((line, i) => {
        const isFullyReceived = hasPo && line.fully_received;
        return (
        <div key={i} style={{
          display: 'grid',
          gridTemplateColumns: hasPo ? '2fr 0.8fr 0.8fr 0.8fr 0.8fr 32px' : '2fr 1fr 1fr 32px',
          gap: 6, marginBottom: 8, alignItems: 'center',
          background: isFullyReceived ? '#f0f0f0' : hasPo ? 'var(--bg)' : 'none',
          padding: hasPo ? '8px 10px' : 0,
          borderRadius: hasPo ? 6 : 0,
          border: hasPo ? `1px solid ${isFullyReceived ? '#ccc' : 'var(--border)'}` : 'none',
          opacity: isFullyReceived ? 0.6 : 1,
        }}>
          {hasPo ? (
            <span style={{ fontSize: 13, fontWeight: 500, color: isFullyReceived ? '#999' : undefined }}>
              {items.find(it => String(it.item_id) === String(line.item_id))?.item_name || '—'}
              {isFullyReceived && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>✅ Fully received</span>}
              {!isFullyReceived && hasPo && line.remaining !== undefined && (
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-3)' }}>
                  Remaining: <b style={{ color: line.remaining > 0 ? 'var(--warning)' : 'var(--error)' }}>{parseFloat(line.remaining).toFixed(3)}</b>
                </span>
              )}
            </span>
          ) : (
            <Select value={line.item_id} onChange={(e) => setLine(i, 'item_id', e.target.value)}>
              <option value="">— Item —</option>
              {items.map(it => <option key={it.item_id} value={it.item_id}>{it.item_name}</option>)}
            </Select>
          )}

          {hasPo && (
            <>
              <span style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
                {parseFloat(line.po_qty || 0).toFixed(3)}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'right' }}>
                ₹{parseFloat(line.po_price || 0).toFixed(2)}
              </span>
            </>
          )}

          <Input
            type="number" step="0.001" placeholder="Recv Qty"
            value={line.qty}
            onChange={(e) => {
              const val = e.target.value;
              if (hasPo && line.remaining !== undefined && parseFloat(val) > line.remaining) return; // block exceed
              setLine(i, 'qty', val);
            }}
            disabled={isFullyReceived}
            style={{ borderColor: isFullyReceived ? '#ccc' : hasPo && parseFloat(line.qty) > line.remaining ? 'var(--error)' : hasPo ? 'var(--primary)' : undefined }}
          />
          <Input
            type="number" step="0.01" placeholder="₹ Price"
            value={line.unit_price}
            onChange={(e) => setLine(i, 'unit_price', e.target.value)}
            disabled={isFullyReceived}
            style={{ borderColor: isFullyReceived ? '#ccc' : hasPo ? 'var(--primary)' : undefined }}
          />
          <button type="button"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 18 }}
            onClick={() => removeLine(i)}>×</button>
        </div>
        );
      })}

      {/* No extra lines allowed against a PO — only receive PO items */}
      {lines.length === 0 && !hasPo && (
        <p style={{ color: 'var(--text-3)', fontSize: 12 }}>No items added yet. Click "+ Add Line".</p>
      )}
    </div>
  );
}

// ── PO Line Editor ────────────────────────────────────────────
function PoLineEditor({ items, lines, onChange }) {
  const addLine = () => onChange([...lines, { item_id: '', qty: '', unit_price: '' }]);
  const removeLine = (i) => onChange(lines.filter((_, idx) => idx !== i));
  const setLine = (i, k, v) => onChange(lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

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
          <Input type="number" step="0.001" placeholder="Qty" value={line.qty}
            onChange={(e) => setLine(i, 'qty', e.target.value)} />
          <Input type="number" step="0.01" placeholder="₹ Price" value={line.unit_price}
            onChange={(e) => setLine(i, 'unit_price', e.target.value)} />
          <button type="button"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 18 }}
            onClick={() => removeLine(i)}>×</button>
        </div>
      ))}
      {lines.length === 0 && (
        <p style={{ color: 'var(--error)', fontSize: 12, fontWeight: 600 }}>⚠️ At least one line item is required.</p>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function InvPurchase() {
  const { selectedCompany, showToast, user, allCompanies } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [tab,         setTab]         = useState('po');
  const [pos,         setPos]         = useState([]);
  const [grns,        setGrns]        = useState([]);
  const [suppliers,   setSuppliers]   = useState([]);
  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [modal,       setModal]       = useState(null);
  const [form,        setForm]        = useState(EMPTY_PO);
  const [lines,       setLines]       = useState([]);
  const [editId,      setEditId]      = useState(null);
  const [confirm,     setConfirm]     = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [waModal,     setWaModal]     = useState(null); // WhatsApp modal
  const [waSending,   setWaSending]   = useState(false);
  const [selectedPo,  setSelectedPo]  = useState(null); // PO selected in GRN form

  const { nodes } = useInventoryNodes(cid, selectedCompany, allCompanies);

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
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const calcTotal = (ls) => ls.reduce((sum, l) => sum + (parseFloat(l.qty || 0) * parseFloat(l.unit_price || 0)), 0);

  const getSupplierName = (id) => suppliers.find(s => s.supplier_id === id)?.supplier_name || '—';
  const getNodeName = (id) => { const n = nodes.find(n => String(n.node_id) === String(id)); return n ? n.node_label : '—'; };
  const getItemName = (id) => items.find(i => i.item_id === id)?.item_name || id;

  // ── PO ───────────────────────────────────────────────────────
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
    e.preventDefault();
    if (lines.length === 0) { showToast('Add at least one line item to the PO', 'error'); return; }
    const validLines = lines.filter(l => l.item_id && l.qty);
    if (validLines.length === 0) { showToast('Select item and quantity for all lines', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form, company_unique_id: cid,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        node_id: form.node_id ? parseInt(form.node_id) : null,
        total_amount: calcTotal(lines),
        created_by: user?.username,
        items: validLines.map(l => ({
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
    try { await invPoAPI.delete(id); showToast('PO deleted'); load(); }
    catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  // ── PO PDF ───────────────────────────────────────────────────
  const handlePoPdf = (po) => {
    const supplier = suppliers.find(s => s.supplier_id === po.supplier_id);
    const nodeLabel = getNodeName(po.node_id);
    const html = generatePoHtml(po, supplier, items, nodeLabel, selectedCompany?.name || '');
    printPo(html);
  };

  // ── WhatsApp PO to Supplier ──────────────────────────────────
  const handlePoWhatsApp = (po) => {
    const supplier = suppliers.find(s => s.supplier_id === po.supplier_id);
    if (!supplier?.phone) { showToast('Supplier phone number not set', 'error'); return; }
    setWaModal({ type: 'po', po, supplier });
  };

  const sendPoWhatsApp = async () => {
    if (!waModal) return;
    setWaSending(true);
    const { supplier } = waModal;
    let message = '';

    if (waModal.type === 'grn') {
      const { grn } = waModal;
      const nodeLabel = getNodeName(grn.node_id);
      const itemsList = (grn.items || []).map(it => {
        const item = items.find(i => i.item_id === it.item_id);
        return `• ${item?.item_name || 'Item'}: ${parseFloat(it.received_qty).toFixed(3)} @ ₹${parseFloat(it.unit_price).toFixed(2)}`;
      }).join('\n');
      message = `*GRN Receipt: ${grn.grn_number}*\nFrom: ${selectedCompany?.name}\nDate: ${grn.grn_date}\nReceived At: ${nodeLabel}\nInvoice#: ${grn.invoice_number || '—'}\n\n*Items Received:*\n${itemsList}\n\n*Total: ₹${parseFloat(grn.total_amount || 0).toFixed(2)}*\n\nThank you for the delivery.`;
    } else {
      const { po } = waModal;
      const nodeLabel = getNodeName(po.node_id);
      const itemsList = (po.items || []).map(it => {
        const item = items.find(i => i.item_id === it.item_id);
        return `• ${item?.item_name || 'Item'}: ${parseFloat(it.ordered_qty).toFixed(3)} @ ₹${parseFloat(it.unit_price).toFixed(2)}`;
      }).join('\n');
      message = `*Purchase Order: ${po.po_number}*\nFrom: ${selectedCompany?.name}\nDate: ${po.po_date}\nDeliver To: ${nodeLabel}\nExpected: ${po.expected_delivery || 'TBD'}\n\n*Items:*\n${itemsList}\n\n*Total: ₹${parseFloat(po.total_amount || 0).toFixed(2)}*\n\nPlease confirm receipt of this PO.`;
    }

    try {
      await smsSettingsAPI.sendWhatsApp({
        company_id:   cid,
        to_phone:     waModal.supplier.phone,
        message,
        message_type: 'bill',
        sent_by:      user?.user_id || user?.id || null,
      });

      if (waModal.type === 'grn') {
        showToast(`GRN receipt sent to ${waModal.supplier.supplier_name} via WhatsApp ✅`);
      } else {
        showToast(`PO sent to ${waModal.supplier.supplier_name} via WhatsApp ✅`);
        // Auto-update PO status to "sent"
        try {
          const po = waModal.po;
          await invPoAPI.update(po.po_id, {
            po_number:        po.po_number,
            supplier_id:      po.supplier_id,
            node_id:          po.node_id,
            po_date:          po.po_date,
            expected_delivery: po.expected_delivery,
            status:           'sent',
            notes:            po.notes,
            total_amount:     po.total_amount,
            company_unique_id: cid,
            updated_by:       user?.username,
            items:            (po.items || []).map(i => ({
              item_id:     i.item_id,
              ordered_qty: i.ordered_qty,
              unit_price:  i.unit_price,
            })),
          });
          load();
        } catch (updateErr) {
          console.error('PO status update failed:', updateErr);
        }
      }
      setWaModal(null);
    } catch (err) {
      showToast(err.message || 'WhatsApp send failed', 'error');
    }
    setWaSending(false);
  };

  // ── GRN ──────────────────────────────────────────────────────
  const openCreateGRN = () => {
    const num = `GRN-${Date.now().toString().slice(-6)}`;
    setForm({ ...EMPTY_GRN, grn_number: num });
    setLines([]); setSelectedPo(null); setEditId(null); setModal('grn');
  };

  const openEditGRN = (row) => {
    setForm({ ...row, supplier_id: row.supplier_id || '', node_id: row.node_id || '', po_id: row.po_id || '' });
    setLines((row.items || []).map(i => ({ item_id: i.item_id || '', qty: i.received_qty, unit_price: i.unit_price, po_qty: 0, po_price: 0 })));
    setSelectedPo(null); setEditId(row.grn_id); setModal('grn');
  };

  // When Against PO changes — auto-populate GRN lines from PO items
  // Subtracts already-received quantities from previous posted GRNs
  const handlePoSelect = async (poId) => {
    setForm(f => ({ ...f, po_id: poId }));
    if (!poId) { setLines([]); setSelectedPo(null); return; }
    const po = pos.find(p => String(p.po_id) === String(poId));
    if (!po) { setSelectedPo(null); return; }
    setSelectedPo(po);
    setForm(f => ({
      ...f,
      po_id:       poId,
      supplier_id: po.supplier_id || f.supplier_id,
      node_id:     po.node_id     || f.node_id,
    }));

    // Calculate already-received qty per item from posted GRNs
    const alreadyReceived = {}; // item_id → total received qty
    const postedGrns = grns.filter(g =>
      String(g.po_id) === String(poId) && g.status === 'posted'
    );
    for (const pg of postedGrns) {
      try {
        const fullGrn = await invGrnAPI.getById(pg.grn_id);
        (fullGrn.items || []).forEach(it => {
          alreadyReceived[it.item_id] = (alreadyReceived[it.item_id] || 0) + parseFloat(it.received_qty || 0);
        });
      } catch {}
    }

    // Build lines with remaining qty
    const newLines = (po.items || []).map(it => {
      const ordered   = parseFloat(it.ordered_qty || 0);
      const received  = alreadyReceived[it.item_id] || 0;
      const remaining = Math.max(0, ordered - received);
      return {
        item_id:    it.item_id,
        po_qty:     ordered,
        po_price:   it.unit_price,
        qty:        remaining,
        unit_price: it.unit_price,
        remaining,
        fully_received: remaining <= 0,
      };
    });

    setLines(newLines);
  };

  const handleGrnSubmit = async (e) => {
    e.preventDefault();
    if (lines.length === 0) { showToast('Add at least one line item to the GRN', 'error'); return; }
    const validLines = lines.filter(l => l.item_id && l.qty && parseFloat(l.qty) > 0 && !l.fully_received);
    if (validLines.length === 0) { showToast('Enter received quantity for all items', 'error'); return; }
    const total = calcTotal(lines);
    if (total <= 0) { showToast('GRN total cannot be zero', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        company_unique_id: cid,
        supplier_id:   form.supplier_id ? parseInt(form.supplier_id) : null,
        node_id:       form.node_id ? parseInt(form.node_id) : null,
        po_id:         form.po_id ? parseInt(form.po_id) : null,
        total_amount:  total,
        invoice_date:  form.invoice_date || null,
        invoice_number: form.invoice_number || null,
        created_by:    user?.username,
        items: validLines.map(l => ({
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
    try {
      await invGrnAPI.post(grn.grn_id, user?.username);
      showToast('GRN posted — stock updated! ✅');
      load();
      // Auto-send WhatsApp receipt to supplier
      const supplier = suppliers.find(s => s.supplier_id === grn.supplier_id);
      if (supplier?.phone) {
        try {
          const fullGrn = await invGrnAPI.getById(grn.grn_id);
          const grnToSend = fullGrn || { ...grn, items: [] };
          const nodeLabel = getNodeName(grnToSend.node_id);
          const itemsList = (grnToSend.items || []).map(it => {
            const item = items.find(i => i.item_id === it.item_id);
            return `• ${item?.item_name || 'Item'}: ${parseFloat(it.received_qty || 0).toFixed(3)} @ ₹${parseFloat(it.unit_price || 0).toFixed(2)}`;
          }).join('\n');
          const message = `*GRN Receipt: ${grnToSend.grn_number}*\nFrom: ${selectedCompany?.name}\nDate: ${grnToSend.grn_date}\nReceived At: ${nodeLabel}\nInvoice#: ${grnToSend.invoice_number || '—'}\n\n*Items Received:*\n${itemsList}\n\n*Total: ₹${parseFloat(grnToSend.total_amount || 0).toFixed(2)}*\n\nThank you for the delivery.`;
          await smsSettingsAPI.sendWhatsApp({
            company_id:   cid,
            to_phone:     supplier.phone,
            message,
            message_type: 'bill',
            sent_by:      user?.user_id || user?.id || null,
          });
          showToast(`GRN receipt sent to ${supplier.supplier_name} via WhatsApp 📱`);
        } catch (waErr) {
          console.warn('WhatsApp send failed:', waErr);
          // Don't block — GRN post was successful
        }
      }
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleGrnDelete = async (id) => {
    try { await invGrnAPI.delete(id); showToast('GRN deleted'); load(); }
    catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  // ── Table columns ────────────────────────────────────────────
  const poCols = [
    { key: 'po_number', label: 'PO #' },
    { key: 'supplier_id', label: 'Supplier', render: (v) => getSupplierName(v) },
    { key: 'node_id', label: 'Deliver To', render: (v) => getNodeName(v) },
    { key: 'po_date', label: 'Date' },
    { key: 'status', label: 'Status', render: (v) => <Badge variant={STATUS_COLOR[v] || 'default'}>{v}</Badge> },
    { key: 'total_amount', label: 'Total', render: (v) => `₹${parseFloat(v || 0).toFixed(2)}` },
  ];

  const grnCols = [
    { key: 'grn_number',    label: 'GRN #' },
    { key: 'po_id',         label: 'PO #', render: (v) => v ? (pos.find(p => p.po_id === v)?.po_number || `PO#${v}`) : '—' },
    { key: 'supplier_id',   label: 'Supplier', render: (v) => getSupplierName(v) },
    { key: 'node_id',       label: 'Received At', render: (v) => getNodeName(v) },
    { key: 'grn_date',      label: 'Date' },
    { key: 'invoice_number', label: 'Invoice #', render: (v) => v || '—' },
    { key: 'status',        label: 'Status', render: (v) => <Badge variant={STATUS_COLOR[v] || 'default'}>{v}</Badge> },
    { key: 'total_amount',  label: 'Total', render: (v) => `₹${parseFloat(v || 0).toFixed(2)}` },
  ];

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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[
          { key: 'po',  label: '📋 Purchase Orders',    badge: pos.filter(p => p.status === 'draft').length },
          { key: 'grn', label: '📦 Goods Receipt (GRN)', badge: grns.filter(g => g.status === 'draft').length },
        ].map(({ key, label, badge }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === key ? 700 : 400, fontSize: 13,
            borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
            color: tab === key ? 'var(--primary)' : 'var(--text-3)', marginBottom: -2,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {label}
            {badge > 0 && (
              <span style={{
                background: 'var(--error)', color: '#fff',
                borderRadius: 99, fontSize: 10, fontWeight: 700,
                padding: '1px 6px', minWidth: 18, textAlign: 'center',
              }}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          {tab === 'po' && (
            <Table columns={poCols} data={pos} actions={(row) => (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-sm btn-ghost" title="Print PDF" onClick={() => handlePoPdf(row)}>🖨️ PDF</button>
                <button className="btn btn-sm btn-ghost" title="Send WhatsApp" onClick={() => handlePoWhatsApp(row)}>📱 WA</button>
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

      {/* ── PO Modal ── */}
      {modal === 'po' && (
        <Modal title={editId ? 'Edit Purchase Order' : 'Create Purchase Order'} onClose={() => setModal(null)} size="lg">
          <form onSubmit={handlePoSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="PO Number" required>
                <Input value={form.po_number} onChange={set('po_number')} required />
              </FormField>
              <FormField label="Supplier">
                <Select value={form.supplier_id} onChange={set('supplier_id')}>
                  <option value="">— None —</option>
                  {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
                </Select>
              </FormField>
              <FormField label="Deliver To Node">
                <Select value={form.node_id} onChange={set('node_id')}>
                  <option value="">— None —</option>
                  {nodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_label}</option>)}
                </Select>
              </FormField>
              <FormField label="PO Date" required>
                <Input type="date" value={form.po_date} onChange={set('po_date')} required />
              </FormField>
              <FormField label="Expected Delivery">
                <Input type="date" value={form.expected_delivery} onChange={set('expected_delivery')} />
              </FormField>
              <FormField label="Status">
                <Select value={form.status} onChange={set('status')}>
                  {['draft', 'sent', 'partially_received', 'received', 'cancelled'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField label="Notes">
              <Textarea value={form.notes} onChange={set('notes')} rows={2} />
            </FormField>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <PoLineEditor items={items} lines={lines} onChange={setLines} />
            </div>
            <div style={{ marginTop: 12, textAlign: 'right', fontWeight: 700, color: 'var(--primary)', fontSize: 15 }}>
              Total: ₹{calcTotal(lines).toFixed(2)}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create PO'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── GRN Modal ── */}
      {modal === 'grn' && (
        <Modal title={editId ? 'Edit GRN' : 'Create GRN'} onClose={() => { setModal(null); setSelectedPo(null); }} size="xl">
          <form onSubmit={handleGrnSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="GRN Number" required>
                <Input value={form.grn_number} onChange={set('grn_number')} required />
              </FormField>
              <FormField label="Supplier">
                <Select value={form.supplier_id} onChange={set('supplier_id')}>
                  <option value="">— None —</option>
                  {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
                </Select>
              </FormField>
              <FormField label="Receive At Node">
                <Select value={form.node_id} onChange={set('node_id')}>
                  <option value="">— None —</option>
                  {nodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_label}</option>)}
                </Select>
              </FormField>
              <FormField label="GRN Date" required>
                <Input type="date" value={form.grn_date} onChange={set('grn_date')} required />
              </FormField>
              <FormField label="Against PO">
                <Select value={form.po_id} onChange={(e) => handlePoSelect(e.target.value)}>
                  <option value="">— None —</option>
                  {pos
                    .filter(p => p.status !== 'draft')
                    .map(p => (
                      <option key={p.po_id} value={p.po_id}>
                        {p.po_number} — {getSupplierName(p.supplier_id)} ({p.status})
                      </option>
                    ))
                  }
                </Select>
              </FormField>
              <FormField label="Invoice #">
                <Input value={form.invoice_number} onChange={set('invoice_number')} placeholder="Supplier invoice number" />
              </FormField>
              <FormField label="Status">
                <Select value={form.status} onChange={set('status')}>
                  {['draft', 'posted'].map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </FormField>
            </div>

            {/* PO reference info panel */}
            {selectedPo && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <b>📋 {selectedPo.po_number}</b> — {getSupplierName(selectedPo.supplier_id)}
                    <span style={{ marginLeft: 12, color: 'var(--text-3)' }}>Date: {selectedPo.po_date}</span>
                    <span style={{ marginLeft: 12, color: 'var(--text-3)' }}>PO Total: ₹{parseFloat(selectedPo.total_amount || 0).toFixed(2)}</span>
                  </div>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => handlePoPdf(selectedPo)}>
                    🖨️ View PO PDF
                  </button>
                </div>
              </div>
            )}

            <FormField label="Notes">
              <Textarea value={form.notes} onChange={set('notes')} rows={2} />
            </FormField>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <GrnLineEditor
                items={items}
                lines={lines}
                onChange={setLines}
                poLines={selectedPo ? selectedPo.items : null}
              />
            </div>

            <div style={{ marginTop: 12, textAlign: 'right', fontWeight: 700, color: 'var(--primary)', fontSize: 15 }}>
              GRN Total: ₹{calcTotal(lines).toFixed(2)}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setModal(null); setSelectedPo(null); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create GRN'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── WhatsApp Modal ── */}
      {waModal && (
        <Modal title={waModal.type === "grn" ? "📱 Send GRN Receipt via WhatsApp" : "📱 Send PO via WhatsApp"} onClose={() => setWaModal(null)} size="md">
          <div style={{ marginBottom: 16 }}>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                <b>Supplier:</b> {waModal.supplier.supplier_name}
              </div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                <b>Phone:</b> {waModal.supplier.phone}
              </div>
              <div style={{ fontSize: 13 }}>
                <b>PO:</b> {waModal.po.po_number} — ₹{parseFloat(waModal.po.total_amount || 0).toFixed(2)}
              </div>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 12, fontSize: 12, color: '#166534' }}>
              ✅ A WhatsApp message with PO details will be sent to the supplier's registered number via Twilio.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setWaModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={sendPoWhatsApp} disabled={waSending}>
              {waSending ? 'Sending…' : '📱 Send WhatsApp'}
            </button>
          </div>
        </Modal>
      )}

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
