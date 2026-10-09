(function (root) {
'use strict';
const G = root.G || require('./geom.js'), S3 = root.S3 || require('./solid3d.js'), TAU = G.TAU, normA = G.normA, dist = G.dist;
const IO = {};
const LT_DXF = { cont: 'CONTINUOUS', dash: 'DASHED', center: 'CENTER', hidden: 'HIDDEN' };
const LT_KEY = { DASHED: 'dash', DASHDOT: 'center', CENTER: 'center', HIDDEN: 'hidden', DASHDOT2: 'center', CONTINUOUS: 'cont' };
const UNIT_MM = { mm: 1, cm: 10, m: 1000, in: 25.4 }, UNIT_DXF = { in: 1, mm: 4, cm: 5, m: 6 };
const deg = a => a * 180 / Math.PI;
const SET = d => Object.assign({ prec: 2, unit: 'mm', ltscale: 1 }, d.settings || {});

function setView(es) {
  const bb = G.bbox(es.filter(e => e.type !== 'xline'));
  G.view = bb ? { cx: (bb.x0 + bb.x1) / 2, cy: (bb.y0 + bb.y1) / 2, r: Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0) } : { cx: 0, cy: 0, r: 100 };
}

IO.toDXF = function (doc) {
  const set = SET(doc), o = [], p = (c, v) => o.push(c, v);
  G.blocks = doc.blocks || {}; setView(doc.ents);
  p(0, 'SECTION'); p(2, 'HEADER'); p(9, '$ACADVER'); p(1, 'AC1009'); p(9, '$INSUNITS'); p(70, UNIT_DXF[set.unit] || 4); p(9, '$LTSCALE'); p(40, set.ltscale); p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'TABLES');
  p(0, 'TABLE'); p(2, 'LTYPE'); p(70, 4);
  p(0, 'LTYPE'); p(2, 'CONTINUOUS'); p(70, 0); p(3, 'Solid line'); p(72, 65); p(73, 0); p(40, 0);
  p(0, 'LTYPE'); p(2, 'DASHED'); p(70, 0); p(3, 'Dashed'); p(72, 65); p(73, 2); p(40, 0.75); p(49, 0.5); p(49, -0.25);
  p(0, 'LTYPE'); p(2, 'HIDDEN'); p(70, 0); p(3, 'Hidden'); p(72, 65); p(73, 2); p(40, 0.375); p(49, 0.25); p(49, -0.125);
  p(0, 'LTYPE'); p(2, 'CENTER'); p(70, 0); p(3, 'Center'); p(72, 65); p(73, 4); p(40, 2); p(49, 1.25); p(49, -0.25); p(49, 0.25); p(49, -0.25);
  p(0, 'ENDTAB');
  p(0, 'TABLE'); p(2, 'LAYER'); p(70, doc.layers.length);
  doc.layers.forEach(l => { p(0, 'LAYER'); p(2, l.name); p(70, l.lock ? 4 : 0); p(62, l.vis ? l.color : -l.color); p(6, LT_DXF[l.lt] || 'CONTINUOUS'); });
  p(0, 'ENDTAB');
  p(0, 'TABLE'); p(2, 'STYLE'); p(70, 1); p(0, 'STYLE'); p(2, 'STANDARD'); p(70, 0); p(40, 0); p(41, 1); p(50, 0); p(71, 0); p(42, 2.5); p(3, 'txt'); p(4, ''); p(0, 'ENDTAB');
  p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'ENTITIES');
  G.flat(doc.ents).forEach(e => {
    const L = e.layer || '0', lay = () => { p(8, L); if (e.color) p(62, e.color); if (e.lt) p(6, LT_DXF[e.lt] || 'CONTINUOUS'); };
    if (e.type === 'solid') { S3.mesh(e).forEach(t => { p(0, '3DFACE'); lay(); [0, 1, 2, 2].forEach((k, i) => { p(10 + i, t[k][0]); p(20 + i, t[k][1]); p(30 + i, t[k][2]); }); }); return; }
    G.prims(e).forEach(pr => {
      if (pr.k === 'poly') {
        if (pr.pts.length === 2 && !pr.closed) { p(0, 'LINE'); lay(); p(10, pr.pts[0][0]); p(20, pr.pts[0][1]); p(30, 0); p(11, pr.pts[1][0]); p(21, pr.pts[1][1]); p(31, 0); }
        else { p(0, 'POLYLINE'); lay(); p(66, 1); p(70, pr.closed ? 1 : 0); p(10, 0); p(20, 0); p(30, 0);
          pr.pts.forEach(v => { p(0, 'VERTEX'); p(8, L); p(10, v[0]); p(20, v[1]); p(30, 0); }); p(0, 'SEQEND'); p(8, L); }
      } else if (pr.k === 'arc') {
        if (pr.full) { p(0, 'CIRCLE'); lay(); p(10, pr.cx); p(20, pr.cy); p(30, 0); p(40, pr.r); }
        else { p(0, 'ARC'); lay(); p(10, pr.cx); p(20, pr.cy); p(30, 0); p(40, pr.r); p(50, deg(normA(pr.a1))); p(51, deg(normA(pr.a2))); }
      } else if (pr.k === 'pt') { p(0, 'POINT'); lay(); p(10, pr.x); p(20, pr.y); p(30, 0); }
      else {
        const w = pr.h * 0.55 * pr.str.length, off = pr.anchor === 'c' ? -w / 2 : pr.anchor === 'r' ? -w : 0;
        p(0, 'TEXT'); lay(); p(10, pr.x + Math.cos(pr.rot) * off); p(20, pr.y + Math.sin(pr.rot) * off); p(30, 0); p(40, pr.h); p(1, pr.str); p(50, deg(pr.rot || 0));
      }
    });
  });
  p(0, 'ENDSEC'); p(0, 'EOF');
  return o.join('\n') + '\n';
};

