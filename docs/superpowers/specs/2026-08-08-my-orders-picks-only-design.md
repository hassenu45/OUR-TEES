# Design: My-Orders — Picks-Only Orders Tab (no phone lookup)

**Date:** 2026-08-08
**Files:** `my-orders.html`, `js/my-orders.js`
**Context:** Luxury dark + gold page (tees tokens), RTL Arabic. Hamburger menu + two-column form already shipped (commits `8cc0bf7`, `d4599d4`).

## 1. Goal

The "📦 طلباتي" tab must stop asking the customer for a phone number. It shows ONLY the products the customer picked from the store (the current browser cart, `localStorage.azma_cart`) — no order history, no phone search, no other customers' data.

## 2. Orders Tab (panel-orders)

- Delete the phone-lookup card (`mo-phone-panel` content: title "شوف طلباتك", `mo-lookup-phone` field, "عرض طلباتي" button) entirely from `my-orders.html`.
- Replace with one card: title "منتجاتك المختارة", body `mo-orders-list` (reused id).
- Rendered content (JS):
  - Items: same markup/style as the cart items (`.mo-item` — image, `.mo-item-info` name + meta `type size × qty`, price) with dashed separators.
  - Gold total row (`.mo-total-row` style, `mo-cart-total` values — reuse `.mo-cart-total` id? No — separate: just render total text inline in the list).
  - CTA gold button "متابعة إتمام الطلب" → `switchTab('checkout')`.
  - Empty state: "لا توجد منتجات مختارة" + link "العودة للمتجر" (`store.html`).
- Keep `#panel-orders` + `style="display:none;"` initial state; `switchTab` unchanged.

## 3. JS Changes (js/my-orders.js)

- Delete: `bindPhonePanel`, `lookupOrders`, `loadMyOrders`, `cancelOrder`.
- New `renderPicks()`: renders cart into `mo-orders-list` (items + total + CTA when non-empty; empty state otherwise). Called from `initMyOrders` and from `renderCart` (single source of truth).
- `initMyOrders`: remove phone/lookup logic (`myPhone` fetch, `loadMyOrders`, `switchTab('orders')`); keep settings + renderCart + renderPicks. Remove `localStorage azma_my_phone` reads.
- `submitOrderFlow`: after success — clear cart, toast, renderCart (updates picks too). Stay on checkout tab (do NOT switchTab('orders'); the picks are gone after submit).
- Keep: `switchTab`, `pickPayment`, `showToast`, `showError`, `showOverlay`, `hideOverlay`, `renderCart`, `fmt`, `$`, `escapeHtml`, `initMyOrders`.
- The phone field in the delivery form (`mo-phone`) remains (required for the order).

## 4. IDs / Invariants

- Removed from HTML+JS: `mo-phone-panel`, `mo-lookup-phone`, `mo-customer-name`. Remaining ids stay: mo-name, mo-phone, mo-city, mo-area, mo-street, mo-landmark, mo-notes, pay-cod, pay-card, mo-error, mo-submit, mo-cart-items, mo-cart-total, tab-checkout, tab-orders, panel-checkout, panel-orders, mo-orders-list, mo-overlay, mo-overlay-text.
- API/db/server untouched. `cancelOrder` removal is safe (no other page calls it — it was inline onclick in my-orders only).
- div balance equal; RTL; no console errors; `prefers-reduced-motion` kept.

## 5. Success Criteria

- Orders tab opens via hamburger → shows picked products only (with total + CTA), or empty state with store link.
- No phone field anywhere on the page except the delivery form.
- Adding items on store.html → both tabs reflect them; submitting an order clears picks; no view jump after submit.
- Console zero errors; hamburger + two-column form still work.
