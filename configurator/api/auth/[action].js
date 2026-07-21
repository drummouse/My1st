import bcrypt from 'bcryptjs';
import { sql, ensureSchema } from '../_lib/db.js';
import { createSessionCookie, clearSessionCookie, getSessionClaims } from '../_lib/auth.js';
import { formatPostalOrZip } from '../../src/lib/address.js';
import { regionByCode } from '../../src/data/taxRates.js';
import {
  capabilitiesForRole,
  parseSuperAdminEmails,
  roleForBootstrap,
} from '../_lib/superadminPolicy.js';
import { requireActiveUser } from '../_lib/access.js';
import { normalizePhoneE164 } from '../_lib/commsValidation.js';

// Merged signup/login/logout/me/profile into one function (dispatched on
// the [action] path segment) — Vercel's Hobby plan caps the number of
// serverless functions per deployment, and four auth routes plus the rest
// of this app's growing API surface pushed the project over that limit
// (the deploy that added colors/materials as their own routes actually
// failed for this reason). Behavior is unchanged; only the file layout is.
export default async function handler(req, res) {
  const { action } = req.query;

  // Neon's sql`` tag executes immediately (no reusable fragment/column-list
  // composition like some other query builders) — every query below just
  // selects/returns `*` and this mapper picks the public fields out of the
  // row, so password_hash never reaches the JSON response.
  const serializeUser = (u) => ({
    id: u.id, email: u.email, companyName: u.company_name,
    firstName: u.first_name, lastName: u.last_name, businessName: u.business_name,
    phone: u.phone, addressLine: u.address_line, city: u.city,
    regionCode: u.region_code, postalCode: u.postal_code,
    website: u.website, socialUrl: u.social_url,
    role: u.role || 'owner',
    status: u.status || 'active',
    capabilities: capabilitiesForRole(u.role || 'owner'),
    mustChangePassword: Boolean(u.must_change_password),
  });

  const applySuperAdminBootstrap = async (user) => {
    const role = roleForBootstrap(user, parseSuperAdminEmails(process.env.SUPERADMIN_EMAILS));
    if (role === user.role) return user;
    const [updated] = await sql`update users set role = ${role} where id = ${user.id} returning *`;
    return updated;
  };

  if (action === 'signup') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const {
      email, password, companyName,
      firstName, lastName, businessName, phone,
      addressLine, city, regionCode, postalCode, website, socialUrl,
    } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    const hasName = firstName?.trim() && lastName?.trim();
    const hasBusiness = businessName?.trim();
    if (!hasName && !hasBusiness) {
      res.status(400).json({ error: 'Enter either your first and last name, or a business name' });
      return;
    }
    if (!phone?.trim()) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }
    // D-066: the earliest trustworthy boundary for a Canadian/US phone
    // number this app will later use as an SMS destination — root-caused
    // an incident where an unvalidated signup phone (stored verbatim, no
    // format check at all) permanently failed every SMS attempt against it.
    // Free-text country/region fields elsewhere aren't in scope; the app is
    // CA/US-only per regionByCode below, matching this validator's NANP
    // assumption.
    if (!normalizePhoneE164(phone)) {
      res.status(400).json({ error: 'Enter a valid Canadian or US phone number' });
      return;
    }
    if (!addressLine?.trim() || !city?.trim() || !regionCode?.trim() || !postalCode?.trim()) {
      res.status(400).json({ error: 'Full address (street, city, province/state, postal/zip code) is required' });
      return;
    }
    try {
      await ensureSchema();
      const normalizedEmail = String(email).trim().toLowerCase();
      const [existing] = await sql`select id from users where email = ${normalizedEmail}`;
      if (existing) {
        res.status(409).json({ error: 'An account with that email already exists' });
        return;
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const region = regionByCode(regionCode);
      const country = regionCode.split('-')[0];
      const formattedPostal = formatPostalOrZip(postalCode, country);
      const [user] = await sql`
        insert into users (
          email, password_hash, company_name, first_name, last_name, business_name, phone,
          address_line, city, region_code, postal_code, website, social_url
        )
        values (
          ${normalizedEmail}, ${passwordHash}, ${companyName || businessName || null},
          ${firstName || null}, ${lastName || null}, ${businessName || null}, ${phone},
          ${addressLine}, ${city}, ${regionCode}, ${formattedPostal}, ${website || null}, ${socialUrl || null}
        )
        returning *
      `;
      // One-time convenience: seed this new owner's tax jurisdiction from
      // their signup address instead of defaulting to Alberta's rate. Still
      // fully editable afterward in Settings — this only runs once, on the
      // very first settings row for this owner.
      if (region) {
        await sql`
          insert into settings (owner_id, gst_rate, tax_country, tax_region, tax_label)
          values (${user.id}, ${region.rate}, ${country}, ${regionCode}, ${region.label})
          on conflict (owner_id) do nothing
        `;
      }
      res.setHeader('Set-Cookie', await createSessionCookie(user.id, user.session_version || 1));
      res.status(201).json(serializeUser(user));
    } catch (err) {
      console.error('Signup error:', err);
      res.status(500).json({ error: 'Internal error — the accounts database may not be reachable yet.' });
    }
    return;
  }

  if (action === 'login') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    try {
      await ensureSchema();
      const normalizedEmail = String(email).trim().toLowerCase();
      let [user] = await sql`select * from users where email = ${normalizedEmail}`;
      // Same generic error whether the email doesn't exist or the password
      // is wrong — doesn't tell an attacker which emails have accounts.
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }
      if (user.deleted_at || (user.status || 'active') !== 'active') {
        res.status(403).json({ error: 'Account access is restricted. Please contact the platform administrator.' });
        return;
      }
      user = await applySuperAdminBootstrap(user);
      [user] = await sql`update users set last_login_at = now() where id = ${user.id} returning *`;
      res.setHeader('Set-Cookie', await createSessionCookie(user.id, user.session_version || 1));
      res.status(200).json(serializeUser(user));
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal error — the accounts database may not be reachable yet.' });
    }
    return;
  }

  if (action === 'logout') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    res.setHeader('Set-Cookie', clearSessionCookie());
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'me') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const session = await getSessionClaims(req);
      if (!session?.sub) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      await ensureSchema();
      let [user] = await sql`select * from users where id = ${session.sub}`;
      if (!user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      if (user.deleted_at || (user.status || 'active') !== 'active') {
        res.status(403).json({ error: 'Account access is restricted. Please contact the platform administrator.' });
        return;
      }
      if (Number(user.session_version || 1) !== Number(session.sv || 1)) {
        res.status(401).json({ error: 'Session expired', code: 'SESSION_REVOKED' });
        return;
      }
      user = await applySuperAdminBootstrap(user);
      res.status(200).json(serializeUser(user));
    } catch (err) {
      console.error('Me error:', err);
      res.status(500).json({ error: 'Internal error — the accounts database may not be reachable yet.' });
    }
    return;
  }

  if (action === 'change-password') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const user = await requireActiveUser(req, res);
      if (!user) return;
      const password = String(req.body?.password || '');
      if (password.length < 12) {
        res.status(400).json({ error: 'Password must be at least 12 characters' });
        return;
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const [updated] = await sql`
        update users set password_hash = ${passwordHash}, must_change_password = false,
          session_version = session_version + 1
        where id = ${user.id} returning *
      `;
      res.setHeader('Set-Cookie', await createSessionCookie(updated.id, updated.session_version));
      res.status(200).json(serializeUser(updated));
    } catch (err) {
      console.error('Password change error:', err);
      res.status(500).json({ error: 'Password change failed' });
    }
    return;
  }

  // Editing the same required/optional fields collected at signup, from
  // Settings → Company Profile — signup's validation rules apply again here
  // so an edit can't leave the account in a state signup itself would reject.
  if (action === 'profile') {
    if (req.method !== 'PUT') {
      res.setHeader('Allow', 'PUT');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      const activeUser = await requireActiveUser(req, res);
      if (!activeUser) return;
      const userId = activeUser.id;
      await ensureSchema();
      const {
        companyName, firstName, lastName, businessName, phone,
        addressLine, city, regionCode, postalCode, website, socialUrl,
      } = req.body || {};
      const hasName = firstName?.trim() && lastName?.trim();
      const hasBusiness = businessName?.trim();
      if (!hasName && !hasBusiness) {
        res.status(400).json({ error: 'Enter either your first and last name, or a business name' });
        return;
      }
      if (!phone?.trim()) {
        res.status(400).json({ error: 'Phone number is required' });
        return;
      }
      if (!normalizePhoneE164(phone)) {
        res.status(400).json({ error: 'Enter a valid Canadian or US phone number' });
        return;
      }
      if (!addressLine?.trim() || !city?.trim() || !regionCode?.trim() || !postalCode?.trim()) {
        res.status(400).json({ error: 'Full address (street, city, province/state, postal/zip code) is required' });
        return;
      }
      const country = regionCode.split('-')[0];
      const formattedPostal = formatPostalOrZip(postalCode, country);
      const [user] = await sql`
        update users
        set company_name = ${companyName || businessName || null},
            first_name = ${firstName || null}, last_name = ${lastName || null}, business_name = ${businessName || null},
            phone = ${phone}, address_line = ${addressLine}, city = ${city},
            region_code = ${regionCode}, postal_code = ${formattedPostal},
            website = ${website || null}, social_url = ${socialUrl || null}
        where id = ${userId}
        returning *
      `;
      res.status(200).json(serializeUser(user));
    } catch (err) {
      console.error('Profile update error:', err);
      res.status(500).json({ error: 'Internal error — the accounts database may not be reachable yet.' });
    }
    return;
  }

  res.status(404).json({ error: 'Not found' });
}
