# إعادة تصميم صفحة طلباتي (My Orders) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** رفع `my-orders.html` لمستوى بوتيك فاخر (أسود + ذهبي) مع حركات دقيقة، مع الحفاظ على كل الوظائف وهوية المتجر.

**Architecture:** إعادة بناء ملف واحد (`my-orders.html`) — تنسيقات كاملة داخل `<style>` بأسماء توكنز المتجر `--tees-*`، إعادة هيكلة HTML مع الإبقاء على كل المعرّفات والدوال حرفياً، حركات CSS خالصة (بدون مكتبات). التحقق النهائي في المتصفح المفتوح.

**Tech Stack:** HTML/CSS خالص + `js/my-orders.js` (يُلمس فقط بتغيير مسموح واحد موثّق). سيرفر node على المنفذ 3000.

**Spec:** `docs/superpowers/specs/2026-08-08-my-orders-page-redesign-design.md` (اقرأه أولاً)

## Global Constraints

1. ملف واحد يُعاد بناؤه: `my-orders.html`. الملفات المحرّمة: `js/api.js`, `js/db-local.js`, `server.js`, `*.html` الأخرى, قاعدة البيانات.
2. كل المعرّفات تبقى (24): `mo-name, mo-phone, mo-city, mo-area, mo-street, mo-landmark, mo-notes, pay-cod, pay-card, mo-error, mo-submit, mo-cart-items, mo-cart-total, tab-checkout, tab-orders, panel-checkout, panel-orders, mo-phone-panel, mo-lookup-phone, mo-orders-panel, mo-customer-name, mo-orders-list, mo-overlay, mo-overlay-text`.
3. دوال `js/my-orders.js` لا تتغير منطقياً. التغيير الوحيد المسموح: `showToast` (خط cssText واحدة — نصه في Task 2).
4. كلاسّات HTML التي يولّدها JS يجب أن يصفّيها الـ CSS (تُستخدم في `renderCart` و`loadMyOrders`): `mo-item, mo-item-info, mo-item-name, mo-item-meta, mo-empty, mo-order, mo-order-top, mo-order-name, mo-badge` (+`.new .completed .cancelled .card`), `mo-order-meta, mo-cancel, mo-customer-name`.
5. RTL أولاً (`dir="rtl"` على `<html>` محفوظ). العربية سليمة بكل النصوص.
6. توازن divs: عدد `<div` المفتوح = عدد `</div>` المغلق بالضبط (الخطأ السابق — وسم غير مغلق — ممنوع العودة).
7. قيم التوكنز حرفياً (من store.html): `--tees-black:#0D0D0D; --tees-surface:#161616; --tees-card:#1E1E1E; --tees-yellow:#F5C842; --tees-yellow-dim:#c9a42e; --tees-white:#F5F5F0; --tees-muted:#888884; --tees-border:#2a2a2a`.
8. الخطوط: Cormorant للعناوين + Montserrat للواجهة (يوفّرهما الرابط `assets/css/design-tokens.css` — أبقِ الرابط في `<head>`).
9. الحركات CSS خالصة + `@media (prefers-reduced-motion: reduce)` يلغي كل الحركات (عدا حلقة المعالجة).
10. لا مكتبات خارجية. لا أيقونات شبكة (SVG مضمّنة أو رموز يونيكود فقط).
11. السيرفر يعمل على `http://localhost:3000` (شغّله إن لم يكن: `node server.js` من جذر المشروع). المتصفح مفتوح على الصفحة — أعد تحميلها بعد كل تغيير.
12. الالتزامات: `--no-verify` (husky يفشل على أخطاء lint سابقة في ملفات المستخدم). لا `git add -A` أبداً.

---

### Task 1: إعادة بناء my-orders.html (التصميم الكامل + الحركات)

**Files:**
- Modify: `my-orders.html` (إعادة كتابة كاملة)

**Interfaces:**
- Consumes: لا شيء (يعتمد على `js/my-orders.js` الموجودة — تُقرأ فقط لفهم الأسماء)
- Produces: `my-orders.html` الجديد بكل معرّفات Task 2 (لا شيء يستهلكه لاحقاً سوى المتصفح)

- [ ] **Step 1: اقرأ المرجعيات**

