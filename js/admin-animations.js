/* AZMA — Admin Panel GSAP Animation Layer
   طبقة إضافة خالصة: لا تعدّل js/admin.js ولا السكربت المدمج في admin.html.
   تملك: دخول البانلات، عدّادات الإحصائيات، خروج التوست، دخول الصفوف الديناميكية،
   نبضة زر الحفظ، ودخول أولي خفيف للسايدبار/الهيدر.
   AOS + CSS يبقيان ملكية الظهور الأول للوحة الرئيسية وبطاقات الإعدادات.
   GSAP يُحمّل من assets/vendor/gsap.min.js (نسخة محلية — لا node_modules في الديستوب). */

const gsap = typeof window !== 'undefined' && window.gsap ? window.gsap : null;

/* ── Pure helpers (قابلة للاختبار في node عبر vitest) ── */

export function parseCounterHTML(html) {
  const m = String(html || '').match(/^([\d.,]+)/);
  if (!m) return { prefix: '', value: NaN, suffix: html || '' };
  return { prefix: m[1], value: parseFloat(m[1].replace(/,/g, '')), suffix: html.slice(m[1].length) };
}

export function shouldSkipAnimations(reducedMotion) {
  return !!reducedMotion;
}

export function getDecimalPlaces(prefix) {
  const m = String(prefix || '').match(/\.(\d+)$/);
  return m ? m[1].length : 0;
}

/* إعدادات رسم Chart.js: الخط يرسم من الأسفل والنقاط تظهر متتابعة (index × 60ms) */
export function buildChartAnimationConfig(reducedMotion) {
  if (reducedMotion) return { animation: false };
  return {
    animation: {
      duration: 900,
      easing: 'easeOutQuart',
      delay: (ctx) => (ctx.type === 'point' ? (ctx.dataIndex || 0) * 60 : 0),
    },
    animations: {
      y: { from: (ctx) => (ctx.chart && ctx.chart.chartArea ? ctx.chart.chartArea.bottom : 0) },
    },
  };
}

/* ── Config ── */

const DUR = { card: 0.45, row: 0.35, counter: 0.8, toast: 0.22, entrance: 0.5 };

const DYNAMIC_CONTAINERS = [
  '#products-grid',
  '#admin-orders-list',
  '#likes-per-product',
  '#dashboard-recent-orders',
  '#dashboard-top-products',
];

const COUNTER_TARGETS = [
  '#stat-products',
  '#stat-orders',
  '#stat-pending',
  '#stat-revenue',
  '#sidebar-products-count',
  '#sidebar-orders-count',
];

const PANEL_CARD_SELECTOR = ':scope > .card, :scope > .stats-grid, :scope > .grid-2, :scope > form > .settings-wrap';

/* ── Entry ── */

function animateEntrance() {
  const groups = Array.from(document.querySelectorAll('.sidebar-logo, .sidebar-group, .sidebar-footer'));
  if (groups.length) {
    gsap.fromTo(
      groups,
      { opacity: 0, y: 10 },
      {
        opacity: 1,
        y: 0,
        duration: DUR.entrance,
        ease: 'power2.out',
        stagger: 0.06,
        delay: 0.05,
        clearProps: 'opacity,transform',
      }
    );
  }
  const header = document.querySelector('.main-header');
  if (header) {
    gsap.fromTo(
      header,
      { opacity: 0, y: -12 },
      { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', delay: 0.05, clearProps: 'opacity,transform' }
    );
  }
}

/* ── Panel switching (MutationObserver على class — لا تعديل لـ switchPanel) ── */

function setupPanelObserver() {
  const main = document.querySelector('.main');
  if (!main) return;
  let current = document.querySelector('.panel.active')?.id || null;
  const mo = new MutationObserver(() => {
    const active = document.querySelector('.panel.active');
    const id = active?.id || null;
    if (!active || id === current) return;
    current = id;
    animatePanelEnter(active);
    if (id === 'panel-dashboard') replayGrowthChart();
  });
  mo.observe(main, { attributes: true, attributeFilter: ['class'], subtree: true });
}

function animatePanelEnter(panel) {
  const cards = Array.from(panel.querySelectorAll(PANEL_CARD_SELECTOR));
  if (!cards.length) return;
  cards.forEach((c) => c.removeAttribute('data-aos'));
  gsap.killTweensOf(cards);
  gsap.fromTo(
    cards,
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: DUR.card, ease: 'power2.out', stagger: 0.08, clearProps: 'opacity,transform' }
  );
}

/* إعادة تشغيل رسم الطلبات عند دخول لوحة التحكم (Chart.js reset + update يعيدان الأنميشن) */
function replayGrowthChart() {
  if (typeof growthChart === 'undefined' || !growthChart) return;
  gsap.delayedCall(0.15, () => {
    growthChart.reset();
    growthChart.update();
  });
}

