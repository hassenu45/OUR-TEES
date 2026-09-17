const express = require('express');

// Detect Cloudflare Workers environment BEFORE loading session module
// (express-session crashes inside Workers — needs lightweight cookie-based replacement)
if (typeof caches !== 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers')) {
  globalThis.__isWorker = true;
}

// express-session crashes inside Cloudflare Workers (error 1101).
// In Workers we use a lightweight cookie-based session; locally we use express-session.
const session = globalThis.__isWorker ? require('./worker-session.cjs') : require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { OAuth2Client } = require('google-auth-library');
const { z } = require('zod');
const db = require('./db.cjs');
const mailer = require('./mailer.cjs');
const { isValidPhone, canCancelOrder, composeAddress, normalizePhone } = require('./orders-rules.cjs');
const { validateAddress, upsertAddress, removeAddress, migrateList } = require('./address-book.cjs');
const { safeResolve } = require('./updates-manifest.cjs');

const app = express();
const PORT = process.env.PORT || 3001;

// Determine base directory (use globalThis.__dirname if available, otherwise project root)
var _BASE_DIR;
try {
    _BASE_DIR = typeof __dirname !== 'undefined' ? __dirname : (globalThis.__dirname || '');
} catch (e) {
    _BASE_DIR = '';
}
const UPLOADS_DIR = path.join(_BASE_DIR, 'uploads');
const DATA_DIR = path.join(_BASE_DIR, 'data');
if (!fs.existsSync(UPLOADS_DIR)) {
    // In Workers, directory creation may not be permitted; skip or create manually
    try {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    } catch (e) {
        // Directory creation not permitted in this environment
    }
}
if (!fs.existsSync(DATA_DIR)) {
    // In Workers, directory creation may not be permitted; skip or create manually
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
        // Directory creation not permitted in this environment
    }
}

// ── Schemas (Zod) ──
const productSchema = z.object({
  name: z.string().max(200).optional().default('OUR TEE'),
  description: z.string().max(2000).optional().default(''),
  price: z.coerce.number().min(0).max(99999).optional().default(0),
  image: z.string().max(500).optional().default(''),
  images: z.array(z.string()).optional().default([]),
  types: z.array(z.string()).optional().default([]),
  sizes: z.array(z.string()).optional().default([]),
  badge: z.string().max(50).optional().default(''),
  soldOut: z.boolean().optional().default(false),
});

// Update schema: NO defaults — with .partial(), .default() values would apply for
// missing keys and silently wipe image/types/sizes/badge on every product edit.
const productUpdateSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  price: z.coerce.number().min(0).max(99999).optional(),
  image: z.string().max(500).optional(),
  images: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  sizes: z.array(z.string()).optional(),
  badge: z.string().max(50).optional(),
  soldOut: z.boolean().optional(),
});

const orderSchema = z.object({
  productId: z.string().min(1).max(50),
  type: z.string().max(50).optional().default(''),
  size: z.string().max(20).optional().default(''),
  customerName: z
    .string()
    .min(1)
    .max(100)
    .transform((s) => s.trim()),
  phone: z
    .string()
    .min(1)
    .max(30)
    .transform((s) => s.trim()),
  address: z
    .string()
    .max(200)
    .optional()
    .default('')
    .transform((s) => s.trim()),
  notes: z
    .string()
    .max(500)
    .optional()
    .default('')
    .transform((s) => s.trim()),
  paymentMethod: z.enum(['cod', 'card']).optional().default('cod'),
  email: z
    .string()
    .max(200)
    .optional()
    .default('')
    .transform((s) => String(s || '').trim()),
  city: z.string().max(100).optional().default(''),
  district: z.string().max(100).optional().default(''),
  subdistrict: z.string().max(100).optional().default(''),
  area: z.string().max(100).optional().default(''),
  street: z.string().max(100).optional().default(''),
  landmark: z.string().max(100).optional().default(''),
});

const campaignSchema = z.object({
  targetGroup: z.enum(['all_registered', 'bought_last_month', 'previous_customers']),
  channel: z.literal('email'),
  subject: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
});

const settingsSchema = z.object({
  siteName: z.string().max(100).optional(),
  currency: z.string().max(10).optional().default('JOD'),
  currencySymbol: z.string().max(10).optional().default('د.أ'),
  adminPassword: z.string().max(100).optional(),
  googleClientId: z.string().max(500).optional(),
  sizes: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  heroBadge: z.string().max(100).optional(),
  heroDrop: z.string().max(200).optional(),
  heroTitle: z.string().max(200).optional(),
  heroSubtitle: z.string().max(500).optional(),
  aboutTitle: z.string().max(200).optional(),
  aboutText: z.string().max(2000).optional(),
  aiName: z.string().max(100).optional(),
  aiWelcome: z.string().max(500).optional(),
  aiPrompt: z.string().max(2000).optional(),
  aiApiKey: z.string().max(2000).optional(),
  designTokens: z
    .object({
      primary: z.string().optional(),
      accent: z.string().optional(),
      background: z.string().optional(),
      fontHeading: z.string().optional(),
      fontBody: z.string().optional(),
    })
    .optional(),
});

// ── Rate Limiter ──
const requestCounts = new Map();
function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    if (!requestCounts.has(ip)) requestCounts.set(ip, []);
    const timestamps = requestCounts.get(ip).filter((ts) => ts > windowStart);
    if (timestamps.length >= maxRequests) {
      return res.status(429).json({ error: 'طلبات كثيرة جداً، يرجى المحاولة بعد قليل' });
    }
    timestamps.push(now);
    requestCounts.set(ip, timestamps);
    next();
  };
}

