# AZMA Desktop — تطبيق حقيقي + تحديث ذاتي — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken packaged desktop app (404 black screen) and add a self-update system that pulls web-file updates from the same Railway server, with auto-check on launch + a manual button.

**Architecture:** The Electron app serves web files from a layered lookup (writable `userData/web` first, bundled `desktop/web` as fallback) and proxies `/api` + `/uploads` to Railway as before. A new `/updates/manifest.json` + `/updates/file/*` route on the Express server publishes a versioned manifest (sha256 per file). The desktop main process diffs local vs remote manifests, downloads changed files with hash verification, writes them atomically into `userData/web`, then reloads the window.

**Tech Stack:** Node.js ≥22 (Electron 43), Electron, Express 4, crypto (sha256), Vitest (root project tests).

## Global Constraints

- Must work on Windows (win32). Paths via `path.join`, never string concatenation.
- `desktop/web/` is a **build artifact** — gitignored, produced by `npm run build:web`.
- `VERSION` file lives at project root (`<root>/VERSION`), plain text, e.g. `1.0.0`.
- Every web file update is verified by sha256 before being written; any mismatch aborts the whole update (no partial writes).
- `/api` and `/uploads` proxying behavior in `desktop/main.js` must remain unchanged.
- Files are served to the window from `http://127.0.0.1:<PORT>` only; navigation guard stays.
- Data continues to come from Railway (per approved design). Local fallback via `js/api.js` is unchanged.
- All new server logic goes in CommonJS (server.js is CJS). Desktop files may be CJS (`.cjs`/`.js`) or ESM where used by Electron main.

---

### Task 1: Manifest builder module + VERSION + web-files list

**Files:**
- Create: `web-files.json`
- Create: `VERSION`
- Create: `updates-manifest.cjs`
- Create: `tests/manifest.test.js`

**Interfaces:**
- Produces:
  - `expandWebFiles(rootDir, list)` → `string[]` (relative posix paths, e.g. `js/admin.js`)
  - `buildManifest(rootDir, version)` → `{ version: string, files: Array<{ path: string, sha256: string, size: number }> }`
  - `hashFile(absPath)` → `string` (64-char hex sha256)
  - `safeResolve(rootDir, relPath)` → `string | null` (abs path, or null if traversal)
  - `web-files.json` = array of glob entries (supports `dir/**`)
  - `VERSION` = current version text

- [ ] **Step 1: Write the failing test**

`tests/manifest.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

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
    expect(files).toEqual([
      'admin.html',
      'assets/css/design-tokens.css',
      'js/api.js',
    ]);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/manifest.test.js`
Expected: FAIL with "Cannot find module '../updates-manifest.cjs'"

- [ ] **Step 3: Create `web-files.json`**

```json
[
  "admin.html",
  "hub.html",
  "login.html",
  "index.html",
  "store.html",
  "designer.html",
  "designer_debug.html",
  "21.html",
  "orders.html",
  "styles.css",
  "manifest.json",
  "assets/**",
  "js/**"
]
```

- [ ] **Step 4: Create `VERSION`**

```
1.0.0
```

- [ ] **Step 5: Write `updates-manifest.cjs`**

