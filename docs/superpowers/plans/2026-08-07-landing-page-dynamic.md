# صفحة الهبوط الديناميكية — خطة التنفيذ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** تحويل صفحة الهبوط `index.html` إلى صفحة احترافية ببيانات حقيقية: حذف الآراء الوهمية، أرقام حقيقية من المتجر، قسم دروب ديناميكي، وهيرو مربوط بإعدادات لوحة التحكم.

**Architecture:** سكربت مستقل `js/landing.js` (بنمط `js/api.js` / `js/db-local.js`: IIFE + API wrapper مع fallback للسيرفر أو localStorage) يتولى التحميل والرسم. `index.html` يبقى ثابتاً مع عناصر فارغة ذات `id` تملؤها `Landing.init()`. لا تغيير على السيرفر.

**Tech Stack:** Vanilla JS + Express (موجود) + Vitest للاختبارات + Playwright للتحقق النهائي.

## Global Constraints

- لا تعديل على: `server.js`، `store.html`، `admin.html`، `js/db-local.js`، `js/api.js`
- اتباع نمط الكود الموجود: `const/let`، `escapeHtml`، صيغة الأسعار `toFixed(2) + ' ' + رمز العملة`
- لا إضافات أو مكتبات جديدة
- النصوص العربية كما هي؛ تُستبدل فقط الأرقام/الأسماء الوهمية
- أي منتج جديد يُضاف من لوحة التحكم يجب أن يظهر في قسم الدروب وبطاقة الهيرو تلقائياً

---

### Task 1: إنشاء `js/landing.js` مع اختبارات (TDD)

**Files:**
- Create: `js/landing.js`
- Test: `tests/landing.test.js`

**Interfaces:**
- Produces: `Landing.splitHeroTitle(text) → string[]` (1-3 أسطر، توزيع متوازن)
- Produces: `Landing.getAvailableProducts(products) → product[]` (غير المباع، الأحدث أولاً)
- Produces: `Landing.formatPriceText(price, symbol) → string`
- Produces: `Landing.init() → Promise<void>` (ترسم الهيرو والأرقام والدروب)
- Consumes: `API.getSettings()` و `API.getProducts()` (من `js/api.js`، متوفران عالمياً)

- [ ] **Step 1: كتابة الاختبار الفاشل**

Create `tests/landing.test.js`:

```js
const { describe, it, expect } = require('vitest');
const Landing = require('../js/landing.js');

describe('splitHeroTitle', () => {
  it('returns [] for empty text', () => {
    expect(Landing.splitHeroTitle('')).toEqual([]);
    expect(Landing.splitHeroTitle('   ')).toEqual([]);
  });
  it('one word -> one line', () => {
    expect(Landing.splitHeroTitle('AZMA')).toEqual(['AZMA']);
  });
  it('two words -> two lines', () => {
    expect(Landing.splitHeroTitle('WEAR YOUR')).toEqual(['WEAR', 'YOUR']);
  });
  it('three words -> three lines', () => {
    expect(Landing.splitHeroTitle('WEAR YOUR STORY')).toEqual(['WEAR', 'YOUR', 'STORY']);
  });
  it('four words -> balanced 3 lines', () => {
    expect(Landing.splitHeroTitle('A B C D')).toEqual(['A B', 'C', 'D']);
  });
  it('five words -> balanced 3 lines', () => {
    expect(Landing.splitHeroTitle('A B C D E')).toEqual(['A B', 'C D', 'E']);
  });
  it('six words -> 2+2+2', () => {
    expect(Landing.splitHeroTitle('A B C D E F')).toEqual(['A B', 'C D', 'E F']);
  });
  it('seven words -> 3+2+2', () => {
    expect(Landing.splitHeroTitle('A B C D E F G')).toEqual(['A B C', 'D E', 'F G']);
  });
});

describe('getAvailableProducts', () => {
  const mk = (id, soldOut, createdAt) => ({ id, soldOut, createdAt });
  it('filters out sold-out products', () => {
    const out = Landing.getAvailableProducts([mk('a', true, '2026-01-01'), mk('b', false, '2026-01-02')]);
    expect(out.map(p => p.id)).toEqual(['b']);
  });
  it('sorts newest first by createdAt', () => {
    const out = Landing.getAvailableProducts([mk('a', false, '2026-01-01'), mk('b', false, '2026-03-01'), mk('c', false, '2026-02-01')]);
    expect(out.map(p => p.id)).toEqual(['b', 'c', 'a']);
  });
  it('handles missing createdAt', () => {
    const out = Landing.getAvailableProducts([{ id: 'a', soldOut: false }]);
    expect(out.length).toBe(1);
  });
  it('returns [] for null input', () => {
    expect(Landing.getAvailableProducts(null)).toEqual([]);
  });
});

describe('formatPriceText', () => {
  it('formats price with symbol', () => {
    expect(Landing.formatPriceText('6', 'د.أ')).toBe('6.00 د.أ');
  });
  it('uses default symbol when missing', () => {
    expect(Landing.formatPriceText(7.5)).toBe('7.50 د.أ');
  });
  it('handles invalid price', () => {
    expect(Landing.formatPriceText('abc', 'ر.س')).toBe('0.00 ر.س');
  });
});
```

