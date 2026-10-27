// 城市装配器 — 把地图数据(元素列表)装配为 Three.js 场景
// 游戏用 'chunks'(分块合并,极少 draw call);编辑器用 'elements'(每元素独立,便于拾取/移动)
import * as THREE from 'three';
import { MeshBuilder } from './mesh-builder.js';
import { Terrain } from './generators/terrain.js';
import { TreeSystem } from './generators/tree.js';
import { addBlock } from './generators/block.js';
import { addPark } from './generators/park.js';
import { addBuilding } from './generators/building.js';
import { buildLandmark } from './landmarks.js';
import { mulberry32, rngRange, rngInt, rngPick } from './rng.js';
import { ColliderGrid } from './collider-grid.js';
import { earclip, polyArea, pointInPoly, centroid } from './poly.js';
import { C } from './palette.js';

const CHUNK = 320; // 分块尺寸(世界单位)

export { ColliderGrid };

export const MATERIALS = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.62 }),
  water: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.85 }),
};

export class City {
  constructor(scene, mapData, opts = {}) {
    this.scene = scene;
    this.map = mapData;
    this.mode = opts.mode || 'chunks';
    this.terrain = null;
    this.treeSys = new TreeSystem(scene);
    this.colliders = new ColliderGrid();
    this.landmarks = [];      // {name,x,z,labelY,radius}
    this.waterRects = [];
    this.parkRects = [];
    this.blockRects = [];
    this.elementGroups = new Map(); // el.id → {group, meshes}
    this.fpList = [];
    this.root = new THREE.Group();
    this.root.name = 'city';
    scene.add(this.root);
    this.roadMesh = null;
    this.cityRect = null;
  }

  #settings() { return this.map.settings || (this.map.settings = {}); }
  elements() { return this.map.elements || (this.map.elements = []); }
  groundY(x, z) { return this.terrain ? this.terrain.sample(x, z) : 0; }

