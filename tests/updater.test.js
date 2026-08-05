import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { diffManifests } = require('../desktop/updater.cjs');

const local = {
  version: '1.0.0',
  files: [
    { path: 'admin.html', sha256: 'aaaa', size: 100 },
    { path: 'js/api.js', sha256: 'bbbb', size: 50 },
    { path: 'styles.css', sha256: 'cccc', size: 30 },
  ],
};

describe('diffManifests', () => {
  it('returns changed files when sha256 differs', () => {
    const remote = {
      version: '1.0.1',
      files: [
        { path: 'admin.html', sha256: 'NEW', size: 120 },
        { path: 'js/api.js', sha256: 'bbbb', size: 50 },
        { path: 'styles.css', sha256: 'cccc', size: 30 },
      ],
    };
    const { changed, removed } = diffManifests(local, remote);
    expect(changed.map((f) => f.path)).toEqual(['admin.html']);
    expect(removed).toEqual([]);
  });

  it('detects removed files', () => {
    const remote = {
      version: '1.0.1',
      files: [{ path: 'admin.html', sha256: 'aaaa', size: 100 }],
    };
    const { changed, removed } = diffManifests(local, remote);
    expect(changed).toEqual([]);
    expect(removed).toEqual(['js/api.js', 'styles.css']);
  });

  it('returns empty diff when identical', () => {
    const { changed, removed } = diffManifests(local, local);
    expect(changed).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('handles empty local manifest', () => {
    const remote = {
      version: '1.0.0',
      files: [{ path: 'admin.html', sha256: 'aaaa', size: 100 }],
    };
    const { changed, removed } = diffManifests({ version: '0.0.0', files: [] }, remote);
    expect(changed.map((f) => f.path)).toEqual(['admin.html']);
    expect(removed).toEqual([]);
  });
});
