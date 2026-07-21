import { normalizeTrimAccents, syncTrimAccentsToLegacy } from './trimAccents.js';

export const TRIM_SERVICE_KEYS = new Set([
  'soffit',
  'fascia',
  'gutters',
  'downspouts',
  'garageDoorCapping',
  'capFlashing',
]);

const TRIM_RECORDS = Object.freeze({
  soffit: Object.freeze({ id: 'soffit', kind: 'soffit' }),
  fascia: Object.freeze({ id: 'fascia', kind: 'fascia' }),
  gutters: Object.freeze({ id: 'gutters', kind: 'gutters' }),
  downspouts: Object.freeze({ id: 'downspouts', kind: 'downspouts' }),
  garageDoorCapping: Object.freeze({ id: 'garage_doors', kind: 'garage_doors' }),
  capFlashing: Object.freeze({ id: 'other_trims', kind: 'other_trims' }),
});

export const isTrimServiceKey = (key) => TRIM_SERVICE_KEYS.has(key);

export function projectExtrasOnly(services = {}) {
  return Object.fromEntries(Object.entries(services).filter(([key]) => !isTrimServiceKey(key)));
}

function hasExplicitTrimForService(trimAccents, serviceKey) {
  const definition = TRIM_RECORDS[serviceKey];
  return (Array.isArray(trimAccents) ? trimAccents : []).some((record) => (
    record?.id === definition.id
    || (record?.kind === definition.kind && record?.customLabel === undefined)
  ));
}

// One intentional transition point between the legacy mixed `services`
// object and canonical trim records. The compatibility projection is for
// saving/exporting older designs; runtime callers consume only trimAccents
// and extraServices, so a trim can never be priced as both kinds of work.
export function normalizeTrimServiceBoundary(input = {}) {
  const services = input.services ?? {};
  const explicitTrimAccents = input.trimAccents;
  const trimAccents = normalizeTrimAccents(input);
  const trimSourceByService = Object.fromEntries(
    [...TRIM_SERVICE_KEYS].map((key) => [
      key,
      hasExplicitTrimForService(explicitTrimAccents, key) ? 'canonical' : 'legacy',
    ]),
  );

  return {
    trimAccents,
    extraServices: projectExtrasOnly(services),
    compatibility: {
      trimSourceByService,
      legacyTrimServices: Object.fromEntries(
        [...TRIM_SERVICE_KEYS].map((key) => [
          key,
          trimAccents.some((record) => (
            record.selected === true && hasExplicitTrimForService([record], key)
          )),
        ]),
      ),
      legacyTrimState: syncTrimAccentsToLegacy(trimAccents, input),
    },
  };
}
