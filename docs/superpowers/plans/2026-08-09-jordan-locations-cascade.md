# كاسكيد المناطق الأردنية الرسمي Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** استبدال بيانات المناطق القديمة ببيانات التقسيمات الإدارية الرسمية (محافظة ← لواء ← [قضاء] ← منطقة) في نموذج التوصيل وحفظ القضاء، ثم الرفع على السيرفر.

**Architecture:** طبقة بيانات نقية (`js/jordan-locations.js`) تُصدَّر للصفحة (window) وللتستات (module.exports)، مع تعميم الكاسكيد في `js/my-orders.js` إلى `cascadeSelects` ديناميكي 3-4 مستويات (حقل القضاء يظهر فقط للألوية التي لها أقضية). الخادم يضيف `subdistrict` إلى `sanitizeDelivery` فقط — بدون تغيير قاعدة البيانات.

**Tech Stack:** Vanilla JS (صفحات HTML ثابتة + Express server.js)، Vitest، Prettier/ESLint، النشر عبر Railway CLI.

## Global Constraints

- البيانات الرسمية مصدرها ملف `data/jordan-locations.json` (موجود في المستودع، صيغته مصفوفة مجردة `[...]`) — يُنسخ حرفياً إلى `js/jordan-locations.js` دون أي تعديل.
- لا تغيير على `prisma/` أو قاعدة البيانات إطلاقاً.
- `makeSelect` (js/my-orders.js:9-46) لا يتغير.
- كل النصوص الجديدة بالعربية وبأسماء التقسيمات الرسمية: المحافظة، اللواء، القضاء، المنطقة.
- الرسائل القديمة "يرجى إدخال المدينة" / "يرجى اختيار المدينة" تُستبدل بـ "يرجى اختيار المحافظة".
- حدود الأحرف في الخادم: `subdistrict` مقصوصة لـ 40 حرفاً (مثل `district`).
- تسمية الثوابت: `CHECKOUT_LOC`، `DELIVERY_LOC`، `JORDAN_LOCATIONS` (بأحرف كبيرة)، والدوال `cities/districts/subdistricts/areas` (صغيرة).

---

### Task 1: اختبار فاشل لطبقة البيانات (RED)

**Files:**
- Create: `tests/locations.test.js`

**Interfaces:**
- Consumes: لا شيء (الملف غير موجود بعد — الاختبار يفشل).
- Produces: عقد الاختبار للدوال الأربع `cities()`, `districts(city)`, `subdistricts(city, district)`, `areas(city, district, subdistrict?)` المستوردة من `../js/jordan-locations.js`.

- [ ] **Step 1: Write the failing test**

أنشئ `tests/locations.test.js` بالمحتوى التالي حرفياً:

```js
import { describe, it, expect } from 'vitest';
import { cities, districts, subdistricts, areas } from '../js/jordan-locations.js';

describe('Jordan locations data layer', () => {
  it('lists all 12 governorates', () => {
    const list = cities();
    expect(list).toHaveLength(12);
    expect(list).toContain('المفرق');
    expect(list).toContain('عمان');
    expect(list).toContain('العقبة');
  });

  it('lists districts of a governorate', () => {
    expect(districts('المفرق')).toContain('لواء قصبة المفرق');
    expect(districts('إربد')).toContain('لواء قصبة إربد');
    expect(districts('حمص')).toEqual([]);
    expect(districts('')).toEqual([]);
  });

  it('returns subdistricts only where they exist, else null', () => {
    const subs = subdistricts('المفرق', 'لواء قصبة المفرق');
    expect(subs).toHaveLength(4);
    expect(subs).toContain('قضاء بلعما');
    expect(subdistricts('إربد', 'لواء قصبة إربد')).toBeNull();
    expect(subdistricts('المفرق', 'لواء غير موجود')).toBeNull();
  });

  it('returns areas of a subdistrict', () => {
    const list = areas('المفرق', 'لواء قصبة المفرق', 'قضاء بلعما');
    expect(list).toContain('بلعما');
    expect(list).toContain('حفير');
    expect(list).toContain('القنيات');
  });

  it('returns areas directly from a district without subdistricts', () => {
    const list = areas('إربد', 'لواء قصبة إربد');
    expect(list).toContain('إربد');
    expect(list).toContain('حوارة');
    expect(list).toContain('بيت راس');
  });

  it('returns empty areas for unknown or incomplete inputs without throwing', () => {
    expect(areas('حمص', 'أي لواء')).toEqual([]);
    expect(areas('المفرق', 'لواء قصبة المفرق')).toEqual([]); // لواء بأقضية — القضاء مطلوب أولاً
    expect(areas('المفرق', 'لواء قصبة المفرق', 'قضاء غير موجود')).toEqual([]);
    expect(areas('إربد', 'لواء قصبة إربد', 'قضاء وهمي')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/locations.test.js`
