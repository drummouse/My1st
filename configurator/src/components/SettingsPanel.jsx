import { useEffect, useState } from 'react';
import { upload } from '@vercel/blob/client';
import ColorPickerButton from './ColorPickerButton.jsx';
import { DEFAULT_SERVICES, DEFAULT_LOCKED_SERVICES, DEFAULT_ACCESSORY_COLORS } from '../data/defaults.js';
import { COUNTRIES, REGIONS, regionByCode } from '../data/taxRates.js';
import { formatPostalOrZip } from '../lib/address.js';

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

export default function SettingsPanel({ onSaved, customServiceCatalog = [] }) {
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [selectedLogoFile, setSelectedLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);

  // Company Profile is identity/contact info on the `users` row (required at
  // signup, see AuthGate.jsx) rather than the per-owner `settings` row this
  // component otherwise edits — kept as its own fetch/save pair against
  // /api/auth/me and /api/auth/profile instead of folded into the Settings
  // form/save above.
  const [profile, setProfile] = useState(null);
  const [profileStatus, setProfileStatus] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((u) => {
        setProfile({
          firstName: u.firstName || '', lastName: u.lastName || '', businessName: u.businessName || '',
          phone: u.phone || '', addressLine: u.addressLine || '', city: u.city || '',
          country: (u.regionCode || 'CA-AB').split('-')[0], regionCode: u.regionCode || 'CA-AB',
          postalCode: u.postalCode || '', website: u.website || '', socialUrl: u.socialUrl || '',
        });
      })
      .catch((err) => console.error('Profile fetch error:', err));
  }, []);

  const handleProfileSave = async () => {
    setProfileBusy(true);
    setProfileStatus('Saving…');
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: profile.businessName,
          firstName: profile.firstName, lastName: profile.lastName, businessName: profile.businessName,
          phone: profile.phone, addressLine: profile.addressLine, city: profile.city,
          regionCode: profile.regionCode, postalCode: profile.postalCode,
          website: profile.website, socialUrl: profile.socialUrl,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setProfile((p) => ({ ...p, postalCode: body.postalCode || p.postalCode }));
      setProfileStatus('Saved.');
    } catch (err) {
      console.error('Profile save error:', err);
      setProfileStatus(err.message || 'Could not save.');
    }
    setProfileBusy(false);
    setTimeout(() => setProfileStatus(''), 4000);
  };

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
          notificationWebhookUrl: row.notification_webhook_url || '',
          defaultServices: row.default_services || DEFAULT_SERVICES,
          defaultLockedServices: row.default_locked_services || DEFAULT_LOCKED_SERVICES,
          defaultAccessoryColors: row.default_accessory_colors || DEFAULT_ACCESSORY_COLORS,
          defaultRoofColorId: row.default_roof_color_id || 'wg-02',
          defaultWallColorId: row.default_wall_color_id || 'wg-02',
          defaultCustomServiceIds: row.default_custom_service_ids || [],
          reportFooterNote: row.report_footer_note || '',
          logoUrl: row.logo_url || '',
          unitSystem: row.unit_system || 'imperial',
          expertModeEntitled: row.expertModeEntitled === true,
          showExpertMode: row.show_expert_mode === true,
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
          notificationWebhookUrl: '',
          defaultServices: DEFAULT_SERVICES,
          defaultLockedServices: DEFAULT_LOCKED_SERVICES,
          defaultAccessoryColors: DEFAULT_ACCESSORY_COLORS,
          defaultRoofColorId: 'wg-02',
          defaultWallColorId: 'wg-02',
          defaultCustomServiceIds: [],
          reportFooterNote: '',
          logoUrl: '',
          unitSystem: 'imperial',
          expertModeEntitled: false,
          showExpertMode: false,
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
  const toggleDefaultCustomService = (id) => (checked) =>
    setForm((f) => ({
      ...f,
      defaultCustomServiceIds: checked
        ? [...(f.defaultCustomServiceIds || []), id]
        : (f.defaultCustomServiceIds || []).filter((x) => x !== id),
    }));

  // Picking a file just previews it locally (instant, no network) — nothing
  // is sent until "Upload" is clicked, so a slow/failed upload doesn't leave
  // the admin staring at a blank preview wondering if their file was picked
  // up at all.
  const handleLogoFileChange = (file) => {
    setSelectedLogoFile(file || null);
    setLogoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const handleLogoUpload = async () => {
    if (!selectedLogoFile) return;
    setLogoBusy(true);
    setStatus('Uploading logo…');
    try {
      const blob = await upload(selectedLogoFile.name, selectedLogoFile, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        clientPayload: JSON.stringify({ kind: 'logo' }),
      });
      setForm((f) => ({ ...f, logoUrl: blob.url }));
      setStatus('Logo uploaded — click Save Settings to apply it.');
      handleLogoFileChange(null);
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
          notificationWebhookUrl: form.notificationWebhookUrl,
          defaultServices: form.defaultServices,
          defaultLockedServices: form.defaultLockedServices,
          defaultAccessoryColors: form.defaultAccessoryColors,
          defaultRoofColorId: form.defaultRoofColorId,
          defaultWallColorId: form.defaultWallColorId,
          defaultCustomServiceIds: form.defaultCustomServiceIds,
          reportFooterNote: form.reportFooterNote,
          logoUrl: form.logoUrl,
          unitSystem: form.unitSystem,
          showExpertMode: form.showExpertMode,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const row = await res.json();
      setForm((f) => ({
        ...f,
        unitSystem: row.unit_system || 'imperial',
        expertModeEntitled: row.expertModeEntitled === true,
        showExpertMode: row.show_expert_mode === true,
      }));
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
    <div className="settings-panel settings-panel-grid">
      <div className="control-label">Company Settings</div>
      <div className="control-sublabel">
        These apply to every new project and every estimate calculation — not just the one
        currently open.
      </div>

      <div className="control-block">
        <div className="field-label">Measurement units</div>
        <label htmlFor="settings-unit-system">Company unit system</label>
        <select
          id="settings-unit-system"
          className="control-select"
          value={form.unitSystem}
          onChange={(event) => setForm((f) => ({ ...f, unitSystem: event.target.value }))}
        >
          <option value="imperial">Imperial (ft / sq ft)</option>
          <option value="metric">Metric (m / m²)</option>
        </select>
        <div className="control-sublabel">
          Used company-wide. Branch-specific units can be added later without changing saved designs.
        </div>
      </div>

      {form.expertModeEntitled && (
        <div className="control-block">
          <div className="field-label">Expert Mode</div>
          <label className="service-row-main" htmlFor="settings-show-expert-mode">
            <input
              id="settings-show-expert-mode"
              type="checkbox"
              checked={!!form.showExpertMode}
              onChange={(event) => setForm((f) => ({ ...f, showExpertMode: event.target.checked }))}
            />
            <span>Show Expert Mode</span>
          </label>
          <div className="control-sublabel">
            Show the Expert Mode control in the Studio top bar for this account.
          </div>
        </div>
      )}

      {profile && (
        <div className="control-block">
          <div className="field-label">Company Profile</div>
          <div className="control-sublabel">Enter your name, a business name, or both.</div>
          <div className="settings-row settings-row-wide">
            <label htmlFor="profile-first">First name</label>
            <input id="profile-first" type="text" className="control-select" value={profile.firstName} onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))} />
          </div>
          <div className="settings-row settings-row-wide">
            <label htmlFor="profile-last">Last name</label>
            <input id="profile-last" type="text" className="control-select" value={profile.lastName} onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))} />
          </div>
          <label className="field-label" htmlFor="profile-business">Business name</label>
          <input id="profile-business" type="text" className="control-select" value={profile.businessName} onChange={(e) => setProfile((p) => ({ ...p, businessName: e.target.value }))} />
          <label className="field-label" htmlFor="profile-phone">Phone</label>
          <input id="profile-phone" type="tel" className="control-select" value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} />
          <label className="field-label" htmlFor="profile-address">Address</label>
          <input id="profile-address" type="text" className="control-select" placeholder="Street address" value={profile.addressLine} onChange={(e) => setProfile((p) => ({ ...p, addressLine: e.target.value }))} />
          <div className="settings-row">
            <label htmlFor="profile-city">City</label>
            <input id="profile-city" type="text" className="control-select" value={profile.city} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))} />
          </div>
          <div className="settings-row">
            <label htmlFor="profile-country">Country</label>
            <select
              id="profile-country" className="control-select" value={profile.country}
              onChange={(e) => {
                const country = e.target.value;
                setProfile((p) => ({ ...p, country, regionCode: REGIONS[country]?.[0]?.code || '' }));
              }}
            >
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div className="settings-row">
            <label htmlFor="profile-region">Province / State</label>
            <select id="profile-region" className="control-select" value={profile.regionCode} onChange={(e) => setProfile((p) => ({ ...p, regionCode: e.target.value }))}>
              {(REGIONS[profile.country] || []).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </div>
          <div className="settings-row">
            <label htmlFor="profile-postal">Postal / Zip code</label>
            <input
              id="profile-postal" type="text" className="control-select" value={profile.postalCode}
              onChange={(e) => setProfile((p) => ({ ...p, postalCode: e.target.value }))}
              onBlur={(e) => setProfile((p) => ({ ...p, postalCode: formatPostalOrZip(e.target.value, p.country) }))}
            />
          </div>
          <label className="field-label" htmlFor="profile-website">Website (optional)</label>
          <input id="profile-website" type="text" className="control-select" value={profile.website} onChange={(e) => setProfile((p) => ({ ...p, website: e.target.value }))} />
          <label className="field-label" htmlFor="profile-social">Social link (optional)</label>
          <input id="profile-social" type="text" className="control-select" value={profile.socialUrl} onChange={(e) => setProfile((p) => ({ ...p, socialUrl: e.target.value }))} />
          {profileStatus && <div className="control-sublabel">{profileStatus}</div>}
          <div className="export-buttons" style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn-secondary" onClick={handleProfileSave} disabled={profileBusy} style={{ width: '100%' }}>
              Save Company Profile
            </button>
          </div>
        </div>
      )}

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
              <ColorPickerButton selectedId={form.defaultAccessoryColors[key] || 'wg-02'} onChange={setAccessoryColor(key)} />
            )}
            {key === 'roof' && (
              <ColorPickerButton selectedId={form.defaultRoofColorId} onChange={(id) => setForm((f) => ({ ...f, defaultRoofColorId: id }))} />
            )}
            {key === 'wall' && (
              <ColorPickerButton selectedId={form.defaultWallColorId} onChange={(id) => setForm((f) => ({ ...f, defaultWallColorId: id }))} />
            )}
          </div>
        ))}

        {customServiceCatalog.length > 0 ? (
          <>
            <div className="field-label" style={{ marginTop: '0.6rem' }}>Custom services</div>
            {customServiceCatalog.map((cs) => (
              <div className="service-row" key={cs.id}>
                <label className="service-row-main">
                  <input
                    type="checkbox" checked={(form.defaultCustomServiceIds || []).includes(cs.id)}
                    onChange={(e) => toggleDefaultCustomService(cs.id)(e.target.checked)}
                  />
                  <span>{cs.name}</span>
                </label>
                <span className="service-note">${Number(cs.price).toFixed(2)}/{cs.unit}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="control-sublabel" style={{ marginTop: '0.5rem' }}>
            No custom services defined yet — add some in the Custom Services tab, then come back
            here to have any of them turned on by default for new projects too.
          </div>
        )}
      </div>

      <div className="control-block">
        <div className="field-label">Report branding</div>
        <label className="field-label" htmlFor="settings-logo">Company Logo</label>
        <div className="settings-logo-row">
          {(logoPreviewUrl || form.logoUrl) && (
            <img src={logoPreviewUrl || form.logoUrl} alt="Company logo" className="settings-logo-preview" />
          )}
          <input
            id="settings-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
            disabled={logoBusy}
            onChange={(e) => handleLogoFileChange(e.target.files?.[0])}
          />
          <button type="button" className="btn-secondary" disabled={logoBusy || !selectedLogoFile} onClick={handleLogoUpload}>
            {logoBusy ? 'Uploading…' : 'Upload'}
          </button>
          {form.logoUrl && (
            <button type="button" className="layer-remove-btn" onClick={() => setForm((f) => ({ ...f, logoUrl: '' }))} aria-label="Remove logo">×</button>
          )}
        </div>
        <div className="control-sublabel">
          Pick a file to preview it, then click Upload. Shown on the PDF cover page and in the app
          header. PNG/JPEG/WebP/SVG, up to 5 MB.
        </div>
        <label htmlFor="settings-footer">Footer note (PDF cover page)</label>
        <textarea
          id="settings-footer" className="control-select" rows={2}
          value={form.reportFooterNote}
          onChange={(e) => setForm((f) => ({ ...f, reportFooterNote: e.target.value }))}
          placeholder="This is a preliminary estimate — final pricing subject to on-site verification and a signed contract."
        />
      </div>

      <div className="control-block">
        <div className="field-label">Notifications</div>
        <label htmlFor="settings-webhook">Approval webhook URL</label>
        <input
          id="settings-webhook" type="text" className="control-select"
          value={form.notificationWebhookUrl}
          onChange={(e) => setForm((f) => ({ ...f, notificationWebhookUrl: e.target.value }))}
          placeholder="https://hook.us1.make.com/..."
        />
        <div className="control-sublabel">
          When a customer approves a design, a <code>design.approved</code> event is POSTed here
          (e.g. a Make.com webhook) — see INTEGRATIONS.md. Leave blank to skip notifications.
        </div>
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
