// Database Access Layer — Cloudflare KV (Workers) or file-based (local dev)
// In Workers: all data stored in KV via globalThis.__cfEnv.KV
// Locally: all data stored in JSON files under ./data/

const fs = require('fs');
const path = require('path');

var _BASE_DIR;
try {
    _BASE_DIR = typeof __dirname !== 'undefined' ? __dirname : globalThis.__dirname || '';
} catch (e) {
    _BASE_DIR = '';
}
const DATA_DIR = path.join(_BASE_DIR, 'data');

function isWorkers() {
  return !!(globalThis.__cfEnv && globalThis.__cfEnv.KV);
}

function kv() {
  return globalThis.__cfEnv ? globalThis.__cfEnv.KV : null;
}

// ── Async helpers ──

async function readKVOrFile(key, fallback) {
  const k = kv();
  if (k) {
    const val = await k.get(key, { type: 'json' });
    return val !== null ? val : fallback;
  }
  // Local fallback
  const filePath = path.join(DATA_DIR, key + '.json');
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      return data ? JSON.parse(data) : fallback;
    }
  } catch (e) { /* corrupted */ }
  return fallback;
}

async function writeKVOrFile(key, value) {
  const k = kv();
  if (k) {
    await k.put(key, JSON.stringify(value), { expirationTtl: undefined });
    return;
  }
  // Local fallback
  const filePath = path.join(DATA_DIR, key + '.json');
  const tmp = filePath + '.tmp';
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (e) { /* best effort */ }
}

// ── Settings ──
let settingsCache = null;

async function getSettings() {
  if (settingsCache) return settingsCache;
  const raw = await readKVOrFile('settings', {});
  settingsCache = { id: 1, ...raw };
  if (!settingsCache.id) settingsCache.id = 1;
  return settingsCache;
}

async function updateSettings(data) {
  const current = await getSettings();
  const updated = { ...current, ...data, updatedAt: new Date().toISOString() };
  await writeKVOrFile('settings', updated);
  settingsCache = updated;
  return updated;
}

// ── Products ──
async function getProducts() {
  const data = await readKVOrFile('products', { products: [] });
  return data.products || [];
}

async function getProduct(id) {
  const products = await getProducts();
  return products.find(p => p.id === id) || null;
}

async function createProduct(data) {
  const products = await getProducts();
  const newProduct = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  products.push(newProduct);
  await writeKVOrFile('products', { products });
  return newProduct;
}

async function updateProduct(id, data) {
  const products = await getProducts();
  const index = products.findIndex(p => p.id === id);
  if (index === -1) throw new Error('Product not found');
  products[index] = { ...products[index], ...data, updatedAt: new Date().toISOString() };
  await writeKVOrFile('products', { products });
  return products[index];
}

async function deleteProduct(id) {
  const products = await getProducts();
  const newProducts = products.filter(p => p.id !== id);
  await writeKVOrFile('products', { products: newProducts });
  return { success: true };
}

// ── Orders ──
async function getOrders() {
  const data = await readKVOrFile('orders', { orders: [] });
  return data.orders || [];
}

async function createOrder(data) {
  const orders = await getOrders();
  const newOrder = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    ...data,
    status: data.status || 'new',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  orders.push(newOrder);
  await writeKVOrFile('orders', { orders });
  return newOrder;
}

async function updateOrderStatus(id, status) {
  const orders = await getOrders();
  const index = orders.findIndex(o => o.id === id);
  if (index === -1) throw new Error('Order not found');
  orders[index].status = status;
  orders[index].updatedAt = new Date().toISOString();
  await writeKVOrFile('orders', { orders });
  return orders[index];
}

async function deleteOrder(id) {
  const orders = await getOrders();
  const newOrders = orders.filter(o => o.id !== id);
  await writeKVOrFile('orders', { orders: newOrders });
  return { success: true };
}

