(() => {
'use strict';
const $ = id => document.getElementById(id);
const cv = $('cv'); let ctx = cv.getContext('2d'); const mainCtx = ctx;
const { TAU, normA, dist } = G;

// ================= state =================
const newLayer = (name, color = 7) => ({ name, color, vis: true, lock: false, lt: 'cont', lw: 1 });
let doc = { ents: [], layers: [newLayer('0')], blocks: {} };
let curLayer = '0', undoStack = [], redoStack = [], dirty = false;
let view = { s: 2, ox: 0, oy: 0 };
let tool = null, stage = 'main', pts = [], pickEnt = null, tmp = {}, sel = [], winMode = false, winPts = [];
let cur = { x: 0, y: 0 }, pos = { x: 0, y: 0 }, snapHit = null;
let snapOn = true, gridOn = true, orthoOn = false, gridStep = 10;
let lastPoint = null, W = 0, H = 0, dpr = 1, firstSize = true, tab = 'Draw';
let touchDraw = true, showCons = true;
let osnap = { end: 1, mid: 1, cen: 1, qua: 1, int: 1, ins: 1, nod: 1, per: 0, tan: 0, nea: 0 }, polarOn = false, polarInc = 45, gripSel = null, flash = '', flashT = 0;
let lastOff = 10, lastSides = 6, lastFr = 0, lastHatch = 'lines,45,', lastArr = '2,3,20,20';

const layerOf = n => doc.layers.find(l => l.name === n) || doc.layers[0];
const visible = e => layerOf(e.layer).vis;
const editable = e => { const l = layerOf(e.layer); return l.vis && !l.lock; };
const w2s = (x, y) => [view.ox + x * view.s, view.oy - y * view.s];
const s2w = (sx, sy) => [(sx - view.ox) / view.s, (view.oy - sy) / view.s];
const setText = t => { $('prompt').textContent = t; };
const say = t => { setText(t); flash = t; flashT = Date.now(); };
function ensureDoc() {
  doc.blocks = doc.blocks || {}; doc.cons = doc.cons || []; doc.sheets = doc.sheets || []; doc.settings = Object.assign({ prec: 2, unit: 'mm', ltscale: 1, dimh: 0, page: 'A4,fit,Drawing' }, doc.settings || {});
  G.prec = doc.settings.prec; doc.layers.forEach(l => { if (l.lock === undefined) l.lock = false; });
}
const ask = (m, d) => { const r = window.prompt(m, d); return r === null ? null : r.trim(); };
const num = s => (s === null || s === '' ? NaN : parseFloat(s));
function niceNum(x) { const mag = Math.pow(10, Math.floor(Math.log10(x))); let b = mag, bd = 1e18; for (const m of [1, 2, 2.5, 5, 10]) { const d = Math.abs(m * mag - x); if (d < bd) { bd = d; b = m * mag; } } return b; }

Object.defineProperty(G, 'blocks', { get() { return doc.blocks; }, set(v) {}, configurable: true });

// ================= undo / persist =================
const snapshot = () => JSON.stringify({ doc, curLayer });
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 100) undoStack.shift(); redoStack = []; dirty = true; }
function restore(s) { const o = JSON.parse(s); doc = o.doc; curLayer = o.curLayer; ensureDoc(); gripSel = null; sel = []; pts = []; pickEnt = null; tmp = {}; stage = SEL_TOOLS.has(tool) || tool === 'select' ? 'sel' : 'main'; layerUI(); updatePrompt(); dirty = true; draw(); }
function undo() { if (!undoStack.length) return say('Undo ke liye kuch nahi'); redoStack.push(snapshot()); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return say('Redo ke liye kuch nahi'); undoStack.push(snapshot()); restore(redoStack.pop()); }
function save() { try { localStorage.setItem('mycad_doc', snapshot()); dirty = false; } catch (e) {} }
setInterval(() => { if (dirty) save(); }, 2000);
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
try { const s = localStorage.getItem('mycad_doc'); if (s) { const o = JSON.parse(s); if (o.doc && Array.isArray(o.doc.ents) && o.doc.layers.length) { doc = o.doc; doc.blocks = doc.blocks || {}; curLayer = o.curLayer || '0'; } } } catch (e) {}

// ================= canvas =================
function resize() {
  dpr = window.devicePixelRatio || 1; W = cv.clientWidth; H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (firstSize && W > 0) { view.ox = W / 2; view.oy = H / 2; firstSize = false; if (doc.ents.length) fit(); }
  draw();
}
new ResizeObserver(resize).observe(cv);

