// WhatsApp + Instagram auto-bot integrations (Meta Graph API / Cloud API)
const express = require('express');
const crypto = require('crypto');
const db = require('./db.cjs');
const oauth = require('./instagram-oauth.cjs');
const { deepSeekKey, deepSeekModel, runDiscoveryAgent, formatDiscoveryReply } = require('./ai.cjs');

const GRAPH = 'https://graph.facebook.com/v21.0';

// ── Instagram App credentials — ثابتة (مثبتة بشكل دائم) ──
// مثبتة مباشرة هنا عشان تظل ثابتة ولا تحتاج إعادة إدخال.
// لو تريد تغيرها، عدّل القيمتين أو ضعها في متغيرات البيئة:
//   IG_APP_ID="..." IG_APP_SECRET="..."
const IG_APP_ID = env('IG_APP_ID', '1758128081882141');
const IG_APP_SECRET = env('IG_APP_SECRET', '107e3f2832f8680c05106e326aaba6fa');

function isIGAppConfigured() {
  return !!(IG_APP_ID && IG_APP_SECRET);
}

async function getIGAppAccessToken() {
  const qs = new URLSearchParams({
    client_id: IG_APP_ID,
    client_secret: IG_APP_SECRET,
    grant_type: 'client_credentials',
  });
  const res = await fetch(GRAPH + '/oauth/access_token?' + qs);
  const j = await res.json();
  if (!res.ok || !j.access_token) {
    throw new Error('IG app token: ' + (j.error && j.error.message ? j.error.message : res.status));
  }
  return j.access_token;
}

// ── WhatsApp Business credentials — ثابتة (مثبتة بشكل دائم) ──
// مؤقتة الآن: الرقم راح يكون متوفراً لاحقاً وتغيّره من لوحة الإدارة أو هنا.
// يستخدم نفس تطبيق Meta (App ID) — عدّل القيم أو ضعها في متغيرات البيئة:
//   WA_APP_ID="..." WA_APP_SECRET="..." WA_PHONE_ID_PLACEHOLDER="..."
const WA_APP_ID = env('WA_APP_ID', IG_APP_ID);
const WA_APP_SECRET = env('WA_APP_SECRET', IG_APP_SECRET);
const WA_PHONE_ID_PLACEHOLDER = env('WA_PHONE_ID_PLACEHOLDER', '');

function isWAAppConfigured() {
  return !!(WA_APP_ID && WA_APP_SECRET);
}

// ── UltraMsg (بوابة واتساب) — ثابتة (مثبتة بشكل دائم) ──
// بترسل رسائل واتساب مباشرة بدون الحاجة لقالب Meta معتمد.
// عدّل القيم هنا أو عبر متغيرات البيئة:
//   ULTRAMSG_INSTANCE="instance187255" ULTRAMSG_TOKEN="..."
const ULTRAMSG_BASE = 'https://api.ultramsg.com';
const ULTRAMSG_INSTANCE = env('ULTRAMSG_INSTANCE', 'instance187255');
const ULTRAMSG_TOKEN = env('ULTRAMSG_TOKEN', 'u4eyrc4fmjm4fk2d');

function isUltraMsgConfigured() {
  return !!(ULTRAMSG_INSTANCE && ULTRAMSG_TOKEN);
}

async function sendUltraMsgText(to, text) {
  const form = new URLSearchParams({ token: ULTRAMSG_TOKEN, to, body: text });
  const res = await fetch(ULTRAMSG_BASE + '/' + ULTRAMSG_INSTANCE + '/messages/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || !j.sent) {
    throw new Error('UltraMsg send ' + res.status + ': ' + JSON.stringify(j).slice(0, 200));
  }
  return j;
}

async function testUltraMsg() {
  const res = await fetch(ULTRAMSG_BASE + '/' + ULTRAMSG_INSTANCE + '/instance/settings?token=' + encodeURIComponent(ULTRAMSG_TOKEN));
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) {
    throw new Error((j && j.error && j.error.message) || 'HTTP ' + res.status);
  }
  return j;
}

// ── Small helpers ──
function env(name, fallback) {
  return process.env[name] || fallback || '';
}

