import test from 'node:test';
import assert from 'node:assert/strict';

import { getEditProjectId, replaceEditProjectId } from '../src/lib/projectNavigation.js';

test('reads the owner project id from the edit query parameter', () => {
  assert.equal(getEditProjectId('?edit=project-123'), 'project-123');
  assert.equal(getEditProjectId('?p=customer-project'), null);
});

test('sets edit mode while preserving unrelated query parameters', () => {
  let replacedUrl = null;
  const location = { pathname: '/configurator/', search: '?tab=projects&p=old&d=encoded', hash: '#top' };
  const history = { replaceState: (_state, _title, url) => { replacedUrl = url; } };

  replaceEditProjectId('project-123', location, history);

  assert.equal(replacedUrl, '/configurator/?tab=projects&edit=project-123#top');
});

test('clears edit mode without removing unrelated query parameters', () => {
  let replacedUrl = null;
  const location = { pathname: '/', search: '?edit=project-123&tab=projects', hash: '' };
  const history = { replaceState: (_state, _title, url) => { replacedUrl = url; } };

  replaceEditProjectId(null, location, history);

  assert.equal(replacedUrl, '/?tab=projects');
});
