import { useEffect, useState } from 'react';
import ColorPickerButton from './ColorPickerButton.jsx';
import { DEFAULT_SERVICES, DEFAULT_LOCKED_SERVICES, DEFAULT_ACCESSORY_COLORS } from '../data/defaults.js';

const SERVICE_KEYS = [
  { key: 'roof', label: 'Roof' },
  { key: 'wall', label: 'Wall' },
  { key: 'soffit', label: 'Soffit' },
  { key: 'fascia', label: 'Fascia' },
  { key: 'gutters', label: 'Gutters' },
  { key: 'downspouts', label: 'Downspouts' },
  { key: 'snowRetention', label: 'Snow Retention' },
  { key: 'capFlashing', label: 'Cap Flashing' },
  { key: 'garageDoorCapping', label: 'Garage Door Capping' },
];

const ACCESSORY_KEYS = ['soffit', 'fascia', 'gutters', 'downspouts'];

// Converts between the API's fraction-based rates (0.05) and the
// percentage the admin actually wants to type/read (5).
const toPct = (frac) => (Number(frac) * 100).toString();
const toFrac = (pct) => (Number(pct) || 0) / 100;

export default function SettingsPanel({ onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((row) => {
        setForm({
          gstRatePct: toPct(row.gst_rate),
          fullWrapDiscountPct: toPct(row.full_wrap_discount_pct),
          soffitFasciaDiscountPct: toPct(row.soffit_fascia_discount_pct),
          gutterDownspoutFree: row.gutter_downspout_free,
          defaultServices: row.default_services || DEFAULT_SERVICES,
          defaultLockedServices: row.default_locked_services || DEFAULT_LOCKED_SERVICES,
          defaultAccessoryColors: row.default_accessory_colors || DEFAULT_ACCESSORY_COLORS,
          defaultRoofColorId: row.default_roof_color_id || 'wk-04',
          defaultWallColorId: row.default_wall_color_id || 'wk-01',
          reportFooterNote: row.report_footer_note || '',
        });
      })
      .catch((err) => {
        console.error('Settings API error:', err);
        setStatus('Could not reach the Settings database — showing today\'s defaults; changes may not save.');
        setForm({
          gstRatePct: '5',
          fullWrapDiscountPct: '7',
          soffitFasciaDiscountPct: '50',
          gutterDownspoutFree: true,
          defaultServices: DEFAULT_SERVICES,
          defaultLockedServices: DEFAULT_LOCKED_SERVICES,
          defaultAccessoryColors: DEFAULT_ACCESSORY_COLORS,
          defaultRoofColorId: 'wk-04',
          defaultWallColorId: 'wk-01',
          reportFooterNote: '',
        });
      });
  }, []);

  if (!form) {
    return (
      <div className="settings-backdrop" onClick={onClose}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <div className="settings-modal-header">
            <span className="control-label">Company Settings</span>
            <button type="button" className="layer-remove-btn" onClick={onClose} aria-label="Close settings">×</button>
          </div>
          <div className="control-sublabel">{status || 'Loading settings…'}</div>
        </div>
      </div>
    );
  }

  const toggleService = (key) => (val) =>
    setForm((f) => ({ ...f, defaultServices: { ...f.defaultServices, [key]: val } }));
  const toggleLocked = (key) => (val) =>
    setForm((f) => ({ ...f, defaultLockedServices: { ...f.defaultLockedServices, [key]: val } }));
  const setAccessoryColor = (key) => (val) =>
    setForm((f) => ({ ...f, defaultAccessoryColors: { ...f.defaultAccessoryColors, [key]: val } }));

  const handleSave = async () => {
    setBusy(true);
    setStatus('Saving…');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstRate: toFrac(form.gstRatePct),
          fullWrapDiscountPct: toFrac(form.fullWrapDiscountPct),
          soffitFasciaDiscountPct: toFrac(form.soffitFasciaDiscountPct),
          gutterDownspoutFree: form.gutterDownspoutFree,
          defaultServices: form.defaultServices,
          defaultLockedServices: form.defaultLockedServices,
          defaultAccessoryColors: form.defaultAccessoryColors,
          defaultRoofColorId: form.defaultRoofColorId,
          defaultWallColorId: form.defaultWallColorId,
          reportFooterNote: form.reportFooterNote,
        }),
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
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <span className="control-label">Company Settings</span>
          <button type="button" className="layer-remove-btn" onClick={onClose} aria-label="Close settings">×</button>
        </div>
        <div className="control-sublabel">
          These apply to every new project and every estimate calculation — not just the one
          currently open.
        </div>

        <div className="control-block">
          <div className="field-label">Pricing</div>
          <div className="settings-row">
            <label htmlFor="settings-gst">GST rate (%)</label>
            <input
              id="settings-gst" type="number" min="0" step="0.1" className="control-select"
              value={form.gstRatePct} onChange={(e) => setForm((f) => ({ ...f, gstRatePct: e.target.value }))}
            />
          </div>
          <div className="settings-row">
            <label htmlFor="settings-fullwrap">Full Wrap discount (%)</label>
            <input
              id="settings-fullwrap" type="number" min="0" max="100" step="1" className="control-select"
              value={form.fullWrapDiscountPct} onChange={(e) => setForm((f) => ({ ...f, fullWrapDiscountPct: e.target.value }))}
            />
          </div>
          <div className="settings-row">
            <label htmlFor="settings-soffitfascia">Soffit + Fascia discount (%)</label>
            <input
              id="settings-soffitfascia" type="number" min="0" max="100" step="1" className="control-select"
              value={form.soffitFasciaDiscountPct} onChange={(e) => setForm((f) => ({ ...f, soffitFasciaDiscountPct: e.target.value }))}
            />
          </div>
          <label className="uniform-toggle">
            <input
              type="checkbox" checked={form.gutterDownspoutFree}
              onChange={(e) => setForm((f) => ({ ...f, gutterDownspoutFree: e.target.checked }))}
            />
            <span>Downspouts free with Gutters package</span>
          </label>
        </div>

        <div className="control-block">
          <div className="field-label">New Project defaults</div>
          {SERVICE_KEYS.map(({ key, label }) => (
            <div className="service-row" key={key}>
              <label className="service-row-main">
                <input type="checkbox" checked={!!form.defaultServices[key]} onChange={(e) => toggleService(key)(e.target.checked)} />
                <span>{label}</span>
              </label>
              <label className="service-lock-toggle" title="Locked by default in customer-facing views">
                <input type="checkbox" checked={!!form.defaultLockedServices[key]} onChange={(e) => toggleLocked(key)(e.target.checked)} />
                <span>Lock</span>
              </label>
              {ACCESSORY_KEYS.includes(key) && (
                <ColorPickerButton selectedId={form.defaultAccessoryColors[key] || 'wk-04'} onChange={setAccessoryColor(key)} />
              )}
            </div>
          ))}
          <div className="color-row" style={{ marginTop: '0.5rem' }}>
            <span className="control-label">Default Roof Color</span>
            <ColorPickerButton selectedId={form.defaultRoofColorId} onChange={(id) => setForm((f) => ({ ...f, defaultRoofColorId: id }))} />
          </div>
          <div className="color-row">
            <span className="control-label">Default Wall Color</span>
            <ColorPickerButton selectedId={form.defaultWallColorId} onChange={(id) => setForm((f) => ({ ...f, defaultWallColorId: id }))} />
          </div>
        </div>

        <div className="control-block">
          <div className="field-label">Report branding</div>
          <label htmlFor="settings-footer">Footer note (PDF cover page)</label>
          <textarea
            id="settings-footer" className="control-select" rows={2}
            value={form.reportFooterNote}
            onChange={(e) => setForm((f) => ({ ...f, reportFooterNote: e.target.value }))}
            placeholder="This is a preliminary estimate — final pricing subject to on-site verification and a signed contract."
          />
        </div>

        {status && <div className="control-sublabel">{status}</div>}

        <div className="export-buttons">
          <button type="button" className="btn-primary" onClick={handleSave} disabled={busy} style={{ width: '100%' }}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
