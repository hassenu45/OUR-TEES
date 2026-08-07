import { describe, it, expect } from 'vitest';
import Landing from '../js/landing.js';

describe('splitHeroTitle', () => {
  it('returns [] for empty text', () => {
    expect(Landing.splitHeroTitle('')).toEqual([]);
    expect(Landing.splitHeroTitle('   ')).toEqual([]);
  });
  it('one word -> one line', () => {
    expect(Landing.splitHeroTitle('AZMA')).toEqual(['AZMA']);
  });
  it('two words -> two lines', () => {
    expect(Landing.splitHeroTitle('WEAR YOUR')).toEqual(['WEAR', 'YOUR']);
  });
  it('three words -> three lines', () => {
    expect(Landing.splitHeroTitle('WEAR YOUR STORY')).toEqual(['WEAR', 'YOUR', 'STORY']);
  });
  it('four words -> balanced 3 lines', () => {
    expect(Landing.splitHeroTitle('A B C D')).toEqual(['A B', 'C', 'D']);
  });
  it('five words -> balanced 3 lines', () => {
    expect(Landing.splitHeroTitle('A B C D E')).toEqual(['A B', 'C D', 'E']);
  });
  it('six words -> 2+2+2', () => {
    expect(Landing.splitHeroTitle('A B C D E F')).toEqual(['A B', 'C D', 'E F']);
  });
  it('seven words -> 3+2+2', () => {
    expect(Landing.splitHeroTitle('A B C D E F G')).toEqual(['A B C', 'D E', 'F G']);
  });
});

describe('getAvailableProducts', () => {
  const mk = (id, soldOut, createdAt) => ({ id, soldOut, createdAt });
  it('filters out sold-out products', () => {
    const out = Landing.getAvailableProducts([mk('a', true, '2026-01-01'), mk('b', false, '2026-01-02')]);
    expect(out.map((p) => p.id)).toEqual(['b']);
  });
  it('sorts newest first by createdAt', () => {
    const out = Landing.getAvailableProducts([
      mk('a', false, '2026-01-01'),
      mk('b', false, '2026-03-01'),
      mk('c', false, '2026-02-01'),
    ]);
    expect(out.map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });
  it('handles missing createdAt', () => {
    const out = Landing.getAvailableProducts([{ id: 'a', soldOut: false }]);
    expect(out.length).toBe(1);
  });
  it('returns [] for null input', () => {
    expect(Landing.getAvailableProducts(null)).toEqual([]);
  });
});

describe('formatPriceText', () => {
  it('formats price with symbol', () => {
    expect(Landing.formatPriceText('6', 'د.أ')).toBe('6.00 د.أ');
  });
  it('uses default symbol when missing', () => {
    expect(Landing.formatPriceText(7.5)).toBe('7.50 د.أ');
  });
  it('handles invalid price', () => {
    expect(Landing.formatPriceText('abc', 'ر.س')).toBe('0.00 ر.س');
  });
});
