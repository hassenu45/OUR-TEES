# متجر AZMA — مجسم 3D + حذف الصور + أداء (خطة تنفيذ)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** تمكين حذف الصور الحقيقي من لوحة التحكم، عرض مجسم تيشيرت 3D بالتصميم المطبوع في نافذة الطلب، ورفع أداء الصفحات (ضغط صور + تحميل كسول + 60fps).

**Architecture:** حذف الصور عبر endpoint جديد `DELETE /api/uploads/:name` مع مهايئات نقية قابلة للاختبار. المجسم 3D عبر وحدة ES `js/tee3d.js` (Three.js مُدمج في `assets/vendor/three/` لأن `node_modules` مستثنى من Railway) تُحمَّل كسولاً عند أول ضغط على زر 3D. الأداء عبر ضغط canvas في المتصفح + `loading="lazy"` + `prefers-reduced-motion`.

**Tech Stack:** Express (server.js), Three.js 0.185 + OBJLoader + DecalGeometry + OrbitControls, Vitest, multer.

## Global Constraints

- قواعد الـ Decals من `tshirt-3d-prints` **إلزامية**: `DecalGeometry` world-space + mesh بـ position(0,0,0)/quaternion.identity + `depthWrite:false` + `alphaTest:0.05` + `polygonOffset factor/units -2` + تحميل الصورة عبر `img.onload` (لا `TextureLoader`) + `colorSpace=SRGBColorSpace` + `anisotropy=8` + حارس geometry الفارغ.
- لا مكتبات خارجية جديدة (لا sharp، لا CDN) — Three.js يُنسخ من `node_modules` إلى `assets/vendor/three/`.
- `assets/**` و `js/**` مشمولان في `web-files.json` — أي ملف جديد فيهما يصل للإنتاج تلقائياً.
- الصور المرفوعة تُحفظ الآن على قرص Railway الثابت (`azma-web-volume` عند `/app/uploads`) — لا تغيير على هذا.
- نمط الاختبار الحالي: vitest على دوال/وحدات نقية (لا تشغيل سيرفر كامل — `server.js` غير مُصدَّر).
- `node server.js` محلياً للتحقق البصري؛ كلمة مرور الإدارة `2007127`.

---

### Task 1: مهايئات حذف ملفات الرفع النقية

**Files:**
- Create: `uploads-manager.cjs`
- Test: `tests/uploads-manager.test.js`

**Interfaces:**
- Produces: `isSafeUploadName(name) → boolean`، `resolveUploadPath(uploadsDir, name) → string|null`، `deleteUploadedFile(uploadsDir, name) → {deleted:boolean, reason?:'invalid-name'|'not-found'}`

- [ ] **Step 1: Write the failing tests**

```js
// tests/uploads-manager.test.js
import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { isSafeUploadName, resolveUploadPath, deleteUploadedFile } = require('../uploads-manager.cjs');

describe('isSafeUploadName', () => {
  it('accepts multer-style filenames', () => {
    expect(isSafeUploadName('1786825884171-5m8gvwv1bn.png')).toBe(true);
    expect(isSafeUploadName('a.B.png')).toBe(true);
    expect(isSafeUploadName('x_y-1.jpg')).toBe(true);
  });
  it('rejects traversal and separators', () => {
    expect(isSafeUploadName('../secret.png')).toBe(false);
    expect(isSafeUploadName('a/b.png')).toBe(false);
    expect(isSafeUploadName('..')).toBe(false);
    expect(isSafeUploadName('')).toBe(false);
    expect(isSafeUploadName('a\\b.png')).toBe(false);
  });
});

describe('resolveUploadPath', () => {
  it('resolves inside the uploads dir only', () => {
    const dir = 'C:/uploads';
    expect(resolveUploadPath(dir, 'x.png')).toBe(join('C:/uploads', 'x.png').replace(/\\/g, '/'));
    expect(resolveUploadPath(dir, '..\\evil.png')).toBe(null);
    expect(resolveUploadPath(dir, '../../etc/passwd')).toBe(null);
  });
});

describe('deleteUploadedFile', () => {
  let tmp;
  afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

  it('deletes an existing file and reports not-found otherwise', () => {
    tmp = mkdtempSync(join(tmpdir(), 'upmgr-'));
    writeFileSync(join(tmp, 'a.png'), 'x');
    expect(deleteUploadedFile(tmp, 'a.png')).toEqual({ deleted: true });
    expect(existsSync(join(tmp, 'a.png'))).toBe(false);
    expect(deleteUploadedFile(tmp, 'a.png')).toEqual({ deleted: false, reason: 'not-found' });
    expect(deleteUploadedFile(tmp, '../evil')).toEqual({ deleted: false, reason: 'invalid-name' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/uploads-manager.test.js`
Expected: FAIL — `Cannot find module '../uploads-manager.cjs'`

- [ ] **Step 3: Write the minimal implementation**

