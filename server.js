const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { OAuth2Client } = require('google-auth-library');
const { z } = require('zod');
const db = require('./db.cjs');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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

const orderSchema = z.object({
  productId: z.string().min(1).max(50),
  type: z.string().max(50).optional().default(''),
  size: z.string().min(1).max(20),
  customerName: z.string().min(1).max(100).transform(s => s.trim()),
  phone: z.string().min(1).max(30).transform(s => s.trim()),
  address: z.string().max(200).optional().default('').transform(s => s.trim()),
  notes: z.string().max(500).optional().default('').transform(s => s.trim()),
});

const settingsSchema = z.object({
  siteName: z.string().max(100).optional(),
  currency: z.string().max(10).optional(),
  currencySymbol: z.string().max(10).optional(),
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
  designTokens: z.object({
    primary: z.string().optional(),
    accent: z.string().optional(),
    background: z.string().optional(),
    fontHeading: z.string().optional(),
    fontBody: z.string().optional(),
  }).optional(),
});

// ── Rate Limiter ──
const requestCounts = new Map();
function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    if (!requestCounts.has(ip)) requestCounts.set(ip, []);
    const timestamps = requestCounts.get(ip).filter(ts => ts > windowStart);
    if (timestamps.length >= maxRequests) {
      return res.status(429).json({ error: 'طلبات كثيرة جداً، يرجى المحاولة بعد قليل' });
    }
    timestamps.push(now);
    requestCounts.set(ip, timestamps);
    next();
  };
}

// ── Multer ──
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

// ── Middleware ──
app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'our-tees-secure-secret-key-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 },
}));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// ── Static Files ──
const ALLOWED_STATIC_EXT = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2']);
app.use((req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();
  if (ext && !ALLOWED_STATIC_EXT.has(ext)) return next();
  express.static(__dirname, { fallthrough: true })(req, res, next);
});
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'store.html')));

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Auth ──
app.post('/api/login', rateLimit(10, 60000), async (req, res) => {
  try {
    const settings = await db.getSettings();
    if (req.body.password && req.body.password === settings.adminPassword) {
      req.session.authenticated = true;
      req.session.isAdmin = true;
      req.session.userEmail = 'admin@ourtees.local';
      req.session.userName = 'Admin';
      return res.json({ success: true });
    }
    res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  } catch (e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
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
  });
});

