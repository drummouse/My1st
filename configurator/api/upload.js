import { handleUpload } from '@vercel/blob/client';
import { requireUserId } from './_lib/auth.js';

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
  photo: {
    allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'],
    maximumSizeInBytes: 15 * 1024 * 1024,
  },
  file: {
    allowedContentTypes: undefined, // any format
    maximumSizeInBytes: 25 * 1024 * 1024,
  },
};

export default async function handler(req, res) {
  const userId = await requireUserId(req, res);
  if (!userId) return;

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { kind } = JSON.parse(clientPayload || '{}');
        const limits = LIMITS[kind] || LIMITS.file;
        return {
          addRandomSuffix: true,
          allowedContentTypes: limits.allowedContentTypes,
          maximumSizeInBytes: limits.maximumSizeInBytes,
          tokenPayload: JSON.stringify({ userId, kind }),
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
