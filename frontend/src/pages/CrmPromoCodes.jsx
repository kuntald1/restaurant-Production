import { useEffect, useState } from 'react';
import { crmPromoAPI } from '../services/api';
import { useApp } from '../context/useApp';
import { PageHeader, Spinner, Table, Modal, FormField, Input, Select, Badge, ConfirmDialog } from '../components/UI';

const EMPTY = { code:'', description:'', discount_type:'percent', discount_value:'', min_bill_amount:'', max_discount:'', valid_from:'', valid_till:'', max_uses:'', trigger_type:'manual', is_active:true };

const TRIGGERS = [
  { value:'manual',       label:'Manual — staff applies code' },
  { value:'birthday',     label:'🎂 Birthday — auto-send on birthday' },
  { value:'anniversary',  label:'💍 Anniversary — auto-send on anniversary' },
  { value:'milestone',    label:'🏆 Milestone — after ₹X total spend' },
  { value:'return_visit', label:'🔄 Return — not visited in 30 days' },
  { value:'bill_amount',  label:'💰 Bill Amount — bill above threshold' },
];

export default function CrmPromoCodes() {
  const { selectedCompany, showToast } = useApp();
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal,   setModal]   = useState(null);
  const [form,    setForm]    = useState(EMPTY);
  const [editId,  setEditId]  = useState(null);
  const [saving,  setSaving]  = useState(false);

  const cid = selectedCompany?.company_unique_id;

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try { setData(await crmPromoAPI.getAll(cid)); } catch { setData([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [cid]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const genCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    setForm(f => ({ ...f, code: Array.from({length:8}, () => chars[Math.floor(Math.random()*chars.length)]).join('') }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, discount_value: parseFloat(form.discount_value), code: form.code.toUpperCase() };
      if (!payload.min_bill_amount) payload.min_bill_amount = 0;
      if (!payload.max_discount)    delete payload.max_discount;
      if (!payload.valid_from)      delete payload.valid_from;
      if (!payload.valid_till)      delete payload.valid_till;
      if (!payload.max_uses)        delete payload.max_uses;
      if (modal === 'create') { await crmPromoAPI.create(cid, payload); showToast('Promo code created!'); }
      else                    { await crmPromoAPI.update(editId, payload); showToast('Promo code updated!'); }
      setModal(null); load();
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  const isExpired = p => p.valid_till && new Date(p.valid_till) < new Date();

  const cols = [
    { key:'code',          label:'Code',     render: v => <code style={{fontWeight:700,fontSize:14}}>{v}</code> },
    { key:'description',   label:'Description', render: v => v||'—' },
    { key:'discount_type', label:'Discount',  render: (v,row) => v==='percent' ? `${row.discount_value}%` : `₹${row.discount_value}` },
    { key:'trigger_type',  label:'Trigger',   render: v => TRIGGERS.find(t=>t.value===v)?.label.split('—')[0] || v },
    { key:'valid_till',    label:'Valid Till', render: v => v || '∞' },
    { key:'used_count',    label:'Used' },
    { key:'is_active',     label:'Status',    render: (v,row) => isExpired(row) ? <Badge variant="error">Expired</Badge> : v ? <Badge variant="success">Active</Badge> : <Badge variant="error">Inactive</Badge> },
  ];

  if (!selectedCompany) return <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>;

  return (
    <div className="page">
      <PageHeader title="Promo Codes" subtitle="Create and manage discount codes"
        action={<button className="btn btn-primary" onClick={() => { setForm(EMPTY); setModal('create'); }}>+ New Promo Code</button>} />

      {loading ? <Spinner /> : (
        <Table columns={cols} data={data} actions={row => (
          <div className="action-btns">
            <button className="btn btn-sm btn-outline" onClick={() => { setForm({...row}); setEditId(row.promo_id); setModal('edit'); }}>Edit</button>
          </div>
        )} />
      )}

      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal==='create'?'New Promo Code':'Edit Promo Code'} onClose={() => setModal(null)} size="lg">
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <FormField label="Promo Code" required>
                <div style={{display:'flex',gap:8}}>
                  <Input value={form.code} onChange={set('code')} placeholder="SAVE20" style={{textTransform:'uppercase',flex:1}} required />
                  <button type="button" className="btn btn-outline" onClick={genCode}>🎲 Generate</button>
                </div>
              </FormField>
              <FormField label="Description"><Input value={form.description} onChange={set('description')} placeholder="Get 20% off your order" /></FormField>

              <FormField label="Discount Type">
                <Select value={form.discount_type} onChange={set('discount_type')}>
                  <option value="percent">Percentage (%)</option>
                  <option value="flat">Flat Amount (₹)</option>
                </Select>
              </FormField>
              <FormField label={form.discount_type==='percent'?'Discount %':'Discount ₹'} required>
                <Input type="number" step="0.01" value={form.discount_value} onChange={set('discount_value')} required />
              </FormField>

              <FormField label="Min Bill Amount (₹)">
                <Input type="number" step="0.01" value={form.min_bill_amount} onChange={set('min_bill_amount')} placeholder="0 = no minimum" />
              </FormField>
              {form.discount_type==='percent' && (
                <FormField label="Max Discount Cap (₹)">
                  <Input type="number" step="0.01" value={form.max_discount} onChange={set('max_discount')} placeholder="Leave blank = no cap" />
                </FormField>
              )}

              <FormField label="Valid From"><Input type="date" value={form.valid_from} onChange={set('valid_from')} /></FormField>
              <FormField label="Valid Till"><Input type="date" value={form.valid_till} onChange={set('valid_till')} /></FormField>
              <FormField label="Max Uses (blank = unlimited)"><Input type="number" value={form.max_uses} onChange={set('max_uses')} placeholder="Unlimited" /></FormField>

              <FormField label="Trigger Type" style={{gridColumn:'1 / -1'}}>
                <Select value={form.trigger_type} onChange={set('trigger_type')}>
                  {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
                <div style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>
                  {form.trigger_type==='birthday'     && '📱 WhatsApp sent automatically on customer birthday (requires SMS enabled)'}
                  {form.trigger_type==='anniversary'  && '📱 WhatsApp sent automatically on customer anniversary'}
                  {form.trigger_type==='milestone'    && '📱 Sent when customer reaches spend milestone'}
                  {form.trigger_type==='return_visit' && '📱 Sent to customers who have not visited in 30+ days'}
                  {form.trigger_type==='bill_amount'  && '📱 Sent after bill exceeds minimum amount'}
                  {form.trigger_type==='manual'       && '👤 Staff manually applies at billing'}
                </div>
              </FormField>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving…':'Save Promo Code'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
