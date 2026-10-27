// 碰撞网格 — 空间哈希,游戏端与城市装配器共用

export class ColliderGrid {
  constructor(cell = 48) { this.cell = cell; this.map = new Map(); }
  clear() { this.map.clear(); }
  #key(cx, cz) { return cx + ',' + cz; }
  insert(b) {
    const x0 = Math.floor((b.x - b.hw) / this.cell), x1 = Math.floor((b.x + b.hw) / this.cell);
    const z0 = Math.floor((b.z - b.hd) / this.cell), z1 = Math.floor((b.z + b.hd) / this.cell);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = this.#key(cx, cz);
      if (!this.map.has(k)) this.map.set(k, []);
      this.map.get(k).push(b);
    }
  }
  query(x, z, r = 1) {
    const out = [];
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const z0 = Math.floor((z - r) / this.cell), z1 = Math.floor((z + r) / this.cell);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const arr = this.map.get(this.#key(cx, cz));
      if (arr) for (const b of arr) if (out.indexOf(b) < 0) out.push(b);
    }
    return out;
  }

  /** 从烘焙的扁平数组 [x,z,hw,hd,h, ...] 重建 */
  static fromFlat(flat) {
    const g = new ColliderGrid();
    for (let i = 0; i < flat.length; i += 5) {
      g.insert({ x: flat[i], z: flat[i + 1], hw: flat[i + 2], hd: flat[i + 3], h: flat[i + 4] });
    }
    return g;
  }
}
