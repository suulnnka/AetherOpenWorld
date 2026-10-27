// 街头生态 — 汽车(轿车/出租/SUV/面包/公交/货车/警车)、外卖电动车、共享单车、行人
// 玩家不可驾驶,纯观赏氛围。全部代理用"部件级 InstancedMesh"渲染:
// 例如所有行人共用 6 个实例网格(头/身/双臂/双腿),车轮共用一个实例网格,
// 数百个动画代理仅 ~30 个 draw call,前端压力极小。
import * as THREE from 'three';
import { MeshBuilder } from '../mesh-builder.js';
import { mulberry32, rngRange, rngInt, rngPick, rngChance } from '../rng.js';

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true });
const WHITE = 0xffffff; // 由实例色提供颜色的部件用白色几何
const GLASS = 0x9fc4d8, TIRE = 0x23262b;

// ---------- 路径 ----------
/** 环路矩形循环;r=环路半径,offset=车道偏移(靠右),dir=方向 */
class RingPath {
  constructor(r, offset, dir) { this.r = r; this.off = offset; this.dir = dir; this.len = 8 * (r + offset); }
  at(t) {
    const rr = this.r - this.off * this.dir; // 靠右行驶
    const L = 2 * rr;
    let s = ((t % this.len) + this.len) % this.len;
    let x, z, ang;
    if (s < L) { x = -rr + s; z = -rr; ang = 0; }
    else if (s < 2 * L) { x = rr; z = -rr + (s - L); ang = -Math.PI / 2; }
    else if (s < 3 * L) { x = rr - (s - 2 * L); z = rr; ang = Math.PI; }
    else { x = -rr; z = rr - (s - 3 * L); ang = Math.PI / 2; }
    if (this.dir < 0) ang += Math.PI;
    return { x, z, ang };
  }
}
/** 真实路网折线路径(往复行驶,靠右偏移) */
class PolylinePath {
  constructor(pts, offset, dir) {
    this.pts = pts; this.off = offset; this.dir = dir;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    this.L = this.cum[this.cum.length - 1];
    this.len = this.L * 2; // 往复
  }
  at(t) {
    let s = ((t % this.len) + this.len) % this.len;
    let rev = false;
    if (s > this.L) { s = this.L - (s - this.L); rev = true; }
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const f = (s - this.cum[i - 1]) / (this.cum[i] - this.cum[i - 1] || 1);
    const p = this.pts[i - 1], q = this.pts[i];
    let x = p[0] + (q[0] - p[0]) * f, z = p[1] + (q[1] - p[1]) * f;
    const dx = q[0] - p[0], dz = q[1] - p[1];
    const len = Math.hypot(dx, dz) || 1;
    // 行进方向(往复时反向)
    const sd = this.dir * (rev ? -1 : 1);
    const hx = (dx / len) * sd, hz = (dz / len) * sd;
    // 右侧法向 (-hz, hx),车道偏移
    x += -hz * this.off * sd;
    z += hx * this.off * sd;
    return { x, z, ang: Math.atan2(-hz, hx) === 0 ? 0 : Math.atan2(-hz, hx) };
  }
}

/** 长安街直线通道 */
class AvenuePath {
  constructor(z, offset, dir, halfLen) { this.z = z; this.off = offset; this.dir = dir; this.len = halfLen * 2; this.halfLen = halfLen; }
  at(t) {
    let s = ((t % this.len) + this.len) % this.len;
    const x = -this.halfLen + s;
    const z = this.z + this.off * this.dir;
    return { x, z, ang: this.dir > 0 ? 0 : Math.PI };
  }
}

