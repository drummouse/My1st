const text = (value) => String(value ?? '').trim();

export function sameCatalogOptionIdentity(left, right) {
  const leftId = text(left?.optionId ?? left?.sourceOptionId ?? left?.id);
  const rightId = text(right?.optionId ?? right?.sourceOptionId ?? right?.id);
  if (!leftId || leftId !== rightId) return false;

  const leftKind = text(left?.kind);
  const rightKind = text(right?.kind);
  if (leftKind && rightKind && leftKind !== rightKind) return false;

  const leftSource = text(left?.source);
  const rightSource = text(right?.source);
  return !leftSource || !rightSource || leftSource === rightSource;
}

export function dedupeDefaultCatalogItems(items) {
  return (Array.isArray(items) ? items : []).reduce((unique, item) => (
    unique.some((existing) => sameCatalogOptionIdentity(existing, item))
      ? unique
      : [...unique, item]
  ), []);
}

export function appendUniqueDefaultCatalogItem(items, item) {
  const unique = dedupeDefaultCatalogItems(items);
  return unique.some((existing) => sameCatalogOptionIdentity(existing, item))
    ? unique
    : [...unique, item];
}

export function defaultCatalogItemFromOption(kind, option, overrides = {}) {
  return {
    optionId: text(option?.id),
    source: text(option?.source) || 'library',
    kind,
    ...(kind === 'trim' ? { trimKind: text(option?.trimKind) || null } : {}),
    label: text(option?.label),
    quantity: 1,
    unit: text(option?.unit) || 'each',
    locked: false,
    ...overrides,
  };
}

export function findCatalogOption(options, item) {
  const candidates = Array.isArray(options) ? options : [];
  return candidates.find((option) => sameCatalogOptionIdentity(item, {
    ...option,
    kind: item?.kind,
    optionId: option?.id,
  })) ?? null;
}
