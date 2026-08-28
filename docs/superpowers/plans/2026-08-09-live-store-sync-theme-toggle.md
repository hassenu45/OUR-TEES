# التحديث الصامت للمتجر + إصلاح فرش التطبيق + الوضع الفاتح — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** صفحة المتجر تتحدث تلقائياً وبصمت كل 20 ثانية (منتجات جديدة تظهر بدون ريفريش)، التطبيق لا يفرش النافذة قسرياً بعد تنزيل التحديث، وإضافة سويتش داكن/فاتح للوحة التحكم مع حفظ الاختيار.

**Architecture:** ثلاثة تغييرات معزولة: (1) في `js/store.js` — فحص دوري + توقيع مقارنة + إعادة رسم صامتة تحافظ على البحث/الترتيب/الفلاتر؛ (2) في `desktop/main.js` + `js/admin.js` — boot update يرسل IPC `{background:true}` بدل `win.reload()` والزر يتحول لـ"أعد التحميل"؛ (3) في `admin.html` + `js/admin.js` — سويتش `.theme-switch` (معزول عن `.switch`/`.slider` الموجودة لأزرار الدفع) + `body.light` overrides + ألوان الرسم البياني بحسب الوضع. الملفات الجذرية هي مصدر الحقيقة؛ `desktop/web` يُبنى بـ `npm run build:web --prefix desktop`.

**Tech Stack:** Vanilla JS (browser scripts)، Electron (main.js)، Chart.js (inline في admin.html)، vitest/eslint (فحوصات).

## Global Constraints

- الردود/الواجهات بالعربية RTL؛ ألوان هوية AZMA: داكن `#0C0A09`، نص `#FAFAF9`، ذهبي `#A16207`.
- الافتراضي **داكن** (الوضع الحالي لا يتغير لأحد)، الاختيار يُحفظ في `localStorage['azma_app_theme']` (مفتاح جديد — لا نلمس `azma_theme` خاص بالمتجر).
- مفتاح التخزين للسويتش الجديد معزول: `id="theme-toggle-app"` (لأن `theme-toggle` مستخدم في store.js).
- كل CSS السويتش الجديد تحت `.theme-switch` (لا نلمس `.switch`/`.slider`/`.toggle` الخاصة بأزرار الدفع في admin.html:634-704).
- مصدر الحقيقة = ملفات الجذر؛ `desktop/web` أرتيفكت يُعاد بناؤه فقط.
- لا تغييرات على `desktop/updater.cjs` أو `updates-manifest.cjs` (لا حاجة؛ الاختبارات الحالية تغطيها).
- عند إعادة الرسم في المتجر: استخدام `filterStoreProducts()`/`sortStoreProducts()` (يعيدان تطبيق البحث/الترتيب/الفلاتر) — ممنوع استدعاء `renderProducts()` مباشرة إلا إذا لم يوجد بحث ولا ترتيب (حالة الترتيب default عبر `sortStoreProducts` أيضاً).
- لا إعادة تحميل للصفحة إطلاقاً في أي مسار من مسارات المزامنة.
- التنبيه "🆕 منتجات جديدة" فقط عند زيادة عدد المنتجات؛ التعديلات/الحذف صامتة.

---

### Task 1: المزامنة الصامتة لصفحة المتجر

**Files:**
- Modify: `js/store.js` (أضف قبل `/* ── Init ── */` سطر 574، وعدّل كتلة `DOMContentLoaded` سطر 575-579)

**Interfaces:**
- Consumes: `API.getProducts()` (موجود، يُرجع مصفوفة منتجات بنفس حقول `renderProducts`)، `filterStoreProducts()` (سطر 282)، `sortStoreProducts()` (سطر 294)، `$('store-search')`، `$('product-count')`، `document.visibilityState`.
- Produces: `productsSignature(list)`, `syncProductsSilently()`, `startLiveSync()` — تُستخدم فقط داخلياً في store.js.

- [ ] **Step 1: إضافة كود المزامنة الصامتة**

أدخل قبل السطر `/* ── Init ── */` (سطر 574) الكود التالي:

```js
/* ── Live product sync (silent — no reload, no flicker) ── */
let liveSyncTimer = null;
let lastProductsSignature = '';
let liveSyncRunning = false;

function productsSignature(list) {
  return (list || []).map(p =>
    `${p.id}|${p.name}|${p.price}|${p.soldOut ? '1' : '0'}|${p.image || ''}|${(p.types || []).join(',')}`
  ).join('~');
}

function showNewProductsToast() {
  const existing = document.querySelector('.cart-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'cart-toast';
  toast.textContent = '🆕 منتجات جديدة أضيفت للمتجر!';
  toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%) translateY(20px);z-index:9999;background:var(--color-foreground);color:var(--color-background);border:2px solid var(--color-border);padding:12px 24px;border-radius:12px;font-weight:700;font-size:14px;box-shadow:6px 6px 0 var(--color-border);opacity:0;transition:all 0.3s cubic-bezier(0.16,1,0.3,1);';
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

async function syncProductsSilently() {
  if (liveSyncRunning || document.visibilityState === 'hidden') return;
  liveSyncRunning = true;
  try {
    const fresh = await API.getProducts();
    const sig = productsSignature(fresh);
    if (sig === lastProductsSignature) return;
    const prevCount = products.length;
    products = fresh;
    lastProductsSignature = sig;
    const q = ($('store-search')?.value || '').trim();
    if (q) filterStoreProducts(); else sortStoreProducts();
    if (fresh.length > prevCount) showNewProductsToast();
  } catch {
    /* keep current data; retry on next tick */
  } finally {
    liveSyncRunning = false;
  }
}

function startLiveSync() {
  lastProductsSignature = productsSignature(products);
  liveSyncTimer = setInterval(syncProductsSilently, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncProductsSilently();
  });
}
```

- [ ] **Step 2: ربط الإقلاع**

عدّل كتلة `DOMContentLoaded` (سطر 575-579) من:

```js
document.addEventListener('DOMContentLoaded', () => {
  initStore();
  initTezChat();
  updateCartUI();
```

إلى:

```js
document.addEventListener('DOMContentLoaded', () => {
  initStore().then(startLiveSync);
  initTezChat();
  updateCartUI();
```

(`initStore` دالة async لا ترمي أبداً — تمسك الأخطاء داخلياً — لذا `then` آمن.)

- [ ] **Step 3: فحص الصيغة**

Run: `node --check js/store.js`
Expected: لا مخرجات أخطاء (exit 0).

- [ ] **Step 4: Commit**

```bash
git add js/store.js
git commit -m "feat(store): silent live product sync every 20s"
```

---

### Task 2: إصلاح فرش التطبيق بعد تنزيل التحديث

**Files:**
- Modify: `desktop/main.js:320-329` (كتلة boot auto-update)
- Modify: `js/admin.js:799-843` (كتلة `initDesktopUpdater`)

**Interfaces:**
- Consumes: `applyUpdate()` (main.js، موجودة)، `win.webContents.send('updater:applied', data)`، `window.azma.onUpdateApplied(cb)` (preload.js يمرر `data` — لا تعديل عليه).
- Produces: حدث `updater:applied` بحقل `{ version, background: true }` من مسار boot؛ في admin.js متغير `pendingReload` — زر `#update-btn` يتحول إلى "أعد التحميل".

- [ ] **Step 1: تعديل boot في `desktop/main.js`**

استبدل الكتلة الحالية (سطر 320-329):

```js
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
```

بـ:

```js
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
```

- [ ] **Step 2: تعديل `js/admin.js` — معالج `onUpdateApplied` + زر "أعد التحميل"**

استبدل كتلة `initDesktopUpdater` الحالية (سطر 799-843) بالكامل بالكود التالي (يحافظ على كل السلوكيات الموجودة ويزيد معالجة background):

