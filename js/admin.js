/* Our Tees - Pro Admin Dashboard Controller */

let appState = { settings: {}, products: [], orders: [] };
const STATUS_LABELS = { new: 'جديد', completed: 'مكتمل', cancelled: 'ملغي' };
const STATUS_NEXT = { new: 'completed', completed: 'new', cancelled: 'new' };

function $(id) { return document.getElementById(id); }

function showToast(msg, isError) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  t.style.background = isError ? 'rgba(220,38,38,0.9)' : 'rgba(28,25,23,0.95)';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

function esc(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

/* ── Data Loading ── */
async function loadAllData() {
  try {
    const [settings, products, orders] = await Promise.all([
      API.getAdminSettings(),
      API.getProducts(),
      API.getOrders()
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
  const revenue = appState.orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (parseFloat(o.productPrice)||0), 0);
  const pending = appState.orders.filter(o => o.status === 'new').length;
  if ($('stat-products')) $('stat-products').textContent = totalP;
  if ($('stat-orders')) $('stat-orders').textContent = totalO;
  if ($('stat-pending')) $('stat-pending').textContent = pending;
  if ($('stat-revenue')) $('stat-revenue').innerHTML = revenue.toFixed(2) + ' <span style="font-size:16px;">' + (appState.settings.currencySymbol||'ر.س') + '</span>';
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
}

function renderAISettings() {
  const form = $('ai-settings-form');
  if (!form) return;
  if (form.aiName) form.aiName.value = appState.settings.aiName || 'Tez';
  if (form.aiApiKey) form.aiApiKey.value = appState.settings.aiApiKey || '';
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
      sizes: form.sizes.value.split(',').map(s => s.trim()).filter(Boolean),
      types: form.types.value.split(',').map(t => t.trim()).filter(Boolean),
    };
    await API.updateSettings(data);
    showToast('تم حفظ الإعدادات بنجاح');
    await loadAllData();
  } catch (err) { showToast(err.message, true); }
  finally { btn.disabled = false; }
}

async function saveAISettings(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    await API.updateSettings({
      aiName: form.aiName.value.trim() || 'Tez',
      aiApiKey: form.aiApiKey.value.trim(),
      aiWelcome: form.aiWelcome.value.trim(),
      aiPrompt: form.aiPrompt.value.trim(),
      googleClientId: form.googleClientId?.value.trim() || '',
    });
    showToast('تم حفظ إعدادات الذكاء الاصطناعي');
    await loadAllData();
  } catch (err) { showToast(err.message, true); }
  finally { btn.disabled = false; }
}

/* ── Image Preview ── */
function previewProductImages(input) {
  const container = $('images-preview');
  const text = container?.previousElementSibling;
  if (!container) return;
  container.innerHTML = '';
  if (input.files && input.files.length) {
    if (text) text.textContent = `✅ تم اختيار (${input.files.length}) صورة`;
    Array.from(input.files).forEach(f => {
      const r = new FileReader();
      r.onload = e => {
        const img = document.createElement('img');
        img.src = e.target.result;
        container.appendChild(img);
      };
      r.readAsDataURL(f);
    });
  } else {
    if (text) text.textContent = '📷 اضغط لاختيار صور المنتج';
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
  } catch (err) { showToast(err.message, true); }
  finally { btn.disabled = false; btn.textContent = '🚀 إضافة المنتج للمتجر'; }
}

/* ── Products List ── */
function renderProductsList() {
  const grid = $('products-grid');
  if (!grid) return;
  if (!appState.products.length) {
    grid.innerHTML = '<p class="empty-state">لا يوجد منتجات. أضف أول منتج من قسم "إضافة منتج".</p>';
    return;
  }
  grid.innerHTML = appState.products.map(p => {
    const imgSrc = (p.images && p.images[0]) || p.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" fill="%23262626"%3E%3Crect width="100" height="100" rx="8"/%3E%3Ctext x="50" y="55" text-anchor="middle" fill="%23525252" font-size="28"%3E👕%3C/text%3E%3C/svg%3E';
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
  }).join('');
}

