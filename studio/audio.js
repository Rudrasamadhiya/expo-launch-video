// Sound design for the launch video: synthesized effects (no sample files),
// timed from the same timeline as the visuals. Used for the live preview
// (real-time AudioContext) and for the export (OfflineAudioContext -> AAC).

import { TRANSITION } from './render.js';

/** Every sound cue in the video: [{ t, type }] (seconds). */
export function audioEvents(data, tl) {
  const ev = [];
  const add = (t, type, gain = 1) => { if (t >= 0 && t <= tl.total) ev.push({ t, type, gain }); };
  tl.items.forEach((it, i) => {
    const s = it.scene;
    if (s.kind === 'intro') {
      add(it.start + 0.12, 'pop', 1.1);
      add(it.start + 0.45, 'chime');
    } else if (s.kind === 'outro') {
      add(it.start, 'whoosh', 0.8);
      add(it.start + 0.4, 'pop', 1.1);
      add(it.start + 0.6, 'chime');
      return;
    }
    if (s.kind !== 'screen') return;
    // transition into this scene
    if (i > 0) add(it.start, s.transition === 'zoom' ? 'swoosh' : 'whoosh', s.transition === 'zoom' ? 1 : 0.7);
    // pop-up chips
    (s.callouts || []).slice(0, 3).forEach((co, k) => add(it.start + (co.at != null ? co.at : 0.7 + k * 0.45) + 0.04, 'pop', 0.8));
    const a = data.assets[s.asset];
    const rec = s.recording && a && a.recording;
    const toTime = (sec) => it.start + (sec / rec.seconds) * it.shown;
    if (rec) {
      if (rec.tap && rec.tap.at != null) add(toTime(rec.tap.at), 'click');
      for (const po of s.popouts || []) {
        if (po.style === 'hero') { add(toTime(po.at) - 0.05, 'swoosh', 0.8); add(toTime(po.at) + 0.3, 'pop', 1.1); }
        if (po.style === 'side') add(toTime(po.at), 'whoosh', 1);
      }
    }
    if (s.tap && s.tap.at != null) add(it.start + s.tap.at * it.shown, 'click');
  });
  return ev.sort((x, y) => x.t - y.t);
}

let noiseCache = new WeakMap();
function noise(ctx) {
  if (noiseCache.has(ctx)) return noiseCache.get(ctx);
  const len = ctx.sampleRate * 1.2;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x3fffffff) - 1; }
  noiseCache.set(ctx, b);
  return b;
}

function env(ctx, gainNode, when, attack, peak, decay) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, when);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
  g.exponentialRampToValueAtTime(0.0001, when + attack + decay);
}

/** Schedule one effect on any AudioContext / OfflineAudioContext. */
export function playSfx(ctx, type, when, out, gain = 1) {
  const g = ctx.createGain();
  g.connect(out);
  if (type === 'pop') {
    // bubbly pop: quick upward sine sweep + tiny noise transient
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(420, when);
    o.frequency.exponentialRampToValueAtTime(1150, when + 0.06);
    o.connect(g);
    env(ctx, g, when, 0.006, 0.55 * gain, 0.13);
    o.start(when); o.stop(when + 0.2);
    const n = ctx.createBufferSource(); n.buffer = noise(ctx);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const ng = ctx.createGain(); n.connect(hp); hp.connect(ng); ng.connect(out);
    env(ctx, ng, when, 0.002, 0.12 * gain, 0.03);
    n.start(when); n.stop(when + 0.05);
  } else if (type === 'click') {
    // crisp UI tap
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1900, when);
    o.frequency.exponentialRampToValueAtTime(900, when + 0.03);
    o.connect(g);
    env(ctx, g, when, 0.002, 0.45 * gain, 0.045);
    o.start(when); o.stop(when + 0.08);
    const n = ctx.createBufferSource(); n.buffer = noise(ctx);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4500; bp.Q.value = 1.2;
    const ng = ctx.createGain(); n.connect(bp); bp.connect(ng); ng.connect(out);
    env(ctx, ng, when, 0.001, 0.25 * gain, 0.02);
    n.start(when); n.stop(when + 0.04);
  } else if (type === 'whoosh' || type === 'swoosh') {
    // airy filtered-noise sweep
    const long = type === 'swoosh';
    const dur = long ? 0.62 : 0.42;
    const n = ctx.createBufferSource(); n.buffer = noise(ctx);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = long ? 0.9 : 1.4;
    bp.frequency.setValueAtTime(long ? 250 : 500, when);
    bp.frequency.exponentialRampToValueAtTime(long ? 2600 : 3800, when + dur * 0.75);
    n.connect(bp); bp.connect(g);
    const gg = g.gain;
    gg.setValueAtTime(0.0001, when);
    gg.exponentialRampToValueAtTime((long ? 0.5 : 0.32) * gain, when + dur * 0.55);
    gg.exponentialRampToValueAtTime(0.0001, when + dur);
    n.start(when); n.stop(when + dur + 0.02);
  } else if (type === 'chime') {
    // bright two-note chime
    [[880, 0], [1318.5, 0.09], [1760, 0.09]].forEach(([f, d], i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const og = ctx.createGain();
      o.connect(og); og.connect(out);
      env(ctx, og, when + d, 0.01, (i === 2 ? 0.08 : 0.22) * gain, 0.9);
      o.start(when + d); o.stop(when + d + 1.0);
    });
    g.disconnect();
  }
}

/** Render the whole effects track for export. Returns an AudioBuffer. */
export async function renderSoundtrack(data, tl, sampleRate = 48000) {
  const sound = data.settings.sound || {};
  const length = Math.max(1, Math.ceil((tl.total + 0.5) * sampleRate));
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const master = ctx.createGain();
  master.gain.value = sound.volume != null ? sound.volume : 0.8;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  if (sound.sfx !== false) for (const e of audioEvents(data, tl)) playSfx(ctx, e.type, e.t, master, e.gain);
  return ctx.startRendering();
}

/** Live preview: plays the cues the playhead crosses. */
export class SfxPlayer {
  constructor() { this.ctx = null; this.last = null; }
  ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  reset(t) { this.last = t; }
  tick(data, tl, t) {
    const sound = data.settings.sound || {};
    if (!this.ctx || sound.sfx === false) { this.last = t; return; }
    this.master.gain.value = sound.volume != null ? sound.volume : 0.8;
    if (this.last != null && t > this.last && t - this.last < 0.5) {
      for (const e of audioEvents(data, tl)) if (e.t > this.last && e.t <= t) playSfx(this.ctx, e.type, this.ctx.currentTime + 0.01, this.master, e.gain);
    }
    this.last = t;
  }
}

export { TRANSITION };
