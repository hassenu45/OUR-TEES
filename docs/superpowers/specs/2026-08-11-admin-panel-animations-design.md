# لوحة تحكم AZMA — طبقة أنميشن GSAP (تصميم)

**التاريخ:** 2026-08-11
**المشروع:** Our Tees (AZMA)
**النطاق:** `admin.html` (لوحة التحكم كاملة: لوحة التحكم، الإعدادات، الذكاء الاصطناعي، البوت الخارجي، إضافة المنتج، إدارة المنتجات، الطلبات)

## القرارات المعتمدة (من جلسة العصف الذهني)

| البند | القرار |
|---|---|
| النطاق | لوحة التحكم كاملة في `admin.html` |
| الأداة | GSAP 3.15 عبر import map من `node_modules` (نمط `21.html`/`designer.html`) |
| التعامل مع AOS + animate.css | **إضافة دون إزالة** — تقسيم ملكية صارم بلا تداخل |
| الأسلوب | ناعم واحترافي: 0.3–0.6s، fade + slide خفيف، stagger، عدّادات متحركة |
| البنية | ملف مستقل `js/admin-animations.js` (ES module) — لا يلمس `js/admin.js` ولا السكربت المدمج |
| تحميل GSAP | نسخة محلية `assets/vendor/gsap.min.js` (UMD من `node_modules/gsap/dist/`) — لأن `desktop/web` يُبنى من `web-files.json` بدون node_modules، و`assets/**` مشمول في النسخة فيعمل دون إنترنت وفي كل البيئات (ديستوب/ويب/file://) |

## تقسيم الملكية (منع التداخل)

- **يبقى لـ AOS + CSS:** ظهور أول للوحة الرئيسية عند فتح الصفحة (`data-aos`)، دخول بطاقات الإعدادات المتدرج الحالي (`settingsCardIn`)، `panelIn`، `toastIn`، `modalIn`، `iconPop`.
- **يصبح لـ GSAP حصراً** (أين لا يصل AOS أبداً):
  1. تبديل البانلات — الدخول المتدرج لبطاقات البانل الجديد عند أول تفعيل
  2. عدّادات الإحصائيات (0 → القيمة) + عدادات شارة السايدبار
  3. خروج التوست (حالياً مفقود — إخفاء فوري)
  4. الصفوف الديناميكية (المنتجات، الطلبات، صفوف اللايكات، آخر الطلبات، الأكثر مبيعاً)
  5. نبضة زر الحفظ عند نجاح الحفظ
  6. دخول أولي خفيف للسايدبار والهيدر

## آلية الربط (بدون تعديل admin.js)

تستخدم وحدة الأنميشن **MutationObserver** للاستماع لتغيرات DOM الحالية:

| المُلاحَظ | التغيير المُراقَب | الاستجابة |
|---|---|---|
| `.main` (attributeFilter class) | بانل يكتسب `.active` | stagger بطاقات البانل الجديد (`> .card` أو `.settings-wrap`)، مع إزالة `data-aos` من العناصر المتحركة لمنع إطلاق AOS متأخر (مرة واحدة، `once:true`) |
| `#toast` (attributeFilter style) | `display:none` | إلغاء الإخفاء الفوري + خروج سلس 0.22s ثم الإخفاء (حارس `_skipOnce` ضد حلقة الملاحظة) |
| `#toast` (childList) | نص جديد يحوي "تم حفظ" | نبضة `scale` لزر الحفظ في البانل النشط |
| `#stat-products`, `#stat-orders`, `#stat-pending`, `#stat-revenue`, `#sidebar-products-count`, `#sidebar-orders-count` (childList+subtree) | قيمة رقمية جديدة | عدّاد 0 → القيمة (مع الاحتفاظ بلاحقة HTML مثل `<span>ر.س</span>`)، حارس `animating` لمنع الحلقة اللانهائية |
| `#products-grid`, `#admin-orders-list`, `#likes-per-product`, `#dashboard-recent-orders`, `#dashboard-top-products` (childList) | صفوف مضافة | stagger دخول الصفوف (0.04s بين كل صف) |

## الدوال النقية القابلة للاختبار (تصدير من الوحدة)

- `parseCounterHTML(html)` → `{ prefix, suffix, value }` — يستخرج الرقم البادئ من HTML (مثال: `"1234.50 <span>ر.س</span>"` → prefix `1234.50`، suffix `<span>ر.س</span>`، value `1234.5`)
- `shouldSkipAnimations(reducedMotionBool)` → skip عند `prefers-reduced-motion: reduce`
- `getDecimalPlaces(prefix)` → عدد خانات الكسر لعرض العدّاد

## الضمانات

- `gsap.killTweensOf` قبل أي إعادة تحريك لنفس العناصر (تبديل بانلات متكرر)
- `transform`/`opacity` فقط — لا layout thrash
- `prefers-reduced-motion` → لا تُنشأ أي حركة ولا تُضبط `opacity:0` (لا عناصر عالقة مخفية)
- انسجام مع `panelIn`/`settingsCardIn` — GSAP يحرك الأطفال فقط، CSS يحرك البانل/البطاقات
- import map بمسار نسبي `./node_modules/gsap/index.js` يعمل مع السيرفر (`http://localhost:3000`) وفتح الملف مباشرة (`file://`)

## ملفات متأثرة

| الملف | التغيير |
|---|---|
| `js/admin-animations.js` | **جديد** — وحدة الأنميشن (ES module بدون استيرادات خارجية، يعمل أيضاً تحت vitest لاختبار الدوال النقية) |
| `admin.html` | إضافة `<script src="assets/vendor/gsap.min.js">` + `<script type="module" src="js/admin-animations.js">` قبل إغلاق `</body>` |
| `assets/vendor/gsap.min.js` | **جديد** — نسخة GSAP 3.15.0 المبنية (UMD) منسوخة من `node_modules/gsap/dist/` |
| `eslint.config.js` | override لـ `js/admin-animations.js` (sourceType: module) |
| `tests/admin-animations.test.js` | **جديد** — 9 اختبارات للدوال النقية |

## التحقق

1. `npm test` — اختبارات الدوال النقية (parseCounterHTML, shouldSkipAnimations, getDecimalPlaces)
2. `npm run lint` — نظافة الكود
3. فحص يدوي عبر Playwright (وضع محلي `file://`):
   - لا أخطاء Console
   - تبديل البانلات يحرك البطاقات (لا تعارض مع AOS على الوحة الرئيسية)
   - العدّادات تتصاعد من 0
   - `emulateMedia(reduced-motion)` يلغي الحركة ويترك كل العناصر مرئية
