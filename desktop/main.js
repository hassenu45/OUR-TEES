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
const crypto = require('crypto');
const { diffManifests, MAX_FILE_SIZE, MAX_TOTAL_SIZE } = require('./updater.cjs');

const BASE_WEB_DIR = path.join(__dirname, 'web');

/* ── Configuration ──
   Default: production Railway server (same DB as the public store).
   Override locally: set AZMA_API_URL env var or edit config.json. */
const PROD_BASE =
  process.env.AZMA_API_URL ||
  (function () {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
      return cfg.apiUrl || 'https://azma-web-production.up.railway.app';
    } catch (_e) {
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
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'تعذر الاتصال بسيرفر الإنتاج' }));
    } else {
      res.end();
    }
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
  } catch (_e) {
    // ignore
  }
  return '0.0.0';
}

function readLocalManifest() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const m = JSON.parse(raw);
    if (m && m.version && Array.isArray(m.files)) return m;
  } catch (_e) {
    // ignore
  }
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
        const contentLength = Number(res.headers['content-length'] || 0);
        if (contentLength > MAX_FILE_SIZE) {
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
          const hash = crypto.createHash('sha256').update(buf).digest('hex');
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
  const mime =
    {
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
    // Fetch remote manifest first to check for installer
    const remoteManifest = await fetchRemoteManifest();
    const local = readLocalManifest();
    
    // Check for external installer
    if (remoteManifest.installer && remoteManifest.version > (local.version || '0.0.0')) {
      // External update available
      const installerUrl = `${PROD_BASE}${remoteManifest.installer.url}`;
      try {
        const { default: { shell } } = await import('electron');
        shell.openPath(installerUrl);
        sendProgress({ phase: 'external-installer', installerUrl });
        return {
          updateAvailable: true,
          version: remoteManifest.version,
          type: 'external',
          installer: remoteManifest.installer
        };
      } catch (e) {
        console.error('[external installer error]', e.message);
      }
    }
    
    // No external update, proceed with normal internal update
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
          setTimeout(() => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('updater:applied', { version: result.version, background: true });
            }
          }, 800);
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
  try {
    server.close();
  } catch (_e) {
    // ignore
  }
});
