// 北京地标库 — 全部用 MeshBuilder 低模拼装,坐标为地标局部坐标(原点在地面中心,+z 朝南)
import * as THREE from 'three';
import { MeshBuilder } from './mesh-builder.js';
import { mulberry32, rngRange, rngInt, rngPick, rngChance } from './rng.js';
import { C } from './palette.js';
import { TREE_VARIANTS } from './generators/tree.js';

/**
 * 每个地标: build(mbSolid, mbGlass, mbWater, rnd) → { footprints[], trees[], radius }
 * footprints 为局部坐标 {x,z,hw,hd,h},装配时再变换到世界。
 */
function tiananmen(S, G, W, rnd) {
  // 城台
  S.box(0, 5, 0, 62, 10, 20, C.redWall);
  // 券门洞
  for (let i = -2; i <= 2; i++) S.box(i * 11, 3.4, 10.2, 4.2, 6.8, 0.8, 0x3a1512);
  // 城楼(重檐)
  S.box(0, 12.5, -1, 48, 5, 14, C.redWall);
  S.hipRoof(0, 15, -1, 52, 17, 3.2, C.goldRoof, 0.55, 0, 1.2);
  S.box(0, 19.5, -1, 34, 3.6, 10, C.redWall);
  S.hipRoof(0, 21.4, -1, 38, 12, 3.4, C.goldRoofDeep, 0.55, 0, 1.2);
  // 屋脊吻兽
  for (const sx of [-1, 1]) S.box(sx * 19, 24, -1, 1.2, 1.6, 1.2, C.goldRoof);
  // 前廊柱
  for (let i = -4; i <= 4; i++) S.box(i * 5.4, 11.5, 6.5, 0.8, 9, 0.8, C.redWallDark);
  // 金水桥(五座)
  for (let i = -2; i <= 2; i++) S.box(i * 12, 0.7, 18, 5, 1.2, 12, C.whiteMarble);
  // 华表
  for (const sx of [-1, 1]) {
    S.cyl(sx * 34, 4, 16, 0.8, 0.9, 8, C.whiteMarble, 8);
    S.ico(sx * 34, 8.5, 16, 0.7, C.whiteMarble);
    S.box(sx * 34, 0.6, 16, 2.4, 1.2, 2.4, C.whiteMarble);
  }
  // 旗杆与红旗
  S.cyl(-24, 7, 26, 0.15, 0.2, 14, C.silver, 6);
  S.box(-21.5, 12.6, 26, 4.6, 2.8, 0.12, C.flagRed);
  const footprints = [{ x: 0, z: 0, hw: 31, hd: 10, h: 10 }, { x: 0, z: -1, hw: 24, hd: 7, h: 25 }];
  return { footprints, trees: [], radius: 70 };
}

function gugong(S, G, W, rnd) {
  const WX = 105, WZ = 150; // 半宽
  // —— 筒子河(护城河) ——
  const moat = 10;
  W.box(0, -0.5, WZ + moat / 2 + 4, WX * 2 + 40, 0.5, moat, C.water);
  W.box(0, -0.5, -(WZ + moat / 2 + 4), WX * 2 + 40, 0.5, moat, C.water);
  W.box(-(WX + moat / 2 + 4), -0.5, 0, moat, 0.5, WZ * 2 + 40, C.water);
  W.box(WX + moat / 2 + 4, -0.5, 0, moat, 0.5, WZ * 2 + 40, C.water);

  // —— 宫墙(南侧留门) ——
  const wallH = 9;
  const gateGap = 10;
  S.box(-(WX / 2 + gateGap / 2), wallH / 2, WZ, WX - gateGap, wallH, 5, C.redWall);
  S.box(WX / 2 + gateGap / 2, wallH / 2, WZ, WX - gateGap, wallH, 5, C.redWall);
  S.box(0, wallH / 2, -WZ, WX * 2, wallH, 5, C.redWall);
  S.box(-WX, wallH / 2, 0, 5, wallH, WZ * 2, C.redWall);
  S.box(WX, wallH / 2, 0, 5, wallH, WZ * 2, C.redWall);

  // —— 四门城楼 + 角楼 ——
  const gateTower = (gx, gz, ry) => {
    S.box(gx, wallH + 3, gz, 26, 6, 12, C.redWall, ry);
    S.hipRoof(gx, wallH + 6, gz, 30, 16, 3, C.goldRoof, 0.55, ry, 1);
  };
  gateTower(0, WZ, 0);            // 午门
  gateTower(0, -WZ, 0);           // 神武门
  gateTower(-WX, 0, Math.PI / 2); // 东华门
  gateTower(WX, 0, Math.PI / 2);  // 西华门
  for (const [cx, cz] of [[-WX, -WZ], [WX, -WZ], [-WX, WZ], [WX, WZ]]) {
    S.box(cx, wallH + 2.2, cz, 9, 4.5, 9, C.redWall);
    S.hipRoof(cx, wallH + 4.5, cz, 12, 12, 2.6, C.goldRoofDeep, 0.4);
  }

  // —— 前朝三大殿(汉白玉三层台基) ——
  const terrace = (tx, tz, tw, td, th) => {
    S.box(tx, 1.2, tz, tw + 10, 2.4, td + 10, C.whiteMarble);
    S.box(tx, 3.2, tz, tw + 6, 1.6, td + 6, C.whiteMarble);
    S.box(tx, 4.6, tz, tw + 2, 1.2, td + 2, C.whiteMarble);
  };
  const hall = (hx, hz, hw, hd, ry = 0) => {
    S.box(hx, 7.5, hz, hw, 5.5, hd, C.redWall, ry);
    S.hipRoof(hx, 10, hz, hw + 3, hd + 3, 3.4, C.goldRoof, 0.5, ry, 1.5);
    for (const sx of [-1, 1]) S.box(hx + sx * (hw / 2 + 1), 13.2, hz, 1, 1.4, 1, C.goldRoof);
  };
  // 太和殿(最大)
  terrace(0, 45, 46, 26);
  hall(0, 45, 44, 24);
  // 中和殿 / 保和殿
  terrace(0, 5, 26, 20);
  hall(0, 5, 24, 18);
  terrace(0, -35, 36, 22);
  hall(0, -35, 34, 20);
  // 后廷主殿(乾清宫一带)
  terrace(0, -80, 26, 18);
  hall(0, -80, 24, 16);

  // 庭院铺地
  S.box(0, 0.35, 45, 70, 0.3, 90, 0xd6d0c4);
  S.box(0, 0.35, -60, 60, 0.3, 70, 0xd6d0c4);

  // 东西配殿
  for (const side of [-1, 1]) {
    for (const hz of [45, 5, -35, -80]) {
      const hw = 34;
      S.box(side * 62, 4, hz, hw * 0.5, 5, 12, C.redWall);
      S.hipRoof(side * 62, 6.5, hz, hw * 0.55, 14, 2.2, C.goldRoofDeep, 0.5, 0, 0.8);
    }
  }

  const footprints = [
    { x: 0, z: WZ, hw: WX, hd: 3, h: wallH + 9 },
    { x: 0, z: -WZ, hw: WX, hd: 3, h: wallH + 9 },
    { x: -WX, z: 0, hw: 3, hd: WZ, h: wallH },
    { x: WX, z: 0, hw: 3, hd: WZ, h: wallH },
    { x: 0, z: 45, hw: 26, hd: 17, h: 14 },
    { x: 0, z: 5, hw: 15, hd: 12, h: 13 },
    { x: 0, z: -35, hw: 20, hd: 13, h: 13 },
    { x: 0, z: -80, hw: 14, hd: 11, h: 13 },
    { x: -62, z: -20, hw: 10, hd: 55, h: 9 },
    { x: 62, z: -20, hw: 10, hd: 55, h: 9 },
  ];
  return { footprints, trees: [], radius: 180 };
}

