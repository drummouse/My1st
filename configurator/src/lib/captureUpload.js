import { upload } from '@vercel/blob/client';
import { captureApi } from './captureClient.js';

// Browser-side upload pipeline for one capture photo:
//   1. SHA-256 the original and read its pixel dimensions.
//   2. Direct signed upload of the ORIGINAL to Vercel Blob (kind 'capture'
//      — api/upload.js validates the session before issuing the token).
//   3. Finalize the original as a source capture_asset row.
//   4. Generate a small thumbnail on-device, upload it, and finalize it as
//      a DERIVED asset pointing at the source — the original is preserved
//      untouched, the thumbnail is an extra record.
// A quality warning (low resolution) is recorded in the asset metadata and
// never blocks the capture — field phones vary.

const THUMBNAIL_MAX = 320;
const LOW_RESOLUTION_MIN = 800;

export async function sha256Hex(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function imageDimensions(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return size;
  } catch {
    return { width: null, height: null }; // e.g. HEIC on a browser that can't decode it
  }
}

export async function makeThumbnail(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, THUMBNAIL_MAX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const thumbBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    return thumbBlob ? { blob: thumbBlob, width, height } : null;
  } catch {
    return null;
  }
}

async function uploadToBlob(sessionId, fileName, blob) {
  const result = await upload(fileName, blob, {
    access: 'public',
    handleUploadUrl: '/api/upload',
    clientPayload: JSON.stringify({ kind: 'capture', sessionId }),
  });
  return result.url;
}

export async function uploadCaptureImage({ sessionId, purpose, file }) {
  const [checksum, dimensions] = await Promise.all([sha256Hex(file), imageDimensions(file)]);
  const lowResolution = dimensions.width != null
    && Math.min(dimensions.width, dimensions.height) < LOW_RESOLUTION_MIN;

  const originalUrl = await uploadToBlob(sessionId, file.name || `${purpose}.jpg`, file);
  const { asset } = await captureApi.addAsset(sessionId, {
    purpose,
    classification: 'source',
    url: originalUrl,
    checksum,
    mimeType: file.type || 'image/jpeg',
    sizeBytes: file.size,
    width: dimensions.width,
    height: dimensions.height,
    captureMetadata: {
      originalFileName: file.name || null,
      capturedAt: new Date().toISOString(),
      ...(lowResolution ? { qualityWarnings: ['low_resolution'] } : {}),
    },
  });

  // Thumbnail failure is never fatal — the source asset already exists and
  // the UI falls back to rendering the original.
  let thumbnail = null;
  try {
    const thumb = await makeThumbnail(file);
    if (thumb) {
      const thumbUrl = await uploadToBlob(sessionId, `thumb-${purpose}.jpg`, thumb.blob);
      const finalized = await captureApi.addAsset(sessionId, {
        purpose,
        classification: 'derived',
        sourceAssetId: asset.id,
        url: thumbUrl,
        checksum: await sha256Hex(thumb.blob),
        mimeType: 'image/jpeg',
        sizeBytes: thumb.blob.size,
        width: thumb.width,
        height: thumb.height,
        captureMetadata: { derivative: 'thumbnail' },
      });
      thumbnail = finalized.asset;
    }
  } catch (error) {
    console.error('Capture thumbnail failed (original preserved):', error);
  }

  return { asset, thumbnail, warnings: lowResolution ? ['low_resolution'] : [] };
}
