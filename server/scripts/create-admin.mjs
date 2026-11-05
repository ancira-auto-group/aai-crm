// Create the first admin account (or reset an existing account to admin with a new temporary password).
// Usage: DATABASE_URL=... npm run create-admin -- you@example.com "Your Name"
import { generateTempPassword, hashPassword } from '../lib/auth-core.js';
import { closeDb, sql } from '../lib/db.js';

const [email, name = ''] = process.argv.slice(2);
if (!email) {
  console.error('Usage: DATABASE_URL=... npm run create-admin -- <email> ["Name"]');
  process.exit(1);
}

const tempPassword = generateTempPassword();
const hash = await hashPassword(tempPassword);

await sql`
  INSERT INTO users (email, name, role, password_hash, must_change_password)
  VALUES (${email.toLowerCase()}, ${name}, 'admin', ${hash}, true)
  ON CONFLICT (email) DO UPDATE SET role = 'admin', active = true, password_hash = EXCLUDED.password_hash,
    must_change_password = true, failed_logins = 0, locked_until = NULL`;
await closeDb();

console.log(`Admin account ready: ${email.toLowerCase()}`);
console.log(`Temporary password: ${tempPassword}`);
console.log('Sign in at /admin; you will be asked to choose a new password.');
