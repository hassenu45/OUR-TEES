// Lightweight cookie-based session middleware for Cloudflare Workers
// No res.end wrapping - just parses session from cookie and provides req.session
// Session cookie is written by the fetch handler after Express finishes

const SESSION_SECRET = (typeof process !== 'undefined' && process.env && process.env.SESSION_SECRET)
  ? process.env.SESSION_SECRET
  : 'azma-secure-secret-key-prod';

function sign(data, secret) {
  try {
    const { createHmac } = require('crypto');
    return createHmac('sha256', secret).update(data).digest('hex').slice(0, 32);
  } catch (e) {
    let hash = 0;
    const str = secret + data;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(function(c) {
    const eqIdx = c.indexOf('=');
    if (eqIdx > 0) {
      cookies[c.substring(0, eqIdx).trim()] = decodeURIComponent(c.substring(eqIdx + 1).trim());
    }
  });
  return cookies;
}

// Store: reqId → { session, secret, maxAge }
const pendingSessions = new Map();
let requestCounter = 0;

function workerSession(opts) {
  opts = opts || {};
  const secret = opts.secret || SESSION_SECRET;
  const maxAge = (opts.cookie && opts.cookie.maxAge) ? opts.cookie.maxAge : 86400000;

  function sessionMiddleware(req, res, next) {
    try {
      var session = {};

      var raw = (parseCookies(req.headers.cookie || '') || {})['azma.sid'];
      if (raw) {
        try {
          var dotIdx = raw.indexOf('.');
          if (dotIdx > 0) {
            var payload = raw.substring(0, dotIdx);
            var sig = raw.substring(dotIdx + 1);
            if (sign(payload, secret) === sig) {
              session = JSON.parse(Buffer.from(payload, 'base64').toString());
            }
          }
        } catch (_e) { /* invalid session */ }
      }

      req.session = session;

      // Add destroy() and save() methods expected by express-session callers
      req.session.destroy = function(cb) {
        var info = pendingSessions.get(req.__sid);
        if (info) info.session = {};
        req.session = {};
        if (cb) cb(null);
      };
      req.session.save = function(cb) {
        if (cb) cb(null);
      };

      // Store session for fetch handler
      const reqId = 's' + (++requestCounter);
      req.__sid = reqId;
      pendingSessions.set(reqId, { session: session, secret: secret, maxAge: maxAge });
      // Also store on globalThis so the fetch handler can find it
      globalThis.__lastSessionId = reqId;
      setTimeout(function() { pendingSessions.delete(reqId); }, 30000);

      next();
    } catch (e) {
      console.error('[worker-session] error:', e.message);
      req.session = {};
      next();
    }
  }

  return sessionMiddleware;
}

// Generate cookie string from session data
workerSession.serialize = function(reqId) {
  var info = pendingSessions.get(reqId);
  if (!info) return null;
  pendingSessions.delete(reqId);
  try {
    var payload = Buffer.from(JSON.stringify(info.session)).toString('base64');
    var sig = sign(payload, info.secret);
    var val = payload + '.' + sig;
    return 'azma.sid=' + encodeURIComponent(val) + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + Math.floor(info.maxAge / 1000);
  } catch (_e) {
    return null;
  }
};

module.exports = workerSession;
module.exports.workerSession = workerSession;