function tiantan(S, G, W, rnd) {
  // 祈年殿:三层汉白玉圆台 + 蓝琉璃三重檐
  S.cyl(0, 1.3, 0, 30, 32, 2.6, C.whiteMarble, 12);
  S.cyl(0, 3.4, 0, 24, 26, 2.2, C.whiteMarble, 12);
  S.cyl(0, 5.2, 0, 18, 20, 1.8, C.whiteMarble, 12);
  // 檐柱红墙
  S.cyl(0, 8.5, 0, 13, 13, 6.5, C.redWall, 12);
  // 三重蓝檐
  S.cone(0, 11.5, 0, 20, 5.2, C.blueRoof, 12);
  S.cyl(0, 16.6, 0, 15.5, 15.5, 1.2, C.redWall, 12);
  S.cone(0, 17.2, 0, 15.5, 4.6, C.blueRoof, 12);
  S.cyl(0, 21.7, 0, 11.5, 11.5, 1.1, C.redWall, 12);
  S.cone(0, 22.2, 0, 11.5, 4.2, C.blueRoof, 12);
  // 鎏金宝顶
  S.cyl(0, 27.2, 0, 0.5, 0.9, 2.2, C.goldRoof, 8);
  // 圜丘(南边的圆坛)
  S.cyl(0, 0.9, 62, 16, 17, 1.8, C.whiteMarble, 12);
  S.cyl(0, 2.3, 62, 11, 12, 1.4, C.whiteMarble, 12);
  // 回音壁
  S.lathe([{ r: 46, y: 0 }, { r: 46, y: 3.4 }, { r: 47.4, y: 3.4 }, { r: 47.4, y: 0 }, { r: 46, y: 0 }], 0, 0, 0, C.redWall, 1, 24);
  const footprints = [
    { x: 0, z: 0, hw: 20, hd: 20, h: 28 },
    { x: 0, z: 62, hw: 17, hd: 17, h: 4 },
  ];
  return { footprints, trees: [], radius: 60 };
}

function gulou(S, G, W, rnd, isBell = false) {
  const baseC = isBell ? 0x9d9d99 : 0x8a5a4a;
  S.box(0, 4.5, 0, 34, 9, 18, baseC);
  S.box(0, 4, 9.2, 6, 8, 0.6, 0x2e1f1a);
  S.box(0, 11.5, 0, 30, 7, 15, C.redWall);
  S.hipRoof(0, 15, 0, 34, 19, 3.2, isBell ? 0x5f6b70 : C.roofSlate, 0.5, 0, 1);
  // 腰檐
  S.box(0, 8.6, 0, 33, 0.8, 17, C.roofSlate);
  return { footprints: [{ x: 0, z: 0, hw: 17, hd: 9, h: 20 }], trees: [], radius: 40 };
}

function niaochao(S, G, W, rnd) {
  // 碗形看台
  S.lathe([
    { r: 3, y: 1 }, { r: 26, y: 3.5 }, { r: 33, y: 14 }, { r: 31, y: 24 }, { r: 24, y: 30 }, { r: 14, y: 33 }, { r: 3, y: 33.5 },
  ], 0, 0, 0, 0x9aa3ab, 1, 18);
  // 内场草地
  S.cyl(0, 2.6, 0, 24, 24, 0.6, 0x6fa050, 12);
  // 外立面交叉钢结构
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a), z = Math.sin(a);
    S.box(x * 34.5, 16, z * 34.5, 2.2, 36, 1.2, 0xc23b2e, -a + (i % 2 ? 0.22 : -0.22), 0, 0, 0);
    if (i % 2 === 0) S.box(x * 35.5, 16, z * 35.5, 1.6, 34, 0.9, 0xd8d8d8, -a);
  }
  // 顶部环梁
  S.lathe([{ r: 34, y: 31 }, { r: 35.4, y: 31 }, { r: 35.4, y: 29.5 }, { r: 34, y: 29.5 }, { r: 34, y: 31 }], 0, 0, 0, 0xc23b2e, 1, 24);
  return { footprints: [{ x: 0, z: 0, hw: 36, hd: 36, h: 33 }], trees: [], radius: 70 };
}

function shuilifang(S, G, W, rnd) {
  // 气泡膜结构(半透明)
  G.box(0, 13, 0, 80, 26, 80, 0x8fd4ef);
  // 白色钢框架网格
  for (let i = -4; i <= 4; i++) {
    S.box(0, 26.4, i * 9, 82, 0.9, 1.1, C.trim);
    S.box(i * 9, 26.4, 0, 1.1, 0.9, 82, C.trim);
    S.box(i * 9, 13, 40.6, 1.1, 26.5, 0.9, C.trim);
    S.box(i * 9, 13, -40.6, 1.1, 26.5, 0.9, C.trim);
    S.box(40.6, 13, i * 9, 0.9, 26.5, 1.1, C.trim);
    S.box(-40.6, 13, i * 9, 0.9, 26.5, 1.1, C.trim);
  }
  // 入口雨棚
  S.box(0, 5, 44, 26, 0.8, 10, C.trim);
  return { footprints: [{ x: 0, z: 0, hw: 41, hd: 41, h: 26 }], trees: [], radius: 60 };
}

