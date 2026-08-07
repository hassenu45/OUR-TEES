/* AZMA - Landing Page Controller
   Renders hero, stats and drops from real store data (API or localStorage fallback). */

(function (global) {
  'use strict';

  const PLACEHOLDER =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">' +
        '<rect width="600" height="400" fill="#161616"/>' +
        '<text x="50%" y="50%" fill="#888884" font-family="Arial, sans-serif" font-size="34" text-anchor="middle" dominant-baseline="middle">AZMA</text>' +
        '</svg>'
    );

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function splitHeroTitle(text) {
    if (!text) return [];
    const words = String(text).trim().replace(/\s+/g, ' ').split(' ');
    if (words.length === 1 && words[0] === '') return [];
    if (words.length <= 3) return words;
    const lines = [];
    const base = Math.floor(words.length / 3);
    const rem = words.length % 3;
    const sizes = [];
    for (let i = 0; i < 3; i++) sizes.push(base + (i < rem ? 1 : 0));
    let idx = 0;
    for (let j = 0; j < 3; j++) {
      lines.push(words.slice(idx, idx + sizes[j]).join(' '));
      idx += sizes[j];
    }
    return lines;
  }

  function getAvailableProducts(products) {
    return (products || [])
      .filter((p) => !p.soldOut)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function formatPriceText(price, symbol) {
    return (parseFloat(price) || 0).toFixed(2) + ' ' + (symbol || 'د.أ');
  }

  function $(id) {
    return document.getElementById(id);
  }

  function renderHero(settings, available) {
    const badge = $('hero-badge');
    if (badge) badge.innerHTML = '<i></i> ' + escapeHtml(settings.heroBadge || 'NEW DROP');

    const title = $('hero-title');
    if (title) {
      const lines = splitHeroTitle(settings.heroTitle || 'WEAR YOUR STORY');
      title.innerHTML = lines.map((line) => '<span class="line"><span>' + escapeHtml(line) + '</span></span>').join('');
    }

    const sub = $('hero-sub');
    if (sub) sub.textContent = settings.heroSubtitle || '';

    const visual = $('hero-visual');
    const img = $('hero-card-img');
    const name = $('hero-card-name');
    const price = $('hero-card-price');
    const top = available[0];
    if (!top) {
      if (visual) visual.style.display = 'none';
      return;
    }
    if (img) {
      img.src = top.image || PLACEHOLDER;
      img.onerror = function () {
        img.src = PLACEHOLDER;
      };
      img.alt = top.name || 'AZMA';
    }
    if (name) name.textContent = String(top.name || '').toUpperCase();
    if (price) price.textContent = formatPriceText(top.price, settings.currencySymbol);
  }

  function setStat(id, value) {
    const el = $(id);
    if (!el) return;
    el.setAttribute('data-count', String(value));
    el.textContent = String(value);
  }

  function renderStats(settings, products) {
    setStat('stat-total', products.length);
    setStat('stat-available', getAvailableProducts(products).length);
    setStat('stat-sizes', (settings.sizes || []).length);
  }

  function observeDrops() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('#drops-grid .reveal').forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll('#drops-grid .reveal').forEach((el) => io.observe(el));
  }

  function renderDrops(products, symbol) {
    const grid = $('drops-grid');
    if (!grid) return;
    const available = getAvailableProducts(products);
    if (!available.length) {
      grid.innerHTML =
        '<div class="empty-state">' +
        '<p style="text-align:center;color:var(--tees-muted);font-size:13px;padding:24px;">' +
        'لا توجد منتجات متاحة حالياً — تابعنا لمفاجآت قادمة.</p></div>';
      return;
    }
    grid.innerHTML = available
      .map((p, i) => {
        const imgSrc = p.image || PLACEHOLDER;
        return (
          '<div class="drop-card reveal reveal-d' +
          ((i % 4) + 1) +
          '">' +
          '<div class="drop-media">' +
          '<img src="' +
          imgSrc +
          '" alt="' +
          escapeHtml(p.name || '') +
          '" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'' +
          PLACEHOLDER +
          '\'">' +
          (p.badge ? '<span class="drop-badge">' + escapeHtml(p.badge) + '</span>' : '') +
          '</div>' +
          '<div class="drop-body">' +
          '<div>' +
          '<div class="drop-name">' +
          escapeHtml(String(p.name || '').toUpperCase()) +
          '</div>' +
          '<div class="drop-desc">' +
          escapeHtml(p.description || '') +
          '</div>' +
          '</div>' +
          '<div class="drop-price">' +
          formatPriceText(p.price, symbol) +
          '</div>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');
    observeDrops();
  }

  async function init() {
    let settings;
    let products;
    try {
      settings = await API.getSettings();
      products = await API.getProducts();
    } catch (e) {
      return;
    }
    const available = getAvailableProducts(products);
    renderHero(settings, available);
    renderStats(settings, products);
    renderDrops(products, settings.currencySymbol);
  }

  const Landing = {
    splitHeroTitle,
    getAvailableProducts,
    formatPriceText,
    init,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Landing;
  if (global) global.Landing = Landing;
})(typeof window !== 'undefined' ? window : globalThis);
