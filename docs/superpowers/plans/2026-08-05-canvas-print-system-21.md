# Canvas Print System for 21.html — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the DecalGeometry print system in `21.html` with a 2048×2048 CanvasTexture baked into the shirt's base material, eliminating texture distortion on the curved chest/back permanently.

**Architecture:** The print (logo) is drawn onto a 2D canvas that is the `map` of the shirt's `MeshStandardMaterial`. The logo position/size/rotation are converted from shirt-local 3D space into UV space using the affine map of the raycast-hit triangle, then rendered with a single canvas `setTransform`. Because the texture is sampled through the model's own UVs, distortion on curvature is physically impossible. The old `printMesh` becomes an invisible proxy quad used only for selection/raycasting/selection-box.

**Tech Stack:** Three.js (r185, importmap from `/node_modules/three`), vanilla JS module in `21.html`, OBJLoader, node `server.js` on port 3000.

## Global Constraints

- Model UV convention (CRITICAL): `u ∈ [0,1]`, `v ∈ [-1,0]`. Canvas px = `(u * TEX, -v * TEX)`. Never use `cy = (1 - v) * size` — that was the original bug.
- CanvasTexture keeps `flipY = true` (default). Texture must have `colorSpace = SRGBColorSpace`, `anisotropy = 8`.
- The shirt base fill on canvas must be pure white `#ffffff` so `color` (0xF5F5F0) alone defines the shirt look — identical to today.
- Keep all UI/gesture code (drag/rotate/resize/pinch/flip/delete, selBox, raycastPrint) working unchanged; only the print-visualization layer changes.
- `DECAL_DEPTH` and `remapDecalUVs` are deleted. `PRINT_NUDGE` stays (proxy offset only).
- No commits unless the user explicitly asks.

---

### Task 1: Canvas base texture + material wiring

**Files:**
- Modify: `21.html:327` (remove DecalGeometry import), `21.html:495-506` (replace makePrintMaterial), `21.html:508-512` (createPrint proxy), `21.html:873-879` (whiteMat gains map), `21.html:589-590` (remove DECAL_DEPTH, keep PRINT_NUDGE)

**Interfaces:**
- Produces: `shirtCanvas`, `shirtCtx`, `shirtTex` (CanvasTexture), `paintShirt()` (base-only for now), `currentSurface` (null for now)

- [ ] **Step 1: Remove the DecalGeometry import**

```html
  import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
```
(delete the `DecalGeometry` import line entirely)

- [ ] **Step 2: Replace `makePrintMaterial` + `createPrint` with canvas + proxy setup**

Replace the block at lines 495-512:

```js
  // ── Canvas print system (no DecalGeometry → zero UV distortion) ──
  const SHIRT_TEX_SIZE = isWeak ? 1024 : 2048;
  const shirtCanvas = document.createElement('canvas');
  shirtCanvas.width = SHIRT_TEX_SIZE;
  shirtCanvas.height = SHIRT_TEX_SIZE;
  const shirtCtx = shirtCanvas.getContext('2d');
  const shirtTex = new THREE.CanvasTexture(shirtCanvas);
  shirtTex.colorSpace = THREE.SRGBColorSpace;
  shirtTex.anisotropy = 8;

  // Repaint the whole shirt texture; draws the logo at the current surface.
  function paintShirt() {
    shirtCtx.setTransform(1, 0, 0, 1, 0, 0);
    shirtCtx.fillStyle = '#ffffff';
    shirtCtx.fillRect(0, 0, SHIRT_TEX_SIZE, SHIRT_TEX_SIZE);
    shirtTex.needsUpdate = true;
  }

  // Invisible proxy: hit-testing, drag + selection box only.
  function createPrint() {
    printMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    printMesh.frustumCulled = false;
    group.add(printMesh);
  }
```

- [ ] **Step 3: Drop `DECAL_DEPTH`**

Replace line 589-590:

```js
  const PRINT_NUDGE = 0.004; // رفع الطباعة قليلاً عن سطح القماش
```

- [ ] **Step 4: Wire the map into the shirt material**

In the OBJ load callback where `whiteMat` is created (line ~873), add after the material object:

```js
      whiteMat.map = shirtTex;
      whiteMat.needsUpdate = true;
```

- [ ] **Step 5: Initial paint once the model is up**

In the same callback, right after `group.add(obj);` add:

```js
      paintShirt();
```

- [ ] **Step 6: Verify no syntax errors**

Run: `node --check` is not applicable to HTML. Instead: `node server.js` (background) and load `http://localhost:3000/21.html` in a browser — expect the shirt renders normally, no console errors, no print loaded.

---

### Task 2: Surface → UV affine math + logo painting