اقرأ: `docs/superpowers/specs/2026-08-08-my-orders-page-redesign-design.md` (الأقسام: التصميم البصري، الحركات، الحالات الطرفية) ثم `my-orders.html` الحالية و`js/my-orders.js` (لفهم كلاسّات JS المُولّدة: `renderCart` سطر 27-45، `loadMyOrders` سطر 138-172، `showToast` سطر 199-205).

- [ ] **Step 2: اكتب الملف الجديد كاملاً**

استبدل `my-orders.html` بالكامل بالمحتوى التالي (هو المرجع التنفيذي — انسخه كما هو):

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>طلباتي — AZMA</title>
  <link rel="stylesheet" href="assets/css/design-tokens.css">
  <style>
    :root{
      --tees-black:#0D0D0D;
      --tees-surface:#161616;
      --tees-card:#1E1E1E;
      --tees-yellow:#F5C842;
      --tees-yellow-dim:#c9a42e;
      --tees-white:#F5F5F0;
      --tees-muted:#888884;
      --tees-border:#2a2a2a;
      --tees-gold-line:linear-gradient(90deg,transparent,rgba(245,200,66,.55),transparent);
      --tees-ease:cubic-bezier(.22,1,.36,1);
    }
    *{box-sizing:border-box}
    body{margin:0;background:var(--tees-black);color:var(--tees-white);font-family:'Montserrat',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased;overflow-x:hidden}
    ::selection{background:var(--tees-yellow);color:var(--tees-black)}
    ::-webkit-scrollbar{width:6px;height:6px}
    ::-webkit-scrollbar-track{background:var(--tees-surface)}
    ::-webkit-scrollbar-thumb{background:var(--tees-border);border-radius:3px}
    img{display:block;max-width:100%}

    /* ── Header ── */
    .mo-header{display:flex;align-items:center;justify-content:space-between;padding:18px 28px;border-bottom:1px solid rgba(255,255,255,.06);position:sticky;top:0;background:rgba(13,13,13,.82);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);z-index:20}
    .mo-logo{font-family:'Cormorant',serif;font-size:22px;font-weight:700;letter-spacing:.06em}
    .mo-logo span{color:var(--tees-yellow)}
    .mo-back{color:var(--tees-muted);text-decoration:none;font-size:12px;border:1px solid rgba(245,200,66,.25);padding:8px 16px;border-radius:100px;transition:all .3s var(--tees-ease)}
    .mo-back:hover{color:var(--tees-black);background:var(--tees-yellow);border-color:var(--tees-yellow)}

    /* ── Hero ── */
    .mo-hero{position:relative;text-align:center;padding:56px 20px 10px}
    .mo-hero::before{content:'';position:absolute;top:-140px;left:50%;transform:translateX(-50%);width:560px;height:320px;background:radial-gradient(closest-side,rgba(245,200,66,.09),transparent);pointer-events:none}
    .mo-hero-eyebrow{font-size:10px;letter-spacing:.35em;color:var(--tees-yellow-dim);text-transform:uppercase;animation:fadeUp .6s .05s both}
    .mo-title{font-family:'Cormorant',serif;font-size:48px;font-weight:600;margin:10px 0 14px;background:linear-gradient(180deg,#fff 20%,rgba(245,200,66,.9));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:fadeUp .6s .1s both;line-height:1.1}
    .mo-title-line{width:96px;height:1px;background:var(--tees-gold-line);margin:0 auto;animation:fadeUp .6s .15s both}
    .mo-sub{color:var(--tees-muted);font-size:13px;margin:14px auto 0;max-width:420px;animation:fadeUp .6s .2s both}

    /* ── Tabs ── */
    .mo-tabs-wrap{max-width:720px;margin:34px auto 0;padding:0 16px;animation:fadeUp .6s .25s both}
    .mo-tabs{display:flex;gap:6px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);padding:5px;border-radius:14px}
    .mo-tab{flex:1;text-align:center;padding:12px;border:none;border-radius:10px;background:transparent;color:var(--tees-muted);cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;transition:all .35s var(--tees-ease)}
    .mo-tab.active{background:rgba(245,200,66,.12);color:var(--tees-yellow);box-shadow:inset 0 0 0 1px rgba(245,200,66,.35)}
    .mo-tab:focus-visible{outline:2px solid var(--tees-yellow);outline-offset:2px}

    /* ── Wrap & Cards ── */
    .mo-wrap{max-width:720px;margin:18px auto 72px;padding:0 16px;display:grid;gap:16px;animation:tabIn .4s var(--tees-ease)}
    .mo-card{background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012));border:1px solid rgba(245,200,66,.14);border-radius:18px;padding:24px;position:relative}
    .mo-card::before{content:'';position:absolute;top:0;left:24px;right:24px;height:1px;background:linear-gradient(90deg,transparent,rgba(245,200,66,.35),transparent)}
    .mo-card-title{font-family:'Cormorant',serif;font-size:19px;color:var(--tees-yellow);margin:0 0 16px;font-weight:600}

    /* ── Fields ── */
    .mo-field{display:grid;gap:6px;margin-bottom:14px}
    .mo-field label{font-size:11px;color:var(--tees-muted);letter-spacing:.02em}
    .mo-field input,.mo-field textarea{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:var(--tees-white);font-size:13px;font-family:inherit;transition:border-color .3s var(--tees-ease),box-shadow .3s var(--tees-ease)}
    .mo-field input:focus,.mo-field textarea:focus{outline:none;border-color:rgba(245,200,66,.6);box-shadow:0 0 0 3px rgba(245,200,66,.12)}
    .mo-field textarea{resize:vertical;min-height:64px}

    /* ── Payment ── */
    .mo-pay-title{margin:18px 0 12px}
    .mo-pay{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .mo-pay-opt{display:flex;align-items:center;gap:10px;cursor:pointer;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:13px;background:rgba(255,255,255,.03);font-size:12px;position:relative;transition:all .3s var(--tees-ease);text-align:right}
    .mo-pay-opt .mo-pay-name{font-weight:600;font-size:12.5px;color:var(--tees-white)}
    .mo-pay-opt .mo-pay-desc{font-size:10.5px;color:var(--tees-muted);margin-top:2px}
    .mo-pay-check{position:absolute;top:8px;left:10px;width:18px;height:18px;border-radius:50%;background:var(--tees-yellow);color:var(--tees-black);font-size:11px;display:none;align-items:center;justify-content:center;font-weight:700}
    .mo-pay-opt.selected{border-color:var(--tees-yellow);background:rgba(245,200,66,.1)}
    .mo-pay-opt.selected .mo-pay-check{display:flex;animation:checkPop .35s var(--tees-ease)}
    @keyframes checkPop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}

    /* ── Error / Button ── */
    .mo-error{color:#FCA5A5;font-size:12px;display:none;margin:12px 0 0;padding:10px 14px;border:1px solid rgba(252,165,165,.25);border-radius:10px;background:rgba(252,165,165,.07);animation:shake .3s ease}
    .mo-btn{width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--tees-yellow-dim),var(--tees-yellow));color:var(--tees-black);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;position:relative;overflow:hidden;transition:transform .25s var(--tees-ease),box-shadow .3s var(--tees-ease);margin-top:16px}
    .mo-btn:hover{transform:translateY(-1px);box-shadow:0 10px 28px rgba(245,200,66,.22)}
    .mo-btn:active{transform:translateY(0) scale(.99)}
    .mo-btn:disabled{opacity:.45;cursor:wait;transform:none;box-shadow:none}
    .mo-btn::after{content:'';position:absolute;top:0;left:-75%;width:50%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);transform:skewX(-20deg);transition:left .6s var(--tees-ease)}
    .mo-btn:not(:disabled):hover::after{left:125%}

    /* ── Cart items ── */
    .mo-item{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px dashed rgba(255,255,255,.08)}
    .mo-item img{width:54px;height:54px;object-fit:cover;border-radius:12px}
    .mo-item-info{flex:1;min-width:0}
    .mo-item-name{font-size:13px;font-weight:600}
    .mo-item-meta{font-size:11px;color:var(--tees-muted);margin-top:2px}
    .mo-total-row{display:flex;justify-content:space-between;align-items:center;margin-top:16px}
    .mo-total-row span:first-child{font-size:12px;color:var(--tees-muted)}
    #mo-cart-total{font-family:'Cormorant',serif;font-size:24px;color:var(--tees-yellow);font-weight:700}

    /* ── Orders list ── */
    .mo-order{border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:16px;background:rgba(255,255,255,.02);margin-bottom:12px;transition:all .3s var(--tees-ease)}
    .mo-order:hover{border-color:rgba(245,200,66,.25);transform:translateY(-1px)}
    .mo-order-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
    .mo-order-name{font-size:13.5px;font-weight:700}
    .mo-badge{font-size:10px;padding:4px 10px;border-radius:100px;font-weight:600}
    .mo-badge.new{background:rgba(245,200,66,.14);color:var(--tees-yellow)}
    .mo-badge.completed{background:rgba(74,222,128,.14);color:#4ADE80}
    .mo-badge.cancelled{background:rgba(252,165,165,.14);color:#FCA5A5}
    .mo-badge.card{background:rgba(96,165,250,.14);color:#93C5FD}
    .mo-order-meta{font-size:11px;color:var(--tees-muted);margin-top:8px}
    .mo-cancel{margin-top:12px;background:none;border:1px solid rgba(252,165,165,.35);color:#FCA5A5;padding:9px 16px;border-radius:100px;font-size:12px;cursor:pointer;font-family:inherit;transition:all .3s var(--tees-ease)}
    .mo-cancel:hover{background:rgba(252,165,165,.1)}
    .mo-cancel:disabled{opacity:.4;cursor:not-allowed}

    /* ── Empty state ── */
    .mo-empty{text-align:center;padding:48px 16px;color:var(--tees-muted);font-size:13px}
    .mo-empty-icon{display:flex;justify-content:center;margin-bottom:14px}
    .mo-empty a{color:var(--tees-yellow)}
    .mo-customer-name{font-weight:400;font-size:12px;color:var(--tees-muted)}

    /* ── Overlay ── */
    .mo-overlay{position:fixed;inset:0;background:rgba(5,5,5,.7);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;z-index:50}
    .mo-overlay.show{display:flex}
    .mo-overlay-card{background:linear-gradient(180deg,#1C1917,#161616);border:1px solid rgba(245,200,66,.2);padding:32px 44px;border-radius:18px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.5)}
    .mo-overlay-card .spin{width:36px;height:36px;border:3px solid rgba(245,200,66,.2);border-top-color:var(--tees-yellow);border-radius:50%;margin:0 auto 14px;animation:moSpin 1s linear infinite}
    @keyframes moSpin{to{transform:rotate(360deg)}}

    /* ── Motion ── */
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
    @keyframes tabIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(4px)}50%{transform:translateX(-4px)}75%{transform:translateX(2px)}}

    @media (prefers-reduced-motion:reduce){
      *{animation:none!important;transition:none!important}
      .mo-overlay-card .spin{animation:moSpin 1s linear infinite!important}
    }

    @media (max-width:600px){
      .mo-pay{grid-template-columns:1fr}
      .mo-title{font-size:36px}
      .mo-header{padding:14px 18px}
      .mo-card{padding:18px}
    }
  </style>
</head>
<body>
  <header class="mo-header">
    <div class="mo-logo">OUR <span>TEES</span></div>
    <a class="mo-back" href="store.html">→ العودة للمتجر</a>
  </header>

  <div class="mo-hero">
    <div class="mo-hero-eyebrow">AZMA · CUSTOMER CARE</div>
    <h1 class="mo-title">طلباتي</h1>
    <div class="mo-title-line"></div>
    <p class="mo-sub">تابع طلباتك، أعد الطلب بعنوانك المحفوظ، وأكمل الشراء بكل سهولة</p>
  </div>

  <div class="mo-tabs-wrap">
    <div class="mo-tabs">
      <button class="mo-tab active" id="tab-checkout" onclick="switchTab('checkout')">🛒 إتمام الطلب</button>
      <button class="mo-tab" id="tab-orders" onclick="switchTab('orders')">📦 طلباتي</button>
    </div>
  </div>

  <div class="mo-wrap" id="panel-checkout">
    <div class="mo-card">
      <h3 class="mo-card-title">ملخص طلبك</h3>
      <div id="mo-cart-items"></div>
      <div class="mo-total-row">
        <span>المجموع</span>
        <span id="mo-cart-total">0</span>
      </div>
    </div>
    <div class="mo-card">
      <h3 class="mo-card-title">معلومات التوصيل</h3>
      <div class="mo-field"><label>الاسم الكامل *</label><input id="mo-name" placeholder="محمد أحمد"></div>
      <div class="mo-field"><label>رقم الهاتف *</label><input id="mo-phone" placeholder="07XXXXXXXX" dir="ltr"></div>
      <div class="mo-field"><label>المدينة *</label><input id="mo-city" placeholder="عمّان"></div>
      <div class="mo-field"><label>الحي / المنطقة</label><input id="mo-area" placeholder="الصويفية"></div>
      <div class="mo-field"><label>الشارع</label><input id="mo-street" placeholder="شارع المدينة"></div>
      <div class="mo-field"><label>معلم قريب (اختياري)</label><input id="mo-landmark" placeholder="بجانب المسجد"></div>
      <div class="mo-field"><label>ملاحظات (اختياري)</label><textarea id="mo-notes" rows="2" placeholder="أي تفاصيل إضافية..."></textarea></div>
      <h3 class="mo-card-title mo-pay-title">طريقة الدفع</h3>
      <div class="mo-pay">
        <div class="mo-pay-opt selected" id="pay-cod" onclick="pickPayment('cod')">
          <span>💵</span>
          <div>
            <div class="mo-pay-name">الدفع عند الاستلام</div>
            <div class="mo-pay-desc">ادفع كاش عند التوصيل</div>
          </div>
          <span class="mo-pay-check">✓</span>
        </div>
        <div class="mo-pay-opt" id="pay-card" onclick="pickPayment('card')">
          <span>💳</span>
          <div>
            <div class="mo-pay-name">دفع إلكتروني</div>
            <div class="mo-pay-desc">ادفع عبر البطاقة فوراً</div>
          </div>
          <span class="mo-pay-check">✓</span>
        </div>
      </div>
      <p id="mo-error" class="mo-error"></p>
      <button class="mo-btn" id="mo-submit" onclick="submitOrderFlow()">تأكيد الطلب</button>
    </div>
  </div>

  <div class="mo-wrap" id="panel-orders" style="display:none;">
    <div class="mo-card" id="mo-phone-panel">
      <h3 class="mo-card-title">شوف طلباتك</h3>
      <div class="mo-field"><label>رقم الهاتف</label><input id="mo-lookup-phone" placeholder="07XXXXXXXX" dir="ltr"></div>
      <button class="mo-btn" onclick="lookupOrders()">عرض طلباتي</button>
    </div>
    <div class="mo-card" id="mo-orders-panel" style="display:none;">
      <h3 class="mo-card-title">طلباتي <span id="mo-customer-name" class="mo-customer-name"></span></h3>
      <div id="mo-orders-list"></div>
    </div>
  </div>

  <div class="mo-overlay" id="mo-overlay">
    <div class="mo-overlay-card">
      <div class="spin"></div>
      <div id="mo-overlay-text">جاري معالجة الدفع...</div>
    </div>
  </div>

  <script src="js/api.js"></script>
  <script src="js/db-local.js"></script>
  <script src="js/my-orders.js"></script>
</body>
</html>
```

**تحذيرات أثناء النسخ:**
- لا تعدّل أي معرّف أو قيمة `onclick` أو ترتيب الـ scripts.
- حقل الملاحظات `<textarea>` **يجب أن يُغلق بـ `</textarea></div>`** (الوسم المغلق الصحيح — الخطأ القديم ممنوع).
- لا تحذف `class="mo-error"` ولا خاصية `display:none` الافتراضية (الـ JS يضبطها).
- `style="display:none;"` على `panel-orders` و`mo-orders-panel` لازم (الـ JS يتحكم بها).
- اكتب الملف بأداة الكتابة (write) — لا تستخدم توجيه الكونسول (UTF-8 عربي).
- الحالة الفارغة `mo-empty` يعرضها الـ JS نصاً فقط (بلا أيقونة) — أسلوب الـ CSS يصفّيها أنيقة بدون أيقونة (JS لا يُعدَّل لإدخالها).

- [ ] **Step 3: تحقق ثابت — توازن ووسم ومطابقة**

```powershell
$c = Get-Content my-orders.html -Raw; "open: " + ([regex]::Matches($c,'<div\b')).Count + " / close: " + ([regex]::Matches($c,'</div>')).Count
```
Expected: متساويان (48/48 تقريباً).

```powershell
$ids = 'mo-name','mo-phone','mo-city','mo-area','mo-street','mo-landmark','mo-notes','pay-cod','pay-card','mo-error','mo-submit','mo-cart-items','mo-cart-total','tab-checkout','tab-orders','panel-checkout','panel-orders','mo-phone-panel','mo-lookup-phone','mo-orders-panel','mo-customer-name','mo-orders-list','mo-overlay','mo-overlay-text'; $missing = $ids | Where-Object { -not (Select-String -Path my-orders.html -Pattern ('id="' + $_ + '"') -Quiet) }; if ($missing) { "MISSING: $missing" } else { "ALL 24 IDS PRESENT" }
```
Expected: ALL 24 IDS PRESENT.

تحقق أيضاً: `onclick="switchTab(` و`submitOrderFlow()` و`pickPayment('cod')` و`lookupOrders()` موجودة.

- [ ] **Step 4: تحقق حي في المتصفح**

السيرفر يعمل على `http://localhost:3000` (إن لم يكن — شغّله من جذر المشروع: `node server.js` وانتظر رسالة AZMA running). افتح المتصفح على `http://localhost:3000/my-orders.html` (أعد التحميل إن كان مفتوحاً) وتأكد:
- الهيرو يظهر: eyebrow + "طلباتي" بخط كبير ذهبي-أبيض + خط ذهبي + وصف.
- التبويبان في حبة واحدة، النشط ذهبي.
- بطاقتا نموذج الطلب بحدود ذهبية باهتة وزجاجية.
- طريقة الدفع بطاقتين والـ ✓ تظهر على "الدفع عند الاستلام".
- اضغط "📦 طلباتي" → لوحة البحث تظهر (التبويب يشتغل — تأكد أن المحتوى يظهر فعلاً وليس صفحة فارغة).
- الكونسول: صفر أخطاء.

لقطة للشاشة بعد الفحص تُحفظ كأدلة.

- [ ] **Step 5: الالتزام**

```bash
git add my-orders.html
git commit --no-verify -m "feat(my-orders): luxury boutique redesign (dark+gold editorial hero, glass cards, motion)"
```

---

### Task 2: التحقق من سلسلة الحفظ التلقائي + التعديل المسموح الوحيد في JS

**Files:**
- Read: `js/my-orders.js:199-205` (showToast), `js/db-local.js:153-200` (createOrder/getCustomerByPhone), `js/api.js` (submitOrder/getCustomerByPhone)
- Modify (إن أمكن الالتزام بالقيود): `js/my-orders.js:202` (سطر cssText واحد فقط)

**Interfaces:**
- Consumes: `my-orders.html` من Task 1 (كل المعرّفات موجودة)
- Produces: تغيير توست واحد موثّق — لا شيء لاحق يعتمد عليه

- [ ] **Step 1: تحقق السلسلة في الوضعين (قراءة كود فقط)**

السلسلة المطلوبة: طلب جديد برقم X → يُحفظ العميل بالعنوان → بحث لاحقاً عن X → النموذج يتعبأ تلقائياً.

- **الوضع السيرفر**: اقرأ `js/my-orders.js:96-102` (submitOrderFlow يرسل customerName/phone/city/area/street/landmark/address مع API.submitOrder) و`js/api.js` (submitOrder → POST /api/orders) و`server.js` (POST /api/orders → upsertCustomer). متوقع: مكتمل.
- **الوضع المحلي**: اقرأ `js/db-local.js:153-165` (createOrder يخزن كل الحقول مع الطلب) و`:185-200` (getCustomerByPhone يشتق العميل من أحدث طلب — name/city/area/street/landmark). متوقع: مكتمل.
- **التعبئة**: اقرأ `js/my-orders.js:145-152` (loadMyOrders يعبئ mo-name/mo-city/mo-area/mo-street/mo-landmark من العميل). متوقع: مكتمل.

النتيجة المتوقعة: السلسلة مكتملة في الوضعين — لا إصلاحات. **إن اكتشفت فراغاً فعلياً (نادر) — لا تلمس أي ملف: توقف واكتب NEEDS_CONTEXT في تقريرك مع الملف والسطر والمشكلة.**

- [ ] **Step 2: التعديل المسموح الوحيد — توست زجاجي**

في `js/my-orders.js` سطر 202، استبدل قيمة `t.style.cssText` التالية:

```js
  t.style.cssText = 'position:fixed;bottom:24px;right:50%;transform:translateX(50%);background:rgba(22,25,22,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid ' + (isErr ? 'rgba(252,165,165,.4)' : 'rgba(245,200,66,.35)') + ';color:' + (isErr ? '#FCA5A5' : 'var(--tees-yellow,#F5C842)') + ';padding:11px 20px;border-radius:12px;font-size:13px;z-index:100;box-shadow:0 8px 24px rgba(0,0,0,.4);';
```

(أصله: `'position:fixed;bottom:24px;right:50%;transform:translateX(50%);background:' + (isErr ? '#7F1D1D' : '#14532D') + ';color:#FAFAF9;padding:11px 20px;border-radius:10px;font-size:13px;z-index:100;box-shadow:0 8px 24px rgba(0,0,0,.4);'`)

هذا التغيير الوحيد المسموح في JS — لا شيء آخر.

- [ ] **Step 3: تحقق حي من الحفظ والتعبئة (وضع السيرفر)**

في المتصفح (الصفحة مفتوحة):
1. تبويب "📦 طلباتي" → أدخل `0791234567` في حقل البحث → "عرض طلباتي" → تظهر قائمة (هذا الرقم له طلبات في dev.db).
2. انتقل لتبويب "🛒 إتمام الطلب" → تأكد أن الحقول تعبأت تلقائياً: الاسم "اختبار"، المدينة "عمّان" (من العميل المحفوظ).
3. (اختياري — يُنشئ طلباً حقيقياً في dev.db برقم الاختبار) املأ حقل الاسم وكرر الإرسال → رسالة نجاح → انتقل تلقائياً لتبويب الطلبات والطلب الجديد في الأعلى. لا بأس بذلك — بيانات تطوير.
4. الكونسول صفر أخطاء طوال الوقت.

- [ ] **Step 4: الالتزام**

```bash
git add js/my-orders.js
git commit --no-verify -m "style(my-orders): glass toast styling"
```

(إن لم يتغير شيء — لا التزام، واكتب ذلك في التقرير.)

---

### Task 3: الفحص النهائي الشامل + التقرير

**Files:**
- Read: كل ما سبق (لا تعديلات متوقعة)

- [ ] **Step 1: فحص نهائي شامل**

1. توازن divs مرة أخيرة (49/49 أو مطابق).
2. المتصفح: تحميل الصفحة → الكونسول صفر أخطاء → كل التبويبات تعمل → لا تحذير `prefers-reduced-motion`؟ (تحقق كودياً أن الوسيط موجود).
3. تحقق من عدم وجود بقايا `checkout-form` أو `showCheckoutForm` في my-orders.html (يجب صفر).
4. اختبر `prefers-reduced-motion: reduce` عبر محاكاة في DevTools أو `page.emulateMedia` — لا حركات (عدا حلقة المعالجة).
5. اختبر رسالة الخطأ: اضغط "تأكيد الطلب" بسلة فارغة أو بحقل فارغ → رسالة تظهر مع اهتزاز، الزر يعود مفعّلاً.
6. اختبر الإلغاء: من قائمة `0791234567` اضغط "إلغاء الطلب" على طلب جديد → تأكيد → توست زجاجي.
7. لقطة شاشة نهائية كاملة (full page) تُحفظ كدليل تصميم.

- [ ] **Step 2: التقرير النهائي**

اكتب تقريراً في `.superpowers/sdd/2026-08-08-my-orders-redesign/task-3-report.md` يشمل: نتائج كل الفحوصات، أي ملاحظة تصميمية، روابط/أسماء اللقطات. إن وجدت مشكلة حرجة — أصلحها ووثّقها (مع الالتزام إن لزم بتنسيق `--no-verify` ورسالة واضحة).

- [ ] **Step 3: لا التزام نهائي (متوقع)**

لا التزام متوقع في هذه المهمة (كل التغييرات التزمت في Task 1 و2). إن اضطررت لإصلاح — التزم بصيغة `--no-verify` مع رسالة `fix(my-orders): ...`.
