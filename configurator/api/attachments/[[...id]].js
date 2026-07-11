import { sql, ensureSchema } from '../_lib/db.js';
import { getUserId } from '../_lib/auth.js';

const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
const FILE_MAX_BYTES = 25 * 1024 * 1024;
const PROJECT_AGGREGATE_MAX_BYTES = 200 * 1024 * 1024;

// Single function serving two shapes (see api/auth/[action].js for why
// everything in this app is one function per resource):
//   /api/attachments?projectId=<id>  — list (GET, public) / add (POST, owner-only)
//   /api/attachments/<id>            — delete (DELETE, owner-only)
export default async function handler(req, res) {
  const [id] = [].concat(req.query.id || []);

  try {
    await ensureSchema();

    if (!id) {
      const { projectId } = req.query;
      if (!projectId) {
        res.status(400).json({ error: 'projectId is required' });
        return;
      }

      // Deliberately public — customers viewing a project's ?p=<id> link
      // should see its attachments with no account of their own, same as
      // the project itself.
      if (req.method === 'GET') {
        const rows = await sql`select * from attachments where project_id = ${projectId} order by uploaded_at asc`;
        res.status(200).json(rows);
        return;
      }

      if (req.method === 'POST') {
        const userId = await getUserId(req);
        if (!userId) {
          res.status(401).json({ error: 'Not authenticated' });
          return;
        }
        const [project] = await sql`select owner_id from projects where id = ${projectId}`;
        if (!project) {
          res.status(404).json({ error: 'Project not found' });
          return;
        }
        if (project.owner_id && project.owner_id !== userId) {
          res.status(403).json({ error: 'This project belongs to a different account' });
          return;
        }

        const { kind, fileName, url, mimeType, sizeBytes } = req.body || {};
        if (!kind || !fileName || !url) {
          res.status(400).json({ error: 'kind, fileName, and url are required' });
          return;
        }
        const size = Number(sizeBytes) || 0;
        const perFileLimit = kind === 'photo' ? PHOTO_MAX_BYTES : FILE_MAX_BYTES;
        if (size > perFileLimit) {
          res.status(400).json({ error: `File exceeds the ${(perFileLimit / (1024 * 1024)).toFixed(0)} MB limit for ${kind === 'photo' ? 'photos' : 'files'}` });
          return;
        }
        const [{ total }] = await sql`select coalesce(sum(size_bytes), 0) as total from attachments where project_id = ${projectId}`;
        if (Number(total) + size > PROJECT_AGGREGATE_MAX_BYTES) {
          res.status(400).json({ error: 'This project has reached its 200 MB total attachment limit' });
          return;
        }

        const [row] = await sql`
          insert into attachments (project_id, kind, file_name, url, mime_type, size_bytes)
          values (${projectId}, ${kind === 'photo' ? 'photo' : 'file'}, ${fileName}, ${url}, ${mimeType || null}, ${size})
          returning *
        `;
        res.status(201).json(row);
        return;
      }

      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (req.method === 'DELETE') {
      const userId = await getUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const [existing] = await sql`
        select a.id, p.owner_id
        from attachments a
        join projects p on p.id = a.project_id
        where a.id = ${id}
      `;
      if (!existing) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (existing.owner_id && existing.owner_id !== userId) {
        res.status(403).json({ error: 'This project belongs to a different account' });
        return;
      }
      await sql`delete from attachments where id = ${id}`;
      res.status(204).end();
      return;
    }

    res.setHeader('Allow', 'DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Attachments API error:', err);
    res.status(500).json({ error: 'Internal error — the database may not be reachable yet.' });
  }
}
