(function (root) {
'use strict';
const TAU = Math.PI * 2, G = { TAU };
const normA = G.normA = a => ((a % TAU) + TAU) % TAU;
const dist = G.dist = (a, b, c, d) => Math.hypot(c - a, d - b);
G.ACI = { 1: '#ff4040', 2: '#ffe14a', 3: '#3bff6a', 4: '#3be8ff', 5: '#5b8bff', 6: '#ff55ff', 7: '#f2f2f2' };
G.LT = { cont: [], dash: [8, 5], center: [16, 4, 3, 4], hidden: [4, 4] };

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
G.segDist = segDist;
const inArcR = (a1, a2, ang) => normA(ang - a1) <= normA(a2 - a1) + 1e-9;
G.inArc = (e, ang) => e.full || inArcR(e.a1, e.a2, ang);

G.arcFrom3 = function (a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const r = Math.hypot(a.x - ux, a.y - uy);
  const A = Math.atan2(a.y - uy, a.x - ux), B = Math.atan2(b.y - uy, b.x - ux), C = Math.atan2(c.y - uy, c.x - ux);
  return normA(B - A) < normA(C - A) ? { type: 'arc', cx: ux, cy: uy, r, a1: A, a2: C } : { type: 'arc', cx: ux, cy: uy, r, a1: C, a2: A };
};

// ---------- dimension geometry ----------
function arrow(tx, ty, dx, dy, s) {   // tip, unit dir (tip -> body)
  const bx = tx + dx * s, by = ty + dy * s, nx = -dy * s / 3, ny = dx * s / 3;
  return { k: 'poly', pts: [[tx, ty], [bx + nx, by + ny], [bx - nx, by - ny]], closed: true, fill: true };
}
G.prec = 2; G.view = { cx: 0, cy: 0, r: 1000 };
G.fmt = v => (Math.round(v * 1e6) / 1e6).toFixed(G.prec);
function dimInfo(d) {
  let a, b, val;
  if (d.mode === 'h') { a = [d.x1, d.oy]; b = [d.x2, d.oy]; val = Math.abs(d.x2 - d.x1); }
  else if (d.mode === 'v') { a = [d.ox, d.y1]; b = [d.ox, d.y2]; val = Math.abs(d.y2 - d.y1); }
  else {
    const L = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) || 1, ux = (d.x2 - d.x1) / L, uy = (d.y2 - d.y1) / L;
    const nx = -uy, ny = ux, k = (d.ox - d.x1) * nx + (d.oy - d.y1) * ny;
    a = [d.x1 + nx * k, d.y1 + ny * k]; b = [d.x2 + nx * k, d.y2 + ny * k]; val = L;
  }
  let nx = (a[0] + b[0]) / 2 - (d.x1 + d.x2) / 2, ny = (a[1] + b[1]) / 2 - (d.y1 + d.y2) / 2; const l = Math.hypot(nx, ny);
  if (l < 1e-12) { const L = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) || 1; nx = -(d.y2 - d.y1) / L; ny = (d.x2 - d.x1) / L; } else { nx /= l; ny /= l; }
  return { a, b, val, nx, ny };
}
G.dimInfo = dimInfo;
function textPrims(x, y, h, str, rot, anchor) {
  return String(str).split('|').map((t, i) => ({ k: 'text', x: x + Math.sin(rot) * i * h * 1.4, y: y - Math.cos(rot) * i * h * 1.4, h, str: t, rot, anchor }));
}
function dimPrims(d) {
  const h = d.h, o = [], { a, b, val } = dimInfo(d);
  [[d.x1, d.y1, a], [d.x2, d.y2, b]].forEach(([px, py, q]) => {
    const l = dist(px, py, q[0], q[1]);
    if (l > h * 0.3) { const ux = (q[0] - px) / l, uy = (q[1] - py) / l;
      o.push({ k: 'poly', pts: [[px + ux * h * 0.25, py + uy * h * 0.25], [q[0] + ux * h * 0.5, q[1] + uy * h * 0.5]] }); }
  });
  const L = dist(a[0], a[1], b[0], b[1]);
  o.push({ k: 'poly', pts: [a, b] });
  if (L > 1e-9) {
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    o.push(arrow(a[0], a[1], ux, uy, h), arrow(b[0], b[1], -ux, -uy, h));
    let ang = Math.atan2(uy, ux); if (ang > Math.PI / 2 + 1e-9 || ang <= -Math.PI / 2 + 1e-9) ang += Math.PI;
    const mx = (a[0] + b[0]) / 2 - Math.sin(ang) * h * 0.6, my = (a[1] + b[1]) / 2 + Math.cos(ang) * h * 0.6;
    o.push({ k: 'text', x: mx, y: my, h, str: d.txt ? d.txt : G.fmt(val), rot: ang, anchor: 'c' });
  }
  return o;
}
function rdimPrims(d) {
  const ang = Math.atan2(d.oy - d.cy, d.ox - d.cx), c = Math.cos(ang), s = Math.sin(ang), h = d.h;
  const px = d.cx + d.r * c, py = d.cy + d.r * s, o = [];
  const outside = dist(d.cx, d.cy, d.ox, d.oy) > d.r;
  o.push({ k: 'poly', pts: [d.dia ? [d.cx - d.r * c, d.cy - d.r * s] : [d.cx, d.cy], [px, py], [d.ox, d.oy]] });
  const dir = outside ? 1 : -1;
  o.push(arrow(px, py, c * dir, s * dir, h));
  if (d.dia) o.push(arrow(d.cx - d.r * c, d.cy - d.r * s, c, s, h));
  o.push({ k: 'text', x: d.ox + c * h * 0.3, y: d.oy + s * h * 0.3 + h * 0.2, h, str: d.txt ? d.txt : (d.dia ? '\u00D8' : 'R') + G.fmt(d.dia ? d.r * 2 : d.r), rot: 0, anchor: c >= 0 ? 'l' : 'r' });
  return o;
}
function adimPrims(d) {
  const h = d.h, span = normA(d.a2 - d.a1), o = [];
  o.push({ k: 'arc', cx: d.vx, cy: d.vy, r: d.r, a1: d.a1, a2: d.a2 });
  [d.a1, d.a2].forEach(a => o.push({ k: 'poly', pts: [[d.vx + Math.cos(a) * h * 0.25, d.vy + Math.sin(a) * h * 0.25], [d.vx + Math.cos(a) * (d.r + h * 0.5), d.vy + Math.sin(a) * (d.r + h * 0.5)]] }));
  o.push(arrow(d.vx + d.r * Math.cos(d.a1), d.vy + d.r * Math.sin(d.a1), -Math.sin(d.a1), Math.cos(d.a1), h));
  o.push(arrow(d.vx + d.r * Math.cos(d.a2), d.vy + d.r * Math.sin(d.a2), Math.sin(d.a2), -Math.cos(d.a2), h));
  const am = d.a1 + span / 2;
  o.push({ k: 'text', x: d.vx + (d.r + h * 1.2) * Math.cos(am), y: d.vy + (d.r + h * 1.2) * Math.sin(am), h, str: d.txt ? d.txt : G.fmt(span * 180 / Math.PI) + '\u00B0', rot: 0, anchor: 'c' });
  return o;
}
function ellPts(e, n) {
  n = n || 96; const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0), o = [];
  for (let i = 0; i < n; i++) { const t = TAU * i / n, x = e.rx * Math.cos(t), y = e.ry * Math.sin(t); o.push([e.cx + x * c - y * s, e.cy + x * s + y * c]); }
  return o;
}
function splinePts(P, closed, seg) {
  seg = seg || 14; const n = P.length; if (n < 3) return P.map(p => [p[0], p[1]]);
  const get = i => closed ? P[((i % n) + n) % n] : P[Math.max(0, Math.min(n - 1, i))], out = [], cnt = closed ? n : n - 1;
  for (let i = 0; i < cnt; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  if (!closed) out.push([P[n - 1][0], P[n - 1][1]]);
  return out;
}
G.ellPts = ellPts; G.splinePts = splinePts;

// ---------- hatch ----------
G.hatchSegs = function (hh) {
  const P = hh.pts, out = [];
  if (P.length < 3) return out;
  const angs = hh.pat === 'cross' ? [hh.ang, hh.ang + Math.PI / 2] : [hh.ang];
  angs.forEach(th => {
    const dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx;
    const pr = P.map(p => p[0] * nx + p[1] * ny), mn = Math.min(...pr), mx = Math.max(...pr);
    let sp = hh.sp; if ((mx - mn) / sp > 600) sp = (mx - mn) / 600;
    for (let k = Math.ceil(mn / sp); k * sp <= mx; k++) {
      const c = k * sp, xs = [];
      for (let i = 0; i < P.length; i++) {
        const A = P[i], B = P[(i + 1) % P.length], da = A[0] * nx + A[1] * ny - c, db = B[0] * nx + B[1] * ny - c;
        if ((da < 0 && db >= 0) || (db < 0 && da >= 0)) {
          const t = da / (da - db), x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t;
          xs.push([x * dx + y * dy, x, y]);
        }
      }
      xs.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i][1], xs[i][2], xs[i + 1][1], xs[i + 1][2]]);
    }
  });
  return out;
};
G.circlePoly = (cx, cy, r, n = 72) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(TAU * i / n), cy + r * Math.sin(TAU * i / n)]);

