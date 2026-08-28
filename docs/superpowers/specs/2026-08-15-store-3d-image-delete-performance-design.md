# متجر AZMA — مجسم 3D على صفحة الطلب + حذف الصور من التطبيق + أداء عالي (تصميم)

**التاريخ:** 2026-08-15
**المشروع:** Our Tees (AZMA)
**النطاق:** `server.js`, `js/api.js`, `js/admin.js`, `admin.html`, `store.html`, `js/store.js`, `index.html`, `styles.css` + وحدة جديدة `js/tee3d.js`

## القرارات المعتمدة (من جلسة العصف الذهني)

| البند | القرار |
|---|---|
| حذف الصور | من تطبيق إعدادات AZMA داخل قسم إضافة/تعديل المنتجات فقط (بدون مكتبة صور منفصلة) |
| المجسم 3D | مجسم تيشيرت جاهز واحد (`21/model.obj`) لكل المنتجات — التصميم مطبوع على الصدر بنظام Decal المعتمد |
| مكان العرض | نافذة الطلب (quick-view modal) في `store.html` — زر تبديل [صور / 3D] |
| التحميل | كسول: three.js والوحدة تُحمَّلان عند أول فتح للنافذة فقط، ويُحرَّر الـ GPU عند الإغلاق |
| الأداء | ضغط ذكي للصور وقت الرفع (canvas client-side) + lazy loading شامل + أنيميشن transform/opacity + prefers-reduced-motion |
| الأداة 3D | Three.js من import map (نمط `21.html`) + OBJLoader + DecalGeometry + OrbitControls |
| المهارات | `tshirt-3d-prints` (قواعد decals الإلزامية) + `impeccable`/`design-taste` لضبط الحركات |

---

## الجزء 1: حذف الصور من التطبيق

### السيرفر — `server.js`

