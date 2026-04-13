import { useState, useEffect } from 'react';
import CryptoJS from 'crypto-js';
import { usersAPI } from '../services/api';
import { useApp } from '../context/useApp';

const SECRET_KEY = 'MyRestaurant@SecretKey123';

const FEATURES = [
  { icon:'🪑', label:'POS & Tables',    sub:'Dine in · Take away · Delivery' },
  { icon:'🍳', label:'Kitchen Display', sub:'Live KOT status board' },
  { icon:'🧾', label:'Billing',         sub:'Cash · UPI · Card payments' },
  { icon:'👥', label:'Staff & Roles',   sub:'Users · Permissions · Shifts' },
  { icon:'📊', label:'Reports',         sub:'Sales · Inventory · Expenses' },
  { icon:'🏢', label:'Multi-company',   sub:'Manage multiple branches' },
];

const AMBIENT = [
  { icon:'🍕', top:'6%',  left:'4%',   size:50, rot:-12 },
  { icon:'🥘', top:'14%', right:'5%',  size:42, rot: 10 },
  { icon:'🍜', top:'38%', left:'2%',   size:36, rot:-8  },
  { icon:'🍔', top:'58%', right:'4%',  size:46, rot: 14 },
  { icon:'🧁', top:'74%', left:'6%',   size:34, rot:-6  },
  { icon:'🍱', top:'82%', right:'6%',  size:40, rot: 8  },
  { icon:'🥗', top:'28%', right:'11%', size:30, rot:-10 },
  { icon:'🍛', top:'65%', left:'3%',   size:32, rot: 6  },
  { icon:'🍣', top:'90%', left:'28%',  size:28, rot:-4  },
  { icon:'🥩', top:'4%',  left:'36%',  size:26, rot: 12 },
];

