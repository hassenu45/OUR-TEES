# كشف توصيل PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** إعادة تصميم كشف التوصيل PDF في لوحة الإدارة: رأس نظيف (لوغو + تاريخ)، حذف بطاقات الملخص، ترتيب أبجدي أ→ي، QR اتصال + واتساب خاص بكل عميل تحت اسمه، تذييل رقم صفحة فقط.

**Architecture:** استخراج الدوال النقية (فرز عربي، بناء روابط QR) إلى ملف مستقل `js/pdf-manifest.js` قابل للاختبار (نمط UMD: CommonJS للاختبار + `window.ManifestUtils` للمتصفح — نفس نمط `js/admin-animations.js` المحمّل كسكريبت مستقل)، ثم تعديل `exportOrdersPDF()` في `js/admin.js` لاستخدامها مع إعادة هيكلة الرأس/الشريط/التذييل وإضافة توليد QR متزامن قبل `html2canvas`.

**Tech Stack:** JavaScript كلاسيكي (لا وحدات ES)، vitest، qrcodejs، html2canvas، jsPDF.

## Global Constraints

- لا تُعدّل دوال `generatePhoneQR` / `generateWhatsAppURL` في `admin.js` (تُستخدم في شاشة الطلبات) — تُعاد كتابة منطقها النقي في `pdf-manifest.js` فقط.
- الحفاظ على لوحة الألوان: كريمي `#F9F6F0`، كهرماني `#A16207`، ستوني `#1C1917`.
- لا تغيير على CSV أو شاشة الطلبات.
- `admin.js` سكريبت كلاسيكي — الوصول للدوال المساعدة عبر `window.ManifestUtils` حصراً.
- الـ QR: `colorDark #0C0A09` / `colorLight #FFFFFF`، `correctLevel M`، أبعاد 40px، يولَّد بعد `innerHTML` وقبل `html2canvas`.
- الفرز: `localeCompare('ar', { sensitivity: 'base' })`، الأسماء الفارغة/`-` أخيراً، الإيموجي والرموز تُنقّى قبل الفرز.

---

### Task 1: إنشاء `js/pdf-manifest.js` — الدوال النقية + الاختبارات (TDD)

**Files:**
- Create: `js/pdf-manifest.js`
- Test: `tests/pdf-manifest.test.js`

**Interfaces:**
- Produces:
  - `cleanNameForSort(name) → string` (تنقية الاسم: إزالة الإيموجي/الرموز/التشكيل والمسافات الزائدة)
  - `sortByName(a, b) → number` (مقارنة أسماء عملاء، الفارغ/`-` أخيراً)
  - `sortRegionGroups(entries) → entries` (فرز مصفوفة `[key, items]` أبجدياً، المفتاح الفارغ أخيراً)
  - `buildTelQrText(phone) → string` (نفس منطق `generatePhoneQR`)
  - `buildWaQrText(phone, message) → string` (نفس منطق `generateWhatsAppURL`)
  - نطاق عام للمتصفح: `window.ManifestUtils = { cleanNameForSort, sortByName, sortRegionGroups, buildTelQrText, buildWaQrText }`

- [ ] **Step 1: كتابة الاختبار الفاشل** — `tests/pdf-manifest.test.js`