// ---------- primitives ----------
G.prims = function (e) {
  switch (e.type) {
    case 'line': return [{ k: 'poly', pts: [[e.x1, e.y1], [e.x2, e.y2]] }];
    case 'pline': return [{ k: 'poly', pts: e.pts, closed: e.closed }];
    case 'circle': return [{ k: 'arc', cx: e.cx, cy: e.cy, r: e.r, a1: 0, a2: TAU, full: true }];
    case 'arc': return [{ k: 'arc', cx: e.cx, cy: e.cy, r: e.r, a1: e.a1, a2: e.a2 }];
    case 'ell': return [{ k: 'poly', pts: ellPts(e), closed: true }];
    case 'spline': return [{ k: 'poly', pts: splinePts(e.pts, e.closed), closed: !!e.closed }];
    case 'point': return [{ k: 'pt', x: e.x, y: e.y }];
    case 'xline': {
      const V = G.view, L = dist(e.x, e.y, V.cx, V.cy) + V.r + 1, c = Math.cos(e.ang), s = Math.sin(e.ang);
      return [{ k: 'poly', pts: [e.ray ? [e.x, e.y] : [e.x - c * L, e.y - s * L], [e.x + c * L, e.y + s * L]] }];
    }
    case 'text': return textPrims(e.x, e.y, e.h, e.str, e.rot || 0, 'l');
    case 'leader': {
      const p = e.pts, o = [{ k: 'poly', pts: p }], l = p.length - 1;
      if (l >= 1) { const d = dist(p[0][0], p[0][1], p[1][0], p[1][1]) || 1; o.push(arrow(p[0][0], p[0][1], (p[1][0] - p[0][0]) / d, (p[1][1] - p[0][1]) / d, e.h)); }
      if (e.str) o.push(...textPrims(p[l][0] + e.h * 0.4, p[l][1] + e.h * 0.4, e.h, e.str, 0, 'l'));
      return o;
    }
    case 'hatch': {
      if (e.pat === 'solid' || e.pat === 'gradient') {
        const f = { k: 'poly', pts: e.pts, closed: true, fill: true }; if (e.pat === 'gradient') f.grad = e.ang || 0;
        return e.ring ? [f] : [f, { k: 'poly', pts: e.pts, closed: true, thin: true }];
      }
      return G.hatchSegs(e).map(s => ({ k: 'poly', pts: [[s[0], s[1]], [s[2], s[3]]], thin: true }));
    }
    case 'solid': return e.kind === 'extrude' || e.kind === 'box' ? [{ k: 'poly', pts: e.pts, closed: true }] : [{ k: 'arc', cx: e.cx, cy: e.cy, r: e.r, a1: 0, a2: TAU, full: true }];
    case 'attdef': return [{ k: 'text', x: e.x, y: e.y, h: e.h, str: '<' + e.tag + '>', rot: 0, anchor: 'l' }];
    case 'insert': return G.insertEnts(e).flatMap(x => G.prims(x));
    case 'dim': return dimPrims(e);
    case 'rdim': return rdimPrims(e);
    case 'adim': return adimPrims(e);
  }
  return [];
};
G.primDist = function (p, x, y) {
  if (p.k === 'poly') {
    let m = 1e18; const q = p.pts;
    for (let i = 0; i < q.length - 1; i++) m = Math.min(m, segDist(x, y, q[i][0], q[i][1], q[i + 1][0], q[i + 1][1]));
    if (p.closed && q.length > 2) m = Math.min(m, segDist(x, y, q[q.length - 1][0], q[q.length - 1][1], q[0][0], q[0][1]));
    return m;
  }
  if (p.k === 'arc') {
    if (p.full || inArcR(p.a1, p.a2, Math.atan2(y - p.cy, x - p.cx))) return Math.abs(dist(x, y, p.cx, p.cy) - p.r);
    return Math.min(dist(x, y, p.cx + p.r * Math.cos(p.a1), p.cy + p.r * Math.sin(p.a1)), dist(x, y, p.cx + p.r * Math.cos(p.a2), p.cy + p.r * Math.sin(p.a2)));
  }
  if (p.k === 'pt') return dist(x, y, p.x, p.y);
  const w = p.h * 0.55 * p.str.length, c = Math.cos(p.rot), s = Math.sin(p.rot);
  const off = p.anchor === 'c' ? -w / 2 : p.anchor === 'r' ? -w : 0;
  const x1 = p.x + c * off, y1 = p.y + s * off;
  return Math.max(0, segDist(x, y, x1, y1, x1 + c * w, y1 + s * w) - p.h * 0.5);
};
G.entDist = (e, x, y) => { let m = 1e18; for (const p of G.prims(e)) m = Math.min(m, G.primDist(p, x, y)); return m; };
G.bbox = function (es) {
  let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  es.forEach(e => e.type === 'xline' ? 0 : G.prims(e).forEach(p => {
    if (p.k === 'poly') p.pts.forEach(q => add(q[0], q[1]));
    else if (p.k === 'arc') { add(p.cx - p.r, p.cy - p.r); add(p.cx + p.r, p.cy + p.r); }
    else if (p.k === 'pt') add(p.x, p.y);
    else { const w = p.h * 0.55 * p.str.length; add(p.x, p.y); add(p.x + w * Math.cos(p.rot), p.y + w * Math.sin(p.rot)); add(p.x, p.y + p.h); }
  }));
  return x0 > x1 ? null : { x0, y0, x1, y1 };
};

