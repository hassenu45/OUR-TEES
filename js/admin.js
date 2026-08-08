/* AZMA - Pro Admin Dashboard Controller */

let appState = { settings: {}, products: [], orders: [] };
const STATUS_LABELS = { new: 'جديد', completed: 'مكتمل', cancelled: 'ملغي' };
const STATUS_NEXT = { new: 'completed', completed: 'new', cancelled: 'new' };

function $(id) {
  return document.getElementById(id);
}

function showToast(msg, isError) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  t.style.background = isError ? 'rgba(220,38,38,0.9)' : 'rgba(28,25,23,0.95)';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.style.display = 'none';
  }, 3000);
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ── Data Loading ── */
async function loadAllData() {
  try {
    const [settings, products, orders] = await Promise.all([
      API.getAdminSettings(),
      API.getProducts(),
      API.getOrders(),
    ]);
    appState.settings = settings;
    appState.products = products;
    appState.orders = orders;
    renderAll();
  } catch (err) {
    showToast(err.message || 'فشل تحميل البيانات', true);
  }
}

function renderAll() {
  renderStats();
  renderSettings();
  renderAISettings();
  renderProductsList();
  renderOrdersList();
  // Dashboard widgets are handled by inline code in admin.html
}

function renderStats() {
  const totalP = appState.products.length;
  const totalO = appState.orders.length;
  const revenue = appState.orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + (parseFloat(o.productPrice) || 0), 0);
  const pending = appState.orders.filter((o) => o.status === 'new').length;
  if ($('stat-products')) $('stat-products').textContent = totalP;
  if ($('stat-orders')) $('stat-orders').textContent = totalO;
  if ($('stat-pending')) $('stat-pending').textContent = pending;
  if ($('stat-revenue'))
    $('stat-revenue').innerHTML =
      revenue.toFixed(2) + ' <span style="font-size:16px;">' + (appState.settings.currencySymbol || 'ر.س') + '</span>';
  if ($('sidebar-products-count')) $('sidebar-products-count').textContent = totalP;
  if ($('sidebar-orders-count')) $('sidebar-orders-count').textContent = totalO;
}

