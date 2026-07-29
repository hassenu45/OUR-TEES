/* Our Tees - Store Controller
   Features: Cart, Search, Filter, AI Chat, Gallery */

let settings = {};
let products = [];
let selectedProduct = null;
let cart = JSON.parse(localStorage.getItem('ourtees_cart') || '[]');
let chatHistory = [];
let currentGalleryIndex = 0;
let galleryImages = [];

/* ── Helpers ── */
function $(id) { return document.getElementById(id); }

/* ── Cart ── */
function saveCart() {
  localStorage.setItem('ourtees_cart', JSON.stringify(cart));
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
  const isOpen = !drawer.classList.contains('hidden');
  drawer.classList.toggle('hidden', isOpen);
  if (overlay) overlay.classList.toggle('hidden', isOpen);
  if (!isOpen) renderCartItems();
}

function renderCartItems() {
  const container = $('cart-items');
  const totalEl = $('cart-total');
  const statusEl = $('cart-status');
  const checkoutBtn = $('checkout-btn');

  if (!container) return;

  if (!cart.length) {
    container.innerHTML = '<p style="text-align:center;opacity:0.7;padding:var(--space-6);font-weight:bold;">السلة فارغة 🛒</p>';
    if (totalEl) totalEl.textContent = '0 ر.س';
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
        <div style="font-size:var(--text-sm);color:var(--color-accent);font-weight:bold;">${formatPrice(item.price * item.qty, settings.currencySymbol)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-1);">
        <button class="btn btn-sm" style="padding:2px 8px;font-size:14px;" onclick="updateCartQty('${item.key}', -1)">−</button>
        <span style="font-weight:bold;min-width:20px;text-align:center;">${item.qty}</span>
        <button class="btn btn-sm" style="padding:2px 8px;font-size:14px;" onclick="updateCartQty('${item.key}', 1)">+</button>
      </div>
      <button class="btn btn-sm btn-outline" style="padding:2px 8px;font-size:12px;color:var(--color-destructive);border-color:var(--color-destructive);" onclick="removeFromCart('${item.key}')">✕</button>
    </div>
  `).join('');

  if (totalEl) totalEl.textContent = formatPrice(getCartTotal(), settings.currencySymbol);
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
  document.title = `${settings.siteName || 'Our Tees'} — Store`;
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
    grid.innerHTML = '<p class="empty-state">لا توجد منتجات متطابقة مع البحث 🔍</p>';
    const count = $('product-count');
    if (count) count.textContent = `0 PRODUCTS`;
    return;
  }

  grid.innerHTML = data.map((p, idx) => {
    const badgeCls = p.badge === 'NEW' ? 'badge-accent' : p.badge === 'SOLD OUT' ? 'badge-muted' : 'badge-dark';
    const badge = p.badge ? `<span class="badge ${badgeCls}" style="position:absolute;top:12px;left:12px;z-index:2;">${escapeHtml(p.badge)}</span>` : '';
    const imgSrc = (p.image || (p.images && p.images[0])) || '';
    return `
      <article class="product-card${p.soldOut ? ' sold-out' : ''}" data-id="${p.id}" style="animation-delay:${idx * 0.1}s;">
        <div class="product-image-wrap">
          ${badge}
          <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(p.name || 'Our Tee')}" loading="lazy">
        </div>
        <h3 class="product-title">${escapeHtml(p.name || '')}</h3>
        <p class="product-desc">${escapeHtml(p.description || '')}</p>
        <p class="product-price">${formatPrice(p.price, settings.currencySymbol || 'ر.س')}</p>
        <button class="btn order-btn" data-id="${p.id}" ${p.soldOut ? 'disabled' : ''}>
          ${p.soldOut ? 'SOLD OUT' : 'ORDER NOW'}
        </button>
      </article>`;
  }).join('');

  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.order-btn')) return;
      const id = card.dataset.id;
      const p = products.find(x => x.id === id);
      if (p && !p.soldOut) openOrderModal(id);
    });
  });
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

  $('modal-product-name').textContent = selectedProduct.name || '';
  $('modal-product-desc').textContent = selectedProduct.description || '';
  $('modal-product-price').textContent = formatPrice(selectedProduct.price, settings.currencySymbol || 'ر.س');

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
  $('order-error').textContent = '';
  $('order-success').classList.add('hidden');
  if (form) form.classList.remove('hidden');

  const modal = $('order-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('active');
  }
  document.body.style.overflow = 'hidden';
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
  const sparkleBtn = document.querySelector('.sparkle-button');
  const drawer = $('tez-drawer');
  const overlay = $('tez-overlay');
  const closeBtn = $('tez-close-btn');
  const form = $('tez-chat-form');
  const headerName = $('tez-name-header');

  if (headerName && settings.aiName) headerName.textContent = `${settings.aiName} AI`;

  sparkleBtn?.addEventListener('click', e => {
    e.stopPropagation();
    const hidden = drawer?.classList.contains('hidden');
    if (hidden) {
      drawer?.classList.remove('hidden');
      if (!chatHistory.length) {
        const welcome = settings.aiWelcome || `أهلاً بك! أنا ${settings.aiName || 'Tez'}، المساعد الذكي. كيف يمكنني مساعدتك اليوم؟`;
        addChatMsg(welcome, 'ai');
      }
    } else {
      drawer?.classList.add('hidden');
    }
  });

  closeBtn?.addEventListener('click', () => drawer?.classList.add('hidden'));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer && !drawer.classList.contains('hidden')) {
      drawer.classList.add('hidden');
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

async function sendChatMsg(text) {
  addChatMsg(text, 'user');
  chatHistory.push({ sender: 'user', text });

  const typingId = addChatMsg('💭 جاري التفكير...', 'ai', true);
  const sendBtn = $('tez-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const res = await API.sendChat(text, chatHistory);
    removeChatMsg(typingId);
    const reply = res.reply || 'عفواً، لم أستطع فهم ذلك.';
    addChatMsg(reply, 'ai');
    chatHistory.push({ sender: 'ai', text: reply });
  } catch {
    removeChatMsg(typingId);
    addChatMsg('عذراً، حدث خطأ. حاول مرة أخرى!', 'ai');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
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

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  initStore();
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
    const body = document.body;
    if (!toggle) return;
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') { body.classList.add('dark'); toggle.checked = true; }
    toggle.addEventListener('change', function() {
      body.classList.toggle('dark', this.checked);
      localStorage.setItem('theme', this.checked ? 'dark' : 'light');
    });
  })();
});