function cctv(S, G, W, rnd) {
  // 央视"大裤子":两座斜塔 + 悬挑连接体,中间留出环形空洞
  const tower = (tx, lean) => {
    // 用分段盒子近似倾斜塔身
    let y = 0, x = tx;
    for (let i = 0; i < 10; i++) {
      const segH = 11;
      S.box(x, y + segH / 2, 0, 26, segH, 20, 0x51707d);
      S.box(x, y + segH / 2, 10.3, 26, segH * 0.92, 0.8, 0x87a8b5);
      y += segH; x += lean;
    }
    return { topX: x, topY: y };
  };
  const lean = 2.4;
  const A = tower(-24, lean);
  const B = tower(24, -lean);
  // 顶部连接体
  S.box(0, A.topY + 2, 0, 84, 13, 22, 0x51707d);
  S.box(0, A.topY + 8.6, 11.4, 84, 1.2, 1.6, 0x87a8b5);
  // 中部连桥(形成裤腰洞)
  S.box(0, 96, 0, 58, 10, 18, 0x51707d);
  S.box(0, 100.8, 9.6, 58, 1.4, 1.4, 0x87a8b5);
  // 裙房
  S.box(0, 4, 34, 76, 8, 24, 0x44606d);
  const footprints = [
    { x: -14, z: 0, hw: 14, hd: 11, h: 120 },
    { x: 14, z: 0, hw: 14, hd: 11, h: 120 },
    { x: 0, z: 34, hw: 38, hd: 12, h: 8 },
  ];
  return { footprints, trees: [], radius: 60 };
}

function guomao(S, G, W, rnd) {
  // 国贸三期(主塔)+ 一二期
  S.box(0, 42, 0, 34, 84, 34, C.glassTeal);
  S.box(0, 50, 17.6, 30, 66, 1, C.glassDark);
  S.box(0, 86, 0, 24, 8, 24, C.glassTeal);
  S.hipRoof(0, 90, 0, 26, 26, 8, C.glassDark, 0.25);
  S.cyl(0, 104, 0, 0.5, 1.2, 22, C.silver, 6);
  // 国贸一期(1985)
  S.box(-46, 24, 22, 30, 48, 24, C.wallBeige);
  S.hipRoof(-46, 48, 22, 32, 26, 3, C.roofSlate, 0.5);
  // 国贸二期(1999)
  S.box(42, 32, 24, 30, 64, 26, 0xb3ab9c);
  S.box(42, 32, 37.5, 28, 60, 1, C.glassDark);
  // 广场
  S.box(0, 0.35, 24, 120, 0.3, 60, C.concrete);
  return { footprints: [
    { x: 0, z: 0, hw: 18, hd: 18, h: 110 },
    { x: -46, z: 22, hw: 15, hd: 12, h: 50 },
    { x: 42, z: 24, hw: 15, hd: 13, h: 64 },
  ], trees: [], radius: 70 };
}

function tvtower(S, G, W, rnd) {
  // 中央广播电视塔
  S.cyl(0, 3, 0, 12, 14, 6, C.concrete, 12);
  S.cyl(0, 76, 0, 3.6, 5.2, 140, C.silver, 12);
  // 观景舱
  S.cyl(0, 146, 0, 14, 14, 9, 0x9db6c4, 12);
  S.cyl(0, 152, 0, 10, 12, 5, 0xc7d6df, 12);
  S.cone(0, 157, 0, 9, 6, C.silver, 12);
  // 上舱与天线
  S.cyl(0, 174, 0, 3.4, 3.4, 6, 0xd0dde5, 8);
  S.cyl(0, 200, 0, 0.5, 1.4, 46, C.silver, 6);
  S.cyl(0, 224, 0, 0.1, 0.5, 4, C.flagRed, 4);
  return { footprints: [{ x: 0, z: 0, hw: 14, hd: 14, h: 148 }], trees: [], radius: 50 };
}

function baita(S, G, W, rnd) {
  // 北海白塔(立于石台之上)
  S.box(0, 1.5, 0, 22, 3, 22, C.whiteMarble);
  S.box(0, 3.4, 0, 16, 0.8, 16, C.whiteMarble);
  S.lathe([
    { r: 5.5, y: 4 }, { r: 7, y: 8 }, { r: 7.4, y: 12 }, { r: 6, y: 15 }, { r: 4.2, y: 18 }, { r: 2.6, y: 21 }, { r: 1.4, y: 23 }, { r: 0.5, y: 24.5 },
  ], 0, 0, 0, 0xf2f0ea, 1, 14);
  // 相轮与鎏金宝顶
  for (let i = 0; i < 5; i++) S.cyl(0, 25.5 + i * 1.1, 0, 1.6 - i * 0.22, 1.6 - i * 0.22, 0.5, C.goldRoof, 8);
  S.ico(0, 32, 0, 0.8, C.goldRoof);
  // 山门
  S.box(0, 2, 17, 8, 4, 5, C.redWall);
  S.hipRoof(0, 4, 17, 9.5, 6.5, 1.6, C.goldRoofDeep, 0.5);
  return { footprints: [{ x: 0, z: 0, hw: 11, hd: 11, h: 33 }], trees: [], radius: 35 };
}

