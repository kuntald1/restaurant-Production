import { useState } from 'react';
import { useApp } from '../context/useApp';

const FA_TO_EMOJI = {
  'fa-home':                '🏠',
  'fa-cog':                 '⚙️',
  'fa-th-list':             '📋',
  'fa-tachometer-alt':      '📊',
  'fa-truck':               '🚚',
  'fa-utensils':            '🍽️',
  'fa-archive':             '📦',
  'fa-adjust':              '🔧',
  'fa-trash':               '🗑️',
  'fa-money-bill':          '💵',
  'fa-file-invoice-dollar': '🧾',
  'fa-hand-holding-usd':    '🤝',
  'fa-envelope':            '✉️',
  'fa-user-clock':          '🕐',
  'fa-file-alt':            '📄',
  'fa-database':            '🗄️',
  'fa-user-cog':            '👤',
  'fa-chart-bar':           '📊',
  'fa-chart-line':          '📈',
  'fa-boxes':               '📦',
  'fa-receipt':             '🧾',
  'fa-calendar-check':      '📅',
  'fa-tag':                 '🏷️',
  'fa-hamburger':           '🍔',
  'fa-truck-loading':       '🚛',
  'fa-users':               '👥',
  'fa-id-badge':            '🪪',
  'fa-ruler':               '📏',
  'fa-percent':             '💹',
  'fa-user-shield':         '🛡️',
  'fa-lock':                '🔒',
  'fa-layer-group':         '🗂️',
  'fa-balance-scale':       '⚖️',
  'fa-carrot':              '🥕',
  'fa-sliders-h':           '🎛️',
  'fa-th-large':            '⊞',
  'fa-credit-card':         '💳',
  'fa-chair':               '🪑',
  'fa-fire-burner':         '🍳',
  'fa-fire':                '🔥',
  'fa-kitchen-set':         '🍽️',
  'fa-bowl-food':           '🥘',
  'fa-plate-wheat':         '🍛',
  'fa-burger':              '🍔',
  'fa-pizza-slice':         '🍕',
  'fa-pot-food':            '🍲',
  'fa-utensil-spoon':       '🥄',
  'fa-blender':             '🫙',
  'fa-wine-glass':          '🍷',
  'fa-mug-hot':             '☕',
  'fa-cash-register':       '🖥️',
  'fa-money-bill-wave':     '💵',
  'fa-wallet':              '👛',
  'fa-coins':               '🪙',
  'fa-barcode':             '📊',
  'fa-tags':                '🏷️',
  'fa-truck-fast':          '🚀',
  'fa-motorcycle':          '🛵',
  'fa-box':                 '📦',
  'fa-boxes-stacked':       '📦',
  'fa-table':               '🪑',
  'fa-table-cells':         '⊞',
  'fa-chart-pie':           '🥧',
  'fa-gauge':               '📊',
  'fa-list-check':          '✅',
  'fa-clipboard-list':      '📋',
  'fa-clipboard-check':     '✅',
  'fa-note-sticky':         '📝',
  'fa-file-lines':          '📄',
  'fa-circle-check':        '✅',
  'fa-circle-xmark':        '❌',
  'fa-triangle-exclamation':'⚠️',
  'fa-ban':                 '🚫',
  'fa-shield-halved':       '🛡️',
  'fa-key':                 '🔑',
  'fa-user-plus':           '👤',
  'fa-user-minus':          '👤',
  'fa-user-group':          '👥',
  'fa-address-book':        '📓',
  'fa-id-card':             '🪪',
  'fa-briefcase':           '💼',
  'fa-shop':                '🏪',
  'fa-store-slash':         '🚫',
  'fa-location-dot':        '📍',
  'fa-map':                 '🗺️',
  'fa-truck-ramp-box':      '🚛',
  'fa-van-shuttle':         '🚐',
  'fa-warehouse':           '🏭',
  'fa-industry':            '🏭',
  'fa-gear':                '⚙️',
  'fa-gears':               '⚙️',
  'fa-screwdriver-wrench':  '🔧',
  'fa-hammer':              '🔨',
  'fa-toolbox':             '🧰',
  'fa-plug':                '🔌',
  'fa-server':              '🖥️',
  'fa-network-wired':       '🔗',
  'fa-wifi':                '📶',
  'fa-signal':              '📶',
  'fa-mobile-screen':       '📱',
  'fa-tablet-screen-button':'📱',
  'fa-laptop':              '💻',
  'fa-desktop':             '🖥️',
  'fa-keyboard':            '⌨️',
  'fa-computer-mouse':      '🖱️',
  'fa-headset':             '🎧',
  'fa-microphone':          '🎤',
  'fa-camera':              '📷',
  'fa-video':               '📹',
  'fa-tv':                  '📺',
  'fa-satellite-dish':      '📡',
  'fa-cloud':               '☁️',
  'fa-cloud-arrow-up':      '☁️',
  'fa-cloud-arrow-down':    '☁️',
  'fa-floppy-disk':         '💾',
  'fa-hard-drive':          '💿',
  'fa-sd-card':             '💾',
  'fa-usb':                 '🔌',
  'fa-link':                '🔗',
  'fa-link-slash':          '🔗',
  'fa-right-to-bracket':    '🔐',
  'fa-right-from-bracket':  '🚪',
  'fa-power-off':           '⏻',
  'fa-rotate':              '🔄',
  'fa-rotate-left':         '↩️',
  'fa-rotate-right':        '↪️',
  'fa-arrows-rotate':       '🔄',
  'fa-circle-info':         'ℹ️',
  'fa-question':            '❓',
  'fa-exclamation':         '❗',
  'fa-check':               '✅',
  'fa-xmark':               '✖️',
  'fa-plus':                '➕',
  'fa-minus':               '➖',
  'fa-pen':                 '✏️',
  'fa-pen-to-square':       '✏️',
  'fa-copy':                '📋',
  'fa-paste':               '📋',
  'fa-scissors':            '✂️',
  'fa-share':               '↗️',
  'fa-share-nodes':         '↗️',
  'fa-arrow-up':            '⬆️',
  'fa-arrow-down':          '⬇️',
  'fa-arrow-left':          '⬅️',
  'fa-arrow-right':         '➡️',
  'fa-sale':                '🏷️',
  'fa-shopping-cart':       '🛒',
  'fa-shopping-bag':        '🛍️',
  'fa-basket-shopping':     '🛒',
  'fa-cart-shopping':       '🛒',
  // ── previously missing ──────────────────
  'fa-sitemap':             '🏗️',
  'fa-image':               '🖼️',
  'fa-qrcode':              '📱',
  'fa-building':            '🏢',
  'fa-store':               '🏪',
  'fa-map-marker-alt':      '📍',
  'fa-phone':               '📞',
  'fa-globe':               '🌐',
  'fa-calendar':            '📅',
  'fa-clock':               '🕐',
  'fa-star':                '⭐',
  'fa-heart':               '❤️',
  'fa-bell':                '🔔',
  'fa-search':              '🔍',
  'fa-filter':              '🔽',
  'fa-download':            '⬇️',
  'fa-upload':              '⬆️',
  'fa-print':               '🖨️',
  'fa-edit':                '✏️',
  'fa-trash-alt':           '🗑️',
  'fa-eye':                 '👁️',
  'fa-times':               '❌',
  'fa-info-circle':         'ℹ️',
};

