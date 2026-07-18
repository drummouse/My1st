import test from 'node:test';
import assert from 'node:assert/strict';
import {
  focusProjectMenuBoundary,
  moveProjectMenuFocus,
} from '../src/lib/projectMenuNavigation.js';

function createMenu(itemCount = 3) {
  const focusLog = [];
  const items = Array.from({ length: itemCount }, (_, index) => ({
    focus() {
      focusLog.push(index);
    },
  }));
  return {
    focusLog,
    items,
    root: {
      querySelectorAll(selector) {
        assert.equal(selector, '[role="menuitem"]:not(:disabled)');
        return items;
      },
    },
  };
}

test('project menu disclosure focuses the first or last enabled item on arrow entry', () => {
  const menu = createMenu();

  assert.equal(focusProjectMenuBoundary(menu.root, 'first'), menu.items[0]);
  assert.equal(focusProjectMenuBoundary(menu.root, 'last'), menu.items[2]);
  assert.deepEqual(menu.focusLog, [0, 2]);
});

test('project menu arrow navigation wraps and Home/End select boundaries', () => {
  const menu = createMenu();

  assert.equal(moveProjectMenuFocus(menu.root, 'ArrowDown', menu.items[2]), menu.items[0]);
  assert.equal(moveProjectMenuFocus(menu.root, 'ArrowUp', menu.items[0]), menu.items[2]);
  assert.equal(moveProjectMenuFocus(menu.root, 'Home', menu.items[1]), menu.items[0]);
  assert.equal(moveProjectMenuFocus(menu.root, 'End', menu.items[1]), menu.items[2]);
  assert.equal(moveProjectMenuFocus(menu.root, 'Enter', menu.items[1]), null);
  assert.deepEqual(menu.focusLog, [0, 2, 0, 2]);
});
