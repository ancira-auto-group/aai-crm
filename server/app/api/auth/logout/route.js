import { revokeSession, SESSION_COOKIE, tokenFrom } from '../../../../lib/auth.js';
import { json, route } from '../../../../lib/http.js';

export const runtime = 'nodejs';

/** POST /api/auth/logout - ends the current session (extension token or admin cookie) */
export const POST = route(async (request) => {
  await revokeSession(tokenFrom(request));
  const response = json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
});