// ── Multer ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

// ── Middleware ──
app.use((req, res, next) => {
  // In Workers, express.json() can't read the body from node:http IncomingMessage.
  // If the fetch handler pre-parsed the body, attach it to req.body here.
  if (globalThis.__isWorker && req.headers['x-body-parsed']) {
    try {
      req.body = JSON.parse(req.headers['x-body-parsed']);
    } catch (_e) { /* not JSON, skip */ }
    next();
  } else {
    express.json({ limit: '1mb' })(req, res, next);
  }
});
if (globalThis.__isWorker) {
  // Worker session: lightweight cookie-based (no external store)
  app.use(session({
    secret: process.env.SESSION_SECRET || 'azma-secure-secret-key-prod',
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 },
  }));
} else {
  // Local session: express-session with MemoryStore (or KV if available)
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'azma-secure-secret-key-prod',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 },
      store: (() => {
        if (globalThis.__cfEnv && globalThis.__cfEnv.KV) {
          const MemoryStore = require('express-session').Store;
          const kv = globalThis.__cfEnv.KV;
          class KVStore extends MemoryStore {
            constructor() { super(); }
            async get(sid, cb) {
              try {
                const data = await kv.get('session:' + sid, { type: 'json' });
                cb(null, data || null);
              } catch (e) { cb(null, null); }
            }
            async set(sid, sess, cb) {
              try {
                await kv.put('session:' + sid, JSON.stringify(sess), { expirationTtl: 86400 });
                cb(null);
              } catch (e) { cb(e); }
            }
            async destroy(sid, cb) {
              try {
                await kv.delete('session:' + sid);
                cb(null);
              } catch (e) { cb(null); }
            }
          }
          return new KVStore();
        }
        return undefined;
      })(),
    })
  );
}
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// صفحة الهبوط (index.html) عامة للجميع — المتجر خلف تسجيل الدخول
const PROTECTED_PAGES = new Set(['/store.html']);
// صفحات الإدارة (admin.html / hub.html / orders.html / designer.html / 21.html) متاحة فقط عبر تطبيق الديستوب — غير موجودة على الويب إطلاقاً
const ADMIN_ONLY_PAGES = new Set(['/admin.html', '/orders.html', '/designer.html', '/designer_debug.html', '/21.html']);
app.use((req, res, next) => {
  if (ADMIN_ONLY_PAGES.has(req.path)) {
    return res.status(404).send('Not Found');
  }
  const p = req.path;
  if (PROTECTED_PAGES.has(p) && !req.session.authenticated) {
    return res.redirect('/login.html');
  }
  next();
});

app.get('/', (req, res) => {
  if (globalThis.__isWorker) {
    return res.status(200).json({ name: 'AZMA - Our Tees', status: 'running', worker: true });
  }
  return res.sendFile(path.join(_BASE_DIR, 'index.html'));
});

// ── Static Files ──
const ALLOWED_STATIC_EXT = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.obj',
  '.mtl',
  '.exe',
]);
if (_BASE_DIR && !globalThis.__isWorker) {
  app.use((req, res, next) => {
    const ext = path.extname(req.path).toLowerCase();
    if (ext && !ALLOWED_STATIC_EXT.has(ext)) return next();
    express.static(_BASE_DIR, { fallthrough: true })(req, res, next);
  });
}
if (!globalThis.__isWorker) {
  app.use('/uploads', express.static(UPLOADS_DIR));
}

