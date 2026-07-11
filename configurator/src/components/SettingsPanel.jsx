import { useEffect, useState } from 'react';
import { upload } from '@vercel/blob/client';
import ColorPickerButton from './ColorPickerButton.jsx';
import { DEFAULT_SERVICES, DEFAULT_LOCKED_SERVICES, DEFAULT_ACCESSORY_COLORS } from '../data/defaults.js';
import { COUNTRIES, REGIONS, regionByCode } from '../data/taxRates.js';

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

export default function SettingsPanel({ onSaved }) {
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((row) => {
        setForm({
          gstRatePct: toPct(row.gst_rate),
          taxCountry: row.tax_country || 'CA',
          taxRegion: row.tax_region || 'CA-AB',
          taxLabel: row.tax_label || 'GST',
          municipalTaxPct: toPct(row.municipal_tax_rate || 0),
          defaultServices: row.default_services || DEFAULT_SERVICES,
          defaultLockedServices: row.default_locked_services || DEFAULT_LOCKED_SERVICES,
          defaultAccessoryColors: row.default_accessory_colors || DEFAULT_ACCESSORY_COLORS,
          defaultRoofColorId: row.default_roof_color_id || 'wk-04',
          defaultWallColorId: row.default_wall_color_id || 'wk-01',
          reportFooterNote: row.report_footer_note || '',
          logoUrl: row.logo_url || '',
        });
      })
      .catch((err) => {
        console.error('Settings API error:', err);
        setStatus('Could not reach the Settings database — showing today\'s defaults; changes may not save.');
        setForm({
          gstRatePct: '5',
          taxCountry: 'CA',
          taxRegion: 'CA-AB',
          taxLabel: 'GST',
          municipalTaxPct: '0',
          defaultServices: DEFAULT_SERVICES,
          defaultLockedServices: DEFAULT_LOCKED_SERVICES,
          defaultAccessoryColors: DEFAULT_ACCESSORY_COLORS,
          defaultRoofColorId: 'wk-04',
          defaultWallColorId: 'wk-01',
          reportFooterNote: '',
          logoUrl: '',
        });
      });
  }, []);

  if (!form) {
    return (
      <div className="settings-panel">
        <div className="control-label">Company Settings</div>
        <div className="control-sublabel">{status || 'Loading settings…'}</div>
      </div>
    );
  }

  const toggleService = (key) => (val) =>
    setForm((f) => ({ ...f, defaultServices: { ...f.defaultServices, [key]: val } }));
  const toggleLocked = (key) => (val) =>
    setForm((f) => ({ ...f, defaultLockedServices: { ...f.defaultLockedServices, [key]: val } }));
  const setAccessoryColor = (key) => (val) =>
    setForm((f) => ({ ...f, defaultAccessoryColors: { ...f.defaultAccessoryColors, [key]: val } }));

  const handleLogoUpload = async (file) => {
    if (!file) return;
    setLogoBusy(true);
    setStatus('Uploading logo…');
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        clientPayload: JSON.stringify({ kind: 'logo' }),
      });
      setForm((f) => ({ ...f, logoUrl: blob.url }));
      setStatus('Logo uploaded — click Save Settings to apply it.');
    } catch (err) {
      console.error('Logo upload error:', err);
      setStatus('Could not upload the logo — check the file is an image under 5 MB and try again.');
    }
    setLogoBusy(false);
    setTimeout(() => setStatus(''), 5000);
  };

  const handleSave = async () => {
    setBusy(true);
    setStatus('Saving…');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstRate: toFrac(form.gstRatePct),
          taxCountry: form.taxCountry,
          taxRegion: form.taxRegion,
          taxLabel: form.taxLabel,
          municipalTaxRate: toFrac(form.municipalTaxPct),
          defaultServices: form.defaultServices,
          defaultLockedServices: form.defaultLockedServices,
          defaultAccessoryColors: form.defaultAccessoryColors,
          defaultRoofColorId: form.defaultRoofColorId,
          defaultWallColorId: form.defaultWallColorId,
          reportFooterNote: form.reportFooterNote,
          logoUrl: form.logoUrl,
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
    <div className="settings-panel">
      <div className="control-label">Company Settings</div>
      <div className="control-sublabel">
        These apply to every new project and every estimate calculation — not just the one
        currently open.
      </div>

      <div className="control-block">
        <div className="field-label">Tax</div>
        <div className="settings-row">
          <label htmlFor="settings-tax-country">Country</label>
          <select
            id="settings-tax-country" className="control-select" value={form.taxCountry}
            onChange={(e) => {
              const country = e.target.value;
              const firstRegion = REGIONS[country]?.[0];
              setForm((f) => ({
                ...f, taxCountry: country, taxRegion: firstRegion?.code || '',
                gstRatePct: firstRegion ? toPct(firstRegion.rate) : f.gstRatePct,
                taxLabel: firstRegion?.label || f.taxLabel,
              }));
            }}
          >
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <div className="settings-row">
          <label htmlFor="settings-tax-region">Province / State</label>
          <select
            id="settings-tax-region" className="control-select" value={form.taxRegion}
            onChange={(e) => {
              const region = regionByCode(e.target.value);
              setForm((f) => ({
                ...f, taxRegion: e.target.value,
                gstRatePct: region ? toPct(region.rate) : f.gstRatePct,
                taxLabel: region?.label || f.taxLabel,
              }));
            }}
          >
            {(REGIONS[form.taxCountry] || []).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
        </div>
        <div className="settings-row">
          <label htmlFor="settings-gst">Base tax rate (%)</label>
          <input
            id="settings-gst" type="number" min="0" step="0.001" className="control-select"
            value={form.gstRatePct} onChange={(e) => setForm((f) => ({ ...f, gstRatePct: e.target.value }))}
          />
        </div>
        <div className="settings-row">
          <label htmlFor="settings-municipal-tax">Municipal / local tax (%)</label>
          <input
            id="settings-municipal-tax" type="number" min="0" step="0.001" className="control-select"
            value={form.municipalTaxPct} onChange={(e) => setForm((f) => ({ ...f, municipalTaxPct: e.target.value }))}
          />
        </div>
        <div className="settings-row">
          <label htmlFor="settings-tax-label">Tax label (shown on estimates)</label>
          <input
            id="settings-tax-label" type="text" className="control-select"
            value={form.taxLabel} onChange={(e) => setForm((f) => ({ ...f, taxLabel: e.target.value }))}
          />
        </div>
        <div className="control-sublabel">
          The region picker prefills the base rate from researched Canada/US rates — still fully
          editable. Add any county/city add-on in Municipal tax; the combined rate applies to every
          new estimate. Discount/package deals moved to the new Discounts tab.
        </div>
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
        <label className="field-label" htmlFor="settings-logo">Company Logo</label>
        <div className="settings-logo-row">
          {form.logoUrl && <img src={form.logoUrl} alt="Company logo" className="settings-logo-preview" />}
          <input
            id="settings-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
            disabled={logoBusy}
            onChange={(e) => handleLogoUpload(e.target.files?.[0])}
          />
          {form.logoUrl && (
            <button type="button" className="layer-remove-btn" onClick={() => setForm((f) => ({ ...f, logoUrl: '' }))} aria-label="Remove logo">×</button>
          )}
        </div>
        <div className="control-sublabel">Shown on the PDF cover page and in the app header. PNG/JPEG/WebP/SVG, up to 5 MB.</div>
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
  );
}
