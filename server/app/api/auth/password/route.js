import {
  hashPassword, requireUser, revokeAllSessions, validateNewPassword, verifyPassword
} from '../../../../lib/auth.js';
import { sql } from '../../../../lib/db.js';
import { HttpError, json, readJson, route } from '../../../../lib/http.js';

export const runtime = 'nodejs';

/**
 * POST /api/auth/password  { currentPassword, newPassword }
 * Also used to replace the temporary password an admin hands out.
 * Signs out the user's other sessions.
 */
export const POST = route(async (request) => {
  const user = await requireUser(request, { allowPasswordChange: true });
  const body = await readJson(request);

  const [row] = await sql`SELECT password_hash FROM users WHERE id = ${user.id}`;
  if (!(await verifyPassword(String(body.currentPassword || ''), row.password_hash))) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  validateNewPassword(body.newPassword);
  if (body.newPassword === body.currentPassword) {
    throw new HttpError(400, 'Choose a password different from the current one');
  }

  await sql`
    UPDATE users SET password_hash = ${await hashPassword(body.newPassword)}, must_change_password = false
    WHERE id = ${user.id}`;
  await revokeAllSessions(user.id, { exceptToken: user.token });

  return json({ ok: true });
});
