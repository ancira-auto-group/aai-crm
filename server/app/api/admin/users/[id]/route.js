import { requireUser, revokeAllSessions } from '../../../../../lib/auth.js';
import { sql } from '../../../../../lib/db.js';
import { HttpError, intId, json, readJson, route, str } from '../../../../../lib/http.js';
import { getUserRooftops, setUserRooftops } from '../../../../../lib/rooftops.js';
import { checkUserFields } from '../validate.js';

export const runtime = 'nodejs';

/**
 * PATCH /api/admin/users/:id { name?, role?, rooftopIds?, model?, active?, unlock? }
 * Leaving rooftopIds out keeps the current assignments.
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
  const currentRooftops = await getUserRooftops(id);

  const name = body.name === undefined ? existing.name : str(body.name, { field: 'Name', max: 100 });
  const active = typeof body.active === 'boolean' ? body.active : existing.active;
  const { role, rooftopIds, model } = await checkUserFields(body, {
    role: existing.role,
    model: existing.model,
    rooftopIds: currentRooftops.map((r) => r.id)
  });

  if (id === admin.id && (!active || role !== 'admin')) {
    throw new HttpError(400, 'You can\'t disable or demote your own account');
  }

  const [user] = await sql`
    UPDATE users SET
      name = ${name}, role = ${role}, model = ${model}, active = ${active},
      failed_logins = CASE WHEN ${body.unlock === true} THEN 0 ELSE failed_logins END,
      locked_until = CASE WHEN ${body.unlock === true} THEN NULL ELSE locked_until END
    WHERE id = ${id}
    RETURNING id, email, name, role, model, active`;

  if (rooftopIds !== undefined) {
    await setUserRooftops(id, rooftopIds);
  }
  if (!active) {
    await revokeAllSessions(id);
  }
  return json({ user: { ...user, rooftops: await getUserRooftops(id) } });
});