function niceStep() { const raw = 16 / view.s, mag = Math.pow(10, Math.floor(Math.log10(raw))); for (const m of [1, 2, 5, 10]) if (m * mag >= raw) return m * mag; return 10 * mag; }
function drawPrim(pr, color, lw, dash, isHatch) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = pr.thin ? lw * 0.6 : lw; ctx.setLineDash(pr.thin ? [] : dash);
  if (pr.k === 'poly') {
    ctx.beginPath(); pr.pts.forEach((q, i) => { const [x, y] = w2s(q[0], q[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    if (pr.closed) ctx.closePath();
    if (pr.fill) {
      if (isHatch) {
        ctx.globalAlpha = 0.45;
        if (pr.grad !== undefined) {
          let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; pr.pts.forEach(q => { const [a, b] = w2s(q[0], q[1]); x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); });
          const dx = Math.cos(pr.grad), dy = -Math.sin(pr.grad), hl = (Math.abs(x1 - x0) * Math.abs(dx) + Math.abs(y1 - y0) * Math.abs(dy)) / 2 + 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
          const gr = ctx.createLinearGradient(cx - dx * hl, cy - dy * hl, cx + dx * hl, cy + dy * hl); gr.addColorStop(0, color); gr.addColorStop(1, '#0c0e10'); ctx.fillStyle = gr;
        }
      }
      ctx.fill(); ctx.globalAlpha = 1;
    } else ctx.stroke();
  } else if (pr.k === 'arc') {
    const [x, y] = w2s(pr.cx, pr.cy); ctx.beginPath();
    if (pr.full) ctx.arc(x, y, pr.r * view.s, 0, TAU); else ctx.arc(x, y, pr.r * view.s, -pr.a1, -pr.a2, true);
    ctx.stroke();
  } else if (pr.k === 'pt') {
    const [x, y] = w2s(pr.x, pr.y); ctx.setLineDash([]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.stroke();
  } else {
    const [x, y] = w2s(pr.x, pr.y); ctx.save(); ctx.translate(x, y); ctx.rotate(-pr.rot);
    ctx.font = Math.max(pr.h * view.s, 5) + 'px sans-serif'; ctx.textAlign = pr.anchor === 'c' ? 'center' : pr.anchor === 'r' ? 'right' : 'left';
    ctx.setLineDash([]); ctx.fillText(pr.str, 0, 0); ctx.restore();
  }
  ctx.setLineDash([]);
}
function drawEnt(e, color, lw, dash) { G.prims(e).forEach(pr => drawPrim(pr, color, lw, dash, e.type === 'hatch')); }

function findSnap(x, y) {
  const tol = 14 / view.s; let best = null, bd = tol; const near = [];
  const cand = (px, py, kind, pen) => { const d = dist(x, y, px, py) + (pen || 0); if (d < bd) { bd = d; best = { x: px, y: py, kind }; } };
  const base = pts.length && stage === 'main' ? pts[pts.length - 1] : null, GEO = ['line', 'pline', 'circle', 'arc', 'ell', 'spline'];
  for (const e of doc.ents) {
    if (!visible(e)) continue;
    for (const p of G.snapPts(e)) if (osnap[p[2]]) cand(p[0], p[1], p[2]);
    if (!GEO.includes(e.type)) continue;
    const ed = G.entDist(e, x, y);
    if (ed < 50 / view.s) near.push(e);
    if (osnap.nea && ed < tol * 2) { const q = G.nearestOn(e, x, y); if (q) cand(q[0], q[1], 'nea', tol * 0.4); }
    if (base && osnap.per) G.perpPts(e, base.x, base.y).forEach(q => cand(q[0], q[1], 'per'));
    if (base && osnap.tan) G.tanPts(e, base.x, base.y).forEach(q => cand(q[0], q[1], 'tan'));
  }
  if (osnap.int && near.length > 1 && near.length <= 25) for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++)
    G.intersect(near[i], near[j]).forEach(q => cand(q[0], q[1], 'int'));
  return best;
}
function pickAt(x, y, any) {
  const tol = 16 / view.s; let best = null, bd = tol;
  for (const e of doc.ents) { if (any ? !visible(e) : !editable(e)) continue; const d = G.entDist(e, x, y); if (d < bd) { bd = d; best = e; } }
  return best;
}

function drawEntities(list, isSelFn, hide, light) {
  const lts = doc.settings.ltscale || 1;
  for (const e of list) {
    const il = layerOf(e.layer); if (!il.vis || (hide && hide.has(e.layer))) continue;
    const isSel = isSelFn ? isSelFn(e) : false, sub = e.type === 'insert' ? G.insertEnts(e) : [e];
    for (const x of sub) {
      const l = layerOf(x.layer); if (!l.vis || (hide && hide.has(x.layer))) continue;
      const cc = x.color || l.color, lt = x.lt || l.lt, lwv = x.lw != null ? x.lw : l.lw, col = light ? (cc === 7 ? '#000000' : G.ACI[cc]) : (G.ACI[cc] || '#fff');
      drawEnt(x, isSel ? '#6bd0ff' : col, isSel ? 2.2 : ([0.9, 1.5, 3][lwv] || 1.5), isSel ? [6, 4] : (G.LT[lt] || []).map(v => v * lts));
    }
  }
}
function conPos(e, pa) { if (e.type === 'line') return pa === 0 ? [e.x1, e.y1] : pa === 1 ? [e.x2, e.y2] : [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]; return e.cx !== undefined ? [e.cx, e.cy] : [0, 0]; }
function drawCons() {
  const M = {}; doc.ents.forEach(e => { if (e.id) M[e.id] = e; }); ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#ff9ad5'; ctx.setLineDash([]);
  doc.cons.forEach(c => {
    const a = M[c.a]; if (!a) return; const b = c.b != null ? M[c.b] : null;
    const gl = { H: 'H', V: 'V', PAR: '\u2225', PERP: '\u22A5', EQ: '=', EQR: '=', COIN: '\u25CF', CONC: '\u25CE', FIX: 'F', LEN: 'L=' + G.fmt(c.v || 0), RAD: 'R=' + G.fmt(c.v || 0) }[c.t] || '?';
    const p = conPos(a, c.pa), q = w2s(p[0], p[1]); ctx.fillText(gl, q[0] + 6, q[1] - 6);
    if (b && c.t !== 'COIN' && c.t !== 'CONC') { const p2 = conPos(b, c.pb), q2 = w2s(p2[0], p2[1]); ctx.fillText(gl, q2[0] + 6, q2[1] - 6); }
  });
}
function draw() {
  if (!W) return;
  ctx.fillStyle = '#0c0e10'; ctx.fillRect(0, 0, W, H);
  gridStep = niceStep();
  if (gridOn) {
    const [x0, y1] = s2w(0, 0), [x1, y0] = s2w(W, H); ctx.fillStyle = '#2a3238';
    if (isFinite(x0 + x1 + y0 + y1) && (x1 - x0) / gridStep < 500 && (y1 - y0) / gridStep < 500)
    for (let x = Math.ceil(x0 / gridStep) * gridStep; x <= x1; x += gridStep) for (let y = Math.ceil(y0 / gridStep) * gridStep; y <= y1; y += gridStep) { const [sx, sy] = w2s(x, y); ctx.fillRect(sx - 0.5, sy - 0.5, 1.5, 1.5); }
  }
  const [ox, oy] = w2s(0, 0); ctx.lineWidth = 1; ctx.strokeStyle = '#7a3a3a'; ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke();
  ctx.strokeStyle = '#3a6a3a'; ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke();
  { const [vx, vy] = s2w(W / 2, H / 2); G.view = { cx: vx, cy: vy, r: Math.hypot(W, H) / view.s }; }
  drawEntities(doc.ents, e => sel.includes(e) || e === pickEnt);
  if (showCons && doc.cons.length) drawCons();
  snapHit = snapOn ? findSnap(cur.x, cur.y) : null;
  if (snapHit) pos = { x: snapHit.x, y: snapHit.y };
  else if (snapOn && gridOn) pos = { x: Math.round(cur.x / gridStep) * gridStep, y: Math.round(cur.y / gridStep) * gridStep };
  else pos = { x: cur.x, y: cur.y };
  if (orthoOn && pts.length && !snapHit && stage === 'main') { const b = pts[pts.length - 1]; if (Math.abs(pos.x - b.x) >= Math.abs(pos.y - b.y)) pos.y = b.y; else pos.x = b.x; }
  else if (polarOn && pts.length && !snapHit && stage === 'main') {
    const b = pts[pts.length - 1], dx = pos.x - b.x, dy = pos.y - b.y, l = Math.hypot(dx, dy);
    if (l > 1e-9) { const inc = polarInc * Math.PI / 180, a = Math.atan2(dy, dx), ra = Math.round(a / inc) * inc; if (Math.abs(a - ra) < 6 * Math.PI / 180) pos = { x: b.x + l * Math.cos(ra), y: b.y + l * Math.sin(ra) }; }
  }
  previews(pos).forEach(e => drawEnt(e, '#ffb347', 1.2, [6, 4]));
  if (gripSel) G.grips(gripSel.e).forEach(gr => { const [gx, gy] = w2s(gr.x, gr.y); ctx.fillStyle = gripSel.g === gr ? '#ff5050' : '#4fa0ff'; ctx.fillRect(gx - 5, gy - 5, 10, 10); });
  const [cx, cy] = w2s(pos.x, pos.y);
  ctx.strokeStyle = '#4fc3ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 28, cy); ctx.lineTo(cx + 28, cy); ctx.moveTo(cx, cy - 28); ctx.lineTo(cx, cy + 28); ctx.stroke(); ctx.strokeRect(cx - 5, cy - 5, 10, 10);
  if (snapHit) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.strokeRect(cx - 9, cy - 9, 18, 18); ctx.fillStyle = '#ffd24a'; ctx.font = '12px sans-serif'; ctx.fillText(snapHit.kind, cx + 12, cy - 12); }
  if (stage === 'main' && pts.length && tool) {
    const a = pts[pts.length - 1]; let lab;
    if (tool === 'rect' || tool === 'box') lab = G.fmt(Math.abs(pos.x - pts[0].x)) + ' x ' + G.fmt(Math.abs(pos.y - pts[0].y));
    else if (['circle', 'polygon', 'cyl', 'cone', 'sph'].includes(tool)) lab = 'R ' + G.fmt(dist(pts[0].x, pts[0].y, pos.x, pos.y));
    else lab = G.fmt(dist(a.x, a.y, pos.x, pos.y)) + ' \u2220' + (normA(Math.atan2(pos.y - a.y, pos.x - a.x)) * 180 / Math.PI).toFixed(1) + '\u00B0';
    ctx.font = '13px sans-serif'; const tw = ctx.measureText(lab).width + 10; ctx.fillStyle = 'rgba(20,25,30,0.88)'; ctx.fillRect(cx + 16, cy + 14, tw, 20); ctx.fillStyle = '#fff'; ctx.fillText(lab, cx + 21, cy + 29);
  }
  let info = `X ${pos.x.toFixed(2)} Y ${pos.y.toFixed(2)}`;
  if (pts.length && stage === 'main') { const l = pts[pts.length - 1]; info += ` | L ${dist(l.x, l.y, pos.x, pos.y).toFixed(2)} \u2220${(normA(Math.atan2(pos.y - l.y, pos.x - l.x)) * 180 / Math.PI).toFixed(1)}\u00B0`; }
  $('coords').textContent = info;
}

function polyPts(c, p, n) { const r = dist(c.x, c.y, p.x, p.y), a0 = Math.atan2(p.y - c.y, p.x - c.x); return Array.from({ length: n }, (_, i) => [c.x + r * Math.cos(a0 + TAU * i / n), c.y + r * Math.sin(a0 + TAU * i / n)]); }
function ellFrom(c, p1, p2) {
  const rx = dist(c.x, c.y, p1.x, p1.y), rot = Math.atan2(p1.y - c.y, p1.x - c.x), ry = Math.abs((p2.x - c.x) * -Math.sin(rot) + (p2.y - c.y) * Math.cos(rot));
  return rx > 1e-9 && ry > 1e-9 ? { type: 'ell', cx: c.x, cy: c.y, rx, ry, rot } : null;
}
function dimEnt(p0, p1, o, lin) {
  let mode = 'a'; if (lin) { const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2; mode = Math.abs(o.y - my) > Math.abs(o.x - mx) ? 'h' : 'v'; }
  return { type: 'dim', mode, x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y, ox: o.x, oy: o.y, h: dimH() };
}
const dimH = () => (doc.settings.dimh > 0 ? doc.settings.dimh : niceNum(12 / view.s));
function previews(p) {
  const out = [], L = (a, b) => ({ type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  if (stage === 'sel') { if (winMode && winPts.length === 1) { const a = winPts[0]; out.push({ type: 'pline', pts: [[a.x, a.y], [p.x, a.y], [p.x, p.y], [a.x, p.y]], closed: true }); } return out; }
  const n = pts.length;
  switch (tool) {
    case 'line': case 'mirror': case 'dist': if (n === 1) out.push(L(pts[0], p)); break;
    case 'pline': if (n) out.push({ type: 'pline', pts: [...pts.map(q => [q.x, q.y]), [p.x, p.y]], closed: false }); break;
    case 'rect': if (n === 1) { const a = pts[0]; out.push({ type: 'pline', pts: [[a.x, a.y], [p.x, a.y], [p.x, p.y], [a.x, p.y]], closed: true }); } break;
    case 'polygon': if (n === 1) out.push({ type: 'pline', pts: polyPts(pts[0], p, tmp.n), closed: true }); break;
    case 'circle': if (n === 1) { out.push({ type: 'circle', cx: pts[0].x, cy: pts[0].y, r: dist(pts[0].x, pts[0].y, p.x, p.y) }); out.push(L(pts[0], p)); } break;
    case 'arc': if (n === 1) out.push(L(pts[0], p)); else if (n === 2) { const a = G.arcFrom3(pts[0], pts[1], p); if (a) out.push(a); } break;
    case 'move': case 'copy': if (n === 1) { const T = G.shift(p.x - pts[0].x, p.y - pts[0].y); sel.forEach(e => out.push(G.tx(e, T))); } break;
    case 'dim': case 'dimlin': if (n === 1) out.push(L(pts[0], p)); else if (n === 2) out.push(dimEnt(pts[0], pts[1], p, tool === 'dimlin')); break;
    case 'dimrad': case 'dimdia': if (tmp.c) out.push({ type: 'rdim', cx: tmp.c.cx, cy: tmp.c.cy, r: tmp.c.r, ox: p.x, oy: p.y, h: dimH(), dia: tool === 'dimdia' }); break;
    case 'ellipse': if (n === 1) out.push(L(pts[0], p)); else if (n === 2) { const e = ellFrom(pts[0], pts[1], p); if (e) out.push(e); } break;
    case 'spline': if (n) out.push({ type: 'spline', pts: [...pts.map(q => [q.x, q.y]), [p.x, p.y]], closed: false }); break;
    case 'leader': if (n) out.push({ type: 'pline', pts: [...pts.map(q => [q.x, q.y]), [p.x, p.y]], closed: false }); break;
    case 'xline': case 'ray': if (n === 1) out.push(L(pts[0], p)); break;
    case 'donut': out.push({ type: 'circle', cx: p.x, cy: p.y, r: tmp.od / 2 }); if (tmp.id > 0) out.push({ type: 'circle', cx: p.x, cy: p.y, r: tmp.id / 2 }); break;
    case 'table': { const [r, c, w, h] = tmp.t; out.push({ type: 'pline', pts: [[p.x, p.y], [p.x + c * w, p.y], [p.x + c * w, p.y - r * h], [p.x, p.y - r * h]], closed: true }); break; }
    case 'stretch': if (n === 1) { const a = pts[0]; out.push({ type: 'pline', pts: [[a.x, a.y], [p.x, a.y], [p.x, p.y], [a.x, p.y]], closed: true }); } else if (n === 3) out.push(L(pts[2], p)); break;
    case 'align': if (n >= 1) out.push(L(pts[n - 1], p)); break;
    case 'break': if (tmp.k) out.push(L({ x: tmp.p1[0], y: tmp.p1[1] }, p)); break;
    case 'grip': if (gripSel && gripSel.g) { const m = G.moveGrip(gripSel.e, gripSel.g, p.x, p.y); if (m) out.push(m); } break;
    case 'dimcont': case 'dimbase': if (tmp.k) { const b = tmp.base; let nd; if (tool === 'dimcont') nd = Object.assign({}, b, { x1: b.x2, y1: b.y2, x2: p.x, y2: p.y }); else { const inf = G.dimInfo(b), st = b.h * 3 * (tmp.cnt + 1); nd = Object.assign({}, b, { x2: p.x, y2: p.y, ox: b.ox + inf.nx * st, oy: b.oy + inf.ny * st }); } delete nd.txt; out.push(nd); } break;
    case 'dimang':
      if (n === 1) out.push(L(pts[0], p)); else if (n === 2) { out.push(L(pts[0], pts[1])); out.push(L(pts[0], p)); }
      else if (n === 3) out.push({ type: 'adim', vx: pts[0].x, vy: pts[0].y, a1: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x), a2: Math.atan2(pts[2].y - pts[0].y, pts[2].x - pts[0].x), r: Math.max(dist(pts[0].x, pts[0].y, p.x, p.y), 1e-6), h: dimH() });
      break;
  }
  return out;
}

// ================= tools =================
const SEL_TOOLS = new Set(['move', 'copy', 'rotate', 'scale', 'mirror', 'erase', 'array', 'block', 'chlayer', 'explode', 'join', 'align', 'arraypolar']);
const INSTANT = new Set(['erase', 'array', 'chlayer', 'explode', 'join']);
const PROMPTS = {
  line: ['Line: pehla point', 'Line: agla point (Done = band)'], pline: ['Polyline: pehla point', 'Polyline: agla point (Done / Close)'],
  rect: ['Rect: pehla corner', 'Rect: doosra corner'], polygon: ['Polygon: center', 'Polygon: corner point'],
  circle: ['Circle: center', 'Circle: radius (point ya number)'], arc: ['Arc: start point', 'Arc: beech ka point', 'Arc: end point'],
  text: ['Text: jagah chuno'], hatch: ['Hatch: closed polyline / circle chuno'],
  move: ['Move: base point', 'Move: nayi jagah'], copy: ['Copy: base point', 'Copy: nayi jagah (Done = khatam)'],
  rotate: ['Rotate: base point'], scale: ['Scale: base point'], mirror: ['Mirror: line ka pehla point', 'Mirror: line ka doosra point'],
  offset: ['Offset: object chuno', 'Offset: kis taraf? (point)'], trim: ['Trim: hissa chuno jo kaatna hai'], extend: ['Extend: line ka end ke paas chuno'],
  fillet: ['Fillet: pehli line', 'Fillet: doosri line'], chamfer: ['Chamfer: pehli line', 'Chamfer: doosri line'],
  block: ['Block: base point'], insert: ['Insert: jagah chuno'],
  dim: ['Dim: pehla point', 'Dim: doosra point', 'Dim: line ki jagah'], dimlin: ['Dim H/V: pehla point', 'Dim H/V: doosra point', 'Dim H/V: line ki jagah'],
  dimrad: ['Radius: circle/arc chuno', 'Radius: text ki jagah'], dimdia: ['Diameter: circle chuno', 'Diameter: text ki jagah'],
  dimang: ['Angle: vertex', 'Angle: pehli ray ka point', 'Angle: doosri ray ka point', 'Angle: arc ka radius'],
  dist: ['Distance: pehla point', 'Distance: doosra point'], area: ['Area: closed polyline / circle chuno'],
  ellipse: ['Ellipse: center', 'Ellipse: major axis ka end', 'Ellipse: minor axis ki taraf point'], spline: ['Spline: points chuno (Done / Close)'], point: ['Point: jagah chuno'],
  donut: ['Donut: center chuno'], xline: ['Xline: point', 'Xline: direction ka point'], ray: ['Ray: shuru ka point', 'Ray: direction ka point'],
  leader: ['Leader: arrow ka point', 'Leader: agla point (Done = text likho)'], table: ['Table: upar-left kone ki jagah'], textedit: ['Text edit: text / leader chuno'],
  stretch: ['Stretch: window ka pehla corner', 'Stretch: window ka doosra corner', 'Stretch: base point', 'Stretch: nayi jagah'],
  break: ['Break: object chuno (yahi pehla point)', 'Break: doosra point'], breakat: ['Break at point: object par point chuno'], join: ['Join'],
  lengthen: ['Lengthen: line / arc ka end ke paas chuno'], align: ['Align: source point 1', 'Align: destination point 1', 'Align: source point 2', 'Align: destination point 2'],
  match: ['Match: source object chuno', 'Match: target objects chuno (Done = khatam)'], pedit: ['Pedit: polyline / spline chuno'], divide: ['Divide: object chuno'], measure: ['Measure: object chuno'],
  arraypolar: ['Polar array: center point'], grip: ['Grip: object chuno', 'Grip: grip point ke paas tap karo', 'Grip: nayi jagah'], dimedit: ['Dim edit: dimension chuno'],
  dimcont: ['Dim continue: dimension chuno', 'Dim continue: agla point'], dimbase: ['Dim baseline: dimension chuno', 'Dim baseline: agla point'],
  extrude: ['Extrude: closed polyline / circle chuno'], box: ['Box: pehla corner', 'Box: doosra corner'], cyl: ['Cylinder: center', 'Cylinder: radius ka point'], cone: ['Cone: center', 'Cone: radius ka point'], sph: ['Sphere: center', 'Sphere: radius ka point'],
  attdef: ['Attribute: jagah chuno'], attedit: ['Attribute edit: block insert chuno'],
  conh: ['Horizontal: line chuno'], conv: ['Vertical: line chuno'], conlen: ['Length: line chuno'], conrad: ['Radius: circle / arc chuno'], confix: ['Fix: object chuno'], condel: ['Constraints hatao: object chuno'],
  conpar: ['Parallel: pehli line', 'Parallel: doosri line'], conperp: ['Perpendicular: pehli line', 'Perpendicular: doosri line'], coneq: ['Equal length: pehli line', 'Equal length: doosri line'],
  coneqr: ['Equal radius: pehla circle / arc', 'Equal radius: doosra circle / arc'], conconc: ['Concentric: pehla circle / arc', 'Concentric: doosra circle / arc'],
  concoin: ['Coincident: pehla object (end ke paas chuno)', 'Coincident: doosra object (end ke paas chuno)'],
  props: ['Properties: object chuno'], layiso: ['Layer isolate: object chuno'], layoff: ['Layer off: object chuno'], laylock: ['Layer lock/unlock: object chuno'], laycur: ['Layer current: object chuno']
};
function updatePrompt() {
  if (flash && Date.now() - flashT < 2500) { setText(flash); flash = ''; return; } flash = '';
  if (!tool) return setText('Tool chuno');
  if (stage === 'sel') return setText(winMode ? 'Window: 2 corner chuno (left->right = andar, right->left = crossing)' : 'Objects chuno (tap + \u2713 Point), phir Done');
  const a = PROMPTS[tool] || ['?']; let i = pts.length;
  if (tool === 'offset' || tool === 'dimrad' || tool === 'dimdia') i = pickEnt || tmp.c ? 1 : 0;
  if (tool === 'fillet' || tool === 'chamfer') i = tmp.e1 ? 1 : 0;
  if (['break', 'match', 'dimcont', 'dimbase', 'conpar', 'conperp', 'coneq', 'coneqr', 'conconc', 'concoin'].includes(tool)) i = tmp.k ? 1 : 0;
  if (tool === 'grip') i = gripSel ? (gripSel.g ? 2 : 1) : 0;
  setText(a[Math.min(i, a.length - 1)]);
}
function setTool(t) {
  tool = t; pts = []; pickEnt = null; winMode = false; winPts = []; gripSel = null; tmp = {};
  document.querySelectorAll('#tools button[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  if (t === 'selwin') { tool = 'select'; winMode = true; }
  if (tool && !SEL_TOOLS.has(tool) && tool !== 'select') sel = [];
  stage = ((SEL_TOOLS.has(tool) && !sel.length) || tool === 'select') ? 'sel' : 'main';
  if (tool === 'offset') { const n = num(ask('Offset distance:', lastOff)); if (!(n > 0)) return setTool(null); lastOff = tmp.d = n; }
  if (tool === 'fillet' || tool === 'chamfer') { const n = num(ask(tool === 'fillet' ? 'Fillet radius (0 = sharp corner):' : 'Chamfer distance:', lastFr)); if (!(n >= 0)) return setTool(null); lastFr = tmp.r = n; }
  if (tool === 'polygon') { const n = Math.round(num(ask('Kitni sides?', lastSides))); if (!(n >= 3 && n <= 200)) return setTool(null); lastSides = tmp.n = n; }
  if (tool === 'donut') { const s = ask('inner diameter, outer diameter', '0,' + niceNum(20 / view.s)); if (s === null) return setTool(null); const [a, b] = s.split(',').map(parseFloat); if (!(b > 0 && a >= 0 && a < b)) { say('Galat values'); return setTool(null); } tmp.id = a; tmp.od = b; }
  if (tool === 'table') { const s = ask('rows, columns, cell width, cell height', '4,3,' + niceNum(40 / view.s) + ',' + niceNum(15 / view.s)); if (s === null) return setTool(null); const t = s.split(',').map(parseFloat); if (!(t.length === 4 && t.every(v => v > 0))) { say('Galat values'); return setTool(null); } tmp.t = t; }
  if (tool === 'lengthen') { const d = num(ask('Kitna badhana hai? (minus = chhota karna)', niceNum(20 / view.s))); if (isNaN(d) || d === 0) return setTool(null); tmp.d = d; }
  if (tool === 'insert') {
    const names = Object.keys(doc.blocks); if (!names.length) { say('Pehle Make Block se block banao'); return setTool(null); }
    const nm = ask('Block name: ' + names.join(', '), names[names.length - 1]); if (!doc.blocks[nm]) return setTool(null); tmp.name = nm; const sr = (ask('Scale, rotation (degrees)', '1,0') || '1,0').split(',').map(parseFloat); tmp.sc = sr[0] > 0 ? sr[0] : 1; tmp.rot = (sr[1] || 0) * Math.PI / 180;
  }
  updatePrompt(); draw();
  if (stage === 'main' && INSTANT.has(tool)) runInstant();
}
function resetModify(msg) { afterEdit(); sel = []; pts = []; pickEnt = null; stage = SEL_TOOLS.has(tool) ? 'sel' : 'main'; if (msg) { flash = msg; flashT = Date.now(); } updatePrompt(); draw(); }
function runInstant() {
  if (!sel.length) return resetModify();
  pushUndo();
  if (tool === 'erase') doc.ents = doc.ents.filter(e => !sel.includes(e));
  else if (tool === 'chlayer') sel.forEach(e => { e.layer = curLayer; });
  else if (tool === 'explode') sel.forEach(e => { const x = G.explode(e); if (x) { doc.ents.splice(doc.ents.indexOf(e), 1, ...x); } });
  else if (tool === 'join') {
    const r = G.join(sel, 1e-4);
    if (!r.consumed.length) { undoStack.pop(); return resetModify('Join ke liye aapas me jude lines/polylines nahi mile'); }
    doc.ents = doc.ents.filter(e => !r.consumed.includes(e)); doc.ents.push(...r.result); return resetModify(r.result.length + ' polyline ban gayi');
  }
  else if (tool === 'array') {
    const s = ask('rows, cols, row distance, col distance', lastArr); if (s === null) { undoStack.pop(); return resetModify(); }
    lastArr = s; const [r, c, dr, dc] = s.split(',').map(parseFloat);
    if (!(r >= 1 && c >= 1)) { undoStack.pop(); say('Galat values'); return resetModify(); }
    const add = []; for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { if (!i && !j) continue; sel.forEach(e => add.push(G.tx(e, G.shift(j * (dc || 0), i * (dr || 0))))); }
    doc.ents.push(...add);
  }
  resetModify();
}
function commit(e) { e.layer = curLayer; pushUndo(); doc.ents.push(e); draw(); }
function selectAt(p) {
  if (winMode) {
    winPts.push(p); if (winPts.length === 2) {
      const [a, b] = winPts, x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      doc.ents.forEach(e => { if (!editable(e) || sel.includes(e)) return; if (G.crosses(e, { x0, y0, x1, y1 }, b.x < a.x)) sel.push(e); });
      winPts = []; say(sel.length + ' selected');
    }
    return;
  }
  const e = pickAt(cur.x, cur.y) || pickAt(p.x, p.y); if (!e) return say('Yahan koi object nahi');
  const i = sel.indexOf(e); if (i >= 0) sel.splice(i, 1); else sel.push(e); say(sel.length + ' selected');
}
function finish() {
  if (stage === 'sel') {
    if (tool === 'select') { say(sel.length + ' selected. Ab koi command chalao'); tool = null; winMode = false; document.querySelectorAll('#tools button[data-tool]').forEach(b => b.classList.remove('active')); draw(); return; }
    if (!sel.length) return say('Kuch select nahi hua');
    stage = 'main'; pts = []; updatePrompt(); if (INSTANT.has(tool)) runInstant(); draw(); return;
  }
  if (tool === 'pline' && pts.length >= 2) commit({ type: 'pline', pts: pts.map(p => [p.x, p.y]), closed: false });
  if (tool === 'spline' && pts.length >= 2) commit({ type: 'spline', pts: pts.map(p => [p.x, p.y]), closed: false });
  if (tool === 'leader' && pts.length >= 2) {
    const t = ask('Leader ka text (nayi line ke liye |):', ''); if (t !== null) commit({ type: 'leader', pts: pts.map(p => [p.x, p.y]), str: t, h: dimH() });
  }
  if (tool === 'copy') return resetModify();
  pts = []; updatePrompt(); draw();
}
function closeShape() {
  if (tool === 'pline' && pts.length >= 3) commit({ type: 'pline', pts: pts.map(p => [p.x, p.y]), closed: true });
  else if (tool === 'spline' && pts.length >= 3) commit({ type: 'spline', pts: pts.map(p => [p.x, p.y]), closed: true });
  pts = []; updatePrompt(); draw();
}

function doTrim(e, px, py) {
  let target = e, rest = doc.ents.filter(x => x !== e && visible(x)), pieces = null;
  if (e.type === 'pline') {
    pieces = G.explode(e); let bd = 1e18; pieces.forEach(pc => { const d = G.entDist(pc, px, py); if (d < bd) { bd = d; target = pc; } });
    rest = rest.concat(pieces.filter(x => x !== target));
  } else if (!['line', 'circle', 'arc'].includes(e.type)) return say('Trim sirf line / circle / arc / polyline par chalta hai');
  const res = G.trim(target, rest, px, py); if (!res) return say('Trim nahi hua: cutting edge nahi mili');
  pushUndo(); doc.ents.splice(doc.ents.indexOf(e), 1); if (pieces) doc.ents.push(...pieces.filter(x => x !== target)); doc.ents.push(...res);
}
function askAttrs(name) {
  const b = doc.blocks[name], out = {}; if (!b) return out;
  b.ents.filter(x => x.type === 'attdef').forEach(d => { const v = ask((d.prm || d.tag) + ':', d.def || ''); out[d.tag] = v === null ? (d.def || '') : v; });
  return out;
}
function mkInsert(name, x, y, o) { o = o || {}; return { type: 'insert', name, x, y, sx: o.sc || 1, sy: o.sc || 1, rot: o.rot || 0, attrs: o.attrs || askAttrs(name), layer: curLayer }; }
function endIdx(e, pt) { return e.type === 'line' ? (dist(pt.x, pt.y, e.x1, e.y1) <= dist(pt.x, pt.y, e.x2, e.y2) ? 0 : 1) : 'c'; }
function conSingle(t, e) {
  if (t === 'condel') { if (!e.id) return say('Is object par koi constraint nahi'); pushUndo(); const n = doc.cons.length; doc.cons = doc.cons.filter(c => c.a !== e.id && c.b !== e.id); return say((n - doc.cons.length) + ' constraints hata di'); }
  const ty = { conh: 'H', conv: 'V', conlen: 'LEN', conrad: 'RAD', confix: 'FIX' }[t];
  if ((ty === 'H' || ty === 'V' || ty === 'LEN') && e.type !== 'line') return say('Line chuno');
  if (ty === 'RAD' && e.type !== 'circle' && e.type !== 'arc') return say('Circle ya arc chuno');
  const c = { t: ty, a: CON.id(doc, e) };
  if (ty === 'LEN') { const v = num(ask('Length:', G.fmt(Math.hypot(e.x2 - e.x1, e.y2 - e.y1)))); if (!(v > 0)) return; c.v = v; }
  if (ty === 'RAD') { const v = num(ask('Radius:', G.fmt(e.r))); if (!(v > 0)) return; c.v = v; }
  pushUndo(); doc.cons.push(c); CON.solve(doc); say('Constraint lag gayi: ' + ty);
}
function conPair(t, a, pa, b, pb) {
  const T = { conpar: 'PAR', conperp: 'PERP', coneq: 'EQ', coneqr: 'EQR', conconc: 'CONC', concoin: 'COIN' }[t];
  if (a === b) return say('Do alag objects chuno');
  const ln = x => x.type === 'line', ci = x => x.type === 'circle' || x.type === 'arc';
  const ok = (T === 'PAR' || T === 'PERP' || T === 'EQ') ? ln(a) && ln(b) : (T === 'EQR' || T === 'CONC') ? ci(a) && ci(b) : (ln(a) || ci(a)) && (ln(b) || ci(b));
  if (!ok) return say('In objects par ye constraint nahi lagti');
  const c = { t: T, a: CON.id(doc, a), b: CON.id(doc, b) }; if (T === 'CONC') { c.pa = 'c'; c.pb = 'c'; } if (T === 'COIN') { c.pa = pa; c.pb = pb; }
  pushUndo(); doc.cons.push(c); CON.solve(doc); say('Constraint lag gayi: ' + T);
}
function addPoint(p) {
  lastPoint = p;
  if (!tool) return say('Pehle koi tool chuno');
  if (stage === 'sel') { selectAt(p); draw(); return; }
  const n = pts.length;
  switch (tool) {
    case 'line': pts.push(p); if (pts.length === 2) { commit({ type: 'line', x1: pts[0].x, y1: pts[0].y, x2: p.x, y2: p.y }); pts = [p]; } break;
    case 'pline': pts.push(p); break;
    case 'rect': pts.push(p); if (pts.length === 2) { const [a, b] = pts; commit({ type: 'pline', pts: [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]], closed: true }); pts = []; } break;
    case 'polygon': pts.push(p); if (pts.length === 2) { commit({ type: 'pline', pts: polyPts(pts[0], p, tmp.n), closed: true }); pts = []; } break;
    case 'circle': pts.push(p); if (pts.length === 2) { const r = dist(pts[0].x, pts[0].y, p.x, p.y); if (r > 1e-9) commit({ type: 'circle', cx: pts[0].x, cy: pts[0].y, r }); pts = []; } break;
    case 'arc': pts.push(p); if (pts.length === 3) { const a = G.arcFrom3(pts[0], pts[1], pts[2]); if (a) commit(a); else say('Teeno point ek seedh me hain'); pts = []; } break;
    case 'text': {
      const s = ask('Text likho (nayi line ke liye | lagao):', ''); if (!s) break; const h = num(ask('Text height:', tmp.th || niceNum(14 / view.s))); if (!(h > 0)) break;
      tmp.th = h; commit({ type: 'text', x: p.x, y: p.y, h, str: s, rot: 0 }); break;
    }
    case 'hatch': {
      const e = pickAt(cur.x, cur.y); let poly = null;
      if (e && e.type === 'pline' && e.closed) poly = e.pts.map(q => [q[0], q[1]]); else if (e && e.type === 'circle') poly = G.circlePoly(e.cx, e.cy, e.r);
      if (!poly) { say('Closed polyline ya circle chuno'); break; }
      const s = ask('pattern (lines / cross / solid / gradient), angle, spacing', lastHatch + (lastHatch.endsWith(',') ? niceNum(10 / view.s) : '')); if (s === null) break;
      lastHatch = s; const [pat, ang, sp] = s.split(',').map(x => x.trim());
      commit({ type: 'hatch', pts: poly, pat: ['lines', 'cross', 'solid', 'gradient'].includes(pat) ? pat : 'lines', ang: (parseFloat(ang) || 0) * Math.PI / 180, sp: parseFloat(sp) > 0 ? parseFloat(sp) : niceNum(10 / view.s) });
      break;
    }
    case 'move': pts.push(p); if (pts.length === 2) { pushUndo(); const T = G.shift(p.x - pts[0].x, p.y - pts[0].y); sel.forEach(e => { doc.ents[doc.ents.indexOf(e)] = G.tx(e, T); }); resetModify(); return; } break;
    case 'copy': if (!n) pts.push(p); else { pushUndo(); const T = G.shift(p.x - pts[0].x, p.y - pts[0].y); sel.forEach(e => doc.ents.push(G.tx(e, T))); } break;
    case 'rotate': {
      const a = num(ask('Rotation angle (degrees, + = anticlockwise):', '90')); if (isNaN(a)) break;
      pushUndo(); const T = G.rotAbout(p.x, p.y, a * Math.PI / 180); sel.forEach(e => { doc.ents[doc.ents.indexOf(e)] = G.tx(e, T); }); resetModify(); return;
    }
    case 'scale': {
      const k = num(ask('Scale factor:', '2')); if (!(k > 0)) break;
      pushUndo(); const T = G.scaleAbout(p.x, p.y, k); sel.forEach(e => { doc.ents[doc.ents.indexOf(e)] = G.tx(e, T); }); resetModify(); return;
    }
    case 'mirror':
      pts.push(p); if (pts.length === 2) {
        if (dist(pts[0].x, pts[0].y, p.x, p.y) < 1e-9) { pts = [pts[0]]; break; }
        const T = G.mirrorAxis(pts[0].x, pts[0].y, p.x, p.y), del = window.confirm('Original objects delete kar dun? (OK = haa, Cancel = rakho)');
        pushUndo(); sel.forEach(e => { const m = G.tx(e, T); if (del) doc.ents[doc.ents.indexOf(e)] = m; else doc.ents.push(m); }); resetModify(); return;
      } break;
    case 'block': {
      const nm = ask('Block ka naam:', 'BLK' + (Object.keys(doc.blocks).length + 1)); if (!nm) break;
      const existed = !!doc.blocks[nm]; pushUndo();
      doc.blocks[nm] = { base: [p.x, p.y], ents: JSON.parse(JSON.stringify(sel)).map(x => { delete x.id; return x; }) };
      if (window.confirm('Original objects ko block (insert) se replace kar dun? (OK = haa)')) { doc.ents = doc.ents.filter(e => !sel.includes(e)); doc.ents.push(mkInsert(nm, p.x, p.y, { attrs: {} })); }
      sel = []; pts = []; stage = 'sel'; say(existed ? 'Block "' + nm + '" update hua: saare inserts badal gaye' : 'Block "' + nm + '" ban gaya'); draw(); return;
    }
    case 'insert': { if (!doc.blocks[tmp.name]) break; commit(mkInsert(tmp.name, p.x, p.y, { sc: tmp.sc, rot: tmp.rot })); break; }
    case 'offset':
      if (!pickEnt) { const e = pickAt(cur.x, cur.y); if (e && ['line', 'circle', 'arc', 'pline'].includes(e.type)) pickEnt = e; else say('Line / circle / arc / polyline chuno'); }
      else { const r = G.offset(pickEnt, tmp.d, p.x, p.y); if (r) { pushUndo(); doc.ents.push(r); } else say('Offset nahi ho saka'); pickEnt = null; }
      break;
    case 'trim': { const e = pickAt(cur.x, cur.y); if (e) doTrim(e, cur.x, cur.y); else say('Yahan koi object nahi'); break; }
    case 'extend': {
      const e = pickAt(cur.x, cur.y); if (!e) { say('Yahan koi object nahi'); break; } if (e.type !== 'line') { say('Extend sirf line par'); break; }
      const r = G.extend(e, doc.ents.filter(x => x !== e && visible(x)), cur.x, cur.y); if (!r) { say('Extend nahi hua: boundary nahi mili'); break; }
      pushUndo(); doc.ents[doc.ents.indexOf(e)] = r; break;
    }
    case 'fillet': case 'chamfer': {
      const e = pickAt(cur.x, cur.y); if (!e || e.type !== 'line') { say('Sirf line chuno'); break; }
      if (!tmp.e1) { tmp.e1 = e; tmp.p1 = [cur.x, cur.y]; break; }
      const r = G.fillet(tmp.e1, tmp.p1, e, [cur.x, cur.y], tmp.r, tool === 'chamfer');
      if (!r) say('Ye lines fillet/chamfer nahi ho sakti (parallel ya bahut chhoti)');
      else { pushUndo(); doc.ents[doc.ents.indexOf(tmp.e1)] = r.e1; doc.ents[doc.ents.indexOf(e)] = r.e2; if (r.add) { r.add.layer = r.e1.layer; doc.ents.push(r.add); } }
      tmp = { r: tmp.r }; break;
    }
    case 'dim': case 'dimlin': pts.push(p); if (pts.length === 3) { commit(dimEnt(pts[0], pts[1], p, tool === 'dimlin')); pts = []; } break;
    case 'dimrad': case 'dimdia':
      if (!tmp.c) { const e = pickAt(cur.x, cur.y); if (e && (e.type === 'circle' || e.type === 'arc')) { tmp.c = e; pickEnt = e; } else say('Circle ya arc chuno'); }
      else { commit({ type: 'rdim', cx: tmp.c.cx, cy: tmp.c.cy, r: tmp.c.r, ox: p.x, oy: p.y, h: dimH(), dia: tool === 'dimdia' }); tmp = {}; pickEnt = null; }
      break;
    case 'dimang':
      pts.push(p); if (pts.length === 4) {
        const v = pts[0]; commit({ type: 'adim', vx: v.x, vy: v.y, a1: Math.atan2(pts[1].y - v.y, pts[1].x - v.x), a2: Math.atan2(pts[2].y - v.y, pts[2].x - v.x), r: Math.max(dist(v.x, v.y, p.x, p.y), 1e-6), h: dimH() }); pts = [];
      } break;
    case 'ellipse': pts.push(p); if (pts.length === 3) { const e = ellFrom(pts[0], pts[1], pts[2]); if (e) commit(e); else say('Ellipse nahi bani'); pts = []; } break;
    case 'spline': pts.push(p); break;
    case 'leader': pts.push(p); break;
    case 'point': commit({ type: 'point', x: p.x, y: p.y }); break;
    case 'donut': {
      const o = G.circlePoly(p.x, p.y, tmp.od / 2, 72);
      if (tmp.id > 0) { const inn = G.circlePoly(p.x, p.y, tmp.id / 2, 72).reverse(); commit({ type: 'hatch', pts: [...o, o[0], ...inn, inn[0]], pat: 'solid', ang: 0, sp: 1, ring: true }); }
      else commit({ type: 'hatch', pts: o, pat: 'solid', ang: 0, sp: 1, ring: true });
      break;
    }
    case 'xline': case 'ray':
      pts.push(p); if (pts.length === 2) { commit({ type: 'xline', x: pts[0].x, y: pts[0].y, ang: Math.atan2(p.y - pts[0].y, p.x - pts[0].x), ray: tool === 'ray' }); pts = tool === 'xline' ? [pts[0]] : []; } break;
    case 'table': {
      const [r, c, w, h] = tmp.t; pushUndo();
      for (let i = 0; i <= r; i++) doc.ents.push({ type: 'line', x1: p.x, y1: p.y - i * h, x2: p.x + c * w, y2: p.y - i * h, layer: curLayer });
      for (let j = 0; j <= c; j++) doc.ents.push({ type: 'line', x1: p.x + j * w, y1: p.y, x2: p.x + j * w, y2: p.y - r * h, layer: curLayer });
      break;
    }
    case 'textedit': {
      const e = pickAt(cur.x, cur.y); if (!e || (e.type !== 'text' && e.type !== 'leader')) { say('Text ya leader chuno'); break; }
      const t = ask('Naya text (nayi line ke liye |):', e.str || ''); if (t === null) break; const h = num(ask('Height:', e.h)); pushUndo(); e.str = t; if (h > 0) e.h = h; break;
    }
    case 'stretch':
      pts.push(p);
      if (pts.length === 4) {
        const a = pts[0], b = pts[1], r = { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) }, dx = pts[3].x - pts[2].x, dy = pts[3].y - pts[2].y; let cnt = 0;
        pushUndo(); doc.ents = doc.ents.map(e => { if (!editable(e)) return e; const t = G.stretch(e, r, dx, dy); if (t) { cnt++; return t; } return e; });
        say(cnt + ' objects stretch hue'); pts = [];
      } break;
    case 'break':
      if (!tmp.k) {
        const e = pickAt(cur.x, cur.y); if (!e || !['line', 'circle', 'arc', 'pline'].includes(e.type)) { say('Line / circle / arc / polyline chuno'); break; }
        tmp.k = 1; tmp.e = e; tmp.p1 = [cur.x, cur.y]; pickEnt = e;
      } else {
        const r = G.breakEnt(tmp.e, tmp.p1, [p.x, p.y]);
        if (!r) say('Break nahi hua'); else { pushUndo(); doc.ents.splice(doc.ents.indexOf(tmp.e), 1, ...r); }
        tmp = {}; pickEnt = null;
      } break;
    case 'breakat': {
      const e = pickAt(cur.x, cur.y); if (!e) { say('Object nahi mila'); break; } const q = G.nearestOn(e, p.x, p.y), r = q && ['line', 'arc', 'pline'].includes(e.type) ? G.breakAt(e, q) : null;
      if (!r) say('Yahan break nahi ho sakta'); else { pushUndo(); doc.ents.splice(doc.ents.indexOf(e), 1, ...r); } break;
    }
    case 'lengthen': {
      const e = pickAt(cur.x, cur.y); if (!e || (e.type !== 'line' && e.type !== 'arc')) { say('Line ya arc chuno'); break; }
      const r = G.lengthen(e, tmp.d, cur.x, cur.y); if (!r) { say('Lengthen nahi hua'); break; } pushUndo(); doc.ents[doc.ents.indexOf(e)] = r; break;
    }
    case 'align':
      pts.push(p);
      if (pts.length === 4) {
        const sc = window.confirm('Alignment points ke hisaab se scale bhi karun? (OK = haa)'), T = G.alignT([pts[0].x, pts[0].y], [pts[2].x, pts[2].y], [pts[1].x, pts[1].y], [pts[3].x, pts[3].y], sc);
        pushUndo(); sel.forEach(e => { doc.ents[doc.ents.indexOf(e)] = G.tx(e, T); }); resetModify(); return;
      } break;
    case 'arraypolar': {
      const t = ask('items (count), total angle', '6,360'); if (t === null) break; const [c, a] = t.split(',').map(parseFloat); if (!(c >= 2)) { say('Count kam se kam 2'); break; }
      const ang = (isNaN(a) ? 360 : a) * Math.PI / 180, step = Math.abs(ang - TAU) < 1e-9 ? ang / c : ang / (c - 1); pushUndo(); const add = [];
      for (let i = 1; i < c; i++) { const T = G.rotAbout(p.x, p.y, step * i); sel.forEach(e => add.push(G.tx(e, T))); }
      doc.ents.push(...add); resetModify(); return;
    }
    case 'match': {
      const e = pickAt(cur.x, cur.y); if (!e) { say('Object nahi mila'); break; }
      if (!tmp.k) { tmp.k = 1; tmp.src = e; pickEnt = e; }
      else { pushUndo(); const s0 = tmp.src; e.layer = s0.layer; ['color', 'lt', 'lw'].forEach(k => { if (s0[k] === undefined) delete e[k]; else e[k] = s0[k]; }); }
      break;
    }
    case 'pedit': {
      const e = pickAt(cur.x, cur.y); if (!e || !['pline', 'spline'].includes(e.type)) { say('Polyline ya spline chuno'); break; }
      const o = (ask('Option: C = close/open, R = reverse, S = spline banao, L = chhote tukdo me todo', 'C') || '').toUpperCase(); pushUndo(); const i = doc.ents.indexOf(e);
      if (o === 'C') e.closed = !e.closed; else if (o === 'R') e.pts.reverse();
      else if (o === 'S' && e.type === 'pline') doc.ents[i] = { type: 'spline', pts: e.pts, closed: e.closed, layer: e.layer };
      else if (o === 'L') { const x = G.explode(e); if (x) doc.ents.splice(i, 1, ...x); } else undoStack.pop();
      break;
    }
    case 'divide': case 'measure': {
      const e = pickAt(cur.x, cur.y); if (!e) { say('Object chuno'); break; }
      const v = num(ask(tool === 'divide' ? 'Kitne hisson me baantna hai?' : 'Kitni doori par point lagana hai?', tool === 'divide' ? '5' : String(niceNum(20 / view.s))));
      const r = tool === 'divide' ? G.divide(e, Math.round(v)) : G.measure(e, v); if (!r || !r.length) { say('Ho nahi saka'); break; }
      pushUndo(); r.forEach(q => doc.ents.push({ type: 'point', x: q[0], y: q[1], layer: curLayer })); break;
    }
    case 'grip':
      if (!gripSel) { const e = pickAt(cur.x, cur.y); if (!e || !G.grips(e).length) { say('Is object par grips nahi hain'); break; } gripSel = { e, g: null }; pickEnt = e; }
      else if (!gripSel.g) {
        let best = null, bd = 30 / view.s; G.grips(gripSel.e).forEach(gr => { const d = dist(cur.x, cur.y, gr.x, gr.y); if (d < bd) { bd = d; best = gr; } });
        if (!best) { say('Neele grip ke paas tap karo'); break; } gripSel.g = best;
      } else { const n = G.moveGrip(gripSel.e, gripSel.g, p.x, p.y); if (n) { pushUndo(); doc.ents[doc.ents.indexOf(gripSel.e)] = n; } else say('Ye move nahi ho saka'); gripSel = null; pickEnt = null; }
      break;
    case 'dimedit': {
      const e = pickAt(cur.x, cur.y); if (!e || !['dim', 'rdim', 'adim'].includes(e.type)) { say('Dimension chuno'); break; }
      const t = ask('Dimension text (khali = automatic):', e.txt || ''); if (t === null) break; const h = num(ask('Text / arrow height:', e.h)); pushUndo(); if (t) e.txt = t; else delete e.txt; if (h > 0) e.h = h; break;
    }
    case 'dimcont': case 'dimbase': {
      if (!tmp.k) { const e = pickAt(cur.x, cur.y); if (!e || e.type !== 'dim') { say('Pehle linear / aligned dimension chuno'); break; } tmp.k = 1; tmp.base = e; tmp.cnt = 0; pickEnt = e; break; }
      const b = tmp.base; let nd;
      if (tool === 'dimcont') nd = Object.assign({}, b, { x1: b.x2, y1: b.y2, x2: p.x, y2: p.y });
      else { const inf = G.dimInfo(b), st = b.h * 3 * (tmp.cnt + 1); nd = Object.assign({}, b, { x2: p.x, y2: p.y, ox: b.ox + inf.nx * st, oy: b.oy + inf.ny * st }); }
      delete nd.txt; pushUndo(); doc.ents.push(nd); tmp.cnt++; if (tool === 'dimcont') { tmp.base = nd; pickEnt = nd; } break;
    }
    case 'props': { const e = pickAt(cur.x, cur.y, true); if (!e) { say('Object nahi mila'); break; } openProps(e); break; }
    case 'layiso': case 'layoff': case 'laylock': case 'laycur': {
      const e = pickAt(cur.x, cur.y, true); if (!e) { say('Object nahi mila'); break; } const l = layerOf(e.layer); pushUndo();
      if (tool === 'layiso') doc.layers.forEach(x => { x.vis = x === l; }); else if (tool === 'layoff') l.vis = false; else if (tool === 'laylock') l.lock = !l.lock; else { undoStack.pop(); curLayer = l.name; }
      say(tool === 'laycur' ? 'Current layer: ' + l.name : 'Layer ' + l.name + (tool === 'laylock' ? (l.lock ? ' lock' : ' unlock') : tool === 'layoff' ? ' off' : ' isolate')); layerUI(); break;
    }
    case 'extrude': {
      const e = pickAt(cur.x, cur.y); if (!e) { say('Closed polyline / circle chuno'); break; }
      if (!((e.type === 'pline' && e.closed && e.pts.length >= 3) || e.type === 'circle')) { say('Sirf closed polyline ya circle'); break; }
      const hz = ask('Height (minus = neeche), base elevation (optional) jaise 50 ya 50,10', String(niceNum(40 / view.s))); if (hz === null) break; const [h, z] = hz.split(',').map(parseFloat); if (!h) { say('Height galat'); break; }
      commit(e.type === 'circle' ? { type: 'solid', kind: 'cyl', cx: e.cx, cy: e.cy, r: e.r, z: z || 0, h } : { type: 'solid', kind: 'extrude', pts: e.pts.map(q => [q[0], q[1]]), z: z || 0, h }); say('3D solid ban gaya (original 2D rakha hai). 3D tab me 3D View dabao'); break;
    }
    case 'box': {
      pts.push(p); if (pts.length === 2) {
        const a = pts[0]; pts = []; if (Math.abs(a.x - p.x) < 1e-9 || Math.abs(a.y - p.y) < 1e-9) { say('Box ka size zero'); break; }
        const hz = ask('Height, base elevation (optional) jaise 50 ya 50,10', String(niceNum(40 / view.s))); if (hz === null) break; const [h, z] = hz.split(',').map(parseFloat); if (!h) { say('Height galat'); break; }
        commit({ type: 'solid', kind: 'box', pts: [[a.x, a.y], [p.x, a.y], [p.x, p.y], [a.x, p.y]], z: z || 0, h });
      } break;
    }
    case 'cyl': case 'cone': case 'sph': {
      pts.push(p); if (pts.length === 2) {
        const c = pts[0], r = dist(c.x, c.y, p.x, p.y); pts = []; if (!(r > 1e-9)) break;
        if (tool === 'sph') { commit({ type: 'solid', kind: 'sph', cx: c.x, cy: c.y, r, z: 0, h: 2 * r }); break; }
        const hz = ask('Height, base elevation (optional) jaise 50 ya 50,10', String(niceNum(40 / view.s))); if (hz === null) break; const [h, z] = hz.split(',').map(parseFloat); if (!h) { say('Height galat'); break; }
        commit({ type: 'solid', kind: tool, cx: c.x, cy: c.y, r, z: z || 0, h });
      } break;
    }
    case 'attdef': {
      const tag = ask('Attribute tag (jaise ID, NAME):', 'TAG'); if (!tag) break; const prm = ask('Prompt (insert karte waqt yahi poocha jayega):', tag), def = ask('Default value:', ''), h = num(ask('Text height:', dimH())); if (!(h > 0)) break;
      commit({ type: 'attdef', x: p.x, y: p.y, h, tag: tag.toUpperCase().replace(/\s+/g, '_'), prm: prm || tag, def: def || '' }); break;
    }
    case 'attedit': {
      const e = pickAt(cur.x, cur.y); if (!e || e.type !== 'insert') { say('Block insert chuno'); break; }
      const b = doc.blocks[e.name], defs = b ? b.ents.filter(x => x.type === 'attdef') : []; if (!defs.length) { say('Is block me attribute nahi hain'); break; }
      pushUndo(); e.attrs = e.attrs || {}; defs.forEach(d => { const v = ask((d.prm || d.tag) + ':', e.attrs[d.tag] != null ? e.attrs[d.tag] : (d.def || '')); if (v !== null) e.attrs[d.tag] = v; }); break;
    }
    case 'conh': case 'conv': case 'conlen': case 'conrad': case 'confix': case 'condel': { const e = pickAt(cur.x, cur.y); if (!e) { say('Object chuno'); break; } conSingle(tool, e); break; }
    case 'conpar': case 'conperp': case 'coneq': case 'coneqr': case 'conconc': case 'concoin': {
      const e = pickAt(cur.x, cur.y); if (!e) { say('Object chuno'); break; }
      if (!tmp.k) { tmp.k = 1; tmp.a = e; tmp.pa = endIdx(e, cur); pickEnt = e; break; }
      conPair(tool, tmp.a, tmp.pa, e, endIdx(e, cur)); tmp = {}; pickEnt = null; break;
    }
    case 'dist': pts.push(p); if (pts.length === 2) { const a = pts[0]; say(`Distance ${dist(a.x, a.y, p.x, p.y).toFixed(3)} | dx ${(p.x - a.x).toFixed(3)} dy ${(p.y - a.y).toFixed(3)} | angle ${(normA(Math.atan2(p.y - a.y, p.x - a.x)) * 180 / Math.PI).toFixed(2)}\u00B0`); pts = []; draw(); return; } break;
    case 'area': {
      const e = pickAt(cur.x, cur.y), r = e && G.area(e); say(r ? `Area ${r.a.toFixed(3)} | Perimeter ${r.p.toFixed(3)}` : 'Closed polyline ya circle chuno'); return;
    }
  }
  afterEdit(); updatePrompt(); draw();
}
function afterEdit() { if (doc.cons.length) CON.solve(doc); }

// ================= input =================
const DRAG_TOOLS = new Set(['line', 'pline', 'rect', 'polygon', 'circle', 'ellipse', 'arc', 'spline', 'leader', 'dim', 'dimlin', 'dimang', 'mirror', 'stretch', 'move', 'copy', 'align', 'dist', 'xline', 'ray', 'box', 'cyl', 'cone', 'sph']);
const ptr = new Map(); const g = { start: null, moved: false, multi: false, lastD: 0, lastMid: null, t: 0, prev: null, td: false, placed: false };
function curFromScreen(sx, sy, off) { const r = cv.getBoundingClientRect(); [cur.x, cur.y] = s2w(sx - r.left, sy - r.top - (off || 0)); }
function placeAtCur() { draw(); addPoint({ x: pos.x, y: pos.y }); }
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptr.size === 1) { g.start = { x: e.clientX, y: e.clientY }; g.prev = { x: e.clientX, y: e.clientY }; g.moved = false; g.multi = false; g.t = Date.now(); g.td = touchDraw && !!tool; g.placed = false; }
  if (ptr.size >= 2) { g.multi = true; const [a, b] = [...ptr.values()]; g.lastD = Math.hypot(a.x - b.x, a.y - b.y); g.lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
});
cv.addEventListener('pointermove', e => {
  if (!ptr.has(e.pointerId)) return; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptr.size === 1 && !g.multi) {
    if (Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) > 8) g.moved = true;
    if (g.moved) {
      if (g.td) {
        if (!g.placed) {
          g.placed = true;
          if ((stage === 'main' && DRAG_TOOLS.has(tool) && pts.length === 0) || (stage === 'sel' && winMode && winPts.length === 0)) { curFromScreen(g.start.x, g.start.y, 0); placeAtCur(); }
        }
        curFromScreen(e.clientX, e.clientY, 44); draw();
      } else { cur.x += (e.clientX - g.prev.x) / view.s; cur.y -= (e.clientY - g.prev.y) / view.s; draw(); }
    }
    g.prev = { x: e.clientX, y: e.clientY };
  } else if (ptr.size >= 2) {
    const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, r = cv.getBoundingClientRect();
    view.ox += mid.x - g.lastMid.x; view.oy += mid.y - g.lastMid.y; if (g.lastD > 0) zoomAt(mid.x - r.left, mid.y - r.top, d / g.lastD);
    g.lastD = d; g.lastMid = mid; draw();
  }
});
function endPtr(e, ok) {
  if (!ptr.has(e.pointerId)) return; const single = ptr.size === 1; ptr.delete(e.pointerId);
  if (!single || g.multi || !ok) return;
  if (g.td) {
    if (g.moved) { curFromScreen(e.clientX, e.clientY, 44); placeAtCur(); }
    else if (Date.now() - g.t < 700) { curFromScreen(e.clientX, e.clientY, 0); placeAtCur(); }
  } else if (!g.moved && Date.now() - g.t < 350) { curFromScreen(e.clientX, e.clientY, 0); draw(); }
}
cv.addEventListener('pointerup', e => endPtr(e, true)); cv.addEventListener('pointercancel', e => endPtr(e, false));
function zoomAt(mx, my, k) { const ns = Math.max(0.001, Math.min(100000, view.s * k)); const wx = (mx - view.ox) / view.s, wy = (view.oy - my) / view.s; view.s = ns; view.ox = mx - wx * ns; view.oy = my + wy * ns; }
cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15); draw(); }, { passive: false });
function fit() {
  const bb = G.bbox(doc.ents.filter(visible)); if (!bb) { view.s = 2; view.ox = W / 2; view.oy = H / 2; return draw(); }
  const w = Math.max(bb.x1 - bb.x0, 1e-6), h = Math.max(bb.y1 - bb.y0, 1e-6);
  view.s = Math.min((W - 40) / w, (H - 40) / h); view.ox = W / 2 - (bb.x0 + w / 2) * view.s; view.oy = H / 2 + (bb.y0 + h / 2) * view.s; draw();
}

