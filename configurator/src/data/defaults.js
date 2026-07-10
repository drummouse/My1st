// Shared between App.jsx (today's hardcoded fallbacks) and SettingsPanel.jsx
// (so opening Settings before ever saving one shows what New Project
// actually does today, not a blank slate that would silently uncheck every
// service the moment an admin hits Save without touching anything).
export const DEFAULT_SERVICES = {
  roof: true,
  wall: true,
  soffit: true,
  fascia: true,
  gutters: true,
  downspouts: true,
  snowRetention: false,
  capFlashing: false,
  garageDoorCapping: false,
};

export const DEFAULT_ACCESSORY_COLORS = {
  soffit: 'wk-04',
  fascia: 'wk-04',
  gutters: 'wk-04',
  downspouts: 'wk-04',
};

// Admin-only: which optional services the client can't opt out of when
// viewing an HTML export / shareable link / project link. Locking a service
// freezes its current checked state in customer view rather than forcing it
// on — an admin can still lock a service off, if that's ever useful.
export const DEFAULT_LOCKED_SERVICES = {
  roof: false,
  wall: false,
  soffit: false,
  fascia: false,
  gutters: false,
  downspouts: false,
  snowRetention: false,
  capFlashing: false,
  garageDoorCapping: false,
};
