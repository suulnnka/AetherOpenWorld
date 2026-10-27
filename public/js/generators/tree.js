// 树木生成器 — 全城树木用 InstancedMesh 渲染(每种树 = 树干 + 树冠两个实例网格)
import * as THREE from 'three';
import { MeshBuilder } from '../mesh-builder.js';
import { mulberry32, rngRange } from '../rng.js';

export const TREE_VARIANTS = ['broadleaf', 'conifer', 'willow', 'ginko'];

const WHITE = 0xffffff; // 几何体本身用白色,实际颜色由实例色提供

function buildVariantGeometries(variant) {
  const trunk = new MeshBuilder();
  const canopy = new MeshBuilder();
  switch (variant) {
    case 'conifer':
      trunk.cyl(0, 0.55, 0, 0.16, 0.24, 1.1, WHITE, 6);
      canopy.cone(0, 1.0, 0, 1.05, 1.7, WHITE, 7);
      canopy.cone(0, 1.9, 0, 0.8, 1.4, WHITE, 7);
      canopy.cone(0, 2.7, 0, 0.52, 1.1, WHITE, 7);
      break;
    case 'willow':
      trunk.cyl(0, 0.9, 0, 0.2, 0.3, 1.8, WHITE, 6);
      canopy.ico(0, 2.4, 0, 1.25, WHITE, 0, 0, 0.72);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        canopy.ico(Math.cos(a) * 1.05, 1.75, Math.sin(a) * 1.05, 0.45, WHITE, 0);
      }
      break;
    case 'ginko':
      trunk.cyl(0, 0.6, 0, 0.18, 0.26, 1.3, WHITE, 6);
      canopy.ico(0, 2.1, 0, 1.15, WHITE, 0);
      canopy.ico(0.35, 2.7, -0.2, 0.7, WHITE, 0);
      canopy.ico(-0.4, 2.5, 0.25, 0.62, WHITE, 0);
      break;
    default: // broadleaf 阔叶
      trunk.cyl(0, 0.65, 0, 0.2, 0.28, 1.4, WHITE, 6);
      canopy.ico(0, 2.1, 0, 1.15, WHITE, 0);
      canopy.ico(0.38, 2.8, -0.25, 0.72, WHITE, 0);
      canopy.ico(-0.35, 2.6, 0.28, 0.66, WHITE, 0);
  }
  return { trunk: trunk.build(), canopy: canopy.build() };
}

const CANOPY_COLORS = {
  broadleaf: [0x4e7a3a, 0x5d8a44, 0x6f9c4b, 0x87a94f],
  conifer: [0x3d6633, 0x47753a, 0x528140],
  willow: [0x7fa656, 0x8bb160],
  ginko: [0xd9a83c, 0xe0b44e, 0xc9992b],
};
const TRUNK_COLORS = [0x6b4a34, 0x5f4230, 0x77614d];

const _mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
const _tmpM = new THREE.Matrix4();
const _tmpQ = new THREE.Quaternion();
const _tmpP = new THREE.Vector3();
const _tmpS = new THREE.Vector3();
const _tmpE = new THREE.Euler();
const _tmpC = new THREE.Color();

export class TreeSystem {
  constructor(scene) {
    this.scene = scene;
    this.items = []; // {x,z,y,variant,scale,rot,colorSeed}
    this.meshes = [];
    this.groups = []; // [{variant, count, trunk, canopy}] 供烘焙器读取
    this._geoCache = new Map();
  }

  add(x, z, y = 0, variant = 'broadleaf', scale = 1, colorSeed = (Math.random() * 1e9) | 0, tag = null) {
    this.items.push({ x, z, y, variant, scale, rot: (colorSeed % 628) / 100, colorSeed, tag });
  }

  clear() { this.items = []; this._disposeMeshes(); }

  /** 地形变化后,重算所有树木的贴地高度并重建 */
  updateGroundY(groundYFn) {
    for (const it of this.items) it.y = groundYFn(it.x, it.z);
    this.rebuild();
  }

  _disposeMeshes() {
    for (const m of this.meshes) { this.scene.remove(m); m.dispose(); }
    this.meshes = [];
  }

  rebuild() {
    this._disposeMeshes();
    this.groups = [];
    const groups = new Map();
    for (const it of this.items) {
      const key = it.variant;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    for (const [variant, list] of groups) {
      let geos = this._geoCache.get(variant);
      if (!geos) { geos = buildVariantGeometries(variant); this._geoCache.set(variant, geos); }
      const trunkIM = new THREE.InstancedMesh(geos.trunk, _mat, list.length);
      const canopyIM = new THREE.InstancedMesh(geos.canopy, _mat, list.length);
      const rnd = mulberry32(1);
      list.forEach((it, i) => {
        const r = mulberry32(it.colorSeed);
        _tmpE.set(0, it.rot, 0);
        _tmpQ.setFromEuler(_tmpE);
        _tmpM.compose(_tmpP.set(it.x, it.y, it.z), _tmpQ, _tmpS.set(it.scale, it.scale * rngRange(r, 0.9, 1.15), it.scale));
        trunkIM.setMatrixAt(i, _tmpM);
        canopyIM.setMatrixAt(i, _tmpM);
        const tc = TRUNK_COLORS[(r() * TRUNK_COLORS.length) | 0];
        const cc = CANOPY_COLORS[variant][(r() * CANOPY_COLORS[variant].length) | 0];
        trunkIM.setColorAt(i, _tmpC.setHex(tc).convertSRGBToLinear());
        canopyIM.setColorAt(i, _tmpC.setHex(cc).convertSRGBToLinear());
      });
      trunkIM.instanceMatrix.needsUpdate = true;
      canopyIM.instanceMatrix.needsUpdate = true;
      if (trunkIM.instanceColor) trunkIM.instanceColor.needsUpdate = true;
      if (canopyIM.instanceColor) canopyIM.instanceColor.needsUpdate = true;
      trunkIM.castShadow = canopyIM.castShadow = true;
      trunkIM.receiveShadow = canopyIM.receiveShadow = true;
      trunkIM.frustumCulled = canopyIM.frustumCulled = false;
      this.scene.add(trunkIM, canopyIM);
      this.meshes.push(trunkIM, canopyIM);
      this.groups.push({ variant, count: list.length, trunk: trunkIM, canopy: canopyIM });
    }
  }
}

/** 供烘焙端/游戏端复用的变体几何(白色顶点色,实际颜色由实例色提供) */
export function variantGeometries(variant) {
  // 与 TreeSystem 内部缓存一致
  return buildVariantGeometries(variant);
}

/**
 * 游戏端:从烘焙包的数组直接构建某变体的两个 InstancedMesh(不跑任何生成逻辑)
 * matrices: Float32Array(16n) — trunk/canopy 共用
 * trunkColors / canopyColors: Uint8Array(3n),normalized 实例色
 */
export function materializeBakedTrees(scene, variant, count, matrices, trunkColors, canopyColors) {
  const geos = variantGeometries(variant);
  const mk = (geo, colors) => {
    const im = new THREE.InstancedMesh(geo, _mat, count);
    im.instanceMatrix = new THREE.InstancedBufferAttribute(matrices, 16);
    im.instanceColor = new THREE.InstancedBufferAttribute(colors, 3, true);
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
    im.castShadow = im.receiveShadow = true;
    im.frustumCulled = false;
    scene.add(im);
    return im;
  };
  return [mk(geos.trunk, trunkColors), mk(geos.canopy, canopyColors)];
}