// ================= files =================
async function saveFile(name, data, b64) {
  const P = window.Capacitor && window.Capacitor.Plugins;
  try {
    if (P && P.Filesystem && P.Share) {
      const o = { path: name, data, directory: 'CACHE' }; if (!b64) o.encoding = 'utf8';
      const r = await P.Filesystem.writeFile(o); await P.Share.share({ title: name, url: r.uri, dialogTitle: 'Save / share karo' });
    } else {
      const bytes = b64 ? Uint8Array.from(atob(data), c => c.charCodeAt(0)) : data, a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes])); a.download = name; a.click();
    }
    say('Ready: ' + name);
  } catch (err) { say('Save error: ' + (err.message || err)); }
}
$('file').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const r = IO.parseDXF(await f.text()); pushUndo(); doc.ents = r.ents; doc.layers = r.layers; doc.blocks = {}; doc.cons = []; curLayer = '0'; sel = []; layerUI(); fit();
    say(`${r.ents.length} objects khule` + (r.skipped ? ` (${r.skipped} unsupported skip hue)` : ''));
  } catch (err) { say('DXF padhne me error'); }
  e.target.value = '';
});

// ================= layers =================
const COLORS = ['', 'Red', 'Yellow', 'Green', 'Cyan', 'Blue', 'Magenta', 'White'];
function layerUI() {
  const s = $('curLayer'); s.innerHTML = '';
  doc.layers.forEach(l => { const o = document.createElement('option'); o.value = l.name; o.textContent = l.name; s.appendChild(o); });
  if (!doc.layers.some(l => l.name === curLayer)) curLayer = doc.layers[0].name; s.value = curLayer;
  const list = $('lpList'); if ($('layerPanel').hidden) return; list.innerHTML = '';
  doc.layers.forEach(l => {
    const row = document.createElement('div'); row.className = 'lrow' + (l.name === curLayer ? ' cur' : '');
    const mk = (tag, html) => { const x = document.createElement(tag); if (html) x.innerHTML = html; return x; };
    const sw = mk('span'); sw.className = 'sw'; sw.style.background = G.ACI[l.color];
    const nm = mk('input'); nm.type = 'text'; nm.value = l.name; nm.disabled = l.name === '0';
    nm.onchange = () => { const v = nm.value.trim(); if (!v || doc.layers.some(x => x.name === v)) { nm.value = l.name; return; } pushUndo(); doc.ents.forEach(e => { if (e.layer === l.name) e.layer = v; }); if (curLayer === l.name) curLayer = v; l.name = v; layerUI(); };
    const curB = mk('button', l.name === curLayer ? 'Current' : 'Set current'); if (l.name === curLayer) curB.classList.add('active'); curB.onclick = () => { curLayer = l.name; layerUI(); };
    const sel1 = (opts, val, cb) => { const s = mk('select'); opts.forEach(([v, t]) => { const o = mk('option', t); o.value = v; s.appendChild(o); }); s.value = val; s.onchange = () => { pushUndo(); cb(s.value); draw(); layerUI(); }; return s; };
    const col = sel1(COLORS.slice(1).map((c, i) => [i + 1, c]), l.color, v => { l.color = +v; });
    const lt = sel1([['cont', 'Continuous'], ['dash', 'Dashed'], ['center', 'Center'], ['hidden', 'Hidden']], l.lt, v => { l.lt = v; });
    const lw = sel1([[0, 'Thin'], [1, 'Normal'], [2, 'Thick']], l.lw, v => { l.lw = +v; });
    const chk = (label, key) => { const lb = mk('label'); const c = mk('input'); c.type = 'checkbox'; c.checked = l[key]; c.onchange = () => { pushUndo(); l[key] = c.checked; draw(); }; lb.appendChild(c); lb.append(label); return lb; };
    const del = mk('button', 'Delete'); del.disabled = l.name === '0';
    del.onclick = () => {
      const used = doc.ents.some(e => e.layer === l.name); if (used && !confirm('Is layer ki saari objects bhi delete ho jayengi. Theek hai?')) return;
      pushUndo(); doc.ents = doc.ents.filter(e => e.layer !== l.name); doc.layers = doc.layers.filter(x => x !== l); if (curLayer === l.name) curLayer = '0'; layerUI(); draw();
    };
    [sw, nm, curB, col, lt, lw, chk('Show', 'vis'), chk('Lock', 'lock'), del].forEach(x => row.appendChild(x)); list.appendChild(row);
  });
}
$('lpAdd').onclick = () => { let i = doc.layers.length, n; do { n = 'Layer' + i++; } while (doc.layers.some(l => l.name === n)); pushUndo(); doc.layers.push(newLayer(n, (doc.layers.length % 7) + 1)); curLayer = n; layerUI(); };
$('lpClose').onclick = () => { $('layerPanel').hidden = true; layerUI(); draw(); };
$('curLayer').onchange = e => { curLayer = e.target.value; };