/* ── Settings ── */
function renderSettings() {
  const form = $('settings-form');
  if (!form) return;
  if (form.siteName) form.siteName.value = appState.settings.siteName || '';
  if (form.currencySymbol) form.currencySymbol.value = appState.settings.currencySymbol || '';
  if (form.sizes) form.sizes.value = (appState.settings.sizes || []).join(', ');
  if (form.types) form.types.value = (appState.settings.types || []).join(', ');
  if (form.heroBadge) form.heroBadge.value = appState.settings.heroBadge || '';
  if (form.heroDrop) form.heroDrop.value = appState.settings.heroDrop || '';
  if (form.heroTitle) form.heroTitle.value = appState.settings.heroTitle || '';
  if (form.heroSubtitle) form.heroSubtitle.value = appState.settings.heroSubtitle || '';
  if (form.aboutTitle) form.aboutTitle.value = appState.settings.aboutTitle || '';
  if (form.aboutText) form.aboutText.value = appState.settings.aboutText || '';

  const likesBox = $('likes-per-product');
  if (likesBox) {
    if (!appState.products.length) {
      likesBox.innerHTML = '<span style="color:rgba(250,250,249,0.2);">لا توجد منتجات بعد.</span>';
    } else {
      likesBox.innerHTML = appState.products
        .map(
          (p) => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border:1px solid rgba(255,255,255,0.04);border-radius:10px;background:rgba(255,255,255,0.015);">
          <span style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.name || 'منتج')}</span>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <span style="font-size:11px;color:rgba(250,250,249,0.3);">❤️</span>
            <input type="number" min="0" class="form-input" style="width:90px;text-align:center;padding:6px 10px;font-size:13px;" value="${parseInt(p.likes) || 0}" data-likes-id="${p.id}">
          </div>
        </div>`
        )
        .join('');
    }
  }
}

function renderAISettings() {
  const form = $('ai-settings-form');
  if (!form) return;
  if (form.aiName) form.aiName.value = appState.settings.aiName || 'Tez';
  if (form.aiWelcome) form.aiWelcome.value = appState.settings.aiWelcome || '';
  if (form.aiPrompt) form.aiPrompt.value = appState.settings.aiPrompt || '';
  if (form.googleClientId) form.googleClientId.value = appState.settings.googleClientId || '';
}

async function saveSettings(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    const data = {
      siteName: form.siteName.value.trim(),
      currencySymbol: form.currencySymbol.value.trim(),
      heroBadge: form.heroBadge.value.trim(),
      heroDrop: form.heroDrop.value.trim(),
      heroTitle: form.heroTitle.value.trim(),
      heroSubtitle: form.heroSubtitle.value.trim(),
      aboutTitle: form.aboutTitle?.value.trim() || '',
      aboutText: form.aboutText?.value.trim() || '',
      sizes: form.sizes.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      types: form.types.value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    await API.updateSettings(data);
    const likesInputs = document.querySelectorAll('[data-likes-id]');
    await Promise.all(
      [...likesInputs].map((inp) => {
        const likes = Math.max(0, parseInt(inp.value) || 0);
        return API.updateProduct(inp.dataset.likesId, { likes });
      })
    );
    showToast('تم حفظ الإعدادات بنجاح');
    await loadAllData();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function saveAISettings(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    await API.updateSettings({
      aiName: form.aiName.value.trim() || 'Tez',
      aiWelcome: form.aiWelcome.value.trim(),
      aiPrompt: form.aiPrompt.value.trim(),
      googleClientId: form.googleClientId?.value.trim() || '',
    });
    showToast('تم حفظ إعدادات الذكاء الاصطناعي');
    await loadAllData();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

/* ── Image Preview ── */
const MAX_PRODUCT_IMAGES = 20;
function previewProductImages(input) {
  const container = $('images-preview');
  const text = container?.previousElementSibling;
  if (!container) return;
  if (input.files && input.files.length > MAX_PRODUCT_IMAGES) {
    const dt = new DataTransfer();
    Array.from(input.files)
      .slice(0, MAX_PRODUCT_IMAGES)
      .forEach((f) => dt.items.add(f));
    input.files = dt.files;
    showToast(`يمكنك اختيار ${MAX_PRODUCT_IMAGES} صورة كحد أقصى`, true);
  }
  container.innerHTML = '';
  if (input.files && input.files.length) {
    if (text) text.textContent = `✅ تم اختيار (${input.files.length}) من ${MAX_PRODUCT_IMAGES} صورة`;
    Array.from(input.files).forEach((f) => {
      const r = new FileReader();
      r.onload = (e) => {
        const img = document.createElement('img');
        img.src = e.target.result;
        container.appendChild(img);
      };
      r.readAsDataURL(f);
    });
  } else {
    if (text) text.textContent = `📷 اضغط لاختيار صور المنتج (حتى ${MAX_PRODUCT_IMAGES} صورة)`;
  }
}

/* ── Add Product ── */
async function handleAddProduct(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  btn.textContent = '⏳ جاري الإضافة...';
  try {
    const fd = new FormData(form);
    await API.createProductWithFormData(fd);
    showToast('تمت إضافة المنتج بنجاح!');
    form.reset();
    if ($('images-preview')) $('images-preview').innerHTML = '';
    await loadAllData();
    switchPanel('products');
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 إضافة المنتج للمتجر';
  }
}

/* ── Products List ── */
function renderProductsList() {
  const grid = $('products-grid');
  if (!grid) return;
  if (!appState.products.length) {
    grid.innerHTML = '<p class="empty-state">لا يوجد منتجات. أضف أول منتج من قسم "إضافة منتج".</p>';
    return;
  }
  grid.innerHTML = appState.products
    .map((p) => {
      const imgSrc =
        (p.images && p.images[0]) ||
        p.image ||
        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" fill="%23262626"%3E%3Crect width="100" height="100" rx="8"/%3E%3Ctext x="50" y="55" text-anchor="middle" fill="%23525252" font-size="28"%3E👕%3C/text%3E%3C/svg%3E';
      return `<div class="product-card" style="position:relative;">
      ${p.soldOut ? '<span class="sold-out-badge">نفذت</span>' : ''}
      <img src="${encodeURI(imgSrc)}" alt="${esc(p.name)}" loading="lazy">
      <h4>${esc(p.name)}</h4>
      <div class="price">${parseFloat(p.price).toFixed(2)} ${appState.settings.currencySymbol || 'ر.س'}</div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="btn btn-sm btn-accent" style="flex:1;padding:6px;" onclick="openEditModal('${p.id}')">✏️</button>
        <button class="btn btn-sm btn-danger" style="flex:1;padding:6px;" onclick="deleteProduct('${p.id}')">🗑️</button>
      </div>
    </div>`;
    })
    .join('');
}

function filterProducts() {
  const q = ($('products-search')?.value || '').toLowerCase();
  document.querySelectorAll('.product-card').forEach((c) => {
    c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

/* ── Edit Modal ── */
function openEditModal(id) {
  const p = appState.products.find((x) => x.id === id);
  if (!p) return;
  $('edit-product-id').value = p.id;
  $('edit-product-name').value = p.name;
  $('edit-product-desc').value = p.description;
  $('edit-product-price').value = p.price;
  $('edit-product-soldout').checked = !!p.soldOut;
  $('edit-modal').classList.add('active');
}

function closeEditModal() {
  $('edit-modal').classList.remove('active');
}

async function handleSaveEditProduct(e) {
  e.preventDefault();
  try {
    await API.updateProduct($('edit-product-id').value, {
      name: $('edit-product-name').value.trim(),
      description: $('edit-product-desc').value.trim(),
      price: parseFloat($('edit-product-price').value),
      soldOut: $('edit-product-soldout').checked,
    });
    showToast('تم تحديث المنتج');
    closeEditModal();
    await loadAllData();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function deleteProduct(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المنتج وكل صوره؟')) return;
  try {
    await API.deleteProduct(id);
    showToast('تم حذف المنتج');
    await loadAllData();
  } catch (err) {
    showToast(err.message, true);
  }
}

/* ── Orders ── */
function renderOrdersList() {
  const container = $('admin-orders-list');
  if (!container) return;
  const filter = $('orders-filter')?.value || 'all';
  const filtered = filter === 'all' ? appState.orders : appState.orders.filter((o) => o.status === filter);
  if (!filtered.length) {
    container.innerHTML = '<p class="empty-state">لا توجد طلبات' + (filter !== 'all' ? ' بهذه الحالة' : '') + '.</p>';
    return;
  }
  // Use table layout
  let html =
    '<div class="table-wrap"><table><thead><tr><th>العميل/المنتج</th><th>الهاتف</th><th>المقاس</th><th>السعر</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead><tbody>';
  filtered.forEach((o) => {
    const nextStatus = STATUS_NEXT[o.status] || 'completed';
    const nextLabel = o.status === 'completed' ? 'إعادة' : o.status === 'cancelled' ? 'إعادة' : 'تسليم';
    html += `<tr>
      <td>
        <strong>${esc(o.customerName)}</strong>
        <div style="font-size:11px;color:rgba(250,250,249,.4);">${esc(o.productName)} ${o.paymentMethod === 'card' ? '<span class="badge" style="background:rgba(96,165,250,.15);color:#93C5FD;font-size:9px;">💳 إلكتروني</span>' : '<span class="badge" style="background:rgba(74,222,128,.12);color:#4ADE80;font-size:9px;">💵 كاش</span>'}</div>
      </td>
      <td dir="ltr">${esc(o.phone)}</td>
      <td>${esc(o.size)}</td>
      <td style="font-family:'Cormorant';font-weight:700;color:#A16207;">${parseFloat(o.productPrice).toFixed(2)} ${appState.settings.currencySymbol || 'ر.س'}</td>
      <td style="font-size:11px;color:rgba(250,250,249,0.3);">${new Date(o.createdAt).toLocaleDateString('ar-SA')}</td>
      <td><span class="badge badge-${o.status}">${STATUS_LABELS[o.status]}</span></td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm ${o.status === 'completed' ? 'btn-outline' : 'btn-accent'}" style="padding:5px 10px;font-size:10px;" onclick="updateOrder('${o.id}','${nextStatus}')">${nextLabel === 'إعادة' ? '↩️' : '✅'} ${nextLabel}</button>
          ${o.status !== 'cancelled' ? `<button class="btn btn-sm btn-outline" style="padding:5px 8px;font-size:10px;color:#FCA5A5;" onclick="updateOrder('${o.id}','cancelled')">❌</button>` : ''}
          <button class="btn btn-sm btn-outline" id="reply-btn-${o.id}" style="padding:5px 8px;font-size:10px;color:#FDE68A;" onclick="suggestOrderReply('${o.id}')" title="اقتراح رد ذكي">💬</button>
          <button class="btn btn-sm btn-danger" style="padding:5px 8px;font-size:10px;" onclick="deleteOrder('${o.id}')">🗑️</button>
        </div>
      </td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function filterOrders() {
  renderOrdersList();
}

async function updateOrder(id, status) {
  try {
    await API.updateOrderStatus(id, status);
    showToast('تم تحديث حالة الطلب');
    await loadAllData();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function deleteOrder(id) {
  if (!confirm('هل تريد حذف هذا الطلب؟')) return;
  try {
    await API.deleteOrder(id);
    showToast('تم حذف الطلب');
    await loadAllData();
  } catch (err) {
    showToast(err.message, true);
  }
}

/* ── DeepSeek AI (Admin) ── */
async function checkAIStatus() {
  const badge = $('ai-status-badge');
  if (badge) badge.textContent = 'جاري الفحص...';
  try {
    const status = await API.aiStatus();
    if (!badge) return;
    if (status.local) {
      badge.textContent = '⚠️ الموقع لا يعمل عبر السيرفر';
      badge.style.background = 'rgba(245,200,66,.12)';
      badge.style.color = '#F5C842';
    } else if (status.configured) {
      badge.textContent = `✅ متصل (${status.model})`;
      badge.style.background = 'rgba(34,197,94,.12)';
      badge.style.color = '#4ADE80';
    } else {
      badge.textContent = '🔴 مفتاح غير مضبوط';
      badge.style.background = 'rgba(239,68,68,.12)';
      badge.style.color = '#F87171';
    }
  } catch (e) {
    if (badge) {
      badge.textContent = '🔴 فشل الفحص';
    }
  }
}

async function generateProductDescription() {
  const btn = $('generate-desc-btn');
  const name = $('product-name-input')?.value.trim() || '';
  const price = $('product-price-input')?.value || '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ جاري التوليد...';
  }
  try {
    const res = await API.generateDescription({
      name,
      types: (appState.settings.types || []).slice(0, 3),
      price,
    });
    const area = $('product-description-input');
    if (area) area.value = res.description || '';
    showToast('تم توليد الوصف بنجاح!');
  } catch (err) {
    showToast(err.message, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✨ توليد وصف بالذكاء';
    }
  }
}

async function suggestOrderReply(orderId) {
  const order = appState.orders.find((o) => o.id === orderId);
  if (!order) return;
  const btn = document.getElementById('reply-btn-' + orderId);
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳';
  }
  try {
    const res = await API.suggestOrderReply({
      customerName: order.customerName,
      productName: order.productName,
      size: order.size,
      notes: order.notes,
      status: order.status,
    });
    const textEl = $('ai-reply-text');
    if (textEl) textEl.textContent = res.reply || '';
    $('ai-reply-modal')?.classList.add('active');
  } catch (err) {
    showToast(err.message, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '💬';
    }
  }
}

function closeAIReplyModal() {
  $('ai-reply-modal')?.classList.remove('active');
}

function copyAIReply() {
  const text = $('ai-reply-text')?.textContent || '';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast('تم نسخ الرد'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('تم نسخ الرد');
  }
}

/* ── Integrations (WhatsApp + Instagram bots) ── */
function badgeState(el, text, color) {
  if (!el) return;
  el.textContent = text;
  el.style.background = color || 'rgba(255,255,255,.06)';
  el.style.color = '#888884';
}

async function loadIntegrations() {
  try {
    const st = await API.integrationStatus();
    const f = $('integrations-form');
    if (f) {
      f.waEnabled.checked = !!st.wa.enabled;
      f.waReplyEnabled.checked = !!st.wa.replyEnabled;
      f.waPhoneId.value = st.wa.phoneId || '';
      f.waTemplate.value = st.wa.template || '';
      f.igEnabled.checked = !!st.ig.enabled;
      f.igCommentReply.checked = !!st.ig.commentReply;
      f.igDmReply.checked = !!st.ig.dmReply;
      f.igUserId.value = st.ig.userId || '';
      f.webhookSecret.value = st.webhookSecret || '';
      f.waToken.value = '';
      f.igToken.value = '';
    }
    const base = location.origin;
    badgeState(
      $('integrations-ai-badge'),
      st.ai.configured ? '✅ AI متصل (' + st.ai.model + ')' : '🔴 AI غير مضبوط',
      st.ai.configured ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)'
    );
    const aiB = $('integrations-ai-badge');
    if (aiB && st.ai.configured) {
      aiB.style.color = '#4ADE80';
    }
    badgeState(
      $('integrations-wa-badge'),
      st.wa.configured ? '✅ واتساب متصل' : '🔴 واتساب غير مضبوط',
      st.wa.configured ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)'
    );
    const waB = $('integrations-wa-badge');
    if (waB && st.wa.configured) {
      waB.style.color = '#4ADE80';
    }
    badgeState(
      $('integrations-waapp-badge'),
      st.waApp && st.waApp.configured ? '✅ بيانات التطبيق ثابتة' : '🔴 بيانات التطبيق غير مضبوطة',
      st.waApp && st.waApp.configured ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)'
    );
    const waAppB = $('integrations-waapp-badge');
    if (waAppB && st.waApp && st.waApp.configured) {
      waAppB.style.color = '#4ADE80';
    }
    const waAppId = $('integrations-waapp-id');
    const waAppSec = $('integrations-waapp-secret');
    const waAppPhone = $('integrations-waapp-phone');
    if (waAppId) waAppId.textContent = st.waApp ? st.waApp.appId || '—' : '—';
    if (waAppSec) waAppSec.textContent = st.waApp ? st.waApp.secretMasked || '—' : '—';
    if (waAppPhone) waAppPhone.textContent = st.waApp ? st.waApp.phoneIdPlaceholder || '—' : '—';
    const umInstance = $('integrations-ultramsg-instance');
    const umToken = $('integrations-ultramsg-token');
    const umWebhook = $('integrations-ultramsg-webhook');
    if (umInstance) umInstance.textContent = st.ultramsg ? st.ultramsg.instance || '—' : '—';
    if (umToken) umToken.textContent = st.ultramsg ? st.ultramsg.tokenMasked || '—' : '—';
    if (umWebhook)
      umWebhook.textContent = st.webhookUrls && st.webhookUrls.ultramsg ? base + st.webhookUrls.ultramsg : '—';
    badgeState(
      $('integrations-ig-badge'),
      st.ig.configured ? '✅ انستقرام متصل' : '🔴 انستقرام غير مضبوط',
      st.ig.configured ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)'
    );
    const igB = $('integrations-ig-badge');
    if (igB && st.ig.configured) {
      igB.style.color = '#4ADE80';
    }
    badgeState(
      $('integrations-igapp-badge'),
      st.igApp && st.igApp.configured ? '✅ بيانات التطبيق ثابتة' : '🔴 بيانات التطبيق غير مضبوطة',
      st.igApp && st.igApp.configured ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)'
    );
    const igAppB = $('integrations-igapp-badge');
    if (igAppB && st.igApp && st.igApp.configured) {
      igAppB.style.color = '#4ADE80';
    }
    const igAppId = $('integrations-igapp-id');
    const igAppSec = $('integrations-igapp-secret');
    if (igAppId) igAppId.textContent = st.igApp ? st.igApp.appId || '—' : '—';
    if (igAppSec) igAppSec.textContent = st.igApp ? st.igApp.secretMasked || '—' : '—';
    const igC = $('ig-connect-status');
    if (igC)
      igC.textContent =
        st.ig && st.ig.configured
          ? '✅ متصل — الحساب: ' + (st.ig.userId || '') + ' (التوكن محفوظ بشكل دائم)'
          : 'اتصال واحد فقط — يفتح صفحة فيسبوك/انستقرام لتسجيل الدخول';
    const urls = $('integrations-webhook-urls');
    if (urls) {
      urls.innerHTML =
        'واتساب: <code dir="ltr">' +
        esc(base + st.webhookUrls.wa) +
        '</code><br>انستقرام: <code dir="ltr">' +
        esc(base + st.webhookUrls.ig) +
        '</code><br>Verify Token: <code dir="ltr">' +
        esc(st.webhookSecret || '') +
        '</code>';
    }
  } catch (e) {
    showToast('فشل تحميل إعدادات البوت: ' + (e.message || e), true);
  }
}

