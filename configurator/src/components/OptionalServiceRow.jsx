import { displayMeasurement, measurementFromDisplay, unitPriceToDisplay } from '../lib/units.js';

const pricingMethodLabel = (method) => {
  if (method === 'per_unit') return 'Per unit';
  return String(method || 'per_unit').replaceAll('_', ' ');
};

export default function OptionalServiceRow({
  service,
  onChange,
  onRemove,
  removeDisabled = false,
  linkUrl,
  isCustomerView = false,
  readOnlyQuantity = false,
  showSelection = true,
  showQuantity = true,
  showLock = true,
  unitSystem = 'imperial',
}) {
  const customerLocked = isCustomerView && service.locked;
  const update = (patch) => onChange?.({ ...service, ...patch });
  const displayQuantity = displayMeasurement(service.quantity, service.unit, unitSystem);
  const displayUnitPrice = unitPriceToDisplay(service.unitPrice, service.unit, unitSystem);

  return (
    <div className="service-row optional-service-row" data-pricing-method={service.pricingMethod}>
      <div className="service-row-main optional-service-heading">
        {showSelection && (
          <input
            type="checkbox"
            checked={service.selected}
            disabled={customerLocked}
            aria-label={`Include ${service.name}`}
            onChange={(event) => update({ selected: event.target.checked })}
          />
        )}
        <strong>{service.name}</strong>
      </div>

      {showLock && !isCustomerView && (
        <label className="service-lock-toggle">
          <input
            type="checkbox"
            checked={service.locked}
            onChange={(event) => update({ locked: event.target.checked })}
          />
          <span>Lock</span>
        </label>
      )}

      <div className="optional-service-field optional-service-description">
        <span>Description</span>
        <span>{service.description || '—'}</span>
      </div>
      <div className="optional-service-field">
        <span>Pricing method</span>
        <span>{pricingMethodLabel(service.pricingMethod)}</span>
      </div>
      {showQuantity && (
        <label className="optional-service-field optional-service-quantity">
          <span>Quantity</span>
          <span>
            <input
              type="number"
              min="0"
              step="1"
              className="service-qty"
              value={displayQuantity.value}
              disabled={!service.selected || readOnlyQuantity || customerLocked}
              aria-label={`${service.name} quantity in ${displayQuantity.unit}`}
              onChange={(event) => update({
                quantity: measurementFromDisplay(Number(event.target.value) || 0, service.unit, unitSystem),
              })}
            />
            <span className="service-unit">{displayQuantity.unit}</span>
          </span>
        </label>
      )}
      <div className="optional-service-field">
        <span>Unit price</span>
        <span>${displayUnitPrice.toFixed(2)}/{displayQuantity.unit}</span>
      </div>

      {linkUrl && <a href={linkUrl} target="_blank" rel="noreferrer" className="service-note">Link</a>}
      {!isCustomerView && onRemove && (
        <button
          type="button"
          className="layer-remove-btn"
          disabled={removeDisabled}
          aria-label={`Remove ${service.name}`}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  );
}
