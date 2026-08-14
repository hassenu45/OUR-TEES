import { describe, it, expect } from 'vitest';
import {
  parseCounterHTML,
  shouldSkipAnimations,
  getDecimalPlaces,
  buildChartAnimationConfig,
  buildButtonEntranceConfig,
  buildRippleConfig,
} from '../js/admin-animations.js';

describe('parseCounterHTML', () => {
  it('يستخرج رقماً بسيطاً', () => {
    expect(parseCounterHTML('42')).toEqual({ prefix: '42', value: 42, suffix: '' });
  });

  it('يحافظ على لاحقة HTML (ر.س) مع رقم عشري', () => {
    const r = parseCounterHTML('1234.50 <span style="font-size:16px;">ر.س</span>');
    expect(r.prefix).toBe('1234.50');
    expect(r.value).toBe(1234.5);
    expect(r.suffix).toContain('ر.س');
  });

  it('يتجاهل القيم غير الرقمية', () => {
    expect(parseCounterHTML('+0%').value).toBeNaN();
    expect(parseCounterHTML('').value).toBeNaN();
  });

  it('يتجاهل الفواصل الآلافية في العدد', () => {
    expect(parseCounterHTML('1,200 طلب').value).toBe(1200);
  });
});

describe('shouldSkipAnimations', () => {
  it('يلغي الحركة عند prefers-reduced-motion', () => {
    expect(shouldSkipAnimations(true)).toBe(true);
  });

  it('يعمل بشكل طبيعي دون reduced motion', () => {
    expect(shouldSkipAnimations(false)).toBe(false);
  });
});

describe('getDecimalPlaces', () => {
  it('عدد صحيح = 0 خانات', () => {
    expect(getDecimalPlaces('42')).toBe(0);
  });

  it('رقم عشري بخانتين', () => {
    expect(getDecimalPlaces('1234.50')).toBe(2);
  });

  it('لا تطابق يعيد 0', () => {
    expect(getDecimalPlaces('+%')).toBe(0);
  });
});

describe('buildChartAnimationConfig', () => {
  it('يرجع إعدادات الرسم التصاعدي: 900ms + easeOutQuart', () => {
    const cfg = buildChartAnimationConfig(false);
    expect(cfg.animation.duration).toBe(900);
    expect(cfg.animation.easing).toBe('easeOutQuart');
  });

  it('يؤخر النقاط متتابعة (index × 60) بدون تأخير للخط', () => {
    const cfg = buildChartAnimationConfig(false);
    expect(cfg.animation.delay({ type: 'point', dataIndex: 3 })).toBe(180);
    expect(cfg.animation.delay({ type: 'line', dataIndex: 0 })).toBe(0);
  });

  it('يرسم من أسفل المحور عبر animations.y.from', () => {
    const cfg = buildChartAnimationConfig(false);
    const from = cfg.animations.y.from({ chart: { chartArea: { bottom: 420 } } });
    expect(from).toBe(420);
    expect(cfg.animations.y.from({})).toBe(0);
  });

  it('مع reduced motion: يلغي الأنميشن تماماً', () => {
    expect(buildChartAnimationConfig(true)).toEqual({ animation: false });
  });
});

describe('buildButtonEntranceConfig', () => {
  it('يعيد إعدادات دخول الأزرار: y=10, stagger 0.03', () => {
    const cfg = buildButtonEntranceConfig(false);
    expect(cfg).toEqual({ y: 10, duration: 0.3, ease: 'power2.out', stagger: 0.03 });
  });

  it('يلغي دخول الأزرار مع reduced motion', () => {
    expect(buildButtonEntranceConfig(true)).toBeNull();
  });
});

describe('buildRippleConfig', () => {
  it('يعيد مدة 0.55s مع ease power2.out', () => {
    expect(buildRippleConfig(false)).toEqual({ duration: 0.55, ease: 'power2.out' });
  });

  it('يلغي الريبل مع reduced motion', () => {
    expect(buildRippleConfig(true)).toBeNull();
  });
});
