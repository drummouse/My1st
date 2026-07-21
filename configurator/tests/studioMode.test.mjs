import test from 'node:test';
import assert from 'node:assert/strict';
import * as studioMode from '../src/lib/studioMode.js';
import {
  canEnterExpert,
  canOpenPlatform,
  resolveExpertEntitlement,
  resolveStudioMode,
} from '../src/lib/studioMode.js';
import {
  assertExpertEntitlementUpdate,
  serializeExpertEntitlement,
} from '../api/_lib/tenantFeatures.js';

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
  assert.equal(canEnterExpert('owner'), false);
  assert.equal(canEnterExpert('owner', true), true);
  assert.equal(canEnterExpert('superadmin'), true);
  assert.equal(canOpenPlatform(['platform.diagnostics.read']), true);
});

test('Studio Expert requests require the tenant preference as well as entitlement', () => {
  assert.equal(
    resolveStudioMode({
      expertRequested: true,
      role: 'owner',
      tenantEntitlement: true,
      showExpertMode: false,
    }),
    'sales',
  );
  assert.equal(
    resolveStudioMode({
      expertRequested: true,
      role: 'owner',
      tenantEntitlement: true,
      showExpertMode: true,
    }),
    'expert',
  );
});

test('SuperAdmin entitlement is hardwired and tenants default off', () => {
  assert.equal(resolveExpertEntitlement({ role: 'superadmin', tenantEntitlement: false }), true);
  assert.equal(resolveExpertEntitlement({ role: 'owner', tenantEntitlement: false }), false);
  assert.equal(resolveExpertEntitlement({ role: 'owner', tenantEntitlement: true }), true);
  assert.equal(resolveExpertEntitlement({ role: 'owner' }), false);
});

test('Expert Mode visibility requires effective entitlement and the tenant preference', () => {
  assert.equal(typeof studioMode.canShowExpertControl, 'function');
  const { canShowExpertControl } = studioMode;
  assert.equal(canShowExpertControl({ role: 'owner', entitled: false, tenantPreference: false }), false);
  assert.equal(canShowExpertControl({ role: 'owner', entitled: true, tenantPreference: false }), false);
  assert.equal(canShowExpertControl({ role: 'owner', entitled: true, tenantPreference: true }), true);
  assert.equal(canShowExpertControl({ role: 'superadmin', entitled: false, tenantPreference: false }), false);
  assert.equal(canShowExpertControl({ role: 'superadmin', entitled: false, tenantPreference: true }), true);
});

test('only SuperAdmin may write a boolean tenant entitlement', () => {
  assert.throws(
    () => assertExpertEntitlementUpdate({ role: 'owner', value: true, reason: 'Enable for tenant' }),
    /not authorized/i,
  );
  assert.throws(
    () => assertExpertEntitlementUpdate({ role: 'superadmin', value: 'true', reason: 'Enable for tenant' }),
    /boolean/i,
  );
  assert.throws(
    () => assertExpertEntitlementUpdate({ role: 'superadmin', value: true }),
    /reason/i,
  );
  assert.deepEqual(
    assertExpertEntitlementUpdate({ role: 'superadmin', value: false, reason: '  Disable on request  ' }),
    { value: false, reason: 'Disable on request' },
  );
});

test('remote entitlement reads expose effective values without private settings fields', () => {
  assert.deepEqual(
    serializeExpertEntitlement({
      tenantId: 'tenant-1',
      role: 'owner',
      tenantEntitlement: true,
      showExpertMode: true,
      notificationWebhookUrl: 'https://private.example',
    }),
    { tenantId: 'tenant-1', EXPERT_MODE_VAR: true },
  );
  assert.deepEqual(
    serializeExpertEntitlement({ tenantId: 'admin-1', role: 'superadmin', tenantEntitlement: false }),
    { tenantId: 'admin-1', EXPERT_MODE_VAR: true },
  );
});
