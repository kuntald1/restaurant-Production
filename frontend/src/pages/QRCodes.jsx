import { useEffect, useState } from 'react';
import { qrAPI } from '../services/api';
import { Modal, Badge, Spinner, PageHeader, FormField, Select, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const BASE = 'https://restaurantbackend-production-8e87.up.railway.app';

function resolveImageUrl(value) {
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return `${BASE}${value.startsWith('/') ? '' : '/'}${value}`;
}

const QR_TYPES = ['upi', 'gpay', 'phonepe', 'paytm', 'other'];

const QR_TYPE_META = {
  upi:     { icon: '💳', color: '#6c47ff', label: 'UPI' },
  gpay:    { icon: '🟢', color: '#1a73e8', label: 'Google Pay' },
  phonepe: { icon: '🟣', color: '#5f259f', label: 'PhonePe' },
  paytm:   { icon: '🔵', color: '#002970', label: 'Paytm' },
  other:   { icon: '📱', color: '#374151', label: 'Other' },
};

export default function QRCodes() {
  const { selectedCompany, showToast } = useApp();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);   // 'create' | 'upload' | null
  const [activeQR, setActiveQR] = useState(null);
  const [form, setForm] = useState({ type: 'upi', is_active: true });
  const [confirm, setConfirm] = useState(null);
  const [confirmImageDelete, setConfirmImageDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState({});

  const uid = selectedCompany?.company_unique_id;

  const load = async () => {
    if (!uid) return;
    setLoading(true);
    try { setData(await qrAPI.getAll(uid)); } catch { setData([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [selectedCompany]);

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (activeQR) {
        await qrAPI.update(uid, activeQR.company_payment_qr_id, form);
        showToast('QR updated!');
      } else {
        await qrAPI.create(uid, { ...form, image_url: '' });
        showToast('QR created! Now upload its image using the 📤 button.');
      }
      setModal(null);
      setActiveQR(null);
      load();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  const handleUploadImage = async (qrId, file) => {
    if (!file) return;
    setUploading(u => ({ ...u, [qrId]: true }));
    try {
      await qrAPI.uploadImage(uid, qrId, file);
      showToast('QR image uploaded successfully!');
      load();
    } catch (err) { showToast(err.message, 'error'); }
    setUploading(u => ({ ...u, [qrId]: false }));
  };

  const handleDeleteImage = async (qrId) => {
    try {
      await qrAPI.deleteImage(uid, qrId);
      showToast('QR image deleted');
      load();
    } catch (err) { showToast(err.message, 'error'); }
    setConfirmImageDelete(null);
  };

  const handleDeleteQR = async (id) => {
    try {
      await qrAPI.delete(uid, id);
      showToast('QR record deleted');
      load();
    } catch (err) { showToast(err.message, 'error'); }
    setConfirm(null);
  };

  if (!selectedCompany) return (
    <div className="page">
      <div className="empty-state">
        <div className="empty-icon">🏢</div>
        <h3>No Company Selected</h3>
        <p>Please select a company from the Companies page first.</p>
      </div>
    </div>
  );

  return (
    <div className="page">
      <PageHeader
        title="Payment QR Codes"
        subtitle={`Manage QR codes for ${selectedCompany.name}`}
        action={
          <button className="btn btn-primary" onClick={() => {
            setForm({ type: 'upi', is_active: true });
            setActiveQR(null);
            setModal('create');
          }}>
            + New QR Code
          </button>
        }
      />

      {/* How it works hint */}
      <div className="qr-howto">
        <span className="qr-howto-step"><span className="qr-howto-num">1</span> Click <strong>+ New QR Code</strong> to create a record</span>
        <span className="qr-howto-arrow">→</span>
        <span className="qr-howto-step"><span className="qr-howto-num">2</span> Click <strong>📤 Upload QR Image</strong> on the card to attach the image</span>
        <span className="qr-howto-arrow">→</span>
        <span className="qr-howto-step"><span className="qr-howto-num">3</span> Image is saved under <strong>/qr/</strong> folder on the server</span>
      </div>

      {loading ? <Spinner /> : (
        <div className="qr-grid">
          {data.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📱</div>
              <h3>No QR Codes Yet</h3>
              <p>Click <strong>+ New QR Code</strong> above to add your first payment QR code.</p>
            </div>
          )}

          {data.map(qr => {
            const imageUrl = resolveImageUrl(qr.image_url);
            const isUploading = uploading[qr.company_payment_qr_id];
            const meta = QR_TYPE_META[qr.type] || QR_TYPE_META.other;

            return (
              <div key={qr.company_payment_qr_id} className="qr-card-v2">

                {/* Header strip */}
                <div className="qr-card-header" style={{ background: meta.color }}>
                  <span className="qr-card-type-icon">{meta.icon}</span>
                  <span className="qr-card-type-label">{meta.label}</span>
                  <Badge variant={qr.is_active ? 'success' : 'error'} style={{ marginLeft: 'auto' }}>
                    {qr.is_active ? 'Active' : 'Off'}
                  </Badge>
                </div>

                {/* QR Image area */}
                <div className="qr-image-zone">
                  {imageUrl ? (
                    <img src={imageUrl} alt={`${qr.type} QR`} className="qr-image-large"
                      onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                    />
                  ) : null}
                  <div className="qr-no-image" style={{ display: imageUrl ? 'none' : 'flex' }}>
                    <span style={{ fontSize: 40 }}>🖼️</span>
                    <span>No QR image yet</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>Use the upload button below</span>
                  </div>
                </div>

                {/* Upload button — most prominent action */}
                <div className="qr-upload-zone">
                  <label className={`qr-upload-btn ${isUploading ? 'qr-upload-btn-loading' : ''}`}>
                    {isUploading
                      ? <><span className="qr-upload-spinner" /> Uploading…</>
                      : <><span>📤</span> {imageUrl ? 'Replace QR Image' : 'Upload QR Image'}</>
                    }
                    <input
                      type="file"
                      accept="image/*,.png,.jpg,.jpeg,.svg"
                      style={{ display: 'none' }}
                      disabled={isUploading}
                      onChange={e => {
                        const file = e.target.files[0];
                        if (file) handleUploadImage(qr.company_payment_qr_id, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {imageUrl && (
                    <div className="qr-image-url-tag" title={imageUrl}>
                      ✅ {imageUrl.split('/').pop()}
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div className="qr-card-footer">
                  <button className="btn btn-sm btn-outline" onClick={() => {
                    setForm({ type: qr.type, is_active: qr.is_active });
                    setActiveQR(qr);
                    setModal('create');
                  }}>✏️ Edit</button>

                  {imageUrl && (
                    <button className="btn btn-sm btn-ghost"
                      onClick={() => setConfirmImageDelete(qr.company_payment_qr_id)}
                      title="Remove image only — keeps the QR record"
                    >🗑️ Image</button>
                  )}

                  <button className="btn btn-sm btn-danger-ghost"
                    onClick={() => setConfirm(qr.company_payment_qr_id)}
                    title="Delete entire QR record"
                  >🗑️ Record</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm delete QR record */}
      {confirm && (
        <ConfirmDialog
          message="Delete this entire QR record (and its image)?"
          onConfirm={() => handleDeleteQR(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Confirm delete image only */}
      {confirmImageDelete && (
        <ConfirmDialog
          message="Remove the QR image? The QR record will remain."
          onConfirm={() => handleDeleteImage(confirmImageDelete)}
          onCancel={() => setConfirmImageDelete(null)}
        />
      )}

      {/* Create / Edit modal */}
      {modal === 'create' && (
        <Modal title={activeQR ? 'Edit QR Code' : 'New QR Code'} onClose={() => { setModal(null); setActiveQR(null); }}>
          <form onSubmit={handleCreateOrUpdate}>
            <div className="qr-modal-info">
              ℹ️ After saving, use the <strong>📤 Upload QR Image</strong> button on the card to attach the actual QR image file.
            </div>
            <FormField label="Payment Type" required>
              <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} required>
                {QR_TYPES.map(t => (
                  <option key={t} value={t}>{QR_TYPE_META[t].icon} {QR_TYPE_META[t].label}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status">
              <Select value={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                <option value="true">✅ Active</option>
                <option value="false">⛔ Inactive</option>
              </Select>
            </FormField>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setModal(null); setActiveQR(null); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : activeQR ? 'Update QR' : 'Create QR'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
