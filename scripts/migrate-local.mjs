// scripts/migrate-local.mjs — syncs Customer table + Order.paymentMethod into the root dev.db
import { PrismaClient } from '../generated/prisma/client.ts';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: 'file:./dev.db' }) });
const sql = `
CREATE TABLE IF NOT EXISTS "Customer" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "city" TEXT NOT NULL DEFAULT '',
  "area" TEXT NOT NULL DEFAULT '',
  "street" TEXT NOT NULL DEFAULT '',
  "landmark" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "totalOrders" INTEGER NOT NULL DEFAULT 0,
  "lastOrderAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_phone_key" ON "Customer"("phone");
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL DEFAULT 'cod';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "email" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "email" TEXT NOT NULL DEFAULT '';
`;
await prisma.$executeRawUnsafe(sql);
await prisma.$disconnect();
console.log('local dev.db migrated (Customer + Order.paymentMethod)');
