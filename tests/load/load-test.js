import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// ── Custom metrics for the summary table ──
const customErrorRate = new Rate('custom_error_rate');
const rateLimited = new Counter('rate_limited_429');
const loginLatency = new Trend('login_latency_ms');
const browseLatency = new Trend('browse_latency_ms');

export const options = {
  scenarios: {
    // Browsing (the main public flow: home + products + settings + auth check)
    browsing: {
      executor: 'ramping-vus',
      exec: 'browsing',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 },
        { duration: '40s', target: 50 },
        { duration: '20s', target: 100 },
        { duration: '40s', target: 100 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
    // Order placement (writes to DB, rate-limited 15/min per IP)
    orders: {
      executor: 'ramping-vus',
      exec: 'orders',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 10 },
        { duration: '30s', target: 10 },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
    // Login (latency of the password check; 401 expected for bad creds)
    auth: {
      executor: 'constant-vus',
      exec: 'auth',
      vus: 5,
      duration: '20s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<800'],
  },
};

// Fetch real product IDs once, share across all VUs
export function setup() {
  const res = http.get(`${BASE_URL}/api/products`);
  let ids = [];
  try {
    const products = res.json();
    if (Array.isArray(products)) ids = products.map((p) => p && (p.id || p.productId)).filter(Boolean);
  } catch (_) {
    ids = [];
  }
  return { ids: ids.length ? ids : ['p1', 'p2', 'p3'] };
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function browsing(data) {
  const started = Date.now();
  const home = http.get(`${BASE_URL}/`);
  const products = http.get(`${BASE_URL}/api/products`);
  const settings = http.get(`${BASE_URL}/api/settings`);
  const authCheck = http.get(`${BASE_URL}/api/auth/check`);
  const latency = Date.now() - started;
  browseLatency.add(latency);

  const ok = check(
    { home, products, settings, authCheck },
    {
      'home 200': (r) => r.home.status === 200,
      'products 200': (r) => r.products.status === 200,
      'settings 200': (r) => r.settings.status === 200,
      'auth/check 200': (r) => r.authCheck.status === 200,
    }
  );
  if (!ok) customErrorRate.add(1);

  sleep(1 + Math.random());
}

export function orders(data) {
  const ids = data.ids;
  const payload = JSON.stringify({
    productId: rand(ids),
    type: 'Standard',
    size: 'L',
    customerName: 'k6 Load User',
    phone: '0599999999',
    address: 'Ramallah',
    notes: 'load test',
  });
  const res = http.post(`${BASE_URL}/api/orders`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status === 429) {
    rateLimited.add(1);
  } else {
    const ok = check(res, {
      'order accepted (2xx)': (r) => r.status === 200 || r.status === 201,
    });
    if (!ok) customErrorRate.add(1);
  }

  sleep(2 + Math.random() * 2);
}

export function auth() {
  const res = http.post(
    `${BASE_URL}/api/login`,
    JSON.stringify({ password: 'wrong-password-load-test' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  loginLatency.add(res.timings.duration);

  const ok = check(res, {
    'login responds (401 expected)': (r) => r.status === 401,
  });
  if (!ok) customErrorRate.add(1);

  sleep(1);
}