// ================= ribbon =================
const RIBBON = {
  Draw: [['line', 'Line'], ['pline', 'Polyline'], ['rect', 'Rect'], ['polygon', 'Polygon'], ['circle', 'Circle'], ['arc', 'Arc'], ['ellipse', 'Ellipse'], ['spline', 'Spline'], ['point', 'Point'], ['donut', 'Donut'], ['xline', 'Xline'], ['ray', 'Ray'], ['leader', 'Leader'], ['table', 'Table'], ['text', 'Text'], ['hatch', 'Hatch']],
  Modify: [['move', 'Move'], ['copy', 'Copy'], ['rotate', 'Rotate'], ['scale', 'Scale'], ['mirror', 'Mirror'], ['align', 'Align'], ['stretch', 'Stretch'], ['offset', 'Offset'], ['trim', 'Trim'], ['extend', 'Extend'], ['break', 'Break'], ['breakat', 'Break @'], ['join', 'Join'], ['lengthen', 'Lengthen'], ['fillet', 'Fillet'], ['chamfer', 'Chamfer'], ['array', 'Array'], ['arraypolar', 'Polar Array'], ['divide', 'Divide'], ['measure', 'Measure'], ['pedit', 'Pedit'], ['explode', 'Explode'], ['match', 'Match Prop'], ['grip', 'Grips'], ['erase', 'Erase'], ['chlayer', 'To layer']],
  Annotate: [['dim', 'Dim Aligned'], ['dimlin', 'Dim H/V'], ['dimrad', 'Radius'], ['dimdia', 'Diameter'], ['dimang', 'Angle'], ['dimcont', 'Dim Continue'], ['dimbase', 'Dim Baseline'], ['dimedit', 'Dim Edit'], ['@dimstyle', 'Dim Style'], ['text', 'Text'], ['textedit', 'Text Edit'], ['hatch', 'Hatch'], ['dist', 'Distance'], ['area', 'Area'], ['props', 'Properties']],
  Select: [['select', 'Select'], ['selwin', 'Window'], ['@selall', 'All'], ['@selnone', 'Clear'], ['props', 'Properties']],
  '3D': [['extrude', 'Extrude'], ['box', 'Box'], ['cyl', 'Cylinder'], ['cone', 'Cone'], ['sph', 'Sphere'], ['@view3d', '3D View'], ['@stl', 'Export STL']],
  Blocks: [['block', 'Make Block'], ['insert', 'Insert Block'], ['attdef', 'Define Attribute'], ['attedit', 'Edit Attribute'], ['@attext', 'Extract Attributes'], ['grip', 'Dynamic Grips'], ['explode', 'Explode (Block Edit)'], ['@attach', 'Attach DXF']],
  Constraints: [['conh', 'Horizontal'], ['conv', 'Vertical'], ['conpar', 'Parallel'], ['conperp', 'Perpendicular'], ['coneq', 'Equal Length'], ['coneqr', 'Equal Radius'], ['concoin', 'Coincident'], ['conconc', 'Concentric'], ['conlen', 'Length'], ['conrad', 'Radius'], ['confix', 'Fix'], ['condel', 'Remove'], ['@conshow', 'Show / Hide'], ['@conclear', 'Clear All']],
  Sheets: [['@sheets', 'Sheet Set'], ['@newsheet', 'New Sheet + Layout'], ['@publish', 'Publish All PDF']],
  Snap: [['@os_end', 'End'], ['@os_mid', 'Mid'], ['@os_cen', 'Center'], ['@os_qua', 'Quadrant'], ['@os_int', 'Intersect'], ['@os_per', 'Perpendicular'], ['@os_tan', 'Tangent'], ['@os_nea', 'Nearest'], ['@os_ins', 'Insert'], ['@os_nod', 'Node'], ['@snap', 'Snap On'], ['@grid', 'Grid'], ['@ortho', 'Ortho'], ['@polar', 'Polar']],
  Layer: [['@layers', 'Layers'], ['layiso', 'Isolate'], ['layoff', 'Layer Off'], ['laylock', 'Lock/Unlock'], ['laycur', 'Make Current'], ['@layunlock', 'Unlock All'], ['@layshow', 'Show All']],
  View: [['@undo', 'Undo'], ['@redo', 'Redo'], ['@fit', 'Fit'], ['@units', 'Units'], ['@ltscale', 'LT Scale']],
  File: [['@open', 'Open DXF'], ['@savedxf', 'Save DXF'], ['@pagesetup', 'Page Setup'], ['@savepdf', 'Save PDF'], ['@new', 'New']]
};
function buildRibbon() {
  const t = $('tabs'); t.innerHTML = '';
  Object.keys(RIBBON).forEach(k => { const b = document.createElement('button'); b.textContent = k; if (k === tab) b.className = 'active'; b.onclick = () => { tab = k; buildRibbon(); }; t.appendChild(b); });
  const tl = $('tools'); tl.innerHTML = '';
  RIBBON[tab].forEach(([id, label]) => {
    const b = document.createElement('button'); b.textContent = label;
    if (id[0] === '@') {
      const a = id.slice(1), on = a.startsWith('os_') ? osnap[a.slice(3)] : (a === 'snap' && snapOn) || (a === 'grid' && gridOn) || (a === 'ortho' && orthoOn) || (a === 'polar' && polarOn);
      if (on) b.classList.add('on'); b.onclick = () => action(a);
    } else { b.dataset.tool = id; if (id === tool) b.classList.add('active'); b.onclick = () => setTool(id); }
    tl.appendChild(b);
  });
}
function parsePage() {
  const parts = (doc.settings.page || 'A4,fit,Drawing').split(',').map(x => x.trim()), m = (parts[1] || '').match(/^1\s*:\s*([\d.]+)$/);
  return { paper: parts[0] || 'A4', ratio: m ? parseFloat(m[1]) : 0, title: parts.slice(2).join(',') || 'Drawing' };
}
function action(a) {
  if (a.startsWith('os_')) { const k = a.slice(3); osnap[k] = osnap[k] ? 0 : 1; buildRibbon(); draw(); return; }
  switch (a) {
    case 'undo': undo(); break; case 'redo': redo(); break; case 'fit': fit(); break;
    case 'snap': snapOn = !snapOn; buildRibbon(); draw(); break; case 'grid': gridOn = !gridOn; buildRibbon(); draw(); break;
    case 'ortho': orthoOn = !orthoOn; if (orthoOn) polarOn = false; buildRibbon(); draw(); break;
    case 'polar': { if (!polarOn) { const v = num(ask('Polar angle increment (degrees):', polarInc)); if (!(v > 0 && v <= 180)) break; polarInc = v; } polarOn = !polarOn; if (polarOn) orthoOn = false; buildRibbon(); draw(); break; }
    case 'layers': $('layerPanel').hidden = false; layerUI(); break;
    case 'layunlock': pushUndo(); doc.layers.forEach(l => { l.lock = false; }); layerUI(); draw(); say('Saari layers unlock'); break;
    case 'layshow': pushUndo(); doc.layers.forEach(l => { l.vis = true; }); layerUI(); draw(); say('Saari layers visible'); break;
    case 'open': $('file').click(); break;
    case 'attach': $('file2').click(); break;
    case 'units': {
      const r = ask('Decimals, unit (mm / cm / m / in)', doc.settings.prec + ',' + doc.settings.unit); if (r === null) break;
      const [d, u] = r.split(',').map(x => x.trim()), dn = parseInt(d, 10);
      if (!(dn >= 0 && dn <= 8) || !['mm', 'cm', 'm', 'in'].includes(u)) { say('Galat: jaise 2,mm'); break; }
      pushUndo(); doc.settings.prec = dn; doc.settings.unit = u; G.prec = dn; draw(); say('Units: ' + dn + ' decimals, ' + u); break;
    }
    case 'ltscale': { const v = num(ask('Linetype scale:', doc.settings.ltscale)); if (!(v > 0)) break; pushUndo(); doc.settings.ltscale = v; draw(); break; }
    case 'dimstyle': {
      const v = num(ask('Dimension text / arrow height (0 = zoom ke hisaab se automatic):', doc.settings.dimh)); if (isNaN(v) || v < 0) break;
      pushUndo(); doc.settings.dimh = v;
      if (v > 0 && window.confirm('Pehle se bani saari dimensions par bhi lagau?')) doc.ents.forEach(e => { if (['dim', 'rdim', 'adim'].includes(e.type)) e.h = v; });
      draw(); break;
    }
    case 'pagesetup': { const r = ask('Paper (A4/A3/A2/A1/A0), scale (fit ya 1:50), title', doc.settings.page); if (r !== null) { doc.settings.page = r; dirty = true; say('Page setup save'); } break; }
    case 'savedxf': saveFile(`drawing_${Date.now()}.dxf`, IO.toDXF(doc), false); break;
    case 'savepdf': {
      const pg = parsePage(), r = IO.toPDF(doc, { paper: pg.paper, ratio: pg.ratio, title: pg.title, date: new Date().toISOString().slice(0, 10), ents: sel.length ? sel : undefined });
      if (!r.fits && !window.confirm('Is scale par drawing page se bada hai. Phir bhi PDF banau?')) break;
      saveFile(`drawing_${Date.now()}.pdf`, btoa(r.pdf), true); break;
    }
    case 'touch': $('bTouch').onclick(); break;
    case 'conshow': showCons = !showCons; draw(); say(showCons ? 'Constraints dikh rahi hain' : 'Constraints chhupi hain'); break;
    case 'conclear': if (doc.cons.length && window.confirm('Saari constraints hata dun?')) { pushUndo(); doc.cons = []; draw(); } break;
    case 'view3d': open3D(); break;
    case 'stl': {
      const tris = []; doc.ents.forEach(e => { if (e.type === 'solid' && layerOf(e.layer).vis) tris.push(...S3.mesh(e)); });
      if (!tris.length) { say('Pehle 3D solid banao (3D tab)'); break; } saveFile(`model_${Date.now()}.stl`, S3.stl(tris, 'MyCAD'), false); break;
    }
    case 'attext': {
      const ins = doc.ents.filter(e => e.type === 'insert'); if (!ins.length) { say('Koi block insert nahi hai'); break; }
      const tags = [...new Set(ins.flatMap(e => Object.keys(e.attrs || {})))], q = v => '"' + String(v).replace(/"/g, '""') + '"';
      const rows = [['Block', 'X', 'Y', 'Layer', 'Rotation', 'ScaleX', 'ScaleY', ...tags].map(q).join(',')];
      ins.forEach(e => rows.push([e.name, G.fmt(e.x), G.fmt(e.y), e.layer, G.fmt((e.rot || 0) * 180 / Math.PI), e.sx || 1, e.sy || 1, ...tags.map(t => (e.attrs && e.attrs[t] != null) ? e.attrs[t] : '')].map(q).join(',')));
      saveFile(`attributes_${Date.now()}.csv`, rows.join('\n') + '\n', false); break;
    }
    case 'sheets': $('sheetPanel').hidden = false; renderSheets(); break;
    case 'newsheet': pushUndo(); doc.sheets.push(newSheetObj()); openLayout(doc.sheets.length - 1); break;
    case 'publish': {
      const r = IO.toPDFSheets(doc, { date: new Date().toISOString().slice(0, 10) }); if (!r) { say('Pehle Sheets tab se sheet banao'); break; }
      saveFile(`sheets_${Date.now()}.pdf`, btoa(r.pdf), true); break;
    }
    case 'selall': sel = doc.ents.filter(editable); say(sel.length + ' selected'); draw(); break;
    case 'selnone': sel = []; say('Selection saaf'); draw(); break;
    case 'new': if (doc.ents.length && !confirm('Poori drawing hata dun?')) break; pushUndo(); doc = { ents: [], layers: [newLayer('0')], blocks: {}, cons: [], sheets: [], settings: doc.settings }; ensureDoc(); curLayer = '0'; sel = []; pts = []; layerUI(); draw(); break;
  }
}

// ================= properties panel =================
const PFIELDS = {
  line: [['x1', 'X1'], ['y1', 'Y1'], ['x2', 'X2'], ['y2', 'Y2']], circle: [['cx', 'Center X'], ['cy', 'Center Y'], ['r', 'Radius']],
  arc: [['cx', 'Center X'], ['cy', 'Center Y'], ['r', 'Radius'], ['a1', 'Start angle', 'deg'], ['a2', 'End angle', 'deg']],
  ell: [['cx', 'Center X'], ['cy', 'Center Y'], ['rx', 'Radius X'], ['ry', 'Radius Y'], ['rot', 'Rotation', 'deg']],
  text: [['x', 'X'], ['y', 'Y'], ['h', 'Height'], ['rot', 'Rotation', 'deg'], ['str', 'Text', 'str']], leader: [['h', 'Height'], ['str', 'Text', 'str']],
  point: [['x', 'X'], ['y', 'Y']], xline: [['x', 'X'], ['y', 'Y'], ['ang', 'Angle', 'deg']], dim: [['h', 'Height'], ['txt', 'Text override', 'str']],
  rdim: [['h', 'Height'], ['txt', 'Text override', 'str']], adim: [['h', 'Height'], ['txt', 'Text override', 'str']], hatch: [['sp', 'Spacing'], ['ang', 'Angle', 'deg']],
  solid: [['h', 'Height'], ['z', 'Base elevation']], attdef: [['tag', 'Tag', 'str'], ['prm', 'Prompt', 'str'], ['def', 'Default', 'str'], ['h', 'Height'], ['x', 'X'], ['y', 'Y']],
  insert: [['x', 'X'], ['y', 'Y'], ['sx', 'Scale X'], ['sy', 'Scale Y'], ['rot', 'Rotation', 'deg'], ['rows', 'Rows'], ['cols', 'Columns'], ['dx', 'Column spacing'], ['dy', 'Row spacing']]
};
const PDEF = { sx: 1, sy: 1, rot: 0, rows: 1, cols: 1, dx: 0, dy: 0, z: 0 };
let propEnt = null, propRows = [];
function openProps(e) {
  propEnt = e; propRows = []; const L = $('ppList'); L.innerHTML = ''; $('propPanel').hidden = false;
  const row = (label, el) => { const r = document.createElement('div'); r.className = 'prow'; const lb = document.createElement('label'); lb.textContent = label; r.appendChild(lb); r.appendChild(el); L.appendChild(r); return el; };
  const inp = (v, t) => { const i = document.createElement('input'); i.type = 'text'; i.value = v; if (t) i.inputMode = 'decimal'; return i; };
  const sel2 = (opts, val) => { const x = document.createElement('select'); opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; x.appendChild(o); }); x.value = String(val); return x; };
  const info = document.createElement('div'); info.className = 'prow'; info.textContent = 'Type: ' + e.type; L.appendChild(info);
  (PFIELDS[e.type] || []).forEach(([k, label, kind]) => {
    let v = e[k]; if (v === undefined) v = PDEF[k]; if (v === undefined) v = '';
    v = kind === 'deg' ? +(v * 180 / Math.PI).toFixed(6) : kind === 'str' ? v : (v === '' ? '' : +(+v).toFixed(6));
    const el = row(label, inp(v, kind !== 'str'));
    propRows.push({ apply: ent => { const val = el.value; if (kind === 'str') { if (val) ent[k] = val; else if (k === 'txt') delete ent[k]; } else { const n = parseFloat(val); if (!isNaN(n)) ent[k] = kind === 'deg' ? n * Math.PI / 180 : n; } } });
  });
  if (e.type === 'insert') {
    const b = doc.blocks[e.name], states = G.blockStates(b);
    if (states.length) { const st = row('State', sel2([['', 'All'], ...states.map(x => [x, x])], e.state || '')); propRows.push({ apply: ent => { if (st.value) ent.state = st.value; else delete ent.state; } }); }
    const fx = row('Flip X', sel2([['0', 'No'], ['1', 'Yes']], e.fx ? 1 : 0)), fy = row('Flip Y', sel2([['0', 'No'], ['1', 'Yes']], e.fy ? 1 : 0));
    propRows.push({ apply: ent => { ent.fx = fx.value === '1'; ent.fy = fy.value === '1'; } });
    (b ? b.ents.filter(x => x.type === 'attdef') : []).forEach(d => { const el = row('Attr ' + d.tag, inp((e.attrs && e.attrs[d.tag] != null) ? e.attrs[d.tag] : (d.def || ''))); propRows.push({ apply: ent => { ent.attrs = ent.attrs || {}; ent.attrs[d.tag] = el.value; } }); });
  }
  const lay = row('Layer', sel2(doc.layers.map(l => [l.name, l.name]), e.layer || '0'));
  const col = row('Color', sel2([['', 'ByLayer'], ...COLORS.slice(1).map((c, i) => [i + 1, c])], e.color || ''));
  const lt = row('Linetype', sel2([['', 'ByLayer'], ['cont', 'Continuous'], ['dash', 'Dashed'], ['center', 'Center'], ['hidden', 'Hidden']], e.lt || ''));
  const lw = row('Lineweight', sel2([['', 'ByLayer'], ['0', 'Thin'], ['1', 'Normal'], ['2', 'Thick']], e.lw != null ? e.lw : ''));
  const vs = row('Visibility tag', inp(e.vs || '', false));
  propRows.push({ apply: ent => { ent.layer = lay.value; if (col.value) ent.color = +col.value; else delete ent.color; if (lt.value) ent.lt = lt.value; else delete ent.lt; if (lw.value !== '') ent.lw = +lw.value; else delete ent.lw; if (vs.value) ent.vs = vs.value; else delete ent.vs; } });
}
$('ppApply').onclick = () => { const e = propEnt; if (!e) return; pushUndo(); propRows.forEach(r => r.apply(e)); afterEdit(); $('propPanel').hidden = true; propEnt = null; draw(); };
$('ppClose').onclick = () => { $('propPanel').hidden = true; propEnt = null; };
$('file2').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const r = IO.parseDXF(await f.text()); if (!r.ents.length) { say('Is DXF me kuch nahi mila'); e.target.value = ''; return; }
    pushUndo(); r.layers.forEach(l => { if (!doc.layers.some(x => x.name === l.name)) doc.layers.push(l); });
    const nm = f.name.replace(/\.[^.]+$/, '').replace(/[^\w-]/g, '_') || 'XREF'; doc.blocks[nm] = { base: [0, 0], ents: r.ents }; layerUI(); setTool('insert');
  } catch (err) { say('DXF padhne me error'); }
  e.target.value = '';
});