const getIcon = (faClass) => {
  if (!faClass) return '•';
  if (FA_TO_EMOJI[faClass]) return FA_TO_EMOJI[faClass];
  // Fallback: try partial match
  const key = Object.keys(FA_TO_EMOJI).find(k => faClass.includes(k.replace('fa-', '')));
  return key ? FA_TO_EMOJI[key] : '🔹';
};

function buildMenuTree(menus) {
  const map = {};
  const roots = [];
  menus.forEach(m => { map[m.menu_id] = { ...m, children: [] }; });
  menus.forEach(m => {
    if (m.parentmenuid && map[m.parentmenuid]) {
      map[m.parentmenuid].children.push(map[m.menu_id]);
    } else {
      roots.push(map[m.menu_id]);
    }
  });
  return roots;
}

function MenuItem({ item, collapsed, activePage, onChange, depth = 0 }) {
  const hasChildren = item.children && item.children.length > 0;
  const isActive    = activePage === item.menuurl;
  const isChildActive = hasChildren && item.children.some(c =>
    activePage === c.menuurl || c.children?.some(gc => activePage === gc.menuurl)
  );
  const [open, setOpen] = useState(isChildActive);

  const handleClick = () => {
    if (hasChildren) setOpen(!open);
    else onChange(item.menuurl, item);
  };

  // Parent group (has children, top-level) — render as section header
  if (hasChildren && depth === 0 && !collapsed) {
    return (
      <div className="menu-item-wrap" style={{ marginTop: 6 }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '7px 12px', border: 'none',
            cursor: 'pointer', borderRadius: 8,
            background: isChildActive ? 'rgba(124,58,237,.06)' : 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15 }}>{getIcon(item.menuicon)}</span>
            <span style={{
              fontSize: 12, fontWeight: 700, color: isChildActive ? '#7c3aed' : '#6d4fa8',
              letterSpacing: '.02em',
            }}>{item.menuname}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              fontSize: 10, background: isChildActive ? '#ede9fe' : '#f0ecff',
              color: isChildActive ? '#7c3aed' : '#9880c4',
              padding: '1px 6px', borderRadius: 10, fontWeight: 700,
            }}>{item.children.length}</span>
            <span style={{
              fontSize: 11, color: '#9880c4',
              transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s',
              display: 'inline-block',
            }}>›</span>
          </div>
        </button>

        {open && (
          <div style={{ borderLeft: '2px solid #e4d9fc', marginLeft: 20, paddingLeft: 4, marginBottom: 2 }}>
            {item.children.map(child => (
              <MenuItem
                key={child.menu_id}
                item={child}
                collapsed={false}
                activePage={activePage}
                onChange={onChange}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Leaf item or collapsed
  return (
    <div className="menu-item-wrap">
      <button
        className={`nav-item ${isActive ? 'nav-item-active' : ''} ${depth > 0 ? 'nav-item-child' : ''}`}
        onClick={handleClick}
        title={collapsed ? item.menuname : ''}
        style={{ paddingLeft: collapsed ? undefined : `${10 + depth * 14}px` }}
      >
        <span className="nav-icon">{getIcon(item.menuicon)}</span>
        {!collapsed && (
          <>
            <span className="nav-label" style={{ flex: 1 }}>{item.menuname}</span>
          </>
        )}
        {isActive && <span className="nav-indicator" />}
      </button>
    </div>
  );
}

export default function Sidebar({ activePage, onChange, onLogout }) {
  const { user, menus } = useApp();
  const [collapsed, setCollapsed] = useState(false);

  const initials = user
    ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase()
    : '?';
  const roleBadge = user?.is_super_admin ? 'Super Admin' : user?.is_admin ? 'Admin' : 'Staff';
  const menuTree = buildMenuTree(menus || []);

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-icon">🍴</div>
        {!collapsed && (
          <div className="brand-text">
            <span className="brand-name">Restaurant MS</span>
            <span className="brand-tagline">Management Suite</span>
          </div>
        )}
        <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <nav className="sidebar-nav">
        {menuTree.length === 0
          ? (!collapsed && <div className="sidebar-empty">No menus assigned</div>)
          : menuTree.map(item => (
            <MenuItem
              key={item.menu_id}
              item={item}
              collapsed={collapsed}
              activePage={activePage}
              onChange={onChange}
            />
          ))
        }
      </nav>

      <div className={`sidebar-user ${collapsed ? 'sidebar-user-collapsed' : ''}`}>
        <div className="user-avatar-sm">{initials}</div>
        {!collapsed && (
          <div className="user-info-sm">
            <div className="user-name-sm">{user?.first_name} {user?.last_name}</div>
            <div className="user-role-sm">{roleBadge}</div>
          </div>
        )}
        <button
          className={collapsed ? 'logout-btn-collapsed' : 'logout-btn'}
          onClick={onLogout}
          title="Logout"
        >⏻</button>
      </div>
    </aside>
  );
}
