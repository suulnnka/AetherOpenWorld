// 大楼生成器 — 单体建筑,5 种风格(平房四合院 / 老城多层 / 现代中高层 / 塔楼 / CBD 玻璃塔)
import { rngRange, rngInt, rngPick, rngChance } from '../rng.js';
import { C, WALL_POOLS, ROOF_POOLS } from '../palette.js';

export const FLOOR_H = 3;
export const BUILDING_STYLES = ['hutong', 'oldcity', 'modern', 'tower', 'cbd'];

/**
 * 画一栋楼。cfg:
 * { x, z, w, d, floors, style, ry, wall(可选指定色) }
 * 返回 footprint { x, z, hw, hd, h } 用于碰撞(轴对齐近似)
 */
export function addBuilding(mb, rnd, cfg) {
  const { x, z, ry = 0 } = cfg;
  const style = cfg.style || 'oldcity';
  const floors = Math.max(1, cfg.floors | 0);
  const w = cfg.w, d = cfg.d;
  const H = floors * FLOOR_H;
  const ox = 0, oz = 0; // 相对传入坐标绘制

  const wallPool = WALL_POOLS[style] || WALL_POOLS.oldcity;
  const wall = cfg.wall ?? rngPick(rnd, wallPool);

  const rot = (px, pz) => {
    const s = Math.sin(ry), c = Math.cos(ry);
    return [x + px * c - pz * s, z + px * s + pz * c];
  };
  const draw = (fn, ...args) => fn(...args); // 占位可读性

  switch (style) {
    case 'hutong': {
      // 1-2 层坡顶小房
      const roofC = rngPick(rnd, ROOF_POOLS.hutong);
      mb.box(x, H / 2, z, w, H, d, wall, ry);
      mb.gableRoof(x, H, z, w, d, rngRange(rnd, 1.4, 2.1), roofC, 0.35, ry);
      // 门窗
      const door = rot(0, d / 2 + 0.06);
      mb.box(door[0], 1.15, door[1], 1.1, 2.3, 0.1, C.woodBrown, ry);
      if (rngChance(rnd, 0.7)) {
        const win = rot(w / 4, d / 2 + 0.06);
        mb.box(win[0], 1.5, win[1], 0.9, 1.1, 0.08, 0x5a6b78, ry);
      }
      break;
    }
    case 'oldcity': {
      mb.box(x, H / 2, z, w, H, d, wall, ry);
      // 女儿墙 + 楼梯间 + 水箱
      const pv = 0.5;
      mb.box(x, H + pv / 2, z, w + 0.3, pv, d + 0.3, rngPick(rnd, [C.roofDark, C.roofSlate]), ry);
      const shPos = rot(w * rngRange(rnd, -0.25, 0.25), -d / 4);
      mb.box(shPos[0], H + 1.1, shPos[1], Math.min(6, w * 0.3), 2.2, Math.min(5, d * 0.35), wall, ry);
      if (rngChance(rnd, 0.5)) {
        const tPos = rot(w / 4, d / 4);
        mb.cyl(tPos[0], H + 1.6, tPos[1], 1.1, 1.1, 2, C.trim, 6, ry);
      }
      // 阳台横带
      if (rngChance(rnd, 0.6)) {
        const bandC = 0xffffff & (wall & 0xfefefe) >>> 0 || C.trim; // 简单提亮
        for (let f = 1; f < floors; f += 2) {
          const bp = rot(0, d / 2 + 0.15);
          mb.box(bp[0], f * FLOOR_H + 0.9, bp[1], w * 0.8, 0.18, 0.5, C.trim, ry);
        }
      }
      break;
    }
    case 'modern': {
      mb.box(x, H / 2, z, w, H, d, wall, ry);
      // 竖向核心筒
      const corePos = rot(-w / 2 + 1.6, 0);
      mb.box(corePos[0], H / 2 + 1, corePos[1], 2.6, H + 2, d * 0.6, C.concrete, ry);
      // 横向线脚
      for (let f = 3; f < floors; f += 4) {
        const bp = rot(0, 0);
        mb.box(bp[0], f * FLOOR_H, bp[1], w + 0.25, 0.35, d + 0.25, C.trim, ry);
      }
      // 顶部机电
      const rPos = rot(w * rngRange(rnd, -0.2, 0.2), d * rngRange(rnd, -0.2, 0.2));
      mb.box(rPos[0], H + 0.9, rPos[1], w * 0.35, 1.6, d * 0.3, C.concrete, ry);
      if (rngChance(rnd, 0.45)) {
        const aPos = rot(w / 2 - 1, -d / 2 + 1);
        mb.cyl(aPos[0], H + 2.5, aPos[1], 0.12, 0.12, 5, C.steelDark, 5, ry);
      }
      break;
    }
    case 'tower':
    case 'cbd': {
      // 退台式玻璃塔 + 裙房
      const podiumH = FLOOR_H * rngInt(rnd, 2, 3);
      const pPos = rot(0, 0);
      mb.box(pPos[0], podiumH / 2, pPos[1], w * 1.25, podiumH, d * 1.25, C.concrete, ry);
      let cw = w, cd = d, cy = podiumH;
      const tiers = floors > 26 ? 3 : 2;
      for (let t = 0; t < tiers; t++) {
        const th = (H - podiumH) / tiers * rngRange(rnd, 0.9, 1.1);
        const pos = rot(0, 0);
        mb.box(pos[0], cy + th / 2, pos[1], cw, th, cd, wall, ry);
        // 玻璃竖棱
        const fin = rot(cw / 2 + 0.1, 0);
        mb.box(fin[0], cy + th / 2, fin[1], 0.2, th, cd * 0.9, C.glassDark, ry);
        cy += th; cw *= rngRange(rnd, 0.78, 0.9); cd *= rngRange(rnd, 0.78, 0.9);
      }
      // 塔冠
      if (rngChance(rnd, 0.6)) {
        const cPos = rot(0, 0);
        mb.hipRoof(cPos[0], cy, cPos[1], cw * 1.1, cd * 1.1, 3, C.glassDark, 0.3, ry);
      } else {
        const sPos = rot(0, 0);
        mb.cyl(sPos[0], cy + 3, sPos[1], 0.15, 0.15, 6, C.steel, 5, ry);
      }
      break;
    }
  }

  // 碰撞 footprint(近似轴对齐:取旋转后的包围盒)
  const ext = Math.abs(Math.cos(ry)) * w / 2 + Math.abs(Math.sin(ry)) * d / 2;
  const extZ = Math.abs(Math.sin(ry)) * w / 2 + Math.abs(Math.cos(ry)) * d / 2;
  return { x, z, hw: ext, hd: extZ, h: H + (style === 'hutong' ? 2 : 1) };
}
