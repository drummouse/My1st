import { sql } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const startedAt = Date.now();

  try {
    await sql`select 1 as ok`;

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      service: 'ironwrap-configurator',
      database: 'reachable',
      environment: process.env.VERCEL_ENV || 'local',
      gitBranch: process.env.VERCEL_GIT_COMMIT_REF || null,
      gitCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
      responseMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({
      ok: false,
      service: 'ironwrap-configurator',
      database: 'unreachable',
      environment: process.env.VERCEL_ENV || 'local',
      gitBranch: process.env.VERCEL_GIT_COMMIT_REF || null,
      responseMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  }
}
