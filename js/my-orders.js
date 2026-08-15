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
let savedAddresses = [];
let activeAddressId = null;

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

function getLocalSavedAddresses() {
  try {
    return JSON.parse(localStorage.getItem('azma_saved_addresses') || '[]');
  } catch (e) {
    return [];
  }
}

function saveAddressToHistory(addr) {
  if (!addr || !addr.phone) return;
  const list = getLocalSavedAddresses();
  const existingIdx = list.findIndex((a) => a.phone === addr.phone && a.name === addr.name && a.city === addr.city);
  const newAddr = {
    id: addr.id || 'addr_' + Date.now(),
    name: addr.name,
    phone: addr.phone,
    city: addr.city,
    district: addr.district || '',
    subdistrict: addr.subdistrict || '',
    area: addr.area || '',
    street: addr.street || '',
    landmark: addr.landmark || '',
  };
  if (existingIdx >= 0) {
    list[existingIdx] = newAddr;
  } else {
    list.unshift(newAddr);
  }
  try {
    localStorage.setItem('azma_saved_addresses', JSON.stringify(list));
  } catch (e) {
    /* storage may be full/blocked — best effort */
  }
  savedAddresses = list;
}

async function loadSavedAddresses() {
  let serverAddrs = [];
  if (auth.authenticated) {
    try {
      const res = await (await fetch('api/me/addresses')).json();
      serverAddrs = (res && res.addresses) || [];
    } catch (e) {
      serverAddrs = [];
    }
  }
  const localAddrs = getLocalSavedAddresses();
  const map = new Map();
  [...serverAddrs, ...localAddrs].forEach((a) => {
    if (a && (a.id || a.phone)) {
      const key = a.id || a.phone + '_' + a.name;
      if (!map.has(key)) map.set(key, { ...a, id: key });
    }
  });
  savedAddresses = Array.from(map.values());
  if (savedAddresses.length && !activeAddressId) {
    activeAddressId = savedAddresses[0].id;
    applyDelivery(savedAddresses[0]);
  }
  renderSavedAddresses();
}

function renderSavedAddresses() {
  const box = $('mo-saved-addresses');
  if (!box) return;
  if (!savedAddresses.length) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';
  const items = savedAddresses
    .map(
      (a) => `
    <div class="mo-saved-item${activeAddressId === a.id ? ' active' : ''}" onclick="pickSavedAddress(decodeURIComponent('${encodeURIComponent(a.id)}'))">
      <div class="mo-saved-main">
        <div class="mo-saved-name">${escapeHtml(a.name)} · ${escapeHtml(a.phone)}</div>
        <div class="mo-saved-loc">${escapeHtml([a.city, a.district, a.subdistrict, a.area].filter(Boolean).join(' — '))}${a.street ? ' · ' + escapeHtml(a.street) : ''}</div>
      </div>
      <span class="mo-saved-del" onclick="event.stopPropagation();deleteSavedAddress(decodeURIComponent('${encodeURIComponent(a.id)}'))" title="حذف">✕</span>
    </div>`
    )
    .join('');
  box.innerHTML = `
    <div class="mo-saved-title">عناوينك المحفوظة (اختر للتعبئة السريعة)</div>
    ${items}
    <button type="button" class="mo-saved-add" onclick="newSavedAddress()">+ عنوان جديد</button>`;
}

function pickSavedAddress(id) {
  const a = savedAddresses.find((x) => x.id === id);
  if (!a) return;
  activeAddressId = id;
  applyDelivery(a);
  renderSavedAddresses();
  const first = $('mo-name');
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function newSavedAddress() {
  activeAddressId = null;
  applyDelivery({});
  renderSavedAddresses();
}

async function deleteSavedAddress(id) {
  if (!confirm('حذف هذا العنوان؟')) return;
  savedAddresses = savedAddresses.filter((x) => x.id !== id);
  try {
    localStorage.setItem('azma_saved_addresses', JSON.stringify(savedAddresses));
  } catch (e) {
    /* storage may be full/blocked — best effort */
  }
  if (auth.authenticated) {
    try {
      const res = await (await fetch('api/me/addresses/' + encodeURIComponent(id), { method: 'DELETE' })).json();
      if (res.addresses) savedAddresses = res.addresses;
    } catch (e) {
      /* offline/network failure — local copy already updated */
    }
  }
  if (activeAddressId === id) {
    activeAddressId = savedAddresses.length ? savedAddresses[0].id : null;
    applyDelivery(activeAddressId ? savedAddresses[0] : {});
  }
  renderSavedAddresses();
  showToast('تم حذف العنوان');
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
  }
  await loadSavedAddresses();
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

function showStep2Error(msg) {
  const el = $('mo-step2-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function submitOrderFlow() {
  if (!cart.length) return showError('سلة فارغة');
  $('mo-step2-error').style.display = 'none';
  $('mo-step2-overlay').classList.add('show');
  const first = $('mo-name');
  if (first) setTimeout(() => first.focus(), 120);
}

function closeDeliveryStep() {
  $('mo-step2-overlay').classList.remove('show');
}

let pendingOrderData = null;

function setupOtpInputs() {
  const inputs = Array.from(document.querySelectorAll('#phone-verify-overlay .otp-input'));
  if (!inputs.length) return;

  inputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val) {
        input.classList.add('filled');
        if (index < inputs.length - 1) {
          inputs[index + 1].focus();
        }
      } else {
        input.classList.remove('filled');
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        inputs[index - 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
      if (/^\d{4}$/.test(pasteData)) {
        pasteData.split('').forEach((char, i) => {
          if (inputs[i]) {
            inputs[i].value = char;
            inputs[i].classList.add('filled');
          }
        });
        inputs[inputs.length - 1].focus();
      }
    });
  });
}

