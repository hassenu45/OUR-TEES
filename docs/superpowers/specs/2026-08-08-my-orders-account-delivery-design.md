# Design: My-Orders — Per-Google-Account Delivery Info + Animated Location Selects

**Date:** 2026-08-08
**Files:** `my-orders.html`, `js/my-orders.js`, `js/jordan-locations.js` (new), `server.js`
**Context:** Luxury dark + gold (tees tokens), RTL Arabic. Page already has hamburger menu (commits `8cc0bf7`, `d4599d4`) and picks-only orders tab (`222b7cf`). Google auth exists: `login.html` → `POST /api/auth/google` | `/api/auth/google-code` → express-session (`req.session.authenticated`, `userEmail`, `userName`, `userPicture`). `/api/auth/status` exists at server.js:251.

## 1. Rules (binding)

- **ONLY logged-in Google accounts get saved delivery info** (server-side). Guests (not logged in): form starts empty every time; nothing is stored anywhere (no localStorage fallback).
- Saving happens: (a) when the user saves from the delivery-info editor in the hamburger menu, and (b) automatically after a successful order submit (only when authenticated).
- Loading happens on page load: if `/api/auth/status` → authenticated → `GET /api/me/delivery` → fill form fields.

## 2. Server (server.js)

- New endpoints:
  - `GET /api/me/delivery` — requires `req.session.authenticated` else `401 {error}`. Returns `{ name, phone, city, district, area, street, landmark }` from `data/delivery-info.json` keyed by `req.session.userEmail`, or `{ }` if none.
  - `PUT /api/me/delivery` — same auth requirement; validates: name optional? (min 2 if present), phone optional (regex `/^\+?[0-9\s-]{8,15}$/` if present), everything else strings ≤100 chars. Writes the JSON file (atomic: write temp then rename; `fs.mkdirSync('data',{recursive:true})`).
- JSON shape: `{ "<email>": { name, phone, city, district, area, street, landmark } }`.
- No DB schema change, no migration. `db.cjs` untouched.

## 3. my-orders.html

- **Location fields become animated custom selects** (keep ids `mo-city`, `mo-area`; new id `mo-district`):
  - Field 1: المدينة (mo-city) — options: Jordan cities.
  - Field 2: الحي (mo-district) — options depend on city selection.
  - Field 3: المنطقة (mo-area) — options depend on district selection.
  - Cascading: picking a city resets district+area; picking a district resets area. Each select is a custom component (button + animated dropdown panel) so the popup can animate (fadeUp/slide .3s var(--tees-ease), glass style like `.mo-menu`). Native `<select>` is NOT used.
  - `mo-street` and `mo-landmark` remain text inputs. Notes textarea unchanged.
- **Hamburger menu**: new item `📍 بيانات التوصيل` — visible ONLY when logged in (rendered by JS after `/api/auth/status` check; hidden for guests).
- **Delivery editor panel**: opens as an overlay (new `#mo-delivery-overlay`, glass card matching the page, z-index above header, blur backdrop like `.mo-overlay`): fields الاسم الكامل / رقم الهاتف / المدينة / الحي / المنطقة / الشارع / معلم قريب + gold save button "حفظ البيانات" + close button. On save → `PUT /api/me/delivery` + fill checkout form + toast "تم حفظ بياناتك ✓".
- **Account chip** in header (logged-in only): small gold-bordered chip with `userName` (+ picture if present) — lets the user see they're logged in.
- Animations: dropdown panels use `fadeUp`-style keyframe (reuse `menuIn` or new `dropIn`); overlay opens with blur+fade; all under existing `prefers-reduced-motion` kill-switch (the `*{animation:none!important}` rule covers them).

## 4. js/jordan-locations.js (new)

- `window.JORDAN = { "<city>": { "<district>": ["<area>", ...], ... }, ... }`.
- Cities (≥10): عمّان، إربد، الزرقاء، السلط، العقبة، المفرق، جرش، عجلون، مادبا، الكرك.
- عمّان districts with areas (real names): الصويفية [الصويفية الشمالية، الصويفية الجنوبية], عبدون [عبدون الشمالي، عبدون الجنوبي], دابوق [دابوق الفوقا، دابوق التحتا], الشميساني، تلاع العلي [تلاع العلي الشمالي، تلاع العلي الجنوبي], خلدا [خلدا الشمالية، خلدا الجنوبية], الجبيهة، صويلح، ماركا، ناعور، المقابلين، جبل عمان، جبل الحسين، رأس العين، القويسمة، بسمان. Other cities: 3-6 districts each with 1-3 areas.
- Loaded via `<script src="js/jordan-locations.js">` BEFORE `js/my-orders.js`.

## 5. js/my-orders.js

- New: `dropdown` factory — `makeSelect(inputEl)` replaces a text input with the custom dropdown widget (keeps the same element id/container so `switchTab`/validation references still work; store value via the input's value or a data attr — the custom widget sets `inputEl.value`).
- New: `loadDelivery()` — auth check (`API.getAuthStatus()` — add wrapper in js/api.js or inline fetch) → if authenticated: GET delivery → set fields (name/phone/city/district/area/street/landmark) + show account chip + show hamburger delivery item.
- New: `saveDelivery()` — PUT with current form values; used by editor save + after order submit.
- `submitOrderFlow` — after success: if authenticated → `saveDelivery()` (fire-and-forget with catch).
- Cascade render functions: `renderDistricts()`, `renderAreas()` populating the dropdown options with animation on change.
- Deliverable field mapping to order: address composed as before (city + district + area + street + landmark joined). `mo-district` is NEW — order API payload keeps `city/area/street/landmark` + include district in address string. (Order model unchanged.)

## 6. Success Criteria

- Logged in (Google): page load → form auto-filled from account; hamburger shows "📍 بيانات التوصيل"; editing + save persists across reload AND another browser session (server-side); after order submit, info saved.
- Guest (not logged in): no chip, no menu item, form empty, nothing saved.
- City→district→area cascade works with animated dropdowns; reduced-motion kills animations.
- Regression: hamburger view switching, picks-only tab, two-column grid, checkout submit, cart→my-orders flow all still work. Zero console errors. div balance equal.
