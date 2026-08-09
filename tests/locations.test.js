import { describe, it, expect } from 'vitest';
import { JORDAN_LOCATIONS, cities, districts, subdistricts, areas } from '../js/jordan-locations.js';

describe('Jordan locations data layer', () => {
  it('lists all 12 governorates', () => {
    const list = cities();
    expect(list).toHaveLength(12);
    expect(list).toContain('المفرق');
    expect(list).toContain('عمان');
    expect(list).toContain('العقبة');
  });

  it('lists districts of a governorate', () => {
    expect(districts('المفرق')).toContain('لواء قصبة المفرق');
    expect(districts('إربد')).toContain('لواء قصبة إربد');
    expect(districts('حمص')).toEqual([]);
    expect(districts('')).toEqual([]);
  });

  it('returns subdistricts only where they exist, else null', () => {
    const subs = subdistricts('المفرق', 'لواء قصبة المفرق');
    expect(subs).toHaveLength(4);
    expect(subs).toContain('قضاء بلعما');
    expect(subdistricts('إربد', 'لواء قصبة إربد')).toBeNull();
    expect(subdistricts('المفرق', 'لواء غير موجود')).toBeNull();
  });

  it('returns areas of a subdistrict', () => {
    const list = areas('المفرق', 'لواء قصبة المفرق', 'قضاء بلعما');
    expect(list).toContain('بلعما');
    expect(list).toContain('حفير');
    expect(list).toContain('القنيات');
  });

  it('returns areas directly from a district without subdistricts', () => {
    const list = areas('إربد', 'لواء قصبة إربد');
    expect(list).toContain('إربد');
    expect(list).toContain('حوارة');
    expect(list).toContain('بيت راس');
  });

  it('returns empty areas for unknown or incomplete inputs without throwing', () => {
    expect(areas('حمص', 'أي لواء')).toEqual([]);
    expect(areas('المفرق', 'لواء قصبة المفرق')).toEqual([]); // لواء بأقضية — القضاء مطلوب أولاً
    expect(areas('المفرق', 'لواء قصبة المفرق', 'قضاء غير موجود')).toEqual([]);
    expect(areas('إربد', 'لواء قصبة إربد', 'قضاء وهمي')).toEqual([]);
  });

  it('exposes the accessor functions as methods on the JORDAN_LOCATIONS array itself', () => {
    // المتصفح يستدعي jordanLoc().cities() — الدوال يجب أن تكون خصائص على المصفوفة
    expect(typeof JORDAN_LOCATIONS.cities).toBe('function');
    expect(typeof JORDAN_LOCATIONS.districts).toBe('function');
    expect(typeof JORDAN_LOCATIONS.subdistricts).toBe('function');
    expect(typeof JORDAN_LOCATIONS.areas).toBe('function');
    expect(JORDAN_LOCATIONS.cities()).toHaveLength(12);
    expect(JORDAN_LOCATIONS.subdistricts('المفرق', 'لواء قصبة المفرق')).toContain('قضاء بلعما');
  });
});
