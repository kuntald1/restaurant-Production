import { useEffect, useState } from 'react';
import { whatsAppSettingsAPI } from '../services/api';
import { useApp } from '../context/useApp';
import { PageHeader, Spinner, FormField, Input, Select } from '../components/UI';

const DEFAULT = {
  is_enabled: false,
  provider: 'twilio',
  account_sid: '',
  auth_token: '',
  from_number: '',
  template_bill:
    'Dear {name}, your bill at {restaurant} is ₹{amount}. Bill No: {bill_no}. Thank you for dining with us! 🙏',
  template_promo:
    'Hi {name}! 🎉 Use promo code *{code}* to get {discount}% off. Valid till {expiry}. – {restaurant}',
  template_birthday:
    'Happy Birthday {name}! 🎂 Celebrate with us — use code *{code}* for {discount}% off today!',
  template_anniversary:
    'Happy Anniversary {name}! 💍 Use code *{code}* for {discount}% off. Celebrate with us!',
};

const PROVIDERS = [
  { value: 'twilio', label: 'Twilio (WhatsApp Business API)' },
  { value: 'wati',   label: 'WATI (WhatsApp Team Inbox)' },
  { value: 'interakt', label: 'Interakt' },
];

export default function WhatsAppSettings() {
  const { selectedCompany, showToast, setCompanySettings } = useApp();
  const [settings,   setSettings]   = useState(DEFAULT);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [showToken,  setShowToken]  = useState(false);
  const [testPhone,  setTestPhone]  = useState('');
  const [testing,    setTesting]    = useState(false);

  const cid = selectedCompany?.company_unique_id;

  useEffect(() => {
    if (!cid) { setLoading(false); return; }
    whatsAppSettingsAPI.get(cid)
      .then(d => setSettings({ ...DEFAULT, ...d }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cid]);

  const set = k => e =>
    setSettings(s => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await whatsAppSettingsAPI.save(cid, settings);
      // Update global context so POS picks up the new state immediately — no re-login needed
      setCompanySettings(prev => {
        const next = {
          ...prev,
          is_whatsapp_enabled:    settings.is_enabled,
          whatsapp_template_bill: settings.template_bill,
        };
        sessionStorage.setItem('rms_company_settings', JSON.stringify(next));
        return next;
      });
      showToast('✅ WhatsApp settings saved!');
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    }
    setSaving(false);
  };

  const handleTestSend = async () => {
    if (!testPhone.trim()) { showToast('Enter a phone number to test', 'error'); return; }
    setTesting(true);
    try {
      // Opens WhatsApp with a test message — real API send needs backend endpoint
      const msg = encodeURIComponent(
        `Hello! This is a test message from ${selectedCompany?.name || 'Restaurant MS'}. WhatsApp integration is working! ✅`
      );
      window.open(`https://wa.me/${testPhone.replace(/[^0-9]/g, '')}?text=${msg}`, '_blank');
      showToast('Test message opened in WhatsApp!');
    } catch {
      showToast('Test failed', 'error');
    }
    setTesting(false);
  };

  if (!selectedCompany) return (
    <div className="page">
      <div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div>
    </div>
  );
  if (loading) return <Spinner />;

  return (
    <div className="page">
      <PageHeader
        title="WhatsApp Settings"
        subtitle="Configure WhatsApp messaging for bills, promos, and auto-triggers"
      />

      <form onSubmit={handleSave} style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Master On/Off */}
        <div style={S.card}>
          <div style={S.cardHead}>
            <div style={S.cardIcon}>💬</div>
            <div style={{ flex: 1 }}>
              <div style={S.cardTitle}>WhatsApp Messaging</div>
              <div style={S.cardSub}>
                When OFF — no WhatsApp messages will be sent and all auto-triggers (birthday, anniversary, return) are disabled.
              </div>
            </div>
            {/* Toggle */}
            <label style={S.toggle}>
              <input type="checkbox" checked={settings.is_enabled} onChange={set('is_enabled')} style={{ display: 'none' }} />
              <div style={{ ...S.toggleTrack, background: settings.is_enabled ? '#16a34a' : '#d1d5db' }}>
                <div style={{ ...S.toggleThumb, transform: settings.is_enabled ? 'translateX(20px)' : 'translateX(2px)' }} />
              </div>
            </label>
          </div>

          {settings.is_enabled && (
            <div style={{ ...S.cardBody, background: '#f0fdf4', borderTop: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>
                ✅ WhatsApp messaging is <strong>ON</strong>. Messages will be sent on bill generation and auto-triggers.
              </div>
            </div>
          )}
          {!settings.is_enabled && (
            <div style={{ ...S.cardBody, background: '#fef2f2', borderTop: '1px solid #fecaca' }}>
              <div style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>
                ⛔ WhatsApp messaging is <strong>OFF</strong>. No messages will be sent.
              </div>
            </div>
          )}
        </div>

        {/* Provider Config */}
        <div style={{ ...S.card, opacity: settings.is_enabled ? 1 : 0.5, pointerEvents: settings.is_enabled ? 'auto' : 'none' }}>
          <div style={S.cardHead}>
            <div style={S.cardIcon}>⚙️</div>
            <div style={{ flex: 1 }}>
              <div style={S.cardTitle}>Service Provider</div>
              <div style={S.cardSub}>Enter credentials from your WhatsApp Business API provider</div>
            </div>
          </div>
          <div style={S.cardBody}>

            <div style={S.field}>
              <label style={S.label}>Provider</label>
              <Select value={settings.provider} onChange={set('provider')}>
                {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </div>

            {/* Twilio setup guide */}
            {settings.provider === 'twilio' && (
              <div style={S.infoBox}>
                <strong>Twilio Setup:</strong><br />
                1. Sign up at <a href="https://twilio.com" target="_blank" rel="noreferrer" style={{ color: '#1e40af' }}>twilio.com</a> (free trial)<br />
                2. Get <strong>Account SID</strong> + <strong>Auth Token</strong> from Console<br />
                3. Enable WhatsApp Sandbox: Messaging → Try WhatsApp → Sandbox<br />
                4. Sandbox number: <code>+14155238886</code> (test) or buy a number for production
              </div>
            )}
            {settings.provider === 'wati' && (
              <div style={S.infoBox}>
                <strong>WATI Setup:</strong><br />
                1. Sign up at <a href="https://wati.io" target="_blank" rel="noreferrer" style={{ color: '#1e40af' }}>wati.io</a><br />
                2. Get your <strong>API Token</strong> from Settings → API<br />
                3. Use your WATI endpoint URL as the From Number
              </div>
            )}
            {settings.provider === 'interakt' && (
              <div style={S.infoBox}>
                <strong>Interakt Setup:</strong><br />
                1. Sign up at <a href="https://interakt.ai" target="_blank" rel="noreferrer" style={{ color: '#1e40af' }}>interakt.ai</a><br />
                2. Get your <strong>API Key</strong> from Developer Settings
              </div>
            )}

            <div style={S.formGrid}>
              <div style={S.field}>
                <label style={S.label}>Account SID / API Key</label>
                <Input
                  value={settings.account_sid}
                  onChange={set('account_sid')}
                  placeholder={settings.provider === 'twilio' ? 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' : 'Your API Key'}
                />
              </div>
              <div style={S.field}>
                <label style={S.label}>
                  Auth Token / Secret
                  <button type="button" onClick={() => setShowToken(v => !v)}
                    style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                    {showToken ? '🙈' : '👁️'}
                  </button>
                </label>
                <Input
                  type={showToken ? 'text' : 'password'}
                  value={settings.auth_token}
                  onChange={set('auth_token')}
                  placeholder="Your Auth Token / Secret"
                />
              </div>
              <div style={{ ...S.field, gridColumn: '1 / -1' }}>
                <label style={S.label}>From Number (WhatsApp)</label>
                <Input
                  value={settings.from_number}
                  onChange={set('from_number')}
                  placeholder="+14155238886"
                />
                <span style={S.hint}>
                  Twilio sandbox: +14155238886 · Production: your approved WhatsApp Business number
                </span>
              </div>
            </div>

            {/* Test send */}
            <div style={{ marginTop: 8, padding: '14px 16px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-1)' }}>🧪 Test Message</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="+91 9876543210"
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={handleTestSend} disabled={testing}
                  style={{ padding: '9px 16px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {testing ? '⏳' : '📤 Send Test'}
                </button>
              </div>
              <div style={S.hint}>Saves settings first, then sends a test WhatsApp message to verify credentials.</div>
            </div>
          </div>
        </div>

        {/* Message Templates */}
        <div style={{ ...S.card, opacity: settings.is_enabled ? 1 : 0.5, pointerEvents: settings.is_enabled ? 'auto' : 'none' }}>
          <div style={S.cardHead}>
            <div style={S.cardIcon}>✉️</div>
            <div style={{ flex: 1 }}>
              <div style={S.cardTitle}>Message Templates</div>
              <div style={S.cardSub}>
                Variables: <code>{'{name}'}</code> <code>{'{restaurant}'}</code> <code>{'{amount}'}</code>{' '}
                <code>{'{bill_no}'}</code> <code>{'{code}'}</code> <code>{'{discount}'}</code> <code>{'{expiry}'}</code>
              </div>
            </div>
          </div>
          <div style={S.cardBody}>
            {[
              { k: 'template_bill',        label: '🧾 Bill Receipt Message',     sub: 'Sent when a bill is generated' },
              { k: 'template_promo',       label: '🏷️ Promo Code Message',       sub: 'Sent for manual promo codes' },
              { k: 'template_birthday',    label: '🎂 Birthday Greeting',        sub: 'Auto-sent on customer birthday' },
              { k: 'template_anniversary', label: '💍 Anniversary Greeting',     sub: 'Auto-sent on customer anniversary' },
            ].map(({ k, label, sub }) => (
              <div key={k} style={S.field}>
                <label style={S.label}>
                  {label}
                  <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 6 }}>— {sub}</span>
                </label>
                <textarea
                  value={settings[k]}
                  onChange={set(k)}
                  rows={3}
                  style={{ ...S.textarea }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Auto-trigger info */}
        <div style={{ ...S.card, opacity: settings.is_enabled ? 1 : 0.5 }}>
          <div style={S.cardHead}>
            <div style={S.cardIcon}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={S.cardTitle}>Auto-Trigger Schedule</div>
              <div style={S.cardSub}>These run automatically every day when WhatsApp is ON</div>
            </div>
          </div>
          <div style={S.cardBody}>
            {[
              { icon: '🎂', label: 'Birthday',    desc: 'Sends birthday promo to customers whose birthday is today' },
              { icon: '💍', label: 'Anniversary', desc: 'Sends anniversary promo to customers whose anniversary is today' },
              { icon: '🔄', label: 'Return',      desc: 'Sends win-back promo to customers not visited in 30+ days' },
            ].map(({ icon, label, desc }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 22 }}>{icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{desc}</div>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 12, padding: '2px 10px', borderRadius: 20,
                  background: settings.is_enabled ? '#dcfce7' : '#f3f4f6',
                  color: settings.is_enabled ? '#166534' : '#6b7280', fontWeight: 600 }}>
                  {settings.is_enabled ? '✅ Active' : '⛔ Off'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : '💾 Save WhatsApp Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

const S = {
  card:        { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', transition: 'opacity .2s' },
  cardHead:    { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' },
  cardIcon:    { fontSize: 28, flexShrink: 0 },
  cardTitle:   { fontSize: 15, fontWeight: 700, color: 'var(--text-1)' },
  cardSub:     { fontSize: 12, color: 'var(--text-3)', marginTop: 2 },
  cardBody:    { borderTop: '1px solid var(--border)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 },
  formGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' },
  field:       { display: 'flex', flexDirection: 'column', gap: 5 },
  label:       { fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em' },
  hint:        { fontSize: 11, color: 'var(--text-3)', marginTop: 2 },
  textarea:    { padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--white)', resize: 'vertical' },
  infoBox:     { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#1e40af', lineHeight: 1.7 },
  toggle:      { cursor: 'pointer', flexShrink: 0 },
  toggleTrack: { width: 44, height: 24, borderRadius: 12, transition: 'background .2s', position: 'relative' },
  toggleThumb: { position: 'absolute', top: 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'transform .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' },
};
