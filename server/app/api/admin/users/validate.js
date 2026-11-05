import { sql } from '../../../../lib/db.js';
import { HttpError } from '../../../../lib/http.js';
import { MODELS } from '../../../../lib/models.js';

/**
 * Validate role / rooftop / model from an admin user form.
 * Regular users need a rooftop so their usage is attributed; admins may have none.
 * model: '' or null means "use the server default".
 */
export async function checkUserFields(body, existing = {}) {
  const role = body.role === undefined ? (existing.role || 'user') : body.role;
  if (!['user', 'admin'].includes(role)) {
    throw new HttpError(400, 'Invalid role');
  }

  let rooftopId = body.rooftopId === undefined ? (existing.rooftop_id ?? null) : body.rooftopId;
  rooftopId = rooftopId === '' || rooftopId === null ? null : Number(rooftopId);
  if (rooftopId !== null) {
    const [rooftop] = await sql`SELECT id FROM rooftops WHERE id = ${rooftopId}`;
    if (!rooftop) {
      throw new HttpError(400, 'Rooftop not found');
    }
  } else if (role === 'user') {
    throw new HttpError(400, 'Choose a rooftop for this user');
  }

  let model = body.model === undefined ? (existing.model ?? null) : body.model;
  model = model || null;
  if (model !== null && !MODELS[model]) {
    throw new HttpError(400, 'Unknown model');
  }

  return { role, rooftopId, model };
}
