/**
 * 北京 Low Poly 开放世界 — 后端服务
 * - 托管前端静态资源(游戏渲染端 + 编辑器)
 * - /vendor → three.js(npm 安装,免打包)
 * - /api/maps → 地图数据存档(JSON 文件)
 * - /api/maps/:id/render → 服务端烘焙的二进制"渲染包"(游戏端零生成逻辑)
 * - 启动时若无任何地图,自动在服务端生成示例北京城
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data', 'maps');
fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: '64mb' }));

// three.js 静态托管(build 目录内有 three.module.js / three.core.js)
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'three', 'build')));
app.use('/vendor/jsm', express.static(path.join(__dirname, 'node_modules', 'three', 'examples', 'jsm')));

app.use(express.static(path.join(__dirname, 'public')));

// ---------- 地图 API ----------
const mapFile = (id) => path.join(DATA_DIR, id + '.json');
const safeId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
const now = () => new Date().toISOString();

function readMeta(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      id: j.id,
      name: j.name || '未命名地图',
      updatedAt: j.updatedAt,
      elements: Array.isArray(j.data?.elements) ? j.data.elements.length : 0,
      size: fs.statSync(file).size,
    };
  } catch {
    return null;
  }
}

app.get('/api/maps', (req, res) => {
  const list = fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readMeta(path.join(DATA_DIR, f)))
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  res.json(list);
});

app.get('/api/maps/:id', (req, res) => {
  if (!safeId(req.params.id)) return res.status(400).json({ error: '非法 id' });
  const file = mapFile(req.params.id);
  if (!fs.existsSync(file)) return res.status(404).json({ error: '地图不存在' });
  res.sendFile(file);
});

app.post('/api/maps', (req, res) => {
  const { id, name, data } = req.body || {};
  if (!data || typeof data !== 'object') return res.status(400).json({ error: '缺少 data' });
  const finalId = safeId(id) ? id : 'map_' + Date.now().toString(36);
  const doc = {
    id: finalId,
    name: typeof name === 'string' && name.trim() ? name.trim() : '未命名地图',
    updatedAt: now(),
    data,
  };
  fs.writeFileSync(mapFile(finalId), JSON.stringify(doc));
  bakeCache.delete(finalId); // 存档变更,渲染包缓存失效
  res.json({ ok: true, id: finalId, updatedAt: doc.updatedAt });
});

app.delete('/api/maps/:id', (req, res) => {
  if (!safeId(req.params.id)) return res.status(400).json({ error: '非法 id' });
  const file = mapFile(req.params.id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  bakeCache.delete(req.params.id);
  res.json({ ok: true });
});

// ---------- 渲染包(服务端烘焙) ----------
const bakeCache = new Map(); // id → { hash, body, etag }
let bakerPromise = null;

async function getBaker() {
  if (!bakerPromise) bakerPromise = import('./lib/baker.mjs');
  return bakerPromise;
}

app.get('/api/maps/:id/render', async (req, res) => {
  if (!safeId(req.params.id)) return res.status(400).json({ error: '非法 id' });
  const file = mapFile(req.params.id);
  if (!fs.existsSync(file)) return res.status(404).json({ error: '地图不存在' });

  const raw = fs.readFileSync(file, 'utf8');
  const hash = crypto.createHash('md5').update(raw).digest('hex');
  const etag = `"${hash}"`;
  if (req.headers['if-none-match'] === etag) return res.status(304).end();

  let cached = bakeCache.get(req.params.id);
  if (!cached || cached.hash !== hash) {
    try {
      const { bakeMap } = await getBaker();
      const doc = JSON.parse(raw);
      const t0 = Date.now();
      const { body } = await bakeMap(doc.data);
      cached = { hash, body: Buffer.from(body), etag, ms: Date.now() - t0, bytes: body.length };
      bakeCache.set(req.params.id, cached);
      console.log(`[bake] ${req.params.id} 烘焙完成: ${(body.length / 1048576).toFixed(2)} MB,耗时 ${cached.ms}ms`);
    } catch (err) {
      console.error('[bake] 失败:', err);
      return res.status(500).json({ error: '烘焙失败: ' + err.message });
    }
  }
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'must-revalidate');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(cached.body);
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: now() }));

// ---------- Overpass 中转代理(供地图转换工具下载 OSM 数据) ----------
const OVERPASS_MIRRORS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

app.post('/api/osm-proxy', async (req, res) => {
  const query = typeof req.body === 'string' ? req.body : req.body?.query;
  if (!query || query.length > 200000) return res.status(400).json({ error: '缺少 query' });
  const started = Date.now();
  for (const ep of OVERPASS_MIRRORS) {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'lowpoly-beijing-map-tool/1.0' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(260000),
      });
      if (!r.ok) {
        console.log(`[osm-proxy] ${new URL(ep).host} → HTTP ${r.status}`);
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      console.log(`[osm-proxy] ${new URL(ep).host} → ${(buf.length / 1048576).toFixed(1)}MB, ${Date.now() - started}ms`);
      res.setHeader('Content-Type', 'application/json');
      return res.send(buf);
    } catch (e) {
      console.log(`[osm-proxy] ${new URL(ep).host} → ${e.message}`);
    }
  }
  res.status(502).json({ error: '所有镜像均失败' });
});

// ---------- 启动 ----------
async function ensureDemoMap() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  if (files.length) return;
  const { generateDemoCity } = await import('./public/js/demo-city.js');
  const data = generateDemoCity();
  const doc = { id: 'beijing_demo', name: data.name, updatedAt: now(), data };
  fs.writeFileSync(mapFile('beijing_demo'), JSON.stringify(doc));
  console.log('[server] 已生成示例地图: 示例 · 北京城 (beijing_demo)');
}

ensureDemoMap()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] 北京 Low Poly 开放世界已启动`);
      console.log(`[server]   游戏(渲染端) http://localhost:${PORT}/`);
      console.log(`[server]   编辑器       http://localhost:${PORT}/editor.html`);
    });
  })
  .catch((err) => {
    console.error('[server] 启动失败:', err);
    process.exit(1);
  });
