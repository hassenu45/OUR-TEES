// دوال نقية لتجميع الطلبات بالأيام — تُحمَّل قبل admin.js وتُستخدم عبر window.OrderDays
(function (global) {
  // مفتاح اليوم "YYYY-MM-DD" بالتوقيت المحلي؛ يُرجع null لتاريخ غير صالح
  function dayKey(date) {
    if (date == null) return null;
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  // يقسم الطلبات على أيام: [{ key, date, orders }] — الأيام تنازلياً (الأحدث أولاً)،
  // وداخل كل يوم الطلبات تنازلياً بالتوقيت (الأحدث أولاً)، والطلبات بلا تاريخ في النهاية.
  // لا يغيّر المدخلات.
  function groupOrdersByDay(orders) {
    const byKey = new Map();
    const noDate = [];

    orders.forEach((o) => {
      const key = dayKey(o && o.createdAt);
      if (key === null) {
        noDate.push(o);
        return;
      }
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(o);
    });

    const groups = Array.from(byKey.entries())
      .map(([key, list]) => ({
        key,
        date: new Date(key + 'T00:00:00'),
        orders: list.slice().sort((a, b) => {
          const ta = new Date(a.createdAt).getTime();
          const tb = new Date(b.createdAt).getTime();
          return tb - ta;
        }),
      }))
      .sort((x, y) => (x.key < y.key ? 1 : x.key > y.key ? -1 : 0));

    if (noDate.length) groups.push({ key: null, date: null, orders: noDate });
    return groups;
  }

  const api = { dayKey, groupOrdersByDay };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.OrderDays = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
