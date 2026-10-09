(function (root) {
'use strict';
const CON = {}, dist = Math.hypot;
CON.id = (doc, e) => { if (!e.id) { doc.settings.nid = (doc.settings.nid || 0) + 1; e.id = doc.settings.nid; } return e.id; };
CON.clean = function (doc) {
  const seen = new Set(); doc.ents.forEach(e => { if (e.id) { if (seen.has(e.id)) delete e.id; else seen.add(e.id); } });
  const n = doc.cons.length; doc.cons = doc.cons.filter(c => seen.has(c.a) && (c.b == null || seen.has(c.b))); return n - doc.cons.length;
};
const pt = (e, i) => i === 'c' ? [e.cx, e.cy] : [e['x' + (i + 1)], e['y' + (i + 1)]];
const setPt = (e, i, x, y) => { if (i === 'c') { e.cx = x; e.cy = y; } else { e['x' + (i + 1)] = x; e['y' + (i + 1)] = y; } };
const len = e => dist(e.x2 - e.x1, e.y2 - e.y1), ang = e => Math.atan2(e.y2 - e.y1, e.x2 - e.x1);
const half = x => { x = ((x % Math.PI) + Math.PI) % Math.PI; return x > Math.PI / 2 ? x - Math.PI : x; };
CON.valid = { H: ['line'], V: ['line'], LEN: ['line'], PAR: ['line', 'line'], PERP: ['line', 'line'], EQ: ['line', 'line'], RAD: ['circle|arc'], EQR: ['circle|arc', 'circle|arc'], CONC: ['circle|arc', 'circle|arc'], FIX: ['any'], COIN: ['line|circle|arc', 'line|circle|arc'] };
CON.solve = function (doc, iters) {
  if (!doc.cons || !doc.cons.length) return 0;
  CON.clean(doc); const M = {}; doc.ents.forEach(e => { if (e.id) M[e.id] = e; });
  const fixed = new Set(doc.cons.filter(c => c.t === 'FIX').map(c => c.a)), anch = {};
  doc.cons.forEach(c => { if (c.t === 'COIN' || c.t === 'CONC') { (anch[c.a] = anch[c.a] || new Set()).add(c.pa); (anch[c.b] = anch[c.b] || new Set()).add(c.pb); } });
  const pivot = e => { const a = anch[e.id]; if (a && a.has(0)) return pt(e, 0); if (a && a.has(1)) return pt(e, 1); return [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]; };
  const rot = (e, p, d) => { const c = Math.cos(d), s = Math.sin(d); [0, 1].forEach(i => { const q = pt(e, i), x = q[0] - p[0], y = q[1] - p[1]; setPt(e, i, p[0] + x * c - y * s, p[1] + x * s + y * c); }); };
  const scl = (e, p, k) => [0, 1].forEach(i => { const q = pt(e, i); setPt(e, i, p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k); });
  const step = c => {
    const a = M[c.a], b = c.b != null ? M[c.b] : null; if (!a) return 0;
    switch (c.t) {
      case 'H': case 'V': {
        if (fixed.has(a.id)) return 0; const h = c.t === 'H', k1 = h ? 'y1' : 'x1', k2 = h ? 'y2' : 'x2', an = anch[a.id], d = Math.abs(a[k1] - a[k2]);
        if (an && an.has(0) && !an.has(1)) a[k2] = a[k1]; else if (an && an.has(1) && !an.has(0)) a[k1] = a[k2]; else { const m = (a[k1] + a[k2]) / 2; a[k1] = a[k2] = m; } return d;
      }
      case 'LEN': { if (fixed.has(a.id)) return 0; const L = len(a); if (L < 1e-12) return 0; scl(a, pivot(a), c.v / L); return Math.abs(L - c.v); }
      case 'PAR': case 'PERP': {
        if (!b) return 0; const d = half(ang(a) + (c.t === 'PERP' ? Math.PI / 2 : 0) - ang(b)); if (Math.abs(d) < 1e-12) return 0;
        const fa = fixed.has(a.id), fb = fixed.has(b.id); if (fa && fb) return 0;
        const wb = fb ? 0 : (fa ? 1 : 0.5), wa = fa ? 0 : (fb ? 1 : 0.5);
        if (wb) rot(b, pivot(b), d * wb); if (wa) rot(a, pivot(a), -d * wa); return Math.abs(d) * 100;
      }
      case 'EQ': {
        if (!b) return 0; const la = len(a), lb = len(b), t = fixed.has(a.id) ? la : fixed.has(b.id) ? lb : (la + lb) / 2;
        if (!fixed.has(a.id) && la > 1e-12) scl(a, pivot(a), t / la); if (!fixed.has(b.id) && lb > 1e-12) scl(b, pivot(b), t / lb); return Math.abs(la - lb);
      }
      case 'COIN': case 'CONC': {
        if (!b) return 0; const A = pt(a, c.pa), B = pt(b, c.pb), d = dist(A[0] - B[0], A[1] - B[1]), fa = fixed.has(a.id), fb = fixed.has(b.id);
        if (d < 1e-12 || (fa && fb)) return d; if (fa) setPt(b, c.pb, A[0], A[1]); else if (fb) setPt(a, c.pa, B[0], B[1]); else { const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2; setPt(a, c.pa, mx, my); setPt(b, c.pb, mx, my); } return d;
      }
      case 'RAD': { if (fixed.has(a.id)) return 0; const d = Math.abs(a.r - c.v); a.r = c.v; return d; }
      case 'EQR': { if (!b) return 0; const d = Math.abs(a.r - b.r), t = fixed.has(a.id) ? a.r : fixed.has(b.id) ? b.r : (a.r + b.r) / 2; if (!fixed.has(a.id)) a.r = t; if (!fixed.has(b.id)) b.r = t; return d; }
    }
    return 0;
  };
  let it = 0; for (; it < (iters || 80); it++) { let m = 0; doc.cons.forEach(c => { m = Math.max(m, step(c)); }); if (m < 1e-9) break; }
  return it;
};
if (typeof module !== 'undefined') module.exports = CON; else root.CON = CON;
})(this);
