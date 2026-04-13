export default function GenericPage({ menuItem }) {
  if (!menuItem) return null;

  return (
    <div className="page">
      <div className="generic-page-wrap">
        <div className="generic-page-icon">
          {/* Show the FA icon class as a label */}
          <span style={{ fontSize: 48 }}>🚧</span>
        </div>
        <h1 className="generic-page-title">{menuItem.menuname}</h1>
        {menuItem.menudesc && (
          <p className="generic-page-desc">{menuItem.menudesc}</p>
        )}
        <div className="generic-page-meta">
          <span className="generic-meta-chip">
            <span>🔗</span> {menuItem.menuurl}
          </span>
          {menuItem.menuicon && (
            <span className="generic-meta-chip">
              <span>🎨</span> {menuItem.menuicon}
            </span>
          )}
          {menuItem.parentmenuid && (
            <span className="generic-meta-chip">
              <span>📁</span> Sub-menu of #{menuItem.parentmenuid}
            </span>
          )}
        </div>
        <div className="generic-page-badge">
          Page under development — coming soon
        </div>
      </div>
    </div>
  );
}
