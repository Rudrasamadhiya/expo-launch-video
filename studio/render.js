// Renders one frame of the launch video at time t onto a 2D canvas.
// Used for both the live preview and the MP4 export, so they always match.
// Everything is drawn from stills: smooth scrolling comes from the tall
// scroll capture, zooms are camera moves, taps are a finger + ripple.

import { backgroundFX, kineticCaption, callouts, lightSweep, accentWipe, titleCard, popoutProgress, heroPopout, sideShift, sidePopout, clamp01 as c01 } from './motion.js';

export const TRANSITION = 0.45;
export const FORMATS = { landscape: [1920, 1080], portrait: [1080, 1920], square: [1080, 1080] };
const FONT = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

// ---- timing helpers --------------------------------------------------------

export function computeTimeline(data) {
  const items = [];
  let t = 0;
  data.scenes.forEach((s, i) => {
    const shown = s.duration / (s.speed || 1);
    const start = i === 0 ? 0 : Math.max(0, t - TRANSITION);
    items.push({ scene: s, start, end: start + shown, shown, index: i });
    t = start + shown;
  });
  return { items, total: t };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const phase = (u, a, b) => clamp01((u - a) / (b - a));

/** Where zoom and scroll happen inside a screen scene (fractions of the scene). */
export function scenePhases(scene, asset) {
  // explicit zoom timing in recording seconds: [inStart, inEnd, outStart, outEnd]
  if (scene.zoomTimes && scene.focus && asset && asset.recording) {
    const s = asset.recording.seconds;
    const [a1, b1, c1, d1] = scene.zoomTimes.map((x) => x / s);
    return { zoomIn: [a1, b1], zoomOut: [c1, d1], scroll: null };
  }
  const hasScroll = !!(scene.scroll && asset && asset.scroll);
  const hasFocus = !!(scene.focus && (scene.zoom || 1) > 1.01);
  if (hasFocus && hasScroll) return { zoomIn: [0.12, 0.3], zoomOut: [0.45, 0.58], scroll: [0.6, 0.95] };
  if (hasFocus) return { zoomIn: [0.15, 0.38], zoomOut: [0.78, 0.96], scroll: null };
  if (hasScroll) return { zoomIn: null, zoomOut: null, scroll: [0.15, 0.92] };
  return { zoomIn: null, zoomOut: null, scroll: null };
}

function zoomAmount(scene, asset, u) {
  const p = scenePhases(scene, asset);
  if (!p.zoomIn) return 0;
  return easeInOut(phase(u, ...p.zoomIn)) * (1 - easeInOut(phase(u, ...p.zoomOut)));
}

function scrollAmount(scene, asset, u) {
  const p = scenePhases(scene, asset);
  return p.scroll ? easeInOut(phase(u, ...p.scroll)) : 0;
}

// ---- images ----------------------------------------------------------------

/** Load every image the project references. Returns Map(file -> HTMLImageElement). */
export async function loadImages(data, base = '/assets/', cache = new Map()) {
  const files = new Set();
  for (const a of Object.values(data.assets)) {
    if (a.file) files.add(a.file);
    if (a.scroll?.file) files.add(a.scroll.file);
  }
  if (data.settings.icon) files.add(data.settings.icon);
  for (const a of Object.values(data.assets)) for (const f of a.recording?.frames || []) { files.add(f.file); if (f.overlay) files.add(f.overlay); }
  await Promise.all([...files].map(async (f) => {
    if (cache.has(f)) return;
    const img = new Image();
    img.src = base + encodeURIComponent(f) + '?v=' + (data.assets && Object.values(data.assets).find((a) => a.file === f || a.scroll?.file === f)?.capturedAt || '');
    try { await img.decode(); cache.set(f, img); } catch { /* missing file: drawn as a placeholder */ }
  }));
  return cache;
}

// ---- layout ----------------------------------------------------------------

function layout(data, W, H) {
  const fmt = data.settings.format || 'landscape';
  const anyAsset = Object.values(data.assets)[0];
  const aspect = anyAsset ? anyAsset.dpW / anyAsset.dpH : 9 / 19.5;
  const unit = Math.min(W, H) / 1080;
  let phoneH, cx, cy, caption;
  if (fmt === 'portrait') {
    phoneH = H * 0.6; cx = W / 2; cy = H * 0.63;
    caption = { x: W / 2, y: H * 0.1, w: W * 0.84, align: 'center', title: 76 * unit, sub: 36 * unit };
  } else if (fmt === 'square') {
    phoneH = H * 0.66; cx = W / 2; cy = H * 0.62;
    caption = { x: W / 2, y: H * 0.06, w: W * 0.86, align: 'center', title: 54 * unit, sub: 28 * unit };
  } else {
    // captionSide: text on the left (phone right) or on the right (phone left)
    const right = data.settings.captionSide === 'right';
    phoneH = H * 0.86; cx = W * (right ? 0.32 : 0.68); cy = H / 2;
    caption = { x: W * (right ? 0.54 : 0.08), y: H * 0.36, w: W * 0.38, align: 'left', title: 70 * unit, sub: 32 * unit };
  }
  const bezel = phoneH * 0.018;
  const screenH = phoneH - bezel * 2;
  const screenW = screenH * aspect;
  const phoneW = screenW + bezel * 2;
  const phone = { x: cx - phoneW / 2, y: cy - phoneH / 2, w: phoneW, h: phoneH, r: phoneW * 0.13 };
  const screen = { x: phone.x + bezel, y: phone.y + bezel, w: screenW, h: screenH, r: phone.r - bezel };
  return { fmt, unit, phone, screen, caption, center: { x: cx, y: cy }, captionSide: fmt === 'landscape' && data.settings.captionSide === 'right' ? 'right' : 'left' };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// ---- drawing ---------------------------------------------------------------

function drawBackground(ctx, data, W, H, t) {
  const th = data.settings.theme || {};
  const [c1, c2] = th.bg || ['#4f46e5', '#111827'];
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // slow drifting light blobs give the background life
  const blobs = [[0.2, 0.25, 0.55, 0.0], [0.85, 0.8, 0.6, 2.1], [0.7, 0.15, 0.4, 4.2]];
  for (const [bx, by, br, ph] of blobs) {
    const x = (bx + 0.04 * Math.sin(t * 0.35 + ph)) * W;
    const y = (by + 0.05 * Math.cos(t * 0.28 + ph)) * H;
    const r = br * Math.max(W, H);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, hexA(th.accent || c1, 0.32));
    rg.addColorStop(1, hexA(th.accent || c1, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
}

function hexA(hex, a) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Draws a screen scene's content (screenshot, scroll, tap) into rect at scene progress u. */
function drawContent(ctx, data, images, scene, u, rect) {
  const asset = data.assets[scene.asset];
  if (!asset) { ctx.fillStyle = '#222'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); return; }
  const k = rect.w / asset.dpW;
  // real screen recording: show the recorded frame for this moment of the clip
  const rec = scene.recording && asset.recording;
  if (rec && rec.frames.length) {
    const at = u * rec.seconds;
    let f = rec.frames[0];
    for (const fr of rec.frames) { if (fr.t <= at) f = fr; else break; }
    const img = images.get(f.file);
    if (img) {
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
      const ov = f.overlay && images.get(f.overlay);
      if (ov) ctx.drawImage(ov, rect.x, rect.y, rect.w, rect.h);
      return;
    }
  }
  const base = images.get(asset.file);
  if (base) ctx.drawImage(base, rect.x, rect.y, rect.w, rect.h);
  else { ctx.fillStyle = '#1f2937'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }

  // smooth scroll: replace the scroll viewport with a window into the tall capture
  const sc = asset.scroll;
  const tall = sc && images.get(sc.file);
  if (scene.scroll && tall) {
    const p = scrollAmount(scene, asset, u);
    if (p > 0) {
      const vp = sc.viewport;
      const pxPerDp = sc.w / vp.w;
      const offsetDp = p * scene.scroll.to * Math.max(0, sc.contentH - vp.h);
      const sy = offsetDp * pxPerDp;
      const sh = Math.min(vp.h * pxPerDp, sc.h - sy);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x + vp.x * k, rect.y + vp.y * k, vp.w * k, vp.h * k);
      ctx.clip();
      ctx.drawImage(tall, 0, sy, sc.w, sh, rect.x + vp.x * k, rect.y + vp.y * k, vp.w * k, sh / pxPerDp * k);
      ctx.restore();
    }
  }

  // tap: finger glides in, ripple, then the next screen fades in
  const tap = scene.tap;
  if (tap) {
    const at = tap.at ?? 0.55;
    const after = tap.after && data.assets[tap.after];
    const afterImg = after && images.get(after.file);
    const fade = easeInOut(phase(u, at + 0.06, at + 0.2));
    if (afterImg && fade > 0) {
      ctx.globalAlpha = fade;
      ctx.drawImage(afterImg, rect.x, rect.y, rect.w, rect.h);
      ctx.globalAlpha = 1;
    }
    const x = rect.x + tap.x * k;
    const y = rect.y + tap.y * k;
    const appear = phase(u, at - 0.2, at - 0.05);
    const gone = phase(u, at + 0.1, at + 0.2);
    if (appear > 0 && gone < 1) {
      const fx = lerp(x + rect.w * 0.25, x, easeOut(appear));
      const fy = lerp(y + rect.h * 0.18, y, easeOut(appear));
      const press = u >= at ? 0.85 : 1;
      ctx.save();
      ctx.globalAlpha = (1 - gone) * 0.9;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 18 * k;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(fx, fy, 15 * k * press, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const ring = phase(u, at, at + 0.12);
    if (ring > 0 && ring < 1) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - ring)})`;
      ctx.lineWidth = 4 * k;
      ctx.beginPath();
      ctx.arc(x, y, (15 + 40 * easeOut(ring)) * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/** Phone body with clipped screen; contentFn(rect) draws inside the screen. */
function drawPhone(ctx, L, contentFn) {
  const { phone, screen } = L;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = phone.w * 0.12;
  ctx.shadowOffsetY = phone.w * 0.04;
  ctx.fillStyle = '#0a0a0f';
  roundRect(ctx, phone.x, phone.y, phone.w, phone.h, phone.r);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = Math.max(1, phone.w * 0.004);
  roundRect(ctx, phone.x, phone.y, phone.w, phone.h, phone.r);
  ctx.stroke();
  roundRect(ctx, screen.x, screen.y, screen.w, screen.h, screen.r);
  ctx.clip();
  contentFn(screen);
  ctx.restore();
}


/** Camera transform for zooming into the scene's focus rect. */
function applyCamera(ctx, data, scene, u, L) {
  const asset = data.assets[scene.asset];
  if (!asset || !scene.focus) return;
  const m = zoomAmount(scene, asset, u);
  if (m <= 0) return;
  const z = 1 + ((scene.zoom || 1.6) - 1) * m;
  const k = L.screen.w / asset.dpW;
  const f = scene.focus;
  const F = { x: L.screen.x + (f.x + f.w / 2) * k, y: L.screen.y + (f.y + f.h / 2) * k };
  const A = { x: lerp(F.x, L.center.x, m), y: lerp(F.y, L.center.y, m) };
  ctx.translate(A.x, A.y);
  ctx.scale(z, z);
  ctx.translate(-F.x, -F.y);
}

/** Screen-content transition inside the phone between two screen scenes. */
function drawScreenTransition(ctx, data, images, prev, cur, q, rect) {
  const kind = cur.scene.transition || 'slide';
  const pu = 1;
  const cu = (q * TRANSITION) / cur.shown;
  if (kind === 'none') { drawContent(ctx, data, images, q < 0.5 ? prev.scene : cur.scene, q < 0.5 ? pu : cu, rect); return; }
  if (kind === 'fade') {
    drawContent(ctx, data, images, prev.scene, pu, rect);
    ctx.globalAlpha = q;
    drawContent(ctx, data, images, cur.scene, cu, rect);
    ctx.globalAlpha = 1;
    return;
  }
  if (kind === 'zoom') {
    drawContent(ctx, data, images, prev.scene, pu, rect);
    const s = lerp(1.12, 1, q);
    ctx.save();
    ctx.globalAlpha = q;
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.scale(s, s);
    ctx.translate(-(rect.x + rect.w / 2), -(rect.y + rect.h / 2));
    drawContent(ctx, data, images, cur.scene, cu, rect);
    ctx.restore();
    return;
  }
  // slide (default) and rise: like a native navigation push
  const vertical = kind === 'rise';
  ctx.save();
  ctx.translate(vertical ? 0 : -q * rect.w * 0.3, vertical ? -q * rect.h * 0.1 : 0);
  drawContent(ctx, data, images, prev.scene, pu, rect);
  ctx.restore();
  ctx.fillStyle = `rgba(0,0,0,${0.35 * q})`;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.save();
  ctx.translate(vertical ? 0 : (1 - q) * rect.w, vertical ? (1 - q) * rect.h : 0);
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 30;
  drawContent(ctx, data, images, cur.scene, cu, rect);
  ctx.restore();
}

/** Draw the frame at time t (seconds). */
export function drawFrame(ctx, data, images, t, W, H, tl = computeTimeline(data)) {
  ctx.save();
  drawBackground(ctx, data, W, H, t);
  backgroundFX(ctx, data, W, H, t);
  const items = tl.items;
  if (!items.length) { ctx.restore(); return; }
  let ci = items.findIndex((it, i) => t >= it.start && (i === items.length - 1 || t < items[i + 1].start));
  if (ci < 0) ci = t < items[0].start ? 0 : items.length - 1;
  const cur = items[ci];
  const prev = ci > 0 && t < items[ci - 1].end ? items[ci - 1] : null;
  const L = layout(data, W, H);
  L.canvasW = W;
  const u = clamp01((t - cur.start) / cur.shown);
  const tIn = t - cur.start;
  const q = prev ? easeInOut(clamp01((t - cur.start) / TRANSITION)) : 1;
  const isScreen = (it) => it && it.scene.kind === 'screen';
  const screenNo = (it) => items.slice(0, it.index + 1).filter(isScreen).length;
  const fadeOut = (it) => 1 - phase(clamp01((t - it.start) / it.shown), 0.94, 1);

  // break-out pop-outs of the current recording (times are recording seconds)
  const curAsset = isScreen(cur) ? data.assets[cur.scene.asset] : null;
  const rec = curAsset && curAsset.recording && cur.scene.recording ? curAsset.recording : null;
  const rt = rec ? u * rec.seconds : 0;
  const pops = rec ? (cur.scene.popouts || []).map((po) => ({ po, st: popoutProgress(po, rt) })) : [];
  const side = pops.find((x) => x.po.style === 'side' && x.st.p > 0);
  const hero = pops.find((x) => x.po.style === 'hero' && x.st.p > 0);
  const sideK = side ? c01(side.st.p) : 0;
  const heroK = hero ? c01(hero.st.p) : 0;
  const shiftX = side ? sideShift(L, side.st, W) : 0;

  // phone, floating gently, with a light sweep across the glass at each new scene
  if (isScreen(cur) || (isScreen(prev) && cur.scene.kind === 'outro')) {
    let dy = Math.sin(t * 1.2) * 7 * L.unit;
    let alpha = 1;
    let tilt = 0;
    if (isScreen(cur) && prev && !isScreen(prev)) { dy += (1 - q) * H * 0.7; alpha = q; tilt = (1 - q) * 0.12; } // rises after the intro
    if (!isScreen(cur) && isScreen(prev)) { dy += q * H * 0.7; alpha = 1 - q; tilt = -q * 0.12; }             // sinks into the outro
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(L.center.x + shiftX, L.center.y + dy);
    ctx.rotate(tilt);
    ctx.translate(-L.center.x, -L.center.y);
    const camScene = isScreen(cur) ? cur : prev;
    applyCamera(ctx, data, camScene.scene, isScreen(cur) ? u : 1, L);
    drawPhone(ctx, L, (rect) => {
      if (isScreen(cur) && isScreen(prev)) drawScreenTransition(ctx, data, images, prev, cur, q, rect);
      else drawContent(ctx, data, images, (isScreen(cur) ? cur : prev).scene, isScreen(cur) ? u : 1, rect);
      if (isScreen(cur)) lightSweep(ctx, rect, (tIn - 0.15) / 1.1);
    });
    ctx.restore();
  }

  // side-by-side: the panel springs out of the phone into its own card
  if (side) sidePopout(ctx, data, images, L, curAsset, side.po, side.st, rt, W, H, shiftX);

  // accent wipe on "zoom" transitions
  if (prev && cur.scene.transition === 'zoom') accentWipe(ctx, data, W, H, clamp01((t - cur.start) / (TRANSITION * 1.4)));

  // pop-up callouts beside the phone
  if (prev && isScreen(prev)) callouts(ctx, data, L, prev.scene.callouts, { tIn: t - prev.start, alpha: 1 - q, t });
  if (isScreen(cur)) callouts(ctx, data, L, cur.scene.callouts, { tIn, alpha: fadeOut(cur) * (1 - sideK) * (1 - heroK), t });

  // captions (kinetic) and title cards (intro/outro)
  if (prev) {
    if (isScreen(prev)) kineticCaption(ctx, data, L, prev.scene.caption, { tIn: t - prev.start, alpha: 1 - q, index: screenNo(prev), exit: q });
    else titleCard(ctx, data, images, prev.scene, { tIn: t - prev.start, W, H, L, alpha: 1 - q });
  }
  if (isScreen(cur)) {
    const zoomDim = cur.scene.focus && L.fmt === 'landscape' ? 1 - 0.25 * zoomAmount(cur.scene, data.assets[cur.scene.asset], u) : 1;
    kineticCaption(ctx, data, L, cur.scene.caption, { tIn: prev ? tIn - TRANSITION * 0.3 : tIn, alpha: fadeOut(cur) * zoomDim * (1 - sideK), index: screenNo(cur) });
  } else {
    titleCard(ctx, data, images, cur.scene, { tIn, W, H, L, alpha: prev ? q : 1 });
  }

  // hero: the tapped element lifts off the phone to center stage, over everything
  if (hero) heroPopout(ctx, data, images, L, curAsset, hero.po, hero.st, W, H);
  ctx.restore();
}
