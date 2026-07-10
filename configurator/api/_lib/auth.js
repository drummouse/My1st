import { SignJWT, jwtVerify } from 'jose';

const COOKIE_NAME = 'ironwrap_session';
const SESSION_DAYS = 30;

function secretKey() {
  if (!process.env.AUTH_SECRET) {
    throw new Error('AUTH_SECRET is not set');
  }
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

export async function createSessionCookie(userId) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

// Returns the authenticated user's id, or null if the request has no valid
// session — callers decide whether that's a 401 or just "no owner" (e.g. the
// public single-project GET route stays reachable either way).
export async function getUserId(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.sub || null;
  } catch {
    return null;
  }
}

export async function requireUserId(req, res) {
  const userId = await getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return userId;
}
