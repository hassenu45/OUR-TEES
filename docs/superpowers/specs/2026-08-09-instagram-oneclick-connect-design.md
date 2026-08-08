# تصميم: اتصال انستقرام بضغطة زر (One-Click Connect)

**التاريخ:** 2026-08-09
**الحالة:** معتمد
**الهدف:** تفعيل بوت الرد الآلي على رسائل وتعليقات انستقرام (الموجود مسبقاً) عبر زر اتصال تلقائي في لوحة التحكم، مع تخزين التوكن بشكل دائم في قاعدة البيانات.

## السياق

- الموقع (AZMA) يحتوي على نظام بوت انستقرام جاهز في `integrations.cjs`:
  - معرف التطبيق والمفتاح السري مثبتان بشكل دائم (Hardcoded fallback مع إمكانية التجاوز عبر متغيرات البيئة) — `integrations.cjs:13-14`
  - Webhooks: `GET/POST /api/integrations/instagram/webhook` مثبتة في `server.js:653`
  - `handleInstagramEntry` يعالج الرسائل الخاصة (DMs) والتعليقات
  - لوحة التحكم فيها نموذج حقول يدوية (`igEnabled`, `igUserId`, `igToken`, `igCommentReply`, `igDmReply`, `webhookSecret`)
- المشاكل الحالية:
  1. Meta ترفض مفاتيح التطبيق (خطأ 101) — غالباً التطبيق في وضع Development أو المفتاح السري منسوخ خطأ. هذا إجراء على لوحة ميتا لا يمكن حله من الكود.
  2. النموذج اليدوي يتطلب من المستخدم توليد التوكن من Graph API Explorer ولصقه — عملية صعبة ومتكررة (توكن طويل الأمد يعيش 60 يوماً).

## الحل المعتمد

زر "اتصال بالانستقرام" في لوحة التحكم يبدأ تدفق OAuth كاملاً:

```
مستخدم يضغط الزر
  → GET /api/integrations/instagram/connect
      → يولّد state عشوائي ويحفظه في الجلسة (session)
      → يعيد توجيه إلى Facebook OAuth Dialog مع الأذونات المطلوبة
  → مستخدم يسجل دخوله ويوافق
  → Meta يعيد التوجيه إلى /api/integrations/instagram/callback?code=...&state=...
      → يتحقق من state (حماية CSRF)
      → يستبدل الكود بتوكن قصير الأمد
      → يرقّي إلى توكن طويل الأمد (60 يوماً) عبر fb_exchange_token
      → يبحث عن حساب انستقرام للأعمال عبر /me/accounts
      → يسجل الاشتراك في webhook عبر /subscribed_apps
      → يحفظ igUserId + igToken + تفعيل البوت في قاعدة البيانات (دائم)
      → يعيد التوجيه إلى admin.html?ig=connected (أو ig=error)
```

## المكونات

### 1. Endpoints جديدة في `integrations.cjs`

**`GET /api/integrations/instagram/connect`** (لا يتطلب تسجيل دخول — سيبدأ تدفق OAuth):
- يبني `state` عشوائياً (crypto.randomBytes) ويخزنه في `req.session.igOAuthState`
- يعيد توجيه (302) إلى:
  `https://www.facebook.com/v21.0/dialog/oauth?client_id=IG_APP_ID&redirect_uri=<base>/api/integrations/instagram/callback&state=<state>&scope=instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list`
- `redirect_uri` يجب أن يكون مطابقاً حرفياً لما في لوحة ميتا

**`GET /api/integrations/instagram/callback`**:
- يتحقق `req.query.state === req.session.igOAuthState` ثم يمسحها (استخدام لمرة واحدة)
- خطوات تبادل التوكن (كلها عبر fetch إلى `graph.facebook.com/v21.0`):
  1. `GET /oauth/access_token?client_id&client_secret&redirect_uri&code` → توكن قصير
  2. `GET /oauth/access_token?grant_type=fb_exchange_token&client_id&client_secret&fb_exchange_token` → توكن طويل الأمد
  3. `GET /me/accounts?fields=instagram_business_account{id,username}&access_token` → إيجاد الحساب (أول حساب يحتوي instagram_business_account)
  4. `POST /<igUserId>/subscribed_apps?access_token=<token>` → تسجيل webhook (إخفاقه لا يفشل العملية، يسجل تحذيراً)
  5. `db.updateIntegrationSettings({ igUserId, igToken, igEnabled: true, igDmReply: true, igCommentReply: true })`
- إعادة توجيه إلى `/admin.html?ig=connected` أو `/admin.html?ig=error&reason=<msg>` مع رسالة خطأ مفهومة