**Files:**
- Modify: `21.html:584-616` (findSurface adds `hit` to result), `21.html:618-643` (bakeDecal → placePrint stub calling faceAffine + paintShirt), add `faceAffine()` + full `paintShirt()` logo branch, delete `remapDecalUVs` (lines ~645-694)

**Interfaces:**
- Consumes: `surf.hit` (THREE.Intersection from findSurface), `printTex.image`, `printSize`, `printAspect`, `spinAngle`
- Produces: `faceAffine(hit)` → `{ aff00, aff01, aff10, aff11, px, py } | null`; `currentSurface`

- [ ] **Step 1: Add `faceAffine` right after `hitToLocal`**

```js
  // Affine map from the hit triangle's tangent plane to canvas pixels.
  // M maps local tangent coords -> (du, dv); canvas px = (du*TEX, -dv*TEX).
  function faceAffine(hit) {
    const mesh = hit.object;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const uvAttr = geo.attributes.uv;
    const face = hit.face;
    if (!uvAttr || !face) return null;
    const va = new THREE.Vector3().fromBufferAttribute(pos, face.a);
    const vb = new THREE.Vector3().fromBufferAttribute(pos, face.b);
    const vc = new THREE.Vector3().fromBufferAttribute(pos, face.c);
    va.applyMatrix4(mesh.matrixWorld);
    vb.applyMatrix4(mesh.matrixWorld);
    vc.applyMatrix4(mesh.matrixWorld);
    group.worldToLocal(va);
    group.worldToLocal(vb);
    group.worldToLocal(vc);
    const ua = new THREE.Vector2().fromBufferAttribute(uvAttr, face.a);
    const ub = new THREE.Vector2().fromBufferAttribute(uvAttr, face.b);
    const uc = new THREE.Vector2().fromBufferAttribute(uvAttr, face.c);
    const n = new THREE.Vector3()
      .crossVectors(new THREE.Vector3().subVectors(vb, va), new THREE.Vector3().subVectors(vc, va))
      .normalize();
    const ref = Math.abs(n.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const X = new THREE.Vector3().crossVectors(n, ref).normalize();
    const Y = new THREE.Vector3().crossVectors(n, X).normalize();
    const eB = new THREE.Vector3().subVectors(vb, va);
    const eC = new THREE.Vector3().subVectors(vc, va);
    const eBx = eB.dot(X), eBy = eB.dot(Y);
    const eCx = eC.dot(X), eCy = eC.dot(Y);
    const det = eBx * eCy - eBy * eCx;
    if (Math.abs(det) < 1e-12) return null;
    const inv00 = eCy / det, inv01 = -eBy / det;
    const inv10 = -eCx / det, inv11 = eBx / det;
    const duB = ub.x - ua.x, dvB = ub.y - ua.y;
    const duC = uc.x - ua.x, dvC = uc.y - ua.y;
    const uv = hit.uv || new THREE.Vector2(ua.x, ua.y);
    return {
      aff00: duB * inv00 + duC * inv10,
      aff01: duB * inv01 + duC * inv11,
      aff10: dvB * inv00 + dvC * inv10,
      aff11: dvB * inv01 + dvC * inv11,
      px: uv.x * SHIRT_TEX_SIZE,
      py: -uv.y * SHIRT_TEX_SIZE,
    };
  }
```

- [ ] **Step 2: Extend `findSurface` to carry the hit**

In `findSurface` (line ~609-615), add to the returned object:

```js
      hit: hits[0],
```

- [ ] **Step 3: Full logo draw in `paintShirt`**

Replace `paintShirt` body (from Task 1) with:

```js
  function paintShirt() {
    shirtCtx.setTransform(1, 0, 0, 1, 0, 0);
    shirtCtx.fillStyle = '#ffffff';
    shirtCtx.fillRect(0, 0, SHIRT_TEX_SIZE, SHIRT_TEX_SIZE);
    if (printTex && printTex.image && currentSurface) {
      const s = currentSurface;
      const ang = THREE.MathUtils.degToRad(spinAngle);
      const c = Math.cos(ang), sn = Math.sin(ang);
      // T = A * R(ang),  A = [[aff00, aff01], [-aff10, -aff11]] * TEX
      const a = SHIRT_TEX_SIZE * (s.aff00 * c + s.aff01 * sn);
      const b = -SHIRT_TEX_SIZE * (s.aff10 * c + s.aff11 * sn);
      const cc = SHIRT_TEX_SIZE * (-s.aff00 * sn + s.aff01 * c);
      const d = -SHIRT_TEX_SIZE * (-s.aff10 * sn + s.aff11 * c);
      const w = printSize;
      const h = printSize / printAspect;
      shirtCtx.setTransform(a, b, cc, d, s.px, s.py);
      shirtCtx.drawImage(printTex.image, -w / 2, -h / 2, w, h);
    }
    shirtTex.needsUpdate = true;
  }
```