// ---------- snap points ----------
G.snapPts = function (e) {
  const o = [];
  if (e.type === 'line') o.push([e.x1, e.y1, 'end'], [e.x2, e.y2, 'end'], [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2, 'mid']);
  else if (e.type === 'circle') o.push([e.cx, e.cy, 'cen'], [e.cx + e.r, e.cy, 'qua'], [e.cx - e.r, e.cy, 'qua'], [e.cx, e.cy + e.r, 'qua'], [e.cx, e.cy - e.r, 'qua']);
  else if (e.type === 'arc') o.push([e.cx, e.cy, 'cen'], [e.cx + e.r * Math.cos(e.a1), e.cy + e.r * Math.sin(e.a1), 'end'], [e.cx + e.r * Math.cos(e.a2), e.cy + e.r * Math.sin(e.a2), 'end'],
    [e.cx + e.r * Math.cos(e.a1 + normA(e.a2 - e.a1) / 2), e.cy + e.r * Math.sin(e.a1 + normA(e.a2 - e.a1) / 2), 'mid']);
  else if (e.type === 'pline') { e.pts.forEach(p => o.push([p[0], p[1], 'end'])); G.segsOf(e).forEach(s => o.push([(s[0] + s[2]) / 2, (s[1] + s[3]) / 2, 'mid'])); }
  else if (e.type === 'text') o.push([e.x, e.y, 'ins']);
  else if (e.type === 'dim') o.push([e.x1, e.y1, 'end'], [e.x2, e.y2, 'end']);
  else if (e.type === 'rdim') o.push([e.cx, e.cy, 'cen']);
  else if (e.type === 'adim') o.push([e.vx, e.vy, 'end']);
  else if (e.type === 'ell') { const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0); o.push([e.cx, e.cy, 'cen'], [e.cx + e.rx * c, e.cy + e.rx * s, 'qua'], [e.cx - e.rx * c, e.cy - e.rx * s, 'qua'], [e.cx - e.ry * s, e.cy + e.ry * c, 'qua'], [e.cx + e.ry * s, e.cy - e.ry * c, 'qua']); }
  else if (e.type === 'spline') e.pts.forEach(p => o.push([p[0], p[1], 'end']));
  else if (e.type === 'point') o.push([e.x, e.y, 'nod']);
  else if (e.type === 'xline') o.push([e.x, e.y, 'end']);
  else if (e.type === 'leader') e.pts.forEach(p => o.push([p[0], p[1], 'end']));
  else if (e.type === 'solid') { if (e.pts) e.pts.forEach(p => o.push([p[0], p[1], 'end'])); else o.push([e.cx, e.cy, 'cen']); }
  else if (e.type === 'attdef' || e.type === 'insert') o.push([e.x, e.y, 'ins']);
  return o;
};
G.segsOf = function (e) {
  if (e.type === 'line') return [[e.x1, e.y1, e.x2, e.y2]];
  if (e.type !== 'pline') return [];
  const p = e.pts, out = [];
  for (let i = 0; i < p.length - 1; i++) out.push([p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]]);
  if (e.closed && p.length > 2) out.push([p[p.length - 1][0], p[p.length - 1][1], p[0][0], p[0][1]]);
  return out;
};

// ---------- intersections ----------
function edgesOf(es) {
  const E = { segs: [], arcs: [] };
  es.forEach(e => {
    if (e.type === 'line' || e.type === 'pline') E.segs.push(...G.segsOf(e));
    else if (e.type === 'circle') E.arcs.push({ cx: e.cx, cy: e.cy, r: e.r, a1: 0, a2: TAU, full: true });
    else if (e.type === 'arc') E.arcs.push({ cx: e.cx, cy: e.cy, r: e.r, a1: e.a1, a2: e.a2 });
    else if (e.type === 'ell' || e.type === 'spline') { const pp = G.prims(e)[0], q = pp.pts; for (let i = 0; i < q.length - 1; i++) E.segs.push([q[i][0], q[i][1], q[i + 1][0], q[i + 1][1]]); if (pp.closed && q.length > 2) E.segs.push([q[q.length - 1][0], q[q.length - 1][1], q[0][0], q[0][1]]); }
  });
  return E;
}
G.edgesOf = edgesOf;
function lineSeg(P, Q, A, B) {
  const rx = Q[0] - P[0], ry = Q[1] - P[1], sx = B[0] - A[0], sy = B[1] - A[1], den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = A[0] - P[0], qy = A[1] - P[1], t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  return { t, x: P[0] + t * rx, y: P[1] + t * ry };
}
function lineCirc(P, Q, c) {
  const dx = Q[0] - P[0], dy = Q[1] - P[1], fx = P[0] - c.cx, fy = P[1] - c.cy;
  const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), cc = fx * fx + fy * fy - c.r * c.r, disc = b * b - 4 * a * cc;
  if (a < 1e-18 || disc < 0) return [];
  const sq = Math.sqrt(disc), ts = disc < 1e-12 ? [-b / (2 * a)] : [(-b - sq) / (2 * a), (-b + sq) / (2 * a)];
  return ts.map(t => ({ t, x: P[0] + dx * t, y: P[1] + dy * t }));
}
function circCirc(c1, c2) {
  const d = dist(c1.cx, c1.cy, c2.cx, c2.cy);
  if (d < 1e-12 || d > c1.r + c2.r + 1e-9 || d < Math.abs(c1.r - c2.r) - 1e-9) return [];
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
  const ux = (c2.cx - c1.cx) / d, uy = (c2.cy - c1.cy) / d, mx = c1.cx + ux * a, my = c1.cy + uy * a;
  return h < 1e-9 ? [[mx, my]] : [[mx - uy * h, my + ux * h], [mx + uy * h, my - ux * h]];
}
const onArc = (c, x, y) => c.full || inArcR(c.a1, c.a2, Math.atan2(y - c.cy, x - c.cx));
G.hitsOnLine = function (P, Q, E) {
  const ts = [];
  E.segs.forEach(s => { const h = lineSeg(P, Q, [s[0], s[1]], [s[2], s[3]]); if (h) ts.push(h.t); });
  E.arcs.forEach(c => lineCirc(P, Q, c).forEach(h => { if (onArc(c, h.x, h.y)) ts.push(h.t); }));
  return ts;
};
G.hitsOnCircle = function (c, E) {   // angles on circle c
  const an = [];
  E.segs.forEach(s => lineCirc([s[0], s[1]], [s[2], s[3]], c).forEach(h => { if (h.t >= -1e-9 && h.t <= 1 + 1e-9) an.push(normA(Math.atan2(h.y - c.cy, h.x - c.cx))); }));
  E.arcs.forEach(c2 => circCirc(c, c2).forEach(p => { if (onArc(c2, p[0], p[1])) an.push(normA(Math.atan2(p[1] - c.cy, p[0] - c.cx))); }));
  return an;
};
G.intersect = function (A, B) {
  const EA = edgesOf([A]), EB = edgesOf([B]), out = [];
  EA.segs.forEach(s => {
    EB.segs.forEach(q => { const h = lineSeg([s[0], s[1]], [s[2], s[3]], [q[0], q[1]], [q[2], q[3]]); if (h && h.t >= -1e-9 && h.t <= 1 + 1e-9) out.push([h.x, h.y]); });
    EB.arcs.forEach(c => lineCirc([s[0], s[1]], [s[2], s[3]], c).forEach(h => { if (h.t >= -1e-9 && h.t <= 1 + 1e-9 && onArc(c, h.x, h.y)) out.push([h.x, h.y]); }));
  });
  EA.arcs.forEach(c => {
    EB.segs.forEach(q => lineCirc([q[0], q[1]], [q[2], q[3]], c).forEach(h => { if (h.t >= -1e-9 && h.t <= 1 + 1e-9 && onArc(c, h.x, h.y)) out.push([h.x, h.y]); }));
    EB.arcs.forEach(c2 => circCirc(c, c2).forEach(p => { if (onArc(c, p[0], p[1]) && onArc(c2, p[0], p[1])) out.push(p); }));
  });
  return out;
};

