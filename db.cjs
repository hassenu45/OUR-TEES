// Database Access Layer — bridges CJS server.js with Prisma v7 (ESM)
let prisma = null;

async function getPrisma() {
  if (prisma) return prisma;
  const { PrismaClient } = await import('./generated/prisma/client.ts');
  const url = process.env.DATABASE_URL || '';
  if (url.startsWith('postgres')) {
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const adapter = new PrismaPg({ connectionString: url });
    prisma = new PrismaClient({ adapter });
  } else {
    const { PrismaLibSql } = await import('@prisma/adapter-libsql');
    const adapter = new PrismaLibSql({ url: url || 'file:./dev.db' });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

// Parse JSON string fields back to arrays on read
function parseProduct(p) {
  if (!p) return p;
  return {
    ...p,
    images: typeof p.images === 'string' ? JSON.parse(p.images) : p.images,
    types: typeof p.types === 'string' ? JSON.parse(p.types) : p.types,
    sizes: typeof p.sizes === 'string' ? JSON.parse(p.sizes) : p.sizes,
  };
}

function parseSettings(s) {
  if (!s) return s;
  return {
    ...s,
    sizes: typeof s.sizes === 'string' ? s.sizes.split(',').filter(Boolean) : s.sizes,
    types: typeof s.types === 'string' ? s.types.split(',').filter(Boolean) : s.types,
  };
}

// ── Settings ──
async function getSettings() {
  const p = await getPrisma();
  let row = await p.siteSettings.findFirst();
  if (!row) {
    row = await p.siteSettings.create({ data: {} });
  }
  return parseSettings(row);
}

async function updateSettings(data) {
  const p = await getPrisma();
  const current = await p.siteSettings.findFirst();
  const { sizes, types, ...rest } = data;
  const updateData = { ...rest };
  if (sizes) updateData.sizes = Array.isArray(sizes) ? sizes.join(',') : sizes;
  if (types) updateData.types = Array.isArray(types) ? types.join(',') : types;
  const updated = await p.siteSettings.update({
    where: { id: current.id },
    data: updateData,
  });
  return parseSettings(updated);
}

// ── Products ──
async function getProducts() {
  const p = await getPrisma();
  const products = await p.product.findMany({ orderBy: { createdAt: 'desc' } });
  return products.map(parseProduct);
}

async function getProduct(id) {
  const p = await getPrisma();
  return parseProduct(await p.product.findUnique({ where: { id } }));
}

async function createProduct(data) {
  const p = await getPrisma();
  const product = await p.product.create({
    data: {
      name: data.name || 'OUR TEE',
      description: data.description || '',
      price: parseFloat(data.price) || 0,
      image: data.image || '',
      images: JSON.stringify(data.images || []),
      types: JSON.stringify(data.types || []),
      sizes: JSON.stringify(data.sizes || []),
      badge: data.badge || '',
      soldOut: !!data.soldOut,
    },
  });
  return parseProduct(product);
}

async function updateProduct(id, data) {
  const p = await getPrisma();
  const updateData = { ...data };
  if (data.images) updateData.images = JSON.stringify(data.images);
  if (data.types) updateData.types = JSON.stringify(data.types);
  if (data.sizes) updateData.sizes = JSON.stringify(data.sizes);
  if ('price' in data) updateData.price = parseFloat(data.price);
  const product = await p.product.update({ where: { id }, data: updateData });
  return parseProduct(product);
}

async function deleteProduct(id) {
  const p = await getPrisma();
  await p.product.delete({ where: { id } });
  return { success: true };
}

// ── Orders ──
async function getOrders() {
  const p = await getPrisma();
  return p.order.findMany({ orderBy: { createdAt: 'desc' } });
}

async function createOrder(data) {
  const p = await getPrisma();
  return p.order.create({ data });
}

async function updateOrderStatus(id, status) {
  const p = await getPrisma();
  return p.order.update({ where: { id }, data: { status } });
}

async function deleteOrder(id) {
  const p = await getPrisma();
  await p.order.delete({ where: { id } });
  return { success: true };
}

// ── Customers ──
async function upsertCustomer(data) {
  const p = await getPrisma();
  return p.customer.upsert({
    where: { phone: data.phone },
    update: {
      name: data.name,
      city: data.city || '',
      area: data.area || '',
      street: data.street || '',
      landmark: data.landmark || '',
      notes: data.notes || '',
      totalOrders: { increment: 1 },
      lastOrderAt: new Date(),
    },
    create: {
      phone: data.phone,
      name: data.name,
      city: data.city || '',
      area: data.area || '',
      street: data.street || '',
      landmark: data.landmark || '',
      notes: data.notes || '',
      totalOrders: 1,
      lastOrderAt: new Date(),
    },
  });
}

async function getCustomerByPhone(phone) {
  const p = await getPrisma();
  return p.customer.findUnique({ where: { phone } });
}

async function getOrdersByPhone(phone) {
  const p = await getPrisma();
  return p.order.findMany({ where: { phone }, orderBy: { createdAt: 'desc' } });
}

async function getOrderById(id) {
  const p = await getPrisma();
  return p.order.findUnique({ where: { id } });
}

// ── Integration Settings (WhatsApp + Instagram) ──
async function getIntegrationSettings() {
  const p = await getPrisma();
  let row = await p.integrationSettings.findFirst();
  if (!row) {
    row = await p.integrationSettings.create({
      data: { waEnabled: true, igEnabled: true },
    });
  }
  return row;
}

async function updateIntegrationSettings(data) {
  const p = await getPrisma();
  const current = await p.integrationSettings.findFirst();
  return p.integrationSettings.update({
    where: { id: current.id },
    data,
  });
}

// ── Conversations ──
function parseConversation(c) {
  if (!c) return c;
  return { ...c, history: typeof c.history === 'string' ? JSON.parse(c.history) : c.history };
}

async function getConversations(channel) {
  const p = await getPrisma();
  const rows = await p.conversation.findMany({
    where: channel ? { channel } : {},
    orderBy: { lastActivity: 'desc' },
    take: 100,
  });
  return rows.map(parseConversation);
}

async function getConversation(channel, externalId) {
  const p = await getPrisma();
  return parseConversation(
    await p.conversation.findFirst({ where: { channel, externalId } })
  );
}

async function appendConversationMessage(channel, externalId, sender, text, name = '') {
  const p = await getPrisma();
  let conv = await p.conversation.findFirst({ where: { channel, externalId } });
  let history = conv && conv.history ? JSON.parse(conv.history) : [];
  if (history.length > 40) history = history.slice(-40);
  history.push({ sender, text, at: new Date().toISOString() });
  if (conv) {
    return p.conversation.update({
      where: { id: conv.id },
      data: { history: JSON.stringify(history), lastActivity: new Date(), ...(name ? { name } : {}) },
    });
  }
  return p.conversation.create({
    data: { channel, externalId, name, history: JSON.stringify(history), lastActivity: new Date() },
  });
}

async function clearConversation(id) {
  const p = await getPrisma();
  return p.conversation.update({ where: { id }, data: { history: '[]' } });
}

// ── Statistics (for Telegram bot) ──
async function getStats() {
  const p = await getPrisma();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    totalOrders,
    totalRevenue,
    todayOrders,
    todayRevenue,
    weekOrders,
    weekRevenue,
    monthOrders,
    monthRevenue,
    topProducts,
    recentOrders,
  ] = await Promise.all([
    p.userSession.count(),
    p.order.count(),
    p.order.aggregate({ _sum: { productPrice: true } }),
    p.order.count({ where: { createdAt: { gte: todayStart } } }),
    p.order.aggregate({ where: { createdAt: { gte: todayStart } }, _sum: { productPrice: true } }),
    p.order.count({ where: { createdAt: { gte: weekAgo } } }),
    p.order.aggregate({ where: { createdAt: { gte: weekAgo } }, _sum: { productPrice: true } }),
    p.order.count({ where: { createdAt: { gte: monthAgo } }, _sum: { productPrice: true } }),
    p.order.aggregate({ where: { createdAt: { gte: monthAgo } }, _sum: { productPrice: true } }),
    p.order.groupBy({
      by: ['productId', 'productName'],
      _count: { productId: true },
      _sum: { productPrice: true },
      orderBy: { _count: { productId: 'desc' } },
      take: 5,
    }),
    p.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, productName: true, size: true, customerName: true, phone: true, productPrice: true, status: true, createdAt: true },
    }),
  ]);

  return {
    totalUsers,
    totalOrders,
    totalRevenue: totalRevenue._sum.productPrice || 0,
    todayOrders,
    todayRevenue: todayRevenue._sum.productPrice || 0,
    weekOrders,
    weekRevenue: weekRevenue._sum.productPrice || 0,
    monthOrders,
    monthRevenue: monthRevenue._sum.productPrice || 0,
    topProducts: topProducts.map(p => ({
      productId: p.productId,
      productName: p.productName,
      count: p._count.productId,
      revenue: p._sum.productPrice || 0,
    })),
    recentOrders,
  };
}

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
  upsertCustomer,
  getCustomerByPhone,
  getOrdersByPhone,
  getOrderById,
  getIntegrationSettings,
  updateIntegrationSettings,
  getConversations,
  getConversation,
  appendConversationMessage,
  clearConversation,
  getStats,
};
