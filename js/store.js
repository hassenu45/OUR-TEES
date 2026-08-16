/* AZMA - Store Controller
   Features: Cart, Search, Filter, AI Chat, Gallery */

let settings = {};
let products = [];
let selectedProduct = null;
let cart = (() => { try { return JSON.parse(localStorage.getItem('azma_cart') || '[]'); } catch (e) { return []; } })();
let chatHistory = [];
let currentGalleryIndex = 0;
let galleryImages = [];

/* ── Helpers ── */
function $(id) { return document.getElementById(id); }

/* ── Cart ── */
function saveCart() {
  localStorage.setItem('azma_cart', JSON.stringify(cart));
  updateCartUI();
}

function addToCart(product, size, type, qty = 1) {
  const key = `${product.id}-${size}-${type}`;
  const existing = cart.find(i => i.key === key);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      key,
      id: product.id,
      name: product.name,
      price: product.price,
      size,
      type,
      image: product.image || (product.images && product.images[0]) || '',
      qty,
    });
  }
  saveCart();
  showCartNotification(`${product.name} (${size}) أضيف للسلة!`);
}

function removeFromCart(key) {
  cart = cart.filter(i => i.key !== key);
  saveCart();
}

function updateCartQty(key, delta) {
  const item = cart.find(i => i.key === key);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart();
}

