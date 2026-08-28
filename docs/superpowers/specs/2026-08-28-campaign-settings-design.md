# تصميم: قسم "إعدادات الحملات والتمويل" (تسويق وعروض)

**التاريخ:** 2026-08-28
**الحالة:** معتمد

## نظرة عامة
إضافة قسم جديد داخل لوحة تحكم المتجر (admin.html) تحت اسم "إعدادات الحملات والتمويل"
يسمح للمدير بإنشاء حملة بريدية موجّهة لفئة من العملاء عبر قناة البريد الإلكتروني، مع
عرض قنوات تواصل أخرى (واتساب، انستغرام، مسنجر، SMS) كـ UI معطّلة مؤقتاً حتى ربط الـ APIs لاحقاً.

## 1. تغييرات قاعدة البيانات (Prisma)
إضافة حقل `email` إلى نموذجَي `Customer` و `Order` في كلا ملفي schema:

- `prisma/schema.prisma` (postgres — الإنتاج)
- `prisma/schema.sqlite.prisma` (sqlite — التطوير المحلي)

```prisma
model Customer {
  // ... حقول موجودة ...
  email String @default("")   // إيميل العميل (جديد)
}

model Order {
  // ... حقول موجودة ...
  email String @default("")   // إيميل العميل وقت الطلب (جديد)
}
```

**خطوات المزامنة:**
- `prisma generate`
- التطوير المحلي: `prisma db push --schema prisma/schema.sqlite.prisma` لمزامنة `dev.db`.
- الإنتاج: إنشاء migration عبر `prisma migrate dev --schema prisma/schema.prisma`.
- تحديث `db.cjs`: عند إنشاء/تحديث الطلب (`createOrder`/`updateOrder`) يُحفظ `email`
  إن وُجد (من جلسة المستخدم أو من حقل الإيميل في نموذج الطلب إن وُجد).

## 2. طبقة الإرسال — `mailer.cjs` (جديد)
- تثبيت `nodemailer`.
- قراءة إعدادات SMTP من متغيرات البيئة:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- دالة `sendCampaignEmail({ to, subject, html })`:
  - إن وُجدت الإعدادات → إنشاء transporter وإرسال حقيقي.
  - إن غابت → "محاكاة": طباعة السجل في الـ console (`[CAMPAIGN-SIM] -> to: subject`)
    وتسجيله، مع إرجاع `{ simulated: true }`. (منطق آمن موازٍ لحالة القنوات المعطّلة.)
  - معالجة الأخطاء لكل مستلم بشكل منفصل (فشل مستلم واحد لا يوقف الباقي).

## 3. الـ Endpoint — `POST /api/send-campaign`
- محمي بـ `requireAuth` (مثل بقية endpoints الإدارية في server.js).
- مخطط Zod:
  - `targetGroup`: enum(`all_registered`, `bought_last_month`, `previous_customers`)
  - `channel`: enum(`email`) فقط — رفض أي قناة أخرى بـ 400 (حتى تُربط لاحقاً).
  - `subject`: string مطلوب (max 200)
  - `content`: string مطلوب (max 5000)
- تحديد المستلمين حسب الفئة:
  - `all_registered` → `UserSession` حيث `email != ''` (فريد).
  - `bought_last_month` → `Order` حيث `createdAt >= الآن - 30 يومًا` و `email != ''` (فريد).
  - `previous_customers` → **أي** `Order` له `email != ''` (فريد، بغض النظر عن التاريخ).
- الإرسال في الخلفية (fire-and-forget عبر `Promise.allSettled` مع حدود تزامن معقولة)
  والرد فوراً: `{ accepted: true, recipients: N, simulated: <bool>, startedAt }`
  حتى لا يتجمد الطلب عند كبرى القوائم. تُطبع نتيجة الإرسال (ناجح/فاشل) في الـ console.

## 4. الواجهة (UI) — لوحة التحكم
- **عنصر جانبي جديد** ضمن مجموعة "الإعدادات" في `admin.html`:
  ```html
  <a class="sidebar-item" onclick="switchPanel('campaigns')" data-panel="campaigns">… إعدادات الحملات والتمويل</a>
  ```
- إضافة `'campaigns': 'إعدادات الحملات والتمويل'` إلى خريطة العناوين في `switchPanel`.
- **قسم جديد** `<section id="panel-campaigns" class="panel">` بنفس أسلوب البطاقات:
  - **الفئة المستهدفة**: ٣ خيارات radio.
  - **قنوات التواصل**: بطاقة "البريد الإلكتروني" مفعّلة (toggle أخضر)؛ بطاقات معطّلة
    (واتساب، انستغرام، مسنجر، SMS) مع شارة "قيد الربط لاحقاً" ورمادية (disabled).
  - **محتوى الحملة**: حقل `Subject` + `Textarea` واسع للرسالة/العروض/أكواد الخصم.
  - زر **إرسال الحملة** يستدعي `/api/send-campaign` عبر fetch ويعرض عدد المستلممين + الحالة.
- منطق الواجهة في `js/admin.js` (دالة `sendCampaign()` + ربط النموذج)، مع تفعيل
  `loadCampaigns` داخل `switchPanel` عند فتح القسم (اختياري: عرض عدد المستلممين المتوقع).

## 5. الاختبار
- اختبار وحدة (vitest) لنقطة النهاية: تحقق Zod + تحديد المستلمين لكل فئة.
- تشغيل يدوي: فتح اللوحة → ملء النموذج → إرسال → التحقق من طباعة الـ console
  (أو وصول الإيميل عند ضبط SMTP).

## ملاحظات النطاق (YAGNI)
- لا حفظ لسجل الحملات في قاعدة البيانات في هذه المرحلة (فقط console + رد فوري).
- لا قوالب بريد متقدمة؛ محتوى نصي/HTML بسيط كما يكتبه المدير.
- القنوات غير البريدية معطّلة UI فقط بدون endpoints.
