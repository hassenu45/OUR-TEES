# قائمة العناوين المحفوظة (Saved Delivery Addresses) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** استبدال تعبئة بيانات التوصيل التلقائية (للمسجل) بقائمة عناوين محفوظة: الفورم يفتح فارغاً، العميل يختار من قائمته أو يكتب جديداً، والعنوان يُحفظ تلقائياً عند إرسال الطلب.

**Architecture:** منطق القائمة النقي في `address-book.cjs` (تطبيع، مطابقة، إضافة/تحديث، حذف، سقف 10) + ثلاث نقاط API في `server.js` بدل نقطة التخزين المفردة القديمة + واجهة `my-orders.html`/`js/my-orders.js` تعرض القائمة فوق الفورم وتحذف المحرر القديم. التخزين يبقى `data/delivery-info.json` لكن بصيغة `{ email: [address, ...] }` مع توافق رجعي للصيغة القديمة (كائن واحد).

**Tech Stack:** Express (server.js) + Node CJS + vitest + HTML/CSS/JS نقي (لا إطار عمل).

## Global Constraints

- اللغة عربية RTL في كل الواجهات. هوية AZMA: خلفية داكنة، ذهبي `#F5C842`.
- النقاط محمية بمصادقة الجلسة (`req.session.authenticated && req.session.userEmail`) — غير المسجل يحصل 401.
- نقاط الكتابة محمية بـ `rateLimit(30, 60000)` (النمط الموجود في server.js).
- الحقول القصوى: name 60، phone 20، city/district/area 40، street/landmark 60.
- سقف العناوين: `MAX_ADDRESSES = 10` — ما بعده 400 برسالة `بلغت الحد الأقصى للعناوين المحفوظة (10)`.
- الفورم يفتح فارغاً دائماً — لا تعبئة تلقائية عند فتح الصفحة.
- الحفظ تلقائي عند إرسال الطلب الناجح للمسجل فقط — غير المسجل لا يُحفظ له شيء.
- التخزين على القرص بنمط atomic write الموجود (tmp + rename).
- لا يُلمس تبويب "طلباتي" ولا خيارا الدفع (إلكتروني/عند الاستلام) ولا تحقق الإرسال.

---
## ملفات المشروع

| الملف | المسؤولية |
|---|---|
| `address-book.cjs` (جديد) | قواعد نقية: normalizeAddress، validateAddress، sameAddress، upsertAddress، removeAddress، migrateList، MAX_ADDRESSES |
| `tests/address-book.test.js` (جديد) | اختبارات vitest للقواعد النقية (TDD) |
| `server.js` | استبدال بلوك `/api/me/delivery` (سطور 272-317) بنقاط `/api/me/addresses` الثلاث |
| `my-orders.html` | حذف منيو المحرر + المحرر المنبثق + CSS الخاص بهما + إضافة حاوية قائمة العناوين + CSS لها |
| `js/my-orders.js` | إلغاء التعبئة التلقائية، جلب/عرض/اختيار/حذف العناوين، الحفظ التلقائي عند الإرسال، حذف دوال المحرر القديم |

---

### Task 1: القواعد النقية (TDD) — address-book.cjs

**Files:**
- Create: `address-book.cjs`
- Test: `tests/address-book.test.js`

**Interfaces:**
- Produces:
  - `MAX_ADDRESSES = 10`, `MAX_ADDRESSES_ERROR = 'بلغت الحد الأقصى للعناوين المحفوظة (10)'`
  - `normalizeAddress(a) → {name, phone, city, district, area, street, landmark}` (trim + قص + تجريد phone من مسافات/شرطات)
  - `validateAddress(a) → {ok: true, address} | {ok: false, error}` (الاسم ≥ 2 حرف، phone يطابق `/^\+?[0-9]{8,15}$/` بعد التطبيع، city مطلوبة)
  - `sameAddress(a, b) → boolean` (مطابقة دقيقة لكل الحقول بعد التطبيع)
  - `upsertAddress(list, a) → {list, added, updated, address?, error?}` (تحديث عند التطابق، إضافة مع `id = crypto.randomUUID()` وcreatedAt/updatedAt ISO، سقف 10)
  - `removeAddress(list, id) → {list, removed}`
  - `migrateList(val) → address[]` (يُحوّل الكائن القديم الفردي لقائمة بعنصر واحد مع id/timestamps؛ غير الكائن/القائمة يعيد [])

