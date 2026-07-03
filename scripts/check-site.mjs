/*
 * Lightweight production checks - run by CI (.github/workflows/ci.yml)
 * and locally via `node scripts/check-site.mjs`.
 *
 * Deliberately dependency-free:
 *  1. Syntax-check every JS module with node's parser.
 *  2. Verify every local href/src referenced by index.html exists.
 *  3. Validate data/market-weather.json shape.
 *  4. A few sanity greps (canonical URL, module entry point).
 */

import { readFile, readdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const fail = msg => { failures++; console.error(`  ✗ ${msg}`); };
const ok = msg => console.log(`  ✓ ${msg}`);

async function* walk(dir) {
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(rel);
    else yield rel;
  }
}

console.log('1. JS syntax checks');
for await (const file of walk('src')) {
  if (!file.endsWith('.js')) continue;
  const res = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  if (res.status === 0) ok(file);
  else fail(`${file}\n${res.stderr}`);
}
for await (const file of walk('scripts')) {
  if (!file.endsWith('.mjs')) continue;
  const res = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  if (res.status === 0) ok(file);
  else fail(`${file}\n${res.stderr}`);
}

console.log('2. index.html local references');
const html = await readFile(join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map(m => m[1])
  .filter(u => !/^(https?:|mailto:|#|data:)/.test(u));
for (const ref of new Set(refs)) {
  try {
    await access(join(root, ref.split('?')[0]));
    ok(ref);
  } catch {
    fail(`index.html references missing file: ${ref}`);
  }
}

console.log('3. market-weather.json shape');
try {
  const feed = JSON.parse(await readFile(join(root, 'data/market-weather.json'), 'utf8'));
  if (!feed.updatedAt || Number.isNaN(new Date(feed.updatedAt).getTime())) fail('updatedAt missing/invalid');
  else ok('updatedAt is a valid timestamp');
  if (!Number.isFinite(feed.market?.compositeChangePct)) fail('market.compositeChangePct missing');
  else ok('compositeChangePct present');
  if (!Array.isArray(feed.market?.quotes) || !feed.market.quotes.length) fail('market.quotes missing');
  else ok(`quotes: ${feed.market.quotes.map(q => q.symbol).join(', ')}`);
} catch (e) {
  fail(`could not parse data/market-weather.json: ${e.message}`);
}

console.log('4. sanity greps');
if (html.includes('rel="canonical"')) ok('canonical URL present'); else fail('canonical URL missing');
if (html.includes('src/main.js')) ok('module entry point wired'); else fail('src/main.js not referenced');
if (html.includes('og:title')) ok('Open Graph tags present'); else fail('Open Graph tags missing');

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
