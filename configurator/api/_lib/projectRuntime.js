import { createDesignRuntime } from '../../src/lib/designRuntime.js';

export function projectResponseWithRuntime(row) {
  const { runtime_unit_system: unitSystem, ...project } = row;
  return {
    ...project,
    runtime: createDesignRuntime(unitSystem),
  };
}
