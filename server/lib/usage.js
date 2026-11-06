import { sql } from './db.js';
import { HttpError } from './http.js';

// Reports group days and months in this time zone
export const REPORT_TIMEZONE = process.env.REPORT_TIMEZONE || 'America/Chicago';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function localDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TIMEZONE }).format(date); // YYYY-MM-DD
}

/** Default range: first of this month through today, in the report time zone */
export function parseRange(searchParams) {
  const today = localDate(new Date());
  const from = searchParams.get('from') || `${today.slice(0, 8)}01`;
  const to = searchParams.get('to') || today;
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    throw new HttpError(400, 'Invalid date range');
  }
  return { from, to };
}

/**
 * Usage totals for an inclusive local-date range, broken down by rooftop, user and day.
 * Cancelled and failed requests are counted separately and excluded from token and cost totals
 * (they are near zero anyway).
 */
export async function usageReport({ from, to }) {
  const tz = REPORT_TIMEZONE;

  const [totals] = await sql`
    SELECT count(*) FILTER (WHERE status = 'ok')::int AS requests,
           count(*) FILTER (WHERE status <> 'ok')::int AS failed,
           coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
           coalesce(sum(output_tokens), 0)::bigint AS output_tokens,
           coalesce(sum(cost_usd), 0)::float AS cost_usd,
           count(DISTINCT user_id)::int AS active_users
    FROM usage_events
    WHERE (created_at AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date`;

  // Requests from users with several rooftops are split evenly (usage_event_rooftops.share),
  // so these counts can be fractional and the rooftop rows add up to the overall totals.
  const byRooftop = await sql`
    SELECT * FROM (
      SELECT r.id AS rooftop_id, r.name AS rooftop,
             coalesce(sum(s.share) FILTER (WHERE e.status = 'ok'), 0)::float AS requests,
             coalesce(sum(s.share) FILTER (WHERE e.status = 'ok' AND e.mode = 'enhance'), 0)::float AS enhance,
             coalesce(sum(s.share) FILTER (WHERE e.status = 'ok' AND e.mode = 'response'), 0)::float AS response,
             coalesce(sum((e.input_tokens + e.output_tokens) * s.share), 0)::float AS tokens,
             coalesce(sum(e.cost_usd * s.share), 0)::float AS cost_usd,
             count(DISTINCT e.user_id)::int AS active_users
      FROM usage_event_rooftops s
      JOIN usage_events e ON e.id = s.event_id
      JOIN rooftops r ON r.id = s.rooftop_id
      WHERE (e.created_at AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
      GROUP BY r.id, r.name

      UNION ALL

      -- Requests from users with no active rooftop (e.g. admins)
      SELECT NULL, 'Unassigned',
             count(*) FILTER (WHERE e.status = 'ok')::float,
             count(*) FILTER (WHERE e.status = 'ok' AND e.mode = 'enhance')::float,
             count(*) FILTER (WHERE e.status = 'ok' AND e.mode = 'response')::float,
             coalesce(sum(e.input_tokens + e.output_tokens), 0)::float,
             coalesce(sum(e.cost_usd), 0)::float,
             count(DISTINCT e.user_id)::int
      FROM usage_events e
      WHERE (e.created_at AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
        AND NOT EXISTS (SELECT 1 FROM usage_event_rooftops s WHERE s.event_id = e.id)
      HAVING count(*) > 0
    ) rows
    ORDER BY requests DESC, rooftop`;

  // One row per user with their full totals; rooftops lists every rooftop their requests counted toward
  const byUser = await sql`
    SELECT e.user_id, coalesce(u.name, '') AS name, coalesce(u.email, '(deleted user)') AS email,
           coalesce((
             SELECT array_agg(DISTINCT r.name ORDER BY r.name)
             FROM usage_events e2
             JOIN usage_event_rooftops s ON s.event_id = e2.id
             JOIN rooftops r ON r.id = s.rooftop_id
             WHERE e2.user_id IS NOT DISTINCT FROM e.user_id
               AND (e2.created_at AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
           ), ARRAY[]::text[]) AS rooftops,
           count(*) FILTER (WHERE e.status = 'ok')::int AS requests,
           count(*) FILTER (WHERE e.status = 'ok' AND e.mode = 'enhance')::int AS enhance,
           count(*) FILTER (WHERE e.status = 'ok' AND e.mode = 'response')::int AS response,
           coalesce(sum(e.input_tokens + e.output_tokens), 0)::bigint AS tokens,
           coalesce(sum(e.cost_usd), 0)::float AS cost_usd,
           max(e.created_at) AS last_used
    FROM usage_events e
    LEFT JOIN users u ON u.id = e.user_id
    WHERE (e.created_at AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY e.user_id, u.name, u.email
    ORDER BY requests DESC`;

  const byDay = await sql`
    SELECT to_char((created_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
           count(*) FILTER (WHERE status = 'ok')::int AS requests,
           coalesce(sum(cost_usd), 0)::float AS cost_usd
    FROM usage_events
    WHERE (created_at AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY 1 ORDER BY 1`;

  // bigint comes back as a string; these totals fit comfortably in a JS number
  const num = (rows, key) => rows.forEach((row) => { row[key] = Number(row[key]); });
  num([totals], 'input_tokens');
  num([totals], 'output_tokens');
  num(byUser, 'tokens');

  return { from, to, timezone: tz, totals, byRooftop, byUser, byDay };
}

/** One user's successful requests and estimated cost so far this month (report time zone) */
export async function userMonthUsage(userId) {
  const tz = REPORT_TIMEZONE;
  const [usage] = await sql`
    SELECT count(*)::int AS requests, coalesce(sum(cost_usd), 0)::float AS cost_usd
    FROM usage_events
    WHERE user_id = ${userId} AND status = 'ok'
      AND created_at >= (date_trunc('month', now() AT TIME ZONE ${tz}) AT TIME ZONE ${tz})`;
  return usage;
}
