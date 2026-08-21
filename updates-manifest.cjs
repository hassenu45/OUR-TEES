const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ── helpers ── */

function hashFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function safeResolve(rootDir, relPath) {
  // block path traversal
  const normalized = relPath.replace(/\\/g, '/');
  if (normalized.startsWith('..') || normalized.includes('../')) return null;
  const resolved = path.join(rootDir, normalized);
  // ensure resolved is still inside rootDir
  if (!resolved.startsWith(rootDir)) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}

/* ── expand glob patterns (dir/**, file.ext) to relative posix paths ── */

function expandWebFiles(rootDir, patterns) {
  const files = [];
  for (const pattern of patterns) {
    if (pattern.includes('/**')) {
      // directory glob: "js/**" → walk the dir
      const dir = pattern.replace('/**', '');
      const dirPath = path.join(rootDir, dir);
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) continue;
      walkDir(dirPath, rootDir, files);
    } else {
      // plain file: "admin.html"
      const fp = path.join(rootDir, pattern);
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        files.push(pattern.replace(/\\/g, '/'));
      }
    }
  }
  return files;
}

function walkDir(dir, rootDir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkDir(full, rootDir, out);
    } else if (e.isFile()) {
      const rel = path.relative(rootDir, full).replace(/\\/g, '/');
      out.push(rel);
    }
  }
}

/* ── build manifest for the update feed ── */

function buildManifest(rootDir, version) {
  // read web file list
  let webFiles = [];
  try {
    webFiles = JSON.parse(fs.readFileSync(path.join(rootDir, 'web-files.json'), 'utf8'));
  } catch (_e) {
    // fallback: include all files in rootDir (skip hidden, node_modules, etc.)
    webFiles = ['**'];
  }

  let expanded;
  if (webFiles.length === 1 && webFiles[0] === '**') {
    // walk entire directory
    expanded = [];
    walkDir(rootDir, rootDir, expanded);
    // filter out hidden, node_modules, prisma/migrations, etc.
    expanded = expanded.filter(
      (f) =>
        !f.startsWith('.') &&
        !f.startsWith('node_modules/') &&
        !f.startsWith('prisma/migrations/') &&
        !f.startsWith('desktop/') &&
        !f.startsWith('docs/') &&
        !f.startsWith('tests/') &&
        !f.startsWith('scripts/') &&
        !f.startsWith('generated/') &&
        !f.includes('.test.') &&
        f !== 'package-lock.json' &&
        f !== 'yarn.lock'
    );
  } else {
    expanded = expandWebFiles(rootDir, webFiles);
  }

  // always include VERSION
  if (!expanded.includes('VERSION')) expanded.push('VERSION');

  const files = expanded.map((rel) => {
    const fp = path.join(rootDir, rel);
    const stat = fs.statSync(fp);
    return {
      path: rel,
      sha256: hashFile(fp),
      size: stat.size,
    };
  });

  return { version, files };
}

module.exports = { expandWebFiles, buildManifest, hashFile, safeResolve };