- [ ] **Step 1: اكتب الاختبار الفاشل**

Create `tests/address-book.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  normalizeAddress, validateAddress, sameAddress, upsertAddress,
  removeAddress, migrateList, MAX_ADDRESSES, MAX_ADDRESSES_ERROR,
} from '../address-book.cjs';

const A = { name: 'محمد أحمد', phone: '0791234567', city: 'عمّان', district: 'الصويفية', area: 'وسط البلد', street: 'شارع المدينة', landmark: 'بجانب المسجد' };

describe('address book rules', () => {
  it('normalizeAddress trims, slices, and strips phone dashes/spaces', () => {
    expect(normalizeAddress({ name: '  محمد  ', phone: '079-1234-567', city: 'عمّان' })).toEqual({
      name: 'محمد', phone: '0791234567', city: 'عمّان', district: '', area: '', street: '', landmark: '',
    });
    expect(normalizeAddress({ name: 'x'.repeat(200) }).name.length).toBe(60);
  });

  it('validateAddress requires name, valid phone, and city', () => {
    expect(validateAddress(A).ok).toBe(true);
    expect(validateAddress({ ...A, name: 'م' }).ok).toBe(false);
    expect(validateAddress({ ...A, phone: '123' }).ok).toBe(false);
    expect(validateAddress({ ...A, city: '' }).ok).toBe(false);
  });

  it('sameAddress matches on all fields after normalization', () => {
    expect(sameAddress(A, { ...A, phone: '079-1234-567' })).toBe(true);
    expect(sameAddress(A, { ...A, street: 'شارع آخر' })).toBe(false);
  });

  it('upsertAddress adds a new address with id and dedupes exact match', () => {
    const r1 = upsertAddress([], A);
    expect(r1.added).toBe(true);
    expect(r1.list).toHaveLength(1);
    expect(r1.list[0].id).toBeTruthy();
    const r2 = upsertAddress(r1.list, { ...A, phone: '079-1234-567' });
    expect(r2.added).toBe(false);
    expect(r2.updated).toBe(true);
    expect(r2.list).toHaveLength(1);
    expect(r2.list[0].id).toBe(r1.list[0].id);
  });

  it('upsertAddress enforces the max cap', () => {
    let list = [];
    for (let i = 0; i < MAX_ADDRESSES; i++) {
      list = upsertAddress(list, { ...A, phone: '079000000' + String(i).padStart(2, '0') }).list;
    }
    const over = upsertAddress(list, { ...A, phone: '0799999999' });
    expect(over.error).toBe(MAX_ADDRESSES_ERROR);
    expect(over.list).toHaveLength(MAX_ADDRESSES);
  });

  it('removeAddress removes by id', () => {
    const id = upsertAddress([], A).list[0].id;
    expect(removeAddress([{ id }], id).removed).toBe(true);
    expect(removeAddress([{ id }], 'nope').removed).toBe(false);
  });

  it('migrateList wraps a legacy single object into a list', () => {
    const list = migrateList({ name: 'قديم', phone: '0781111111', city: 'إربد' });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('قديم');
    expect(list[0].id).toBeTruthy();
    expect(migrateList([])).toEqual([]);
    expect(migrateList(undefined)).toEqual([]);
    expect(migrateList('x')).toEqual([]);
  });
});
```

- [ ] **Step 2: شغّل الاختبار للتأكد من فشله**

Run: `npx vitest run tests/address-book.test.js`
Expected: FAIL — "Failed to resolve import" (الملف غير موجود).

- [ ] **Step 3: نفّذ القواعد**

Create `address-book.cjs`:

```js
// Pure business rules for the customer saved-address book (my-orders page)
const crypto = require('crypto');

const MAX_ADDRESSES = 10;
const MAX_ADDRESSES_ERROR = 'بلغت الحد الأقصى للعناوين المحفوظة (' + MAX_ADDRESSES + ')';

const LIMITS = { name: 60, phone: 20, city: 40, district: 40, area: 40, street: 60, landmark: 60 };

function clean(s, max) {
  return typeof s === 'string' ? s.trim().slice(0, max) : '';
}

function normalizeAddress(a) {
  return {
    name: clean(a && a.name, LIMITS.name),
    phone: clean(a && a.phone, LIMITS.phone).replace(/[\s-]/g, ''),
    city: clean(a && a.city, LIMITS.city),
    district: clean(a && a.district, LIMITS.district),
    area: clean(a && a.area, LIMITS.area),
    street: clean(a && a.street, LIMITS.street),
    landmark: clean(a && a.landmark, LIMITS.landmark),
  };
}

function validateAddress(a) {
  const n = normalizeAddress(a);
  if (n.name.length < 2) return { ok: false, error: 'يرجى إدخال الاسم الكامل' };
  if (!/^\+?[0-9]{8,15}$/.test(n.phone)) return { ok: false, error: 'رقم هاتف غير صالح' };
  if (!n.city) return { ok: false, error: 'يرجى اختيار المدينة' };
  return { ok: true, address: n };
}

function sameAddress(a, b) {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  return ['name', 'phone', 'city', 'district', 'area', 'street', 'landmark']
    .every((k) => na[k] === nb[k]);
}

function upsertAddress(list, address) {
  const a = normalizeAddress(address);
  const base = Array.isArray(list) ? list : [];
  const idx = base.findIndex((x) => sameAddress(x, a));
  if (idx >= 0) {
    const updated = Object.assign({}, base[idx], a, { updatedAt: new Date().toISOString() });
    const next = base.slice();
    next[idx] = updated;
    return { list: next, added: false, updated: true, address: updated };
  }
  if (base.length >= MAX_ADDRESSES) return { list: base, added: false, updated: false, error: MAX_ADDRESSES_ERROR };
  const created = Object.assign({}, a, {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { list: base.concat(created), added: true, updated: false, address: created };
}

function removeAddress(list, id) {
  const base = Array.isArray(list) ? list : [];
  const next = base.filter((x) => x.id !== id);
  return { list: next, removed: next.length < base.length };
}

function migrateList(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') {
    const a = normalizeAddress(val);
    return [Object.assign({}, a, {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })];
  }
  return [];
}

module.exports = {
  MAX_ADDRESSES,
  MAX_ADDRESSES_ERROR,
  normalizeAddress,
  validateAddress,
  sameAddress,
  upsertAddress,
  removeAddress,
  migrateList,
};
```

- [ ] **Step 4: شغّل الاختبار للتأكد من نجاحه**

Run: `npx vitest run tests/address-book.test.js`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add address-book.cjs tests/address-book.test.js
git commit -m "feat: add pure saved-address book rules (normalize, dedupe, upsert, cap)"
```

---

### Task 2: السيرفر — نقاط /api/me/addresses

**Files:**
- Modify: `server.js:272-317` (بلوك `// ── Per-account delivery info (Google accounts only) ──` كاملاً)

**Interfaces:**
- Consumes: `address-book.cjs` (Task 1): `normalizeAddress, validateAddress, upsertAddress, removeAddress, migrateList`
- Produces:
  - `GET /api/me/addresses` (محمي) → `{ addresses: [...] }`
  - `POST /api/me/addresses` (محمي + rateLimit) body = حقلات العنوان → 200 `{success, added, updated, addresses}` | 400 برسالة | 401
  - `DELETE /api/me/addresses/:id` (محمي + rateLimit) → 200 `{success, addresses}` | 404 | 401

- [ ] **Step 1: استبدل البلوك القديم**

