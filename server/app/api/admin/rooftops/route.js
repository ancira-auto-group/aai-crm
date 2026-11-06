import { requireUser } from '../../../../lib/auth.js';
import { sql } from '../../../../lib/db.js';
import { HttpError, json, readJson, route, str } from '../../../../lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/rooftops - all rooftops with user counts */
export const GET = route(async (request) => {
  await requireUser(request, { admin: true });
  const rooftops = await sql`
    SELECT r.id, r.name, r.active, r.created_at,
           count(u.id) FILTER (WHERE u.active)::int AS active_users,
           count(u.id)::int AS total_users
    FROM rooftops r
    LEFT JOIN user_rooftops ur ON ur.rooftop_id = r.id
    LEFT JOIN users u ON u.id = ur.user_id
    GROUP BY r.id ORDER BY r.name`;
  return json({ rooftops });
});

/** POST /api/admin/rooftops { name } */
export const POST = route(async (request) => {
  await requireUser(request, { admin: true });
  const body = await readJson(request);
  const name = str(body.name, { field: 'Name', max: 100, required: true });

  const [rooftop] = await sql`
    INSERT INTO rooftops (name) VALUES (${name}) ON CONFLICT (name) DO NOTHING RETURNING *`;
  if (!rooftop) {
    throw new HttpError(409, `A rooftop named "${name}" already exists`);
  }
  return json({ rooftop }, { status: 201 });
});
