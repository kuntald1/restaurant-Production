import { useEffect, useState } from 'react';
import { companyAPI } from '../services/api';
import { Spinner, PageHeader } from '../components/UI';
import { useApp } from '../context/useApp';

const BASE = '';

// Safely resolve image URL — handles both full URLs and relative paths
function resolveImageUrl(value) {
  if (!value) return null;
  // Already a full URL — use as-is
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  // Relative path — prepend base
  return `${BASE}${value.startsWith('/') ? '' : '/'}${value}`;
}

const ImageUploader = ({ label, icon, currentUrl, onUpload, onDelete, uploading }) => (
  <div className="image-card">
    <div className="image-card-header">
      <span className="image-icon">{icon}</span>
      <h3>{label}</h3>
    </div>
    <div className="image-preview">
      {currentUrl
        ? <img src={currentUrl} alt={label} onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
        : null}
      <div className="image-placeholder" style={{ display: currentUrl ? 'none' : 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 32 }}>{icon}</span>
        <span>No image uploaded</span>
      </div>
    </div>
    {currentUrl && (
      <div className="image-url-chip" title={currentUrl}>
        🔗 {currentUrl.split('/').pop()}
      </div>
    )}
    <div className="image-actions">
      <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
        📤 {uploading ? 'Uploading…' : 'Upload'}
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onUpload} disabled={uploading} />
      </label>
      {currentUrl && (
        <button className="btn btn-sm btn-danger-ghost" onClick={onDelete}>🗑️ Delete</button>
      )}
    </div>
  </div>
);

export default function Images() {
  const { selectedCompany, showToast } = useApp();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState({ logo: false, favicon: false, image: false });

  const load = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const data = await companyAPI.getById(selectedCompany.company_id);
      setCompany(data);
      // Debug: log what fields are returned
      console.log('Company image fields:', {
        logo_file_name:     data.logo_file_name,
        fav_icon_file_name: data.fav_icon_file_name,
        image_file_path:    data.image_file_path,
      });
    } catch (e) {
      showToast('Failed to load company details', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [selectedCompany]);

  const uid = selectedCompany?.company_unique_id;

  const handleUpload = (type) => async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(u => ({ ...u, [type]: true }));
    try {
      let result;
      if (type === 'logo')    result = await companyAPI.uploadLogo(uid, file);
      else if (type === 'favicon') result = await companyAPI.uploadFavicon(uid, file);
      else                    result = await companyAPI.uploadImage(uid, file);

      console.log(`${type} upload response:`, result);
      showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} uploaded successfully!`);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
    setUploading(u => ({ ...u, [type]: false }));
  };

  const handleDelete = (type) => async () => {
    try {
      if (type === 'logo')         await companyAPI.deleteLogo(uid);
      else if (type === 'favicon') await companyAPI.deleteFavicon(uid);
      else                         await companyAPI.deleteImage(uid);
      showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted`);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
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

  // Resolve URLs safely — handles full URLs stored in DB or relative paths
  const logoUrl    = resolveImageUrl(company?.logo_file_name);
  const faviconUrl = resolveImageUrl(company?.fav_icon_file_name);

  return (
    <div className="page">
      <PageHeader
        title="Company Images"
        subtitle={`Manage images for ${selectedCompany.name}`}
      />

      {loading ? <Spinner /> : (
        <div className="images-grid">
          <ImageUploader
            label="Logo"
            icon="🏷️"
            currentUrl={logoUrl}
            onUpload={handleUpload('logo')}
            onDelete={handleDelete('logo')}
            uploading={uploading.logo}
          />
          <ImageUploader
            label="Favicon"
            icon="⭐"
            currentUrl={faviconUrl}
            onUpload={handleUpload('favicon')}
            onDelete={handleDelete('favicon')}
            uploading={uploading.favicon}
          />
          <ImageUploader
            label="Main Image"
            icon="🖼️"
            currentUrl={resolveImageUrl(company?.image_file_path)}
            onUpload={handleUpload('image')}
            onDelete={handleDelete('image')}
            uploading={uploading.image}
          />
        </div>
      )}

      {/* Debug panel — shows raw field values */}
      {company && (
        <div className="image-debug-panel">
          <div className="image-debug-title">📋 Raw field values from API</div>
          {[
            ['logo_file_name (Logo)',       company.logo_file_name],
            ['fav_icon_file_name (Favicon)', company.fav_icon_file_name],
            ['image_file_path (Image)',      company.image_file_path],
          ].map(([key, val]) => (
            <div key={key} className="image-debug-row">
              <span className="image-debug-key">{key}</span>
              <span className="image-debug-val">{val || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
