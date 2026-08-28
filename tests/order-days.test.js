import { describe, it, expect } from 'vitest';
import { dayKey, groupOrdersByDay } from '../js/order-days.js';

describe('dayKey', () => {
  it('formats a Date to YYYY-MM-DD in local time', () => {
    expect(dayKey(new Date(2026, 7, 20, 14, 30))).toBe('2026-08-20');
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('accepts ISO strings and timestamps', () => {
    expect(dayKey('2026-08-20T14:30:00.000Z')).toBe('2026-08-20');
    expect(dayKey(new Date(2026, 7, 20, 9, 0).getTime())).toBe('2026-08-20');
  });

  it('returns null for invalid input', () => {
    expect(dayKey(null)).toBe(null);
    expect(dayKey(undefined)).toBe(null);
    expect(dayKey('not-a-date')).toBe(null);
    expect(dayKey({})).toBe(null);
  });
});

describe('groupOrdersByDay', () => {
  const order = (id, createdAt) => ({ id, createdAt });

  it('groups orders by local day, days descending (newest first)', () => {
    const groups = groupOrdersByDay([
      order('a', new Date(2026, 7, 20, 10, 0)),
      order('b', new Date(2026, 7, 19, 10, 0)),
      order('c', new Date(2026, 7, 20, 12, 0)),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['2026-08-20', '2026-08-19']);
    expect(groups[0].orders.map((o) => o.id)).toEqual(['c', 'a']);
    expect(groups[1].orders.map((o) => o.id)).toEqual(['b']);
  });

  it('sorts orders within a day by time descending (newest first)', () => {
    const groups = groupOrdersByDay([
      order('early', new Date(2026, 7, 20, 8, 0)),
      order('late', new Date(2026, 7, 20, 20, 0)),
      order('mid', new Date(2026, 7, 20, 13, 0)),
    ]);
    expect(groups[0].orders.map((o) => o.id)).toEqual(['late', 'mid', 'early']);
  });

  it('places orders without a valid date in a null-key group at the end', () => {
    const groups = groupOrdersByDay([
      order('dated', new Date(2026, 7, 20, 10, 0)),
      order('nodate', null),
      order('bad', 'garbage'),
    ]);
    expect(groups.length).toBe(2);
    expect(groups[0].key).toBe('2026-08-20');
    expect(groups[1].key).toBe(null);
    expect(groups[1].orders.map((o) => o.id)).toEqual(['nodate', 'bad']);
  });

  it('returns an empty array for no orders', () => {
    expect(groupOrdersByDay([])).toEqual([]);
  });

  it('does not mutate the input array or its orders', () => {
    const input = [order('a', new Date(2026, 7, 20, 10, 0)), order('b', new Date(2026, 7, 19, 10, 0))];
    const snapshot = input.map((o) => ({ ...o, createdAt: o.createdAt }));
    groupOrdersByDay(input);
    expect(input).toHaveLength(2);
    input.forEach((o, i) => {
      expect(o.id).toBe(snapshot[i].id);
      expect(o.createdAt).toBe(snapshot[i].createdAt);
    });
  });

  it('sorts days as strings so cross-year boundaries stay correct', () => {
    const groups = groupOrdersByDay([
      order('dec', new Date(2025, 11, 31, 10, 0)),
      order('jan', new Date(2026, 0, 1, 10, 0)),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['2026-01-01', '2025-12-31']);
  });
});