// ---------- modify operations ----------
G.explode = function (e) {
  if (e.type === 'insert') return G.insertEnts(e);
  if (e.type === 'spline' || e.type === 'ell') { const pp = G.prims(e)[0]; return [{ type: 'pline', pts: pp.pts.map(q => [q[0], q[1]]), closed: !!pp.closed, layer: e.layer }]; }
  if (e.type !== 'pline') return null;
  return G.segsOf(e).map(s => Object.assign({}, e, { type: 'line', x1: s[0], y1: s[1], x2: s[2], y2: s[3], pts: undefined, closed: undefined }));
};
G.trim = function (e, others, px, py) {
  const E = edgesOf(others), eps = 1e-9;
  const pick = (vals, vp) => { let lo = null, hi = null; for (const t of vals) { if (t < vp - eps) lo = t; else if (t > vp + eps && hi === null) hi = t; } return [lo, hi]; };
  if (e.type === 'line') {
    const P = [e.x1, e.y1], dx = e.x2 - e.x1, dy = e.y2 - e.y1, L2 = dx * dx + dy * dy;
    const ts = G.hitsOnLine(P, [e.x2, e.y2], E).filter(t => t >= -eps && t <= 1 + eps).sort((a, b) => a - b);
    if (!ts.length || L2 < 1e-18) return null;
    const [lo, hi] = pick(ts, ((px - P[0]) * dx + (py - P[1]) * dy) / L2);
    if (lo === null && hi === null) return null;
    const mk = (a, b) => Object.assign({}, e, { x1: P[0] + dx * a, y1: P[1] + dy * a, x2: P[0] + dx * b, y2: P[1] + dy * b });
    const out = []; if (lo !== null && lo > eps) out.push(mk(0, lo)); if (hi !== null && hi < 1 - eps) out.push(mk(hi, 1)); return out;
  }
  if (e.type === 'circle') {
    const an = [...new Set(G.hitsOnCircle(e, E).map(a => +a.toFixed(9)))].sort((a, b) => a - b);
    if (an.length < 2) return null;
    const ap = normA(Math.atan2(py - e.cy, px - e.cx));
    let lo = an.filter(a => a < ap).pop(), hi = an.find(a => a > ap);
    if (lo === undefined) lo = an[an.length - 1]; if (hi === undefined) hi = an[0];
    return [Object.assign({}, e, { type: 'arc', a1: hi, a2: lo })];
  }
  if (e.type === 'arc') {
    const span = normA(e.a2 - e.a1) || TAU;
    const rel = G.hitsOnCircle(e, E).filter(a => inArcR(e.a1, e.a2, a)).map(a => normA(a - e.a1)).sort((a, b) => a - b);
    if (!rel.length) return null;
    const [lo, hi] = pick(rel, normA(Math.atan2(py - e.cy, px - e.cx) - e.a1));
    if (lo === null && hi === null) return null;
    const out = []; if (lo !== null && lo > eps) out.push(Object.assign({}, e, { a2: e.a1 + lo })); if (hi !== null && hi < span - eps) out.push(Object.assign({}, e, { a1: e.a1 + hi }));
    return out;
  }
  return null;
};
G.extend = function (e, others, px, py) {
  if (e.type !== 'line') return null;
  const endQ = dist(px, py, e.x2, e.y2) <= dist(px, py, e.x1, e.y1);
  const A = endQ ? [e.x1, e.y1] : [e.x2, e.y2], B = endQ ? [e.x2, e.y2] : [e.x1, e.y1];
  const ts = G.hitsOnLine(A, B, edgesOf(others)).filter(t => t > 1 + 1e-7).sort((a, b) => a - b);
  if (!ts.length) return null;
  const nx = A[0] + (B[0] - A[0]) * ts[0], ny = A[1] + (B[1] - A[1]) * ts[0];
  return Object.assign({}, e, endQ ? { x2: nx, y2: ny } : { x1: nx, y1: ny });
};
function infLine(A1, B1, A2, B2) {
  const rx = B1[0] - A1[0], ry = B1[1] - A1[1], sx = B2[0] - A2[0], sy = B2[1] - A2[1], den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((A2[0] - A1[0]) * sy - (A2[1] - A1[1]) * sx) / den;
  return [A1[0] + rx * t, A1[1] + ry * t];
}
G.infLine = infLine;
function offsetPline(pts0, closed, d) {
  const pts = pts0.filter((p, i) => i === 0 || dist(p[0], p[1], pts0[i - 1][0], pts0[i - 1][1]) > 1e-9);
  const n = pts.length; if (n < 2) return null;
  const cnt = closed ? n : n - 1, S = [];
  for (let i = 0; i < cnt; i++) {
    const A = pts[i], B = pts[(i + 1) % n], L = dist(A[0], A[1], B[0], B[1]), nx = -(B[1] - A[1]) / L * d, ny = (B[0] - A[0]) / L * d;
    S.push([[A[0] + nx, A[1] + ny], [B[0] + nx, B[1] + ny]]);
  }
  const out = [];
  if (closed) for (let i = 0; i < cnt; i++) { const p = S[(i - 1 + cnt) % cnt], q = S[i]; out.push(infLine(p[0], p[1], q[0], q[1]) || q[0]); }
  else { out.push(S[0][0]); for (let i = 1; i < cnt; i++) out.push(infLine(S[i - 1][0], S[i - 1][1], S[i][0], S[i][1]) || S[i][0]); out.push(S[cnt - 1][1]); }
  return out;
}
G.offset = function (e, d, px, py) {
  if (e.type === 'line') {
    const L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1); if (L < 1e-12) return null;
    const nx = -(e.y2 - e.y1) / L, ny = (e.x2 - e.x1) / L, sd = ((px - e.x1) * nx + (py - e.y1) * ny) >= 0 ? d : -d;
    return Object.assign({}, e, { x1: e.x1 + nx * sd, y1: e.y1 + ny * sd, x2: e.x2 + nx * sd, y2: e.y2 + ny * sd });
  }
  if (e.type === 'circle' || e.type === 'arc') {
    const r = dist(px, py, e.cx, e.cy) > e.r ? e.r + d : e.r - d; return r > 1e-9 ? Object.assign({}, e, { r }) : null;
  }
  if (e.type === 'pline') {
    let best = null, bd = 1e18;
    G.segsOf(e).forEach(s => { const dd = segDist(px, py, s[0], s[1], s[2], s[3]); if (dd < bd) { bd = dd; best = s; } });
    if (!best) return null;
    const L = Math.hypot(best[2] - best[0], best[3] - best[1]) || 1, nx = -(best[3] - best[1]) / L, ny = (best[2] - best[0]) / L;
    const sd = ((px - best[0]) * nx + (py - best[1]) * ny) >= 0 ? d : -d;
    const pts = offsetPline(e.pts, e.closed, sd); return pts ? Object.assign({}, e, { pts }) : null;
  }
  return null;
};
G.fillet = function (e1, p1, e2, p2, r, chamfer) {
  if (e1.type !== 'line' || e2.type !== 'line' || e1 === e2) return null;
  const P = infLine([e1.x1, e1.y1], [e1.x2, e1.y2], [e2.x1, e2.y1], [e2.x2, e2.y2]); if (!P) return null;
  const dir = (e, p) => { const l = Math.hypot(e.x2 - e.x1, e.y2 - e.y1), ux = (e.x2 - e.x1) / l, uy = (e.y2 - e.y1) / l, s = ((p[0] - P[0]) * ux + (p[1] - P[1]) * uy) >= 0 ? 1 : -1; return [ux * s, uy * s]; };
  const u1 = dir(e1, p1), u2 = dir(e2, p2), th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
  if (th < 1e-6 || th > Math.PI - 1e-6) return null;
  const t = chamfer ? r : r / Math.tan(th / 2);
  const T1 = [P[0] + u1[0] * t, P[1] + u1[1] * t], T2 = [P[0] + u2[0] * t, P[1] + u2[1] * t];
  const far = (e, u) => { const a = [e.x1, e.y1], b = [e.x2, e.y2]; return ((a[0] - P[0]) * u[0] + (a[1] - P[1]) * u[1]) > ((b[0] - P[0]) * u[0] + (b[1] - P[1]) * u[1]) ? a : b; };
  const f1 = far(e1, u1), f2 = far(e2, u2);
  if ((f1[0] - P[0]) * u1[0] + (f1[1] - P[1]) * u1[1] <= t + 1e-9 || (f2[0] - P[0]) * u2[0] + (f2[1] - P[1]) * u2[1] <= t + 1e-9) return null;
  const n1 = Object.assign({}, e1, { x1: T1[0], y1: T1[1], x2: f1[0], y2: f1[1] }), n2 = Object.assign({}, e2, { x1: T2[0], y1: T2[1], x2: f2[0], y2: f2[1] });
  let add = null;
  if (t > 1e-9) {
    if (chamfer) add = { type: 'line', x1: T1[0], y1: T1[1], x2: T2[0], y2: T2[1] };
    else {
      let bx = u1[0] + u2[0], by = u1[1] + u2[1]; const bl = Math.hypot(bx, by); bx /= bl; by /= bl;
      const cd = r / Math.sin(th / 2), C = [P[0] + bx * cd, P[1] + by * cd];
      const a = Math.atan2(T1[1] - C[1], T1[0] - C[0]), b = Math.atan2(T2[1] - C[1], T2[0] - C[0]);
      add = normA(b - a) <= Math.PI ? { type: 'arc', cx: C[0], cy: C[1], r, a1: a, a2: b } : { type: 'arc', cx: C[0], cy: C[1], r, a1: b, a2: a };
    }
  }
  return { e1: n1, e2: n2, add };
};

