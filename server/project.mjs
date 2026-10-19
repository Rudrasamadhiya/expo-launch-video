// The video project: captured screens (assets), the scene timeline and
// settings, stored as launch-video/project.json next to the image files.
// Every change (AI tool, studio UI, typed prompt) goes through applyOps().
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { autoScene, autoCallouts, autoPopouts, introScene, outroScene, plan } from './director.mjs';

export const FORMATS = {
  landscape: { w: 1920, h: 1080 },
  portrait: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

export function emptyProject() {
  return {
    version: 1,
    settings: {
      format: 'landscape',
      fps: 30,
      appName: '',
      tagline: '',
      cta: 'Download now',
      icon: null,
      theme: { bg: ['#4f46e5', '#111827'], accent: '#6366f1', text: '#ffffff', auto: true },
    },
    assets: {},
    order: [], // asset ids in capture order
    scenes: [],
    nextId: 1,
  };
}

export class Project extends EventEmitter {
  constructor(dir) {
    super();
    this.dir = dir;
    this.file = path.join(dir, 'project.json');
    this.data = emptyProject();
    if (fs.existsSync(this.file)) {
      try { this.data = Object.assign(emptyProject(), JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch {}
    }
  }

  assetsDir() {
    const d = path.join(this.dir, 'assets');
    fs.mkdirSync(d, { recursive: true });
    return d;
  }

  outDir() {
    const d = path.join(this.dir, 'out');
    fs.mkdirSync(d, { recursive: true });
    return d;
  }

  newId(prefix) {
    return prefix + this.data.nextId++;
  }

  save(reason = 'change') {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 1));
    this.emit('change', reason);
  }

  /** Store a captured screen. Replaces an earlier capture of the same route. */
  addAsset(asset) {
    const existing = Object.values(this.data.assets).find((a) => a.route && a.route === asset.route && asset.route);
    const id = existing ? existing.id : this.newId('a');
    this.data.assets[id] = { ...asset, id, capturedAt: new Date().toISOString() };
    if (!this.data.order.includes(id)) this.data.order.push(id);
    this.save('asset');
    return this.data.assets[id];
  }

  totalSeconds() {
    return timeline(this.data).total;
  }

  /** Resolve a scene reference: id ("s3"), 1-based position, "intro"/"outro"/"first"/"last", or a name/route. */
  findScene(ref) {
    const scenes = this.data.scenes;
    if (ref == null) throw new Error('scene reference missing');
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
      const s = scenes[Number(ref) - 1];
      if (!s) throw new Error(`no scene #${ref} (there are ${scenes.length})`);
      return s;
    }
    const q = String(ref).trim().toLowerCase().replace(/^scene\s+/, '');
    if (/^\d+$/.test(q)) return this.findScene(Number(q));
    const byId = scenes.find((s) => s.id === q);
    if (byId) return byId;
    if (q === 'first') return scenes.find((s) => s.kind === 'screen') || scenes[0];
    if (q === 'last') return [...scenes].reverse().find((s) => s.kind === 'screen') || scenes[scenes.length - 1];
    const byKind = scenes.find((s) => s.kind === q);
    if (byKind) return byKind;
    const name = (s) => {
      const a = s.asset && this.data.assets[s.asset];
      return [s.caption?.title, a?.title, a?.route, a?.route?.replace(/^\//, '').replace(/-/g, ' ')].filter(Boolean).map((x) => x.toLowerCase());
    };
    const exact = scenes.find((s) => name(s).some((n) => n === q || n === '/' + q));
    if (exact) return exact;
    const partial = scenes.find((s) => name(s).some((n) => n.includes(q)));
    if (partial) return partial;
    throw new Error(`no scene matching "${ref}"`);
  }

  findAsset(ref) {
    const assets = Object.values(this.data.assets);
    const q = String(ref).toLowerCase();
    return this.data.assets[ref]
      || assets.find((a) => a.route?.toLowerCase() === q || a.route?.toLowerCase() === '/' + q)
      || assets.find((a) => a.title?.toLowerCase().includes(q) || a.route?.toLowerCase().includes(q))
      || (() => { throw new Error(`no captured screen matching "${ref}"`); })();
  }

  /** Focus value from a rect, an element label, or null. */
  resolveFocus(scene, focus) {
    if (focus == null || focus === false || focus === 'none') return null;
    if (typeof focus === 'object') return focus;
    const asset = this.data.assets[scene.asset];
    const q = String(focus).toLowerCase();
    const el = asset?.elements?.find((e) => e.label && e.label.toLowerCase() === q)
      || asset?.elements?.find((e) => e.label && e.label.toLowerCase().includes(q));
    if (!el) throw new Error(`no element "${focus}" on ${asset?.route || 'this scene'}`);
    const pad = 10;
    return { x: el.x - pad, y: el.y - pad, w: el.w + pad * 2, h: el.h + pad * 2, label: el.label };
  }

  /**
   * Apply edit operations. Returns a list of human-readable results.
   * ops: {op:'update', scene, duration?, speed?, caption?, title?, subtitle?, transition?, focus?, zoom?, scroll?}
   *      {op:'move', scene, to} {op:'remove', scene} {op:'add', asset, at?} {op:'settings', ...}
   *      {op:'plan', targetSeconds?}
   */
  applyOps(ops, source = 'edit') {
    const done = [];
    for (const op of ops) {
      const kind = op.op || op.type;
      if (kind === 'update') {
        const s = this.findScene(op.scene);
        if (op.duration != null) s.duration = clamp(Number(op.duration), 0.5, 30);
        if (op.speed != null) s.speed = clamp(Number(op.speed), 0.25, 4);
        if (op.transition) s.transition = op.transition;
        if (op.caption || op.title != null || op.subtitle != null) {
          s.caption = { ...s.caption, ...(op.caption || {}) };
          if (op.title != null) s.caption.title = op.title;
          if (op.subtitle != null) s.caption.subtitle = op.subtitle;
        }
        if ('focus' in op) s.focus = this.resolveFocus(s, op.focus);
        if (op.zoom != null) s.zoom = clamp(Number(op.zoom), 1, 3);
        if ('zoomTimes' in op) s.zoomTimes = Array.isArray(op.zoomTimes) && op.zoomTimes.length === 4 ? op.zoomTimes.map(Number) : null;
        if ('popouts' in op) {
          const asset = this.data.assets[s.asset];
          s.popouts = op.popouts === 'auto' ? (asset ? autoPopouts(asset) : []) : Array.isArray(op.popouts) ? op.popouts : [];
        }
        if ('callouts' in op) {
          const asset = this.data.assets[s.asset];
          s.callouts = op.callouts === 'auto' ? (asset ? autoCallouts(asset) : [])
            : Array.isArray(op.callouts) ? op.callouts.slice(0, 3).map((x) => (typeof x === 'string' ? { text: x } : x)) : [];
        }
        if ('scroll' in op) s.scroll = op.scroll === false || op.scroll == null || op.scroll === 0 ? null : { to: clamp(Number(op.scroll), 0, 1) };
        done.push(`updated ${label(s, this.data)}`);
      } else if (kind === 'move') {
        const s = this.findScene(op.scene);
        const list = this.data.scenes;
        list.splice(list.indexOf(s), 1);
        let to = op.to === 'first' || op.to === 'start' ? 1 : op.to === 'last' || op.to === 'end' ? list.length + 1 : Number(op.to);
        if (op.before) to = list.indexOf(this.findScene(op.before)) + 1;
        if (op.after) to = list.indexOf(this.findScene(op.after)) + 2;
        list.splice(clamp(to, 1, list.length + 1) - 1, 0, s);
        done.push(`moved ${label(s, this.data)} to #${list.indexOf(s) + 1}`);
      } else if (kind === 'remove') {
        const s = this.findScene(op.scene);
        this.data.scenes.splice(this.data.scenes.indexOf(s), 1);
        done.push(`removed ${label(s, this.data)}`);
      } else if (kind === 'add') {
        const a = this.findAsset(op.asset);
        const s = { ...autoScene(a, this.data.settings), id: this.newId('s') };
        const list = this.data.scenes;
        const outroAt = list.findIndex((x) => x.kind === 'outro');
        const at = op.at != null ? clamp(Number(op.at), 1, list.length + 1) - 1 : outroAt >= 0 ? outroAt : list.length;
        list.splice(at, 0, s);
        done.push(`added ${label(s, this.data)} at #${at + 1}`);
      } else if (kind === 'drop') {
        // discard a captured screen (a bad take) and any scene that uses it
        const a = this.findAsset(op.asset);
        delete this.data.assets[a.id];
        this.data.order = this.data.order.filter((id) => id !== a.id);
        this.data.scenes = this.data.scenes.filter((s) => s.asset !== a.id);
        done.push(`dropped ${a.id} ${a.title || a.route || ''}`.trim());
      } else if (kind === 'settings') {
        const st = this.data.settings;
        for (const k of ['format', 'fps', 'appName', 'tagline', 'cta', 'captionSide']) if (op[k] != null) st[k] = op[k];
        if (op.captionSide && !['left', 'right'].includes(op.captionSide)) throw new Error('captionSide must be left or right');
        if (op.format && !FORMATS[op.format]) throw new Error('format must be landscape, portrait or square');
        if (op.theme) st.theme = { ...st.theme, ...op.theme, auto: false };
        if (op.sound) st.sound = { sfx: true, volume: 0.8, ...st.sound, ...op.sound };
        for (const s of this.data.scenes) {
          if (s.kind === 'intro' && (op.appName != null || op.tagline != null)) s.caption = { title: st.appName, subtitle: st.tagline };
          if (s.kind === 'outro' && (op.appName != null || op.cta != null)) s.caption = { title: st.cta, subtitle: st.appName };
        }
        done.push('updated settings');
      } else if (kind === 'plan') {
        this.data.scenes = plan(this.data, { targetSeconds: op.targetSeconds }).map((s) => ({ ...s, id: this.newId('s') }));
        done.push(`planned ${this.data.scenes.length} scenes, ${this.totalSeconds().toFixed(1)}s`);
      } else if (kind === 'intro' || kind === 'outro') {
        if (!this.data.scenes.some((s) => s.kind === kind)) {
          const s = { ...(kind === 'intro' ? introScene(this.data.settings) : outroScene(this.data.settings)), id: this.newId('s') };
          kind === 'intro' ? this.data.scenes.unshift(s) : this.data.scenes.push(s);
          done.push(`added ${kind}`);
        }
      } else {
        throw new Error(`unknown op "${kind}"`);
      }
    }
    this.save(source);
    return done;
  }
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

function label(s, data) {
  const a = s.asset && data.assets[s.asset];
  return `${s.id} ${s.kind === 'screen' ? a?.route || '' : s.kind}`.trim();
}

export const TRANSITION = 0.45; // seconds of overlap between scenes

/** Start/end of every scene in seconds (scenes overlap by TRANSITION). */
export function timeline(data) {
  const items = [];
  let t = 0;
  data.scenes.forEach((s, i) => {
    const shown = s.duration / (s.speed || 1);
    const start = i === 0 ? 0 : Math.max(0, t - TRANSITION);
    items.push({ scene: s, start, end: start + shown, shown });
    t = start + shown;
  });
  return { items, total: t };
}

/** Compact text summary for AI agents. */
export function summary(data) {
  const f = FORMATS[data.settings.format] || FORMATS.landscape;
  const tl = timeline(data);
  const snd = data.settings.sound || {};
  const lines = [`${data.settings.format} ${f.w}x${f.h} · ${data.settings.fps}fps · ${tl.total.toFixed(1)}s · ${data.scenes.length} scenes · sound ${snd.sfx === false ? 'off' : 'on'}`];
  tl.items.forEach(({ scene: s, shown }, i) => {
    const a = s.asset && data.assets[s.asset];
    let l = `${i + 1}. ${s.id} ${s.kind === 'screen' ? a?.route || a?.title || '?' : s.kind} ${shown.toFixed(1)}s`;
    if ((s.speed || 1) !== 1) l += ` (${s.duration}s @${s.speed}x)`;
    if (s.transition && s.kind === 'screen') l += ` ${s.transition}`;
    if (s.caption?.title) l += ` "${s.caption.title}"`;
    if (s.caption?.subtitle) l += ` / "${s.caption.subtitle}"`;
    if (s.focus) l += ` · zoom ${s.zoom || 1.6}x on ${s.focus.label ? '"' + s.focus.label + '"' : `${Math.round(s.focus.x)},${Math.round(s.focus.y)} ${Math.round(s.focus.w)}x${Math.round(s.focus.h)}`}`;
    if (s.scroll) l += ` · scroll ${Math.round(s.scroll.to * 100)}%`;
    if (s.popouts?.length) l += ` · break-outs: ${s.popouts.map((x) => x.style + (x.label ? ' "' + x.label + '"' : '') + ' @' + x.at.toFixed(1) + 's').join(', ')}`;
    if (s.callouts?.length) l += ` · pop-ups: ${s.callouts.map((x) => x.value ? x.value + ' ' + (x.label || '') : x.text).join(', ')}`;
    if (s.tap) l += ` · tap "${s.tap.label || ''}"`;
    if (s.recording && a?.recording) l += ` · screen recording ${a.recording.seconds}s (${a.recording.action})`;
    lines.push(l);
  });
  const unused = data.order.filter((id) => !data.scenes.some((s) => s.asset === id));
  if (unused.length) lines.push('captured but unused: ' + unused.map((id) => `${id} ${data.assets[id].route || data.assets[id].title}`).join(', '));
  return lines.join('\n');
}