```js
import { describe, it, expect } from 'vitest';
import {
  cleanNameForSort,
  sortByName,
  sortRegionGroups,
  buildTelQrText,
  buildWaQrText,
} from '../js/pdf-manifest.js';

describe('cleanNameForSort', () => {
  it('يزيل بادئة الإيموجي والرموز', () => {
    expect(cleanNameForSort('🔴 أحمد محمد')).toBe('أحمد محمد');
    expect(cleanNameForSort('• خالد')).toBe('خالد');
  });
  it('يزيل التشكيل', () => {
    expect(cleanNameForSort('مُحَمَّد')).toBe('محمد');
  });
  it('يعيد سلسلة فارغة للمدخلات الفارغة', () => {
    expect(cleanNameForSort('')).toBe('');
    expect(cleanNameForSort(null)).toBe('');
    expect(cleanNameForSort(undefined)).toBe('');
  });
});

describe('sortByName', () => {
  it('يرتب عربياً من الألف للياء', () => {
    const names = ['محمد', 'أحمد', 'علي', 'خالد'];
    names.sort(sortByName);
    expect(names).toEqual(['أحمد', 'خالد', 'علي', 'محمد']);
  });
  it('يدفع الأسماء الفارغة و - للنهاية', () => {
    const names = ['باسم', '-', '', 'أحمد'];
    names.sort(sortByName);
    expect(names).toEqual(['أحمد', 'باسم', '', '-']);
  });
  it('يقارن بلا حساسية للتشكيل', () => {
    const names = ['مُحمد', 'محمد'];
    expect(sortByName(names[0], names[1])).toBe(0);
  });
});

describe('sortRegionGroups', () => {
  it('يرتب المناطق أبجدياً والمفتاح الفارغ أخيراً', () => {
    const groups = [
      ['زرقاء — عام', [1]],
      ['عمان — الجبيهة', [1]],
      ['', [1]],
      ['إربد — المدينة', [1]],
    ];
    const sorted = sortRegionGroups(groups);
    expect(sorted.map((g) => g[0])).toEqual(['إربد — المدينة', 'عمان — الجبيهة', 'زرقاء — عام', '']);
  });
});

describe('buildTelQrText', () => {
  it('يبني tel:+962 من رقم يبدأ 0', () => {
    expect(buildTelQrText('0791234567')).toBe('tel:+962791234567');
  });
  it('يزيل المسافات والرموز', () => {
    expect(buildTelQrText('0791 234 567-')).toBe('tel:+962791234567');
  });
  it('يحافظ على البادئة 962 الموجودة', () => {
    expect(buildTelQrText('962791234567')).toBe('tel:+962791234567');
  });
});

describe('buildWaQrText', () => {
  it('يبني wa.me مع ترميز الرسالة', () => {
    expect(buildWaQrText('0791234567', 'مرحباً')).toBe(
      'https://wa.me/962791234567?text=' + encodeURIComponent('مرحباً')
    );
  });
  it('يحافظ على البادئة 962', () => {
    expect(buildWaQrText('962791234567', '')).toBe('https://wa.me/962791234567?text=');
  });
});
```

- [ ] **Step 2: تشغيل الاختبار للتأكد من الفشل**

Run: `npx vitest run tests/pdf-manifest.test.js`
Expected: FAIL — "Cannot find module '../js/pdf-manifest.js'"

- [ ] **Step 3: تنفيذ `js/pdf-manifest.js`**

```js
// دوال نقية لكشف التوصيل PDF — تُحمَّل قبل admin.js وتُستخدم عبر window.ManifestUtils
(function (global) {
  // يزيل الإيموجي والرموز غير العربية/اللاتينية والتشكيل والمسافات الزائدة
  function cleanNameForSort(name) {
    if (!name) return '';
    return String(name)
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // مقارنة أسماء العملاء أبجدياً (أ→ي)؛ الفارغ/'-' أخيراً
  function sortByName(a, b) {
    const ca = cleanNameForSort(a);
    const cb = cleanNameForSort(b);
    const aEmpty = ca === '' || a === '-' || a == null;
    const bEmpty = cb === '' || b === '-' || b == null;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    return ca.localeCompare(cb, 'ar', { sensitivity: 'base' });
  }

  // يرتب مصفوفة [key, items] أبجدياً؛ المفتاح الفارغ أخيراً
  function sortRegionGroups(entries) {
    return entries.slice().sort((x, y) => {
      const kx = String(x[0] || '').trim();
      const ky = String(y[0] || '').trim();
      if (!kx && !ky) return 0;
      if (!kx) return 1;
      if (!ky) return -1;
      return kx.localeCompare(ky, 'ar', { sensitivity: 'base' });
    });
  }

  // رابط اتصال tel: بصيغة +962 (مطابق لمنطق generatePhoneQR في admin.js)
  function buildTelQrText(phone) {
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    return 'tel:+962' + (cleanPhone.startsWith('0') ? cleanPhone.slice(1) : cleanPhone);
  }

  // رابط واتساب wa.me بصيغة 962 (مطابق لمنطق generateWhatsAppURL في admin.js)
  function buildWaQrText(phone, message) {
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    const waPhone = cleanPhone.startsWith('0')
      ? '962' + cleanPhone.slice(1)
      : cleanPhone.startsWith('962')
        ? cleanPhone
        : '962' + cleanPhone;
    const text = encodeURIComponent(message || '');
    return 'https://wa.me/' + waPhone + '?text=' + text;
  }

  const api = { cleanNameForSort, sortByName, sortRegionGroups, buildTelQrText, buildWaQrText };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ManifestUtils = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: تشغيل الاختبار للتأكد من النجاح**

Run: `npx vitest run tests/pdf-manifest.test.js`
Expected: PASS (5 describe blocks)

- [ ] **Step 5: Commit**

```bash
git add js/pdf-manifest.js tests/pdf-manifest.test.js
git commit -m "feat: pure helpers for delivery manifest PDF (sort + QR links) with tests"
```

---

### Task 2: تعديل `exportOrdersPDF()` في `js/admin.js`

**Files:**
- Modify: `js/admin.js:932-1124` (دالة `exportOrdersPDF` بالكامل)

**Interfaces:**
- Consumes: `window.ManifestUtils.{sortByName, sortRegionGroups, buildTelQrText, buildWaQrText}` (من Task 1)
- Produces: دالة `exportOrdersPDF` محسّنة + دالة داخلية `renderPageQRs(pageRoot)` تولّد QR على عناصر `canvas[data-qr-text]` في الصفحة قبل `html2canvas`.

- [ ] **Step 1: إزالة الملخصات غير المطلوبة**

في `exportOrdersPDF`:
- حذف `statusLabel`، `manifestNo`، `grandTotal`، `groupCount`.
- حذف دالة `summaryHTML` بالكامل.
- تعديل `pageHTML`: صفحة أولى = `headerHTML() + tableHTML(pageBlocks)` بدون `summaryHTML()`.

- [ ] **Step 2: إضافة الفرز الأبجدي**

بعد بناء `groups` (Map) مباشرةً:
- فرز عناصر كل مجموعة: `items.sort((x, y) => window.ManifestUtils.sortByName(x.o.customerName, y.o.customerName))`
- فرز المجموعات: `const sortedGroups = window.ManifestUtils.sortRegionGroups(Array.from(groups.entries()));` ثم استبدال `groups.forEach(...)` بـ `sortedGroups.forEach(...)`.

- [ ] **Step 3: تبسيط الرأس `headerHTML`**

استبدال `headerHTML` الحالي بـ:

```js
const headerHTML = () =>
  '<div style="display:flex;justify-content:space-between;align-items:flex-end;">' +
  '<div><div style="font-family:Cormorant,serif;font-size:38px;font-weight:700;color:#A16207;line-height:1;">' + siteName + '</div></div>' +
  '<div style="text-align:left;font-size:13px;color:#57534E;font-weight:700;padding-bottom:2px;">' + dateLabel + '</div></div>' +
  '<div style="height:3px;background:#A16207;border-radius:2px;margin-top:14px;"></div>';
