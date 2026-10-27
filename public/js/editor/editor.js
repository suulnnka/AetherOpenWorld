// 地图编辑器 — 街区/大楼/树木/公园/水域/地标/地形 全套生成工具 + 存读档
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { City } from '../city.js';
import { generateDemoCity, emptyMap } from '../demo-city.js';
import { LANDMARKS } from '../landmarks.js';
import { TREE_VARIANTS } from '../generators/tree.js';
import { newSeed, mulberry32, rngRange } from '../rng.js';

const $ = (s) => document.querySelector(s);

// ---------------- 渲染基础 ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
$('#viewport').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9db8cc);
scene.fog = new THREE.Fog(0x9db8cc, 700, 3000);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 8000);
camera.position.set(420, 380, 520);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.48;
controls.minDistance = 20;
controls.maxDistance = 1800;
controls.mouseButtons.LEFT = null; // 左键留给编辑工具,右键平移/滚轮缩放

scene.add(new THREE.HemisphereLight(0xcfe4f2, 0x8a9a6a, 0.85));
const sun = new THREE.DirectionalLight(0xfff0d6, 1.5);
sun.position.set(200, 300, 120);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.near = 10; sc.far = 1200; sc.left = -350; sc.right = 350; sc.top = 350; sc.bottom = -350;
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

const gridHelper = new THREE.GridHelper(2400, 24, 0x4a5866, 0x33404c);
gridHelper.position.y = 0.2;
gridHelper.visible = false;
scene.add(gridHelper);

// ---------------- 状态 ----------------
let map = emptyMap();
let city = null;
let currentMapId = null;
let dirty = false;
const state = {
  tool: 'select',
  selected: null,       // 选中的元素
  snap: true,
  painting: false,
  dragging: null,       // { el, home:{x,z}, entry }
  ghost: null,
  undoStack: [],
};

const TOOL_DEFS = {
  select: { name: '选择 / 移动', hint: '左键点击元素选中并拖动移动 · Delete 删除 · R 旋转15° · Esc 取消 · 右键拖动平移视图' },
  block: {
    name: '街区生成器',
    hint: '点击地面放置街区(自动对齐 110m 街区网格,含楼群/人行道/行道树)',
    params: [
      { k: 'w', label: '街区尺寸', type: 'range', min: 60, max: 130, step: 2, def: 84 },
      { k: 'style', label: '风格', type: 'select', def: 'auto', options: [['auto', '自动混合'], ['hutong', '胡同平房'], ['oldcity', '老城多层'], ['modern', '现代高层'], ['cbd', 'CBD 塔楼']] },
      { k: 'density', label: '建筑密度', type: 'range', min: 0.3, max: 1, step: 0.05, def: 0.8 },
    ],
  },
  building: {
    name: '大楼生成器',
    hint: '点击地面放置单体建筑 · 可调风格/层数/朝向',
    params: [
      { k: 'w', label: '宽度', type: 'range', min: 10, max: 60, step: 2, def: 24 },
      { k: 'd', label: '进深', type: 'range', min: 10, max: 60, step: 2, def: 18 },
      { k: 'floors', label: '层数', type: 'range', min: 1, max: 60, step: 1, def: 12 },
      { k: 'style', label: '风格', type: 'select', def: 'modern', options: [['hutong', '坡顶平房'], ['oldcity', '老城板楼'], ['modern', '现代大楼'], ['tower', '退台塔楼'], ['cbd', '玻璃塔']] },
      { k: 'ry', label: '朝向', type: 'range', min: 0, max: 360, step: 5, def: 0 },
    ],
  },
  tree: {
    name: '树木生成器',
    hint: '按住左键在地面上刷树(笔刷范围内随机散布)',
    params: [
      { k: 'radius', label: '笔刷半径', type: 'range', min: 10, max: 120, step: 5, def: 35 },
      { k: 'density', label: '密度', type: 'range', min: 0.2, max: 2, step: 0.1, def: 0.8 },
      { k: 'variant', label: '品种', type: 'select', def: 'auto', options: [['auto', '混合'], ...TREE_VARIANTS.map((v) => [v, ({ broadleaf: '阔叶', conifer: '针叶', willow: '垂柳', ginko: '银杏' })[v]])] },
      { k: 'scale', label: '大小', type: 'range', min: 0.6, max: 2, step: 0.1, def: 1 },
    ],
  },
  park: {
    name: '公园生成器',
    hint: '点击地面生成公园(草坪/园路/湖泊/亭子/花境/树木)',
    params: [
      { k: 'w', label: '宽度', type: 'range', min: 60, max: 400, step: 10, def: 160 },
      { k: 'd', label: '深度', type: 'range', min: 60, max: 400, step: 10, def: 160 },
      { k: 'lake', label: '湖泊', type: 'check', def: true },
      { k: 'treeDensity', label: '树密度', type: 'range', min: 0, max: 1, step: 0.05, def: 0.6 },
      { k: 'pavilion', label: '亭子', type: 'check', def: true },
    ],
  },
  water: {
    name: '水域生成器',
    hint: '点击地面放置湖泊/河段',
    params: [
      { k: 'w', label: '宽度', type: 'range', min: 30, max: 500, step: 10, def: 120 },
      { k: 'd', label: '深度', type: 'range', min: 30, max: 500, step: 10, def: 90 },
    ],
  },
  landmark: {
    name: '地标建筑',
    hint: '选择地标类型,点击地面放置(半透明预览随鼠标)',
    params: [
      { k: 'lm', label: '地标', type: 'select', def: 'tiananmen', options: Object.entries(LANDMARKS).map(([k, v]) => [k, v.name]) },
      { k: 'ry', label: '朝向', type: 'range', min: 0, max: 360, step: 5, def: 0 },
      { k: 's', label: '缩放', type: 'range', min: 0.5, max: 3, step: 0.1, def: 1 },
    ],
  },
  terrain: { name: '地形生成器', hint: '' },
};
const toolParams = {};
for (const [k, def] of Object.entries(TOOL_DEFS)) {
  toolParams[k] = {};
  for (const p of def.params || []) toolParams[k][p.k] = p.def;
}
const P = () => toolParams[state.tool];

