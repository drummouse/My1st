import { sql, ensureSchema } from '../_lib/db.js';
import { requireCapability } from '../_lib/access.js';
import { CaptureValidationError } from '../_lib/capturePolicy.js';
import { createCaptureService, createNeonCaptureStore } from '../_lib/captureService.js';

// IronWrap Capture API — one consolidated Vercel function (Hobby-plan
// function cap; see api/projects/index.js for the pattern). Paths are mapped
// to query params by vercel.json rewrites. Every action names its required
// capability here and is authorized server-side before any dispatch;
// ownership/row scoping is enforced inside captureService.js.
const capabilityByAction = {
  sessions: 'capture.create',
  session: 'capture.create',
  assets: 'capture.create',
  asset: 'capture.create',
  'asset.replace': 'capture.create',
  'claude.guidance': 'capture.create',
  materialZone: 'capture.create',
  textureDirection: 'capture.create',
  studioValidation: 'capture.create',
  'materialPackage.dryRun': 'capture.create',
  validate: 'capture.create',
  submit: 'capture.create',
  calibration: 'capture.create',
  measurements: 'capture.create',
  measurement: 'capture.create',
  evidence: 'capture.create',
  'review.queue': 'capture.review',
  'review.start': 'capture.review',
  'review.decide': 'capture.review',
  'review.comments': 'capture.review',
  'review.publish': 'capture.publish.tenant',
  'library.products': 'library.read',
};

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed);
  res.status(405).json({ error: 'Method not allowed' });
}

const ERROR_STATUS = {
  CAPTURE_SESSION_NOT_FOUND: 404,
  CAPTURE_ASSET_NOT_FOUND: 404,
  CAPTURE_TRANSITION_INVALID: 409,
  CAPTURE_SESSION_LOCKED: 409,
  CAPTURE_NOT_AUTHORIZED: 403,
  CAPTURE_ASSET_NOT_REPLACEABLE: 409,
  CAPTURE_ASSET_ALREADY_SUPERSEDED: 409,
};

