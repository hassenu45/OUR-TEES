import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { isSafeUploadName, resolveUploadPath, deleteUploadedFile } = require('../uploads-manager.cjs');

describe('isSafeUploadName', () => {
  it('accepts multer-style filenames', () => {
    expect(isSafeUploadName('1786825884171-5m8gvwv1bn.png')).toBe(true);
    expect(isSafeUploadName('a.B.png')).toBe(true);
    expect(isSafeUploadName('x_y-1.jpg')).toBe(true);
  });
  it('rejects traversal and separators', () => {
    expect(isSafeUploadName('../secret.png')).toBe(false);
    expect(isSafeUploadName('a/b.png')).toBe(false);
    expect(isSafeUploadName('..')).toBe(false);
    expect(isSafeUploadName('')).toBe(false);
    expect(isSafeUploadName('a\\b.png')).toBe(false);
  });
});

describe('resolveUploadPath', () => {
  it('resolves inside the uploads dir only', () => {
    const dir = 'C:/uploads';
    expect(resolveUploadPath(dir, 'x.png').replace(/\\/g, '/')).toBe(join('C:/uploads', 'x.png').replace(/\\/g, '/'));
    expect(resolveUploadPath(dir, '..\\evil.png')).toBe(null);
    expect(resolveUploadPath(dir, '../../etc/passwd')).toBe(null);
  });
});

describe('deleteUploadedFile', () => {
  let tmp;
  afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('deletes an existing file and reports not-found otherwise', () => {
    tmp = mkdtempSync(join(tmpdir(), 'upmgr-'));
    writeFileSync(join(tmp, 'a.png'), 'x');
    expect(deleteUploadedFile(tmp, 'a.png')).toEqual({ deleted: true });
    expect(existsSync(join(tmp, 'a.png'))).toBe(false);
    expect(deleteUploadedFile(tmp, 'a.png')).toEqual({ deleted: false, reason: 'not-found' });
    expect(deleteUploadedFile(tmp, '../evil')).toEqual({ deleted: false, reason: 'invalid-name' });
  });
});
