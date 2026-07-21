export function applySurfaceEdit({ uniformFinish, facetOverrides = {}, facetKey, patch = {} } = {}) {
  if (!facetKey) return { uniformFinish, facetOverrides };
  return {
    uniformFinish: false,
    facetOverrides: {
      ...facetOverrides,
      [facetKey]: { ...facetOverrides[facetKey], ...patch },
    },
  };
}
