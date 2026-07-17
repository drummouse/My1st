import test from 'node:test';
import assert from 'node:assert/strict';
import { canEnterExpert, canOpenPlatform, resolveStudioMode } from '../src/lib/studioMode.js';

test('public customer context always resolves to showroom', () => {
  assert.equal(resolveStudioMode({ isCustomerView: true, activeSection: 'platform', capabilities: ['platform.diagnostics.read'] }), 'showroom');
});

test('authenticated configurator defaults to sales and platform requires capability', () => {
  assert.equal(resolveStudioMode({ isCustomerView: false, activeSection: 'configurator', capabilities: [] }), 'sales');
  assert.equal(resolveStudioMode({ isCustomerView: false, activeSection: 'platform', capabilities: [] }), 'sales');
  assert.equal(resolveStudioMode({ isCustomerView: false, activeSection: 'platform', capabilities: ['platform.diagnostics.read'] }), 'platform');
});

test('expert and platform entry are exact capability checks', () => {
  assert.equal(canEnterExpert(null), false);
  assert.equal(canEnterExpert('owner'), true);
  assert.equal(canEnterExpert('superadmin'), true);
  assert.equal(canOpenPlatform(['platform.diagnostics.read']), true);
});
