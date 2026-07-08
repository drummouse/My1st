import { GUTTER_OPTIONS, ACCESSORY_PRICING } from '../data/pricing.js';
import { RAL_COLORS } from '../data/colors.js';

const SERIES_ORDER = ['Icecrystal Relief', 'Printech Woodgrain', 'Wrinkle Coating'];

function AccessoryColorSelect({ label, colorId, onChange }) {
  return (
    <select
      className="service-color-select"
      value={colorId}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`${label} color`}
      title={`${label} color`}
    >
      {SERIES_ORDER.map((series) => (
        <optgroup key={series} label={series}>
          {RAL_COLORS.filter((c) => c.series === series).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
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
      {colorId && <AccessoryColorSelect label={label} colorId={colorId} onChange={onColorChange} />}
      {note && <span className="service-note">{note}</span>}
    </div>
  );
}

export default function ServicesPanel({
  services, onServicesChange, lockedServices, onLockedServicesChange, measurements, onMeasurementsChange,
  gutterOptionId, onGutterOptionChange, accessoryColors, onAccessoryColorsChange, readOnlyQuantities, isCustomerView,
}) {
  const toggle = (key) => (val) => onServicesChange({ ...services, [key]: val });
  const setQty = (key) => (val) => onMeasurementsChange({ ...measurements, [key]: val });
  const setColor = (key) => (val) => onAccessoryColorsChange({ ...accessoryColors, [key]: val });
  const toggleLock = (key) => (val) => onLockedServicesChange({ ...lockedServices, [key]: val });
  const gutterOption = GUTTER_OPTIONS.find((g) => g.id === gutterOptionId) || GUTTER_OPTIONS[0];
  const showLockToggle = !isCustomerView;

  const soffitFasciaDeal = services.soffit && services.fascia;
  const gutterDownspoutDeal = services.gutters && services.downspouts;

  return (
    <div className="control-block">
      <div className="control-label">Optional Services</div>

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
      <ServiceRow
        label={`Downspouts (${gutterOption.downspout.label})`} checked={services.downspouts} onToggle={toggle('downspouts')}
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
    </div>
  );
}
