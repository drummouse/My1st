import { sql, ensureSchema } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const [row] = await sql`select * from settings where singleton = true`;
      if (row) {
        res.status(200).json(row);
        return;
      }
      // First read ever — seed the single row with the defaults the app
      // already used before Settings existed, so nothing changes until an
      // admin actually edits something.
      const [seeded] = await sql`
        insert into settings (singleton) values (true)
        on conflict (singleton) do nothing
        returning *
      `;
      res.status(200).json(seeded || (await sql`select * from settings where singleton = true`)[0]);
      return;
    }

    if (req.method === 'PUT') {
      const {
        gstRate, fullWrapDiscountPct, soffitFasciaDiscountPct, gutterDownspoutFree,
        defaultServices, defaultLockedServices, defaultAccessoryColors,
        defaultRoofColorId, defaultWallColorId, reportFooterNote,
      } = req.body || {};
      const [row] = await sql`
        insert into settings (
          singleton, gst_rate, full_wrap_discount_pct, soffit_fascia_discount_pct, gutter_downspout_free,
          default_services, default_locked_services, default_accessory_colors,
          default_roof_color_id, default_wall_color_id, report_footer_note, updated_at
        )
        values (
          true, ${gstRate}, ${fullWrapDiscountPct}, ${soffitFasciaDiscountPct}, ${gutterDownspoutFree},
          ${JSON.stringify(defaultServices)}::jsonb, ${JSON.stringify(defaultLockedServices)}::jsonb, ${JSON.stringify(defaultAccessoryColors)}::jsonb,
          ${defaultRoofColorId || null}, ${defaultWallColorId || null}, ${reportFooterNote || null}, now()
        )
        on conflict (singleton) do update set
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
