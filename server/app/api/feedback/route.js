import { requireUser } from '../../../lib/auth.js';
import { sql } from '../../../lib/db.js';
import { json, readJson, route, str } from '../../../lib/http.js';
import { modelFor } from '../../../lib/models.js';
import { EXTENSION_VERSION_HEADER } from '../../../lib/version.js';

export const runtime = 'nodejs';

/**
 * POST /api/feedback { message, mode?, rooftopId?, originalText?, aiText? }
 * Feedback from the extension's Enhance/Reply window. originalText is the selected text as sent to
 * the AI (PII already redacted by the extension); both texts are optional (the user can leave them out).
 */
export const POST = route(async (request) => {
  const user = await requireUser(request);
  const body = await readJson(request);

  const message = str(body.message, { field: 'Feedback', max: 2000, required: true });
  const mode = ['enhance', 'response'].includes(body.mode) ? body.mode : null;
  const originalText = str(body.originalText, { field: 'Original text', max: 8000 }) || null;
  const aiText = str(body.aiText, { field: 'Suggestion', max: 8000 }) || null;

  // The store they were working for: the one they picked, else all of their active stores
  const active = user.rooftops.filter((r) => r.active);
  const chosen = active.find((r) => r.id === body.rooftopId);
  const rooftopName = chosen ? chosen.name : (active.map((r) => r.name).join(', ') || null);
  const version = (request.headers.get(EXTENSION_VERSION_HEADER) || '').slice(0, 20) || null;

  const [row] = await sql`
    INSERT INTO feedback (user_id, rooftop_name, mode, model, extension_version, message, original_text, ai_text)
    VALUES (${user.id}, ${rooftopName}, ${mode}, ${modelFor(user)}, ${version}, ${message}, ${originalText}, ${aiText})
    RETURNING id`;
  return json({ ok: true, id: row.id }, { status: 201 });
});
