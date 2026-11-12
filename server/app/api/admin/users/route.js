import { generateTempPassword, hashPassword, requireUser } from '../../../../lib/auth.js';
import { sql } from '../../../../lib/db.js';
import { HttpError, json, readJson, route, str } from '../../../../lib/http.js';
import { modelList } from '../../../../lib/models.js';
import { setUserRooftops } from '../../../../lib/rooftops.js';
import { checkUserFields } from './validate.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/users - all users with their rooftops, plus the model list for the edit form */
export const GET = route(async (request) => {
  await requireUser(request, { admin: true });
  const users = await sql`
    SELECT u.id, u.email, u.name, u.role, u.model, u.active, u.is_developer,
           u.must_change_password, u.created_at, u.last_active_at,
           (u.locked_until IS NOT NULL AND u.locked_until > now()) AS locked,
           coalesce((
             SELECT json_agg(json_build_object('id', r.id, 'name', r.name, 'active', r.active, 'crmName', r.crm_name) ORDER BY r.name)
             FROM user_rooftops ur JOIN rooftops r ON r.id = ur.rooftop_id
             WHERE ur.user_id = u.id
           ), '[]'::json) AS rooftops
    FROM users u
    ORDER BY u.active DESC, lower(coalesce(nullif(u.name, ''), u.email))`;
  return json({ users, models: modelList() });
});

/**
 * POST /api/admin/users { email, name, role, rooftopIds, model, isDeveloper }
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
  const { role, rooftopIds, model } = await checkUserFields(body);

  const tempPassword = generateTempPassword();
  const [user] = await sql`
    INSERT INTO users (email, name, role, model, is_developer, password_hash, must_change_password)
    VALUES (${email}, ${name}, ${role}, ${model}, ${role === 'admin' && body.isDeveloper === true},
            ${await hashPassword(tempPassword)}, true)
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email`;
  if (!user) {
    throw new HttpError(409, `A user with email ${email} already exists`);
  }
  await setUserRooftops(user.id, rooftopIds ?? []);

  return json({ user, tempPassword }, { status: 201 });
});