function jingshan(S, G, W, rnd) {
  // 景山:五峰土山 + 山顶万春亭
  const peaks = [[0, -14, 40, 30], [-42, 6, 30, 22], [42, 6, 30, 22], [-80, 22, 22, 16], [80, 22, 22, 16]];
  for (const [px, pz, r, h] of peaks) {
    S.cyl(px, 0, pz, r * 0.25, r, h * 1.35, 0x6e9c4a, 9);
  }
  // 登山步道
  S.box(0, 0.4, 18, 6, 0.2, 34, 0xd8d2c2);
  S.box(0, 16, 2, 4.5, 0.2, 16, 0xd8d2c2);
  // 万春亭
  const ty = 44;
  S.box(0, ty, -14, 7, 0.6, 7, C.whiteMarble);
  for (const [dx, dz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) {
    S.box(dx, ty + 2, dz - 14, 0.45, 3.4, 0.45, C.redWall);
  }
  S.hipRoof(0, ty + 3.8, -14, 8.5, 8.5, 2.4, C.goldRoof, 0.35);
  S.cyl(0, ty + 6.5, -14, 0.25, 0.4, 1, C.goldRoof, 6);
  return { footprints: [{ x: 0, z: 0, hw: 90, hd: 34, h: 1 }], trees: [], radius: 80 };
}

function square(S, G, W, rnd) {
  // 天安门广场:花岗岩铺装 + 人民英雄纪念碑 + 大会堂(西) + 博物馆(东)
  S.box(0, 0.35, 20, 300, 0.3, 210, 0xc9c5bc);
  S.box(0, 0.4, 20, 300, 0.06, 6, 0xb5b1a8);
  // 人民英雄纪念碑
  S.box(0, 0.8, -20, 26, 0.9, 26, C.whiteMarble);
  S.box(0, 1.6, -20, 14, 0.7, 14, C.whiteMarble);
  S.box(0, 9, -20, 4.5, 15, 2.4, 0xe8e5de);
  S.box(0, 17.2, -20, 5.4, 1.2, 3.2, C.trim);
  // 旗杆(国旗)
  S.cyl(0, 8, -58, 0.2, 0.28, 16, C.silver, 6);
  S.box(2.4, 14.5, -58, 4.4, 2.9, 0.1, C.flagRed);
  // 人民大会堂(西)
  S.box(-105, 12, -10, 68, 24, 120, 0xd8cfbd);
  for (let i = -4; i <= 4; i++) S.cyl(-105 + i * 13, 2.6, 52, 1.1, 1.1, 5.2, C.trim, 8);
  S.hipRoof(-105, 24, -10, 74, 126, 2.5, 0xcabfa8, 0.85, 0, 1);
  // 国家博物馆(东)
  S.box(105, 11, 0, 62, 22, 130, 0xcfc6b4);
  for (let i = -5; i <= 5; i++) S.cyl(105 + i * 10.5, 2.4, -62, 0.9, 0.9, 4.8, C.trim, 8);
  S.hipRoof(105, 22, 0, 68, 136, 2.2, 0xbfb49c, 0.85, 0, 1);
  // 广场绿化带
  for (const sx of [-1, 1]) {
    S.box(sx * 52, 0.6, 40, 8, 0.5, 100, C.grass);
  }
  return {
    footprints: [
      { x: -105, z: -10, hw: 34, hd: 60, h: 26 },
      { x: 105, z: 0, hw: 31, hd: 65, h: 24 },
      { x: 0, z: -20, hw: 7, hd: 7, h: 2 },
    ],
    trees: [], radius: 130,
  };
}

// ======================== 扩展地标(五环大城市) ========================

function zhengyangmen(S, G, W, rnd) {
  // 正阳门城楼
  S.box(0, 4.5, 0, 46, 9, 18, C.redWall);
  for (let i = -1; i <= 1; i++) S.box(i * 13, 3, 9.2, 4, 6, 0.8, 0x3a1512);
  S.box(0, 11.5, 0, 36, 5, 13, C.redWall);
  S.hipRoof(0, 14, 0, 40, 16, 3, C.goldRoof, 0.55, 0, 1);
  for (const sx of [-1, 1]) S.box(sx * 19, 16.4, 0, 1, 1.4, 1, C.goldRoof);
  // 正阳门箭楼
  S.box(0, 4, 48, 34, 8, 13, 0x8f8a80);
  for (let i = -3; i <= 3; i++) for (let j = 0; j < 2; j++) {
    S.box(i * 4.4, 3 + j * 2.6, 54.7, 1.2, 1.6, 0.5, 0x2e2620);
  }
  S.box(0, 9.5, 48, 26, 4.5, 10, 0x8f8a80);
  S.hipRoof(0, 12, 48, 30, 13, 2.6, 0x565b63, 0.5, 0, 0.8);
  return { footprints: [{ x: 0, z: 0, hw: 23, hd: 9, h: 18 }, { x: 0, z: 48, hw: 17, hd: 7, h: 16 }], trees: [], radius: 50 };
}

function yongdingmen(S, G, W, rnd) {
  S.box(0, 4, 0, 34, 8, 14, C.redWall);
  S.box(0, 2.8, 7.2, 4.4, 5.6, 0.8, 0x3a1512);
  S.box(0, 10.5, 0, 26, 5, 10, C.redWall);
  S.hipRoof(0, 13, 0, 30, 13, 2.8, 0x6a7480, 0.5, 0, 0.8);
  for (const sx of [-1, 1]) { // 两侧残城墙
    S.box(sx * 40, 2.2, 0, 44, 4.4, 6, 0x9d968a);
    S.box(sx * 40, 4.6, 0, 45, 0.7, 7.2, 0x6d6459);
  }
  return { footprints: [{ x: 0, z: 0, hw: 17, hd: 7, h: 17 }, { x: -40, z: 0, hw: 22, hd: 3.6, h: 5 }, { x: 40, z: 0, hw: 22, hd: 3.6, h: 5 }], trees: [], radius: 45 };
}

function ncdt(S, G, W, rnd) {
  // 国家大剧院"湖上明珠":人工湖 + 钛金属穹顶 + 玻璃门厅
  W.box(0, 0.15, 10, 200, 0.5, 160, C.water);
  S.box(0, 0.1, 10, 208, 0.3, 168, C.shore);
  S.ellipsoid(0, 4, 10, 55, 26, 40, 0x99a3ab);
  S.ellipsoid(0, 4.3, 10, 53.5, 25, 38.6, 0x8a959c);
  S.box(0, 6, 44, 56, 11, 8, 0x2b3a44);      // 南侧玻璃入口
  S.box(0, 12, 46.5, 44, 5, 1.6, 0x3f5260);
  for (let i = -2; i <= 2; i++) S.box(i * 16, 27 - Math.abs(i) * 3.2, 10 - Math.abs(i) * 6, 2, 2, 2, 0xe8ecef); // 天窗
  return { footprints: [{ x: 0, z: 10, hw: 55, hd: 40, h: 30 }], trees: [], radius: 70 };
}

function citic(S, G, W, rnd) {
  // 中国尊:尊形收分塔身
  S.box(0, 3, 0, 36, 6, 36, C.concrete);
  const prof = [[26, 6], [23, 22], [20.5, 38], [18.5, 54], [17, 70], [16.5, 86], [17.5, 102], [19, 116], [21, 130], [22.5, 144]];
  for (let i = 0; i < prof.length - 1; i++) {
    const [w1, y1] = prof[i], [w2, y2] = prof[i + 1];
    S.box(0, (y1 + y2) / 2 + 0.2, 0, (w1 + w2) / 2, y2 - y1 + 0.3, (w1 + w2) / 2, i % 2 ? 0x4f8fa8 : 0x5496ae);
  }
  S.box(0, 75, 13.2, 18, 70, 1.2, 0x2f5a6e);  // 竖向玻璃棱
  S.hipRoof(0, 145, 0, 24, 24, 7, 0x2f5a6e, 0.22);
  S.cyl(0, 158, 0, 0.4, 1.2, 18, C.silver, 6);
  return { footprints: [{ x: 0, z: 0, hw: 18, hd: 18, h: 150 }], trees: [], radius: 55 };
}

function wangjingSOHO(S, G, W, rnd) {
  // 望京SOHO:三座扭转塔
  const towers = [
    { x: -30, z: 14, h: 88, c: 0xa8c4cc },
    { x: 32, z: 18, h: 72, c: 0x9db8c0 },
    { x: 1, z: -26, h: 60, c: 0xb3ccd2 },
  ];
  for (const t of towers) {
    const tiers = 5;
    let y = 0, twist = 0;
    for (let i = 0; i < tiers; i++) {
      const th = t.h / tiers;
      const w = 24 * (1 - i * 0.13);
      S.box(t.x, y + th / 2, t.z, w, th, w * 0.82, t.c, twist);
      S.box(t.x, y + th / 2, t.z + w * 0.42, w * 0.9, th * 0.94, 0.8, 0x6d94a4, twist);
      y += th; twist += 0.14;
    }
    S.hipRoof(t.x, y, t.z, 10, 9, 4, 0x7fa2b0, 0.3, twist);
  }
  S.box(0, 0.3, 6, 90, 0.6, 70, C.concrete);
  return { footprints: towers.map((t) => ({ x: t.x, z: t.z, hw: 13, hd: 11, h: t.h })), trees: [], radius: 65 };
}

function iceribbon(S, G, W, rnd) {
  // 冰丝带·国家速滑馆:白色椭球场馆 + 环绕冰丝带
  S.box(0, 0.2, 0, 150, 0.4, 105, C.concrete);
  S.ellipsoid(0, 5, 0, 62, 13, 44, 0xe8ecef);
  S.ellipsoid(0, 5.4, 0, 57, 11.5, 40, 0xdfe6ea);
  S.ellipsoid(0, 6, 0, 50, 9, 34, 0x9fc4d8); // 内场冰面蓝
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const px = Math.cos(a) * 66, pz = Math.sin(a) * 48;
    S.slopeBox(px, 14 + (i % 3) * 2.2, pz, 1.6, 26, 1.6, 0x9fd8e8, -a + (i % 2 ? 0.32 : -0.32), (i % 3 - 1) * 0.16);
  }
  return { footprints: [{ x: 0, z: 0, hw: 64, hd: 46, h: 18 }], trees: [], radius: 60 };
}

