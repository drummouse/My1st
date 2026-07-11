import { sql, ensureSchema } from '../_lib/db.js';
import { requireUserId } from '../_lib/auth.js';
import { resolveOwnerId } from '../_lib/roles.js';

export default async function handler(req, res) {
  try {
    const userId = await requireUserId(req, res);
    if (!userId) return;
    // A developer can pass ?asOwner=<id> to view/edit a different tenant's
    // Settings for support/debugging — see api/_lib/roles.js. A plain
    // request (no asOwner, or a non-developer caller) always acts on the
    // caller's own settings.
    const ownerId = await resolveOwnerId(req, userId);
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
        taxCountry, taxRegion, taxLabel, municipalTaxRate, discountRules, notificationWebhookUrl,
        defaultCustomServiceIds,
      } = req.body || {};
      // Settings and Discounts are now two separate panels that each PUT
      // only the fields they show — every column here is written with
      // `coalesce(excluded.x, settings.x)` so a panel that doesn't send a
      // given field (e.g. Discounts never sends gstRate) leaves the
      // existing value untouched instead of nulling it out. `??` (not `||`)
      // is used going into `excluded` so an explicit empty-string clear
      // (e.g. removing the logo) still writes through as a real value, not
      // "field omitted."
      const [row] = await sql`
        insert into settings (
          owner_id, gst_rate, full_wrap_discount_pct, soffit_fascia_discount_pct, gutter_downspout_free,
          default_services, default_locked_services, default_accessory_colors,
          default_roof_color_id, default_wall_color_id, report_footer_note, logo_url,
          tax_country, tax_region, tax_label, municipal_tax_rate, discount_rules, notification_webhook_url,
          default_custom_service_ids, updated_at
        )
        values (
          ${ownerId}, ${gstRate ?? null}, ${fullWrapDiscountPct ?? null}, ${soffitFasciaDiscountPct ?? null}, ${gutterDownspoutFree ?? null},
          ${defaultServices != null ? JSON.stringify(defaultServices) : null}::jsonb,
          ${defaultLockedServices != null ? JSON.stringify(defaultLockedServices) : null}::jsonb,
          ${defaultAccessoryColors != null ? JSON.stringify(defaultAccessoryColors) : null}::jsonb,
          ${defaultRoofColorId ?? null}, ${defaultWallColorId ?? null}, ${reportFooterNote ?? null}, ${logoUrl ?? null},
          ${taxCountry ?? null}, ${taxRegion ?? null}, ${taxLabel ?? null}, ${municipalTaxRate ?? null},
          ${discountRules != null ? JSON.stringify(discountRules) : null}::jsonb, ${notificationWebhookUrl ?? null},
          ${defaultCustomServiceIds != null ? JSON.stringify(defaultCustomServiceIds) : null}::jsonb, now()
        )
        on conflict (owner_id) do update set
          gst_rate = coalesce(excluded.gst_rate, settings.gst_rate),
          full_wrap_discount_pct = coalesce(excluded.full_wrap_discount_pct, settings.full_wrap_discount_pct),
          soffit_fascia_discount_pct = coalesce(excluded.soffit_fascia_discount_pct, settings.soffit_fascia_discount_pct),
          gutter_downspout_free = coalesce(excluded.gutter_downspout_free, settings.gutter_downspout_free),
          default_services = coalesce(excluded.default_services, settings.default_services),
          default_locked_services = coalesce(excluded.default_locked_services, settings.default_locked_services),
          default_accessory_colors = coalesce(excluded.default_accessory_colors, settings.default_accessory_colors),
          default_roof_color_id = coalesce(excluded.default_roof_color_id, settings.default_roof_color_id),
          default_wall_color_id = coalesce(excluded.default_wall_color_id, settings.default_wall_color_id),
          report_footer_note = coalesce(excluded.report_footer_note, settings.report_footer_note),
          logo_url = coalesce(excluded.logo_url, settings.logo_url),
          tax_country = coalesce(excluded.tax_country, settings.tax_country),
          tax_region = coalesce(excluded.tax_region, settings.tax_region),
          tax_label = coalesce(excluded.tax_label, settings.tax_label),
          municipal_tax_rate = coalesce(excluded.municipal_tax_rate, settings.municipal_tax_rate),
          discount_rules = coalesce(excluded.discount_rules, settings.discount_rules),
          notification_webhook_url = coalesce(excluded.notification_webhook_url, settings.notification_webhook_url),
          default_custom_service_ids = coalesce(excluded.default_custom_service_ids, settings.default_custom_service_ids),
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
