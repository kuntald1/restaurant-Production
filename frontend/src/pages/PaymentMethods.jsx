import { useEffect, useState } from 'react';
import { useApp } from '../context/useApp';
import { Spinner, PageHeader } from '../components/UI';
import { merchantSettingsAPI, qrAPI } from '../services/api';

const LS_KEY = (cid) => `rms_payment_settings_${cid}`;

const DEFAULT = {
  upi_id: '', upi_name: '', upi_qr_image_url: '',
  is_merchant_enabled: false,
  razorpay_key_id: '', razorpay_key_secret: '',
  merchant_name: '', merchant_description: '',
};

export default function PaymentMethods() {
  const { selectedCompany, showToast, companySettings, setCompanySettings } = useApp();
  const [settings,    setSettings]    = useState(DEFAULT);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [showSecret,  setShowSecret]  = useState(false);
  const [companyQrUrl, setCompanyQrUrl] = useState('');
  const [apiStatus,   setApiStatus]   = useState(''); // '' | 'api' | 'local'

  const cid = selectedCompany?.company_unique_id;

  useEffect(() => {
    if (!cid) { setLoading(false); return; }
    const load = async () => {
      // Fetch active QR code from company QR codes
      try {
        const qrs = await qrAPI.getActive(cid);
        if (qrs?.length) setCompanyQrUrl(qrs[0].image_url || '');
      } catch {}

      // Try backend API first
      try {
        const data = await merchantSettingsAPI.get(cid);
        const local = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY(cid)) || '{}'); } catch { return {}; } })();
        // Only set fields that actually have values — don't overwrite with nulls
        const merged = { ...DEFAULT };
        // is_merchant_enabled: login API response is source of truth
        merged.is_merchant_enabled = companySettings?.is_merchant_enabled === true;
        if (data.razorpay_key_id)      merged.razorpay_key_id      = data.razorpay_key_id;
        if (data.merchant_name)        merged.merchant_name         = data.merchant_name;
        if (data.merchant_description) merged.merchant_description  = data.merchant_description;
        if (data.upi_id)               merged.upi_id                = data.upi_id;
        if (data.upi_name)             merged.upi_name              = data.upi_name;
        if (data.upi_qr_image_url)     merged.upi_qr_image_url      = data.upi_qr_image_url;
        setSettings(merged);
        setApiStatus('api');
      } catch {
        // Fallback to localStorage — but always use login response for is_merchant_enabled
        try {
          const saved = localStorage.getItem(LS_KEY(cid));
          const parsed = saved ? JSON.parse(saved) : {};
          const merged = { ...DEFAULT };
          Object.keys(parsed).forEach(k => { if (parsed[k] !== '' && parsed[k] !== null) merged[k] = parsed[k]; });
          // Override with login response value — this is authoritative
          merged.is_merchant_enabled = companySettings?.is_merchant_enabled === true;
          setSettings(merged);
        } catch {
          setSettings({ ...DEFAULT, is_merchant_enabled: companySettings?.is_merchant_enabled === true });
        }
        setApiStatus('local');
        // Update context so POS reflects the toggle immediately
        setCompanySettings(prev => ({ ...prev, is_merchant_enabled: settings.is_merchant_enabled }));
      }
      setLoading(false);
    };
    load();
  }, [cid]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        razorpay_key_id:      settings.razorpay_key_id      || null,
        razorpay_key_secret:  settings.razorpay_key_secret   || null,
        merchant_name:        settings.merchant_name         || null,
        merchant_description: settings.merchant_description  || null,
        upi_id:               settings.upi_id                || null,
        upi_name:             settings.upi_name              || null,
        upi_qr_image_url:     settings.upi_qr_image_url      || null,
      };

      // Try backend API first
      let apiSaved = false;
      try {
        await merchantSettingsAPI.save(cid, payload);
        await merchantSettingsAPI.toggle(cid, { is_merchant_enabled: settings.is_merchant_enabled });
        apiSaved = true;
        setApiStatus('api');
        // Clear old localStorage if backend is working
        localStorage.removeItem(LS_KEY(cid));
        // Update context so POS reads new flag immediately
        setCompanySettings(prev => ({ ...prev, is_merchant_enabled: settings.is_merchant_enabled }));
      } catch {
        // Backend not available — save to localStorage only as fallback
        localStorage.setItem(LS_KEY(cid), JSON.stringify(settings));
        setApiStatus('local');
      }

      showToast(apiSaved
        ? '✅ Settings saved to database!'
        : '⚠️ Backend not ready — saved locally. Deploy backend files first.'
      );
    } catch { showToast('Failed to save', 'error'); }
    setSaving(false);
  };

  const set = (k) => (e) => setSettings(s => ({
    ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  }));

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );
  if (loading) return <Spinner />;

  return (
    <div className="page">
      <PageHeader title="Payment Methods" subtitle={`Payment settings for ${selectedCompany.name}`} />

      {/* API status banner */}
      <div style={{ maxWidth: 700, marginBottom: 12 }}>
        {apiStatus === 'api' && (
          <div style={{ padding:'8px 14px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, fontSize:12, color:'#166534' }}>
            ✅ Connected to database — settings will persist across all devices
          </div>
        )}
        {apiStatus === 'local' && (
          <div style={{ padding:'8px 14px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, fontSize:12, color:'#92400e' }}>
            ⚠️ Backend API not available — saving locally only (deploy backend changes first)
          </div>
        )}
      </div>

      <form onSubmit={handleSave} style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── PERSONAL UPI ── */}
        <div style={S.card}>
          <div style={S.cardHead}>
            <div style={S.cardIcon}>📲</div>
            <div style={{ flex: 1 }}>
              <div style={S.cardTitle}>Personal UPI / QR</div>
              <div style={S.cardSub}>Always shown in POS — customer scans your static QR</div>
            </div>
            <span style={{ ...S.badge, background:'#dcfce7', color:'#166534' }}>Always ON</span>
          </div>
          <div style={S.cardBody}>
            <div style={S.infoBanner}>
              📲 "Personal UPI" always appears in Generate Bill. Staff shows QR → customer scans → staff confirms manually.
            </div>
            <div style={S.formGrid}>
              <div style={S.field}>
                <label style={S.label}>UPI ID</label>
                <input style={S.input} value={settings.upi_id} onChange={set('upi_id')}
                  placeholder="9876543210@paytm or name@okaxis" />
                <span style={S.hint}>Your personal/business UPI ID</span>
              </div>
              <div style={S.field}>
                <label style={S.label}>Display Name</label>
                <input style={S.input} value={settings.upi_name} onChange={set('upi_name')}
                  placeholder="ABC Restaurant" />
              </div>
              {/* QR from Payment QR Codes — shown automatically */}
              {companyQrUrl ? (
                <div style={{ gridColumn:'1 / -1' }}>
                  <label style={S.label}>Active QR Code (from Payment QR Codes)</label>
                  <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:4 }}>
                    <img src={companyQrUrl} alt="UPI QR"
                      style={{ width:130, height:130, border:'2px solid #7c3aed', borderRadius:10, objectFit:'contain', padding:6, background:'#fff' }}
                      onError={e => e.target.style.display='none'} />
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text-1)', marginBottom:4 }}>✅ QR Active</div>
                      <div style={{ fontSize:12, color:'var(--text-3)', lineHeight:1.6 }}>
                        This QR is automatically shown in the<br/>Generate Bill → Personal UPI screen.<br/>
                        To change it, go to<br/><strong>Company Management → Payment QR Codes</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ gridColumn:'1 / -1' }}>
                  <div style={{ padding:'12px 14px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, fontSize:12, color:'#92400e' }}>
                    ⚠️ No active QR found. Go to <strong>Company Management → Payment QR Codes</strong> to upload your UPI QR image.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── MERCHANT (Razorpay) ── */}
        <div style={S.card}>
          <div style={S.cardHead}>
            <div style={S.cardIcon}>🏦</div>
            <div style={{ flex:1 }}>
              <div style={S.cardTitle}>Merchant Payments (Razorpay)</div>
              <div style={S.cardSub}>Auto-confirm UPI + Card via Razorpay gateway</div>
            </div>
            <label style={S.toggle}>
              <input type="checkbox" checked={settings.is_merchant_enabled} onChange={set('is_merchant_enabled')} style={{ display:'none' }} />
              <div style={{ ...S.toggleTrack, background: settings.is_merchant_enabled ? '#7c3aed' : '#d1d5db' }}>
                <div style={{ ...S.toggleThumb, transform: settings.is_merchant_enabled ? 'translateX(20px)' : 'translateX(2px)' }} />
              </div>
            </label>
          </div>

          {settings.is_merchant_enabled && (
            <div style={S.cardBody}>
              <div style={{ ...S.infoBanner, background:'#ede9fe', border:'1px solid #d4b8f8', color:'#4c1d95' }}>
                🏦 "Merchant" button appears in Generate Bill with UPI (Razorpay) and Card sub-options. Auto-confirmed via JS SDK.
              </div>
              <div style={S.formGrid}>
                <div style={S.field}>
                  <label style={S.label}>Razorpay Key ID <span style={{ color:'#dc2626' }}>*</span></label>
                  <input style={S.input} value={settings.razorpay_key_id} onChange={set('razorpay_key_id')}
                    placeholder="rzp_test_xxxxxxxxxxxx" />
                  <span style={S.hint}>Settings → API Keys in Razorpay dashboard. Use rzp_test_ for testing.</span>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Merchant Name</label>
                  <input style={S.input} value={settings.merchant_name} onChange={set('merchant_name')}
                    placeholder="ABC Restaurant" />
                </div>
                <div style={{ ...S.field, gridColumn:'1 / -1' }}>
                  <label style={S.label}>Payment Description</label>
                  <input style={S.input} value={settings.merchant_description} onChange={set('merchant_description')}
                    placeholder="Payment at ABC Restaurant" />
                </div>
                <div style={{ ...S.field, gridColumn:'1 / -1' }}>
                  <label style={S.label}>
                    Razorpay Key Secret
                    <span style={{ color:'#dc2626', fontSize:11, fontWeight:400, marginLeft:6 }}>
                      ⚠️ Store on backend — saved to DB when backend is deployed
                    </span>
                  </label>
                  <div style={{ position:'relative' }}>
                    <input style={{ ...S.input, paddingRight:44 }}
                      type={showSecret ? 'text' : 'password'}
                      value={settings.razorpay_key_secret} onChange={set('razorpay_key_secret')}
                      placeholder="rzp_test_secret_xxxxxxxxxxxx" />
                    <button type="button" onClick={() => setShowSecret(v => !v)}
                      style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:15, opacity:.6 }}>
                      {showSecret ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              </div>


            </div>
          )}
        </div>

        {/* Summary */}
        <div style={{ ...S.card, background:'var(--bg)' }}>
          <div style={{ padding:'14px 18px' }}>
            <div style={S.cardTitle}>Active in POS Generate Bill</div>
            <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
              <span style={{ ...S.badge, background:'#dcfce7', color:'#166534' }}>✓ Cash</span>
              <span style={{ ...S.badge, background:'#ede9fe', color:'#7c3aed' }}>✓ Personal UPI</span>
              {settings.is_merchant_enabled && <span style={{ ...S.badge, background:'#dbeafe', color:'#1e40af' }}>✓ Merchant (Razorpay)</span>}
              <span style={{ ...S.badge, background:'#f3f4f6', color:'#374151' }}>Split</span>
              <span style={{ ...S.badge, background:'#f3f4f6', color:'#374151' }}>Complimentary</span>
            </div>
          </div>
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : '💾 Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

const S = {
  card:        { background:'var(--white)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' },
  cardHead:    { display:'flex', alignItems:'center', gap:14, padding:'16px 20px' },
  cardIcon:    { fontSize:28, flexShrink:0 },
  cardTitle:   { fontSize:15, fontWeight:700, color:'var(--text-1)' },
  cardSub:     { fontSize:12, color:'var(--text-3)', marginTop:2 },
  cardBody:    { borderTop:'1px solid var(--border)', padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 },
  toggle:      { cursor:'pointer', flexShrink:0 },
  toggleTrack: { width:44, height:24, borderRadius:12, transition:'background .2s', position:'relative' },
  toggleThumb: { position:'absolute', top:2, width:20, height:20, background:'#fff', borderRadius:'50%', transition:'transform .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' },
  infoBanner:  { background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#166534' },
  formGrid:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 16px' },
  field:       { display:'flex', flexDirection:'column', gap:5 },
  label:       { fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'.04em' },
  input:       { padding:'9px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'var(--white)' },
  hint:        { fontSize:11, color:'var(--text-3)' },
  badge:       { fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:20 },
};
