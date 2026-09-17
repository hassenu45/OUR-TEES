// Database Access Layer — file-based storage (no Prisma, no SQLite)
// All data stored in JSON files under ./data/

const fs = require('fs');
const path = require('path');

// Use __dirname if available (Node.js), otherwise default to 'data' relative to project root
var _BASE_DIR;
try {
    _BASE_DIR = typeof __dirname !== 'undefined' ? __dirname : globalThis.__dirname || '';
} catch (e) {
    _BASE_DIR = '';
}
const DATA_DIR = path.join(_BASE_DIR, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const ADDRESSES_FILE = path.join(DATA_DIR, 'addresses.json');
const VERIFIED_PHONES_FILE = path.join(DATA_DIR, 'verified-phones.json');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');
const INTEGRATION_SETTINGS_FILE = path.join(DATA_DIR, 'integration-settings.json');

// Note: Directory creation is handled by the runtime environment.
// In Cloudflare Workers, assume the data directory exists.

// Helper: read JSON file with fallback
function readJSONFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      return data ? JSON.parse(data) : {};
    }
  } catch (e) {
    /* corrupted file — start empty */
  }
  return {};
}

// Helper: write JSON file atomically
function writeJSONFile(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// ── Settings ──
let settingsCache = null;

function getSettings() {
  if (settingsCache) return settingsCache;
  const raw = readJSONFile(SETTINGS_FILE);
  settingsCache = { id: 1, ...raw };
  if (!settingsCache.id) {
    settingsCache.id = 1;
    writeJSONFile(SETTINGS_FILE, settingsCache);
  }
  return settingsCache;
}

function updateSettings(data) {
  const current = getSettings();
  const updated = { ...current, ...data, updatedAt: new Date().toISOString() };
  writeJSONFile(SETTINGS_FILE, updated);
  settingsCache = updated;
  return updated;
}

// ── Products ──
function getProducts() {
  return readJSONFile(PRODUCTS_FILE).products || [];
}

function getProduct(id) {
  const products = getProducts();
  return products.find(p => p.id === id) || null;
}

function createProduct(data) {
  const products = getProducts();
  const newProduct = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  products.push(newProduct);
  writeJSONFile(PRODUCTS_FILE, { products });
  return newProduct;
}

function updateProduct(id, data) {
  const products = getProducts();
  const index = products.findIndex(p => p.id === id);
  if (index === -1) throw new Error('Product not found');
  products[index] = { ...products[index], ...data, updatedAt: new Date().toISOString() };
  writeJSONFile(PRODUCTS_FILE, { products });
  return products[index];
}

function deleteProduct(id) {
  const products = getProducts();
  const newProducts = products.filter(p => p.id !== id);
  writeJSONFile(PRODUCTS_FILE, { products: newProducts });
  return { success: true };
}

// ── Orders ──
function getOrders() {
  return readJSONFile(ORDERS_FILE).orders || [];
}

function createOrder(data) {
  const orders = getOrders();
  const newOrder = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    ...data,
    status: data.status || 'new',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  orders.push(newOrder);
  writeJSONFile(ORDERS_FILE, { orders });
  return newOrder;
}

function updateOrderStatus(id, status) {
  const orders = getOrders();
  const index = orders.findIndex(o => o.id === id);
  if (index === -1) throw new Error('Order not found');
  orders[index].status = status;
  orders[index].updatedAt = new Date().toISOString();
  writeJSONFile(ORDERS_FILE, { orders });
  return orders[index];
}

function deleteOrder(id) {
  const orders = getOrders();
  const newOrders = orders.filter(o => o.id !== id);
  writeJSONFile(ORDERS_FILE, { orders: newOrders });
  return { success: true };
}

// ── Customers ──
function getCustomers() {
  return readJSONFile(CUSTOMERS_FILE).customers || [];
}

function upsertCustomer(data) {
  const customers = getCustomers();
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

  writeJSONFile(CUSTOMERS_FILE, { customers });
  return customerData;
}

function getCustomerByPhone(phone) {
  const customers = getCustomers();
  return customers.find(c => c.phone === phone) || null;
}

function getOrdersByPhone(phone) {
  const orders = getOrders();
  return orders.filter(o => o.phone === phone);
}

function getOrderById(id) {
  const orders = getOrders();
  return orders.find(o => o.id === id) || null;
}

// ── Campaign recipients ──
function getCampaignEmails(targetGroup) {
  const customers = getCustomers();
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
function getIntegrationSettings() {
  return readJSONFile(INTEGRATION_SETTINGS_FILE).integrationSettings || {
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

function updateIntegrationSettings(data) {
  let settings = getIntegrationSettings();
  const updated = { ...settings, ...data, updatedAt: new Date().toISOString() };
  const fileData = readJSONFile(INTEGRATION_SETTINGS_FILE);
  fileData.integrationSettings = updated;
  writeJSONFile(INTEGRATION_SETTINGS_FILE, fileData);
  return updated;
}

// ── Conversations (channel bot chat history) ──
function getConversations(channel) {
  const data = readJSONFile(CONVERSATIONS_FILE).conversations || {};
  if (channel) return data[channel] || [];
  return data;
}

function getConversation(channel, externalId) {
  const conversations = getConversations(channel);
  return conversations.find(c => c.externalId === externalId) || null;
}

function appendConversationMessage(channel, externalId, sender, text, name = '') {
  let conversations = getConversations(channel);
  let conv = conversations.find(c => c.externalId === externalId);
  let history = conv && conv.history ? JSON.parse(conv.history) : [];

  if (history.length > 40) history = history.slice(-40);
  history.push({ sender, text, at: new Date().toISOString() });

  if (conv) {
    conv.history = JSON.stringify(history);
    conv.lastActivity = new Date().toISOString();
    if (name) conv.name = name;
  } else {
    conversations = [...conversations, {
      channel,
      externalId,
      name,
      history: JSON.stringify(history),
      lastActivity: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }];
  }

  const fileData = readJSONFile(CONVERSATIONS_FILE);
  fileData.conversations = conversations;
  writeJSONFile(CONVERSATIONS_FILE, fileData);

  return conv || { channel, externalId, name, history: [{}], lastActivity: new Date().toISOString() };
}

function clearConversation(id) {
  const [channel, externalId] = id.split(':');
  let conversations = getConversations(channel);
  conversations = conversations.filter(c => c.externalId !== externalId);

  const fileData = readJSONFile(CONVERSATIONS_FILE);
  fileData.conversations = conversations;
  writeJSONFile(CONVERSATIONS_FILE, fileData);
  return { success: true };
}

// ── Statistics (for Telegram bot) ──
function getStats() {
  const products = getProducts();
  const orders = getOrders();
  const customers = getCustomers();

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

  // Top products
  const productCounts = {};
  products.forEach(p => {
    productCounts[p.id] = (productCounts[p.id] || 0) + 1;
  });
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([productId, count]) => ({
      productId,
      productName: productCounts[productId] ? products.find(p => p.id === productId)?.name : 'Unknown',
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

// ── Verified phones (persistent) ──
function loadVerifiedPhones() {
  try {
    if (fs.existsSync(VERIFIED_PHONES_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(VERIFIED_PHONES_FILE, 'utf8')));
    }
  } catch (e) {
    /* corrupted file — start empty */
  }
  return new Set();
}

function saveVerifiedPhones(set) {
  try {
    const dir = path.dirname(VERIFIED_PHONES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(VERIFIED_PHONES_FILE, JSON.stringify([...set]), 'utf8');
  } catch (e) {
    /* best effort — verification still works for this process */
  }
}

const verifiedPhones = loadVerifiedPhones();

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
  saveVerifiedPhones
};