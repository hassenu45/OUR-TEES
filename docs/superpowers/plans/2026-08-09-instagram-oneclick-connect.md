# Instagram One-Click Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click "Connect Instagram" OAuth flow (button in admin panel → Facebook login → auto-save long-lived token + IG business account ID permanently in DB) and improve error messages when Meta rejects the app credentials.

**Architecture:** A new pure module `instagram-oauth.cjs` holds all OAuth/Graph-API logic as injectable-fetch functions (testable without network). `integrations.cjs` gets two new routes (`GET /api/integrations/instagram/connect` and `GET /api/integrations/instagram/callback`) that orchestrate the flow with `express-session` for CSRF state. Admin UI (`admin.html` + `js/admin.js`) gets a connect button and success/error feedback via query params.

**Tech Stack:** Node ≥22, Express 4, express-session (already configured in server.js:130-137), Vitest (globals:true, `tests/**/*.test.js`), global `fetch` (Node 22).

## Global Constraints

- Node >= 22.12.0; use global `fetch`, no new npm dependencies.
- Graph API base: `https://graph.facebook.com/v21.0` (matches `GRAPH` in integrations.cjs:7).
- All user-facing strings in Arabic (RTL), code comments may stay Arabic as in existing files.
- `redirect_uri` must be built from `req.protocol + req.get('host')` honoring `X-Forwarded-Proto` (deployed behind Railway proxy → https).
- OAuth scopes (exact string): `instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list`.
- App credentials stay where they are: `IG_APP_ID` / `IG_APP_SECRET` constants in integrations.cjs:13-14 (hardcoded fallback + env override). No secrets in tests.
- Follow existing style: `.cjs` CommonJS, `require`, no semicolon-less code; prettier config applies.
- ESLint rules for server files: `no-unused-vars` warn with `argsIgnorePattern: '^_'`; `fetch`/`URLSearchParams` are declared globals.
- Do NOT touch the DB schema (all needed fields exist in IntegrationSettings).
- Verify after each task: `npm test` and `npm run lint`.

---

### Task 1: Pure OAuth helper module `instagram-oauth.cjs`

**Files:**
- Create: `instagram-oauth.cjs`
- Test: `tests/instagram-oauth.test.js`

**Interfaces:**
- Produces (used by Task 2):
  - `buildOAuthUrl({ appId, redirectUri, state }) → string` — Facebook dialog URL with scopes above
  - `verifyOAuthState(actual, expected) → boolean` — timing-safe-ish equality, rejects empty/undefined
  - `getCallbackUrl(req) → string` — `req.protocol` (with `X-Forwarded-Proto` override) + host + `/api/integrations/instagram/callback`
  - `exchangeCode({ code, appId, appSecret, redirectUri }, fetchImpl) → Promise<{ access_token }>` — short-lived token
  - `exchangeForLongToken({ shortToken, appId, appSecret }, fetchImpl) → Promise<{ access_token }>` — 60-day token
  - `findIgBusinessAccount(accessToken, fetchImpl) → Promise<{ id, username } | null>` — via `/me/accounts`
  - `subscribeIgWebhook(igUserId, accessToken, fetchImpl) → Promise<boolean>` — POST `/subscribed_apps`
  - `metaErrorMessage(errorJson) → string` — Arabic message for known error codes (101 → dev-mode hint), else generic

- [ ] **Step 1: Write the failing test**

