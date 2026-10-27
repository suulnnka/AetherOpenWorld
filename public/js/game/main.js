// 游戏主入口 — 北京 Low Poly 开放世界(瘦渲染端)
// 城市数据全部由服务端烘焙提供(/api/maps/:id/render),前端只做渲染与交互。
import * as THREE from 'three';
import { loadCityView, pickMapId } from './city-view.js';
import { Input, Character } from './character.js';
import { CrowdSystem } from './agents.js';
import { mulberry32, rngRange } from '../rng.js';
import { C } from '../palette.js';

const $ = (s) => document.querySelector(s);

// 全局错误探针(便于调试与自动化测试)
window.addEventListener('error', (e) => {
  window.__lastError = (e.message || 'error') + ' @' + (e.filename || '') + ':' + (e.lineno || 0);
});

// ---------- 渲染器 / 场景 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
let pixelRatioCap = Math.min(devicePixelRatio, 1.75);
renderer.setPixelRatio(pixelRatioCap);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(C.fog, 420, 2600);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 6000);
window.__scene = scene;   // 调试/自动化测试探针
window.__camera = camera;
window.__renderer = renderer;

// ---------- 天空穹顶 ----------
{
  const skyGeo = new THREE.SphereGeometry(3200, 20, 12);
  const top = new THREE.Color(C.skyTop).convertSRGBToLinear();
  const hor = new THREE.Color(C.skyHorizon).convertSRGBToLinear();
  const colors = [];
  const pos = skyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) / 3200 + 0.12) * 1.4));
    const c = hor.clone().lerp(top, t);
    colors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  sky.matrixAutoUpdate = false;
  scene.add(sky);
}

// ---------- 光照 ----------
const hemi = new THREE.HemisphereLight(0xcfe4f2, 0x8a9a6a, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d6, 1.6);
sun.position.set(160, 240, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 700;
sun.shadow.camera.left = -130;
sun.shadow.camera.right = 130;
sun.shadow.camera.top = 130;
sun.shadow.camera.bottom = -130;
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

// ---------- 云朵 ----------
const clouds = [];
{
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92, flatShading: true });
  const rnd = mulberry32(7);
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    const n = 3 + (rnd() * 3 | 0);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rngRange(rnd, 12, 26), 0), mat);
      m.position.set(rngRange(rnd, -30, 30), rngRange(rnd, -4, 4), rngRange(rnd, -14, 14));
      m.scale.y = 0.5;
      g.add(m);
    }
    g.position.set(rngRange(rnd, -1600, 1600), rngRange(rnd, 190, 300), rngRange(rnd, -1600, 1600));
    scene.add(g);
    clouds.push({ g, speed: rngRange(rnd, 2, 5) });
  }
}

// ---------- 小地图 ----------
function drawMinimapBase(city) {
  const SIZE = 512, W = city.settings.world || 3000;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d');
  const tx = (x) => ((x + W / 2) / W) * SIZE;
  const tz = (z) => ((z + W / 2) / W) * SIZE;
  g.fillStyle = '#7da457';
  g.fillRect(0, 0, SIZE, SIZE);
  if (city.cityRect) {
    const r = city.cityRect;
    g.fillStyle = '#4a4f57';
    g.fillRect(tx(r.x0), tz(r.z0), tx(r.x1) - tx(r.x0), tz(r.z1) - tz(r.z0));
  }
  const roads = city.settings.roads;
  if (roads && roads.length) {
    g.lineCap = 'round';
    for (const rd of roads) {
      if (rd.c !== 'major') continue; // 小地图只画主干道,避免数千条次干道拖慢
      g.strokeStyle = '#d8d8d2';
      g.lineWidth = 2;
      g.beginPath();
      rd.p.forEach((p, i) => (i ? g.lineTo(tx(p[0]), tz(p[1])) : g.moveTo(tx(p[0]), tz(p[1]))));
      g.stroke();
    }
  } else {
    g.strokeStyle = '#d8d8d2';
    g.lineWidth = 2;
    for (const ring of city.settings.rings || []) {
      g.strokeRect(tx(-ring), tz(-ring), tx(ring) - tx(-ring), tz(ring) - tz(-ring));
    }
  }
  for (const w of city.waterRects) {
    g.fillStyle = '#4f8fd0';
    g.fillRect(tx(w.x - w.w / 2), tz(w.z - w.d / 2), (w.w / W) * SIZE, (w.d / W) * SIZE);
  }
  for (const p of city.parkRects) {
    g.fillStyle = '#8cc63f';
    g.fillRect(tx(p.x - p.w / 2), tz(p.z - p.d / 2), (p.w / W) * SIZE, (p.d / W) * SIZE);
  }
  g.fillStyle = '#9aa0a8';
  for (const b of city.blockRects) {
    g.fillRect(tx(b.x - b.w / 2), tz(b.z - b.d / 2), (b.w / W) * SIZE, (b.d / W) * SIZE);
  }
  for (const lm of city.landmarks) {
    g.fillStyle = '#e8b33a';
    g.beginPath();
    g.arc(tx(lm.x), tz(lm.z), 4, 0, Math.PI * 2);
    g.fill();
  }
  return cv;
}