// ================= command line =================
const CMDS = { L: 'line', LINE: 'line', PL: 'pline', PLINE: 'pline', REC: 'rect', RECT: 'rect', POL: 'polygon', C: 'circle', CIRCLE: 'circle', A: 'arc', ARC: 'arc', T: 'text', TEXT: 'text', H: 'hatch', HATCH: 'hatch',
  M: 'move', MOVE: 'move', CO: 'copy', CP: 'copy', COPY: 'copy', RO: 'rotate', ROTATE: 'rotate', SC: 'scale', SCALE: 'scale', MI: 'mirror', MIRROR: 'mirror', O: 'offset', OFFSET: 'offset',
  TR: 'trim', TRIM: 'trim', EX: 'extend', EXTEND: 'extend', F: 'fillet', FILLET: 'fillet', CHA: 'chamfer', CHAMFER: 'chamfer', AR: 'array', ARRAY: 'array', X: 'explode', EXPLODE: 'explode', E: 'erase', ERASE: 'erase',
  DIM: 'dim', DAL: 'dim', DLI: 'dimlin', DRA: 'dimrad', DDI: 'dimdia', DAN: 'dimang', DI: 'dist', DIST: 'dist', AA: 'area', AREA: 'area', B: 'block', BLOCK: 'block', I: 'insert', INSERT: 'insert', S: 'select', SELECT: 'select', CLA: 'chlayer',
  EL: 'ellipse', ELLIPSE: 'ellipse', SPL: 'spline', SPLINE: 'spline', PO: 'point', POINT: 'point', DO: 'donut', DONUT: 'donut', XL: 'xline', XLINE: 'xline', RAY: 'ray', LE: 'leader', LEADER: 'leader', TB: 'table', TABLE: 'table',
  ED: 'textedit', TEXTEDIT: 'textedit', ST: 'stretch', STRETCH: 'stretch', BR: 'break', BREAK: 'break', BA: 'breakat', J: 'join', JOIN: 'join', LEN: 'lengthen', LENGTHEN: 'lengthen', AL: 'align', ALIGN: 'align', MA: 'match',
  PE: 'pedit', PEDIT: 'pedit', DIV: 'divide', DIVIDE: 'divide', ME: 'measure', MEASURE: 'measure', ARP: 'arraypolar', GR: 'grip', GRIPS: 'grip', DED: 'dimedit', DCO: 'dimcont', DBA: 'dimbase', PR: 'props', PROPERTIES: 'props',
  EXT: 'extrude', EXTRUDE: 'extrude', BOX: 'box', CYL: 'cyl', CYLINDER: 'cyl', CONE: 'cone', SPH: 'sph', SPHERE: 'sph', ATTDEF: 'attdef', ATT: 'attdef', ATE: 'attedit', ATTEDIT: 'attedit',
  CONH: 'conh', CONV: 'conv', CONPAR: 'conpar', CONPERP: 'conperp', CONEQ: 'coneq', CONEQR: 'coneqr', CONCOIN: 'concoin', CONCONC: 'conconc', CONLEN: 'conlen', CONRAD: 'conrad', CONFIX: 'confix', CONDEL: 'condel',
  LAI: 'layiso', LAO: 'layoff', LAL: 'laylock', LAC: 'laycur', DIMLIN: 'dimlin', DIMRAD: 'dimrad', DIMDIA: 'dimdia', DIMANG: 'dimang' };