- [ ] **Step 2: تشغيل الاختبار للتأكد من فشله**

Run: `npx vitest run tests/landing.test.js`
Expected: FAIL — `Cannot find module '../js/landing.js'`

- [ ] **Step 3: كتابة التنفيذ**

Create `js/landing.js`:

```js
/* AZMA - Landing Page Controller
   Renders hero, stats and drops from real store data (API or localStorage fallback). */

(function (global) {
  'use strict';

  const PLACEHOLDER =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">' +
        '<rect width="600" height="400" fill="#161616"/>' +
        '<text x="50%" y="50%" fill="#888884" font-family="Arial, sans-serif" font-size="34" text-anchor="middle" dominant-baseline="middle">AZMA</text>' +
        '</svg>'
    );

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function splitHeroTitle(text) {
    if (!text) return [];
    const words = String(text).trim().replace(/\s+/g, ' ').split(' ');
    if (words.length === 1 && words[0] === '') return [];
    if (words.length <= 3) return words;
    const lines = [];
    const base = Math.floor(words.length / 3);
    const rem = words.length % 3;
    const sizes = [];
    for (let i = 0; i < 3; i++) sizes.push(base + (i < rem ? 1 : 0));
    let idx = 0;
    for (let j = 0; j < 3; j++) {
      lines.push(words.slice(idx, idx + sizes[j]).join(' '));
      idx += sizes[j];
    }
    return lines;
  }

  function getAvailableProducts(products) {
    return (products || [])
      .filter(p => !p.soldOut)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function formatPriceText(price, symbol) {
    return (parseFloat(price) || 0).toFixed(2) + ' ' + (symbol || 'د.أ');
  }

  function $(id) {
    return document.getElementById(id);
  }

  function renderHero(settings, available) {
    const badge = $('hero-badge');
    if (badge) badge.innerHTML = '<i></i> ' + escapeHtml(settings.heroBadge || 'NEW DROP');

    const title = $('hero-title');
    if (title) {
      const lines = splitHeroTitle(settings.heroTitle || 'WEAR YOUR STORY');
      title.innerHTML = lines
        .map(line => '<span class="line"><span>' + escapeHtml(line) + '</span></span>')
        .join('');
    }

    const sub = $('hero-sub');
    if (sub) sub.textContent = settings.heroSubtitle || '';

    const visual = $('hero-visual');
    const img = $('hero-card-img');
    const name = $('hero-card-name');
    const price = $('hero-card-price');
    const top = available[0];
    if (!top) {
      if (visual) visual.style.display = 'none';
      return;
    }
    if (img) {
      img.src = top.image || PLACEHOLDER;
      img.onerror = function () { img.src = PLACEHOLDER; };
      img.alt = top.name || 'AZMA';
    }
    if (name) name.textContent = String(top.name || '').toUpperCase();
    if (price) price.textContent = formatPriceText(top.price, settings.currencySymbol);
  }

  function setStat(id, value) {
    const el = $(id);
    if (!el) return;
    el.setAttribute('data-count', String(value));
    el.textContent = String(value);
  }

  function renderStats(settings, products) {
    setStat('stat-total', products.length);
    setStat('stat-available', getAvailableProducts(products).length);
    setStat('stat-sizes', (settings.sizes || []).length);
  }

  function observeDrops() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('#drops-grid .reveal').forEach(el => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll('#drops-grid .reveal').forEach(el => io.observe(el));
  }

  function renderDrops(products, symbol) {
    const grid = $('drops-grid');
    if (!grid) return;
    const available = getAvailableProducts(products);
    if (!available.length) {
      grid.innerHTML =
        '<div class="empty-state">' +
        '<p style="text-align:center;color:var(--tees-muted);font-size:13px;padding:24px;">' +
        'لا توجد منتجات متاحة حالياً — تابعنا لمفاجآت قادمة.</p></div>';
      return;
    }
    grid.innerHTML = available
      .map((p, i) => {
        const imgSrc = p.image || PLACEHOLDER;
        return (
          '<div class="drop-card reveal reveal-d' + ((i % 4) + 1) + '">' +
          '<div class="drop-media">' +
          '<img src="' + imgSrc + '" alt="' + escapeHtml(p.name || '') + '" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'">' +
          (p.badge ? '<span class="drop-badge">' + escapeHtml(p.badge) + '</span>' : '') +
          '</div>' +
          '<div class="drop-body">' +
          '<div>' +
          '<div class="drop-name">' + escapeHtml(String(p.name || '').toUpperCase()) + '</div>' +
          '<div class="drop-desc">' + escapeHtml(p.description || '') + '</div>' +
          '</div>' +
          '<div class="drop-price">' + formatPriceText(p.price, symbol) + '</div>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');
    observeDrops();
  }

  async function init() {
    let settings;
    let products;
    try {
      settings = await API.getSettings();
      products = await API.getProducts();
    } catch (e) {
      return;
    }
    const available = getAvailableProducts(products);
    renderHero(settings, available);
    renderStats(settings, products);
    renderDrops(products, settings.currencySymbol);
  }

  const Landing = {
    splitHeroTitle,
    getAvailableProducts,
    formatPriceText,
    init,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Landing;
  if (global) global.Landing = Landing;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: تشغيل الاختبارات للتأكد من نجاحها**

Run: `npx vitest run tests/landing.test.js`
Expected: PASS (16 assertions)

- [ ] **Step 5: تشغيل lint**

Run: `npm run lint`
Expected: PASS بدون أخطاء في `js/landing.js`

- [ ] **Step 6: Commit**

```bash
git add js/landing.js tests/landing.test.js
git commit -m "feat: landing page controller with dynamic products and real stats"
```

---

### Task 2: تحديث `index.html`

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `Landing.init()` من `js/landing.js`
- Produces: عناصر بمعرّفات: `hero-badge`, `hero-title`, `hero-sub`, `hero-visual`, `hero-card-img`, `hero-card-name`, `hero-card-price`, `stat-total`, `stat-available`, `stat-sizes`, `drops-grid`

- [ ] **Step 1: تعديل CSS — السطر الأصفر يتبع آخر سطر ديناميكياً**

في `index.html` سطر 82، استبدل:

```css
.hero-title .line:nth-child(3) span{color:var(--tees-yellow);animation-delay:.24s}
```

بـ:

```css
.hero-title .line:last-child span{color:var(--tees-yellow);animation-delay:.24s}
```

- [ ] **Step 2: حذف CSS قسم الآراء**

احذف الكتلة كاملة من `index.html` (الأسطر 201-211):

```css
/* TESTIMONIALS */
.testi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.testi-card{display:flex;flex-direction:column;gap:16px;padding:26px 24px;background:var(--tees-card);border:1px solid var(--tees-border);border-radius:12px;transition:transform .25s var(--tees-transition),border-color .25s,box-shadow .25s}
.testi-card:hover{transform:translateY(-6px);border-color:var(--tees-yellow-dim);box-shadow:0 16px 40px rgba(0,0,0,.5)}
.testi-stars{color:var(--tees-yellow);font-size:13px;letter-spacing:3px}
.testi-text{font-size:13.5px;line-height:1.9;opacity:.92}
.testi-person{display:flex;align-items:center;gap:12px;margin-top:auto;padding-top:16px;border-top:1px solid var(--tees-border)}
.testi-avatar{width:42px;height:42px;flex-shrink:0;border-radius:50%;border:1px solid rgba(245,200,66,.35);background:linear-gradient(135deg,rgba(245,200,66,.35),rgba(245,200,66,.08));display:flex;align-items:center;justify-content:center;font-family:var(--tees-display);font-size:18px;color:var(--tees-yellow)}
.testi-name{font-size:13px;font-weight:800}
.testi-role{font-size:11px;color:var(--tees-muted)}
@media(max-width:820px){.testi-grid{grid-template-columns:1fr}}
```

- [ ] **Step 3: إضافة معرّفات للهيرو**

استبدل سطر الشارة (سطر 287):

```html
<div class="hero-badge"><i></i> NEW DROP — SPRING 2026</div>
```

بـ:

```html
<div class="hero-badge" id="hero-badge"><i></i> NEW DROP</div>
```

استبدل كتلة العنوان (الأسطر 288-292):

```html
<h1 class="hero-title">
    <span class="line"><span>WEAR YOUR</span></span>
    <span class="line"><span>ATTITUDE.</span></span>
    <span class="line"><span>OWN YOUR STYLE.</span></span>
