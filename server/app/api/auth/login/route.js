import { checkCredentials, createSession, publicUser, SESSION_COOKIE } from '../../../../lib/auth.js';
import { sql } from '../../../../lib/db.js';
import { json, readJson, route, str } from '../../../../lib/http.js';
import { checkExtensionVersion } from '../../../../lib/version.js';

export const runtime = 'nodejs';

/**
 * POST /api/auth/login  { email, password, client: 'extension' | 'web' }
 * The extension gets a bearer token in the body; the admin page gets an httpOnly cookie instead.
 */
export const POST = route(async (request) => {
  checkExtensionVersion(request);
  const body = await readJson(request);
  const email = str(body.email, { field: 'Email', max: 254, required: true }).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const client = body.client === 'web' ? 'web' : 'extension';

  const user = await checkCredentials(email, password);
  const { token, maxAgeSeconds } = await createSession(user.id, client);

  const [full] = await sql`
    SELECT u.*, r.name AS rooftop_name FROM users u LEFT JOIN rooftops r ON r.id = u.rooftop_id
    WHERE u.id = ${user.id}`;

  if (client === 'web') {
    const response = json({ user: publicUser(full) });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: maxAgeSeconds
    });
    return response;
  }

  return json({ token, user: publicUser(full) });
});
