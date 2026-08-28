import { PrismaClient } from '../generated/prisma/client.ts';

const url = process.env.DATABASE_URL || '';
let adapter;
if (url.startsWith('postgres')) {
  const { PrismaPg } = await import('@prisma/adapter-pg');
  adapter = new PrismaPg({ connectionString: url });
} else {
  const { PrismaLibSql } = await import('@prisma/adapter-libsql');
  adapter = new PrismaLibSql({ url: url || 'file:./dev.db' });
}
const prisma = new PrismaClient({ adapter });

async function main() {
  const current = await prisma.siteSettings.findFirst();
  if (!current) {
    console.log('No settings row found');
    return;
  }
  const updated = await prisma.siteSettings.update({
    where: { id: current.id },
    data: { googleClientId: '399722296678-4a24emue51l15p1jutugm8pieh62417r.apps.googleusercontent.com' },
  });
  console.log('Updated googleClientId →', updated.googleClientId);
}

main()
  .catch((e) => { console.error('Failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());