</h1>
```

بـ:

```html
<h1 class="hero-title" id="hero-title">
    <span class="line"><span>WEAR YOUR STORY</span></span>
</h1>
```

استبدل الوصف (سطر 293):

```html
<p class="hero-sub">تشكيلات حصرية من التيشيرتات المصممة بعناية — قطن بريميوم، مقاسات مريحة، وقطع محدودة لا تتكرر. خلي أسلوبك يتكلم عنك.</p>
```

بـ:

```html
<p class="hero-sub" id="hero-sub"></p>
```

استبدل البطاقة (الأسطر 300-310):

```html
<div class="hero-visual">
    <div class="hero-stamp">DROP 01</div>
    <div class="hero-card">
        <img src="https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80" alt="Premium Tee" fetchpriority="high" decoding="async">
        <div class="hero-card-body">
            <div class="hero-card-name">CLASSIC TEE</div>
            <div class="hero-card-price">29.99 ر.س</div>
        </div>
    </div>
    <div class="hero-stamp-2"><b>●</b> 100% قطن عضوي</div>
</div>
```

بـ:

```html
<div class="hero-visual" id="hero-visual">
    <div class="hero-stamp">DROP 01</div>
    <div class="hero-card">
        <img id="hero-card-img" src="https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80" alt="Premium Tee" fetchpriority="high" decoding="async">
        <div class="hero-card-body">
            <div class="hero-card-name" id="hero-card-name">CLASSIC TEE</div>
            <div class="hero-card-price" id="hero-card-price">0.00 د.أ</div>
        </div>
    </div>
    <div class="hero-stamp-2"><b>●</b> 100% قطن عضوي</div>
