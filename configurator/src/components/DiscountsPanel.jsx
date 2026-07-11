import { useEffect, useState } from 'react';
import { buildDefaultDiscountRules } from '../lib/pricingEngine.js';

const SERVICE_OPTIONS = [
  { key: 'roof', label: 'Roofing' },
  { key: 'wall', label: 'Siding' },
  { key: 'soffit', label: 'Soffit' },
  { key: 'fascia', label: 'Fascia' },
  { key: 'gutters', label: 'Gutters' },
  { key: 'downspouts', label: 'Downspouts' },
  { key: 'snowRetention', label: 'Snow Retention' },
  { key: 'capFlashing', label: 'Cap Flashing' },
  { key: 'garageDoorCapping', label: 'Garage Door Capping' },
];

let ruleIdCounter = 0;
const newRuleId = () => `rule-${Date.now()}-${ruleIdCounter++}`;

const blankRule = () => ({
  id: newRuleId(),
  name: 'New discount',
  appliesToServices: [],
  requireAll: true,
  effect: { type: 'percent', value: 0.1 },
});

export default function DiscountsPanel({ onSaved }) {
  const [rules, setRules] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((row) => {
        // A null discount_rules column means "never customized" — show the
        // same three rules pricingEngine.js seeds by default, built from the
        // legacy per-deal columns, so the list matches what's actually
        // being applied right now.
        setRules(row.discount_rules?.length
          ? row.discount_rules
          : buildDefaultDiscountRules({
              fullWrapDiscountPct: Number(row.full_wrap_discount_pct),
              soffitFasciaDiscountPct: Number(row.soffit_fascia_discount_pct),
              gutterDownspoutFree: row.gutter_downspout_free,
            }));
      })
      .catch((err) => {
        console.error('Settings API error:', err);
        setStatus("Could not reach the Settings database — showing today's default deals; changes may not save.");
        setRules(buildDefaultDiscountRules());
      });
  }, []);

  if (!rules) {
    return (
      <div className="settings-panel">
        <div className="control-label">Discounts</div>
        <div className="control-sublabel">{status || 'Loading discount rules…'}</div>
      </div>
    );
  }

  const updateRule = (id, patch) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const updateEffect = (id, patch) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, effect: { ...r.effect, ...patch } } : r)));
  const toggleService = (id, key) =>
    setRules((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      const has = r.appliesToServices.includes(key);
      return { ...r, appliesToServices: has ? r.appliesToServices.filter((k) => k !== key) : [...r.appliesToServices, key] };
    }));
  const removeRule = (id) => setRules((rs) => rs.filter((r) => r.id !== id));
  const addRule = () => setRules((rs) => [...rs, blankRule()]);

  const handleSave = async () => {
    setBusy(true);
    setStatus('Saving…');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discountRules: rules }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const row = await res.json();
      setStatus('Saved.');
      onSaved?.(row);
    } catch (err) {
      console.error('Settings API error:', err);
      setStatus('Could not save — the Settings database may not be reachable yet.');
    }
    setBusy(false);
    setTimeout(() => setStatus(''), 4000);
  };

  return (
    <div className="settings-panel">
      <div className="control-label">Discounts</div>
      <div className="control-sublabel">
        Package deals applied automatically to every estimate. A rule that discounts the whole
        estimate wins outright over any narrower, service-specific rule that also matches — only
        one whole-estimate discount ever applies per estimate.
      </div>

      {rules.map((rule) => (
        <div className="control-block" key={rule.id}>
          <div className="settings-row">
            <label htmlFor={`rule-name-${rule.id}`}>Name</label>
            <input
              id={`rule-name-${rule.id}`} type="text" className="control-select"
              value={rule.name} onChange={(e) => updateRule(rule.id, { name: e.target.value })}
            />
          </div>

          <div className="field-label">Applies when these are all included:</div>
          <div className="service-row" style={{ flexWrap: 'wrap' }}>
            {SERVICE_OPTIONS.map(({ key, label }) => (
              <label className="uniform-toggle" key={key} style={{ marginRight: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={rule.appliesToServices.includes(key)}
                  onChange={() => toggleService(rule.id, key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="settings-row">
            <label htmlFor={`rule-effect-${rule.id}`}>Effect</label>
            <select
              id={`rule-effect-${rule.id}`} className="control-select"
              value={rule.effect.type === 'free' ? 'free' : (rule.effect.serviceKey ? 'percent-service' : 'percent-subtotal')}
              onChange={(e) => {
                const kind = e.target.value;
                if (kind === 'percent-subtotal') updateRule(rule.id, { effect: { type: 'percent', value: rule.effect.value || 0.1 } });
                else if (kind === 'percent-service') updateRule(rule.id, { effect: { type: 'percent', value: rule.effect.value || 0.1, serviceKey: rule.effect.serviceKey || rule.appliesToServices[0] || 'fascia' } });
                else updateRule(rule.id, { effect: { type: 'free', serviceKey: rule.effect.serviceKey || rule.appliesToServices[0] || 'downspouts' } });
              }}
            >
              <option value="percent-subtotal">% off the whole estimate</option>
              <option value="percent-service">% off one specific service</option>
              <option value="free">Make one specific service free</option>
            </select>
          </div>

          {rule.effect.type === 'percent' && (
            <div className="settings-row">
              <label htmlFor={`rule-value-${rule.id}`}>Discount (%)</label>
              <input
                id={`rule-value-${rule.id}`} type="number" min="0" max="100" step="1" className="control-select"
                value={Math.round((rule.effect.value || 0) * 100)}
                onChange={(e) => updateEffect(rule.id, { value: (Number(e.target.value) || 0) / 100 })}
              />
            </div>
          )}

          {(rule.effect.type === 'free' || rule.effect.serviceKey) && (
            <div className="settings-row">
              <label htmlFor={`rule-service-${rule.id}`}>Which service</label>
              <select
                id={`rule-service-${rule.id}`} className="control-select"
                value={rule.effect.serviceKey || ''}
                onChange={(e) => updateEffect(rule.id, { serviceKey: e.target.value })}
              >
                {SERVICE_OPTIONS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
          )}

          <button type="button" className="layer-remove-btn" onClick={() => removeRule(rule.id)}>Remove rule</button>
        </div>
      ))}

      <div className="export-buttons">
        <button type="button" className="btn-secondary" onClick={addRule} style={{ width: '100%' }}>+ Add discount rule</button>
      </div>

      {status && <div className="control-sublabel">{status}</div>}

      <div className="export-buttons">
        <button type="button" className="btn-primary" onClick={handleSave} disabled={busy} style={{ width: '100%' }}>
          Save Discounts
        </button>
      </div>
    </div>
  );
}
