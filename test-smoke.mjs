// 冒烟测试:
// 1) 地标构建 + 示例城市装配(chunks & elements 模式)
// 2) 服务端烘焙 → 按游戏端同样方式解析二进制渲染包,校验数据完整性
import { generateDemoCity } from './public/js/demo-city.js';
import { City } from './public/js/city.js';
import { buildLandmark, LANDMARKS } from './public/js/landmarks.js';
import { bakeMap } from './lib/baker.mjs';

const fakeScene = {
  children: [],
  add(o) { this.children.push(o); },
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); },
};

// 1. 地标逐个构建
for (const id of Object.keys(LANDMARKS)) {
  const lm = buildLandmark(id);
  console.log(`[landmark] ${id} (${lm.name}) verts=${lm.solid.positions.length / 3}`);
}

// 2. 示例城市 chunks 模式(编辑器 rebuildAll 同源路径)
const map = generateDemoCity();
console.log(`\n[demo] elements=${map.elements.length}`);
const city = new City(fakeScene, map, { mode: 'chunks' });
await city.build();
console.log(`[chunks] meshes=${city.root.children.length} trees=${city.treeSys.items.length} colliders=${city.fpList.length}`);

// 3. elements 模式 + 增量操作(编辑器路径)
const map2 = generateDemoCity();
const city2 = new City(fakeScene, map2, { mode: 'elements' });
await city2.build();
city2.addElement({ type: 'block', x: 500, z: -600, w: 84, d: 84, style: 'cbd', seed: 42, density: 0.8 });
city2.addElement({ type: 'landmark', lm: 'tiantan', x: -600, z: -600, ry: 0.5, s: 1.2 });
city2.rebuildAll();
console.log(`[elements] groups=${city2.elementGroups.size} trees=${city2.treeSys.items.length}`);

// 4. 服务端烘焙 + 游戏端解析回环
const t0 = Date.now();
const { body, manifest } = await bakeMap(generateDemoCity());
console.log(`\n[bake] ${(body.length / 1048576).toFixed(2)} MB, 耗时 ${Date.now() - t0}ms`);

// 模拟 city-view.js 的解析逻辑
const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
const mLen = dv.getUint32(0, true);
const mf = JSON.parse(new TextDecoder().decode(new Uint8Array(body.buffer, body.byteOffset + 4, mLen)));
const base = 4 + mLen + ((4 - ((4 + mLen) % 4)) % 4);
const view = (ref, Ctor, itemBytes) => new Ctor(body.buffer, body.byteOffset + base + ref.o, ref.l / itemBytes);

let verts = 0;
for (const ch of mf.chunks) {
  assert(ch.pos.o % 4 === 0, `chunk ${ch.kind} pos 未对齐`);
  const p = view(ch.pos, Float32Array, 4);
  const n = view(ch.nor, Uint8Array, 1);
  const c = view(ch.col, Uint8Array, 1);
  assert(p.length === ch.count * 3, `chunk ${ch.kind} pos 数量不符`);
  assert(n.length === ch.count * 3 && c.length === ch.count * 3, `chunk ${ch.kind} nor/col 数量不符`);
  // 抽查首顶点为有限数
  assert(Number.isFinite(p[0]) && Number.isFinite(p[p.length - 1]), `chunk ${ch.kind} 顶点含 NaN`);
  verts += ch.count;
}
let treeCount = 0;
for (const t of mf.trees) {
  const m = view(t.mat, Float32Array, 4);
  assert(m.length === t.count * 16, `tree ${t.variant} 矩阵数量不符`);
  assert(view(t.tc, Uint8Array, 1).length === t.count * 3, `tree ${t.variant} 颜色数量不符`);
  treeCount += t.count;
}
const boxes = view(mf.colliders.boxes, Float32Array, 4);
assert(boxes.length === mf.colliders.count * 5, '碰撞盒数量不符');
const hArr = view(mf.terrain.heights, Float32Array, 4);
assert(hArr.length === (mf.terrain.seg + 1) ** 2, '高度场数量不符');

console.log(`[parse] chunks=${mf.chunks.length}(含地形) verts=${verts} trees=${treeCount} colliders=${mf.colliders.count} landmarks=${mf.landmarks.length}`);
console.log(`[parse] 城区=${JSON.stringify(mf.settings.cityRect)} 环路=${mf.settings.rings}`);
console.log(`[parse] 高度采样(0,0)=${((hArr[((mf.terrain.seg + 1) ** 2) / 2]) || 0).toFixed(2)}`);

// 5. 地形笔刷(编辑器路径)
city2.terrain.brush(300, 300, 80, 5, 'raise');
console.log(`\n[terrain] brush ok, h(300,300)=${city2.terrain.sample(300, 300).toFixed(2)}`);

console.log('\nALL SMOKE TESTS PASSED');

function assert(cond, msg) { if (!cond) { console.error('ASSERT FAIL:', msg); process.exit(1); } }
