// 地形生成器 — 高度场 + 噪声起伏 + 远山(西山)+ 编辑笔刷
import * as THREE from 'three';
import { makeNoise2D, fbm, mulberry32, smoothstep } from '../rng.js';
import { C } from '../palette.js';

export const TERRAIN_SIZE = 4200;   // 地面总尺寸
export const TERRAIN_SEG = 132;     // 网格分段

export class Terrain {
  constructor(params = {}) {
    const { seed = 12345, amplitude = 4, mountains = true, cityRect = null, edits = null, style = 'natural' } = params;
    this.size = TERRAIN_SIZE;
    this.seg = TERRAIN_SEG;
    this.cell = this.size / this.seg;
    this.params = { seed, amplitude, mountains };
    this.edited = false;
    this.h = new Float32Array((this.seg + 1) * (this.seg + 1));
    this.generate(cityRect);
    if (edits && edits.length === this.h.length) {
      this.h.set(edits);
      this.edited = true;
    }
    this.mesh = null;
    this.style = style;
    this.colorNoise = makeNoise2D(seed ^ 0x9e37);
  }

  idx(i, j) { return j * (this.seg + 1) + i; }

  generate(cityRect) {
    const { seed, amplitude, mountains } = this.params;
    const noise = makeNoise2D(seed);
    const noise2 = makeNoise2D(seed ^ 0x51ab);
    const n = this.seg + 1;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -this.size / 2 + i * this.cell;
        const z = -this.size / 2 + j * this.cell;
        let h = fbm(noise, x / 950, z / 950, 4) * amplitude
              + fbm(noise2, x / 260, z / 260, 3) * amplitude * 0.35;
        if (mountains) {
          // 远山:城市外围一圈,西侧(西山方向)更厚重
          const d = Math.max(Math.abs(x), Math.abs(z));
          let m = smoothstep(1700, 2500, d);
          const west = smoothstep(-1400, -1950, x) * smoothstep(1300, 600, Math.abs(z));
          m = Math.max(m, west);
          if (m > 0) {
            const ridge = fbm(noise2, x / 520 + 7.3, z / 520 - 2.1, 4) * 0.45 + 0.55;
            h += m * ridge * 190;
          }
        }
        this.h[this.idx(i, j)] = h;
      }
    }
    // 城区内压平
    if (cityRect) {
      const { x0, z0, x1, z1 } = cityRect;
      const pad = 220;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const x = -this.size / 2 + i * this.cell;
          const z = -this.size / 2 + j * this.cell;
          const inside = smoothstep(x0 - pad, x0 + 40, x) * smoothstep(x1 + pad, x1 - 40, x)
                       * smoothstep(z0 - pad, z0 + 40, z) * smoothstep(z1 + pad, z1 - 40, z);
          if (inside > 0) {
            const k = this.idx(i, j);
            this.h[k] *= (1 - inside * 0.92);
          }
        }
      }
    }
  }

  /** 双线性采样任意世界坐标高度 */
  sample(x, z) {
    const fx = (x + this.size / 2) / this.cell;
    const fz = (z + this.size / 2) / this.cell;
    const i = Math.max(0, Math.min(this.seg - 1, Math.floor(fx)));
    const j = Math.max(0, Math.min(this.seg - 1, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - i));
    const tz = Math.max(0, Math.min(1, fz - j));
    const a = this.h[this.idx(i, j)], b = this.h[this.idx(i + 1, j)];
    const c = this.h[this.idx(i, j + 1)], d = this.h[this.idx(i + 1, j + 1)];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }

  /** 笔刷:mode = raise / lower / flatten */
  brush(x, z, radius, strength, mode = 'raise') {
    const i0 = Math.max(0, Math.floor((x - radius + this.size / 2) / this.cell));
    const i1 = Math.min(this.seg, Math.ceil((x + radius + this.size / 2) / this.cell));
    const j0 = Math.max(0, Math.floor((z - radius + this.size / 2) / this.cell));
    const j1 = Math.min(this.seg, Math.ceil((z + radius + this.size / 2) / this.cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const wx = -this.size / 2 + i * this.cell;
        const wz = -this.size / 2 + j * this.cell;
        const d = Math.hypot(wx - x, wz - z);
        if (d > radius) continue;
        const f = 1 - d / radius;
        const k = this.idx(i, j);
        if (mode === 'raise') this.h[k] += strength * f * f;
        else if (mode === 'lower') this.h[k] -= strength * f * f;
        else this.h[k] += (0 - this.h[k]) * Math.min(1, strength * 0.15) * f;
      }
    }
    this.edited = true;
    this.updateMesh();
  }

  buildMesh(scene) {
    const geo = new THREE.BufferGeometry();
    const n = this.seg + 1;
    const positions = new Float32Array(n * n * 3);
    const colors = new Float32Array(n * n * 3);
    const indices = [];
    this._fillVertexData(positions, colors);
    for (let j = 0; j < this.seg; j++) {
      for (let i = 0; i < this.seg; i++) {
        const a = this.idx(i, j), b = this.idx(i + 1, j), c = this.idx(i + 1, j + 1), d = this.idx(i, j + 1);
        indices.push(a, d, b, b, d, c);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    if (scene) scene.add(this.mesh);
    return this.mesh;
  }

  _colorAt(x, z, h, slope, out, o) {
    // 草地基底带杂色;坡度大→岩石;高海拔→岩石/雪;城市风格→灰绿基调
    const n = this.colorNoise(x / 60, z / 60) * 0.06;
    let r = 0.56 + n, g = 0.75 + n, b = 0.37 + n; // 草绿
    if (this.style === 'urban') {
      // 城区地面:向暖灰靠拢(真实城市多为铺装/裸土基调)
      r += (0.60 - r) * 0.62; g += (0.62 - g) * 0.62; b += (0.55 - b) * 0.62;
    }
    if (h > 40) {
      const t = Math.min(1, (h - 40) / 90);
      r = r + (0.55 - r) * t; g = g + (0.55 - g) * t; b = b + (0.52 - b) * t;
    }
    if (h > 105) {
      const t = Math.min(1, (h - 105) / 60);
      r = r + (0.91 - r) * t; g = g + (0.93 - g) * t; b = b + (0.95 - b) * t;
    }
    if (slope > 0.55) {
      const t = Math.min(1, (slope - 0.55) / 0.5);
      r = r + (0.55 - r) * t; g = g + (0.54 - g) * t; b = b + (0.51 - b) * t;
    }
    out[o] = Math.min(1, Math.max(0, r));
    out[o + 1] = Math.min(1, Math.max(0, g));
    out[o + 2] = Math.min(1, Math.max(0, b));
  }

  _fillVertexData(positions, colors) {
    const n = this.seg + 1;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = this.idx(i, j);
        const x = -this.size / 2 + i * this.cell;
        const z = -this.size / 2 + j * this.cell;
        const h = this.h[k];
        const o = k * 3;
        positions[o] = x; positions[o + 1] = h; positions[o + 2] = z;
        const hx = this.h[this.idx(Math.min(this.seg, i + 1), j)] - this.h[this.idx(Math.max(0, i - 1), j)];
        const hz = this.h[this.idx(i, Math.min(this.seg, j + 1))] - this.h[this.idx(i, Math.max(0, j - 1))];
        const slope = Math.min(1, Math.hypot(hx, hz) / (this.cell * 2) * 2.2);
        this._colorAt(x, z, h, slope, colors, o);
      }
    }
  }

  updateMesh() {
    if (!this.mesh) return;
    const pos = this.mesh.geometry.attributes.position;
    const col = this.mesh.geometry.attributes.color;
    this._fillVertexData(pos.array, col.array);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
  }

  /** 导出编辑后的高度(序列化保存) */
  exportEdits() {
    return this.edited ? Array.from(this.h, (v) => Math.round(v * 100) / 100) : null;
  }
}
