// Fixes extensionless relative imports in the generated Prisma client
// (Node's ESM loader does not resolve `./enums` -> `./enums.ts`).
// Run after `prisma generate`.
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'generated', 'prisma');

function walk(d) {
  const out = [];
  for (const name of readdirSync(d, { withFileTypes: true })) {
    const full = join(d, name.name);
    if (name.isDirectory()) out.push(...walk(full));
    else if (name.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

let changed = 0;
for (const file of walk(dir)) {
  const src = readFileSync(file, 'utf8');
  const fixed = src.replace(/(from\s+['"])(\.{1,2}\/[^'"]+?)(['"])/g, (m, pre, spec, post) => {
    if (spec.endsWith('.ts') || spec.endsWith('.js')) return m;
    return pre + spec + '.ts' + post;
  });
  if (fixed !== src) {
    writeFileSync(file, fixed);
    changed++;
    console.log('fixed', file);
  }
}
console.log('prisma import fix done, files changed:', changed);
