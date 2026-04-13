import { useEffect, useState } from 'react';
import { companyAPI, usersAPI, foodMenuAPI, foodCategoryAPI } from '../services/api';
import { Spinner } from '../components/UI';
import { useApp } from '../context/useApp';

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

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function Dashboard() {
  const { selectedCompany, user, menus, allCompanies } = useApp();
  const [stats,     setStats]     = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const all = allCompanies?.length ? allCompanies : await companyAPI.getAll();

        // Filter companies based on role:
        // Super Admin → all companies
        // Admin       → own company + its children
        // Staff/User  → only their own company
        let visible = all;
        if (!user?.is_super_admin) {
          const ownId = user?.company_unique_id;
          visible = all.filter(c =>
            c.company_unique_id === ownId ||          // own company
            c.parant_company_unique_id === ownId       // children of own company
          );
        }
        setCompanies(visible);

        if (selectedCompany) {
          const [u, fm, fc] = await Promise.allSettled([
            usersAPI.getAll(selectedCompany.company_unique_id),
            foodMenuAPI.getAll(selectedCompany.company_unique_id),
            foodCategoryAPI.getAll(selectedCompany.company_unique_id),
          ]);
          setStats({
            users: u.status  === 'fulfilled' ? u.value.length  : 0,
            menus: fm.status === 'fulfilled' ? fm.value.length : 0,
            cats:  fc.status === 'fulfilled' ? fc.value.length : 0,
          });
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [selectedCompany, user, allCompanies]);

  if (loading) return <Spinner />;

  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`;
  const role     = user?.is_super_admin ? 'Super Admin' : user?.is_admin ? 'Admin' : 'Staff';

  const STATS = [
    { label:'Total Companies', value: companies.length,    icon:'🏢', accent:'#7c3aed', light:'#f5f3ff', border:'#d4c4f8' },
    { label:'Users',           value: stats?.users ?? '—', icon:'👥', accent:'#0891b2', light:'#e0f7fa', border:'#a0dce8' },
    { label:'Menu Items',      value: stats?.menus ?? '—', icon:'🍽️', accent:'#d97706', light:'#fff8e6', border:'#f0d080' },
    { label:'Food Categories', value: stats?.cats  ?? '—', icon:'🗂️', accent:'#dc2626', light:'#fef2f2', border:'#f0a0a0' },
  ];

  return (
    <div style={D.page}>

      {/* ── WELCOME BANNER ── */}
      <div style={D.banner}>
        {/* Shine overlay */}
        <div style={D.bannerShine}/>
        <div style={D.bannerInner}>
          <div style={D.bannerLeft}>
            <div style={D.avatar}>{initials}</div>
            <div>
              <div style={D.greet}>{greeting()}, {user?.first_name}! 👋</div>
              <div style={D.subRow}>
                <span style={D.rolePill}>{role}</span>
                {user?.employment_type  && <span style={D.metaDot}>·</span>}
                {user?.employment_type  && <span style={D.metaTxt}>{user.employment_type.replace('-',' ')}</span>}
                {user?.shift_preference && <span style={D.metaDot}>·</span>}
                {user?.shift_preference && <span style={D.metaTxt}>{user.shift_preference} shift</span>}
              </div>
            </div>
          </div>
          <div style={D.bannerRight}>
            {user?.email        && <div style={D.infoRow}><span>📧</span><span>{user.email}</span></div>}
            {user?.phone_number && <div style={D.infoRow}><span>📞</span><span>{user.phone_number}</span></div>}
            {user?.salary       && <div style={D.infoRow}><span>💰</span><span>₹{user.salary.toLocaleString()}/mo</span></div>}
          </div>
        </div>
      </div>

      {/* ── ASSIGNED MENUS ── */}
      {menus?.length > 0 && (
        <div style={D.menusBar}>
          <span style={D.menusLabel}>Assigned menus</span>
          <div style={D.menusRow}>
            {menus.map(m => (
              <span key={m.userrolemapping_id} style={D.menuChip}>
                {m.menuname || `Menu #${m.menu_id}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── STAT CARDS ── */}
      <div style={D.statsGrid}>
        {STATS.map(s => (
          <div key={s.label} style={{ ...D.statCard, borderTopColor: s.accent }}>
            <div style={{ ...D.statIcon, background: s.light, border:`1px solid ${s.border}` }}>
              <span style={{ fontSize:22 }}>{s.icon}</span>
            </div>
            <div style={{ ...D.statVal, color: s.accent }}>{s.value}</div>
            <div style={D.statLbl}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── ACTIVE COMPANY ── */}
      {!selectedCompany ? (
        <div style={D.ctaBox}>
          <div style={D.ctaIcon}>🏢</div>
          <div style={D.ctaTitle}>Select a Company to Begin</div>
          <div style={D.ctaSub}>Go to <strong style={{ color: P.purple }}>Companies</strong> in the sidebar to choose an active company. All modules are scoped per company.</div>
        </div>
      ) : (
        <div style={D.compCard}>
          <div style={D.compHead}>
            <div style={D.compLogo}>{selectedCompany.name[0]}</div>
            <div style={{ flex:1 }}>
              <div style={D.compName}>{selectedCompany.name}</div>
              <div style={D.compMeta}>{selectedCompany.short_name} · {selectedCompany.country}</div>
            </div>
            <span style={D.activeBadge}>✓ Active Company</span>
          </div>
          <div style={D.compInfoGrid}>
            {selectedCompany.admin_email  && <div style={D.compInfo}><span>📧</span>{selectedCompany.admin_email}</div>}
            {selectedCompany.admin_phone  && <div style={D.compInfo}><span>📞</span>{selectedCompany.admin_phone_country_code}{selectedCompany.admin_phone}</div>}
            {selectedCompany.website      && <div style={D.compInfo}><span>🌐</span><a href={selectedCompany.website} target="_blank" rel="noreferrer" style={{ color: P.purple }}>{selectedCompany.website}</a></div>}
            {selectedCompany.address1     && <div style={D.compInfo}><span>📍</span>{selectedCompany.address1}</div>}
          </div>
        </div>
      )}

      {/* ── ALL COMPANIES ── */}
      <div style={D.section}>
        <div style={D.secHead}>
          <div style={D.secLine}/><span style={D.secTitle}>{user?.is_super_admin ? 'All Companies' : 'My Companies'}</span><div style={D.secLine}/>
        </div>
        <div style={D.compGrid}>
          {companies.map(c => (
            <div key={c.company_id} style={D.compMini}>
              <div style={D.miniLogo}>{c.name[0]}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={D.miniName}>{c.name}</div>
                <div style={D.miniMeta}>#{c.company_unique_id} · {c.country}</div>
              </div>
              <span style={D.activeBadgeSm}>Active</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const D = {
  page:       { display:'flex', flexDirection:'column', minHeight:'100%', background: P.bg, fontFamily:"'DM Sans',system-ui,sans-serif" },

  banner:     { position:'relative', overflow:'hidden', background:'linear-gradient(135deg,#7c3aed 0%,#9f5fff 60%,#c084fc 100%)', borderBottom:`1px solid ${P.border}` },
  bannerShine: { position:'absolute', top:0, left:0, right:0, height:'50%', background:'rgba(255,255,255,.07)', pointerEvents:'none' },
  bannerInner: { position:'relative', zIndex:1, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'26px 32px', gap:20, flexWrap:'wrap' },
  bannerLeft: { display:'flex', alignItems:'center', gap:16 },
  avatar:     { width:52, height:52, borderRadius:'50%', background:'rgba(255,255,255,.2)', border:'2px solid rgba(255,255,255,.4)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:16, fontWeight:700, flexShrink:0, boxShadow:'0 2px 12px rgba(0,0,0,.15)' },
  greet:      { color:'#fff', fontSize:18, fontWeight:700, marginBottom:6, textShadow:'0 1px 3px rgba(0,0,0,.15)' },
  subRow:     { display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' },
  rolePill:   { background:'rgba(255,255,255,.2)', border:'1px solid rgba(255,255,255,.3)', color:'#fff', fontSize:11, fontWeight:600, padding:'2px 10px', borderRadius:20 },
  metaDot:    { color:'rgba(255,255,255,.4)', fontSize:12 },
  metaTxt:    { fontSize:12, color:'rgba(255,255,255,.75)', textTransform:'capitalize' },
  bannerRight: { display:'flex', flexDirection:'column', gap:5 },
  infoRow:    { display:'flex', alignItems:'center', gap:8, fontSize:12, color:'rgba(255,255,255,.8)' },

  menusBar:   { background: P.bg2, borderBottom:`1px solid ${P.border}`, padding:'10px 32px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' },
  menusLabel: { fontSize:10, fontWeight:700, color: P.text3, letterSpacing:'.07em', textTransform:'uppercase', flexShrink:0 },
  menusRow:   { display:'flex', gap:6, flexWrap:'wrap' },
  menuChip:   { background: P.white, border:`1px solid ${P.border}`, color: P.text2, fontSize:11, fontWeight:500, padding:'2px 9px', borderRadius:20 },

  statsGrid:  { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, padding:'24px 32px' },
  statCard:   { background: P.white, border:`1px solid ${P.border}`, borderTop:'3px solid', borderRadius:12, padding:'18px 16px', display:'flex', flexDirection:'column', gap:8, boxShadow:'0 1px 4px rgba(124,58,237,.04)' },
  statIcon:   { width:44, height:44, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:4 },
  statVal:    { fontSize:30, fontWeight:900, lineHeight:1 },
  statLbl:    { fontSize:12, color: P.text3 },

  ctaBox:     { margin:'0 32px 24px', background: P.white, border:`1.5px dashed ${P.border}`, borderRadius:14, padding:'52px 32px', textAlign:'center' },
  ctaIcon:    { fontSize:44, marginBottom:14 },
  ctaTitle:   { fontSize:20, fontWeight:700, color: P.text, marginBottom:10 },
  ctaSub:     { fontSize:14, color: P.text2, lineHeight:1.7 },

  compCard:   { margin:'0 32px 24px', background: P.white, border:`1px solid ${P.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 2px 8px rgba(124,58,237,.05)' },
  compHead:   { padding:'18px 22px', display:'flex', alignItems:'center', gap:14, background: P.bg2, borderBottom:`1px solid ${P.border}` },
  compLogo:   { width:46, height:46, borderRadius:12, background:'linear-gradient(135deg,#7c3aed,#a855f7)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:20, fontWeight:700, flexShrink:0, boxShadow:'0 4px 12px rgba(124,58,237,.25)' },
  compName:   { fontSize:16, fontWeight:700, color: P.text, marginBottom:3 },
  compMeta:   { fontSize:12, color: P.text3 },
  activeBadge: { background: P.purpleL, border:`1px solid ${P.border}`, color: P.purple, fontSize:12, fontWeight:700, padding:'5px 14px', borderRadius:20, flexShrink:0 },
  compInfoGrid: { padding:'16px 22px', display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px 24px', borderTop:`1px solid ${P.border}` },
  compInfo:   { display:'flex', alignItems:'center', gap:8, fontSize:13, color: P.text2 },

  section:    { padding:'0 32px 32px' },
  secHead:    { display:'flex', alignItems:'center', gap:12, marginBottom:16 },
  secLine:    { flex:1, height:1, background: P.border },
  secTitle:   { fontSize:11, fontWeight:700, color: P.text3, letterSpacing:'.08em', textTransform:'uppercase', flexShrink:0 },
  compGrid:   { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:10 },
  compMini:   { background: P.white, border:`1px solid ${P.border}`, borderRadius:10, padding:'12px 14px', display:'flex', alignItems:'center', gap:10, boxShadow:'0 1px 3px rgba(124,58,237,.03)' },
  miniLogo:   { width:34, height:34, borderRadius:8, background:'linear-gradient(135deg,#7c3aed,#a855f7)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13, fontWeight:700, flexShrink:0 },
  miniName:   { fontSize:13, fontWeight:600, color: P.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  miniMeta:   { fontSize:11, color: P.text3, marginTop:1 },
  activeBadgeSm: { background: P.purpleL, border:`1px solid ${P.border}`, color: P.purple, fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, flexShrink:0 },
};