async function saveIntegrations(e) {
  e.preventDefault();
  const f = $('integrations-form');
  if (!f) return;
  const body = {
    waEnabled: f.waEnabled.checked,
    waReplyEnabled: f.waReplyEnabled.checked,
    waPhoneId: f.waPhoneId.value,
    waTemplate: f.waTemplate.value,
    waToken: f.waToken.value,
    igEnabled: f.igEnabled.checked,
    igCommentReply: f.igCommentReply.checked,
    igDmReply: f.igDmReply.checked,
    igUserId: f.igUserId.value,
    igToken: f.igToken.value,
    webhookSecret: f.webhookSecret.value,
  };
  try {
    await API.saveIntegrationSettings(body);
    showToast('تم حفظ إعدادات البوت');
    loadIntegrations();
  } catch (err) {
    showToast('فشل الحفظ: ' + (err.message || err), true);
  }
}

function connectInstagram() {
  const btn = $('ig-connect-btn');
  const status = $('ig-connect-status');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ جارٍ فتح صفحة التسجيل...';
  }
  if (status) status.textContent = 'إذا لم تفتح الصفحة، اسمح بالنوافذ المنبثقة ثم أعد المحاولة.';
  window.location.href = '/api/integrations/instagram/connect';
}

async function testIntegrations() {
  try {
    const r = await API.testIntegrations();
    showToast(
      'UltraMsg: ' +
        (r.ultramsg || '') +
        ' | واتساب: ' +
        (r.wa || '') +
        ' | انستقرام: ' +
        (r.ig || '') +
        ' | IG التطبيق: ' +
        (r.igApp || '')
    );
  } catch (err) {
    showToast('فشل الفحص: ' + (err.message || err), true);
  }
}