في `server.js` أضف بعد السطر 10 (`const { safeResolve } = ...`):
```js
const { validateAddress, upsertAddress, removeAddress, migrateList } = require('./address-book.cjs');
```

ثم استبدل الكتلة كاملة من `// ── Per-account delivery info (Google accounts only) ──` حتى نهاية `app.put('/api/me/delivery', ...)` (سطور 272-317) بهذا:

```js
// ── Per-account saved addresses (Google accounts only) ──
const DELIVERY_FILE = path.join(__dirname, 'data', 'delivery-info.json');
function readDeliveryFile() {
  try {
    return JSON.parse(fs.readFileSync(DELIVERY_FILE, 'utf8')) || {};
  } catch (e) {
    return {};
  }
}
function writeDeliveryFile(data) {
  fs.mkdirSync(path.dirname(DELIVERY_FILE), { recursive: true });
  const tmp = DELIVERY_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DELIVERY_FILE);
}
function readAddresses(email) {
  const all = readDeliveryFile();
  const val = all[email];
  if (Array.isArray(val)) return val;
  const migrated = migrateList(val);
  if (val && typeof val === 'object') {
    all[email] = migrated;
    try { writeDeliveryFile(all); } catch (e) { /* best effort */ }
  }
  return migrated;
}
function userList(all, email) {
  return Array.isArray(all[email]) ? all[email] : migrateList(all[email]);
}
app.get('/api/me/addresses', (req, res) => {
  if (!req.session.authenticated || !req.session.userEmail) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ addresses: readAddresses(req.session.userEmail) });
});
app.post('/api/me/addresses', rateLimit(30, 60000), (req, res) => {
  if (!req.session.authenticated || !req.session.userEmail) return res.status(401).json({ error: 'Unauthorized' });
  const check = validateAddress(req.body || {});
  if (!check.ok) return res.status(400).json({ error: check.error });
  const all = readDeliveryFile();
  const result = upsertAddress(userList(all, req.session.userEmail), check.address);
  if (result.error) return res.status(400).json({ error: result.error });
  all[req.session.userEmail] = result.list;
  try {
    writeDeliveryFile(all);
  } catch (e) {
    return res.status(500).json({ error: 'تعذر الحفظ' });
  }
  res.json({ success: true, added: result.added, updated: result.updated, addresses: result.list });
});
app.delete('/api/me/addresses/:id', rateLimit(30, 60000), (req, res) => {
  if (!req.session.authenticated || !req.session.userEmail) return res.status(401).json({ error: 'Unauthorized' });
  const all = readDeliveryFile();
  const result = removeAddress(userList(all, req.session.userEmail), String(req.params.id || ''));
  if (!result.removed) return res.status(404).json({ error: 'العنوان غير موجود' });
  all[req.session.userEmail] = result.list;
  try {
    writeDeliveryFile(all);
  } catch (e) {
    return res.status(500).json({ error: 'تعذر الحفظ' });
  }
  res.json({ success: true, addresses: result.list });
});
```

ملاحظة: `migrateList` مستخدمة داخل `readAddresses`/`userList`، و`validateAddress/upsertAddress/removeAddress` في النقاط الثلاث. `sanitizeDelivery` القديمة تُحذف (لا أثر لها).

- [ ] **Step 2: تحقق يدوياً من النقاط**

شغّل في طرفية ثانية: `$env:PORT=3211; $env:AZMA_DEV_LOGIN='1'; node server.js`

