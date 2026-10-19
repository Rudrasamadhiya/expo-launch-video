// Captures app screens for the video through the expo-mcp-bridge connection:
// a high-resolution screenshot, element positions, and (when the screen
// scrolls) the whole scroll content as one tall image.
import fs from 'node:fs';
import path from 'node:path';
import { findTitle } from './director.mjs';

const CAPTURE_WIDTH = 720; // px; ~2x a phone's dp width, sharp in a 1080p video

function slug(s) {
  return String(s || 'screen').toLowerCase().replace(/^\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home';
}

function writeImage(project, name, base64) {
  const file = name + '.jpg';
  fs.writeFileSync(path.join(project.assetsDir(), file), Buffer.from(base64, 'base64'));
  return file;
}

/** Capture the current screen (or navigate to `route` first) into the project. */
export async function captureScreen(hub, project, { route, name, scroll = true } = {}) {
  if (route) await hub.call('navigate', { path: route, replace: true, snapshot: false, settleMs: 3000 }, 30000);
  const layout = await hub.call('layout', { limit: 300 }, 30000);
  const shot = await hub.call('screenshot', { maxWidth: CAPTURE_WIDTH, quality: 0.85 }, 30000);
  const base = slug(name || route || 'screen-' + Date.now().toString(36));
  const asset = {
    route: route || null,
    name: name || null,
    file: writeImage(project, base, shot.base64),
    w: shot.width,
    h: shot.height,
    dpW: layout.window.w,
    dpH: layout.window.h,
    elements: layout.items.map(({ ref, ...e }) => e),
    scroll: null,
  };
  // the main vertical scroll view: tall, and with more content than fits
  const main = layout.items
    .filter((i) => i.role === 'scroll' && i.contentH && i.h > layout.window.h * 0.4 && i.contentH > i.h * 1.15)
    .sort((a, b) => b.h - a.h)[0];
  if (scroll && main) {
    try {
      const s = await hub.call('capture_scroll', { ref: main.ref, maxWidth: CAPTURE_WIDTH, maxHeight: 9000, quality: 0.85 }, 60000);
      asset.scroll = { file: writeImage(project, base + '-scroll', s.base64), w: s.width, h: s.height, viewport: s.viewport, contentH: s.contentH };
    } catch (err) {
      asset.scrollError = err.message;
    }
  }
  asset.title = name || findTitle(asset);
  return project.addAsset(asset);
}

/**
 * Screen recording: real frames from the phone for `seconds`, optionally while
 * scrolling smoothly or tapping an element mid-way. Also keeps a still +
 * element positions so the director can caption it.
 */
export async function recordScreen(hub, project, { route, name, seconds = 4, scroll, scrollFrom, tap, tapAt, liveLoad = true } = {}) {
  let rec;
  if (route && liveLoad) {
    // start rolling first, open the page on camera, hold while it loads, then scroll
    rec = await hub.call('record', {
      seconds, navigate: route, navigateAt: 0.3, scroll, scrollFrom: scrollFrom ?? 0.5, scrollTo: 0.92, tap, tapAt,
      maxWidth: 540, quality: 0.65,
    }, seconds * 1000 + 90000);
    if (scroll) await hub.call('scroll', { direction: 'top', snapshot: false, settleMs: 300 }, 30000).catch(() => {});
  } else {
    if (route) await hub.call('navigate', { path: route, replace: true, snapshot: false, settleMs: 3000 }, 30000);
  }
  const layout = await hub.call('layout', { limit: 300 }, 30000);
  const still = await hub.call('screenshot', { maxWidth: CAPTURE_WIDTH, quality: 0.85 }, 30000);
  if (!rec) rec = await hub.call('record', { seconds, scroll, scrollFrom, tap, tapAt, maxWidth: 540, quality: 0.65 }, seconds * 1000 + 90000);
  const base = slug((name || route || 'recording') + '-rec');
  const frames = rec.frames.map((f, i) => {
    const n = `${base}-${String(i).padStart(3, '0')}`;
    const fr = { t: f.t, file: writeImage(project, n, f.data) };
    if (f.overlay) { // modal captured on its own, as a transparent PNG
      fs.writeFileSync(path.join(project.assetsDir(), n + '-o.png'), Buffer.from(f.overlay, 'base64'));
      fr.overlay = n + '-o.png';
    }
    return fr;
  });
  const asset = {
    route: route ? route + '#rec' : null,
    name: name || null,
    file: writeImage(project, base + '-still', still.base64),
    w: still.width,
    h: still.height,
    dpW: layout.window.w,
    dpH: layout.window.h,
    elements: layout.items.map(({ ref, ...e }) => e),
    scroll: null,
    recording: { frames, w: rec.width, h: rec.height, seconds: rec.seconds, fps: rec.fps, action: scroll ? 'scroll' : tap ? 'tap' : 'idle' },
  };
  // positions were measured before rolling unless the page opened on camera
  annotateRecording(asset, { tap: route && liveLoad ? null : tap, tapAt });
  asset.title = name || findTitle(asset);
  return project.addAsset(asset);
}

/**
 * Remember what the director needs for pop-out effects: where the tapped
 * element sits (and when it's tapped), and when a modal panel first appears.
 */
export function annotateRecording(asset, { tap, tapAt } = {}) {
  const rec = asset.recording;
  if (!rec) return asset;
  if (tap) {
    const q = String(tap).toLowerCase();
    const el = asset.elements.find((e) => e.role === 'button' && e.label && e.label.toLowerCase() === q)
      || asset.elements.find((e) => e.label && e.label.toLowerCase().includes(q));
    if (el) rec.tap = { label: el.label, rect: { x: el.x, y: el.y, w: el.w, h: el.h }, at: tapAt ?? rec.seconds / 2 };
  }
  const firstModal = rec.frames.find((f) => f.overlay);
  if (firstModal) rec.modalAt = firstModal.t;
  return asset;
}

/** Capture a tap: the screen before, where the finger lands, and the screen after. */
export async function captureTap(hub, project, target, { name, route } = {}) {
  const before = await captureScreen(hub, project, { route, name, scroll: false });
  // locate the target on the screen we just measured
  const layout = await hub.call('layout', { limit: 300 }, 30000);
  const want = (i) => (target.ref && i.ref === target.ref)
    || (target.text && i.label && i.label.toLowerCase() === target.text.toLowerCase())
    || (target.text && i.label && i.label.toLowerCase().includes(target.text.toLowerCase()));
  const el = layout.items.find((i) => i.role === 'button' && want(i)) || layout.items.find(want);
  await hub.call('tap', { ...target, snapshot: false, settleMs: 2500 }, 30000);
  const after = await captureScreen(hub, project, { name: (name || before.title) + ' after tap' });
  before.tap = {
    x: el ? el.x + el.w / 2 : before.dpW / 2,
    y: el ? el.y + el.h / 2 : before.dpH / 2,
    label: el?.label || target.text || target.ref || '',
    at: 0.55,
    after: after.id,
  };
  project.save('tap');
  return { before, after };
}
