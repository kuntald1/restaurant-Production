import { useApp } from '../context/useApp';

export const Toast = () => {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.type}`}>
      <span>{toast.type === 'success' ? '✓' : '✕'}</span>
      {toast.message}
    </div>
  );
};

export const Modal = ({ title, children, onClose, size = 'md' }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className={`modal modal-${size}`} onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <h3>{title}</h3>
        <button className="btn-icon" onClick={onClose}>✕</button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
);

export const Table = ({ columns, data, actions }) => (
  <div className="table-wrapper">
    <table className="data-table">
      <thead>
        <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}{actions && <th>Actions</th>}</tr>
      </thead>
      <tbody>
        {data.length === 0
          ? <tr><td colSpan={columns.length + (actions ? 1 : 0)} className="empty-row">No records found</td></tr>
          : data.map((row, i) => (
            <tr key={row.id || i}>
              {columns.map(c => (
                <td key={c.key}>{c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}</td>
              ))}
              {actions && <td className="actions-cell">{actions(row)}</td>}
            </tr>
          ))}
      </tbody>
    </table>
  </div>
);

export const Badge = ({ children, variant = 'default' }) => (
  <span className={`badge badge-${variant}`}>{children}</span>
);

export const Spinner = () => (
  <div className="spinner-wrap"><div className="spinner" /></div>
);

export const FormField = ({ label, required, error, children }) => (
  <div className="form-field">
    <label>{label}{required && <span className="req">*</span>}</label>
    {children}
    {error && <span className="field-error">{error}</span>}
  </div>
);

export const Input = ({ ...props }) => <input className="input" {...props} />;
export const Textarea = ({ ...props }) => <textarea className="input textarea" {...props} />;
export const Select = ({ children, ...props }) => (
  <select className="input select" {...props}>{children}</select>
);

export const ConfirmDialog = ({ message, onConfirm, onCancel, confirmLabel = 'Delete', danger = true }) => (
  <div className="modal-overlay">
    <div className="modal modal-sm">
      <div className="modal-header"><h3>Confirm Action</h3></div>
      <div className="modal-body">
        <p style={{ marginBottom: '1.5rem', color: '#555' }}>{message}</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={danger ? "btn btn-danger" : "btn btn-primary"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  </div>
);

export const PageHeader = ({ title, subtitle, action }) => (
  <div className="page-header">
    <div>
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const StatCard = ({ label, value, icon, color }) => (
  <div className="stat-card" style={{ '--accent': color }}>
    <div className="stat-icon">{icon}</div>
    <div className="stat-info">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  </div>
);