const snapVal = (v, s) => Math.round(v / s) * s;

function placementSnap(v, tool) {
  if (!state.snap) return Math.round(v);
  if (tool === 'block') return snapVal(v, 110);
  if (tool === 'tree' || tool === 'terrain') return v;
  return snapVal(v, 5);
}

// ---------------- 初始化城市 ----------------
async function loadMapData(data, id = null, resetView = true) {
  showBusy(true);
  await nextFrame();
  if (city) {
    scene.remove(city.root);
    if (city.terrain && city.terrain.mesh) { scene.remove(city.terrain.mesh); city.terrain.mesh.geometry.dispose(); }
    city.treeSys._disposeMeshes();
  }
  map = data;
  currentMapId = id;
  $('#mapName').value = map.name || '未命名';
  city = new City(scene, map, { mode: 'elements' });
  await city.build();
  if (resetView) { camera.position.set(420, 380, 520); controls.target.set(0, 0, 0); }
  state.undoStack = [];
  setSelected(null);
  markDirty(false);
  updateStats();
  showBusy(false);
}

function nextFrame() { return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 10))); }
function showBusy(on) { $('#busy').classList.toggle('hidden', !on); }
function markDirty(on = true) { dirty = on; $('#dirty').classList.toggle('on', on); }

// ---------------- 参数面板 ----------------
function renderPanel() {
  const def = TOOL_DEFS[state.tool];
  $('#paramTitle').textContent = def.name;
  $('#hintbar').textContent = def.hint || '';
  const body = $('#paramBody');
  body.innerHTML = '';
  if (state.tool === 'terrain') return renderTerrainPanel(body);

  for (const p of def.params || []) {
    const row = document.createElement('div');
    row.className = 'prow';
    const lab = document.createElement('div');
    lab.className = 'plabel';
    lab.textContent = p.label;
    row.appendChild(lab);
    if (p.type === 'range') {
      const val = document.createElement('div');
      val.className = 'pval';
      val.textContent = toolParams[state.tool][p.k];
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = p.min; inp.max = p.max; inp.step = p.step;
      inp.value = toolParams[state.tool][p.k];
      inp.oninput = () => {
        toolParams[state.tool][p.k] = +inp.value;
        val.textContent = inp.value;
        refreshGhost();
      };
      row.appendChild(inp);
      row.appendChild(val);
    } else if (p.type === 'select') {
      const sel = document.createElement('select');
      for (const [v, name] of p.options) {
        const o = document.createElement('option');
        o.value = v; o.textContent = name;
        sel.appendChild(o);
      }
      sel.value = toolParams[state.tool][p.k];
      sel.style.flex = '1';
      sel.onchange = () => { toolParams[state.tool][p.k] = sel.value; refreshGhost(); };
      row.appendChild(sel);
    } else if (p.type === 'check') {
      const lab2 = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = toolParams[state.tool][p.k];
      cb.onchange = () => { toolParams[state.tool][p.k] = cb.checked; refreshGhost(); };
      lab2.appendChild(cb);
      row.appendChild(lab2);
    }
    body.appendChild(row);
  }
  const seedRow = document.createElement('div');
  seedRow.className = 'btnRow';
  const btnSeed = document.createElement('button');
  btnSeed.textContent = '🎲 换一批种子';
  btnSeed.onclick = () => { refreshGhost(true); };
  seedRow.appendChild(btnSeed);
  if (state.tool === 'block' || state.tool === 'park') body.appendChild(seedRow);
}

