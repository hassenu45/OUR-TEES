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
import { createRouter } from '../integrations.cjs';

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
    expect(url).toContain(
      'scope=' +
        encodeURIComponent('instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list')
    );
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
      exchangeCode(
        { code: 'x', appId: 'a', appSecret: 'b', redirectUri: 'u' },
        fakeFetchError({ error: { code: 101, message: 'Cannot get application info' } })
      )
    ).rejects.toThrow(/Development|المفتاح السري/);
  });

  it('exchangeForLongToken uses fb_exchange_token grant', async () => {
    let called = '';
    const token = await exchangeForLongToken(
      { shortToken: 'short', appId: 'a', appSecret: 'b' },
      fakeFetch((url) => {
        called = url;
        return { access_token: 'long-token' };
      })
    );
    expect(token.access_token).toBe('long-token');
    expect(called).toContain('grant_type=fb_exchange_token');
    expect(called).toContain('fb_exchange_token=short');
  });

  it('findIgBusinessAccount returns first account with instagram business id', async () => {
    const acc = await findIgBusinessAccount(
      'tok',
      fakeFetch({
        data: [
          { id: 'page1', name: 'A' },
          { id: 'page2', name: 'B', instagram_business_account: { id: '1784140001', username: 'azma.ig' } },
        ],
      })
    );
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

  it('metaErrorMessage covers 190 and 200 for /test route reporting', () => {
    expect(metaErrorMessage({ error: { code: 190, message: 'Invalid OAuth access token' } })).toContain('التوكن');
    expect(metaErrorMessage({ error: { code: 200, message: 'Permissions error' } })).toContain('الأذونات');
  });
});

function makeReqRes() {
  const session = {};
  const req = { session, query: {}, protocol: 'http', get: (h) => (h === 'host' ? 'azma.com' : undefined) };
  let redirected = null;
  const res = {
    redirect: (u) => {
      redirected = u;
    },
    status: () => res,
    sendStatus: () => res,
  };
  return { req, res, getRedirect: () => redirected };
}

function findRouteHandler(router, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path) return layer.route.stack[0].handle;
  }
  return null;
}

describe('instagram connect routes', () => {
  it('connect route redirects to Facebook dialog with state in session', async () => {
    const router = createRouter(() => {});
    const hit = findRouteHandler(router, '/instagram/connect');
    expect(hit).toBeDefined();
    const { req, res, getRedirect } = makeReqRes();
    hit(req, res);
    expect(getRedirect()).toContain('https://www.facebook.com/v21.0/dialog/oauth');
    expect(req.session.igOAuthState).toBeTruthy();
  });

  it('callback with wrong state redirects to admin error', async () => {
    const router = createRouter(() => {});
    const hit = findRouteHandler(router, '/instagram/callback');
    expect(hit).toBeDefined();
    const { req, res, getRedirect } = makeReqRes();
    req.session.igOAuthState = 'expected-state';
    req.query = { state: 'wrong-state', code: 'CODE' };
    await hit(req, res);
    expect(getRedirect()).toContain('/admin.html?ig=error');
  });
});
