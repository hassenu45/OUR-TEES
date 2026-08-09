/* AZMA - My Orders page controller (customer checkout + picked products) */
/* global escapeHtml, isServerMode */
let cart = (() => {
  try {
    return JSON.parse(localStorage.getItem('azma_cart') || '[]');
  } catch (e) {
    return [];
  }
})();
let settings = {};
let paymentMethod = 'cod';
let auth = { authenticated: false };

function $(id) {
  return document.getElementById(id);
}

function makeSelect(wrap) {
  const hidden = $(wrap.dataset.for);
  const placeholder = wrap.dataset.placeholder || 'اختر...';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mo-select-btn';
  btn.innerHTML = '<span class="mo-select-val placeholder"></span><span class="mo-select-arrow">▾</span>';
  const list = document.createElement('div');
  list.className = 'mo-select-list';
  wrap.appendChild(btn);
  wrap.appendChild(list);
  const setVal = (v) => {
    hidden.value = v || '';
    const el = btn.querySelector('.mo-select-val');
    el.textContent = v || placeholder;
    el.classList.toggle('placeholder', !v);
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = !wrap.classList.contains('open');
    closeAll();
    if (opening) {
      list.innerHTML = (wrap._options() || [])
        .map((o) => '<button type="button" class="mo-select-opt" data-v="' + o + '">' + o + '</button>')
        .join('');
      wrap.classList.add('open');
    }
  });
  list.addEventListener('click', (e) => {
    const opt = e.target.closest('.mo-select-opt');
    if (!opt) return;
    setVal(opt.dataset.v);
    closeAll();
    if (wrap._onPick) wrap._onPick(opt.dataset.v);
  });
  wrap._options = () => [];
  wrap._onPick = null;
  wrap._setVal = setVal;
  return wrap;
}

function closeAll() {
  document.querySelectorAll('.mo-select.open').forEach((w) => w.classList.remove('open'));
}
document.addEventListener('click', closeAll);

const CHECKOUT_LOC = {
  city: 'mo-city',
  district: 'mo-district',
  sub: 'mo-subdistrict',
  subField: 'field-mo-subdistrict',
};
const DELIVERY_LOC = {
  city: 'mo-del-city',
  district: 'mo-del-district',
  sub: 'mo-del-subdistrict',
  subField: 'field-mo-del-subdistrict',
};

function jordanLoc() {
  return typeof window !== 'undefined' && window.JORDAN_LOCATIONS ? window.JORDAN_LOCATIONS : null;
}

function syncSubField(ids) {
  const c = $(ids.city).value,
    d = $(ids.district).value;
  const subs = jordanLoc() && c && d ? jordanLoc().subdistricts(c, d) : null;
  const field = $(ids.subField);
  if (field) field.style.display = subs && subs.length ? '' : 'none';
  if (!subs || !subs.length) $(ids.sub).value = '';
}

function cascadeSelects(selCity, selDistrict, selSub, selArea, ids) {
  selCity._options = () => (jordanLoc() ? jordanLoc().cities() : []);
  selCity._onPick = () => {
    selDistrict._setVal('');
    selSub._setVal('');
    selArea._setVal('');
    syncSubField(ids);
  };
  selDistrict._options = () => {
    const c = $(ids.city).value;
    return jordanLoc() && c ? jordanLoc().districts(c) : [];
  };
  selDistrict._onPick = () => {
    selSub._setVal('');
    selArea._setVal('');
    syncSubField(ids);
  };
  selSub._options = () => {
    const c = $(ids.city).value,
      d = $(ids.district).value;
    return jordanLoc() && c && d ? jordanLoc().subdistricts(c, d) || [] : [];
  };
  selSub._onPick = () => selArea._setVal('');
  selArea._options = () => {
    const c = $(ids.city).value,
      d = $(ids.district).value,
      s = $(ids.sub).value;
    return jordanLoc() && c && d ? jordanLoc().areas(c, d, s || undefined) : [];
  };
  syncSubField(ids);
}

cascadeSelects(
  makeSelect($('wrap-mo-city')),
  makeSelect($('wrap-mo-district')),
  makeSelect($('wrap-mo-subdistrict')),
  makeSelect($('wrap-mo-area')),
  CHECKOUT_LOC
);
cascadeSelects(
  makeSelect($('wrap-mo-del-city')),
  makeSelect($('wrap-mo-del-district')),
  makeSelect($('wrap-mo-del-subdistrict')),
  makeSelect($('wrap-mo-del-area')),
  DELIVERY_LOC
);

function applyDelivery(d) {
  $('mo-name').value = d.name || '';
  $('mo-phone').value = d.phone || '';
  $('mo-street').value = d.street || '';
  $('mo-landmark').value = d.landmark || '';
  $('wrap-mo-city')._setVal(d.city || '');
  $('wrap-mo-district')._setVal(d.district || '');
  syncSubField(CHECKOUT_LOC);
  $('wrap-mo-subdistrict')._setVal(d.subdistrict || '');
  $('wrap-mo-area')._setVal(d.area || '');
}