async function loadConversations() {
  const box = $('integrations-conversations');
  if (!box) return;
  try {
    const list = await API.integrationConversations();
    if (!list.length) {
      box.textContent = 'لا توجد محادثات بعد.';
      return;
    }
    box.innerHTML = list
      .map((c) => {
        const channel = c.channel === 'wa' ? '💬 واتساب' : '📸 انستقرام';
        const msgs = (c.history || [])
          .map((m) => {
            const who = m.sender === 'user' ? 'العميل' : 'البوت';
            return '<div style="margin:3px 0;"><span style="opacity:.55">' + who + ':</span> ' + esc(m.text) + '</div>';
          })
          .join('');
        return (
          '<div style="border:1px solid #2a2a2a;border-radius:8px;padding:10px 12px;margin-bottom:10px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px;">' +
          '<div><strong>' +
          channel +
          '</strong> — <span dir="ltr">' +
          esc(c.externalId) +
          '</span>' +
          (c.name ? ' (' + esc(c.name) + ')' : '') +
          '</div>' +
          '<button type="button" class="btn btn-outline" onclick="clearConversation(\'' +
          c.id +
          '\')" style="padding:4px 10px;font-size:10px;">🗑️ مسح</button>' +
          '</div><div style="font-size:11px;">' +
          msgs +
          '</div></div>'
        );
      })
      .join('');
  } catch (err) {
    box.textContent = 'فشل تحميل المحادثات: ' + (err.message || err);
  }
}