function renderTerrainPanel(body) {
  const t = (map.settings.terrain = map.settings.terrain || {});
  const mk = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d; };

  const h1 = mk('<div class="plabel" style="margin-top:4px">—— 整体地形 ——</div>');
  body.appendChild(h1);

  const ampRow = document.createElement('div');
  ampRow.className = 'prow';
  ampRow.innerHTML = '<div class="plabel">基础起伏</div>';
  const ampVal = document.createElement('div');
  ampVal.className = 'pval'; ampVal.textContent = t.amplitude ?? 3;
  const amp = document.createElement('input');
  amp.type = 'range'; amp.min = 0; amp.max = 14; amp.step = 0.5; amp.value = t.amplitude ?? 3;
  amp.oninput = () => { t.amplitude = +amp.value; ampVal.textContent = amp.value; };
  ampRow.append(amp, ampVal);
  body.appendChild(ampRow);

  const mRow = document.createElement('div');
  mRow.className = 'prow';
  mRow.innerHTML = '<div class="plabel">远山(西山)</div>';
  const mCb = document.createElement('input');
  mCb.type = 'checkbox'; mCb.checked = t.mountains !== false;
  mCb.onchange = () => { t.mountains = mCb.checked; };
  mRow.appendChild(mCb);
  body.appendChild(mRow);

  const regen = document.createElement('button');
  regen.textContent = '⛰ 重新生成地形';
  regen.style.marginTop = '8px';
  regen.onclick = async () => {
    t.seed = newSeed();
    delete t.edits;
    showBusy(true); await nextFrame();
    city.regenerateTerrain();
    city.rebuildRoads();
    markDirty();
    showBusy(false);
  };
  body.appendChild(regen);

  const h2 = mk('<div class="plabel" style="margin-top:16px">—— 雕刻笔刷 ——</div>');
  body.appendChild(h2);

  const modeRow = document.createElement('div');
  modeRow.className = 'btnRow';
  for (const [m, label] of [['raise', '⬆ 隆起'], ['lower', '⬇ 下凹'], ['flatten', '▭ 平整']]) {
    const b = document.createElement('button');
    b.className = 'small' + (toolParams.terrain.mode === m ? ' primary' : '');
    b.textContent = label;
    b.onclick = () => { toolParams.terrain.mode = m; renderPanel(); };
    modeRow.appendChild(b);
  }
  body.appendChild(modeRow);

  for (const [k, label, min, max, step] of [
    ['radius', '笔刷半径', 20, 180, 5],
    ['strength', '笔刷强度', 2, 20, 1],
  ]) {
    const row = document.createElement('div');
    row.className = 'prow';
    row.innerHTML = `<div class="plabel">${label}</div>`;
    const val = document.createElement('div');
    val.className = 'pval'; val.textContent = toolParams.terrain[k];
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
    inp.value = toolParams.terrain[k];
    inp.oninput = () => { toolParams.terrain[k] = +inp.value; val.textContent = inp.value; };
    row.append(inp, val);
    body.appendChild(row);
  }
  $('#hintbar').textContent = '按住左键在地形上拖动雕刻(隆起/下凹/平整);松开后城市元素自动贴地。整体地形修改会重置雕刻。';
}
toolParams.terrain = { mode: 'raise', radius: 60, strength: 6 };