async function initMyOrders() {
  try {
    settings = (await API.getSettings()) || {};
  } catch (e) {
    settings = {};
  }
  try {
    auth = await (await fetch('api/auth/check')).json();
  } catch (e) {
    auth = { authenticated: false };
  }
  if (auth.authenticated) {
    const chip = $('mo-account');
    chip.style.display = 'flex';
    chip.innerHTML =
      (auth.picture ? '<img src="' + auth.picture + '" alt="">' : '') +
      '<span>' +
      escapeHtml(auth.name || auth.email || '') +
      '</span>';
    $('menu-delivery').style.display = '';
    try {
      const d = await (await fetch('api/me/delivery')).json();
      if (d && typeof d === 'object' && d.city) applyDelivery(d);
    } catch (e) {
      /* ignore */
    }
  }
  renderCart();
  renderPicks();
}

function fmt(price) {
  const sym = settings.currencySymbol || 'ر.س';
  return parseFloat(price || 0).toFixed(2) + ' ' + sym;
}

function renderCart() {
  const box = $('mo-cart-items');
  if (!cart.length) {
    box.innerHTML =
      '<div class="mo-empty">سلة فارغة — <a href="store.html" style="color:#FBBF24;">العودة للمتجر</a></div>';
    $('mo-submit').disabled = true;
  } else {
    box.innerHTML = cart
      .map(
        (i) => `
      <div class="mo-item">
        ${i.image ? `<img src="${i.image}" alt="">` : '<div style="width:52px;height:52px;border-radius:8px;background:rgba(255,255,255,.06);"></div>'}
        <div class="mo-item-info">
          <div class="mo-item-name">${escapeHtml(i.name)}</div>
          <div class="mo-item-meta">${escapeHtml(i.type || '')} ${escapeHtml(i.size || '')} × ${i.qty}</div>
        </div>
        <div style="font-size:12px;font-weight:700;color:#FBBF24;">${fmt(i.price * i.qty)}</div>
      </div>`
      )
      .join('');
    $('mo-submit').disabled = false;
  }
  $('mo-cart-total').textContent = fmt(cart.reduce((s, i) => s + i.price * i.qty, 0));
}

function renderPicks() {
  const box = $('mo-orders-list');
  if (!cart.length) {
    box.innerHTML = '<div class="mo-empty">لا توجد منتجات مختارة — <a href="store.html">العودة للمتجر</a></div>';
    return;
  }
  box.innerHTML =
    cart
      .map(
        (i) => `
    <div class="mo-item">
      ${i.image ? `<img src="${i.image}" alt="">` : '<div style="width:52px;height:52px;border-radius:8px;background:rgba(255,255,255,.06);"></div>'}
      <div class="mo-item-info">
        <div class="mo-item-name">${escapeHtml(i.name)}</div>
        <div class="mo-item-meta">${escapeHtml(i.type || '')} ${escapeHtml(i.size || '')} × ${i.qty}</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:#FBBF24;">${fmt(i.price * i.qty)}</div>
    </div>`
      )
      .join('') +
    '<div class="mo-total-row"><span>المجموع</span><span style="font-family:\'Cormorant\',serif;font-size:24px;color:var(--tees-yellow);font-weight:700;">' +
    fmt(cart.reduce((s, i) => s + i.price * i.qty, 0)) +
    '</span></div>' +
    '<button class="mo-btn" onclick="switchTab(\'checkout\')">متابعة إتمام الطلب</button>';
}

function switchTab(name) {
  $('tab-checkout').classList.toggle('active', name === 'checkout');
  $('tab-orders').classList.toggle('active', name === 'orders');
  $('panel-checkout').style.display = name === 'checkout' ? '' : 'none';
  $('panel-orders').style.display = name === 'orders' ? '' : 'none';
}

function pickPayment(m) {
  paymentMethod = m;
  $('pay-cod').classList.toggle('selected', m === 'cod');
  $('pay-card').classList.toggle('selected', m === 'card');
}

function showOverlay(text) {
  $('mo-overlay-text').textContent = text;
  $('mo-overlay').classList.add('show');
}
function hideOverlay() {
  $('mo-overlay').classList.remove('show');
}

function showError(msg) {
  const el = $('mo-error');
  el.textContent = msg;
  el.style.display = 'block';
}