const _torus = () => new THREE.TorusGeometry(3.2, 0.55, 6, 18).toNonIndexed();
function olytower(S, G, W, rnd) {
  // 奥林匹克塔"大钉子" + 五环标志
  S.cyl(0, 4, 0, 16, 18, 8, C.concrete, 12);
  S.cyl(0, 38, 0, 3.4, 6.2, 62, 0xc7d6df, 10);
  S.cyl(0, 82, 0, 3, 3, 30, 0xd7dde2, 8);
  S.cyl(0, 102, 0, 8.5, 8.5, 6, 0x9db6c4, 10);
  S.cyl(0, 109, 0, 6, 7.4, 4.5, 0xc7d6df, 8);
  S.cyl(0, 128, 0, 0.6, 2.2, 30, 0xd0dde5, 6);
  const T = _torus();
  S.mergeGeometry(T, 0x3f6fd9, -7.4, 121, 0);
  S.mergeGeometry(T, 0x23262b, 0, 123.6, 0);
  S.mergeGeometry(T, 0xd9503f, 7.4, 121, 0);
  S.mergeGeometry(T, 0xe8b33a, -3.7, 118.6, 0);
  S.mergeGeometry(T, 0x5aa86b, 3.7, 118.6, 0);
  return { footprints: [{ x: 0, z: 0, hw: 12, hd: 12, h: 112 }], trees: [], radius: 45 };
}

function summerPalace(S, G, W, rnd) {
  // 颐和园:昆明湖 + 万寿山 + 佛香阁 + 十七孔桥
  W.box(0, 0.1, 40, 320, 0.5, 240, C.water);
  S.box(0, 0.05, 40, 330, 0.2, 250, C.shore);
  // 万寿山(两层土坡)
  S.cyl(0, 0, -80, 105, 128, 18, 0x6e9c4a, 9);
  S.cyl(0, 15, -86, 66, 88, 15, 0x76a551, 9);
  // 石阶与排云殿
  S.box(0, 3, -46, 34, 6, 42, C.whiteMarble);
  S.box(0, 9, -66, 24, 9, 38, C.whiteMarble);
  S.box(0, 15, -62, 28, 5, 12, C.redWall);
  S.hipRoof(0, 17.5, -62, 32, 14, 2.4, C.goldRoof, 0.5, 0, 0.8);
  // 佛香阁(三层四方塔阁)
  let y = 22;
  for (const [w, rh] of [[20, 3], [16, 2.7], [12, 2.5]]) {
    S.cyl(0, y + 1.6, -84, w / Math.SQRT2, w / Math.SQRT2, 3.2, C.redWall, 4, Math.PI / 4);
    S.hipRoof(0, y + 3.2, -84, w + 6, w + 6, rh, C.goldRoof, 0.35);
    y += 5.6;
  }
  S.cyl(0, y + 1.5, -84, 0.3, 0.7, 3, C.goldRoof, 6);
  // 十七孔桥 + 南湖岛
  S.box(58, 1, 92, 70, 1.6, 8, 0xd6d0c4);
  for (let i = 0; i < 17; i++) {
    const px = 58 - 32.5 + i * 4.06;
    for (const sz of [-1, 1]) {
      S.box(px, 2.2, 92 + sz * 4, 0.6, 1.4, 0.6, C.whiteMarble);
      S.ico(px, 3, 92 + sz * 4, 0.34, 0xe8e5de, 0);
    }
  }
  S.cyl(96, 0.6, 92, 12, 14, 1.4, 0x76a551, 8);
  for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) {
    S.box(96 + dx, 2.4, 92 + dz, 0.4, 2.4, 0.4, C.redWall);
  }
  S.hipRoof(96, 3.6, 92, 7, 7, 2, 0x3f6f5b, 0.35);
  // 知春亭一带柳树
  const trees = [];
  for (let i = 0; i < 10; i++) trees.push({ x: -150 + (i * 31) % 300, z: 130 + (i % 4) * 28, variant: 'willow' });
  return {
    footprints: [{ x: 0, z: -70, hw: 40, hd: 34, h: 30 }, { x: 96, z: 92, hw: 12, hd: 12, h: 6 }],
    trees, radius: 190,
  };
}