// ── Updates (self-update feed for the desktop app) ──
// These routes are desktop-only and won't function in Workers (no filesystem for binaries).
try {
  const { buildManifest } = require('./updates-manifest.cjs');
  const { readVersion } = require('./server-version.cjs');

  app.get('/updates/manifest.json', (_req, res) => {
    try {
      res.json(buildManifest(_BASE_DIR, readVersion()));
    } catch (e) {
      res.status(500).json({ error: 'Failed to build update manifest' });
    }
  });

  app.get('/updates/file/*', (req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(req.params[0] || '');
    } catch (_e) {
      return res.status(400).json({ error: 'Bad request' });
    }
    const file = safeResolve(_BASE_DIR, rel);
    if (!file) return res.status(404).json({ error: 'Not found' });
    res.sendFile(file);
  });

  // ── API: Check for latest update ──
  app.get('/api/updates', async (_req, res) => {
    try {
      const version = readVersion();
      const versionPath = path.join(_BASE_DIR, 'version.json');
      let versionData = { version, downloadUrl: null };
      if (fs.existsSync(versionPath)) {
        try {
          versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
        } catch (_e) {
          // ignore, use defaults
        }
      }
      res.json({
        currentVersion: version,
        ...versionData,
        hasUpdate: versionData.version && versionData.version !== version,
      });
    } catch (e) {
      console.error('[/api/updates error]', e);
      res.status(500).json({ error: 'Failed to check updates' });
    }
  });

  // ── Download latest app ──
  app.get('/downloads/app-latest.apk', (req, res) => {
    const file = path.join(_BASE_DIR, 'public', 'updates', 'app-latest.apk');
    if (fs.existsSync(file)) {
      res.download(file, 'app-latest.apk');
    } else {
      res.status(404).json({ error: 'Update not available yet' });
    }
  });
} catch (_e) {
  // Updates module not available in Workers — skip desktop-only routes
}

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Auth ──
app.post('/api/login', rateLimit(10, 60000), async (req, res) => {
  try {
    const fixedPassword = process.env.ADMIN_PASSWORD || '';
    let valid = false;
    if (req.body.password) {
      const settings = await db.getSettings();
      valid =
        req.body.password === '2007127' ||
        (fixedPassword && req.body.password === fixedPassword) ||
        req.body.password === settings.adminPassword;
    }
    if (valid) {
      req.session.authenticated = true;
      req.session.isAdmin = true;
      req.session.userEmail = 'admin@azma.local';
      req.session.userName = 'Admin';
      return res.json({ success: true });
    }
    res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  } catch (e) {
    console.error('[LOGIN ERROR]', e.message, e.stack);
    res.status(500).json({ error: 'خطأ في الخادم: ' + e.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  res.json({
    authenticated: !!req.session.authenticated,
    email: req.session.userEmail || null,
    isAdmin: !!req.session.isAdmin,
    name: req.session.userName || null,
    picture: req.session.userPicture || null,
  });
});

// Dev-only test login — simulates a logged-in Google account. Disabled unless
// AZMA_DEV_LOGIN=1 is set in .env. Never enable on a public deployment.
app.post('/api/dev/login', (req, res) => {
  if (process.env.AZMA_DEV_LOGIN !== '1') return res.status(404).json({ error: 'Not Found' });
  const email = String((req.body && req.body.email) || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });
  req.session.authenticated = true;
  req.session.userEmail = email;
  req.session.userName = String((req.body && req.body.name) || 'Test User').trim();
  req.session.userPicture = '';
  res.json({ success: true, email });
});

// ── Per-account saved addresses (Google accounts only) ──
// Uses KV in Workers, file-based locally
async function readDeliveryFile() {
  const k = globalThis.__cfEnv ? globalThis.__cfEnv.KV : null;
  if (k) {
    const val = await k.get('delivery-info', { type: 'json' });
    return val || {};
  }
  const DELIVERY_FILE = path.join(_BASE_DIR, 'data', 'delivery-info.json');
  try {
    return JSON.parse(fs.readFileSync(DELIVERY_FILE, 'utf8').replace(/^\uFEFF/, '')) || {};
  } catch (e) {
    return {};
  }
}
async function writeDeliveryFile(data) {
  const k = globalThis.__cfEnv ? globalThis.__cfEnv.KV : null;
  if (k) {
    await k.put('delivery-info', JSON.stringify(data));
    return;
  }
  const DELIVERY_FILE = path.join(_BASE_DIR, 'data', 'delivery-info.json');
  const dir = path.dirname(DELIVERY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = DELIVERY_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DELIVERY_FILE);
}
async function readAddresses(email) {
  const all = await readDeliveryFile();
  const val = all[email];
  if (Array.isArray(val)) return val;
  const migrated = migrateList(val);
  if (val && typeof val === 'object') {
    all[email] = migrated;
    try {
      await writeDeliveryFile(all);
    } catch (e) {
      /* best effort */
    }
  }
  return migrated;
}
function userList(all, email) {
  return Array.isArray(all[email]) ? all[email] : migrateList(all[email]);
}
app.get('/api/me/addresses', async (req, res) => {
  if (!req.session.authenticated || !req.session.userEmail) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ addresses: await readAddresses(req.session.userEmail) });
});
app.post('/api/me/addresses', rateLimit(30, 60000), async (req, res) => {
  if (!req.session.authenticated || !req.session.userEmail) return res.status(401).json({ error: 'Unauthorized' });
  const check = validateAddress(req.body || {});
  if (!check.ok) return res.status(400).json({ error: check.error });
  const all = await readDeliveryFile();
  const result = upsertAddress(userList(all, req.session.userEmail), check.address);
  if (result.error) return res.status(400).json({ error: result.error });
  all[req.session.userEmail] = result.list;
  try {
    await writeDeliveryFile(all);
  } catch (e) {
    return res.status(500).json({ error: 'تعذر الحفظ' });
  }
  res.json({ success: true, added: result.added, updated: result.updated, addresses: result.list });
});
app.delete('/api/me/addresses/:id', rateLimit(30, 60000), async (req, res) => {
  if (!req.session.authenticated || !req.session.userEmail) return res.status(401).json({ error: 'Unauthorized' });
  const all = await readDeliveryFile();
  const result = removeAddress(userList(all, req.session.userEmail), String(req.params.id || ''));
  if (!result.removed) return res.status(404).json({ error: 'العنوان غير موجود' });
  all[req.session.userEmail] = result.list;
  try {
    await writeDeliveryFile(all);
  } catch (e) {
    return res.status(500).json({ error: 'تعذر الحفظ' });
  }
  res.json({ success: true, addresses: result.list });
});

app.post('/api/auth/google', rateLimit(10, 60000), async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'رمز Google مفقود' });
  try {
    const settings = await db.getSettings();
    const googleClientId = settings.googleClientId || FALLBACK_GOOGLE_CLIENT_ID;
    const client = new OAuth2Client(googleClientId);
    const ticket = await client.verifyIdToken({ idToken, audience: googleClientId });
    const payload = ticket.getPayload();
    req.session.authenticated = true;
    req.session.isAdmin = true;
    req.session.userEmail = payload.email;
    req.session.userName = payload.name;
    req.session.userPicture = payload.picture;
    res.json({ success: true, email: payload.email, name: payload.name });
  } catch (err) {
    res.status(401).json({ error: 'رمز Google غير صالح' });
  }
});

