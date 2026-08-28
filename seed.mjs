import { PrismaClient } from './generated/prisma/client.ts';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL || '';
let adapter;
if (url.startsWith('postgres')) {
  const { PrismaPg } = await import('@prisma/adapter-pg');
  adapter = new PrismaPg({ connectionString: url });
} else {
  const { PrismaLibSql } = await import('@prisma/adapter-libsql');
  adapter = new PrismaLibSql({ url: 'file:./dev.db' });
}
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // ── Settings (skip if exists) ──
  const existingSettings = await prisma.siteSettings.findFirst();
  if (existingSettings) {
    console.log('  ✓ Settings already exist, skipping');
  } else {
    const settingsRaw = JSON.parse(readFileSync(join(__dirname, 'data', 'settings.json'), 'utf8'));
    await prisma.siteSettings.create({
      data: {
        id: 1,
        siteName: settingsRaw.siteName || 'AZMA',
        currency: settingsRaw.currency || 'SAR',
        currencySymbol: settingsRaw.currencySymbol || 'ر.س',
        adminPassword: settingsRaw.adminPassword || 'admin123',
        googleClientId: settingsRaw.googleClientId || '',
        sizes: Array.isArray(settingsRaw.sizes) ? settingsRaw.sizes.join(',') : 'S,M,L,XL,XXL',
        types: Array.isArray(settingsRaw.types) ? settingsRaw.types.join(',') : 'قطن كلاسيك,فينتاج,بريميوم,oversized',
        heroBadge: settingsRaw.heroBadge || 'NEW DROP',
        heroDrop: settingsRaw.heroDrop || 'DROP 01 — SPRING 2026',
        heroTitle: settingsRaw.heroTitle || 'WEAR YOUR ATTITUDE.',
        heroSubtitle: settingsRaw.heroSubtitle || '',
        aboutTitle: settingsRaw.aboutTitle || 'BUILT DIFFERENT.',
        aboutText: settingsRaw.aboutText || '',
        aiName: settingsRaw.aiName || 'Tez',
        aiWelcome: settingsRaw.aiWelcome || '',
        aiPrompt: settingsRaw.aiPrompt || '',
        aiApiKey: settingsRaw.aiApiKey || '',
      },
    });
    console.log('  ✓ Settings seeded');
  }

  // ── Products (skip existing ids) ──
  const productsRaw = JSON.parse(readFileSync(join(__dirname, 'data', 'products.json'), 'utf8'));
  let added = 0;
  for (const p of productsRaw) {
    const exists = await prisma.product.findUnique({ where: { id: p.id } });
    if (exists) continue;
    await prisma.product.create({
      data: {
        id: p.id,
        name: p.name || 'OUR TEE',
        description: p.description || '',
        price: parseFloat(p.price) || 0,
        image: p.image || '',
        images: JSON.stringify(p.images || []),
        types: JSON.stringify(p.types || []),
        sizes: JSON.stringify(p.sizes || []),
        badge: p.badge || '',
        soldOut: !!p.soldOut,
      },
    });
    added++;
    console.log(`  ✓ Product: ${p.name}`);
  }
  console.log(`  ✓ Products seeded: ${added} new`);

  // ── Orders (skip existing ids) ──
  const ordersRaw = JSON.parse(readFileSync(join(__dirname, 'data', 'orders.json'), 'utf8'));
  let addedOrders = 0;
  for (const o of ordersRaw) {
    const exists = await prisma.order.findUnique({ where: { id: o.id } });
    if (exists) continue;
    await prisma.order.create({
      data: {
        id: o.id,
        productId: o.productId,
        productName: o.productName || '',
        productPrice: parseFloat(o.productPrice) || 0,
        type: o.type || '',
        size: o.size || '',
        customerName: o.customerName || '',
        phone: o.phone || '',
        address: o.address || '',
        notes: o.notes || '',
        status: o.status || 'new',
        createdAt: new Date(o.createdAt || Date.now()),
      },
    });
    addedOrders++;
  }
  console.log(`  ✓ Orders seeded: ${addedOrders} new`);

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