function boyata(S, G, W, rnd) {
  // 北大博雅塔 + 未名湖
  W.box(0, 0.1, 46, 150, 0.5, 120, C.water);
  S.box(0, 0.05, 46, 158, 0.2, 128, C.shore);
  let w = 8, y = 0;
  for (let i = 0; i < 11; i++) {
    S.box(0, y + 1.5, 0, w, 3, w, 0x9d968a);
    S.box(0, y + 3.1, 0, w + 1.8, 0.55, w + 1.8, 0x6d6459);
    y += 3.4; w *= 0.925;
  }
  S.cyl(0, y + 1.2, 0, 0.25, 0.6, 2.4, C.trim, 6);
  const trees = [];
  for (let i = 0; i < 8; i++) trees.push({ x: -70 + (i * 37) % 140, z: 110 + (i % 3) * 22, variant: i % 2 ? 'willow' : 'broadleaf' });
  return { footprints: [{ x: 0, z: 0, hw: 5.5, hd: 5.5, h: 40 }], trees, radius: 90 };
}

function yonghegong(S, G, W, rnd) {
  // 雍和宫:中轴五重殿宇(红墙黄/绿琉璃)
  const hall = (hz, hw, hh, roofC, big = false) => {
    S.box(0, hh / 2 + 1.2, hz, hw, hh, 12, C.redWall);
    S.hipRoof(0, hh + 1.2, hz, hw + 3, 15, 2.6, roofC, 0.5, 0, big ? 1.2 : 0.8);
    S.box(0, 0.6, hz, hw + 8, 1.2, 20, C.concrete);
  };
  S.box(0, 3, 52, 24, 6, 8, C.redWall);            // 山门
  S.hipRoof(0, 6, 52, 28, 12, 2.2, 0x565b63, 0.5);
  hall(26, 16, 4.5, 0x3f6f5b);                     // 天王殿(绿琉璃)
  hall(0, 24, 6.5, C.goldRoof, true);              // 雍和宫大殿
  hall(-26, 18, 5.5, C.goldRoof);                  // 永佑殿
  hall(-52, 20, 6, 0x3f6f5b, true);                // 法轮殿
  for (const sx of [-1, 1]) {
    for (const hz of [26, 0, -26, -52]) {
      S.box(sx * 34, 2.6, hz, 16, 5.2, 10, C.redWall);
      S.hipRoof(sx * 34, 5.2, hz, 19, 12, 1.8, C.goldRoofDeep, 0.5, 0, 0.6);
    }
  }
  S.cyl(0, 2, 12, 1.4, 1.6, 4, 0x8a6a2a, 8);       // 铜鼎
  return {
    footprints: [
      { x: 0, z: 0, hw: 14, hd: 60, h: 10 },
      { x: -34, z: -13, hw: 9, hd: 42, h: 8 },
      { x: 34, z: -13, hw: 9, hd: 42, h: 8 },
    ],
    trees: [{ x: -50, z: 60, variant: 'conifer' }, { x: 50, z: 60, variant: 'conifer' }, { x: -50, z: -70, variant: 'conifer' }, { x: 50, z: -70, variant: 'conifer' }],
    radius: 85,
  };
}

function beijingzhan(S, G, W, rnd) {
  // 北京站:主楼 + 中央钟塔
  S.box(0, 8, 0, 120, 16, 44, 0xd8cfbd);
  S.box(0, 8.2, 22.3, 110, 0.9, 1, C.trim);       // 檐口线
  S.box(0, 17, 0, 15, 18, 15, 0xd8cfbd);          // 钟塔
  S.hipRoof(0, 26, 0, 18, 18, 3.4, 0x565b63, 0.4, 0, 0.6);
  for (const [dx, dz, ry] of [[0, 7.8, 0], [0, -7.8, Math.PI], [7.8, 0, Math.PI / 2], [-7.8, 0, -Math.PI / 2]]) {
    S.box(dx, 22, dz, 5.6, 5.6, 0.4, 0xf2f0ea, ry); // 钟面
    S.box(dx * 1.06, 23, dz * 1.06, 0.5, 1.8, 0.12, 0x23262b, ry);
    S.box(dx * 1.06, 22.4, dz * 1.06, 1.2, 0.4, 0.12, 0x23262b, ry);
  }
  for (const sx of [-1, 1]) {
    S.box(sx * 54, 12, 0, 10, 24, 14, 0xd8cfbd);
    S.hipRoof(sx * 54, 24, 0, 13, 16, 2.6, 0x565b63, 0.4, 0, 0.5);
  }
  for (let i = -5; i <= 5; i++) S.box(i * 10, 5, 22.6, 1, 8, 1, 0xe3e0d6);
  S.box(0, 0.3, 34, 120, 0.6, 24, C.concrete);
  return { footprints: [{ x: 0, z: 0, hw: 60, hd: 22, h: 30 }], trees: [], radius: 75 };
}

function southStation(S, G, W, rnd) {
  // 北京南站:椭圆形穹顶主站房 + 站台雨棚
  S.box(0, 1, 20, 170, 2, 120, 0xcfd2d6);
  S.ellipsoid(0, 5, 20, 80, 25, 52, 0x9aa8b2);
  S.ellipsoid(0, 5.4, 20, 76, 23, 48, 0x8d9ba5);
  S.ellipsoid(0, 6, 20, 68, 19, 42, 0x7fb3c8);    // 玻璃天窗带
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    S.slopeBox(Math.cos(a) * 78, 8, 20 + Math.sin(a) * 50, 1.2, 16, 1.2, 0xd7dde2, -a, 0.3);
  }
  S.box(0, 7, -70, 130, 1.6, 100, 0xb9c2c9);      // 轨道雨棚
  for (let i = -3; i <= 3; i++) for (let j = -1; j <= 1; j++) {
    S.cyl(i * 19, 3.5, -70 + j * 40, 0.6, 0.6, 7, C.steel, 6);
  }
  return { footprints: [{ x: 0, z: 20, hw: 80, hd: 52, h: 30 }, { x: 0, z: -70, hw: 65, hd: 50, h: 9 }], trees: [], radius: 100 };
}

