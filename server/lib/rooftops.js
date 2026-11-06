import { sql } from './db.js';
import { HttpError } from './http.js';

/** A user's rooftops as [{ id, name, active }], sorted by name */
export async function getUserRooftops(userId) {
  return sql`
    SELECT r.id, r.name, r.active
    FROM user_rooftops ur JOIN rooftops r ON r.id = ur.rooftop_id
    WHERE ur.user_id = ${userId}
    ORDER BY r.name`;
}

/**
 * Normalize rooftop ids from an admin form: accepts rooftopIds (array) or the older rooftopId.
 * Returns undefined when the request doesn't mention rooftops at all.
 */
export function rooftopIdsFrom(body) {
  let ids;
  if (Array.isArray(body.rooftopIds)) {
    ids = body.rooftopIds;
  } else if (body.rooftopId !== undefined) {
    ids = body.rooftopId === '' || body.rooftopId === null ? [] : [body.rooftopId];
  } else {
    return undefined;
  }
  const numbers = ids.map(Number);
  if (!numbers.every((n) => Number.isInteger(n) && n > 0)) {
    throw new HttpError(400, 'Invalid rooftop');
  }
  return [...new Set(numbers)];
}

/** Throw unless every id is an existing rooftop */
export async function assertRooftopsExist(ids) {
  if (ids.length === 0) {
    return;
  }
  const [{ found }] = await sql`SELECT count(*)::int AS found FROM rooftops WHERE id = ANY(${ids}::int[])`;
  if (found !== ids.length) {
    throw new HttpError(400, 'Rooftop not found');
  }
}

/** Replace a user's rooftop assignments with exactly these ids (one atomic statement) */
export async function setUserRooftops(userId, ids) {
  await sql`
    WITH removed AS (
      DELETE FROM user_rooftops WHERE user_id = ${userId} AND rooftop_id <> ALL(${ids}::int[])
    )
    INSERT INTO user_rooftops (user_id, rooftop_id)
    SELECT ${userId}, unnest(${ids}::int[])
    ON CONFLICT DO NOTHING`;
}

/**
 * Record which rooftops a request counts toward: split evenly across the user's active rooftops.
 * A user with no active rooftop (an admin, for example) leaves the request unassigned.
 */
export async function attributeUsage(eventId, rooftops) {
  const active = rooftops.filter((r) => r.active).map((r) => r.id);
  if (active.length === 0) {
    return;
  }
  const share = 1 / active.length;
  await sql`
    INSERT INTO usage_event_rooftops (event_id, rooftop_id, share)
    SELECT ${eventId}, unnest(${active}::int[]), ${share}`;
}