```bash
# بدون جلسة → 401
curl -s http://localhost:3211/api/me/addresses
# دخول تجريبي (Dev login)
curl -s -X POST http://localhost:3211/api/dev/login -H "Content-Type: application/json" -d "{\"email\":\"test@demo.com\",\"name\":\"Test User\"}" -c cookies.txt
# قائمة فارغة
curl -s http://localhost:3211/api/me/addresses -b cookies.txt
# إضافة عنوان
curl -s -X POST http://localhost:3211/api/me/addresses -b cookies.txt -H "Content-Type: application/json" -d "{\"name\":\"محمد أحمد\",\"phone\":\"0791234567\",\"city\":\"عمّان\",\"district\":\"الصويفية\",\"area\":\"وسط البلد\",\"street\":\"شارع المدينة\",\"landmark\":\"بجانب المسجد\"}"
# إعادة نفس العنوان → updated:true بدون نسخة مكررة
curl -s -X POST http://localhost:3211/api/me/addresses -b cookies.txt -H "Content-Type: application/json" -d "{\"name\":\"محمد أحمد\",\"phone\":\"0791234567\",\"city\":\"عمّان\",\"district\":\"الصويفية\",\"area\":\"وسط البلد\",\"street\":\"شارع المدينة\",\"landmark\":\"بجانب المسجد\"}"
# حذف (ضع id من النتيجة السابقة)
curl -s -X DELETE http://localhost:3211/api/me/addresses/<id> -b cookies.txt
# عنوان ناقص المدينة → 400
curl -s -X POST http://localhost:3211/api/me/addresses -b cookies.txt -H "Content-Type: application/json" -d "{\"name\":\"محمد\",\"phone\":\"0791234567\"}"
```

Expected: 401 → login ok → `{"addresses":[]}` → إضافة تعيد `added:true` والعنوان بالـ id → الثانية `updated:true` والطول 1 → حذف `{success:true}` → 400 برسالة "يرجى اختيار المدينة".

- [ ] **Step 3: تحقق من التوافق الرجعي**

احفظ مؤقتاً بالصيغة القديمة ثم أعد الجلب:

```bash
# بعد إيقاف السيرفر، عدّل data/delivery-info.json:
# {"test@demo.com": {"name":"قديم","phone":"0781111111","city":"إربد"}}
# ثم أعد التشغيل و:
curl -s http://localhost:3211/api/me/addresses -b cookies.txt
```

Expected: `{"addresses":[{"name":"قديم","phone":"0781111111","city":"إربد",...,"id":"..."}]}` — كائن واحد تحوّل لقائمة بعنصر واحد.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(api): replace single delivery record with saved addresses list endpoints"
```

---

### Task 3: الواجهة — my-orders.html

**Files:**
- Modify: `my-orders.html` (حذف منيو المحرر سطر 193، حذف المحرر المنبثق أسطر 264-277، حذف CSS أسطر 146-150، إضافة حاوية القائمة + CSS)

**Interfaces:**
- Consumes: `js/my-orders.js` (Task 4) يستدعي `#mo-saved-addresses`
- Produces: حاوية `<div class="mo-saved-addresses" id="mo-saved-addresses" style="display:none;"></div>` داخل بطاقة "معلومات التوصيل" فوق `.mo-fields-grid`

- [ ] **Step 1: أضف CSS قائمة العناوين**

بعد كتلة `/* ── Custom select ── */` (تنتهي بسطر `@keyframes dropIn` — سطر 144) أضف:

```css
/* ── Saved addresses list ── */
.mo-saved-addresses{display:grid;gap:8px;margin-bottom:18px}
.mo-saved-title{font-size:11px;color:var(--tees-muted);letter-spacing:.02em;margin:0 0 2px}
.mo-saved-item{display:flex;align-items:center;gap:10px;padding:11px 13px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.03);cursor:pointer;transition:all .3s var(--tees-ease);text-align:right}
.mo-saved-item:hover,.mo-saved-item.active{border-color:rgba(245,200,66,.55);background:rgba(245,200,66,.08)}
.mo-saved-main{flex:1;min-width:0}
.mo-saved-name{font-size:12.5px;font-weight:700}
.mo-saved-loc{font-size:11px;color:var(--tees-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mo-saved-del{width:24px;height:24px;border-radius:50%;border:1px solid rgba(252,165,165,.3);color:#FCA5A5;font-size:11px;display:flex;align-items:center;justify-content:center;flex:none;transition:all .3s var(--tees-ease)}
.mo-saved-del:hover{background:rgba(252,165,165,.12)}
.mo-saved-add{width:100%;padding:10px;border:1px dashed rgba(245,200,66,.35);border-radius:12px;background:none;color:var(--tees-yellow);font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .3s var(--tees-ease)}
.mo-saved-add:hover{background:rgba(245,200,66,.08)}
.mo-saved-none{font-size:11.5px;color:var(--tees-muted);padding:4px 2px}
```

