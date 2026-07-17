import { sql } from './db.js';
import { requireUserId } from './auth.js';
import { requirePublicTenant } from './publicTenant.js';

// Shared folder CRUD for both the Materials and Colors libraries — one
// tree per `kind` ('material'|'color') over the same `folders` table (see
// db.js's ensureSchema()). Previously duplicated near-verbatim between
// api/colors/[[...id]].js and api/materials/[[...id]].js; both now call
// these two functions from their `?folders=1` branch instead.

export async function handleFolderList(req, res, kind) {
  if (req.method === 'GET') {
    const { ownerId } = req.query;
    if (ownerId && !(await requirePublicTenant(ownerId, res))) return;
    const targetOwnerId = ownerId || (await requireUserId(req, res));
    if (!targetOwnerId) return;
    const rows = await sql`select * from folders where owner_id = ${targetOwnerId} and kind = ${kind} order by name asc`;
    res.status(200).json(rows);
    return;
  }

  if (req.method === 'POST') {
    const userId = await requireUserId(req, res);
    if (!userId) return;
    const { name, parentId } = req.body || {};
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const [row] = await sql`
      insert into folders (owner_id, kind, parent_id, name)
      values (${userId}, ${kind}, ${parentId || null}, ${name})
      returning *
    `;
    res.status(201).json(row);
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method not allowed' });
}

export async function handleFolderItem(req, res, kind, id) {
  const userId = await requireUserId(req, res);
  if (!userId) return;

  const [existing] = await sql`select owner_id from folders where id = ${id} and kind = ${kind}`;
  if (!existing || existing.owner_id !== userId) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (req.method === 'PUT') {
    const { name, parentId } = req.body || {};
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const [row] = await sql`
      update folders set name = ${name}, parent_id = ${parentId || null}
      where id = ${id}
      returning *
    `;
    res.status(200).json(row);
    return;
  }

  if (req.method === 'DELETE') {
    await sql`delete from folders where id = ${id}`;
    res.status(204).end();
    return;
  }

  res.setHeader('Allow', 'PUT, DELETE');
  res.status(405).json({ error: 'Method not allowed' });
}