Create `tests/instagram-oauth.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  buildOAuthUrl,
  verifyOAuthState,
  getCallbackUrl,
  exchangeCode,
  exchangeForLongToken,
  findIgBusinessAccount,
  subscribeIgWebhook,
  metaErrorMessage,
} from '../instagram-oauth.cjs';

function fakeFetch(responder) {
  return async (url) => ({
    ok: true,
    status: 200,
    json: async () => (typeof responder === 'function' ? responder(String(url)) : responder),
  });
}

function fakeFetchError(payload, status = 400) {
  return async () => ({ ok: false, status, json: async () => payload });
}

describe('instagram-oauth helpers', () => {
  it('buildOAuthUrl includes app id, redirect, state and scopes', () => {
    const url = buildOAuthUrl({ appId: '123', redirectUri: 'https://x.com/cb', state: 's1' });
    expect(url).toContain('https://www.facebook.com/v21.0/dialog/oauth');
    expect(url).toContain('client_id=123');
    expect(url).toContain('redirect_uri=' + encodeURIComponent('https://x.com/cb'));
    expect(url).toContain('state=s1');
    expect(url).toContain('scope=' + encodeURIComponent('instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list'));
  });

  it('verifyOAuthState accepts exact match and rejects mismatches', () => {
    expect(verifyOAuthState('abc', 'abc')).toBe(true);
    expect(verifyOAuthState('abc', 'abd')).toBe(false);
    expect(verifyOAuthState('', 'abc')).toBe(false);
    expect(verifyOAuthState('abc', undefined)).toBe(false);
    expect(verifyOAuthState(undefined, undefined)).toBe(false);
  });

  it('getCallbackUrl honors X-Forwarded-Proto', () => {
    const req = { protocol: 'http', get: (h) => (h === 'x-forwarded-proto' ? 'https' : 'azma.com') };
    expect(getCallbackUrl(req)).toBe('https://azma.com/api/integrations/instagram/callback');
    const req2 = { protocol: 'http', get: (h) => (h === 'x-forwarded-proto' ? undefined : 'azma.com') };
    expect(getCallbackUrl(req2)).toBe('http://azma.com/api/integrations/instagram/callback');
  });

  it('exchangeCode returns access_token on success', async () => {
    const token = await exchangeCode(
      { code: 'CODE', appId: 'a', appSecret: 'b', redirectUri: 'https://x.com/cb' },
      fakeFetch({ access_token: 'short-token', token_type: 'bearer' })
    );
    expect(token.access_token).toBe('short-token');
  });

  it('exchangeCode throws Arabic message on Meta error 101', async () => {
    await expect(
      exchangeCode({ code: 'x', appId: 'a', appSecret: 'b', redirectUri: 'u' }, fakeFetchError({ error: { code: 101, message: 'Cannot get application info' } }))
    ).rejects.toThrow(/Development|المفتاح السري/);
  });

  it('exchangeForLongToken uses fb_exchange_token grant', async () => {
    let called = '';
    const token = await exchangeForLongToken(
      { shortToken: 'short', appId: 'a', appSecret: 'b' },
      fakeFetch((url) => { called = url; return { access_token: 'long-token' }; })
    );
    expect(token.access_token).toBe('long-token');
    expect(called).toContain('grant_type=fb_exchange_token');
    expect(called).toContain('fb_exchange_token=short');
  });

  it('findIgBusinessAccount returns first account with instagram business id', async () => {
    const acc = await findIgBusinessAccount('tok', fakeFetch({
      data: [
        { id: 'page1', name: 'A' },
        { id: 'page2', name: 'B', instagram_business_account: { id: '1784140001', username: 'azma.ig' } },
      ],
    }));
    expect(acc).toEqual({ id: '1784140001', username: 'azma.ig' });
  });

  it('findIgBusinessAccount returns null when none linked', async () => {
    const acc = await findIgBusinessAccount('tok', fakeFetch({ data: [{ id: 'page1' }] }));
    expect(acc).toBeNull();
  });

  it('subscribeIgWebhook returns true on success', async () => {
    expect(await subscribeIgWebhook('1784140001', 'tok', fakeFetch({ success: true }))).toBe(true);
  });

  it('metaErrorMessage maps code 101 to Arabic hint', () => {
    expect(metaErrorMessage({ error: { code: 101, message: 'x' } })).toContain('Live');
    expect(metaErrorMessage({ error: { code: 999, message: 'boom' } })).toContain('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/instagram-oauth.test.js`
Expected: FAIL — `Cannot find module '../instagram-oauth.cjs'`

- [ ] **Step 3: Write minimal implementation**

Create `instagram-oauth.cjs`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/instagram-oauth.test.js`
Expected: PASS (all 11 tests)

- [ ] **Step 5: Run full suite + lint**

Run: `npm test` then `npm run lint`
Expected: all existing tests pass; eslint clean or only pre-existing warnings

- [ ] **Step 6: Commit**

```bash
git add instagram-oauth.cjs tests/instagram-oauth.test.js
git commit -m "feat(integrations): pure Instagram OAuth helpers with tests"
```

---

### Task 2: Wire OAuth routes into `integrations.cjs`

**Files:**
- Modify: `integrations.cjs` (top imports + inside `createRouter`)
- Test: `tests/instagram-oauth.test.js` (extend — no new file)

**Interfaces:**
- Consumes: all exports of `instagram-oauth.cjs` from Task 1, `IG_APP_ID`/`IG_APP_SECRET` (already at integrations.cjs:13-14), `db.updateIntegrationSettings` (db.cjs:189)
- Produces: `GET /api/integrations/instagram/connect` (redirect to Facebook), `GET /api/integrations/instagram/callback` (full exchange, saves settings, redirects to `/admin.html?ig=connected|error&reason=`)

- [ ] **Step 1: Write the failing test**

Append to `tests/instagram-oauth.test.js`:

```js
import { createRouter } from '../integrations.cjs';