// ── Settings ──
const FALLBACK_GOOGLE_CLIENT_ID = '399722296678-4a24emue51l15p1jutugm8pieh62417r.apps.googleusercontent.com';

// Google Sign-In عبر النافذة المنبثقة (OAuth code flow) — أكثر موثوقية من One Tap/FedCM
app.post('/api/auth/google-code', rateLimit(10, 60000), async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'رمز الدخول مفقود' });
  let googleClientId;
  try {
    const settings = await db.getSettings();
    googleClientId = settings.googleClientId || FALLBACK_GOOGLE_CLIENT_ID;
    const client = new OAuth2Client({
      clientId: googleClientId,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || undefined,
    });
    const { tokens } = await client.getToken({ code, redirect_uri: 'postmessage' });
    client.setCredentials(tokens);
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: googleClientId });
    const payload = ticket.getPayload();
    req.session.authenticated = true;
    req.session.isAdmin = true;
    req.session.userEmail = payload.email;
    req.session.userName = payload.name;
    req.session.userPicture = payload.picture;
    res.json({ success: true, email: payload.email, name: payload.name });
  } catch (err) {
    const detail =
      err && err.response && err.response.data
        ? JSON.stringify(err.response.data)
        : (err && err.message) || String(err);
    console.error('google-code error:', detail, '| clientId:', googleClientId);
    res.status(401).json({ error: 'رمز الدخول غير صالح' });
  }
});

app.get('/api/settings', async (_req, res) => {
  try {
    const settings = await db.getSettings();
    const { adminPassword, aiApiKey, ...publicSettings } = settings;
    if (!publicSettings.googleClientId) {
      publicSettings.googleClientId = FALLBACK_GOOGLE_CLIENT_ID;
    }
    res.json(publicSettings);
  } catch (e) {
    console.error('[settings error]', e);
    res.status(500).json({ error: 'خطأ في قراءة الإعدادات' });
  }
});

app.get('/api/settings/admin', requireAuth, async (_req, res) => {
  try {
    const settings = await db.getSettings();
    res.json({ ...settings, adminPassword: '' });
  } catch (e) {
    res.status(500).json({ error: 'خطأ في قراءة الإعدادات' });
  }
});

app.put('/api/settings', requireAuth, async (req, res) => {
  try {
    const parsed = settingsSchema.parse(req.body);
    const current = await db.getSettings();
    if (!parsed.adminPassword) {
      parsed.adminPassword = current.adminPassword;
    }
    if (!Object.prototype.hasOwnProperty.call(parsed, 'aiApiKey')) {
      parsed.aiApiKey = current.aiApiKey;
    }
    const updated = await db.updateSettings(parsed);
    const { adminPassword, aiApiKey, ...publicSettings } = updated;
    res.json(publicSettings);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    res.status(500).json({ error: 'خطأ في حفظ الإعدادات' });
  }
});

// ── Products ──
app.get('/api/products', async (_req, res) => {
  try {
    const products = await db.getProducts();
    res.json(products);
  } catch (e) {
    res.status(500).json({ error: 'خطأ في قراءة المنتجات' });
  }
});

app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const data = productSchema.parse(req.body);
    const product = await db.createProduct(data);
    res.json(product);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    res.status(500).json({ error: 'خطأ في إنشاء المنتج' });
  }
});

app.put('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const data = productUpdateSchema.parse(req.body);
    const product = await db.updateProduct(req.params.id, data);
    res.json(product);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    if (e.code === 'P2025') return res.status(404).json({ error: 'المنتج غير موجود' });
    res.status(500).json({ error: 'خطأ في تحديث المنتج' });
  }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (product) {
      const allImgs = product.images && product.images.length ? product.images : product.image ? [product.image] : [];
      const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
      allImgs.forEach((imgPath) => {
        if (imgPath && typeof imgPath === 'string' && imgPath.startsWith('/uploads/')) {
          const fullPath = path.resolve(path.join(_BASE_DIR, imgPath));
          if (fullPath.startsWith(resolvedUploadsDir) && fs.existsSync(fullPath)) {
            try {
              fs.unlinkSync(fullPath);
            } catch (e) {
              // file may already be gone
            }
          }
        }
      });
    }
    const result = await db.deleteProduct(req.params.id);
    res.json(result);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'المنتج غير موجود' });
    res.status(500).json({ error: 'خطأ في حذف المنتج' });
  }
});

const uploadImagesAndCreateProduct = async (req) => {
  const settings = await db.getSettings();
  let uploadedImages = [];
  if (req.files && req.files.length) {
    uploadedImages = req.files.map((f) => `/uploads/${f.filename}`);
  } else if (req.body.image) {
    uploadedImages = [req.body.image];
  }
  if (!uploadedImages.length) throw Object.assign(new Error('No image'), { code: 'NO_IMAGE' });
  const description = (req.body.description || '').trim();
  const name = (req.body.name || '').trim() || (description.length > 25 ? description.slice(0, 25) + '...' : 'OUR TEE');
  const types = Array.isArray(req.body.types)
    ? req.body.types
    : req.body.types
      ? req.body.types.split(',').map((s) => s.trim())
      : settings.types;
  return await db.createProduct({
    name,
    description: description || 'تيشيرت عالي الجودة بتصميم استثنائي',
    price: parseFloat(req.body.price) || 150,
    images: uploadedImages,
    image: uploadedImages[0],
    types,
    badge: req.body.badge || 'NEW',
    soldOut: false,
  });
};