// ---------- transform ----------
G.tx = function (e, T) {
  const n = JSON.parse(JSON.stringify(e)), f = T.f, k = T.k || 1, rot = T.rot || 0, mir = T.mir; delete n.id;
  const mp = (kx, ky) => { const r = f(n[kx], n[ky]); n[kx] = r[0]; n[ky] = r[1]; };
  const ang = () => { if (mir != null) { const a1 = 2 * mir - n.a2, a2 = 2 * mir - n.a1; n.a1 = a1; n.a2 = a2; } else { n.a1 += rot; n.a2 += rot; } };
  switch (n.type) {
    case 'line': mp('x1', 'y1'); mp('x2', 'y2'); break;
    case 'pline': n.pts = n.pts.map(p => f(p[0], p[1])); break;
    case 'hatch': n.pts = n.pts.map(p => f(p[0], p[1])); n.sp *= k; n.ang = mir != null ? 2 * mir - n.ang : n.ang + rot; break;
    case 'circle': mp('cx', 'cy'); n.r *= k; break;
    case 'arc': mp('cx', 'cy'); n.r *= k; ang(); break;
    case 'text': mp('x', 'y'); n.h *= k; if (mir == null) n.rot = (n.rot || 0) + rot; break;
    case 'dim': mp('x1', 'y1'); mp('x2', 'y2'); mp('ox', 'oy'); n.h *= k; if (rot || mir != null) n.mode = 'a'; break;
    case 'rdim': mp('cx', 'cy'); mp('ox', 'oy'); n.r *= k; n.h *= k; break;
    case 'adim': mp('vx', 'vy'); n.r *= k; n.h *= k; ang(); break;
    case 'ell': mp('cx', 'cy'); n.rx *= k; n.ry *= k; n.rot = mir != null ? 2 * mir - (n.rot || 0) : (n.rot || 0) + rot; break;
    case 'spline': n.pts = n.pts.map(p => f(p[0], p[1])); break;
    case 'point': mp('x', 'y'); break;
    case 'xline': mp('x', 'y'); n.ang = mir != null ? 2 * mir - n.ang : n.ang + rot; break;
    case 'leader': n.pts = n.pts.map(p => f(p[0], p[1])); n.h *= k; break;
    case 'solid': if (n.pts) n.pts = n.pts.map(p => f(p[0], p[1])); else mp('cx', 'cy'); if (n.r) n.r *= k; n.h *= k; n.z = (n.z || 0) * k; break;
    case 'attdef': mp('x', 'y'); n.h *= k; break;
    case 'insert': mp('x', 'y'); n.sx = (n.sx || 1) * k; n.sy = (n.sy || 1) * k; n.dx = (n.dx || 0) * k; n.dy = (n.dy || 0) * k;
      if (mir != null) { n.rot = 2 * mir - (n.rot || 0); n.fy = !n.fy; } else n.rot = (n.rot || 0) + rot; break;
  }
  return n;
};
G.shift = (dx, dy) => ({ f: (x, y) => [x + dx, y + dy] });
G.rotAbout = (cx, cy, a) => ({ rot: a, f: (x, y) => { const c = Math.cos(a), s = Math.sin(a); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; } });
G.scaleAbout = (cx, cy, k) => ({ k, f: (x, y) => [cx + (x - cx) * k, cy + (y - cy) * k] });
G.mirrorAxis = (x1, y1, x2, y2) => {
  const a = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(2 * a), s = Math.sin(2 * a);
  return { mir: a, f: (x, y) => { const dx = x - x1, dy = y - y1; return [x1 + dx * c + dy * s, y1 + dx * s - dy * c]; } };
};
G.area = function (e) {
  if (e.type === 'circle') return { a: Math.PI * e.r * e.r, p: TAU * e.r };
  if (e.type === 'pline' && e.closed) {
    let a = 0, p = 0; const q = e.pts;
    for (let i = 0; i < q.length; i++) { const A = q[i], B = q[(i + 1) % q.length]; a += A[0] * B[1] - B[0] * A[1]; p += dist(A[0], A[1], B[0], B[1]); }
    return { a: Math.abs(a) / 2, p };
  }
  return null;
};


