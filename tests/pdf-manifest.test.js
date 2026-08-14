import { describe, it, expect } from 'vitest';
import { cleanNameForSort, sortByName, sortRegionGroups, buildTelQrText, buildWaQrText } from '../js/pdf-manifest.js';

describe('cleanNameForSort', () => {
  it('يزيل بادئة الإيموجي والرموز', () => {
    expect(cleanNameForSort('🔴 أحمد محمد')).toBe('أحمد محمد');
    expect(cleanNameForSort('• خالد')).toBe('خالد');
  });
  it('يزيل التشكيل', () => {
    expect(cleanNameForSort('مُحَمَّد')).toBe('محمد');
  });
  it('يعيد سلسلة فارغة للمدخلات الفارغة', () => {
    expect(cleanNameForSort('')).toBe('');
    expect(cleanNameForSort(null)).toBe('');
    expect(cleanNameForSort(undefined)).toBe('');
  });
});

describe('sortByName', () => {
  it('يرتب عربياً من الألف للياء', () => {
    const names = ['محمد', 'أحمد', 'علي', 'خالد'];
    names.sort(sortByName);
    expect(names).toEqual(['أحمد', 'خالد', 'علي', 'محمد']);
  });
  it('يدفع الأسماء الفارغة و - للنهاية', () => {
    const names = ['باسم', '-', '', 'أحمد'];
    names.sort(sortByName);
    expect(names).toEqual(['أحمد', 'باسم', '', '-']);
  });
  it('يقارن بلا حساسية للتشكيل', () => {
    const names = ['مُحمد', 'محمد'];
    expect(sortByName(names[0], names[1])).toBe(0);
  });
});

describe('sortRegionGroups', () => {
  it('يرتب المناطق أبجدياً والمفتاح الفارغ أخيراً', () => {
    const groups = [
      ['زرقاء — عام', [1]],
      ['عمان — الجبيهة', [1]],
      ['', [1]],
      ['إربد — المدينة', [1]],
    ];
    const sorted = sortRegionGroups(groups);
    expect(sorted.map((g) => g[0])).toEqual(['إربد — المدينة', 'زرقاء — عام', 'عمان — الجبيهة', '']);
  });
});

describe('buildTelQrText', () => {
  it('يبني tel:+962 من رقم يبدأ 0', () => {
    expect(buildTelQrText('0791234567')).toBe('tel:+962791234567');
  });
  it('يزيل المسافات والرموز', () => {
    expect(buildTelQrText('0791 234 567-')).toBe('tel:+962791234567');
  });
  it('يحافظ على البادئة 962 الموجودة', () => {
    expect(buildTelQrText('962791234567')).toBe('tel:+962791234567');
  });
});

describe('buildWaQrText', () => {
  it('يبني wa.me مع ترميز الرسالة', () => {
    expect(buildWaQrText('0791234567', 'مرحباً')).toBe(
      'https://wa.me/962791234567?text=' + encodeURIComponent('مرحباً')
    );
  });
  it('يحافظ على البادئة 962', () => {
    expect(buildWaQrText('962791234567', '')).toBe('https://wa.me/962791234567?text=');
  });
});