function runCmd(txt) {
  txt = txt.trim().toUpperCase(); if (!txt) return finish();
  if (CMDS[txt]) return setTool(CMDS[txt]);
  const acts = { U: 'undo', UNDO: 'undo', REDO: 'redo', Z: 'fit', ZE: 'fit', FIT: 'fit', LA: 'layers', LAYER: 'layers', ALL: 'selall', ORTHO: 'ortho', F8: 'ortho', SNAP: 'snap', GRID: 'grid', UNITS: 'units', LTS: 'ltscale', LTSCALE: 'ltscale', DIMSTYLE: 'dimstyle', PAGE: 'pagesetup', PLOT: 'savepdf', POLAR: 'polar', VIEW3D: 'view3d', '3D': 'view3d', STL: 'stl', ATTEXT: 'attext', SHEETS: 'sheets', NEWSHEET: 'newsheet', PUBLISH: 'publish', CONSHOW: 'conshow', CONCLEAR: 'conclear', TOUCH: 'touch', ATTACH: 'attach', XREF: 'attach' };
  if (acts[txt]) return action(acts[txt]);
  if (txt === 'ESC') { sel = []; return setTool(null); }
  if (txt === 'CL' || txt === 'CLOSE') return closeShape();
  const base = pts.length ? pts[pts.length - 1] : (lastPoint || { x: 0, y: 0 }); let m;
  if ((m = txt.match(/^(@?)(-?[\d.]+)\s*,\s*(-?[\d.]+)$/))) { const x = parseFloat(m[2]), y = parseFloat(m[3]); return addPoint(m[1] ? { x: base.x + x, y: base.y + y } : { x, y }); }
  if ((m = txt.match(/^@?(-?[\d.]+)\s*<\s*(-?[\d.]+)$/))) { const l = parseFloat(m[1]), a = parseFloat(m[2]) * Math.PI / 180; return addPoint({ x: base.x + l * Math.cos(a), y: base.y + l * Math.sin(a) }); }
  if ((m = txt.match(/^(-?[\d.]+)$/)) && pts.length) { const n = parseFloat(m[1]), a = Math.atan2(pos.y - base.y, pos.x - base.x); return addPoint({ x: base.x + n * Math.cos(a), y: base.y + n * Math.sin(a) }); }
  say('Command samajh nahi aaya: ' + txt);
}