- إضافة `DELETE /api/uploads/:name` محمي بـ `requireAuth`:
  - الاسم يُقبل فقط إذا تطابق `^[A-Za-z0-9._-]+$` (بدون `/`, `\`, `..`)
  - المسار الكامل يُحل داخل `UPLOADS_DIR` (نفس نمط فحص `deleteProduct`)
  - **لا يحذف** الملف إن كان مستخدماً في أي منتج (`db` فحص `image`/`images`)
  - نجاح: `200 { deleted: true }` — غير موجود: `404`
- لا تغيير على `DELETE /api/products/:id` (يحذف الصور المرتبطة أصلاً)

### لوحة التحكم — `js/api.js` + `js/admin.js` + `admin.html`

- `API.deleteUploadedImage(url)` → `DELETE /api/uploads/:name` (استخراج الاسم من `/uploads/...`)
- **نافذة تعديل المنتج** (`editRemoveImage(i)`):
  - إذا كان `img.src` يبدأ بـ `/uploads/` → نداء `API.deleteUploadedImage` (async، مع toast خطأ عند الفشل — لا يمنع إزالة الصورة من القائمة)
  - يبقى السلوك الحالي لإزالة blob (صور جديدة لم تُرفع)
- **نموذج إضافة منتج**: إضافة زر ✕ فوق كل صورة معاينة (`previewProductImages`) يزيل الملف من `input.files` عبر `DataTransfer` ويحدّث المعاينة
- زر ✕ الموجود حالياً في `renderEditImages` يعمل أصلاً — يتغير فقط ليحذف من السيرفر

### اختبارات — `tests/api.test.js` (نمط vitest الحالي)

- رفع صورة → `DELETE /api/uploads/:name` → `200` → `GET /uploads/:name` → `404`
- `DELETE` بدون تسجيل دخول → `401`
- `DELETE /api/uploads/..%2fsecret` أو `../x` → `400` (مرفوض)
- ملف مستخدم بمنتج → الحذف مرفوض ولا يُحذف الملف

---

## الجزء 2: مجسم 3D على نافذة الطلب

### الوحدة الجديدة `js/tee3d.js` (ES module)

- API: `class TeeViewer` — `mount(container, { imageSrc })`, `setImage(src)`, `dispose()`, `get ready`
- تحميل `21/model.obj` + `21/model.mtl` + `21/Binary_0.jpeg` (الخامة الأصلية للقماش)
- **المطبوع (Decal)** — قواعد `tshirt-3d-prints` إلزامية:
  - `DecalGeometry` حقيقي world-space على الصدر عبر raycast (`findSurface` pattern من `21.html`)
  - المادة: `MeshBasicMaterial` بـ map، `transparent`, `depthWrite:false`, `side:DoubleSide`, `alphaTest:0.05`, `polygonOffset` factor/units `-2`
  - `nudge = 0.012 * printScale + 0.004` كحارس إضافي لمنع الغرق
  - `Texture` عبر `img.onload` متزامن (لا `TextureLoader`) مع `colorSpace=SRGBColorSpace`, `anisotropy=8`
  - حارس geometry الفارغ (مطبوع خارج القماش → احتفاظ بالقديم)
- OrbitControls: سحب دوران 360° + زوم عجلة/لمس + دوران تلقائي بطيء (`autoRotate 0.6`) يتوقف عند السحب
- إضاءة: Hemisphere + Directional (نمط 21.html)
- إعادة ضبط الكاميرا عند تغيير صورة المنتج
- إن لم يتوفر WebGL: `ready=false` → المتجر يعرض تنبيه صغير ويبقى على الصور

### `store.html` + `js/store.js`

- إضافة import map (three + addons) — كما في `21.html` (من `node_modules`، مسار نسبي)
- زر تبديل في `quickview-main-img`: `[📷 صور] [🧊 3D]` (فقط إذا المنتج له صورة)
- وضع 3D: إخفاء الصورة/الأسهم/الثرامبس وإظهار `canvas` بنفس المساحة
- **تحميل كسول**: `import('js/tee3d.js')` يُستدعى **عند أول ضغط على زر 3D فقط** — لا يُحمَّل عند فتح النافذة ولا عند تحميل الصفحة
- `closeQuickView()` → `viewer.dispose()` + إزالة الكانفاس (توفير GPU)
- عند إعادة فتح النافذة لنفس/منتج آخر → إعادة إنشاء بـ `setImage`
- صور base64 (وضع file:// المحلي) تعمل أيضاً (Texture يقبل data URLs)

### تحقق

- فتح نافذة الطلب → زر 3D → المجسم يظهر بالتصميم المطبوع على الصدر → دوران 360° سلس بلا غرق/تقاطع للطباعة
- إغلاق النافذة → لا استهلاك GPU مستمر
- تحميل الصفحة الأول لا يشمل three.js (Network tab)

---

## الجزء 3: الأداء والسلاسة (فريمات عالية)

### ضغط ذكي عند الرفع (بدون مكتبات جديدة)

- `js/api.js` + `js/admin.js` + `previewProductImages`/`previewEditImages`:
  - قبل الرفع: canvas → تصغير إلى `maxWidth 1600px` (أو أصغر من الأصل) → `toBlob('image/webp', 0.85)` مع fallback JPEG إن لم يدعم WebP (كشف `canvas.toDataURL('image/webp').startsWith('data:image/webp')`)
  - نفس الضغط يُطبق على الصور المفردة (`uploadProductImage`) والمتعددة (`uploadImages`, `with-images`)
  - ملف مساعد `js/image-compress.js` (سكربت كلاسيكي يعرّف `window.compressImage(file, { maxWidth, quality })` → `Promise<Blob>`) يُحمَّل قبل `js/api.js` في `admin.html` فقط (الصفحة الوحيدة التي ترفع صوراً) — و`js/api.js` يحمي بالفحص `typeof compressImage === 'function'`

### سرعة فتح الصفحات

- `store.html` + `index.html`: `loading="lazy"` + `decoding="async"` لكل صور الشبكة/الأقسام (الهيرو يبقى `fetchpriority="high"` + `decoding="async"`)
- three.js يُحمَّل عند فتح نافذة الطلب فقط (الجزء 2)

### سلاسة 60fps

- مراجعة `styles.css` والأنيميشن في `index.html`/`store.html`:
  - تحويل أي أنيميشن layout (margin/top/width/height) إلى `transform`/`opacity` فقط
  - `will-change` بحذر (فقط على العناصر المتحركة الدائمة)
  - إضافة `@media (prefers-reduced-motion: reduce)` في `styles.css` يعطّل الحركات الزخرفية (نمط admin الحالي)
- استخدام `impeccable`/`design-taste` مهارات عند ضبط النتائج النهائية

### تحقق الأداء

- `npm run test` أخضر
- فحص Network: صور WebP أصغر + لا three.js قبل فتح النافذة
- حركات الصفحة سلسة على جهاز متوسط (لا jank عند السكرول)

---

## ملفات متأثرة

| الملف | التغيير |
|---|---|
| `server.js` | إضافة `DELETE /api/uploads/:name` |
| `js/api.js` | `deleteUploadedImage` + ضغط تلقائي للرفعات |
| `js/image-compress.js` | **جديد** — دالة ضغط canvas نقية |
| `js/tee3d.js` | **جديد** — عارض 3D كسول |
| `js/admin.js` | حذف فعلي من السيرفر في تعديل المنتج + ✕ في معاينة الإضافة + ضغط الصور |
| `admin.html` | إضافة `<script src="js/image-compress.js"></script>` قبل `js/api.js` |
| `store.html` | import map + زر تبديل 3D + lazy/decoding للصور |
| `js/store.js` | ربط العارض 3D بنافذة الطلب (فتح/إغلاق/تبديل منتج) |
| `index.html` | lazy/decoding للصور |
| `styles.css` | prefers-reduced-motion + تصحيح أنيميشن layout |
| `tests/api.test.js` | اختبارات حذف الصور + حماية المسار |