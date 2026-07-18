import { isUnitSystem } from './units.js';

export function createDesignRuntime(unitSystem) {
  return {
    unitSystem: isUnitSystem(unitSystem) ? unitSystem : 'imperial',
  };
}

function normalizeDesignRuntime(runtime) {
  if (!runtime || !isUnitSystem(runtime.unitSystem)) return null;
  return createDesignRuntime(runtime.unitSystem);
}

export function resolveSharedDesignPayload(payload) {
  if (payload && typeof payload === 'object' && Object.hasOwn(payload, 'design')) {
    return {
      design: payload.design,
      runtime: normalizeDesignRuntime(payload.runtime),
    };
  }

  return { design: payload, runtime: null };
}
