// Pure business rules for the customer order flow (my-orders page)
function normalizePhone(phone) {
  return String(phone || '').replace(/[\s-]/g, '');
}

function isValidPhone(phone) {
  const p = normalizePhone(phone);
  return /^(\+?[0-9]{8,15})$/.test(p);
}

function canCancelOrder(order, phone) {
  if (!order) return { ok: false, error: 'الطلب غير موجود' };
  if (order.status !== 'new') {
    const label = order.status === 'completed' ? 'مكتمل' : order.status === 'cancelled' ? 'ملغي' : 'غير معروفة';
    return { ok: false, error: 'لا يمكن إلغاء هذا الطلب — حالته ' + label };
  }
  if (normalizePhone(order.phone) !== normalizePhone(phone)) {
    return { ok: false, error: 'رقم الهاتف لا يطابق صاحب الطلب' };
  }
  return { ok: true };
}

function composeAddress(details) {
  const parts = [details.city, details.area, details.street, details.landmark]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  return parts.join('، ');
}

module.exports = { normalizePhone, isValidPhone, canCancelOrder, composeAddress };
