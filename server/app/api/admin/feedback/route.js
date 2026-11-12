import { requireUser } from '../../../../lib/auth.js';
import { sql } from '../../../../lib/db.js';
import { json, route } from '../../../../lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/feedback?status=open|resolved|all (developers only). open = new + read */
export const GET = route(async (request) => {
  await requireUser(request, { developer: true });
  const status = new URL(request.url).searchParams.get('status') || 'open';
  const statuses = status === 'resolved' ? ['resolved'] : status === 'all' ? ['new', 'read', 'resolved'] : ['new', 'read'];

  const items = await sql`
    SELECT f.id, f.message, f.original_text, f.ai_text, f.mode, f.model, f.extension_version, f.rooftop_name,
           f.status, f.created_at, f.resolved_at,
           coalesce(u.name, '') AS user_name, coalesce(u.email, '(deleted user)') AS user_email,
           r.email AS resolved_by
    FROM feedback f
    LEFT JOIN users u ON u.id = f.user_id
    LEFT JOIN users r ON r.id = f.resolved_by
    WHERE f.status = ANY(${statuses}::text[])
    ORDER BY f.created_at DESC
    LIMIT 500`;

  const [counts] = await sql`
    SELECT count(*) FILTER (WHERE status = 'new')::int AS new,
           count(*) FILTER (WHERE status = 'read')::int AS read,
           count(*) FILTER (WHERE status = 'resolved')::int AS resolved
    FROM feedback`;

  return json({ items, counts });
});
