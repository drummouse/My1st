import { useState } from 'react';
import { ACCESSORY_PRICING } from '../data/pricing.js';
import {
  adaptCustomServiceLine,
  libraryOptionToCustomServiceLine,
  optionalServiceToCustomServiceLine,
} from '../lib/designState.js';
import { isTrimServiceKey, partitionServiceLines } from '../lib/trimServiceBoundary.js';
import { feetFromDisplay, feetToDisplay, linearUnit } from '../lib/units.js';
import ColorPickerButton from './ColorPickerButton.jsx';
import LibraryOptionPicker from './LibraryOptionPicker.jsx';
import OptionalServiceRow from './OptionalServiceRow.jsx';

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
  libraryOptions = [],
  unitSystem = 'imperial',
}) {
  const [addingService, setAddingService] = useState(false);
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
  const { serviceLines, trimServiceLines } = partitionServiceLines(customServiceLines);
  const publishServiceLines = (nextServiceLines) => onCustomServiceLinesChange([
    ...trimServiceLines,
    ...nextServiceLines,
  ]);
  const fallbackOptions = (catalog || []).map((definition) => ({
    id: definition.id,
    source: 'custom-service',
    kind: 'service',
    label: definition.name,
    unit: definition.unit,
    unitPrice: definition.price,
    active: true,
  }));
  const availableServices = (libraryOptions.length ? libraryOptions : fallbackOptions).filter((option) => (
    !isTrimServiceKey(option.serviceKey ?? option.key)
    && !serviceLines.some((line) => (line.sourceOptionId ?? line.id) === option.id)
  ));
  const optionalServiceRecords = serviceLines.map((line) => adaptCustomServiceLine(line));
  const updateOptionalService = (nextService) => publishServiceLines(serviceLines.map((line) => (
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
      {serviceLines.length > 0 && (
        <>
          <div className="field-label" style={{ marginTop: '0.75rem' }}>Custom Services</div>
          {optionalServiceRecords.map((service) => (
            <OptionalServiceRow
              key={service.id}
              service={service}
              linkUrl={serviceLines.find((line) => line.id === service.id)?.linkUrl}
              isCustomerView={isCustomerView}
              readOnlyQuantity={readOnlyQuantities}
              onChange={updateOptionalService}
              onRemove={readOnlyQuantities ? undefined : () => publishServiceLines(
                serviceLines.filter((line) => line.id !== service.id),
              )}
              unitSystem={unitSystem}
            />
          ))}
        </>
      )}
      {!isCustomerView && !readOnlyQuantities && (
        <button
          type="button"
          className="btn-secondary"
          disabled={!availableServices.length}
          onClick={() => setAddingService(true)}
        >
          Add Service
        </button>
      )}
      {addingService && (
        <LibraryOptionPicker
          kind="service"
          options={availableServices}
          onClose={() => setAddingService(false)}
          onSelect={(option) => {
            publishServiceLines([
              ...serviceLines,
              libraryOptionToCustomServiceLine(option),
            ]);
            setAddingService(false);
          }}
        />
      )}
    </div>
  );
}