- [ ] **Step 2: أضف حاوية القائمة داخل بطاقة التوصيل**

استبدل:
```html
      <h3 class="mo-card-title">معلومات التوصيل</h3>
      <div class="mo-fields-grid">
```
بـ:
```html
      <h3 class="mo-card-title">معلومات التوصيل</h3>
      <div class="mo-saved-addresses" id="mo-saved-addresses" style="display:none;"></div>
      <div class="mo-fields-grid">
```

- [ ] **Step 3: احذف منيو المحرر القديم**

احذف السطر:
```html
        <label class="mo-menu-item mo-menu-delivery" id="menu-delivery" for="mo-toggle" onclick="openDeliveryEditor()" style="display:none;">📍 بيانات التوصيل</label>
```

- [ ] **Step 4: احذف المحرر المنبثق القديم**

احذف الكتلة كاملة:
```html
  <div class="mo-overlay" id="mo-delivery-overlay">
    <div class="mo-overlay-card mo-delivery-card">
      <button type="button" class="mo-delivery-close" onclick="closeDeliveryEditor()">✕</button>
      <h3 class="mo-card-title">📍 بيانات التوصيل</h3>
      <div class="mo-field"><label>الاسم الكامل</label><input id="mo-del-name"></div>
      <div class="mo-field"><label>رقم الهاتف</label><input id="mo-del-phone" dir="ltr"></div>
      <div class="mo-field"><label>المدينة</label><input type="hidden" id="mo-del-city"><div class="mo-select" id="wrap-mo-del-city" data-for="mo-del-city" data-placeholder="اختر المدينة"></div></div>
      <div class="mo-field"><label>الحي</label><input type="hidden" id="mo-del-district"><div class="mo-select" id="wrap-mo-del-district" data-for="mo-del-district" data-placeholder="اختر الحي"></div></div>
      <div class="mo-field"><label>المنطقة</label><input type="hidden" id="mo-del-area"><div class="mo-select" id="wrap-mo-del-area" data-for="mo-del-area" data-placeholder="اختر المنطقة"></div></div>
      <div class="mo-field"><label>الشارع</label><input id="mo-del-street"></div>
      <div class="mo-field"><label>معلم قريب (اختياري)</label><input id="mo-del-landmark"></div>
      <button class="mo-btn" id="mo-del-save" onclick="saveDeliveryEditor()">حفظ البيانات</button>
    </div>
  </div>
```

واحذف أيضاً كتلة CSS (أسطر 146-150):
```css
    /* ── Delivery editor overlay ── */
    .mo-delivery-card{width:min(480px,92vw);max-height:88vh;overflow-y:auto;text-align:right;padding:32px}
    .mo-delivery-card .mo-card-title{margin-bottom:18px}
    .mo-delivery-close{position:absolute;top:14px;left:14px;background:none;border:1px solid rgba(255,255,255,.15);color:var(--tees-muted);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:14px;font-family:inherit;transition:all .3s var(--tees-ease)}
    .mo-delivery-close:hover{border-color:rgba(252,165,165,.5);color:#FCA5A5}
```

- [ ] **Step 5: تحقق من عدم وجود بقايا**

Run: `Select-String -Path my-orders.html -Pattern "mo-delivery|mo-del-|menu-delivery|openDeliveryEditor|saveDeliveryEditor|closeDeliveryEditor"`
Expected: لا نتائج.

- [ ] **Step 6: Commit**

```bash
git add my-orders.html
git commit -m "feat(my-orders): saved addresses list container, remove legacy delivery editor UI"
```

---

### Task 4: التحكم — js/my-orders.js