function filterProducts() {
  const q = ($('products-search')?.value || '').toLowerCase();
  document.querySelectorAll('.product-card').forEach(c => {
    c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

/* ── Edit Modal ── */
function openEditModal(id) {
  const p = appState.products.find(x => x.id === id);
  if (!p) return;
  $('edit-product-id').value = p.id;
  $('edit-product-name').value = p.name;
  $('edit-product-desc').value = p.description;
  $('edit-product-price').value = p.price;
  $('edit-product-soldout').checked = !!p.soldOut;
  $('edit-modal').classList.add('active');
}

function closeEditModal() { $('edit-modal').classList.remove('active'); }

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
  } catch (err) { showToast(err.message, true); }
}

async function deleteProduct(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المنتج وكل صوره؟')) return;
  try {
    await API.deleteProduct(id);
    showToast('تم حذف المنتج');
    await loadAllData();
  } catch (err) { showToast(err.message, true); }
}

/* ── Orders ── */
function renderOrdersList() {
  const container = $('admin-orders-list');
  if (!container) return;
  const filter = $('orders-filter')?.value || 'all';
  const filtered = filter === 'all' ? appState.orders : appState.orders.filter(o => o.status === filter);
  if (!filtered.length) {
    container.innerHTML = '<p class="empty-state">لا توجد طلبات' + (filter !== 'all' ? ' بهذه الحالة' : '') + '.</p>';
    return;
  }
  // Use table layout
  let html = '<div class="table-wrap"><table><thead><tr><th>العميل</th><th>الهاتف</th><th>المنتج</th><th>المقاس</th><th>السعر</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead><tbody>';
  filtered.forEach(o => {
    const nextStatus = STATUS_NEXT[o.status] || 'completed';
    const nextLabel = o.status === 'completed' ? 'إعادة' : o.status === 'cancelled' ? 'إعادة' : 'تسليم';
    html += `<tr>
      <td><strong>${esc(o.customerName)}</strong></td>
      <td dir="ltr">${esc(o.phone)}</td>
      <td>${esc(o.productName)}</td>
      <td>${esc(o.size)}</td>
      <td style="font-family:'Cormorant';font-weight:700;color:#A16207;">${parseFloat(o.productPrice).toFixed(2)} ${appState.settings.currencySymbol||'ر.س'}</td>
      <td style="font-size:11px;color:rgba(250,250,249,0.3);">${new Date(o.createdAt).toLocaleDateString('ar-SA')}</td>
      <td><span class="badge badge-${o.status}">${STATUS_LABELS[o.status]}</span></td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm ${o.status === 'completed' ? 'btn-outline' : 'btn-accent'}" style="padding:5px 10px;font-size:10px;" onclick="updateOrder('${o.id}','${nextStatus}')">${nextLabel === 'إعادة' ? '↩️' : '✅'} ${nextLabel}</button>
          ${o.status !== 'cancelled' ? `<button class="btn btn-sm btn-outline" style="padding:5px 8px;font-size:10px;color:#FCA5A5;" onclick="updateOrder('${o.id}','cancelled')">❌</button>` : ''}
          <button class="btn btn-sm btn-danger" style="padding:5px 8px;font-size:10px;" onclick="deleteOrder('${o.id}')">🗑️</button>
        </div>
      </td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function filterOrders() { renderOrdersList(); }

async function updateOrder(id, status) {
  try {
    await API.updateOrderStatus(id, status);
    showToast('تم تحديث حالة الطلب');
    await loadAllData();
  } catch (err) { showToast(err.message, true); }
}

async function deleteOrder(id) {
  if (!confirm('هل تريد حذف هذا الطلب؟')) return;
  try {
    await API.deleteOrder(id);
    showToast('تم حذف الطلب');
    await loadAllData();
  } catch (err) { showToast(err.message, true); }
}

/* ── Init ── */
async function init() {
  $('settings-form')?.addEventListener('submit', saveSettings);
  $('ai-settings-form')?.addEventListener('submit', saveAISettings);
  $('add-product-form')?.addEventListener('submit', handleAddProduct);
  $('edit-product-form')?.addEventListener('submit', handleSaveEditProduct);
  await loadAllData();
}

document.addEventListener('DOMContentLoaded', init);
