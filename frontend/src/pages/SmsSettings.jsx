import { useEffect, useState } from 'react';
import { smsSettingsAPI } from '../services/api';
import { useApp } from '../context/useApp';
import { PageHeader, Spinner, FormField, Input, Select } from '../components/UI';

const DEFAULT = { provider:'twilio', account_sid:'', auth_token:'', from_number:'', whatsapp_enabled:false, sms_enabled:false,
  template_bill:'Dear {name}, your bill at {restaurant} is ₹{amount}. Bill No: {bill_no}. Thank you!',
  template_promo:'Hi {name}! Promo code: {code} for {discount}% off. Valid till {expiry}.',
  template_birthday:'Happy Birthday {name}! 🎂 Enjoy {discount}% off. Code: {code}' };

export default function SmsSettings() {
  const { selectedCompany, showToast, setCompanySettings } = useApp();
  const [settings, setSettings] = useState(DEFAULT);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [apiStatus, setApiStatus] = useState('');

  const cid = selectedCompany?.company_unique_id;

  useEffect(() => {
    if (!cid) { setLoading(false); return; }
    smsSettingsAPI.get(cid).then(d => {
      setSettings({ ...DEFAULT, ...d });
      setApiStatus('api');
    }).catch(() => setApiStatus('local')).finally(() => setLoading(false));
  }, [cid]);

  const set = k => e => setSettings(s => ({ ...s, [k]: e.target.type==='checkbox' ? e.target.checked : e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await smsSettingsAPI.save(cid, settings);
      setCompanySettings(prev => {
        const next = {
          ...prev,
          is_whatsapp_enabled:    settings.whatsapp_enabled,
          is_sms_enabled:         settings.sms_enabled,
          whatsapp_template_bill: settings.template_bill,
          whatsapp_from_number:   settings.from_number,
          whatsapp_account_sid:   settings.account_sid,
        };
        sessionStorage.setItem('rms_company_settings', JSON.stringify(next));
        return next;
      });
      showToast('✅ SMS settings saved!');
    } catch (err) { showToast('Failed to save: ' + err.message, 'error'); }
    setSaving(false);
  };

  if (!selectedCompany) return <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>;
  if (loading) return <Spinner />;

  return (
    <div className="page">
      <PageHeader title="SMS / WhatsApp Settings" subtitle="Configure messaging for bills and promotions" />

      <form onSubmit={handleSave} style={{ maxWidth:700, display:'flex', flexDirection:'column', gap:20 }}>

        {/* Provider card */}
        <div style={S.card}>
          <div style={S.cardHead}>
            <div style={S.cardIcon}>📱</div>
            <div style={{flex:1}}>
              <div style={S.cardTitle}>WhatsApp via Twilio</div>
              <div style={S.cardSub}>Cheapest option — Free 1000 messages trial, then ~₹0.80/message. No monthly fee.</div>
            </div>
          </div>
          <div style={S.cardBody}>
            <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'12px 14px',fontSize:12,color:'#1e40af',marginBottom:4}}>
              <strong>Setup steps:</strong><br/>
              1. Sign up at <a href="https://twilio.com" target="_blank" rel="noreferrer" style={{color:'#1e40af'}}>twilio.com</a> (free)<br/>
              2. Get your Account SID + Auth Token from Console Dashboard<br/>
              3. Enable WhatsApp Sandbox: Messaging → Try WhatsApp → Sandbox<br/>
              4. Sandbox number: <code>+14155238886</code> (test) or buy a number for production<br/>
              5. Each customer must send <code>join &lt;word&gt;</code> to sandbox once (test only)
            </div>
            <div style={S.formGrid}>
              <div style={S.field}>
                <label style={S.label}>Account SID</label>
                <Input value={settings.account_sid} onChange={set('account_sid')} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
              </div>
              <div style={S.field}>
                <label style={S.label}>
                  Auth Token
                  <button type="button" onClick={() => setShowToken(v=>!v)} style={{marginLeft:8,background:'none',border:'none',cursor:'pointer',fontSize:13}}>{showToken?'🙈':'👁️'}</button>
                </label>
                <Input type={showToken?'text':'password'} value={settings.auth_token} onChange={set('auth_token')} placeholder="Your Twilio Auth Token" />
              </div>
              <div style={S.field}>
                <label style={S.label}>From Number (WhatsApp)</label>
                <Input value={settings.from_number} onChange={set('from_number')} placeholder="+14155238886" />
                <span style={S.hint}>Twilio sandbox: +14155238886 · Production: your Twilio WhatsApp number</span>
              </div>
            </div>
          </div>
        </div>

        {/* Enable toggles */}
        <div style={S.card}>
          <div style={S.cardHead}>
            <div style={S.cardIcon}>⚙️</div>
            <div style={{flex:1}}><div style={S.cardTitle}>Enable Messaging</div></div>
          </div>
          <div style={S.cardBody}>
            {[
              {k:'whatsapp_enabled', label:'WhatsApp Messages', sub:'Send bill and promos via WhatsApp'},
              {k:'sms_enabled',      label:'SMS Messages',      sub:'Send plain SMS (requires SMS-capable number)'},
            ].map(({k,label,sub}) => (
              <div key={k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{label}</div>
                  <div style={{fontSize:12,color:'var(--text-3)'}}>{sub}</div>
                </div>
                <label style={S.toggle}>
                  <input type="checkbox" checked={settings[k]} onChange={set(k)} style={{display:'none'}} />
                  <div style={{...S.toggleTrack, background: settings[k]?'var(--primary)':'#d1d5db'}}>
                    <div style={{...S.toggleThumb, transform: settings[k]?'translateX(20px)':'translateX(2px)'}} />
                  </div>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Templates */}
        <div style={S.card}>
          <div style={S.cardHead}>
            <div style={S.cardIcon}>✉️</div>
            <div style={{flex:1}}><div style={S.cardTitle}>Message Templates</div><div style={S.cardSub}>Variables: {'{name}'} {'{restaurant}'} {'{amount}'} {'{bill_no}'} {'{code}'} {'{discount}'} {'{expiry}'}</div></div>
          </div>
          <div style={S.cardBody}>
            {[
              {k:'template_bill',     label:'Bill Receipt Message'},
              {k:'template_promo',    label:'Promo Code Message'},
              {k:'template_birthday', label:'Birthday Greeting'},
            ].map(({k,label}) => (
              <div key={k} style={S.field}>
                <label style={S.label}>{label}</label>
                <textarea value={settings[k]} onChange={set(k)} rows={3}
                  style={{...S.input, resize:'vertical', fontFamily:'inherit'}} />
              </div>
            ))}
          </div>
        </div>

        <div style={{display:'flex',justifyContent:'flex-end'}}>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving…':'💾 Save Settings'}</button>
        </div>
      </form>
    </div>
  );
}

const S = {
  card:        {background:'var(--white)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden'},
  cardHead:    {display:'flex',alignItems:'center',gap:14,padding:'16px 20px'},
  cardIcon:    {fontSize:28,flexShrink:0},
  cardTitle:   {fontSize:15,fontWeight:700,color:'var(--text-1)'},
  cardSub:     {fontSize:12,color:'var(--text-3)',marginTop:2},
  cardBody:    {borderTop:'1px solid var(--border)',padding:'16px 20px',display:'flex',flexDirection:'column',gap:14},
  formGrid:    {display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px 16px'},
  field:       {display:'flex',flexDirection:'column',gap:5},
  label:       {fontSize:12,fontWeight:700,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:'.04em'},
  input:       {padding:'9px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'var(--white)'},
  hint:        {fontSize:11,color:'var(--text-3)'},
  toggle:      {cursor:'pointer',flexShrink:0},
  toggleTrack: {width:44,height:24,borderRadius:12,transition:'background .2s',position:'relative'},
  toggleThumb: {position:'absolute',top:2,width:20,height:20,background:'#fff',borderRadius:'50%',transition:'transform .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'},
};
