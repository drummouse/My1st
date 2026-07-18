import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createDesignRuntime,
  resolveSharedDesignPayload,
} from '../src/lib/designRuntime.js';
import { projectResponseWithRuntime } from '../api/_lib/projectRuntime.js';

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('shared runtime carries only a validated company unit system', () => {
  assert.deepEqual(createDesignRuntime('metric'), { unitSystem: 'metric' });
  assert.deepEqual(createDesignRuntime('imperial'), { unitSystem: 'imperial' });
  assert.deepEqual(createDesignRuntime('unexpected'), { unitSystem: 'imperial' });
});

test('shared URL envelopes keep runtime metadata outside canonical design state', () => {
  const design = { version: 2, house: { jobNumber: 'METRIC-6' } };

  assert.deepEqual(resolveSharedDesignPayload({
    design,
    runtime: { unitSystem: 'metric', secretSetting: 'must-not-pass-through' },
  }), {
    design,
    runtime: { unitSystem: 'metric' },
  });
  assert.deepEqual(resolveSharedDesignPayload(design), { design, runtime: null });
});

test('public project responses project only safe unit runtime metadata', () => {
  const row = {
    id: 'project-6',
    owner_id: 'owner-6',
    design: { version: 2 },
    runtime_unit_system: 'metric',
  };

  assert.deepEqual(projectResponseWithRuntime(row), {
    id: 'project-6',
    owner_id: 'owner-6',
    design: { version: 2 },
    runtime: { unitSystem: 'metric' },
  });
  assert.deepEqual(Object.keys(projectResponseWithRuntime(row).runtime), ['unitSystem']);
});

test('App resolves project, URL, and standalone runtime units without persisting them', async () => {
  const [app, projectsRoute, designState] = await Promise.all([
    readSource('../src/App.jsx'),
    readSource('../api/projects/index.js'),
    readSource('../src/lib/designState.js'),
  ]);

  assert.match(app, /window\.__IRONWRAP_RUNTIME__/);
  assert.match(app, /resolveSharedDesignPayload\(snapshot\)/);
  assert.match(app, /setDesignRuntime\(createDesignRuntime\(row\.runtime\?\.unitSystem\)\)/);
  assert.match(app, /designRuntime\?\.unitSystem \|\| companySettings\?\.unit_system \|\| 'imperial'/);
  assert.match(app, /window\.__IRONWRAP_RUNTIME__ = \$\{runtimeJson\}/);
  assert.match(projectsRoute, /left join settings s on s\.owner_id = p\.owner_id/);
  assert.match(projectsRoute, /s\.unit_system as runtime_unit_system/);
  assert.match(projectsRoute, /projectResponseWithRuntime\(row\)/);
  assert.doesNotMatch(designState, /unitSystem|unit_system/);
});
