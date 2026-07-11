import { useState } from 'react';
import { GUTTER_OPTIONS, DOWNSPOUT_OPTIONS, ACCESSORY_PRICING } from '../data/pricing.js';
import ColorPickerButton from './ColorPickerButton.jsx';

// The 7 accessory services below hide entirely once turned off (see
// ServicesPanel's render — a New Project default that's unchecked in
// Settings never shows a row at all here) rather than showing a
// permanently-visible, greyed-out row — this is what lets them share one
// "Add a service" picker with the owner's custom-service catalog below.
// Roof/Wall (rendered by App.jsx, not here) deliberately don't follow this
// same hide-when-off rule: they're "structural" — the 3D model always shows
// roof/wall geometry in some color regardless of billing status, so their
// Material/Color pickers stay visible whenever a layer actually has that
// type of face, gated only by services.roof/wall for pricing. These 7 are
// "optional add-ons" with no permanent visual footprint, so off truly means
// gone until re-added.
const FIXED_SERVICE_DEFS = [
  { key: 'soffit', label: ACCESSORY_PRICING.soffit.label },
  { key: 'fascia', label: ACCESSORY_PRICING.fascia.label },
  { key: 'gutters', label: 'Gutters' },
  { key: 'downspouts', label: 'Downspouts' },
  { key: 'snowRetention', label: ACCESSORY_PRICING.snowRetention.label },
  { key: 'capFlashing', label: ACCESSORY_PRICING.capFlashing.label },
  { key: 'garageDoorCapping', label: ACCESSORY_PRICING.garageDoorCapping.label },
];

// One combined "what can I turn on" picker for both a hidden fixed service
// (soffit, fascia, ...) and a not-yet-added custom-service catalog entry —
// same list, same Add button, since from the admin's point of view they're
// both just "another optional line I might want on this project."
function AddServiceRow({ fixedOptions, catalog, existingCustomIds, onAddFixed, onAddCustom }) {
  const availableCustom = catalog.filter((def) => !existingCustomIds.includes(def.id));
  const options = [
    ...fixedOptions.map((f) => ({ id: `fixed:${f.key}`, label: f.label })),
    ...availableCustom.map((def) => ({ id: `custom:${def.id}`, label: `${def.name} — $${Number(def.price).toFixed(2)}/${def.unit}` })),
  ];
  const [selectedId, setSelectedId] = useState(options[0]?.id || '');
  if (!options.length) return null;
  const handleAdd = () => {
    if (selectedId.startsWith('fixed:')) {
      onAddFixed(selectedId.slice('fixed:'.length));
    } else if (selectedId.startsWith('custom:')) {
      const def = availableCustom.find((d) => `custom:${d.id}` === selectedId);
      if (def) onAddCustom(def);
    }
  };
  return (
    <div className="service-row service-row-select">
      <label htmlFor="add-service">Add a service</label>
      <select id="add-service" className="control-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <button type="button" className="btn-secondary" onClick={handleAdd}>+ Add</button>
    </div>
  );
}

export function ServiceRow({
  label, checked, onToggle, qty, unit, onQtyChange, note, colorId, onColorChange, readOnly,
  locked, onToggleLock, showLockToggle, extra,
}) {
  return (
    <div className="service-row">
      <label className="service-row-main">
        <input type="checkbox" checked={checked} disabled={readOnly && locked} onChange={(e) => onToggle(e.target.checked)} />
        <span>{label}</span>
      </label>
      {showLockToggle && (
        <label
          className="service-lock-toggle"
          title="Lock — the client can't opt out of this service in exported/shared views"
        >
          <input type="checkbox" checked={!!locked} onChange={(e) => onToggleLock(e.target.checked)} />
          <span>Lock</span>
        </label>
      )}
      {extra}
      {qty !== undefined && (
        <>
          <input
            type="number"
            min="0"
            step="1"
            className="service-qty"
            value={qty}
            disabled={!checked || readOnly}
            onChange={(e) => onQtyChange(Number(e.target.value) || 0)}
            aria-label={`${label} quantity in ${unit}`}
          />
          <span className="service-unit">{unit}</span>
        </>
      )}
      {colorId && <ColorPickerButton selectedId={colorId} onChange={onColorChange} disabled={readOnly} />}
      {note && <span className="service-note">{note}</span>}
    </div>
  );
}

