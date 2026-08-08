# My-Orders Hamburger Menu + Two-Column Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pill tabs on my-orders.html with a gold-theme hamburger menu (user's checkbox pattern, CSS-only close) and rearrange the delivery form fields into a two-column grid on desktop.

**Architecture:** Single-file change (my-orders.html, inline CSS). Menu items reuse the existing `tab-checkout` / `tab-orders` ids so `switchTab` (js/my-orders.js:47-52) works with ZERO JS changes. Menu close is pure CSS: items are `<label for="toggle">` elements — clicking one unchecks the checkbox (labels aren't interactive elements, so the label activation behavior fires) and fires its onclick.

**Tech Stack:** Vanilla HTML + CSS, existing tees tokens, RTL Arabic, existing page motion system (`--tees-ease`, `fadeUp`, `tabIn`, `prefers-reduced-motion`).

## Global Constraints

- Only `my-orders.html` changes. All 24 element IDs preserved (mo-name, mo-phone, mo-city, mo-area, mo-street, mo-landmark, mo-notes, pay-cod, pay-card, mo-error, mo-submit, mo-cart-items, mo-cart-total, tab-checkout, tab-orders, panel-checkout, panel-orders, mo-phone-panel, mo-lookup-phone, mo-orders-panel, mo-customer-name, mo-orders-list, mo-overlay, mo-overlay-text).
- All onclick handlers unchanged: `switchTab`, `submitOrderFlow`, `pickPayment('cod'|'card')`, `lookupOrders`.
- `js/my-orders.js`, `js/api.js`, `js/db-local.js`, `server.js`, DB — NOT touched.
- Token values exact: `--tees-black:#0D0D0D; --tees-surface:#161616; --tees-card:#1E1E1E; --tees-yellow:#F5C842; --tees-yellow-dim:#c9a42e; --tees-white:#F5F5F0; --tees-muted:#888884; --tees-border:#2a2a2a`; `--tees-ease:cubic-bezier(.22,1,.36,1)`.
- RTL Arabic preserved (`<html lang="ar" dir="rtl">`); `prefers-reduced-motion` block retained; scripts order api.js → db-local.js → my-orders.js; `</textarea></div>` closure intact; div open==close balance must hold.
- No external libraries. Do NOT run lint or vitest. Commits with `--no-verify`; never `git add -A`.

---

### Task 1: Hamburger Menu Replacing Pill Tabs

**Files:**
- Modify: `my-orders.html` (header CSS block, tabs CSS block, header HTML, tabs HTML)

**Interfaces:**
- Consumes: existing `switchTab(name)` in js/my-orders.js which toggles `.active` on elements `#tab-checkout` / `#tab-orders` and shows/hides `#panel-checkout` / `#panel-orders`.
- Produces: header with `#mo-toggle` (checkbox), `.mo-hamburger` label with 3 `.mo-bar` divs, `.mo-menu` nav containing `#tab-checkout` / `#tab-orders` menu items (now `<label>` elements). `switchTab` keeps working unchanged.

- [ ] **Step 1: Replace the tabs CSS with hamburger CSS**

In the `<style>` block of `my-orders.html`, replace the entire `/* ── Tabs ── */` section (the `.mo-tabs-wrap`, `.mo-tabs`, `.mo-tab`, `.mo-tab.active`, `.mo-tab:focus-visible` rules) with this (keep the user's bar-morph choreography, recolored/resized for the theme):

```css
    /* ── Hamburger menu ── */
    .mo-toggle-checkbox{display:none}
    .mo-hamburger{width:38px;height:38px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:5px;cursor:pointer;border:1px solid rgba(245,200,66,.25);border-radius:50%;background:rgba(255,255,255,.03);transition:border-color .3s var(--tees-ease),box-shadow .3s var(--tees-ease)}
    .mo-hamburger:hover{border-color:rgba(245,200,66,.6);box-shadow:0 0 18px rgba(245,200,66,.12)}
    .mo-hamburger .mo-bar{width:16px;height:2px;background:var(--tees-yellow);border-radius:10px;position:relative;transition:transform .3s ease,opacity .3s ease}
    .mo-toggle-checkbox:checked + .mo-hamburger .mo-bar:nth-child(2){transform:translate(0,7px);opacity:0;transition-delay:.3s}
    .mo-toggle-checkbox:checked + .mo-hamburger .mo-bar:nth-child(3){transform:translate(0,-7px);transition-delay:0s}
    .mo-toggle-checkbox:checked + .mo-hamburger .mo-bar:nth-child(1){transform:rotate(-45deg) scale(.8);transition-delay:.6s}
    .mo-toggle-checkbox:checked + .mo-hamburger .mo-bar:nth-child(3){transform:rotate(45deg) scale(.8);transition-delay:.6s}
    .mo-menu{position:absolute;top:calc(100% + 8px);left:0;min-width:220px;display:none;flex-direction:column;gap:4px;padding:8px;background:rgba(22,22,22,.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(245,200,66,.18);border-radius:14px;box-shadow:0 18px 44px rgba(0,0,0,.5);transform-origin:top;animation:menuIn .3s var(--tees-ease)}
    .mo-toggle-checkbox:checked ~ .mo-menu{display:flex}
    .mo-menu-item{padding:11px 14px;border-radius:10px;font-size:13px;font-weight:600;color:var(--tees-muted);cursor:pointer;font-family:inherit;transition:all .3s var(--tees-ease)}
    .mo-menu-item:hover{background:rgba(255,255,255,.04);color:var(--tees-white)}
    .mo-menu-item.active{background:rgba(245,200,66,.12);color:var(--tees-yellow);box-shadow:inset 0 0 0 1px rgba(245,200,66,.35)}
    @keyframes menuIn{from{opacity:0;transform:scaleY(.85) translateY(-6px)}to{opacity:1;transform:none}}
```

- [ ] **Step 2: Add the header-actions wrapper + hamburger markup**

Replace the current header block:

```html
  <header class="mo-header">
    <div class="mo-logo">OUR <span>TEES</span></div>
    <a class="mo-back" href="store.html">→ العودة للمتجر</a>
  </header>
```

with:

```html
  <header class="mo-header">
    <div class="mo-logo">OUR <span>TEES</span></div>
    <div class="mo-header-actions">
      <a class="mo-back" href="store.html">→ العودة للمتجر</a>
      <input type="checkbox" id="mo-toggle" class="mo-toggle-checkbox" />
      <label class="mo-hamburger" for="mo-toggle">
        <div class="mo-bar"></div>
        <div class="mo-bar"></div>
        <div class="mo-bar"></div>
      </label>
      <nav class="mo-menu">
        <label class="mo-menu-item active" id="tab-checkout" for="mo-toggle" onclick="switchTab('checkout')">🛒 إتمام الطلب</label>
        <label class="mo-menu-item" id="tab-orders" for="mo-toggle" onclick="switchTab('orders')">📦 طلباتي</label>
      </nav>
    </div>
  </header>
```

- [ ] **Step 3: Add the actions container CSS + remove the tabs HTML**

Add next to the header rules (inside the style block, after `.mo-header` rules):

```css
    .mo-header-actions{display:flex;align-items:center;gap:12px;position:relative}
```

Then delete the entire tabs block from the body:

```html
  <div class="mo-tabs-wrap">
    <div class="mo-tabs">
      <button class="mo-tab active" id="tab-checkout" onclick="switchTab('checkout')">🛒 إتمام الطلب</button>
      <button class="mo-tab" id="tab-orders" onclick="switchTab('orders')">📦 طلباتي</button>
    </div>
  </div>
```

- [ ] **Step 4: Static checks (PowerShell, project root)**

```powershell
$c = Get-Content my-orders.html -Raw
"divs: " + ([regex]::Matches($c,'<div\b')).Count + " / " + ([regex]::Matches($c,'</div>')).Count   # must be equal
"tabs leftovers: " + ([regex]::Matches($c,'mo-tabs')).Count                                        # must be 0
"ids: " + (@('mo-name','mo-phone','mo-city','mo-area','mo-street','mo-landmark','mo-notes','pay-cod','pay-card','mo-error','mo-submit','mo-cart-items','mo-cart-total','tab-checkout','tab-orders','panel-checkout','panel-orders','mo-phone-panel','mo-lookup-phone','mo-orders-panel','mo-customer-name','mo-orders-list','mo-overlay','mo-overlay-text') | Where-Object { $c -notmatch ("id=\"" + $_ + "\"") }).Count  # must be 0
```

- [ ] **Step 5: Browser verification**

Server at `http://localhost:3000` (check `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/my-orders.html`; if 000, `Start-Process node server.js` from root, wait 3s). In the browser:
1. Reload the page. Console: zero errors.
2. Click the hamburger → bars morph to ✕, menu drops open with gold border/glass, "🛒 إتمام الطلب" highlighted gold.
3. Click "📦 طلباتي" → menu closes by itself, orders panel shows (lookup card visible).
4. Open menu again → "📦 طلباتي" is now highlighted gold. Click "🛒 إتمام الطلب" → menu closes, checkout panel shows.
5. Hero + panels still animate (fadeUp/tabIn); back link still works (href store.html).
6. Screenshot the open menu as evidence (save to `.superpowers/sdd/2026-08-08-my-orders-hamburger/task-1-menu-open.png` after creating the folder).

- [ ] **Step 6: Commit**

```bash
git add my-orders.html
git commit --no-verify -m "feat(my-orders): hamburger menu replaces pill tabs (gold theme, CSS-only close)"
```

---

### Task 2: Two-Column Delivery Form Grid

**Files:**
- Modify: `my-orders.html` (fields CSS + delivery card HTML + 600px media query)

**Interfaces:**
- Consumes: the 7 field inputs from the current delivery card (`mo-name`, `mo-phone`, `mo-city`, `mo-area`, `mo-street`, `mo-landmark`, `mo-notes`) — all ids/placeholders/labels preserved, only wrapper and CSS change.
- Produces: `.mo-fields-grid` two-column wrapper. Auto-fill (`loadMyOrders` writes to the same ids) and `submitOrderFlow` read the same ids → zero JS impact.

- [ ] **Step 1: Add grid CSS**

After the `.mo-field textarea{...}` rule in the style block, add:

```css
    .mo-fields-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .mo-fields-grid .mo-field{margin-bottom:0}
    .mo-fields-grid .mo-span2{grid-column:1/-1}
```

And inside the existing `@media (max-width:600px)` block, add:

```css
      .mo-fields-grid{grid-template-columns:1fr}
```

- [ ] **Step 2: Wrap the fields in the grid**

In the delivery card (card #2 of `#panel-checkout`), wrap the seven `.mo-field` divs so the markup becomes:

```html
      <h3 class="mo-card-title">معلومات التوصيل</h3>
      <div class="mo-fields-grid">
        <div class="mo-field"><label>الاسم الكامل *</label><input id="mo-name" placeholder="محمد أحمد"></div>
        <div class="mo-field"><label>رقم الهاتف *</label><input id="mo-phone" placeholder="07XXXXXXXX" dir="ltr"></div>
        <div class="mo-field"><label>المدينة *</label><input id="mo-city" placeholder="عمّان"></div>
        <div class="mo-field"><label>الحي / المنطقة</label><input id="mo-area" placeholder="الصويفية"></div>
        <div class="mo-field"><label>الشارع</label><input id="mo-street" placeholder="شارع المدينة"></div>
        <div class="mo-field"><label>معلم قريب (اختياري)</label><input id="mo-landmark" placeholder="بجانب المسجد"></div>
        <div class="mo-field mo-span2"><label>ملاحظات (اختياري)</label><textarea id="mo-notes" rows="2" placeholder="أي تفاصيل إضافية..."></textarea></div>
      </div>
```

(Only changes: outer `<div class="mo-fields-grid">` wrapper, `mo-span2` on the notes field, and the grid closes before the payment `<h3>` — payment/error/button stay outside the grid, untouched.)

- [ ] **Step 3: Static checks**

```powershell
$c = Get-Content my-orders.html -Raw
"divs: " + ([regex]::Matches($c,'<div\b')).Count + " / " + ([regex]::Matches($c,'</div>')).Count   # must be equal (previous count +1 for the grid wrapper)
"grid: " + ([regex]::Matches($c,'mo-fields-grid')).Count   # 3 occurrences of the class name
```

- [ ] **Step 4: Browser verification**

1. Reload. Console: zero errors.
2. Desktop viewport (≥700px): fields render in pairs — الاسم/الهاتف, المدينة/الحي, الشارع/المعلم on one row each; الملاحظات full width.
3. Resize to ≤600px: all fields single column.
4. Lookup `0791234567` in "📦 طلباتي" → open "🛒 إتمام الطلب" → fields auto-fill (اختبار / عمّان) in the new two-column layout.
5. Full checkout still works: pick payment (✓ on COD), submit → overlay spinner → success toast (glass) → auto-switch to orders tab with the new order on top.
6. Full-page screenshot as final evidence (`.superpowers/sdd/2026-08-08-my-orders-hamburger/task-2-final.png`).

- [ ] **Step 5: Commit**

```bash
git add my-orders.html
git commit --no-verify -m "feat(my-orders): two-column delivery form grid (desktop), stacked on mobile"
```