// ================= buttons =================
$('bPoint').onclick = () => addPoint({ x: pos.x, y: pos.y });
$('bDone').onclick = finish; $('bClose').onclick = closeShape;
$('bTouch').onclick = () => { touchDraw = !touchDraw; $('bTouch').textContent = 'Touch: ' + (touchDraw ? 'ON' : 'OFF'); say(touchDraw ? 'Touch draw ON: tap = point, tap+drag = kheencho' : 'Touch draw OFF: crosshair + Point'); };
$('bEsc').onclick = () => { sel = []; gripSel = null; setTool(null); };
$('cmd').addEventListener('keydown', e => { if (e.key === 'Enter') { runCmd(e.target.value); e.target.value = ''; } });

// ================= 3D viewer =================
const v3 = { az: -0.75, el: 0.55, s: 1, ox: 0, oy: 0, c: [0, 0, 0], mode: 0, tris: [], lines: [] };
const V3MODES = ['Shaded', 'Shaded+Edges', 'Wire'];
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function build3D() {
  v3.tris = []; v3.lines = [];
  doc.ents.forEach(e => {
    const l = layerOf(e.layer); if (!l.vis) return;
    G.flat([e]).forEach(x => {
      const lx = layerOf(x.layer); if (!lx.vis) return; const col = G.ACI[x.color || lx.color] || '#dddddd';
      if (x.type === 'solid') S3.mesh(x).forEach(t => v3.tris.push({ t, col }));
      else if (x.type !== 'hatch' && x.type !== 'text' && x.type !== 'attdef' && x.type !== 'xline') G.prims(x).forEach(pr => {
        if (pr.k === 'poly' && !pr.fill) v3.lines.push({ pts: (pr.closed ? [...pr.pts, pr.pts[0]] : pr.pts).map(q => [q[0], q[1], 0]), col });
        else if (pr.k === 'arc') { const sp = pr.full ? TAU : (normA(pr.a2 - pr.a1) || TAU); v3.lines.push({ pts: Array.from({ length: 49 }, (_, i) => [pr.cx + pr.r * Math.cos(pr.a1 + sp * i / 48), pr.cy + pr.r * Math.sin(pr.a1 + sp * i / 48), 0]), col }); }
      });
    });
  });
  const key = p => p.map(v => Math.round(v * 1e4)).join(','), em = new Map();
  v3.tris.forEach((o, i) => { o.n = S3.normal(o.t); o.feat = [false, false, false]; for (let k = 0; k < 3; k++) { const ka = key(o.t[k]), kb = key(o.t[(k + 1) % 3]), ek = ka < kb ? ka + '|' + kb : kb + '|' + ka; if (!em.has(ek)) em.set(ek, []); em.get(ek).push({ i, k }); } });
  em.forEach(list => { const f = list.length !== 2 || dot3(v3.tris[list[0].i].n, v3.tris[list[1].i].n) < 0.93; list.forEach(({ i, k }) => { v3.tris[i].feat[k] = f; }); });
}
function fit3D() {
  const c3 = $('cv3'), pts3 = []; v3.tris.forEach(o => o.t.forEach(q => pts3.push(q))); v3.lines.forEach(l => l.pts.forEach(q => pts3.push(q)));
  if (!pts3.length) { v3.c = [0, 0, 0]; v3.s = 1; } else {
    const lo = [0, 1, 2].map(k => Math.min(...pts3.map(q => q[k]))), hi = [0, 1, 2].map(k => Math.max(...pts3.map(q => q[k])));
    v3.c = lo.map((v, k) => (v + hi[k]) / 2); const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1; v3.s = Math.min(c3.clientWidth, c3.clientHeight) * 0.8 / diag;
  }
  v3.ox = c3.clientWidth / 2; v3.oy = c3.clientHeight / 2;
}
function render3D() {
  const c = $('cv3'), x = c.getContext('2d'), d = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  c.width = w * d; c.height = h * d; x.setTransform(d, 0, 0, d, 0, 0); x.fillStyle = '#0c0e10'; x.fillRect(0, 0, w, h);
  const cam = S3.camera(v3.az, v3.el), P = a => { const q = cam(a[0] - v3.c[0], a[1] - v3.c[1], a[2] - v3.c[2]); return [v3.ox + q[0] * v3.s, v3.oy - q[1] * v3.s, q[2]]; };
  x.lineWidth = 1; x.globalAlpha = 0.7; v3.lines.forEach(l => { x.strokeStyle = l.col; x.beginPath(); l.pts.forEach((q, i) => { const r = P(q); if (i) x.lineTo(r[0], r[1]); else x.moveTo(r[0], r[1]); }); x.stroke(); }); x.globalAlpha = 1;
  const items = v3.tris.map(o => { const a = o.t.map(P); return { o, a, d: (a[0][2] + a[1][2] + a[2][2]) / 3 }; }).sort((p, q) => q.d - p.d);
  const Lv = [0.35, -0.5, 0.8], ll = Math.hypot(...Lv), Ln = Lv.map(v => v / ll);
  items.forEach(({ o, a }) => {
    if (v3.mode < 2) {
      const k = 0.3 + 0.7 * Math.abs(dot3(o.n, Ln)), col = `rgb(${hex2rgb(o.col).map(v => Math.round(v * k)).join(',')})`;
      x.fillStyle = col; x.strokeStyle = col; x.lineWidth = 0.7; x.beginPath(); x.moveTo(a[0][0], a[0][1]); x.lineTo(a[1][0], a[1][1]); x.lineTo(a[2][0], a[2][1]); x.closePath(); x.fill(); x.stroke();
    }
    if (v3.mode >= 1) { x.strokeStyle = v3.mode === 2 ? o.col : '#050505'; x.lineWidth = v3.mode === 2 ? 1 : 1.2; for (let k = 0; k < 3; k++) if (o.feat[k]) { x.beginPath(); x.moveTo(a[k][0], a[k][1]); x.lineTo(a[(k + 1) % 3][0], a[(k + 1) % 3][1]); x.stroke(); } }
  });
  $('v3Hint').textContent = v3.tris.length ? `${v3.tris.length} faces | ${V3MODES[v3.mode]} | 1 ungli = ghumao, 2 ungli = zoom / pan` : 'Koi 3D solid nahi hai. 3D tab me Extrude / Box / Cylinder / Cone / Sphere banao';
}
function open3D() { $('v3d').hidden = false; build3D(); fit3D(); render3D(); }
function setView3(az, el) { v3.az = az; v3.el = el; render3D(); }
$('v3Iso').onclick = () => setView3(-Math.PI / 4, 0.6); $('v3Front').onclick = () => setView3(0, 0); $('v3Right').onclick = () => setView3(-Math.PI / 2, 0); $('v3Top').onclick = () => setView3(0, Math.PI / 2);
$('v3Mode').onclick = () => { v3.mode = (v3.mode + 1) % 3; $('v3Mode').textContent = V3MODES[v3.mode]; render3D(); };
$('v3Fit').onclick = () => { fit3D(); render3D(); }; $('v3Stl').onclick = () => action('stl'); $('v3Close').onclick = () => { $('v3d').hidden = true; };
{
  const p3 = new Map(); let last = null;
  const c3 = $('cv3');
  c3.addEventListener('pointerdown', e => { c3.setPointerCapture(e.pointerId); p3.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = null; });
  c3.addEventListener('pointermove', e => {
    if (!p3.has(e.pointerId)) return; const old = p3.get(e.pointerId); p3.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (p3.size === 1) { v3.az -= (e.clientX - old.x) * 0.01; v3.el = Math.max(-1.55, Math.min(1.55, v3.el + (e.clientY - old.y) * 0.01)); render3D(); }
    else if (p3.size >= 2) {
      const [a, b] = [...p3.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (last) { v3.ox += mid.x - last.mid.x; v3.oy += mid.y - last.mid.y; if (last.d > 0) v3.s = Math.max(1e-4, v3.s * d / last.d); render3D(); }
      last = { d, mid };
    }
  });
  const up = e => { p3.delete(e.pointerId); last = null; }; c3.addEventListener('pointerup', up); c3.addEventListener('pointercancel', up);
  c3.addEventListener('wheel', e => { e.preventDefault(); v3.s *= e.deltaY < 0 ? 1.15 : 1 / 1.15; render3D(); }, { passive: false });
}

// ================= sheet set + layouts =================
const UMM = { mm: 1, cm: 10, m: 1000, in: 25.4 };
const newSheetObj = () => { let n = doc.sheets.length + 1, nm; do { nm = 'Sheet' + n++; } while (doc.sheets.some(x => x.name === nm)); return { name: nm, paper: 'A3', land: true, title: '', vps: [] }; };
function renderSheets() {
  const list = $('shList'); list.innerHTML = '';
  if (!doc.sheets.length) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = 'Koi sheet nahi. "+ Sheet" dabao.'; list.appendChild(d); }
  doc.sheets.forEach((sh, i) => {
    const row = document.createElement('div'); row.className = 'lrow'; const mk = (t, html) => { const x = document.createElement(t); if (html) x.innerHTML = html; return x; };
    const nm = mk('input'); nm.type = 'text'; nm.value = sh.name; nm.onchange = () => { const v = nm.value.trim(); if (!v || doc.sheets.some(x => x !== sh && x.name === v)) { nm.value = sh.name; return; } pushUndo(); sh.name = v; };
    const pp = mk('select'); ['A4', 'A3', 'A2', 'A1', 'A0'].forEach(v => { const o = mk('option', v); o.value = v; pp.appendChild(o); }); pp.value = sh.paper; pp.onchange = () => { pushUndo(); sh.paper = pp.value; };
    const ori = mk('select'); [['1', 'Landscape'], ['0', 'Portrait']].forEach(([v, t]) => { const o = mk('option', t); o.value = v; ori.appendChild(o); }); ori.value = sh.land === false ? '0' : '1'; ori.onchange = () => { pushUndo(); sh.land = ori.value === '1'; };
    const ti = mk('input'); ti.type = 'text'; ti.placeholder = 'Title block text'; ti.value = sh.title || ''; ti.onchange = () => { pushUndo(); sh.title = ti.value; };
    const lb = mk('button', 'Layout (' + sh.vps.length + ' vp)'); lb.onclick = () => openLayout(i);
    const del = mk('button', 'Delete'); del.onclick = () => { if (!confirm('Sheet "' + sh.name + '" delete karun?')) return; pushUndo(); doc.sheets.splice(i, 1); renderSheets(); };
    [nm, pp, ori, ti, lb, del].forEach(x => row.appendChild(x)); list.appendChild(row);
  });
}
$('shAdd').onclick = () => { pushUndo(); doc.sheets.push(newSheetObj()); renderSheets(); };
$('shPub').onclick = () => action('publish'); $('shClose').onclick = () => { $('sheetPanel').hidden = true; };

