import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const dest = path.resolve(__dirname, '..', 'web');
const list = JSON.parse(fs.readFileSync(path.join(root, 'web-files.json'), 'utf8'));

function walkDir(absDir, relPrefix, out) {
  for (const name of fs.readdirSync(absDir)) {
    const abs = path.join(absDir, name);
    const rel = relPrefix + '/' + name;
    if (fs.statSync(abs).isDirectory()) walkDir(abs, rel, out);
    else out.push(rel);
  }
}

function expand(entry) {
  if (entry.endsWith('/**')) {
    const base = entry.slice(0, -3);
    const absBase = path.join(root, base);
    if (!fs.existsSync(absBase)) return [];
    const out = [];
    walkDir(absBase, base, out);
    return out;
  }
  return fs.existsSync(path.join(root, entry)) ? [entry] : [];
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

const files = [];
for (const entry of list) files.push(...expand(entry));

for (const rel of files) {
  const src = path.join(root, rel);
  const tgt = path.join(dest, rel);
  fs.mkdirSync(path.dirname(tgt), { recursive: true });
  fs.copyFileSync(src, tgt);
}

if (fs.existsSync(path.join(root, 'VERSION'))) {
  fs.copyFileSync(path.join(root, 'VERSION'), path.join(dest, 'VERSION'));
}

console.log(`Built ${files.length} web files → desktop/web`);