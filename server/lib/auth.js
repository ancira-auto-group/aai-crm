import crypto from 'node:crypto';
import { DUMMY_HASH, generateTempPassword, hashPassword, verifyPassword } from './auth-core.js';
import { sql } from './db.js';
import { HttpError } from './http.js';

export { generateTempPassword, hashPassword, verifyPassword };

export const SESSION_COOKIE = 'aai_session';
const SESSION_DAYS = { extension: 60, web: 1 };
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
export const MIN_PASSWORD_LENGTH = 10;

export function validateNewPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > 200) {
    throw new HttpError(400, 'Password is too long');
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId, client) {
  const token = crypto.randomBytes(32).toString('base64url');
  const days = SESSION_DAYS[client];
  await sql`
    INSERT INTO sessions (user_id, token_hash, client, expires_at)
    VALUES (${userId}, ${hashToken(token)}, ${client}, now() + make_interval(days => ${days}))`;
  // Opportunistic cleanup of expired sessions
  await sql`DELETE FROM sessions WHERE expires_at < now() - interval '7 days'`;
  return { token, maxAgeSeconds: days * 86400 };
}

export async function revokeSession(token) {
  if (token) {
    await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
  }
}

export async function revokeAllSessions(userId, { exceptToken } = {}) {
  const keep = exceptToken ? hashToken(exceptToken) : '';
  await sql`DELETE FROM sessions WHERE user_id = ${userId} AND token_hash <> ${keep}`;
}

/**
 * Check an email/password pair. Returns the user row or throws a 401/423.
 */
export async function checkCredentials(email, password) {
  const [user] = await sql`SELECT * FROM users WHERE email = ${email}`;

  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    throw new HttpError(423, `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`);
  }

  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    if (user) {
      await sql`
        UPDATE users SET
          failed_logins = failed_logins + 1,
          locked_until = CASE WHEN failed_logins + 1 >= ${MAX_FAILED_LOGINS}
                              THEN now() + make_interval(mins => ${LOCKOUT_MINUTES}) ELSE NULL END
        WHERE id = ${user.id}`;
    }
    throw new HttpError(401, 'Incorrect email or password');
  }

  if (!user.active) {
    throw new HttpError(403, 'This account has been disabled. Contact your administrator.');
  }

  await sql`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ${user.id}`;
  return user;
}

export function tokenFrom(request) {
  const header = request.headers.get('authorization') || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return request.cookies?.get(SESSION_COOKIE)?.value || null;
}

/**
 * Resolve the signed-in user for a request.
 * Options:
 *   admin: require role 'admin'
 *   developer: require an admin with the developer flag (Feedback tab)
 *   allowPasswordChange: allow users who still have to replace a temporary password
 */
export async function requireUser(request, { admin = false, developer = false, allowPasswordChange = false } = {}) {
  const token = tokenFrom(request);
  if (!token) {
    throw new HttpError(401, 'Please sign in', 'signed_out');
  }

  const [user] = await sql`
    SELECT u.id, u.email, u.name, u.role, u.model, u.active, u.must_change_password, u.is_developer,
           coalesce((
             SELECT json_agg(json_build_object('id', r.id, 'name', r.name, 'active', r.active, 'crmName', r.crm_name) ORDER BY r.name)
             FROM user_rooftops ur JOIN rooftops r ON r.id = ur.rooftop_id
             WHERE ur.user_id = u.id
           ), '[]'::json) AS rooftops
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()`;

  if (!user) {
    throw new HttpError(401, 'Your session has expired. Please sign in again.', 'signed_out');
  }
  if (!user.active) {
    throw new HttpError(403, 'This account has been disabled. Contact your administrator.', 'disabled');
  }
  // Users keep access while at least one of their rooftops is active
  if (user.role !== 'admin' && user.rooftops.length > 0 && !user.rooftops.some((r) => r.active)) {
    throw new HttpError(403, 'Your rooftop has been disabled. Contact your administrator.', 'disabled');
  }
  if (user.must_change_password && !allowPasswordChange) {
    throw new HttpError(403, 'Please set a new password in the extension settings.', 'password_change_required');
  }
  if ((admin || developer) && user.role !== 'admin') {
    throw new HttpError(403, 'Administrator access required');
  }
  if (developer && !user.is_developer) {
    throw new HttpError(403, 'Developer access required');
  }

  return { ...user, token };
}

/**
 * The user as the extension and admin page see them. user.rooftops comes from requireUser or getUserRooftops.
 * `rooftop` (one object, names joined) is kept for 3.0.0 extensions, which show a single rooftop.
 */
export function publicUser(user) {
  const rooftops = (user.rooftops || []).map(({ id, name, active, crmName }) => ({ id, name, active, crmName: crmName || null }));
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    rooftops,
    rooftop: rooftops.length ? { id: rooftops[0].id, name: rooftops.map((r) => r.name).join(', ') } : null,
    isDeveloper: user.role === 'admin' && !!user.is_developer,
    mustChangePassword: user.must_change_password
  };
}
