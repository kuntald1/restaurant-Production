import { useState, useEffect } from 'react';

export default function MenuPublic() {
  const [menus, setMenus]       = useState([]);
  const [cats, setCats]         = useState([]);
  const [company, setCompany]   = useState(null);
  const [selCat, setSelCat]     = useState('all');
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // Get companyId from URL: /menu/1
  const companyId = window.location.pathname.split('/').pop();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [menuRes, catRes, compRes] = await Promise.all([
          fetch(`/company/getallfoodmenu/${companyId}`).then(r => r.json()),
          fetch(`/company/getallfoodcategory/${companyId}`).then(r => r.json()),
          fetch(`/company/${companyId}`).then(r => r.json()),
        ]);
        setMenus((menuRes || []).filter(m => m.IsActive && m.is_available));
        setCats(catRes || []);
        setCompany(compRes || null);
      } catch (e) {
        setError('Failed to load menu. Please try again.');
      }
      setLoading(false);
    };
    if (companyId) load();
  }, [companyId]);

  const filtered = menus.filter(m => {
    const matchCat = selCat === 'all' || m.category_id === parseInt(selCat);
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // Group by category
  const grouped = cats.reduce((acc, cat) => {
    const items = filtered.filter(m => m.category_id === cat.food_category_id);
    if (items.length > 0) acc.push({ cat, items });
    return acc;
  }, []);

  // Items with no matching category
  const uncategorized = filtered.filter(m => !cats.find(c => c.food_category_id === m.category_id));
  if (uncategorized.length > 0) grouped.push({ cat: { category_name: 'Other', food_category_id: 'other' }, items: uncategorized });

  if (loading) return (
    <div style={S.loadWrap}>
      <div style={S.spinner}></div>
      <div style={S.loadText}>Loading menu...</div>
    </div>
  );

  if (error) return (
    <div style={S.loadWrap}>
      <div style={{ fontSize: 48 }}>😕</div>
      <div style={{ color: '#dc2626', marginTop: 12 }}>{error}</div>
    </div>
  );

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        {company?.logo_file_name && (
          <img src={company.logo_file_name} alt="logo" style={S.logo} onError={e => e.target.style.display='none'} />
        )}
        <div style={S.companyName}>{company?.name || 'Our Menu'}</div>
        {company?.address1 && <div style={S.companyAddr}>{company.address1}{company.address2 ? `, ${company.address2}` : ''}</div>}
        {company?.admin_phone && <div style={S.companyPhone}>📞 {company.admin_phone}</div>}
        <div style={S.tagline}>🍽️ Scan · Order · Enjoy</div>
      </div>

      {/* Search */}
      <div style={S.searchWrap}>
        <span style={S.searchIcon}>🔍</span>
        <input
          style={S.searchInput}
          placeholder="Search dishes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && <button style={S.clearBtn} onClick={() => setSearch('')}>✕</button>}
      </div>

      {/* Category Tabs */}
      <div style={S.catRow}>
        <button
          style={{ ...S.catBtn, ...(selCat === 'all' ? S.catActive : {}) }}
          onClick={() => setSelCat('all')}
        >
          All
        </button>
        {cats.map(c => (
          <button
            key={c.food_category_id}
            style={{ ...S.catBtn, ...(selCat === String(c.food_category_id) ? S.catActive : {}) }}
            onClick={() => setSelCat(String(c.food_category_id))}
          >
            {c.category_name}
          </button>
        ))}
      </div>

      {/* Menu Items */}
      <div style={S.content}>
        {filtered.length === 0 && (
          <div style={S.empty}>
            <div style={{ fontSize: 48 }}>🍽️</div>
            <div>No items found</div>
          </div>
        )}

        {selCat === 'all' ? (
          // Grouped by category
          grouped.map(({ cat, items }) => (
            <div key={cat.food_category_id} style={S.section}>
              <div style={S.sectionTitle}>
                <span style={{ ...S.catDot, background: cat.color_code || '#4caf50' }}></span>
                {cat.category_name}
                <span style={S.sectionCount}>{items.length} items</span>
              </div>
              <div style={S.grid}>
                {items.map(item => <MenuCard key={item.food_menu_id} item={item} />)}
              </div>
            </div>
          ))
        ) : (
          // Flat list for selected category
          <div style={S.grid}>
            {filtered.map(item => <MenuCard key={item.food_menu_id} item={item} />)}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <div>Powered by <strong>Restaurant OS</strong></div>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Please ask staff to place your order</div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f9fa; }
      `}</style>
    </div>
  );
}

function MenuCard({ item }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div style={C.card}>
      <div style={C.imgWrap}>
        {item.image_url && !imgError ? (
          <img src={item.image_url} alt={item.name} style={C.img} onError={() => setImgError(true)} />
        ) : (
          <div style={C.imgPlaceholder}>🍽️</div>
        )}
        <div style={{ ...C.vegBadge, background: item.is_veg !== false ? '#16a34a' : '#dc2626' }}>
          {item.is_veg !== false ? '🟢' : '🔴'}
        </div>
      </div>
      <div style={C.info}>
        <div style={C.name}>{item.name}</div>
        {item.description && <div style={C.desc}>{item.description}</div>}
        <div style={C.priceRow}>
          <span style={C.price}>₹{parseFloat(item.sale_price).toFixed(0)}</span>
          <span style={C.code}>{item.code}</span>
        </div>
      </div>
    </div>
  );
}

const S = {
  page: { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#fff', paddingBottom: 40 },
  loadWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, color: '#666' },
  spinner: { width: 40, height: 40, border: '4px solid #e5e7eb', borderTop: '4px solid #4caf50', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  loadText: { fontSize: 14, color: '#888' },
  header: { background: 'linear-gradient(135deg, #1a3a1c, #2d6a30)', color: '#fff', padding: '32px 20px 24px', textAlign: 'center' },
  logo: { width: 70, height: 70, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.3)', marginBottom: 12 },
  companyName: { fontSize: 24, fontWeight: 800, marginBottom: 6 },
  companyAddr: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  companyPhone: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
  tagline: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 8 },
  searchWrap: { display: 'flex', alignItems: 'center', gap: 8, margin: '16px', background: '#f5f5f5', borderRadius: 12, padding: '10px 14px', border: '1px solid #e5e7eb' },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, border: 'none', background: 'transparent', fontSize: 15, outline: 'none' },
  clearBtn: { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 14 },
  catRow: { display: 'flex', gap: 8, padding: '0 16px 12px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' },
  catBtn: { padding: '8px 18px', borderRadius: 24, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', color: '#555', flexShrink: 0 },
  catActive: { background: '#1a3a1c', color: '#fff', border: '1.5px solid #1a3a1c', fontWeight: 700 },
  content: { padding: '0 16px' },
  section: { marginBottom: 28 },
  sectionTitle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: '#1a1a1a', marginBottom: 14, paddingBottom: 8, borderBottom: '2px solid #f0f0f0' },
  catDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  sectionCount: { marginLeft: 'auto', fontSize: 12, color: '#aaa', fontWeight: 400 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  empty: { textAlign: 'center', padding: '60px 20px', color: '#aaa', fontSize: 14 },
  footer: { textAlign: 'center', padding: '24px 20px', fontSize: 13, color: '#aaa', borderTop: '1px solid #f0f0f0', marginTop: 20 },
};

const C = {
  card: { background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #f0f0f0' },
  imgWrap: { position: 'relative', height: 120 },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  imgPlaceholder: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, background: '#f8f9fa' },
  vegBadge: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, border: '2px solid #fff' },
  info: { padding: '10px 12px 12px' },
  name: { fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 4, lineHeight: 1.3 },
  desc: { fontSize: 11, color: '#888', marginBottom: 6, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' },
  priceRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  price: { fontSize: 15, fontWeight: 800, color: '#1a3a1c' },
  code: { fontSize: 10, color: '#bbb', background: '#f5f5f5', padding: '2px 6px', borderRadius: 6 },
};