function makeReqRes() {
  const session = {};
  const req = { session, query: {}, protocol: 'http', get: (h) => (h === 'host' ? 'azma.com' : undefined) };
  let redirected = null;
  const res = { redirect: (u) => { redirected = u; }, status: () => res, sendStatus: () => res };
  return { req, res, getRedirect: () => redirected };
}
```

Add inside the same describe (or a new `describe('instagram connect routes', ...)`):

```js
  it('connect route redirects to Facebook dialog with state in session', async () => {
    const router = createRouter(() => {});
    let hit;
    for (const layer of router.stack) {
      if (layer.route && layer.route.path === '/instagram/connect') hit = layer.route.stack[0].handle;
    }
    expect(hit).toBeDefined();
    const { req, res, getRedirect } = makeReqRes();
    hit(req, res);
    expect(getRedirect()).toContain('https://www.facebook.com/v21.0/dialog/oauth');
    expect(req.session.igOAuthState).toBeTruthy();
  });

  it('callback with wrong state redirects to admin error', async () => {
    const router = createRouter(() => {});
    let hit;
    for (const layer of router.stack) {
      if (layer.route && layer.route.path === '/instagram/callback') hit = layer.route.stack[0].handle;
    }
    const { req, res, getRedirect } = makeReqRes();
    req.session.igOAuthState = 'expected-state';
    req.query = { state: 'wrong-state', code: 'CODE' };
    await hit(req, res);
    expect(getRedirect()).toContain('/admin.html?ig=error');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/instagram-oauth.test.js`
Expected: FAIL — import of `integrations.cjs` works (it requires only express/crypto/db/ai), but the routes do not exist yet → `hit` is undefined → test fails on `expect(hit).toBeDefined()`

- [ ] **Step 3: Write minimal implementation**

In `integrations.cjs`, at the top add:

```js
const oauth = require('./instagram-oauth.cjs');
```

Inside `createRouter`, after the existing `router.post('/instagram/webhook', ...)` block (around line 366), add:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/instagram-oauth.test.js`
Expected: PASS (both new route tests pass)

- [ ] **Step 5: Verify server boots and endpoint responds**

Run: `node -e "require('./server.js')"` briefly OR start server, then:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "http://localhost:3000/api/integrations/instagram/connect"
```

Expected: `302` with redirect to `https://www.facebook.com/v21.0/dialog/oauth...` (session cookie present; if curl lacks cookie jar the redirect still happens since route sets state then redirects — the callback validation is what needs the cookie).

- [ ] **Step 6: Run full suite + lint + typecheck**

Run: `npm test` then `npm run lint` then `npm run typecheck`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add integrations.cjs tests/instagram-oauth.test.js
git commit -m "feat(integrations): Instagram one-click connect OAuth routes"
```

---

### Task 3: Admin panel connect button + feedback

**Files:**
- Modify: `admin.html` (Instagram card in integrations panel, around line 1195-1216)
- Modify: `js/admin.js` (loadIntegrations + a connect handler + query-param toast)
- Test: none (UI), verify via `npm run lint`

**Interfaces:**
- Consumes: routes from Task 2; `/api/integrations/status` shape `st.ig` = `{ configured, enabled, commentReply, dmReply, userId }`
- Produces: button `#ig-connect-btn` calling `connectInstagram()`; toast on `?ig=connected|error` after redirect

- [ ] **Step 1: Read the current Instagram card in admin.html**

Read `admin.html` lines 1190-1225 and locate the exact block with the `integrations-igapp-holder` div to place the button above the form fields.

- [ ] **Step 2: Add the connect button + status text**

In `admin.html`, inside the Instagram card, immediately before the `igEnabled` form row (line ~1195), add:

```html
<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
  <button type="button" class="btn btn-primary" id="ig-connect-btn" onclick="connectInstagram()">📸 اتصال بالانستقرام</button>
  <span id="ig-connect-status" style="font-size:12px;opacity:.85;">اتصال واحد فقط — يفتح صفحة فيسبوك/انستقرام لتسجيل الدخول</span>
</div>
```

Verify the button markup matches admin panel conventions (check another `btn btn-primary` usage in admin.html for class names).

- [ ] **Step 3: Add JS handler**

In `js/admin.js`, add:

```js
function connectInstagram() {
  const btn = $('ig-connect-btn');
  const status = $('ig-connect-status');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ فتح صفحة التسجيل...'; }
  if (status) status.textContent = 'إذا لم تفتح الصفحة، اسمح بالنوافذ المنبثقة ثم أعد المحاولة.';
  window.location.href = '/api/integrations/instagram/connect';
}
```

In `loadIntegrations()` (js/admin.js ~line 417), after the `ig` badges are set (~line 461), add:

```js
    const igC = $('ig-connect-status');
    if (igC) igC.textContent = st.ig && st.ig.configured
      ? ('✅ متصل — الحساب: ' + (st.ig.userId || '') + ' (التوكن محفوظ بشكل دائم)')
      : 'اتصال واحد فقط — يفتح صفحة فيسبوك/انستقرام لتسجيل الدخول';
```

- [ ] **Step 4: Show toast on redirect-back**

In `js/admin.js`, in the page-init section (find where `loadIntegrations()` is first called, ~line 587), add after the init call:

```js
  const params = new URLSearchParams(location.search);
  if (params.get('ig') === 'connected') {
    showToast('✅ تم الاتصال بالانستقرام — التوكن محفوظ بشكل دائم');
    history.replaceState(null, '', location.pathname);
  } else if (params.get('ig') === 'error') {
    showToast('❌ فشل الاتصال: ' + (params.get('reason') || 'خطأ غير معروف'), true);
    history.replaceState(null, '', location.pathname);
  }
```

- [ ] **Step 5: Verify no lint errors**

Run: `npm run lint`
Expected: clean for `js/admin.js` (admin.html is not linted)

- [ ] **Step 6: Manual browser check (optional)**

Open admin panel → integrations panel → button visible, clicking navigates to `/api/integrations/instagram/connect`.

- [ ] **Step 7: Commit**

```bash
git add admin.html js/admin.js
git commit -m "feat(admin): Instagram one-click connect button + feedback"
```

---

### Task 4: Improve `/api/integrations/test` error for invalid app credentials

**Files:**
- Modify: `integrations.cjs` (the `/test` route, ~line 457-463)
- Test: extend `tests/instagram-oauth.test.js` with `metaErrorMessage` coverage (already covers 101 → Live hint)

**Interfaces:**
- Consumes: `getIGAppAccessToken()` (integrations.cjs:20-32)
- Produces: better Arabic message in `/test` response `results.igApp`

- [ ] **Step 1: Write the failing test (behavior spec)**

Append to `tests/instagram-oauth.test.js`:

```js
  it('metaErrorMessage covers 101, 190, 200 for /test route reporting', () => {
    expect(metaErrorMessage({ error: { code: 190, message: 'Invalid OAuth access token' } })).toContain('التوكن');
    expect(metaErrorMessage({ error: { code: 200, message: 'Permissions error' } })).toContain('الأذونات');
  });
```

Run `npx vitest run tests/instagram-oauth.test.js` — expected FAIL (messages not mapped yet).

- [ ] **Step 2: Extend metaErrorMessage**

In `instagram-oauth.cjs`, replace `metaErrorMessage` with:

```js
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
```

Run `npx vitest run tests/instagram-oauth.test.js` — expected PASS.

- [ ] **Step 3: Use it in the /test route**

In `integrations.cjs`, in the `/test` route, replace the `igApp` block (lines ~457-463):

```js
    results.igApp = 'غير مضبوطة';
    if (isIGAppConfigured()) {
      try {
        const token = await getIGAppAccessToken();
        results.igApp = token ? 'مثبتة ✓ (تطبيق Instagram صالح للتوكن)' : 'فشل الوصول للتوكن';
      } catch (e) { results.igApp = 'فشل: ' + e.message; }
    }
```

with:

```js
    results.igApp = 'غير مضبوطة';
    if (isIGAppConfigured()) {
      try {
        const token = await getIGAppAccessToken();
        results.igApp = token ? 'مثبتة ✓ (تطبيق Instagram صالح للتوكن)' : 'فشل الوصول للتوكن';
      } catch (e) {
        results.igApp = 'فشل: ' + (e.message || 'خطأ غير معروف') + ' — تأكد من وضع Live والمفتاح السري';
      }
    }
```

(Keep it simple: `getIGAppAccessToken` already throws the message from `metaErrorMessage`-styled output via `j.error.message`; the added suffix guides the user.)

- [ ] **Step 4: Run full suite + lint**

Run: `npm test` then `npm run lint`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add instagram-oauth.cjs integrations.cjs tests/instagram-oauth.test.js
git commit -m "feat(integrations): clearer Meta error messages in test route"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint` then `npm run typecheck`
Expected: clean (no new errors)

- [ ] **Step 3: Server smoke test**

Run: `node -e "const s=require('./server.js')"` with a timeout, or start server and hit `GET /api/integrations/status`
Expected: server boots; status shows `igApp.configured: true` (credentials hardcoded)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: final verification for instagram one-click connect"
```