  #computeCityRect() {
    const s = this.#settings();
    if (s.cityRect) return s.cityRect;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const el of this.elements()) {
      if (el.type === 'tree') continue;
      const r = Math.max(el.w || 60, el.d || 60) / 2 + 30;
      x0 = Math.min(x0, el.x - r); x1 = Math.max(x1, el.x + r);
      z0 = Math.min(z0, el.z - r); z1 = Math.max(z1, el.z + r);
    }
    if (x0 === Infinity) { x0 = -500; z0 = -500; x1 = 500; z1 = 500; }
    return { x0: Math.round(x0), z0: Math.round(z0), x1: Math.round(x1), z1: Math.round(z1) };
  }

  async build(onProgress = () => {}) {
    const els = this.elements();
    onProgress(0, '生成地形');
    this.cityRect = this.#computeCityRect();
    this.terrain = new Terrain({ ...(this.#settings().terrain || {}), cityRect: this.cityRect });
    this.terrain.buildMesh(this.scene);

    onProgress(0.08, '铺设道路');
    this.#buildRoads();

    const chunks = new Map();
    const total = els.length || 1;
    for (let i = 0; i < els.length; i++) {
      this.#dispatch(els[i], chunks);
      if (i % 24 === 0) {
        onProgress(0.08 + 0.8 * (i / total), '构建城市 ' + (i + 1) + '/' + els.length);
        await new Promise((r) => setTimeout(r));
      }
    }

    onProgress(0.92, '合并网格');
    if (this.mode === 'chunks') this.#flushChunks(chunks);
    this.treeSys.rebuild();
    this.#rebuildColliders();
    onProgress(1, '完成');
  }

  #flushChunks(chunks) {
    for (const [, ch] of chunks) {
      for (const [key, mb] of [['solid', ch.solid], ['glass', ch.glass], ['water', ch.water]]) {
        if (!mb || mb.empty) continue;
        const mesh = new THREE.Mesh(mb.build(), MATERIALS[key]);
        mesh.castShadow = key === 'solid';
        mesh.receiveShadow = true;
        this.root.add(mesh);
      }
    }
  }

  #chunkOf(chunks, x, z) {
    const key = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    let ch = chunks.get(key);
    if (!ch) {
      ch = { solid: new MeshBuilder(), glass: new MeshBuilder(), water: new MeshBuilder() };
      chunks.set(key, ch);
    }
    return ch;
  }

  /** 供生成器把树木加进全局实例系统(自动贴地) */
  #makeCtx() {
    return {
      ox: 0, oz: 0,
      water: this.waterRects,
      addTree: (x, z, variant, scale, seed) => {
        this.treeSys.add(x, z, this.groundY(x, z) + 0.1, variant, scale, seed);
      },
    };
  }

  #dispatch(el, chunks = null) {
    const ctx = this.#makeCtx();
    const gy = this.groundY(el.x, el.z);
    let solid, glass, water, entry = null;
    if (this.mode === 'elements') {
      entry = { group: new THREE.Group(), meshes: [], data: el };
      solid = new MeshBuilder(); glass = new MeshBuilder(); water = new MeshBuilder();
    } else {
      const ch = this.#chunkOf(chunks, el.x, el.z);
      solid = ch.solid; glass = ch.glass; water = ch.water;
    }

    switch (el.type) {
      case 'block': {
        const res = addBlock(solid, el, ctx);
        this.#collectFps(res.footprints, el, gy);
        this.blockRects.push({ x: el.x, z: el.z, w: el.w, d: el.d });
        break;
      }
      case 'building': {
        const rnd = mulberry32(el.seed ?? 5);
        const fp = addBuilding(solid, rnd, {
          x: el.x, z: el.z, w: el.w, d: el.d, floors: el.floors, style: el.style, ry: el.ry || 0,
        });
        this.#collectFps([fp], el, gy);
        break;
      }
      case 'park': {
        addPark(solid, el, ctx);
        this.parkRects.push({ x: el.x, z: el.z, w: el.w, d: el.d });
        break;
      }
      case 'bldg': {
        // OSM 真实建筑:多边形挤出棱柱(失败回退最小外接矩形)/ 聚簇矩形
        const dispH = Math.max(1.2, (el.lv || 2) * 1.2); // 层高 3m ÷4 ×1.6 风格化
        const st = el.st || 'oldcity';
        const wallPool = { hutong: [0xb9a894, 0xada08c, 0x8f8a80, 0xa89880], oldcity: [0xcfc4b0, 0xc9b9a0, 0xc47b58, 0xb5c0c9, 0xd8d0bf], modern: [0x9fb6c8, 0xa8bcc4, 0x8fa8b8, 0xc5cdd2], tower: [0x7e9fb5, 0x93b0bd, 0x6d8fa6] }[st] || [0xcfc4b0];
        const roofC = { hutong: 0x6d6459, oldcity: 0x565b63, modern: 0x4f5a66, tower: 0x3f4a56 }[st] || 0x565b63;
        const rnd = mulberry32(el.id * 2654435761 >>> 0);
        const wall = rngPick(rnd, wallPool);
        let cx = el.x, cz = el.z, hw = 0, hd = 0, h = gy + dispH;
        if (el.rect) {
          const [rcx, rcz, rw, rd] = el.rect;
          cx = rcx; cz = rcz; hw = rw / 2; hd = rd / 2;
          solid.box(rcx, gy + dispH / 2, rcz, rw, dispH, rd, wall);
          solid.box(rcx, gy + dispH + 0.12, rcz, rw * 0.9, 0.24, rd * 0.9, roofC);
        } else if (Array.isArray(el.p) && el.p.length >= 3) {
          let pts = el.p.slice();
          if (polyArea(pts) < 0) pts.reverse();
          const tris = earclip(pts);
          // 墙面(顺序保证外向法线)
          const n = pts.length;
          for (let i = 0; i < n; i++) {
            const p = pts[i], q = pts[(i + 1) % n];
            solid._quad(
              [q[0], gy, q[1]], [p[0], gy, p[1]], [p[0], gy + dispH, p[1]], [q[0], gy + dispH, q[1]], wall,
            );
          }
          if (tris) {
            for (const [a, b, c] of tris) {
              solid._tri(
                pts[a][0], gy + dispH, pts[a][1],
                pts[c][0], gy + dispH, pts[c][1],
                pts[b][0], gy + dispH, pts[b][1], roofC,
              );
            }
          } else {
            solid.box(el.x, gy + dispH / 2, el.z, 4, dispH, 4, wall); // 兜底
          }
          let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
          for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
          cx = (x0 + x1) / 2; cz = (z0 + z1) / 2; hw = (x1 - x0) / 2; hd = (z1 - z0) / 2;
        } else break;
        if (hw > 0.5 && hd > 0.5) this.fpList.push({ x: cx, z: cz, hw, hd, h });
        break;
      }
      case 'green': {
        // OSM 绿地/公园多边形:草面 + 边缘 + 散树
        if (!Array.isArray(el.p) || el.p.length < 3) break;
        let pts = el.p.slice();
        if (polyArea(pts) < 0) pts.reverse();
        const tris = earclip(pts);
        if (tris) {
          for (const [a, b, c] of tris) {
            solid._tri(
              pts[a][0], gy + 0.16, pts[a][1],
              pts[c][0], gy + 0.16, pts[c][1],
              pts[b][0], gy + 0.16, pts[b][1], 0x94c46f,
            );
          }
        }
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
        this.parkRects.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });
        // 散树(点内判定,种子确定)
        const rnd = mulberry32((el.id || 1) * 97 + 13);
        const area = Math.abs(polyArea(pts));
        const nTree = Math.min(90, Math.round((area / 420) * (el.treeD ?? 0.55)));
        let placed = 0, tries = 0;
        while (placed < nTree && tries++ < nTree * 4) {
          const tx = rngRange(rnd, x0 + 2, x1 - 2), tz = rngRange(rnd, z0 + 2, z1 - 2);
          if (!pointInPoly(tx, tz, pts)) continue;
          ctx.addTree(tx, tz, rngPick(rnd, ['broadleaf', 'conifer', 'ginko', 'willow']), rngRange(rnd, 0.85, 1.3), rngInt(rnd, 1, 1e9));
          placed++;
        }
        break;
      }
      case 'waterPoly': {
        // OSM 水面多边形(保留后海/护城河真实形状)
        if (!Array.isArray(el.p) || el.p.length < 3) break;
        let pts = el.p.slice();
        if (polyArea(pts) < 0) pts.reverse();
        const [gx, gz] = centroid(pts);
        const shore = pts.map((p) => [gx + (p[0] - gx) * 1.07, gz + (p[1] - gz) * 1.07]);
        const trisShore = earclip(shore);
        if (trisShore) for (const [a, b, c] of trisShore) {
          solid._tri(shore[a][0], gy + 0.1, shore[a][1], shore[c][0], gy + 0.1, shore[c][1], shore[b][0], gy + 0.1, shore[b][1], 0xcbb98a);
        }
        const tris = earclip(pts);
        if (tris) for (const [a, b, c] of tris) {
          water._tri(pts[a][0], gy + 0.22, pts[a][1], pts[c][0], gy + 0.22, pts[c][1], pts[b][0], gy + 0.22, pts[b][1], 0x4f8fd0);
        }
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
        this.waterRects.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });
        break;
      }
      case 'tree': {
        this.treeSys.add(el.x, el.z, gy + 0.1, el.variant || 'broadleaf', el.s || 1, el.seed || (el.id * 7919), el.id);
        break;
      }
      case 'water': {
        water.box(el.x, gy + 0.05, el.z, el.w, 0.3, el.d, C.water);
        solid.box(el.x, gy - 0.1, el.z, el.w + 4, 0.4, el.d + 4, C.shore);
        this.waterRects.push({ x: el.x, z: el.z, w: el.w, d: el.d });
        break;
      }
      case 'landmark': {
        const lm = buildLandmark(el.lm);
        const tr = { x: el.x, y: gy, z: el.z, ry: el.ry || 0, s: el.s || 1 };
        solid.mergeBuilder(lm.solid, tr);
        if (lm.glass) glass.mergeBuilder(lm.glass, tr);
        if (lm.water) water.mergeBuilder(lm.water, tr);
        this.#collectFps(lm.footprints, el, gy);
        this.landmarks.push({
          name: lm.name, x: el.x, z: el.z,
          labelY: gy + lm.labelY * (el.s || 1), radius: lm.radius * (el.s || 1),
        });
        // 地标附带的树木(湖畔垂柳/古柏),随地标朝向旋转
        const ryLm = el.ry || 0, csLm = Math.cos(ryLm), snLm = Math.sin(ryLm), scLm = el.s || 1;
        for (const t of lm.trees || []) {
          ctx.addTree(el.x + (t.x * csLm - t.z * snLm) * scLm, el.z + (t.x * snLm + t.z * csLm) * scLm, t.variant, 1.1, (Math.abs(t.x * 31 + t.z * 17) | 0) + 3);
        }
        break;
      }
    }

    if (this.mode === 'elements') {
      const mk = (mb, mat, shadow) => {
        if (mb.empty) return;
        const m = new THREE.Mesh(mb.build(), mat);
        m.castShadow = shadow; m.receiveShadow = true;
        m.userData.elId = el.id;
        entry.meshes.push(m);
        entry.group.add(m);
      };
      mk(solid, MATERIALS.solid, true);
      mk(glass, MATERIALS.glass, false);
      mk(water, MATERIALS.water, false);
      this.root.add(entry.group);
      this.elementGroups.set(el.id, entry);
    }
  }

  /** 局部 footprint(地标)→ 世界坐标碰撞盒 */
  #collectFps(fps, el, gy) {
    const s = el.s || 1, ry = el.ry || 0;
    const cos = Math.cos(ry), sin = Math.sin(ry);
    for (const fp of fps) {
      const cx = fp.x * s * cos - fp.z * s * sin + el.x;
      const cz = fp.x * s * sin + fp.z * s * cos + el.z;
      const ex = Math.abs(cos) * fp.hw * s + Math.abs(sin) * fp.hd * s;
      const ez = Math.abs(sin) * fp.hw * s + Math.abs(cos) * fp.hd * s;
      this.fpList.push({ x: cx, z: cz, hw: ex, hd: ez, h: gy + fp.h * s });
    }
  }

  #rebuildColliders() {
    this.colliders.clear();
    for (const b of this.fpList) this.colliders.insert(b);
  }

  #buildRoads() {
    const s = this.#settings();
    // 真实路网模式(OSM 导入):折线路面 + 中线虚线,不画整体沥青底板
    if (Array.isArray(s.roads) && s.roads.length) {
      const mb = new MeshBuilder();
      const Y = { major: 0.16, mid: 0.13, minor: 0.1 };
      const COLOR = { major: 0x3b4048, mid: 0x474c54, minor: 0x51565e };
      for (const rd of s.roads) {
        const p = rd.p;
        if (!p || p.length < 2) continue;
        const y = Y[rd.c] ?? 0.1;
        const jit = ((rd.i ?? 0) % 7) * 0.0016;
        const w = rd.w ?? 5;
        for (let i = 1; i < p.length; i++) {
          const x1 = p[i - 1][0], z1 = p[i - 1][1], x2 = p[i][0], z2 = p[i][1];
          const dx = x2 - x1, dz = z2 - z1;
          const len = Math.hypot(dx, dz);
          if (len < 0.8) continue;
          const nx = -dz / len * w / 2, nz = dx / len * w / 2;
          mb._quad(
            [x1 - nx, y + jit, z1 - nz], [x1 + nx, y + jit, z1 + nz],
            [x2 + nx, y + jit, z2 + nz], [x2 - nx, y + jit, z2 - nz], COLOR[rd.c] ?? 0x51565e,
          );
          if (rd.c === 'major' && len > 9) {
            const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
            const ux = dx / len, uz = dz / len;
            const dnx = -uz * 0.18, dnz = ux * 0.18;
            mb._quad(
              [mx - ux * 1.3 - dnx, y + jit + 0.02, mz - uz * 1.3 - dnz], [mx - ux * 1.3 + dnx, y + jit + 0.02, mz - uz * 1.3 + dnz],
              [mx + ux * 1.3 + dnx, y + jit + 0.02, mz + ux * 1.3 + dnz], [mx + ux * 1.3 - dnx, y + jit + 0.02, mz + ux * 1.3 - dnz], 0xd8d8d2,
            );
          }
        }
      }
      const mesh = new THREE.Mesh(mb.build(), MATERIALS.solid);
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.roadMesh = mesh;
      return;
    }
    const rect = this.cityRect;
    if (!rect || Math.abs(rect.x1 - rect.x0) < 10) return;
    const mb = new MeshBuilder();
    const y = 0.12;
    // 城区沥青底板
    mb.box((rect.x0 + rect.x1) / 2, y - 0.05, (rect.z0 + rect.z1) / 2,
      rect.x1 - rect.x0 + 90, 0.3, rect.z1 - rect.z0 + 90, C.asphalt);
    // 环路
    const rings = s.rings || [];
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      const w = 24 + i * 3;
      const c = i === 0 ? C.asphaltDark : 0x41464e;
      mb.box(0, y, -r, r * 2 + w, 0.14, w, c);
      mb.box(0, y, r, r * 2 + w, 0.14, w, c);
      mb.box(-r, y, 0, w, 0.14, r * 2, c);
      mb.box(r, y, 0, w, 0.14, r * 2, c);
      for (let t = -r + 10; t < r; t += 16) {
        for (const [dx, dz] of [[t, -r], [t, r], [-r, t], [r, t]]) {
          if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
          const along = dz === -r || dz === r;
          mb.box(dx, y + 0.09, dz, along ? 5 : 0.35, 0.05, along ? 0.35 : 5, C.roadLine);
        }
      }
    }
    // 长安街
    const av = s.avenue;
    if (av) {
      mb.box(0, y, av.z, (rect.x1 - rect.x0) + 120, 0.14, 26, C.asphaltDark);
      for (let t = rect.x0 - 40; t < rect.x1 + 40; t += 14) {
        mb.box(t, y + 0.09, av.z, 5, 0.05, 0.35, C.roadLine);
      }
    }
    const mesh = new THREE.Mesh(mb.build(), MATERIALS.solid);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.roadMesh = mesh;
  }

  // ---------- 编辑器增量 API ----------
  addElement(el, silent = false) {
    el.id = el.id || (this.#settings().nextId = (this.#settings().nextId || 0) + 1);
    this.elements().push(el);
    if (el.type === 'tree') {
      this.treeSys.add(el.x, el.z, this.groundY(el.x, el.z) + 0.1, el.variant || 'broadleaf', el.s || 1, el.seed || (el.id * 7919), el.id);
      if (!silent) this.treeSys.rebuild();
    } else if (this.mode === 'elements') {
      this.#dispatch(el, null);
    }
    return el;
  }

  removeElement(el) {
    const arr = this.elements();
    const i = arr.indexOf(el);
    if (i >= 0) arr.splice(i, 1);
    const entry = this.elementGroups.get(el.id);
    if (entry) {
      this.root.remove(entry.group);
      entry.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.elementGroups.delete(el.id);
    }
    if (el.type === 'tree') this.#rebuildTreesFromElements();
  }

  rebuildElement(el) {
    this.removeElement(el);
    this.elements().push(el);
    if (el.type === 'tree') this.#rebuildTreesFromElements();
    else if (this.mode === 'elements') this.#dispatch(el, null);
  }

  #rebuildTreesFromElements() {
    this.treeSys.clear();
    for (const el of this.elements()) {
      if (el.type === 'tree') {
        this.treeSys.add(el.x, el.z, this.groundY(el.x, el.z) + 0.1, el.variant || 'broadleaf', el.s || 1, el.seed || (el.id * 7919), el.id);
      }
    }
    this.treeSys.rebuild();
  }

  rebuildAll() {
    for (const [, entry] of this.elementGroups) {
      this.root.remove(entry.group);
      entry.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.elementGroups.clear();
    const keep = [this.terrain && this.terrain.mesh, this.roadMesh];
    for (let i = this.root.children.length - 1; i >= 0; i--) {
      if (!keep.includes(this.root.children[i])) this.root.remove(this.root.children[i]);
    }
    this.landmarks = []; this.waterRects = []; this.parkRects = []; this.blockRects = [];
    this.fpList = [];
    this.treeSys.clear();
    const chunks = new Map();
    for (const el of this.elements()) this.#dispatch(el, chunks);
    if (this.mode === 'chunks') this.#flushChunks(chunks);
    this.treeSys.rebuild(); // dispatch 过程中隐式树与元素树都已入列,直接重建
    this.#rebuildColliders();
  }

  /** 编辑器:重建道路(城市范围/环路变化后) */
  rebuildRoads() {
    if (this.roadMesh) {
      this.root.remove(this.roadMesh);
      this.roadMesh.geometry.dispose();
      this.roadMesh = null;
    }
    this.cityRect = this.#computeCityRect();
    this.#buildRoads();
  }

  /** 编辑器:地形参数变化,重建地形与全部元素 */
  regenerateTerrain() {
    if (this.terrain && this.terrain.mesh) {
      this.scene.remove(this.terrain.mesh);
      this.terrain.mesh.geometry.dispose();
    }
    this.cityRect = this.#computeCityRect();
    this.terrain = new Terrain({ ...(this.#settings().terrain || {}), cityRect: this.cityRect, edits: null });
    this.terrain.buildMesh(this.scene);
    this.rebuildAll();
  }

  /** 编辑器:地形笔刷后,刷新地面网格 + 元素高度 */
  refreshTerrain(rebuildElements = true) {
    this.terrain.updateMesh();
    if (rebuildElements) this.rebuildAll();
    else this.treeSys.updateGroundY((x, z) => this.groundY(x, z) + 0.1);
  }

  stats() {
    let buildings = 0;
    for (const el of this.elements()) {
      if (el.type === 'building') buildings++;
      if (el.type === 'block') buildings += 4;
    }
    return { elements: this.elements().length, buildings, trees: this.treeSys.items.length };
  }
}
