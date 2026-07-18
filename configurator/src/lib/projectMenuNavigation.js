const enabledMenuItems = (menuRoot) => (
  Array.from(menuRoot?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])
);

export function focusProjectMenuBoundary(menuRoot, edge = 'first') {
  const items = enabledMenuItems(menuRoot);
  const target = edge === 'last' ? items.at(-1) : items[0];
  target?.focus();
  return target || null;
}

export function moveProjectMenuFocus(menuRoot, key, activeElement) {
  const items = enabledMenuItems(menuRoot);
  if (!items.length) return null;
  const currentIndex = items.indexOf(activeElement);
  let nextIndex = null;

  if (key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
  if (key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
  if (key === 'Home') nextIndex = 0;
  if (key === 'End') nextIndex = items.length - 1;
  if (nextIndex == null) return null;

  items[nextIndex].focus();
  return items[nextIndex];
}
