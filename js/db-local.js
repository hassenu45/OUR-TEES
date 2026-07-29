/* Our Tees - Local Database (No Server Needed)
   All data stored in localStorage, seeded from embedded defaults */

const DB = (() => {
  const DB_KEY = 'ourtees_db';
  const LATEST_VERSION = 2;

  /* ── Embedded Default Data ── */
  const DEFAULT_SETTINGS = {
    id: 1,
    siteName: 'OUR TEES',
    currency: 'SAR',
    currencySymbol: 'ر.س',

    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    types: ['قطن كلاسيك', 'فينتاج', 'بريميوم', 'oversized'],
    heroBadge: 'NEW DROP',
    heroDrop: 'DROP 01 — SPRING 2026',
    heroTitle: 'WEAR YOUR ATTITUDE.',
    heroSubtitle: 'Premium tees crafted for those who refuse to blend in. Limited runs. Bold designs. Zero compromise.',
    aboutTitle: 'BUILT DIFFERENT.',
    aboutText: 'Our Tees started in a garage with one screen printer and a refusal to make boring clothes. Every drop is designed in-house, printed in small batches, and built to last.',
    aiName: 'Tez',
    aiWelcome: 'أهلاً بك! أنا Tez، المساعد الذكي لمتاجر Our Tees. كيف يمكنني مساعدتك اليوم؟',
    aiPrompt: 'أنت Tez، مساعد الذكاء الاصطناعي الخاص بمتجر الملابس والأزياء العصرية Our Tees. تجيب على استفسارات العملاء بلغة عربية عصرية ولطيفة ومباشرة، وتساعدهم في اختيار المقاسات والتصاميم والإجابة عن الأسئلة المتعلقة بالمنتجات والطلب والشحن.',
    aiApiKey: '',
    designTokens: {
      primary: '#1C1917',
      accent: '#A16207',
      background: '#FAFAF9',
      fontHeading: 'Cormorant',
      fontBody: 'Montserrat',
    },
    updatedAt: new Date().toISOString(),
  };

  const DEFAULT_PRODUCTS = [
    { id: 'p1', name: 'Classic Tee', description: '100% organic cotton · Relaxed fit', price: 29.99, image: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=600&q=80', images: [], types: ['قطن كلاسيك', 'oversized'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], badge: 'BESTSELLER', soldOut: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'p2', name: 'Vintage Tee', description: 'Garment-dyed · Washed finish', price: 34.99, image: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600&q=80', images: [], types: ['فينتاج'], sizes: ['S', 'M', 'L', 'XL'], badge: '', soldOut: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'p3', name: 'Premium Tee', description: 'Heavyweight 220gsm · Oversized', price: 39.99, image: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600&q=80', images: [], types: ['بريميوم', 'oversized'], sizes: ['M', 'L', 'XL', 'XXL'], badge: 'SOLD OUT', soldOut: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'p4', name: 'Limited Tee', description: 'Artist collab · Only 200 made', price: 49.99, image: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=600&q=80', images: [], types: ['قطن كلاسيك', 'بريميوم'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], badge: 'NEW', soldOut: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];

  /* ── Initialise DB if needed ── */
  function init() {
    let db;
    try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch { db = null; }

    if (!db || !db.version || db.version < LATEST_VERSION) {
      db = {
        version: LATEST_VERSION,
        settings: DEFAULT_SETTINGS,
        products: DEFAULT_PRODUCTS,
        orders: [],
      };
      save(db);
    }
    return db;
  }

  function save(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

  function load() {
    let db;
    try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch { db = null; }
    if (!db) db = init();
    return db;
  }

  /* ── Seed helper for FormData images ── */
  function generateId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4); }

  /* ── Public API ── */
  return {
    init,

    /* Settings */
    getSettings() {
      const db = load();
      const s = { ...db.settings };
      delete s.adminPassword;
      delete s.aiApiKey;
      return s;
    },

    getAdminSettings() {
      const db = load();
      return { ...db.settings, adminPassword: '' };
    },

    updateSettings(data) {
      const db = load();
      db.settings = { ...db.settings, ...data, updatedAt: new Date().toISOString() };
      save(db);
      const s = { ...db.settings };
      delete s.adminPassword;
      delete s.aiApiKey;
      return s;
    },

    /* Products */
    getProducts() {
      const db = load();
      return [...db.products];
    },

    getProduct(id) {
      const db = load();
      return db.products.find(p => p.id === id) || null;
    },

    createProduct(data) {
      const db = load();
      const product = {
        id: generateId(),
        ...data,
        images: data.images || [],
        image: data.image || (data.images && data.images.length ? data.images[0] : ''),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.products.push(product);
      save(db);
      return product;
    },

    updateProduct(id, data) {
      const db = load();
      const idx = db.products.findIndex(p => p.id === id);
      if (idx === -1) throw Object.assign(new Error('Product not found'), { code: 'P2025' });
      db.products[idx] = { ...db.products[idx], ...data, updatedAt: new Date().toISOString() };
      save(db);
      return db.products[idx];
    },

    deleteProduct(id) {
      const db = load();
      const idx = db.products.findIndex(p => p.id === id);
      if (idx === -1) throw Object.assign(new Error('Product not found'), { code: 'P2025' });
      const p = db.products.splice(idx, 1)[0];
      save(db);
      return p;
    },

    /* Orders */
    getOrders() {
      const db = load();
      return [...db.orders];
    },

    createOrder(data) {
      const db = load();
      const order = {
        id: 'o' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
        ...data,
        status: 'new',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.orders.push(order);
      save(db);
      return order;
    },

    updateOrderStatus(id, status) {
      const db = load();
      const idx = db.orders.findIndex(o => o.id === id);
      if (idx === -1) throw Object.assign(new Error('Order not found'), { code: 'P2025' });
      db.orders[idx] = { ...db.orders[idx], status, updatedAt: new Date().toISOString() };
      save(db);
      return db.orders[idx];
    },

    deleteOrder(id) {
      const db = load();
      const idx = db.orders.findIndex(o => o.id === id);
      if (idx === -1) throw Object.assign(new Error('Order not found'), { code: 'P2025' });
      const o = db.orders.splice(idx, 1)[0];
      save(db);
      return o;
    },

    /* Chat */
    sendChat(message, history) {
      const db = load();
      const settings = db.settings;
      const aiName = settings.aiName || 'Tez';
      const aiPrompt = settings.aiPrompt || '';
      const apiKey = settings.aiApiKey || '';
      const msg = message.toLowerCase();

      let reply = '';

      if (msg.includes('مرحبا') || msg.includes('هلا') || msg.includes('السلام') || msg.includes('أهلا') || msg.includes('hi') || msg.includes('hello')) {
        reply = `أهلاً وسهلاً بك في متجر Our Tees! 👕 أنا ${aiName}، مساعدك الذكي. كيف أقدر أساعدك اليوم في اختيارات الملابس والمقاسات؟`;
      } else if (msg.includes('سعر') || msg.includes('أسعار') || msg.includes('بكام') || msg.includes('كم') || msg.includes('تكلفة') || msg.includes('price')) {
        reply = `أسعار التيشيرتات لدينا تبدأ من 150 ${settings.currencySymbol || 'ر.س'}. يمكنك الاطلاع على جميع المنتجات والأسعار المتاحة في الصفحة الرئيسية للمتجر!`;
      } else if (msg.includes('منتجات') || msg.includes('عرض') || msg.includes('تيشيرت') || msg.includes('تشكيلة') || msg.includes('drop')) {
        reply = `لدينا حالياً ${db.products.length} منتجاً مميزاً بتصاميم عصرية خامة بريميوم! قم بالتمرير في المتجر لاستعراض كافة التصاميم وتفاصيل كل قطعة.`;
      } else if (msg.includes('مقاس') || msg.includes('مقاسات') || msg.includes('size')) {
        reply = `المقاسات المتوفرة لدينا هي: (${(settings.sizes || ['S', 'M', 'L', 'XL']).join('، ')}). جميع تيشيرتاتنا تأتي بصلابة وجودة عالية ومقاسات مريحة.`;
      } else if (msg.includes('طلب') || msg.includes('شراء') || msg.includes('طريقة') || msg.includes('كيف أطلب')) {
        reply = `للطلب، ببساطة اضغط على زر "ORDER NOW" تحت أي تيشيرت يعجبك، وأدخل بياناتك مثل الاسم والرقم وسنصلك في أسرع وقت! 🚀`;
      } else if (msg.includes('تواصل') || msg.includes('انستقرام') || msg.includes('إنستغرام') || msg.includes('دعم')) {
        reply = `يمكنك التواصل معنا عبر حسابنا على إنستغرام أو من خلال إرسال طلب مباشرة عبر المتجر. نحن في خدمتك دائماً! ✨`;
      } else {
        reply = `أهلاً بك! بصفتي ${aiName}، يسعدني إجابة أي استفسار عن تشكيلة Our Tees، المقاسات، والطلبات. أرسل لي أي تساؤل وسأساعدك فوراً! ⭐`;
      }

      return { reply, name: aiName };
    },
  };
})();

/* Run init immediately */
DB.init();
