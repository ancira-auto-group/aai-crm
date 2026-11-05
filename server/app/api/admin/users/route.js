import { generateTempPassword, hashPassword, requireUser } from '../../../../lib/auth.js';
import { sql } from '../../../../lib/db.js';
import { HttpError, json, readJson, route, str } from '../../../../lib/http.js';
import { modelList } from '../../../../lib/models.js';
import { checkUserFields } from './validate.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/users - all users, plus the model list for the edit form */
export const GET = route(async (request) => {
  await requireUser(request, { admin: true });
  const users = await sql`
    SELECT u.id, u.email, u.name, u.role, u.rooftop_id, r.name AS rooftop_name, u.model, u.active,
           u.must_change_password, u.created_at, u.last_active_at,
           (u.locked_until IS NOT NULL AND u.locked_until > now()) AS locked
    FROM users u LEFT JOIN rooftops r ON r.id = u.rooftop_id
    ORDER BY u.active DESC, r.name NULLS FIRST, u.name, u.email`;
  return json({ users, models: modelList() });
});

/**
 * POST /api/admin/users { email, name, role, rooftopId, model }
 * Returns a temporary password to hand to the user; they must change it on first sign-in.
 */
export const POST = route(async (request) => {
  await requireUser(request, { admin: true });
  const body = await readJson(request);

  const email = str(body.email, { field: 'Email', max: 254, required: true }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid email address');
  }
  const name = str(body.name, { field: 'Name', max: 100 });
  const { role, rooftopId, model } = await checkUserFields(body);

  const tempPassword = generateTempPassword();
  const [user] = await sql`
    INSERT INTO users (email, name, role, rooftop_id, model, password_hash, must_change_password)
    VALUES (${email}, ${name}, ${role}, ${rooftopId}, ${model}, ${await hashPassword(tempPassword)}, true)
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email`;
  if (!user) {
    throw new HttpError(409, `A user with email ${email} already exists`);
  }

  return json({ user, tempPassword }, { status: 201 });
});