function westStation(S, G, W, rnd) {
  // 北京西站:门式主站房 + 中央钟楼与双亭
  S.box(0, 11, 0, 120, 22, 42, 0xd3cbb8);
  S.box(0, 11, 21.4, 110, 12, 1, 0x3f5260);       // 玻璃幕
  S.box(0, 26, 0, 24, 30, 24, 0xd3cbb8);          // 中央塔
  S.hipRoof(0, 41, 0, 28, 28, 6, C.goldRoofDeep, 0.45, 0, 1.2);
  S.box(0, 33, 12.3, 5.5, 5.5, 0.4, 0xf2f0ea);    // 钟
  for (const sx of [-1, 1]) {
    S.box(sx * 60, 17, 0, 12, 12, 14, 0xd3cbb8);
    S.hipRoof(sx * 60, 23, 0, 15, 16, 3.4, C.goldRoof, 0.4, 0, 0.8);
  }
  S.box(0, 0.3, 36, 120, 0.6, 28, C.concrete);
  return { footprints: [{ x: 0, z: 0, hw: 60, hd: 21, h: 46 }], trees: [], radius: 80 };
}

function art798(S, G, W, rnd) {
  // 798 艺术区:红砖锯齿厂房 + 烟囱 + 管廊 + 雕塑
  for (let k = 0; k < 3; k++) {
    const bx = -46 + k * 46;
    S.box(bx, 5, 0, 36, 10, 26, 0xa05c4a);
    for (let j = 0; j < 4; j++) {
      S.slopeBox(bx - 13.5 + j * 9, 11.6, 0, 9, 3, 26, j % 2 ? 0x9fc4d8 : 0xb0543f, 0, 0.5);
    }
    S.box(bx, 5, 13.5, 36, 8, 1.4, 0x8f4f3f);
  }
  S.cyl(72, 22, 28, 3.2, 4.4, 44, 0xb0413e, 8);   // 烟囱
  S.cyl(72, 30, 28, 3.4, 3.4, 4, 0xf2f0ea, 8);
  S.slopeBox(0, 9.5, 24, 120, 0.9, 0.9, C.steel, 0, 0);   // 管廊
  for (let i = -2; i <= 2; i++) S.cyl(i * 30, 4.8, 24, 0.5, 0.5, 9.4, C.steel, 6);
  S.ico(-10, 6, 44, 3.4, 0xd9503f, 0);            // 红色雕塑
  S.slopeBox(18, 5, 44, 6, 0.8, 6, 0x3f6fd9, 0.6, 0.5);
  S.box(-40, 2.4, 60, 16, 4.8, 4, 0xe8b33a);      // 集装箱咖啡
  S.box(40, 2.4, 60, 16, 4.8, 4, 0x5aa86b);
  return { footprints: [{ x: -46, z: 0, hw: 19, hd: 14, h: 13 }, { x: 0, z: 0, hw: 19, hd: 14, h: 13 }, { x: 46, z: 0, hw: 19, hd: 14, h: 13 }, { x: 72, z: 28, hw: 4.5, hd: 4.5, h: 45 }], trees: [], radius: 75 };
}

function shougang(S, G, W, rnd) {
  // 首钢园:双冷却塔 + 冬奥大跳台
  const tower = (tx) => {
    const prof = [[17, 0], [14.5, 14], [12.8, 28], [13.2, 42], [15, 54]];
    for (let i = 0; i < prof.length - 1; i++) {
      const [r1, y1] = prof[i], [r2, y2] = prof[i + 1];
      S.cyl(tx, (y1 + y2) / 2, 0, r2, r1, y2 - y1 + 0.4, 0xb9bcc0, 12);
    }
    S.cyl(tx, 55, 0, 15.5, 15.5, 2, 0xc9ccd0, 12);
  };
  tower(-28); tower(34);
  // 大跳台(首钢滑雪大跳台"水晶鞋")
  S.box(-62, 20, -18, 9, 40, 9, 0xd7dde2);        // 起跳塔
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const px = -58 + t * 78;
    const py = 40 - t * t * 36 - t * 2;
    S.slopeBox(px, py, -18, 14, 1.8, 11, i < 3 ? 0xd9503f : 0xe8ecef, 0.1, -Math.atan((40 - t * 38 - (40 - (t + 0.16) * 38)) / 12.5) * 0.6);
  }
  S.box(28, 4, -18, 30, 8, 16, 0xd7dde2);         // 落地区看台
  S.box(0, 0.2, 20, 150, 0.4, 60, 0x9aa0a8);      // 园区广场
  return { footprints: [{ x: -28, z: 0, hw: 17, hd: 17, h: 56 }, { x: 34, z: 0, hw: 17, hd: 17, h: 56 }, { x: -62, z: -18, hw: 5, hd: 5, h: 40 }], trees: [], radius: 85 };
}

function daxing(S, G, W, rnd) {
  // 大兴机场"凤凰展翅":中央放射 + 五指廊
  S.box(0, 0.25, 0, 260, 0.5, 260, 0xb9bcc0);
  S.cyl(0, 4, 0, 38, 44, 8, 0xd9c9a8, 10);        // 中心航站楼
  S.cyl(0, 8.3, 0, 40, 42, 1.2, 0xc9b48a, 10);
  S.ellipsoid(0, 9, 0, 30, 4, 30, 0x9fc4d8);      // 顶部天窗
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.6;
    const px = Math.cos(a) * 88, pz = Math.sin(a) * 88;
    S.box(px, 3.5, pz, 95, 6.5, 24, 0xd9c9a8, -a);
    S.box(px, 3.5, pz, 95, 2.4, 25.2, 0xc9b48a, -a);
    const gx = Math.cos(a) * 140, gz = Math.sin(a) * 140;
    S.box(gx, 2.5, gz, 20, 5, 14, 0xcfd2d6, -a);
  }
  for (let k = 0; k < 5; k++) {                    // 尾部尖翼
    const a = (k / 5) * Math.PI * 2 + 0.6 + Math.PI / 5 * 1.02;
    const px = Math.cos(a) * 60, pz = Math.sin(a) * 60;
    S.box(px, 3, pz, 46, 5, 14, 0xd9c9a8, -a);
  }
  return { footprints: [{ x: 0, z: 0, hw: 46, hd: 46, h: 11 }], trees: [], radius: 150 };
}