// ---------- DXF import ----------
IO.parseDXF = function (text) {
  const L = text.split(/\r?\n/), pr = [];
  for (let i = 0; i + 1 < L.length; i += 2) pr.push([parseInt(L[i].trim(), 10), L[i + 1].trim()]);
  const layers = [], seen = new Set();
  const addLayer = (name, color, vis, lt, lock) => { if (seen.has(name)) return; seen.add(name); layers.push({ name, color: color >= 1 && color <= 7 ? color : 7, vis, lock: !!lock, lt: lt || 'cont', lw: 1 }); };
  for (let i = 0; i < pr.length; i++) if (pr[i][0] === 0 && pr[i][1] === 'LAYER') {
    let name = '0', col = 7, lt = 'cont', flags = 0;
    for (let j = i + 1; j < pr.length && pr[j][0] !== 0; j++) {
      if (pr[j][0] === 2) name = pr[j][1]; else if (pr[j][0] === 62) col = parseInt(pr[j][1], 10);
      else if (pr[j][0] === 6) lt = LT_KEY[pr[j][1].toUpperCase()] || 'cont'; else if (pr[j][0] === 70) flags = parseInt(pr[j][1], 10);
    }
    addLayer(name, Math.abs(col), col >= 0 && !(flags & 1), lt, flags & 4);
  }
  addLayer('0', 7, true, 'cont', false);
  // sections
  const STRUCT = new Set(['SECTION', 'ENDSEC', 'EOF', 'TABLE', 'ENDTAB', 'BLOCK', 'ENDBLK']);
  const main = [], blocks = {}; let sec = '', blk = null, c = null;
  const flush = () => { if (c) { (blk ? blk.raw : main).push(c); c = null; } };
  for (let i = 0; i < pr.length; i++) {
    const [code, val] = pr[i];
    if (code === 0) {
      if (STRUCT.has(val)) {
        flush();
        if (val === 'SECTION') { sec = pr[i + 1] && pr[i + 1][0] === 2 ? pr[i + 1][1] : ''; i++; }
        else if (val === 'ENDSEC') { sec = ''; blk = null; }
        else if (val === 'BLOCK' && sec === 'BLOCKS') { blk = { name: '', base: [0, 0], raw: [] }; for (let j = i + 1; j < pr.length && pr[j][0] !== 0; j++) { if (pr[j][0] === 2) blk.name = pr[j][1]; else if (pr[j][0] === 10) blk.base[0] = parseFloat(pr[j][1]); else if (pr[j][0] === 20) blk.base[1] = parseFloat(pr[j][1]); } blocks[blk.name] = blk; }
        else if (val === 'ENDBLK') blk = null;
      } else if (sec === 'ENTITIES' || (sec === 'BLOCKS' && blk)) { flush(); c = { t: val, d: [] }; }
    } else if (c) c.d.push([code, val]);
  }
  flush();
  const rad = a => a * Math.PI / 180, out = []; let skipped = 0;
  const f = (d, k) => { const r = d.find(x => x[0] === k); return r ? parseFloat(r[1]) : 0; };
  const has = (d, k) => d.some(x => x[0] === k);
  const s = (d, k) => { const r = d.find(x => x[0] === k); return r ? r[1] : ''; };
  function convert(raw, sink, depth) {
    let poly = null;
    const push = (e, d) => {
      const ln = s(d, 8) || '0'; addLayer(ln, 7, true, 'cont', false); e.layer = ln;
      const col = has(d, 62) ? f(d, 62) : 0; if (col >= 1 && col <= 7) e.color = col;
      const lt = LT_KEY[s(d, 6).toUpperCase()]; if (lt) e.lt = lt;
      sink.push(e);
    };
    raw.forEach(r => {
      const d = r.d;
      if (r.t === 'LINE') push({ type: 'line', x1: f(d, 10), y1: f(d, 20), x2: f(d, 11), y2: f(d, 21) }, d);
      else if (r.t === 'CIRCLE') push({ type: 'circle', cx: f(d, 10), cy: f(d, 20), r: f(d, 40) }, d);
      else if (r.t === 'ARC') push({ type: 'arc', cx: f(d, 10), cy: f(d, 20), r: f(d, 40), a1: rad(f(d, 50)), a2: rad(f(d, 51)) }, d);
      else if (r.t === 'POINT') push({ type: 'point', x: f(d, 10), y: f(d, 20) }, d);
      else if (r.t === 'LWPOLYLINE') {
        const xs = d.filter(x => x[0] === 10).map(x => parseFloat(x[1])), ys = d.filter(x => x[0] === 20).map(x => parseFloat(x[1]));
        if (xs.length > 1) push({ type: 'pline', pts: xs.map((x, k) => [x, ys[k]]), closed: (f(d, 70) & 1) === 1 }, d);
      } else if (r.t === 'POLYLINE') { poly = { type: 'pline', pts: [], closed: (f(d, 70) & 1) === 1 }; poly._d = d; }
      else if (r.t === 'VERTEX' && poly) poly.pts.push([f(d, 10), f(d, 20)]);
      else if (r.t === 'SEQEND' && poly) { const dd = poly._d; delete poly._d; if (poly.pts.length > 1) push(poly, dd); poly = null; }
      else if (r.t === 'TEXT' || r.t === 'MTEXT') {
        let str = s(d, 1); if (r.t === 'MTEXT') str = str.replace(/\\P/g, '|').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '');
        if (str) push({ type: 'text', x: f(d, 10), y: f(d, 20), h: f(d, 40) || 2.5, str, rot: rad(f(d, 50)) }, d);
      } else if (r.t === 'ELLIPSE') {
        const mx = f(d, 11), my = f(d, 21), rx = Math.hypot(mx, my), ratio = f(d, 40) || 1, a1 = f(d, 41), a2 = f(d, 42) || TAU;
        if (rx > 0 && Math.abs(a2 - a1 - TAU) < 1e-6) push({ type: 'ell', cx: f(d, 10), cy: f(d, 20), rx, ry: rx * ratio, rot: Math.atan2(my, mx) }, d);
        else skipped++;
      } else if (r.t === 'SPLINE') {
        const ks = has(d, 11) ? [11, 21] : [10, 20], xs = d.filter(x => x[0] === ks[0]).map(x => parseFloat(x[1])), ys = d.filter(x => x[0] === ks[1]).map(x => parseFloat(x[1]));
        if (xs.length > 1) push({ type: 'spline', pts: xs.map((x, k) => [x, ys[k]]), closed: (f(d, 70) & 1) === 1 }, d); else skipped++;
      } else if ((r.t === 'INSERT' || r.t === 'DIMENSION') && depth < 4) {
        const nm = s(d, 2), b = blocks[nm];
        if (!b) { skipped++; return; }
        const sub = []; convert(b.raw, sub, depth + 1);
        const isIns = r.t === 'INSERT', sx = isIns ? (has(d, 41) ? f(d, 41) : 1) : 1, sy = isIns ? (has(d, 42) ? f(d, 42) : 1) : 1, rot = isIns ? rad(f(d, 50)) : 0;
        const ix = isIns ? f(d, 10) : 0, iy = isIns ? f(d, 20) : 0, c0 = Math.cos(rot), s0 = Math.sin(rot), k = (Math.abs(sx) + Math.abs(sy)) / 2 || 1;
        const T = { rot, k, f: (x, y) => { const dx = (x - b.base[0]) * sx, dy = (y - b.base[1]) * sy; return [ix + dx * c0 - dy * s0, iy + dx * s0 + dy * c0]; } };
        const ln = s(d, 8) || '0';
        sub.forEach(e => { const n = G.tx(e, T); if (!n.layer || n.layer === '0') { n.layer = ln; addLayer(ln, 7, true, 'cont', false); } sink.push(n); });
      } else if (r.t !== 'VERTEX' && r.t !== 'SEQEND') skipped++;
    });
  }
  convert(main, out, 0);
  return { ents: out, layers, skipped };
};

