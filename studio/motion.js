// Motion graphics for the launch video: animated background, kinetic
// typography, pop-up callouts, light sweeps, wipes, and title-card effects.
// Everything is a pure function of time, so preview and export match.

export const FONT = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const easeOutBack = (x) => { x = clamp01(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
export const springPop = (x) => { x = clamp01(x); return 1 - Math.exp(-6 * x) * Math.cos(10 * x); }; // overshoot + settle

export function hexA(hex, a) {
  const h = String(hex || '#6366f1').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, Math.max(0, r)) : ctx.rect(x, y, w, h);
}

// deterministic pseudo-random numbers (same every frame/export)
function rand(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---- background -------------------------------------------------------------

/** Rings, dot grid and drifting orbs over the gradient. */
export function backgroundFX(ctx, data, W, H, t) {
  const th = data.settings.theme || {};
  const accent = th.accent || '#6366f1';
  const u = Math.min(W, H) / 1080;
  // parallax dot grid
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  const gap = 46 * u;
  const ox = (t * 6 * u) % gap;
  const oy = (t * 3 * u) % gap;
  for (let x = -gap + ox; x < W + gap; x += gap) {
    for (let y = -gap + oy; y < H + gap; y += gap) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  // slowly rotating concentric rings
  ctx.save();
  ctx.translate(W * 0.82, H * 0.18);
  ctx.rotate(t * 0.08);
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.07 - i * 0.012})`;
    ctx.lineWidth = 2 * u;
    ctx.setLineDash([18 * u, 14 * u + i * 6 * u]);
    ctx.beginPath();
    ctx.arc(0, 0, (180 + i * 90) * u, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  // a soft glowing orb that wanders
  const x = W * (0.3 + 0.08 * Math.sin(t * 0.21));
  const y = H * (0.75 + 0.06 * Math.cos(t * 0.17));
  const r = 420 * u;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(accent, 0.28));
  g.addColorStop(1, hexA(accent, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // vignette for depth
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

// ---- kinetic typography ------------------------------------------------------

function wrapWords(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = [];
  for (const w of words) {
    const test = [...line, w].join(' ');
    if (ctx.measureText(test).width > maxW && line.length) {
      lines.push(line);
      line = [w];
      if (lines.length === maxLines) break;
    } else line.push(w);
  }
  if (line.length && lines.length < maxLines) lines.push(line);
  return lines;
}

/**
 * Caption with word-by-word reveal (rise + blur-to-sharp), an accent number
 * chip and an underline sweep. tIn = seconds since the caption started.
 */
export function kineticCaption(ctx, data, L, caption, { tIn, alpha = 1, index = null, exit = 0 }) {
  if (!caption || alpha <= 0 || (!caption.title && !caption.subtitle)) return;
  const c = L.caption;
  const th = data.settings.theme || {};
  const u = L.unit;
  const center = c.align === 'center';
  ctx.save();
  ctx.textBaseline = 'top';
  let y = c.y - exit * 40 * u;
  // number chip ("03")
  if (index != null) {
    const k = easeOutBack((tIn - 0.0) / 0.4);
    const label = String(index).padStart(2, '0');
    ctx.font = `800 ${24 * u}px ${FONT}`;
    const w = ctx.measureText(label).width + 30 * u;
    const h = 40 * u;
    const x = center ? c.x - w / 2 : c.x;
    ctx.globalAlpha = alpha * clamp01(k);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(Math.max(0.01, k), Math.max(0.01, k));
    roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, -h / 2 + 8 * u);
    ctx.restore();
    y += h + 22 * u;
  }
  // title, word by word
  ctx.font = `800 ${c.title}px ${FONT}`;
  const lines = wrapWords(ctx, caption.title, c.w, 2);
  let wordIndex = 0;
  let titleRight = 0;
  for (const words of lines) {
    const lineText = words.join(' ');
    const lineW = ctx.measureText(lineText).width;
    let x = center ? c.x - lineW / 2 : c.x;
    for (const word of words) {
      const delay = 0.12 + wordIndex * 0.07;
      const k = clamp01((tIn - delay) / 0.5);
      const e = easeOut(k);
      ctx.globalAlpha = alpha * e;
      ctx.filter = k < 1 ? `blur(${(1 - e) * 10 * u}px)` : 'none';
      ctx.fillStyle = th.text || '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(word, x, y + (1 - e) * 46 * u);
      x += ctx.measureText(word + ' ').width;
      wordIndex++;
    }
    ctx.filter = 'none';
    titleRight = Math.max(titleRight, lineW);
    y += c.title * 1.12;
  }
  // underline sweep in the accent color
  const sweep = easeInOut((tIn - 0.35) / 0.6);
  if (sweep > 0) {
    const w = Math.min(titleRight, 220 * u) * sweep;
    const x = center ? c.x - w / 2 : c.x;
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, hexA(th.accent || '#a78bfa', 1));
    ctx.fillStyle = g;
    roundRect(ctx, x, y + 6 * u, w, 7 * u, 4 * u);
    ctx.fill();
    y += 30 * u;
  }
  // subtitle fades up after the title
  if (caption.subtitle) {
    ctx.font = `500 ${c.sub}px ${FONT}`;
    const k = easeOut((tIn - 0.45 - wordIndex * 0.04) / 0.6);
    ctx.globalAlpha = alpha * k;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.textAlign = c.align;
    for (const words of wrapWords(ctx, caption.subtitle, c.w, 3)) {
      ctx.fillText(words.join(' '), c.x, y + (1 - k) * 24 * u);
      y += c.sub * 1.38;
    }
  }
  ctx.restore();
}

// ---- pop-up callouts ---------------------------------------------------------

/** Glass chips that spring out beside the phone, then float. */
export function callouts(ctx, data, L, list, { tIn, alpha = 1, t }) {
  if (!list || !list.length || alpha <= 0) return;
  const u = L.unit;
  const th = data.settings.theme || {};
  const { phone } = L;
  const W = L.canvasW;
  ctx.save();
  list.slice(0, 3).forEach((co, i) => {
    const at = co.at != null ? co.at : 0.7 + i * 0.45;
    const k = clamp01((tIn - at) / 0.7);
    if (k <= 0) return;
    const s = springPop(k);
    ctx.font = `800 ${34 * u}px ${FONT}`;
    const main = String(co.value || co.text || '');
    const sub = co.value ? String(co.label || '') : '';
    const mainW = ctx.measureText(main).width;
    ctx.font = `600 ${22 * u}px ${FONT}`;
    const subW = sub ? ctx.measureText(sub).width : 0;
    const w = Math.max(mainW, subW) + 76 * u;
    const h = (sub ? 92 : 66) * u;
    // landscape: stacked on the free right side, popping out over the phone's edge
    // (the caption owns the left). portrait/square: alternate sides of the phone.
    let x;
    if (L.fmt === 'landscape') x = L.captionSide === 'right' ? phone.x - w + 60 * u - (i % 2) * 40 * u : phone.x + phone.w - 60 * u + (i % 2) * 40 * u;
    else x = i % 2 === 0 ? phone.x + phone.w - w * 0.35 : phone.x - w * 0.65;
    x = Math.max(24 * u, Math.min(W - w - 24 * u, x));
    const y = phone.y + phone.h * (0.2 + i * 0.26) + Math.sin(t * 1.6 + i) * 6 * u;
    ctx.save();
    ctx.globalAlpha = alpha * clamp01(k * 2);
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(s, s);
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 30 * u;
    ctx.shadowOffsetY = 10 * u;
    roundRect(ctx, -w / 2, -h / 2, w, h, 22 * u);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // accent dot
    ctx.fillStyle = th.accent || '#6366f1';
    ctx.beginPath();
    ctx.arc(-w / 2 + 30 * u, 0, 9 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha *= 0.25;
    ctx.beginPath();
    ctx.arc(-w / 2 + 30 * u, 0, (9 + 10 * (1 - k)) * u + 6 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * clamp01(k * 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111827';
    ctx.font = `800 ${34 * u}px ${FONT}`;
    ctx.fillText(main, -w / 2 + 52 * u, sub ? -14 * u : 0);
    if (sub) {
      ctx.fillStyle = '#6b7280';
      ctx.font = `600 ${22 * u}px ${FONT}`;
      ctx.fillText(sub, -w / 2 + 52 * u, 22 * u);
    }
    ctx.restore();
  });
  ctx.restore();
}

// ---- glass light sweep & wipes ----------------------------------------------

/** Diagonal light band across the phone glass. p: 0..1 */
export function lightSweep(ctx, rect, p) {
  if (p <= 0 || p >= 1) return;
  const x = lerp(rect.x - rect.w, rect.x + rect.w * 1.6, easeInOut(p));
  const g = ctx.createLinearGradient(x, rect.y, x + rect.w * 0.5, rect.y + rect.h * 0.25);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/** Accent-colored diagonal wipe across the whole frame. q: 0..1 */
export function accentWipe(ctx, data, W, H, q) {
  if (q <= 0 || q >= 1) return;
  const th = data.settings.theme || {};
  const span = W + H;
  const x = lerp(-H, W + H * 0.2, easeInOut(q));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x + span * 0.18, 0);
  ctx.lineTo(x + span * 0.18 - H * 0.6, H);
  ctx.lineTo(x - H * 0.6, H);
  ctx.closePath();
  ctx.globalAlpha = 0.85 * Math.sin(q * Math.PI);
  ctx.fillStyle = hexA(th.accent || '#6366f1', 1);
  ctx.fill();
  ctx.restore();
}

// ---- title cards ------------------------------------------------------------

function burst(ctx, cx, cy, u, p, color) {
  if (p <= 0 || p >= 1) return;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const k = clamp01(p * 1.4 - i * 0.18);
    if (k <= 0 || k >= 1) continue;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - k)})`;
    ctx.lineWidth = (6 - i * 1.5) * u;
    ctx.beginPath();
    ctx.arc(cx, cy, (110 + 260 * easeOut(k)) * u, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const a = rand(i) * Math.PI * 2;
    const d = (140 + rand(i + 50) * 360) * u * easeOut(p);
    const r = (3 + rand(i + 99) * 6) * u * (1 - p);
    ctx.fillStyle = i % 3 === 0 ? color : 'rgba(255,255,255,0.9)';
    ctx.globalAlpha = 1 - p;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Intro (logo pop, staggered letters) and outro (pulsing CTA) cards. tIn in seconds. */
export function titleCard(ctx, data, images, scene, { tIn, W, H, L, alpha }) {
  const th = data.settings.theme || {};
  const icon = data.settings.icon && images.get(data.settings.icon);
  const u = L.unit;
  const cx = W / 2;
  const iconSize = 180 * u;
  const iconY = H * 0.5 - (scene.kind === 'outro' ? 250 : 210) * u;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  burst(ctx, cx, iconY + iconSize / 2, u, (tIn - 0.15) / 1.1, th.accent || '#a78bfa');
  if (icon) {
    const k = springPop((tIn - 0.05) / 0.7);
    const size = iconSize * Math.max(0.01, k);
    ctx.save();
    ctx.translate(cx, iconY + iconSize / 2);
    ctx.rotate((1 - clamp01(k)) * -0.4);
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 50 * u;
    roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.24);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.clip();
    ctx.drawImage(icon, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  let y = iconY + iconSize + 44 * u;
  if (scene.kind === 'intro') {
    // app name: letters drop in one by one
    const name = scene.caption?.title || '';
    ctx.font = `900 ${128 * u}px ${FONT}`;
    const total = ctx.measureText(name).width;
    let x = cx - total / 2;
    ctx.textAlign = 'left';
    [...name].forEach((ch, i) => {
      const k = clamp01((tIn - 0.45 - i * 0.05) / 0.45);
      const e = easeOutBack(k);
      ctx.globalAlpha = alpha * clamp01(k * 1.5);
      ctx.fillStyle = th.text || '#fff';
      ctx.fillText(ch, x, y + (1 - e) * 70 * u);
      x += ctx.measureText(ch).width;
    });
    y += 160 * u;
    // tagline: words fade up
    const words = String(scene.caption?.subtitle || '').split(/\s+/).filter(Boolean);
    ctx.font = `500 ${46 * u}px ${FONT}`;
    const tw = ctx.measureText(words.join(' ')).width;
    x = cx - tw / 2;
    words.forEach((w, i) => {
      const k = easeOut((tIn - 0.95 - i * 0.08) / 0.5);
      ctx.globalAlpha = alpha * k;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(w, x, y + (1 - k) * 26 * u);
      x += ctx.measureText(w + ' ').width;
    });
  } else {
    // outro: call-to-action pill that pops, pulses and shimmers
    const label = scene.caption?.title || 'Download now';
    ctx.font = `800 ${58 * u}px ${FONT}`;
    const w = ctx.measureText(label).width + 120 * u;
    const h = 124 * u;
    const k = springPop((tIn - 0.35) / 0.8);
    const pulse = 1 + 0.025 * Math.sin(tIn * 5) * clamp01(tIn - 1.2);
    ctx.save();
    ctx.translate(cx, y + h / 2);
    ctx.scale(Math.max(0.01, k) * pulse, Math.max(0.01, k) * pulse);
    ctx.shadowColor = hexA('#ffffff', 0.55);
    ctx.shadowBlur = (30 + 20 * Math.sin(tIn * 5)) * u;
    roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save();
    ctx.clip();
    const sx = lerp(-w, w, ((tIn - 1.0) % 2.2) / 1.0);
    const g = ctx.createLinearGradient(sx, 0, sx + w * 0.4, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, hexA(th.accent || '#6366f1', 0.25));
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
    ctx.fillStyle = th.accent || '#4f46e5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 2 * u);
    ctx.restore();
    y += h + 46 * u;
    const kk = easeOut((tIn - 0.9) / 0.6);
    ctx.globalAlpha = alpha * kk;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `700 ${44 * u}px ${FONT}`;
    ctx.fillText(scene.caption?.subtitle || '', cx, y + (1 - kk) * 20 * u);
  }
  ctx.restore();
}

// ---- break-out pop-outs ------------------------------------------------------

const boundsCache = new WeakMap();
/** Bounding box (image px) of the opaque part of a transparent PNG (the modal sheet, not its dim backdrop). */
export function opaqueBounds(img) {
  if (boundsCache.has(img)) return boundsCache.get(img);
  const s = 0.25;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * s));
  c.height = Math.max(1, Math.round(img.height * s));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
  for (let y = 0; y < c.height; y++) {
    for (let xx = 0; xx < c.width; xx++) {
      if (d[(y * c.width + xx) * 4 + 3] > 235) {
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const b = maxX < 0 ? { x: 0, y: 0, w: img.width, h: img.height }
    : { x: minX / s, y: minY / s, w: (maxX - minX + 1) / s, h: (maxY - minY + 1) / s };
  boundsCache.set(img, b);
  return b;
}

/** In/out progress of a pop-out at recording time rt (0 = hidden, 1 = fully out). */
export function popoutProgress(po, rt) {
  const inP = (rt - po.at) / 0.45;
  const outP = (rt - (po.at + (po.hold ?? 1.2))) / 0.4;
  if (inP <= 0 || outP >= 1) return { p: 0, inP: 0, outP: 0 };
  return { p: Math.min(springPop(inP), 1.04) * (1 - easeInOut(outP)), inP: clamp01(inP), outP: clamp01(outP) };
}

function frameAt(rec, sec) {
  let f = rec.frames[0];
  for (const fr of rec.frames) { if (fr.t <= sec) f = fr; else break; }
  return f;
}

function lerpRect(a, b, k) {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) };
}

function card(ctx, img, src, r, u, radius) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 60 * u;
  ctx.shadowOffsetY = 24 * u;
  roundRect(ctx, r.x, r.y, r.w, r.h, radius);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  ctx.drawImage(img, src.x, src.y, src.w, src.h, r.x, r.y, r.w, r.h);
  ctx.restore();
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, radius);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2 * u;
  ctx.stroke();
  ctx.restore();
}

/**
 * Hero pop-out: the tapped element lifts off the phone to center stage.
 * state.p from popoutProgress; screenRect = phone screen on canvas.
 */
export function heroPopout(ctx, data, images, L, asset, po, state, W, H) {
  if (state.p <= 0) return;
  const rec = asset.recording;
  const f = frameAt(rec, po.at - 0.35); // before the press, so no pressed/faded state
  const img = images.get(f.file);
  if (!img) return;
  const u = L.unit;
  const th = data.settings.theme || {};
  const pxPerDp = img.width / asset.dpW;
  const pad = Math.max(14, Math.min(po.rect.w, po.rect.h) * 0.18); // a little surrounding UI for context
  const src = { x: (po.rect.x - pad) * pxPerDp, y: (po.rect.y - pad) * pxPerDp, w: (po.rect.w + pad * 2) * pxPerDp, h: (po.rect.h + pad * 2) * pxPerDp };
  const k = L.screen.w / asset.dpW;
  const from = { x: L.screen.x + (po.rect.x - pad) * k, y: L.screen.y + (po.rect.y - pad) * k, w: (po.rect.w + pad * 2) * k, h: (po.rect.h + pad * 2) * k };
  // as big as the stage allows, but never past ~2.6x the recorded pixels (stays sharp)
  const scale = Math.min((W * 0.5) / from.w, (H * 0.4) / from.h, (src.w * 2.6) / from.w);
  const to = { w: from.w * scale, h: from.h * scale };
  to.x = W / 2 - to.w / 2;
  to.y = H * 0.44 - to.h / 2;
  const pIn = clamp01(state.p);
  // exit: zoom through the card
  const exitGrow = 1 + 0.18 * easeInOut(state.outP);
  const r = lerpRect(from, to, Math.min(1, state.p));
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const rr = { x: cx - (r.w * exitGrow) / 2, y: cy - (r.h * exitGrow) / 2, w: r.w * exitGrow, h: r.h * exitGrow };
  // dim the stage behind, with an accent glow
  ctx.save();
  ctx.fillStyle = `rgba(6,6,20,${0.62 * pIn})`;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.44, 0, W / 2, H * 0.44, Math.max(rr.w, rr.h) * 1.1);
  g.addColorStop(0, hexA(th.accent || '#6366f1', 0.55 * pIn));
  g.addColorStop(1, hexA(th.accent || '#6366f1', 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1 - easeInOut(state.outP);
  card(ctx, img, src, rr, u, 26 * u * Math.max(1, scale * 0.4));
  // label under the card
  if (po.label) {
    const lk = easeOut((state.inP - 0.35) / 0.65);
    ctx.globalAlpha = lk * (1 - easeInOut(state.outP));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${58 * u}px ${FONT}`;
    ctx.fillText(po.label, W / 2, rr.y + rr.h + 44 * u + (1 - lk) * 30 * u);
  }
  ctx.restore();
}

/**
 * Side-by-side pop-out: returns how far the phone should shift left and draws
 * the live modal panel springing out of the screen into a big card.
 */
export function sideShift(L, state, W) {
  const k = clamp01(state.p);
  // phone moves to the left third; the panel takes the right side
  return (W * (L.fmt === 'landscape' ? 0.3 : 0.27) - L.center.x) * k;
}

export function sidePopout(ctx, data, images, L, asset, po, state, rt, W, H, shiftX) {
  if (state.p <= 0) return;
  const rec = asset.recording;
  // live: the panel keeps animating; fall back to the last frame that had it
  let f = frameAt(rec, rt);
  if (!f.overlay) f = [...rec.frames].reverse().find((x) => x.overlay && x.t <= rt + 0.01) || rec.frames.find((x) => x.overlay);
  const img = f && images.get(f.overlay);
  if (!img) return;
  const b = opaqueBounds(img);
  const u = L.unit;
  const k = L.screen.w / img.width; // overlay px -> canvas px at phone scale
  const from = { x: L.screen.x + shiftX + b.x * k, y: L.screen.y + b.y * k, w: b.w * k, h: b.h * k };
  const maxH = H * (L.fmt === 'landscape' ? 0.84 : 0.6);
  const maxW = W * (L.fmt === 'landscape' ? 0.4 : 0.5);
  const scale = Math.min(maxH / from.h, maxW / from.w);
  const to = { w: from.w * scale, h: from.h * scale };
  to.x = (L.fmt === 'landscape' ? W * 0.735 : W * 0.72) - to.w / 2;
  to.y = H / 2 - to.h / 2 + (L.fmt === 'landscape' ? 0 : H * 0.08);
  const r = lerpRect(from, to, Math.min(1, state.p));
  ctx.save();
  ctx.globalAlpha = clamp01(state.p * 1.5);
  card(ctx, img, b, r, u, 30 * u);
  ctx.restore();
}
