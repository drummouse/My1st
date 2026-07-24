import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enterExpert,
  enterPresentation,
  exitPresentation,
  resolveWorkspaceMode,
} from '../src/lib/workspaceMode.js';

test('authenticated users start in sales and public routes start in showroom', () => {
  assert.equal(resolveWorkspaceMode({ authenticated: true }), 'sales');
  assert.equal(resolveWorkspaceMode({ publicShowroom: true }), 'showroom');
});

test('expert entry is closed unless authentication and both gates pass', () => {
  assert.throws(
    () => enterExpert({
      mode: 'sales',
      authenticated: true,
      expertEntitled: true,
      showExpertMode: false,
    }),
    /unavailable/i,
  );
  assert.throws(
    () => enterExpert({
      mode: 'sales',
      authenticated: false,
      expertEntitled: true,
      showExpertMode: true,
    }),
    /unavailable/i,
  );
  assert.equal(
    enterExpert({
      mode: 'sales',
      authenticated: true,
      expertEntitled: true,
      showExpertMode: true,
    }).mode,
    'expert',
  );
});

test('presentation exit restores the exact prior authenticated mode', () => {
  const shown = enterPresentation({ mode: 'expert', authenticated: true });
  assert.deepEqual(exitPresentation(shown, {
    authenticated: true,
    expertEntitled: true,
    showExpertMode: true,
  }), {
    mode: 'expert',
    authenticated: true,
    expertEntitled: true,
    showExpertMode: true,
    returnMode: null,
    presentationSource: null,
  });
});

test('transitions preserve project and design fields without mutating state', () => {
  const workspace = {
    mode: 'sales',
    authenticated: true,
    expertEntitled: true,
    showExpertMode: true,
    projectId: 'project-17',
    design: { roofColor: 'graphite' },
  };
  const expert = enterExpert(workspace);
  const shown = enterPresentation(expert);
  const restored = exitPresentation(shown, {
    authenticated: true,
    expertEntitled: true,
    showExpertMode: true,
  });

  assert.deepEqual(workspace, {
    mode: 'sales',
    authenticated: true,
    expertEntitled: true,
    showExpertMode: true,
    projectId: 'project-17',
    design: { roofColor: 'graphite' },
  });
  assert.deepEqual(expert, {
    ...workspace,
    mode: 'expert',
    returnMode: null,
    presentationSource: null,
  });
  assert.deepEqual(shown, {
    ...expert,
    mode: 'showroom',
    returnMode: 'expert',
    presentationSource: 'authenticated',
  });
  assert.deepEqual(restored, {
    ...shown,
    mode: 'expert',
    returnMode: null,
    presentationSource: null,
  });
});

test('presentation transitions do not mutate the supplied state', () => {
  const workspace = { mode: 'sales', authenticated: true, projectId: 'project-17' };
  const shown = enterPresentation(workspace);

  assert.deepEqual(workspace, { mode: 'sales', authenticated: true, projectId: 'project-17' });
  assert.deepEqual(shown, {
    ...workspace,
    mode: 'showroom',
    returnMode: 'sales',
    presentationSource: 'authenticated',
  });
});

test('invalid workspace modes, public exits, and forged exits are rejected', () => {
  assert.throws(
    () => enterExpert({
      mode: 'platform',
      authenticated: true,
      expertEntitled: true,
      showExpertMode: true,
    }),
    /invalid workspace mode/i,
  );
  assert.throws(
    () => enterPresentation({ mode: 'platform', authenticated: true }),
    /invalid workspace mode/i,
  );
  assert.throws(
    () => exitPresentation(
      enterPresentation({ mode: 'showroom', authenticated: false }),
      { authenticated: true, expertEntitled: true, showExpertMode: true },
    ),
    /cannot return/i,
  );
  assert.throws(
    () => exitPresentation({
      mode: 'sales',
      returnMode: 'expert',
      presentationSource: 'authenticated',
    }, { authenticated: true }),
    /cannot return/i,
  );
  assert.throws(
    () => exitPresentation({
      mode: 'showroom',
      authenticated: true,
      returnMode: 'expert',
      presentationSource: 'authenticated',
    }, { authenticated: false, expertEntitled: true, showExpertMode: true }),
    /cannot return/i,
  );
  assert.throws(
    () => exitPresentation({
      mode: 'showroom',
      authenticated: true,
      returnMode: 'sales',
      presentationSource: 'authenticated',
      projectId: 'forged-project',
    }, { authenticated: true, expertEntitled: true, showExpertMode: true }),
    /cannot return/i,
  );
});

test('a verified authenticated presentation restores Sales from private provenance', () => {
  const shown = enterPresentation({
    mode: 'sales',
    authenticated: true,
    projectId: 'project-17',
    design: { roofColor: 'graphite' },
  });

  assert.deepEqual(exitPresentation(shown, {
    authenticated: true,
    expertEntitled: false,
    showExpertMode: false,
  }), {
    mode: 'sales',
    authenticated: true,
    expertEntitled: false,
    showExpertMode: false,
    projectId: 'project-17',
    design: { roofColor: 'graphite' },
    returnMode: null,
    presentationSource: null,
  });
});

test('revoked Expert entitlement or preference restores Sales', () => {
  for (const verifiedContext of [
    { authenticated: true, expertEntitled: false, showExpertMode: true },
    { authenticated: true, expertEntitled: true, showExpertMode: false },
  ]) {
    const shown = enterPresentation({
      mode: 'expert',
      authenticated: true,
      expertEntitled: true,
      showExpertMode: true,
      projectId: 'project-17',
    });

    const restored = exitPresentation(shown, verifiedContext);
    assert.equal(restored.mode, 'sales');
    assert.equal(restored.projectId, 'project-17');
    assert.equal(restored.authenticated, true);
  }
});

test('a public Showroom route stays closed even for an authenticated viewer', () => {
  const publicViewer = {
    mode: 'sales',
    authenticated: true,
    publicShowroom: true,
    expertEntitled: true,
    showExpertMode: true,
    projectId: 'shared-project',
  };

  assert.throws(() => enterExpert(publicViewer), /unavailable/i);

  const publicPresentation = enterPresentation(publicViewer);
  assert.deepEqual(publicPresentation, {
    ...publicViewer,
    mode: 'showroom',
    returnMode: null,
    presentationSource: 'public',
  });
  assert.throws(
    () => exitPresentation(publicPresentation, {
      authenticated: true,
      publicShowroom: true,
      expertEntitled: true,
      showExpertMode: true,
    }),
    /cannot return/i,
  );

  const authenticatedPresentation = enterPresentation({ mode: 'sales', authenticated: true });
  assert.throws(
    () => exitPresentation(authenticatedPresentation, {
      authenticated: true,
      publicShowroom: true,
      expertEntitled: true,
      showExpertMode: true,
    }),
    /cannot return/i,
  );
});
