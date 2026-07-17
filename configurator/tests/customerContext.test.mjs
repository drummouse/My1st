import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveCustomerContext, getInitialCustomerContext } from '../src/lib/customerContext.js';

test('public design entry points are identified synchronously before App renders', () => {
  assert.equal(deriveCustomerContext({ embeddedDesign: { house: {} } }), true);
  assert.equal(deriveCustomerContext({ search: '?d=encoded-design' }), true);
  assert.equal(deriveCustomerContext({ search: '?p=project-123' }), true);
});

test('owner edit links remain authenticated workspace entries', () => {
  assert.equal(deriveCustomerContext({ search: '?edit=project-123' }), false);
  assert.equal(deriveCustomerContext({ search: '?edit=project-123&tab=review' }), false);
});

test('browser initialization reads the embedded design and URL in the same synchronous call', () => {
  assert.equal(getInitialCustomerContext({
    location: { search: '?edit=owner-project' },
    __IRONWRAP_DESIGN__: { projectId: 'public-project' },
  }), true);
  assert.equal(getInitialCustomerContext({ location: { search: '?p=public-project' } }), true);
  assert.equal(getInitialCustomerContext({ location: { search: '?edit=owner-project' } }), false);
  assert.equal(getInitialCustomerContext(undefined), false);
});
