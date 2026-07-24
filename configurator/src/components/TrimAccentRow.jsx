import ColorPickerButton from './ColorPickerButton.jsx';
import {
  TRIM_KIND_LABELS,
  displayTrimQuantity,
  practicalProductLabel,
  productBaseLabel,
  trimDisplayUnit,
  trimQuantityFromDisplay,
} from '../lib/trimAccents.js';

export default function TrimAccentRow({
  record,
  unitSystem,
  onChange,
  onRemove,
  isCustomerView = false,
  canonicalReadOnly = false,
}) {
  const label = record.customLabel ?? TRIM_KIND_LABELS[record.kind] ?? 'Trim';
  const customerLocked = isCustomerView && record.locked;
  const update = (patch) => onChange({ ...record, ...patch });

  return (
    <div className="trim-accent-row" data-trim-kind={record.kind}>
      <div className="trim-accent-row-heading">
        <strong>{label}</strong>
        <label className="service-lock-toggle">
          <input
            type="checkbox"
            checked={record.selected === true}
            disabled={customerLocked}
            onChange={(event) => update({ selected: event.target.checked })}
          />
          <span>Include</span>
        </label>
        {!isCustomerView && (
          <label className="service-lock-toggle">
            <input
              type="checkbox"
              checked={record.locked}
              onChange={(event) => update({ locked: event.target.checked })}
            />
            <span>Lock</span>
          </label>
        )}
        {record.customLabel !== undefined && !isCustomerView && !canonicalReadOnly && onRemove && (
          <button
            type="button"
            className="layer-remove-btn"
            aria-label={`Remove ${label || 'additional trim'}`}
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>
      <div className="trim-accent-row-fields">
        <label className="trim-accent-field">
          <span>Product</span>
          <input
            type="text"
            value={record.productLabel ?? practicalProductLabel(record.productId, record.profile)}
            disabled={customerLocked || canonicalReadOnly}
            aria-label={`${label} product`}
            onChange={(event) => update({
              productLabel: event.target.value,
              baseProductLabel: productBaseLabel(event.target.value, record.profile),
              ...(record.sourceOptionId ? {} : { productId: event.target.value, profile: '' }),
            })}
          />
        </label>
        <div className="trim-accent-field trim-accent-color">
          <span>Color</span>
          <ColorPickerButton
            selectedId={record.colorId}
            disabled={customerLocked}
            onChange={(colorId) => update({ colorId })}
          />
        </div>
        {record.customLabel !== undefined && (
          <label className="trim-accent-field trim-accent-dimension">
            <span>Dimension</span>
            <select
              value={record.canonicalUnit}
              disabled={customerLocked || canonicalReadOnly}
              aria-label={`${label} quantity dimension`}
              onChange={(event) => update({ canonicalUnit: event.target.value, quantity: 0 })}
            >
              <option value="linear_feet">Linear</option>
              <option value="square_feet">Area</option>
            </select>
          </label>
        )}
        <label className="trim-accent-field trim-accent-quantity">
          <span>Quantity</span>
          <span className="trim-accent-quantity-control">
            <input
              type="number"
              min="0"
              step="0.01"
              value={displayTrimQuantity(record.quantity, record.canonicalUnit, unitSystem)}
              disabled={customerLocked}
              aria-label={`${label} quantity in ${trimDisplayUnit(record.canonicalUnit, unitSystem)}`}
              onChange={(event) => update({
                quantity: trimQuantityFromDisplay(event.target.value, record.canonicalUnit, unitSystem),
              })}
            />
            <span className="service-unit">{trimDisplayUnit(record.canonicalUnit, unitSystem)}</span>
          </span>
        </label>
      </div>
    </div>
  );
}
