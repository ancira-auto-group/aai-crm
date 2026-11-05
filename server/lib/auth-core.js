// Password hashing with no framework dependencies (shared by the API and scripts/create-admin.mjs)
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);


// scrypt parameters (N = CPU/memory cost). Stored with each hash so they can be raised later.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, saltB64, hashB64] = (stored || '').split('$');
  if (scheme !== 'scrypt') {
    return false;
  }
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p)
  });
  return crypto.timingSafeEqual(actual, expected);
}

// Used to spend the same time on unknown emails as on wrong passwords
export const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

/** Readable temporary password for new accounts and resets, e.g. "plum-river-4821-oak" */
export function generateTempPassword() {
  const words = ['amber', 'brook', 'cedar', 'delta', 'ember', 'fern', 'grove', 'harbor', 'iris', 'juniper',
    'kestrel', 'lark', 'maple', 'north', 'oak', 'pine', 'quartz', 'river', 'sage', 'tide', 'umber', 'vale',
    'willow', 'yarrow', 'zephyr', 'plum', 'slate', 'coral', 'birch', 'flint'];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${pick()}-${crypto.randomInt(1000, 10000)}-${pick()}`;
}
