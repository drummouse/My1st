import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveCustomerContext,
  derivePresentationEditable,
  getInitialCustomerContext,
  parsePublicDesignEntry,
} from '../src/lib/customerContext.js';
import * as publicProjectLoader from '../src/lib/publicProjectLoader.js';

test('public design entry points are identified synchronously before App renders', () => {
  assert.equal(deriveCustomerContext({ embeddedDesign: { house: {} } }), true);
  assert.equal(deriveCustomerContext({ search: '?d=encoded-design' }), true);
  assert.equal(deriveCustomerContext({ search: '?p=project-123' }), true);
});

test('owner edit links remain authenticated workspace entries', () => {
  assert.equal(deriveCustomerContext({ search: '?edit=project-123' }), false);
  assert.equal(deriveCustomerContext({ search: '?edit=project-123&tab=review' }), false);
});

test('presentation editing requires an authenticated non-public presentation session', () => {
  const authenticatedPresentation = {
    mode: 'showroom',
    authenticated: true,
    publicShowroom: false,
    presentationSource: 'authenticated',
  };

  assert.equal(derivePresentationEditable({
    currentUser: { id: 'owner-1' },
    isCustomerView: false,
    session: authenticatedPresentation,
  }), true);
  assert.equal(derivePresentationEditable({
    currentUser: { id: 'owner-1' },
    isCustomerView: true,
    session: authenticatedPresentation,
  }), false, 'a public entry cannot become editable from visual mode alone');
  assert.equal(derivePresentationEditable({
    currentUser: null,
    isCustomerView: false,
    session: authenticatedPresentation,
  }), false, 'presentation provenance cannot replace the authenticated account');
  assert.equal(derivePresentationEditable({
    currentUser: { id: 'owner-1' },
    isCustomerView: false,
    session: { ...authenticatedPresentation, presentationSource: 'public' },
  }), false);
  assert.equal(derivePresentationEditable({
    currentUser: { id: 'owner-1' },
    isCustomerView: false,
    session: { ...authenticatedPresentation, mode: 'sales' },
  }), false);
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

test('empty public identifiers are explicit invalid links rather than sample Showroom entries', () => {
  assert.deepEqual(parsePublicDesignEntry({ search: '?p=' }), {
    kind: 'project', identifier: '', status: 'invalid',
  });
  assert.deepEqual(parsePublicDesignEntry({ search: '?d=' }), {
    kind: 'design', identifier: '', status: 'invalid',
  });
  assert.deepEqual(parsePublicDesignEntry({ search: '?p=project-123' }), {
    kind: 'project', identifier: 'project-123', status: 'loading',
  });
});

test('one precedence-selected loader handles mixed public inputs exactly once', async () => {
  assert.equal(typeof publicProjectLoader.loadPublicDesignEntry, 'function');
  const calls = [];
  const entry = parsePublicDesignEntry({
    search: '?p=project-would-race&d=design-would-race',
    embeddedDesign: { version: 2, house: { jobNumber: 'EMBEDDED-WINS' } },
  });
  const result = await publicProjectLoader.loadPublicDesignEntry(entry, {
    embeddedDesign: { version: 2, house: { jobNumber: 'EMBEDDED-WINS' }, projectId: 'embedded-project' },
    embeddedCatalog: { colors: [{ id: 'embedded-color' }], materials: [] },
    embeddedQuote: { total: 1234, currency: 'CAD' },
    embeddedRuntime: { unitSystem: 'metric' },
    fetchJson: async (url) => { calls.push(`fetch:${url}`); throw new Error('must not fetch'); },
    decodeDesign: async (encoded) => { calls.push(`decode:${encoded}`); throw new Error('must not decode'); },
  });

  assert.deepEqual(calls, []);
  assert.equal(result.design.house.jobNumber, 'EMBEDDED-WINS');
  assert.equal(result.projectId, 'embedded-project');
  assert.deepEqual(result.catalog.colors, [{ id: 'embedded-color' }]);
  assert.deepEqual(result.quote, { total: 1234, currency: 'CAD' });
  assert.deepEqual(result.runtime, { unitSystem: 'metric' });
});

test('a failing precedence-selected project never falls through to a design payload', async () => {
  assert.equal(typeof publicProjectLoader.loadPublicDesignEntry, 'function');
  const calls = [];
  const entry = parsePublicDesignEntry({ search: '?p=selected-project&d=fallback-design' });

  await assert.rejects(() => publicProjectLoader.loadPublicDesignEntry(entry, {
    fetchJson: async (url) => {
      calls.push(url);
      if (url.endsWith('/catalog')) return { colors: [], materials: [] };
      throw new Error('project unavailable');
    },
    decodeDesign: async () => { calls.push('decoded-fallback'); return { version: 2 }; },
  }), /project unavailable/);

  assert.deepEqual(calls.sort(), [
    '/api/projects/selected-project',
    '/api/projects/selected-project/catalog',
  ]);
});