Expected: FAIL — `Cannot find module '../js/jordan-locations.js'` أو أخطاء import (لأن الملف غير موجود بعد).

---

### Task 2: طبقة البيانات + الوصول (GREEN)

**Files:**
- Create: `js/jordan-locations.js` (استبدال كامل للملف القديم الذي يحتوي `window.JORDAN`)
- Modify: لا شيء
- Test: `tests/locations.test.js` (من Task 1)

**Interfaces:**
- Consumes: `data/jordan-locations.json` (موجود — مصفوفة مجردة `[ { city, districts: [ { district, subdistricts?: [ { subdistrict, areas } ], areas? } ] } ]`).
- Produces: كائن يُصدَّر: `{ JORDAN_LOCATIONS, cities, districts, subdistricts, areas }` — على `window` في المتصفح (عبر `Object.assign(window, ...)`) وعلى `module.exports` في Node.
  - `cities()` → `string[]` أسماء المحافظات.
  - `districts(city)` → `string[]` أو `[]`.
  - `subdistricts(city, district)` → `string[]` أو `null` إذا كان اللواء بلا أقضية أو المدخلات غير موجودة.
  - `areas(city, district, subdistrict?)` → `string[]` أو `[]` (من القضاء إن مُرر subdistrict، وإلا مناطق اللواء المباشرة؛ اللواء ذو الأقضية بلا subdistrict يعيد `[]`).

- [ ] **Step 1: Write minimal implementation**

استبدل محتوى `js/jordan-locations.js` بالكامل بما يلي. **الخطوة الحاسمة**: في مكان تعليق `// ⬇ DATA ⬇` الصق محتوى `data/jordan-locations.json` كاملاً (الملف صيغته مصفوفة مجردة — انسخ كل سطره) مكان `[]`:

```js
/* AZMA - Official Jordan locations (governorate > district > [subdistrict] > area)
   Data source: data/jordan-locations.json (official administrative divisions, verbatim) */
(function (root) {
  // ⬇ DATA ⬇
  const JORDAN_LOCATIONS = [];
  // ⬆ DATA ⬆

  function findCity(city) {
    if (!city) return null;
    return JORDAN_LOCATIONS.find((x) => x.city === city) || null;
  }

  function findDistrict(cityObj, district) {
    if (!cityObj || !district) return null;
    return cityObj.districts.find((x) => x.district === district) || null;
  }

  function cities() {
    return JORDAN_LOCATIONS.map((x) => x.city);
  }

  function districts(city) {
    const c = findCity(city);
    return c ? c.districts.map((x) => x.district) : [];
  }

  function subdistricts(city, district) {
    const d = findDistrict(findCity(city), district);
    if (!d) return null;
    return d.subdistricts ? d.subdistricts.map((x) => x.subdistrict) : null;
  }

  function areas(city, district, subdistrict) {
    const d = findDistrict(findCity(city), district);
    if (!d) return [];
    if (subdistrict) {
      const s = (d.subdistricts || []).find((x) => x.subdistrict === subdistrict);
      return s ? s.areas : [];
    }
    if (d.subdistricts) return [];
    return d.areas || [];
  }

  const api = { JORDAN_LOCATIONS, cities, districts, subdistricts, areas };
  if (typeof window !== 'undefined') Object.assign(window, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

بعد اللصق تحقق: `JORDAN_LOCATIONS.length === 12` وأن أول عنصر city = `"المفرق"`.

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/locations.test.js`
Expected: PASS (6/6). إن فشل فحص البنية: تأكد أن محتوى `data/jordan-locations.json` نُسخ كاملاً دون سطر ناقص.