function getCartTotal() {
  return cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function getCartCount() {
  return cart.reduce((sum, i) => sum + i.qty, 0);
}

function toggleCartDrawer() {
  const drawer = $('cart-drawer');
  const overlay = $('cart-overlay');
  if (!drawer) return;
  if (drawer.classList.contains('open')) {
    drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  } else {
    drawer.classList.add('open');
    if (overlay) overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    renderCartItems();
  }
}

function renderCartItems() {
  const container = $('cart-items');
  const totalEl = $('cart-total');
  const statusEl = $('cart-status');
  const checkoutBtn = $('checkout-btn');

  if (!container) return;

  if (!cart.length) {
    container.innerHTML = '<p style="text-align:center;opacity:0.7;padding:var(--space-6);font-weight:bold;">السلة فارغة 🛒</p>';
    if (totalEl) totalEl.textContent = fmtLocalPrice(0);
    if (statusEl) statusEl.textContent = '0 منتج';
    if (checkoutBtn) checkoutBtn.style.display = 'none';
    return;
  }

  if (checkoutBtn) checkoutBtn.style.display = '';
  if (statusEl) statusEl.textContent = `${getCartCount()} منتج`;

  container.innerHTML = cart.map(item => `
    <div style="display:flex;gap:var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--color-border-light);align-items:center;">
      ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:50px;height:50px;object-fit:cover;border-radius:var(--radius-sm);border:2px solid var(--color-border);flex-shrink:0;">` : ''}
      <div style="flex:1;min-width:0;">
        <div style="font-weight:bold;font-size:var(--text-sm);">${item.name}</div>
        <div style="font-size:10px;opacity:0.7;">${item.size}${item.type ? ' · ' + item.type : ''}</div>
        <div style="font-size:var(--text-sm);color:var(--color-accent);font-weight:bold;">${fmtLocalPrice(item.price * item.qty)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-1);">
        <button class="btn btn-sm" style="padding:2px 8px;font-size:14px;" onclick="updateCartQty('${item.key}', -1)">−</button>
        <span style="font-weight:bold;min-width:20px;text-align:center;">${item.qty}</span>
        <button class="btn btn-sm" style="padding:2px 8px;font-size:14px;" onclick="updateCartQty('${item.key}', 1)">+</button>
      </div>
      <button class="btn btn-sm btn-outline" style="padding:2px 8px;font-size:12px;color:var(--color-destructive);border-color:var(--color-destructive);" onclick="removeFromCart('${item.key}')">✕</button>
    </div>
  `).join('');

  if (totalEl) totalEl.textContent = fmtLocalPrice(getCartTotal());
}

function updateCartUI() {
  const count = getCartCount();
  const badge = $('cart-count');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
  }
}

function showCartNotification(msg) {
  const existing = document.querySelector('.cart-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'cart-toast';
  toast.textContent = '✓ ' + msg;
  toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%) translateY(20px);z-index:9999;background:var(--color-foreground);color:var(--color-background);border:2px solid var(--color-border);padding:12px 24px;border-radius:12px;font-weight:700;font-size:14px;box-shadow:6px 6px 0 var(--color-border);opacity:0;transition:all 0.3s cubic-bezier(0.16,1,0.3,1);';
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

async function checkoutCart() {
  if (!cart.length) return;
  // Open order modal for first product in cart
  toggleCartDrawer();
  const first = cart[0];
  const product = products.find(p => p.id === first.id);
  if (product) {
    openOrderModal(product.id);
  }
}

/* ── Product Rendering ── */
async function initStore() {
  try {
    [settings, products] = await Promise.all([API.getSettings(), API.getProducts()]);
    applySettings();
    renderProducts();
    updateCartUI();
  } catch {
    const grid = $('products-grid');
    if (grid) grid.innerHTML = '<p class="empty-state">تعذر تحميل المنتجات. تأكد من فتح الملف بشكل صحيح.</p>';
  }
}

function applySettings() {
  document.title = `${settings.siteName || 'AZMA'} — Store`;
  const heroBadge = $('hero-badge');
  const heroDrop = $('hero-drop');
  const heroTitle = $('hero-title');
  const heroSubtitle = $('hero-subtitle');
  const aboutTitle = $('about-title');
  const aboutText = $('about-text');
  const count = $('product-count');

  if (heroBadge) heroBadge.textContent = settings.heroBadge || 'NEW DROP';
  if (heroDrop) heroDrop.textContent = settings.heroDrop || '';
  if (heroTitle) {
    const parts = (settings.heroTitle || 'WEAR YOUR ATTITUDE.').split(' ');
    const mid = Math.ceil(parts.length / 2);
    heroTitle.innerHTML = `${parts.slice(0, mid).join(' ')}<br><span class="accent">${parts.slice(mid).join(' ')}</span>`;
  }
  if (heroSubtitle) heroSubtitle.textContent = settings.heroSubtitle || '';
  if (aboutTitle) aboutTitle.textContent = settings.aboutTitle || '';
  if (aboutText) aboutText.textContent = settings.aboutText || '';
  if (count) count.textContent = `${products.length} PRODUCTS`;
}

function renderProducts(list) {
  const grid = $('products-grid');
  const data = list || products;
  if (!grid) return;

  if (!data.length) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--tees-muted);font-weight:700;">لا توجد منتجات متطابقة مع البحث 🔍</p>';
    return;
  }

  const activeCat = window.activeFilter || 'all';

  grid.innerHTML = data.map((p, idx) => {
    const badgeHtml = p.badge
      ? `<div class="ot-card-badge ${p.badge === 'NEW' ? 'badge-new' : p.badge === 'BESTSELLER' ? 'badge-best' : 'badge-sold'}">${escapeHtml(p.badge)}</div>`
      : '';
    const imgSrc = (p.image || (p.images && p.images[0])) || '';
    const sizes = (p.sizes && p.sizes.length) ? p.sizes : (settings.sizes || ['S','M','L','XL']);
    const soldCls = p.soldOut ? ' sold-out' : '';
    const catAttr = p.types && p.types.length ? `data-cat="${escapeHtml(p.types[0])}"` : '';
    const visibility = (activeCat !== 'all' && p.types && p.types.length && !p.types.some(t => t === activeCat || tMap(t) === activeCat))
      ? 'style="display:none"' : '';
    return `
      <div class="ot-card${soldCls}" data-id="${p.id}" ${catAttr} ${visibility}>
        ${badgeHtml}
        <div class="ot-card-img">
          ${imgSrc ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(p.name || 'Our Tee')}" loading="lazy">` : `<div class="ot-tee-mock" style="background:var(--tees-card);color:var(--tees-yellow)">OT</div>`}
          ${p.soldOut ? '' : `
          <div class="ot-card-actions">
            <button class="ot-card-act" data-act="view" data-id="${p.id}" aria-label="عرض سريع" title="عرض سريع">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="ot-card-act" data-act="cart" data-id="${p.id}" aria-label="أضف إلى السلة" title="أضف إلى السلة">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            </button>
          </div>`}
        </div>
        <div class="ot-card-info">
          <div class="ot-card-type">${p.types && p.types[0] ? escapeHtml(p.types[0]) : ''}</div>
          <div class="ot-card-name">${escapeHtml(p.name || '')}</div>
          <div class="ot-card-desc" style="font-size:12px;color:var(--tees-muted);margin-bottom:4px;">${escapeHtml(p.description || '')}</div>
          <div class="ot-card-price-row">
            <span class="ot-card-price">${fmtLocalPrice(p.price)}</span>
            <div class="ot-card-sizes">
              ${sizes.map(s => `<span class="ot-size">${escapeHtml(s)}</span>`).join('')}
            </div>
          </div>
        </div>
        ${p.soldOut ? '' : `<button class="ot-card-order" data-id="${p.id}">ORDER NOW →</button>`}
      </div>`;
  }).join('');

  grid.querySelectorAll('.ot-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.ot-card-order')) return;
      const id = card.dataset.id;
      const p = products.find(x => x.id === id);
      if (p && !p.soldOut) openOrderModal(id);
    });
  });

  grid.querySelectorAll('.ot-card-order').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (id) openOrderModal(id);
    });
  });

  grid.querySelectorAll('.ot-card-act').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const p = products.find(x => x.id === id);
      if (!p || p.soldOut) return;
      if (btn.dataset.act === 'cart') {
        const size = (p.sizes && p.sizes[0]) || (settings.sizes && settings.sizes[0]) || 'M';
        const type = (p.types && p.types[0]) || '';
        addToCart(p, size, type, 1);
        toggleCartDrawer();
      } else {
        openOrderModal(id);
      }
    });
  });
}

function tMap(type) {
  const map = { 'قطن كلاسيك': 'cotton', 'فينتاج': 'vintage', 'بريميوم': 'premium', 'oversized': 'oversized' };
  return map[type] || type;
}

/* ── Search & Filter ── */
function filterStoreProducts() {
  const q = ($('store-search')?.value || '').toLowerCase().trim();
  if (!q) return sortStoreProducts();
  const filtered = products.filter(p =>
    (p.name && p.name.toLowerCase().includes(q)) ||
    (p.description && p.description.toLowerCase().includes(q))
  );
  const count = $('product-count');
  if (count) count.textContent = `${filtered.length} PRODUCTS`;
  renderProducts(filtered);
}

function sortStoreProducts() {
  const sort = $('store-sort')?.value || 'default';
  const list = [...products];
  const count = $('product-count');
  if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
  else if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (count) count.textContent = `${list.length} PRODUCTS`;
  renderProducts(list);
}

/* ── Order Modal ── */
function openOrderModal(productId) {
  selectedProduct = products.find(p => p.id === productId);
  if (!selectedProduct) return;

  galleryImages = [];
  if (Array.isArray(selectedProduct.images) && selectedProduct.images.length) {
    galleryImages = selectedProduct.images.filter(Boolean);
  }
  if (!galleryImages.length && selectedProduct.image) {
    galleryImages = [selectedProduct.image];
  }

  currentGalleryIndex = 0;
  updateModalGallery();

  const view3dBtn = $('view-btn-3d');
  if (view3dBtn) view3dBtn.style.display = getCurrentProductImage() ? '' : 'none';

  $('modal-product-name').textContent = selectedProduct.name || '';
  $('modal-product-desc').textContent = selectedProduct.description || '';
  $('modal-product-price').textContent = fmtLocalPrice(selectedProduct.price);
  const addPrice = $('add-cart-price');
  if (addPrice) addPrice.textContent = fmtLocalPrice(selectedProduct.price);

  // Type dropdown
  const typeSelect = $('order-type');
  const availableTypes = (selectedProduct.types && selectedProduct.types.length) ? selectedProduct.types : (settings.types || ['قطن كلاسيك']);
  typeSelect.innerHTML = availableTypes.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');

  // Size pills
  const sizeContainer = $('order-size-pills');
  const hiddenSize = $('order-size');
  const availableSizes = (selectedProduct.sizes && selectedProduct.sizes.length) ? selectedProduct.sizes : (settings.sizes || ['S', 'M', 'L', 'XL', 'XXL']);
  if (hiddenSize) hiddenSize.value = availableSizes[0] || 'L';
  if (sizeContainer) {
    sizeContainer.innerHTML = availableSizes.map((s, idx) =>
      `<div class="size-pill ${idx === 0 ? 'active' : ''}" data-size="${escapeHtml(s)}" onclick="selectSize(this, '${escapeHtml(s)}')">${escapeHtml(s)}</div>`
    ).join('');
  }

  // Reset form
  const form = $('order-form');
  if (form) form.reset();
  if (hiddenSize) hiddenSize.value = availableSizes[0] || 'L';
  const orderError = $('order-error');
  if (orderError) orderError.textContent = '';
  const orderSuccess = $('order-success');
  if (orderSuccess) orderSuccess.classList.add('hidden');
  if (form) form.classList.remove('hidden');

  const modal = $('order-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('active');
  }
  document.body.style.overflow = 'hidden';
  setQuickViewMode('photos');
}

function selectSize(el, size) {
  document.querySelectorAll('.size-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const hidden = $('order-size');
  if (hidden) hidden.value = size;
}

function closeOrderModal() {
  const modal = $('order-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.classList.add('hidden');
  }
  document.body.style.overflow = '';
  selectedProduct = null;
  quickViewGen++;
  if (teeViewer) { teeViewer.dispose(); teeViewer = null; }
  teeViewerLoading = null;
  setQuickViewMode('photos');
}

let teeViewer = null;
let teeViewerLoading = null;
let quickViewMode = 'photos';
let quickViewGen = 0;

function setQuickViewMode(mode) {
  if (mode !== '3d' && mode !== 'photos') mode = 'photos';
  if (mode === '3d' && !getCurrentProductImage()) return;
  quickViewMode = mode;
  const mainImg = $('modal-product-img');
  const stage = $('tee3d-stage');
  const btnPhotos = $('view-btn-photos');
  const btn3d = $('view-btn-3d');
  const show3d = mode === '3d' && !!selectedProduct;
  if (mainImg) mainImg.style.display = show3d ? 'none' : '';
  if (stage) stage.style.display = show3d ? 'block' : 'none';
  if (btnPhotos) btnPhotos.classList.toggle('active', !show3d);
  if (btn3d) btn3d.classList.toggle('active', show3d);
  if (!show3d) return;
  if (!teeViewerLoading) {
    const gen = quickViewGen;
    teeViewerLoading = import('./tee3d.js')
      .then((m) => new m.TeeViewer(stage))
      .then(async (v) => {
        if (gen !== quickViewGen) { v.dispose(); return; }
        teeViewer = v;
        try { await v.init(); }
        catch {
          if (gen !== quickViewGen) { v.dispose(); if (teeViewer === v) teeViewer = null; return; }
          teeViewerLoading = null;
          v.dispose();
          if (teeViewer === v) teeViewer = null;
          stage.querySelectorAll('canvas').forEach((c) => c.remove());
          showCartNotification('تعذر تحميل المجسم');
          setQuickViewMode('photos');
          return;
        }
        if (gen !== quickViewGen) { v.dispose(); if (teeViewer === v) teeViewer = null; return; }
        if (quickViewMode === '3d') v.setImage(getCurrentProductImage());
      })
      .catch(() => {
        if (gen !== quickViewGen) return;
        teeViewerLoading = null;
        showCartNotification('تعذر تحميل المجسم');
        setQuickViewMode('photos');
      });
  } else if (teeViewer) {
    teeViewer.setImage(getCurrentProductImage());
  }
}

function getCurrentProductImage() {
  if (!selectedProduct) return '';
  if (Array.isArray(selectedProduct.images) && selectedProduct.images.length) return selectedProduct.images[0];
  return selectedProduct.image || '';
}

function updateModalGallery() {
  const mainImg = $('modal-product-img');
  const counter = $('gallery-counter');
  const navBar = $('gallery-nav-bar');
  const thumbsContainer = $('modal-gallery-thumbs');

  if (!galleryImages || !galleryImages.length) return;
  if (currentGalleryIndex >= galleryImages.length) currentGalleryIndex = 0;

  if (mainImg) {
    mainImg.src = galleryImages[currentGalleryIndex];
    mainImg.alt = selectedProduct ? (selectedProduct.name || 'منتج') : 'منتج';
  }

  if (galleryImages.length > 1) {
    if (navBar) navBar.style.display = 'flex';
    if (counter) counter.textContent = `${currentGalleryIndex + 1} / ${galleryImages.length}`;
    if (thumbsContainer) {
      thumbsContainer.style.display = 'flex';
      thumbsContainer.innerHTML = galleryImages.map((img, idx) =>
        `<img src="${escapeHtml(img)}" class="gallery-thumb-item ${idx === currentGalleryIndex ? 'active' : ''}" onclick="setGalleryIdx(${idx})">`
      ).join('');
    }
  } else {
    if (navBar) navBar.style.display = 'none';
    if (thumbsContainer) thumbsContainer.style.display = 'none';
  }
}

function setGalleryIdx(idx) {
  if (idx >= 0 && idx < galleryImages.length) { currentGalleryIndex = idx; updateModalGallery(); }
}
function nextGalleryImg() { if (galleryImages.length) { currentGalleryIndex = (currentGalleryIndex + 1) % galleryImages.length; updateModalGallery(); } }
function prevGalleryImg() { if (galleryImages.length) { currentGalleryIndex = (currentGalleryIndex - 1 + galleryImages.length) % galleryImages.length; updateModalGallery(); } }

function validatePhone(phone) {
  return /^(05|5)[0-9]{8}$/.test(phone.replace(/\s/g, ''));
}

async function submitOrder(e) {
  e.preventDefault();
  const errorEl = $('order-error');
  const successEl = $('order-success');
  const form = $('order-form');
  const btn = $('order-submit');

  const size = $('order-size')?.value;
  if (!size) { errorEl.textContent = 'يرجى اختيار مقاس التيشيرت'; return; }

  const name = $('order-name')?.value.trim();
  if (!name || name.length < 2) { errorEl.textContent = 'يرجى إدخال الاسم الكامل'; return; }

  const phone = $('order-phone')?.value.trim();
  if (!validatePhone(phone)) { errorEl.textContent = 'يرجى إدخال رقم هاتف صحيح (05XXXXXXXX)'; return; }

  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = '⏳ جاري إرسال الطلب...';

  try {
    await API.submitOrder({
      productId: selectedProduct.id,
      type: $('order-type')?.value || '',
      size,
      customerName: name,
      phone,
      address: $('order-address')?.value.trim(),
      notes: $('order-notes')?.value.trim(),
    });
    form.classList.add('hidden');
    successEl.classList.remove('hidden');
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '🛒 إرسال الطلب إلى السلة';
  }
}

/* ── Quick Chat Chips ── */
function sendQuickChip(text) {
  sendChatMsg(text);
}

/* ── AI Chat (Tez) ── */
function initTezChat() {
  const drawer = $('tez-drawer');
  const overlay = $('tez-overlay');
  const form = $('tez-chat-form');
  const headerName = $('tez-name-header');

  if (headerName && settings.aiName) headerName.textContent = `${settings.aiName} AI`;

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer && !drawer.classList.contains('hidden')) {
      drawer.classList.add('hidden');
      overlay?.classList.add('hidden');
    }
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('tez-input');
    const text = input?.value.trim();
    if (!text) return;
    input.value = '';
    await sendChatMsg(text);
  });
}

/* ── العمر (حتى يوصيك Tez بالمقاس الصحيح) ── */
function getSavedAge() {
  try { return localStorage.getItem('azma_age') || ''; } catch (e) { return ''; }
}

function captureAgeFromText(text) {
  if (getSavedAge() || !text) return null;
  const pure = text.trim().match(/^(\d{1,2})$/);
  const phrased = text.match(/(?:عمري|عندي|أنا|انا)\s*(\d{1,2})\s*(?:سنة|سنين|عام|سنوات)?/i);
  const numStr = pure ? pure[1] : (phrased ? phrased[1] : null);
  if (!numStr) return null;
  const n = parseInt(numStr, 10);
  if (n >= 8 && n <= 99) {
    try { localStorage.setItem('azma_age', String(n)); } catch (e) {}
    return n;
  }
  return null;
}

async function sendChatMsg(text) {
  addChatMsg(text, 'user');
  chatHistory.push({ sender: 'user', text });

  const typingId = addChatMsg('💭 جاري التفكير...', 'ai', true);
  const sendBtn = $('tez-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    captureAgeFromText(text);
    const userName = (typeof currentUser !== 'undefined' && currentUser && currentUser.name)
      ? currentUser.name : '';
    const userEmail = (typeof currentUser !== 'undefined' && currentUser && currentUser.email)
      ? currentUser.email : '';
    const userAge = getSavedAge();
    const res = await API.sendChat(text, chatHistory, { name: userName, email: userEmail, age: userAge });
    removeChatMsg(typingId);
    const reply = res.reply || 'عفواً، لم أستطع فهم ذلك.';
    addChatMsg(reply, 'ai');
    chatHistory.push({ sender: 'ai', text: reply });
    const suggestions = (res.structured && res.structured.suggestions) || [];
    if (Array.isArray(suggestions) && suggestions.length) renderSuggestionChips(suggestions);
  } catch {
    removeChatMsg(typingId);
    addChatMsg('عذراً، حدث خطأ. حاول مرة أخرى!', 'ai');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function renderSuggestionChips(suggestions) {
  const container = $('tez-messages');
  if (!container || !suggestions.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'tez-suggestion-row';
  suggestions.slice(0, 4).forEach(q => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tez-chip';
    chip.textContent = q;
    chip.addEventListener('click', () => {
      if (typeof sendQuickChip === 'function') sendQuickChip(q);
    });
    wrap.appendChild(chip);
  });
  container.appendChild(wrap);
  const body = $('tez-chat-body');
  if (body) body.scrollTop = body.scrollHeight;
}

function addChatMsg(text, sender, isTyping = false) {
  const container = $('tez-messages');
  if (!container) return;
  const id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  const bubble = document.createElement('div');
  bubble.id = id;
  bubble.className = `msg-bubble ${sender === 'ai' ? 'msg-tez' : 'msg-user'}`;
  bubble.textContent = text;
  if (isTyping) { bubble.style.opacity = '0.7'; bubble.style.fontStyle = 'italic'; }
  container.appendChild(bubble);
  const body = $('tez-chat-body');
  if (body) body.scrollTop = body.scrollHeight;
  return id;
}

function removeChatMsg(id) { const el = $(id); if (el) el.remove(); }

/* ── Live product sync (silent — no reload, no flicker) ── */
let lastProductsSignature = '';
let liveSyncRunning = false;

function productsSignature(list) {
  return (list || []).map(p =>
    `${p.id}|${p.name}|${p.price}|${p.soldOut ? '1' : '0'}|${p.image || ''}|${(p.types || []).join(',')}`
  ).join('~');
}

function showNewProductsToast() {
  const existing = document.querySelector('.cart-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'cart-toast';
  toast.textContent = '🆕 منتجات جديدة أضيفت للمتجر!';
  toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%) translateY(20px);z-index:9999;background:var(--color-foreground);color:var(--color-background);border:2px solid var(--color-border);padding:12px 24px;border-radius:12px;font-weight:700;font-size:14px;box-shadow:6px 6px 0 var(--color-border);opacity:0;transition:all 0.3s cubic-bezier(0.16,1,0.3,1);';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; }, 10);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

async function syncProductsSilently() {
  if (liveSyncRunning || document.visibilityState === 'hidden') return;
  liveSyncRunning = true;
  try {
    const fresh = await API.getProducts();
    const sig = productsSignature(fresh);
    if (sig === lastProductsSignature) return;
    const prevCount = products.length;
    products = fresh;
    lastProductsSignature = sig;
    const q = ($('store-search')?.value || '').trim();
    if (q) filterStoreProducts(); else sortStoreProducts();
    if (fresh.length > prevCount) showNewProductsToast();
  } catch {
    /* keep current data; retry on next tick */
  } finally {
    liveSyncRunning = false;
  }
}

function startLiveSync() {
  lastProductsSignature = productsSignature(products);
  setInterval(syncProductsSilently, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncProductsSilently();
  });
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  initStore().then(startLiveSync);
  initTezChat();
  updateCartUI();

  $('order-form')?.addEventListener('submit', submitOrder);
  $('modal-close')?.addEventListener('click', closeOrderModal);
  $('modal-overlay')?.addEventListener('click', closeOrderModal);
  $('order-done')?.addEventListener('click', closeOrderModal);
  $('gallery-prev-btn')?.addEventListener('click', prevGalleryImg);
  $('gallery-next-btn')?.addEventListener('click', nextGalleryImg);

  // Gallery touch swipe
  const galleryContainer = document.querySelector('.modal-gallery-container');
  let touchX = 0;
  galleryContainer?.addEventListener('touchstart', e => { touchX = e.changedTouches[0].screenX; }, { passive: true });
  galleryContainer?.addEventListener('touchend', e => {
    const diff = touchX - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 40) diff > 0 ? nextGalleryImg() : prevGalleryImg();
  }, { passive: true });

  document.addEventListener('keydown', e => {
    const modal = $('order-modal');
    if (e.key === 'Escape') closeOrderModal();
    if (modal && !modal.classList.contains('hidden')) {
      if (e.key === 'ArrowRight') nextGalleryImg();
      if (e.key === 'ArrowLeft') prevGalleryImg();
    }
  });

  // Theme
  (function() {
    const toggle = $('theme-toggle');
    if (!toggle) return;
    const saved = localStorage.getItem('azma_theme');
    if (saved === 'light') { document.body.classList.add('light'); toggle.checked = true; }
    toggle.addEventListener('change', function() {
      document.body.classList.toggle('light', this.checked);
      localStorage.setItem('azma_theme', this.checked ? 'light' : 'dark');
    });
  })();
});