```js
// uploads-manager.cjs
const path = require('path');
const fs = require('fs');

const SAFE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isSafeUploadName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 120 && SAFE_NAME_RE.test(name);
}

function resolveUploadPath(uploadsDir, name) {
  if (!isSafeUploadName(name)) return null;
  const base = path.resolve(uploadsDir);
  const full = path.resolve(base, name);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

function deleteUploadedFile(uploadsDir, name) {
  const full = resolveUploadPath(uploadsDir, name);
  if (!full) return { deleted: false, reason: 'invalid-name' };
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return { deleted: false, reason: 'not-found' };
  fs.unlinkSync(full);
  return { deleted: true };
}

module.exports = { isSafeUploadName, resolveUploadPath, deleteUploadedFile };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/uploads-manager.test.js`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add uploads-manager.cjs tests/uploads-manager.test.js
git commit -m "feat(uploads): pure safe delete helpers for uploaded images"
```

---

### Task 2: endpoint حذف الصور في السيرفر

**Files:**
- Modify: `server.js` (بعد `app.post('/api/uploads/images', ...)` عند السطر ~568)

**Interfaces:**
- Consumes: `isSafeUploadName`, `deleteUploadedFile` من Task 1؛ `db.getProducts()` الموجود
- Produces: `DELETE /api/uploads/:name` → `200 {deleted:true}` | `400` اسم غير صالح | `404` غير موجود | `409` مستخدمة بمنتج | `401` بدون جلسة

- [ ] **Step 1: Write the failing test**

```js
// أضف إلى tests/uploads-manager.test.js (describe جديد)
describe('uploads-manager + in-use logic (pure)', () => {
  it('flags names matching a product image URL', () => {
    const products = [{ images: ['/uploads/keep.png'], image: '/uploads/keep.png' }];
    const inUse = (name) => {
      const url = `/uploads/${name}`;
      return products.some((p) => {
        const all = Array.isArray(p.images) && p.images.length ? p.images : p.image ? [p.image] : [];
        return all.some((im) => typeof im === 'string' && im === url);
      });
    };
    expect(inUse('keep.png')).toBe(true);
    expect(inUse('other.png')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (logic missing in server)**

Run: `npx vitest run tests/uploads-manager.test.js`
Expected: PASS for pure test (المنطق أعلاه) — هذا الاختبار يثبّت منطق `in-use` قبل ربطه بالسيرفر

- [ ] **Step 3: Add the endpoint to server.js**

بعد endpoint `app.post('/api/uploads/images', ...)` (السطر 568) أضف:

```js
const { isSafeUploadName, deleteUploadedFile } = require('./uploads-manager.cjs');

app.delete('/api/uploads/:name', requireAuth, async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    if (!isSafeUploadName(name)) return res.status(400).json({ error: 'اسم ملف غير صالح' });
    const url = `/uploads/${name}`;
    const products = await db.getProducts();
    const inUse = products.some((p) => {
      const all = Array.isArray(p.images) && p.images.length ? p.images : p.image ? [p.image] : [];
      return all.some((im) => typeof im === 'string' && im === url);
    });
    if (inUse) return res.status(409).json({ error: 'الصورة مستخدمة في منتج — لا يمكن حذفها' });
    const result = deleteUploadedFile(UPLOADS_DIR, name);
    if (!result.deleted) return res.status(404).json({ error: 'الملف غير موجود' });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: 'خطأ في حذف الصورة' });
  }
});
```

- [ ] **Step 4: Verify endpoint manually**

Run: `node server.js` ثم في طرفية ثانية:

```bash
# رفع صورة تجريبية
curl.exe -s -c cookies.txt -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d '{"password":"2007127"}'
curl.exe -s -b cookies.txt -F "images=@1png.png" http://localhost:3000/api/uploads/images
# انسخ اسم الملف من الناتج واطلب الحذف (عدّل الاسم):
curl.exe -s -b cookies.txt -X DELETE "http://localhost:3000/api/uploads/<NAME>"
curl.exe -s -o NUL -w "%{http_code}" "http://localhost:3000/uploads/<NAME>"   # يجب أن يعيد 404
# بدون تسجيل دخول يجب أن يعيد 401:
curl.exe -s -X DELETE "http://localhost:3000/api/uploads/<NAME>"
```

Expected: الحذف يعيد `{"deleted":true}` ثم GET يعيد 404، وبدون كوكي 401.

- [ ] **Step 5: Commit**

```bash
git add server.js tests/uploads-manager.test.js
git commit -m "feat(api): DELETE /api/uploads/:name with in-use guard"
```

---

### Task 3: ربط الحذف بلوحة التحكم (api.js + admin.js)

**Files:**
- Modify: `js/api.js` (داخل كائن `API` بعد `uploadImages`)
- Modify: `js/admin.js` (`editRemoveImage` عند ~325، `previewProductImages` عند ~183)

**Interfaces:**
- Consumes: `DELETE /api/uploads/:name` من Task 2
- Produces: `API.deleteUploadedImage(url) → Promise<boolean>`؛ زر ✕ في المعاينة يزيل من `input.files`

- [ ] **Step 1: Write the failing test (pure part — استخراج الاسم من الرابط)**

```js
// أضف إلى tests/uploads-manager.test.js
describe('image url → name extraction', () => {
  const nameFromUrl = (url) => {
    const m = String(url || '').match(/^\/uploads\/([^/?#]+)$/);
    return m ? m[1] : null;
  };
  it('extracts the filename from /uploads urls', () => {
    expect(nameFromUrl('/uploads/1786-a.png')).toBe('1786-a.png');
    expect(nameFromUrl('https://x.com/uploads/a.png')).toBe(null);
    expect(nameFromUrl('/uploads/a.png?x=1')).toBe(null);
    expect(nameFromUrl('data:image/png;base64,xx')).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (ثبات السلوك)**

Run: `npx vitest run tests/uploads-manager.test.js`
Expected: PASS

- [ ] **Step 3: Add `deleteUploadedImage` to js/api.js**

داخل كائن `API` بعد `uploadImages` أضف:

```js
async deleteUploadedImage(url) {
  if (await isServerMode()) {
    const m = String(url || '').match(/^\/uploads\/([^/?#]+)$/);
    if (!m) return true;
    await serverFetch('/api/uploads/' + encodeURIComponent(m[1]), { method: 'DELETE' });
    return true;
  }
  return true;
},
```

- [ ] **Step 4: حذف فعلي في نافذة تعديل المنتج (js/admin.js)**

استبدل `editRemoveImage` الحالية بـ:

```js
function editRemoveImage(i) {
  const removed = editImages.splice(i, 1)[0];
  if (!removed) { renderEditImages(); return; }
  if (removed.file && removed.src.startsWith('blob:')) URL.revokeObjectURL(removed.src);
  if (removed.src.startsWith('/uploads/')) {
    API.deleteUploadedImage(removed.src).catch(() => showToast('تعذر حذف الملف من السيرفر', true));
  }
  renderEditImages();
}
```

- [ ] **Step 5: زر ✕ في معاينة نموذج إضافة المنتج (js/admin.js)**

استبدل `previewProductImages` الحالية بـ (مع متغير `previewFiles` عام):

```js
let previewFiles = [];
function previewProductImages(input) {
  const container = $('images-preview');
  const text = container?.previousElementSibling;
  if (!container) return;
  if (input.files && input.files.length > MAX_PRODUCT_IMAGES) {
    const dt = new DataTransfer();
    Array.from(input.files).slice(0, MAX_PRODUCT_IMAGES).forEach((f) => dt.items.add(f));
    input.files = dt.files;
    showToast(`يمكنك اختيار ${MAX_PRODUCT_IMAGES} صورة كحد أقصى`, true);
  }
  previewFiles = Array.from(input.files || []);
  renderPreviewImages(container, text);
}

function renderPreviewImages(container, text) {
  container.innerHTML = '';
  if (!previewFiles.length) {
    if (text) text.textContent = `📷 اضغط لاختيار صور المنتج (حتى ${MAX_PRODUCT_IMAGES} صورة)`;
    return;
  }
  if (text) text.textContent = `✅ تم اختيار (${previewFiles.length}) من ${MAX_PRODUCT_IMAGES} صورة`;
  previewFiles.forEach((f, i) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-block;margin:6px;';
    const r = new FileReader();
    r.onload = (e) => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.style.cssText = 'width:70px;height:70px;object-fit:cover;border-radius:8px;border:2px solid var(--border,#333);';
      wrap.appendChild(img);
    };
    r.readAsDataURL(f);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '✕';
    btn.style.cssText = 'position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:#dc2626;color:#fff;border:none;cursor:pointer;font-size:12px;line-height:1;';
    btn.title = 'إزالة الصورة';
    btn.addEventListener('click', () => {
      previewFiles.splice(i, 1);
      const input = document.getElementById('images');
      if (input) {
        const dt = new DataTransfer();
        previewFiles.forEach((x) => dt.items.add(x));
        input.files = dt.files;
      }
      renderPreviewImages(container, text);
    });
    wrap.appendChild(btn);
    container.appendChild(wrap);
  });
}
```

(تحقق: id حقل الصور في admin.html هو `images` — إن اختلف اسمه، استخدم `document.querySelector('input[type=file]')` داخل النموذج.)

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: لا أخطاء جديدة

- [ ] **Step 7: التحقق اليدوي في المتصفح**

Run: `node server.js` → افتح `http://localhost:3000/admin.html` → سجّل الدخول (كلمة المرور `2007127`) → منتجات → ✏️ منتج فيه صورة → اضغط ✕ على صورة → تحقق في Network أن طلب `DELETE /api/uploads/<name>` عاد 200، وافتح رابط الصورة في تبويب جديد → 404.
ثم نموذج "إضافة منتج" → اختر صوراً → ✕ تزيل صورة من المعاينة → أضف المنتج → عدد الصور مطابق.

- [ ] **Step 8: Commit**

```bash
git add js/api.js js/admin.js tests/uploads-manager.test.js
git commit -m "feat(admin): real image deletion from product edit + add form previews"
```

---

### Task 4: توفير Three.js محلياً (assets/vendor/three)

**Files:**
- Create: `assets/vendor/three/three.module.js`, `assets/vendor/three/addons/controls/OrbitControls.js`, `assets/vendor/three/addons/loaders/OBJLoader.js`, `assets/vendor/three/addons/geometries/DecalGeometry.js` (نسخ من `node_modules/three`)
- Modify: `store.html` (إضافة import map قبل السكربتات)

**Interfaces:**
- Produces: import map `{"imports":{"three":"/assets/vendor/three/three.module.js","three/addons/":"/assets/vendor/three/addons/"}}` — يستخدمها Task 5

- [ ] **Step 1: انسخ الملفات من node_modules**

Run (PowerShell في جذر المشروع):

```powershell
New-Item -ItemType Directory -Force -Path "assets/vendor/three/addons/controls","assets/vendor/three/addons/loaders","assets/vendor/three/addons/geometries" | Out-Null
Copy-Item "node_modules/three/build/three.module.js" "assets/vendor/three/three.module.js"
Copy-Item "node_modules/three/examples/jsm/controls/OrbitControls.js" "assets/vendor/three/addons/controls/OrbitControls.js"
Copy-Item "node_modules/three/examples/jsm/loaders/OBJLoader.js" "assets/vendor/three/addons/loaders/OBJLoader.js"
Copy-Item "node_modules/three/examples/jsm/geometries/DecalGeometry.js" "assets/vendor/three/addons/geometries/DecalGeometry.js"
```

- [ ] **Step 2: تحقق أن النسخ سليمة**

Run: `Get-ChildItem assets/vendor/three -Recurse | Select-Object FullName, Length`
Expected: 4 ملفات بأحجام غير صفرية (three.module.js ~1.3MB).

- [ ] **Step 3: تحقق أن الاستيرادات الداخلية تشير لـ 'three' فقط**

Run: `Select-String -Path "assets/vendor/three/addons/**/*.js" -Pattern "^import" | Select-Object -First 20`
Expected: كلها `from 'three'` (لا استيرادات إضافية بين الإضافات). إن وُجد أي استيراد `'three/addons/...'` داخل ملف منسوخ، انسخ الملف المُشار إليه أيضاً.

- [ ] **Step 4: أضف import map إلى store.html**

قبل السطر `<script src="js/db-local.js"></script>` (سطر ~805) أضف:

```html
<script type="importmap">
{"imports":{"three":"/assets/vendor/three/three.module.js","three/addons/":"/assets/vendor/three/addons/"}}
</script>
```

- [ ] **Step 5: تحقق سريع أن المسارات تُخدم**

Run: `node server.js` ثم `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/assets/vendor/three/three.module.js`
Expected: 200

- [ ] **Step 6: Commit**

```bash
git add assets/vendor/three store.html
git commit -m "chore(3d): vendor three.js locally for production (no node_modules on Railway)"
```

---

### Task 5: وحدة العارض 3D `js/tee3d.js`

**Files:**
- Create: `js/tee3d.js`

**Interfaces:**
- Consumes: import map من Task 4؛ `21/model.obj` الموجود
- Produces: `class TeeViewer { init(): Promise<void>; setImage(src: string): void; dispose(): void; ready: boolean }` — يستخدمها Task 6

- [ ] **Step 1: Write the failing test (منطق حجم المطبوع النقي)**

```js
// tests/uploads-manager.test.js — describe جديد (أو ملف tests/tee3d-pure.test.js)
describe('print sizing (pure)', () => {
  // نفس الحساب الموجود في 21.html: ws ثابتة + aspect من الصورة
  const computePrintSize = (imgW, imgH, baseWorldSize) => {
    const aspect = (imgW && imgH) ? imgW / imgH : 1;
    const ws = baseWorldSize;
    return { width: ws, height: ws / aspect };
  };
  it('keeps aspect ratio of the source image', () => {
    expect(computePrintSize(800, 400, 0.42)).toEqual({ width: 0.42, height: 0.21 });
    expect(computePrintSize(400, 800, 0.42).height).toBeCloseTo(0.84);
  });
  it('falls back to square for missing dimensions', () => {
    expect(computePrintSize(0, 0, 0.42)).toEqual({ width: 0.42, height: 0.42 });
  });
});
```

- [ ] **Step 2: Run test to verify it passes (يثبت الحساب قبل التنفيذ)**

Run: `npx vitest run tests/uploads-manager.test.js`
Expected: PASS

- [ ] **Step 3: اكتب `js/tee3d.js`**

```js
/* AZMA — TeeViewer: عارض تيشيرت 3D بنظام Decal (قواعد tshirt-3d-prints إلزامية) */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

const MODEL_URL = '21/model.obj';
const BASE_PRINT_WORLD_SIZE = 0.42;
const CHEST_ANCHOR = new THREE.Vector3(0, 0.06, 4.2);

export class TeeViewer {
  constructor(container) {
    this.container = container;
    this.ready = false;
    this._disposed = false;
    this._canvas = null;
    this._renderer = null;
    this._controls = null;
    this._group = null;
    this._shirtMeshes = [];
    this._printMesh = null;
    this._printTex = null;
    this._printMat = null;
    this._imageSrc = null;
  }

  async init() {
    if (this._renderer) return;
    const w = this.container.clientWidth || 320;
    const h = this.container.clientHeight || 400;
    const canvas = document.createElement('canvas');
    this._canvas = canvas;
    this.container.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    this._renderer = renderer;

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x161616, 1.1));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.4);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(-3, 1, -2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xf5c842, 0.7);
    rim.position.set(-2, 2.5, -3);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
    camera.position.set(1.5, 1.1, 2.8);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.minDistance = 1.4;
    controls.maxDistance = 6;
    this._controls = controls;

    const group = new THREE.Group();
    scene.add(group);
    this._group = group;

    const shirtMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f0,
      roughness: 0.72,
      metalness: 0.02,
    });

    await new Promise((resolve, reject) => {
      new OBJLoader().load(
        MODEL_URL,
        (obj) => {
          obj.traverse((c) => {
            if (c.isMesh) {
              c.material = shirtMat;
              this._shirtMeshes.push(c);
            }
          });
          group.add(obj);
          const box = new THREE.Box3().setFromObject(group);
          const sz = box.getSize(new THREE.Vector3());
          const ctr = box.getCenter(new THREE.Vector3());
          const rad = Math.max(sz.x, sz.y, sz.z) * 0.5 || 1;
          group.position.sub(ctr);
          camera.near = rad / 100;
          camera.far = rad * 20;
          const dist = rad * 1.9 + 0.6;
          camera.position.set(dist * 0.6, dist * 0.45, dist * 1.1);
          controls.target.set(0, sz.y * -0.05, 0);
          controls.update();
          this.ready = true;
          this._applyPrint();
          resolve();
        },
        undefined,
        () => reject(new Error('فشل تحميل المجسم'))
      );
    });

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
  }

  setImage(src) {
    this._imageSrc = src;
    if (this.ready) this._applyPrint();
  }

  _applyPrint() {
    if (!this._imageSrc || !this._group) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this._disposed) return;
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      const aspect = img.width && img.height ? img.width / img.height : 1;
      const ws = BASE_PRINT_WORLD_SIZE;
      const depth = Math.max(ws, ws / aspect) * 0.65;
      const sz = new THREE.Vector3(ws, ws / aspect, depth);

      const raycaster = new THREE.Raycaster();
      raycaster.far = 9;
      const s = CHEST_ANCHOR.clone();
      this._group.localToWorld(s);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this._group.quaternion);
      raycaster.set(s, dir);
      const hits = raycaster.intersectObjects(this._shirtMeshes, false);
      if (!hits[0]) return;

      const wn = new THREE.Vector3().copy(hits[0].face.normal).transformDirection(hits[0].object.matrixWorld);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), wn);
      const eu = new THREE.Euler().setFromQuaternion(q);
      const geo = new DecalGeometry(hits[0].object, hits[0].point, eu, sz);
      if (geo.attributes.position.count === 0) { geo.dispose(); return; }
      geo.applyMatrix4(this._group.matrixWorld.clone().invert());
      const ln = wn.clone().applyQuaternion(this._group.quaternion.clone().invert()).normalize();
      const nudge = 0.006 + 0.004 * ws;
      geo.translate(ln.x * nudge, ln.y * nudge, ln.z * nudge);

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        alphaTest: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });

      if (this._printMesh) {
        this._group.remove(this._printMesh);
        if (this._printMesh.geometry) this._printMesh.geometry.dispose();
        if (this._printMat) this._printMat.dispose();
      }
      if (this._printTex) this._printTex.dispose();

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      this._group.add(mesh);
      this._printMesh = mesh;
      this._printMat = mat;
      this._printTex = tex;
    };
    img.onerror = () => {};
    img.src = this._imageSrc;
  }

  dispose() {
    this._disposed = true;
    if (this._renderer) {
      this._renderer.setAnimationLoop(null);
      this._controls?.dispose();
      this._renderer.dispose();
      this._canvas?.remove();
    }
    if (this._printMesh) { this._printMesh.geometry.dispose(); }
    if (this._printMat) this._printMat.dispose();
    if (this._printTex) this._printTex.dispose();
    this._renderer = null;
    this._canvas = null;
    this._controls = null;
    this._group = null;
    this._shirtMeshes = [];
    this._printMesh = null;
    this._printMat = null;
    this._printTex = null;
    this.ready = false;
  }
}
```

- [ ] **Step 4: تحقق من القواعد الإلزامية (tshirt-3d-prints)**

تحقق أن الكود يلتزم: DecalGeometry world-space ✓ (قِمة تُنتج عالمية وmesh عند 0,0,0) — Texture عبر `img.onload` ✓ — `depthWrite:false` + `alphaTest` + `polygonOffset -2` ✓ — حارس `attributes.position.count === 0` ✓ — nudge على طول الـ normal المحلي ✓.

- [ ] **Step 5: تحقق بالتشغيل (صفحة اختبار مؤقتة)**

Run: `node server.js` ثم افتح `http://localhost:3000/store.html` (سجّل الدخول) — بعد Task 6 يكتمل الربط؛ يمكن تحقق مبكر بفتح `designer.html` للتأكد أن الأصول تعمل.

- [ ] **Step 6: Commit**

```bash
git add js/tee3d.js tests/uploads-manager.test.js
git commit -m "feat(3d): TeeViewer module — lazy 3D t-shirt viewer with chest decal"
```

---

### Task 6: ربط العارض 3D بنافذة الطلب

**Files:**
- Modify: `store.html` (قسم المعرض داخل `#order-modal` ~770، وأسفل الصفحة)
- Modify: `js/store.js` (`openOrderModal` ~306، `closeOrderModal` ~368، `updateModalGallery` ~378)

**Interfaces:**
- Consumes: `TeeViewer` من Task 5 (import كسول)
- Produces: زر `[📷 صور] [🧊 3D]` في نافذة الطلب؛ تحميل three فقط عند أول ضغط على 3D؛ إتلاف العارض عند الإغلاق

- [ ] **Step 1: أضف عناصر التبديل في store.html**

داخل `<div class="quickview-main-img">` (قبل `<img id="modal-product-img">`) أضف:

```html
<div class="quickview-view-toggle">
  <button type="button" id="view-btn-photos" class="qv-toggle-btn active" onclick="setQuickViewMode('photos')">📷 صور</button>
  <button type="button" id="view-btn-3d" class="qv-toggle-btn" onclick="setQuickViewMode('3d')">🧊 3D</button>
</div>
<div id="tee3d-stage" style="display:none;position:absolute;inset:0;"></div>
```

(ملاحظة: `quickview-main-img` يجب أن يكون `position:relative` — أضفها في CSS inline إن لم تكن موجودة: `style="position:relative;"` على الحاوية الأصلية.)

- [ ] **Step 2: أضف منطق التبديل والربط في js/store.js**

في نهاية `openOrderModal` (بعد `updateModalGallery()`) أضف:

```js
  setQuickViewMode('photos');
```

وأضف هذه الدوال (قبل `updateModalGallery`):

```js
let teeViewer = null;
let teeViewerLoading = null;
let quickViewMode = 'photos';

function setQuickViewMode(mode) {
  if (mode !== '3d' && mode !== 'photos') mode = 'photos';
  quickViewMode = mode;
  const mainImg = $('modal-product-img');
  const stage = $('tee3d-stage');
  const btnPhotos = $('view-btn-photos');
  const btn3d = $('view-btn-3d');
  const show3d = mode === '3d' && !!selectedProduct;
  if (mainImg) mainImg.style.display = show3d ? 'none' : '';
  if (stage) stage.style.display = show3d ? 'block' : 'none';
  if (btnPhotos) btnPhotos.classList.toggle('active', !show3d);
  if (btn3d) btn3d.classList.toggle('active', show3d);
  if (!show3d) return;
  if (!teeViewerLoading) {
    teeViewerLoading = import('js/tee3d.js')
      .then((m) => new m.TeeViewer(stage))
      .then(async (v) => {
        teeViewer = v;
        try { await v.init(); } catch { v.dispose(); teeViewer = null; showCartNotification('تعذر تحميل المجسم'); setQuickViewMode('photos'); return; }
        if (quickViewMode === '3d') v.setImage(getCurrentProductImage());
      })
      .catch(() => { teeViewerLoading = null; showCartNotification('تعذر تحميل المجسم'); setQuickViewMode('photos'); });
  } else if (teeViewer) {
    teeViewer.setImage(getCurrentProductImage());
  }
}

function getCurrentProductImage() {
  if (!selectedProduct) return '';
  if (Array.isArray(selectedProduct.images) && selectedProduct.images.length) return selectedProduct.images[0];
  return selectedProduct.image || '';
}
```

في `closeOrderModal` أضف في نهايتها (بعد `selectedProduct = null;`):

```js
  if (teeViewer) { teeViewer.dispose(); teeViewer = null; }
  teeViewerLoading = null;
  setQuickViewMode('photos');
```

- [ ] **Step 3: أضف CSS زر التبديل في styles.css**

```css
.quickview-view-toggle{position:absolute;top:10px;left:10px;z-index:5;display:flex;gap:6px}
.qv-toggle-btn{background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.25);padding:5px 12px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;backdrop-filter:blur(6px)}
.qv-toggle-btn.active{background:var(--color-accent,#f5c842);color:#0d0d0d;border-color:transparent}
#tee3d-stage canvas{display:block;width:100%;height:100%;touch-action:none}
```

- [ ] **Step 4: تحقق يدوي (Playwright أو متصفح)**

Run: `node server.js` ثم افتح `http://localhost:3000/store.html` (سجّل الدخول بالرقم `2007127`) → افتح أي منتج → اضغط **🧊 3D**:
- Network tab: طلب `js/tee3d.js` + `three.module.js` + `model.obj` يظهر **فقط عند الضغط** (ليس عند فتح الصفحة)
- المجسم يظهر بالتصميم المطبوع على الصدر، يدور تلقائياً، السحب يدوّره 360° بلا غرق للطباعة
- إغلاق النافذة ثم فتحها: يعود لصور، وضغط 3D يعيد إنشاء العارض
- جهاز بلا WebGL (إن توفر): رسالة تعذر التحويل للصور

- [ ] **Step 5: Commit**

```bash
git add store.html js/store.js styles.css
git commit -m "feat(store): 3D tee viewer toggle in order modal (lazy-loaded, disposed on close)"
```

---

### Task 7: ضغط ذكي للصور عند الرفع

**Files:**
- Create: `js/image-compress.js`
- Modify: `js/api.js` (`createProductWithFormData` و`uploadImages` و`uploadProductImage`)
- Modify: `admin.html` (إضافة سكربت قبل `js/api.js`)

**Interfaces:**
- Produces: `window.compressImage(file, {maxWidth=1600, quality=0.85}) → Promise<Blob>`؛ `compressFiles(files) → Promise<Blob[]>` (دوال نقية: `pickOutputFormat(webpOk, type)` و`targetSize(w, h, maxWidth)`)

- [ ] **Step 1: Write the failing tests (الدوال النقية)**

```js
// tests/uploads-manager.test.js — describe جديد
describe('image-compress pure helpers', () => {
  const pickOutputFormat = (webpOk, type) =>
    webpOk ? 'image/webp' : (type === 'image/png' ? 'image/png' : 'image/jpeg');
  const targetSize = (w, h, maxWidth) => {
    if (!w || !h) return { width: w, height: h };
    if (w <= maxWidth && h <= maxWidth) return { width: w, height: h };
    const scale = Math.min(1, maxWidth / Math.max(w, h));
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
  };
  it('prefers webp when supported', () => {
    expect(pickOutputFormat(true, 'image/jpeg')).toBe('image/webp');
    expect(pickOutputFormat(false, 'image/jpeg')).toBe('image/jpeg');
    expect(pickOutputFormat(false, 'image/png')).toBe('image/png');
  });
  it('downscales only when larger than max', () => {
    expect(targetSize(3000, 1500, 1600)).toEqual({ width: 1600, height: 800 });
    expect(targetSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/uploads-manager.test.js`
Expected: FAIL (الدوال غير معرّفة بعد في `js/image-compress.js` — انقل المنطق من الاختبار إليه ثم نفّذ Step 3 ثم أعد التشغيل)

- [ ] **Step 3: اكتب `js/image-compress.js`**

```js
/* AZMA — ضغط ذكي للصور قبل الرفع (canvas client-side، بدون مكتبات) */
(function (global) {
  const MAX_UPLOAD_WIDTH = 1600;
  const JPEG_QUALITY = 0.85;

  function pickOutputFormat(webpOk, type) {
    return webpOk ? 'image/webp' : type === 'image/png' ? 'image/png' : 'image/jpeg';
  }

  function targetSize(w, h, maxWidth) {
    if (!w || !h) return { width: w, height: h };
    if (w <= maxWidth && h <= maxWidth) return { width: w, height: h };
    const scale = Math.min(1, maxWidth / Math.max(w, h));
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
  }

  function webpSupported() {
    try {
      const c = document.createElement('canvas');
      return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) {
      return false;
    }
  }

  function compressImage(file, opts) {
    opts = opts || {};
    const maxWidth = opts.maxWidth || MAX_UPLOAD_WIDTH;
    const quality = opts.quality || JPEG_QUALITY;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const { width, height } = targetSize(img.width, img.height, maxWidth);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const fmt = pickOutputFormat(webpSupported(), file.type);
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(url);
              if (blob && blob.size < file.size) resolve(blob);
              else resolve(file);
            },
            fmt,
            quality
          );
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(file);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  function compressFiles(files, opts) {
    return Promise.all(Array.from(files || []).map((f) => compressImage(f, opts)));
  }

  global.compressImage = compressImage;
  global.compressFiles = compressFiles;
  global.imageCompressPure = { pickOutputFormat, targetSize, MAX_UPLOAD_WIDTH };
})(window);
```

- [ ] **Step 4: اربط الضغط في js/api.js**

في `createProductWithFormData` (السطر ~120) — داخل فرع `isServerMode()`، استبدل النداء الحالي بـ:

```js
    if (await isServerMode()) {
      const hasCompress = typeof window !== 'undefined' && typeof window.compressFiles === 'function';
      const files = hasCompress
        ? await window.compressFiles(formData.getAll('images').filter((f) => f instanceof File))
        : [];
      const fd = new FormData();
      formData.forEach((value, key) => {
        if (key === 'images') return;
        fd.append(key, value);
      });
      if (hasCompress && files.length) {
        files.forEach((f) => fd.append('images', f, f.name));
      } else {
        formData.getAll('images').forEach((f) => fd.append('images', f));
      }
      const res = await fetch('/api/products/with-images', { method: 'POST', body: fd });
      if (!res.ok) {
        let msg = 'خطأ في إنشاء المنتج';
        try { const j = await res.json(); if (j && j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      return res.json();
    }
```

وفي `uploadImages` (السطر ~156):

```js
  async uploadImages(files) {
    if (await isServerMode()) {
      const hasCompress = typeof window !== 'undefined' && typeof window.compressFiles === 'function';
      const toUpload = hasCompress ? await window.compressFiles(files) : files;
      const fd = new FormData();
      toUpload.forEach((f) => fd.append('images', f, f.name));
      const res = await serverFetch('/api/uploads/images', { method: 'POST', body: fd });
      return (res && res.urls) || [];
    }
    return Promise.all(files.map(fileToDataUrl));
  },
```

- [ ] **Step 5: أضف السكربت في admin.html**

قبل `<script src="js/api.js"></script>` (سطر ~1535) أضف:

```html
<script src="js/image-compress.js"></script>
```

- [ ] **Step 6: Run lint + tests**

Run: `npm run lint; npx vitest run`
Expected: لا أخطاء، كل الاختبارات خضراء (بما فيها الجديدة)

- [ ] **Step 7: تحقق يدوي**

Run: `node server.js` → admin → إضافة منتج بصورة كبيرة (≥ 3000px) → تحقق في Network أن الملف المرفوع حجمه أصغر من الأصل وامتداده `.webp` (أو jpeg) — وفي `uploads/` الملف الجديد صغير الحجم.

- [ ] **Step 8: Commit**

```bash
git add js/image-compress.js js/api.js admin.html tests/uploads-manager.test.js
git commit -m "feat(uploads): client-side smart compression (webp/jpeg, 1600px cap)"
```

---

### Task 8: سلاسة وأداء الصفحات (lazy + reduced-motion + transform-only)

**Files:**
- Modify: `store.html`, `index.html`, `styles.css`

**Interfaces:**
- Produces: صور `loading="lazy" decoding="async"` في الشبكات؛ `@media (prefers-reduced-motion: reduce)` يعطّل الزخرفة؛ أنيميشن layout → transform/opacity

- [ ] **Step 1: صور الشبكة في store.html و index.html**

استبدل كل `<img ...>` في شبكات/أقسام المنتجات (وليس الهيرو) بحيث يحوي `loading="lazy" decoding="async"`. مثال على بطاقة المنتج في `js/store.js` (`renderProducts` السطر ~215):

```js
<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(p.name || 'Our Tee')}" loading="lazy" decoding="async">
```

وفي `store.html` و`index.html`: أضف `decoding="async"` لكل صور الأقسام، وأبقِ صورة الهيرو `fetchpriority="high"` + `decoding="async"` (بدون lazy). تحقق بـ:

Run: `Select-String -Path store.html,index.html,js/store.js -Pattern "<img" | Measure-Object` ثم تأكد يدوياً من الأتريبيوتات.

- [ ] **Step 2: أضف قواعد reduced-motion في styles.css**

في نهاية `styles.css` أضف:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 3: افحص الأنيميشن ذات layout في styles.css**

Run: `Select-String -Path styles.css -Pattern "@keyframes" | Select-Object LineNumber, Line`
افحص كل keyframe: إن حرّك `margin|top|left|right|bottom|width|height|padding` فاستبدلها بـ `transform` (translate/scale). سجّل التعديلات المطبقة في رسالة الـ commit.

- [ ] **Step 4: تحقق الأداء**

Run: `node server.js` → افتح `store.html` (سجّل الدخول) → DevTools → Performance: سكرول سريع عبر المنتجات — لا jank. Network: صور الشبكة `loading="lazy"` (تُحمَّل عند الاقتراب فقط). تشغيل `prefers-reduced-motion` في DevTools (Rendering → Emulate) → الحركات الزخرفية تتوقف.

- [ ] **Step 5: Commit**

```bash
git add store.html index.html js/store.js styles.css
git commit -m "perf: lazy images, decoding async, reduced-motion support, transform-only animations"
```

---

### Task 9: تحقق نهائي + نشر

**Files:**
- لا تغييرات كود — نشر وتحقق إنتاجي

- [ ] **Step 1: كل الاختبارات**

Run: `npm run lint; npx vitest run`
Expected: أخضر بالكامل

- [ ] **Step 2: نشرة إنتاج**

Run: `npm run deploy` (يرفع لـ Railway) — بعد انتهاء البناء تحقق أن الخدمة Online.

- [ ] **Step 3: تحقق إنتاجي شامل**

- `https://azma-web-production.up.railway.app/store.html` → سجّل الدخول → منتج → 3D يعمل (الصور من القرص الثابت، المجسم من `assets/vendor/three` المستضافة)
- رفع صورة من admin → حذفها من تعديل المنتج → الرابط 404
- صور جديدة تُرفع مضغوطة
- إعادة تشغيل الخدمة (`railway restart --yes`) → الصور الجديدة باقية (القرص الثابت)

- [ ] **Step 4: وسم الإصدار**

```bash
node -e "const fs=require('fs');const v=fs.readFileSync('VERSION','utf8').trim().split('.');v[2]=String(Number(v[2])+1);fs.writeFileSync('VERSION',v.join('.'))"
git add VERSION
git commit -m "chore: bump version"
```