// ---------- 几何:汽车(车头朝 +x,落地 y=0) ----------
function sedanBody(color, taxi = false) {
  const mb = new MeshBuilder();
  mb.box(0, 0.58, 0, 4.6, 0.56, 2.0, color);
  mb.box(-0.25, 1.06, 0, 2.5, 0.52, 1.86, color);
  mb.box(-0.25, 1.09, 0, 2.14, 0.4, 1.9, GLASS);
  mb.box(2.31, 0.62, 0, 0.1, 0.16, 1.5, 0xfff3c4);
  mb.box(-2.31, 0.62, 0, 0.1, 0.16, 1.5, 0xd94f3f);
  if (taxi) {
    mb.box(0, 0.78, 0, 4.62, 0.2, 2.02, 0xf2f2ee);              // 白色腰线
    mb.box(-0.25, 1.34, 0, 2.3, 0.1, 1.7, 0xf2f2ee);            // 白顶
    mb.box(1.05, 1.5, 0, 0.55, 0.2, 0.34, 0xe8b33a);            // 顶灯
  }
  return mb;
}
function suvBody(color) {
  const mb = new MeshBuilder();
  mb.box(0, 0.82, 0, 4.8, 0.9, 2.1, color);
  mb.box(-0.2, 1.55, 0, 3.2, 0.68, 2.02, color);
  mb.box(-0.2, 1.58, 0, 2.8, 0.5, 2.06, GLASS);
  mb.box(0, 1.92, 0, 2.6, 0.08, 1.7, 0x3a3f47);
  mb.box(2.41, 0.8, 0, 0.1, 0.2, 1.6, 0xfff3c4);
  mb.box(-2.41, 0.8, 0, 0.1, 0.2, 1.6, 0xd94f3f);
  return mb;
}
function vanBody(color) { // 金杯面包车
  const mb = new MeshBuilder();
  mb.box(0, 1.05, 0, 4.6, 1.5, 1.9, color);
  mb.box(2.1, 1.35, 0, 0.5, 0.85, 1.78, GLASS);
  mb.box(0.6, 1.35, 0, 0.4, 0.6, 1.94, GLASS);
  mb.box(-0.9, 1.35, 0, 0.4, 0.6, 1.94, GLASS);
  mb.box(2.36, 0.7, 0, 0.08, 0.3, 1.4, 0xfff3c4);
  return mb;
}
function busBody(base, accent) { // 公交
  const mb = new MeshBuilder();
  mb.box(0, 1.72, 0, 10.5, 2.35, 2.5, base);
  mb.box(0, 2.5, 0, 10.1, 0.85, 2.54, GLASS);
  mb.box(0, 1.15, 0, 10.54, 0.45, 2.56, accent);
  mb.box(5.2, 1.9, 0, 0.16, 1.3, 2.2, GLASS);
  mb.box(0, 0.45, 0, 10.2, 0.3, 2.3, 0x3a3f47);
  return mb;
}
function truckBody(cab, cargo) { // 厢式货车
  const mb = new MeshBuilder();
  mb.box(3.1, 1.35, 0, 2.3, 1.5, 2.2, cab);
  mb.box(4.0, 1.5, 0, 0.5, 0.7, 2.0, GLASS);
  mb.box(-1.5, 1.6, 0, 6.0, 2.1, 2.3, cargo);
  mb.box(-1.5, 1.6, 0, 6.02, 0.5, 2.34, 0xb9bdc4);
  return mb;
}
function policeBody() {
  const mb = sedanBody(0xf2f2f4);
  mb.box(0.9, 0.62, 0, 1.6, 0.3, 2.02, 0x2b4f8f);
  mb.box(-0.25, 1.4, 0, 1.1, 0.16, 1.3, 0x2b2b30);
  mb.box(-0.25, 1.42, -0.32, 0.5, 0.14, 0.28, 0xd94f3f); // 警灯
  mb.box(-0.25, 1.42, 0.32, 0.5, 0.14, 0.28, 0x3f6fd9);
  return mb;
}

