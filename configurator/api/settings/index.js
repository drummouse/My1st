import { sql, ensureSchema } from '../_lib/db.js';
import { requireUserId } from '../_lib/auth.js';

export default async function handler(req, res) {
  try {
    const ownerId = await requireUserId(req, res);
    if (!ownerId) return;
    await ensureSchema();

    if (req.method === 'GET') {
      const [row] = await sql`select * from settings where owner_id = ${ownerId}`;
      if (row) {
        res.status(200).json(row);
        return;
      }
      // First read ever for this owner — seed a row with the defaults the
      // app already used before Settings existed, so nothing changes until
      // this owner actually edits something.
      const [seeded] = await sql`
        insert into settings (owner_id) values (${ownerId})
        on conflict (owner_id) do nothing
        returning *
      `;
      res.status(200).json(seeded || (await sql`select * from settings where owner_id = ${ownerId}`)[0]);
      return;
    }

    if (req.method === 'PUT') {
      const {
        gstRate, fullWrapDiscountPct, soffitFasciaDiscountPct, gutterDownspoutFree,
        defaultServices, defaultLockedServices, defaultAccessoryColors,
        defaultRoofColorId, defaultWallColorId, reportFooterNote, logoUrl,
      } = req.body || {};
      const [row] = await sql`
        insert into settings (
          owner_id, gst_rate, full_wrap_discount_pct, soffit_fascia_discount_pct, gutter_downspout_free,
          default_services, default_locked_services, default_accessory_colors,
          default_roof_color_id, default_wall_color_id, report_footer_note, logo_url, updated_at
        )
        values (
          ${ownerId}, ${gstRate}, ${fullWrapDiscountPct}, ${soffitFasciaDiscountPct}, ${gutterDownspoutFree},
          ${JSON.stringify(defaultServices)}::jsonb, ${JSON.stringify(defaultLockedServices)}::jsonb, ${JSON.stringify(defaultAccessoryColors)}::jsonb,
          ${defaultRoofColorId || null}, ${defaultWallColorId || null}, ${reportFooterNote || null}, ${logoUrl || null}, now()
        )
        on conflict (owner_id) do update set
          gst_rate = excluded.gst_rate,
          full_wrap_discount_pct = excluded.full_wrap_discount_pct,
          soffit_fascia_discount_pct = excluded.soffit_fascia_discount_pct,
          gutter_downspout_free = excluded.gutter_downspout_free,
          default_services = excluded.default_services,
          default_locked_services = excluded.default_locked_services,
          default_accessory_colors = excluded.default_accessory_colors,
          default_roof_color_id = excluded.default_roof_color_id,
          default_wall_color_id = excluded.default_wall_color_id,
          report_footer_note = excluded.report_footer_note,
          logo_url = excluded.logo_url,
          updated_at = now()
        returning *
      `;
      res.status(200).json(row);
      return;
    }

    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Settings API error:', err);
    res.status(500).json({ error: 'Internal error — the Settings database may not be reachable yet.' });
  }
}
