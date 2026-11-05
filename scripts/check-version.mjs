#!/usr/bin/env node
// Checks that the extension, server and changelog all carry the same MAJOR.MINOR.PATCH version.
// extension/manifest.json is the source of truth. Run: node scripts/check-version.mjs
// With --tag vX.Y.Z (e.g. in a release workflow) it also checks the git tag matches.
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const SEMVER = /^\d+\.\d+\.\d+$/;
const manifest = JSON.parse(read('extension/manifest.json')).version;
const server = JSON.parse(read('server/package.json')).version;
const changelog = read('CHANGELOG.md').match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1];

const problems = [];
if (!SEMVER.test(manifest)) {
  problems.push(`extension/manifest.json version "${manifest}" is not MAJOR.MINOR.PATCH`);
}
if (server !== manifest) {
  problems.push(`server/package.json is ${server}, expected ${manifest}`);
}
if (changelog !== manifest) {
  problems.push(`latest CHANGELOG.md entry is ${changelog || 'missing'}, expected ${manifest}`);
}

const tagIndex = process.argv.indexOf('--tag');
if (tagIndex !== -1) {
  const tag = process.argv[tagIndex + 1] || '';
  if (tag !== `v${manifest}`) {
    problems.push(`git tag ${tag || '(none)'} doesn't match v${manifest}`);
  }
}

if (problems.length) {
  console.error('Version check failed:\n- ' + problems.join('\n- '));
  console.error('\nTo release a new version, update all three (see "Versioning" in README.md).');
  process.exit(1);
}
console.log(`Version ${manifest} is consistent`);