function rateLimited(limit, windowMs) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, start: now };
    if (now - bucket.start > windowMs) { bucket.count = 0; bucket.start = now; }
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > 2000) buckets.clear();
    return bucket.count > limit;
  };
}
const inboundRate = rateLimited(12, 60000);

function maskSecret(value) {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return value.slice(0, 3) + '...' + value.slice(-4);
}

function isWAConfigured(s) {
  return !!(s.waEnabled && s.waPhoneId && s.waToken);
}
function isIGConfigured(s) {
  return !!(s.igEnabled && s.igUserId && s.igToken);
}

// ── Outbound sends ──
async function sendWhatsAppText(to, text, s) {
  if (isUltraMsgConfigured()) {
    return sendUltraMsgText(to, text);
  }
  const res = await fetch(GRAPH + '/' + s.waPhoneId + '/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.waToken },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('WA send ' + res.status + ': ' + t.slice(0, 200));
  }
  return res.json();
}

async function sendWhatsAppTemplate(to, templateName, params, s) {
  const res = await fetch(GRAPH + '/' + s.waPhoneId + '/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.waToken },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: templateName, language: { code: 'ar' }, components: [{ type: 'body', parameters: params }] },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('WA template ' + res.status + ': ' + t.slice(0, 200));
  }
  return res.json();
}

async function sendInstagramMessage(toUserId, text, s) {
  const res = await fetch(GRAPH + '/' + s.igUserId + '/messages?access_token=' + encodeURIComponent(s.igToken), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: toUserId }, message: { text } }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('IG message ' + res.status + ': ' + t.slice(0, 200));
  }
  return res.json();
}

async function sendInstagramCommentReply(commentId, text, s) {
  const res = await fetch(GRAPH + '/' + commentId + '/replies?access_token=' + encodeURIComponent(s.igToken), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('IG reply ' + res.status + ': ' + t.slice(0, 200));
  }
  return res.json();
}

// ── AI pipeline for inbound messages ──
async function handleInbound(channel, externalId, text, name) {
  if (!text || !text.trim()) return null;
  if (inboundRate(channel + ':' + externalId)) {
    return 'شكراً لسؤالك! عدّل رسائلك قليلاً لأتمكن من مساعدتك بشكل أفضل.';
  }
  await db.appendConversationMessage(channel, externalId, 'user', text, name || '');

  const conv = await db.getConversation(channel, externalId);
  const history = (conv && conv.history ? conv.history : []).slice(-10);
  const messages = history.map((m) => ({
    role: m.sender === 'user' ? 'user' : 'assistant',
    content: String(m.text),
  }));

  let reply;
  try {
    const structured = await runDiscoveryAgent(messages, { maxTokens: 450 });
    reply = formatDiscoveryReply(structured);
  } catch (e) {
    console.error('channel AI failed:', e.message);
    reply = 'عذراً، واجهت مشكلة تقنية حالياً. يرجى المحاولة بعد قليل أو التواصل معنا مباشرة. 🙏';
  }
  await db.appendConversationMessage(channel, externalId, 'ai', reply, name || '');
  return reply;
}

// ── Webhook verification (GET) ──
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  getSettingsSafe().then((s) => {
    const expected = s.webhookSecret || env('WEBHOOK_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === expected) return res.status(200).send(challenge);
    res.sendStatus(403);
  }).catch(() => res.sendStatus(403));
}

function getSettingsSafe() {
  return db.getIntegrationSettings();
}

