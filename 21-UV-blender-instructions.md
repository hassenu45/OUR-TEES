# Blender UV Unwrapping Instructions for 21/model.obj

## Goal
Re-export `21/model.obj` with proper UV unwrapping so that the front, back, left shoulder, and right shoulder zones map cleanly to their designated regions in the 2048×2048 canvas texture.

## UV Zone Layout (matches `ZONE_UV_BOUNDS` in `21.html`)
| Zone        | U Range | V Range | Canvas Region         |
|-------------|---------|---------|-----------------------|
| front       | 0.30–0.70 | 0.22–0.78 | Center of canvas    |
| back        | 0.0–0.30  | 0.22–0.78 | Left side of canvas |
| right_shoulder | 0.70–0.92 | 0.58–0.92 | Top-right           |
| left_shoulder  | 0.08–0.30 | 0.58–0.92 | Top-left            |

## Steps in Blender

### 1. Open the Model
- Launch Blender
- File → Import → Wavefront (.obj)
- Select `21/model.obj`
- Make sure **Import Lines as Polylines** is **unchecked**
- Click **Import OBJ**

### 2. Mark Seams
Switch to **Edit Mode** (`Tab`):
- Select all vertices (`A`)
- Mark seams along the natural edges of the T-shirt:
  - **Side seams**: Left and right sides of the torso (from armpit to hem)
  - **Shoulder seams**: Where sleeves meet the body
  - **Back center**: From nape of neck down the center-back (optional, helps separate back from front)
- In Edit Mode, select edge loops → Right-click → **Mark Seam**

### 3. UV Unwrap
- With all vertices selected, press `U` → **Unwrap**
- Open the **UV Editor** panel (bottom or right sidebar)
- You should see the unwrapped UV islands

### 4. Arrange UV Islands
In the UV Editor, arrange the islands to match the layout above:
- **Front**: Place the front face island in the center-bottom area (U: 0.30–0.70, V: 0.22–0.78)
- **Back**: Place the back face island on the left side (U: 0.0–0.30, V: 0.22–0.78)
- **Right shoulder**: Place on the top-right (U: 0.70–0.92, V: 0.58–0.92)
- **Left shoulder**: Place on the top-left (U: 0.08–0.30, V: 0.58–0.92)
- Scale each island to fill its designated region without overlapping others
- Make sure UV coordinates stay within the 0–1 range (no overlaps at edges)

### 5. Verify UV Layout
- Switch to **Textured** draw type in the 3D viewport to see how the texture maps
- Ensure there is no stretching or distortion on visible areas (chest, back, sleeves)
- The seam lines should be on the natural edges (sides, shoulders, center-back)

### 6. Export the Model
- Switch back to **Object Mode**
- File → Export → Wavefront (.obj)
- In the export panel:
  - ✅ **Include → UVs** (checked)
  - ✅ **Include → Normals** (checked)
  - ✅ **Geometry → Triangles** (recommended for compatibility)
  - ✅ **Transform → Forward: -Y Forward** (match the original export)
  - ✅ **Transform → Up: Z Up**
- Save as `21/model.obj` (overwrite the existing file)
- A `model.mtl` file will also be generated — keep it in the same folder

### 7. Replace the Model
- Copy the new `model.obj` (and `model.mtl`) into `21/` folder
- The `21.html` will automatically generate UVs if they are missing, but proper UV unwrapping from Blender will give the best visual result

## Notes
- The current `21.html` includes a fallback `generateUVs()` function that creates cylindrical UV projections if the model has no UVs. For best results, use the Blender UV unwrapping described above.
- The model's faces must have proper normals facing outward for the raycasting to work correctly.
- If the model uses quads instead of triangles, Blender's export with **Triangles** enabled will convert them automatically.