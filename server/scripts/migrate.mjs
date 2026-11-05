// Apply db/schema.sql to DATABASE_URL. Every statement is idempotent, so this is safe to re-run.
// Usage: DATABASE_URL=... npm run migrate
import { readFile } from 'node:fs/promises';
import { closeDb, query } from '../lib/db.js';

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');

const statements = schema
  .replace(/--.*$/gm, '')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

for (const statement of statements) {
  await query(statement);
}
await closeDb();
console.log(`Applied ${statements.length} schema statements`);
