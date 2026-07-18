import { sql, ensureSchema } from '../_lib/db.js';
import { requireActiveUser } from '../_lib/access.js';
import { serializeTenantSettings } from '../_lib/tenantFeatures.js';
import { resolveExpertEntitlement } from '../../src/lib/studioMode.js';
import { isUnitSystem } from '../../src/lib/units.js';

export function createSettingsHandler({
  query = sql,
  ensureSettingsSchema = ensureSchema,
  authorizeSettingsUser = requireActiveUser,
  serializeSettings = serializeTenantSettings,
} = {}) {
  return async function handler(req, res) {
  try {
    const user = await authorizeSettingsUser(req, res);
    if (!user) return;
    const ownerId = user.id;
    await ensureSettingsSchema();

    if (req.method === 'GET') {
      const [row] = await query`
        select gst_rate, full_wrap_discount_pct, soffit_fascia_discount_pct, gutter_downspout_free,
          default_services, default_locked_services, default_accessory_colors,
          default_roof_color_id, default_wall_color_id, report_footer_note, logo_url,
          tax_country, tax_region, tax_label, municipal_tax_rate, discount_rules,
          notification_webhook_url, default_custom_service_ids, unit_system, updated_at,
          expert_mode_enabled, show_expert_mode
        from settings where owner_id = ${ownerId}
      `;
      if (row) {
        res.status(200).json(serializeSettings({ row, role: user.role }));
        return;
      }
      // First read ever for this owner — seed a row with the defaults the
      // app already used before Settings existed, so nothing changes until
      // this owner actually edits something.
      const [seeded] = await query`
        insert into settings (owner_id) values (${ownerId})
        on conflict (owner_id) do nothing
        returning gst_rate, full_wrap_discount_pct, soffit_fascia_discount_pct, gutter_downspout_free,
          default_services, default_locked_services, default_accessory_colors,
          default_roof_color_id, default_wall_color_id, report_footer_note, logo_url,
          tax_country, tax_region, tax_label, municipal_tax_rate, discount_rules,
          notification_webhook_url, default_custom_service_ids, unit_system, updated_at,
          expert_mode_enabled, show_expert_mode
      `;
      const settingsRow = seeded || (await query`
        select gst_rate, full_wrap_discount_pct, soffit_fascia_discount_pct, gutter_downspout_free,
          default_services, default_locked_services, default_accessory_colors,
          default_roof_color_id, default_wall_color_id, report_footer_note, logo_url,
          tax_country, tax_region, tax_label, municipal_tax_rate, discount_rules,
          notification_webhook_url, default_custom_service_ids, unit_system, updated_at,
          expert_mode_enabled, show_expert_mode
        from settings where owner_id = ${ownerId}
      `)[0];
      res.status(200).json(serializeSettings({ row: settingsRow, role: user.role }));
      return;
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      if (Object.hasOwn(body, 'EXPERT_MODE_VAR') || Object.hasOwn(body, 'expert_mode_enabled')) {
        res.status(400).json({
          error: 'Expert Mode entitlement fields are not accepted by tenant Settings.',
          code: 'EXPERT_MODE_ENTITLEMENT_FIELD_FORBIDDEN',
        });
        return;
      }
      const camelUnitSystemSupplied = Object.hasOwn(body, 'unitSystem');
      const snakeUnitSystemSupplied = Object.hasOwn(body, 'unit_system');
      if (
        camelUnitSystemSupplied
        && snakeUnitSystemSupplied
        && body.unitSystem !== body.unit_system
      ) {
        res.status(400).json({ error: 'Conflicting unit systems were supplied.' });
        return;
      }
      const unitSystem = camelUnitSystemSupplied ? body.unitSystem : body.unit_system;
      const unitSystemSupplied = camelUnitSystemSupplied || snakeUnitSystemSupplied;
      if (unitSystemSupplied && !isUnitSystem(unitSystem)) {
        res.status(400).json({ error: 'Unit system must be imperial or metric.' });
        return;
      }
      const camelPreferenceSupplied = Object.hasOwn(body, 'showExpertMode');
      const snakePreferenceSupplied = Object.hasOwn(body, 'show_expert_mode');
      if (
        camelPreferenceSupplied
        && snakePreferenceSupplied
        && body.showExpertMode !== body.show_expert_mode
      ) {
        res.status(400).json({ error: 'Conflicting Expert Mode preferences were supplied.' });
        return;
      }
      const showExpertMode = camelPreferenceSupplied
        ? body.showExpertMode
        : body.show_expert_mode;
      const showExpertModeSupplied = camelPreferenceSupplied || snakePreferenceSupplied;
      if (showExpertModeSupplied && typeof showExpertMode !== 'boolean') {
        res.status(400).json({ error: 'Show Expert Mode must be a boolean.' });
        return;
      }
      if (showExpertModeSupplied) {
        const [entitlementRow] = user.role === 'superadmin'
          ? [{ expert_mode_enabled: false }]
          : await query`
            select expert_mode_enabled from settings where owner_id = ${ownerId}
          `;
        const entitled = resolveExpertEntitlement({
          role: user.role,
          tenantEntitlement: entitlementRow?.expert_mode_enabled,
        });
        if (!entitled) {
          res.status(403).json({
            error: 'This account is not entitled to configure Expert Mode.',
            code: 'EXPERT_MODE_ENTITLEMENT_REQUIRED',
          });
          return;
        }
      }
      const {
        gstRate, fullWrapDiscountPct, soffitFasciaDiscountPct, gutterDownspoutFree,
        defaultServices, defaultLockedServices, defaultAccessoryColors,
        defaultRoofColorId, defaultWallColorId, reportFooterNote, logoUrl,
        taxCountry, taxRegion, taxLabel, municipalTaxRate, discountRules, notificationWebhookUrl,
        defaultCustomServiceIds,
      } = body;
      const initialShowExpertMode = showExpertModeSupplied
        ? showExpertMode
        : false;
      // Settings and Discounts are now two separate panels that each PUT
      // only the fields they show — every column here is written with
      // `coalesce(excluded.x, settings.x)` so a panel that doesn't send a
      // given field (e.g. Discounts never sends gstRate) leaves the
      // existing value untouched instead of nulling it out. `??` (not `||`)
      // is used going into `excluded` so an explicit empty-string clear
      // (e.g. removing the logo) still writes through as a real value, not
      // "field omitted."
      const [row] = await query`
        insert into settings (
          owner_id, gst_rate, full_wrap_discount_pct, soffit_fascia_discount_pct, gutter_downspout_free,
          default_services, default_locked_services, default_accessory_colors,
          default_roof_color_id, default_wall_color_id, report_footer_note, logo_url,
          tax_country, tax_region, tax_label, municipal_tax_rate, discount_rules, notification_webhook_url,
          default_custom_service_ids, unit_system, show_expert_mode, updated_at
        )
        values (
          ${ownerId}, ${gstRate ?? null}, ${fullWrapDiscountPct ?? null}, ${soffitFasciaDiscountPct ?? null}, ${gutterDownspoutFree ?? null},
          ${defaultServices != null ? JSON.stringify(defaultServices) : null}::jsonb,
          ${defaultLockedServices != null ? JSON.stringify(defaultLockedServices) : null}::jsonb,
          ${defaultAccessoryColors != null ? JSON.stringify(defaultAccessoryColors) : null}::jsonb,
          ${defaultRoofColorId ?? null}, ${defaultWallColorId ?? null}, ${reportFooterNote ?? null}, ${logoUrl ?? null},
          ${taxCountry ?? null}, ${taxRegion ?? null}, ${taxLabel ?? null}, ${municipalTaxRate ?? null},
          ${discountRules != null ? JSON.stringify(discountRules) : null}::jsonb, ${notificationWebhookUrl ?? null},
          ${defaultCustomServiceIds != null ? JSON.stringify(defaultCustomServiceIds) : null}::jsonb,
          ${unitSystemSupplied ? unitSystem : 'imperial'}, ${initialShowExpertMode}, now()
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
          unit_system = case
            when ${unitSystemSupplied} then excluded.unit_system
            else settings.unit_system
          end,
          show_expert_mode = case
            when (${user.role} = 'superadmin' or settings.expert_mode_enabled = true)
              and ${showExpertModeSupplied}
            then ${showExpertModeSupplied ? showExpertMode : false}
            else settings.show_expert_mode
          end,
          updated_at = now()
        returning gst_rate, full_wrap_discount_pct, soffit_fascia_discount_pct, gutter_downspout_free,
          default_services, default_locked_services, default_accessory_colors,
          default_roof_color_id, default_wall_color_id, report_footer_note, logo_url,
          tax_country, tax_region, tax_label, municipal_tax_rate, discount_rules,
          notification_webhook_url, default_custom_service_ids, unit_system, updated_at,
          expert_mode_enabled, show_expert_mode
      `;
      res.status(200).json(serializeSettings({ row, role: user.role }));
      return;
    }

    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Settings API error:', err);
    res.status(500).json({ error: 'Internal error — the Settings database may not be reachable yet.' });
  }
  };
}

export default createSettingsHandler();
