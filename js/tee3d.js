/* AZMA — TeeViewer: عارض تيشيرت 3D بنظام Decal (قواعد tshirt-3d-prints إلزامية) */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

const MODEL_URL = '21/model.obj';
const BASE_PRINT_WORLD_SIZE = 0.42;
const CHEST_ANCHOR = new THREE.Vector3(0, 0.06, 4.2);

export class TeeViewer {
  constructor(container) {
    this.container = container;
    this.ready = false;
    this._disposed = false;
    this._canvas = null;
    this._renderer = null;
    this._controls = null;
    this._group = null;
    this._shirtMeshes = [];
    this._printMesh = null;
    this._printTex = null;
    this._printMat = null;
    this._imageSrc = null;
  }

  async init() {
    if (this._renderer) return;
    const w = this.container.clientWidth || 320;
    const h = this.container.clientHeight || 400;
    const canvas = document.createElement('canvas');
    this._canvas = canvas;
    this.container.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    this._renderer = renderer;

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x161616, 1.1));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.4);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(-3, 1, -2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xf5c842, 0.7);
    rim.position.set(-2, 2.5, -3);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
    camera.position.set(1.5, 1.1, 2.8);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.minDistance = 1.4;
    controls.maxDistance = 6;
    this._controls = controls;

    const group = new THREE.Group();
    scene.add(group);
    this._group = group;

    const shirtMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f0,
      roughness: 0.72,
      metalness: 0.02,
    });

    await new Promise((resolve, reject) => {
      new OBJLoader().load(
        MODEL_URL,
        (obj) => {
          obj.traverse((c) => {
            if (c.isMesh) {
              c.material = shirtMat;
              this._shirtMeshes.push(c);
            }
          });
          group.add(obj);
          const box = new THREE.Box3().setFromObject(group);
          const sz = box.getSize(new THREE.Vector3());
          const ctr = box.getCenter(new THREE.Vector3());
          const rad = Math.max(sz.x, sz.y, sz.z) * 0.5 || 1;
          group.position.sub(ctr);
          camera.near = rad / 100;
          camera.far = rad * 20;
          const dist = rad * 1.9 + 0.6;
          camera.position.set(dist * 0.6, dist * 0.45, dist * 1.1);
          controls.target.set(0, sz.y * -0.05, 0);
          controls.update();
          this.ready = true;
          this._applyPrint();
          resolve();
        },
        undefined,
        () => reject(new Error('فشل تحميل المجسم'))
      );
    });

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
  }

  setImage(src) {
    this._imageSrc = src;
    if (this.ready) this._applyPrint();
  }

  _applyPrint() {
    if (!this._imageSrc || !this._group) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this._disposed) return;
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      const aspect = img.width && img.height ? img.width / img.height : 1;
      const ws = BASE_PRINT_WORLD_SIZE;
      const depth = Math.max(ws, ws / aspect) * 0.65;
      const sz = new THREE.Vector3(ws, ws / aspect, depth);

      const raycaster = new THREE.Raycaster();
      raycaster.far = 9;
      const s = CHEST_ANCHOR.clone();
      this._group.localToWorld(s);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this._group.quaternion);
      raycaster.set(s, dir);
      const hits = raycaster.intersectObjects(this._shirtMeshes, false);
      if (!hits[0]) return;

      const wn = new THREE.Vector3().copy(hits[0].face.normal).transformDirection(hits[0].object.matrixWorld);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), wn);
      const eu = new THREE.Euler().setFromQuaternion(q);
      const geo = new DecalGeometry(hits[0].object, hits[0].point, eu, sz);
      if (geo.attributes.position.count === 0) {
        geo.dispose();
        return;
      }
      geo.applyMatrix4(this._group.matrixWorld.clone().invert());
      const ln = wn.clone().applyQuaternion(this._group.quaternion.clone().invert()).normalize();
      const nudge = 0.006 + 0.004 * ws;
      geo.translate(ln.x * nudge, ln.y * nudge, ln.z * nudge);

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        alphaTest: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });

      if (this._printMesh) {
        this._group.remove(this._printMesh);
        if (this._printMesh.geometry) this._printMesh.geometry.dispose();
        if (this._printMat) this._printMat.dispose();
      }
      if (this._printTex) this._printTex.dispose();

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      this._group.add(mesh);
      this._printMesh = mesh;
      this._printMat = mat;
      this._printTex = tex;
    };
    img.onerror = () => {};
    img.src = this._imageSrc;
  }

  dispose() {
    this._disposed = true;
    if (this._renderer) {
      this._renderer.setAnimationLoop(null);
      this._controls?.dispose();
      this._renderer.dispose();
      this._canvas?.remove();
    }
    if (this._printMesh) {
      this._printMesh.geometry.dispose();
    }
    if (this._printMat) this._printMat.dispose();
    if (this._printTex) this._printTex.dispose();
    this._renderer = null;
    this._canvas = null;
    this._controls = null;
    this._group = null;
    this._shirtMeshes = [];
    this._printMesh = null;
    this._printMat = null;
    this._printTex = null;
    this.ready = false;
  }
}
