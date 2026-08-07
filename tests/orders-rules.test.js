import { describe, it, expect } from 'vitest';
import { normalizePhone, isValidPhone, canCancelOrder, composeAddress } from '../orders-rules.cjs';

describe('orders rules', () => {
  it('normalizePhone removes spaces and dashes', () => {
    expect(normalizePhone(' 05 1234-5678 ')).toBe('0512345678');
  });

  it('isValidPhone accepts local and international formats', () => {
    expect(isValidPhone('0791234567')).toBe(true);
    expect(isValidPhone('079-1234-567')).toBe(true);
    expect(isValidPhone('+962791234567')).toBe(true);
    expect(isValidPhone('123')).toBe(false);
  });

  it('canCancelOrder allows only new orders with matching phone', () => {
    const order = { status: 'new', phone: '0791234567' };
    expect(canCancelOrder(order, '0791234567').ok).toBe(true);
    expect(canCancelOrder(order, '0788888888').ok).toBe(false);
    expect(canCancelOrder({ ...order, status: 'completed' }, '0791234567').ok).toBe(false);
    expect(canCancelOrder(null, '0791234567').ok).toBe(false);
  });

  it('composeAddress joins non-empty parts', () => {
    expect(composeAddress({ city: 'عمّان', area: 'الصويفية', street: '', landmark: 'مسجد الصويفية' })).toBe(
      'عمّان، الصويفية، مسجد الصويفية'
    );
    expect(composeAddress({})).toBe('');
  });
});
