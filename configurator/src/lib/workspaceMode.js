const WORKSPACE_MODES = new Set(['sales', 'expert', 'showroom']);
const AUTHENTICATED_MODES = new Set(['sales', 'expert']);
const authenticatedPresentationProvenance = new WeakMap();

function createWorkspaceState(state, mode, returnMode = null, presentationSource = null, verifiedContext = {}) {
  return Object.freeze({
    ...state,
    ...verifiedContext,
    mode,
    returnMode,
    presentationSource,
  });
}

function assertWorkspaceMode(mode) {
  if (!WORKSPACE_MODES.has(mode)) {
    throw new Error('Invalid workspace mode');
  }
}

export function resolveWorkspaceMode({ authenticated = false, publicShowroom = false } = {}) {
  if (publicShowroom === true || authenticated !== true) return 'showroom';
  return 'sales';
}

export function enterExpert(state = {}) {
  const {
    mode,
    authenticated = false,
    publicShowroom = false,
    expertEntitled = false,
    showExpertMode = false,
  } = state;
  assertWorkspaceMode(mode);
  if (
    mode !== 'sales'
    || authenticated !== true
    || publicShowroom === true
    || expertEntitled !== true
    || showExpertMode !== true
  ) {
    throw new Error('Expert workspace is unavailable');
  }
  return createWorkspaceState(state, 'expert');
}

export function enterPresentation(state = {}) {
  const { mode, authenticated = false, publicShowroom = false } = state;
  assertWorkspaceMode(mode);
  if (publicShowroom === true || authenticated !== true) {
    return createWorkspaceState(state, 'showroom', null, 'public');
  }
  if (!AUTHENTICATED_MODES.has(mode)) {
    throw new Error('Presentation must start from an authenticated workspace');
  }
  const presentationState = createWorkspaceState(state, 'showroom', mode, 'authenticated');
  authenticatedPresentationProvenance.set(presentationState, { returnMode: mode });
  return presentationState;
}

export function exitPresentation(state = {}, {
  authenticated = false,
  publicShowroom = false,
  expertEntitled = false,
  showExpertMode = false,
} = {}) {
  const provenance = authenticatedPresentationProvenance.get(state);
  const currentMode = state.mode;
  if (
    authenticated !== true
    || publicShowroom === true
    || state.publicShowroom === true
    || currentMode !== 'showroom'
    || !provenance
  ) {
    throw new Error('Presentation cannot return to an authenticated workspace');
  }
  const mode = provenance.returnMode === 'expert' && expertEntitled === true && showExpertMode === true
    ? 'expert'
    : 'sales';
  return createWorkspaceState(state, mode, null, null, {
    authenticated,
    expertEntitled,
    showExpertMode,
  });
}
