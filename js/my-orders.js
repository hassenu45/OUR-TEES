/* AZMA - My Orders page controller (Temu-style customer checkout + order list) */
let cart = JSON.parse(localStorage.getItem('azma_cart') || '[]');
let settings = {};
let myPhone = '';
let paymentMethod = 'cod';

function $(id) { return document.getElementById(id); }

async function initMyOrders() {
  try { settings = (await API.getSettings()) || {}; } catch (e) { settings = {}; }
  myPhone = localStorage.getItem('azma_my_phone') || '';
  renderCart();
  bindPhonePanel();
  if (myPhone) {
    $('mo-phone').value = myPhone;
    await loadMyOrders(myPhone);
    switchTab('orders');
  }
  renderCart();
}

function fmt(price) {
  const sym = settings.currencySymbol || 'ر.س';
  return parseFloat(price || 0).toFixed(2) + ' ' + sym;
}

function renderCart() {
  const box = $('mo-cart-items');
  if (!cart.length) {
    box.innerHTML = '<div class="mo-empty">سلة فارغة — <a href="store.html" style="color:#FBBF24;">العودة للمتجر</a></div>';
    $('mo-submit').disabled = true;
  } else {
    box.innerHTML = cart.map(i => `
      <div class="mo-item">
        ${i.image ? `<img src="${i.image}" alt="">` : '<div style="width:52px;height:52px;border-radius:8px;background:rgba(255,255,255,.06);"></div>'}
        <div class="mo-item-info">
          <div class="mo-item-name">${escapeHtml(i.name)}</div>
          <div class="mo-item-meta">${escapeHtml(i.type || '')} ${escapeHtml(i.size || '')} × ${i.qty}</div>
        </div>
        <div style="font-size:12px;font-weight:700;color:#FBBF24;">${fmt(i.price * i.qty)}</div>
      </div>`).join('');
    $('mo-submit').disabled = false;
  }
  $('mo-cart-total').textContent = fmt(cart.reduce((s, i) => s + i.price * i.qty, 0));
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
function hideOverlay() { $('mo-overlay').classList.remove('show'); }

function showError(msg) {
  const el = $('mo-error');
  el.textContent = msg;
  el.style.display = 'block';
}

async function submitOrderFlow() {
  const name = $('mo-name').value.trim();
  const phone = $('mo-phone').value.trim();
  const city = $('mo-city').value.trim();
  const address = [city, $('mo-area').value.trim(), $('mo-street').value.trim(), $('mo-landmark').value.trim()].filter(Boolean).join('، ');
  const notes = $('mo-notes').value.trim();

  if (name.length < 2) return showError('يرجى إدخال الاسم الكامل');
  if (!phone || !/^\+?[0-9\s-]{8,15}$/.test(phone)) return showError('يرجى إدخال رقم هاتف صحيح');
  if (!city) return showError('يرجى إدخال المدينة');

  const btn = $('mo-submit');
  btn.disabled = true;
  btn.textContent = 'جاري الإرسال...';
  $('mo-error').style.display = 'none';
  try {
    if (paymentMethod === 'card') {
      showOverlay('جاري معالجة الدفع...');
      await new Promise(r => setTimeout(r, 1600));
      hideOverlay();
    }
    const serverMode = typeof API !== 'undefined' && typeof isServerMode === 'function' && await isServerMode();
    for (const item of cart) {
      const qtyNote = item.qty > 1 ? 'الكمية: ' + item.qty : '';
      if (serverMode) {
        await API.submitOrder({
          productId: item.id, type: item.type || '', size: item.size || '',
          customerName: name, phone, address,
          notes: [notes, qtyNote].filter(Boolean).join(' | '),
          paymentMethod, city, area: $('mo-area').value.trim(), street: $('mo-street').value.trim(), landmark: $('mo-landmark').value.trim(),
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
          city: $('mo-city').value.trim(),
          area: $('mo-area').value.trim(),
          street: $('mo-street').value.trim(),
          landmark: $('mo-landmark').value.trim(),
        });
      }
    }
    cart = [];
    localStorage.setItem('azma_cart', '[]');
    localStorage.setItem('azma_my_phone', phone);
    myPhone = phone;
    renderCart();
    await loadMyOrders(phone);
    showToast('تم إرسال طلبك بنجاح! 🎉');
    switchTab('orders');
  } catch (e) {
    showError(e.message || 'حدث خطأ، حاول مرة أخرى');
  } finally {
    btn.disabled = false;
    btn.textContent = 'تأكيد الطلب';
  }
}

async function loadMyOrders(phone) {
  const res = await API.getCustomerByPhone(phone);
  myPhone = phone;
  $('mo-phone-panel').style.display = 'none';
  $('mo-orders-panel').style.display = '';
  const list = $('mo-orders-list');
  const orders = (res && res.orders) || [];
  if (res && res.customer) {
    $('mo-customer-name').textContent = '— ' + res.customer.name;
    $('mo-name').value = res.customer.name || '';
    $('mo-city').value = res.customer.city || '';
    $('mo-area').value = res.customer.area || '';
    $('mo-street').value = res.customer.street || '';
    $('mo-landmark').value = res.customer.landmark || '';
  }
  if (!orders.length) {
    list.innerHTML = '<div class="mo-empty">لا توجد طلبات بعد</div>';
    return;
  }
  list.innerHTML = orders.map(o => {
    const statusLabel = o.status === 'completed' ? 'مكتمل' : o.status === 'cancelled' ? 'ملغي' : 'جديد';
    const payLabel = o.paymentMethod === 'card' ? '<span class="mo-badge card">💳 إلكتروني</span>' : '<span class="mo-badge card" style="background:rgba(74,222,128,.12);color:#4ADE80;">💵 كاش</span>';
    return `<div class="mo-order">
      <div class="mo-order-top">
        <div class="mo-order-name">${escapeHtml(o.productName)}</div>
        <div style="display:flex;gap:6px;align-items:center;">
          ${payLabel}
          <span class="mo-badge ${o.status}">${statusLabel}</span>
        </div>
      </div>
      <div class="mo-order-meta">المقاس: ${escapeHtml(o.size || '—')}${o.type ? ' · ' + escapeHtml(o.type) : ''} · ${fmt(o.productPrice)} · ${new Date(o.createdAt).toLocaleDateString('ar-SA')}</div>
      ${o.status === 'new' ? `<button class="mo-cancel" onclick="cancelOrder('${o.id}')">إلغاء الطلب</button>` : ''}
    </div>`;
  }).join('');
}

function bindPhonePanel() {
  $('mo-lookup-phone').value = myPhone || '';
  $('mo-lookup-phone').addEventListener('keydown', e => { if (e.key === 'Enter') lookupOrders(); });
}

async function lookupOrders() {
  const phone = $('mo-lookup-phone').value.trim();
  if (!phone) return;
  myPhone = phone;
  localStorage.setItem('azma_my_phone', phone);
  await loadMyOrders(phone);
}

async function cancelOrder(id) {
  if (!myPhone) return;
  if (!confirm('متأكد إنك بدك تلغي هذا الطلب؟')) return;
  try {
    await API.cancelOrder(id, myPhone);
    showToast('تم إلغاء الطلب');
    await loadMyOrders(myPhone);
  } catch (e) {
    showToast(e.message || 'تعذر الإلغاء', true);
  }
}

function showToast(msg, isErr) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:24px;right:50%;transform:translateX(50%);background:rgba(22,25,22,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid ' + (isErr ? 'rgba(252,165,165,.4)' : 'rgba(245,200,66,.35)') + ';color:' + (isErr ? '#FCA5A5' : 'var(--tees-yellow,#F5C842)') + ';padding:11px 20px;border-radius:12px;font-size:13px;z-index:100;box-shadow:0 8px 24px rgba(0,0,0,.4);';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

initMyOrders();