app.post('/api/auth/google', rateLimit(10, 60000), async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'رمز Google مفقود' });
  try {
    const settings = await db.getSettings();
    const googleClientId = settings.googleClientId || '936102724775-9megvda475titral1ujoote0vlka2sk1.apps.googleusercontent.com';
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
app.get('/api/settings', async (_req, res) => {
  try {
    const settings = await db.getSettings();
    const { adminPassword, aiApiKey, ...publicSettings } = settings;
    res.json(publicSettings);
  } catch (e) {
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
    const data = productSchema.partial().parse(req.body);
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
      const allImgs = product.images && product.images.length ? product.images : (product.image ? [product.image] : []);
      const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
      allImgs.forEach(imgPath => {
        if (imgPath && typeof imgPath === 'string' && imgPath.startsWith('/uploads/')) {
          const fullPath = path.resolve(path.join(__dirname, imgPath));
          if (fullPath.startsWith(resolvedUploadsDir) && fs.existsSync(fullPath)) {
            try { fs.unlinkSync(fullPath); } catch (e) {}
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
    uploadedImages = req.files.map(f => `/uploads/${f.filename}`);
  } else if (req.body.image) {
    uploadedImages = [req.body.image];
  }
  if (!uploadedImages.length) throw Object.assign(new Error('No image'), { code: 'NO_IMAGE' });
  const description = (req.body.description || '').trim();
  const name = (req.body.name || '').trim() || (description.length > 25 ? description.slice(0, 25) + '...' : 'OUR TEE');
  const types = Array.isArray(req.body.types) ? req.body.types : (req.body.types ? req.body.types.split(',').map(s => s.trim()) : settings.types);
  return db.createProduct({
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

app.post('/api/products/with-image', requireAuth, upload.array('images', 10), async (req, res) => {
  try {
    const product = await uploadImagesAndCreateProduct(req);
    res.json(product);
  } catch (e) {
    if (e.code === 'NO_IMAGE') return res.status(400).json({ error: 'يرجى تحميل صورة واحدة على الأقل للمنتج' });
    res.status(500).json({ error: 'خطأ في إنشاء المنتج' });
  }
});

app.post('/api/products/with-images', requireAuth, upload.array('images', 10), async (req, res) => {
  try {
    const product = await uploadImagesAndCreateProduct(req);
    res.json(product);
  } catch (e) {
    if (e.code === 'NO_IMAGE') return res.status(400).json({ error: 'يرجى تحميل صورة واحدة على الأقل للمنتج' });
    res.status(500).json({ error: 'خطأ في إنشاء المنتج' });
  }
});

app.post('/api/products/:id/image', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const product = await db.getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Not found' });

    if (product.image && product.image.startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, product.image);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const updated = await db.updateProduct(req.params.id, { image: `/uploads/${req.file.filename}` });
    res.json(updated);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: 'خطأ في تحديث الصورة' });
  }
});

// ── Chat ──
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'الرسالة فارغة' });

    const settings = await db.getSettings();
    const aiName = settings.aiName || 'Tez';
    const aiPrompt = settings.aiPrompt || 'أنت Tez، مساعد الذكاء الاصطناعي الخاص بمتجر Our Tees.';
    const apiKey = process.env.GEMINI_API_KEY || settings.aiApiKey;

    if (apiKey && apiKey.trim() !== '') {
      try {
        const contents = [
          { role: 'user', parts: [{ text: `تعليمات النظام: ${aiPrompt}\nاسمك: ${aiName}` }] },
          { role: 'model', parts: [{ text: `أهلاً بك! أنا ${aiName}، كيف يمكنني مساعدتك اليوم؟` }] },
        ];
        history.forEach(item => {
          if (item.sender === 'user') contents.push({ role: 'user', parts: [{ text: item.text }] });
          else if (item.sender === 'ai') contents.push({ role: 'model', parts: [{ text: item.text }] });
        });
        contents.push({ role: 'user', parts: [{ text: message }] });

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents }),
        });
        const data = await response.json();
        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
          return res.json({ reply: data.candidates[0].content.parts[0].text, name: aiName });
        }
      } catch (e) {
        console.error('Gemini API call failed:', e.message);
      }
    }

    const products = await db.getProducts();
    const msg = message.toLowerCase();
    let reply = '';

    if (msg.includes('مرحبا') || msg.includes('هلا') || msg.includes('السلام') || msg.includes('أهلا') || msg.includes('hi') || msg.includes('hello')) {
      reply = `أهلاً وسهلاً بك في متجر Our Tees! 👕 أنا ${aiName}، مساعدك الذكي. كيف أقدر أساعدك اليوم في اختيارات الملابس والمقاسات؟`;
    } else if (msg.includes('سعر') || msg.includes('أسعار') || msg.includes('بكام') || msg.includes('كم') || msg.includes('تكلفة') || msg.includes('price')) {
      reply = `أسعار التيشيرتات لدينا تبدأ من 150 ${settings.currencySymbol || 'ر.س'}. يمكنك الاطلاع على جميع المنتجات والأسعار المتاحة في الصفحة الرئيسية للمتجر!`;
    } else if (msg.includes('منتجات') || msg.includes('عرض') || msg.includes('تيشيرت') || msg.includes('تشكيلة') || msg.includes('drop')) {
      reply = `لدينا حالياً ${products.length} منتجاً مميزاً بتصاميم عصرية خامة بريميوم! قم بالتمرير في المتجر لاستعراض كافة التصاميم وتفاصيل كل قطعة.`;
    } else if (msg.includes('مقاس') || msg.includes('مقاسات') || msg.includes('size')) {
      reply = `المقاسات المتوفرة لدينا هي: (${(settings.sizes || ['S', 'M', 'L', 'XL']).join('، ')}). جميع تيشيرتاتنا تأتي بصلابة وجودة عالية ومقاسات مريحة وstandard.`;
    } else if (msg.includes('طلب') || msg.includes('شراء') || msg.includes('طريقة') || msg.includes('كيف أطلب')) {
      reply = `للطلب، ببساطة اضغط على زر "ORDER NOW" تحت أي تيشيرت يعجبك، وأدخل بياناتك مثل الاسم والرقم وسنصلك في أسرع وقت! 🚀`;
    } else if (msg.includes('تواصل') || msg.includes('انستقرام') || msg.includes('إنستغرام') || msg.includes('دعم')) {
      reply = `يمكنك التواصل معنا عبر حسابنا على إنستغرام أو من خلال إرسال طلب مباشرة عبر المتجر. نحن في خدمتك دائماً! ✨`;
    } else {
      reply = `أهلاً بك! بصفتي ${aiName}، يسعدني إجابة أي استفسار عن تشكيلة Our Tees، المقاسات، والطلبات. أرسل لي أي تساؤل وسأساعدك فوراً! ⭐`;
    }
    res.json({ reply, name: aiName });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء معالجة المحادثة' });
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

    const order = await db.createOrder({
      productId: data.productId,
      productName: product.name,
      productPrice: product.price,
      type: data.type,
      size: data.size,
      customerName: data.customerName,
      phone: data.phone,
      address: data.address || '',
      notes: data.notes || '',
      status: 'new',
    });
    res.json(order);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    res.status(500).json({ error: 'خطأ في إنشاء الطلب' });
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

app.listen(PORT, () => {
  console.log(`Our Tees running at http://localhost:${PORT}`);
  console.log(`Store:  http://localhost:${PORT}/store.html`);
  console.log(`Admin:  http://localhost:${PORT}/login.html`);
});