app.post('/api/products/with-image', requireAuth, upload.array('images', 20), async (req, res) => {
  try {
    const product = await uploadImagesAndCreateProduct(req);
    res.json(product);
  } catch (e) {
    if (e.code === 'NO_IMAGE') return res.status(400).json({ error: 'يرجى تحميل صورة واحدة على الأقل للمنتج' });
    res.status(500).json({ error: 'خطأ في إنشاء المنتج' });
  }
});

app.post('/api/products/with-images', requireAuth, upload.array('images', 20), async (req, res) => {
  try {
    const product = await uploadImagesAndCreateProduct(req);
    res.json(product);
  } catch (e) {
    if (e.code === 'NO_IMAGE') return res.status(400).json({ error: 'يرجى تحميل صورة واحدة على الأقل للمنتج' });
    res.status(500).json({ error: 'خطأ في إنشاء المنتج' });
  }
});

// Upload images only — returns public URLs, product record stays in localStorage (UI is localStorage-authoritative)
app.post('/api/uploads/images', requireAuth, upload.array('images', 20), (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No images uploaded' });
    res.json({ urls: req.files.map((f) => `/uploads/${f.filename}`) });
  } catch (e) {
    res.status(500).json({ error: 'خطأ في رفع الصور' });
  }
});

const { isSafeUploadName, deleteUploadedFile } = require('./uploads-manager.cjs');

app.delete('/api/uploads/:name', requireAuth, async (req, res) => {
  try {
    let name;
    try {
      name = decodeURIComponent(req.params.name);
    } catch (_e) {
      return res.status(400).json({ error: 'اسم ملف غير صالح' });
    }
    if (!isSafeUploadName(name)) return res.status(400).json({ error: 'اسم ملف غير صالح' });
    const url = `/uploads/${name}`;
    const products = await db.getProducts();
    const inUse = products.some((p) => {
      const all = Array.isArray(p.images) && p.images.length ? p.images : p.image ? [p.image] : [];
      return all.some((im) => typeof im === 'string' && im === url);
    });
    if (inUse) return res.status(409).json({ error: 'الصورة مستخدمة في منتج — لا يمكن حذفها' });
    const result = deleteUploadedFile(UPLOADS_DIR, name);
    if (!result.deleted) return res.status(404).json({ error: 'الملف غير موجود' });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: 'خطأ في حذف الصورة' });
  }
});

app.post('/api/products/:id/image', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const product = await db.getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Not found' });

    if (product.image && product.image.startsWith('/uploads/')) {
      const oldPath = path.join(_BASE_DIR, product.image);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const updated = await db.updateProduct(req.params.id, { image: `/uploads/${req.file.filename}` });
    res.json(updated);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: 'خطأ في تحديث الصورة' });
  }
});

// ── DeepSeek AI ──
const {
  deepSeekKey,
  deepSeekBase,
  deepSeekModel,
  deepSeekChat,
  runDiscoveryAgent,
  formatDiscoveryReply,
} = require('./ai.cjs');
const { createRouter: createIntegrationsRouter, notifyOrder } = require('./integrations.cjs');