// ---------------- 幽灵预览 ----------------
const ghostMatSolid = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
const ghostLineMat = new THREE.LineBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9 });

function clearGhost() {
  if (state.ghost) {
    scene.remove(state.ghost);
    state.ghost.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    state.ghost = null;
  }
}

let ghostSeed = newSeed();

function refreshGhost(reseed = false) {
  if (reseed) ghostSeed = newSeed();
  clearGhost();
  const tool = state.tool;
  if (!['block', 'building', 'park', 'water', 'landmark'].includes(tool)) return;
  const g = new THREE.Group();
  const p = P();

  if (tool === 'landmark') {
    const lm = LANDMARKS[p.lm];
    const geo = buildLandmarkGeo(p.lm);
    if (geo) {
      const m = new THREE.Mesh(geo, ghostMatSolid);
      m.rotation.y = (p.ry || 0) * Math.PI / 180;
      g.add(m);
    }
  } else {
    let w = p.w, d = p.d, h = 4, color = 0xffd24a;
    if (tool === 'building') { h = p.floors * 3; }
    if (tool === 'park') { color = 0x7fd45f; h = 1.5; }
    if (tool === 'water') { color = 0x5fa8e8; h = 1; }
    if (tool === 'block') { h = 30; color = 0xd4c04a; }
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }),
    );
    edges.position.y = h / 2;
    g.add(edges);
  }
  g.visible = false;
  scene.add(g);
  state.ghost = g;
}

let landmarkGeoCache = new Map();
function buildLandmarkGeo(id) {
  // 动态引入避免循环依赖;landmarks.js 的 buildLandmark 已导出
  if (!landmarkGeoCache.has(id)) {
    import('../landmarks.js').then((mod) => {
      landmarkGeoCache.set(id, mod.buildLandmark(id).solid.build());
      refreshGhost();
    });
    return null;
  }
  return landmarkGeoCache.get(id);
}

// ---------------- 拾取 ----------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setPointer(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function groundPoint(e) {
  setPointer(e);
  if (city && city.terrain && city.terrain.mesh) {
    const hits = raycaster.intersectObject(city.terrain.mesh);
    if (hits.length) return hits[0].point;
  }
  // 平面回退
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pt = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, pt);
  return pt;
}

function pickElement(e) {
  setPointer(e);
  const meshes = [];
  city.root.traverse((o) => { if (o.isMesh && o.userData.elId != null) meshes.push(o); });
  for (const m of city.treeSys.meshes) meshes.push(m);
  const hits = raycaster.intersectObjects(meshes, false);
  for (const h of hits) {
    if (h.object.userData.elId != null) return findEl(h.object.userData.elId);
    if (h.instanceId != null) {
      const item = city.treeSys.items[h.instanceId];
      if (item && item.tag != null) return findEl(item.tag);
    }
  }
  return null;
}
const findEl = (id) => map.elements.find((el) => el.id === id) || null;