```

(حذف "— كشف توصيل"، السطر التعريفي، الحالة، رقم المانيفست — إبقاء `dateLabel` فقط.)

- [ ] **Step 4: تبسيط شريط المنطقة `secBar`**

استبدال `secBar` بـ:

```js
const secBar = (b) =>
  '<tr><td colspan="11" style="background:#1C1917;color:#FFFFFF;padding:7px 10px;border-radius:6px;">' +
  '<span style="font-weight:800;font-size:13px;">📍 ' + b.label + '</span>' +
  '<span style="float:left;font-size:12px;color:#E7E5E4;">عدد الطلبات: ' + b.count + '</span></td></tr>';
```

(حذف `مجموع المنطقة` — إبقاء الاسم والعدد فقط.)

- [ ] **Step 5: عمود العميل + الـ QR في `rowHTML`**

استبدال `rowHTML` بـ:

```js
const rowHTML = (b) => {
  const hasPhone = b.phoneText ? true : false;
  const qrCell = hasPhone
    ? '<div style="display:flex;gap:8px;margin-top:5px;justify-content:flex-start;">' +
      '<div style="text-align:center;"><canvas data-qr-text="' + b.telQr + '" data-qr-size="38"></canvas>' +
      '<div style="font-size:8.5px;color:#78716C;font-weight:700;margin-top:2px;">اتصال</div></div>' +
      '<div style="text-align:center;"><canvas data-qr-text="' + b.waQr + '" data-qr-size="38"></canvas>' +
      '<div style="font-size:8.5px;color:#78716C;font-weight:700;margin-top:2px;">واتساب</div></div></div>'
    : '';
  return '<tr style="' + (b.seq % 2 === 0 ? 'background:#F9F6F0;' : '') + '">' +
    '<td style="text-align:center;font-weight:800;color:#A16207;">' + b.seq + '</td>' +
    '<td style="text-align:center;direction:ltr;font-size:10.5px;color:#78716C;">' + b.id + '</td>' +
    '<td style="font-weight:700;vertical-align:middle;">' + b.name + qrCell + '</td>' +
    '<td style="text-align:center;direction:ltr;unicode-bidi:embed;font-weight:700;font-size:12.5px;">' + b.phoneText + '</td>' +
    '<td style="font-size:11.5px;">' + b.product + '</td>' +
    '<td style="text-align:center;font-size:11px;">' + b.prodType + '</td>' +
    '<td style="text-align:center;font-size:11px;">' + b.size + '</td>' +
    '<td style="text-align:center;font-weight:700;white-space:nowrap;">' + b.price + '</td>' +
    '<td style="text-align:center;font-size:11px;">' + b.payment + '</td>' +
    '<td style="font-size:10.5px;color:#57534E;white-space:normal;line-height:1.5;">' + b.address + '</td>' +
    '<td style="font-size:10px;color:#78716C;white-space:normal;line-height:1.5;">' + b.notes + '</td></tr>';
};
```

- [ ] **Step 6: إضافة حقول QR عند بناء blocks**

في حلقة بناء `blocks` (داخل `items.forEach`)، استبدال حقل `phone` بـ:

```js
phoneText: o.phone || '-',
telQr: o.phone ? window.ManifestUtils.buildTelQrText(o.phone) : '',
waQr: o.phone
  ? window.ManifestUtils.buildWaQrText(o.phone, 'مرحباً ' + (o.customerName || '') + '، بخصوص طلبك')
  : '',
