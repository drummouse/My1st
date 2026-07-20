import { upload } from '@vercel/blob/client';
import { captureApi } from './captureClient.js';
import { evaluateAcceptedPhotoQuality } from './captureImageQuality.js';

// Browser-side upload pipeline for one capture photo:
//   1. SHA-256 the original and read its pixel dimensions.
//   2. Run the deterministic quality/duplicate checks (sharpness/exposure/
//      glare/crop-sanity/near-duplicate) against a small downscaled render
//      — never blocking, always advisory metadata (R2.2, §18).
//   3. Direct signed upload of the ORIGINAL to Vercel Blob (kind 'capture'
//      — api/upload.js validates the session before issuing the token).
//   4. Finalize the original as a source capture_asset row, carrying the
//      requested-pose lineage (what shot was actually asked for) and the
//      deterministic findings.
//   5. Generate a small thumbnail on-device, upload it, and finalize it as
//      a DERIVED asset pointing at the source — the original is preserved
//      untouched, the thumbnail is an extra record.
// A quality warning (low resolution) is recorded in the asset metadata and
// never blocks the capture — field phones vary.

const THUMBNAIL_MAX = 320;
const LOW_RESOLUTION_MIN = 800;
const QUALITY_CHECK_MAX_DIM = 256;

// Downscaled pixel buffer for the deterministic quality checks only — kept
// small so the Laplacian/hash math stays fast on a phone. Never used as the
// uploaded image; the original is uploaded untouched. Returns null (never
// throws) if canvas/bitmap decoding isn't available — quality findings are
// advisory, so their absence must never block accepting the photo.
async function getQualityPixels(blob, maxDim = QUALITY_CHECK_MAX_DIM) {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const imageData = ctx.getImageData(0, 0, width, height);
    return { width, height, data: imageData.data };
  } catch {
    return null;
  }
}

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

export async function uploadCaptureImage({ sessionId, purpose, file, requestedPose = null, priorHashes = [] }) {
  const [checksum, dimensions] = await Promise.all([sha256Hex(file), imageDimensions(file)]);
  const lowResolution = dimensions.width != null
    && Math.min(dimensions.width, dimensions.height) < LOW_RESOLUTION_MIN;

  // Deterministic quality/duplicate checks — advisory only, never blocking.
  let deterministicQuality = null;
  try {
    const pixels = await getQualityPixels(file);
    if (pixels) deterministicQuality = evaluateAcceptedPhotoQuality(pixels, { priorHashes });
  } catch (error) {
    console.error('Capture deterministic quality check failed (never blocks accept):', error);
  }

  const originalUrl = await uploadToBlob(sessionId, file.name || `${purpose}.jpg`, file);
  const { asset, duplicate } = await captureApi.addAsset(sessionId, {
    purpose,
    classification: 'source',
    url: originalUrl,
    checksum,
    mimeType: file.type || 'image/jpeg',
    sizeBytes: file.size,
    width: dimensions.width,
    height: dimensions.height,
    requestedPose,
    captureMetadata: {
      originalFileName: file.name || null,
      capturedAt: new Date().toISOString(),
      acceptedAt: new Date().toISOString(),
      ...(lowResolution ? { qualityWarnings: ['low_resolution'] } : {}),
      ...(deterministicQuality ? {
        deterministicQuality: { pipelineVersion: deterministicQuality.pipelineVersion, findings: deterministicQuality.findings },
        perceptualHash: deterministicQuality.hash,
      } : {}),
    },
  });

  // Thumbnail failure is never fatal — the source asset already exists and
  // the UI falls back to rendering the original. Skipped entirely on a
  // duplicate finalize (checksum idempotency): the source asset already has
  // its thumbnail from the original attempt, and thumbnails aren't
  // checksum-deduped, so re-running this would create an orphaned extra one.
  let thumbnail = null;
  try {
    const thumb = duplicate ? null : await makeThumbnail(file);
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

  return { asset, thumbnail, duplicate, warnings: lowResolution ? ['low_resolution'] : [] };
}

// Replaces an already-accepted shot with a better photo (R2.2, D-039). The
// prior asset is preserved by captureService.replaceAsset — this is the
// upload-side counterpart of uploadCaptureImage, calling replaceAsset
// instead of addAsset for the source step and generating a fresh thumbnail
// for the NEW asset (the old asset keeps whatever thumbnail it already had;
// nothing about it changes).
export async function replaceCaptureImage({ sessionId, oldAssetId, purpose, file, requestedPose = null, priorHashes = [] }) {
  const [checksum, dimensions] = await Promise.all([sha256Hex(file), imageDimensions(file)]);
  const lowResolution = dimensions.width != null
    && Math.min(dimensions.width, dimensions.height) < LOW_RESOLUTION_MIN;

  let deterministicQuality = null;
  try {
    const pixels = await getQualityPixels(file);
    if (pixels) deterministicQuality = evaluateAcceptedPhotoQuality(pixels, { priorHashes });
  } catch (error) {
    console.error('Capture deterministic quality check failed (never blocks accept):', error);
  }

  const originalUrl = await uploadToBlob(sessionId, file.name || `${purpose}-replacement.jpg`, file);
  const { asset, supersededAssetId } = await captureApi.replaceAsset(sessionId, oldAssetId, {
    purpose,
    url: originalUrl,
    checksum,
    mimeType: file.type || 'image/jpeg',
    sizeBytes: file.size,
    width: dimensions.width,
    height: dimensions.height,
    requestedPose,
    captureMetadata: {
      originalFileName: file.name || null,
      capturedAt: new Date().toISOString(),
      acceptedAt: new Date().toISOString(),
      ...(lowResolution ? { qualityWarnings: ['low_resolution'] } : {}),
      ...(deterministicQuality ? {
        deterministicQuality: { pipelineVersion: deterministicQuality.pipelineVersion, findings: deterministicQuality.findings },
        perceptualHash: deterministicQuality.hash,
      } : {}),
    },
  });

  let thumbnail = null;
  try {
    const thumb = await makeThumbnail(file);
    if (thumb) {
      const thumbUrl = await uploadToBlob(sessionId, `thumb-${purpose}-replacement.jpg`, thumb.blob);
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

  return { asset, thumbnail, supersededAssetId, warnings: lowResolution ? ['low_resolution'] : [] };
}
