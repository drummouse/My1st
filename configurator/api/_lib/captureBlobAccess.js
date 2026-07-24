import { get } from '@vercel/blob';

// Server-side read for a private Capture Blob asset. Capture images are
// uploaded with access: 'private' (captureUpload.js) — the connected Blob
// store has no public-access mode at all, so a stored asset URL is not
// directly fetchable by anyone holding it; every read now goes through
// this function, gated by the SAME session-ownership check every other
// Capture route already applies (see captureService.js's getAssetBlob).
// Uses the existing BLOB_READ_WRITE_TOKEN (no new secret) — @vercel/blob's
// `get()` falls back to that env var when no token option is passed.
export async function getPrivateBlob(url) {
  return get(url, { access: 'private' });
}
