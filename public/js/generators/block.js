// 街区生成器 — 一个街区单元:人行道 + 若干建筑布局(胡同 / 老城 / 现代 / CBD)
import { addBuilding } from './building.js';
import { mulberry32, rngRange, rngInt, rngPick, rngChance, rngWeighted } from '../rng.js';
import { C } from '../palette.js';
import { TREE_VARIANTS } from './tree.js';

/**
 * el: { x, z, w, d, style, seed, density(0-1) }
 * ctx: { treeSys, terrain, ox, oz } — ox/oz 为绘制原点(区块合并模式传世界坐标,元素模式传 0)
 * 返回 { footprints[] }
 */
export function addBlock(mb, el, ctx) {
  const rnd = mulberry32(el.seed ?? 1);
  const w = el.w || 92, d = el.d || 92;
  const x = ctx.ox + (el.x || 0), z = ctx.oz + (el.z || 0);
  const density = el.density ?? 0.75;
  const style = el.style === 'auto' ? rngWeighted(rnd, [
    { v: 'hutong', w: 2 }, { v: 'oldcity', w: 3 }, { v: 'modern', w: 3 }, { v: 'cbd', w: 1 },
  ]) : (el.style || 'oldcity');

  const footprints = [];

  // 人行道垫层
  mb.box(x, 0.09, z, w, 0.18, d, C.sidewalk);
  mb.box(x, 0.2, z, w - 4, 0.06, d - 4, C.concrete);

  const innerW = w - 12, innerD = d - 12;

  const addTreeNear = (tx, tz) => {
    if (!ctx.addTree) return;
    ctx.addTree(tx, tz, rngPick(rnd, TREE_VARIANTS.slice(0, 2)), rngRange(rnd, 0.8, 1.2), rngInt(rnd, 1, 1e9));
  };

  const buildLot = (lx, lz, lw, ld) => {
    if (rngChance(rnd, 1 - density * 0.95)) {
      // 空地:小花园或停车场
      if (rngChance(rnd, 0.5)) {
        mb.box(lx, 0.26, lz, lw, 0.1, ld, C.grass);
        addTreeNear(lx + rngRange(rnd, -lw / 3, lw / 3), lz + rngRange(rnd, -ld / 3, ld / 3));
      } else {
        mb.box(lx, 0.26, lz, lw, 0.08, ld, C.asphaltDark);
        for (let i = 0; i < 4; i++) mb.box(lx - lw / 2 + 2 + i * (lw / 4), 0.34, lz, 0.15, 0.1, ld * 0.7, C.trim);
      }
      return;
    }
    const floors = Math.max(1, Math.round(lotFloors(style, rnd)));
    const fp = addBuilding(mb, rnd, {
      x: lx, z: lz, w: lw * rngRange(rnd, 0.82, 0.98), d: ld * rngRange(rnd, 0.82, 0.98),
      floors, style: lotStyle(style, rnd), ry: 0, groundY: 0,
    });
    footprints.push(fp);
  };

  if (style === 'hutong') {
    // 3×3 胡同院落
    const lot = innerW / 3;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const lx = x + i * (lot + 1.5), lz = z + j * (lot + 1.5);
        if (rngChance(rnd, 0.18)) {
          // 四合院:围墙 + 内树
          mb.box(lx, 1.1, lz - lot / 2, lot, 2.2, 0.5, C.wallStone);
          mb.box(lx, 1.1, lz + lot / 2, lot, 2.2, 0.5, C.wallStone);
          mb.box(lx - lot / 2, 1.1, lz, 0.5, 2.2, lot, C.wallStone);
          addTreeNear(lx, lz);
        } else {
          buildLot(lx, lz, lot * 0.92, lot * 0.92);
        }
      }
    }
  } else if (style === 'oldcity') {
    // 2×2 多层板楼
    const lw = innerW / 2 - 3, ld = innerD / 2 - 3;
    for (let i = -1; i <= 1; i += 2) {
      for (let j = -1; j <= 1; j += 2) {
        if (rngChance(rnd, 0.15)) continue;
        const floors = rngInt(rnd, 4, 8);
        footprints.push(addBuilding(mb, rnd, {
          x: x + i * (innerW / 4 + 1.5), z: z + j * (innerD / 4 + 1.5),
          w: rngRange(rnd, 0.85, 1) * lw, d: rngRange(rnd, 0.8, 1) * ld,
          floors, style: rngChance(rnd, 0.25) ? 'modern' : 'oldcity',
        }));
      }
    }
  } else if (style === 'modern') {
    // 一主楼 + 副楼 + 裙房
    const mainF = rngInt(rnd, 12, 26);
    const mx = x + rngRange(rnd, -8, 8), mz = z + rngRange(rnd, -8, 8);
    footprints.push(addBuilding(mb, rnd, {
      x: mx, z: mz, w: rngRange(rnd, 20, 28), d: rngRange(rnd, 18, 26),
      floors: mainF, style: rngChance(rnd, 0.4) ? 'tower' : 'modern',
    }));
    const n = rngInt(rnd, 1, 2);
    for (let k = 0; k < n; k++) {
      const ang = rnd() * Math.PI * 2;
      const bx = x + Math.cos(ang) * (innerW / 3.2), bz = z + Math.sin(ang) * (innerD / 3.2);
      footprints.push(addBuilding(mb, rnd, {
        x: bx, z: bz, w: rngRange(rnd, 14, 20), d: rngRange(rnd, 12, 18),
        floors: rngInt(rnd, 6, 14), style: 'modern',
      }));
    }
    if (rngChance(rnd, 0.5)) addTreeNear(x - innerW / 2 - 2, z - innerD / 2 - 2);
  } else if (style === 'cbd') {
    // 超高双塔 + 大裙房
    const t1x = x - innerW / 5, t2x = x + innerW / 5;
    const f1 = rngInt(rnd, 30, 48), f2 = Math.round(f1 * rngRange(rnd, 0.6, 0.9));
    footprints.push(addBuilding(mb, rnd, { x: t1x, z, w: 24, d: 24, floors: f1, style: 'cbd' }));
    footprints.push(addBuilding(mb, rnd, { x: t2x, z: z + rngRange(rnd, -6, 6), w: 20, d: 20, floors: f2, style: 'cbd' }));
  }

  // 街角行道树
  if (ctx.addTree && rngChance(rnd, 0.75)) {
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const c = rngPick(rnd, corners);
    ctx.addTree(x + c[0] * (w / 2 + 3), z + c[1] * (d / 2 + 3), rngPick(rnd, TREE_VARIANTS.slice(0, 2)), rngRange(rnd, 0.9, 1.2), rngInt(rnd, 1, 1e9));
  }

  return { footprints };
}

function lotFloors(style, rnd) {
  switch (style) {
    case 'hutong': return rngInt(rnd, 1, 2);
    case 'oldcity': return rngInt(rnd, 4, 7);
    case 'modern': return rngInt(rnd, 8, 18);
    default: return rngInt(rnd, 6, 12);
  }
}
function lotStyle(style, rnd) {
  if (style === 'oldcity') return rngChance(rnd, 0.2) ? 'hutong' : 'oldcity';
  return style;
}