async function clearConversation(id) {
  try {
    await API.clearIntegrationConversation(id);
    showToast('تم مسح المحادثة');
    loadConversations();
  } catch (err) {
    showToast('فشل المسح: ' + (err.message || err), true);
  }
}

/* ── App Login Gate (الإعدادات تُفتح بكلمة مرور من التطبيق فقط) ── */
function showAppLoginGate() {
  const overlay = document.getElementById('app-login-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  const input = document.getElementById('app-login-password');
  const btn = document.getElementById('app-login-btn');
  const msg = document.getElementById('app-login-msg');
  if (!input || !btn) return;
  async function submit() {
    if (msg) msg.textContent = '';
    const pw = input.value;
    if (!pw) {
      if (msg) msg.textContent = 'أدخل كلمة المرور';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'جارٍ الدخول…';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.success) {
        window.location.reload();
        return;
      }
      if (msg) msg.textContent = j.error || 'كلمة المرور غير صحيحة';
    } catch (e) {
      if (msg) msg.textContent = 'تعذر الاتصال بالسيرفر';
    }
    btn.disabled = false;
    btn.textContent = 'دخول';
  }
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  setTimeout(() => input.focus(), 100);
}

/* ── Init ── */
async function init() {
  const auth = await API.checkAuth();
  if (!auth.authenticated) {
    showAppLoginGate();
    return;
  }
  $('settings-form')?.addEventListener('submit', saveSettings);
  $('ai-settings-form')?.addEventListener('submit', saveAISettings);
  $('integrations-form')?.addEventListener('submit', saveIntegrations);
  $('add-product-form')?.addEventListener('submit', handleAddProduct);
  $('edit-product-form')?.addEventListener('submit', handleSaveEditProduct);
  await loadAllData();
  checkAIStatus();

  const igParams = new URLSearchParams(location.search);
  if (igParams.get('ig') === 'connected') {
    showToast('✅ تم الاتصال بالانستقرام — التوكن محفوظ بشكل دائم');
    history.replaceState(null, '', location.pathname);
  } else if (igParams.get('ig') === 'error') {
    showToast('❌ فشل الاتصال: ' + (igParams.get('reason') || 'خطأ غير معروف'), true);
    history.replaceState(null, '', location.pathname);
  }
}

