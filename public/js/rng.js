// 种子随机 & 值噪声 — 全部生成器共用的确定性随机源

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 基于整数格点的值噪声,返回 (x,z)→[-1,1] 的平滑噪声函数 */
export function makeNoise2D(seed) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = (ix, iz) => perm[(perm[ix & 255] + iz) & 255] / 255;
  return function (x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = val(ix, iz), b = val(ix + 1, iz), c = val(ix, iz + 1), d = val(ix + 1, iz + 1);
    const top = a + (b - a) * u;
    const bottom = c + (d - c) * u;
    return (top * (1 - v) + bottom * v) * 2 - 1;
  };
}

/** 分形叠加噪声 */
export function fbm(noise, x, z, oct = 4, lac = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= gain; freq *= lac;
  }
  return sum / norm;
}

// ---- 随机工具(挂在 rng 函数上,方便各生成器使用) ----
export function rngRange(rnd, a, b) { return a + rnd() * (b - a); }
export function rngInt(rnd, a, b) { return Math.floor(rngRange(rnd, a, b + 1)); }
export function rngPick(rnd, arr) { return arr[(rnd() * arr.length) | 0]; }
export function rngChance(rnd, p) { return rnd() < p; }

/** 按权重挑选 [{v,w}] */
export function rngWeighted(rnd, pairs) {
  let total = 0;
  for (const p of pairs) total += p.w;
  let r = rnd() * total;
  for (const p of pairs) {
    r -= p.w;
    if (r <= 0) return p.v;
  }
  return pairs[pairs.length - 1].v;
}

export function newSeed() { return (Math.random() * 0xffffffff) >>> 0; }

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