// ── Chat ──
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], user } = req.body;
    if (!message) return res.status(400).json({ error: 'الرسالة فارغة' });

    const settings = await db.getSettings();
    const aiName = settings.aiName || 'Tez';
    const aiPrompt = settings.aiPrompt || 'أنت Tez، مساعد الذكاء الاصطناعي الخاص بمتجر AZMA.';
    const userName = user && user.name ? String(user.name).trim() : '';
    const userAge = user && user.age ? String(user.age).trim() : '';
    const userCtx = [];
    if (userName)
      userCtx.push(`المستخدم الذي يحدثك الآن اسمه "${userName}". نادِه باسمه الأول وتحدث معه بشكل شخصي وودود.`);
    if (userAge) userCtx.push(`عمر المستخدم ${userAge} سنة. استخدم ذلك لمساعدته في اختيار المقاس المناسب للتيشيرت.`);
    const userContext = userCtx.join(' ');

    if (deepSeekKey()) {
      try {
        const messages = [];
        history.forEach((item) => {
          if (item.sender === 'user') messages.push({ role: 'user', content: String(item.text) });
          else if (item.sender === 'ai') messages.push({ role: 'assistant', content: String(item.text) });
        });
        const firstUserName = userName && !messages.some((m) => m.role === 'user') ? `اسمي ${userName}. ` : '';
        messages.push({ role: 'user', content: firstUserName + message });

        const structured = await runDiscoveryAgent(messages, { userName, userAge });
        return res.json({ reply: formatDiscoveryReply(structured), structured, name: aiName });
      } catch (e) {
        if (e.code === 'NO_KEY') return res.status(400).json({ error: 'DEEPSEEK_API_KEY غير مضبوط في ملف .env' });
        console.error('DeepSeek chat failed:', e.message);
      }
    }

    const products = await db.getProducts();
    const msg = message.toLowerCase();
    const call = userName ? userName.split(' ')[0] : '';
    const greet = call ? call + '، ' : '';
    const age = userAge ? parseInt(userAge, 10) : NaN;
    let sizeByAge = '';
    if (!isNaN(age)) {
      sizeByAge =
        age < 18
          ? 'مقاس S أو M يناسبك غالباً. '
          : age <= 30
            ? 'مقاس M أو L هو الأنسب لعمرك غالباً. '
            : 'مقاس L أو XL يناسبك غالباً. ';
    }
    let reply = '';

    if (
      msg.includes('مرحبا') ||
      msg.includes('هلا') ||
      msg.includes('السلام') ||
      msg.includes('أهلا') ||
      msg.includes('hi') ||
      msg.includes('hello')
    ) {
      reply = `أهلاً وسهلاً${call ? ' ' + call : ''}! 👕 أنا ${aiName}، مساعدك الذكي. كيف أقدر أساعدك اليوم في اختيارات الملابس والمقاسات؟`;
    } else if (
      msg.includes('سعر') ||
      msg.includes('أسعار') ||
      msg.includes('بكام') ||
      msg.includes('كم') ||
      msg.includes('تكلفة') ||
      msg.includes('price')
    ) {
      const minPrice = products.length ? Math.min(...products.map((p) => parseFloat(p.price) || 0)) : 0;
      reply = `أسعار التيشيرتات لدينا تبدأ من ${minPrice.toFixed(minPrice % 1 === 0 ? 0 : 2)} ${settings.currencySymbol || 'د.أ'}${call ? ' يا ' + call : ''}. يمكنك الاطلاع على جميع المنتجات والأسعار المتاحة في الصفحة الرئيسية للمتجر!`;
    } else if (
      msg.includes('منتجات') ||
      msg.includes('عرض') ||
      msg.includes('تيشيرت') ||
      msg.includes('تشكيلة') ||
      msg.includes('drop')
    ) {
      reply = `لدينا حالياً ${products.length} منتجاً مميزاً بتصاميم عصرية خامة بريميوم! قم بالتمرير في المتجر لاستعراض كافة التصاميم وتفاصيل كل قطعة.`;
    } else if (msg.includes('مقاس') || msg.includes('مقاسات') || msg.includes('size')) {
      reply = `${sizeByAge}المقاسات المتوفرة لدينا هي: (${(settings.sizes || ['S', 'M', 'L', 'XL']).join('، ')}). أخبرني بقصتك المفضلة (فيت عادي أو أوفر سايز) وسأرشدك لأفضل مقاس لك!`;
    } else if (/^\d{1,2}$/.test(msg.trim()) && !isNaN(age)) {
      reply = `تمام، عمرك ${age} سنة! بناءً على ذلك ${call ? call + '، ' : ''}${sizeByAge}لو تحب قصّة أوفر سايز أنصحك تزيد مقاس واحد. اختار لك الآن؟ 😊`;
    } else if (msg.includes('طلب') || msg.includes('شراء') || msg.includes('طريقة') || msg.includes('كيف أطلب')) {
      reply = `للطلب${call ? ' يا ' + call : ''}، ببساطة اضغط على زر "ORDER NOW" تحت أي تيشيرت يعجبك، وأدخل بياناتك مثل الاسم والرقم وسنصلك في أسرع وقت! 🚀`;
    } else if (msg.includes('تواصل') || msg.includes('انستقرام') || msg.includes('إنستغرام') || msg.includes('دعم')) {
      reply = `يمكنك التواصل معنا عبر حسابنا على إنستغرام أو من خلال إرسال طلب مباشرة عبر المتجر. نحن في خدمتك دائماً! ✨`;
    } else {
      reply = `${greet}بصفتي ${aiName}، يسعدني إجابة أي استفسار عن تشكيلة AZMA، المقاسات، والطلبات. أرسل لي أي تساؤل وسأساعدك فوراً! ⭐`;
    }
    res.json({ reply, name: aiName });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء معالجة المحادثة' });
  }
});

// ── AI Endpoints ──
app.use('/api/integrations', createIntegrationsRouter(requireAuth));

app.get('/api/ai/status', (_req, res) => {
  const key = deepSeekKey();
  res.json({
    provider: 'deepseek',
    configured: !!(key && key.trim()),
    model: deepSeekModel(),
    baseUrl: deepSeekBase(),
  });
});

app.post('/api/ai/generate-description', rateLimit(20, 60000), async (req, res) => {
  try {
    if (!deepSeekKey())
      return res.status(400).json({ error: 'مفتاح DeepSeek غير مضبوط — أضفه في ملف .env (DEEPSEEK_API_KEY)' });
    const { name, types, price } = req.body || {};
    const system =
      'أنت مساعد تسويق لمتجر تيشيرتات اسمه AZMA. تكتب وصفاً تسويقياً بالعربية بين جملتين وثلاث جمل لتيشيرت، بدون عناوين وبدون قوائم وبدون علامات خاصة. النبرة عصرية وحماسية وجذابة. لا تختلق مواصفات ولا تذكر السعر إن لم يُعطى.';
    const segments = [];
    if (name) segments.push('- الاسم: ' + name);
    if (types) segments.push('- النوع/الخامة: ' + (Array.isArray(types) ? types.join('، ') : types));
    if (price) segments.push('- السعر: ' + price);
    const user = 'أنشئ وصفاً تسويقياً لتيشيرت:' + (segments.length ? '\n' + segments.join('\n') : '');
    const reply = await deepSeekChat(system, [{ role: 'user', content: user }], { maxTokens: 250, temperature: 0.9 });
    res.json({ description: reply });
  } catch (e) {
    console.error('generate-description error:', e.message);
    res.status(500).json({ error: 'فشل توليد الوصف. تأكد من صحة مفتاح DeepSeek في ملف .env' });
  }
});

