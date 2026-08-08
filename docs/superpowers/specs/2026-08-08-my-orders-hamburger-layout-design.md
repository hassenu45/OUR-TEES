# Design: My-Orders — Hamburger Menu + Two-Column Order Form

**Date:** 2026-08-08
**Page:** `my-orders.html` (+ `js/my-orders.js` only if strictly needed — goal: zero JS changes)
**Design context:** luxury dark + gold (tees tokens), RTL, Arabic. Page already redesigned (commit `b82f090`).

## 1. Goal

1. Replace the two pill tabs (🛒 إتمام الطلب / 📦 طلباتي) with a hamburger menu in the header.
2. Re-arrange the delivery form fields into an elegant two-column layout on desktop (single column ≤600px).

## 2. Header + Hamburger (replaces tabs)

- Header becomes: `OUR TEES` logo (right) | `→ العودة للمتجر` link | hamburger icon (left).
- The hamburger is the user's checkbox pattern, adapted to the theme:
  - `.toggle-checkbox` (hidden checkbox, `display:none`) + `<label class="hamburger" for="toggle">` with 3 `.bar` divs.
  - Bars: `background: var(--tees-yellow)` (gold `#F5C842`), width 22px, height 2px, rounded, inside a 38px circular ghost button (border `rgba(245,200,66,.25)`), hover → subtle glow.
  - Checked state transitions exactly as the user's code (bars 2→fade, 1/3→rotate±45deg) — timing adapted to `--tees-ease` (`cubic-bezier(.22,1,.36,1)`).
- Dropdown menu: a glass card (`rgba(255,255,255,.03)` bg, gold border, blur 14px) sliding down under the header (`transform-origin: top`, scaleY/opacity .3s animation).
  - Contains two items, each wrapped in `<label for="toggle">` so clicking an item unchecks the checkbox → menu closes (pure CSS, no JS):
    - `<button id="tab-checkout" onclick="switchTab('checkout')">🛒 إتمام الطلب</button>`
    - `<button id="tab-orders" onclick="switchTab('orders')">📦 طلباتي</button>`
  - **Critical:** the ids `tab-checkout` / `tab-orders` MUST remain (switchTab at js/my-orders.js:48-49 toggles `.active` on them; class used for gold highlight of the active menu item).
  - The pill-tabs block (`.mo-tabs-wrap`, `.mo-tabs`, `.mo-tab`) is removed entirely. Its CSS is deleted or kept hidden — deleted, since menu items get their own styles.
- The old "→ العودة للمتجر" link stays (approved by user).

## 3. Form Layout — Two Columns

Current single-column `#panel-checkout` card list stays as the two cards (cart summary, delivery info), but the delivery fields card changes:

- Grid: `.mo-fields-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px }`.
- Field pairs (each `-->` a row):
  1. `mo-name` (الاسم الكامل) | `mo-phone` (رقم الهاتف)
  2. `mo-city` (المدينة) | `mo-area` (الحي/المنطقة)
  3. `mo-street` (الشارع) | `mo-landmark` (معلم قريب)
  4. `mo-notes` (ملاحظات) → full width (span 2)
  5. Payment section + error + submit button → full width (span 2)
- `.mo-field { margin-bottom:0 }` inside the grid (gap handles spacing).
- ≤600px: `grid-template-columns:1fr` (single column, same as today).

## 4. IDs & JS Invariants (binding)

- All 24 IDs preserved (mo-name, mo-phone, mo-city, mo-area, mo-street, mo-landmark, mo-notes, pay-cod, pay-card, mo-error, mo-submit, mo-cart-items, mo-cart-total, tab-checkout, tab-orders, panel-checkout, panel-orders, mo-phone-panel, mo-lookup-phone, mo-orders-panel, mo-customer-name, mo-orders-list, mo-overlay, mo-overlay-text).
- All onclick handlers unchanged: `switchTab`, `submitOrderFlow`, `pickPayment('cod'|'card')`, `lookupOrders`.
- `js/my-orders.js` — no changes required; only exception if a bug is found during verification (then minimal fix, documented).
- No other files change. `prefers-reduced-motion` covers the menu animation automatically. Div balance must stay equal. RTL kept.

## 5. Success Criteria

- Hamburger animates X on open; menu opens with gold-highlighted active view; choosing an item switches view AND closes the menu.
- Form fields in 2 columns on desktop, 1 column ≤600px; all 7 fields still auto-fill; checkout flow, payment, cancel, lookup all work (regression: same behaviors as before).
- Zero console errors; div balance equal; all 24 IDs present.
