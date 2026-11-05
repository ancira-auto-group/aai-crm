import { requireUser } from '../../../../lib/auth.js';
import { sql } from '../../../../lib/db.js';
import { HttpError, json, readJson, route } from '../../../../lib/http.js';
import { clearPromptCache, fetchPromptFromUrl, getPrompt, MODES } from '../../../../lib/prompts.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PROMPT_CHARS = 20000;

/** GET /api/admin/prompts - both system prompts */
export const GET = route(async (request) => {
  await requireUser(request, { admin: true });
  for (const mode of MODES) {
    await getPrompt(mode); // Imports the legacy prompt on first use
  }
  const prompts = await sql`
    SELECT p.mode, p.content, p.updated_at, u.email AS updated_by
    FROM prompts p LEFT JOIN users u ON u.id = p.updated_by
    ORDER BY p.mode`;
  return json({ prompts });
});

/**
 * PUT /api/admin/prompts { mode, content } or { mode, importUrl }
 * Changes apply to every user within about a minute.
 */
export const PUT = route(async (request) => {
  const admin = await requireUser(request, { admin: true });
  const body = await readJson(request);

  if (!MODES.includes(body.mode)) {
    throw new HttpError(400, 'Unknown prompt');
  }

  let content;
  if (body.importUrl) {
    let url;
    try {
      url = new URL(body.importUrl);
    } catch {
      throw new HttpError(400, 'Enter a valid URL');
    }
    if (url.protocol !== 'https:') {
      throw new HttpError(400, 'Only https URLs can be imported');
    }
    try {
      content = await fetchPromptFromUrl(url.toString());
    } catch (error) {
      throw new HttpError(502, `Could not import: ${error.message}`);
    }
  } else {
    content = typeof body.content === 'string' ? body.content.trim() : '';
  }

  if (!content) {
    throw new HttpError(400, 'The prompt can\'t be empty');
  }
  if (content.length > MAX_PROMPT_CHARS) {
    throw new HttpError(400, `The prompt is too long (max ${MAX_PROMPT_CHARS} characters)`);
  }

  const [prompt] = await sql`
    INSERT INTO prompts (mode, content, updated_at, updated_by)
    VALUES (${body.mode}, ${content}, now(), ${admin.id})
    ON CONFLICT (mode) DO UPDATE SET content = EXCLUDED.content, updated_at = now(), updated_by = EXCLUDED.updated_by
    RETURNING mode, content, updated_at`;
  clearPromptCache();

  return json({ prompt: { ...prompt, updated_by: admin.email } });
});
