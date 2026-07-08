// Stub for the "virtual:pwa-register" module used only by the Claude Artifact
// build (vite.artifact.config.js), which has no VitePWA plugin (and no
// service worker to register) — aliased in so main.jsx's shared registerSW()
// call doesn't fail to resolve there.
export function registerSW() {}
