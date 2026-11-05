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

  const byRooftop = await sql`
    SELECT e.rooftop_id, coalesce(r.name, 'Unassigned') AS rooftop,
           count(*) FILTER (WHERE e.status = 'ok')::int AS requests,
           count(*) FILTER (WHERE e.status = 'ok' AND e.mode = 'enhance')::int AS enhance,
           count(*) FILTER (WHERE e.status = 'ok' AND e.mode = 'response')::int AS response,
           coalesce(sum(e.input_tokens + e.output_tokens), 0)::bigint AS tokens,
           coalesce(sum(e.cost_usd), 0)::float AS cost_usd,
           count(DISTINCT e.user_id)::int AS active_users
    FROM usage_events e LEFT JOIN rooftops r ON r.id = e.rooftop_id
    WHERE (e.created_at AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY e.rooftop_id, r.name
    ORDER BY requests DESC`;

  const byUser = await sql`
    SELECT e.user_id, coalesce(u.name, '') AS name, coalesce(u.email, '(deleted user)') AS email,
           coalesce(r.name, 'Unassigned') AS rooftop,
           count(*) FILTER (WHERE e.status = 'ok')::int AS requests,
           count(*) FILTER (WHERE e.status = 'ok' AND e.mode = 'enhance')::int AS enhance,
           count(*) FILTER (WHERE e.status = 'ok' AND e.mode = 'response')::int AS response,
           coalesce(sum(e.input_tokens + e.output_tokens), 0)::bigint AS tokens,
           coalesce(sum(e.cost_usd), 0)::float AS cost_usd,
           max(e.created_at) AS last_used
    FROM usage_events e
    LEFT JOIN users u ON u.id = e.user_id
    LEFT JOIN rooftops r ON r.id = e.rooftop_id
    WHERE (e.created_at AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY e.user_id, u.name, u.email, e.rooftop_id, r.name
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
  num(byRooftop, 'tokens');
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
