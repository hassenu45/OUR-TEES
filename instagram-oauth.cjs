// Instagram OAuth helpers — pure logic, fetch injectable for tests
const crypto = require('crypto');

const GRAPH = 'https://graph.facebook.com/v21.0';
const OAUTH_DIALOG = 'https://www.facebook.com/v21.0/dialog/oauth';
const SCOPES = 'instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list';

function buildOAuthUrl({ appId, redirectUri, state }) {
  const qs = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
    response_type: 'code',
  });
  return OAUTH_DIALOG + '?' + qs;
}

function verifyOAuthState(actual, expected) {
  if (!actual || !expected) return false;
  const a = Buffer.from(String(actual));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getCallbackUrl(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  return proto + '://' + req.get('host') + '/api/integrations/instagram/callback';
}

async function graphGet(path, params, fetchImpl = fetch) {
  const qs = new URLSearchParams(params);
  const res = await fetchImpl(GRAPH + path + '?' + qs);
  const j = await res.json();
  if (!res.ok || !j || j.error) {
    throw new Error(metaErrorMessage(j || {}));
  }
  return j;
}

async function exchangeCode({ code, appId, appSecret, redirectUri }, fetchImpl = fetch) {
  return graphGet('/oauth/access_token', { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }, fetchImpl);
}

async function exchangeForLongToken({ shortToken, appId, appSecret }, fetchImpl = fetch) {
  return graphGet('/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken }, fetchImpl);
}

async function findIgBusinessAccount(accessToken, fetchImpl = fetch) {
  const j = await graphGet('/me/accounts', { fields: 'id,name,instagram_business_account{id,username}', access_token: accessToken }, fetchImpl);
  const pages = j.data || [];
  for (const page of pages) {
    if (page.instagram_business_account && page.instagram_business_account.id) {
      return { id: String(page.instagram_business_account.id), username: page.instagram_business_account.username || '' };
    }
  }
  return null;
}

async function subscribeIgWebhook(igUserId, accessToken, fetchImpl = fetch) {
  const qs = new URLSearchParams({ access_token: accessToken });
  const res = await fetchImpl(GRAPH + '/' + igUserId + '/subscribed_apps?' + qs, { method: 'POST' });
  const j = await res.json();
  return !!(res.ok && j && !j.error);
}

function metaErrorMessage(j) {
  const err = (j && j.error) || {};
  if (err.code === 101) {
    return 'فشل التحقق من التطبيق — تأكد أن التطبيق في وضع Live وليس Development، وأن المفتاح السري (App Secret) صحيح من developers.facebook.com';
  }
  if (err.code === 190) {
    return 'التوكن غير صالح أو منتهي الصلاحية — أعد الاتصال من زر "اتصال بالانستقرام"';
  }
  if (err.code === 200) {
    return 'أذونات غير كافية — وافق على كل الأذونات المطلوبة عند الاتصال';
  }
  return (err.message && String(err.message)) || 'خطأ غير معروف من Meta';
}

module.exports = {
  buildOAuthUrl,
  verifyOAuthState,
  getCallbackUrl,
  exchangeCode,
  exchangeForLongToken,
  findIgBusinessAccount,
  subscribeIgWebhook,
  metaErrorMessage,
};
