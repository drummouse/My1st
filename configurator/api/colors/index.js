import { sql, ensureSchema } from '../_lib/db.js';
import { requireUserId } from '../_lib/auth.js';
import { handleFolderList, handleFolderItem } from '../_lib/folders.js';

// Merged list/create/update/delete into one function (id supplied as ?id= by
// vercel.json's rewrites) — see api/auth/[action].js for why. Also carries this
// library's folder tree (`?folders=1`, kind='color' — shared CRUD with
// api/materials/[[...id]].js, see _lib/folders.js) rather than adding
// another top-level route file — see README's "API route layout" note.
export default async function handler(req, res) {
  const [id] = [].concat(req.query.id || []);
  const isFolders = req.query.folders != null;

  try {
    await ensureSchema();

    if (isFolders) {
      if (!id) {
        await handleFolderList(req, res, 'color');
      } else {
        await handleFolderItem(req, res, 'color', id);
      }
      return;
    }

    if (!id) {
      if (req.method === 'GET') {
        const targetOwnerId = await requireUserId(req, res);
        if (!targetOwnerId) return;
        const rows = await sql`select * from colors where owner_id = ${targetOwnerId} order by created_at asc`;
        if (!rows.length) {
          res.status(200).json(rows);
          return;
        }
        // A color can sit in more than one library folder (e.g. the same
        // finish listed under two different color-line folders) — see
        // Phase 10 in the plan.
        const links = await sql`
          select cf.color_id, cf.folder_id
          from color_folders cf
          join colors c on c.id = cf.color_id
          where c.owner_id = ${targetOwnerId}
        `;
        const folderIdsByColor = new Map();
        links.forEach((l) => {
          const list = folderIdsByColor.get(l.color_id) || [];
          list.push(l.folder_id);
          folderIdsByColor.set(l.color_id, list);
        });
        res.status(200).json(rows.map((r) => ({ ...r, folderIds: folderIdsByColor.get(r.id) || [] })));
        return;
      }

      if (req.method === 'POST') {
        const userId = await requireUserId(req, res);
        if (!userId) return;
        const { name, code, hex, series, thumbnailUrl, folderIds } = req.body || {};
        if (!name) {
          res.status(400).json({ error: 'name is required' });
          return;
        }
        const [row] = await sql`
          insert into colors (owner_id, name, code, hex, series, thumbnail_url)
          values (${userId}, ${name}, ${code || null}, ${hex || '#888888'}, ${series || 'Custom'}, ${thumbnailUrl || null})
          returning *
        `;
        const ids = Array.isArray(folderIds) ? [...new Set(folderIds.filter(Boolean))] : [];
        await Promise.all(ids.map((folderId) => sql`insert into color_folders (color_id, folder_id) values (${row.id}, ${folderId})`));
        res.status(201).json({ ...row, folderIds: ids });
        return;
      }

      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const userId = await requireUserId(req, res);
    if (!userId) return;

    const [existing] = await sql`select owner_id from colors where id = ${id}`;
    if (!existing || existing.owner_id !== userId) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (req.method === 'PUT') {
      const { name, code, hex, series, thumbnailUrl, folderIds } = req.body || {};
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const [row] = await sql`
        update colors
        set name = ${name}, code = ${code || null}, hex = ${hex || '#888888'}, series = ${series || 'Custom'}, thumbnail_url = ${thumbnailUrl || null}
        where id = ${id}
        returning *
      `;
      if (folderIds !== undefined) {
        await sql`delete from color_folders where color_id = ${id}`;
        const ids = Array.isArray(folderIds) ? [...new Set(folderIds.filter(Boolean))] : [];
        await Promise.all(ids.map((folderId) => sql`insert into color_folders (color_id, folder_id) values (${id}, ${folderId})`));
        res.status(200).json({ ...row, folderIds: ids });
        return;
      }
      res.status(200).json(row);
      return;
    }

    if (req.method === 'DELETE') {
      await sql`delete from colors where id = ${id}`;
      res.status(204).end();
      return;
    }

    res.setHeader('Allow', 'PUT, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Colors API error:', err);
    res.status(500).json({ error: 'Internal error — the database may not be reachable yet.' });
  }
}
