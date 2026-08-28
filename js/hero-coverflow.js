/* AZMA - Hero Coverflow Gallery (vanilla JS, Originkit logic)
   Renders /api/products as a flowing 3D gallery replacing the static hero card.
   Autoplay every 2.5s + click to center + click active -> store. */

(function (global) {
  'use strict';

  const PERSPECTIVE = 1600;
  const SCALE_STEP = 0.16;
  const MAX_VISIBLE = 1;
  const DEPTH = 240;
  const AUTOPLAY_MS = 2500;
  const MOVE_MS = 600;

  const PLACEHOLDER =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">' +
        '<rect width="600" height="600" fill="#161616"/>' +
        '<text x="50%" y="50%" fill="#888884" font-family="Arial, sans-serif" font-size="40" text-anchor="middle" dominant-baseline="middle">AZMA</text>' +
        '</svg>'
    );

  const state = {
    products: [],
    active: 0,
    locked: false,
    timer: null,
    cards: [],
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function getAvailable(products) {
    return (products || []).filter((p) => !p.soldOut);
  }

  function setStat(id, value) {
    const el = $(id);
    if (!el) return;
    el.setAttribute('data-count', String(value));
    el.textContent = String(value);
  }

  function renderStats(products) {
    const sizes = new Set();
    (products || []).forEach((p) => (p.sizes || []).forEach((s) => sizes.add(s)));
    setStat('stat-total', (products || []).length);
    setStat('stat-available', getAvailable(products).length);
    setStat('stat-sizes', sizes.size);
  }

  function transformFor(index) {
    const n = state.products.length;
    let rel = index - state.active;
    const half = n / 2;
    if (rel > half) rel -= n;
    if (rel < -half) rel += n;
    const ax = Math.abs(rel);
    const scale = Math.max(0.4, 1 - ax * SCALE_STEP);
    const stageW = state.stageWidth || 420;
    const tx = rel * Math.min(170, stageW * 0.42);
    const tz = -ax * DEPTH;
    const ry = -rel * 14;
    const rz = rel * 8;
    return {
      visible: ax <= MAX_VISIBLE,
      transform: `translate(-50%, -50%) translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${scale})`,
    };
  }

  function applyPositions() {
    const n = state.products.length;
    state.cards.forEach((card, i) => {
      const t = transformFor(i);
      card.style.transform = t.transform;
      card.style.opacity = t.visible ? '1' : '0';
      card.style.pointerEvents = t.visible ? 'auto' : 'none';
      card.classList.toggle('is-active', i === state.active);
      const dim = card.querySelector('.card-dim');
      if (dim) dim.style.opacity = i === state.active ? '0' : String(0.26 * 0.75);
      card.setAttribute('aria-hidden', t.visible ? 'false' : 'true');
    });
  }

  function step(dir) {
    const n = state.products.length;
    if (state.locked || n < 2) return;
    state.locked = true;
    state.active = (((state.active + dir) % n) + n) % n;
    applyPositions();
    window.setTimeout(() => { state.locked = false; }, MOVE_MS + 60);
  }

  function stopAutoplay() {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function startAutoplay() {
    stopAutoplay();
    state.timer = window.setInterval(() => step(1), AUTOPLAY_MS);
  }

  function handleCardClick(i) {
    const n = state.products.length;
    if (state.locked || n < 2) return;
    if (i === state.active) {
      window.location.href = 'store.html';
      return;
    }
    state.locked = true;
    state.active = i;
    applyPositions();
    window.setTimeout(() => { state.locked = false; }, MOVE_MS + 60);
    startAutoplay();
  }

  function buildGallery(products) {
    const stage = $('hero-gallery-stage');
    const loading = $('hero-gallery-loading');
    if (!stage) return;
    const list = products && products.length ? products : [];
    if (!list.length) {
      if (loading) {
        loading.textContent = 'لا توجد منتجات حالياً';
        loading.style.display = 'flex';
      }
      return;
    }
    state.products = list;
    state.active = 0;
    state.cards = [];
    state.stageWidth = (stage.getBoundingClientRect().width || 420);
    window.addEventListener('resize', function () {
      state.stageWidth = (stage.getBoundingClientRect().width || 420);
      applyPositions();
    });

    stage.innerHTML = '';
    if (loading) loading.style.display = 'none';

    list.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', escapeHtml(p.name || 'AZMA'));
      card.setAttribute('aria-hidden', i > MAX_VISIBLE ? 'true' : 'false');

      const img = document.createElement('img');
      img.src = p.image || PLACEHOLDER;
      img.alt = escapeHtml(p.name || 'AZMA');
      img.draggable = false;
      img.decoding = 'async';
      img.onerror = function () { img.src = PLACEHOLDER; };

      const dim = document.createElement('div');
      dim.className = 'card-dim';

      card.appendChild(img);
      card.appendChild(dim);
      card.addEventListener('click', () => handleCardClick(i));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(i); }
      });
      stage.appendChild(card);
      state.cards.push(card);
    });

    applyPositions();
    startAutoplay();
  }

  async function init() {
    let products = [];
    try {
      const r = await fetch('/api/products', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('bad status ' + r.status);
      const json = await r.json();
      products = Array.isArray(json) ? json : json.products || [];
    } catch (e) {
      /* API down -> keep gallery empty state, stats stay 0 */
    }
    buildGallery(products);
    renderStats(products);
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { init };
  if (global) global.HeroCoverflow = { init };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', function () {
    if (window.HeroCoverflow) window.HeroCoverflow.init();
  });
}