**Files:**
- Modify: `js/my-orders.js` (إلغاء التعبئة التلقائية سطر 90، جلب/عرض/اختيار/حذف العناوين، الحفظ التلقائي عند الإرسال، حذف دوال المحرر أسطر 240-285)

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/me/addresses` (Task 2)، `#mo-saved-addresses` (Task 3)
- Produces: `loadSavedAddresses()`, `renderSavedAddresses()`, `pickSavedAddress(id)`, `newSavedAddress()`, `deleteSavedAddress(id)` — كلهن عاملات (window scope) لأن الصفحة تستخدم onclick مباشرة

- [ ] **Step 1: أزل التعبئة التلقائية وجلب القائمة بدلها**

في `initMyOrders` استبدل الكتلة:
```js
    $('menu-delivery').style.display = '';
    try {
      const d = await (await fetch('api/me/delivery')).json();
      if (d && typeof d === 'object' && d.city) applyDelivery(d);
    } catch (e) { /* ignore */ }
```
بـ:
```js
    await loadSavedAddresses();
```

- [ ] **Step 2: أزل cascade المحرر القديم**

احذف السطر:
```js
cascadeCity(makeSelect($('wrap-mo-del-city')), makeSelect($('wrap-mo-del-district')), makeSelect($('wrap-mo-del-area')), 'mo-del-city', 'mo-del-district');
```

- [ ] **Step 3: أضف دوال قائمة العناوين**

بعد `function applyDelivery(d) { ... }` أضف:

```js
let savedAddresses = [];
let activeAddressId = null;

async function loadSavedAddresses() {
  try {
    const res = await (await fetch('api/me/addresses')).json();
    savedAddresses = (res && res.addresses) || [];
  } catch (e) {
    savedAddresses = [];
  }
  renderSavedAddresses();
}

function renderSavedAddresses() {
  const box = $('mo-saved-addresses');
  if (!box) return;
  if (!auth.authenticated) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';
  const items = savedAddresses.map(a => `
    <div class="mo-saved-item${activeAddressId === a.id ? ' active' : ''}" onclick="pickSavedAddress('${a.id}')">
      <div class="mo-saved-main">
        <div class="mo-saved-name">${escapeHtml(a.name)} · ${escapeHtml(a.phone)}</div>
        <div class="mo-saved-loc">${escapeHtml([a.city, a.district, a.area].filter(Boolean).join(' — '))}${a.street ? ' · ' + escapeHtml(a.street) : ''}</div>
      </div>
      <span class="mo-saved-del" onclick="event.stopPropagation();deleteSavedAddress('${a.id}')" title="حذف">✕</span>
    </div>`).join('');
  box.innerHTML = `
    <div class="mo-saved-title">عناوينك المحفوظة</div>
    ${savedAddresses.length ? items : '<div class="mo-saved-none">لا توجد عناوين محفوظة بعد</div>'}
    <button type="button" class="mo-saved-add" onclick="newSavedAddress()">+ عنوان جديد</button>`;
}

function pickSavedAddress(id) {
  const a = savedAddresses.find(x => x.id === id);
  if (!a) return;
  activeAddressId = id;
  applyDelivery(a);
  renderSavedAddresses();
  const first = $('mo-name');
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function newSavedAddress() {
  activeAddressId = null;
  applyDelivery({});
  renderSavedAddresses();
}

async function deleteSavedAddress(id) {
  if (!confirm('حذف هذا العنوان؟')) return;
  try {
    const res = await (await fetch('api/me/addresses/' + encodeURIComponent(id), { method: 'DELETE' })).json();
    if (res.addresses) savedAddresses = res.addresses;
    if (activeAddressId === id) {
      activeAddressId = null;
      applyDelivery({});
    }
    renderSavedAddresses();
    showToast('تم حذف العنوان');
  } catch (e) {
    showToast('تعذر حذف العنوان، حاول مرة أخرى', true);
  }
}
```

ملاحظة: دالة `showToast` معرّفة في نفس الملف (تُستخدم قبل تعريفها — hoisting صالح لأنها function declaration).