async function submitOrderFlow() {
  const name = $('mo-name').value.trim();
  const phone = $('mo-phone').value.trim();
  const city = $('mo-city').value.trim();
  const district = $('mo-district').value.trim();
  const subdistrict = $('mo-subdistrict').value.trim();
  const area = $('mo-area').value.trim();
  const street = $('mo-street').value.trim();
  const landmark = $('mo-landmark').value.trim();
  const address = [city, district, subdistrict, area, street, landmark].filter(Boolean).join('، ');
  const notes = $('mo-notes').value.trim();

  if (name.length < 2) return showError('يرجى إدخال الاسم الكامل');
  if (!phone || !/^\+?[0-9\s-]{8,15}$/.test(phone)) return showError('يرجى إدخال رقم هاتف صحيح');
  if (!city) return showError('يرجى اختيار المحافظة');

  const btn = $('mo-submit');
  btn.disabled = true;
  btn.textContent = 'جاري الإرسال...';
  $('mo-error').style.display = 'none';
  try {
    if (paymentMethod === 'card') {
      showOverlay('جاري معالجة الدفع...');
      await new Promise((r) => setTimeout(r, 1600));
      hideOverlay();
    }
    const serverMode = typeof API !== 'undefined' && typeof isServerMode === 'function' && (await isServerMode());
    for (const item of cart) {
      const qtyNote = item.qty > 1 ? 'الكمية: ' + item.qty : '';
      if (serverMode) {
        await API.submitOrder({
          productId: item.id,
          type: item.type || '',
          size: item.size || '',
          customerName: name,
          phone,
          address,
          notes: [notes, qtyNote].filter(Boolean).join(' | '),
          paymentMethod,
          city,
          district,
          subdistrict,
          area,
          street,
          landmark,
        });
      } else if (typeof DB !== 'undefined' && DB.createOrder) {
        DB.createOrder({
          productId: item.id,
          productName: item.name,
          productPrice: item.price,
          type: item.type || '',
          size: item.size || '',
          customerName: name,
          phone,
          address,
          notes: [notes, qtyNote].filter(Boolean).join(' | '),
          paymentMethod,
          city,
          district,
          subdistrict,
          area,
          street,
          landmark,
        });
      }
    }
    if (auth.authenticated) {
      fetch('api/me/delivery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, city, district, subdistrict, area, street, landmark }),
      }).catch(() => {});
    }
    cart = [];
    localStorage.setItem('azma_cart', '[]');
    renderCart();
    renderPicks();
    showToast('تم إرسال طلبك بنجاح! 🎉');
  } catch (e) {
    showError(e.message || 'حدث خطأ، حاول مرة أخرى');
  } finally {
    btn.disabled = false;
    btn.textContent = 'تأكيد الطلب';
  }
}

function openDeliveryEditor() {
  if (!auth.authenticated) return showToast('سجل الدخول بحساب Google أولاً', true);
  closeAll();
  $('mo-del-name').value = $('mo-name').value;
  $('mo-del-phone').value = $('mo-phone').value;
  $('mo-del-street').value = $('mo-street').value;
  $('mo-del-landmark').value = $('mo-landmark').value;
  $('wrap-mo-del-city')._setVal($('mo-city').value);
  $('wrap-mo-del-district')._setVal($('mo-district').value);
  syncSubField(DELIVERY_LOC);
  $('wrap-mo-del-subdistrict')._setVal($('mo-subdistrict').value);
  $('wrap-mo-del-area')._setVal($('mo-area').value);
  $('mo-delivery-overlay').classList.add('show');
}

function closeDeliveryEditor() {
  $('mo-delivery-overlay').classList.remove('show');
}

async function saveDeliveryEditor() {
  const name = $('mo-del-name').value.trim();
  const phone = $('mo-del-phone').value.trim();
  const city = $('mo-del-city').value.trim();
  const district = $('mo-del-district').value.trim();
  const subdistrict = $('mo-del-subdistrict').value.trim();
  const area = $('mo-del-area').value.trim();
  const street = $('mo-del-street').value.trim();
  const landmark = $('mo-del-landmark').value.trim();
  if (name.length < 2) return showToast('يرجى إدخال الاسم', true);
  if (!phone || !/^\+?[0-9\s-]{8,15}$/.test(phone)) return showToast('يرجى إدخال رقم هاتف صحيح', true);
  if (!city) return showToast('يرجى اختيار المحافظة', true);
  const btn = $('mo-del-save');
  btn.disabled = true;
  try {
    const res = await fetch('api/me/delivery', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, city, district, subdistrict, area, street, landmark }),
    });
    if (!res.ok) throw new Error('save failed');
    applyDelivery({ name, phone, city, district, subdistrict, area, street, landmark });
    closeDeliveryEditor();
    showToast('تم حفظ بيانات التوصيل ✓');
  } catch (e) {
    showToast('تعذر حفظ البيانات، حاول مرة أخرى', true);
  } finally {
    btn.disabled = false;
  }
}

function showToast(msg, isErr) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText =
    'position:fixed;bottom:24px;right:50%;transform:translateX(50%);background:rgba(22,25,22,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid ' +
    (isErr ? 'rgba(252,165,165,.4)' : 'rgba(245,200,66,.35)') +
    ';color:' +
    (isErr ? '#FCA5A5' : 'var(--tees-yellow,#F5C842)') +
    ';padding:11px 20px;border-radius:12px;font-size:13px;z-index:100;box-shadow:0 8px 24px rgba(0,0,0,.4);';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

initMyOrders();