export default async function handler(req, res) {
  const action = String(req.query.action || 'sessions');
  const capability = capabilityByAction[action];
  if (!capability) return res.status(404).json({ error: 'Unknown Capture action' });
  try {
    await ensureSchema();
    const actor = await requireCapability(req, res, capability);
    if (!actor) return;
    const service = createCaptureService({ store: createNeonCaptureStore(sql) });

    if (action === 'sessions') {
      if (req.method === 'GET') {
        return res.status(200).json({ sessions: await service.listSessions(actor, req.query) });
      }
      if (req.method === 'POST') {
        const { session, created } = await service.createSession(actor, req.body || {});
        return res.status(created ? 201 : 200).json({ session, created });
      }
      return methodNotAllowed(res, 'GET, POST');
    }

    if (action === 'session') {
      const id = String(req.query.id || '');
      if (req.method === 'GET') {
        return res.status(200).json(await service.getSession(actor, id));
      }
      if (req.method === 'PATCH') {
        // The only transition PATCH may drive is archive. Submission has a
        // dedicated endpoint because it validates completeness and freezes
        // the review snapshot — allowing it here would bypass both.
        if (req.body?.status) {
          if (String(req.body.status) !== 'archived') {
            return res.status(409).json({
              error: { code: 'CAPTURE_TRANSITION_INVALID', message: 'Use the dedicated endpoint for this transition' },
            });
          }
          const { session } = await service.archiveSession(actor, id, req.body?.reason);
          return res.status(200).json({ session });
        }
        const { session } = await service.updateDraft(actor, id, req.body || {});
        return res.status(200).json({ session });
      }
      return methodNotAllowed(res, 'GET, PATCH');
    }

    // /api/capture/sessions/<id>/validate — server-truth completeness.
    if (action === 'validate') {
      if (req.method === 'GET') {
        return res.status(200).json(await service.validateSession(actor, String(req.query.id || '')));
      }
      return methodNotAllowed(res, 'GET');
    }

    // /api/capture/sessions/<id>/submit — validated submit/resubmit that
    // freezes the immutable review snapshot.
    if (action === 'submit') {
      if (req.method === 'POST') {
        const { session, completeness } = await service.submitSession(actor, String(req.query.id || ''));
        return res.status(200).json({ session, completeness });
      }
      return methodNotAllowed(res, 'POST');
    }

    // /api/capture/sessions/<id>/assets — finalize a direct Blob upload as
    // an asset row (the bytes never pass through this function).
    if (action === 'assets') {
      const id = String(req.query.id || '');
      if (req.method === 'POST') {
        const { asset, duplicate } = await service.addAsset(actor, id, req.body || {});
        return res.status(duplicate ? 200 : 201).json({ asset, duplicate });
      }
      return methodNotAllowed(res, 'POST');
    }

    // /api/capture/sessions/<id>/assets/<assetId> — delete before submit.
    if (action === 'asset') {
      if (req.method === 'DELETE') {
        await service.removeAsset(actor, String(req.query.id || ''), String(req.query.assetId || ''));
        return res.status(204).end();
      }
      return methodNotAllowed(res, 'DELETE');
    }

    // /api/capture/sessions/<id>/assets/<assetId>/replace — R2.2: preserve
    // the prior accepted image (superseded_by lineage) instead of deleting
    // it when the contributor replaces a shot with a better photo.
    if (action === 'asset.replace') {
      if (req.method === 'POST') {
        const { asset, supersededAssetId } = await service.replaceAsset(
          actor, String(req.query.id || ''), String(req.query.assetId || ''), req.body || {},
        );
        return res.status(201).json({ asset, supersededAssetId });
      }
      return methodNotAllowed(res, 'POST');
    }

    // /api/capture/sessions/<id>/claude-guidance — R2.4: advisory Claude
    // semantic guidance, kill-switched, timeout/failure-safe, always
    // recorded as an immutable capture_claude_analyses row regardless of
    // outcome. Never blocks capture completion.
    if (action === 'claude.guidance') {
      if (req.method === 'POST') {
        const { analysis } = await service.requestGuidance(actor, String(req.query.id || ''));
        return res.status(201).json({ analysis });
      }
      return methodNotAllowed(res, 'POST');
    }

    // /api/capture/sessions/<id>/calibration — save calibration evidence
    // and the known reference measurement (Slice R1).
    if (action === 'calibration') {
      if (req.method === 'POST') {
        const { calibration } = await service.saveCalibration(actor, String(req.query.id || ''), req.body || {});
        return res.status(200).json({ calibration });
      }
      return methodNotAllowed(res, 'POST');
    }

    // /api/capture/sessions/<id>/material-zone — R2.5: confirm the single
    // required main_visible_face zone.
    if (action === 'materialZone') {
      if (req.method === 'POST') {
        const { session } = await service.saveMaterialZone(actor, String(req.query.id || ''), req.body || {});
        return res.status(200).json({ session });
      }
      return methodNotAllowed(res, 'POST');
    }

    // /api/capture/sessions/<id>/texture-direction — R2.5.
    if (action === 'textureDirection') {
      if (req.method === 'POST') {
        const { session } = await service.saveTextureDirection(actor, String(req.query.id || ''), req.body || {});
        return res.status(200).json({ session });
      }
      return methodNotAllowed(res, 'POST');
    }

    // /api/capture/sessions/<id>/studio-validation — R2.5: honest flat-wall
    // technical compatibility check (schematic, not reconstructed geometry).
    if (action === 'studioValidation') {
      if (req.method === 'POST') {
        const { validation, session } = await service.evaluateStudioValidation(actor, String(req.query.id || ''));
        return res.status(200).json({ validation, session });
      }
      return methodNotAllowed(res, 'POST');
    }

    // /api/capture/sessions/<id>/material-package/dry-run — R2.6: side-
    // effect-free validation of the R2 material-package manifest subset.
    // GET, not POST — nothing here is ever written.
    if (action === 'materialPackage.dryRun') {
      if (req.method === 'GET') {
        const result = await service.dryRunMaterialPackage(actor, String(req.query.id || ''));
        return res.status(200).json(result);
      }
      return methodNotAllowed(res, 'GET');
    }

    // /api/capture/sessions/<id>/measurements — confirmed measurement rows.
    if (action === 'measurements') {
      if (req.method === 'POST') {
        const { measurement } = await service.addMeasurement(actor, String(req.query.id || ''), req.body || {});
        return res.status(201).json({ measurement });
      }
      return methodNotAllowed(res, 'POST');
    }

    if (action === 'measurement') {
      if (req.method === 'DELETE') {
        await service.removeMeasurement(actor, String(req.query.id || ''), String(req.query.measurementId || ''));
        return res.status(204).end();
      }
      return methodNotAllowed(res, 'DELETE');
    }

    // /api/capture/sessions/<id>/evidence — server-truth adaptive shot
    // guidance (same module the client bundles).
    if (action === 'evidence') {
      if (req.method === 'GET') {
        return res.status(200).json(await service.evaluateEvidence(actor, String(req.query.id || '')));
      }
      return methodNotAllowed(res, 'GET');
    }

    // /api/capture/review — permission-aware review queue.
    if (action === 'review.queue') {
      if (req.method === 'GET') {
        return res.status(200).json({ sessions: await service.listReviewQueue(actor, req.query) });
      }
      return methodNotAllowed(res, 'GET');
    }

    // /api/capture/review/<id>/start — claim a submission for review.
    if (action === 'review.start') {
      if (req.method === 'POST') {
        const { session } = await service.startReview(actor, String(req.query.id || ''));
        return res.status(200).json({ session });
      }
      return methodNotAllowed(res, 'POST');
    }

    // /api/capture/review/<id>/decision — approve / request_changes / reject.
    if (action === 'review.decide') {
      if (req.method === 'POST') {
        const { session } = await service.decideReview(
          actor, String(req.query.id || ''), String(req.body?.decision || ''), req.body?.reason,
        );
        return res.status(200).json({ session });
      }
      return methodNotAllowed(res, 'POST');
    }

    // /api/capture/review/<id>/comments — reviewer/contributor thread.
    if (action === 'review.comments') {
      const id = String(req.query.id || '');
      if (req.method === 'GET') {
        const detail = await service.getSession(actor, id);
        return res.status(200).json({ comments: detail.comments });
      }
      if (req.method === 'POST') {
        const { comment } = await service.addComment(actor, id, req.body?.body);
        return res.status(201).json({ comment });
      }
      return methodNotAllowed(res, 'GET, POST');
    }

    // /api/capture/review/<id>/publish — approved -> tenant-private Library
    // record; safe to retry, idempotent once published.
    if (action === 'review.publish') {
      if (req.method === 'POST') {
        const result = await service.publishSession(actor, String(req.query.id || ''));
        return res.status(200).json(result);
      }
      return methodNotAllowed(res, 'POST');
    }

    // /api/library/products — Studio-readable approved products (DTO).
    if (action === 'library.products') {
      if (req.method === 'GET') {
        return res.status(200).json({ products: await service.listPublishedProducts(actor, req.query) });
      }
      return methodNotAllowed(res, 'GET');
    }

    res.status(404).json({ error: 'Unknown Capture action' });
  } catch (error) {
    if (error instanceof CaptureValidationError) {
      return res.status(ERROR_STATUS[error.code] || 400).json({
        error: { code: error.code, message: error.message, details: error.details || {} },
      });
    }
    console.error('Capture request failed:', error);
    res.status(500).json({ error: 'Capture operation failed' });
  }
}
