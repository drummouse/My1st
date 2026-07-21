import ExtrasServicesPanel, { ServiceRow } from './ExtrasServicesPanel.jsx';
import { normalizeTrimAccents, syncTrimAccentsToLegacy } from '../lib/trimAccents.js';
import TrimsPanel from './TrimsPanel.jsx';

export { ServiceRow };

const LEGACY_SERVICE_KEY_BY_TRIM_KIND = Object.freeze({
  soffit: 'soffit',
  fascia: 'fascia',
  gutters: 'gutters',
  downspouts: 'downspouts',
  garage_doors: 'garageDoorCapping',
  other_trims: 'capFlashing',
});

export function createLegacyTrimsBridge({
  services = {},
  measurements = {},
  accessoryColors = {},
  lockedServices = {},
  onServicesChange,
  onMeasurementsChange,
  onAccessoryColorsChange,
  onLockedServicesChange,
  onGutterOptionChange,
  onDownspoutOptionChange,
}) {
  return {
    allowCanonicalEdits: false,
    onChange(nextTrimAccents) {
      const synchronized = syncTrimAccentsToLegacy(nextTrimAccents, {
        measurements,
        accessoryColors,
        lockedServices,
      });
      const selectedServices = Object.fromEntries(
        nextTrimAccents
          .filter((record) => record.customLabel === undefined && LEGACY_SERVICE_KEY_BY_TRIM_KIND[record.kind])
          .map((record) => [LEGACY_SERVICE_KEY_BY_TRIM_KIND[record.kind], record.selected === true]),
      );

      onServicesChange?.({ ...services, ...selectedServices });
      onMeasurementsChange?.(synchronized.measurements);
      onAccessoryColorsChange?.(synchronized.accessoryColors);
      onLockedServicesChange?.(synchronized.lockedServices);
    },
    onGutterOptionChange,
    onDownspoutOptionChange,
  };
}

// Compatibility composition for callers that still address the former combined
// panel. Dedicated callers can use TrimsPanel and ExtrasServicesPanel directly.
export default function ServicesPanel({
  trimAccents = [],
  onTrimAccentsChange,
  gutterOptionId,
  onGutterOptionChange,
  downspoutOptionId,
  onDownspoutOptionChange,
  readOnlyQuantities,
  isCustomerView,
  unitSystem = 'imperial',
  section = 'all',
  ...extrasProps
}) {
  // Legacy callers can still supply the pre-canonical fields while they move
  // to TrimsPanel. Once canonical records are supplied, they remain the sole
  // source rendered by the trims panel.
  const records = trimAccents.length > 0 ? trimAccents : normalizeTrimAccents({
    measurements: extrasProps.measurements,
    accessoryColors: extrasProps.accessoryColors,
    lockedServices: extrasProps.lockedServices,
    services: extrasProps.services,
  });
  const legacyTrimsBridge = createLegacyTrimsBridge({
    ...extrasProps,
    onGutterOptionChange,
    onDownspoutOptionChange,
  });
  const trimsBridge = onTrimAccentsChange
    ? {
      allowCanonicalEdits: true,
      onChange: onTrimAccentsChange,
      onGutterOptionChange,
      onDownspoutOptionChange,
    }
    : legacyTrimsBridge;

  return (
    <>
      {section !== 'services' && (
        <TrimsPanel
          records={records}
          onChange={trimsBridge.onChange}
          allowCanonicalEdits={trimsBridge.allowCanonicalEdits}
          unitSystem={unitSystem}
          readOnly={readOnlyQuantities}
          isCustomerView={isCustomerView}
          gutterOptionId={gutterOptionId}
          onGutterOptionChange={trimsBridge.onGutterOptionChange}
          downspoutOptionId={downspoutOptionId}
          onDownspoutOptionChange={trimsBridge.onDownspoutOptionChange}
        />
      )}
      {section !== 'accents' && (
        <ExtrasServicesPanel
          {...extrasProps}
          readOnlyQuantities={readOnlyQuantities}
          isCustomerView={isCustomerView}
          unitSystem={unitSystem}
        />
      )}
    </>
  );
}
