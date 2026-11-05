import { requireUser, revokeAllSessions } from '../../../../../lib/auth.js';
import { sql } from '../../../../../lib/db.js';
import { HttpError, intId, json, readJson, route, str } from '../../../../../lib/http.js';
import { checkUserFields } from '../validate.js';

export const runtime = 'nodejs';

/**
 * PATCH /api/admin/users/:id { name?, role?, rooftopId?, model?, active?, unlock? }
 * Users are disabled rather than deleted so their usage history stays attributed.
 * Disabling a user signs them out everywhere.
 */
export const PATCH = route(async (request, { params }) => {
  const admin = await requireUser(request, { admin: true });
  const id = intId((await params).id);
  const body = await readJson(request);

  const [existing] = await sql`SELECT * FROM users WHERE id = ${id}`;
  if (!existing) {
    throw new HttpError(404, 'User not found');
  }

  const name = body.name === undefined ? existing.name : str(body.name, { field: 'Name', max: 100 });
  const active = typeof body.active === 'boolean' ? body.active : existing.active;
  const { role, rooftopId, model } = await checkUserFields(body, existing);

  if (id === admin.id && (!active || role !== 'admin')) {
    throw new HttpError(400, 'You can\'t disable or demote your own account');
  }

  const [user] = await sql`
    UPDATE users SET
      name = ${name}, role = ${role}, rooftop_id = ${rooftopId}, model = ${model}, active = ${active},
      failed_logins = CASE WHEN ${body.unlock === true} THEN 0 ELSE failed_logins END,
      locked_until = CASE WHEN ${body.unlock === true} THEN NULL ELSE locked_until END
    WHERE id = ${id}
    RETURNING id, email, name, role, rooftop_id, model, active`;

  if (!active) {
    await revokeAllSessions(id);
  }
  return json({ user });
});