```js
/* ── Desktop app self-update (window.azma exists only inside Electron) ── */
(function initDesktopUpdater() {
  if (!window.azma) return;
  const btn = document.getElementById('update-btn');
  const label = document.getElementById('update-label');
  const state = document.getElementById('update-state');
  if (!btn || !state) return;
  btn.style.display = 'flex';
  let pendingReload = false;

  window.azma.onUpdateProgress((p) => {
    if (p.phase === 'download') state.textContent = `${p.done}/${p.total}`;
    else if (p.phase === 'done') state.textContent = 'تم التحديث';
    else if (p.phase === 'error') state.textContent = p.error || 'خطأ';
  });
  window.azma.onUpdateApplied((data) => {
    if (data && data.background) {
      pendingReload = true;
      label.textContent = 'أعد التحميل';
      state.textContent = 'تم تنزيل تحديث جديد ✓';
      showToast('تم تنزيل تحديث جديد — اضغط "أعد التحميل" لتطبيقه');
      return;
    }
    state.textContent = 'جاري إعادة التحميل…';
    setTimeout(() => location.reload(), 1200);
  });

  btn.addEventListener('click', async () => {
    if (pendingReload) {
      location.reload();
      return;
    }
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

  window.azma
    .getStatus()
    .then((s) => {
      if (s && s.version) state.textContent = 'v' + s.version;
    })
    .catch(() => {});
})();
```

- [ ] **Step 3: فحص الصيغة**

Run: `node --check desktop/main.js; node --check js/admin.js`
Expected: لا مخرجات أخطاء.

- [ ] **Step 4: Commit**

```bash
git add desktop/main.js js/admin.js
git commit -m "fix(desktop): no force reload after background update - apply button instead"
```

---

### Task 3: سويتش داكن/فاتح للوحة التحكم

**Files:**
- Modify: `admin.html` — markup السويتش في `.sidebar-logo` (سطر 847-849)، CSS السويتش + `body.light` overrides قبل `</style>` (سطر 813)، ألوان الرسم البياني في `updateChart` (سطر 1446-1499)
- Modify: `js/admin.js` — دالة `initTheme()` + استدعاؤها في `init()` (سطر 781-794)

**Interfaces:**
- Consumes: `localStorage['azma_app_theme']`, `document.body.classList`, `#theme-toggle-app` (input)، `#panel-dashboard` (فحص `active`)، `updateChart()` (دالة عامة معرّفة في inline script في admin.html).
- Produces: `initTheme()` — تطبق `body.light` عند الفتح، تثبّت الحالة، تستمع للتغيير، تحفظ، وتعيد رسم الرسم البياني إن كانت لوحة التحكم ظاهرة.

- [ ] **Step 1: markup السويتش في الشريط الجانبي**

استبدل (سطر 847-849):

```html
      <div class="sidebar-logo">
        <span>AZMA</span>
      </div>
```

بـ:

```html
      <div class="sidebar-logo">
        <span>AZMA</span>
        <label class="theme-switch" title="الوضع الداكن / الفاتح">
          <input type="checkbox" id="theme-toggle-app">
          <span class="theme-slider">
            <svg class="theme-icon theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
            <svg class="theme-icon theme-moon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
          </span>
        </label>
      </div>
```

- [ ] **Step 2: CSS السويتش + الوضع الفاتح**

أدخل قبل سطر `</style>` (سطر 813) الكتلة التالية:

```css
    /* ── THEME SWITCH (sidebar — scoped, لا تتعارض مع .switch لأزرار الدفع) ── */
    .theme-switch {
      position: relative;
      display: inline-flex;
      align-items: center;
      width: 46px;
      height: 24px;
      margin-inline-start: auto;
      flex-shrink: 0;
      cursor: pointer;
    }
    .theme-switch input {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }
    .theme-switch .theme-slider {
      position: absolute;
      inset: 0;
      border-radius: 24px;
      background: #1C1917;
      border: 1px solid rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 5px;
      transition: background 0.35s ease, border-color 0.35s ease;
    }
    .theme-switch .theme-icon {
      width: 14px;
      height: 14px;
      transition: opacity 0.35s ease, transform 0.35s ease;
    }
    .theme-switch .theme-sun { color: #FBBF24; opacity: 0; transform: rotate(90deg) scale(0.6); }
    .theme-switch .theme-moon { color: #E7E5E4; opacity: 1; transform: rotate(0) scale(1); }
    .theme-switch input:checked + .theme-slider {
      background: #F5F5F4;
      border-color: rgba(0,0,0,0.12);
    }
    .theme-switch input:checked + .theme-slider .theme-sun { opacity: 1; transform: rotate(0) scale(1); }
    .theme-switch input:checked + .theme-slider .theme-moon { opacity: 0; transform: rotate(-90deg) scale(0.6); }

    /* ── LIGHT THEME ── */
    body.light { background: #FAFAF9; color: #1C1917; }
    body.light ::-webkit-scrollbar-thumb { background: rgba(161,98,7,0.25); }
    body.light .sidebar { background: #FFFFFF; border-left-color: rgba(0,0,0,0.06); }
    body.light .sidebar-logo { border-bottom-color: rgba(0,0,0,0.06); }
    body.light .sidebar-group-title { color: rgba(28,25,23,0.35); }
    body.light .sidebar-item { color: rgba(28,25,23,0.72); }
    body.light .sidebar-item:hover,
    body.light .sidebar-item.active { background: rgba(161,98,7,0.08); color: #92400E; }
    body.light .sidebar-item:hover svg,
    body.light .sidebar-item.active svg { color: #A16207; }
    body.light .sidebar-badge { background: #A16207; color: #FAFAF9; }
    body.light .sidebar-footer { border-top-color: rgba(0,0,0,0.06); }
    body.light .sidebar-user-avatar { background: #A16207; color: #FAFAF9; }
    body.light .sidebar-user-name { color: #1C1917; }
    body.light .sidebar-user-role { color: rgba(28,25,23,0.45); }
    body.light .main-header { background: rgba(255,255,255,0.85); border-bottom-color: rgba(0,0,0,0.06); }
    body.light .page-title { color: #1C1917; }
    body.light .page-title span { color: rgba(28,25,23,0.4); }
    body.light .menu-toggle { color: #1C1917; }
    body.light .header-datetime { color: rgba(28,25,23,0.55); }
    body.light .card { background: #FFFFFF; border-color: rgba(0,0,0,0.06); box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    body.light .card-title { color: #1C1917; }
    body.light .stat-card { background: #FFFFFF; border-color: rgba(0,0,0,0.06); }
    body.light .stat-card-label { color: rgba(28,25,23,0.5); }
    body.light .stat-card-value { color: #1C1917; }
    body.light .stat-card-change.up { background: rgba(34,197,94,0.12); color: #15803D; }
    body.light .stat-card-change.down { background: rgba(220,38,38,0.12); color: #B91C1C; }
    body.light .settings-card { background: #FFFFFF; border-color: rgba(0,0,0,0.06); }
    body.light .settings-card-title { color: #1C1917; }
    body.light .settings-card-sub { color: rgba(28,25,23,0.5); }
    body.light .form-group label { color: rgba(28,25,23,0.7); }
    body.light .form-input,
    body.light .form-select,
    body.light .form-textarea {
      background: #FFFFFF;
      border-color: rgba(0,0,0,0.12);
      color: #1C1917;
    }
    body.light .form-input:focus,
    body.light .form-select:focus,
    body.light .form-textarea:focus { border-color: #A16207; box-shadow: 0 0 0 3px rgba(161,98,7,0.12); }
    body.light .form-input::placeholder,
    body.light .form-textarea::placeholder { color: rgba(28,25,23,0.35); }
    body.light .form-select option { background: #FFFFFF; color: #1C1917; }
    body.light .btn-outline { border-color: rgba(28,25,23,0.2); color: #1C1917; }
    body.light .btn-outline:hover { border-color: #A16207; color: #A16207; }
    body.light .order-item { border-bottom-color: rgba(0,0,0,0.06); }
    body.light .order-item:hover { background: rgba(161,98,7,0.03); }
    body.light .order-item-info h4 { color: #1C1917; }
    body.light .order-item-info p { color: rgba(28,25,23,0.55); }
    body.light .badge { background: rgba(28,25,23,0.06); color: #1C1917; }
    body.light .empty-state { color: rgba(28,25,23,0.45); }
    body.light .toast { background: rgba(28,25,23,0.95); }
    body.light .modal-overlay { background: rgba(0,0,0,0.45); }
    body.light .modal-content { background: #FFFFFF; border-color: rgba(0,0,0,0.08); color: #1C1917; }
    body.light .product-card { background: #FFFFFF; border-color: rgba(0,0,0,0.06); }
    body.light .product-card h4 { color: #1C1917; }
    body.light .product-card .price { color: #92400E; }
    body.light .sold-out-badge { background: rgba(220,38,38,0.1); color: #B91C1C; }
    body.light .upload-box { background: #FFFFFF; border-color: rgba(0,0,0,0.12); }
    body.light .upload-box:hover { border-color: #A16207; }
    body.light .upload-box span { color: rgba(28,25,23,0.45); }
    body.light .pay-row:hover { border-color: rgba(161,98,7,0.3); background: rgba(161,98,7,0.05); }
    body.light .pay-row.enabled { border-color: rgba(161,98,7,0.35); background: rgba(161,98,7,0.06); }
```

