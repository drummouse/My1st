const UNIT_SYSTEMS = new Set(['imperial', 'metric']);

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