const lay = { si: 0, sel: -1, mode: 'sel', ppm: 1, px0: 0, py0: 0, pan: false, drag: null };
const layUnit = () => UMM[doc.settings.unit] || 1;
function openLayout(i) { lay.si = i; lay.sel = -1; lay.mode = 'sel'; $('sheetPanel').hidden = true; $('layoutView').hidden = false; $('lyTitle').textContent = 'Layout: ' + doc.sheets[i].name; renderLayout(); }
function layMM(px, py) { const [pw, ph] = IO.paperDims(doc.sheets[lay.si]); return [(px - lay.px0) / lay.ppm, ph - (py - lay.py0) / lay.ppm]; }
function renderLayout() {
  const sh = doc.sheets[lay.si]; if (!sh) return;
  const c = $('lyCv'), x = c.getContext('2d'), d = window.devicePixelRatio || 1, cw = c.clientWidth, ch = c.clientHeight, [pw, ph] = IO.paperDims(sh);
  c.width = cw * d; c.height = ch * d; x.setTransform(d, 0, 0, d, 0, 0);
  lay.ppm = Math.min((cw - 16) / pw, (ch - 16) / ph); lay.px0 = (cw - pw * lay.ppm) / 2; lay.py0 = (ch - ph * lay.ppm) / 2;
  const ppm = lay.ppm, P = (mx, my) => [lay.px0 + mx * ppm, lay.py0 + (ph - my) * ppm];
  x.fillStyle = '#20252a'; x.fillRect(0, 0, cw, ch); x.fillStyle = '#fff'; x.fillRect(lay.px0, lay.py0, pw * ppm, ph * ppm);
  x.strokeStyle = '#000'; x.lineWidth = 1.5; let q = P(10, ph - 10); x.strokeRect(q[0], q[1], (pw - 20) * ppm, (ph - 20) * ppm);
  q = P(pw - 110, 32); x.lineWidth = 1; x.strokeRect(q[0], q[1], 100 * ppm, 22 * ppm); x.fillStyle = '#000'; x.font = Math.max(5 * ppm, 7) + 'px sans-serif'; x.fillText(sh.title || sh.name, q[0] + 3 * ppm, q[1] + 9 * ppm);
  x.font = Math.max(3 * ppm, 6) + 'px sans-serif'; x.fillText(`Sheet ${lay.si + 1}/${doc.sheets.length}  ${doc.settings.unit}`, q[0] + 3 * ppm, q[1] + 19 * ppm);
  const savedView = { s: view.s, ox: view.ox, oy: view.oy }, savedV = G.view, u = layUnit();
  sh.vps.forEach((vp, i) => {
    const tl = P(vp.x, vp.y + vp.h); x.save(); x.beginPath(); x.rect(tl[0], tl[1], vp.w * ppm, vp.h * ppm); x.clip();
    const S = ppm * u / vp.ratio; view.s = S; view.ox = lay.px0 + (vp.x + vp.w / 2) * ppm - vp.mx * S; view.oy = lay.py0 + (ph - (vp.y + vp.h / 2)) * ppm + vp.my * S;
    G.view = { cx: vp.mx, cy: vp.my, r: Math.hypot(vp.w, vp.h) * ppm / S };
    ctx = x; drawEntities(doc.ents, null, new Set(vp.hide || []), true); ctx = mainCtx; x.restore();
    x.strokeStyle = i === lay.sel ? '#2f7fb8' : '#000'; x.lineWidth = i === lay.sel ? 2.5 : 1; x.strokeRect(tl[0], tl[1], vp.w * ppm, vp.h * ppm);
    x.fillStyle = '#333'; x.font = '10px sans-serif'; x.fillText('1:' + vp.ratio, tl[0] + 3, tl[1] + vp.h * ppm - 3);
  });
  Object.assign(view, savedView); G.view = savedV; ctx = mainCtx;
  if (lay.drag && lay.mode === 'new' && lay.drag.moved) { x.strokeStyle = '#2f7fb8'; x.setLineDash([5, 4]); x.strokeRect(Math.min(lay.drag.x0, lay.drag.x1), Math.min(lay.drag.y0, lay.drag.y1), Math.abs(lay.drag.x1 - lay.drag.x0), Math.abs(lay.drag.y1 - lay.drag.y0)); x.setLineDash([]); }
  $('lyHint').textContent = lay.mode === 'new' ? 'Viewport ka rectangle drag karke banao' : lay.mode === 'pan' ? 'Viewport chuno, phir andar drag karke drawing khisko' : (sh.vps.length ? 'Viewport par tap karke chuno' : '"+ Viewport" dabao aur rectangle kheencho');
  $('lyPan').classList.toggle('active', lay.mode === 'pan');
}
function vpAt(px, py) { const sh = doc.sheets[lay.si], [mx, my] = layMM(px, py); for (let i = sh.vps.length - 1; i >= 0; i--) { const v = sh.vps[i]; if (mx >= v.x && mx <= v.x + v.w && my >= v.y && my <= v.y + v.h) return i; } return -1; }
function fitVP(vp) {
  const lays = {}; doc.layers.forEach(l => { lays[l.name] = l; }); const hide = new Set(vp.hide || []);
  const bb = G.bbox(G.flat(doc.ents).filter(e => { const l = lays[e.layer]; return (!l || l.vis) && !hide.has(e.layer); })); if (!bb) return;
  const u = layUnit(); vp.mx = (bb.x0 + bb.x1) / 2; vp.my = (bb.y0 + bb.y1) / 2; vp.ratio = IO.niceRatio(Math.max((bb.x1 - bb.x0) * u / vp.w, (bb.y1 - bb.y0) * u / vp.h, 1e-6) * 1.05);
}
{
  const c = $('lyCv'); let prev = null;
  const rel = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); const [x, y] = rel(e); lay.drag = { x0: x, y0: y, x1: x, y1: y, moved: false }; prev = [x, y]; });
  c.addEventListener('pointermove', e => {
    if (!lay.drag) return; const [x, y] = rel(e); lay.drag.x1 = x; lay.drag.y1 = y; if (Math.hypot(x - lay.drag.x0, y - lay.drag.y0) > 6) lay.drag.moved = true;
    if (lay.mode === 'pan' && lay.sel >= 0 && lay.drag.moved) {
      const vp = doc.sheets[lay.si].vps[lay.sel], s = layUnit() / vp.ratio; if (!lay.drag.undone) { pushUndo(); lay.drag.undone = true; }
      vp.mx -= ((x - prev[0]) / lay.ppm) / s; vp.my -= (-(y - prev[1]) / lay.ppm) / s;
    }
    prev = [x, y]; renderLayout();
  });
  c.addEventListener('pointerup', e => {
    const d = lay.drag; lay.drag = null; if (!d) return; const sh = doc.sheets[lay.si];
    if (lay.mode === 'new' && d.moved) {
      const [ax, ay] = layMM(d.x0, d.y0), [bx, by] = layMM(d.x1, d.y1), [pw, ph] = IO.paperDims(sh);
      const x0 = Math.max(0, Math.min(ax, bx)), x1 = Math.min(pw, Math.max(ax, bx)), y0 = Math.max(0, Math.min(ay, by)), y1 = Math.min(ph, Math.max(ay, by));
      if (x1 - x0 > 5 && y1 - y0 > 5) {
        pushUndo(); const [wx, wy] = s2w(W / 2, H / 2), u = layUnit();
        const vp = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, mx: wx, my: wy, ratio: IO.niceRatio(Math.max(W / view.s * u / (x1 - x0), H / view.s * u / (y1 - y0))), hide: [] };
        sh.vps.push(vp); lay.sel = sh.vps.length - 1; lay.mode = 'sel';
      }
    } else if (!d.moved) lay.sel = vpAt(d.x0, d.y0);
    renderLayout();
  });
  c.addEventListener('pointercancel', () => { lay.drag = null; });
}
$('lyNew').onclick = () => { lay.mode = lay.mode === 'new' ? 'sel' : 'new'; renderLayout(); };
$('lyPan').onclick = () => { lay.mode = lay.mode === 'pan' ? 'sel' : 'pan'; renderLayout(); };
$('lyScale').onclick = () => {
  const vp = doc.sheets[lay.si].vps[lay.sel]; if (!vp) return say('Pehle viewport chuno'); const r = ask('Scale 1:n (jaise 1:50)', '1:' + vp.ratio); if (r === null) return;
  const m = r.match(/^\s*1\s*:\s*([\d.]+)\s*$/); if (!m || !(parseFloat(m[1]) > 0)) return say('Galat scale'); pushUndo(); vp.ratio = parseFloat(m[1]); renderLayout();
};
$('lyFit').onclick = () => { const vp = doc.sheets[lay.si].vps[lay.sel]; if (!vp) return say('Pehle viewport chuno'); pushUndo(); fitVP(vp); renderLayout(); };
$('lyLayers').onclick = () => {
  const vp = doc.sheets[lay.si].vps[lay.sel]; if (!vp) return say('Pehle viewport chuno'); const r = ask('Is viewport me kaun si layers chhupani hain? (comma se, khali = koi nahi)\nLayers: ' + doc.layers.map(l => l.name).join(', '), (vp.hide || []).join(','));
  if (r === null) return; pushUndo(); vp.hide = r.split(',').map(x => x.trim()).filter(x => x && doc.layers.some(l => l.name === x)); renderLayout();
};
$('lyDel').onclick = () => { const sh = doc.sheets[lay.si]; if (lay.sel < 0 || !sh.vps[lay.sel]) return say('Pehle viewport chuno'); pushUndo(); sh.vps.splice(lay.sel, 1); lay.sel = -1; renderLayout(); };
$('lyClose').onclick = () => { $('layoutView').hidden = true; };

ensureDoc(); buildRibbon(); layerUI(); resize();
if (window.__TEST__) window.__cad = { get doc() { return doc; }, get sel() { return sel; }, set(es) { doc.ents = es; sel = []; pts = []; pickEnt = null; draw(); }, get view() { return view; }, get pos() { return pos; }, v3, lay, build3D, renderLayout, render3D } ;
})();
