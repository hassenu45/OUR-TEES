// Pure business rules for the customer saved-address book (my-orders page)
const crypto = require('crypto');

const MAX_ADDRESSES = 10;
const MAX_ADDRESSES_ERROR = 'بلغت الحد الأقصى للعناوين المحفوظة (' + MAX_ADDRESSES + ')';

const LIMITS = { name: 60, phone: 20, city: 40, district: 40, area: 40, street: 60, landmark: 60 };

function clean(s, max) {
  return typeof s === 'string' ? s.trim().slice(0, max) : '';
}

function normalizeAddress(a) {
  return {
    name: clean(a && a.name, LIMITS.name),
    phone: clean(a && a.phone, LIMITS.phone).replace(/[\s-]/g, ''),
    city: clean(a && a.city, LIMITS.city),
    district: clean(a && a.district, LIMITS.district),
    area: clean(a && a.area, LIMITS.area),
    street: clean(a && a.street, LIMITS.street),
    landmark: clean(a && a.landmark, LIMITS.landmark),
  };
}

function validateAddress(a) {
  const n = normalizeAddress(a);
  if (n.name.length < 2) return { ok: false, error: 'يرجى إدخال الاسم الكامل' };
  if (!/^\+?[0-9]{8,15}$/.test(n.phone)) return { ok: false, error: 'رقم هاتف غير صالح' };
  if (!n.city) return { ok: false, error: 'يرجى اختيار المدينة' };
  return { ok: true, address: n };
}

function sameAddress(a, b) {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  return ['name', 'phone', 'city', 'district', 'area', 'street', 'landmark']
    .every((k) => na[k] === nb[k]);
}

function upsertAddress(list, address) {
  const a = normalizeAddress(address);
  const base = Array.isArray(list) ? list : [];
  const idx = base.findIndex((x) => sameAddress(x, a));
  if (idx >= 0) {
    const updated = Object.assign({}, base[idx], a, { updatedAt: new Date().toISOString() });
    const next = base.slice();
    next[idx] = updated;
    return { list: next, added: false, updated: true, address: updated };
  }
  if (base.length >= MAX_ADDRESSES) return { list: base, added: false, updated: false, error: MAX_ADDRESSES_ERROR };
  const created = Object.assign({}, a, {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { list: base.concat(created), added: true, updated: false, address: created };
}

function removeAddress(list, id) {
  const base = Array.isArray(list) ? list : [];
  const next = base.filter((x) => x.id !== id);
  return { list: next, removed: next.length < base.length };
}

function migrateList(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') {
    const a = normalizeAddress(val);
    return [Object.assign({}, a, {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })];
  }
  return [];
}

module.exports = {
  MAX_ADDRESSES,
  MAX_ADDRESSES_ERROR,
  normalizeAddress,
  validateAddress,
  sameAddress,
  upsertAddress,
  removeAddress,
  migrateList,
};
