import { DOWNSPOUT_OPTIONS, GUTTER_OPTIONS } from '../data/pricing.js';
import { createAdditionalTrimAccent, normalizeTrimAccents } from '../lib/trimAccents.js';
import { linearUnit, unitPriceToDisplay } from '../lib/units.js';
import TrimAccentRow from './TrimAccentRow.jsx';

export default function TrimsPanel({
  records = [],
  onChange,
  unitSystem = 'imperial',
  readOnly = false,
  isCustomerView = false,
  allowCanonicalEdits = true,
  gutterOptionId,
  onGutterOptionChange,
  downspoutOptionId,
  onDownspoutOptionChange,
}) {
  const trimRecords = normalizeTrimAccents({ trimAccents: records });
  const updateRecords = onChange || (() => {});
  const linearDisplayUnit = linearUnit(unitSystem) === 'ft' ? 'LF' : linearUnit(unitSystem);
  const updateRecord = (record, nextRecord) => updateRecords(
    trimRecords.map((item) => (item.id === record.id ? nextRecord : item)),
  );
  const removeRecord = (record) => updateRecords(trimRecords.filter((item) => item.id !== record.id));

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
          extra={record.customLabel === undefined && record.kind === 'gutters' && (
            <select
              className="control-select"
              aria-label="Eavestrough profile"
              value={gutterOptionId}
              disabled={readOnly || !onGutterOptionChange}
              onChange={(event) => onGutterOptionChange?.(event.target.value)}
            >
              {GUTTER_OPTIONS.map((gutter) => (
                <option key={gutter.id} value={gutter.id}>
                  {gutter.label} — ${unitPriceToDisplay(gutter.pricePerLf, 'LF', unitSystem).toFixed(2)}/{linearDisplayUnit}
                </option>
              ))}
            </select>
          )}
          secondaryExtra={record.customLabel === undefined && record.kind === 'downspouts' && (
            <select
              className="control-select"
              aria-label="Downspout type"
              value={downspoutOptionId}
              disabled={readOnly || !onDownspoutOptionChange}
              onChange={(event) => onDownspoutOptionChange?.(event.target.value)}
            >
              {DOWNSPOUT_OPTIONS.map((downspout) => (
                <option key={downspout.id} value={downspout.id}>
                  {downspout.label} — ${unitPriceToDisplay(downspout.pricePerLf, 'LF', unitSystem).toFixed(2)}/{linearDisplayUnit}
                </option>
              ))}
            </select>
          )}
        />
      ))}
      {!isCustomerView && !readOnly && allowCanonicalEdits && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => updateRecords([...trimRecords, createAdditionalTrimAccent()])}
        >
          Add Additional
        </button>
      )}
    </div>
  );
}