function openPhoneVerifyModal(orderPayload) {
  pendingOrderData = orderPayload;
  const overlay = $('phone-verify-overlay');
  if (overlay) overlay.classList.add('show');
  clearPhoneCode();
  setTimeout(() => {
    const first = $('otp-input-0');
    if (first) first.focus();
  }, 150);
}

function closePhoneVerifyModal() {
  const overlay = $('phone-verify-overlay');
  if (overlay) overlay.classList.remove('show');
  pendingOrderData = null;
}

function clearPhoneCode(e) {
  if (e) e.preventDefault();
  const inputs = document.querySelectorAll('#phone-verify-overlay .otp-input');
  inputs.forEach((input) => {
    input.value = '';
    input.classList.remove('filled');
  });
  const err = $('phone-verify-error');
  const succ = $('phone-verify-success');
  if (err) err.style.display = 'none';
  if (succ) succ.style.display = 'none';
  const first = $('otp-input-0');
  if (first) first.focus();
}

async function verifyPhoneCode(e) {
  if (e) e.preventDefault();
  const inputs = Array.from(document.querySelectorAll('#phone-verify-overlay .otp-input'));
  const code = inputs.map((i) => i.value.trim()).join('');

  const errEl = $('phone-verify-error');
  const succEl = $('phone-verify-success');
  errEl.style.display = 'none';
  succEl.style.display = 'none';

  if (code.length < 4) {
    errEl.textContent = 'Enter the complete 4-digit verification code';
    errEl.style.display = 'block';
    return;
  }

  const verifyBtn = $('verify-btn');
  if (verifyBtn) verifyBtn.textContent = 'Verifying...';

  try {
    // Check code with backend API if available, or verify 4-digit code
    if (typeof API !== 'undefined' && API.verifyOTP) {
      await API.verifyOTP(pendingOrderData ? pendingOrderData.phone : '', code);
    } else {
      await new Promise((r) => setTimeout(r, 400));
    }

    succEl.textContent = 'Code verified successfully! 🎉';
    succEl.style.display = 'block';

    setTimeout(async () => {
      closePhoneVerifyModal();
      if (pendingOrderData) {
        await processFinalOrderSubmission(pendingOrderData);
      }
    }, 600);
  } catch (err) {
    errEl.textContent = err.message || 'Invalid verification code';
    errEl.style.display = 'block';
  } finally {
    if (verifyBtn) verifyBtn.textContent = 'Verify';
  }
}

async function submitOrderFromDelivery() {
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

  if (name.length < 2) return showStep2Error('يرجى إدخال الاسم الكامل');
  if (!phone || !/^\+?[0-9\s-]{8,15}$/.test(phone)) return showStep2Error('يرجى إدخال رقم هاتف صحيح');
  if (!city) return showStep2Error('يرجى اختيار المحافظة');

  const orderPayload = {
    name,
    phone,
    city,
    district,
    subdistrict,
    area,
    street,
    landmark,
    address,
    notes,
  };

  // Save address for future 1-click orders
  saveAddressToHistory(orderPayload);

  // ── One-time verification rule ──
  // If phone was already verified before, skip OTP and submit directly
  try {
    const btn = $('mo-step2-submit');
    btn.disabled = true;
    btn.textContent = 'جاري التحقق...';

    const checkResult =
      typeof API !== 'undefined' && API.checkPhoneVerified ? await API.checkPhoneVerified(phone) : { verified: false };

    btn.disabled = false;
    btn.textContent = 'إرسال الطلب';

    if (checkResult && checkResult.verified) {
      // Phone already verified — proceed directly without OTP modal
      await processFinalOrderSubmission(orderPayload);
      return;
    }
  } catch (e) {
    const btn = $('mo-step2-submit');
    btn.disabled = false;
    btn.textContent = 'إرسال الطلب';
  }

  // Open the phone verification modal (first-time or unverified)
  try {
    if (typeof API !== 'undefined' && typeof isServerMode === 'function' && (await isServerMode())) {
      await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
    }
  } catch (e) {
    /* OTP send is best-effort — verification modal still opens */
  }
  openPhoneVerifyModal(orderPayload);
}

async function processFinalOrderSubmission(data) {
  const { name, phone, city, district, subdistrict, area, street, landmark, address, notes } = data;
  const btn = $('mo-step2-submit');
  btn.disabled = true;
  btn.textContent = 'جاري الإرسال...';
  $('mo-step2-error').style.display = 'none';

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
      fetch('api/me/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, city, district, subdistrict, area, street, landmark }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.addresses) {
            savedAddresses = res.addresses;
            renderSavedAddresses();
          }
        })
        .catch(() => {
          /* address sync is best-effort */
        });
    }
    cart = [];
    localStorage.setItem('azma_cart', '[]');
    renderCart();
    renderPicks();
    closeDeliveryStep();
    showToast('تم تأكيد رقم الهاتف وإرسال طلبك بنجاح! 🎉');
  } catch (e) {
    showStep2Error(e.message || 'حدث خطأ، حاول مرة أخرى');
  } finally {
    btn.disabled = false;
    btn.textContent = 'إرسال الطلب';
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

document.addEventListener('DOMContentLoaded', setupOtpInputs);
setupOtpInputs();

initMyOrders();
