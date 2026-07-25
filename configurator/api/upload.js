import { handleUpload } from '@vercel/blob/client';
import { requireUserId } from './_lib/auth.js';
import { sql, ensureSchema } from './_lib/db.js';
import { CAPTURE_IMAGE_TYPES, MAX_CAPTURE_IMAGE_BYTES, EDITABLE_STATUSES } from './_lib/capturePolicy.js';

// One shared upload route for every Blob-backed file in the app (company
// logo now; project File/Photo attachments later) — the caller says which
// `kind` it's uploading via clientPayload, and this picks the matching
// content-type/size constraints, so a stricter cap on one kind can't be
// bypassed by another. Uses @vercel/blob's client-side direct-upload flow
// (browser uploads straight to Blob storage with a signed token) rather
// than routing the file through this function's own request body, since
// Vercel's serverless body-size limit is well below what a photo or spec
// sheet PDF often needs.
const LIMITS = {
  logo: {
    allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    maximumSizeInBytes: 5 * 1024 * 1024,
  },
  // A material-surface swatch for a tenant Color — a photo of the finish
  // that becomes the color's 3D render-map (material.map) so it renders like
  // real material instead of a flat block. Same public direct-upload flow as
  // the others; the caller stores the blob URL in colors.thumbnail_url.
  swatch: {
    allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
    maximumSizeInBytes: 10 * 1024 * 1024,
  },
  photo: {
    allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'],
    maximumSizeInBytes: 15 * 1024 * 1024,
  },
  file: {
    allowedContentTypes: undefined, // any format
    maximumSizeInBytes: 25 * 1024 * 1024,
  },
  // Capture product photos — constants shared with capturePolicy.js so the
  // upload token and the finalize route can never disagree about what a
  // capture image is allowed to be.
  capture: {
    allowedContentTypes: [...CAPTURE_IMAGE_TYPES],
    maximumSizeInBytes: MAX_CAPTURE_IMAGE_BYTES,
  },
};

// A capture upload is scoped to a specific session: the token is only
// issued when that session exists, belongs to the authenticated user, and
// is still editable — a submitted/locked capture cannot quietly grow new
// images through a stale upload token request.
async function assertCaptureUploadAllowed(userId, sessionId) {
  if (!sessionId) throw new Error('A capture upload requires a sessionId');
  await ensureSchema();
  const [session] = await sql`select owner_id, status from capture_sessions where id = ${sessionId}`;
  if (!session || session.owner_id !== userId) throw new Error('Capture session not found');
  if (!EDITABLE_STATUSES.includes(session.status)) {
    throw new Error(`A ${session.status} capture cannot receive new images`);
  }
}

export default async function handler(req, res) {
  const userId = await requireUserId(req, res);
  if (!userId) return;

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { kind, sessionId } = JSON.parse(clientPayload || '{}');
        if (kind === 'capture') await assertCaptureUploadAllowed(userId, sessionId);
        const limits = LIMITS[kind] || LIMITS.file;
        return {
          addRandomSuffix: true,
          allowedContentTypes: limits.allowedContentTypes,
          maximumSizeInBytes: limits.maximumSizeInBytes,
          tokenPayload: JSON.stringify({ userId, kind, ...(sessionId ? { sessionId } : {}) }),
        };
      },
      onUploadCompleted: async () => {
        // No server-side write needed here — the caller records the
        // resulting blob URL itself (into settings.logo_url, or an
        // attachments row) once its own `upload()` call resolves.
      },
    });
    res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(400).json({ error: err.message });
  }
}
