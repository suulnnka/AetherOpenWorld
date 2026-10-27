// 游戏端"瘦渲染器" — 消费服务端烘焙的二进制渲染包。
// 不 import 城市装配器/生成器:加载时只做 TypedArray → BufferGeometry 的零拷贝搬运,
// 前端零生成逻辑、零几何构建,压力最小化。
import * as THREE from 'three';
import { ColliderGrid } from '../collider-grid.js';
import { materializeBakedTrees } from '../generators/tree.js'; // 仅复用 4 个变体小几何

const MATERIALS = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.62 }),
  water: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.85 }),
  terrain: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
};

/** 解析 [u32 len][manifest utf8][对齐填充][blocks] */
function parsePack(buf) {
  const dv = new DataView(buf);
  const mLen = dv.getUint32(0, true);
  const manifest = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, mLen)));
  const base = 4 + mLen + ((4 - ((4 + mLen) % 4)) % 4); // 与服务端 baker 的对齐规则一致
  const view = (ref, Ctor, itemBytes) => new Ctor(buf, base + ref.o, ref.l / itemBytes);
  return { manifest, view };
}

/**
 * 拉取并实例化渲染包。
 * 返回与旧 City 兼容的接口子集:{ groundY, colliders, landmarks, waterRects, parkRects,
 * blockRects, cityRect, settings, terrain:{sample} }
 */
export async function loadCityView(scene, mapId, onProgress = () => {}) {
  onProgress(0.05, '下载渲染包');
  const res = await fetch('/api/maps/' + encodeURIComponent(mapId) + '/render');
  if (!res.ok) throw new Error('渲染包下载失败 HTTP ' + res.status);
  const buf = await res.arrayBuffer();

  onProgress(0.35, '解析数据');
  const { manifest, view } = parsePack(buf);
  const root = new THREE.Group();
  root.name = 'cityView';
  scene.add(root);

  // 网格块:位置 Float32 + 法线/颜色 Uint8(normalized,零拷贝视图)
  let done = 0;
  for (const ch of manifest.chunks) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(view(ch.pos, Float32Array, 4), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(view(ch.nor, Uint8Array, 1), 3, true));
    g.setAttribute('color', new THREE.BufferAttribute(view(ch.col, Uint8Array, 1), 3, true));
    const mesh = new THREE.Mesh(g, MATERIALS[ch.kind] || MATERIALS.solid);
    mesh.castShadow = !!ch.castShadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; // 静态城市场景,跳过每帧矩阵更新
    root.add(mesh);
    if (++done % 16 === 0) onProgress(0.35 + 0.35 * (done / manifest.chunks.length), '载入网格 ' + done + '/' + manifest.chunks.length);
  }

  // 树木:实例矩阵 + 实例色直接来自烘焙数组
  onProgress(0.75, '载入树木');
  const treeMeshes = [];
  for (const t of manifest.trees) {
    treeMeshes.push(...materializeBakedTrees(
      root,
      t.variant,
      t.count,
      view(t.mat, Float32Array, 4),
      view(t.tc, Uint8Array, 1),
      view(t.cc, Uint8Array, 1),
    ));
  }

  // 碰撞网格(扁平数组重建空间哈希)
  onProgress(0.9, '构建碰撞');
  const colliders = ColliderGrid.fromFlat(view(manifest.colliders.boxes, Float32Array, 4));

  // 地形高度采样(双线性)
  const { heights } = manifest.terrain;
  const hArr = view(heights, Float32Array, 4);
  const { size, seg } = manifest.terrain;
  const sample = (x, z) => {
    const fx = (x + size / 2) / (size / seg);
    const fz = (z + size / 2) / (size / seg);
    const i = Math.max(0, Math.min(seg - 1, Math.floor(fx)));
    const j = Math.max(0, Math.min(seg - 1, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - i));
    const tz = Math.max(0, Math.min(1, fz - j));
    const idx = (ii, jj) => jj * (seg + 1) + ii;
    const a = hArr[idx(i, j)], b = hArr[idx(i + 1, j)];
    const c = hArr[idx(i, j + 1)], d = hArr[idx(i + 1, j + 1)];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  };

  onProgress(1, '完成');
  return {
    mapId,
    name: manifest.name,
    settings: manifest.settings,
    landmarks: manifest.landmarks,
    waterRects: manifest.waterRects,
    parkRects: manifest.parkRects,
    blockRects: manifest.blockRects,
    cityRect: manifest.settings.cityRect,
    colliders,
    terrain: { sample, size, seg },
    groundY: sample,
    root,
    treeMeshes,
  };
}

/** 地图列表(最新优先) */
export async function pickMapId() {
  const params = new URLSearchParams(location.search);
  const want = params.get('map');
  if (want) return want;
  const list = await (await fetch('/api/maps')).json();
  if (!list.length) throw new Error('服务器上还没有地图,请先打开编辑器创建');
  return list[0].id;
}