- [ ] **Step 3: Lint + syntax check**

Run: `npx eslint js/jordan-locations.js` ثم `node --check js/jordan-locations.js`
Expected: لا أخطاء (ملاحظات prettier إن ظهرت تُصلح تلقائياً لاحقاً عبر lint-staged عند الالتزام).

- [ ] **Step 4: Commit**

```bash
git add tests/locations.test.js js/jordan-locations.js data/jordan-locations.json
git commit -m "feat: official Jordan locations data layer (city > district > subdistrict > area)"
```

---

### Task 3: حقول الواجهة — `my-orders.html`

**Files:**
- Modify: `my-orders.html` (سطرا حقول الموقع في نموذج الدفع 219-221، وفي محرر التوصيل 270-272)

**Interfaces:**
- Consumes: أسماء المعرّفات كما تستهلكها Task 4: `mo-subdistrict` / `wrap-mo-subdistrict` / `field-mo-subdistrict` و `mo-del-subdistrict` / `wrap-mo-del-subdistrict` / `field-mo-del-subdistrict`.
- Produces: غلافات قوائم جاهزة لمكوّن `makeSelect` (نفس نمط `wrap-mo-city`): إدخال مخفي + `div.mo-select` بـ `data-for` و `data-placeholder`.

- [ ] **Step 1: Edit the checkout form fields**

في `my-orders.html` استبدل الأسطر الثلاثة (نموذج الدفع) بالمحتوى التالي:

```html
<div class="mo-field"><label>المحافظة *</label><input type="hidden" id="mo-city"><div class="mo-select" id="wrap-mo-city" data-for="mo-city" data-placeholder="اختر المحافظة"></div></div>
<div class="mo-field"><label>اللواء *</label><input type="hidden" id="mo-district"><div class="mo-select" id="wrap-mo-district" data-for="mo-district" data-placeholder="اختر اللواء"></div></div>
<div class="mo-field" id="field-mo-subdistrict" style="display:none"><label>القضاء</label><input type="hidden" id="mo-subdistrict"><div class="mo-select" id="wrap-mo-subdistrict" data-for="mo-subdistrict" data-placeholder="اختر القضاء"></div></div>
<div class="mo-field"><label>المنطقة *</label><input type="hidden" id="mo-area"><div class="mo-select" id="wrap-mo-area" data-for="mo-area" data-placeholder="اختر المنطقة"></div></div>
```

- [ ] **Step 2: Edit the delivery editor fields**

استبدل الأسطر الثلاثة في محرر التوصيل (داخل `#mo-delivery-overlay`) بالمحتوى التالي:

```html
<div class="mo-field"><label>المحافظة</label><input type="hidden" id="mo-del-city"><div class="mo-select" id="wrap-mo-del-city" data-for="mo-del-city" data-placeholder="اختر المحافظة"></div></div>
<div class="mo-field"><label>اللواء</label><input type="hidden" id="mo-del-district"><div class="mo-select" id="wrap-mo-del-district" data-for="mo-del-district" data-placeholder="اختر اللواء"></div></div>
<div class="mo-field" id="field-mo-del-subdistrict" style="display:none"><label>القضاء</label><input type="hidden" id="mo-del-subdistrict"><div class="mo-select" id="wrap-mo-del-subdistrict" data-for="mo-del-subdistrict" data-placeholder="اختر القضاء"></div></div>
<div class="mo-field"><label>المنطقة</label><input type="hidden" id="mo-del-area"><div class="mo-select" id="wrap-mo-del-area" data-for="mo-del-area" data-placeholder="اختر المنطقة"></div></div>
```

- [ ] **Step 3: Verify the new ids exist**