// ---------------- 选中框 ----------------
let selBox = null;
let selBoxBase = null;
function setSelected(el) {
  state.selected = el;
  if (selBox) { scene.remove(selBox); selBox = null; }
  if (el) {
    if (el.type === 'tree') {
      const s = el.s || 1;
      const b = new THREE.Box3(
        new THREE.Vector3(el.x - 2 * s, city.groundY(el.x, el.z) - 0.5, el.z - 2 * s),
        new THREE.Vector3(el.x + 2 * s, city.groundY(el.x, el.z) + 6 * s, el.z + 2 * s),
      );
      selBox = new THREE.Box3Helper(b, 0xffc23a);
      scene.add(selBox);
    } else {
      const entry = city.elementGroups.get(el.id);
      if (entry) {
        const b = new THREE.Box3().setFromObject(entry.group);
        selBoxBase = b;
        selBox = new THREE.Box3Helper(b, 0xffc23a);
        scene.add(selBox);
      }
    }
  }
  renderProps();
}

function updateSelBox() {
  if (!state.selected || !selBox) return;
  const el = state.selected;
  if (el.type === 'tree') {
    const s = el.s || 1, y = city.groundY(el.x, el.z);
    selBox.box.min.set(el.x - 2 * s, y - 0.5, el.z - 2 * s);
    selBox.box.max.set(el.x + 2 * s, y + 6 * s, el.z + 2 * s);
  } else if (selBoxBase) {
    const entry = city.elementGroups.get(el.id);
    if (entry) {
      selBox.box.copy(selBoxBase).translate(entry.group.position);
    }
  }
}

// ---------------- 属性面板 ----------------
function renderProps() {
  const box = $('#props');
  const el = state.selected;
  if (!el) { box.innerHTML = '<div class="dim">未选中 — 用选择工具点击城市中的元素</div>'; return; }
  const typeName = { block: '街区', building: '大楼', park: '公园', tree: '树', water: '水域', landmark: '地标' }[el.type] || el.type;
  let html = `<div style="margin-bottom:8px"><b>${typeName}</b> #${el.id}
    ${el.type === 'landmark' ? ' · ' + (LANDMARKS[el.lm]?.name || el.lm) : ''}</div>`;
  html += `<div class="prow"><span class="plabel">坐标</span><span>${Math.round(el.x)}, ${Math.round(el.z)}</span></div>`;
  if (el.type === 'landmark' || el.type === 'building' || el.type === 'tree') {
    html += `<div class="prow"><span class="plabel">朝向/缩放</span><span>${Math.round((el.ry || 0) * 180 / Math.PI) || 0}° / ${(el.s || 1).toFixed(1)}</span></div>`;
  }
  box.innerHTML = html;

  const row = document.createElement('div');
  row.className = 'btnRow';

  if (el.type === 'block' || el.type === 'park' || el.type === 'building') {
    const b1 = document.createElement('button');
    b1.className = 'small';
    b1.textContent = '🎲 重掷';
    b1.onclick = async () => {
      pushUndo();
      el.seed = newSeed();
      showBusy(true); await nextFrame();
      city.rebuildElement(el);
      setSelected(el);
      markDirty(); showBusy(false);
    };
    row.appendChild(b1);
  }
  if (el.type === 'landmark' || el.type === 'building') {
    const b2 = document.createElement('button');
    b2.className = 'small';
    b2.textContent = '↻ 旋转15°';
    b2.onclick = async () => {
      pushUndo();
      el.ry = (el.ry || 0) + Math.PI / 12;
      showBusy(true); await nextFrame();
      city.rebuildElement(el);
      setSelected(el);
      markDirty(); showBusy(false);
    };
    row.appendChild(b2);
  }
  if (el.type === 'landmark' || el.type === 'tree') {
    const b3 = document.createElement('button');
    b3.className = 'small';
    b3.textContent = '⤢ 放大';
    b3.onclick = async () => {
      pushUndo();
      el.s = Math.min(4, (el.s || 1) * 1.15);
      showBusy(true); await nextFrame();
      city.rebuildElement(el);
      setSelected(el);
      markDirty(); showBusy(false);
    };
    const b4 = document.createElement('button');
    b4.className = 'small';
    b4.textContent = '⤡ 缩小';
    b4.onclick = async () => {
      pushUndo();
      el.s = Math.max(0.3, (el.s || 1) / 1.15);
      showBusy(true); await nextFrame();
      city.rebuildElement(el);
      setSelected(el);
      markDirty(); showBusy(false);
    };
    row.append(b3, b4);
  }
  const del = document.createElement('button');
  del.className = 'small danger';
  del.textContent = '🗑 删除 (Del)';
  del.onclick = () => deleteSelected();
  row.appendChild(del);
  box.appendChild(row);
}

