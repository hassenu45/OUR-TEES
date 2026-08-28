-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "email" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "email" TEXT NOT NULL DEFAULT '';
