/**
 * AdvancedPO.jsx — Advanced Purchase Order with Rule Engine (Phase 1.5)
 *
 * Tabs:
 *   1. Smart PO      — Generate AI suggestions for any existing PO
 *   2. Weather Rules — Admin configures weather × category multipliers
 *   3. Occasions     — Admin picks which festivals apply to this branch
 *   4. Accuracy      — Phase 1.5: suggestion vs actual, apply corrections
 */

import { useEffect, useState, useMemo } from 'react';
import { advPoAPI, invPoAPI, invItemAPI, invCategoryAPI } from '../services/api';
import { useInventoryNodes } from './useInventoryNodes';
import { Spinner, PageHeader, Badge } from '../components/UI';
import { useApp } from '../context/useApp';

const CONDITION_META = {
  hot:  { label: '🌡️ Hot',   color: '#ef4444', bg: '#fef2f2' },
  rain: { label: '🌧️ Rain',  color: '#3b82f6', bg: '#eff6ff' },
  cold: { label: '❄️ Cold',  color: '#8b5cf6', bg: '#faf5ff' },
};

const CARD = { background: '#ffffff', border: '1px solid #f0f0f0', borderRadius: 12, padding: '16px 18px' };

export default function AdvancedPO() {
  const { selectedCompany, allCompanies, showToast, user } = useApp();
  const cid = selectedCompany?.company_unique_id;

  const [tab, setTab] = useState('smart');

  // Shared data
  const [categories, setCategories] = useState([]);
  const [items,      setItems]      = useState([]);
  const [pos,        setPos]        = useState([]);
  const [loading,    setLoading]    = useState(false);

  const { nodes } = useInventoryNodes(cid, selectedCompany, allCompanies);

  // ── Load shared ───────────────────────────────────────────
  useEffect(() => {
    if (!cid) return;
    Promise.allSettled([
      invCategoryAPI.getAll(cid),
      invItemAPI.getAll(cid),
      invPoAPI.getAll(cid),
    ]).then(([cats, its, pos]) => {
      setCategories(cats.status === 'fulfilled' ? (cats.value || []) : []);
      setItems(its.status === 'fulfilled' ? (its.value || []) : []);
      setPos(pos.status === 'fulfilled' ? (pos.value || []) : []);
    });
  }, [cid]);

  const getCatName = id => categories.find(c => (c.category_id || c.item_category_id) === id)?.category_name || `Cat #${id}`;
  const getNodeName = id => { const n = nodes.find(n => String(n.node_id).replace('b_','') === String(id).replace('b_','')); return n?.node_name || `Node #${id}`; };

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No company selected</h3></div></div>
  );

  const tabStyle = (key) => ({
    padding: '9px 20px', border: 'none', background: 'none', cursor: 'pointer',
    fontWeight: tab === key ? 600 : 400, fontSize: 13,
    borderBottom: tab === key ? '2.5px solid #22c55e' : '2.5px solid transparent',
    color: tab === key ? '#22c55e' : 'var(--color-text-tertiary)', marginBottom: -1.5,
  });

  return (
    <div className="page">
      <PageHeader
        title="🧠 Advanced Purchase Order"
        subtitle="AI-powered quantity suggestions · weather & occasion rules · accuracy tracking"
      />

      <div style={{ display: 'flex', borderBottom: '1.5px solid var(--color-border-tertiary)', marginBottom: 24 }}>
        <button style={tabStyle('smart')}     onClick={() => setTab('smart')}>     🎯 Smart PO</button>
        <button style={tabStyle('weather')}   onClick={() => setTab('weather')}>   🌤️ Weather Rules</button>
        <button style={tabStyle('occasions')} onClick={() => setTab('occasions')}> 🎉 Occasions</button>
        <button style={tabStyle('accuracy')}  onClick={() => setTab('accuracy')}>  📊 Accuracy</button>
      </div>

      {tab === 'smart'     && <SmartPOTab     cid={cid} pos={pos} nodes={nodes} categories={categories} items={items} getNodeName={getNodeName} showToast={showToast} />}
      {tab === 'weather'   && <WeatherRulesTab cid={cid} categories={categories} getCatName={getCatName} showToast={showToast} />}
      {tab === 'occasions' && <OccasionsTab    cid={cid} categories={categories} getCatName={getCatName} showToast={showToast} />}
      {tab === 'accuracy'  && <AccuracyTab     cid={cid} getCatName={getCatName} showToast={showToast} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TAB 1: Smart PO — generate suggestions for a PO
// ══════════════════════════════════════════════════════════════
function SmartPOTab({ cid, pos, nodes, categories, items, getNodeName, showToast }) {
  const [selectedPoId, setSelectedPoId] = useState('');
  const [suggestions,  setSuggestions]  = useState([]);
  const [weather,      setWeather]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [accepting,    setAccepting]    = useState(false);
  const [editQty,      setEditQty]      = useState({});  // item_id → qty

  const selectedPo = pos.find(p => p.po_id === parseInt(selectedPoId));

  const handleGenerate = async () => {
    if (!selectedPo) return;
    setLoading(true);
    setSuggestions([]);
    try {
      const res = await advPoAPI.generateSuggestions(cid, selectedPo.node_id, selectedPo.po_id, selectedPo.po_date);
      const sugList = res.suggestions || [];
      setSuggestions(sugList);
      if (sugList.length > 0 && sugList[0].weather) setWeather(sugList[0].weather);
      // Init editQty to suggested values
      const init = {};
      sugList.forEach(s => { init[s.item_id] = s.suggested_qty; });
      setEditQty(init);
      showToast(`${sugList.length} suggestions generated!`);
    } catch (e) { showToast(e.message || 'Failed to generate', 'error'); }
    setLoading(false);
  };

  const handleAccept = async () => {
    if (!suggestions.length) return;
    setAccepting(true);
    try {
      const items = suggestions.map(s => ({
        item_id: s.item_id,
        accepted_qty: parseFloat(editQty[s.item_id] || s.suggested_qty),
      }));
      await advPoAPI.acceptSuggestions(selectedPo.po_id, items);
      showToast('Quantities accepted and saved to PO!');
    } catch (e) { showToast(e.message || 'Failed', 'error'); }
    setAccepting(false);
  };

  const draftPos = pos.filter(p => ['draft','sent'].includes(p.status));

  return (
    <div>
      {/* PO Selector */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-primary)' }}>
          Select a Purchase Order to analyse
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>PURCHASE ORDER</div>
            <select className="input" value={selectedPoId} onChange={e => { setSelectedPoId(e.target.value); setSuggestions([]); }}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 8 }}>
              <option value="">-- Select a PO --</option>
              {draftPos.map(p => (
                <option key={p.po_id} value={p.po_id}>
                  {p.po_number} · {getNodeName(p.node_id)} · {p.po_date} · ₹{parseFloat(p.total_amount || 0).toFixed(0)}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleGenerate} disabled={!selectedPoId || loading}
            style={{ padding: '8px 20px', borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: selectedPoId ? 'pointer' : 'not-allowed', opacity: selectedPoId ? 1 : 0.5 }}>
            {loading ? '⏳ Analysing…' : '🧠 Generate Suggestions'}
          </button>
        </div>
        {selectedPo && (
          <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <span>📍 {getNodeName(selectedPo.node_id)}</span>
            <span>📅 {selectedPo.po_date}</span>
            <span>💰 ₹{parseFloat(selectedPo.total_amount || 0).toFixed(2)}</span>
            <span>Status: <strong>{selectedPo.status}</strong></span>
          </div>
        )}
      </div>

      {/* Weather card */}
      {weather && (
        <div style={{ ...CARD, marginBottom: 16, borderLeft: `4px solid ${weather.rain_prob >= 0.5 ? '#3b82f6' : weather.temp > 35 ? '#ef4444' : weather.temp < 15 ? '#8b5cf6' : '#22c55e'}` }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 32 }}>
              {weather.rain_prob >= 0.5 ? '🌧️' : weather.temp > 35 ? '🌡️' : weather.temp < 15 ? '❄️' : '☀️'}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Tomorrow's forecast · {weather.date}</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 3 }}>
                🌡️ {weather.temp?.toFixed(1)}°C &nbsp;·&nbsp;
                💧 Rain {Math.round((weather.rain_prob || 0) * 100)}% &nbsp;·&nbsp;
                💦 Humidity {weather.humidity || '--'}%
              </div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 12, background: '#f0fdf4', padding: '6px 14px', borderRadius: 8, color: '#15803d', fontWeight: 600 }}>
              {weather.rain_prob >= 0.5 ? '🌧️ Rain rules active'
                : weather.temp > 35 ? '🌡️ Hot rules active'
                : weather.temp < 15 ? '❄️ Cold rules active'
                : '✅ Normal conditions'}
            </div>
          </div>
        </div>
      )}

      {/* Suggestions table */}
      {suggestions.length > 0 && (
        <div style={{ ...CARD, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>📋 Suggested quantities ({suggestions.length} items)</div>
            <button onClick={handleAccept} disabled={accepting}
              style={{ padding: '8px 20px', borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              {accepting ? 'Saving…' : '✅ Accept & Apply to PO'}
            </button>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>30-day avg</th>
                  <th>Normal qty</th>
                  <th>Weather ×</th>
                  <th>Occasion ×</th>
                  <th>Final ×</th>
                  <th style={{ background: '#f0fdf4', color: '#15803d' }}>Suggested qty</th>
                  <th style={{ background: '#f0fdf4', color: '#15803d' }}>Your qty</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map(s => {
                  const myQty = editQty[s.item_id] ?? s.suggested_qty;
                  const diff  = myQty - s.normal_qty;
                  const diffColor = diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : '#888';
                  return (
                    <tr key={s.item_id}>
                      <td style={{ fontWeight: 600 }}>{s.item_name}</td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{s.base_qty_30d.toFixed(2)}</td>
                      <td>{s.normal_qty.toFixed(2)}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: s.weather_multiplier !== 1 ? '#ef4444' : '#888' }}>
                          ×{s.weather_multiplier}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: s.occasion_multiplier !== 1 ? '#f59e0b' : '#888' }}>
                          ×{s.occasion_multiplier}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: s.final_multiplier !== 1 ? '#22c55e' : '#888' }}>
                          ×{s.final_multiplier}
                        </span>
                      </td>
                      <td style={{ background: '#f0fdf4', fontWeight: 700, color: '#15803d' }}>
                        {s.suggested_qty.toFixed(2)}
                      </td>
                      <td style={{ background: '#f0fdf4' }}>
                        <input
                          type="number" min="0" step="0.001"
                          value={myQty}
                          onChange={e => setEditQty(prev => ({ ...prev, [s.item_id]: e.target.value }))}
                          style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13, textAlign: 'right' }}
                        />
                        {diff !== 0 && (
                          <span style={{ fontSize: 10, color: diffColor, marginLeft: 4 }}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--color-text-secondary)', maxWidth: 160 }}>
                        {s.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {suggestions.length === 0 && !loading && selectedPoId && (
        <div className="empty-state">
          <div className="empty-icon">🧠</div>
          <h3>Click Generate Suggestions</h3>
          <p>We'll fetch tomorrow's weather and apply your rules to calculate smart quantities.</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TAB 2: Weather Rules
// ══════════════════════════════════════════════════════════════
function WeatherRulesTab({ cid, categories, getCatName, showToast }) {
  const [rules,   setRules]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [form,    setForm]    = useState(null);  // null = no modal

  const EMPTY = { company_unique_id: cid, condition: 'hot', temp_min: 35, temp_max: null, rain_threshold: null, item_category_id: '', multiplier: 1.0, description: '', is_active: true };

  useEffect(() => {
    if (!cid) return;
    setLoading(true);
    advPoAPI.getWeatherRules(cid).then(r => { setRules(r || []); setLoading(false); });
  }, [cid]);

  const save = async () => {
    try {
      if (form.rule_id) {
        await advPoAPI.updateWeatherRule(form.rule_id, form);
        showToast('Rule updated');
      } else {
        await advPoAPI.createWeatherRule({ ...form, company_unique_id: cid });
        showToast('Rule created');
      }
      const r = await advPoAPI.getWeatherRules(cid);
      setRules(r || []); setForm(null);
    } catch (e) { showToast(e.message || 'Error', 'error'); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    await advPoAPI.deleteWeatherRule(id);
    setRules(r => r.filter(x => x.rule_id !== id));
    showToast('Deleted');
  };

  const grouped = { hot: [], rain: [], cold: [] };
  rules.forEach(r => { if (grouped[r.condition]) grouped[r.condition].push(r); });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Weather × Category multipliers</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>
            Set how each ingredient category should change when the weather is hot, rainy, or cold
          </div>
        </div>
        <button onClick={() => setForm({ ...EMPTY })}
          style={{ padding: '8px 18px', borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          + Add Rule
        </button>
      </div>

      {loading && <Spinner />}

      {Object.entries(grouped).map(([cond, condRules]) => {
        const meta = CONDITION_META[cond];
        return (
          <div key={cond} style={{ ...CARD, marginBottom: 14, borderLeft: `4px solid ${meta.color}` }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: meta.color, marginBottom: 12 }}>{meta.label}</div>
            {condRules.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '8px 0' }}>No rules yet — click Add Rule</div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Temp range</th>
                      <th>Rain threshold</th>
                      <th>Multiplier</th>
                      <th>Effect</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {condRules.map(r => {
                      const eff = ((r.multiplier - 1) * 100).toFixed(0);
                      return (
                        <tr key={r.rule_id}>
                          <td style={{ fontWeight: 600 }}>{getCatName(r.item_category_id)}</td>
                          <td style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                            {r.temp_min != null ? `${r.temp_min}°C` : '—'} to {r.temp_max != null ? `${r.temp_max}°C` : '—'}
                          </td>
                          <td style={{ fontSize: 12 }}>{r.rain_threshold != null ? `≥ ${(r.rain_threshold * 100).toFixed(0)}%` : '—'}</td>
                          <td>
                            <span style={{ fontWeight: 700, fontSize: 15, color: r.multiplier > 1 ? '#22c55e' : r.multiplier < 1 ? '#ef4444' : '#888' }}>
                              ×{parseFloat(r.multiplier).toFixed(2)}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 12, fontWeight: 600, color: parseFloat(eff) > 0 ? '#15803d' : '#b91c1c', background: parseFloat(eff) > 0 ? '#dcfce7' : '#fee2e2', padding: '2px 8px', borderRadius: 99 }}>
                              {parseFloat(eff) > 0 ? '+' : ''}{eff}%
                            </span>
                          </td>
                          <td>
                            <Badge variant={r.is_active ? 'success' : 'default'}>{r.is_active ? 'Active' : 'Off'}</Badge>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => setForm({ ...r })} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                              <button onClick={() => del(r.rule_id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* Add/Edit modal */}
      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setForm(null)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 440, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18 }}>{form.rule_id ? 'Edit' : 'Add'} Weather Rule</div>

            {[
              { label: 'Condition', field: 'condition', type: 'select', opts: [['hot','🌡️ Hot (high temp)'],['rain','🌧️ Rain'],['cold','❄️ Cold (low temp)']] },
              { label: 'Category', field: 'item_category_id', type: 'catselect' },
              { label: 'Temp min (°C)', field: 'temp_min', type: 'number', placeholder: 'e.g. 35 (leave blank for none)' },
              { label: 'Temp max (°C)', field: 'temp_max', type: 'number', placeholder: 'e.g. 45 (leave blank for none)' },
              { label: 'Rain threshold (0-1)', field: 'rain_threshold', type: 'number', placeholder: 'e.g. 0.5 for 50% rain probability' },
              { label: 'Multiplier', field: 'multiplier', type: 'number', placeholder: 'e.g. 1.5 = +50%, 0.8 = -20%' },
              { label: 'Description (optional)', field: 'description', type: 'text', placeholder: 'e.g. Hot weather — cold drinks spike' },
            ].map(f => (
              <div key={f.field} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>{f.label.toUpperCase()}</div>
                {f.type === 'select' ? (
                  <select value={form[f.field] || ''} onChange={e => setForm(p => ({ ...p, [f.field]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
                    {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : f.type === 'catselect' ? (
                  <select value={form[f.field] || ''} onChange={e => setForm(p => ({ ...p, [f.field]: parseInt(e.target.value) }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
                    <option value="">-- Select category --</option>
                    {categories.map(c => <option key={c.category_id || c.item_category_id} value={c.category_id || c.item_category_id}>{c.category_name}</option>)}
                  </select>
                ) : (
                  <input type={f.type === 'number' ? 'number' : 'text'} step="any"
                    value={form[f.field] ?? ''} placeholder={f.placeholder}
                    onChange={e => setForm(p => ({ ...p, [f.field]: f.type === 'number' ? (e.target.value === '' ? null : parseFloat(e.target.value)) : e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box' }} />
                )}
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setForm(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={save} style={{ padding: '8px 20px', borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TAB 3: Occasions
// ══════════════════════════════════════════════════════════════
function OccasionsTab({ cid, categories, getCatName, showToast }) {
  const [occasions,    setOccasions]    = useState([]);
  const [selected,     setSelected]     = useState(null);  // selected occasion
  const [rules,        setRules]        = useState([]);    // rules for selected
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [newMult,      setNewMult]      = useState({});    // catId → multiplier

  useEffect(() => {
    if (!cid) return;
    setLoading(true);
    advPoAPI.getBranchOccasions(cid).then(r => { setOccasions(r || []); setLoading(false); });
  }, [cid]);

  const toggleOccasion = async (occ) => {
    await advPoAPI.setBranchOccasion(cid, { occasion_id: occ.occasion_id, is_active: !occ.is_active });
    setOccasions(prev => prev.map(o => o.occasion_id === occ.occasion_id ? { ...o, is_active: !o.is_active } : o));
    showToast(occ.is_active ? 'Occasion disabled' : 'Occasion enabled');
  };

  const openRules = async (occ) => {
    setSelected(occ);
    const r = await advPoAPI.getOccasionRules(occ.occasion_id);
    setRules(r || []);
    const init = {};
    (r || []).forEach(x => { init[x.category_id] = x.multiplier; });
    setNewMult(init);
  };

  const saveRule = async (catId) => {
    const mult = parseFloat(newMult[catId] || 1.0);
    await advPoAPI.upsertOccasionRule(selected.occasion_id, { category_id: catId, multiplier: mult });
    showToast('Rule saved');
    const r = await advPoAPI.getOccasionRules(selected.occasion_id);
    setRules(r || []);
  };

  const active   = occasions.filter(o => o.is_active);
  const inactive = occasions.filter(o => !o.is_active);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 16 }}>
      {/* Left: occasion list */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Occasions for {cid === 1 ? 'All branches' : 'this branch'}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
          Toggle which festivals apply to your branch. Click "Rules" to set category multipliers per occasion.
        </div>

        {loading ? <Spinner /> : (
          <>
            {active.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 8, letterSpacing: '0.05em' }}>✅ ACTIVE OCCASIONS</div>
                {active.map(occ => <OccCard key={occ.occasion_id} occ={occ} selected={selected?.occasion_id === occ.occasion_id} onToggle={toggleOccasion} onRules={openRules} />)}
              </>
            )}
            {inactive.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 8, marginTop: 14, letterSpacing: '0.05em' }}>⬜ AVAILABLE OCCASIONS</div>
                {inactive.map(occ => <OccCard key={occ.occasion_id} occ={occ} selected={selected?.occasion_id === occ.occasion_id} onToggle={toggleOccasion} onRules={openRules} />)}
              </>
            )}
          </>
        )}
      </div>

      {/* Right: rules for selected occasion */}
      {selected && (
        <div style={{ ...CARD, alignSelf: 'start' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>🎉 {selected.name} — category multipliers</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            Set how each category's quantity should change during this occasion. 1.0 = no change.
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {categories.map(c => {
              const catId = c.category_id || c.item_category_id;
              const existing = rules.find(r => r.category_id === catId);
              const val = newMult[catId] ?? (existing?.multiplier || 1.0);
              const eff = ((parseFloat(val) - 1) * 100).toFixed(0);
              return (
                <div key={catId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--color-background-secondary)', borderRadius: 8 }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{c.category_name}</div>
                  <input type="number" min="0" max="5" step="0.05"
                    value={val}
                    onChange={e => setNewMult(p => ({ ...p, [catId]: e.target.value }))}
                    style={{ width: 72, padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13, textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 600, width: 44, color: parseFloat(eff) > 0 ? '#15803d' : parseFloat(eff) < 0 ? '#b91c1c' : '#888' }}>
                    {parseFloat(eff) > 0 ? '+' : ''}{eff}%
                  </span>
                  <button onClick={() => saveRule(catId)}
                    style={{ padding: '4px 12px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                    Save
                  </button>
                </div>
              );
            })}
          </div>
          <button onClick={() => setSelected(null)}
            style={{ marginTop: 16, padding: '6px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function OccCard({ occ, selected, onToggle, onRules }) {
  const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = occ.month && occ.day ? `${occ.day} ${months[occ.month]}` : 'Floating date';
  return (
    <div style={{ ...CARD, marginBottom: 8, borderLeft: `3px solid ${occ.is_active ? '#22c55e' : '#e5e7eb'}`, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', outline: selected ? '2px solid #22c55e' : 'none' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{occ.name}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
          {dateStr} · {occ.days_before}d before · {occ.days_after}d after
        </div>
        {occ.description && <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{occ.description}</div>}
      </div>
      <button onClick={() => onRules(occ)}
        style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: selected ? '#f0fdf4' : '#fff', color: selected ? '#15803d' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
        Rules
      </button>
      <button onClick={() => onToggle(occ)}
        style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${occ.is_active ? '#fca5a5' : '#bbf7d0'}`, background: occ.is_active ? '#fef2f2' : '#f0fdf4', color: occ.is_active ? '#b91c1c' : '#15803d', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
        {occ.is_active ? 'Disable' : 'Enable'}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TAB 4: Accuracy report (Phase 1.5)
// ══════════════════════════════════════════════════════════════
function AccuracyTab({ cid, getCatName, showToast }) {
  const [report,  setReport]  = useState([]);
  const [days,    setDays]    = useState(14);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await advPoAPI.getAccuracyReport(cid, days);
      setReport(res.report || []);
    } catch (e) { showToast(e.message || 'Error loading report', 'error'); }
    setLoading(false);
  };

  useEffect(() => { if (cid) load(); }, [cid]);

  const applyCorrection = async (log_id, rule_id) => {
    try {
      await advPoAPI.applyCorrection({ log_id, rule_id });
      showToast('Multiplier updated!');
      load();
    } catch (e) { showToast(e.message || 'Error', 'error'); }
  };

  const avgVariance = report.length ? (report.reduce((s, r) => s + Math.abs(r.variance_pct), 0) / report.length).toFixed(1) : 0;
  const overOrdered = report.filter(r => r.variance_pct < -10).length;
  const underOrdered = report.filter(r => r.variance_pct > 10).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Phase 1.5 — Accuracy Report</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>
            Suggestion vs actual consumption. Apply corrections to self-improve your rules.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={days} onChange={e => setDays(parseInt(e.target.value))}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button onClick={load} style={{ padding: '7px 16px', borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {report.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Avg variance',   value: `${avgVariance}%`,      color: '#f59e0b', bg: '#fffbeb', icon: '📊' },
            { label: 'Over-ordered',   value: overOrdered,             color: '#ef4444', bg: '#fef2f2', icon: '📈' },
            { label: 'Under-ordered',  value: underOrdered,            color: '#22c55e', bg: '#f0fdf4', icon: '📉' },
          ].map(s => (
            <div key={s.label} style={{ ...CARD, borderTop: `3px solid ${s.color}`, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? <Spinner /> : report.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>No accuracy data yet</h3>
          <p>Generate Smart PO suggestions and compare to actual sales to see this report.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Date</th>
                <th>Suggested qty</th>
                <th>Actual sold</th>
                <th>Variance</th>
                <th>Rec. multiplier</th>
                <th>Rule reason</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {report.map((r, i) => {
                const isOver  = r.variance_pct < -10;
                const isUnder = r.variance_pct > 10;
                return (
                  <tr key={i} style={{ background: isOver ? '#fef2f2' : isUnder ? '#f0fdf4' : undefined }}>
                    <td style={{ fontWeight: 600 }}>{r.item_name}</td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{r.po_date}</td>
                    <td>{r.suggested_qty?.toFixed(2)}</td>
                    <td style={{ fontWeight: 600 }}>{r.actual_qty?.toFixed(2)}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: isOver ? '#b91c1c' : isUnder ? '#15803d' : '#888', fontSize: 13 }}>
                        {r.variance_pct > 0 ? '+' : ''}{r.variance_pct?.toFixed(1)}%
                      </span>
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                        {isOver ? 'Over-ordered' : isUnder ? 'Under-ordered' : 'On target'}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: '#f59e0b' }}>×{r.rec_multiplier?.toFixed(3)}</span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-text-secondary)', maxWidth: 140 }}>{r.reason}</td>
                    <td>
                      {r.is_applied ? (
                        <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>✅ Applied</span>
                      ) : (
                        <button
                          onClick={() => applyCorrection(r.log_id, null)}
                          style={{ padding: '4px 12px', borderRadius: 6, background: '#f59e0b', color: '#fff', border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                          Apply fix
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
