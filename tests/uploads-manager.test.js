import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

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

describe('uploads-manager + in-use logic (pure)', () => {
  it('flags names matching a product image URL', () => {
    const products = [{ images: ['/uploads/keep.png'], image: '/uploads/keep.png' }];
    const inUse = (name) => {
      const url = `/uploads/${name}`;
      return products.some((p) => {
        const all = Array.isArray(p.images) && p.images.length ? p.images : p.image ? [p.image] : [];
        return all.some((im) => typeof im === 'string' && im === url);
      });
    };
    expect(inUse('keep.png')).toBe(true);
    expect(inUse('other.png')).toBe(false);
  });
});

describe('print sizing (pure)', () => {
  // نفس الحساب الموجود في 21.html: ws ثابتة + aspect من الصورة
  const computePrintSize = (imgW, imgH, baseWorldSize) => {
    const aspect = imgW && imgH ? imgW / imgH : 1;
    const ws = baseWorldSize;
    return { width: ws, height: ws / aspect };
  };
  it('keeps aspect ratio of the source image', () => {
    expect(computePrintSize(800, 400, 0.42)).toEqual({ width: 0.42, height: 0.21 });
    expect(computePrintSize(400, 800, 0.42).height).toBeCloseTo(0.84);
  });
  it('falls back to square for missing dimensions', () => {
    expect(computePrintSize(0, 0, 0.42)).toEqual({ width: 0.42, height: 0.42 });
  });
});

describe('image url → name extraction', () => {
  const nameFromUrl = (url) => {
    const m = String(url || '').match(/^\/uploads\/([^/?#]+)$/);
    return m ? m[1] : null;
  };
  it('extracts the filename from /uploads urls', () => {
    expect(nameFromUrl('/uploads/1786-a.png')).toBe('1786-a.png');
    expect(nameFromUrl('https://x.com/uploads/a.png')).toBe(null);
    expect(nameFromUrl('/uploads/a.png?x=1')).toBe(null);
    expect(nameFromUrl('data:image/png;base64,xx')).toBe(null);
  });
});

describe('image-compress pure helpers', () => {
  // تحميل js/image-compress.js (سكربت كلاسيكي) في sandbox يحاكي window
  function loadImageCompressPure() {
    const sandbox = { window: {} };
    createContext(sandbox);
    runInContext(readFileSync(require.resolve('../js/image-compress.js'), 'utf8'), sandbox);
    return sandbox.window.imageCompressPure;
  }

  const { pickOutputFormat, targetSize } = loadImageCompressPure();

  it('prefers webp when supported', () => {
    expect(pickOutputFormat(true, 'image/jpeg')).toBe('image/webp');
    expect(pickOutputFormat(false, 'image/jpeg')).toBe('image/jpeg');
    expect(pickOutputFormat(false, 'image/png')).toBe('image/png');
  });
  it('downscales only when larger than max', () => {
    expect(targetSize(3000, 1500, 1600)).toEqual({ width: 1600, height: 800 });
    expect(targetSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});
