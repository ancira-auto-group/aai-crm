import { requireUser } from '../../../../../lib/auth.js';
import { sql } from '../../../../../lib/db.js';
import { HttpError, intId, json, readJson, route, str } from '../../../../../lib/http.js';

export const runtime = 'nodejs';

/**
 * PATCH /api/admin/rooftops/:id { name?, crmName?, active? }
 * Rooftops are disabled rather than deleted so their usage history stays intact.
 */
export const PATCH = route(async (request, { params }) => {
  await requireUser(request, { admin: true });
  const id = intId((await params).id);
  const body = await readJson(request);

  const [existing] = await sql`SELECT * FROM rooftops WHERE id = ${id}`;
  if (!existing) {
    throw new HttpError(404, 'Rooftop not found');
  }

  const name = body.name === undefined ? existing.name : str(body.name, { field: 'Name', max: 100, required: true });
  const active = typeof body.active === 'boolean' ? body.active : existing.active;
  const crmName = body.crmName === undefined
    ? existing.crm_name
    : (str(body.crmName, { field: 'VinSolutions name', max: 150 }) || null);

  const [clash] = await sql`SELECT id FROM rooftops WHERE name = ${name} AND id <> ${id}`;
  if (clash) {
    throw new HttpError(409, `A rooftop named "${name}" already exists`);
  }

  const [rooftop] = await sql`
    UPDATE rooftops SET name = ${name}, crm_name = ${crmName}, active = ${active} WHERE id = ${id} RETURNING *`;
  return json({ rooftop });
});
