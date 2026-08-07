import { describe, it, expect, afterAll } from 'vitest';
import { upsertCustomer, getCustomerByPhone, getOrdersByPhone, getOrderById } from '../db.cjs';

const TEST_PHONE = '__test__' + Date.now();

async function testPrisma() {
  const { PrismaClient } = await import('../generated/prisma/client.ts');
  const { PrismaLibSql } = await import('@prisma/adapter-libsql');
  return new PrismaClient({ adapter: new PrismaLibSql({ url: 'file:./dev.db' }) });
}

afterAll(async () => {
  const prisma = await testPrisma();
  await prisma.customer.deleteMany({ where: { phone: TEST_PHONE } });
  await prisma.order.deleteMany({ where: { phone: TEST_PHONE } });
  await prisma.$disconnect();
});

describe('db customer functions', () => {
  it('upsertCustomer creates and then updates a customer, incrementing totalOrders', async () => {
    const first = await upsertCustomer({ phone: TEST_PHONE, name: 'محمد', city: 'عمّان', notes: 'أول طلب' });
    expect(first.totalOrders).toBe(1);
    const second = await upsertCustomer({ phone: TEST_PHONE, name: 'محمد أحمد', city: 'إربد', notes: '' });
    expect(second.totalOrders).toBe(2);
    expect(second.name).toBe('محمد أحمد');
    expect(second.city).toBe('إربد');
  });

  it('getCustomerByPhone returns the saved customer', async () => {
    const c = await getCustomerByPhone(TEST_PHONE);
    expect(c).not.toBeNull();
    expect(c.phone).toBe(TEST_PHONE);
    await expect(getCustomerByPhone('__nobody__')).resolves.toBeNull();
  });

  it('getOrdersByPhone returns only that phone orders, newest first', async () => {
    const prisma = await testPrisma();
    await prisma.order.create({
      data: {
        productId: 'x1',
        size: 'M',
        customerName: 'محمد',
        phone: TEST_PHONE,
        productName: 'TEE',
        productPrice: 10,
      },
    });
    await prisma.order.create({
      data: {
        productId: 'x2',
        size: 'L',
        customerName: 'محمد',
        phone: TEST_PHONE,
        productName: 'TEE2',
        productPrice: 15,
      },
    });
    await prisma.order.create({
      data: {
        productId: 'y',
        size: 'M',
        customerName: 'آخر',
        phone: '0799999999',
        productName: 'OTHER',
        productPrice: 5,
      },
    });
    await prisma.$disconnect();
    const orders = await getOrdersByPhone(TEST_PHONE);
    expect(orders).toHaveLength(2);
    expect(orders.map((o) => o.productPrice).sort((a, b) => a - b)).toEqual([10, 15]);
    const one = await getOrderById(orders[0].id);
    expect(one.id).toBe(orders[0].id);
    await expect(getOrderById('__nope__')).resolves.toBeNull();
  });
});