function deleteSelected() {
  const el = state.selected;
  if (!el) return;
  pushUndo();
  city.removeElement(el);
  if (el.type === 'block' || el.type === 'park') city.rebuildRoads();
  setSelected(null);
  markDirty();
  updateStats();
}

// ---------------- 撤销 ----------------
function pushUndo() {
  state.undoStack.push(JSON.stringify({ elements: map.elements, nextId: map.settings.nextId }));
  if (state.undoStack.length > 40) state.undoStack.shift();
}
async function undo() {
  if (!state.undoStack.length) return;
  const snap = JSON.parse(state.undoStack.pop());
  map.elements = snap.elements;
  map.settings.nextId = snap.nextId;
  setSelected(null);
  showBusy(true); await nextFrame();
  city.rebuildAll();
  city.rebuildRoads();
  markDirty();
  showBusy(false);
}

// ---------------- 指针交互 ----------------
let paintStart = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const tool = state.tool;
  if (tool === 'select') {
    const el = pickElement(e);
    if (el) {
      setSelected(el);
      if (el.type !== 'tree') {
        const entry = city.elementGroups.get(el.id);
        if (entry) {
          controls.enabled = false;
          state.dragging = { el, entry, home: { x: el.x, z: el.z } };
          renderer.domElement.setPointerCapture(e.pointerId);
        }
      }
    } else {
      setSelected(null);
    }
  } else if (tool === 'tree') {
    state.painting = true;
    paintStart = { snapshot: JSON.stringify({ elements: map.elements, nextId: map.settings.nextId }) };
    scatterTrees(e);
    renderer.domElement.setPointerCapture(e.pointerId);
  } else if (tool === 'terrain') {
    state.painting = true;
    applyTerrainBrush(e, true);
    renderer.domElement.setPointerCapture(e.pointerId);
  } else if (['block', 'building', 'park', 'water', 'landmark'].includes(tool)) {
    placeElement(e);
  }
});

renderer.domElement.addEventListener('pointermove', (e) => {
  // 幽灵预览
  if (state.ghost && ['block', 'building', 'park', 'water', 'landmark'].includes(state.tool)) {
    const pt = groundPoint(e);
    if (pt) {
      const gx = placementSnap(pt.x, state.tool), gz = placementSnap(pt.z, state.tool);
      state.ghost.position.set(gx, city.groundY(gx, gz), gz);
      state.ghost.visible = true;
    }
  }
  if (state.dragging) {
    const pt = groundPoint(e);
    if (pt) {
      const { el, entry, home } = state.dragging;
      el.x = placementSnap(pt.x, el.type === 'block' ? 'block' : el.type);
      el.z = placementSnap(pt.z, el.type === 'block' ? 'block' : el.type);
      entry.group.position.set(el.x - home.x, 0, el.z - home.z);
      updateSelBox();
    }
  } else if (state.painting && state.tool === 'tree') {
    scatterTrees(e);
  } else if (state.painting && state.tool === 'terrain') {
    applyTerrainBrush(e, false);
  }
});

renderer.domElement.addEventListener('pointerup', async (e) => {
  if (state.dragging) {
    const { el, home } = state.dragging;
    state.dragging = null;
    controls.enabled = true;
    if (el.x !== home.x || el.z !== home.z) {
      pushUndo();
      showBusy(true); await nextFrame();
      city.rebuildElement(el);
      if (el.type === 'block' || el.type === 'park') city.rebuildRoads();
      setSelected(el);
      markDirty();
      showBusy(false);
    }
  }
  if (state.painting && state.tool === 'tree') {
    state.painting = false;
    if (paintStart && paintStart.snapshot) {
      state.undoStack.push(paintStart.snapshot);
      if (state.undoStack.length > 40) state.undoStack.shift();
      paintStart = null;
    }
    markDirty();
    updateStats();
  }
  if (state.painting && state.tool === 'terrain') {
    state.painting = false;
    showBusy(true); await nextFrame();
    city.rebuildAll(); // 全部元素贴地
    markDirty();
    showBusy(false);
  }
});



