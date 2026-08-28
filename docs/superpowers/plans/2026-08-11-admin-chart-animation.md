# Admin Chart Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** إضافة رسم تصاعدي متتابع (draw-on + staggered points) لرسم الطلبات في لوحة التحكم، مع إعادة التشغيل عند كل دخول للوحة — ضمن طبقة الأنميشن الحالية بدون لمس منطق `js/admin.js`.

**Architecture:** دالة نقية `buildChartAnimationConfig(reducedMotion)` في `js/admin-animations.js` تُنتج إعدادات Chart.js (duration 900ms + easeOutQuart + تأخير متتابع للنقاط + رسم من أسفل المحور)، تُعرض عبر `window.adminAnimations` ليقرأها السكربت المدمج في `updateChart()` (admin.html). إعادة التشغيل عند دخول بانل الداشبورد تتم عبر `growthChart.reset()` + `update()` داخل مراقب البانلات الموجود.

**Tech Stack:** Chart.js 4.4.7 (المدمج بالفعل)، GSAP 3.15 (assets/vendor)، vitest.

## Global Constraints

- لا تُعدّل `js/admin.js` إطلاقاً — الطبقة إضافة خالصة فقط.
- لا تغيّر قيم Chart.js الموجودة (الألوان، aspectRatio 3، المقاسات) — تُضاف مفاتيح `animation`/`animations` فقط.
- `prefers-reduced-motion` يحترم في كل الطبقات (الوحدة كلها + إعدادات الرسم).
- أسلوب الكود يتبع الوحدة الحالية: docblock عربي، دوال نقية قابلة للاختبار، `clearProps`.
- ESLint نظيف (الملف الجديد/modified ضمن override الموجود في `eslint.config.js`).
- كل الاختبارات الحالية (75) تبقى خضراء.

---

### Task 1: دالة `buildChartAnimationConfig` + اختباراتها

**Files:**
- Modify: `js/admin-animations.js` (بعد `getDecimalPlaces` في قسم pure helpers)
- Test: `tests/admin-animations.test.js` (إضافة describe جديد)

**Interfaces:**
- Produces: `buildChartAnimationConfig(reducedMotion: boolean) → { animation, animations } | { animation: false }` — تُصدَّر export وتُعرض على `window.adminAnimations` (Task 2 يستهلكها).

- [ ] **Step 1: Write the failing test** (أضف في نهاية `tests/admin-animations.test.js`):

```js
import { buildChartAnimationConfig } from '../js/admin-animations.js';

describe('buildChartAnimationConfig', () => {
  it('يرجع إعدادات الرسم التصاعدي: 900ms + easeOutQuart', () => {
    const cfg = buildChartAnimationConfig(false);
    expect(cfg.animation.duration).toBe(900);
    expect(cfg.animation.easing).toBe('easeOutQuart');
  });

  it('يؤخر النقاط متتابعة (index × 60) بدون تأخير للخط', () => {
    const cfg = buildChartAnimationConfig(false);
    expect(cfg.animation.delay({ type: 'point', dataIndex: 3 })).toBe(180);
    expect(cfg.animation.delay({ type: 'line', dataIndex: 0 })).toBe(0);
  });

  it('يرسم من أسفل المحور عبر animations.y.from', () => {
    const cfg = buildChartAnimationConfig(false);
    const from = cfg.animations.y.from({ chartArea: { bottom: 420 } });
    expect(from).toBe(420);
    expect(cfg.animations.y.from({})).toBe(0);
  });

  it('مع reduced motion: يلغي الأنميشن تماماً', () => {
    expect(buildChartAnimationConfig(true)).toEqual({ animation: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/admin-animations.test.js`
Expected: FAIL — `buildChartAnimationConfig is not exported`

- [ ] **Step 3: Write minimal implementation** (في `js/admin-animations.js` بعد `getDecimalPlaces`):

```js
/* إعدادات رسم Chart.js: الخط يرسم من الأسفل والنقاط تظهر متتابعة (index × 60ms) */
export function buildChartAnimationConfig(reducedMotion) {
  if (reducedMotion) return { animation: false };
  return {
    animation: {
      duration: 900,
      easing: 'easeOutQuart',
      delay: (ctx) => (ctx.type === 'point' ? (ctx.dataIndex || 0) * 60 : 0),
    },
    animations: {
      y: { from: (ctx) => (ctx.chartArea ? ctx.chartArea.bottom : 0) },
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/admin-animations.test.js`
Expected: PASS (كل اختبارات الملف)

- [ ] **Step 5: عرض الدالة على window** (أضف في نهاية كتلة الإدخال، قبل `if (typeof document !== 'undefined' ...)`):

```js
if (typeof window !== 'undefined') {
  window.adminAnimations = { buildChartAnimationConfig };
}
```

- [ ] **Step 6: Commit**

```bash
git add js/admin-animations.js tests/admin-animations.test.js
git commit -m "feat: fix (chart-animation) = دالة buildChartAnimationConfig مع اختباراتها"
```

---

### Task 2: ربط `updateChart` بإعدادات الرسم

**Files:**
- Modify: `admin.html:1671` (مفتاح `options:` في `new Chart`)

**Interfaces:**
- Consumes: `window.adminAnimations.buildChartAnimationConfig(reducedMotion)` (من Task 1). غيابها = لا تغيير (Chart.js يبقى على سلوكه الافتراضي).

- [ ] **Step 1: عدّل `options` بدمج إعدادات الأنميشن**

استبدل السطر `options: {` بـ:

```js
        options: {
          ...(window.adminAnimations?.buildChartAnimationConfig?.(window.matchMedia('(prefers-reduced-motion: reduce)').matches) ?? {}),
          responsive: true,
```

(باقي مفاتيح options تبقى كما هي — الألوان/المقاسات/أدوات الرسم.)

- [ ] **Step 2: تحقق بالمتصفح (وضع عادي)**

Run: `npx http-server -p 8081` ثم Playwright:
- افتح `http://localhost:8081/admin.html` (المستخدم: admin)
- نفّذ: `window.growthChart.config.options.animation.duration` → **900**
- نفّذ: `window.growthChart.config.options.animation.easing` → **'easeOutQuart'**
- نفّذ: `window.growthChart.config.options.animations.y.from({ chartArea: { bottom: 100 } })` → **100**

- [ ] **Step 3: تحقق بالمتصفح (reduced motion)**

Run: Playwright `emulateMedia({ reducedMotion: 'reduce' })` ثم reload
Expected: `window.growthChart.config.options.animation === false`

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat: fix (chart-animation) = ربط updateChart بإعدادات الرسم التصاعدي"
```

---

### Task 3: إعادة تشغيل الرسم عند دخول لوحة التحكم

**Files:**
- Modify: `js/admin-animations.js` (دالة `setupPanelObserver` + دالة جديدة `replayGrowthChart`)

**Interfaces:**
- Consumes: `growthChart` (ربط global lexical من السكربت المدمج — ليس على window) — يُتحقق منه بـ `typeof`.
- Produces: إعادة رسم تلقائية عند كل دخول لبانل الداشبورد.

- [ ] **Step 1: أضف دالة `replayGrowthChart`** (بعد `animatePanelEnter`):

```js
/* إعادة تشغيل رسم الطلبات عند دخول لوحة التحكم (Chart.js reset + update يعيدان الأنميشن) */
function replayGrowthChart() {
  if (typeof growthChart === 'undefined' || !growthChart) return;
  gsap.delayedCall(0.15, () => {
    growthChart.reset();
    growthChart.update();
  });
}
```

- [ ] **Step 2: استدعِها عند دخول بانل الداشبورد** — في `setupPanelObserver` بعد `animatePanelEnter(active);`:

```js
    current = id;
    animatePanelEnter(active);
    if (id === 'panel-dashboard') replayGrowthChart();
```

- [ ] **Step 3: أضف `growthChart` إلى globals في `eslint.config.js`** (في override الخاص بالملف):

```js
globals: { gsap: 'readonly', MutationObserver: 'readonly', matchMedia: 'readonly', growthChart: 'readonly' },
```

- [ ] **Step 4: تحقق بالمتصفح**

Run: `npx eslint js/admin-animations.js` → نظيف. ثم Playwright:
- افتح اللوحة، انتقل لبانل الإعدادات ثم عُد للداشبورد
- نفّذ بعد 300ms من العودة: `window.growthChart._animations.size` → `> 0` (الرسم يعيد الحركة)
- انتظر 1.5s ثم نفّذ نفس الفحص → `0` (انتهت الحركة)

- [ ] **Step 5: Commit**

```bash
git add js/admin-animations.js eslint.config.js
git commit -m "feat: fix (chart-animation) = إعادة تشغيل الرسم عند دخول لوحة التحكم"
```

---

### Task 4: تحقق شامل وإغلاق

- [ ] **Step 1: الاختبارات الكاملة**

Run: `npm test`
Expected: `Test Files 10 passed` و `Tests 84 passed` (75 + 9 الجديدة)

- [ ] **Step 2: ESLint الكامل للملفين المعدلين**

Run: `npx eslint js/admin-animations.js && npx eslint tests/admin-animations.test.js`
Expected: بدون أخطاء (أخطاء ما قبل الجلسة في ملفات أخرى غير مشمولة)

- [ ] **Step 3: إعادة بناء desktop/web**

Run: `node desktop/scripts/build-web.mjs`
Expected: `Built 26 web files → desktop/web` وتأكد: `Test-Path desktop/web/js/admin-animations.js`

- [ ] **Step 4: تحديث وثيقة التصميم**

أضف فقرة «رسم الطلبات (Chart.js)» في `docs/superpowers/specs/2026-08-11-admin-panel-animations-design.md` (القسم «التصميم») مع تلخيص: رسم تصاعدي 900ms + نقاط متتابعة 60ms + إعادة تشغيل عند دخول اللوحة + reduced-motion → مدة صفر.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-11-admin-panel-animations-design.md
git commit -m "docs: (chart-animation) = تحديث وثيقة التصميم بقسم رسم الطلبات"
```

---

## Self-Review

- **Spec coverage:** رسم تصاعدي (Task 1-2 ✓) · نقاط متتابعة (delay ✓) · إعادة تشغيل عند دخول اللوحة (Task 3 ✓) · تلقائي عند تغيير النطاق (updateChart تُعيد الإنشاء بنفس الإعدادات ✓) · reduced-motion (Task 1 اختبار + Task 2 تحقق ✓) · اختبارات (9 جديدة ✓) · تحقق متصفح (Tasks 2-3 ✓) · توثيق (Task 4 ✓)
- **Placeholder scan:** كل الخطوات تحتوي كوداً فعلياً كاملاً ✓
- **Type consistency:** `buildChartAnimationConfig(reducedMotion)` signature ثابتة في كل المهام (import في الاختبار، استدعاء في updateChart، عرض على window) ✓ — `replayGrowthChart` معرفة في Task 3 ومستخدمة في نفس المهمة ✓