// ── Customers ──
async function getCustomers() {
  const data = await readKVOrFile('customers', { customers: [] });
  return data.customers || [];
}

async function upsertCustomer(data) {
  const customers = await getCustomers();
  const phone = data.phone;
  const index = customers.findIndex(c => c.phone === phone);

  const now = new Date().toISOString();
  const customerData = {
    phone: phone,
    name: data.name,
    email: data.email || '',
    city: data.city || '',
    area: data.area || '',
    street: data.street || '',
    landmark: data.landmark || '',
    notes: data.notes || '',
    totalOrders: (index >= 0 ? customers[index].totalOrders : 0) + 1,
    lastOrderAt: now,
    createdAt: index >= 0 ? customers[index].createdAt : now,
    updatedAt: now
  };

  if (index >= 0) {
    customers[index] = customerData;
  } else {
    customers.push(customerData);
  }

  await writeKVOrFile('customers', { customers });
  return customerData;
}

async function getCustomerByPhone(phone) {
  const customers = await getCustomers();
  return customers.find(c => c.phone === phone) || null;
}

async function getOrdersByPhone(phone) {
  const orders = await getOrders();
  return orders.filter(o => o.phone === phone);
}

async function getOrderById(id) {
  const orders = await getOrders();
  return orders.find(o => o.id === id) || null;
}

// ── Campaign recipients ──
async function getCampaignEmails(targetGroup) {
  const customers = await getCustomers();
  const seen = new Set();
  const emails = [];
  for (const c of customers) {
    const e = String(c.email || '').trim().toLowerCase();
    if (e && !seen.has(e)) {
      seen.add(e);
      emails.push(e);
    }
  }
  return emails;
}

// ── Integration Settings (WhatsApp + Instagram) ──
async function getIntegrationSettings() {
  const data = await readKVOrFile('integration-settings', {});
  return data.integrationSettings || {
    id: 1,
    waEnabled: true,
    waPhoneId: '',
    waToken: '',
    waTemplate: '',
    waReplyEnabled: true,
    igEnabled: true,
    igUserId: '',
    igToken: '',
    igCommentReply: true,
    igDmReply: true,
    webhookSecret: ''
  };
}

async function updateIntegrationSettings(data) {
  let settings = await getIntegrationSettings();
  const updated = { ...settings, ...data, updatedAt: new Date().toISOString() };
  await writeKVOrFile('integration-settings', { integrationSettings: updated });
  return updated;
}

// ── Conversations (channel bot chat history) ──
async function getConversations(channel) {
  const data = await readKVOrFile('conversations', { conversations: {} });
  if (channel) return data.conversations[channel] || [];
  return data.conversations || {};
}

async function getConversation(channel, externalId) {
  const conversations = await getConversations(channel);
  return conversations.find(c => c.externalId === externalId) || null;
}