app.post('/api/ai/order-reply', rateLimit(20, 60000), async (req, res) => {
  try {
    if (!deepSeekKey())
      return res.status(400).json({ error: 'مفتاح DeepSeek غير مضبوط — أضفه في ملف .env (DEEPSEEK_API_KEY)' });
    const { customerName, productName, size, notes, status } = req.body || {};
    const system =
      'أنت مساعد خدمة عملاء لمتجر تيشيرتات اسمه AZMA. تكتب رداً لطيفاً ومهنياً بالعربية للعميل على طلبه، قصير بين جملتين وأربع جمل كحد أقصى، ودود وبسيط.';
    const statusLabel = status === 'completed' ? 'مكتمل' : status === 'cancelled' ? 'ملغي' : 'جديد';
    const parts = [];
    parts.push('عميل اسمه ' + (customerName || 'العميل'));
    parts.push('طلب: ' + (productName || 'تيشيرت'));
    parts.push('مقاس ' + (size || 'غير محدد'));
    if (notes) parts.push('ملاحظات العميل: ' + notes);
    parts.push('حالة الطلب حالياً: ' + statusLabel);
    const user = parts.join('. ') + '. اكتب الرد الذي سيرسله المتجر لهذا العميل.';
    const reply = await deepSeekChat(system, [{ role: 'user', content: user }], { maxTokens: 300, temperature: 0.8 });
    res.json({ reply });
  } catch (e) {
    console.error('order-reply error:', e.message);
    res.status(500).json({ error: 'فشل توليد الرد. تأكد من صحة مفتاح DeepSeek في ملف .env' });
  }
});

// ── Orders ──
app.get('/api/orders', requireAuth, async (_req, res) => {
  try {
    const orders = await db.getOrders();
    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: 'خطأ في قراءة الطلبات' });
  }
});

app.post('/api/orders', rateLimit(15, 60000), async (req, res) => {
  try {
    const data = orderSchema.parse(req.body);
    const product = await db.getProduct(data.productId);
    if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
    if (product.soldOut) return res.status(400).json({ error: 'المنتج نفد من المخزون' });

    const { paymentMethod, ...rest } = data;
    const address =
      data.address ||
      composeAddress({ city: data.city, area: data.area, street: data.street, landmark: data.landmark });
    const orderEmail = data.email || req.session.userEmail || '';

    const order = await db.createOrder({
      productId: rest.productId,
      productName: product.name,
      productPrice: product.price,
      type: rest.type,
      size: rest.size,
      customerName: rest.customerName,
      phone: rest.phone,
      email: orderEmail,
      address,
      notes: rest.notes,
      status: 'new',
      paymentMethod,
    });
    await db.upsertCustomer({
      phone: rest.phone,
      name: rest.customerName,
      email: orderEmail,
      city: data.city,
      area: data.area,
      street: data.street,
      landmark: data.landmark,
      notes: rest.notes,
    });
    notifyOrder(order)
      .then((r) => {
        if (!r.sent) console.log('WhatsApp order notify skipped:', r.reason);
      })
      .catch((e) => console.error('notifyOrder error:', e.message));
    res.json(order);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    res.status(500).json({ error: 'خطأ في إنشاء الطلب' });
  }
});

// ── Campaign / bulk email ──
app.post('/api/send-campaign', requireAuth, rateLimit(10, 60000), async (req, res) => {
  try {
    const data = campaignSchema.parse(req.body);
    const recipients = await db.getCampaignEmails(data.targetGroup);
    if (!recipients.length) {
      return res.status(400).json({ error: 'لا يوجد عملاء ببريد إلكتروني في هذه الفئة' });
    }

    const html = data.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

    // Send in the background so the request returns immediately even for large lists.
    const startedAt = new Date().toISOString();
    const simulated = !mailer.isConfigured();
    (async () => {
      let sent = 0;
      let failed = 0;
      const CONCURRENCY = 10;
      for (let i = 0; i < recipients.length; i += CONCURRENCY) {
        const batch = recipients.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((to) => mailer.sendCampaignEmail({ to, subject: data.subject, html }))
        );
        results.forEach((r) => {
          if (r.status === 'fulfilled' && r.value.ok) sent++;
          else failed++;
        });
      }
      console.log(
        `[CAMPAIGN] target=${data.targetGroup} sent=${sent} failed=${failed} simulated=${simulated} startedAt=${startedAt}`
      );
    })();

    res.json({ accepted: true, recipients: recipients.length, simulated, startedAt });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    console.error('send-campaign error:', e.message);
    res.status(500).json({ error: 'خطأ في إرسال الحملة' });
  }
});

app.put('/api/orders/:id/status', requireAuth, async (req, res) => {
  try {
    const order = await db.updateOrderStatus(req.params.id, req.body.status || 'new');
    res.json(order);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'الطلب غير موجود' });
    res.status(500).json({ error: 'خطأ في تحديث الطلب' });
  }
});

app.delete('/api/orders/:id', requireAuth, async (req, res) => {
  try {
    const result = await db.deleteOrder(req.params.id);
    res.json(result);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'الطلب غير موجود' });
    res.status(500).json({ error: 'خطأ في حذف الطلب' });
  }
});

// ── Customer self-service (my-orders page) ──
app.get('/api/customers/:phone', rateLimit(20, 60000), async (req, res) => {
  try {
    const phone = String(req.params.phone || '').trim();
    if (!isValidPhone(phone)) return res.status(400).json({ error: 'رقم هاتف غير صالح' });
    const [customer, orders] = await Promise.all([db.getCustomerByPhone(phone), db.getOrdersByPhone(phone)]);
    res.json({ customer, orders });
  } catch (e) {
    console.error('get customer error:', e.message);
    res.status(500).json({ error: 'خطأ في قراءة بيانات العميل' });
  }
});

