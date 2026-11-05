import { generateTempPassword, hashPassword, requireUser, revokeAllSessions } from '../../../../../../lib/auth.js';
import { sql } from '../../../../../../lib/db.js';
import { HttpError, intId, json, route } from '../../../../../../lib/http.js';

export const runtime = 'nodejs';

/**
 * POST /api/admin/users/:id/reset-password
 * Sets a new temporary password, signs the user out everywhere, and unlocks the account.
 */
export const POST = route(async (request, { params }) => {
  await requireUser(request, { admin: true });
  const id = intId((await params).id);

  const tempPassword = generateTempPassword();
  const [user] = await sql`
    UPDATE users SET password_hash = ${await hashPassword(tempPassword)}, must_change_password = true,
                     failed_logins = 0, locked_until = NULL
    WHERE id = ${id} RETURNING id, email`;
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  await revokeAllSessions(id);
  return json({ user, tempPassword });
});