async function appendConversationMessage(channel, externalId, sender, text, name = '') {
  let conversations = await getConversations();
  let channelConvs = conversations[channel] || [];
  let conv = channelConvs.find(c => c.externalId === externalId);
  let history = conv && conv.history ? JSON.parse(conv.history) : [];

  if (history.length > 40) history = history.slice(-40);
  history.push({ sender, text, at: new Date().toISOString() });

  if (conv) {
    conv.history = JSON.stringify(history);
    conv.lastActivity = new Date().toISOString();
    if (name) conv.name = name;
  } else {
    conv = {
      channel,
      externalId,
      name,
      history: JSON.stringify(history),
      lastActivity: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    channelConvs = [...channelConvs, conv];
  }

  conversations[channel] = channelConvs;
  await writeKVOrFile('conversations', { conversations });

  return conv;
}

async function clearConversation(id) {
  const [channel, externalId] = id.split(':');
  let conversations = await getConversations();
  let channelConvs = conversations[channel] || [];
  channelConvs = channelConvs.filter(c => c.externalId !== externalId);
  conversations[channel] = channelConvs;
  await writeKVOrFile('conversations', { conversations });
  return { success: true };
}

// ── Statistics (for Telegram bot) ──
async function getStats() {
  const products = await getProducts();
  const orders = await getOrders();
  const customers = await getCustomers();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const todayOrders = orders.filter(o => new Date(o.createdAt) >= todayStart).length;
  const todayRevenue = orders.filter(o => new Date(o.createdAt) >= todayStart)
    .reduce((sum, o) => sum + (parseFloat(o.productPrice) || 0), 0);

  const weekOrders = orders.filter(o => new Date(o.createdAt) >= weekAgo).length;
  const weekRevenue = orders.filter(o => new Date(o.createdAt) >= weekAgo)
    .reduce((sum, o) => sum + (parseFloat(o.productPrice) || 0), 0);

  const monthOrders = orders.filter(o => new Date(o.createdAt) >= monthAgo).length;
  const monthRevenue = orders.filter(o => new Date(o.createdAt) >= monthAgo)
    .reduce((sum, o) => sum + (parseFloat(o.productPrice) || 0), 0);

  const productCounts = {};
  products.forEach(p => {
    productCounts[p.id] = (productCounts[p.id] || 0) + 1;
  });
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([productId, count]) => ({
      productId,
      productName: products.find(p => p.id === productId)?.name || 'Unknown',
      count,
      revenue: 0
    }));

  const recentOrders = orders
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
    .map(o => ({
      id: o.id,
      productName: o.productName,
      size: o.size,
      customerName: o.customerName,
      phone: o.phone,
      productPrice: o.productPrice,
      status: o.status,
      createdAt: o.createdAt
    }));

  return {
    totalUsers: customers.length,
    totalOrders: orders.length,
    totalRevenue: orders.reduce((sum, o) => sum + (parseFloat(o.productPrice) || 0), 0),
    todayOrders,
    todayRevenue,
    weekOrders,
    weekRevenue,
    monthOrders,
    monthRevenue,
    topProducts,
    recentOrders
  };
}

// ── Verified phones ──
// In Workers: store as KV key. Locally: file-based.
// The verifiedPhones Set is kept in memory for fast synchronous access
// in the OTP verification routes. In Workers it's reloaded from KV
// on each cold start (acceptable since phone verification is rare).

let verifiedPhones = new Set();

async function loadVerifiedPhones() {
  if (isWorkers()) {
    const k = kv();
    const arr = await k.get('verified-phones', { type: 'json' });
    verifiedPhones = new Set(arr || []);
  } else {
    const filePath = path.join(DATA_DIR, 'verified-phones.json');
    try {
      if (fs.existsSync(filePath)) {
        verifiedPhones = new Set(JSON.parse(fs.readFileSync(filePath, 'utf8')));
      }
    } catch (e) { /* corrupted */ }
  }
}

async function saveVerifiedPhones(set) {
  if (isWorkers()) {
    const k = kv();
    await k.put('verified-phones', JSON.stringify([...set]), { expirationTtl: undefined });
  } else {
    const filePath = path.join(DATA_DIR, 'verified-phones.json');
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify([...set]), 'utf8');
    } catch (e) { /* best effort */ }
  }
}

// Initialize on load (async but happens fast)
loadVerifiedPhones().catch(() => {});

// ── Exports ──
module.exports = {
  getSettings,
  updateSettings,
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getOrders,
  createOrder,
  updateOrderStatus,
  deleteOrder,
  getCustomers,
  upsertCustomer,
  getCustomerByPhone,
  getOrdersByPhone,
  getOrderById,
  getCampaignEmails,
  getIntegrationSettings,
  updateIntegrationSettings,
  getConversations,
  getConversation,
  appendConversationMessage,
  clearConversation,
  getStats,
  verifiedPhones,
  saveVerifiedPhones,
  loadVerifiedPhones
};
