import { useState } from 'react';
import { DOWNSPOUT_OPTIONS, GUTTER_OPTIONS } from '../data/pricing.js';
import {
  catalogOptionIdentity,
  isLibraryTrimOption,
  normalizeTrimAccents,
  practicalProductLabel,
  upsertLibraryTrimProduct,
} from '../lib/trimAccents.js';
import LibraryOptionPicker from './LibraryOptionPicker.jsx';
import TrimAccentRow from './TrimAccentRow.jsx';

export default function TrimsPanel({
  records = [],
  libraryOptions = [],
  onChange,
  unitSystem = 'imperial',
  readOnly = false,
  isCustomerView = false,
  allowCanonicalEdits = true,
  gutterOptionId,
  downspoutOptionId,
}) {
  const [addingProduct, setAddingProduct] = useState(false);
  const gutterLabel = GUTTER_OPTIONS.find((option) => option.id === gutterOptionId)?.label ?? '';
  const downspoutLabel = DOWNSPOUT_OPTIONS.find((option) => option.id === downspoutOptionId)?.label ?? '';
  const trimRecords = normalizeTrimAccents({ trimAccents: records }).map((record) => {
    const existingLabel = practicalProductLabel(record.productLabel ?? record.productId, record.profile);
    const legacyLabel = record.kind === 'gutters'
      ? gutterLabel
      : record.kind === 'downspouts' ? downspoutLabel : '';
    return !existingLabel && legacyLabel ? { ...record, productLabel: legacyLabel } : record;
  });
  const updateRecords = onChange || (() => {});
  const updateRecord = (record, nextRecord) => updateRecords(
    trimRecords.map((item) => (item.id === record.id ? nextRecord : item)),
  );
  const removeRecord = (record) => updateRecords(trimRecords.filter((item) => item.id !== record.id));
  const availableProducts = libraryOptions
    .filter(isLibraryTrimOption)
    .filter((option) => !trimRecords.some((record) => (
      record.customLabel !== undefined
      && catalogOptionIdentity(record) === catalogOptionIdentity(option)
    )));

  return (
    <div className="control-block">
      <div className="control-label">Trims &amp; Accents</div>
      {trimRecords.map((record) => (
        <TrimAccentRow
          key={record.id}
          record={record}
          unitSystem={unitSystem}
          isCustomerView={isCustomerView}
          canonicalReadOnly={!allowCanonicalEdits}
          onChange={(nextRecord) => updateRecord(record, nextRecord)}
          onRemove={record.customLabel === undefined ? undefined : () => removeRecord(record)}
        />
      ))}
      {!isCustomerView && !readOnly && allowCanonicalEdits && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setAddingProduct(true)}
          disabled={!availableProducts.length}
        >
          Add Product
        </button>
      )}
      {addingProduct && (
        <LibraryOptionPicker
          kind="product"
          options={availableProducts}
          onClose={() => setAddingProduct(false)}
          onSelect={(option) => {
            updateRecords(upsertLibraryTrimProduct(trimRecords, option));
            setAddingProduct(false);
          }}
        />
      )}
    </div>
  );
}