// ---------- PDF ----------
const PAPER = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] }, PT = 72 / 25.4;
const rgb = (c, light) => { if (!c || c === 7) return light ? '0.6 0.6 0.6' : '0 0 0'; const hx = G.ACI[c].slice(1); return [0, 2, 4].map(i => { const v = parseInt(hx.substr(i, 2), 16) / 255 * 0.8; return (light ? v + (1 - v) * 0.6 : v).toFixed(3); }).join(' '); };
const LWMM = { 0: 0.18, 1: 0.35, 2: 0.7 }, DASH = { cont: [], dash: [2, 1.2], center: [5, 1.2, 1, 1.2], hidden: [1.2, 1.2] };
const esc = t => String(t).replace(/[^\x20-\xFF]/g, '?').replace(/([()\\])/g, '\\$1');
const mm = v => (v * PT).toFixed(2);
function textOp(str, xmm, ymm, szmm, rot, anchor) {
  const sz = Math.max(szmm * PT, 2), tw = 0.52 * sz * str.length, off = anchor === 'c' ? -tw / 2 : anchor === 'r' ? -tw : 0, c = Math.cos(rot), sn = Math.sin(rot);
  return `BT /F1 ${sz.toFixed(2)} Tf ${c.toFixed(4)} ${sn.toFixed(4)} ${(-sn).toFixed(4)} ${c.toFixed(4)} ${(xmm * PT + c * off).toFixed(2)} ${(ymm * PT + sn * off).toFixed(2)} Tm (${esc(str)}) Tj ET`;
}
function emitEnts(o, es, lay, set, s, ox, oy) {
  const X = x => ((x * s + ox) * PT).toFixed(2), Y = y => ((y * s + oy) * PT).toFixed(2);
  es.forEach(e => {
    const l = lay[e.layer] || { color: 7, lt: 'cont', lw: 1, vis: true }; if (l.vis === false) return;
    const col = e.color || l.color, lt = e.lt || l.lt, lw = e.lw != null ? e.lw : l.lw, dash = (DASH[lt] || []).map(v => (v * (set.ltscale || 1) * PT).toFixed(2));
    G.prims(e).forEach(pr => {
      if (pr.k === 'pt') { const x = pr.x * s + ox, y = pr.y * s + oy; o.push(`${rgb(col)} RG 0.35 w [] 0 d ${mm(x - 1)} ${mm(y)} m ${mm(x + 1)} ${mm(y)} l S ${mm(x)} ${mm(y - 1)} m ${mm(x)} ${mm(y + 1)} l S`); return; }
      if (pr.k === 'text') { o.push(`${rgb(col)} rg`); o.push(textOp(pr.str, pr.x * s + ox, pr.y * s + oy, pr.h * s, pr.rot, pr.anchor)); return; }
      o.push(`${rgb(col)} RG ${rgb(col, pr.grad !== undefined)} rg ${(LWMM[lw] || 0.35) * (pr.thin ? 0.6 : 1) * PT} w ${pr.thin || !dash.length ? '[] 0 d' : '[' + dash.join(' ') + '] 0 d'}`);
      if (pr.k === 'poly') { pr.pts.forEach((q, i) => o.push(`${X(q[0])} ${Y(q[1])} ${i ? 'l' : 'm'}`)); o.push(pr.fill ? 'h f' : pr.closed ? 'h S' : 'S'); }
      else {
        const span = pr.full ? TAU : (normA(pr.a2 - pr.a1) || TAU), n = Math.max(1, Math.ceil(span / (Math.PI / 2))), st = span / n, k = 4 / 3 * Math.tan(st / 4);
        for (let i = 0; i < n; i++) {
          const a = pr.a1 + i * st, b = a + st, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
          if (!i) o.push(`${X(pr.cx + pr.r * ca)} ${Y(pr.cy + pr.r * sa)} m`);
          o.push([pr.cx + pr.r * (ca - k * sa), pr.cy + pr.r * (sa + k * ca), pr.cx + pr.r * (cb + k * sb), pr.cy + pr.r * (sb - k * cb), pr.cx + pr.r * cb, pr.cy + pr.r * sb].map((v, j) => j % 2 ? Y(v) : X(v)).join(' ') + ' c');
        }
        o.push('S');
      }
    });
  });
}
function frameOps(o, pw, ph, M, TB, title, info, date) {
  o.push('0 0 0 RG 0 0 0 rg [] 0 d 0.7 w', `${mm(M)} ${mm(M)} ${mm(pw - 2 * M)} ${mm(ph - 2 * M)} re S`);
  const tx0 = pw - M - 100, ty0 = M;
  o.push(`${mm(tx0)} ${mm(ty0)} ${mm(100)} ${mm(TB)} re S 0.35 w ${mm(tx0)} ${mm(ty0 + 11)} m ${mm(tx0 + 100)} ${mm(ty0 + 11)} l S ${mm(tx0 + 62)} ${mm(ty0)} m ${mm(tx0 + 62)} ${mm(ty0 + 11)} l S`);
  o.push(textOp(title || 'Drawing', tx0 + 3, ty0 + 14.5, 5, 0, 'l'), textOp(info, tx0 + 3, ty0 + 4, 3.2, 0, 'l'), textOp(date || '', tx0 + 65, ty0 + 4, 3.2, 0, 'l'));
}
function assemble(pages) {
  const n = pages.length, fontNo = 3 + 2 * n, objs = ['<</Type/Catalog/Pages 2 0 R>>', `<</Type/Pages/Kids[${pages.map((_, i) => (3 + 2 * i) + ' 0 R').join(' ')}]/Count ${n}>>`];
  pages.forEach((pg, i) => {
    objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${(pg.pw * PT).toFixed(2)} ${(pg.ph * PT).toFixed(2)}]/Contents ${4 + 2 * i} 0 R/Resources<</Font<</F1 ${fontNo} 0 R>>>>>>`);
    objs.push(`<</Length ${pg.stream.length}>>\nstream\n${pg.stream}\nendstream`);
  });
  objs.push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>');
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((b, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${b}\nendobj\n`; });
  const xr = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(v => String(v).padStart(10, '0') + ' 00000 n \n').join('');
  return out + `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xr}\n%%EOF\n`;
}
IO.paperDims = function (sh) {
  let [pw, ph] = PAPER[String(sh.paper || 'A4').toUpperCase()] || PAPER.A4;
  if (sh.land === false) { if (pw > ph) [pw, ph] = [ph, pw]; } else if (pw < ph) [pw, ph] = [ph, pw];
  return [pw, ph];
};
IO.niceRatio = function (r) {
  if (!(r > 0)) return 1; const mag = Math.pow(10, Math.floor(Math.log10(r)));
  for (const m of [1, 2, 2.5, 5, 10, 20, 25, 50, 100]) if (m * mag >= r - 1e-9) return m * mag; return 100 * mag;
};
const layMap = doc => { const m = {}; doc.layers.forEach(l => m[l.name] = l); return m; };
IO.toPDF = function (doc, opt) {
  opt = opt || {}; const set = SET(doc), lay = layMap(doc); G.blocks = doc.blocks || {};
  const es = G.flat((opt.ents || doc.ents).filter(e => (lay[e.layer] || { vis: true }).vis));
  setView(es);
  const bb = G.bbox(es) || { x0: 0, y0: 0, x1: 100, y1: 100 }, w = Math.max(bb.x1 - bb.x0, 1e-6), h = Math.max(bb.y1 - bb.y0, 1e-6), uMM = UNIT_MM[set.unit] || 1;
  let [pw, ph] = PAPER[String(opt.paper || 'A4').toUpperCase()] || PAPER.A4; const land = w >= h; if (land && pw < ph) [pw, ph] = [ph, pw];
  const M = 10, TB = 22, aw = pw - 2 * M - 4, ah = ph - 2 * M - TB - 6; let s = Math.min(aw / w, ah / h), fits = true, label;
  if (opt.ratio > 0) { s = uMM / opt.ratio; fits = w * s <= aw + 1e-6 && h * s <= ah + 1e-6; label = '1:' + opt.ratio; } else label = '1:' + (Math.round(uMM / s * 100) / 100);
  const ox = M + 2 + (aw - w * s) / 2 - bb.x0 * s, oy = M + TB + 4 + (ah - h * s) / 2 - bb.y0 * s, o = [];
  frameOps(o, pw, ph, M, TB, opt.title, 'Scale ' + label + '   Unit ' + set.unit, opt.date);
  emitEnts(o, es, lay, set, s, ox, oy);
  return { pdf: assemble([{ pw, ph, stream: o.join('\n') }]), fits, scaleLabel: label };
};
IO.toPDFSheets = function (doc, opt) {
  opt = opt || {}; const set = SET(doc), lay = layMap(doc), sheets = doc.sheets || []; if (!sheets.length) return null; G.blocks = doc.blocks || {};
  const uMM = UNIT_MM[set.unit] || 1, pages = [], all = G.flat(doc.ents);
  sheets.forEach((sh, si) => {
    let [pw, ph] = PAPER[String(sh.paper || 'A4').toUpperCase()] || PAPER.A4;
    if (sh.land === false) { if (pw > ph) [pw, ph] = [ph, pw]; } else if (pw < ph) [pw, ph] = [ph, pw];
    const M = 10, TB = 22, o = [], ax = M + 2, ay = M + TB + 4, aw = pw - 2 * M - 4, ah = ph - 2 * M - TB - 6;
    frameOps(o, pw, ph, M, TB, sh.title || sh.name, `Sheet ${si + 1}/${sheets.length}   Unit ${set.unit}`, opt.date);
    let vps = sh.vps || [];
    if (!vps.length) {
      const vis = all.filter(e => (lay[e.layer] || { vis: true }).vis), bb = G.bbox(vis) || { x0: 0, y0: 0, x1: 100, y1: 100 };
      const ratio = IO.niceRatio(Math.max((bb.x1 - bb.x0) * uMM / aw, (bb.y1 - bb.y0) * uMM / ah, 1e-6) * 1.05);
      vps = [{ x: ax, y: ay, w: aw, h: ah, mx: (bb.x0 + bb.x1) / 2, my: (bb.y0 + bb.y1) / 2, ratio, hide: [] }];
    }
    vps.forEach(vp => {
      const hide = new Set(vp.hide || []), es = all.filter(e => { const l = lay[e.layer]; return (!l || l.vis) && !hide.has(e.layer); }), s = uMM / vp.ratio;
      G.view = { cx: vp.mx, cy: vp.my, r: Math.hypot(vp.w, vp.h) / s };
      o.push('q', `${mm(vp.x)} ${mm(vp.y)} ${mm(vp.w)} ${mm(vp.h)} re W n`);
      emitEnts(o, es, lay, set, s, vp.x + vp.w / 2 - vp.mx * s, vp.y + vp.h / 2 - vp.my * s);
      o.push('Q', `0 0 0 RG 0.35 w [] 0 d ${mm(vp.x)} ${mm(vp.y)} ${mm(vp.w)} ${mm(vp.h)} re S`, textOp('1:' + vp.ratio, vp.x + 1.5, vp.y + 1.5, 2.5, 0, 'l'));
    });
    pages.push({ pw, ph, stream: o.join('\n') });
  });
  return { pdf: assemble(pages), pages: pages.length };
};

if (typeof module !== 'undefined') module.exports = IO; else root.IO = IO;
})(this);