Run (PowerShell):
```powershell
$ids = 'mo-subdistrict','wrap-mo-subdistrict','field-mo-subdistrict','mo-del-subdistrict','wrap-mo-del-subdistrict','field-mo-del-subdistrict'; $missing = $ids | Where-Object { -not (Select-String -Path my-orders.html -Pattern ('id="' + $_ + '"') -Quiet) }; if ($missing) { "MISSING: $missing" } else { "ALL 6 IDS PRESENT" }
```
Expected: `ALL 6 IDS PRESENT`

- [ ] **Step 4: Verify old labels are gone**

Run: `Select-String -Path my-orders.html -Pattern 'المدينة|الحي'`
Expected: لا نتائج (التسميات استُبدلت بـ المحافظة/اللواء/القضاء).

- [ ] **Step 5: Commit**

```bash
git add my-orders.html
git commit -m "feat(my-orders): add subdistrict (قضاء) fields + rename location labels"
```

---

### Task 4: الكاسكيد الديناميكي — `js/my-orders.js`

**Files:**
- Modify: `js/my-orders.js` — استبدال `cascadeCity` (سطور 53-68)، تحديث `applyDelivery` (70-78)، `submitOrderFlow` (169-225)، `openDeliveryEditor` (240-251)، `saveDeliveryEditor` (257-285)

**Interfaces:**
- Consumes: من Task 2: `window.JORDAN_LOCATIONS` مع `cities()/districts()/subdistricts()/areas()`؛ من Task 3: المعرّفات الجديدة.
- Produces: `cascadeSelects(selCity, selDistrict, selSub, selArea, ids)` (تُستدعى مرتين) و `syncSubField(ids)` (تُستدعى من `applyDelivery` و `openDeliveryEditor`) — كلاهما بمدى عام داخل الملف.

- [ ] **Step 1: Replace `cascadeCity` with the generic cascade**

استبدل الكتلة (السطور 53-65: تعريف `cascadeCity`) بالإضافة لسطرَي الاستدعاء (67-68) بالكود التالي:

```js
const CHECKOUT_LOC = { city: 'mo-city', district: 'mo-district', sub: 'mo-subdistrict', subField: 'field-mo-subdistrict' };
const DELIVERY_LOC = { city: 'mo-del-city', district: 'mo-del-district', sub: 'mo-del-subdistrict', subField: 'field-mo-del-subdistrict' };

function jordanLoc() {
  return typeof window !== 'undefined' && window.JORDAN_LOCATIONS ? window.JORDAN_LOCATIONS : null;
}

function syncSubField(ids) {
  const c = $(ids.city).value, d = $(ids.district).value;
  const subs = jordanLoc() && c && d ? jordanLoc().subdistricts(c, d) : null;
  const field = $(ids.subField);
  if (field) field.style.display = subs && subs.length ? '' : 'none';
  if (!subs || !subs.length) $(ids.sub).value = '';
}

function cascadeSelects(selCity, selDistrict, selSub, selArea, ids) {
  selCity._options = () => (jordanLoc() ? jordanLoc().cities() : []);
  selCity._onPick = () => { selDistrict._setVal(''); selSub._setVal(''); selArea._setVal(''); syncSubField(ids); };
  selDistrict._options = () => {
    const c = $(ids.city).value;
    return jordanLoc() && c ? jordanLoc().districts(c) : [];
  };
  selDistrict._onPick = () => { selSub._setVal(''); selArea._setVal(''); syncSubField(ids); };
  selSub._options = () => {
    const c = $(ids.city).value, d = $(ids.district).value;
    return jordanLoc() && c && d ? (jordanLoc().subdistricts(c, d) || []) : [];
  };
  selSub._onPick = () => selArea._setVal('');
  selArea._options = () => {
    const c = $(ids.city).value, d = $(ids.district).value, s = $(ids.sub).value;
    return jordanLoc() && c && d ? jordanLoc().areas(c, d, s || undefined) : [];
  };
  syncSubField(ids);
}

cascadeSelects(makeSelect($('wrap-mo-city')), makeSelect($('wrap-mo-district')), makeSelect($('wrap-mo-subdistrict')), makeSelect($('wrap-mo-area')), CHECKOUT_LOC);
cascadeSelects(makeSelect($('wrap-mo-del-city')), makeSelect($('wrap-mo-del-district')), makeSelect($('wrap-mo-del-subdistrict')), makeSelect($('wrap-mo-del-area')), DELIVERY_LOC);
```