- [ ] **Step 4: Delete `remapDecalUVs` entirely** (the whole function + its comment block, lines ~645-694)

- [ ] **Step 5: Verify** — load the page, upload any PNG, the logo appears on the chest with correct size/orientation; console clean.

---

### Task 3: Proxy placement + syncPrint + live repaint

**Files:**
- Modify: `21.html:646-643` region — replace `bakeDecal` with `placePrint`; `21.html:696-713` syncPrint; `21.html:816-826` drag move adds `queueRebake()`; `21.html:572-577` selDel repaints; add `currentSurface` declaration near `printAnchor` (line ~461)

**Interfaces:**
- Consumes: `placePrint(surf, isBack)`; `syncPrint()` unchanged signature
- Produces: `currentSurface` (null until a print is placed)

- [ ] **Step 1: Declare `currentSurface`**

Near line 461 (`printAnchor`):

```js
  let currentSurface = null;
```

- [ ] **Step 2: Replace `bakeDecal` with `placePrint`**

```js
  // Position the invisible proxy + repaint the canvas texture at the surface.
  function placePrint(surf, isBack) {
    if (!printMesh) return;
    currentSurface = faceAffine(surf.hit);
    printMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), surf.localNormal);
    printMesh.position.copy(surf.local).addScaledVector(surf.localNormal, PRINT_NUDGE);
    printMesh.scale.set(printSize, printSize / printAspect, 1);
    paintShirt();
  }
```

- [ ] **Step 3: Point `syncPrint` at the new function**

In `syncPrint` replace `bakeDecal(surf, isBack);` with `placePrint(surf, isBack);`

- [ ] **Step 4: Live repaint while dragging**

In the pointermove drag branch (after `printAnchor.add(delta); updateSelBox();`) add:

```js
      queueRebake();
```

- [ ] **Step 5: Clear the painted logo on delete**

In the `selDel` handler after `printTex = null;` add:

```js
      currentSurface = null;
      paintShirt();
```

- [ ] **Step 6: Verify** — full interaction pass: upload → drag → wheel resize → shift+drag rotate → pinch → flip front/back → delete. Logo tracks all gestures; no console errors.

---

### Task 4: End-to-end visual verification (distortion check)

**Files:**
- Create: `test-print.svg` (grid test image, NOT committed)

**Test image** — a grid is the sharpest distortion detector:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#ffffff"/>
  <rect x="32" y="32" width="960" height="960" fill="none" stroke="#111111" stroke-width="12"/>
  <g stroke="#222222" stroke-width="4">
    <line x1="256" y1="0" x2="256" y2="1024"/><line x1="512" y1="0" x2="512" y2="1024"/>
    <line x1="768" y1="0" x2="768" y2="1024"/>
    <line x1="0" y1="256" x2="1024" y2="256"/><line x1="0" y1="512" x2="1024" y2="512"/>
    <line x1="0" y1="768" x2="1024" y2="768"/>
  </g>
  <circle cx="512" cy="512" r="140" fill="none" stroke="#000000" stroke-width="16"/>
  <circle cx="512" cy="512" r="18" fill="#000000"/>
</svg>
```

- [ ] **Step 1: Start the server**

Run: `node server.js` (verify it serves on port 3000).

- [ ] **Step 2: Automated upload + screenshots (Playwright)**

1. Create `test-print.svg` with the content above.
2. Browser: `http://localhost:3000/21.html`, wait for the loader to disappear.
3. `setInputFiles` on `#fileInput` with `test-print.svg`.
4. Screenshot front (chest).
5. Drag the rotation strip (`#rsTrack`) to turn the model so the back faces the camera; screenshot back.
6. Rotate to ~45°; screenshot angled view.

- [ ] **Step 3: Inspect the screenshots**

Grid lines must stay straight/parallel across the chest and back curvature — no local warping, no shearing, no folded artifacts. Circle must stay round-ish (perspective foreshortening is OK; local pinching is not). Compare against the previous `final-print-front.png` / `final-print-angled.png` artifacts in the repo root.

- [ ] **Step 4: Edge-case pass**

- Upload → drag print near sleeve/armhole → logo follows surface, no flip artifacts.
- Flip front↔back → logo appears on the matching panel, upright, correct size.
- Delete → shirt returns to plain white.
- Resize to MIN (0.05) and MAX (1.1) → no crashes, logo scales smoothly.

- [ ] **Step 5: Report results**

Report screenshots + any anomalies to the user. If the logo appears mirrored, negate the Y axis in `faceAffine`'s `py` (and keep `-aff10/-aff11` signs in `paintShirt`) and re-run.
