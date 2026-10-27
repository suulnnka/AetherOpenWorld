// 公园生成器 — 草坪 + 园路 + 湖 + 亭子 + 花境 + 树
import { mulberry32, rngRange, rngInt, rngPick, rngChance } from '../rng.js';
import { C } from '../palette.js';
import { TREE_VARIANTS } from './tree.js';

/**
 * el: { x, z, w, d, seed, lake, treeDensity(0-1), pavilion }
 * 返回 { water: {x,z,w,d} | null }
 */
export function addPark(mb, el, ctx) {
  const rnd = mulberry32(el.seed ?? 7);
  const w = el.w || 160, d = el.d || 160;
  const x = ctx.ox + (el.x || 0), z = ctx.oz + (el.z || 0);
  const treeDensity = el.treeDensity ?? 0.6;

  // 草坪 + 边缘石带
  mb.box(x, 0.12, z, w, 0.24, d, C.grass);
  mb.box(x, 0.16, z, w + 5, 0.14, d + 5, C.curb);
  mb.box(x, 0.19, z, w + 6.5, 0.1, d + 6.5, C.sidewalk);

  // 十字园路
  const pathW = 4.5;
  mb.box(x, 0.3, z, w, 0.1, pathW, 0xd8d2c2);
  mb.box(x, 0.3, z, pathW, 0.1, d, 0xd8d2c2);

  // 湖泊
  let water = null;
  const hasLake = el.lake !== false && rngChance(rnd, el.lake === true ? 1 : 0.6);
  let lakeR = 0, lakeX = 0, lakeZ = 0;
  if (hasLake) {
    lakeR = Math.min(w, d) * rngRange(rnd, 0.22, 0.3);
    lakeX = x + w * rngRange(rnd, -0.15, 0.15);
    lakeZ = z + d * rngRange(rnd, -0.15, 0.15);
    mb.cyl(lakeX, 0.26, lakeZ, lakeR + 2.5, lakeR + 2.5, 0.12, C.shore, 8, rnd() * Math.PI);
    water = { x: lakeX, z: lakeZ, w: lakeR * 2, d: lakeR * 2 };
    ctx.water.push({ x: lakeX, z: lakeZ, w: lakeR * 2, d: lakeR * 2 });
  }

  // 亭子(在十字路口一角)
  if (el.pavilion !== false) {
    const px = x + w * 0.22, pz = z + d * 0.22;
    mb.box(px, 0.36, pz, 5, 0.25, 5, C.whiteMarble);
    for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) {
      mb.box(px + dx, 1.7, pz + dz, 0.35, 2.6, 0.35, C.redWall);
    }
    mb.hipRoof(px, 3, pz, 5.6, 5.6, 1.6, C.blueRoof, 0.35);
    mb.cyl(px, 4.75, pz, 0.18, 0.18, 0.5, C.goldRoof, 5);
  }

  // 花境
  const flowerN = rngInt(rnd, 3, 6);
  for (let i = 0; i < flowerN; i++) {
    const fx = x + rngRange(rnd, -w / 2 + 8, w / 2 - 8);
    const fz = z + rngRange(rnd, -d / 2 + 8, d / 2 - 8);
    if (Math.abs(fx - x) < 5 || Math.abs(fz - z) < 5) continue;
    mb.cyl(fx, 0.28, fz, rngRange(rnd, 1.2, 2.4), rngRange(rnd, 1.2, 2.4), 0.14,
      rngPick(rnd, [C.flowerPink, C.flowerRed, C.flowerYellow, C.flowerWhite]), 6, rnd() * 3);
  }

  // 长椅
  for (let i = 0; i < rngInt(rnd, 2, 4); i++) {
    const bx = x + rngRange(rnd, -w / 2 + 10, w / 2 - 10);
    const bz = z + (rngChance(rnd, 0.5) ? pathW / 2 + 1.5 : -pathW / 2 - 1.5);
    mb.box(bx, 0.55, bz, 2.2, 0.14, 0.55, C.woodBrown);
    mb.box(bx, 0.75, bz - 0.28, 2.2, 0.5, 0.12, C.woodBrown);
  }

  // 树
  if (ctx.addTree) {
    const area = w * d;
    const n = Math.round(area / 850 * treeDensity * 1.6);
    for (let i = 0; i < n; i++) {
      const tx = x + rngRange(rnd, -w / 2 + 5, w / 2 - 5);
      const tz = z + rngRange(rnd, -d / 2 + 5, d / 2 - 5);
      if (Math.abs(tx - x) < pathW / 2 + 1.5 || Math.abs(tz - z) < pathW / 2 + 1.5) continue;
      if (hasLake && Math.hypot(tx - lakeX, tz - lakeZ) < lakeR + 3.5) continue;
      const nearLake = hasLake && Math.hypot(tx - lakeX, tz - lakeZ) < lakeR + 10;
      const variant = nearLake ? 'willow' : rngPick(rnd, TREE_VARIANTS);
      ctx.addTree(tx, tz, variant, rngRange(rnd, 0.9, 1.5), rngInt(rnd, 1, 1e9));
    }
  }

  return { water };
}