function checkWASignature(req) {
  const secret = env('WA_APP_SECRET');
  if (!secret) return true;
  const sig = req.get('x-hub-signature-256') || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
  return sig.length > 8 && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// ── WhatsApp inbound (Meta webhook) ──
async function handleWhatsAppEntry(entry) {
  const s = await getSettingsSafe();
  for (const item of entry) {
    for (const change of item.changes || []) {
      const value = change.value || {};
      const messages = value.messages || [];
      for (const msg of messages) {
        if (!s.waEnabled || !s.waReplyEnabled) return;
        const from = msg.from;
        const text = msg.text && msg.text.body;
        if (!from || !text) continue;
        try {
          const reply = await handleInbound('wa', from, text);
          if (reply) await sendWhatsAppText(from, reply, s);
        } catch (e) {
          console.error('WA inbound error:', e.message);
        }
      }
    }
  }
}

// ── WhatsApp inbound (UltraMsg webhook) ──
// UltraMsg يرسل JSON مثل: { "data": { "from": "9647...", "body": "..." } }
async function handleUltraMsgWebhook(payload) {
  const s = await getSettingsSafe();
  if (!s.waEnabled || !s.waReplyEnabled) return;
  const data = (payload && payload.data) || payload || {};
  const from = data.from;
  const text = data.body || data.message;
  if (!from || !text) return;
  try {
    const reply = await handleInbound('wa', from, text);
    if (reply) await sendWhatsAppText(from, reply, s);
  } catch (e) {
    console.error('UltraMsg inbound error:', e.message);
  }
}

// ── Instagram inbound ──
async function handleInstagramEntry(entry) {
  const s = await getSettingsSafe();
  const igId = String(s.igUserId || '');
  for (const item of entry) {
    for (const ev of item.messaging || []) {
      if (!s.igEnabled || !s.igDmReply) return;
      const from = ev.sender && ev.sender.id;
      const text = ev.message && ev.message.text;
      if (!from || !text || from === igId) continue;
      try {
        const reply = await handleInbound('ig', from, text);
        if (reply) await sendInstagramMessage(from, reply, s);
      } catch (e) {
        console.error('IG DM error:', e.message);
      }
    }
    for (const change of item.changes || []) {
      if (change.field !== 'comments' || !change.value || !change.value.comment_id) continue;
      if (!s.igEnabled || !s.igCommentReply) return;
      const val = change.value;
      const fromId = val.from && String(val.from.id);
      if (fromId === igId) continue;
      const text = val.text;
      const commentId = val.comment_id;
      if (!text || !commentId) continue;
      try {
        const reply = await handleInbound('ig', fromId || commentId, text, val.from && val.from.username);
        if (reply) await sendInstagramCommentReply(commentId, reply, s);
      } catch (e) {
        console.error('IG comment error:', e.message);
      }
    }
  }
}

// ── Order → WhatsApp confirmation ──
async function notifyOrder(order) {
  const s = await getSettingsSafe();
  // مع UltraMsg نرسل رسالة نصية مباشرة بدون قالب Meta معتمد
  if (isUltraMsgConfigured() && s.waEnabled) {
    const text =
      '✅ تم استلام طلبك ' + (order.customerName || '') +
      '!\n👕 المنتج: ' + (order.productName || 'تيشيرت') +
      '\n📏 المقاس: ' + (order.size || 'M') +
      '\n💰 السعر: ' + (order.productPrice || 0) +
      '\nشكراً لطلبك من ' + (process.env.SITE_NAME || 'AZMA') + ' ❤️';
    try {
      await sendUltraMsgText(order.phone, text);
      return { sent: true };
    } catch (e) {
      console.error('order notify failed:', e.message);
      return { sent: false, reason: e.message };
    }
  }
  if (!isWAConfigured(s) || !s.waTemplate) return { sent: false, reason: 'not-configured' };
  const params = [];
  params.push({ type: 'text', text: order.productName || 'تيشيرت' });
  params.push({ type: 'text', text: order.size || 'M' });
  params.push({ type: 'text', text: order.customerName || 'العميل' });
  try {
    await sendWhatsAppTemplate(order.phone, s.waTemplate, params, s);
    return { sent: true };
  } catch (e) {
    console.error('order notify failed:', e.message);
    return { sent: false, reason: e.message };
  }
}

// ── Router factory ──
function createRouter(requireAuth) {
  const router = express.Router();

  router.get('/whatsapp/webhook', verifyWebhook);
  router.post('/whatsapp/webhook', async (req, res) => {
    if (!checkWASignature(req)) return res.sendStatus(403);
    res.status(200).send('EVENT_RECEIVED');
    const entries = req.body && req.body.entry;
    if (entries) {
      handleWhatsAppEntry(entries).catch((e) => console.error('WA webhook async error:', e.message));
    }
  });

  // UltraMsg webhook — ضع هذا الرابط في إعدادات الـ instance لديك
  router.post('/whatsapp/ultramsg/webhook', async (req, res) => {
    res.status(200).send('OK');
    handleUltraMsgWebhook(req.body).catch((e) => console.error('UltraMsg webhook async error:', e.message));
  });

  router.get('/instagram/webhook', verifyWebhook);
  router.post('/instagram/webhook', async (req, res) => {
    res.status(200).send('EVENT_RECEIVED');
    const entries = req.body && req.body.entry;
    if (entries) {
      handleInstagramEntry(entries).catch((e) => console.error('IG webhook async error:', e.message));
    }
  });

  // Instagram one-click connect (OAuth)
  router.get('/instagram/connect', (req, res) => {
    const state = crypto.randomBytes(24).toString('hex');
    req.session.igOAuthState = state;
    const redirectUri = oauth.getCallbackUrl(req);
    res.redirect(oauth.buildOAuthUrl({ appId: IG_APP_ID, redirectUri, state }));
  });

  router.get('/instagram/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!oauth.verifyOAuthState(state, req.session.igOAuthState)) {
        return res.redirect('/admin.html?ig=error&reason=' + encodeURIComponent('طلب غير صالح (state mismatch)'));
      }
      delete req.session.igOAuthState;
      if (!code) {
        return res.redirect('/admin.html?ig=error&reason=' + encodeURIComponent('لم يتم الحصول على رمز التفويض'));
      }
      const redirectUri = oauth.getCallbackUrl(req);
      const short = await oauth.exchangeCode({ code, appId: IG_APP_ID, appSecret: IG_APP_SECRET, redirectUri });
      const long = await oauth.exchangeForLongToken({ shortToken: short.access_token, appId: IG_APP_ID, appSecret: IG_APP_SECRET });
      const account = await oauth.findIgBusinessAccount(long.access_token);
      if (!account) {
        return res.redirect('/admin.html?ig=error&reason=' + encodeURIComponent('لم يتم العثور على حساب انستقرام للأعمال مرتبط بصفحة فيسبوك'));
      }
      await oauth.subscribeIgWebhook(account.id, long.access_token).catch(() => {});
      await db.updateIntegrationSettings({
        igUserId: account.id,
        igToken: long.access_token,
        igEnabled: true,
        igDmReply: true,
        igCommentReply: true,
      });
      res.redirect('/admin.html?ig=connected&user=' + encodeURIComponent(account.username));
    } catch (e) {
      res.redirect('/admin.html?ig=error&reason=' + encodeURIComponent(e.message));
    }
  });

  router.get('/status', async (_req, res) => {
    const s = await getSettingsSafe();
    res.json({
      wa: { configured: isWAConfigured(s) || isUltraMsgConfigured(), enabled: s.waEnabled, replyEnabled: s.waReplyEnabled, phoneId: s.waPhoneId, template: s.waTemplate, provider: isUltraMsgConfigured() ? 'ultramsg' : 'meta' },
      waApp: { configured: isWAAppConfigured(), appId: WA_APP_ID, secretMasked: maskSecret(WA_APP_SECRET), phoneIdPlaceholder: WA_PHONE_ID_PLACEHOLDER },
      ultramsg: { configured: isUltraMsgConfigured(), instance: ULTRAMSG_INSTANCE, tokenMasked: maskSecret(ULTRAMSG_TOKEN), base: ULTRAMSG_BASE },
      ig: { configured: isIGConfigured(s), enabled: s.igEnabled, commentReply: s.igCommentReply, dmReply: s.igDmReply, userId: s.igUserId },
      igApp: { configured: isIGAppConfigured(), appId: IG_APP_ID, secretMasked: maskSecret(IG_APP_SECRET) },
      webhookSecret: s.webhookSecret || env('WEBHOOK_VERIFY_TOKEN'),
      webhookUrls: { wa: '/api/integrations/whatsapp/webhook', ig: '/api/integrations/instagram/webhook', ultramsg: '/api/integrations/whatsapp/ultramsg/webhook' },
      ai: { configured: !!(deepSeekKey() && deepSeekKey().trim()), model: deepSeekModel() },
    });
  });

  router.put('/settings', requireAuth, async (req, res) => {
    try {
      const s = await getSettingsSafe();
      const body = req.body || {};
      const data = {};
      if (typeof body.waEnabled === 'boolean') data.waEnabled = body.waEnabled;
      if (typeof body.waReplyEnabled === 'boolean') data.waReplyEnabled = body.waReplyEnabled;
      if (typeof body.waPhoneId === 'string') data.waPhoneId = body.waPhoneId.trim();
      if (typeof body.waTemplate === 'string') data.waTemplate = body.waTemplate.trim();
      if (typeof body.igEnabled === 'boolean') data.igEnabled = body.igEnabled;
      if (typeof body.igCommentReply === 'boolean') data.igCommentReply = body.igCommentReply;
      if (typeof body.igDmReply === 'boolean') data.igDmReply = body.igDmReply;
      if (typeof body.igUserId === 'string') data.igUserId = body.igUserId.trim();
      if (typeof body.webhookSecret === 'string') data.webhookSecret = body.webhookSecret.trim();
      if (typeof body.waToken === 'string' && body.waToken && body.waToken !== maskSecret(s.waToken)) data.waToken = body.waToken.trim();
      if (body.clearWAToken) data.waToken = '';
      if (typeof body.igToken === 'string' && body.igToken && body.igToken !== maskSecret(s.igToken)) data.igToken = body.igToken.trim();
      if (body.clearIGToken) data.igToken = '';
      await db.updateIntegrationSettings(data);
      const fresh = await getSettingsSafe();
      res.json({
        ok: true,
        wa: { configured: isWAConfigured(fresh), enabled: fresh.waEnabled },
        ig: { configured: isIGConfigured(fresh), enabled: fresh.igEnabled },
        waTokenMasked: maskSecret(fresh.waToken),
        igTokenMasked: maskSecret(fresh.igToken),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/conversations', requireAuth, async (_req, res) => {
    try {
      res.json(await db.getConversations());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/conversations/:id/clear', requireAuth, async (req, res) => {
    try {
      await db.clearConversation(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/test', requireAuth, async (_req, res) => {
    const s = await getSettingsSafe();
    const results = {};
    results.ultramsg = 'غير مضبوطة';
    if (isUltraMsgConfigured()) {
      try {
        await testUltraMsg();
        results.ultramsg = 'متصلة ✓ (الرقم الحالي مؤقت)';
      } catch (e) { results.ultramsg = 'فشل: ' + e.message; }
    }
    if (isWAConfigured(s)) {
      try {
        const r = await fetch(GRAPH + '/' + s.waPhoneId + '?fields=display_phone_number,name&access_token=' + encodeURIComponent(s.waToken));
        const j = await r.json();
        results.wa = r.ok && !j.error ? 'متصلة ✓' : 'فشل: ' + (j.error && j.error.message);
      } catch (e) { results.wa = 'فشل: ' + e.message; }
    } else if (isUltraMsgConfigured()) {
      results.wa = 'عبر UltraMsg ✓';
    } else results.wa = 'غير مضبوطة';
    if (isIGConfigured(s)) {
      try {
        const r = await fetch(GRAPH + '/' + s.igUserId + '?fields=username,id&access_token=' + encodeURIComponent(s.igToken));
        const j = await r.json();
        results.ig = r.ok && !j.error ? 'متصلة ✓' : 'فشل: ' + (j.error && j.error.message);
      } catch (e) { results.ig = 'فشل: ' + e.message; }
    } else results.ig = 'غير مضبوطة';
    results.igApp = 'غير مضبوطة';
    if (isIGAppConfigured()) {
      try {
        const token = await getIGAppAccessToken();
        results.igApp = token ? 'مثبتة ✓ (تطبيق Instagram صالح للتوكن)' : 'فشل الوصول للتوكن';
      } catch (e) { results.igApp = 'فشل: ' + (e.message || 'خطأ غير معروف') + ' — تأكد من وضع Live والمفتاح السري'; }
    }
    results.waApp = 'غير مضبوطة';
    if (isWAAppConfigured()) {
      try {
        const token = await getIGAppAccessToken();
        results.waApp = token ? 'مثبتة ✓ (تطبيق WhatsApp صالح للتوكن)' : 'فشل الوصول للتوكن';
      } catch (e) { results.waApp = 'فشل: ' + e.message; }
    }
    res.json(results);
  });

  return router;
}

module.exports = { createRouter, notifyOrder };
