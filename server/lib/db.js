// Database access. Production uses Neon's serverless (HTTP) driver.
// For local development against a regular Postgres, set DATABASE_DRIVER=pg (uses the `pg` dev dependency).

let neonClient = null;
let pgPool = null;

function databaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  return process.env.DATABASE_URL;
}

async function pgQuery(text, params) {
  if (!pgPool) {
    const { default: pg } = await import('pg');
    pgPool = new pg.Pool({ connectionString: databaseUrl() });
  }
  const result = await pgPool.query(text, params);
  return result.rows;
}

async function neonQuery(text, params) {
  if (!neonClient) {
    const { neon } = await import('@neondatabase/serverless');
    neonClient = neon(databaseUrl());
  }
  return neonClient.query(text, params);
}

/** Run one statement with $1..$n parameters; resolves to the result rows */
export function query(text, params = []) {
  return process.env.DATABASE_DRIVER === 'pg' ? pgQuery(text, params) : neonQuery(text, params);
}

/**
 * Tagged-template SQL: await sql`select ... where id = ${id}` -> rows
 * Values are always sent as parameters, never interpolated into the query text.
 */
export function sql(strings, ...values) {
  const text = strings.reduce((acc, part, i) => acc + `$${i}` + part);
  return query(text, values);
}

/** Close the local pg pool so scripts can exit (no-op for Neon) */
export async function closeDb() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}
