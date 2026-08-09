import { describe, it, expect } from 'vitest';
import {
  normalizeAddress,
  validateAddress,
  sameAddress,
  upsertAddress,
  removeAddress,
  migrateList,
  MAX_ADDRESSES,
  MAX_ADDRESSES_ERROR,
} from '../address-book.cjs';

const A = {
  name: 'محمد أحمد',
  phone: '0791234567',
  city: 'عمّان',
  district: 'الصويفية',
  area: 'وسط البلد',
  street: 'شارع المدينة',
  landmark: 'بجانب المسجد',
};

describe('address book rules', () => {
  it('normalizeAddress trims, slices, and strips phone dashes/spaces', () => {
    expect(normalizeAddress({ name: '  محمد  ', phone: '079-1234-567', city: 'عمّان' })).toEqual({
      name: 'محمد',
      phone: '0791234567',
      city: 'عمّان',
      district: '',
      subdistrict: '',
      area: '',
      street: '',
      landmark: '',
    });
    expect(normalizeAddress({ name: 'x'.repeat(200) }).name.length).toBe(60);
  });

  it('validateAddress requires name, valid phone, and city', () => {
    expect(validateAddress(A).ok).toBe(true);
    expect(validateAddress({ ...A, name: 'م' }).ok).toBe(false);
    expect(validateAddress({ ...A, phone: '123' }).ok).toBe(false);
    expect(validateAddress({ ...A, city: '' }).ok).toBe(false);
  });

  it('sameAddress matches on all fields after normalization', () => {
    expect(sameAddress(A, { ...A, phone: '079-1234-567' })).toBe(true);
    expect(sameAddress(A, { ...A, street: 'شارع آخر' })).toBe(false);
  });

  it('upsertAddress adds a new address with id and dedupes exact match', () => {
    const r1 = upsertAddress([], A);
    expect(r1.added).toBe(true);
    expect(r1.list).toHaveLength(1);
    expect(r1.list[0].id).toBeTruthy();
    const r2 = upsertAddress(r1.list, { ...A, phone: '079-1234-567' });
    expect(r2.added).toBe(false);
    expect(r2.updated).toBe(true);
    expect(r2.list).toHaveLength(1);
    expect(r2.list[0].id).toBe(r1.list[0].id);
  });

  it('upsertAddress enforces the max cap', () => {
    let list = [];
    for (let i = 0; i < MAX_ADDRESSES; i++) {
      list = upsertAddress(list, { ...A, phone: '079000000' + String(i).padStart(2, '0') }).list;
    }
    const over = upsertAddress(list, { ...A, phone: '0799999999' });
    expect(over.error).toBe(MAX_ADDRESSES_ERROR);
    expect(over.list).toHaveLength(MAX_ADDRESSES);
  });

  it('removeAddress removes by id', () => {
    const id = upsertAddress([], A).list[0].id;
    expect(removeAddress([{ id }], id).removed).toBe(true);
    expect(removeAddress([{ id }], 'nope').removed).toBe(false);
  });

  it('migrateList wraps a legacy single object into a list', () => {
    const list = migrateList({ name: 'قديم', phone: '0781111111', city: 'إربد' });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('قديم');
    expect(list[0].id).toBeTruthy();
    expect(migrateList([])).toEqual([]);
    expect(migrateList(undefined)).toEqual([]);
    expect(migrateList('x')).toEqual([]);
  });
});