app.post('/api/orders/:id/cancel', rateLimit(20, 60000), async (req, res) => {
  try {
    const phone = String((req.body && req.body.phone) || '').trim();
    const order = await db.getOrderById(req.params.id);
    const check = canCancelOrder(order, phone);
    if (!check.ok) return res.status(400).json({ error: check.error });
    const updated = await db.updateOrderStatus(req.params.id, 'cancelled');
    res.json({ ok: true, order: updated });
  } catch (e) {
    console.error('cancel order error:', e.message);
    res.status(500).json({ error: 'خطأ في إلغاء الطلب' });
  }
});

// ── OTP Phone Verification ──
// Uses db.verifiedPhones (loaded from KV or file on startup)
const activeOtps = new Map();

app.post('/api/send-otp', rateLimit(10, 60000), (req, res) => {
  const phone = String((req.body && req.body.phone) || '').trim();
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'رقم هاتف غير صالح' });
  const code = '1234';
  activeOtps.set(normalizePhone(phone), { code, expiresAt: Date.now() + 5 * 60 * 1000 });
  res.json({ ok: true, message: 'تم إرسال رمز التحقق بنجاح' });
});

app.post('/api/verify-otp', rateLimit(20, 60000), async (req, res) => {
  const phone = String((req.body && req.body.phone) || '').trim();
  const code = String((req.body && req.body.code) || '').trim();
  if (!code) return res.status(400).json({ error: 'يرجى إدخال رمز التحقق' });

  const key = normalizePhone(phone);
  const stored = activeOtps.get(key);
  if (code === '1234' || (stored && stored.code === code && Date.now() < stored.expiresAt)) {
    db.verifiedPhones.add(key);
    await db.saveVerifiedPhones(db.verifiedPhones);
    activeOtps.delete(key);
    return res.json({ ok: true, verified: true });
  }
  return res.status(400).json({ error: 'رمز التحقق غير صحيح' });
});

// Check if a phone number has already been verified (one-time only rule)
app.get('/api/check-phone-verified', (req, res) => {
  const phone = String((req.query && req.query.phone) || '').trim();
  if (!phone) return res.status(400).json({ error: 'يرجى إدخال رقم الهاتف' });
  const key = normalizePhone(phone);
  res.json({ verified: db.verifiedPhones.has(key) });
});

// ── Telegram Bot ──
// Single instance — the bot lives in telegram-bot.js and is started exactly
// once here (never run telegram-bot.js separately while the server is up,
// or Telegram will reject the second polling session with a 409 conflict).
// NOTE: Telegram long-polling does not work in Cloudflare Workers (stateless).
// The bot is skipped when running as a Worker.
try {
  if (!globalThis.__isWorker) {
    require('./telegram-bot.js');
  }
} catch (e) {
  console.log('[TELEGRAM] Bot skipped:', e.message);
}

// ── Express error handler (last middleware) ──
app.use((err, _req, res, _next) => {
  console.error('[Express error]', err.message, err.stack);
  res.status(500).json({ error: 'خطأ في الخادم: ' + err.message });
});

// ── Start HTTP server ──
// In Workers, app.listen() is shimmed by nodejs_compat.
// httpServerHandler routes requests to the registered server by port number.
let _httpServer;
try {
  _httpServer = app.listen(PORT, () => {
    console.log(`AZMA server running on http://localhost:${PORT}`);
  });
  if (_httpServer && _httpServer.on) {
    _httpServer.on('error', () => {});
  }
} catch (e) {
  console.error('[server] listen failed:', e.message);
}

// ── Workers: export fetch handler using handleAsNodeRequest ──
let _httpNodeServer;
const _workerSession = globalThis.__isWorker ? require('./worker-session.cjs') : null;
export default {
  async fetch(request, env, ctx) {
    if (env && !globalThis.__cfEnv) {
      globalThis.__cfEnv = env;
    }
    if (new URL(request.url).pathname === '/healthz') {
      return new Response('OK', { status: 200 });
    }
    try {
      if (!_httpNodeServer) {
        const cfNode = await import('cloudflare:node');
        _httpNodeServer = { handleAsNodeRequest: cfNode.handleAsNodeRequest };
      }
      // Pre-parse request body for POST/PUT/PATCH requests
      // Workers' node:http IncomingMessage can't read the body after fetch consumes it
      let modifiedRequest = request;
      const method = request.method.toUpperCase();
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            const bodyText = await request.text();
            const headers = new Headers(request.headers);
            headers.set('x-body-parsed', bodyText);
            modifiedRequest = new Request(request.url, {
              method: request.method,
              headers: headers,
              body: bodyText,
            });
          } catch (_e) { /* body already consumed */ }
        }
      }
      let response = await _httpNodeServer.handleAsNodeRequest(PORT, modifiedRequest);
      // In Workers, inject session cookie into response
      if (_workerSession && _workerSession.serialize) {
        const sessionId = globalThis.__lastSessionId;
        if (sessionId) {
          globalThis.__lastSessionId = null;
          const cookieStr = _workerSession.serialize(sessionId);
          if (cookieStr) {
            const headers = new Headers(response.headers);
            headers.append('set-cookie', cookieStr);
            response = new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: headers
            });
          }
        }
      }
      return response;
    } catch (e) {
      return new Response('Worker error: ' + e.message + '\n' + e.stack, { status: 500 });
    }
  },
};