// ---------- extra tools: nearest / perpendicular / tangent ----------
G.nearestOn = function (e, x, y) {
  let best = null, bd = 1e18; const tryP = (px, py) => { const d = dist(x, y, px, py); if (d < bd) { bd = d; best = [px, py]; } };
  G.prims(e).forEach(p => {
    if (p.k === 'poly') {
      const q = p.pts, n = q.length, cnt = p.closed ? n : n - 1;
      for (let i = 0; i < cnt; i++) {
        const A = q[i], B = q[(i + 1) % n], dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy;
        let t = l2 ? ((x - A[0]) * dx + (y - A[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); tryP(A[0] + t * dx, A[1] + t * dy);
      }
    } else if (p.k === 'arc') {
      const a = Math.atan2(y - p.cy, x - p.cx);
      if (p.full || inArcR(p.a1, p.a2, a)) tryP(p.cx + p.r * Math.cos(a), p.cy + p.r * Math.sin(a));
      else { tryP(p.cx + p.r * Math.cos(p.a1), p.cy + p.r * Math.sin(p.a1)); tryP(p.cx + p.r * Math.cos(p.a2), p.cy + p.r * Math.sin(p.a2)); }
    }
  });
  return best;
};
G.perpPts = function (e, fx, fy) {
  const out = [];
  G.prims(e).forEach(p => {
    if (p.k === 'poly') {
      const q = p.pts, n = q.length, cnt = p.closed ? n : n - 1;
      for (let i = 0; i < cnt; i++) {
        const A = q[i], B = q[(i + 1) % n], dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy; if (l2 < 1e-18) continue;
        const t = ((fx - A[0]) * dx + (fy - A[1]) * dy) / l2; if (t >= 0 && t <= 1) out.push([A[0] + t * dx, A[1] + t * dy]);
      }
    } else if (p.k === 'arc') {
      const a = Math.atan2(fy - p.cy, fx - p.cx);
      [a, a + Math.PI].forEach(b => { if (p.full || inArcR(p.a1, p.a2, b)) out.push([p.cx + p.r * Math.cos(b), p.cy + p.r * Math.sin(b)]); });
    }
  });
  return out;
};
G.tanPts = function (e, fx, fy) {
  const out = [];
  G.prims(e).forEach(p => {
    if (p.k !== 'arc') return;
    const d = dist(fx, fy, p.cx, p.cy); if (d <= p.r + 1e-9) return;
    const a = Math.atan2(fy - p.cy, fx - p.cx), dl = Math.acos(p.r / d);
    [a + dl, a - dl].forEach(b => { if (p.full || inArcR(p.a1, p.a2, b)) out.push([p.cx + p.r * Math.cos(b), p.cy + p.r * Math.sin(b)]); });
  });
  return out;
};

// ---------- break / join / lengthen / divide ----------
const angOf = (e, p) => Math.atan2(p[1] - e.cy, p[0] - e.cx);
function arcRel(e, a) { const span = normA(e.a2 - e.a1) || TAU; let r = normA(a - e.a1); if (r > span) r = (r - span < TAU - r) ? span : 0; return r; }
function lineBreak(e, p1, p2) {
  const dx = e.x2 - e.x1, dy = e.y2 - e.y1, L2 = dx * dx + dy * dy; if (L2 < 1e-18) return null;
  const tp = p => Math.max(0, Math.min(1, ((p[0] - e.x1) * dx + (p[1] - e.y1) * dy) / L2));
  let a = tp(p1), b = tp(p2); if (a > b) { const t = a; a = b; b = t; }
  const mk = (s, t) => Object.assign({}, e, { x1: e.x1 + dx * s, y1: e.y1 + dy * s, x2: e.x1 + dx * t, y2: e.y1 + dy * t }), out = [];
  if (a > 1e-9) out.push(mk(0, a)); if (b < 1 - 1e-9) out.push(mk(b, 1)); return out;
}
function nearestPiece(pcs, p) { let best = 0, bd = 1e18; pcs.forEach((q, i) => { const d = G.entDist(q, p[0], p[1]); if (d < bd) { bd = d; best = i; } }); return best; }
G.breakEnt = function (e, p1, p2) {
  if (e.type === 'line') return lineBreak(e, p1, p2);
  if (e.type === 'circle') { const a = normA(angOf(e, p1)), b = normA(angOf(e, p2)); if (Math.abs(a - b) < 1e-9) return null; return [Object.assign({}, e, { type: 'arc', a1: b, a2: a })]; }
  if (e.type === 'arc') {
    const span = normA(e.a2 - e.a1) || TAU; let r1 = arcRel(e, angOf(e, p1)), r2 = arcRel(e, angOf(e, p2)); if (r1 > r2) { const t = r1; r1 = r2; r2 = t; }
    const out = []; if (r1 > 1e-9) out.push(Object.assign({}, e, { a2: e.a1 + r1 })); if (r2 < span - 1e-9) out.push(Object.assign({}, e, { a1: e.a1 + r2 })); return out;
  }
  if (e.type === 'pline') {
    const pcs = G.explode(e), i = nearestPiece(pcs, p1), r = lineBreak(pcs[i], p1, p2); if (!r) return null;
    pcs.splice(i, 1, ...r); return pcs;
  }
  return null;
};
G.breakAt = function (e, p) {
  if (e.type === 'line') { const a = Object.assign({}, e, { x2: p[0], y2: p[1] }), b = Object.assign({}, e, { x1: p[0], y1: p[1] }); return dist(e.x1, e.y1, p[0], p[1]) < 1e-9 || dist(e.x2, e.y2, p[0], p[1]) < 1e-9 ? null : [a, b]; }
  if (e.type === 'arc') { const a = e.a1 + arcRel(e, angOf(e, p)), span = normA(e.a2 - e.a1) || TAU; if (a - e.a1 < 1e-9 || a - e.a1 > span - 1e-9) return null; return [Object.assign({}, e, { a2: a }), Object.assign({}, e, { a1: a })]; }
  if (e.type === 'pline') { const pcs = G.explode(e), i = nearestPiece(pcs, p), r = G.breakAt(pcs[i], p); if (!r) return null; pcs.splice(i, 1, ...r); return pcs; }
  return null;
};
G.join = function (es, tol) {
  tol = tol || 1e-6; let items = [];
  es.forEach(e => {
    if (e.type === 'line') items.push({ pts: [[e.x1, e.y1], [e.x2, e.y2]], src: [e], layer: e.layer });
    else if (e.type === 'pline' && !e.closed) items.push({ pts: e.pts.map(p => [p[0], p[1]]), src: [e], layer: e.layer });
  });
  const near = (a, b) => dist(a[0], a[1], b[0], b[1]) <= tol; let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j], a0 = A.pts[0], a1 = A.pts[A.pts.length - 1], b0 = B.pts[0], b1 = B.pts[B.pts.length - 1]; let pts = null;
      if (near(a1, b0)) pts = A.pts.concat(B.pts.slice(1)); else if (near(a1, b1)) pts = A.pts.concat(B.pts.slice(0, -1).reverse());
      else if (near(a0, b1)) pts = B.pts.concat(A.pts.slice(1)); else if (near(a0, b0)) pts = B.pts.slice().reverse().concat(A.pts.slice(1));
      if (pts) { items.splice(j, 1); items[i] = { pts, src: A.src.concat(B.src), layer: A.layer }; changed = true; break outer; }
    }
  }
  const consumed = [], result = [];
  items.forEach(it => {
    if (it.src.length === 1) return; consumed.push(...it.src); let pts = it.pts, closed = false;
    if (pts.length > 2 && near(pts[0], pts[pts.length - 1])) { pts = pts.slice(0, -1); closed = true; }
    result.push({ type: 'pline', pts, closed, layer: it.layer });
  });
  return { consumed, result };
};
G.lengthen = function (e, delta, px, py) {
  if (e.type === 'line') {
    const endQ = dist(px, py, e.x2, e.y2) <= dist(px, py, e.x1, e.y1), L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1); if (L < 1e-12 || L + delta <= 1e-9) return null;
    const ux = (e.x2 - e.x1) / L, uy = (e.y2 - e.y1) / L;
    return Object.assign({}, e, endQ ? { x2: e.x2 + ux * delta, y2: e.y2 + uy * delta } : { x1: e.x1 - ux * delta, y1: e.y1 - uy * delta });
  }
  if (e.type === 'arc') {
    const span = normA(e.a2 - e.a1) || TAU, d = delta / e.r; if (span + d <= 1e-9 || span + d >= TAU) return null;
    const e2 = [e.cx + e.r * Math.cos(e.a2), e.cy + e.r * Math.sin(e.a2)], e1 = [e.cx + e.r * Math.cos(e.a1), e.cy + e.r * Math.sin(e.a1)];
    return dist(px, py, e2[0], e2[1]) <= dist(px, py, e1[0], e1[1]) ? Object.assign({}, e, { a2: e.a2 + d }) : Object.assign({}, e, { a1: e.a1 - d });
  }
  return null;
};
function pathOf(e) {
  if (e.type === 'line') { const L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1); return { len: L, closed: false, at: s => [e.x1 + (e.x2 - e.x1) * s / L, e.y1 + (e.y2 - e.y1) * s / L] }; }
  if (e.type === 'circle') return { len: TAU * e.r, closed: true, at: s => [e.cx + e.r * Math.cos(s / e.r), e.cy + e.r * Math.sin(s / e.r)] };
  if (e.type === 'arc') return { len: e.r * (normA(e.a2 - e.a1) || TAU), closed: false, at: s => [e.cx + e.r * Math.cos(e.a1 + s / e.r), e.cy + e.r * Math.sin(e.a1 + s / e.r)] };
  if (e.type === 'pline' || e.type === 'spline' || e.type === 'ell') {
    const pp = G.prims(e)[0], q = pp.pts.slice(); if (pp.closed) q.push(q[0]);
    const cum = [0]; for (let i = 1; i < q.length; i++) cum.push(cum[i - 1] + dist(q[i - 1][0], q[i - 1][1], q[i][0], q[i][1]));
    const len = cum[cum.length - 1];
    return { len, closed: !!pp.closed, at: s => { let i = 1; while (i < q.length - 1 && cum[i] < s) i++; const d = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / d; return [q[i - 1][0] + (q[i][0] - q[i - 1][0]) * t, q[i - 1][1] + (q[i][1] - q[i - 1][1]) * t]; } };
  }
  return null;
}
G.divide = function (e, n) {
  const P = pathOf(e); if (!P || !(n >= 2) || P.len < 1e-12) return null; const out = [];
  for (let i = P.closed ? 0 : 1; i < n; i++) out.push(P.at(P.len * i / n)); return out;
};
G.measure = function (e, d) {
  const P = pathOf(e); if (!P || !(d > 0)) return null; const out = [];
  for (let s = d; s < P.len - 1e-9 && out.length < 5000; s += d) out.push(P.at(s)); return out;
};
G.alignT = function (s1, s2, d1, d2, scale) {
  const a = Math.atan2(d2[1] - d1[1], d2[0] - d1[0]) - Math.atan2(s2[1] - s1[1], s2[0] - s1[0]);
  const k = scale ? dist(d1[0], d1[1], d2[0], d2[1]) / (dist(s1[0], s1[1], s2[0], s2[1]) || 1) : 1, c = Math.cos(a), s = Math.sin(a);
  return { rot: a, k, f: (x, y) => { const dx = (x - s1[0]) * k, dy = (y - s1[1]) * k; return [d1[0] + dx * c - dy * s, d1[1] + dx * s + dy * c]; } };
};