// ---------- 几何:电动车(外卖骑手) ----------
function ebikeBody(variant) {
  const mb = new MeshBuilder();
  const jacket = variant === 'meituan' ? 0xe8a02c : variant === 'eleme' ? 0x3f7fd9 : 0x2b2f36;
  mb.box(0, 0.3, 0, 1.15, 0.12, 0.34, 0x2b2f36);            // 踏板
  mb.box(-0.42, 0.82, 0, 0.58, 0.15, 0.4, 0x1a1c20);        // 座椅
  mb.box(0.58, 0.72, 0, 0.09, 0.85, 0.09, 0x2b2f36);        // 前立柱
  mb.box(0.58, 1.12, 0, 0.12, 0.07, 0.72, 0x1a1c20);        // 车把
  mb.box(0.95, 0.42, 0, 0.22, 0.3, 0.28, 0x2b2f36);         // 前挡
  mb.box(1.06, 0.5, 0, 0.06, 0.12, 0.18, 0xfff3c4);         // 前灯
  // 骑手(坐姿,含头盔)
  mb.box(0.02, 0.66, 0.22, 0.42, 0.13, 0.15, 0x39425a);     // 大腿
  mb.box(0.02, 0.66, -0.22, 0.42, 0.13, 0.15, 0x39425a);
  mb.box(0.28, 0.42, 0.22, 0.13, 0.42, 0.13, 0x39425a);     // 小腿
  mb.box(0.28, 0.42, -0.22, 0.13, 0.42, 0.13, 0x39425a);
  mb.box(-0.15, 1.22, 0, 0.44, 0.55, 0.5, jacket);          // 上身
  mb.box(0.28, 1.3, 0.26, 0.4, 0.12, 0.12, jacket);         // 手臂
  mb.box(0.28, 1.3, -0.26, 0.4, 0.12, 0.12, jacket);
  mb.box(-0.18, 1.66, 0, 0.3, 0.28, 0.3, 0xf0c8a0);         // 头
  mb.box(-0.18, 1.8, 0, 0.34, 0.14, 0.34, variant === 'meituan' ? 0xe8a02c : variant === 'eleme' ? 0x3f7fd9 : 0xd9503f); // 头盔
  if (variant !== 'plain') {
    const boxC = variant === 'meituan' ? 0xe8a02c : 0x3f7fd9;
    mb.box(-1.0, 1.1, 0, 0.6, 0.62, 0.52, boxC);            // 外卖箱
    mb.box(-1.0, 1.1, 0, 0.62, 0.2, 0.54, 0xf2f2ee);
  }
  return mb;
}

// ---------- 几何:共享单车 ----------
function bikeBody(color) {
  const mb = new MeshBuilder();
  mb.box(0.02, 0.6, 0, 0.95, 0.07, 0.07, color);            // 上管/下管
  mb.box(-0.42, 0.85, 0, 0.07, 0.6, 0.07, color);           // 座管
  mb.box(0.5, 0.85, 0, 0.07, 0.62, 0.07, color);            // 前叉
  mb.box(0.5, 1.16, 0, 0.07, 0.07, 0.62, 0x1a1c20);         // 车把
  mb.box(-0.46, 1.18, 0, 0.3, 0.09, 0.22, 0x1a1c20);        // 车座
  mb.box(0.74, 0.98, 0, 0.36, 0.26, 0.3, 0x8a949c);         // 车筐
  // 骑手
  mb.box(-0.12, 1.38, 0, 0.46, 0.52, 0.46, 0x39425a);       // 上身(前倾)
  mb.box(0.2, 1.42, 0.24, 0.42, 0.11, 0.11, 0x39425a);      // 手臂→车把
  mb.box(0.2, 1.42, -0.24, 0.42, 0.11, 0.11, 0x39425a);
  mb.box(-0.16, 1.76, 0, 0.28, 0.26, 0.28, 0xf0c8a0);       // 头
  mb.box(-0.16, 1.9, 0, 0.32, 0.12, 0.32, color);           // 头盔=车色
  return mb;
}

// ---------- 几何:行人部件(白色部件由实例色上色) ----------
function pedHead() {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 0.34, 0.32, 0.32, 0xf0c8a0);
  mb.box(0, 0.14, -0.02, 0.36, 0.12, 0.34, 0x2e2620);
  return mb;
}
function pedTorso() { // 原点在颈部下方(摆动枢轴)
  const mb = new MeshBuilder();
  mb.box(0, -0.32, 0, 0.5, 0.62, 0.3, WHITE);
  return mb;
}
function pedArm() { // 原点在肩
  const mb = new MeshBuilder();
  mb.box(0, -0.26, 0, 0.11, 0.5, 0.13, WHITE);
  return mb;
}
function pedLeg() { // 原点在髋
  const mb = new MeshBuilder();
  mb.box(0, -0.42, 0, 0.14, 0.84, 0.15, WHITE);
  mb.box(0, -0.82, 0.04, 0.16, 0.09, 0.26, 0x2b2b30);
  return mb;
}
function bikeRiderLeg() {
  const mb = new MeshBuilder();
  mb.box(0, -0.22, 0, 0.11, 0.42, 0.12, WHITE);
  return mb;
}

// 车轮几何(轴向沿车宽 z,实例 rz 自转;单位半径按需缩放)
function wheelGeo(radius, width, color) {
  const mb = new MeshBuilder();
  const g = new THREE.CylinderGeometry(1, 1, 1, 10).toNonIndexed();
  mb._geo(g, color, 0, 0, 0, 0, radius, width, radius, Math.PI / 2, 0);
  g.dispose();
  return mb.build();
}

// ---------- 部件实例池 ----------
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ'); // 先世界朝向,后局部摆动
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