- [ ] **Step 3: ألوان الرسم البياني بحسب الوضع**

في `updateChart()` (admin.html سطر 1438-1505)، أضف في أول الدالة بعد سطر `const { labels, data } = prepareChartData(days, orders);`:

```js
      const isLight = document.body.classList.contains('light');
```

ثم استبدل قيم الألوان داخل `new Chart(...)` بالمتغيرات (فقط القيم المعتمدة على الوضع — القيم اللامتغيرة تبقى):

- `backgroundColor: 'rgba(161,98,7,0.08)'` ← `backgroundColor: isLight ? 'rgba(161,98,7,0.10)' : 'rgba(161,98,7,0.08)'`
- `pointBorderColor: '#0C0A09'` ← `pointBorderColor: isLight ? '#FFFFFF' : '#0C0A09'`
- `tooltip.backgroundColor: '#1C1917'` ← `tooltip.backgroundColor: isLight ? '#292524' : '#1C1917'`
- `tooltip.titleColor: '#FAFAF9'` ← `tooltip.titleColor: isLight ? '#FAFAF9' : '#FAFAF9'` (لا يتغير — تُترك كما هي)
- `grid: { color: 'rgba(255,255,255,0.03)' ... }` (مرتان: x و y) ← `grid: { color: isLight ? 'rgba(28,25,23,0.06)' : 'rgba(255,255,255,0.03)', drawBorder: false }`
- `ticks: { color: 'rgba(250,250,249,0.2)' ... }` (مرتان) ← `ticks: { color: isLight ? 'rgba(28,25,23,0.35)' : 'rgba(250,250,249,0.2)' , ... }`

- [ ] **Step 4: منطق الثيم في `js/admin.js`**

أضف قبل `/* ── Init ── */` (سطر 780) الدالة:

```js
/* ── Theme (dark/light) ── */
function initTheme() {
  const toggle = document.getElementById('theme-toggle-app');
  if (!toggle) return;
  const saved = localStorage.getItem('azma_app_theme');
  const isLight = saved === 'light';
  document.body.classList.toggle('light', isLight);
  toggle.checked = isLight;
  toggle.addEventListener('change', () => {
    const light = toggle.checked;
    document.body.classList.toggle('light', light);
    try { localStorage.setItem('azma_app_theme', light ? 'light' : 'dark'); } catch (e) {}
    const dashboard = document.getElementById('panel-dashboard');
    if (dashboard && dashboard.classList.contains('active') && typeof updateChart === 'function') {
      updateChart();
    }
  });
}
```

ثم استدعِها في `init()` بعد سطر `await loadAllData();`:

```js
  initTheme();
  checkAIStatus();
```

- [ ] **Step 5: فحص الصيغة + فحص بصري**

Run: `node --check js/admin.js`
Expected: لا مخرجات أخطاء.

ثم فحص بصري (المتجر محلي على `http://localhost:3000` — شغّله بـ `node server.js` إن لم يكن يعمل):
1. افتح `http://localhost:3000/admin.html` بالمتطرف (playwright).
2. بدّل السويتش → `body.light` مفعّل، الخلفية فاتحة، الشريط الجانبي أبيض، الرسم البياني واضح.
3. أعد تحميل الصفحة → يبقى الوضع الفاتح (محفوظ).
4. افتح إعدادات الموقع → الحقول فاتحة وقابلة للقراءة. افتح المنتجات → البطاقات/الجدول واضحة.
5. التقط screenshot لكل لوحة وتحقق بصرياً من أي عنصر لم يُغطَّ؛ لو ظهر عنصر داكن على خلفية فاتحة أضف override له في كتلة `body.light` (نفس النمط) وأعد الفحص.