function updateMinimap(base, player) {
  const g = minimapCtx;
  const SIZE = minimapCtx.canvas.width;
  g.drawImage(base, 0, 0);
  const W = city.settings.world || 3000;
  const px = ((player.pos.x + W / 2) / W) * SIZE;
  const pz = ((player.pos.z + W / 2) / W) * SIZE;
  g.save();
  g.translate(px, pz);
  g.rotate(-player.yaw + Math.PI);
  g.fillStyle = '#ff5340';
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -9);
  g.lineTo(6, 7);
  g.lineTo(0, 3);
  g.lineTo(-6, 7);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

// ---------- 地标名牌 ----------
const locLabel = $('#locLabel');
function updateLandmarkLabel(player) {
  let best = null, bestD = 1e9;
  for (const lm of city.landmarks) {
    const d = Math.hypot(lm.x - player.pos.x, lm.z - player.pos.z);
    if (d < lm.radius + 320 && d < bestD) { bestD = d; best = lm; }
  }
  if (!best) { locLabel.style.opacity = 0; return; }
  locLabel.style.opacity = Math.max(0, Math.min(1, (best.radius + 320 - bestD) / 160));
  locLabel.innerHTML = `${best.name}<span>${Math.round(bestD)} m</span>`;
}

// ---------- 启动 ----------
let city = null;
let character = null, crowd = null, minimapBase = null;
const minimapCtx = $('#minimap').getContext('2d');

async function boot() {
  const mapId = await pickMapId();
  city = await loadCityView(scene, mapId, (p, msg) => {
    $('#loadBar').style.width = (p * 100).toFixed(1) + '%';
    $('#loadMsg').textContent = msg;
  });
  $('#mapName').textContent = city.name || '未命名';

  const input = new Input(renderer.domElement);
  character = new Character(scene, camera, input, city);
  const lm0 = city.landmarks[0]; // 出生点:首个地标东南侧(适配任意地图)
  character.teleport(lm0 ? lm0.x + lm0.radius * 0.7 : 10, lm0 ? lm0.z + lm0.radius * 0.7 : 185);
  window.__player = character; // 调试/自动化测试探针
  window.__input = input;
  crowd = new CrowdSystem(scene, city.settings, (x, z) => city.groundY(x, z));
  window.__crowd = crowd; // 调试/自动化测试探针
  minimapBase = drawMinimapBase(city);

  // 数字键传送到地标
  input.onKey = (code) => {
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'].indexOf(code);
    if (idx >= 0 && city.landmarks[idx]) {
      const lm = city.landmarks[idx];
      character.teleport(lm.x + lm.radius * 0.8, lm.z + lm.radius * 0.8);
    }
  };

  $('#hint').innerHTML = `WASD / 方向键 移动 · Shift 疾跑 · Space 跳跃 · 拖拽转视角 · 滚轮缩放 · 数字键 1-${Math.min(9, city.landmarks.length)} 传送地标`;

  $('#loading').classList.add('hide');
  requestAnimationFrame(loop);
}

const clock = new THREE.Clock();
let perfLast = performance.now(), perfAccum = 0, perfFrames = 0, perfLowStreak = 0;

function loop() {
  requestAnimationFrame(loop);
  window.__loopCount = (window.__loopCount || 0) + 1;
  const dt = Math.min(clock.getDelta(), 0.05);

  if (character) {
    character.update(dt);
    // 太阳跟随角色(阴影范围)
    sun.target.position.copy(character.pos);
    sun.position.set(character.pos.x + 140, 240, character.pos.z + 80);
    updateMinimap(minimapBase, character);
    updateLandmarkLabel(character);
  }
  if (crowd) crowd.update(dt);
  for (const c of clouds) {
    c.g.position.x += c.speed * dt;
    if (c.g.position.x > 1700) c.g.position.x = -1700;
  }

  renderer.render(scene, camera);

  // 自适应画质:帧率持续偏低则逐步降低像素比(最低 1.0),减轻渲染压力
  const now = performance.now();
  perfAccum += now - perfLast;
  perfLast = now;
  if (++perfFrames >= 30) {
    const fps = 1000 / (perfAccum / perfFrames);
    perfAccum = 0; perfFrames = 0;
    if (fps < 40 && pixelRatioCap > 1.0) {
      if (++perfLowStreak >= 3) {
        pixelRatioCap = Math.max(1.0, pixelRatioCap - 0.25);
        renderer.setPixelRatio(pixelRatioCap);
        perfLowStreak = 0;
      }
    } else {
      perfLowStreak = 0;
    }
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

boot().catch((err) => {
  $('#loadMsg').textContent = '启动失败: ' + err.message;
  console.error(err);
});
