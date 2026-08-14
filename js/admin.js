/* AZMA - Pro Admin Dashboard Controller */
/* global QRCode, jspdf */

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
let editImages = []; // { src, file? } — file set = new image not uploaded yet

function openEditModal(id) {
  const p = appState.products.find((x) => x.id === id);
  if (!p) return;
  $('edit-product-id').value = p.id;
  $('edit-product-name').value = p.name;
  $('edit-product-desc').value = p.description;
  $('edit-product-price').value = p.price;
  $('edit-product-soldout').checked = !!p.soldOut;
  editImages = (p.images && p.images.length ? p.images : p.image ? [p.image] : [])
    .filter(Boolean)
    .map((src) => ({ src }));
  renderEditImages();
  $('edit-modal').classList.add('active');
}

function renderEditImages() {
  const grid = $('edit-images-grid');
  if (!grid) return;
  if (!editImages.length) {
    grid.innerHTML = '<div style="font-size:12px;color:var(--muted,#8a8a8a);">لا توجد صور — أضف صوراً من الزر أدناه</div>';
    return;
  }
  grid.innerHTML = editImages
    .map((img, i) => {
      const safe = esc(img.src);
      return `<div class="edit-img${i === 0 ? ' is-main' : ''}">
        ${i === 0 ? '<span class="edit-img-badge">أساسية</span>' : ''}
        <img src="${safe}" alt="صورة ${i + 1}">
        <div class="edit-img-btns">
          ${i !== 0 ? `<button type="button" title="تعيين كأساسية" onclick="editSetMain(${i})">⭐</button>` : ''}
          <button type="button" title="حذف الصورة" onclick="editRemoveImage(${i})">✕</button>
        </div>
      </div>`;
    })
    .join('');
}

function previewEditImages(input) {
  if (!input || !input.files || !input.files.length) return;
  if (editImages.length + input.files.length > 20) {
    showToast('الحد الأقصى 20 صورة للمنتج الواحد', true);
    input.value = '';
    return;
  }
  Array.from(input.files).forEach((f) => {
    editImages.push({ src: URL.createObjectURL(f), file: f });
  });
  input.value = '';
  renderEditImages();
}

function editRemoveImage(i) {
  const removed = editImages.splice(i, 1)[0];
  if (removed && removed.file && removed.src.startsWith('blob:')) URL.revokeObjectURL(removed.src);
  renderEditImages();
}

function editSetMain(i) {
  if (i <= 0) return;
  editImages.unshift(editImages.splice(i, 1)[0]);
  renderEditImages();
}

function closeEditModal() {
  $('edit-modal').classList.remove('active');
}

