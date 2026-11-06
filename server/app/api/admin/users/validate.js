import { HttpError } from '../../../../lib/http.js';
import { MODELS } from '../../../../lib/models.js';
import { assertRooftopsExist, rooftopIdsFrom } from '../../../../lib/rooftops.js';

/**
 * Validate role / rooftops / model from an admin user form.
 * Regular users need at least one rooftop so their usage is attributed; admins may have none.
 * model: '' or null means "use the server default".
 * existing: { role, model, rooftopIds } for an update, or {} for a new user.
 * Returns rooftopIds: the new set of rooftops, or undefined to leave assignments unchanged.
 */
export async function checkUserFields(body, existing = {}) {
  const role = body.role === undefined ? (existing.role || 'user') : body.role;
  if (!['user', 'admin'].includes(role)) {
    throw new HttpError(400, 'Invalid role');
  }

  const rooftopIds = rooftopIdsFrom(body);
  const effective = rooftopIds ?? existing.rooftopIds ?? [];
  if (rooftopIds !== undefined) {
    await assertRooftopsExist(rooftopIds);
  }
  if (role === 'user' && effective.length === 0) {
    throw new HttpError(400, 'Choose at least one rooftop for this user');
  }

  let model = body.model === undefined ? (existing.model ?? null) : body.model;
  model = model || null;
  if (model !== null && !MODELS[model]) {
    throw new HttpError(400, 'Unknown model');
  }

  return { role, rooftopIds, model };
}
