import { randomUUID as nodeRandomUUID } from 'node:crypto';
import {
  CaptureValidationError,
  EDITABLE_STATUSES,
  assertTransition,
  normalizeAssetInput,
  normalizeCreateInput,
  normalizeDraftPatch,
  validateCompleteness,
} from './capturePolicy.js';

export function toCaptureSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id ?? row.ownerId ?? null,
    clientRef: row.client_ref ?? row.clientRef ?? null,
    captureType: row.capture_type ?? row.captureType,
    category: row.category ?? null,
    title: row.title ?? null,
    status: row.status,
    currentStep: row.current_step ?? row.currentStep ?? null,
    completeness: Number(row.completeness ?? 0),
    submittedAt: row.submitted_at ?? row.submittedAt ?? null,
    publishedRecordId: row.published_record_id ?? row.publishedRecordId ?? null,
    publishedVersion: row.published_version ?? row.publishedVersion ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

export function toCaptureField(row) {
  return {
    fieldKey: row.field_key ?? row.fieldKey,
    value: row.value ?? null,
    source: row.source || 'manual',
    confidence: row.confidence == null ? null : Number(row.confidence),
    confirmedBy: row.confirmed_by ?? row.confirmedBy ?? null,
    confirmedAt: row.confirmed_at ?? row.confirmedAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

export function toCaptureAsset(row) {
  return {
    id: row.id,
    sessionId: row.session_id ?? row.sessionId,
    purpose: row.purpose,
    classification: row.classification || 'source',
    sourceAssetId: row.source_asset_id ?? row.sourceAssetId ?? null,
    url: row.url,
    checksum: row.checksum ?? null,
    mimeType: row.mime_type ?? row.mimeType ?? null,
    sizeBytes: Number(row.size_bytes ?? row.sizeBytes ?? 0),
    width: row.width ?? null,
    height: row.height ?? null,
    captureMetadata: row.capture_metadata ?? row.captureMetadata ?? {},
    uploadStatus: row.upload_status ?? row.uploadStatus ?? 'complete',
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

export function toCaptureComment(row) {
  return {
    id: row.id,
    sessionId: row.session_id ?? row.sessionId,
    authorId: row.author_id ?? row.authorId,
    authorLabel: row.author_label ?? row.authorLabel ?? null,
    body: row.body,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

// The statuses a reviewer's queue cares about (everything past draft that
// is not archived). Draft content is private to the contributor until they
// submit — it never appears in a queue.
export const REVIEW_QUEUE_STATUSES = Object.freeze([
  'submitted', 'in_review', 'changes_requested', 'approved', 'publishing', 'published', 'rejected',
]);

const REVIEW_DECISIONS = Object.freeze({
  approve: 'approved',
  request_changes: 'changes_requested',
  reject: 'rejected',
});

const rowOwner = (row) => row.owner_id ?? row.ownerId;

// Ownership is enforced here (the policy module checks capabilities only).
// A session outside the actor's tenant is reported as not-found, never as
// forbidden — same information-hiding stance as Library Core.
function assertVisible(actor, row) {
  if (!row) throw new CaptureValidationError('CAPTURE_SESSION_NOT_FOUND', 'Capture session not found');
  if (actor.role !== 'superadmin' && rowOwner(row) !== actor.id) {
    throw new CaptureValidationError('CAPTURE_SESSION_NOT_FOUND', 'Capture session not found');
  }
}

export function createCaptureService({ store, randomUUID = nodeRandomUUID }) {
  const audit = (actor, action, targetId, reason, metadata = {}) => ({
    actorId: actor.id, action, targetType: 'capture_session', targetId, reason: reason || null, metadata,
  });

  return {
    async listSessions(actor, filters = {}) {
      const rows = await store.listSessions({
        ownerId: actor.id,
        includeAllOwners: actor.role === 'superadmin',
        status: filters.status || null,
        limit: Math.min(100, Math.max(1, Number(filters.limit) || 50)),
      });
      return rows.map(toCaptureSession);
    },

    async getSession(actor, id) {
      const row = await store.getSession(id);
      assertVisible(actor, row);
      const [fields, assets, comments] = await Promise.all([
        store.listFields(id), store.listAssets(id), store.listComments(id),
      ]);
      return {
        session: toCaptureSession(row),
        fields: fields.map(toCaptureField),
        assets: assets.map(toCaptureAsset),
        comments: comments.map(toCaptureComment),
      };
    },

    // Idempotent by (owner, clientRef): retrying a create — flaky mobile
    // network, refresh mid-request — returns the already-created session
    // instead of a duplicate. A race between two identical creates is caught
    // by the partial unique index; the loser's retry lands here and finds
    // the winner.
    async createSession(actor, input) {
      const normalized = normalizeCreateInput(input);
      if (normalized.clientRef) {
        const existing = await store.getSessionByClientRef(actor.id, normalized.clientRef);
        if (existing) return { session: toCaptureSession(existing), created: false };
      }
      const change = {
        id: randomUUID(),
        ownerId: actor.id,
        status: 'draft',
        completeness: 0,
        ...normalized,
      };
      return store.transaction(async () => {
        const row = await store.createSession(change);
        await store.appendAudit(audit(actor, 'capture.session.created', change.id, null, {
          captureType: normalized.captureType, category: normalized.category,
        }));
        return { session: toCaptureSession(row), created: true };
      });
    },

    // Draft-content saves are deliberately NOT audited (decision D-012):
    // state changes, reviews, and archives are; keystroke-level saves would
    // only bury those. Content is only editable while the contributor still
    // owns the ball (draft / changes_requested).
    async updateDraft(actor, id, input) {
      const patch = normalizeDraftPatch(input);
      const row = await store.getSession(id);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture cannot be edited`, { status: row.status });
      }
      return store.transaction(async () => {
        const updated = await store.updateSessionContent(id, patch);
        for (const field of patch.fields || []) {
          await store.upsertField(id, field.fieldKey, field.value);
        }
        return { session: toCaptureSession(updated ?? { ...row, ...patch }) };
      });
    },

    // Finalizes one direct-to-Blob upload as an asset row. Like other draft
    // content it is only writable while the contributor holds the ball and
    // is not audited per-save (D-012). Derived assets (thumbnails, crops)
    // must point at a source asset in the same session — originals are
    // never replaced, only referenced.
    async addAsset(actor, sessionId, input) {
      const normalized = normalizeAssetInput(input);
      const row = await store.getSession(sessionId);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture cannot receive new images`, { status: row.status });
      }
      if (normalized.sourceAssetId) {
        const source = await store.getAsset(normalized.sourceAssetId);
        if (!source || (source.session_id ?? source.sessionId) !== sessionId) {
          throw new CaptureValidationError('CAPTURE_ASSET_SOURCE_INVALID',
            'The source asset does not belong to this capture session');
        }
      }
      const change = { id: randomUUID(), sessionId, ownerId: rowOwner(row), ...normalized };
      const created = await store.insertAsset(change);
      return { asset: toCaptureAsset(created ?? change) };
    },

    // Delete-before-submit: allowed only while editable. Removing a source
    // asset removes its derivatives with it (a thumbnail without its
    // original is meaningless); a locked session's assets are immutable.
    async removeAsset(actor, sessionId, assetId) {
      const row = await store.getSession(sessionId);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture's images cannot be removed`, { status: row.status });
      }
      const asset = await store.getAsset(assetId);
      if (!asset || (asset.session_id ?? asset.sessionId) !== sessionId) {
        throw new CaptureValidationError('CAPTURE_ASSET_NOT_FOUND', 'Capture asset not found');
      }
      await store.deleteAssetWithDerivatives(assetId);
      return { removed: true };
    },

    // Server-truth completeness for a session — the client runs the same
    // validateCompleteness locally, this endpoint answers with what the
    // submit gate will actually enforce.
    async validateSession(actor, id) {
      const detail = await this.getSession(actor, id);
      return validateCompleteness(detail);
    },

    // Submit (and resubmit, from changes_requested): completeness errors
    // block; success freezes an immutable snapshot of exactly what was
    // submitted — session content, fields, assets, and the completeness
    // result — so review always sees what the contributor sent even if
    // later stages evolve the live records.
    async submitSession(actor, id) {
      const row = await store.getSession(id);
      assertVisible(actor, row);
      const outcome = assertTransition(actor.role, row.status, 'submitted');
      const [fields, assets] = await Promise.all([store.listFields(id), store.listAssets(id)]);
      const detail = {
        session: toCaptureSession(row),
        fields: fields.map(toCaptureField),
        assets: assets.map(toCaptureAsset),
      };
      const completeness = validateCompleteness(detail);
      if (completeness.errors.length) {
        throw new CaptureValidationError('CAPTURE_INCOMPLETE', 'The capture is not complete enough to submit', {
          errors: completeness.errors, warnings: completeness.warnings,
        });
      }
      const snapshot = { ...detail, completeness, submittedBy: actor.id, snapshotAt: new Date().toISOString() };
      return store.transaction(async () => {
        const updated = await store.applySubmission(id, row.status, snapshot, completeness.score);
        await store.appendAudit(audit(actor, outcome.audit, id, null, {
          ...outcome.metadata, completenessScore: completeness.score, warningCount: completeness.warnings.length,
        }));
        return {
          session: toCaptureSession(updated ?? { ...row, status: 'submitted', completeness: completeness.score }),
          completeness,
        };
      });
    },

    // Review queue: submitted-and-beyond sessions the actor may review.
    // Same row scoping as everything else — an owner reviews its own
    // tenant's submissions (single-seat tenancy, D-003), superadmin sees
    // all tenants. Capability enforcement happens at the route.
    async listReviewQueue(actor, filters = {}) {
      const status = filters.status && REVIEW_QUEUE_STATUSES.includes(filters.status) ? filters.status : null;
      const rows = await store.listReviewQueue({
        ownerId: actor.id,
        includeAllOwners: actor.role === 'superadmin',
        status,
        limit: Math.min(100, Math.max(1, Number(filters.limit) || 50)),
      });
      return rows.map(toCaptureSession);
    },

    async startReview(actor, id) {
      return this.transitionSession(actor, id, 'in_review');
    },

    // approve | request_changes | reject. The state machine supplies the
    // capability check, reason requirements, and audit action; this just
    // maps the reviewer's verb onto the target status.
    async decideReview(actor, id, decision, reason) {
      const toStatus = REVIEW_DECISIONS[decision];
      if (!toStatus) {
        throw new CaptureValidationError('CAPTURE_DECISION_INVALID',
          'Decision must be approve, request_changes, or reject', { decision });
      }
      return this.transitionSession(actor, id, toStatus, reason);
    },

    async addComment(actor, sessionId, body) {
      const text = String(body || '').trim();
      if (!text || text.length > 4000) {
        throw new CaptureValidationError('CAPTURE_COMMENT_INVALID', 'A comment needs 1-4000 characters');
      }
      const row = await store.getSession(sessionId);
      assertVisible(actor, row);
      if (row.status === 'draft' || row.status === 'archived') {
        throw new CaptureValidationError('CAPTURE_COMMENT_INVALID',
          `Comments are not available on a ${row.status} capture`, { status: row.status });
      }
      const change = { id: randomUUID(), sessionId, authorId: actor.id, body: text };
      const created = await store.insertComment(change);
      return { comment: toCaptureComment(created ?? change) };
    },

    async transitionSession(actor, id, toStatus, reason) {
      const row = await store.getSession(id);
      assertVisible(actor, row);
      const outcome = assertTransition(actor.role, row.status, toStatus, reason);
      return store.transaction(async () => {
        const updated = await store.updateSessionStatus(id, row.status, toStatus);
        await store.appendAudit(audit(actor, outcome.audit, id, outcome.reason, outcome.metadata));
        return { session: toCaptureSession(updated ?? { ...row, status: toStatus }) };
      });
    },

    async archiveSession(actor, id, reason) {
      return this.transitionSession(actor, id, 'archived', reason);
    },
  };
}

// Neon store. Same queued-transaction idiom as libraryService.js's store:
// inside store.transaction(work), writes are queued and committed atomically
// via sql.transaction(); reads outside a transaction run immediately.
export function createNeonCaptureStore(sql) {
  let pendingQueries = null;
  const execute = async (query, optimisticValue) => {
    if (pendingQueries) {
      pendingQueries.push(query);
      return optimisticValue;
    }
    const rows = await query;
    return rows[0] ?? optimisticValue;
  };

  return {
    async transaction(work) {
      if (pendingQueries) throw new Error('Nested Capture transactions are not supported');
      pendingQueries = [];
      try {
        const value = await work();
        const queries = pendingQueries;
        pendingQueries = null;
        await sql.transaction(queries);
        return value;
      } catch (error) {
        pendingQueries = null;
        throw error;
      }
    },
    async listSessions({ ownerId, includeAllOwners, status, limit }) {
      return sql`select * from capture_sessions
        where (${Boolean(includeAllOwners)} or owner_id = ${ownerId})
          and (${status || null}::text is null or status = ${status || null})
          and status <> 'archived'
        order by updated_at desc limit ${limit}`;
    },
    async getSession(id) {
      const [row] = await sql`select * from capture_sessions where id = ${id}`;
      return row || null;
    },
    async getSessionByClientRef(ownerId, clientRef) {
      const [row] = await sql`select * from capture_sessions
        where owner_id = ${ownerId} and client_ref = ${clientRef}`;
      return row || null;
    },
    async createSession(change) {
      const query = sql`insert into capture_sessions
        (id, owner_id, client_ref, capture_type, category, title, status, current_step, completeness)
        values (${change.id}, ${change.ownerId}, ${change.clientRef}, ${change.captureType},
                ${change.category}, ${change.title}, ${change.status}, ${change.currentStep}, ${change.completeness})
        on conflict (owner_id, client_ref) where client_ref is not null do nothing
        returning *`;
      return execute(query, change);
    },
    async updateSessionContent(id, patch) {
      const query = sql`update capture_sessions set
          title = case when ${'title' in patch} then ${patch.title ?? null} else title end,
          category = case when ${'category' in patch} then ${patch.category ?? null} else category end,
          current_step = case when ${'currentStep' in patch} then ${patch.currentStep ?? null} else current_step end,
          updated_at = now()
        where id = ${id} returning *`;
      return execute(query, null);
    },
    async applySubmission(id, fromStatus, snapshot, completeness) {
      const query = sql`update capture_sessions set status = 'submitted',
          submitted_snapshot = ${JSON.stringify(snapshot)}::jsonb,
          completeness = ${completeness},
          submitted_at = now(),
          updated_at = now()
        where id = ${id} and status = ${fromStatus} returning *`;
      return execute(query, null);
    },
    // Guarded by the current status so a concurrent transition can't be
    // silently overwritten — the stale write updates zero rows.
    async updateSessionStatus(id, fromStatus, toStatus) {
      const query = sql`update capture_sessions set status = ${toStatus},
          submitted_at = case when ${toStatus === 'submitted'} then now() else submitted_at end,
          updated_at = now()
        where id = ${id} and status = ${fromStatus} returning *`;
      return execute(query, null);
    },
    async listFields(sessionId) {
      return sql`select * from capture_fields where session_id = ${sessionId} order by field_key`;
    },
    async listReviewQueue({ ownerId, includeAllOwners, status, limit }) {
      return sql`select * from capture_sessions
        where (${Boolean(includeAllOwners)} or owner_id = ${ownerId})
          and (${status || null}::text is null or status = ${status || null})
          and status in ('submitted','in_review','changes_requested','approved','publishing','published','rejected')
        order by submitted_at desc nulls last, updated_at desc limit ${limit}`;
    },
    async listComments(sessionId) {
      return sql`select c.*, coalesce(u.business_name, u.company_name, u.email) as author_label
        from capture_review_comments c
        left join users u on u.id = c.author_id
        where c.session_id = ${sessionId}
        order by c.created_at`;
    },
    async insertComment(change) {
      const query = sql`insert into capture_review_comments (id, session_id, author_id, body)
        values (${change.id}, ${change.sessionId}, ${change.authorId}, ${change.body})
        returning *`;
      return execute(query, change);
    },
    async listAssets(sessionId) {
      return sql`select * from capture_assets where session_id = ${sessionId} order by created_at`;
    },
    async getAsset(id) {
      const [row] = await sql`select * from capture_assets where id = ${id}`;
      return row || null;
    },
    async insertAsset(change) {
      const query = sql`insert into capture_assets
        (id, session_id, owner_id, purpose, classification, source_asset_id, url, checksum,
         mime_type, size_bytes, width, height, capture_metadata, upload_status)
        values (${change.id}, ${change.sessionId}, ${change.ownerId}, ${change.purpose},
                ${change.classification}, ${change.sourceAssetId}, ${change.url}, ${change.checksum},
                ${change.mimeType}, ${change.sizeBytes}, ${change.width}, ${change.height},
                ${JSON.stringify(change.captureMetadata || {})}::jsonb, 'complete')
        returning *`;
      return execute(query, change);
    },
    async deleteAssetWithDerivatives(id) {
      await sql`delete from capture_assets where source_asset_id = ${id}`;
      await sql`delete from capture_assets where id = ${id}`;
    },
    async upsertField(sessionId, fieldKey, value) {
      const query = sql`insert into capture_fields (session_id, field_key, value)
        values (${sessionId}, ${fieldKey}, ${JSON.stringify(value)}::jsonb)
        on conflict (session_id, field_key)
        do update set value = excluded.value, updated_at = now()`;
      if (pendingQueries) { pendingQueries.push(query); return; }
      await query;
    },
    async appendAudit(event) {
      const query = sql`insert into superadmin_audit_events (actor_id, action, target_type, target_id, reason, metadata)
        values (${event.actorId}, ${event.action}, ${event.targetType}, ${event.targetId},
                ${event.reason}, ${JSON.stringify(event.metadata || {})}::jsonb)`;
      if (pendingQueries) { pendingQueries.push(query); return; }
      await query;
    },
  };
}
