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
  name: '',
  appliesToServices: [],
  requireAll: true,
  effect: { type: 'percent', value: 0.1 },
  muted: false,
});

// Shared by both the New Rule form (left) and each saved rule card (right) —
// same fields either way, just wired to a draft or a saved rule.
function RuleFields({ rule, nameId, onNameChange, onToggleService, onEffectTypeChange, onValueChange, onServiceKeyChange }) {
  return (
    <>
      <div className="settings-row settings-row-wide">
        <label htmlFor={nameId}>Name</label>
        <input
          id={nameId} type="text" className="control-select" placeholder="e.g. Spring Full Wrap Promo"
          value={rule.name} onChange={(e) => onNameChange(e.target.value)}
        />
      </div>

      <div className="field-label">Applies when these are all included:</div>
      <div className="service-row" style={{ flexWrap: 'wrap' }}>
        {SERVICE_OPTIONS.map(({ key, label }) => (
          <label className="uniform-toggle" key={key} style={{ marginRight: '0.75rem' }}>
            <input type="checkbox" checked={rule.appliesToServices.includes(key)} onChange={() => onToggleService(key)} />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div className="settings-row">
        <label htmlFor={`${nameId}-effect`}>Effect</label>
        <select
          id={`${nameId}-effect`} className="control-select"
          value={rule.effect.type === 'free' ? 'free' : (rule.effect.serviceKey ? 'percent-service' : 'percent-subtotal')}
          onChange={(e) => onEffectTypeChange(e.target.value)}
        >
          <option value="percent-subtotal">% off the whole estimate</option>
          <option value="percent-service">% off one specific service</option>
          <option value="free">Make one specific service free</option>
        </select>
      </div>

      {rule.effect.type === 'percent' && (
        <div className="settings-row">
          <label htmlFor={`${nameId}-value`}>Discount (%)</label>
          <input
            id={`${nameId}-value`} type="number" min="0" max="100" step="1" className="control-select"
            value={Math.round((rule.effect.value || 0) * 100)}
            onChange={(e) => onValueChange((Number(e.target.value) || 0) / 100)}
          />
        </div>
      )}

      {(rule.effect.type === 'free' || rule.effect.serviceKey) && (
        <div className="settings-row">
          <label htmlFor={`${nameId}-service`}>Which service</label>
          <select
            id={`${nameId}-service`} className="control-select"
            value={rule.effect.serviceKey || ''}
            onChange={(e) => onServiceKeyChange(e.target.value)}
          >
            {SERVICE_OPTIONS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      )}
    </>
  );
}

function effectTypeChange(rule, kind) {
  if (kind === 'percent-subtotal') return { ...rule, effect: { type: 'percent', value: rule.effect.value || 0.1 } };
  if (kind === 'percent-service') return { ...rule, effect: { type: 'percent', value: rule.effect.value || 0.1, serviceKey: rule.effect.serviceKey || rule.appliesToServices[0] || 'fascia' } };
  return { ...rule, effect: { type: 'free', serviceKey: rule.effect.serviceKey || rule.appliesToServices[0] || 'downspouts' } };
}

function toggleServiceOn(rule, key) {
  const has = rule.appliesToServices.includes(key);
  return { ...rule, appliesToServices: has ? rule.appliesToServices.filter((k) => k !== key) : [...rule.appliesToServices, key] };
}

export default function DiscountsPanel({ onSaved }) {
  const [rules, setRules] = useState(null);
  const [draftRule, setDraftRule] = useState(blankRule());
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
    setRules((rs) => rs.map((r) => (r.id === id ? toggleServiceOn(r, key) : r)));
  const removeRule = (id) => setRules((rs) => rs.filter((r) => r.id !== id));

  const addDraftRule = () => {
    if (!draftRule.name.trim()) {
      setStatus('Give the new rule a name first.');
      setTimeout(() => setStatus(''), 3000);
      return;
    }
    setRules((rs) => [...rs, draftRule]);
    setDraftRule(blankRule());
  };

  const handleSave = async () => {
    setBusy(true);
    setStatus('Saving…');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discountRules: rules }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const row = body;
      setStatus('Saved.');
      onSaved?.(row);
    } catch (err) {
      console.error('Settings API error:', err);
      setStatus(err.message || 'Could not save.');
    }
    setBusy(false);
    setTimeout(() => setStatus(''), 4000);
  };

  return (
    <div className="settings-panel discounts-panel-layout">
      <div className="control-label">Discounts</div>
      <div className="control-sublabel">
        Package deals applied automatically to every estimate. A rule that discounts the whole
        estimate wins outright over any narrower, service-specific rule that also matches — only
        one whole-estimate discount ever applies per estimate.
      </div>

      <div className="discounts-new-rule sticky-form-pane control-block">
        <div className="field-label">New Rule</div>
        <RuleFields
          rule={draftRule} nameId="rule-draft-name"
          onNameChange={(v) => setDraftRule((r) => ({ ...r, name: v }))}
          onToggleService={(key) => setDraftRule((r) => toggleServiceOn(r, key))}
          onEffectTypeChange={(kind) => setDraftRule((r) => effectTypeChange(r, kind))}
          onValueChange={(v) => setDraftRule((r) => ({ ...r, effect: { ...r.effect, value: v } }))}
          onServiceKeyChange={(v) => setDraftRule((r) => ({ ...r, effect: { ...r.effect, serviceKey: v } }))}
        />
        <button type="button" className="btn-primary" onClick={addDraftRule} style={{ width: '100%', marginTop: '0.5rem' }}>
          + Add Rule
        </button>
      </div>

      <div className="discounts-saved-rules">
        <div className="field-label">Saved rules ({rules.length})</div>
        {rules.length === 0 && <div className="control-sublabel">No discount rules yet — build one on the left.</div>}
        {rules.map((rule) => (
          <div className={`control-block discount-rule-card${rule.muted ? ' discount-rule-card-muted' : ''}`} key={rule.id}>
            <RuleFields
              rule={rule} nameId={`rule-${rule.id}-name`}
              onNameChange={(v) => updateRule(rule.id, { name: v })}
              onToggleService={(key) => toggleService(rule.id, key)}
              onEffectTypeChange={(kind) => updateRule(rule.id, effectTypeChange(rule, kind))}
              onValueChange={(v) => updateEffect(rule.id, { value: v })}
              onServiceKeyChange={(v) => updateEffect(rule.id, { serviceKey: v })}
            />
            <div className="discount-rule-card-footer">
              <label className="uniform-toggle discount-mute-toggle">
                <input type="checkbox" checked={!!rule.muted} onChange={(e) => updateRule(rule.id, { muted: e.target.checked })} />
                <span>Mute Rule — kept saved, won't apply in the Estimator</span>
              </label>
              <button type="button" className="btn-danger" onClick={() => removeRule(rule.id)}>Remove Rule</button>
            </div>
          </div>
        ))}
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
