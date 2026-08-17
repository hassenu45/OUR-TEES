import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { expandWebFiles, buildManifest, hashFile, safeResolve } = require('../updates-manifest.cjs');

let tmpDir;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'));
  fs.mkdirSync(path.join(tmpDir, 'js'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'assets', 'css'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'admin.html'), '<html>admin</html>');
  fs.writeFileSync(path.join(tmpDir, 'js', 'api.js'), 'export {}');
  fs.writeFileSync(path.join(tmpDir, 'assets', 'css', 'design-tokens.css'), ':root{}');
  fs.writeFileSync(path.join(tmpDir, 'VERSION'), '1.0.0');
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('expandWebFiles', () => {
  it('expands dir/** globs to relative posix paths', () => {
    const files = expandWebFiles(tmpDir, ['admin.html', 'js/**', 'assets/**']).sort();
    expect(files).toEqual(['admin.html', 'assets/css/design-tokens.css', 'js/api.js']);
  });
});

describe('hashFile', () => {
  it('returns a 64-char hex sha256', () => {
    expect(hashFile(path.join(tmpDir, 'admin.html'))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildManifest', () => {
  it('builds a manifest with version, path, sha256 and size', () => {
    const m = buildManifest(tmpDir, '1.0.0');
    expect(m.version).toBe('1.0.0');
    const admin = m.files.find((f) => f.path === 'admin.html');
    expect(admin).toBeDefined();
    expect(admin.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(admin.size).toBe('<html>admin</html>'.length);
  });
});

describe('safeResolve', () => {
  it('resolves a normal relative path inside rootDir', () => {
    expect(safeResolve(tmpDir, 'js/api.js')).toBe(path.join(tmpDir, 'js', 'api.js'));
  });
  it('returns null for path traversal', () => {
    expect(safeResolve(tmpDir, '../evil.js')).toBeNull();
    expect(safeResolve(tmpDir, '..\\evil.js')).toBeNull();
  });
});

describe('readVersion', () => {
  it('reads the VERSION file from root', () => {
    const { readVersion } = require('../server-version.cjs');
    const expected = fs
      .readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'VERSION'), 'utf8')
      .trim();
    expect(readVersion()).toBe(expected);
  });
});