function placeElement(e) {
  const pt = groundPoint(e);
  if (!pt) return;
  const p = P();
  const x = placementSnap(pt.x, state.tool);
  const z = placementSnap(pt.z, state.tool);
  let el;
  switch (state.tool) {
    case 'block':
      el = { type: 'block', x, z, w: p.w, d: p.w, style: p.style, seed: ghostSeed, density: p.density };
      break;
    case 'building':
      el = { type: 'building', x, z, w: p.w, d: p.d, floors: p.floors, style: p.style, ry: (p.ry * Math.PI) / 180, seed: ghostSeed };
      break;
    case 'park':
      el = { type: 'park', x, z, w: p.w, d: p.d, seed: ghostSeed, lake: p.lake, treeDensity: p.treeDensity, pavilion: p.pavilion };
      break;
    case 'water':
      el = { type: 'water', x, z, w: p.w, d: p.d };
      break;
    case 'landmark':
      el = { type: 'landmark', lm: p.lm, x, z, ry: (p.ry * Math.PI) / 180, s: p.s };
      break;
  }
  pushUndo();
  ghostSeed = newSeed();
  city.addElement(el);
  if (el.type === 'block' || el.type === 'park') city.rebuildRoads();
  markDirty();
  updateStats();
  refreshGhost(true);
}

function scatterTrees(e) {
  const pt = groundPoint(e);
  if (!pt) return;
  const p = P();
  const n = Math.max(1, Math.round(p.radius * 0.05 * p.density * 3));
  const rnd = mulberry32(newSeed());
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * p.radius;
    const x = pt.x + Math.cos(a) * r, z = pt.z + Math.sin(a) * r;
    const variant = p.variant === 'auto'
      ? ['broadleaf', 'conifer', 'ginko', 'willow'][(rnd() * 4) | 0]
      : p.variant;
    city.addElement({ type: 'tree', x, z, variant, s: p.scale * rngRange(rnd, 0.8, 1.25), seed: (rnd() * 1e9) | 0 }, true);
  }
  city.treeSys.rebuild();
}

function applyTerrainBrush(e) {
  const pt = groundPoint(e);
  if (!pt) return;
  const p = toolParams.terrain;
  city.terrain.brush(pt.x, pt.z, p.radius, p.strength * 0.25, p.mode);
  city.refreshTerrain(false); // 刷地面 + 树贴地(元素松手再全量)
}

// ---------------- 存 / 读 / 导入导出 ----------------
function serializeMap() {
  const data = JSON.parse(JSON.stringify({
    format: 1,
    name: $('#mapName').value.trim() || '未命名地图',
    settings: { ...map.settings, terrain: { ...map.settings.terrain, edits: city.terrain.exportEdits() } },
    elements: map.elements,
  }));
  return data;
}

async function saveMap() {
  const data = serializeMap();
  try {
    const res = await fetch('/api/maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentMapId, name: data.name, data }),
    });
    const j = await res.json();
    if (j.ok) {
      currentMapId = j.id;
      map.name = data.name;
      markDirty(false);
      toast('已保存 ✓ (' + data.name + ')');
    }
  } catch (err) {
    toast('保存失败: ' + err.message);
  }
}

function toast(msg) {
  $('#hintbar').textContent = msg;
  setTimeout(() => { $('#hintbar').textContent = TOOL_DEFS[state.tool].hint || ''; }, 2600);
}

