const UNIT_SYSTEMS = new Set(['imperial', 'metric']);
const LINEAR_FOOT_UNITS = new Set(['ft', 'LF', 'linear_feet']);
const SQUARE_FOOT_UNITS = new Set(['sqft', 'sq ft', 'square_feet']);

export function isUnitSystem(value) {
  return UNIT_SYSTEMS.has(value);
}

function requireUnitSystem(value) {
  if (!isUnitSystem(value)) {
    throw new TypeError(`Invalid unit system: ${String(value)}`);
  }
  return value;
}

export function resolveUnitSystem({ companyUnits, branchUnits } = {}) {
  const companySystem = requireUnitSystem(companyUnits);
  return branchUnits == null ? companySystem : requireUnitSystem(branchUnits);
}

export function linearUnit(system) {
  return requireUnitSystem(system) === 'metric' ? 'm' : 'ft';
}

export function areaUnit(system) {
  return requireUnitSystem(system) === 'metric' ? 'm²' : 'sq ft';
}

export function feetToDisplay(value, system) {
  return Number(value) * (requireUnitSystem(system) === 'metric' ? 0.3048 : 1);
}

export function squareFeetToDisplay(value, system) {
  return Number(value) * (requireUnitSystem(system) === 'metric' ? 0.09290304 : 1);
}

export function feetFromDisplay(value, system) {
  return Number(value) / (requireUnitSystem(system) === 'metric' ? 0.3048 : 1);
}

export function squareFeetFromDisplay(value, system) {
  return Number(value) / (requireUnitSystem(system) === 'metric' ? 0.09290304 : 1);
}

export function displayMeasurement(value, canonicalUnit, system) {
  const resolvedSystem = requireUnitSystem(system);
  if (LINEAR_FOOT_UNITS.has(canonicalUnit)) {
    return {
      value: feetToDisplay(value, resolvedSystem),
      unit: resolvedSystem === 'metric' ? 'm' : canonicalUnit === 'ft' ? 'ft' : 'LF',
    };
  }
  if (SQUARE_FOOT_UNITS.has(canonicalUnit)) {
    return {
      value: squareFeetToDisplay(value, resolvedSystem),
      unit: areaUnit(resolvedSystem),
    };
  }
  return { value: Number(value), unit: canonicalUnit };
}

// Catalog prices stay canonical per foot/square foot. Dividing by the
// displayed quantity represented by one canonical unit produces the
// equivalent price per metre/square metre without changing estimator data.
export function unitPriceToDisplay(value, canonicalUnit, system) {
  const canonicalValueInDisplayUnits = displayMeasurement(1, canonicalUnit, system).value;
  return Number(value) / canonicalValueInDisplayUnits;
}