</div>
```

- [ ] **Step 4: استبدال أرقام القسم بأرقام حقيقية**

استبدل كتلة `stats-grid` كاملة (الأسطر 332-337):

```html
<div class="stats-grid">
    <div class="stat-item reveal reveal-d1"><div class="stat-num" data-count="250" data-suffix="+">0</div><div class="stat-label">قطعة مُصممة</div></div>
    <div class="stat-item reveal reveal-d2"><div class="stat-num" data-count="12" data-suffix="+">0</div><div class="stat-label">دروب حصرية</div></div>
    <div class="stat-item reveal reveal-d3"><div class="stat-num" data-count="24" data-suffix="س">0</div><div class="stat-label">شحن سريع</div></div>
    <div class="stat-item reveal reveal-d4"><div class="stat-num" data-count="4.9" data-decimals="1" data-suffix="/5">0</div><div class="stat-label">تقييم العملاء</div></div>
</div>
```

بـ:

```html
<div class="stats-grid">
    <div class="stat-item reveal reveal-d1"><div class="stat-num" id="stat-total" data-count="0">0</div><div class="stat-label">إجمالي المنتجات</div></div>
    <div class="stat-item reveal reveal-d2"><div class="stat-num" id="stat-available" data-count="0">0</div><div class="stat-label">متاح الآن</div></div>
    <div class="stat-item reveal reveal-d3"><div class="stat-num" id="stat-sizes" data-count="0">0</div><div class="stat-label">مقاسات متوفرة</div></div>
    <div class="stat-item reveal reveal-d4"><div class="stat-num" data-count="24" data-suffix="س">0</div><div class="stat-label">شحن سريع</div></div>
