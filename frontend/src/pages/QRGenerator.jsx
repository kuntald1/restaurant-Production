import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/useApp';

export default function QRGenerator() {
  const { selectedCompany } = useApp();
  const [tables, setTables] = useState([]);

  useEffect(() => {
    if (!selectedCompany) return;
    fetch(`/pos/tables/${selectedCompany.company_unique_id}`)
      .then(r => r.json())
      .then(data => setTables(data || []))
      .catch(() => {});
  }, [selectedCompany]);

  const menuUrl = `https://currycloud.mooo.com/menu/${selectedCompany?.company_unique_id}`;

  const printQR = (tableName) => {
    const w = window.open('', '_blank', 'width=400,height=500');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QR - ${tableName}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>body{font-family:sans-serif;text-align:center;padding:20px}h2{color:#1a3a1c}p{color:#666;font-size:13px}</style>
</head><body>
<h2>${selectedCompany?.name || 'Restaurant'}</h2>
<p>Table: <strong>${tableName}</strong></p>
<div id="qr" style="display:flex;justify-content:center;margin:20px 0"></div>
<p>Scan to view our menu</p>
<p style="font-size:11px;color:#aaa">${menuUrl}</p>
<br/><button onclick="window.print()" style="padding:8px 24px;background:#1a3a1c;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨️ Print</button>
<script>new QRCode(document.getElementById("qr"),{text:"${menuUrl}",width:200,height:200,colorDark:"#1a3a1c",colorLight:"#ffffff"});</script>
</body></html>`);
    w.document.close();
  };

  if (!selectedCompany) return <div style={{ padding: 40, textAlign: 'center' }}>Select a company first</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>📱 Menu QR Codes</h2>
      <p style={{ color: '#888', marginBottom: 24 }}>Print QR codes for each table. Customers scan to view the menu.</p>

      {/* Main QR */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 16, padding: 24, marginBottom: 24, textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>🔗 Your Menu URL</div>
        <div style={{ background: '#fff', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#1a3a1c', fontWeight: 600, marginBottom: 16, wordBreak: 'break-all' }}>
          {menuUrl}
        </div>
        <div id="main-qr" style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <QRCodeDisplay url={menuUrl} size={200} />
        </div>
        <button style={{ padding: '10px 24px', background: '#1a3a1c', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          onClick={() => printQR('All Tables')}>
          🖨️ Print General QR
        </button>
      </div>

      {/* Per Table QR */}
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>🪑 Per Table QR Codes</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {tables.filter(t => t.is_active).map(t => (
          <div key={t.table_id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🪑 {t.table_name}</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>{t.seats} seats · {t.section || t.section_type}</div>
            <QRCodeDisplay url={menuUrl} size={120} />
            <button style={{ marginTop: 12, width: '100%', padding: '8px', background: '#1a3a1c', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              onClick={() => printQR(t.table_name)}>
              🖨️ Print QR
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// QR Code component using Google Charts API (no npm needed)
function QRCodeDisplay({ url, size = 150 }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&color=1a3a1c&bgcolor=ffffff`;
  return (
    <img src={qrUrl} alt="QR Code" style={{ width: size, height: size, borderRadius: 8 }} />
  );
}