// دوال نقية لكشف التوصيل PDF — تُحمَّل قبل admin.js وتُستخدم عبر window.ManifestUtils
(function (global) {
  // يزيل الإيموجي والرموز غير العربية/اللاتينية والتشكيل والمسافات الزائدة
  function cleanNameForSort(name) {
    if (!name) return '';
    return String(name)
      .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // مقارنة أسماء العملاء أبجدياً (أ→ي)؛ الفارغ أخيراً ثم '-'
  function sortByName(a, b) {
    const ca = cleanNameForSort(a);
    const cb = cleanNameForSort(b);
    const aDash = a === '-';
    const bDash = b === '-';
    const aEmpty = ca === '' || a == null || aDash;
    const bEmpty = cb === '' || b == null || bDash;
    if (aEmpty && bEmpty) return (aDash ? 1 : 0) - (bDash ? 1 : 0);
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    return ca.localeCompare(cb, 'ar', { sensitivity: 'base' });
  }

  // يرتب مصفوفة [key, items] أبجدياً؛ المفتاح الفارغ أخيراً
  function sortRegionGroups(entries) {
    return entries.slice().sort((x, y) => {
      const kx = String(x[0] || '').trim();
      const ky = String(y[0] || '').trim();
      if (!kx && !ky) return 0;
      if (!kx) return 1;
      if (!ky) return -1;
      return kx.localeCompare(ky, 'ar', { sensitivity: 'base' });
    });
  }

  // رابط اتصال tel: بصيغة +962 (يتعامل مع 0/962/رقم محلي)
  function buildTelQrText(phone) {
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    const local = cleanPhone.startsWith('0')
      ? cleanPhone.slice(1)
      : cleanPhone.startsWith('962')
        ? cleanPhone.slice(3)
        : cleanPhone;
    return 'tel:+962' + local;
  }

  // رابط واتساب wa.me بصيغة 962 (مطابق لمنطق generateWhatsAppURL في admin.js)
  function buildWaQrText(phone, message) {
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    const waPhone = cleanPhone.startsWith('0')
      ? '962' + cleanPhone.slice(1)
      : cleanPhone.startsWith('962')
        ? cleanPhone
        : '962' + cleanPhone;
    const text = encodeURIComponent(message || '');
    return 'https://wa.me/' + waPhone + '?text=' + text;
  }

  const api = { cleanNameForSort, sortByName, sortRegionGroups, buildTelQrText, buildWaQrText };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ManifestUtils = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
