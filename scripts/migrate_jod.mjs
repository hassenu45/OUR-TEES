// One-off migration: set site currency to JOD and convert product prices from SAR to JOD base.
// Takes a raw "as reference" conversion: a product priced 29.99 SAR => base JOD 6 (same ratio, rounded).
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '../generated/prisma/client.ts';

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

// base JOD prices matching data/products.json
const JOD_PRICES = { p1: 6, p2: 7, p3: 8, p4: 10 };

async function main() {
  const s = await prisma.siteSettings.findFirst();
  if (s && s.currency === 'JOD') {
    console.log('already migrated (currency=JOD), skipping');
    return;
  }
  if (s) {
    await prisma.siteSettings.update({
      where: { id: s.id },
      data: { currency: 'JOD', currencySymbol: 'د.أ' },
    });
    console.log('settings -> JOD / د.أ');
  } else {
    console.log('settings row not found, skipping settings update');
  }

  const products = await prisma.product.findMany();
  for (const p of products) {
    const target = JOD_PRICES[p.id];
    if (target !== undefined && (parseFloat(p.price) || 0) >= 15) {
      await prisma.product.update({ where: { id: p.id }, data: { price: target } });
      console.log(`product ${p.id}: ${p.price} -> ${target} JOD`);
    } else {
      console.log(`product ${p.id} (${p.name}): kept ${p.price}`);
    }
  }
  console.log('migration done');
}

main().catch(e => { console.error('migration failed:', e); process.exit(1); }).finally(() => prisma.$disconnect());