// 多边形几何工具 — OSM 转换工具与服务端/渲染端共用
// 坐标约定:输入为 [[x,z], ...](世界坐标平面点)

/** Douglas-Peucker 简化(闭合多边形传 isClosed) */
export function simplifyDP(pts, tol, isClosed = true) {
  if (pts.length <= 3) return pts.slice();
  const sqTol = tol * tol;
  const keep = new Array(pts.length).fill(false);
  if (isClosed) { keep[0] = keep[pts.length - 1] = true; } else { keep[0] = keep[pts.length - 1] = true; }

  const sqSegDist = (p, a, b) => {
    let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(pts[i], pts[first], pts[last]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > sqTol) {
      keep[idx] = true;
      stack.push([first, idx], [idx, last]);
    }
  }
  const out = pts.filter((_, i) => keep[i]);
  if (isClosed && out.length > 1) out.pop(); // 去掉重复闭合点
  return out;
}

/** 多边形有向面积(结果绝对值为面积,符号表示方向) */
export function polyArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function centroid(pts) {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}

/** 射线法点内判定 */
export function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

/** 耳切三角化(简单多边形,无孔)。失败返回 null。输出索引三角形。 */
export function earclip(pts) {
  const n = pts.length;
  if (n < 3) return null;
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  // 统一为逆时针(CCW)
  if (polyArea(pts) < 0) idx.reverse();
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 2 * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length];
      const b = idx[i];
      const c = idx[(i + 1) % idx.length];
      const A = pts[a], B = pts[b], C = pts[c];
      const cross = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (cross <= 0.0001) continue; // 反向或退化
      let isEar = true;
      for (const j of idx) {
        if (j === a || j === b || j === c) continue;
        if (pointInPoly(pts[j][0], pts[j][1], [A, B, C])) { isEar = false; break; }
      }
      if (isEar) {
        tris.push([a, b, c]);
        idx.splice(i, 1);
        clipped = true;
        guard = 0;
        break;
      }
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  if (idx.length > 3) return null; // 简化失败(自交等)
  return tris;
}

/** 最小外接矩形(凸包 + 旋转卡壳近似:枚举凸包边方向) */
export function minRect(pts) {
  // 凸包
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of P) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 3) return null;
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = p[0] * ux + p[1] * uz, v = -p[0] * uz + p[1] * ux;
      if (u < minU) minU = u; if (u > maxU) maxU = u;
      if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      best = { area, w: maxU - minU, d: maxV - minV, cx: 0, cz: 0, ux, uz };
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
      best.cx = cu * ux - cv * uz;
      best.cz = cu * uz + cv * ux;
    }
  }
  return best; // { w, d, cx, cz, ux, uz } ux/uz 为长边方向
}

/** 折线长度 */
export function polylineLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