- [ ] **Step 2: Update `applyDelivery`**

في `applyDelivery` (بعد `$('wrap-mo-district')._setVal(d.district || '');`) أضف السطرين:

```js
  syncSubField(CHECKOUT_LOC);
  $('wrap-mo-subdistrict')._setVal(d.subdistrict || '');
```

(النتيجة: `$('wrap-mo-city')._setVal(...)` ثم `$('wrap-mo-district')._setVal(...)` ثم السطران الجديدان ثم `$('wrap-mo-area')._setVal(d.area || '');` القائم.)

- [ ] **Step 3: Update `submitOrderFlow`**

1. بعد `const district = $('mo-district').value.trim();` أضف:
```js
  const subdistrict = $('mo-subdistrict').value.trim();
```
2. استبدل سطر العنوان:
```js
  const address = [city, district, subdistrict, area, street, landmark].filter(Boolean).join('، ');
```
3. استبدل رسالة التحقق: `if (!city) return showError('يرجى إدخال المدينة');` ←
```js
  if (!city) return showError('يرجى اختيار المحافظة');
```
4. في payload دالة `API.submitOrder` أضف `district, subdistrict,` قبل `street,`:
```js
          paymentMethod, city, district, subdistrict, area, street, landmark,
```
5. في payload دالة `DB.createOrder` أضف `district, subdistrict,` بعد `city,`:
```js
          city,
          district,
          subdistrict,
          area,
          street,
          landmark,
```
6. في body جلب `api/me/delivery` (سطر 224) أضف `subdistrict`:
```js
        body: JSON.stringify({ name, phone, city, district, subdistrict, area, street, landmark }),
```

- [ ] **Step 4: Update `openDeliveryEditor`**

استبدل الأسطر الثلاثة لنسخ قيم الموقع:
```js
  $('wrap-mo-del-city')._setVal($('mo-city').value);
  $('wrap-mo-del-district')._setVal($('mo-district').value);
  $('wrap-mo-del-area')._setVal($('mo-area').value);
```
بـ:
```js
  $('wrap-mo-del-city')._setVal($('mo-city').value);
  $('wrap-mo-del-district')._setVal($('mo-district').value);
  syncSubField(DELIVERY_LOC);
  $('wrap-mo-del-subdistrict')._setVal($('mo-subdistrict').value);
  $('wrap-mo-del-area')._setVal($('mo-area').value);
```

- [ ] **Step 5: Update `saveDeliveryEditor`**

1. بعد `const district = $('mo-del-district').value.trim();` أضف:
```js
  const subdistrict = $('mo-del-subdistrict').value.trim();
```
2. استبدل رسالة التحقق: `if (!city) return showToast('يرجى اختيار المدينة', true);` ←
```js
  if (!city) return showToast('يرجى اختيار المحافظة', true);
```
3. في body الجلب أضف `subdistrict`:
```js
      body: JSON.stringify({ name, phone, city, district, subdistrict, area, street, landmark }),
```
4. في استدعاء `applyDelivery` بعد الحفظ أضف `subdistrict`:
```js
    applyDelivery({ name, phone, city, district, subdistrict, area, street, landmark });
```

- [ ] **Step 6: Syntax + lint + old-name check**

Run:
```powershell
node --check js/my-orders.js; if ($?) { npx eslint js/my-orders.js }
```
Expected: لا أخطاء.
ثم: `Select-String -Path js/my-orders.js -Pattern 'cascadeCity'`
Expected: لا نتائج (الاسم القديم اختفى تماماً).

- [ ] **Step 7: Commit**

```bash
git add js/my-orders.js
git commit -m "feat(my-orders): dynamic 3-4 level location cascade with subdistrict support"
```

---

### Task 5: الخادم — `server.js`

**Files:**
- Modify: `server.js` — `sanitizeDelivery` (سطور 284-295)

**Interfaces:**
- Consumes: body PUT `/api/me/delivery` يرسل الآن `subdistrict` (من Task 4).
- Produces: `sanitizeDelivery` يعيد `subdistrict` كحقل مفيد يُحفظ في `data/delivery-info.json` ويُعاد عبر GET `/api/me/delivery`.

