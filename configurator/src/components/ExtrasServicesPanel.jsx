import { useState } from 'react';
import { ACCESSORY_PRICING } from '../data/pricing.js';
import { adaptCustomServiceLine, optionalServiceToCustomServiceLine } from '../lib/designState.js';
import { displayMeasurement, feetFromDisplay, feetToDisplay, linearUnit, unitPriceToDisplay } from '../lib/units.js';
import ColorPickerButton from './ColorPickerButton.jsx';
import OptionalServiceRow from './OptionalServiceRow.jsx';

export const TRIM_SERVICE_KEYS = Object.freeze([
  'soffit', 'fascia', 'gutters', 'downspouts', 'garageDoorCapping', 'capFlashing',
]);

export function isTrimServiceKey(key) {
  return TRIM_SERVICE_KEYS.includes(key);
}

export function ServiceRow({
  label, checked, onToggle, qty, unit, onQtyChange, note, colorId, onColorChange, readOnly,
  locked, onToggleLock, showLockToggle, extra, showToggle = true,
}) {
  return (
    <div className="service-row">
      {showToggle ? (
        <label className="service-row-main">
          <input type="checkbox" checked={checked} disabled={readOnly && locked} onChange={(event) => onToggle(event.target.checked)} />
          <span>{label}</span>
        </label>
      ) : <span className="service-row-main"><span>{label}</span></span>}
      {showLockToggle && (
        <label className="service-lock-toggle" title="Lock — the client can't opt out of this service in exported/shared views">
          <input type="checkbox" checked={!!locked} onChange={(event) => onToggleLock(event.target.checked)} />
          <span>Lock</span>
        </label>
      )}
      {extra}
      {qty !== undefined && (
        <>
          <input
            type="number" min="0" step="1" className="service-qty" value={qty}
            disabled={!checked || readOnly}
            onChange={(event) => onQtyChange(Number(event.target.value) || 0)}
            aria-label={`${label} quantity in ${unit}`}
          />
          <span className="service-unit">{unit}</span>
        </>
      )}
      {colorId !== undefined && <ColorPickerButton selectedId={colorId} onChange={onColorChange} disabled={readOnly} />}
      {note && <span className="service-note">{note}</span>}
    </div>
  );
}

function AddServiceRow({ catalog, existingCustomIds, onAddCustom, unitSystem }) {
  const availableCustom = catalog.filter((definition) => !existingCustomIds.includes(definition.id));
  const [selectedId, setSelectedId] = useState(availableCustom[0]?.id || '');
  if (!availableCustom.length) return null;
  const selected = availableCustom.find((definition) => definition.id === selectedId) ?? availableCustom[0];
  return (
    <div className="service-row service-row-select">
      <label htmlFor="add-service">Add a service</label>
      <select id="add-service" className="control-select" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
        {availableCustom.map((definition) => (
          <option key={definition.id} value={definition.id}>
            {definition.name} — ${unitPriceToDisplay(
              Number(definition.price), definition.unit, unitSystem,
            ).toFixed(2)}/{displayMeasurement(0, definition.unit, unitSystem).unit}
          </option>
        ))}
      </select>
      <button type="button" className="btn-secondary" onClick={() => onAddCustom(selected)}>+ Add</button>
    </div>
  );
}

export default function ExtrasServicesPanel({
  services = {},
  customServiceLines = [],
  customServiceCatalog,
  catalog = customServiceCatalog ?? [],
  locks = {},
  onChange,
  onServicesChange = onChange,
  lockedServices = locks,
  onLockedServicesChange = () => {},
  measurements = {},
  onMeasurementsChange = () => {},
  readOnlyQuantities = false,
  isCustomerView = false,
  onCustomServiceLinesChange = () => {},
  unitSystem = 'imperial',
}) {
  const extras = Object.fromEntries(
    Object.entries(services || {}).filter(([key]) => !isTrimServiceKey(key)),
  );
  const displayLinearQuantity = (value) => feetToDisplay(value, unitSystem);
  const setLinearQty = (key) => (value) => onMeasurementsChange({
    ...measurements,
    [key]: feetFromDisplay(value, unitSystem),
  });
  const linearDisplayUnit = linearUnit(unitSystem) === 'ft' ? 'LF' : linearUnit(unitSystem);
  const toggle = (key) => (value) => onServicesChange?.({ ...services, [key]: value });
  const toggleLock = (key) => (value) => onLockedServicesChange({ ...lockedServices, [key]: value });
  const showLockToggle = !isCustomerView;
  const optionalServiceRecords = customServiceLines.map((line) => adaptCustomServiceLine(line));
  const updateOptionalService = (nextService) => onCustomServiceLinesChange(customServiceLines.map((line) => (
    line.id === nextService.id ? optionalServiceToCustomServiceLine(nextService, line) : line
  )));

  return (
    <div className="control-block">
      <div className="control-label">Optional Services</div>
      <div className="control-sublabel">
        Roof and Wall have their own enable checkbox next to their Material section above. Optional services stay separate from trim records.
      </div>
      {extras.snowRetention && (
        <ServiceRow
          label={ACCESSORY_PRICING.snowRetention.label} checked={extras.snowRetention} onToggle={toggle('snowRetention')}
          qty={displayLinearQuantity(measurements.snowRetentionLf)} unit={linearDisplayUnit} onQtyChange={setLinearQty('snowRetentionLf')}
          readOnly={readOnlyQuantities} locked={lockedServices?.snowRetention} onToggleLock={toggleLock('snowRetention')} showLockToggle={showLockToggle}
        />
      )}
      {!extras.snowRetention && !isCustomerView && !readOnlyQuantities && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => toggle('snowRetention')(true)}
        >
          Add Snow Retention
        </button>
      )}
      {customServiceLines.length > 0 && (
        <>
          <div className="field-label" style={{ marginTop: '0.75rem' }}>Custom Services</div>
          {optionalServiceRecords.map((service) => (
            <OptionalServiceRow
              key={service.id}
              service={service}
              linkUrl={customServiceLines.find((line) => line.id === service.id)?.linkUrl}
              isCustomerView={isCustomerView}
              readOnlyQuantity={readOnlyQuantities}
              onChange={updateOptionalService}
              onRemove={readOnlyQuantities ? undefined : () => onCustomServiceLinesChange(
                customServiceLines.filter((line) => line.id !== service.id),
              )}
              unitSystem={unitSystem}
            />
          ))}
        </>
      )}
      {!isCustomerView && !readOnlyQuantities && (
        <AddServiceRow
          catalog={catalog}
          existingCustomIds={customServiceLines.map((line) => line.id)}
          onAddCustom={(definition) => onCustomServiceLinesChange([...customServiceLines,
            optionalServiceToCustomServiceLine(adaptCustomServiceLine({
              id: definition.id,
              name: definition.name,
              unit: definition.unit,
              price: Number(definition.price),
              qty: 1,
              description: definition.description,
              selected: true,
              locked: false,
            }), { linkUrl: definition.link_url }),
          ])}
          unitSystem={unitSystem}
        />
      )}
    </div>
  );
}
