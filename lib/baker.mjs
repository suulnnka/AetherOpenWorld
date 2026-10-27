// 地图烘焙器(服务端)——把地图 JSON 在 Node 里装配成"渲染就绪"的二进制包,
// 游戏前端只做 TypedArray → BufferGeometry 的零拷贝搬运,不运行任何生成逻辑。
//
// 包结构:[u32 manifest 字节长度][manifest JSON(utf8)][二进制块…]
// 顶点: position Float32 + normal Uint8(normalized) + color Uint8(normalized,线性色)
// 树:   每变体 { matrices Float32(16n), trunkColors/canopyColors Uint8(3n) }
// 地形: 高度场 Float32(角色贴地采样用)+ 地形网格也作为普通 chunk 烘焙
import { City, MATERIALS } from '../public/js/city.js';

class Pack {
  constructor() {
    this.parts = [];      // BufferSource 列表
    this.length = 0;
  }
  /** 返回写入后的字节区间 {o, l} */
  push(src, align = 1) {
    if (align > 1 && this.length % align !== 0) {
      const pad = align - (this.length % align);
      this.parts.push(new Uint8Array(pad));
      this.length += pad;
    }
    const bytes = src instanceof Uint8Array ? src : new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
    this.parts.push(bytes);
    const r = { o: this.length, l: bytes.length };
    this.length += bytes.length;
    return r;
  }
  build() {
    const out = new Uint8Array(this.length);
    let off = 0;
    for (const p of this.parts) { out.set(p, off); off += p.length; }
    return out;
  }
}

function f32ToU8(farr, map) {
  const u8 = new Uint8Array(farr.length);
  for (let i = 0; i < farr.length; i++) u8[i] = Math.max(0, Math.min(255, Math.round(map(farr[i]))));
  return u8;
}

/**
 * 烘焙地图 → { body: Uint8Array, manifest }(manifest 也内嵌在 body 头部)
 */
export async function bakeMap(mapData) {
  const fakeScene = {
    children: [],
    add(o) { this.children.push(o); },
    remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); },
  };
  const map = JSON.parse(JSON.stringify(mapData));
  const city = new City(fakeScene, map, { mode: 'chunks' });
  await city.build();

  const pack = new Pack();
  const manifest = {
    format: 1,
    name: map.name || '未命名地图',
    settings: {
      world: map.settings?.world || 3000,
      rings: map.settings?.rings || [],
      avenue: map.settings?.avenue || null,
      cityRect: city.cityRect,
      // 真实路网(抽稀):主干道全部 + 次干道隔点抽样,供车流路径与小地图
      roads: (map.settings?.roads || [])
        .filter((r) => r.c !== 'minor')
        .map((r) => ({
          c: r.c,
          w: r.w,
          p: r.p.filter((_, i) => i % 2 === 0 || i === r.p.length - 1).map((pt) => [+pt[0].toFixed(1), +pt[1].toFixed(1)]),
        })),
    },
    chunks: [],
    trees: [],
    landmarks: city.landmarks,
    waterRects: city.waterRects,
    parkRects: city.parkRects,
    blockRects: city.blockRects,
  };

  // ---- 地形网格 + 高度场 ----
  const tMesh = city.terrain.mesh;
  manifest.terrain = {
    size: city.terrain.size,
    seg: city.terrain.seg,
    cell: city.terrain.cell,
    heights: null, // 稍后填
  };
  const tGeo = tMesh.geometry;
  manifest.chunks.push({
    kind: 'terrain',
    castShadow: false,
    count: tGeo.attributes.position.count,
    pos: pack.push(tGeo.attributes.position.array, 4),
    nor: pack.push(f32ToU8(tGeo.attributes.normal.array, (v) => (v * 0.5 + 0.5) * 255)),
    col: pack.push(f32ToU8(tGeo.attributes.color.array, (v) => v * 255)),
  });
  manifest.terrain.heights = pack.push(city.terrain.h, 4);

  // ---- 城市网格(分块合并的实体/玻璃/水面 + 道路) ----
  for (const m of city.root.children) {
    const g = m.geometry;
    const kind = m.material === MATERIALS.glass ? 'glass' : m.material === MATERIALS.water ? 'water' : 'solid';
    manifest.chunks.push({
      kind,
      castShadow: !!m.castShadow,
      count: g.attributes.position.count,
      pos: pack.push(g.attributes.position.array, 4),
      nor: pack.push(f32ToU8(g.attributes.normal.array, (v) => (v * 0.5 + 0.5) * 255)),
      col: pack.push(f32ToU8(g.attributes.color.array, (v) => v * 255)),
    });
  }

  // ---- 树木实例 ----
  for (const grp of city.treeSys.groups) {
    const { variant, count, trunk, canopy } = grp;
    if (!count) continue;
    manifest.trees.push({
      variant,
      count,
      mat: pack.push(trunk.instanceMatrix.array, 4),
      tc: pack.push(f32ToU8(trunk.instanceColor.array, (v) => v * 255)),
      cc: pack.push(f32ToU8(canopy.instanceColor.array, (v) => v * 255)),
    });
  }

  // ---- 碰撞盒 ----
  const boxes = new Float32Array(city.fpList.length * 5);
  city.fpList.forEach((b, i) => {
    boxes[i * 5] = b.x; boxes[i * 5 + 1] = b.z; boxes[i * 5 + 2] = b.hw;
    boxes[i * 5 + 3] = b.hd; boxes[i * 5 + 4] = b.h;
  });
  manifest.colliders = { count: city.fpList.length, boxes: pack.push(boxes, 4) };

  // ---- 拼最终二进制:长度头 + manifest + (对齐填充) + 块 ----
  const head = new TextEncoder().encode(JSON.stringify(manifest));
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, head.length, true);
  const padLen = (4 - ((4 + head.length) % 4)) % 4; // 保证块区起点 4 字节对齐
  const pad = new Uint8Array(padLen);
  const body = pack.build();
  const out = new Uint8Array(4 + head.length + padLen + body.length);
  out.set(header, 0);
  out.set(head, 4);
  out.set(pad, 4 + head.length);
  out.set(body, 4 + head.length + padLen);

  // 清理
  city.treeSys._disposeMeshes();
  return { body: out, manifest };
}