</div>
```

واستبدل النص الفرعي (سطر 330):

```html
<p class="section-sub">نتائج حقيقية من مجتمع AZMA.</p>
```

بـ:

```html
<p class="section-sub">أرقام حقيقية من متجر AZMA.</p>
```

- [ ] **Step 5: تفريغ قسم الدروب**

استبدل كتلة `drops-grid` كاملة (الأسطر 380-432) — كل بطاقات الدروب الأربع الثابتة — بالحاوية الفارغة:

```html
<div class="drops-grid" id="drops-grid"></div>
```

واستبدل النص الفرعي (سطر 378):

```html
<p class="section-sub">أحدث القطع المتاحة الآن في المتجر.</p>
```

بـ:

```html
<p class="section-sub">أحدث المنتجات المتاحة — تتحدث تلقائياً من المتجر.</p>
```

- [ ] **Step 6: حذف قسم الآراء بالكامل**

احذف كتلة `section id="reviews"` كاملة (الأسطر 436-479): من `<section class="section" id="reviews">` حتى `</section>` قبل قسم الـ FAQ مباشرة (لا تحذف ترويسة FAQ).

- [ ] **Step 7: إضافة السكربتات وتشغيل التهيئة**

أضف قبل `</body>` مباشرة (بعد سكربت auth الأخير، سطر ~669):

```html
<script src="js/db-local.js"></script>
<script src="js/api.js"></script>
<script src="js/landing.js"></script>
<script>if (window.Landing) Landing.init();</script>
```

- [ ] **Step 8: التحقق اليدوي السريع من البنية**

- استخدم Glob/Read للتأكد من عدم بقاء أي `testi-` أو `reviews` في `index.html`
- التأكد من وجود: `id="drops-grid"`, `id="hero-card-img"`, `id="stat-total"`, `id="stat-available"`, `id="stat-sizes"`
- التأكد من عدم وجود أسماء مختلقة (سارة العتيبي، عبدالله الشمري، نورة القحطاني) ولا "4.9" ولا "250" ولا "12+" ولا "دروب حصرية"

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "feat: landing page uses real store data, removes fake testimonials"
```

---

### Task 3: التحقق الشامل (سيرفر + متصفح + منتج جديد)

**Files:**
- Test: `tests/landing.test.js` (تشغيل)
- No source changes unless a defect is found (ثم استخدم systematic-debugging)

**Interfaces:**
- Consumes: `js/landing.js`, `index.html` المحدّث، سيرفر `server.js` على منفذ بديل

- [ ] **Step 1: تشغيل الاختبارات والفحوصات**

Run: `npx vitest run tests/landing.test.js; if ($?) { npm run lint }`
Expected: كل الاختبارات PASS وlint نظيف

- [ ] **Step 2: التحقق في الوضع المحلي (file://) — اختبار "المنتج الجديد يظهر تلقائياً"**

افتح عبر Playwright: `file:///C:/Users/hak/Desktop/Our%20Tees/index.html`

تأكد من:
1. قسم "اللي لبسوا حكوا" غير موجود — `expect(page.getByText('اللي لبسوا حكوا')).toHaveCount(0)`
2. "إجمالي المنتجات" يعرض 4 (المنتجات الافتراضية) و"متاح الآن" يعرض 3 (p3 مباع)
3. قسم الدروب يعرض 3 بطاقات: CLASSIC TEE، VINTAGE TEE، LIMITED TEE — وليس PREMIUM TEE
4. شارة الهيرو = "SUMMER DROP 2025" (من الإعدادات) والعنوان 3 أسطر آخرها أصفر، والسعر بصيغة "د.أ"

ثم حقن منتج جديد ومحاكاة إضافته من لوحة التحكم:

```js
DB.createProduct({ name: 'New Drop Tee', description: 'Fresh drop', price: 12, image: '', badge: 'NEW' });
```

أعد تحميل الصفحة وتأكد من:
5. NEW DROP TEE تظهر **أول بطاقة** في قسم الدروب
6. بطاقة الهيرو تعرض NEW DROP TEE بالسعر 12.00 د.أ
7. "إجمالي المنتجات" = 5

ثم نظّف: `DB.deleteProduct(DB.getProducts().find(p => p.name === 'New Drop Tee').id)` وأعد التحميل للتأكد من عودة الصفحة لحالتها (4 منتجات).

- [ ] **Step 3: التحقق في وضع السيرفر**

Run (منفذ بديل لتجنب تعارض 3000): `$env:PORT=3011; node server.js` (أو `node server.js` إذا كان المنفذ متاحاً)

افتح عبر Playwright: `http://localhost:3011/index.html` (أو 3000)

تأكد من:
1. قسم الدروب يعرض المنتجات القادمة من `/api/products` (البيانات الحقيقية في `data/products.json`)
2. الأسعار بعملة الإعدادات الحالية
3. لا توجد أي آثار لمحتوى وهمي (أسماء/أرقام مختلقة)
4. سجل الـ console خالٍ من أخطاء JavaScript

أوقف السيرفر بعد التحقق (Ctrl+C / kill).

- [ ] **Step 4: Commit (لو وُجدت إصلاحات)**

```bash
git add -A
git commit -m "fix: landing page verification fixes"
```
(في حال لم توجد إصلاحات، تخطَّ الخطوة)
