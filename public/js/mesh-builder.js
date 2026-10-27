// MeshBuilder — 把大量小图元(盒/柱/锥/球/回转体)合并进一个顶点色 BufferGeometry
// 全城低多边形物体用极少 draw call 渲染的核心。
import * as THREE from 'three';

const geomCache = new Map();
function getGeom(key, make) {
  let g = geomCache.get(key);
  if (!g) {
    const made = make();
    g = made.index ? made.toNonIndexed() : made;
    geomCache.set(key, g);
  }
  return g;
}
const G = {
  box: () => getGeom('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (seg) => getGeom('cyl' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1)),
  cylT: (ratio, seg) => getGeom(`cylT${ratio}_${seg}`, () => new THREE.CylinderGeometry(ratio, 1, 1, seg, 1)),
  cone: (seg) => getGeom('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg, 1)),
  ico: (det) => getGeom('ico' + det, () => new THREE.IcosahedronGeometry(1, det)),
  sphere: () => getGeom('sph', () => new THREE.SphereGeometry(1, 8, 6)),
};

const colorCache = new Map();
function linearColor(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    const col = new THREE.Color(hex).convertSRGBToLinear();
    c = [col.r, col.g, col.b];
    colorCache.set(hex, c);
  }
  return c;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.colors = [];
  }

  get empty() { return this.positions.length === 0; }

  _geo(geom, color, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    const pos = geom.attributes.position;
    const col = linearColor(color);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
      this.positions.push(_v.x, _v.y, _v.z);
      this.colors.push(col[0], col[1], col[2]);
    }
  }

  /** 盒子,中心 (x,y,z),尺寸 w/h/d,可绕 Y 旋转 */
  box(x, y, z, w, h, d, color, ry = 0) {
    this._geo(G.box(), color, x, y, z, ry, w, h, d);
  }

  /** 任意倾角的盒子(斜坡/斜撑),绕 Y 再绕 X/Z */
  slopeBox(x, y, z, w, h, d, color, ry = 0, rx = 0, rz = 0) {
    this._geo(G.box(), color, x, y, z, ry, w, h, d, rx, rz);
  }

  /** 椭球(低模球非均匀缩放,穹顶/蛋形建筑用) */
  ellipsoid(x, y, z, rx, ry, rz, color) {
    this._geo(G.sphere(), color, x, y, z, 0, rx, ry, rz);
  }

  /** 圆柱,支持上下不同半径(圆台) */
  cyl(x, y, z, rTop, rBot, h, color, seg = 8, ry = 0) {
    if (rTop === rBot) this._geo(G.cyl(seg), color, x, y, z, ry, rBot, h, rBot);
    else this._geo(G.cylT(+(rTop / rBot).toFixed(3), seg), color, x, y, z, ry, rBot, h, rBot);
  }

  /** 圆锥(尖顶) */
  cone(x, y, z, r, h, color, seg = 8) {
    this._geo(G.cone(seg), color, x, y + h / 2, z, 0, r, h, r);
  }

  /** 二十面体(低模球/树冠) */
  ico(x, y, z, r, color, det = 0, ry = 0, sy = 1) {
    this._geo(G.ico(det), color, x, y, z, ry, r, r * sy, r);
  }

  sphere(x, y, z, r, color) {
    this._geo(G.sphere(), color, x, y, z, 0, r, r, r);
  }

  /** 回转体:profile = [{r, y}...],绕 Y 轴旋转 seg 段 */
  lathe(profile, x, y, z, color, scale = 1, seg = 12) {
    const pts = profile.map((p) => new THREE.Vector2(Math.max(0.001, p.r * scale), p.y * scale));
    const g = new THREE.LatheGeometry(pts, seg).toNonIndexed();
    this._geo(g, color, x, y, z, 0, 1, 1, 1);
    g.dispose();
  }

  _tri(ax, ay, az, bx, by, bz, cx, cy, cz, color) {
    const col = linearColor(color);
    this.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let i = 0; i < 3; i++) this.colors.push(col[0], col[1], col[2]);
  }

  _quad(a, b, c, d, color) { this._tri(...a, ...b, ...c, color); this._tri(...a, ...c, ...d, color); }

  /** 中式庑殿/歇顶近似:四坡收顶(截顶金字塔),ridge 为屋顶顶部长边比例 */
  hipRoof(x, y, z, w, d, h, color, ridge = 0.45, ry = 0, overhang = 0) {
    const w2 = (w / 2 + overhang), d2 = (d / 2 + overhang);
    const rw = w2 * ridge, rd = d2 * Math.max(0.25, ridge * 0.9);
    const rot = (px, pz) => {
      const s = Math.sin(ry), c = Math.cos(ry);
      const dx = px, dz = pz;
      return [x + dx * c - dz * s, z + dx * s + dz * c];
    };
    const yb = y, yt = y + h;
    const A = rot(-w2, -d2), B = rot(w2, -d2), Cc = rot(w2, d2), D = rot(-w2, d2);
    const A2 = rot(-rw, -rd), B2 = rot(rw, -rd), C2 = rot(rw, rd), D2 = rot(-rw, rd);
    const P = (pt, yy) => [pt[0], yy, pt[1]];
    this._quad(P(A, yb), P(B, yb), P(B2, yt), P(A2, yt), color); // 北坡 (-z)
    this._quad(P(B, yb), P(Cc, yb), P(C2, yt), P(B2, yt), color); // 东坡
    this._quad(P(Cc, yb), P(D, yb), P(D2, yt), P(C2, yt), color); // 南坡
    this._quad(P(D, yb), P(A, yb), P(A2, yt), P(D2, yt), color); // 西坡
    this._quad(P(A2, yt), P(B2, yt), P(C2, yt), P(D2, yt), color); // 顶
  }

  /** 双坡硬山顶(民居),屋脊沿 x 方向 */
  gableRoof(x, y, z, w, d, h, color, overhang = 0.12, ry = 0) {
    const w2 = w / 2 + overhang, d2 = d / 2 + overhang;
    const s = Math.sin(ry), c = Math.cos(ry);
    const rot = (px, pz) => [x + px * c - pz * s, z + px * s + pz * c];
    const AL = rot(-w2, -d2), AR = rot(w2, -d2), BL = rot(-w2, d2), BR = rot(w2, d2);
    const RL = rot(-w2 - 0.05, 0), RR = rot(w2 + 0.05, 0);
    const yb = y, yt = y + h;
    const P = (pt, yy) => [pt[0], yy, pt[1]];
    // 北坡
    this._quad(P(AL, yb), P(AR, yb), P(RR, yt), P(RL, yt), color);
    // 南坡
    this._quad(P(BR, yb), P(BL, yb), P(RL, yt), P(RR, yt), color);
    // 山墙(东西两端的三角)
    this._tri(P(AL, yb)[0], yb, P(AL, yb)[2], P(BL, yb)[0], yb, P(BL, yb)[2], RL[0], yt, RL[2], color);
    this._tri(P(AR, yb)[0], yb, P(AR, yb)[2], RR[0], yt, RR[2], P(BR, yb)[0], yb, P(BR, yb)[2], color);
    // 底面封口
    this._quad(P(AL, yb), P(BL, yb), P(BR, yb), P(AR, yb), color);
  }

  /** 合并任意 BufferGeometry(会应用矩阵与纯色) */
  mergeGeometry(geom, color, x, y, z, ry = 0, s = 1) {
    this._geo(geom, color, x, y, z, ry, s, s, s);
  }

  /** 合并另一个 MeshBuilder(应用平移/绕Y旋转/缩放),用于把地标并入区块 */
  mergeBuilder(other, tr = {}) {
    const { x = 0, y = 0, z = 0, ry = 0, s = 1 } = tr;
    const cos = Math.cos(ry) * s, sin = Math.sin(ry) * s;
    const src = other.positions, col = other.colors;
    const n = src.length / 3;
    for (let i = 0; i < n; i++) {
      const px = src[i * 3], py = src[i * 3 + 1], pz = src[i * 3 + 2];
      this.positions.push(x + px * cos - pz * sin, y + py * s, z + px * sin + pz * cos);
      this.colors.push(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeVertexNormals();
    return g;
  }
}