function luguqiao(S, G, W, rnd) {
  // 卢沟桥 + 宛平城
  W.box(0, 0, 0, 70, 0.5, 210, C.water);          // 永定河
  S.box(0, 0.05, 0, 78, 0.2, 218, C.shore);
  S.box(0, 2.6, 0, 100, 1.8, 11, 0xd6d0c4);       // 桥身
  for (let i = 0; i < 10; i++) {
    S.box(-45 + i * 10, 1.6, 0, 8, 2.2, 10.4, 0xc9c2b4);
    S.box(-45 + i * 10, 1.6, 0, 8.4, 1.7, 10.8, 0x9d968a);
  }
  for (let i = 0; i < 19; i++) {
    const px = -47.5 + i * 5.27;
    for (const sz of [-1, 1]) {
      S.box(px, 3.9, sz * 5.6, 0.7, 1.6, 0.7, C.whiteMarble);
      S.ico(px, 4.8, sz * 5.6, 0.4, 0xe8e5de, 0); // 石狮
    }
  }
  // 宛平城(东南角)
  S.box(85, 4, 70, 8, 8, 96, 0x9d968a);           // 西墙
  S.box(128, 4, 70, 8, 8, 96, 0x9d968a);          // 东墙
  S.box(106, 4, 118, 44, 8, 8, 0x9d968a);         // 北墙
  S.box(106, 4, 22, 44, 8, 8, 0x9d968a);          // 南墙
  S.box(128, 8.5, 70, 14, 4.5, 10, 0x8f8a80);     // 城门楼
  S.hipRoof(128, 10.7, 70, 16, 12, 2, 0x565b63, 0.5);
  return {
    footprints: [
      { x: 0, z: 0, hw: 50, hd: 6, h: 4 },
      { x: 85, z: 70, hw: 4, hd: 48, h: 8 }, { x: 128, z: 70, hw: 7, hd: 48, h: 13 },
      { x: 106, z: 118, hw: 22, hd: 4, h: 8 }, { x: 106, z: 22, hw: 22, hd: 4, h: 8 },
    ],
    trees: [], radius: 90,
  };
}

function miaoying(S, G, W, rnd) {
  // 妙应寺白塔(元大都白塔)
  S.box(0, 3, 30, 22, 6, 13, C.redWall);
  S.hipRoof(0, 6, 30, 26, 16, 2.4, 0x565b63, 0.5);
  S.box(0, 1.2, 0, 18, 2.4, 18, C.whiteMarble);
  S.lathe([
    { r: 6.5, y: 2 }, { r: 8.2, y: 6 }, { r: 8.8, y: 12 }, { r: 7.2, y: 16.5 },
    { r: 5, y: 20 }, { r: 3, y: 22.5 }, { r: 1.4, y: 24.5 },
  ], 0, 0, 0, 0xf2f0ea, 1, 14);
  for (let i = 0; i < 6; i++) S.cyl(0, 26 + i * 1, 0, 1.7 - i * 0.24, 1.7 - i * 0.24, 0.5, C.goldRoof, 8);
  S.ico(0, 33, 0, 0.7, C.goldRoof, 0);
  return { footprints: [{ x: 0, z: 0, hw: 9, hd: 9, h: 30 }], trees: [], radius: 40 };
}

export const LANDMARKS = {
  tiananmen: { name: '天安门', build: tiananmen, labelY: 28 },
  gugong: { name: '故宫', build: gugong, labelY: 30 },
  tiantan: { name: '天坛·祈年殿', build: tiantan, labelY: 30 },
  square: { name: '天安门广场', build: square, labelY: 22 },
  jingshan: { name: '景山', build: jingshan, labelY: 55 },
  gulou: { name: '鼓楼', build: gulou, labelY: 20 },
  zhonglou: { name: '钟楼', build: (S, G, W, rnd) => gulou(S, G, W, rnd, true), labelY: 20 },
  niaochao: { name: '国家体育场·鸟巢', build: niaochao, labelY: 36 },
  shuilifang: { name: '国家游泳中心·水立方', build: shuilifang, labelY: 28 },
  cctv: { name: '央视大楼', build: cctv, labelY: 125 },
  guomao: { name: '国贸中心', build: guomao, labelY: 112 },
  tvtower: { name: '中央广播电视塔', build: tvtower, labelY: 150 },
  baita: { name: '北海白塔', build: baita, labelY: 35 },
  // —— 扩展地标(五环大城市)——
  zhengyangmen: { name: '正阳门', build: zhengyangmen, labelY: 22 },
  yongdingmen: { name: '永定门', build: yongdingmen, labelY: 20 },
  ncdt: { name: '国家大剧院', build: ncdt, labelY: 34 },
  citic: { name: '中国尊·中信大厦', build: citic, labelY: 155 },
  wangjing: { name: '望京SOHO', build: wangjingSOHO, labelY: 95 },
  iceribbon: { name: '国家速滑馆·冰丝带', build: iceribbon, labelY: 24 },
  olytower: { name: '奥林匹克塔', build: olytower, labelY: 130 },
  summerPalace: { name: '颐和园·佛香阁', build: summerPalace, labelY: 48 },
  boyata: { name: '北大·博雅塔', build: boyata, labelY: 44 },
  yonghegong: { name: '雍和宫', build: yonghegong, labelY: 14 },
  beijingzhan: { name: '北京站', build: beijingzhan, labelY: 32 },
  southStation: { name: '北京南站', build: southStation, labelY: 32 },
  westStation: { name: '北京西站', build: westStation, labelY: 50 },
  art798: { name: '798艺术区', build: art798, labelY: 50 },
  shougang: { name: '首钢园', build: shougang, labelY: 62 },
  daxing: { name: '大兴国际机场', build: daxing, labelY: 18 },
  luguqiao: { name: '卢沟桥·宛平城', build: luguqiao, labelY: 12 },
  miaoying: { name: '妙应寺白塔', build: miaoying, labelY: 36 },
};

/**
 * 构建一个地标(局部坐标)。
 * 返回 { solid, glass, water, footprints, name, labelY, radius }
 */
export function buildLandmark(id) {
  const def = LANDMARKS[id];
  if (!def) throw new Error('未知地标: ' + id);
  const solid = new MeshBuilder();
  const glass = new MeshBuilder();
  const water = new MeshBuilder();
  const rnd = mulberry32(999);
  const res = def.build(solid, glass, water, rnd);
  return {
    solid, glass: glass.empty ? null : glass, water: water.empty ? null : water,
    footprints: res.footprints || [], trees: res.trees || [],
    name: def.name, labelY: def.labelY, radius: res.radius || 50,
  };
}
