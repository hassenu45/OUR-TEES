# AZMA Settings Gold Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle all buttons in the AZMA Settings admin panel (admin.html) with a premium gold identity and strong GSAP-driven motion.

**Architecture:** Edit the source files only (`admin.html` inline styles, `js/admin-animations.js`, `tests/admin-animations.test.js`) — the desktop app's `desktop/web` folder is a generated copy rebuilt via `node desktop/scripts/build-web.mjs`. Pure JS helpers are added to admin-animations.js (testable via Vitest); CSS changes live in admin.html's inline `<style>`.

**Tech Stack:** Vanilla HTML/CSS/JS, GSAP (local `assets/vendor/gsap.min.js`), Vitest.

## Global Constraints

- Edit ONLY source files in the project root: `admin.html`, `js/admin-animations.js`, `tests/admin-animations.test.js`. Never hand-edit `desktop/web/` (it is overwritten by the build).
- No HTML structure changes and no functional JS logic changes — styling and animation additions only.
- No new libraries. GSAP is already loaded before `js/admin.js`.
- Respect `prefers-reduced-motion` in all new animation code.
- Must work in both dark mode (default) and `body.light`.
- Gold palette: `#F5C842` (light), `#E9B63C`, `#C9971E`, `#B8860B` (deep), text `#0C0A09`.
- Run `npm test` (Vitest) after each JS task; run `node desktop/scripts/build-web.mjs` at the end.

---
### Task 1: Gold gradient + shine + pulse for primary buttons

**Files:**
- Modify: `admin.html:427-466` (`.btn`, `.btn-accent`, `.btn-outline`, `.btn-danger`)
- Modify: `admin.html:840` (`.app-login-box button`)

**Interfaces:**
- Consumes: nothing
- Produces: CSS classes consumed by Task 5's visual verification (`.btn-accent.settings-save` continuous pulse)

- [ ] **Step 1: Replace the `.btn` / `.btn-accent` / `.btn-outline` / `.btn-danger` block**

In `admin.html`, replace lines 427-466 with:

```css
    .btn {
      position: relative;
      overflow: hidden;
      padding: 10px 22px;
      border-radius: 10px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      font-family: 'Montserrat', sans-serif;
      cursor: pointer;
      transition: all 0.3s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-accent {
      background: linear-gradient(135deg, #F5C842 0%, #E9B63C 40%, #C9971E 75%, #B8860B 100%);
      color: #0C0A09;
      box-shadow: 0 8px 24px -8px rgba(245,200,66,0.45), inset 0 1px 0 rgba(255,255,255,0.35);
    }
    .btn-accent::after {
      content: '';
      position: absolute;
      top: 0; left: -80%;
      width: 50%; height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
      transform: skewX(-20deg);
      transition: left 0.6s ease;
      pointer-events: none;
    }
    .btn-accent:hover::after { left: 130%; }
    .btn-accent:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 32px -8px rgba(245,200,66,0.65), inset 0 1px 0 rgba(255,255,255,0.4);
    }
    .btn-accent:active { transform: scale(0.96); }
    .btn-accent.settings-save { animation: goldPulse 2.2s ease-in-out infinite; }
    @keyframes goldPulse {
      0%, 100% { box-shadow: 0 8px 24px -8px rgba(245,200,66,0.45); }
      50% { box-shadow: 0 10px 36px -6px rgba(245,200,66,0.8); }
    }
    .btn-outline {
      border: 1px solid rgba(245,200,66,0.35);
      background: transparent;
      color: #E9B63C;
    }
    .btn-outline:hover {
      border-color: #F5C842;
      color: #F5C842;
      background: rgba(245,200,66,0.08);
      box-shadow: 0 6px 20px -8px rgba(245,200,66,0.4);
    }
    .btn-sm { padding: 7px 14px; font-size: 12px; }
    .btn-full { width: 100%; justify-content: center; }
    .btn-danger {
      background: rgba(220,38,38,0.1);
      color: #FCA5A5;
      border: 1px solid rgba(220,38,38,0.18);
    }
    .btn-danger:hover {
      background: rgba(220,38,38,0.2);
      box-shadow: 0 6px 20px -8px rgba(220,38,38,0.55);
    }
    .btn-ripple {
      position: absolute;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,0.55), rgba(255,255,255,0));
      pointer-events: none;
      z-index: 1;
      transform: translateZ(0);
    }
```

- [ ] **Step 2: Upgrade the login button**

In `admin.html:840`, replace the `.app-login-box button` rule with:

```css
      .app-login-box button{width:100%;background:linear-gradient(135deg,#F5C842 0%,#E9B63C 40%,#C9971E 75%,#B8860B 100%);color:#0C0A09;border:none;border-radius:10px;font-family:'Montserrat',sans-serif;font-weight:700;font-size:14px;padding:13px;cursor:pointer;box-shadow:0 8px 24px -8px rgba(245,200,66,.45);transition:transform .2s ease,box-shadow .2s ease}
      .app-login-box button:hover{transform:translateY(-1px);box-shadow:0 10px 30px -8px rgba(245,200,66,.6)}
      .app-login-box button:active{transform:scale(.97)}
```

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: all existing tests PASS (no JS changed yet).

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "style(admin): premium gold buttons — gradient, shine sweep, pulse, press"
```

---
### Task 2: Gold modal-close, light-theme overrides

**Files:**
- Modify: `admin.html:614-630` (`.modal-close`)
- Modify: `admin.html:822-823` (`body.light .modal-close`)
- Modify: `admin.html:936-937` (`body.light .btn-outline`)

**Interfaces:**
- Consumes: Task 1's gold palette
- Produces: light/dark parity required by Global Constraints

- [ ] **Step 1: Update `.modal-close`**

In `admin.html:614-630`, change the transition line and the hover rule:

```css
    .modal-close {
      position: absolute;
      top: 12px; left: 12px;
      width: 32px; height: 32px;
      border-radius: 8px;
      border: none;
      background: rgba(250,250,249,0.05);
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(250,250,249,0.4);
      transition: background 0.2s ease, color 0.2s ease, transform 0.25s ease;
    }
    .modal-close:hover {
      background: rgba(245,200,66,0.12);
      color: #F5C842;
      transform: rotate(90deg);
    }