```

(وإزالة صيغة `phone` القديمة بالسبان LTR لأنها أصبحت نصاً عادياً في `rowHTML`.)

- [ ] **Step 7: تبسيط التذييل `footerHTML`**

استبدال `footerHTML` بـ:

```js
const footerHTML = (pageNum, totalPages) =>
  '<div style="position:absolute;bottom:14px;right:32px;left:32px;display:flex;justify-content:center;align-items:center;border-top:2px solid #A16207;padding-top:8px;">' +
  '<span style="font-size:11px;color:#78716C;">صفحة ' + pageNum + ' من ' + totalPages + '</span></div>';
```

(حذف اسم الموقع وخطوط التوقيع — وتحديث نداءه في `pageHTML` إلى `footerHTML(pageNum, totalPages)` بلا `isLast`.)

- [ ] **Step 8: ضبط سعة الصفحة**

استبدال `const capFor = (isFirst) => (isFirst ? 11 : 16);` بـ:
`const capFor = (isFirst) => (isFirst ? 8 : 11);`

- [ ] **Step 9: توليد QR قبل html2canvas**

إضافة دالة داخل `exportOrdersPDF`:

```js
const renderPageQRs = (root) => {
  if (typeof QRCode === 'undefined') return;
  root.querySelectorAll('canvas[data-qr-text]').forEach((c) => {
    const size = parseInt(c.dataset.qrSize || '38', 10);
    new QRCode(c, {
      text: c.dataset.qrText,
      width: size,
      height: size,
      colorDark: '#0C0A09',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.M,
    });
  });
};
```

وفي حلقة التصدير، بعد `wrap.innerHTML = pageHTML(...)` وقبل `html2canvas`:
`renderPageQRs(wrap);`

- [ ] **Step 10: التحقق من الكود (Lint)**

Run: `npx eslint js/admin.js`
Expected: لا أخطاء (إن وُجدت أخطاء بأسماء غير معرّفة مثل `ManifestUtils`، استخدم `window.ManifestUtils` أو أضفها لتعليق `/* global */` في أعلى الملف)

- [ ] **Step 11: Commit**

```bash
git add js/admin.js
git commit -m "feat: redesign delivery manifest PDF (clean header, alphabetical sort, per-customer QR)"
```

---

### Task 3: ربط السكريبت + فحص شامل

**Files:**
- Modify: `admin.html:1537` (قبل سطر `<script src="js/admin.js">`)

- [ ] **Step 1: إضافة سكريبت المساعدات**

أضف قبل `<script src="js/admin.js">`:
`<script src="js/pdf-manifest.js"></script>`

- [ ] **Step 2: تشغيل كل الفحوصات**

Run:
1. `npx vitest run` — Expected: كل الاختبارات (القديمة + الجديدة) PASS
2. `npm run lint` — Expected: لا أخطاء
3. `npm run format:check` على الملفات المعدلة — Expected: لا مخالفات

- [ ] **Step 3: فحص يدوي في المتصفح (خطوات للمستخدم)**

1. فتح `admin.html` → تبويب الطلبات → (يُفضّل وضع ترشيح "قيد التسليم" أو "الكل")
2. الضغط على زر **🧾 كشف PDF**
3. التحقق: رأس = لوغو + تاريخ فقط؛ لا بطاقات ملخص؛ شريط المنطقة = اسم + عدد؛ الأسماء أ→ي داخل كل منطقة؛ المناطق مرتبة؛ QR اتصال + واتساب تحت كل اسم؛ تذييل = رقم صفحة فقط
4. مسح QR اتصال بكاميرا الجوال → يظهر الرقم جاهز للاتصال؛ مسح QR واتساب → يفتح المحادثة

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "chore: load pdf-manifest helpers in admin panel"
```