export default function ServicesPanel({
  services, onServicesChange, lockedServices, onLockedServicesChange, measurements, onMeasurementsChange,
  gutterOptionId, onGutterOptionChange, downspoutOptionId, onDownspoutOptionChange,
  accessoryColors, onAccessoryColorsChange, readOnlyQuantities, isCustomerView,
  customServiceLines = [], onCustomServiceLinesChange, customServiceCatalog = [],
}) {
  const toggle = (key) => (val) => onServicesChange({ ...services, [key]: val });
  const setQty = (key) => (val) => onMeasurementsChange({ ...measurements, [key]: val });
  const setColor = (key) => (val) => onAccessoryColorsChange({ ...accessoryColors, [key]: val });
  const toggleLock = (key) => (val) => onLockedServicesChange({ ...lockedServices, [key]: val });
  const showLockToggle = !isCustomerView;

  const soffitFasciaDeal = services.soffit && services.fascia;
  const gutterDownspoutDeal = services.gutters && services.downspouts;

  return (
    <div className="control-block">
      <div className="control-label">Optional Services</div>
      <div className="control-sublabel">
        Roof and Wall have their own enable checkbox next to their Material section above. Below,
        a service that's off doesn't clutter the list — uncheck one and it's gone; bring it (or a
        custom service) back any time from "Add a service" at the bottom.
      </div>

      {services.soffit && (
        <ServiceRow
          label={ACCESSORY_PRICING.soffit.label} checked={services.soffit} onToggle={toggle('soffit')}
          qty={measurements.soffitSqft} unit="sqft" onQtyChange={setQty('soffitSqft')}
          colorId={accessoryColors.soffit} onColorChange={setColor('soffit')} readOnly={readOnlyQuantities}
          locked={lockedServices?.soffit} onToggleLock={toggleLock('soffit')} showLockToggle={showLockToggle}
        />
      )}
      {services.fascia && (
        <ServiceRow
          label={ACCESSORY_PRICING.fascia.label} checked={services.fascia} onToggle={toggle('fascia')}
          qty={measurements.fasciaLf} unit="LF" onQtyChange={setQty('fasciaLf')}
          colorId={accessoryColors.fascia} onColorChange={setColor('fascia')}
          note={soffitFasciaDeal ? '50% OFF (soffit + fascia deal)' : null} readOnly={readOnlyQuantities}
          locked={lockedServices?.fascia} onToggleLock={toggleLock('fascia')} showLockToggle={showLockToggle}
        />
      )}

      {services.gutters && (
        <ServiceRow
          label="Gutters" checked={services.gutters} onToggle={toggle('gutters')}
          extra={(
            <select
              className="control-select" aria-label="Eavestrough profile"
              value={gutterOptionId} disabled={readOnlyQuantities}
              onChange={(e) => onGutterOptionChange(e.target.value)}
            >
              {GUTTER_OPTIONS.map((g) => (
                <option key={g.id} value={g.id}>{g.label} — ${g.pricePerLf.toFixed(2)}/LF</option>
              ))}
            </select>
          )}
          qty={measurements.gutterLf} unit="LF" onQtyChange={setQty('gutterLf')}
          colorId={accessoryColors.gutters} onColorChange={setColor('gutters')} readOnly={readOnlyQuantities}
          locked={lockedServices?.gutters} onToggleLock={toggleLock('gutters')} showLockToggle={showLockToggle}
        />
      )}

      {services.downspouts && (
        <ServiceRow
          label="Downspouts" checked={services.downspouts} onToggle={toggle('downspouts')}
          extra={(
            <select
              className="control-select" aria-label="Downspout type"
              value={downspoutOptionId} disabled={readOnlyQuantities}
              onChange={(e) => onDownspoutOptionChange(e.target.value)}
            >
              {DOWNSPOUT_OPTIONS.map((d) => (
                <option key={d.id} value={d.id}>{d.label} — ${d.pricePerLf.toFixed(2)}/LF</option>
              ))}
            </select>
          )}
          qty={measurements.downspoutLf} unit="LF" onQtyChange={setQty('downspoutLf')}
          colorId={accessoryColors.downspouts} onColorChange={setColor('downspouts')}
          note={gutterDownspoutDeal ? 'FREE (gutters + downspouts deal)' : null} readOnly={readOnlyQuantities}
          locked={lockedServices?.downspouts} onToggleLock={toggleLock('downspouts')} showLockToggle={showLockToggle}
        />
      )}

      {services.snowRetention && (
        <ServiceRow
          label={ACCESSORY_PRICING.snowRetention.label} checked={services.snowRetention} onToggle={toggle('snowRetention')}
          qty={measurements.snowRetentionLf} unit="LF" onQtyChange={setQty('snowRetentionLf')} readOnly={readOnlyQuantities}
          locked={lockedServices?.snowRetention} onToggleLock={toggleLock('snowRetention')} showLockToggle={showLockToggle}
        />
      )}
      {services.capFlashing && (
        <ServiceRow
          label={ACCESSORY_PRICING.capFlashing.label} checked={services.capFlashing} onToggle={toggle('capFlashing')}
          qty={measurements.capFlashingLf} unit="LF" onQtyChange={setQty('capFlashingLf')} readOnly={readOnlyQuantities}
          locked={lockedServices?.capFlashing} onToggleLock={toggleLock('capFlashing')} showLockToggle={showLockToggle}
        />
      )}
      {services.garageDoorCapping && (
        <ServiceRow
          label={ACCESSORY_PRICING.garageDoorCapping.label} checked={services.garageDoorCapping} onToggle={toggle('garageDoorCapping')}
          qty={measurements.garageDoorCappingLf} unit="LF" onQtyChange={setQty('garageDoorCappingLf')} readOnly={readOnlyQuantities}
          locked={lockedServices?.garageDoorCapping} onToggleLock={toggleLock('garageDoorCapping')} showLockToggle={showLockToggle}
        />
      )}

      {customServiceLines.length > 0 && (
        <>
          <div className="field-label" style={{ marginTop: '0.75rem' }}>Custom Services</div>
          {customServiceLines.map((cs) => (
            <div className="service-row" key={cs.id}>
              <label className="service-row-main"><span>{cs.name}</span></label>
              <input
                type="number" min="0" step="1" className="service-qty"
                value={cs.qty} disabled={readOnlyQuantities}
                aria-label={`${cs.name} quantity in ${cs.unit}`}
                onChange={(e) => onCustomServiceLinesChange(customServiceLines.map((l) => (l.id === cs.id ? { ...l, qty: Number(e.target.value) || 0 } : l)))}
              />
              <span className="service-unit">{cs.unit}</span>
              <span className="service-note">${Number(cs.price).toFixed(2)}/{cs.unit}</span>
              {cs.linkUrl && <a href={cs.linkUrl} target="_blank" rel="noreferrer" className="service-note">Link</a>}
              {!readOnlyQuantities && (
                <button
                  type="button" className="layer-remove-btn" aria-label={`Remove ${cs.name}`}
                  onClick={() => onCustomServiceLinesChange(customServiceLines.filter((l) => l.id !== cs.id))}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {!isCustomerView && !readOnlyQuantities && (
        <AddServiceRow
          fixedOptions={FIXED_SERVICE_DEFS.filter((f) => !services[f.key])}
          catalog={customServiceCatalog}
          existingCustomIds={customServiceLines.map((l) => l.id)}
          onAddFixed={(key) => onServicesChange({ ...services, [key]: true })}
          onAddCustom={(def) => onCustomServiceLinesChange([...customServiceLines, {
            id: def.id, name: def.name, unit: def.unit, price: Number(def.price), qty: 1,
            description: def.description, linkUrl: def.link_url,
          }])}
        />
      )}
    </div>
  );
}
