import { createDesignRuntime } from '../../src/lib/designRuntime.js';
import { toPublicDesign } from '../../src/lib/publicDesign.js';

export function projectResponseWithRuntime(row, quote, { includePrivateDesign = false } = {}) {
  return {
    id: row.id,
    design: includePrivateDesign ? row.design : toPublicDesign(row.design),
    approved_at: row.approved_at || null,
    runtime: createDesignRuntime(row.runtime_unit_system),
    ...(quote ? { quote } : {}),
  };
}
