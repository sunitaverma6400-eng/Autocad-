(function (root) {
'use strict';
const S = {}, TAU = Math.PI * 2;
const area = P => { let a = 0; for (let i = 0; i < P.length; i++) { const A = P[i], B = P[(i + 1) % P.length]; a += A[0] * B[1] - B[0] * A[1]; } return a / 2; };
const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const inTri = (p, a, b, c) => cr(a, b, p) >= -1e-12 && cr(b, c, p) >= -1e-12 && cr(c, a, p) >= -1e-12;
S.triangulate = function (P) {
  const n = P.length; if (n < 3) return [];
  const idx = [...Array(n).keys()], out = []; let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let found = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (cr(P[a], P[b], P[c]) <= 1e-12) continue;
      let bad = false; for (const k of idx) { if (k === a || k === b || k === c) continue; if (inTri(P[k], P[a], P[b], P[c])) { bad = true; break; } }
      if (!bad) { out.push([a, b, c]); idx.splice(i, 1); found = true; break; }
    }
    if (!found) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]); else for (let i = 1; i < idx.length - 1; i++) out.push([idx[0], idx[i], idx[i + 1]]);
  return out;
};
const circ = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(TAU * i / n), cy + r * Math.sin(TAU * i / n)]);
function extrude(pts, z0, h) {
  const P = pts.map(p => [p[0], p[1]]);
  if (P.length > 2 && Math.abs(P[0][0] - P[P.length - 1][0]) < 1e-9 && Math.abs(P[0][1] - P[P.length - 1][1]) < 1e-9) P.pop();
  if (P.length < 3 || !h) return [];
  if (h < 0) { z0 += h; h = -h; }
  if (area(P) < 0) P.reverse();
  const z1 = z0 + h, n = P.length, T = [];
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; T.push([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1]], [[a[0], a[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]]); }
  S.triangulate(P).forEach(t => {
    T.push([[P[t[0]][0], P[t[0]][1], z1], [P[t[1]][0], P[t[1]][1], z1], [P[t[2]][0], P[t[2]][1], z1]]);
    T.push([[P[t[0]][0], P[t[0]][1], z0], [P[t[2]][0], P[t[2]][1], z0], [P[t[1]][0], P[t[1]][1], z0]]);
  });
  return T;
}
function cone(cx, cy, r, z0, h) {
  if (!h) return []; if (h < 0) { z0 += h; h = -h; const m = cone(cx, cy, r, z0, h); return m.map(t => t.map(p => [p[0], p[1], 2 * z0 + h - p[2]]).reverse()); }
  const B = circ(cx, cy, r, 48), n = B.length, T = [];
  for (let i = 0; i < n; i++) { const a = B[i], b = B[(i + 1) % n]; T.push([[a[0], a[1], z0], [b[0], b[1], z0], [cx, cy, z0 + h]]); T.push([[cx, cy, z0], [b[0], b[1], z0], [a[0], a[1], z0]]); }
  return T;
}
function sphere(cx, cy, cz, r) {
  const LA = 12, LO = 24, T = [], pt = (i, j) => { const la = -Math.PI / 2 + Math.PI * i / LA, lo = TAU * j / LO; return [cx + r * Math.cos(la) * Math.cos(lo), cy + r * Math.cos(la) * Math.sin(lo), cz + r * Math.sin(la)]; };
  for (let i = 0; i < LA; i++) for (let j = 0; j < LO; j++) { const a = pt(i, j), b = pt(i, j + 1), c = pt(i + 1, j + 1), d = pt(i + 1, j); if (i > 0) T.push([a, b, c]); if (i < LA - 1) T.push([a, c, d]); }
  return T;
}
S.mesh = function (e) {
  const z = e.z || 0, h = e.h || 0;
  if (e.kind === 'extrude' || e.kind === 'box') return extrude(e.pts, z, h);
  if (e.kind === 'cyl') return extrude(circ(e.cx, e.cy, e.r, 48), z, h);
  if (e.kind === 'cone') return cone(e.cx, e.cy, e.r, z, h);
  if (e.kind === 'sph') return sphere(e.cx, e.cy, z + e.r, e.r);
  return [];
};
const normal = t => { const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], v = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(n[0], n[1], n[2]) || 1; return [n[0] / l, n[1] / l, n[2] / l]; };
S.normal = normal;
S.stl = function (tris, name) {
  const o = ['solid ' + (name || 'MyCAD')];
  tris.forEach(t => { const n = normal(t); o.push(`facet normal ${n[0]} ${n[1]} ${n[2]}`, ' outer loop'); t.forEach(p => o.push(`  vertex ${p[0]} ${p[1]} ${p[2]}`)); o.push(' endloop', 'endfacet'); });
  o.push('endsolid ' + (name || 'MyCAD')); return o.join('\n') + '\n';
};
S.bbox = function (tris) {
  let b = null; tris.forEach(t => t.forEach(p => { if (!b) b = { x0: p[0], y0: p[1], z0: p[2], x1: p[0], y1: p[1], z1: p[2] }; else { b.x0 = Math.min(b.x0, p[0]); b.y0 = Math.min(b.y0, p[1]); b.z0 = Math.min(b.z0, p[2]); b.x1 = Math.max(b.x1, p[0]); b.y1 = Math.max(b.y1, p[1]); b.z1 = Math.max(b.z1, p[2]); } }));
  return b;
};
// orthographic camera: az = rotation about Z (0 = front view looking along +Y), el = elevation (90 = top view)
S.camera = function (az, el) {
  const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  return (x, y, z) => { const x1 = x * ca - y * sa, y1 = x * sa + y * ca; return [x1, z * ce + y1 * se, y1 * ce - z * se]; };   // [screenX, screenUp, depth(far = bigger)]
};
if (typeof module !== 'undefined') module.exports = S; else root.S3 = S;
})(this);