class PartPool {
  constructor(scene, geometry, capacity, tinted = false) {
    this.im = new THREE.InstancedMesh(geometry, MAT, capacity);
    this.im.frustumCulled = false;
    this.im.castShadow = true;
    this.im.count = capacity;
    this.tinted = tinted;
    scene.add(this.im);
  }
  set(i, x, y, z, yaw, lx = 0, ly = 0, lz = 0, rx = 0, rz = 0, scale = 1) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    _p.set(x + lx * c - lz * s, y + ly, z + lx * s + lz * c);
    _e.set(rx, yaw, rz);
    _q.setFromEuler(_e);
    _s.set(scale, scale, scale);
    _m.compose(_p, _q, _s);
    this.im.setMatrixAt(i, _m);
  }
  flush() { this.im.instanceMatrix.needsUpdate = true; }
  color(i, hex) {
    this.im.setColorAt(i, new THREE.Color(hex).convertSRGBToLinear());
  }
  colorsFlush() { if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true; }
}

// ---------- 车型定义 ----------
const CAR_TYPES = {
  sedan: {
    variants: [0xd9503f, 0x3f7fd9, 0xe8e6e1, 0x3a3f47, 0xe8b33a, 0x5aa86b].map((c) => sedanBody(c).build()),
    wheelR: 0.36, wheels: [[1.45, 0.98], [1.45, -0.98], [-1.45, 0.98], [-1.45, -0.98]],
    speed: [10.5, 14], weight: 34,
  },
  taxi: {
    variants: [sedanBody(0x2e8b57, true).build()],
    wheelR: 0.36, wheels: [[1.45, 0.98], [1.45, -0.98], [-1.45, 0.98], [-1.45, -0.98]],
    speed: [11, 14.5], weight: 18,
  },
  suv: {
    variants: [0x39425a, 0x8a949c, 0x6b4a34, 0xf2f2ee].map((c) => suvBody(c).build()),
    wheelR: 0.44, wheels: [[1.5, 1.02], [1.5, -1.02], [-1.5, 1.02], [-1.5, -1.02]],
    speed: [10, 13], weight: 14,
  },
  van: {
    variants: [0xf2f2ee, 0x8a949c, 0xd9503f].map((c) => vanBody(c).build()),
    wheelR: 0.4, wheels: [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]],
    speed: [9, 11.5], weight: 10,
  },
  bus: {
    variants: [busBody(0xe8e6e1, 0x2e8b57).build(), busBody(0xf2f2ee, 0x3f7fd9).build()],
    wheelR: 0.5, wheels: [[3.4, 1.18], [3.4, -1.18], [-3.4, 1.18], [-3.4, -1.18]],
    speed: [8, 10], weight: 10,
  },
  truck: {
    variants: [truckBody(0x3f7fd9, 0xe8e6e1).build(), truckBody(0xd9503f, 0xe8e6e1).build()],
    wheelR: 0.46, wheels: [[3.1, 1.05], [3.1, -1.05], [-1.0, 1.05], [-1.0, -1.05], [-3.5, 1.05], [-3.5, -1.05]],
    speed: [8.5, 10.5], weight: 9,
  },
  police: {
    variants: [policeBody().build()],
    wheelR: 0.36, wheels: [[1.45, 0.98], [1.45, -0.98], [-1.45, 0.98], [-1.45, -0.98]],
    speed: [12, 15], weight: 5,
  },
};
const EBIKE_TYPES = {
  plain: ebikeBody('plain').build(),
  meituan: ebikeBody('meituan').build(),
  eleme: ebikeBody('eleme').build(),
};
const BIKE_COLORS = [0xe8722c, 0xf5c518, 0x35b8c0, 0x3fa34d];
const SHIRTS = [0xd9503f, 0x3f7fd9, 0xe8b33a, 0x5aa86b, 0x8a5ac2, 0xd97b2f, 0xe8e6e1, 0x37424e, 0xc25b8a, 0x6bb3bd];
const PANTS = [0x39425a, 0x2b2b30, 0x6b6f78, 0x5a4632, 0x33566b];

