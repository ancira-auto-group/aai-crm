# AAI for CRM server

Next.js app that provides:

- **Accounts**: email/password sign-in for the extension (bearer tokens) and the admin page (httpOnly cookie)
- **OpenAI relay**: `POST /api/generate` streams results using the one server-side OpenAI key, with each user's assigned model
- **Usage tracking**: one `usage_events` row per request, tagged with the user, and split evenly across the user's active rooftops at that time (`usage_event_rooftops`)
- **Admin page** at `/admin`: usage reports, users, rooftops, prompts

Data lives in Neon Postgres (`db/schema.sql`).

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string (pooled) |
| `OPENAI_API_KEY` | Yes | The organization's OpenAI key. Only the server ever sees it. Use a project key with a monthly budget. |
| `DEFAULT_MODEL` | No | Model for users without one assigned: `gpt-6-luna` (default), `gpt-6.1-terra` or `gpt-6.1-sol` |
| `REPORT_TIMEZONE` | No | Time zone for report dates and "this month" (default `America/Chicago`) |
| `MIN_EXTENSION_VERSION` | No | Reject requests from older extension versions, e.g. `3.0.0` |
| `ALLOWED_EXTENSION_IDS` | No | Comma-separated Chrome extension IDs allowed to call the API. If unset, any extension may call it (it still needs a valid sign-in). |
| `OPENAI_BASE_URL` | No | Override the OpenAI API base URL (for testing against a mock) |
| `DATABASE_DRIVER` | No | Set to `pg` to use a regular local Postgres instead of Neon's HTTP driver (local development only) |

## First-time setup

1. **Database**: create the schema (safe to re-run after schema changes):
   ```bash
   DATABASE_URL='postgresql://…' npm run migrate
   ```
2. **First admin**: prints a temporary password, which you change on first sign-in:
   ```bash
   DATABASE_URL='postgresql://…' npm run create-admin -- you@ancira.com "Your Name"
   ```
3. **Deploy to Vercel**: import the repository with **Root Directory** `server`, and set the environment variables above for Production.
4. Add the custom domain (production: `aai-crm.ancira.app`, managed in the Vercel team's DNS), then open `https://aai-crm.ancira.app/admin`, sign in, add rooftops, then add users.
5. Put the deployment's URL in `extension/config.js` (`AAI_DEFAULT_SERVER_URL`) and release the extension.

On first use, the Enhance and Reply prompts are imported from the GitHub Gists the 2.x extension used. If that import fails, built-in defaults are used. Either way, they can be edited or re-imported on the **Prompts** tab.

## Local development

You need Node 20 or later and a Postgres database: a Neon branch, or any local Postgres with `DATABASE_DRIVER=pg`.

```bash
cd server
npm install
export DATABASE_URL='postgresql://…' OPENAI_API_KEY='sk-…'
npm run migrate
npm run create-admin -- you@example.com
npm run dev
```

Then point a development copy of the extension at `http://localhost:3000` (extension settings → **Advanced** → **Server URL**).

## API

All responses are JSON unless noted. Errors look like `{ "error": "message", "code": "optional_code" }`.

| Endpoint | Who | Description |
|---|---|---|
| `POST /api/auth/login` | anyone | `{ email, password, client: 'extension' \| 'web' }` → `{ token, user }` (extension) or a session cookie (web) |
| `POST /api/auth/logout` | signed in | Ends the current session |
| `POST /api/auth/password` | signed in | `{ currentPassword, newPassword }`; signs out other sessions |
| `GET /api/me` | signed in | User (with `rooftops`), model, and this month's usage |
| `POST /api/generate` | signed in | `{ mode: 'enhance' \| 'response', text, additionalContext? }` → server-sent events: `delta`, `done` or `error` |
| `GET /api/admin/usage?from&to` | admin | Totals plus breakdowns by rooftop, user and day |
| `GET, POST /api/admin/users` | admin | List, or create `{ email, name, role, rooftopIds, model }` (returns a temporary password) |
| `PATCH /api/admin/users/:id` | admin | `{ name, role, rooftopIds, model, active, unlock }`; leaving out `rooftopIds` keeps the current rooftops |
| `POST /api/admin/users/:id/reset-password` | admin | New temporary password; signs the user out everywhere |
| `GET, POST /api/admin/rooftops` | admin | List, or create `{ name }` |
| `PATCH /api/admin/rooftops/:id` | admin | `{ name, active }` |
| `GET, PUT /api/admin/prompts` | admin | Read, or update `{ mode, content }` / `{ mode, importUrl }` |

Error codes the extension acts on: `signed_out` and `disabled` (the extension forgets its session), `password_change_required`, and `update_required` (HTTP 426).

## Security notes

- Passwords are hashed with scrypt. Five failed sign-ins lock an account for 15 minutes; admins can unlock it sooner.
- Session tokens are random 256-bit values; only their SHA-256 hash is stored. Extension sessions last 60 days, admin page sessions 1 day. Disabling a user or resetting their password ends all of their sessions.
- The admin page uses a `SameSite=Strict`, httpOnly cookie, and every write requires a JSON body.
- Phone numbers, emails and SSNs are redacted in the browser before text is sent. The server logs token counts, not message text.
