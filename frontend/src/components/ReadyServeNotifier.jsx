import { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '../context/useApp';
import { posOrderAPI, posKotAPI } from '../services/api';

// Kitchen page URLs — alert is muted while viewing these (the cook just marked it ready)
const KITCHEN_URLS = new Set(['/kitchen', '/kitchen/display', '/pos/kitchen']);

// Distinct rising 3-note chime via Web Audio (same technique Kitchen.jsx uses)
function playReadySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const beep = (freq, start, dur) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.5, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur + 0.05);
    };
    beep(660, 0, 0.15);
    beep(880, 0.18, 0.15);
    beep(1180, 0.36, 0.30);
  } catch (e) { /* autoplay not allowed yet — silent */ }
}

export default function ReadyServeNotifier({ activePage }) {
  const { selectedCompany, user } = useApp();
  const cid = selectedCompany?.company_unique_id || user?.company_unique_id;

  const [notes, setNotes] = useState([]);     // visible cards
  const seenReady = useRef(new Set());          // kot_item_ids already handled
  const seeded    = useRef(false);              // first poll seeds silently
  const timerRef  = useRef(null);
  const mutedRef  = useRef(false);
  mutedRef.current = KITCHEN_URLS.has(activePage);

  const poll = useCallback(async () => {
    if (!cid) return;
    try {
      const orders = await posOrderAPI.getRunning(cid);
      if (!Array.isArray(orders) || orders.length === 0) return;

      const orderNum = {};
      orders.forEach(o => { orderNum[o.order_id] = o.order_number; });

      const kotResults = await Promise.allSettled(
        orders.map(o => posKotAPI.getByOrder(o.order_id).catch(() => []))
      );

      const readyItems = [];
      kotResults.forEach(r => {
        const kots = r.status === 'fulfilled' ? (r.value || []) : [];
        kots.forEach(kot => {
          (kot.kot_items || []).forEach(ki => {
            if (ki.kot_item_status === 'ready') {
              readyItems.push({
                kot_item_id:  ki.kot_item_id,
                item_name:    ki.item_name,
                qty:          ki.quantity,
                is_veg:       ki.is_veg !== false,
                order_number: orderNum[kot.order_id] || `#${kot.order_id}`,
              });
            }
          });
        });
      });

      // First poll after login: remember what's already ready, don't alert
      if (!seeded.current) {
        readyItems.forEach(it => seenReady.current.add(it.kot_item_id));
        seeded.current = true;
        return;
      }

      const fresh = readyItems.filter(it => !seenReady.current.has(it.kot_item_id));
      fresh.forEach(it => seenReady.current.add(it.kot_item_id));

      if (fresh.length > 0 && !mutedRef.current) {
        playReadySound();
        const now = Date.now();
        setNotes(prev => [
          ...fresh.map(it => ({ ...it, id: `${it.kot_item_id}-${now}`, ts: now })),
          ...prev,
        ].slice(0, 8));
      }
    } catch (e) { /* silent — background poll */ }
  }, [cid]);

  // Poll loop (lives in the app shell → never reloads the page)
  useEffect(() => {
    if (!cid) return;
    poll();
    timerRef.current = setInterval(poll, 6000);
    return () => clearInterval(timerRef.current);
  }, [cid, poll]);

  // Auto-dismiss cards after 60s
  useEffect(() => {
    if (notes.length === 0) return;
    const id = setInterval(() => {
      const cutoff = Date.now() - 60000;
      setNotes(prev => prev.filter(n => n.ts > cutoff));
    }, 5000);
    return () => clearInterval(id);
  }, [notes.length]);

  const dismiss = (id) => setNotes(prev => prev.filter(n => n.id !== id));

  if (notes.length === 0) return null;

  return (
    <div style={S.wrap}>
      {notes.map(n => (
        <div key={n.id} style={S.card} onClick={() => dismiss(n.id)} title="Tap to dismiss">
          <div style={S.head}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>🍽️ Ready to serve</span>
            <button onClick={(e) => { e.stopPropagation(); dismiss(n.id); }} style={S.x}>✕</button>
          </div>
          <div style={{ fontSize: 14, marginTop: 4 }}>
            {n.is_veg ? '🟢' : '🔴'} <strong>{n.qty}× {n.item_name}</strong>
          </div>
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
            Order {n.order_number} — pick up from kitchen
          </div>
        </div>
      ))}
    </div>
  );
}

const S = {
  wrap: { position: 'fixed', top: 74, right: 20, zIndex: 9998, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, pointerEvents: 'auto' },
  card: { background: '#065f46', color: '#fff', borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.28)', cursor: 'pointer', borderLeft: '4px solid #34d399' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  x:    { background: 'transparent', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', opacity: 0.8, lineHeight: 1 },
};