// ---------- selection by window / crossing ----------
function segRect(ax, ay, bx, by, r) {
  let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay, p = [-dx, dx, -dy, dy], q = [ax - r.x0, r.x1 - ax, ay - r.y0, r.y1 - ay];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-15) { if (q[i] < 0) return false; }
    else { const t = q[i] / p[i]; if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
  }
  return true;
}
G.crosses = function (e, r, crossing) {
  const bb = G.bbox([e]); if (!bb) return false;
  const inside = bb.x0 >= r.x0 && bb.x1 <= r.x1 && bb.y0 >= r.y0 && bb.y1 <= r.y1;
  if (!crossing) return inside; if (inside) return true;
  if (bb.x1 < r.x0 || bb.x0 > r.x1 || bb.y1 < r.y0 || bb.y0 > r.y1) return false;
  for (const p of G.prims(e)) {
    if (p.k === 'poly') {
      const q = p.pts; for (let i = 0; i < q.length - 1; i++) if (segRect(q[i][0], q[i][1], q[i + 1][0], q[i + 1][1], r)) return true;
      if (p.closed && q.length > 2 && segRect(q[q.length - 1][0], q[q.length - 1][1], q[0][0], q[0][1], r)) return true;
    } else if (p.k === 'arc') {
      const span = p.full ? TAU : (normA(p.a2 - p.a1) || TAU); let prev = null;
      for (let i = 0; i <= 48; i++) { const a = p.a1 + span * i / 48, x = p.cx + p.r * Math.cos(a), y = p.cy + p.r * Math.sin(a); if (prev && segRect(prev[0], prev[1], x, y, r)) return true; prev = [x, y]; }
    } else if (p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1) return true;
  }
  return false;
};