- [ ] **Step 1: Add subdistrict to sanitizeDelivery**

في `server.js` داخل `sanitizeDelivery` بعد سطر `district: s(body.district, 40),` أضف:

```js
    subdistrict: s(body.subdistrict, 40),
```

- [ ] **Step 2: Syntax + lint**

Run:
```powershell
node --check server.js; if ($?) { npx eslint server.js }
```
Expected: لا أخطاء.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(server): persist subdistrict in saved delivery info"
```

---

### Task 6: التحقق الشامل

**Files:**
- لا تعديل — تحقق فقط (أصلح أي فشل فوراً في نفس الملفات السابقة).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — كل الملفات بما فيها `tests/locations.test.js` (6 اختبارات) و`tests/orders-rules.test.js` و`tests/updater.test.js` وغيرها.

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: لا أخطاء.

- [ ] **Step 3: Manual browser checklist** (افتح `my-orders.html` محلياً — الخادم لا يلزم، أو عبر `node server.js` ثم المتصفح)

| # | سيناريو | متوقع |
|---|---|---|
| 1 | اختيار "المفرق" ← "لواء قصبة المفرق" | يظهر حقل القضاء بجوار حقل اللواء |
| 2 | اختيار "قضاء بلعما" ← فتح المنطقة | مناطق بلعما تظهر (بلعما، حفير، القنيات...) |
| 3 | اختيار "إربد" ← "لواء قصبة إربد" | لا يظهر حقل القضاء، والمنطقة تعرض مناطق إربد مباشرة (إربد، أيدون، الحصن...) |
| 4 | تغيير المحافظة بعد تعبئة كاملة | تصفّر اللواء/القضاء/المنطقة، ويختفي حقل القضاء إن لم يعد لازماً |
| 5 | محرر التوصيل (حساب Google): فتح المحرر | ينقل المحافظة/اللواء/القضاء/المنطقة من نموذج الدفع، وإظهار/إخفاء القضاء حسب اللواء |
| 6 | حفظ بيانات التوصيل بقضاء ثم إعادة فتح الصفحة | كل المستويات تعود محفوظة بما فيها القضاء (من `data/delivery-info.json`) |
| 7 | إرسال طلب (وضع محلي) | سلسلة العنوان في الطلب: `المحافظة، اللواء، القضاء، المنطقة، الشارع، المعلم` |

- [ ] **Step 4: Commit any fixes**

إن ظهرت أخطاء أثناء الخطوات السابقة: أصلحها ثم `git add -A && git commit -m "fix: location cascade verification fixes"`.

---

### Task 7: الرفع على السيرفر

**Files:**
- Modify: `VERSION` (الرفع من 1.0.2 إلى 1.0.3)

- [ ] **Step 1: Bump version**

استبدل محتوى `VERSION` بـ `1.0.3` ثم `git add VERSION && git commit -m "chore(release): bump to 1.0.3"`.

- [ ] **Step 2: Deploy to Railway**

Run: `npm run deploy`
Expected: السكربت يتحقق من دخول railway CLI، يرفع الملفات لخدمة `azma-web`، ينتظر البناء حتى ظهور "AZMA running"، ثم يفحص الموقع: `https://azma-web-production.up.railway.app/` بإرجاع 200.

- [ ] **Step 3: Verify live**

Run: `Invoke-WebRequest -Uri "https://azma-web-production.up.railway.app/my-orders.html" -UseBasicParsing -TimeoutSec 20` ثم تحقق أن الصفحة تحتوي `field-mo-subdistrict`:
```powershell
$r = Invoke-WebRequest -Uri "https://azma-web-production.up.railway.app/my-orders.html" -UseBasicParsing -TimeoutSec 20; if ($r.Content -match 'field-mo-subdistrict') { "LIVE: subdistrict field present" } else { "MISSING: field not found" }
```
Expected: `LIVE: subdistrict field present`

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: deploy location cascade to production"
```
(إن لم يوجد تغيير جديد، لا حاجة لهذا الالتزام.)
