# Platform administration access

The legacy `developer` role and its cross-tenant ownership bypasses have been removed.

Normal accounts use the `owner` role and can access only their own tenant data. Platform administration uses the `superadmin` role, bootstrapped from the server-side `SUPERADMIN_EMAILS` environment variable. Removing an address from that variable does not silently demote an existing SuperAdmin.

SuperAdmin operations are available only through dedicated, capability-checked `/api/superadmin/*` routes. The application does not support tenant impersonation, tenant switching, or an `asOwner` query parameter.

SuperAdmin diagnostics use explicit privacy-safe projections. They must not return customer names, customer addresses, project designs, measurements, pricing, attachments, or reports.

Never store administrator credentials, `AUTH_SECRET`, database URLs, provider tokens, or customer data in this repository.