// ---------- grips / stretch ----------
G.grips = function (e) {
  const o = [], add = (x, y, k, i) => o.push({ x, y, k, i });
  switch (e.type) {
    case 'line': add(e.x1, e.y1, 'v', 0); add(e.x2, e.y2, 'v', 1); add((e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2, 'm'); break;
    case 'pline': case 'spline': case 'leader': e.pts.forEach((p, i) => add(p[0], p[1], 'v', i)); { const bb = G.bbox([e]); if (bb) add((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, 'm'); } break;
    case 'circle': add(e.cx, e.cy, 'm'); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(d => add(e.cx + d[0] * e.r, e.cy + d[1] * e.r, 'r')); break;
    case 'arc': add(e.cx, e.cy, 'm'); add(e.cx + e.r * Math.cos(e.a1), e.cy + e.r * Math.sin(e.a1), 'a1'); add(e.cx + e.r * Math.cos(e.a2), e.cy + e.r * Math.sin(e.a2), 'a2'); break;
    case 'ell': { const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0); add(e.cx, e.cy, 'm'); add(e.cx + e.rx * c, e.cy + e.rx * s, 'rx'); add(e.cx - e.ry * s, e.cy + e.ry * c, 'ry'); break; }
    case 'text': add(e.x, e.y, 'm'); break;
    case 'point': case 'xline': add(e.x, e.y, 'm'); break;
    case 'dim': add(e.x1, e.y1, 'p1'); add(e.x2, e.y2, 'p2'); add(e.ox, e.oy, 'o'); break;
    case 'rdim': add(e.ox, e.oy, 'o'); add(e.cx, e.cy, 'm'); break;
    case 'hatch': case 'solid': { const bb = G.bbox([e]); if (bb) add((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, 'm'); break; }
    case 'attdef': add(e.x, e.y, 'm'); break;
    case 'insert': G.insertGrips(e).forEach(g => o.push(g)); break;
    case 'adim': add(e.vx, e.vy, 'm'); break;
  }
  return o;
};
G.moveGrip = function (e, g, x, y) {
  const n = JSON.parse(JSON.stringify(e));
  switch (g.k) {
    case 'm': return G.tx(e, G.shift(x - g.x, y - g.y));
    case 'v': if (n.type === 'line') { if (g.i === 0) { n.x1 = x; n.y1 = y; } else { n.x2 = x; n.y2 = y; } } else n.pts[g.i] = [x, y]; break;
    case 'r': n.r = dist(n.cx, n.cy, x, y); if (!(n.r > 1e-9)) return null; break;
    case 'a1': n.a1 = Math.atan2(y - n.cy, x - n.cx); break;
    case 'a2': n.a2 = Math.atan2(y - n.cy, x - n.cx); break;
    case 'rx': n.rx = dist(n.cx, n.cy, x, y); n.rot = Math.atan2(y - n.cy, x - n.cx); if (!(n.rx > 1e-9)) return null; break;
    case 'ry': { const c = Math.cos(n.rot || 0), s = Math.sin(n.rot || 0); n.ry = Math.abs((x - n.cx) * -s + (y - n.cy) * c); if (!(n.ry > 1e-9)) return null; break; }
    case 'ix': case 'iy': {
      const c = Math.cos(n.rot || 0), s = Math.sin(n.rot || 0), ax = g.k === 'ix' ? [c * (n.fx ? -1 : 1), s * (n.fx ? -1 : 1)] : [-s * (n.fy ? -1 : 1), c * (n.fy ? -1 : 1)];
      const op = (g.x - n.x) * ax[0] + (g.y - n.y) * ax[1], np = (x - n.x) * ax[0] + (y - n.y) * ax[1]; if (Math.abs(op) < 1e-12 || np <= 0) return null;
      const f = np / op; if (g.k === 'ix') n.sx = Math.max(0.01, (n.sx || 1) * f); else n.sy = Math.max(0.01, (n.sy || 1) * f); break;
    }
    case 'iuni': { const od = Math.hypot(g.x - n.x, g.y - n.y), nd = Math.hypot(x - n.x, y - n.y); if (od < 1e-12 || nd < 1e-12) return null; const f = nd / od; n.sx = Math.max(0.01, (n.sx || 1) * f); n.sy = Math.max(0.01, (n.sy || 1) * f); break; }
    case 'irot': n.rot = (n.rot || 0) + Math.atan2(y - n.y, x - n.x) - Math.atan2(g.y - n.y, g.x - n.x); break;
    case 'p1': n.x1 = x; n.y1 = y; break; case 'p2': n.x2 = x; n.y2 = y; break; case 'o': n.ox = x; n.oy = y; break;
  }
  return n;
};
G.stretch = function (e, r, dx, dy) {
  const inn = (x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1, n = JSON.parse(JSON.stringify(e)); let hit = false;
  if (e.type === 'line') { if (inn(n.x1, n.y1)) { n.x1 += dx; n.y1 += dy; hit = true; } if (inn(n.x2, n.y2)) { n.x2 += dx; n.y2 += dy; hit = true; } return hit ? n : null; }
  if (e.type === 'pline' || e.type === 'spline' || e.type === 'leader') { n.pts.forEach(p => { if (inn(p[0], p[1])) { p[0] += dx; p[1] += dy; hit = true; } }); return hit ? n : null; }
  if (e.type === 'dim') { if (inn(n.x1, n.y1)) { n.x1 += dx; n.y1 += dy; hit = true; } if (inn(n.x2, n.y2)) { n.x2 += dx; n.y2 += dy; hit = true; } if (inn(n.ox, n.oy)) { n.ox += dx; n.oy += dy; hit = true; } return hit ? n : null; }
  return G.crosses(e, r, false) ? G.tx(e, G.shift(dx, dy)) : null;
};


// ---------- linked blocks (inserts) ----------
G.blocks = {};
G.insertEnts = function (e, depth) {
  depth = depth || 0; const b = G.blocks && G.blocks[e.name]; if (!b || depth > 3) return [];
  const bx = b.base[0], by = b.base[1], rows = Math.max(1, (e.rows | 0) || 1), cols = Math.max(1, (e.cols | 0) || 1), out = [];
  const sx = Math.abs(e.sx || 1) || 1, sy = Math.abs(e.sy || 1) || 1, sc = { k: (sx + sy) / 2, f: (x, y) => [bx + (x - bx) * sx, by + (y - by) * sy] };
  const ro = G.rotAbout(bx, by, e.rot || 0), sh = G.shift(e.x - bx, e.y - by);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) b.ents.forEach(b0 => {
    if (b0.vs && e.state && b0.vs !== e.state) return;
    let n = b0;
    if (b0.type === 'attdef') { const v = e.attrs && e.attrs[b0.tag] != null ? e.attrs[b0.tag] : (b0.def || ''); n = { type: 'text', x: b0.x, y: b0.y, h: b0.h, str: String(v), rot: 0, layer: b0.layer }; }
    n = G.tx(n, G.shift(j * (e.dx || 0), i * (e.dy || 0)));
    if (e.fx) n = G.tx(n, G.mirrorAxis(bx, by, bx, by + 1)); if (e.fy) n = G.tx(n, G.mirrorAxis(bx, by, bx + 1, by));
    n = G.tx(G.tx(G.tx(n, sc), ro), sh); if (!n.layer || n.layer === '0') n.layer = e.layer;
    if (n.type === 'insert') out.push(...G.insertEnts(n, depth + 1)); else out.push(n);
  });
  return out;
};
G.flat = es => { const o = []; es.forEach(e => { if (e.type === 'insert') o.push(...G.insertEnts(e)); else o.push(e); }); return o; };
G.insLoc = function (e, p) {
  const b = G.blocks[e.name], bx = b ? b.base[0] : 0, by = b ? b.base[1] : 0, x = (p[0] - bx) * (e.fx ? -1 : 1) * Math.abs(e.sx || 1), y = (p[1] - by) * (e.fy ? -1 : 1) * Math.abs(e.sy || 1), c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0);
  return [e.x + x * c - y * s, e.y + x * s + y * c];
};
G.blockStates = b => [...new Set((b ? b.ents : []).map(x => x.vs).filter(Boolean))];
G.insertGrips = function (e) {
  const b = G.blocks[e.name]; if (!b) return [{ x: e.x, y: e.y, k: 'm' }];
  const bb = G.bbox(b.ents.filter(x => x.type !== 'attdef' && x.type !== 'insert')) || { x0: b.base[0], y0: b.base[1], x1: b.base[0] + 1, y1: b.base[1] + 1 }, mx = (bb.x0 + bb.x1) / 2, my = (bb.y0 + bb.y1) / 2;
  const r = G.insLoc(e, [bb.x1, my]), t = G.insLoc(e, [mx, bb.y1]), c = G.insLoc(e, [bb.x1, bb.y1]), ro = G.insLoc(e, [bb.x1 + (bb.x1 - bb.x0) * 0.35 + 1e-6, my]);
  return [{ x: e.x, y: e.y, k: 'm' }, { x: r[0], y: r[1], k: 'ix' }, { x: t[0], y: t[1], k: 'iy' }, { x: c[0], y: c[1], k: 'iuni' }, { x: ro[0], y: ro[1], k: 'irot' }];
};

if (typeof module !== 'undefined') module.exports = G; else root.G = G;
})(this);