export default function Login() {
  const { login, showToast } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState('');
  const [warming,  setWarming]  = useState(false);

  // Check if backend is awake when login page loads
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        await fetch('https://restaurantbackend-production-8e87.up.railway.app/health', { signal: controller.signal });
        clearTimeout(timeout);
      } catch {
        // Backend sleeping — show warming message and wake it up
        setWarming(true);
        try {
          await fetch('https://restaurantbackend-production-8e87.up.railway.app/company/');
        } catch {}
        setWarming(false);
      }
    };
    checkBackend();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError('Please enter both fields.'); return; }
    setError(''); setLoading(true);
    try {
      const enc = CryptoJS.AES.encrypt(password, SECRET_KEY).toString();
      const res = await usersAPI.login({ username: username.trim(), password: enc });
      login(res);
      showToast(`Welcome, ${res.user_details.first_name}!`);
    } catch (err) { setError(err.message || 'Invalid username or password.'); }
    setLoading(false);
  };

  return (
    <div style={S.root}>
      {/* Ambient food icons */}
      {AMBIENT.map((a, i) => (
        <div key={i} style={{
          position:'absolute', fontSize: a.size, opacity:.055,
          top: a.top, left: a.left, right: a.right,
          transform:`rotate(${a.rot}deg)`,
          pointerEvents:'none', userSelect:'none', zIndex:0,
        }}>{a.icon}</div>
      ))}

      {/* Purple glow orbs */}
      <div style={S.orb1}/>
      <div style={S.orb2}/>
      <div style={S.orb3}/>

      {/* ── CARD ── */}
      <div style={S.card}>

        {/* Logo */}
        <div style={S.logoWrap}>
          <div style={S.logoBox}>🍴</div>
          <div style={S.logoShine}/>
        </div>

        {/* Brand */}
        <div style={S.brandName}>CurryCloud POS</div>
        <div style={S.brandSub}>Management Suite · Sign in to your dashboard</div>

        {/* Divider */}
        <div style={S.divider}>
          <div style={S.divLine}/><span style={S.divText}>credentials</span><div style={S.divLine}/>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={S.form}>
          <div style={S.field}>
            <label style={S.label}>Username</label>
            <div style={S.inputWrap}>
              <span style={S.icon}>👤</span>
              <input style={S.input} type="text" placeholder="Enter your username"
                value={username} onChange={e => setUsername(e.target.value)} autoFocus />
            </div>
          </div>
          <div style={S.field}>
            <label style={S.label}>Password</label>
            <div style={S.inputWrap}>
              <span style={S.icon}>🔑</span>
              <input style={S.input} type={showPass ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" style={S.eyeBtn} onClick={() => setShowPass(v => !v)}>
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          {error && <div style={S.errBox}><span>⚠️</span>{error}</div>}
          <button type="submit" style={S.submitBtn} disabled={loading}>
            {loading
              ? <span style={S.spinner}/>
              : <><span>Sign in</span><span style={S.arrow}>→</span></>}
          </button>
        </form>

        {/* Feature chips */}
        <div style={S.chipGrid}>
          {FEATURES.map(f => (
            <div key={f.label} style={S.chip}>
              <span style={{ fontSize:14 }}>{f.icon}</span>
              <span style={S.chipLabel}>{f.label}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <span style={S.lockBadge}>🔒 AES · CryptoJS</span>
          <span style={S.footText}>v2.0 · Secure</span>
        </div>
      </div>
    </div>
  );
}

const P = {
  bg:      '#faf9ff',
  bg2:     '#f5f3ff',
  border:  '#e4d9fc',
  border2: '#d4c4f8',
  purple:  '#7c3aed',
  purple2: '#9f5fff',
  purpleL: '#ede9fe',
  text:    '#1e1433',
  text2:   '#6b4fa0',
  text3:   '#9880c4',
  white:   '#fff',
};

const S = {
  root:      { minHeight:'100vh', background: P.bg, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden', fontFamily:"'DM Sans',system-ui,sans-serif", padding:24 },
  orb1:      { position:'absolute', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(167,139,250,.09) 0%,transparent 65%)', top:-160, left:-140, pointerEvents:'none' },
  orb2:      { position:'absolute', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(124,58,237,.07) 0%,transparent 65%)', bottom:-100, right:-100, pointerEvents:'none' },
  orb3:      { position:'absolute', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle,rgba(167,139,250,.05) 0%,transparent 65%)', top:'40%', right:'15%', pointerEvents:'none' },

  card:      { position:'relative', zIndex:1, background: P.white, border:`1.5px solid ${P.border}`, borderRadius:22, padding:'40px 36px', width:'100%', maxWidth:420, boxShadow:'0 4px 6px rgba(124,58,237,.04), 0 20px 60px rgba(124,58,237,.08)' },

  logoWrap:  { position:'relative', width:64, height:64, margin:'0 auto 18px' },
  logoBox:   { width:64, height:64, borderRadius:18, background:'linear-gradient(135deg,#7c3aed,#a855f7)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, boxShadow:'0 8px 24px rgba(124,58,237,.3)' },
  logoShine: { position:'absolute', top:4, left:8, width:20, height:8, background:'rgba(255,255,255,.3)', borderRadius:20, transform:'rotate(-20deg)' },

  brandName: { textAlign:'center', fontSize:22, fontWeight:800, color: P.text, marginBottom:6, letterSpacing:'-.4px' },
  brandSub:  { textAlign:'center', fontSize:12, color: P.text3, marginBottom:24 },

  divider:   { display:'flex', alignItems:'center', gap:10, marginBottom:24 },
  divLine:   { flex:1, height:1, background: P.border },
  divText:   { fontSize:10, fontWeight:600, color: P.text3, letterSpacing:'.06em', textTransform:'uppercase', whiteSpace:'nowrap' },

  form:      { display:'flex', flexDirection:'column', gap:16, marginBottom:20 },
  field:     { display:'flex', flexDirection:'column', gap:6 },
  label:     { fontSize:11, fontWeight:700, color: P.text2, letterSpacing:'.04em', textTransform:'uppercase' },
  inputWrap: { position:'relative', display:'flex', alignItems:'center' },
  icon:      { position:'absolute', left:13, fontSize:14, pointerEvents:'none', zIndex:1 },
  input:     { width:'100%', padding:'12px 42px', border:`1.5px solid ${P.border}`, borderRadius:11, fontSize:14, color: P.text, background: P.bg, outline:'none', fontFamily:'inherit', transition:'border-color .15s, box-shadow .15s' },
  eyeBtn:    { position:'absolute', right:12, background:'none', border:'none', cursor:'pointer', fontSize:15, padding:4, lineHeight:1, opacity:.5 },

  errBox:    { display:'flex', alignItems:'center', gap:7, background:'#fff5f5', border:'1px solid #ffd0d0', color:'#cc3333', fontSize:13, padding:'10px 14px', borderRadius:9 },

  submitBtn: { width:'100%', padding:14, background:'linear-gradient(135deg,#7c3aed,#a855f7)', color:'#fff', border:'none', borderRadius:11, fontWeight:700, fontSize:15, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontFamily:'inherit', boxShadow:'0 6px 20px rgba(124,58,237,.28)', marginTop:4 },
  arrow:     { fontSize:18 },
  spinner:   { width:18, height:18, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin .65s linear infinite', display:'inline-block' },

  chipGrid:  { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:7, marginBottom:22 },
  chip:      { display:'flex', alignItems:'center', gap:6, background: P.bg2, border:`1px solid ${P.border}`, borderRadius:9, padding:'8px 10px' },
  chipLabel: { fontSize:10, fontWeight:600, color: P.text2, lineHeight:1.2 },

  footer:    { display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:16, borderTop:`1px solid ${P.border}` },
  lockBadge: { background: P.purpleL, border:`1px solid ${P.border}`, color: P.purple, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20 },
  footText:  { fontSize:11, color: P.text3 },
};
