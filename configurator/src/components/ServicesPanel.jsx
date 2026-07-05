import { GUTTER_OPTIONS, ACCESSORY_PRICING } from '../data/pricing.js';

function ServiceRow({ id, label, checked, onToggle, qty, unit, onQtyChange, note }) {
  return (
    <div className="service-row">
      <label className="service-row-main">
        <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
        <span>{label}</span>
      </label>
      <input
        type="number"
        min="0"
        step="1"
        className="service-qty"
        value={qty}
        disabled={!checked}
        onChange={(e) => onQtyChange(Number(e.target.value) || 0)}
        aria-label={`${label} quantity in ${unit}`}
      />
      <span className="service-unit">{unit}</span>
      {note && <span className="service-note">{note}</span>}
    </div>
  );
}

export default function ServicesPanel({ services, onServicesChange, measurements, onMeasurementsChange, gutterOptionId, onGutterOptionChange }) {
  const toggle = (key) => (val) => onServicesChange({ ...services, [key]: val });
  const setQty = (key) => (val) => onMeasurementsChange({ ...measurements, [key]: val });
  const gutterOption = GUTTER_OPTIONS.find((g) => g.id === gutterOptionId) || GUTTER_OPTIONS[0];

  const soffitFasciaDeal = services.soffit && services.fascia;
  const gutterDownspoutDeal = services.gutters && services.downspouts;

  return (
    <div className="control-block">
      <div className="control-label">Optional Services</div>

      <ServiceRow
        id="soffit" label={ACCESSORY_PRICING.soffit.label} checked={services.soffit} onToggle={toggle('soffit')}
        qty={measurements.soffitSqft} unit="sqft" onQtyChange={setQty('soffitSqft')}
      />
      <ServiceRow
        id="fascia" label={ACCESSORY_PRICING.fascia.label} checked={services.fascia} onToggle={toggle('fascia')}
        qty={measurements.fasciaLf} unit="LF" onQtyChange={setQty('fasciaLf')}
        note={soffitFasciaDeal ? '50% OFF (soffit + fascia deal)' : null}
      />

      <div className="service-row service-row-select">
        <label>Eavestrough profile</label>
        <select className="control-select" value={gutterOptionId} onChange={(e) => onGutterOptionChange(e.target.value)}>
          {GUTTER_OPTIONS.map((g) => (
            <option key={g.id} value={g.id}>{g.label} — ${g.pricePerLf.toFixed(2)}/LF</option>
          ))}
        </select>
      </div>
      <ServiceRow
        id="gutters" label="Gutters" checked={services.gutters} onToggle={toggle('gutters')}
        qty={measurements.gutterLf} unit="LF" onQtyChange={setQty('gutterLf')}
      />
      <ServiceRow
        id="downspouts" label={`Downspouts (${gutterOption.downspout.label})`} checked={services.downspouts} onToggle={toggle('downspouts')}
        qty={measurements.downspoutLf} unit="LF" onQtyChange={setQty('downspoutLf')}
        note={gutterDownspoutDeal ? 'FREE (gutters + downspouts deal)' : null}
      />

      <ServiceRow
        id="snowRetention" label={ACCESSORY_PRICING.snowRetention.label} checked={services.snowRetention} onToggle={toggle('snowRetention')}
        qty={measurements.snowRetentionLf} unit="LF" onQtyChange={setQty('snowRetentionLf')}
      />
      <ServiceRow
        id="capFlashing" label={ACCESSORY_PRICING.capFlashing.label} checked={services.capFlashing} onToggle={toggle('capFlashing')}
        qty={measurements.capFlashingLf} unit="LF" onQtyChange={setQty('capFlashingLf')}
      />
      <ServiceRow
        id="garageDoorCapping" label={ACCESSORY_PRICING.garageDoorCapping.label} checked={services.garageDoorCapping} onToggle={toggle('garageDoorCapping')}
        qty={measurements.garageDoorCappingLf} unit="LF" onQtyChange={setQty('garageDoorCappingLf')}
      />
    </div>
  );
}