export class CrowdSystem {
  /**
   * @param scene 三维场景
   * @param settings 烘焙包 manifest.settings(含 rings / avenue)
   * @param groundY (x,z)=>地面高度
   */
  constructor(scene, settings, groundY) {
    this.scene = scene;
    this.groundY = groundY;
    this.rnd = mulberry32(20261027);
    this.agents = { cars: [], ebikes: [], bikes: [], peds: [] };
    this.pools = new Map();
    this.netPaths = null;
    if (Array.isArray(settings.roads) && settings.roads.length) {
      // 真实路网模式(OSM 导入):主干道跑车流,次干道跑非机动车与行人
      const majors = [], mids = [];
      for (const rd of settings.roads) {
        const p = rd.p;
        let L = 0;
        for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
        if (rd.c === 'major' && L > 260) majors.push({ rd, L });
        else if (rd.c === 'mid' && L > 200) mids.push({ rd, L });
      }
      this.netPaths = { majors, mids };
      this.paths = [];
    } else {
      this.#buildPaths(settings);
    }
    this.#spawn();
    this.#allocate();
  }

  #buildPaths(settings) {
    const rings = settings.rings || [];
    this.paths = [];
    rings.forEach((r, i) => {
      const half = (24 + i * 3) / 2;
      this.paths.push({ kind: 'ring', ringIdx: i, r, half, laneA: 4.5, laneB: half - 4.5, bike: half - 1.6, walk: half + 4.5 });
    });
    const av = settings.avenue;
    if (av) this.paths.push({ kind: 'avenue', z: av.z, half: 13, laneA: 4.5, laneB: 9, bike: 11.5, walk: 15.5, halfLen: 880 });
  }

  #pickType() {
    const entries = Object.entries(CAR_TYPES);
    let total = 0;
    for (const [, t] of entries) total += t.weight;
    let x = this.rnd() * total;
    for (const [name, t] of entries) { x -= t.weight; if (x <= 0) return name; }
    return 'sedan';
  }

  #spawn() {
    if (this.netPaths) return this.#spawnOnRoads();
    const rnd = this.rnd;
    for (const p of this.paths) {
      const mk = (offset, dir, kind) => kind === 'ring'
        ? new RingPath(p.r, offset, dir)
        : new AvenuePath(p.z, offset, dir, p.halfLen);
      // 汽车:双车道双向
      const carN = p.kind === 'avenue' ? 8 : Math.min(18, Math.round(p.r / 55));
      for (let k = 0; k < carN; k++) {
        const dir = k % 2 === 0 ? 1 : -1;
        const lane = rnd() < 0.55 ? p.laneA : p.laneB;
        const type = this.#pickType();
        const def = CAR_TYPES[type];
        this.agents.cars.push({
          type, variant: rngInt(rnd, 0, def.variants.length - 1), def,
          path: mk(lane, dir, p.kind), t: rnd() * 9999,
          speed: rngRange(rnd, def.speed[0], def.speed[1]),
          spin: 0,
        });
      }
      // 电动车 + 自行车(只在四环内,外环机动车为主)
      const inner = (p.ringIdx ?? 0) < 3;
      const ebN = p.kind === 'avenue' || inner ? (p.kind === 'avenue' ? 4 : 5) : 0;
      const biN = p.kind === 'avenue' || inner ? 4 : 0;
      for (let k = 0; k < ebN; k++) {
        const variant = rngWeightedSimple(rnd, ['plain', 'meituan', 'eleme'], [3, 4, 3]);
        this.agents.ebikes.push({
          variant, path: mk(p.bike, k % 2 === 0 ? 1 : -1, p.kind),
          t: rnd() * 9999, speed: rngRange(rnd, 6.5, 9), phase: rnd() * 6.28, spin: 0,
        });
      }
      for (let k = 0; k < biN; k++) {
        this.agents.bikes.push({
          variant: rngInt(rnd, 0, BIKE_COLORS.length - 1),
          path: mk(p.bike, k % 2 === 0 ? -1 : 1, p.kind),
          t: rnd() * 9999, speed: rngRange(rnd, 3.8, 5.2), phase: rnd() * 6.28, spin: 0,
        });
      }
      // 行人(两侧人行道)
      const pedN = p.kind === 'avenue' ? 10 : Math.round(p.r / 45);
      for (let k = 0; k < pedN; k++) {
        this.agents.peds.push({
          path: mk(p.walk, k % 2 === 0 ? 1 : -1, p.kind),
          t: rnd() * 9999, speed: rngRange(rnd, 1.1, 1.8), phase: rnd() * 6.28,
          shirt: rngPick(rnd, SHIRTS), pants: rngPick(rnd, PANTS),
          scale: rngRange(rnd, 0.92, 1.06),
        });
      }
    }
  }

  /** 真实路网代理生成:主干道车流(双向双车道),次干道非机动车+行人(两侧) */
  #spawnOnRoads() {
    const rnd = this.rnd;
    const { majors, mids } = this.netPaths;
    const totalMajor = majors.reduce((a, m) => a + m.L, 0) || 1;
    const totalMid = mids.reduce((a, m) => a + m.L, 0) || 1;
    const pickRoad = (list, total) => {
      let x = rnd() * total;
      for (const m of list) { x -= m.L; if (x <= 0) return m; }
      return list[list.length - 1];
    };
    // 汽车:主干道为主,少量次干道
    const CAR_N = Math.min(84, 34 + (totalMajor / 1000 | 0));
    for (let k = 0; k < CAR_N; k++) {
      const m = pickRoad(rnd() < 0.85 ? majors : mids, rnd() < 0.85 ? totalMajor : totalMid);
      const dir = k % 2 === 0 ? 1 : -1;
      const lane = rnd() < 0.5 ? (m.rd.w ?? 6) * 0.22 : (m.rd.w ?? 6) * 0.38;
      const type = this.#pickType();
      const def = CAR_TYPES[type];
      this.agents.cars.push({
        type, variant: rngInt(rnd, 0, def.variants.length - 1), def,
        path: new PolylinePath(m.rd.p, lane, dir), t: rnd() * 9999,
        speed: rngRange(rnd, def.speed[0], def.speed[1]), spin: 0,
      });
    }
    // 电动车 / 自行车:次干道为主
    const EB_N = 18, BI_N = 16;
    for (let k = 0; k < EB_N; k++) {
      const m = pickRoad(mids, totalMid);
      const variant = rngWeightedSimple(rnd, ['plain', 'meituan', 'eleme'], [3, 4, 3]);
      this.agents.ebikes.push({
        variant, path: new PolylinePath(m.rd.p, (m.rd.w ?? 5) * 0.46, k % 2 === 0 ? 1 : -1),
        t: rnd() * 9999, speed: rngRange(rnd, 6.5, 9), phase: rnd() * 6.28, spin: 0,
      });
    }
    for (let k = 0; k < BI_N; k++) {
      const m = pickRoad(mids, totalMid);
      this.agents.bikes.push({
        variant: rngInt(rnd, 0, BIKE_COLORS.length - 1),
        path: new PolylinePath(m.rd.p, (m.rd.w ?? 5) * 0.46, k % 2 === 0 ? -1 : 1),
        t: rnd() * 9999, speed: rngRange(rnd, 3.8, 5.2), phase: rnd() * 6.28, spin: 0,
      });
    }
    // 行人:次干道两侧人行道
    const PED_N = 96;
    for (let k = 0; k < PED_N; k++) {
      const m = pickRoad(mids, totalMid);
      this.agents.peds.push({
        path: new PolylinePath(m.rd.p, (m.rd.w ?? 5) * 0.5 + 2.2, k % 2 === 0 ? 1 : -1),
        t: rnd() * 9999, speed: rngRange(rnd, 1.1, 1.8), phase: rnd() * 6.28,
        shirt: rngPick(rnd, SHIRTS), pants: rngPick(rnd, PANTS),
        scale: rngRange(rnd, 0.92, 1.06),
      });
    }
  }

  #pool(key, makeGeo, capacity, tinted = false) {
    let pool = this.pools.get(key);
    if (!pool) {
      pool = new PartPool(this.scene, makeGeo(), capacity, tinted);
      this.pools.set(key, pool);
    }
    return pool;
  }

  #allocate() {
    // 第一遍:统计各部件池容量
    const cap = new Map();
    const bump = (k, n = 1) => cap.set(k, (cap.get(k) || 0) + n);
    for (const a of this.agents.cars) bump(`car:${a.type}:${a.variant}`);
    for (const a of this.agents.cars) bump('wheel:car', a.def.wheels.length);
    for (const a of this.agents.ebikes) { bump(`eb:${a.variant}`); bump('wheel:eb', 2); }
    for (const a of this.agents.bikes) { bump(`bi:${a.variant}`); bump('wheel:bike', 2); bump('bikeLeg', 2); }
    bump('ped:head', this.agents.peds.length);
    bump('ped:torso', this.agents.peds.length);
    bump('ped:arm', this.agents.peds.length * 2);
    bump('ped:leg', this.agents.peds.length * 2);

    // 第二遍:创建实例池(部件池 + 车身池)
    const geoOf = {
      'wheel:car': () => wheelGeo(1, 0.24, TIRE),
      'wheel:eb': () => wheelGeo(0.3, 0.14, 0x1a1c20),
      'wheel:bike': () => wheelGeo(0.34, 0.05, WHITE),
      bikeLeg: () => bikeRiderLeg().build(),
      'ped:head': () => pedHead().build(),
      'ped:torso': () => pedTorso().build(),
      'ped:arm': () => pedArm().build(),
      'ped:leg': () => pedLeg().build(),
    };
    const TINTED = new Set(['wheel:bike', 'bikeLeg', 'ped:torso', 'ped:arm', 'ped:leg']);
    for (const [k, n] of cap) {
      if (geoOf[k]) this.#pool(k, geoOf[k], n, TINTED.has(k));
    }
    for (const [k, n] of cap) {
      if (geoOf[k]) continue;
      const make = k.startsWith('car:')
        ? () => CAR_TYPES[k.split(':')[1]].variants[+k.split(':')[2]]
        : k.startsWith('eb:')
          ? () => EBIKE_TYPES[k.slice(3)]
          : () => bikeBody(BIKE_COLORS[+k.slice(3)]).build();
      this.#pool(k, make, n, false);
    }

    // 第三遍:分配每代理的实例索引 + 固定实例色
    for (const a of this.agents.cars) {
      a.bodyPool = this.pools.get(`car:${a.type}:${a.variant}`);
      a.bodyIdx = this.#alloc(`car:${a.type}:${a.variant}`);
      a.wheelIdxs = [];
      for (let i = 0; i < a.def.wheels.length; i++) a.wheelIdxs.push(this.#alloc('wheel:car'));
    }
    for (const a of this.agents.ebikes) {
      a.bodyPool = this.pools.get(`eb:${a.variant}`);
      a.bodyIdx = this.#alloc(`eb:${a.variant}`);
      a.wheelIdxs = [this.#alloc('wheel:eb'), this.#alloc('wheel:eb')];
    }
    const wp = this.pools.get('wheel:bike'), lp = this.pools.get('bikeLeg');
    for (const a of this.agents.bikes) {
      a.bodyPool = this.pools.get(`bi:${a.variant}`);
      a.bodyIdx = this.#alloc(`bi:${a.variant}`);
      a.wheelIdxs = [this.#alloc('wheel:bike'), this.#alloc('wheel:bike')];
      a.legIdxs = [this.#alloc('bikeLeg'), this.#alloc('bikeLeg')];
      wp.color(a.wheelIdxs[0], BIKE_COLORS[a.variant]);
      wp.color(a.wheelIdxs[1], BIKE_COLORS[a.variant]);
      lp.color(a.legIdxs[0], 0x39425a);
      lp.color(a.legIdxs[1], 0x39425a);
    }
    const tp = this.pools.get('ped:torso'), ap = this.pools.get('ped:arm'), lg = this.pools.get('ped:leg');
    for (const a of this.agents.peds) {
      a.headIdx = this.#alloc('ped:head');
      a.torsoIdx = this.#alloc('ped:torso');
      a.armIdxs = [this.#alloc('ped:arm'), this.#alloc('ped:arm')];
      a.legIdxs = [this.#alloc('ped:leg'), this.#alloc('ped:leg')];
      tp.color(a.torsoIdx, a.shirt);
      ap.color(a.armIdxs[0], a.shirt);
      ap.color(a.armIdxs[1], a.shirt);
      lg.color(a.legIdxs[0], a.pants);
      lg.color(a.legIdxs[1], a.pants);
    }
    for (const pool of this.pools.values()) pool.colorsFlush();
  }

  #alloc(key) {
    const pool = this.pools.get(key);
    const c = pool.im.userData.cursor || 0;
    pool.im.userData.cursor = c + 1;
    return c;
  }

  update(dt) {
    const gy = this.groundY;
    // 汽车
    for (const a of this.agents.cars) {
      a.t += a.speed * dt;
      a.spin += (a.speed / a.def.wheelR) * dt;
      const { x, z, ang } = a.path.at(a.t);
      const y = gy(x, z);
      a.bodyPool.set(a.bodyIdx, x, y, z, ang);
      const wp = this.pools.get('wheel:car');
      for (let i = 0; i < a.def.wheels.length; i++) {
        const [lx, lz] = a.def.wheels[i];
        wp.set(a.wheelIdxs[i], x, y, z, ang, lx, a.def.wheelR, lz, 0, a.spin);
      }
    }
    // 电动车(轻微摇摆穿行)
    for (const a of this.agents.ebikes) {
      a.t += a.speed * dt;
      a.spin += (a.speed / 0.3) * dt;
      a.phase += dt * 2;
      const { x, z, ang } = a.path.at(a.t);
      const weave = Math.sin(a.phase) * 0.4;
      const wx = x - Math.sin(ang) * weave, wz = z + Math.cos(ang) * weave;
      const y = gy(wx, wz);
      a.bodyPool.set(a.bodyIdx, wx, y, wz, ang + Math.sin(a.phase * 0.7) * 0.06);
      const wp = this.pools.get('wheel:eb');
      wp.set(a.wheelIdxs[0], wx, y, wz, ang, 0.72, 0.3, 0, 0, a.spin);
      wp.set(a.wheelIdxs[1], wx, y, wz, ang, -0.72, 0.3, 0, 0, a.spin);
    }
    // 自行车(蹬踏)
    for (const a of this.agents.bikes) {
      a.t += a.speed * dt;
      a.spin += (a.speed / 0.34) * dt;
      a.phase += a.speed * 1.6 * dt;
      const { x, z, ang } = a.path.at(a.t);
      const weave = Math.sin(a.phase * 0.5) * 0.3;
      const wx = x - Math.sin(ang) * weave, wz = z + Math.cos(ang) * weave;
      const y = gy(wx, wz);
      a.bodyPool.set(a.bodyIdx, wx, y, wz, ang + Math.sin(a.phase * 0.35) * 0.05);
      const wp = this.pools.get('wheel:bike');
      wp.set(a.wheelIdxs[0], wx, y, wz, ang, 0.72, 0.34, 0, 0, a.spin);
      wp.set(a.wheelIdxs[1], wx, y, wz, ang, -0.72, 0.34, 0, 0, a.spin);
      const lp = this.pools.get('bikeLeg');
      const sw = Math.sin(a.phase) * 0.55;
      lp.set(a.legIdxs[0], wx, y, wz, ang, -0.42, 1.05, 0.18, sw);
      lp.set(a.legIdxs[1], wx, y, wz, ang, -0.42, 1.05, -0.18, -sw);
    }
    // 行人(步行摆动 + 轻微起伏)
    for (const a of this.agents.peds) {
      a.t += a.speed * dt;
      a.phase += a.speed * 2.4 * dt;
      const { x, z, ang } = a.path.at(a.t);
      const sway = Math.sin(a.phase * 0.5) * 0.2;
      const px = x - Math.sin(ang) * sway, pz = z + Math.cos(ang) * sway;
      const y = gy(px, pz);
      const sc = a.scale;
      const bob = Math.abs(Math.cos(a.phase)) * 0.045 * sc;
      const swing = Math.sin(a.phase) * 0.55;
      this.pools.get('ped:leg').set(a.legIdxs[0], px, y, pz, ang, 0.13, 1.18, 0, swing, 0, sc);
      this.pools.get('ped:leg').set(a.legIdxs[1], px, y, pz, ang, -0.13, 1.18, 0, -swing, 0, sc);
      this.pools.get('ped:torso').set(a.torsoIdx, px, y + bob, pz, ang, 0, 1.86, 0, 0, 0, sc);
      this.pools.get('ped:head').set(a.headIdx, px, y + bob, pz, ang, 0, 2.12, 0, 0, 0, sc);
      this.pools.get('ped:arm').set(a.armIdxs[0], px, y + bob, pz, ang, 0.32, 1.66, 0, -swing * 0.7, 0, sc);
      this.pools.get('ped:arm').set(a.armIdxs[1], px, y + bob, pz, ang, -0.32, 1.66, 0, swing * 0.7, 0, sc);
    }
    for (const pool of this.pools.values()) pool.flush();
  }

  counts() {
    return {
      cars: this.agents.cars.length,
      ebikes: this.agents.ebikes.length,
      bikes: this.agents.bikes.length,
      peds: this.agents.peds.length,
      drawCalls: this.pools.size,
    };
  }
}

function rngWeightedSimple(rnd, values, weights) {
  let total = weights.reduce((a, b) => a + b, 0);
  let x = rnd() * total;
  for (let i = 0; i < values.length; i++) { x -= weights[i]; if (x <= 0) return values[i]; }
  return values[0];
}