async function openMapList() {
  const modal = $('#modal');
  $('#modalTitle').textContent = '地图库';
  const body = $('#modalBody');
  body.innerHTML = '<div class="dim">加载中…</div>';
  modal.classList.remove('hidden');
  try {
    const list = await (await fetch('/api/maps')).json();
    body.innerHTML = list.length ? '' : '<div class="dim">暂无存档,先保存一张吧</div>';
    for (const m of list) {
      const row = document.createElement('div');
      row.className = 'mapItem';
      row.innerHTML = `<div class="name">${m.name}<div class="meta">${m.elements} 元素 · ${new Date(m.updatedAt).toLocaleString()}</div></div>`;
      const load = document.createElement('button');
      load.className = 'small primary';
      load.textContent = '载入';
      load.onclick = async () => {
        modal.classList.add('hidden');
        const doc = await (await fetch('/api/maps/' + m.id)).json();
        await loadMapData(doc.data, m.id);
      };
      const del = document.createElement('button');
      del.className = 'small danger';
      del.textContent = '删除';
      del.onclick = async () => {
        if (!confirm('删除地图「' + m.name + '」?')) return;
        await fetch('/api/maps/' + m.id, { method: 'DELETE' });
        row.remove();
      };
      row.append(load, del);
      body.appendChild(row);
    }
  } catch (e) {
    body.innerHTML = '<div class="dim">无法连接服务器: ' + e.message + '</div>';
  }
}

function exportJSON() {
  const data = serializeMap();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (data.name || 'map') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------- 工具切换 / 快捷键 ----------------
function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll('#toolbar .tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  clearGhost();
  setSelected(null);
  renderPanel();
  refreshGhost();
}
document.querySelectorAll('#toolbar .tool').forEach((b) => {
  b.onclick = () => setTool(b.dataset.tool);
});

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const map_ = { KeyQ: 'select', KeyB: 'block', KeyG: 'building', KeyT: 'tree', KeyP: 'park', KeyW: 'water', KeyL: 'landmark', KeyY: 'terrain' };
  if (map_[e.code]) setTool(map_[e.code]);
  if (e.code === 'Delete' || e.code === 'Backspace') deleteSelected();
  if (e.code === 'Escape') setSelected(null);
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); saveMap(); }
});

$('#btnNew').onclick = () => { if (confirm('新建空白地图?当前未保存的修改将丢失')) loadMapData(emptyMap(), null); };
$('#btnDemo').onclick = () => { if (confirm('生成示例北京城?将替换当前地图')) loadMapData(generateDemoCity(), null); };
$('#btnSave').onclick = saveMap;
$('#btnLoad').onclick = openMapList;
$('#btnExport').onclick = exportJSON;
$('#btnImport').onclick = () => $('#fileImport').click();
$('#fileImport').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    await loadMapData(data, null);
  } catch (err) {
    toast('导入失败: ' + err.message);
  }
};
$('#optGrid').onchange = (e) => { state.snap = e.target.checked; };
$('#optHelper').onchange = (e) => { gridHelper.visible = e.target.checked; };
$('.linkBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  if (dirty) await saveMap();
  window.open('/?map=' + currentMapId, '_blank');
});

// ---------------- 统计 ----------------
let fps = 0, frames = 0, lastStat = performance.now();
function updateStats() {
  const s = city ? city.stats() : { elements: 0, buildings: 0, trees: 0 };
  $('#stats').innerHTML = `
    <table>
      <tr><td>帧率</td><td>${fps} FPS</td></tr>
      <tr><td>元素</td><td>${s.elements}</td></tr>
      <tr><td>建筑(约)</td><td>${s.buildings}</td></tr>
      <tr><td>树木</td><td>${s.trees}</td></tr>
    </table>`;
}

// ---------------- 主循环 ----------------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateSelBox();
  renderer.render(scene, camera);
  frames++;
  const now = performance.now();
  if (now - lastStat > 500) {
    fps = Math.round((frames * 1000) / (now - lastStat));
    frames = 0; lastStat = now;
    updateStats();
  }
}

// ---------------- 启动:优先加载服务器最新地图,否则示例北京 ----------------
(async function boot() {
  renderPanel();
  animate();
  try {
    const list = await (await fetch('/api/maps')).json();
    if (list.length) {
      const doc = await (await fetch('/api/maps/' + list[0].id)).json();
      await loadMapData(doc.data, list[0].id);
      return;
    }
  } catch (e) { /* 服务器不可用时本地生成 */ }
  await loadMapData(generateDemoCity(), null);
})();
