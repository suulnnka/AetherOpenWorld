// OSM 真实地图 → 游戏地图 转换工具(三环内 · 1:4)
// 用法:
//   node tools/osm-import.mjs --fetch     # 逐片抓取 Overpass 数据(断点续抓)
//   node tools/osm-import.mjs --convert   # 逐片转换并合并 → data/maps/osm_ring3.json
//   node tools/osm-import.mjs --all       # 抓取 + 转换
// 方案详见 docs/osm-plan.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simplifyDP, polyArea, centroid, minRect, polylineLen } from '../public/js/poly.js';
import { LANDMARKS } from '../public/js/landmarks.js';
import { mulberry32, rngRange, rngInt } from '../public/js/rng.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE = path.join(ROOT, 'tools', 'osm-cache');
fs.mkdirSync(CACHE, { recursive: true });

// ---------- 参数(风格化补偿集中在此) ----------
const LON0 = 116.379, LAT0 = 39.9115;
const MX = 85300, MZ = 110800;          // 米/度
const SCALE = 4;                         // 1:4 —— 1 单位 = 4 米
const HEIGHT_K = 1.6;                    // 竖向夸张系数
const BBOX = { w: 116.288, s: 39.845, e: 116.470, n: 39.978 };
const COLS = 8, ROWS = 7;                // 56 片,每片 ~2.0×1.9 km
const ROAD_MIN_W = { major: 9, mid: 6, minor: 4 };
// 优先走本机 3000 端口服务的 Overpass 中转代理(网络更稳),失败再直连镜像
const MIRRORS = [
  'http://127.0.0.1:3000/api/osm-proxy',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const toWorld = (lat, lon) => [((lon - LON0) * MX) / SCALE, -(((lat - LAT0) * MZ) / SCALE)];

// 三环范围内的风格化地标(经纬度定位;名称命中 OSM 要素时用其质心覆盖)
const LM_TABLE = [
  ['gugong', 116.3972, 39.9163, ['故宫博物院', '故宫']],
  ['tiananmen', 116.3903, 39.9075, ['天安门']],
  ['square', 116.3905, 39.9020, ['天安门广场', '人民广场']],
  ['zhengyangmen', 116.3912, 39.8990, ['正阳门']],
  ['yongdingmen', 116.3935, 39.8744, ['永定门']],
  ['jingshan', 116.3972, 39.9250, ['景山公园', '景山']],
  ['gulou', 116.3978, 39.9405, ['鼓楼']],
  ['zhonglou', 116.3977, 39.9435, ['钟楼']],
  ['yonghegong', 116.4175, 39.9480, ['雍和宫']],
  ['miaoying', 116.3630, 39.9290, ['妙应寺', '白塔寺']],
  ['baita', 116.3890, 39.9280, ['北海公园', '北海']],
  ['tiantan', 116.4110, 39.8825, ['天坛公园', '祈年殿']],
  ['ncdt', 116.3805, 39.9040, ['国家大剧院']],
  ['cctv', 116.4560, 39.9180, ['中央电视台']],
  ['citic', 116.4620, 39.9130, ['中国尊', '中信大厦']],
  ['guomao', 116.4550, 39.9080, ['国贸', '中国国际贸易中心']],
  ['beijingzhan', 116.4270, 39.9030, ['北京站']],
];

// ---------- 抓取 ----------
async function fetchTile(cx, cy, retry = 3) {
  const file = path.join(CACHE, `tile_${cx}_${cy}.json`);
  if (fs.existsSync(file)) { console.log(`  [${cx},${cy}] 已缓存`); return; }
  const s = BBOX.s + ((BBOX.n - BBOX.s) * cy) / ROWS;
  const n = BBOX.s + ((BBOX.n - BBOX.s) * (cy + 1)) / ROWS;
  const w = BBOX.w + ((BBOX.e - BBOX.w) * cx) / COLS;
  const e = BBOX.w + ((BBOX.e - BBOX.w) * (cx + 1)) / COLS;
  const bb = `${s},${w},${n},${e}`;
  const query = `[out:json][timeout:240];(
    way["building"](${bb});
    way["highway"](${bb});
    way["natural"~"water|wetland"](${bb});
    relation["natural"="water"](${bb});
    way["leisure"~"park|garden"](${bb});
    relation["leisure"~"park|garden"](${bb});
    way["landuse"~"grass|forest|meadow"](${bb});
  );out geom qt;`;
  for (let attempt = 0; attempt < retry; attempt++) {
    for (const ep of MIRRORS) {
      try {
        const t0 = Date.now();
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 260000);
        const viaProxy = ep.startsWith('http://127.0.0.1');
        const r = await fetch(ep, {
          method: 'POST',
          headers: viaProxy
            ? { 'Content-Type': 'application/json' }
            : { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'lowpoly-beijing-map-tool/1.0' },
          body: viaProxy ? JSON.stringify({ query }) : 'data=' + encodeURIComponent(query),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        fs.writeFileSync(file, JSON.stringify(j));
        console.log(`  [${cx},${cy}] ${j.elements.length} 要素, ${((Date.now() - t0) / 1000).toFixed(1)}s (${ep.split('/')[2]})`);
        return;
      } catch (err) {
        console.log(`  [${cx},${cy}] ${ep.split('/')[2]} 失败: ${err.message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
  }
  console.log(`  [${cx},${cy}] ✗ 放弃(可重跑续抓)`);
}

async function fetchAll() {
  console.log('开始分片抓取 Overpass 数据(三环内 ' + COLS + '×' + ROWS + ' 片)…');
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      await fetchTile(cx, cy);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

// ---------- 转换 ----------
const ROAD_CLASS = {
  motorway: 'major', motorway_link: 'major', trunk: 'major', trunk_link: 'major',
  primary: 'major', primary_link: 'major',
  secondary: 'mid', secondary_link: 'mid', tertiary: 'mid', tertiary_link: 'mid',
  residential: 'minor', unclassified: 'minor', living_street: 'minor', pedestrian: 'minor',
};
const SKIP_HIGHWAY = new Set(['footway', 'path', 'steps', 'track', 'cycleway', 'service', 'proposed', 'construction', 'raceway', 'corridor']);

function collectFeatures() {
  const buildings = new Map();   // id → {pts, tags}
  const roads = new Map();
  const waters = new Map();
  const greens = new Map();
  const named = [];              // 命名要素(地标定位用)
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const file = path.join(CACHE, `tile_${cx}_${cy}.json`);
      if (!fs.existsSync(file)) { console.log(`  缺片 [${cx},${cy}],跳过`); continue; }
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const el of j.elements || []) {
        const key = el.type + '_' + el.id;
        if (el.type === 'way' && el.geometry) {
          const tags = el.tags || {};
          if (tags.building && el.geometry.length >= 4) buildings.set('w' + el.id, { pts: el.geometry, tags });
          else if (tags.highway && !SKIP_HIGHWAY.has(tags.highway)) roads.set('w' + el.id, { pts: el.geometry, tags });
          else if ((tags.natural === 'water' || tags.natural === 'wetland' || tags.waterway === 'riverbank') && el.geometry.length >= 4) waters.set('w' + el.id, { pts: el.geometry, tags });
          else if ((tags.leisure === 'park' || tags.leisure === 'garden' || /^(grass|forest|meadow)$/.test(tags.landuse || '')) && el.geometry.length >= 4) greens.set('w' + el.id, { pts: el.geometry, tags });
          if (tags.name) named.push({ name: tags.name, pts: el.geometry });
        } else if (el.type === 'relation' && el.members) {
          const tags = el.tags || {};
          for (const m of el.members) {
            if (m.type !== 'way' || !m.geometry || m.geometry.length < 4) continue;
            if (m.role && m.role !== 'outer') continue;
            if (tags.natural === 'water') waters.set('r' + el.id + '_' + m.ref, { pts: m.geometry, tags });
            else if (tags.leisure === 'park' || tags.leisure === 'garden') greens.set('r' + el.id + '_' + m.ref, { pts: m.geometry, tags });
          }
          if (tags.name) named.push({ name: tags.name, pts: el.members[0]?.geometry });
        }
      }
    }
  }
  return { buildings, roads, waters, greens, named };
}

function estimateLevels(tags, areaU, id, inCBD, inOldCity) {
  let lv;
  if (tags['building:levels']) lv = parseFloat(tags['building:levels']) || 2;
  else if (tags.height) lv = parseFloat(tags.height) / 3 || 2;
  else if (areaU < 14) lv = 2;
  else if (areaU < 90) lv = inOldCity ? 2.6 : 4;
  else if (areaU < 250) lv = 6;
  else if (areaU < 600) lv = 10;
  else lv = 14;
  const rnd = mulberry32(id >>> 0);
  lv *= rngRange(rnd, 0.9, 1.15);
  if (inCBD) lv *= 1.6;
  return Math.max(1, Math.min(46, Math.round(lv)));
}

function styleOf(lv, inOldCity) {
  if (lv <= 2) return inOldCity ? 'hutong' : 'oldcity';
  if (lv <= 6) return 'oldcity';
  if (lv <= 16) return 'modern';
  return 'tower';
}

async function convert() {
  console.log('合并分片并转换…');
  const { buildings, roads, waters, greens, named } = collectFeatures();
  console.log(`原始要素: 建筑 ${buildings.size} | 道路 ${roads.size} | 水面 ${waters.size} | 绿地 ${greens.size}`);

  // ---- 地标定位(表坐标 + 名称命中覆盖) ----
  const landmarks = [];
  const clearances = [];
  for (const [lm, lon, lat, names] of LM_TABLE) {
    let p = [lon, lat];
    const hit = named.find((n) => names.some((k) => n.name.includes(k)) && n.pts && n.pts.length >= 3);
    if (hit) {
      const c = [hit.pts.reduce((a, q) => a + q.lon, 0) / hit.pts.length, hit.pts.reduce((a, q) => a + q.lat, 0) / hit.pts.length];
      p = c;
    }
    const [x, z] = toWorld(p[1], p[0]);
    if (Math.abs(x) > 1780 || Math.abs(z) > 1780) continue;
    landmarks.push({ type: 'landmark', lm, x: +x.toFixed(1), z: +z.toFixed(1), ry: 0, s: 1 });
    const def = LANDMARKS[lm];
    clearances.push({ x, z, r: Math.max(60, (def?.radius || 60) * 0.9) });
  }
  const inClear = (x, z) => clearances.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);

  const elements = [];
  let nextId = 1;
  const add = (el) => { el.id = nextId++; elements.push(el); return el; };
  for (const l of landmarks) add(l);

  // ---- 建筑 ----
  const smalls = [];
  let bigCount = 0, dropped = 0;
  for (const [key, b] of buildings) {
    let pts = b.pts.map((g) => toWorld(g.lat, g.lon));
    if (pts.length >= 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5) pts = pts.slice(0, -1);
    if (pts.length < 3) { dropped++; continue; }
    pts = simplifyDP(pts, 0.8);
    if (pts.length < 3) { dropped++; continue; }
    while (pts.length > 12) pts = simplifyDP(pts, 1.3);
    if (pts.length < 3) { dropped++; continue; }
    const area = Math.abs(polyArea(pts));
    const [cx, cz] = centroid(pts);
    if (inClear(cx, cz)) { dropped++; continue; }
    const d = Math.max(Math.abs(cx), Math.abs(cz));
    const inner2 = d < 1000;
    const minA = inner2 ? 22 : 37;
    const idNum = (parseInt(key.replace(/\D/g, '')) || 1) >>> 0;
    if (area >= minA) {
      const inCBD = cx > 280 && cx < 520 && cz > -120 && cz < 260;
      const inOldCity = Math.abs(cx) < 420 && cz > -420 && cz < 420;
      const lv = estimateLevels(b.tags, area, idNum, inCBD, inOldCity);
      add({ type: 'bldg', x: +cx.toFixed(1), z: +cz.toFixed(1), p: pts.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]), lv, st: styleOf(lv, inOldCity) });
      bigCount++;
    } else {
      smalls.push({ x: cx, z: cz, w: 0, d: 0, pts, id: idNum, tags: b.tags });
    }
  }
  // ---- 小建筑聚簇(30u 网格,每格 ≤3 个合并矩形) ----
  const cells = new Map();
  for (const s of smalls) {
    const k = Math.floor(s.x / 30) + '_' + Math.floor(s.z / 30);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(s);
  }
  let clusterCount = 0;
  for (const [, list] of cells) {
    list.sort((a, b) => a.x - b.x);
    const runs = [[list[0]]];
    for (let i = 1; i < list.length; i++) {
      if (Math.abs(list[i].x - list[i - 1].x) > 9 && runs.length < 3) runs.push([list[i]]);
      else runs[runs.length - 1].push(list[i]);
    }
    const d = Math.max(Math.abs(list[0].x), Math.abs(list[0].z));
    const inner2 = d < 1000;
    for (const run of runs) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const s of run) {
        x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x);
        z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z);
      }
      const w = Math.max(2.4, x1 - x0 + 3), dd = Math.max(2.4, z1 - z0 + 3);
      const area = w * dd;
      if (area < (inner2 ? 5 : 12)) { dropped++; continue; }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (inClear(cx, cz)) continue;
      const inOldCity = Math.abs(cx) < 420 && cz > -420 && cz < 420;
      const lv = estimateLevels({}, area, run[0].id, false, inOldCity);
      add({ type: 'bldg', x: +cx.toFixed(1), z: +cz.toFixed(1), rect: [+cx.toFixed(1), +cz.toFixed(1), +w.toFixed(1), +dd.toFixed(1)], lv, st: styleOf(lv, inOldCity) });
      clusterCount++;
    }
  }

  // ---- 道路 ----
  const roadOut = [];
  let roadIdx = 0;
  for (const [, r] of roads) {
    const cls = ROAD_CLASS[r.tags.highway];
    if (!cls) continue;
    let pts = r.pts.map((g) => toWorld(g.lat, g.lon)).filter((p) => Math.abs(p[0]) < 1850 && Math.abs(p[1]) < 1850);
    if (pts.length < 2) continue;
    pts = simplifyDP(pts, 1.2, false);
    if (pts.length < 2 || polylineLen(pts) < 12) continue;
    const [cx, cz] = centroid(pts);
    if (Math.abs(cx) > 1800 || Math.abs(cz) > 1800) continue;
    if (cls !== 'major' && inClear(cx, cz)) continue;
    let w = ROAD_MIN_W[cls];
    if (r.tags.width) w = Math.max(w, parseFloat(r.tags.width) / SCALE);
    if (r.tags.lanes) w = Math.max(w, (parseFloat(r.tags.lanes) || 2) * 0.95);
    roadOut.push({ c: cls, w: +w.toFixed(1), i: roadIdx++, p: pts.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]) });
  }

  // ---- 水面 / 绿地 ----
  let waterCount = 0, greenCount = 0;
  for (const [, w] of waters) {
    let pts = w.pts.map((g) => toWorld(g.lat, g.lon));
    if (pts.length >= 4 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5) pts = pts.slice(0, -1);
    pts = simplifyDP(pts, 2);
    if (pts.length < 3 || Math.abs(polyArea(pts)) < 150) continue;
    const [cx, cz] = centroid(pts);
    if (Math.abs(cx) > 1800 || Math.abs(cz) > 1800) continue;
    add({ type: 'waterPoly', x: +cx.toFixed(1), z: +cz.toFixed(1), p: pts.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]) });
    waterCount++;
  }
  for (const [, g] of greens) {
    let pts = g.pts.map((q) => toWorld(q.lat, q.lon));
    if (pts.length >= 4 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5) pts = pts.slice(0, -1);
    pts = simplifyDP(pts, 2);
    if (pts.length < 3 || Math.abs(polyArea(pts)) < 260) continue;
    const [cx, cz] = centroid(pts);
    if (Math.abs(cx) > 1800 || Math.abs(cz) > 1800) continue;
    add({ type: 'green', x: +cx.toFixed(1), z: +cz.toFixed(1), p: pts.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]) });
    greenCount++;
  }

  // ---- 输出 ----
  const map = {
    format: 2,
    name: '北京 · 三环内(OSM 1:4)',
    settings: {
      world: 3600,
      seed: 20261028,
      rings: [],
      avenue: null,
      groundStyle: 'terrain',
      roads: roadOut,
      terrain: { seed: 20261028, amplitude: 1.2, mountains: true, style: 'urban' },
      nextId,
    },
    elements,
  };
  const doc = { id: 'osm_ring3', name: map.name, updatedAt: new Date().toISOString(), data: map };
  const out = path.join(ROOT, 'data', 'maps', 'osm_ring3.json');
  fs.writeFileSync(out, JSON.stringify(doc));
  const types = elements.reduce((a, e) => { a[e.type] = (a[e.type] || 0) + 1; return a; }, {});
  console.log(`\n转换完成 → ${path.relative(ROOT, out)}`);
  console.log(`元素: ${JSON.stringify(types)}`);
  console.log(`建筑: 独立多边形 ${bigCount} + 聚簇矩形 ${clusterCount}(丢弃 ${dropped})`);
  console.log(`道路: ${roadOut.length} 条 | 水面: ${waterCount} | 绿地: ${greenCount} | 地标: ${landmarks.length}`);
  console.log(`JSON 体积: ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
}

// ---------- CLI ----------
const mode = process.argv[2] || '--all';
if (mode === '--fetch') await fetchAll();
else if (mode === '--convert') await convert();
else if (mode === '--all') { await fetchAll(); await convert(); }
else console.log('用法: node tools/osm-import.mjs --fetch | --convert | --all');
