import { requireUser } from '../../../lib/auth.js';
import { sql } from '../../../lib/db.js';
import { HttpError, json, readJson, route } from '../../../lib/http.js';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/outcome { requestId, outcome?: 'used'|'discarded', edited?: boolean, rating?: -1|0|1 }
 * What happened to a result the user was shown. Fields left out keep their value; rating 0 clears it.
 * Only the person who generated the result can report on it.
 */
export const POST = route(async (request) => {
  const user = await requireUser(request);
  const body = await readJson(request);

  if (typeof body.requestId !== 'string' || !UUID.test(body.requestId)) {
    throw new HttpError(400, 'Invalid request id');
  }
  const outcome = ['used', 'discarded'].includes(body.outcome) ? body.outcome : null;
  const edited = typeof body.edited === 'boolean' ? body.edited : null;
  const hasRating = [-1, 0, 1].includes(body.rating);
  const rating = body.rating === 1 || body.rating === -1 ? body.rating : null;

  const rows = await sql`
    INSERT INTO result_outcomes (request_id, user_id, outcome, edited, rating)
    VALUES (${body.requestId}, ${user.id}, ${outcome}, ${edited}, ${rating})
    ON CONFLICT (request_id) DO UPDATE SET
      outcome = coalesce(EXCLUDED.outcome, result_outcomes.outcome),
      edited = coalesce(EXCLUDED.edited, result_outcomes.edited),
      rating = CASE WHEN ${hasRating} THEN EXCLUDED.rating ELSE result_outcomes.rating END,
      updated_at = now()
    WHERE result_outcomes.user_id = EXCLUDED.user_id
    RETURNING request_id`;
  if (rows.length === 0) {
    throw new HttpError(404, 'Result not found');
  }
  return json({ ok: true });
});
