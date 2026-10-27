// 示例北京城生成器 — 五环大城市版
// 中轴线(钟鼓楼→景山→故宫→天安门→广场→正阳门→永定门),长安街横贯,
// 二环~五环方格路网,CBD 在东,奥林匹克公园在北,颐和园/未名湖在西北,
// 望京/798 在东北,北京西站/首钢园在西,南站/大兴机场在南,卢沟桥在西南。
import { mulberry32, rngRange, rngInt, rngPick, rngChance, newSeed } from './rng.js';

const P = 110;        // 街区间距
const BLOCK = 84;     // 街区尺寸(留出街道)
const RINGS = [385, 605, 825, 1045, 1265]; // 二环~五环(对齐街区网格缝)

// 保留区(不生成普通街区):[x0, z0, x1, z1, 名称]
const ZONES = [
  [-120, -255, 120, 65, '故宫'],
  [-170, 60, 170, 480, '中轴线南段(广场/前门/永定门)'],
  [-290, 120, -110, 285, '国家大剧院'],
  [85, 330, 395, 635, '天坛公园'],
  [-475, -305, -185, -35, '北海'],
  [-85, -355, 85, -245, '景山'],
  [-235, -1210, 235, -745, '奥林匹克公园(含冰丝带/奥森)'],
  [595, 55, 875, 390, 'CBD核心'],
  [-45, -525, 45, -395, '钟鼓楼'],
  [-685, 265, -555, 395, '中央电视塔'],
  [535, -395, 785, -125, '朝阳公园'],
  [140, -515, 285, -365, '雍和宫'],
  [230, 180, 375, 325, '北京站'],
  [-795, 15, -605, 225, '北京西站'],
  [-35, 625, 155, 780, '北京南站'],
  [655, -815, 865, -645, '望京SOHO'],
  [735, -585, 905, -455, '798艺术区'],
  [-1130, -1090, -670, -710, '颐和园'],
  [-800, -770, -560, -590, '北大未名湖'],
  [-1250, -340, -1060, -60, '首钢园'],
  [-965, 875, -795, 1045, '卢沟桥'],
  [-395, -15, -265, 115, '妙应寺白塔'],
];

const inRect = (x, z, r, pad = 0) => x >= r[0] - pad && x <= r[2] + pad && z >= r[1] - pad && z <= r[3] + pad;
const inZones = (x, z, pad = 0) => ZONES.some((r) => inRect(x, z, r, pad));