**معالجة الأخطاء:** كل خطوة تلتقط خطأ Meta وتعرض رسالة عربية واضحة (مثلاً: "التطبيق غير مفعّل (Development) أو المفتاح السري غير صحيح").

### 2. تحسين `/api/integrations/test`

- عند خطأ 101 من `getIGAppAccessToken`، رسالة: "التطبيق في وضع Development أو المفتاح السري غير صحيح — حوّل التطبيق إلى Live من developers.facebook.com"

### 3. لوحة التحكم (`admin.html` + `js/admin.js`)

- زر مميز "اتصال بالانستقرام" بجانب كرت الإعدادات، يفتح `window.location = '/api/integrations/instagram/connect'`
- عند العودة مع `?ig=connected` تظهر رسالة نجاح (toast/banner) "✅ تم الاتصال بالانستقرام — التوكن محفوظ بشكل دائم"
- عند `?ig=error` تظهر رسالة الخطأ
- النموذج اليدوي الحالي يبقى كما هو (كخيار احتياطي)

### 4. التعليمات في لوحة التحكم

- إضافة قسم تعليمات يوضح الخطوات اليدوية الواجبة على لوحة ميتا مرة واحدة:
  1. تحويل التطبيق إلى Live
  2. إضافة منتج "Instagram API with Messaging"
  3. إضافة `redirect_uri` إلى Valid OAuth Redirect URIs
  4. إعداد Webhooks (الرابط + Verify Token يظهران من `/status`)

## الحماية والأمان

- `state` عشوائي (crypto.randomBytes(24)) مخزن في الجلسة، استخدام لمرة واحدة، حماية CSRF
- `redirect_uri` يبنى من `req.protocol + req.get('host')` مع مراعاة `X-Forwarded-Proto` (خلف Railway يكون البروتوكول https عبر proxy) — يجب أن يطابق ما في لوحة ميتا حرفياً
- التوكن لا يظهر في الاستجابة، يعود كـ masked عبر `/status` كما هو الحال حالياً
- لا تسجيل للمفاتيح في السجلات

## الاختبارات

- وحدة اختبار لبناء رابط الـ OAuth (المعلمات الصحيحة)
- وحدة اختبار للتحقق من state: قبول المطابق، رفض المختلف/المنتهي، استخدام لمرة واحدة
- وحدة اختبار لخطوات تبادل التوكن مع fetch مُقلد (mock): نجاح، فشل 101، عدم وجود حساب انستقرام

## النشر

- `deploy.ps1` الحالي يُستخدم للنشر
- لا حاجة لتغيير schema (الحقول موجودة مسبقاً)

## إضافة (Addendum) — اكتشاف أثناء التنفيذ: تدفق تطبيق الديسكتوب

اكتشفنا أثناء التحقق أن لوحة التحكم تعمل داخل تطبيق الديسكتوب (Electron) وليس في المتصفح مباشرة:

1. `desktop/main.js:277-281` — `will-navigate` يمنع أي انتقال داخل النافذة خارج `http://127.0.0.1:PORT` → لا يمكن استخدام `window.location.href` للاتصال.
2. الـ callback يعود من فيسبوك مباشرة إلى Railway في متصفح خارجي، بينما كوكي الجلسة محفوظة داخل بروكسي الديسكتوب → `req.session.igOAuthState` لن يكون موجوداً عند الـ callback.

**التصحيحات المعتمدة:**
- **بدلاً من الجلسة:** مخزن `state` داخل الذاكرة في الخادم (`Map` مع انتهاء صلاحية 10 دقائق، استخدام لمرة واحدة). الـ state العشوائي نفسه هو الحماية من CSRF.
- **زر الاتصال:** `window.open('/api/integrations/instagram/connect', '_blank')` — `setWindowOpenHandler` يفتحه في المتصفح الخارجي.
- **صفحة نتيجة عامة:** `instagram-connected.html` (غير محجوبة) تعرض ✅/❌ وتطلب إغلاق التبويب.
- **كشف النتيجة في اللوحة:** بعد فتح المتصفح، اللوحة تفحص `/api/integrations/status` كل 3 ثوانٍ حتى ترى `ig.configured` → توست نجاح.

## النطاق (خارج النطاق)

- إصلاح حالة التطبيق في لوحة ميتا (إجراء المستخدم)
- تجديد التوكن تلقائياً بعد 60 يوماً (زر الاتصال يُعاد استخدامه)
- أي تكامل آخر (نشر منتجات، فيد صور، تسجيل دخول)