/* ── Dynamic rows (منتجات/طلبات/لايكات/آخر الطلبات/الأكثر مبيعاً) ── */

function setupContainerObservers() {
  DYNAMIC_CONTAINERS.forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const mo = new MutationObserver((recs) => {
      let added = false;
      for (const r of recs) {
        for (const n of r.addedNodes) {
          if (n.nodeType === 1 && n.children.length) {
            added = true;
            break;
          }
        }
        if (added) break;
      }
      if (added) animateRows(el);
    });
    mo.observe(el, { childList: true });
  });
}

function animateRows(container) {
  const items = Array.from(container.children).filter(
    (c) => c.nodeType === 1 && !(c.classList && c.classList.contains('empty-state'))
  );
  if (!items.length) return;
  gsap.killTweensOf(items);
  gsap.fromTo(
    items,
    { opacity: 0, y: 12 },
    {
      opacity: 1,
      y: 0,
      duration: DUR.row,
      ease: 'power2.out',
      stagger: { each: 0.04 },
      clearProps: 'opacity,transform',
    }
  );
}

/* ── Stat counters (0 → value مع الحفاظ على لاحقة HTML) ── */

const counterState = new WeakMap();
const animating = new WeakSet();

function setupCounterObservers() {
  COUNTER_TARGETS.forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const mo = new MutationObserver(() => {
      if (animating.has(el)) return;
      const { prefix, value, suffix } = parseCounterHTML(el.innerHTML);
      if (!Number.isFinite(value)) return;
      if (counterState.get(el) === value) return;
      runCounter(el, prefix, value, suffix);
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
  });
}

function runCounter(el, prefix, value, suffix) {
  const decimals = getDecimalPlaces(prefix);
  animating.add(el);
  const state = { n: 0 };
  gsap.to(state, {
    n: value,
    duration: DUR.counter,
    ease: 'power2.out',
    onUpdate() {
      el.innerHTML = state.n.toFixed(decimals) + suffix;
    },
    onComplete() {
      animating.delete(el);
      counterState.set(el, value);
    },
  });
}

/* ── Toast exit (CSS toastIn يملك الدخول، GSAP يملك الخروج) ── */

function setupToastObserver() {
  const t = document.getElementById('toast');
  if (!t) return;
  const mo = new MutationObserver(() => {
    if (t._skipOnce) {
      t._skipOnce = false;
      return;
    }
    if (t.style.display === 'none') {
      t.style.display = 'block';
      gsap.killTweensOf(t);
      gsap.fromTo(
        t,
        { opacity: 1, y: 0 },
        {
          opacity: 0,
          y: -10,
          duration: DUR.toast,
          ease: 'power2.in',
          onComplete() {
            t._skipOnce = true;
            t.style.display = 'none';
            gsap.set(t, { clearProps: 'opacity,transform' });
          },
        }
      );
    }
  });
  mo.observe(t, { attributes: true, attributeFilter: ['style'] });
}

/* ── Save success pulse (عبر نص التوست "تم حفظ") ── */

function setupToastPulse() {
  const t = document.getElementById('toast');
  if (!t) return;
  const mo = new MutationObserver(() => {
    if (!/تم حفظ/.test(t.textContent || '')) return;
    const btn = document.querySelector('.panel.active [type="submit"]');
    if (!btn) return;
    gsap.killTweensOf(btn);
    gsap.fromTo(
      btn,
      { scale: 1 },
      { scale: 1.04, duration: 0.14, ease: 'power1.out', yoyo: true, repeat: 1, clearProps: 'scale' }
    );
  });
  mo.observe(t, { childList: true, characterData: true, subtree: true });
}

/* ── Page title swap ── */

function setupTitleObserver() {
  const title = document.getElementById('page-title');
  if (!title) return;
  const mo = new MutationObserver(() => {
    gsap.killTweensOf(title);
    gsap.fromTo(
      title,
      { opacity: 0.35, y: 5 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', clearProps: 'opacity,transform' }
    );
  });
  mo.observe(title, { childList: true });
}

/* ── Init ── */

export function initAdminAnimations() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  if (!gsap) return null;
  if (shouldSkipAnimations(window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return null;
  animateEntrance();
  setupPanelObserver();
  setupContainerObservers();
  setupCounterObservers();
  setupToastObserver();
  setupToastPulse();
  setupTitleObserver();
  return { active: true };
}

if (typeof window !== 'undefined') {
  window.adminAnimations = { buildChartAnimationConfig };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initAdminAnimations, { once: true });
  else initAdminAnimations();
}
