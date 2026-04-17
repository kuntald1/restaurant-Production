// Add this component to your main layout (App.jsx or Layout component)
// It shows a warning banner when subscription expires in 3 days

import { useEffect, useState } from 'react';
import { useApp } from '../context/useApp';

export function SubscriptionExpiryBanner() {
  const { user } = useApp();
  const [warnings, setWarnings] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user?.company_unique_id || dismissed) return;
    const cid = user.company_unique_id;
    const isSA = user.is_super_admin;
    fetch(`/subscriptions/expirywarnings/${cid}?is_super_admin=${isSA}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setWarnings(data || []))
      .catch(() => {});
  }, [user, dismissed]);

  if (!warnings.length || dismissed) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 240, right: 0, zIndex: 200,
      background: '#92400e', color: '#fef3c7',
      padding: '10px 20px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', borderTop: '1px solid #b45309',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {warnings.length === 1
            ? `Subscription for "${warnings[0].company_name}" expires on ${warnings[0].end_date?.slice(0,10)} — Renew now!`
            : `${warnings.length} subscriptions expiring soon — check Subscriptions page`
          }
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <a href="#/subscriptions" style={{
          background: '#fef3c7', color: '#92400e', padding: '5px 14px',
          borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: 'none',
        }}>Renew Now</a>
        <button onClick={() => setDismissed(true)} style={{
          background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
          color: '#fef3c7', padding: '5px 10px', borderRadius: 6,
          fontSize: 12, cursor: 'pointer',
        }}>Dismiss</button>
      </div>
    </div>
  );
}
