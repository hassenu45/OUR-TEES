import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const createdOrderIds = [];

describe('db.cjs createOrder (server mode)', () => {
  const db = require('../db.cjs');

  it('accepts the full my-orders payload (location fields) without Prisma validation errors', async () => {
    const order = await db.createOrder({
      productId: 'p1',
      productName: 'Test Tee',
      productPrice: 5,
      type: '',
      size: '',
      customerName: 'Test User',
      phone: '+0000000000000',
      address: 'عمان — لواء قصبة المفرق — المفرق',
      notes: '',
      paymentMethod: 'cod',
      city: 'عمان',
      district: 'لواء قصبة المفرق',
      subdistrict: '',
      area: '',
      street: '',
      landmark: '',
    });
    createdOrderIds.push(order.id);
    expect(order.id).toBeTruthy();
    expect(order.size).toBe('');
    expect(order.address).toContain('لواء قصبة المفرق');
  });

  it('stores the order with a valid size when provided', async () => {
    const order = await db.createOrder({
      productId: 'p1',
      productName: 'Test Tee',
      productPrice: 5,
      type: '',
      size: 'L',
      customerName: 'Test User',
      phone: '+0000000000000',
      address: 'عمان',
      notes: '',
      paymentMethod: 'cod',
    });
    createdOrderIds.push(order.id);
    expect(order.size).toBe('L');
    expect(order.status).toBe('new');
  });

  afterAll(async () => {
    for (const id of createdOrderIds) {
      try {
        await db.deleteOrder(id);
      } catch {
        /* best effort cleanup */
      }
    }
  });
});