- [ ] **Step 4: الحفظ التلقائي عند الإرسال**

في `submitOrderFlow` استبدل:
```js
    if (auth.authenticated) {
      fetch('api/me/delivery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, city, district, area, street, landmark }),
      }).catch(() => {});
    }
```
بـ:
```js
    if (auth.authenticated) {
      fetch('api/me/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, city, district, area, street, landmark }),
      })
        .then(r => r.json())
        .then(res => {
          if (res.addresses) {
            savedAddresses = res.addresses;
            renderSavedAddresses();
          }
        })
        .catch(() => {});
    }
```

- [ ] **Step 5: احذف دوال المحرر القديم**

احذف الكتلة كاملة من `function openDeliveryEditor() {` حتى نهاية `saveDeliveryEditor` (أسطر 240-285) — أي الدوال الثلاث `openDeliveryEditor`, `closeDeliveryEditor`, `saveDeliveryEditor`.

- [ ] **Step 6: تحقق**

Run: `Select-String -Path js/my-orders.js -Pattern "mo-del|menu-delivery|openDeliveryEditor|saveDeliveryEditor|closeDeliveryEditor|api/me/delivery"`
Expected: لا نتائج.

Run: `npm run lint`
Expected: لا أخطاء جديدة في js/my-orders.js.

- [ ] **Step 7: Commit**

```bash
git add js/my-orders.js
git commit -m "feat(my-orders): saved addresses picker, auto-save on submit, drop legacy editor"
```

---

### Task 5: الفحوصات النهائية + فتح المتصفح

**Files:**
- تحقق شامل: lint + typecheck + vitest + فحص يدوي بالمتصفح

- [ ] **Step 1: شغّل الفحوصات الكاملة**

Run: `npm run lint`
Expected: لا أخطاء جديدة.

Run: `npm run typecheck`
Expected: لا أخطاء جديدة.

Run: `npx vitest run`
Expected: كل الاختبارات تمر (بما فيها address-book الجديد 6 اختبارات). إن فشل `tests/manifest.test.js` بسبب VERSION غير الملتزم به — أخطاء سابقة غير متعلقة.

- [ ] **Step 2: فحص يدوي للسيرفر**

Run: `$env:PORT=3212; $env:AZMA_DEV_LOGIN='1'; node server.js` في طرفية ثانية، ثم:
- `curl -s http://localhost:3212/api/me/addresses` → `{"error":"Unauthorized"}`
- `curl -s -X POST http://localhost:3212/api/dev/login -H "Content-Type: application/json" -d "{\"email\":\"final@demo.com\"}" -c c.txt`
- `curl -s -X POST http://localhost:3212/api/me/addresses -b c.txt -H "Content-Type: application/json" -d "{\"name\":\"محمد أحمد\",\"phone\":\"0791234567\",\"city\":\"عمّان\",\"district\":\"الصويفية\"}"` → `added:true`
- `curl -s http://localhost:3212/api/me/addresses -b c.txt` → القائمة فيها العنوان
- حذف العنوان → `{success:true}`

Expected: كلها كالمتوقع.

- [ ] **Step 3: شغّل السيرفر الرسمي وافتح المتصفح**

- إن لم يكن سيرفر يعمل على المنفذ الافتراضي (3000 أو PORT من .env): شغّل `node server.js` في الخلفية مع توجيه اللوج لملف.
- افتح `http://localhost:3000/my-orders.html` في المتصفح: `Start-Process "http://localhost:3000/my-orders.html"`
- سجّل الدخول بحساب Google (أو AZMA_DEV_LOGIN إن كان مفعلاً) وافحص: فورم فارغ + قائمة عناوين فوقه + إضافة/اختيار/حذف.

## Completion Status

- [ ] Task 1: address-book.cjs + tests
- [ ] Task 2: server endpoints /api/me/addresses
- [ ] Task 3: my-orders.html UI
- [ ] Task 4: js/my-orders.js logic
- [ ] Task 5: final checks + browser