async function handleSaveEditProduct(e) {
  e.preventDefault();
  try {
    const newFiles = editImages.filter((x) => x.file).map((x) => x.file);
    if (newFiles.length) {
      const urls = await API.uploadImages(newFiles);
      let fi = 0;
      editImages = editImages.map((x) => (x.file ? { src: urls[fi++] } : x));
    }
    await API.updateProduct($('edit-product-id').value, {
      name: $('edit-product-name').value.trim(),
      description: $('edit-product-desc').value.trim(),
      price: parseFloat($('edit-product-price').value),
      soldOut: $('edit-product-soldout').checked,
      images: editImages.map((x) => x.src),
      image: editImages[0] ? editImages[0].src : '',
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

// Group orders by region/area
function getOrderRegion(order) {
  // The address field contains: city, district, subdistrict, area, street, landmark
  // We'll parse it to find the area/region
  const address = order.address || '';
  // Try to find matching area from Jordan locations
  if (typeof window.JORDAN_LOCATIONS !== 'undefined' && window.JORDAN_LOCATIONS.length) {
    for (const city of window.JORDAN_LOCATIONS) {
      for (const district of city.districts) {
        if (district.subdistricts) {
          for (const sub of district.subdistricts) {
            for (const area of sub.areas) {
              if (address.includes(area)) {
                return { city: city.city, district: district.district, subdistrict: sub.subdistrict, area };
              }
            }
          }
        } else if (district.areas) {
          for (const area of district.areas) {
            if (address.includes(area)) {
              return { city: city.city, district: district.district, area };
            }
          }
        }
      }
    }
  }
  // Fallback: extract from address string
  const parts = address.split('،').map(p => p.trim()).filter(Boolean);
  return { city: parts[0] || 'غير محدد', district: parts[1] || '', subdistrict: parts[2] || '', area: parts[3] || '' };
}

// Generate QR code for phone number (tel: link)
function generatePhoneQR(phone) {
  const cleanPhone = phone.replace(/\D/g, '');
  const telUrl = `tel:+962${cleanPhone.startsWith('0') ? cleanPhone.slice(1) : cleanPhone}`;
  return telUrl;
}

// Generate WhatsApp URL
function generateWhatsAppURL(phone, message = '') {
  const cleanPhone = phone.replace(/\D/g, '');
  const waPhone = cleanPhone.startsWith('0') ? '962' + cleanPhone.slice(1) : (cleanPhone.startsWith('962') ? cleanPhone : '962' + cleanPhone);
  const text = encodeURIComponent(message || `مرحباً، هذا بخصوص طلبك من متجر AZMA`);
  return `https://wa.me/${waPhone}?text=${text}`;
}

function renderOrdersList() {
  const container = $('admin-orders-list');
  if (!container) return;
  const filter = $('orders-filter')?.value || 'all';
  const groupByRegion = $('orders-group-by-region')?.checked || false;
  const filtered = filter === 'all' ? appState.orders : appState.orders.filter((o) => o.status === filter);
  
  if (!filtered.length) {
    container.innerHTML = '<p class="empty-state">لا توجد طلبات' + (filter !== 'all' ? ' بهذه الحالة' : '') + '.</p>';
    return;
  }

  if (groupByRegion) {
    renderOrdersGroupedByRegion(container, filtered);
  } else {
    renderOrdersTable(container, filtered);
  }
}

function renderOrdersTable(container, orders) {
  let html =
    '<div class="table-wrap"><table><thead><tr><th>العميل/المنتج</th><th>الهاتف</th><th>المنطقة</th><th>المقاس</th><th>السعر</th><th>التاريخ</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>';
  
  orders.forEach((o) => {
    const nextStatus = STATUS_NEXT[o.status] || 'completed';
    const nextLabel = o.status === 'completed' ? 'إعادة' : o.status === 'cancelled' ? 'إعادة' : 'تسليم';
    const region = getOrderRegion(o);
    const telUrl = generatePhoneQR(o.phone);
    const waUrl = generateWhatsAppURL(o.phone, `مرحباً ${o.customerName}، بخصوص طلبك: ${o.productName} (${o.size})`);
    const qrId = `qr-${o.id}`;
    
    html += `<tr>
      <td>
        <strong>${esc(o.customerName)}</strong>
        <div style="font-size:11px;color:rgba(250,250,249,.4);">${esc(o.productName)} ${o.paymentMethod === 'card' ? '<span class="badge" style="background:rgba(96,165,250,.15);color:#93C5FD;font-size:9px;">💳 إلكتروني</span>' : '<span class="badge" style="background:rgba(74,222,128,.12);color:#4ADE80;font-size:9px;">💵 كاش</span>'}</div>
      </td>
      <td dir="ltr">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span>${esc(o.phone)}</span>
          <button type="button" class="btn btn-sm btn-outline" style="padding:4px 8px;font-size:10px;" onclick="showPhoneQR('${qrId}', '${telUrl}', '${esc(o.phone)}', '${esc(o.customerName)}')" title="رمز QR للاتصال">📱</button>
          <a href="${waUrl}" target="_blank" class="btn btn-sm btn-accent" style="padding:4px 8px;font-size:10px;text-decoration:none;" title="تواصل عبر واتساب">💬</a>
        </div>
      </td>
      <td>
        <div style="font-size:12px;">${esc(region.city)}</div>
        ${region.district ? `<div style="font-size:10px;color:rgba(250,250,249,.4);">${esc(region.district)}</div>` : ''}
        ${region.area ? `<div style="font-size:10px;color:#A16207;font-weight:600;">${esc(region.area)}</div>` : ''}
      </td>
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
  
  // Add QR code modals
  orders.forEach((o) => {
    const qrId = `qr-${o.id}`;
    const telUrl = generatePhoneQR(o.phone);
    html += `
      <div class="modal" id="${qrId}" style="z-index:1100;">
        <div class="modal-overlay" onclick="hidePhoneQR('${qrId}')"></div>
        <div class="modal-content" style="max-width:320px;text-align:center;padding:24px;">
          <h3 style="margin-bottom:16px;">📞 الاتصال بـ ${esc(o.customerName)}</h3>
          <div id="${qrId}-canvas" style="margin:0 auto 16px;"></div>
          <p style="font-size:13px;color:rgba(250,250,249,.6);margin-bottom:8px;">${esc(o.phone)}</p>
          <a href="${telUrl}" class="btn btn-accent btn-full" style="margin-bottom:8px;">📞 اتصل الآن</a>
          <a href="${generateWhatsAppURL(o.phone)}" target="_blank" class="btn btn-outline btn-full">💬 واتساب</a>
          <button class="btn btn-sm btn-outline btn-full" style="margin-top:12px;" onclick="hidePhoneQR('${qrId}')">إغلاق</button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Initialize QR codes after DOM update
  setTimeout(() => {
    orders.forEach((o) => {
      const qrId = `qr-${o.id}`;
      const canvas = document.getElementById(`${qrId}-canvas`);
      if (canvas && typeof QRCode !== 'undefined') {
        new QRCode(canvas, {
          text: generatePhoneQR(o.phone),
          width: 180,
          height: 180,
          colorDark: '#0C0A09',
          colorLight: '#FAFAF9',
          correctLevel: QRCode.CorrectLevel.M
        });
      }
    });
  }, 0);
}

function renderOrdersGroupedByRegion(container, orders) {
  // Group orders by city > district > area
  const groups = {};
  
  orders.forEach((o) => {
    const region = getOrderRegion(o);
    const cityKey = region.city || 'غير محدد';
    const districtKey = region.district || 'غير محدد';
    const areaKey = region.area || 'غير محدد';
    
    if (!groups[cityKey]) groups[cityKey] = {};
    if (!groups[cityKey][districtKey]) groups[cityKey][districtKey] = {};
    if (!groups[cityKey][districtKey][areaKey]) groups[cityKey][districtKey][areaKey] = [];
    
    groups[cityKey][districtKey][areaKey].push(o);
  });
  
  let html = '<div style="display:flex;flex-direction:column;gap:16px;">';
  
  Object.keys(groups).sort().forEach(city => {
    const cityOrders = [];
    Object.values(groups[city]).forEach(district => Object.values(district).forEach(area => cityOrders.push(...area)));
    const cityCount = cityOrders.length;
    const cityRevenue = cityOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + parseFloat(o.productPrice), 0);
    
    html += `
      <details class="region-group" open style="border:1px solid rgba(255,255,255,0.04);border-radius:12px;background:rgba(255,255,255,0.015);overflow:hidden;">
        <summary style="padding:16px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;user-select:none;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:20px;">🏙️</span>
            <div>
              <div style="font-weight:700;font-size:14px;">${esc(city)}</div>
              <div style="font-size:11px;color:rgba(250,250,249,.4);">${cityCount} طلب${cityCount > 1 ? 'ات' : ''} • ${cityRevenue.toFixed(2)} ${appState.settings.currencySymbol || 'ر.س'}</div>
            </div>
          </div>
          <svg style="width:18px;height:18px;color:rgba(250,250,249,.3);flex-shrink:0;transition:transform 0.2s;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </summary>
        <div style="padding:0 20px 20px;">
    `;
    
    Object.keys(groups[city]).sort().forEach(district => {
      const districtOrders = [];
      Object.values(groups[city][district]).forEach(area => districtOrders.push(...area));
      const districtCount = districtOrders.length;
      const districtRevenue = districtOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + parseFloat(o.productPrice), 0);
      
      html += `
        <details class="region-group" open style="margin-top:12px;border:1px solid rgba(255,255,255,0.03);border-radius:10px;background:rgba(255,255,255,0.01);">
          <summary style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;user-select:none;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:16px;">📍</span>
              <div>
                <div style="font-weight:600;font-size:13px;">${esc(district)}</div>
                <div style="font-size:10px;color:rgba(250,250,249,.4);">${districtCount} طلب${districtCount > 1 ? 'ات' : ''} • ${districtRevenue.toFixed(2)} ${appState.settings.currencySymbol || 'ر.س'}</div>
              </div>
            </div>
            <svg style="width:16px;height:16px;color:rgba(250,250,249,.3);flex-shrink:0;transition:transform 0.2s;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </summary>
          <div style="padding:0 16px 16px;">
      `;
      
      Object.keys(groups[city][district]).sort().forEach(area => {
        const areaOrders = groups[city][district][area];
        const areaCount = areaOrders.length;
        const areaRevenue = areaOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + parseFloat(o.productPrice), 0);
        
        html += `
          <details class="region-group" open style="margin-top:10px;border:1px solid rgba(255,255,255,0.02);border-radius:8px;background:rgba(255,255,255,0.005);">
            <summary style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;user-select:none;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:14px;">🏘️</span>
                <div>
                  <div style="font-weight:600;font-size:12px;color:#D4A04A;">${esc(area)}</div>
                  <div style="font-size:10px;color:rgba(250,250,249,.4);">${areaCount} طلب${areaCount > 1 ? 'ات' : ''} • ${areaRevenue.toFixed(2)} ${appState.settings.currencySymbol || 'ر.س'}</div>
                </div>
              </div>
              <svg style="width:14px;height:14px;color:rgba(250,250,249,.3);flex-shrink:0;transition:transform 0.2s;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </summary>
            <div style="padding:0 14px 12px;">
              <div style="display:flex;flex-direction:column;gap:6px;">
        `;
        
        // Sort orders by date (newest first)
        areaOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        areaOrders.forEach((o) => {
          const nextStatus = STATUS_NEXT[o.status] || 'completed';
          const nextLabel = o.status === 'completed' ? 'إعادة' : o.status === 'cancelled' ? 'إعادة' : 'تسليم';
          const telUrl = generatePhoneQR(o.phone);
          const waUrl = generateWhatsAppURL(o.phone, `مرحباً ${o.customerName}، بخصوص طلبك: ${o.productName} (${o.size})`);
          const qrId = `qr-${o.id}`;
          
          html += `
            <div class="order-item" style="padding:10px 12px;background:rgba(255,255,255,0.01);border-radius:8px;border:1px solid rgba(255,255,255,0.02);">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div style="flex:1;min-width:200px;">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
                    <strong style="font-size:13px;">${esc(o.customerName)}</strong>
                    <span style="font-size:10px;color:rgba(250,250,249,.4);">${esc(o.productName)}</span>
                    ${o.paymentMethod === 'card' ? '<span class="badge" style="background:rgba(96,165,250,.15);color:#93C5FD;font-size:8px;">💳 إلكتروني</span>' : '<span class="badge" style="background:rgba(74,222,128,.12);color:#4ADE80;font-size:8px;">💵 كاش</span>'}
                    <span class="badge badge-${o.status}" style="font-size:8px;">${STATUS_LABELS[o.status]}</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:11px;color:rgba(250,250,249,.5);">
                    <span>📏 ${esc(o.size)}</span>
                    <span style="font-family:'Cormorant';font-weight:700;color:#A16207;">${parseFloat(o.productPrice).toFixed(2)} ${appState.settings.currencySymbol || 'ر.س'}</span>
                    <span>📅 ${new Date(o.createdAt).toLocaleDateString('ar-SA')}</span>
                    ${o.notes ? `<span title="${esc(o.notes)}">📝 ${esc(o.notes.substring(0, 30))}${o.notes.length > 30 ? '...' : ''}</span>` : ''}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                  <button type="button" class="btn btn-sm btn-outline" style="padding:4px 8px;font-size:10px;" onclick="showPhoneQR('${qrId}', '${telUrl}', '${esc(o.phone)}', '${esc(o.customerName)}')" title="رمز QR للاتصال">📱 QR</button>
                  <a href="${waUrl}" target="_blank" class="btn btn-sm btn-accent" style="padding:4px 8px;font-size:10px;text-decoration:none;" title="تواصل عبر واتساب">💬 واتساب</a>
                  <button class="btn btn-sm ${o.status === 'completed' ? 'btn-outline' : 'btn-accent'}" style="padding:4px 8px;font-size:10px;" onclick="updateOrder('${o.id}','${nextStatus}')">${nextLabel === 'إعادة' ? '↩️' : '✅'}</button>
                  ${o.status !== 'cancelled' ? `<button class="btn btn-sm btn-outline" style="padding:4px 6px;font-size:10px;color:#FCA5A5;" onclick="updateOrder('${o.id}','cancelled')" title="إلغاء">❌</button>` : ''}
                  <button class="btn btn-sm btn-outline" style="padding:4px 6px;font-size:10px;color:#FDE68A;" onclick="suggestOrderReply('${o.id}')" title="اقتراح رد ذكي">💬</button>
                  <button class="btn btn-sm btn-danger" style="padding:4px 6px;font-size:10px;" onclick="deleteOrder('${o.id}')" title="حذف">🗑️</button>
                </div>
              </div>
            </div>
          `;
        });
        
        html += `
              </div>
            </div>
          </details>
        `;
      });
      
      html += `
            </div>
          </details>
      `;
    });
    
    html += `
        </div>
      </details>
    `;
  });
  
  html += '</div>';
  
  // Add QR code modals
  orders.forEach((o) => {
    const qrId = `qr-${o.id}`;
    const telUrl = generatePhoneQR(o.phone);
    html += `
      <div class="modal" id="${qrId}" style="z-index:1100;">
        <div class="modal-overlay" onclick="hidePhoneQR('${qrId}')"></div>
        <div class="modal-content" style="max-width:320px;text-align:center;padding:24px;">
          <h3 style="margin-bottom:16px;">📞 الاتصال بـ ${esc(o.customerName)}</h3>
          <div id="${qrId}-canvas" style="margin:0 auto 16px;"></div>
          <p style="font-size:13px;color:rgba(250,250,249,.6);margin-bottom:8px;">${esc(o.phone)}</p>
          <a href="${telUrl}" class="btn btn-accent btn-full" style="margin-bottom:8px;">📞 اتصل الآن</a>
          <a href="${generateWhatsAppURL(o.phone)}" target="_blank" class="btn btn-outline btn-full">💬 واتساب</a>
          <button class="btn btn-sm btn-outline btn-full" style="margin-top:12px;" onclick="hidePhoneQR('${qrId}')">إغلاق</button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Initialize QR codes after DOM update
  setTimeout(() => {
    orders.forEach((o) => {
      const qrId = `qr-${o.id}`;
      const canvas = document.getElementById(`${qrId}-canvas`);
      if (canvas && typeof QRCode !== 'undefined') {
        new QRCode(canvas, {
          text: generatePhoneQR(o.phone),
          width: 180,
          height: 180,
          colorDark: '#0C0A09',
          colorLight: '#FAFAF9',
          correctLevel: QRCode.CorrectLevel.M
        });
      }
    });
  }, 0);
}

function toggleGroupByRegion() {
  renderOrdersList();
}

function showPhoneQR(qrId, telUrl, phone, customerName) {
  const modal = $(qrId);
  if (modal) {
    modal.classList.add('active');
    // Re-generate QR code in case it wasn't rendered
    const canvas = document.getElementById(`${qrId}-canvas`);
    if (canvas && typeof QRCode !== 'undefined') {
      canvas.innerHTML = '';
      new QRCode(canvas, {
        text: telUrl,
        width: 180,
        height: 180,
        colorDark: '#0C0A09',
        colorLight: '#FAFAF9',
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  }
}

function hidePhoneQR(qrId) {
  const modal = $(qrId);
  if (modal) modal.classList.remove('active');
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

/* ── Export Orders (CSV / PDF) ── */

// Export orders to CSV
function exportOrdersCSV() {
  const filter = $('orders-filter')?.value || 'all';
  const orders = filter === 'all' ? appState.orders : appState.orders.filter((o) => o.status === filter);
  
  if (!orders.length) {
    showToast('لا توجد طلبات للتصدير', true);
    return;
  }
  
  // CSV headers
  const headers = [
    'رقم الطلب', 'العميل', 'الهاتف', 'المنتج', 'النوع', 'المقاس', 
    'السعر', 'العملة', 'طريقة الدفع', 'الحالة', 'المدينة', 'اللواء', 'القضاء', 'المنطقة',
    'الشارع', 'معلم', 'ملاحظات', 'تاريخ الإنشاء'
  ];
  
  // Map orders to CSV rows
  const rows = orders.map((o) => {
    const region = getOrderRegion(o);
    const addressParts = (o.address || '').split('،').map(p => p.trim());
    const street = addressParts[4] || '';
    const landmark = addressParts[5] || '';
    
    return [
      o.id,
      `"${o.customerName}"`,
      o.phone,
      `"${o.productName}"`,
      `"${o.type || ''}"`,
      o.size,
      parseFloat(o.productPrice).toFixed(2),
      appState.settings.currencySymbol || 'ر.س',
      o.paymentMethod === 'card' ? 'إلكتروني' : 'كاش',
      STATUS_LABELS[o.status] || o.status,
      `"${region.city}"`,
      `"${region.district}"`,
      `"${region.subdistrict}"`,
      `"${region.area}"`,
      `"${street}"`,
      `"${landmark}"`,
      `"${(o.notes || '').replace(/"/g, '""')}"`,
      new Date(o.createdAt).toLocaleString('ar-SA')
    ].join(',');
  });
  
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  
  // Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  link.href = URL.createObjectURL(blob);
  link.download = `AZMA-Orders-${dateStr}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast(`تم تصدير ${orders.length} طلب إلى CSV`);
}

// Export orders to PDF — كشف توصيل (delivery manifest) ready for printing for the courier company
function exportOrdersPDF() {
  const filter = $('orders-filter')?.value || 'all';
  const orders = filter === 'all' ? appState.orders : appState.orders.filter((o) => o.status === filter);

  if (!orders.length) {
    showToast('لا توجد طلبات للتصدير', true);
    return;
  }

  if (typeof window.html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    showToast('مكتبة PDF غير متاحة', true);
    return;
  }

  const currency = appState.settings.currencySymbol || 'ر.س';
  const siteName = appState.settings.siteName || 'AZMA.COM';
  const statusLabel = filter === 'all' ? 'جميع الطلبات' : (STATUS_LABELS[filter] || filter);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const dateLabel = now.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const manifestNo = 'MN-' + dateStr.replace(/-/g, '') + '-' +
    String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');

  // Group orders by city/area so the courier can follow one region at a time
  const groups = new Map();
  orders.forEach((o) => {
    const region = getOrderRegion(o);
    const key = (region.city || 'منطقة أخرى') + ' — ' + (region.area || 'عام');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ o, region });
  });

  const grandTotal = orders.reduce((s, x) => s + (parseFloat(x.productPrice) || 0), 0);
  const groupCount = groups.size;

  const manifestAddress = (o, region) => {
    const parts = (o.address || '').split('،').map((p) => p.trim());
    return [
      region.city, region.district, region.subdistrict, region.area,
      parts[4], parts[5]
    ].filter(Boolean).join('، ');
  };

  // Build page blocks: section headers + data rows
  const blocks = [];
  let seq = 0;
  groups.forEach((items, key) => {
    const sub = items.reduce((s, it) => s + (parseFloat(it.o.productPrice) || 0), 0);
    blocks.push({ type: 'section', label: key, count: items.length, sub });
    items.forEach(({ o, region }) => {
      seq++;
      blocks.push({
        type: 'row',
        seq,
        id: String(o.id).substring(0, 8),
        name: o.customerName || '-',
        phone: '<span style="direction:ltr;unicode-bidi:embed;font-weight:700;font-size:12.5px;">' + (o.phone || '-') + '</span>',
        product: o.productName || '-',
        prodType: o.type || '-',
        size: o.size || '-',
        price: (parseFloat(o.productPrice) || 0).toFixed(2) + ' ' + currency,
        payment: o.paymentMethod === 'card' ? 'إلكتروني' : 'كاش',
        address: manifestAddress(o, region),
        notes: o.notes || '',
      });
    });
  });

  // Paginate: section header + table header cost ~1.3 row slots, each row ~1 slot
  const PAGES = [];
  let page = [];
  let used = 0;
  const capFor = (isFirst) => (isFirst ? 11 : 16);
  blocks.forEach((b) => {
    const cost = b.type === 'section' ? 1.4 : 1;
    const isFirst = page.length === 0;
    if (used + cost > capFor(isFirst) && page.length) {
      PAGES.push(page);
      page = [];
      used = 0;
    }
    page.push(b);
    used += cost;
  });
  if (page.length) PAGES.push(page);

  const PAGE_W = 1123;
  const PAGE_H = 794;

  const secBar = (b) =>
    '<tr><td colspan="11" style="background:#1C1917;color:#FFFFFF;padding:7px 10px;border-radius:6px;">' +
    '<span style="font-weight:800;font-size:13px;">📍 ' + b.label + '</span>' +
    '<span style="float:left;font-size:12px;color:#E7E5E4;">عدد الطلبات: ' + b.count + ' &nbsp;|&nbsp; مجموع المنطقة: <b style="color:#FCD34D;">' + b.sub.toFixed(2) + ' ' + currency + '</b></span></td></tr>';

  const rowHTML = (b) =>
    '<tr style="' + (b.seq % 2 === 0 ? 'background:#F9F6F0;' : '') + '">' +
    '<td style="text-align:center;font-weight:800;color:#A16207;">' + b.seq + '</td>' +
    '<td style="text-align:center;direction:ltr;font-size:10.5px;color:#78716C;">' + b.id + '</td>' +
    '<td style="font-weight:700;">' + b.name + '</td>' +
    '<td style="text-align:center;">' + b.phone + '</td>' +
    '<td style="font-size:11.5px;">' + b.product + '</td>' +
    '<td style="text-align:center;font-size:11px;">' + b.prodType + '</td>' +
    '<td style="text-align:center;font-size:11px;">' + b.size + '</td>' +
    '<td style="text-align:center;font-weight:700;white-space:nowrap;">' + b.price + '</td>' +
    '<td style="text-align:center;font-size:11px;">' + b.payment + '</td>' +
    '<td style="font-size:10.5px;color:#57534E;white-space:normal;line-height:1.5;">' + b.address + '</td>' +
    '<td style="font-size:10px;color:#78716C;white-space:normal;line-height:1.5;">' + b.notes + '</td></tr>';

  const tableHTML = (pageBlocks) => {
    const head = '<tr style="background:#A16207;color:#FFFFFF;">' +
      ['م', 'رقم الطلب', 'العميل', 'الهاتف', 'المنتج', 'النوع', 'المقاس', 'السعر', 'الدفع', 'العنوان', 'ملاحظات']
        .map((h, i) => '<th style="padding:7px 5px;font-size:11.5px;font-weight:800;text-align:center;white-space:nowrap;">' + h + '</th>').join('') + '</tr>';
    const widths = ['3%', '7%', '10%', '9%', '13%', '6%', '5%', '8%', '6%', '22%', '11%'];
    return '<table style="width:100%;border-collapse:collapse;table-layout:fixed;" cellspacing="0">' +
      '<colgroup>' + widths.map((w) => '<col style="width:' + w + ';">').join('') + '</colgroup>' +
      head +
      pageBlocks.map((b) => (b.type === 'section' ? secBar(b) : rowHTML(b))).join('') +
      '</table>';
  };

  const footerHTML = (pageNum, totalPages, isLast) => {
    let sig = '';
    if (isLast) {
      sig = '<div style="margin-top:26px;display:flex;gap:40px;">' +
        '<div style="flex:1;border-top:1.5px solid #1C1917;padding-top:6px;text-align:center;font-size:11px;color:#57534E;font-weight:700;">توقيع مندوب شركة التوصيل</div>' +
        '<div style="flex:1;border-top:1.5px solid #1C1917;padding-top:6px;text-align:center;font-size:11px;color:#57534E;font-weight:700;">توقيع المستلم</div></div>';
    }
    return '<div style="position:absolute;bottom:14px;right:32px;left:32px;display:flex;justify-content:space-between;align-items:center;border-top:2px solid #A16207;padding-top:8px;">' +
      '<span style="font-family:Cormorant,serif;font-weight:700;font-size:14px;color:#A16207;">' + siteName + '</span>' +
      '<span style="font-size:11px;color:#78716C;">صفحة ' + pageNum + ' من ' + totalPages + '</span></div>' + sig;
  };

  const headerHTML = () =>
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
    '<div><div style="font-family:Cormorant,serif;font-size:34px;font-weight:700;color:#A16207;line-height:1;">' + siteName + '<span style="color:#1C1917;"> — كشف توصيل</span></div>' +
    '<div style="font-size:12px;color:#78716C;margin-top:4px;font-weight:700;">تسليم الطلبات إلى شركة التوصيل — يُطبع ويُرفق مع الطرود</div></div>' +
    '<div style="text-align:left;"><div style="font-size:14px;font-weight:800;color:#1C1917;">' + statusLabel + '</div>' +
    '<div style="font-size:11.5px;color:#78716C;margin-top:2px;">' + dateLabel + '</div>' +
    '<div style="font-size:11.5px;color:#78716C;margin-top:2px;direction:ltr;text-align:left;">' + manifestNo + '</div></div></div>' +
    '<div style="height:3px;background:#A16207;border-radius:2px;margin-top:12px;"></div>';

  const summaryHTML = () =>
    '<div style="display:flex;gap:10px;margin:12px 0 14px;">' +
    [
      ['إجمالي الطلبات', orders.length, '#1C1917', '#F5F5F4'],
      ['إجمالي المبلغ', grandTotal.toFixed(2) + ' ' + currency, '#A16207', '#FEF3C7'],
      ['عدد المناطق', groupCount, '#1C1917', '#F5F5F4'],
    ].map((s) => '<div style="flex:1;background:' + s[3] + ';border:1px solid rgba(0,0,0,0.06);border-radius:10px;padding:8px 12px;text-align:center;">' +
      '<div style="font-size:10.5px;color:#57534E;margin-bottom:2px;">' + s[0] + '</div>' +
      '<div style="font-size:16px;font-weight:800;color:' + s[2] + ';">' + s[1] + '</div></div>').join('') + '</div>';

  const pageHTML = (pageBlocks, pageNum, totalPages) => {
    const content = pageNum === 1
      ? headerHTML() + summaryHTML() + tableHTML(pageBlocks)
      : tableHTML(pageBlocks);
    return '<div style="position:relative;width:' + PAGE_W + 'px;height:' + PAGE_H + 'px;background:#FFFFFF;color:#1C1917;direction:rtl;font-family:Tajawal,Montserrat,sans-serif;padding:24px 32px 64px;box-sizing:border-box;overflow:hidden;">' +
      content + footerHTML(pageNum, totalPages, pageNum === totalPages) + '</div>';
  };

  const btn = document.querySelector('[onclick="exportOrdersPDF()"]');
  const btnOld = btn ? btn.innerHTML : '';
  if (btn) btn.innerHTML = '⏳ جاري التصدير...';

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-99999px;top:0;background:#FFFFFF;';
  document.body.appendChild(wrap);

  (async () => {
    try {
      if (document.fonts && document.fonts.load) {
        await document.fonts.load('16px Tajawal');
        await document.fonts.ready;
      }
      const doc = new window.jspdf.jsPDF('landscape', 'mm', 'a4');
      for (let p = 0; p < PAGES.length; p++) {
        wrap.innerHTML = pageHTML(PAGES[p], p + 1, PAGES.length);
        const canvas = await window.html2canvas(wrap.firstElementChild, { scale: 2, backgroundColor: '#FFFFFF', useCORS: true, logging: false });
        const img = canvas.toDataURL('image/jpeg', 0.95);
        if (p > 0) doc.addPage('a4', 'landscape');
        doc.addImage(img, 'JPEG', 0, 0, 297, 210);
      }
      doc.save('AZMA-Manifest-' + dateStr + '.pdf');
      showToast('تم تصدير كشف التوصيل (' + orders.length + ' طلب)');
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('فشل تصدير PDF، حاول مجدداً', true);
    } finally {
      wrap.remove();
      if (btn) btn.innerHTML = btnOld;
    }
  })();
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
    btn.textContent = '⏳ بانتظار الموافقة في المتصفح...';
  }
  if (status) status.textContent = 'افتح المتصفح الخارجي، سجّل الدخول ووافق، ثم عد هنا — سيتم الكشف تلقائياً.';
  window.open('/api/integrations/instagram/connect', '_blank');
  waitForInstagramConnection(btn, status);
}

async function waitForInstagramConnection(btn, status) {
  let tries = 0;
  const poll = setInterval(async () => {
    tries++;
    try {
      const st = await API.integrationStatus();
      if (st.ig && st.ig.configured) {
        clearInterval(poll);
        if (btn) {
          btn.disabled = false;
          btn.textContent = '📸 اتصال بالانستقرام';
        }
        if (status) status.textContent = '✅ متصل — الحساب: ' + (st.ig.userId || '') + ' (التوكن محفوظ بشكل دائم)';
        showToast('✅ تم الاتصال بالانستقرام — التوكن محفوظ بشكل دائم');
        loadIntegrations();
        return;
      }
      if (tries >= 30) {
        clearInterval(poll);
        if (btn) {
          btn.disabled = false;
          btn.textContent = '📸 اتصال بالانستقرام';
        }
        if (status) status.textContent = 'لم يكتمل الاتصال — أعد المحاولة.';
        showToast('❌ لم يكتمل الاتصال: قد يكون التطبيق في وضع Development أو المفاتيح غير صحيحة', true);
      }
    } catch {
      if (tries >= 30) {
        clearInterval(poll);
        if (btn) {
          btn.disabled = false;
          btn.textContent = '📸 اتصال بالانستقرام';
        }
        if (status) status.textContent = 'لم يكتمل الاتصال — أعد المحاولة.';
      }
    }
  }, 3000);
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

/* ── Theme (dark/light) ── */
function initTheme() {
  const toggle = document.getElementById('theme-toggle-app');
  if (!toggle) return;
  const saved = localStorage.getItem('azma_app_theme');
  const isLight = saved === 'light';
  document.body.classList.toggle('light', isLight);
  toggle.checked = isLight;
  toggle.addEventListener('change', () => {
    const light = toggle.checked;
    document.body.classList.toggle('light', light);
    try {
      localStorage.setItem('azma_app_theme', light ? 'light' : 'dark');
    } catch (e) {
      /* ignore */
    }
    const dashboard = document.getElementById('panel-dashboard');
    if (dashboard && dashboard.classList.contains('active') && typeof window.updateChart === 'function') {
      window.updateChart();
    }
  });
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
  initTheme();
  checkAIStatus();
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
  let pendingReload = false;

  window.azma.onUpdateProgress((p) => {
    if (p.phase === 'download') state.textContent = `${p.done}/${p.total}`;
    else if (p.phase === 'done') state.textContent = 'تم التحديث';
    else if (p.phase === 'error') state.textContent = p.error || 'خطأ';
  });
  window.azma.onUpdateApplied((data) => {
    if (data && data.background) {
      pendingReload = true;
      label.textContent = 'أعد التحميل';
      state.textContent = 'تم تنزيل تحديث جديد ✓';
      showToast('تم تنزيل تحديث جديد — اضغط "أعد التحميل" لتطبيقه');
      return;
    }
    state.textContent = 'جاري إعادة التحميل…';
    setTimeout(() => location.reload(), 1200);
  });

  btn.addEventListener('click', async () => {
    if (pendingReload) {
      location.reload();
      return;
    }
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