```js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function walkDir(absDir, relPrefix, out) {
  for (const name of fs.readdirSync(absDir)) {
    const abs = path.join(absDir, name);
    const rel = relPrefix + '/' + name;
    if (fs.statSync(abs).isDirectory()) walkDir(abs, rel, out);
    else out.push(rel);
  }
}

function expandWebFiles(rootDir, list) {
  const out = [];
  for (const entry of list) {
    if (entry.endsWith('/**')) {
      const base = entry.slice(0, -3);
      const absBase = path.join(rootDir, base);
      if (fs.existsSync(absBase)) walkDir(absBase, base, out);
      continue;
    }
    const abs = path.join(rootDir, entry);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) out.push(entry);
  }
  return out;
}

function hashFile(absPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

function buildManifest(rootDir, version) {
  const list = require('./web-files.json');
  const files = expandWebFiles(rootDir, list).map((rel) => {
    const abs = path.join(rootDir, rel);
    return { path: rel, sha256: hashFile(abs), size: fs.statSync(abs).size };
  });
  return { version, files };
}

function safeResolve(rootDir, relPath) {
  const root = path.resolve(rootDir);
  const abs = path.resolve(root, relPath);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  if (!fs.existsSync(abs)) return null;
  return abs;
}

module.exports = { expandWebFiles, buildManifest, hashFile, safeResolve };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/manifest.test.js`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add web-files.json VERSION updates-manifest.cjs tests/manifest.test.js
git commit -m "feat: manifest builder + VERSION + web-files list for self-update"
```

---

### Task 2: `/updates` endpoints on the Express server

**Files:**
- Modify: `server.js` (add version reader + two routes near the static-file section, ~line 177)
- Test: `tests/manifest.test.js` (add server-manifest tests)

**Interfaces:**
- Consumes: `buildManifest`, `safeResolve` from `./updates-manifest.cjs`
- Produces: routes `GET /updates/manifest.json` and `GET /updates/file/<path>` (also reachable by the desktop app over the proxy base URL)

- [ ] **Step 1: Write the failing test (add to `tests/manifest.test.js`)**

```js
describe('readVersion', () => {
  it('reads the VERSION file from root', () => {
    // reads <project>/VERSION which must equal what was committed in Task 1
    const { readVersion } = require('../server-version.cjs');
    expect(readVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/manifest.test.js`
Expected: FAIL with "Cannot find module '../server-version.cjs'"

- [ ] **Step 3: Create `server-version.cjs`**

```js
const fs = require('fs');
const path = require('path');

function readVersion() {
  try {
    const v = fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8').trim();
    if (v) return v;
  } catch {}
  try {
    return require('./package.json').version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

module.exports = { readVersion };
```

- [ ] **Step 4: Add the routes to `server.js`**

Add after the `app.use('/uploads', express.static(UPLOADS_DIR));` line (line 177):

```js
// ── Updates (self-update feed for the desktop app) ──
const { buildManifest, safeResolve } = require('./updates-manifest.cjs');
const { readVersion } = require('./server-version.cjs');

app.get('/updates/manifest.json', (_req, res) => {
  try {
    res.json(buildManifest(__dirname, readVersion()));
  } catch (e) {
    res.status(500).json({ error: 'Failed to build update manifest' });
  }
});

app.get('/updates/file/*', (req, res) => {
  const rel = decodeURIComponent(req.params[0] || '');
  const file = safeResolve(__dirname, rel);
  if (!file) return res.status(404).json({ error: 'Not found' });
  res.sendFile(file);
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/manifest.test.js`
Expected: PASS (all 6)

- [ ] **Step 6: Smoke-test the routes locally**

Run: `node server.js` in a terminal; in another:
- `curl http://localhost:3000/updates/manifest.json` → JSON with `version` and `files`
- `curl http://localhost:3000/updates/file/admin.html` → the admin.html content
- `curl http://localhost:3000/updates/file/../server.js` → 404 JSON

(Stop the server afterwards.)

- [ ] **Step 7: Commit**

```bash
git add server.js server-version.cjs tests/manifest.test.js
git commit -m "feat: serve /updates/manifest.json and /updates/file/* for self-update"
```

---

### Task 3: `desktop/web` build script + electron-builder config

**Files:**
- Create: `desktop/scripts/build-web.mjs`
- Modify: `desktop/package.json` (add `build:web` script + `web/**/*` to `build.files`)
- Modify: `.gitignore` (add `desktop/web/`)

**Interfaces:**
- Produces: `desktop/web/` containing a fresh copy of the web files + `VERSION`, and the npm script `npm run build:web --prefix desktop` (or `cd desktop && npm run build:web`)

- [ ] **Step 1: Write `desktop/scripts/build-web.mjs`**

```js
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
```

- [ ] **Step 2: Verify the script works**

Run: `node desktop/scripts/build-web.mjs`
Expected: `Built N web files → desktop/web`, and `desktop/web/admin.html`, `desktop/web/js/api.js`, `desktop/web/VERSION` exist.

- [ ] **Step 3: Update `desktop/package.json`**

Add to `scripts`:

```json
"build:web": "node scripts/build-web.mjs"
```

Add to `build.files` (after `"preload.js"`):

```json
"web/**/*"
```

- [ ] **Step 4: Update `.gitignore`**

Add line:

```
desktop/web/
```

- [ ] **Step 5: Rebuild and verify**

Run: `node desktop/scripts/build-web.mjs`, then `git status` → `desktop/web/` must NOT appear.

- [ ] **Step 6: Commit**

```bash
git add desktop/scripts/build-web.mjs desktop/package.json .gitignore
git commit -m "feat: build-web script bundles web files into desktop package"
```

---

### Task 4: Desktop updater logic (pure, testable)

**Files:**
- Create: `desktop/updater.cjs`
- Create: `tests/updater.test.js`

**Interfaces:**
- Consumes: nothing (pure node builtins: crypto, fs, path)
- Produces:
  - `hashFile(absPath)` → `string`
  - `diffManifests(localManifest, remoteManifest)` → `{ changed: Array<{path,sha256,size}>, removed: string[] }`
  - `MAX_FILE_SIZE` = `50 * 1024 * 1024`
  - `MAX_TOTAL_SIZE` = `300 * 1024 * 1024`

- [ ] **Step 1: Write the failing test**

`tests/updater.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { diffManifests } = require('../desktop/updater.cjs');

const local = {
  version: '1.0.0',
  files: [
    { path: 'admin.html', sha256: 'a', size: 1 },
    { path: 'js/api.js', sha256: 'b', size: 1 },
  ],
};

describe('diffManifests', () => {
  it('returns changed files when sha256 differs', () => {
    const remote = {
      version: '1.0.1',
      files: [
        { path: 'admin.html', sha256: 'NEW', size: 2 },
        { path: 'js/api.js', sha256: 'b', size: 1 },
      ],
    };
    const { changed, removed } = diffManifests(local, remote);
    expect(changed.map((f) => f.path)).toEqual(['admin.html']);
    expect(removed).toEqual([]);
  });

  it('detects removed files', () => {
    const remote = { version: '1.0.1', files: [{ path: 'admin.html', sha256: 'a', size: 1 }] };
    const { changed, removed } = diffManifests(local, remote);
    expect(changed).toEqual([]);
    expect(removed).toEqual(['js/api.js']);
  });

  it('returns empty diff when identical', () => {
    const { changed, removed } = diffManifests(local, local);
    expect(changed).toEqual([]);
    expect(removed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/updater.test.js`
Expected: FAIL with "Cannot find module '../desktop/updater.cjs'"

- [ ] **Step 3: Write `desktop/updater.cjs`**

```js
const crypto = require('crypto');
const fs = require('fs');

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_TOTAL_SIZE = 300 * 1024 * 1024;

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function diffManifests(localManifest, remoteManifest) {
  const remoteMap = new Map((remoteManifest.files || []).map((f) => [f.path, f]));
  const localMap = new Map(
    (localManifest && localManifest.files ? localManifest.files : []).map((f) => [f.path, f])
  );
  const changed = [];
  for (const f of remoteMap.values()) {
    const old = localMap.get(f.path);
    if (!old || old.sha256 !== f.sha256) changed.push(f);
  }
  const removed = [];
  for (const p of localMap.keys()) if (!remoteMap.has(p)) removed.push(p);
  return { changed, removed };
}

module.exports = { hashFile, diffManifests, MAX_FILE_SIZE, MAX_TOTAL_SIZE };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/updater.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add desktop/updater.cjs tests/updater.test.js
git commit -m "feat: desktop updater diff/hash logic"
```

---

### Task 5: Rework `desktop/main.js` — layered serving + updater + IPC

**Files:**
- Modify: `desktop/main.js` (whole file — replace with the version below)

**Interfaces:**
- Consumes: `diffManifests`, `MAX_FILE_SIZE`, `MAX_TOTAL_SIZE` from `./updater.cjs`
- Produces:
  - IPC handler `updater:check` → `{ updateAvailable, version, changed, error }`
  - IPC handler `updater:status` → `{ version, remoteReachable }`
  - Event `updater:progress` → `{ phase: 'download'|'apply'|'done'|'error', done, total, path?, error? }`
  - Event `updater:applied` → `{ version }`
  - `BASE_WEB_DIR` (bundled), `USER_WEB_DIR` (`userData/web`), `STATE_FILE`

- [ ] **Step 1: Replace `desktop/main.js` with the new implementation**

```js
/* AZMA Settings — Desktop App
   Real desktop app (Electron). Serves the admin panel locally from a
   layered web folder (writable userData/web first, bundled web/ as
   fallback) and proxies every /api & /uploads request to the production
   server so the app and the public store share the same database. */

const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const { diffManifests, MAX_FILE_SIZE, MAX_TOTAL_SIZE } = require('./updater.cjs');

const IS_DEV = process.argv.includes('--dev');
const BASE_WEB_DIR = path.join(__dirname, 'web');

/* ── Configuration ── */
const PROD_BASE = process.env.AZMA_API_URL
  || (function () {
      try {
        const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
        return cfg.apiUrl || 'https://azma-web-production.up.railway.app';
      } catch {
        return 'https://azma-web-production.up.railway.app';
      }
    })();

const PORT = Number(process.env.AZMA_APP_PORT || 5500);

/* ── Session cookie jar (kept inside the app, never exposed) ── */
let sessionCookies = new Map();

function collectCookies(res) {
  const setCookies = res.headers['set-cookie'];
  if (!setCookies || !setCookies.length) return;
  for (const sc of setCookies) {
    const pair = sc.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    sessionCookies.set(name, pair.trim());
  }
}

function cookieHeader() {
  return [...sessionCookies.values()].join('; ');
}

/* ── Proxy: forward /api & /uploads to the production server ── */
function proxy(req, res, targetPath) {
  const upstream = new URL(PROD_BASE + targetPath);
  const headers = { ...req.headers, host: upstream.host };
  if (sessionCookies.size) headers.cookie = cookieHeader();

  const preq = https.request(
    {
      method: req.method,
      hostname: upstream.hostname,
      port: upstream.port || 443,
      path: upstream.pathname + upstream.search,
      headers,
    },
    (pres) => {
      collectCookies(pres);
      res.writeHead(pres.statusCode || 502, pres.headers);
      pres.pipe(res);
    }
  );
  preq.on('error', (err) => {
    console.error('[proxy error]', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'تعذر الاتصال بسيرفر الإنتاج' }));
  });
  req.pipe(preq);
}

/* ── Layered file lookup: userData/web first, bundled web/ fallback ── */
const USER_WEB_DIR = path.join(app.getPath('userData'), 'web');
const STATE_FILE = path.join(app.getPath('userData'), 'azma-update-state.json');

function readVersionFromDir(dir) {
  try {
    const v = fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim();
    if (v) return v;
  } catch {}
  return '0.0.0';
}

function readLocalManifest() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const m = JSON.parse(raw);
    if (m && m.version && Array.isArray(m.files)) return m;
  } catch {}
  return { version: readVersionFromDir(BASE_WEB_DIR), files: [] };
}

function findWebFile(relPath) {
  const inUser = path.join(USER_WEB_DIR, relPath);
  if (fs.existsSync(inUser) && fs.statSync(inUser).isFile()) return inUser;
  const inBase = path.join(BASE_WEB_DIR, relPath);
  if (fs.existsSync(inBase) && fs.statSync(inBase).isFile()) return inBase;
  return null;
}

/* ── Updater ── */
function fetchRemoteManifest() {
  return fetch(`${PROD_BASE}/updates/manifest.json`, {
    headers: { Accept: 'application/json' },
  }).then((r) => {
    if (!r.ok) throw new Error(`manifest ${r.status}`);
    return r.json();
  });
}

function downloadFile(urlPath, expectedSha) {
  return new Promise((resolve, reject) => {
    const upstream = new URL(PROD_BASE + urlPath);
    const req = https.get(
      {
        hostname: upstream.hostname,
        port: upstream.port || 443,
        path: upstream.pathname + upstream.search,
        headers: { Accept: '*/*' },
      },
      (res) => {
        if (res.statusCode !== 200) return reject(new Error(`download ${res.statusCode}`));
        if (Number(res.headers['content-length'] || 0) > MAX_FILE_SIZE) {
          res.resume();
          return reject(new Error('file too large'));
        }
        const chunks = [];
        let total = 0;
        res.on('data', (c) => {
          total += c.length;
          if (total > MAX_FILE_SIZE) {
            res.destroy();
            return reject(new Error('file too large'));
          }
          chunks.push(c);
        });
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const hash = require('crypto').createHash('sha256').update(buf).digest('hex');
          if (hash !== expectedSha) return reject(new Error('hash mismatch'));
          resolve(buf);
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
  });
}

function writeFileAtomic(filePath, buf) {
  const tmp = filePath + '.tmp';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, filePath);
}

async function applyUpdate() {
  const remote = await fetchRemoteManifest();
  const local = readLocalManifest();
  if (remote.version === local.version) {
    return { updateAvailable: false, version: remote.version, changed: 0 };
  }
  const { changed, removed } = diffManifests(local, remote);
  if (!changed.length && !removed.length) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ version: remote.version, files: remote.files }));
    return { updateAvailable: false, version: remote.version, changed: 0 };
  }

  let totalBytes = 0;
  for (const f of changed) totalBytes += f.size;
  if (totalBytes > MAX_TOTAL_SIZE) throw new Error('update too large');

  let done = 0;
  for (const f of changed) {
    const buf = await downloadFile(`/updates/file/${encodeURIComponent(f.path)}`, f.sha256);
    writeFileAtomic(path.join(USER_WEB_DIR, f.path), buf);
    done++;
    sendProgress({ phase: 'download', done, total: changed.length, path: f.path });
  }
  for (const p of removed) {
    const fp = path.join(USER_WEB_DIR, p);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify({ version: remote.version, files: remote.files }));
  sendProgress({ phase: 'done', done: changed.length, total: changed.length });
  return { updateAvailable: true, version: remote.version, changed: changed.length };
}

function sendProgress(data) {
  if (win && !win.isDestroyed()) win.webContents.send('updater:progress', data);
}

/* ── Local static server ── */
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (urlPath.startsWith('/api/') || urlPath.startsWith('/uploads/')) {
    return proxy(req, res, urlPath + ((req.url || '').split('?')[1] ? '?' + (req.url || '').split('?')[1] : ''));
  }

  const rel = urlPath === '/' ? 'admin.html' : urlPath.replace(/^\/+/, '');
  const file = findWebFile(rel);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }
  const ext = path.extname(file).toLowerCase();
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(file).pipe(res);
});

/* ── App window (real desktop window — no browser UI) ── */
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'AZMA Settings — إعدادات المتجر',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0D0D0D',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  Menu.setApplicationMenu(null);
  win.removeMenu();

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://127.0.0.1:' + PORT) && !url.startsWith('http://localhost:' + PORT)) {
      e.preventDefault();
    }
  });

  win.loadURL(`http://127.0.0.1:${PORT}/admin.html`);

  win.on('closed', () => {
    win = null;
  });
}

/* ── IPC ── */
ipcMain.handle('updater:status', () => {
  const local = readLocalManifest();
  return { version: local.version };
});

ipcMain.handle('updater:check', async () => {
  try {
    const result = await applyUpdate();
    if (result.updateAvailable) {
      setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('updater:applied', { version: result.version });
        }
      }, 800);
    }
    return result;
  } catch (e) {
    sendProgress({ phase: 'error', error: e.message });
    return { updateAvailable: false, error: e.message };
  }
});

/* ── Boot ── */
app.whenReady().then(() => {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`AZMA Settings local server → http://127.0.0.1:${PORT}`);
    console.log(`Proxying API to → ${PROD_BASE}`);
    console.log(`Web dir: ${BASE_WEB_DIR}`);
    createWindow();
    setTimeout(async () => {
      try {
        const result = await applyUpdate();
        if (result.updateAvailable) {
          setTimeout(() => win.reload(), 1500);
        }
      } catch (e) {
        console.error('[auto-update]', e.message);
      }
    }, 4000);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { server.close(); } catch {}
});
```

Note: `BASE_WEB_DIR` points at `__dirname/web`. In dev, `__dirname` = `desktop/`, so it reads `desktop/web` (must run `npm run build:web` first). In the packaged app, `desktop/web` is included as `web/**/*` → `__dirname/web` resolves inside `app.asar`.

- [ ] **Step 2: Verify the file parses**

Run: `node --check desktop/main.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add desktop/main.js
git commit -m "feat: layered web serving + self-updater + IPC in desktop app"
```

---

### Task 6: IPC bridge in `desktop/preload.js`

**Files:**
- Modify: `desktop/preload.js`

**Interfaces:**
- Produces `window.azma`:
  - `checkForUpdates()` → Promise<object>
  - `getStatus()` → Promise<{ version }>
  - `onUpdateProgress(cb)` → unsubscribe fn
  - `onUpdateApplied(cb)` → unsubscribe fn

- [ ] **Step 1: Replace `desktop/preload.js`**

```js
/* AZMA Settings — renderer bridge for native APIs */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('azma', {
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  getStatus: () => ipcRenderer.invoke('updater:status'),
  onUpdateProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('updater:progress', listener);
    return () => ipcRenderer.removeListener('updater:progress', listener);
  },
  onUpdateApplied: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('updater:applied', listener);
    return () => ipcRenderer.removeListener('updater:applied', listener);
  },
});
```

- [ ] **Step 2: Verify it parses**

Run: `node --check desktop/preload.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add desktop/preload.js
git commit -m "feat: expose updater IPC bridge to renderer"
```

---

### Task 7: Update button + status UI in the admin panel

**Files:**
- Modify: `admin.html` (sidebar footer — add update button block after line 900)
- Modify: `js/admin.js` (append update UI wiring)

**Interfaces:**
- Consumes: `window.azma` (exists only inside Electron; absent in browser → UI hidden)

- [ ] **Step 1: Add the button to `admin.html`**

Replace the sidebar-footer block (lines 892-900) with:

```html
      <div class="sidebar-footer">
        <button type="button" id="update-btn" class="sidebar-item"
                style="display:none;width:100%;border:none;background:none;cursor:pointer;text-align:start;color:inherit;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
          <span id="update-label">تحقق من التحديث</span>
          <span id="update-state" style="margin-left:auto;font-size:10px;opacity:.55;"></span>
        </button>
        <div class="sidebar-user">
          <div class="sidebar-user-avatar">A</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">Admin</div>
            <div class="sidebar-user-role">مدير المتجر</div>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Append wiring to `js/admin.js` (end of file)**

```js
/* ── Desktop app self-update (window.azma exists only inside Electron) ── */
(function initDesktopUpdater() {
  if (!window.azma) return;
  const btn = document.getElementById('update-btn');
  const label = document.getElementById('update-label');
  const state = document.getElementById('update-state');
  if (!btn || !state) return;
  btn.style.display = 'flex';

  window.azma.onUpdateProgress((p) => {
    if (p.phase === 'download') state.textContent = `${p.done}/${p.total}`;
    else if (p.phase === 'done') state.textContent = 'تم التحديث';
    else if (p.phase === 'error') state.textContent = p.error || 'خطأ';
  });
  window.azma.onUpdateApplied((p) => {
    state.textContent = 'جاري إعادة التحميل…';
    setTimeout(() => location.reload(), 1200);
  });

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    label.textContent = 'جارٍ الفحص…';
    try {
      const r = await window.azma.checkForUpdates();
      if (r && r.error) {
        state.textContent = 'تعذر الاتصال بالسيرفر';
      } else if (r && r.updateAvailable) {
        state.textContent = 'تم التحديث ✓';
        label.textContent = 'إعادة التحميل…';
      } else {
        state.textContent = 'آخر إصدار';
        label.textContent = 'تحقق من التحديث';
      }
    } catch {
      state.textContent = 'خطأ';
    }
    btn.disabled = false;
  });

  window.azma.getStatus().then((s) => {
    if (s && s.version) state.textContent = 'v' + s.version;
  }).catch(() => {});
})();
```

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no new errors for `js/admin.js` (existing baseline passes or shows only pre-existing issues).

- [ ] **Step 4: Commit**

```bash
git add admin.html js/admin.js
git commit -m "feat: in-app update check button + status UI"
```

---

### Task 8: End-to-end verification

**Files:**
- None (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all tests pass (manifest, updater, api baseline).

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint` then `npm run typecheck`
Expected: no new failures.

- [ ] **Step 3: Build web folder**

Run: `node desktop/scripts/build-web.mjs`
Expected: `desktop/web` populated.

- [ ] **Step 4: Build the packaged app**

Run: `cd desktop && npm run build`
Expected: NSIS installer in `desktop/dist`. (Note: first run downloads Electron — may take a while.)

- [ ] **Step 5: Run the unpacked app**

Run the exe under `desktop/dist/win-unpacked/`.
Expected: **No 404** — the admin panel opens in a real desktop window.

- [ ] **Step 6: Manual update flow**

1. Run `node desktop/scripts/build-web.mjs`; run the app; button shows current version (e.g. `v1.0.0`).
2. Bump `VERSION` to `1.0.1` and modify e.g. `admin.html` (any visible change).
3. `node desktop/scripts/build-web.mjs` again (keeps dev copy consistent), then deploy to Railway: `npm run deploy`.
4. In the app, click "تحقق من التحديث".
Expected: it finds `1.0.1`, downloads changed files, reloads, and shows the new version + the modified admin.html change.

- [ ] **Step 7: Offline/rollback check**

Disconnect the network, reopen the app.
Expected: app still opens (serves local files), and clicking "تحقق من التحديث" shows "تعذر الاتصال بالسيرفر" without crashing.

- [ ] **Step 8: Commit any leftover**

```bash
git status
git add -A
git commit -m "chore: final verification artifacts"
```

---

## Self-Review Notes

- Spec coverage: 404 fix (Task 3+5), layered serving + fallback (Task 5), `/updates` endpoints (Task 2), updater engine (Task 4), IPC/preload (Task 6), UI button + auto-check (Task 5 boot + Task 7), verification (Task 8), gitignore + docs (Task 3, done in spec commit).
- No placeholders: every code step contains the actual implementation.
- Type consistency: `diffManifests` returns `{ changed, removed }` (Task 4) and is consumed with those names in Task 5. IPC channel names `updater:check`, `updater:status`, `updater:progress`, `updater:applied` are identical in Tasks 5, 6, 7. `window.azma` methods match preload exactly.
