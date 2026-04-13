import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/useApp';
import { posKotAPI, posOrderAPI } from '../services/api';

const STATUS_META = {
  kot_open:     { label: 'KOT Open',   bg: '#fef3c7', border: '#f59e0b', color: '#92400e', icon: '🟡', next: 'kot_inprocess', nextLabel: '▶ Start Cooking' },
  kot_inprocess:{ label: 'In Kitchen', bg: '#dbeafe', border: '#3b82f6', color: '#1e40af', icon: '🔵', next: 'ready',         nextLabel: '✓ Mark Ready' },
  ready:        { label: 'Ready',      bg: '#d1fae5', border: '#10b981', color: '#065f46', icon: '🟢', next: null,            nextLabel: null },
  cancelled:    { label: 'Cancelled',  bg: '#fee2e2', border: '#ef4444', color: '#991b1b', icon: '🔴', next: null,            nextLabel: null },
};

const ITEM_STATUS_META = {
  kot_open:     { bg: '#fef9c3', color: '#92400e', label: 'Pending' },
  kot_inprocess:{ bg: '#dbeafe', color: '#1e40af', label: 'Cooking' },
  ready:        { bg: '#d1fae5', color: '#065f46', label: 'Ready'   },
};

export default function Kitchen() {
  const { selectedCompany, showToast } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [kots,     setKots]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(null); // kot_id being updated
  const [filter,   setFilter]   = useState('active'); // active | kot_open | kot_inprocess | ready | all
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef(null);

  // ── Load all KOTs from running orders ────────────────────
  const load = useCallback(async () => {
    if (!cid) return;
    try {
      // Get all running orders then their KOTs
      const orders = await posOrderAPI.getRunning(cid);
      // Fetch full order details (includes table_name, table_id) + KOTs in parallel
      const [fullOrderResults, kotResults] = await Promise.all([
        Promise.allSettled(orders.map(o => posOrderAPI.getById(o.order_id))),
        Promise.allSettled(orders.map(o => posKotAPI.getByOrder(o.order_id).catch(() => []))),
      ]);
      // Build order_id → full order map
      const orderMap = {};
      fullOrderResults.forEach((r, i) => {
        const o = r.status === 'fulfilled' ? r.value : orders[i];
        orderMap[o.order_id] = o;
      });
      const allKots = kotResults.flatMap((r, i) => {
        const kots = r.status === 'fulfilled' ? (r.value || []) : [];
        return kots.map(kot => ({ ...kot, order: orderMap[kot.order_id] || orders[i] || null }));
      });
      // Sort: kot_open first, then kot_inprocess, then ready
      const ORDER = { kot_open: 0, kot_inprocess: 1, ready: 2, cancelled: 3 };
      allKots.sort((a, b) => (ORDER[a.kot_status] ?? 9) - (ORDER[b.kot_status] ?? 9) || new Date(a.sent_to_kitchen_at) - new Date(b.sent_to_kitchen_at));
      setKots(allKots);
    } catch (e) { /* silent — auto refresh */ }
  }, [cid]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [cid]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!autoRefresh) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, 15000);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, load]);

  // ── Update KOT status ─────────────────────────────────────
  const updateKotStatus = async (kot, newStatus) => {
    setSaving(kot.kot_id);
    try {
      await posKotAPI.updateStatus(kot.kot_id, { kot_status: newStatus });
      await load();
      const labels = { kot_inprocess: '🍳 Cooking started!', ready: '✅ KOT marked ready!' };
      showToast(labels[newStatus] || 'Status updated');
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(null);
  };

  // ── Update single item status ─────────────────────────────
  const updateItemStatus = async (kotItemId, newStatus) => {
    setSaving(kotItemId);
    try {
      await posKotAPI.updateItemStatus(kotItemId, { kot_item_status: newStatus });
      await load();
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(null);
  };

  // ── Print KOT Ticket ──────────────────────────────────────
  const printKotTicket = (kot) => {
    const order   = kot.order;
    const company = selectedCompany;
    const w = window.open('', '_blank', 'width=360,height=540');
    if (!w) { showToast('Allow popups to print KOT', 'error'); return; }
    const items = kot.kot_items || [];
    const now   = new Date().toLocaleString('en-IN');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>KOT - ${kot.kot_number}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',monospace;font-size:13px;color:#111;width:300px;margin:0 auto;padding:10px}
  .center{text-align:center}.bold{font-weight:700}.big{font-size:18px;font-weight:900}
  .line{border-top:2px dashed #333;margin:8px 0}.line-thin{border-top:1px dashed #aaa;margin:6px 0}
  .row{display:flex;justify-content:space-between;padding:2px 0}
  .item{padding:6px 0;border-bottom:1px dotted #ccc}
  .item-name{font-size:14px;font-weight:700}
  .item-row{display:flex;justify-content:space-between;align-items:center}
  .item-qty{font-size:22px;font-weight:900;min-width:36px;text-align:right}
  .note{font-size:11px;color:#555;padding-left:8px;margin-top:2px}
  .badge{display:inline-block;border:2px solid #111;padding:3px 14px;font-weight:700;font-size:13px;margin-top:6px}
  @media print{body{width:100%}button{display:none}}
</style></head><body>
<div class="center">
  <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Kitchen Order Ticket</div>
  <div class="big">${kot.kot_number}</div>
  <div style="font-size:11px;margin-top:2px">${company?.name || 'Restaurant OS'}</div>
</div>
<div class="line"></div>
<div class="row"><span class="bold">Order:</span><span>${order?.order_number || '—'}</span></div>
<div class="row"><span class="bold">Table:</span><span>${
  kot.table_name && kot.table_name !== '' ? kot.table_name
  : order?.table_name && order.table_name !== '' ? order.table_name
  : order?.order_type === 'dine_in' ? 'Dine In'
  : order?.order_type === 'take_away' ? 'Take Away'
  : order?.order_type === 'delivery' ? 'Delivery'
  : '—'
}</span></div>
<div class="row"><span class="bold">Type:</span><span>${order?.order_type?.replace(/_/g,' ') || '—'}</span></div>
<div class="row"><span class="bold">Time:</span><span>${now}</span></div>
<div class="row"><span class="bold">Covers:</span><span>${order?.covers || '—'}</span></div>
<div class="row"><span class="bold">Print #:</span><span>${(kot.print_count || 0) + 1}</span></div>
<div class="line"></div>
<div class="bold" style="margin-bottom:6px;font-size:14px">ITEMS (${items.length})</div>
${items.map(it => `
<div class="item">
  <div class="item-row">
    <div class="item-name">${it.is_veg === false ? '🔴' : '🟢'} ${it.item_name || ''}</div>
    <div class="item-qty">x${it.quantity}</div>
  </div>
  ${it.notes ? `<div class="note">📝 ${it.notes}</div>` : ''}
</div>`).join('')}
<div class="line"></div>
${kot.notes ? `<div style="padding:4px 0"><span class="bold">Note: </span>${kot.notes}</div><div class="line-thin"></div>` : ''}
<div class="center" style="margin-top:6px">
  <div class="badge">${(kot.kot_status || 'KOT OPEN').toUpperCase().replace(/_/g,' ')}</div>
</div>
<br/>
<div class="center">
  <button onclick="window.print();setTimeout(()=>window.close(),600)" style="padding:8px 24px;background:#111;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;font-family:inherit">🖨️ Print KOT</button>
</div>
</body></html>`);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch {} }, 500);
  };

  // ── Reprint ───────────────────────────────────────────────
  const reprint = async (kot) => {
    try {
      await posKotAPI.print(kot.kot_id);
      await load();
      printKotTicket(kot);
      showToast('KOT reprinted');
    } catch (e) { showToast(e.message, 'error'); }
  };

  // ── Filtered KOTs ─────────────────────────────────────────
  const filtered = kots.filter(k => {
    if (filter === 'active') return ['kot_open', 'kot_inprocess'].includes(k.kot_status);
    if (filter === 'all')    return true;
    return k.kot_status === filter;
  });

  // ── Stats ─────────────────────────────────────────────────
  const stats = {
    open:      kots.filter(k => k.kot_status === 'kot_open').length,
    inprocess: kots.filter(k => k.kot_status === 'kot_inprocess').length,
    ready:     kots.filter(k => k.kot_status === 'ready').length,
  };

  const elapsed = (ts) => {
    if (!ts) return '';
    const mins = Math.floor((Date.now() - new Date(ts)) / 60000);
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 min ago';
    return `${mins} mins ago`;
  };

  if (!selectedCompany) return (
    <div style={S.page}>
      <div style={S.empty}>
        <div style={{ fontSize: 48 }}>🏢</div>
        <div style={{ fontWeight: 600, marginTop: 12 }}>No Company Selected</div>
      </div>
    </div>
  );

  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🍳</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text-1)' }}>Kitchen Display</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Live KOT status board</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: 'Pending',  value: stats.open,      bg: '#fef3c7', color: '#92400e' },
            { label: 'Cooking',  value: stats.inprocess,  bg: '#dbeafe', color: '#1e40af' },
            { label: 'Ready',    value: stats.ready,      bg: '#d1fae5', color: '#065f46' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, color: s.color, padding: '6px 16px', borderRadius: 10, textAlign: 'center', minWidth: 70 }}>
              <div style={{ fontWeight: 800, fontSize: 22 }}>{s.value}</div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={{ ...S.iconBtn, background: autoRefresh ? 'var(--primary-light)' : 'var(--bg)', color: autoRefresh ? 'var(--primary)' : 'var(--text-3)' }}
            onClick={() => setAutoRefresh(a => !a)} title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}>
            {autoRefresh ? '⏱ Auto' : '⏸ Paused'}
          </button>
          <button style={S.iconBtn} onClick={load} title="Refresh now">🔄 Refresh</button>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div style={S.filterRow}>
        {[
          { val: 'active',       label: '🔥 Active',       count: stats.open + stats.inprocess },
          { val: 'kot_open',     label: '🟡 Pending',      count: stats.open },
          { val: 'kot_inprocess',label: '🔵 Cooking',      count: stats.inprocess },
          { val: 'ready',        label: '🟢 Ready',        count: stats.ready },
          { val: 'all',          label: '📋 All',          count: kots.length },
        ].map(tab => (
          <button key={tab.val}
            style={{ ...S.filterBtn, ...(filter === tab.val ? S.filterActive : {}) }}
            onClick={() => setFilter(tab.val)}>
            {tab.label}
            <span style={{ marginLeft: 6, background: filter === tab.val ? 'rgba(255,255,255,.3)' : 'var(--border)', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── KOT Grid ── */}
      {loading ? (
        <div style={S.empty}><div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div><div>Loading KOTs…</div></div>
      ) : filtered.length === 0 ? (
        <div style={S.empty}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 600, fontSize: 18 }}>
            {filter === 'active' ? 'No active KOTs — kitchen is clear!' : 'No KOTs found'}
          </div>
          <div style={{ color: 'var(--text-3)', marginTop: 6, fontSize: 13 }}>
            {filter === 'active' ? 'New orders will appear here automatically' : 'Try a different filter'}
          </div>
        </div>
      ) : (
        <div style={S.grid}>
          {filtered.map(kot => {
            const sm = STATUS_META[kot.kot_status] || STATUS_META.kot_open;
            const isSaving = saving === kot.kot_id;
            const sentMins = kot.sent_to_kitchen_at ? Math.floor((Date.now() - new Date(kot.sent_to_kitchen_at)) / 60000) : 0;
            const isUrgent = sentMins >= 15 && kot.kot_status !== 'ready';
            const order = kots.find(k => k.kot_id === kot.kot_id)?.order;

            return (
              <div key={kot.kot_id} style={{
                ...S.card,
                borderColor: isUrgent ? '#ef4444' : sm.border,
                boxShadow: isUrgent ? '0 0 0 2px #fee2e2' : 'var(--shadow-sm)',
              }}>
                {/* Card header */}
                <div style={{ background: sm.bg, padding: '10px 14px', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: sm.color }}>{kot.kot_number}</div>
                    <div style={{ fontSize: 12, color: sm.color, opacity: .8, marginTop: 2 }}>
                      {kot.table_name ? `🪑 ${kot.table_name}` : '🥡 Take Away / Delivery'}
                      {order?.order_number && <span style={{ marginLeft: 8 }}>· Order {order.order_number}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...S.statusBadge, background: sm.bg, color: sm.color, border: `1px solid ${sm.border}` }}>
                      {sm.icon} {sm.label}
                    </div>
                    {isUrgent && (
                      <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, marginTop: 4 }}>
                        ⚠️ {sentMins} mins waiting!
                      </div>
                    )}
                  </div>
                </div>

                {/* Time info */}
                <div style={{ padding: '6px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-3)' }}>
                  <span>📥 Sent: {elapsed(kot.sent_to_kitchen_at)}</span>
                  {kot.kitchen_started_at && <span>🍳 Started: {elapsed(kot.kitchen_started_at)}</span>}
                  {kot.ready_at && <span>✅ Ready: {elapsed(kot.ready_at)}</span>}
                  <span style={{ marginLeft: 'auto' }}>🖨️ Printed: {kot.print_count}×</span>
                </div>

                {/* Items */}
                <div style={{ padding: '10px 14px', flex: 1 }}>
                  {(kot.kot_items || []).map(ki => {
                    const im = ITEM_STATUS_META[ki.kot_item_status] || ITEM_STATUS_META.kot_open;
                    const itemSaving = saving === ki.kot_item_id;
                    return (
                      <div key={ki.kot_item_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border-light)' }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: im.bg, color: im.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                          {ki.quantity}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ki.is_veg !== false ? '🟢' : '🔴'} {ki.item_name}
                          </div>
                          {ki.notes && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>📝 {ki.notes}</div>}
                        </div>
                        <span style={{ ...S.itemBadge, background: im.bg, color: im.color }}>{im.label}</span>

                        {/* Per-item status buttons */}
                        {ki.kot_item_status === 'kot_open' && (
                          <button style={{ ...S.itemBtn, background: '#dbeafe', color: '#1e40af' }}
                            disabled={itemSaving}
                            onClick={() => updateItemStatus(ki.kot_item_id, 'kot_inprocess')}>
                            {itemSaving ? '…' : '▶'}
                          </button>
                        )}
                        {ki.kot_item_status === 'kot_inprocess' && (
                          <button style={{ ...S.itemBtn, background: '#d1fae5', color: '#065f46' }}
                            disabled={itemSaving}
                            onClick={() => updateItemStatus(ki.kot_item_id, 'ready')}>
                            {itemSaving ? '…' : '✓'}
                          </button>
                        )}
                        {ki.kot_item_status === 'ready' && (
                          <span style={{ fontSize: 16 }}>✅</span>
                        )}
                      </div>
                    );
                  })}

                  {kot.notes && (
                    <div style={{ marginTop: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#92400e' }}>
                      📝 {kot.notes}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                  {/* Main status action */}
                  {sm.next && (
                    <button
                      style={{ flex: 1, padding: '9px', fontWeight: 700, fontSize: 13, border: 'none', borderRadius: 8, cursor: 'pointer',
                        background: sm.next === 'kot_inprocess' ? '#2563eb' : '#16a34a',
                        color: '#fff', opacity: isSaving ? .6 : 1 }}
                      disabled={isSaving}
                      onClick={() => updateKotStatus(kot, sm.next)}>
                      {isSaving ? 'Updating…' : sm.nextLabel}
                    </button>
                  )}
                  {kot.kot_status === 'ready' && (
                    <div style={{ flex: 1, textAlign: 'center', padding: '9px', fontWeight: 700, fontSize: 13, color: '#065f46', background: '#d1fae5', borderRadius: 8 }}>
                      ✅ Food Ready — Serve!
                    </div>
                  )}
                  {/* Reprint */}
                  <button style={{ ...S.iconBtn, flexShrink: 0 }} onClick={() => reprint(kot)} title="Reprint KOT">
                    🖨️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const S = {
  page:    { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)', fontFamily: 'var(--font-sans)' },
  header:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap', gap: 12 },
  filterRow: { display: 'flex', gap: 6, padding: '10px 20px', background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' },
  filterBtn:  { padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 20, background: 'var(--bg)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' },
  filterActive: { background: 'var(--primary)', color: '#fff', border: '1px solid var(--primary)', fontWeight: 700 },
  grid:    { flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, padding: 20, alignContent: 'start' },
  card:    { background: 'var(--white)', borderRadius: 12, border: '2px solid', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  empty:   { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', padding: 40 },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, display: 'inline-block' },
  itemBadge:   { fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8, flexShrink: 0 },
  itemBtn:     { width: 28, height: 28, border: 'none', borderRadius: 6, fontWeight: 800, fontSize: 14, cursor: 'pointer', flexShrink: 0 },
  iconBtn:     { padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', fontSize: 12, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' },
};
