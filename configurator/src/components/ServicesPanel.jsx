import { useState } from 'react';
import { GUTTER_OPTIONS, DOWNSPOUT_OPTIONS, ACCESSORY_PRICING } from '../data/pricing.js';
import ColorPickerButton from './ColorPickerButton.jsx';

function AddCustomServiceRow({ catalog, existingIds, onAdd }) {
  const available = catalog.filter((def) => !existingIds.includes(def.id));
  const [selectedId, setSelectedId] = useState(available[0]?.id || '');
  if (!available.length) return null;
  return (
    <div className="service-row service-row-select">
      <label htmlFor="add-custom-service">Add a custom service</label>
      <select id="add-custom-service" className="control-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
        {available.map((def) => <option key={def.id} value={def.id}>{def.name} — ${Number(def.price).toFixed(2)}/{def.unit}</option>)}
      </select>
      <button
        type="button" className="btn-secondary"
        onClick={() => {
          const def = catalog.find((d) => d.id === selectedId);
          if (def) onAdd(def);
        }}
      >
        + Add
      </button>
    </div>
  );
}

function ServiceRow({
  label, checked, onToggle, qty, unit, onQtyChange, note, colorId, onColorChange, readOnly,
  locked, onToggleLock, showLockToggle,
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

      <ServiceRow
        label="Roof" checked={services.roof} onToggle={toggle('roof')} readOnly={readOnlyQuantities}
        locked={lockedServices?.roof} onToggleLock={toggleLock('roof')} showLockToggle={showLockToggle}
      />
      <ServiceRow
        label="Wall" checked={services.wall} onToggle={toggle('wall')} readOnly={readOnlyQuantities}
        locked={lockedServices?.wall} onToggleLock={toggleLock('wall')} showLockToggle={showLockToggle}
      />

      <ServiceRow
        label={ACCESSORY_PRICING.soffit.label} checked={services.soffit} onToggle={toggle('soffit')}
        qty={measurements.soffitSqft} unit="sqft" onQtyChange={setQty('soffitSqft')}
        colorId={accessoryColors.soffit} onColorChange={setColor('soffit')} readOnly={readOnlyQuantities}
        locked={lockedServices?.soffit} onToggleLock={toggleLock('soffit')} showLockToggle={showLockToggle}
      />
      <ServiceRow
        label={ACCESSORY_PRICING.fascia.label} checked={services.fascia} onToggle={toggle('fascia')}
        qty={measurements.fasciaLf} unit="LF" onQtyChange={setQty('fasciaLf')}
        colorId={accessoryColors.fascia} onColorChange={setColor('fascia')}
        note={soffitFasciaDeal ? '50% OFF (soffit + fascia deal)' : null} readOnly={readOnlyQuantities}
        locked={lockedServices?.fascia} onToggleLock={toggleLock('fascia')} showLockToggle={showLockToggle}
      />

      <div className="service-row service-row-select">
        <label>Eavestrough profile</label>
        <select
          className="control-select"
          value={gutterOptionId}
          disabled={readOnlyQuantities}
          onChange={(e) => onGutterOptionChange(e.target.value)}
        >
          {GUTTER_OPTIONS.map((g) => (
            <option key={g.id} value={g.id}>{g.label} — ${g.pricePerLf.toFixed(2)}/LF</option>
          ))}
        </select>
      </div>
      <ServiceRow
        label="Gutters" checked={services.gutters} onToggle={toggle('gutters')}
        qty={measurements.gutterLf} unit="LF" onQtyChange={setQty('gutterLf')}
        colorId={accessoryColors.gutters} onColorChange={setColor('gutters')} readOnly={readOnlyQuantities}
        locked={lockedServices?.gutters} onToggleLock={toggleLock('gutters')} showLockToggle={showLockToggle}
      />

      <div className="service-row service-row-select">
        <label>Downspout type</label>
        <select
          className="control-select"
          value={downspoutOptionId}
          disabled={readOnlyQuantities}
          onChange={(e) => onDownspoutOptionChange(e.target.value)}
        >
          {DOWNSPOUT_OPTIONS.map((d) => (
            <option key={d.id} value={d.id}>{d.label} — ${d.pricePerLf.toFixed(2)}/LF</option>
          ))}
        </select>
      </div>
      <ServiceRow
        label="Downspouts" checked={services.downspouts} onToggle={toggle('downspouts')}
        qty={measurements.downspoutLf} unit="LF" onQtyChange={setQty('downspoutLf')}
        colorId={accessoryColors.downspouts} onColorChange={setColor('downspouts')}
        note={gutterDownspoutDeal ? 'FREE (gutters + downspouts deal)' : null} readOnly={readOnlyQuantities}
        locked={lockedServices?.downspouts} onToggleLock={toggleLock('downspouts')} showLockToggle={showLockToggle}
      />

      <ServiceRow
        label={ACCESSORY_PRICING.snowRetention.label} checked={services.snowRetention} onToggle={toggle('snowRetention')}
        qty={measurements.snowRetentionLf} unit="LF" onQtyChange={setQty('snowRetentionLf')} readOnly={readOnlyQuantities}
        locked={lockedServices?.snowRetention} onToggleLock={toggleLock('snowRetention')} showLockToggle={showLockToggle}
      />
      <ServiceRow
        label={ACCESSORY_PRICING.capFlashing.label} checked={services.capFlashing} onToggle={toggle('capFlashing')}
        qty={measurements.capFlashingLf} unit="LF" onQtyChange={setQty('capFlashingLf')} readOnly={readOnlyQuantities}
        locked={lockedServices?.capFlashing} onToggleLock={toggleLock('capFlashing')} showLockToggle={showLockToggle}
      />
      <ServiceRow
        label={ACCESSORY_PRICING.garageDoorCapping.label} checked={services.garageDoorCapping} onToggle={toggle('garageDoorCapping')}
        qty={measurements.garageDoorCappingLf} unit="LF" onQtyChange={setQty('garageDoorCappingLf')} readOnly={readOnlyQuantities}
        locked={lockedServices?.garageDoorCapping} onToggleLock={toggleLock('garageDoorCapping')} showLockToggle={showLockToggle}
      />

      {(customServiceLines.length > 0 || (!isCustomerView && customServiceCatalog.length > 0)) && (
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
          {!isCustomerView && !readOnlyQuantities && (
            <AddCustomServiceRow
              catalog={customServiceCatalog}
              existingIds={customServiceLines.map((l) => l.id)}
              onAdd={(def) => onCustomServiceLinesChange([...customServiceLines, {
                id: def.id, name: def.name, unit: def.unit, price: Number(def.price), qty: 1,
                description: def.description, linkUrl: def.link_url,
              }])}
            />
          )}
        </>
      )}
    </div>
  );
}