document.addEventListener('DOMContentLoaded', init);

/* ── Desktop app self-update (window.azma exists only inside Electron) ── */
(function initDesktopUpdater() {
  if (!window.azma) return;
  const btn = document.getElementById('update-btn');
  const label = document.getElementById('update-label');
  const state = document.getElementById('update-state');
  if (!btn || !state) return;
  btn.style.display = 'flex';

  window.azma.onUpdateProgress((p) => {
    if (p.phase === 'download') state.textContent = `${p.done}/${p.total}`;
    else if (p.phase === 'done') state.textContent = 'تم التحديث';
    else if (p.phase === 'error') state.textContent = p.error || 'خطأ';
  });
  window.azma.onUpdateApplied(() => {
    state.textContent = 'جاري إعادة التحميل…';
    setTimeout(() => location.reload(), 1200);
  });

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    label.textContent = 'جارٍ الفحص…';
    try {
      const r = await window.azma.checkForUpdates();
      if (r && r.error) {
        state.textContent = 'تعذر الاتصال بالسيرفر';
      } else if (r && r.updateAvailable) {
        state.textContent = 'تم التحديث ✓';
        label.textContent = 'إعادة التحميل…';
      } else {
        state.textContent = 'آخر إصدار';
        label.textContent = 'تحقق من التحديث';
      }
    } catch {
      state.textContent = 'خطأ';
    }
    btn.disabled = false;
  });

  window.azma
    .getStatus()
    .then((s) => {
      if (s && s.version) state.textContent = 'v' + s.version;
    })
    .catch(() => {});
})();