```

- [ ] **Step 2: Update light-theme overrides**

Replace `admin.html:822-823`:

```css
    body.light .modal-close { background: rgba(0,0,0,0.04); color: rgba(28,25,23,0.3); }
    body.light .modal-close:hover { background: rgba(161,98,7,0.1); color: #A16207; }
```

Replace `admin.html:936-937`:

```css
    body.light .btn-outline { border-color: rgba(161,98,7,0.35); color: #92400E; }
    body.light .btn-outline:hover { border-color: #A16207; color: #A16207; background: rgba(161,98,7,0.06); box-shadow: 0 6px 20px -8px rgba(161,98,7,0.35); }
```

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "style(admin): gold modal-close hover and light-theme button parity"
```

---
### Task 3: Pure helpers for button motion (TDD — RED)

**Files:**
- Test: `tests/admin-animations.test.js` (append two describe blocks)
- Modify: `js/admin-animations.js` (add two exported pure functions near `buildChartAnimationConfig`, line 40)

**Interfaces:**
- Produces: `buildButtonEntranceConfig(reducedMotion) → {y,duration,ease,stagger} | null`, `buildRippleConfig(reducedMotion) → {duration,ease} | null` — consumed by Task 4

- [ ] **Step 1: Write the failing tests**

Append to `tests/admin-animations.test.js`:

```js
describe('buildButtonEntranceConfig', () => {
  it('يعيد إعدادات دخول الأزرار: y=10, stagger 0.03', () => {
    const cfg = buildButtonEntranceConfig(false);
    expect(cfg).toEqual({ y: 10, duration: 0.3, ease: 'power2.out', stagger: 0.03 });
  });

  it('يلغي دخول الأزرار مع reduced motion', () => {
    expect(buildButtonEntranceConfig(true)).toBeNull();
  });
});

describe('buildRippleConfig', () => {
  it('يعيد مدة 0.55s مع ease power2.out', () => {
    expect(buildRippleConfig(false)).toEqual({ duration: 0.55, ease: 'power2.out' });
  });

  it('يلغي الريبل مع reduced motion', () => {
    expect(buildRippleConfig(true)).toBeNull();
  });
});
```

And add the two functions to the import list at the top of the test file:

```js
import {
  parseCounterHTML,
  shouldSkipAnimations,
  getDecimalPlaces,
  buildChartAnimationConfig,
  buildButtonEntranceConfig,
  buildRippleConfig,
} from '../js/admin-animations.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `buildButtonEntranceConfig is not a function` / `buildRippleConfig is not a function`

- [ ] **Step 3: Implement the helpers**

In `js/admin-animations.js`, after `buildChartAnimationConfig` (line 40), add:

```js
export function buildButtonEntranceConfig(reducedMotion) {
  if (reducedMotion) return null;
  return { y: 10, duration: 0.3, ease: 'power2.out', stagger: 0.03 };
}

export function buildRippleConfig(reducedMotion) {
  if (reducedMotion) return null;
  return { duration: 0.55, ease: 'power2.out' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all suites green)

- [ ] **Step 5: Commit**

```bash
git add tests/admin-animations.test.js js/admin-animations.js
git commit -m "feat(admin): button entrance + ripple animation config helpers"
```

---
### Task 4: Wire button entrance + ripple into the GSAP layer

**Files:**
- Modify: `js/admin-animations.js` — `animatePanelEnter` (line 111-121), `initAdminAnimations` (line 283-295)

**Interfaces:**
- Consumes: `buildButtonEntranceConfig`, `buildRippleConfig` (Task 3), `shouldSkipAnimations` (existing)
- Produces: runtime button stagger on panel open + click ripple, both reduced-motion aware

- [ ] **Step 1: Extend `animatePanelEnter` to stagger buttons**

Replace `animatePanelEnter` (lines 111-121) with:

```js
function animatePanelEnter(panel) {
  const cards = Array.from(panel.querySelectorAll(PANEL_CARD_SELECTOR));
  if (cards.length) {
    cards.forEach((c) => c.removeAttribute('data-aos'));
    gsap.killTweensOf(cards);
    gsap.fromTo(
      cards,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: DUR.card, ease: 'power2.out', stagger: 0.08, clearProps: 'opacity,transform' }
    );
  }
  const cfg = buildButtonEntranceConfig(shouldSkipAnimations(window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  if (!cfg) return;
  const buttons = Array.from(panel.querySelectorAll('.btn, button[type="submit"], .app-login-box button')).filter((b) => b.offsetParent !== null);
  if (!buttons.length) return;
  gsap.killTweensOf(buttons);
  gsap.fromTo(
    buttons,
    { opacity: 0, y: cfg.y },
    {
      opacity: 1,
      y: 0,
      duration: cfg.duration,
      ease: cfg.ease,
      stagger: cfg.stagger,
      delay: 0.18,
      clearProps: 'opacity,transform',
    }
  );
}
```

- [ ] **Step 2: Add `setupRipple` function + wire into init**

Add after `setupTitleObserver` (after line 279):

```js
function setupRipple() {
  const cfg = buildRippleConfig(shouldSkipAnimations(window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  if (!cfg) return;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn, .app-login-box button');
    if (!btn || btn.disabled) return;
    const rect = btn.getBoundingClientRect();
    const span = document.createElement('span');
    span.className = 'btn-ripple';
    const size = Math.max(rect.width, rect.height);
    span.style.width = span.style.height = size + 'px';
    span.style.left = (e.clientX - rect.left - size / 2) + 'px';
    span.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(span);
    gsap.fromTo(
      span,
      { scale: 0.25, opacity: 0.5 },
      {
        scale: 1,
        opacity: 0,
        duration: cfg.duration,
        ease: cfg.ease,
        onComplete() { span.remove(); },
      }
    );
  });
}
```

In `initAdminAnimations` (line 283-295), add `setupRipple();` after `setupToastPulse();`.

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: all tests PASS (helpers already covered; runtime wiring has no unit test — verified by Task 5 build + manual check).

- [ ] **Step 4: Commit**

```bash
git add js/admin-animations.js
git commit -m "feat(admin): button pop-in stagger and gold ripple on click"
```

---
### Task 5: Rebuild desktop/web and verify

**Files:**
- Run: `node desktop/scripts/build-web.mjs` (regenerates `desktop/web/` from source via `web-files.json`)

**Interfaces:**
- Consumes: all prior tasks
- Produces: updated `desktop/web/admin.html`, `desktop/web/js/admin-animations.js`

- [ ] **Step 1: Run the build**

Run: `node desktop/scripts/build-web.mjs`
Expected: `Built N web files → desktop/web` (N ≥ 15)

- [ ] **Step 2: Confirm copies are fresh**

Run: `node -e "const fs=require('fs');const a=fs.readFileSync('admin.html','utf8'),b=fs.readFileSync('desktop/web/admin.html','utf8');console.log('admin.html synced:',a===b);const c=fs.readFileSync('js/admin-animations.js','utf8'),d=fs.readFileSync('desktop/web/js/admin-animations.js','utf8');console.log('admin-animations synced:',c===d);"
Expected: both `true`

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests PASS

- [ ] **Step 4: Manual visual check (user)**

Open the app (or `admin.html` in a browser) and confirm:
- Primary buttons: gold gradient, dark text, shine sweep on hover, press scale, continuous gold pulse on "حفظ جميع الإعدادات"
- Outline buttons: gold border/text, gold glow on hover
- Modal close: gold hover + 90° rotation
- Click ripple on all buttons
- Buttons pop in staggered when switching panels
- Dark and light themes both look right
- `prefers-reduced-motion: reduce` disables the new motion

- [ ] **Step 5: Commit**

```bash
git add desktop/web
git commit -m "build(desktop): sync gold buttons redesign into AZMA Settings app"
```