export function generateDemoCity() {
  const rnd = mulberry32(20261027);
  const elements = [];
  let nextId = 1;
  const add = (el) => { el.id = nextId++; elements.push(el); return el; };

  // ---------- 街区(|g| ≤ 11,约 ±1210) ----------
  for (let gx = -11; gx <= 11; gx++) {
    for (let gz = -11; gz <= 11; gz++) {
      const x = gx * P, z = gz * P;
      if (inZones(x, z, 14)) continue;
      const d = Math.max(Math.abs(gx), Math.abs(gz)) * P;
      // 越外圈越疏朗
      if (d > 990 && rngChance(rnd, 0.16)) continue;
      if (d > 770 && rngChance(rnd, 0.09)) continue;
      if (rngChance(rnd, 0.05)) continue;
      let style, density;
      if (x >= -220 && x <= 220 && z <= -350 && z >= -600) {
        style = 'hutong'; density = rngRange(rnd, 0.7, 0.95);      // 钟鼓楼胡同区
      } else if (d <= 330) {
        style = rngChance(rnd, 0.55) ? 'hutong' : 'oldcity';
        density = rngRange(rnd, 0.7, 0.95);
      } else if (d <= 550) {
        style = rngChance(rnd, 0.5) ? 'oldcity' : 'modern';
        density = rngRange(rnd, 0.7, 0.95);
      } else if (d <= 770) {
        style = rngChance(rnd, x > 200 ? 0.4 : 0.2) ? 'cbd' : 'modern';
        density = rngRange(rnd, 0.65, 0.9);
      } else if (d <= 990) {
        style = rngChance(rnd, 0.25) ? 'cbd' : 'modern';
        density = rngRange(rnd, 0.55, 0.8);
      } else {
        style = rngChance(rnd, 0.3) ? 'cbd' : 'modern';
        density = rngRange(rnd, 0.45, 0.7);                        // 五环外疏朗
      }
      add({ type: 'block', x, z, w: BLOCK, d: BLOCK, style, seed: rngInt(rnd, 1, 1e9), density });
    }
  }

  // ---------- 公园 ----------
  add({ type: 'park', x: 240, z: 480, w: 280, d: 280, seed: 11, lake: false, treeDensity: 0.5, pavilion: false }); // 天坛公园
  add({ type: 'park', x: 30, z: -830, w: 460, d: 150, seed: 12, lake: false, treeDensity: 0.55, pavilion: true });  // 奥林匹克
  add({ type: 'park', x: 660, z: -260, w: 240, d: 250, seed: 13, lake: true, treeDensity: 0.6, pavilion: true });   // 朝阳公园
  add({ type: 'park', x: -330, z: -170, w: 270, d: 250, seed: 14, lake: false, treeDensity: 0, pavilion: false });  // 北海公园(湖单独放)
  add({ type: 'park', x: -520, z: 420, w: 160, d: 160, seed: 15, lake: true, treeDensity: 0.6, pavilion: true });   // 西南绿地
  add({ type: 'park', x: -190, z: 640, w: 140, d: 130, seed: 16, lake: true, treeDensity: 0.6, pavilion: true });   // 陶然亭公园
  add({ type: 'park', x: 260, z: 655, w: 130, d: 120, seed: 17, lake: true, treeDensity: 0.55, pavilion: true });   // 龙潭公园
  add({ type: 'park', x: 0, z: -1160, w: 320, d: 80, seed: 18, lake: false, treeDensity: 0.5, pavilion: false });   // 奥森公园

  // ---------- 水面 ----------
  add({ type: 'water', x: -330, z: -170, w: 160, d: 180 });  // 北海
  add({ type: 'water', x: -180, z: -280, w: 90, d: 90 });    // 什刹海

  // ---------- 31 个地标(中轴线从北到南) ----------
  add({ type: 'landmark', lm: 'olytower', x: 60, z: -1060, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'iceribbon', x: -70, z: -950, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'niaochao', x: -40, z: -830, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'shuilifang', x: 150, z: -830, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'zhonglou', x: 0, z: -500, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'gulou', x: 0, z: -430, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'yonghegong', x: 212, z: -440, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'jingshan', x: 0, z: -300, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'gugong', x: 0, z: -95, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'miaoying', x: -330, z: 50, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'tiananmen', x: 0, z: 100, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'square', x: 0, z: 210, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'ncdt', x: -210, z: 205, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'zhengyangmen', x: 0, z: 352, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'yongdingmen', x: 0, z: 450, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'tiantan', x: 240, z: 470, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'southStation', x: 60, z: 700, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'daxing', x: 240, z: 1420, ry: 0.63, s: 1 });  // 南郊大兴机场
  // 城东 / CBD
  add({ type: 'landmark', lm: 'cctv', x: 680, z: 130, ry: 0.35, s: 1 });
  add({ type: 'landmark', lm: 'citic', x: 640, z: 240, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'guomao', x: 730, z: 330, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'beijingzhan', x: 300, z: 250, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'wangjing', x: 760, z: -730, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'art798', x: 820, z: -520, ry: 0, s: 1 });
  // 城西 / 西北
  add({ type: 'landmark', lm: 'tvtower', x: -620, z: 330, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'westStation', x: -700, z: 120, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'shougang', x: -1155, z: -200, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'summerPalace', x: -900, z: -900, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'boyata', x: -680, z: -680, ry: 0, s: 1 });
  add({ type: 'landmark', lm: 'baita', x: -330, z: -195, ry: 0, s: 1 });
  // 西南
  add({ type: 'landmark', lm: 'luguqiao', x: -880, z: 960, ry: 0, s: 1 });

  // ---------- 行道树 ----------
  for (const r of RINGS) {
    for (let t = -r; t <= r; t += 28) {
      for (const [x, z] of [[t, -r - 17], [t, r + 17], [-r - 17, t], [r + 17, t]]) {
        if (inZones(x, z, 4) || Math.abs(z - 60) < 22) continue;
        if (rngChance(rnd, 0.7)) {
          add({ type: 'tree', x: x + rngRange(rnd, -2, 2), z: z + rngRange(rnd, -2, 2), variant: rngPick(rnd, ['broadleaf', 'conifer']), s: rngRange(rnd, 0.8, 1.1), seed: rngInt(rnd, 1, 1e9) });
        }
      }
    }
  }
  // 长安街行道树(双向)
  for (let x = -1240; x <= 1240; x += 22) {
    if (inZones(x, 60, 16)) continue;
    for (const dz of [-19, 19]) {
      add({ type: 'tree', x: x + rngRange(rnd, -1, 1), z: 60 + dz, variant: 'broadleaf', s: rngRange(rnd, 0.85, 1.1), seed: rngInt(rnd, 1, 1e9) });
    }
  }
  // 银杏大道(城西)
  for (let z = -300; z <= 300; z += 13) {
    for (const dx of [-7, 7]) {
      add({ type: 'tree', x: -460 + dx, z: z + rngRange(rnd, -2, 2), variant: 'ginko', s: rngRange(rnd, 1.0, 1.35), seed: rngInt(rnd, 1, 1e9) });
    }
  }
  // 北海沿岸垂柳
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = 95 + rngRange(rnd, 4, 14);
    const x = -330 + Math.cos(a) * rr, z = -170 + Math.sin(a) * rr * 0.95;
    if (inZones(x, z, 0)) continue;
    add({ type: 'tree', x, z, variant: 'willow', s: rngRange(rnd, 1.0, 1.4), seed: rngInt(rnd, 1, 1e9) });
  }
  // 城中散树
  for (let i = 0; i < 220; i++) {
    const x = rngRange(rnd, -1230, 1230), z = rngRange(rnd, -1230, 1230);
    if (inZones(x, z, 20)) continue;
    add({ type: 'tree', x, z, variant: rngPick(rnd, ['broadleaf', 'conifer', 'ginko']), s: rngRange(rnd, 0.8, 1.3), seed: rngInt(rnd, 1, 1e9) });
  }

  return {
    format: 1,
    name: '示例 · 北京城(五环)',
    settings: {
      world: 3000,
      seed: 20261027,
      rings: RINGS,
      avenue: { z: 60 },
      terrain: { seed: 20261027, amplitude: 3.2, mountains: true },
      nextId,
    },
    elements,
  };
}

/** 编辑器新建空白地图 */
export function emptyMap() {
  return {
    format: 1,
    name: '新地图',
    settings: {
      world: 3000,
      seed: newSeed(),
      rings: [385, 605, 825, 1045, 1265],
      avenue: null,
      terrain: { seed: newSeed(), amplitude: 3, mountains: true },
      nextId: 1,
    },
    elements: [],
  };
}