- [ ] **Step 6: Commit**

```bash
git add admin.html js/admin.js
git commit -m "feat(admin): dark/light theme switch in sidebar + chart colors"
```

---

### Task 4: رفع الإصدار + إعادة البناء + الفحوصات الكاملة

**Files:**
- Modify: `VERSION` (الجذر) — 1.0.1 → 1.0.2 (بدون سطر جديد في النهاية، حافظ على النمط الحالي: قيمة فقط بلا newline)

**Interfaces:**
- Consumes: كل ما أنتجته Tasks 1-3.
- Produces: `desktop/web/` محدّث (build)، `VERSION = 1.0.2`، تقرير فحص نهائي.

- [ ] **Step 1: رفع الإصدار**

استبدل محتوى `VERSION` من `1.0.1` إلى `1.0.2` (بلا سطر جديد).

- [ ] **Step 2: الفحوصات الآلية**

Run: `npm test`
Expected: كل الاختبارات (api, db-customers, instagram-oauth, landing, manifest, orders-rules, updater) ناجحة.

Run: `npm run lint`
Expected: eslint نظيف على `server.js db.cjs js/` (يشمل js/store.js و js/admin.js المعدّلين).

- [ ] **Step 3: إعادة بناء نسخة التطبيق المدمجة**

Run: `npm run build:web --prefix desktop`
Expected: `desktop/web/` يتحدث من ملفات الجذر (admin.html, js/store.js, js/admin.js, VERSION=1.0.2).

- [ ] **Step 4: فحص end-to-end للمزامنة الصامتة (playwright)**

1. تأكد أن `node server.js` يعمل محلياً (port 3000).
2. افتح `http://localhost:3000/store.html` → سجّل عدد بطاقات `.ot-card`.
3. عبر API (أو لوحة admin) أضف منتجاً جديداً باسم "Sync-Test" بسعر فريد، ثم من صفحة المتجر انتظر حتى 25 ثانية بدون أي إعادة تحميل → تظهر البطاقة الجديدة تلقائياً + يظهر تنبيه "منتجات جديدة".
4. اكتب كلمة بحث في المتجر وكرر إضافة منتج → البحث يبقى مطبقاً (لا يُمسح) والبطاقة المطابقة تظهر إن طابقت البحث.
5. تحقق: لم يتغير `location` (لا reload)، السلة لم تُمسح، موضع السكرول ثابت.
6. احذف المنتجين التجريبيين من لوحة admin بعد الفحص.
7. افتح store.html في تبويب مخفي (أو غيّر `visibilityState` عبر switchTab بعيداً) وتأكد من توقف الطلبات — عند العودة للتبويب تحديث فوري.

- [ ] **Step 5: Commit**

```bash
git add VERSION desktop/web
git commit -m "chore(release): bump to 1.0.2 + rebuild desktop web bundle"
```

---

### Task 5: النشر (بوابة المستخدم — بعد موافقة صريحة)

- [ ] **Step 1: النشر لـ Railway**

Run (بعد موافقة المستخدم): `npm run deploy`
Expected: `railway up` ناجح + رسالة "AZMA running" في logs.

- [ ] **Step 2: إعادة بناء نسخة التطبيق المثبتة (اختياري — لتفعيل إصلاح main.js)**

Run (بعد موافقة المستخدم): `npm run build --prefix desktop`
ثم تثبيت `desktop/dist/AZMA-Settings-Setup-1.0.2.exe` على جهاز المستخدم.
Expected: بعد أول إقلاع، التطبيق ينزل الملفات الجديدة بصمت ويظهر "أعد التحميل" بدون فرش قسري.

- [ ] **Step 3: تأكيد يدوي أخير من المستخدم**

التحقق على الموقع الحي: أضف منتجاً من `azma.com/admin` وشاهد ظهوره في المتجر الحي خلال ≤20 ثانية بدون ريفريش.
