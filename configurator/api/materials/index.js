import { sql, ensureSchema } from '../_lib/db.js';
import { requireUserId } from '../_lib/auth.js';
import { handleFolderList, handleFolderItem } from '../_lib/folders.js';
import { canActOnOwner } from '../_lib/roles.js';

// Merged list/create/update/delete into one function (id supplied as ?id= by
// vercel.json's rewrites) — see api/auth/[action].js for why. Also carries this
// library's folder tree (`?folders=1`, kind='material' — shared CRUD with
// api/colors/[[...id]].js, see _lib/folders.js) and each material's linked
// colors (`?colors=1` on /api/materials/<id>) rather than adding more
// top-level route files — see README's "API route layout" note.
export default async function handler(req, res) {
  const [id] = [].concat(req.query.id || []);
  const isFolders = req.query.folders != null;
  const isColorsLink = req.query.colors != null;

  try {
    await ensureSchema();

    if (isFolders) {
      if (!id) {
        await handleFolderList(req, res, 'material');
      } else {
        await handleFolderItem(req, res, 'material', id);
      }
      return;
    }

    if (!id) {
      if (req.method === 'GET') {
        // Same public-by-ownerId / private-to-self split as api/colors — a
        // customer viewing a shared project link passes that project's
        // (already-public) owner_id to see the same custom materials the
        // owner added, no login required.
        const { ownerId } = req.query;
        const targetOwnerId = ownerId || (await requireUserId(req, res));
        if (!targetOwnerId) return;
        const rows = await sql`select * from materials where owner_id = ${targetOwnerId} order by created_at asc`;
        if (!rows.length) {
          res.status(200).json(rows);
          return;
        }
        // Neon's sql`` tag has no array/IN-list fragment helper (it's a
        // plain tagged template, not postgres.js), so this joins back
        // through materials rather than passing an array of ids in.
        const links = await sql`
          select mc.material_id, mc.color_id
          from material_colors mc
          join materials m on m.id = mc.material_id
          where m.owner_id = ${targetOwnerId}
        `;
        const colorIdsByMaterial = new Map();
        links.forEach((l) => {
          const list = colorIdsByMaterial.get(l.material_id) || [];
          list.push(l.color_id);
          colorIdsByMaterial.set(l.material_id, list);
        });
        res.status(200).json(rows.map((r) => ({ ...r, colorIds: colorIdsByMaterial.get(r.id) || [] })));
        return;
      }

      if (req.method === 'POST') {
        const userId = await requireUserId(req, res);
        if (!userId) return;
        const { name, kind, pricePerSqft, profiles, folderId } = req.body || {};
        if (!name) {
          res.status(400).json({ error: 'name is required' });
          return;
        }
        const [row] = await sql`
          insert into materials (owner_id, name, kind, price_per_sqft, profiles, folder_id)
          values (${userId}, ${name}, ${kind === 'wall' ? 'wall' : 'roof'}, ${pricePerSqft ?? 0}, ${profiles?.length ? JSON.stringify(profiles) : null}::jsonb, ${folderId || null})
          returning *
        `;
        res.status(201).json(row);
        return;
      }

      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const userId = await requireUserId(req, res);
    if (!userId) return;

    const [existing] = await sql`select owner_id from materials where id = ${id}`;
    if (!existing || (existing.owner_id !== userId && !(await canActOnOwner(userId, existing.owner_id)))) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (isColorsLink) {
      if (req.method === 'PUT') {
        const { colorIds } = req.body || {};
        await sql`delete from material_colors where material_id = ${id}`;
        // Same "no array helper" limitation as the GET above — one insert
        // per linked color rather than a single multi-row statement. A
        // material realistically has a handful of applicable colors, not
        // hundreds, so this stays cheap.
        const ids = Array.isArray(colorIds) ? [...new Set(colorIds.filter(Boolean))] : [];
        await Promise.all(ids.map((colorId) => sql`insert into material_colors (material_id, color_id) values (${id}, ${colorId})`));
        res.status(200).json({ materialId: id, colorIds: ids });
        return;
      }
      res.setHeader('Allow', 'PUT');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (req.method === 'PUT') {
      const { name, kind, pricePerSqft, profiles, folderId } = req.body || {};
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const [row] = await sql`
        update materials
        set name = ${name}, kind = ${kind === 'wall' ? 'wall' : 'roof'}, price_per_sqft = ${pricePerSqft ?? 0},
            profiles = ${profiles?.length ? JSON.stringify(profiles) : null}::jsonb, folder_id = ${folderId || null}
        where id = ${id}
        returning *
      `;
      res.status(200).json(row);
      return;
    }

    if (req.method === 'DELETE') {
      await sql`delete from materials where id = ${id}`;
      res.status(204).end();
      return;
    }

    res.setHeader('Allow', 'PUT, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Materials API error:', err);
    res.status(500).json({ error: 'Internal error — the database may not be reachable yet.' });
  }
}
