import { drawFrame, computeTimeline, loadImages, FORMATS, TRANSITION } from './render.js';
import { SfxPlayer, renderSoundtrack } from './audio.js';

const sfx = new SfxPlayer();

const $ = (id) => document.getElementById(id);
const state = { data: null, tl: null, images: new Map(), selected: null, t: 0, playing: false, chat: [] };
const PX_PER_SEC = 70;

// ---- server sync -----------------------------------------------------------

async function fetchProject() {
  const r = await fetch('/api/project');
  const j = await r.json();
  state.data = j.data;
  state.tl = computeTimeline(state.data);
  // draw right away; recorded frames fill in as they download
  const loading = loadImages(state.data, '/assets/', state.images);
  if (state.images.size === 0) {
    renderAll();
    const tick = setInterval(() => renderTrack(), 1500);
    await loading;
    clearInterval(tick);
  } else await loading;
  if (!state.chat.length && j.chat) { state.chat = j.chat; renderChat(); }
  if (state.selected && !state.data.scenes.some((s) => s.id === state.selected)) state.selected = null;
  if (!state.selected && state.data.scenes.length) state.selected = state.data.scenes.find((s) => s.kind === 'screen')?.id || state.data.scenes[0].id;
  state.t = Math.min(state.t, state.tl.total);
  autoTheme();
  renderAll();
}

async function ops(list) {
  const r = await fetch('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: list }) });
  const j = await r.json();
  if (j.error) toast(j.error);
  // the server broadcasts the change; fetchProject runs from the event stream
}

const debounced = new Map();
function opsSoon(key, list, ms = 300) {
  clearTimeout(debounced.get(key));
  debounced.set(key, setTimeout(() => ops(list), ms));
}

function connectEvents() {
  const es = new EventSource('/api/events');
  es.addEventListener('project', () => fetchProject());
  es.addEventListener('chat', (e) => { state.chat.push(JSON.parse(e.data)); renderChat(); });
  es.addEventListener('render', (e) => exportVideo(JSON.parse(e.data || '{}').id));
  es.onerror = () => { /* the browser reconnects by itself */ };
}

// ---- brand colors from the app's own screenshots ---------------------------

function autoTheme() {
  const th = state.data.settings.theme;
  if (!th || !th.auto) return;
  const first = Object.values(state.data.assets)[0];
  const img = first && state.images.get(first.file);
  if (!img) return;
  const c = document.createElement('canvas');
  c.width = 60; c.height = 120;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 60, 120);
  const px = ctx.getImageData(0, 0, 60, 120).data;
  // most common saturated color (weighted by saturation), averaged within its bucket
  const buckets = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max ? (max - min) / max : 0;
    if (sat < 0.35 || max < 70) continue; // ignore greys, whites and near-black
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = buckets.get(key) || { weight: 0, count: 0, r: 0, g: 0, b: 0 };
    e.weight += 1 + sat; e.count++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const best = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
  if (!best) return;
  const hex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  const [r, g, b] = [best.r / best.count, best.g / best.count, best.b / best.count];
  const accent = '#' + hex(r) + hex(g) + hex(b);
  const dark = '#' + hex(r * 0.16) + hex(g * 0.16) + hex(b * 0.22);
  ops([{ op: 'settings', theme: { accent, bg: [accent, dark] } }]);
}

// ---- preview ---------------------------------------------------------------

const canvas = $('preview');
const ctx = canvas.getContext('2d');

function sizeCanvas() {
  const [W, H] = FORMATS[state.data?.settings.format || 'landscape'];
  const wrap = $('canvasWrap').getBoundingClientRect();
  const fit = Math.min(wrap.width / W, wrap.height / H);
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(1, fit * dpr);
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  canvas.style.width = Math.round(W * fit) + 'px';
  canvas.style.height = Math.round(H * fit) + 'px';
  state.scale = scale;
}

function draw() {
  if (!state.data) return;
  const [W, H] = FORMATS[state.data.settings.format || 'landscape'];
  ctx.setTransform(state.scale, 0, 0, state.scale, 0, 0);
  drawFrame(ctx, state.data, state.images, state.t, W, H, state.tl);
}

let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (state.playing && state.tl) {
    state.t += dt;
    sfx.tick(state.data, state.tl, Math.min(state.t, state.tl.total));
    if (state.t >= state.tl.total) { state.t = state.tl.total; setPlaying(false); }
    updateTimeUI();
  }
  draw();
  requestAnimationFrame(loop);
}

function setPlaying(on) {
  if (on) sfx.ensure(); // the click that starts playback also unlocks audio
  sfx.reset(state.t);
  state.playing = on;
  if (on && state.tl && state.t >= state.tl.total - 0.01) state.t = 0;
  $('playBtn').textContent = on ? '❚❚ Pause' : '▶ Play';
}

const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

function updateTimeUI() {
  const total = state.tl?.total || 0;
  $('clock').textContent = `${fmtT(state.t)} / ${fmtT(total)}`;
  $('scrub').value = total ? Math.round((state.t / total) * 1000) : 0;
  $('playhead').style.left = state.t * PX_PER_SEC + 'px';
  const cur = state.tl?.items.findLast((it) => state.t >= it.start);
  if (state.playing && cur && cur.scene.id !== state.selected) { state.selected = cur.scene.id; renderTrack(); renderInspector(); }
}

// ---- timeline --------------------------------------------------------------

function sceneName(s) {
  if (s.kind !== 'screen') return s.kind === 'intro' ? 'Intro' : 'Outro';
  const a = state.data.assets[s.asset];
  return s.caption?.title || a?.title || a?.route || s.id;
}

function renderTrack() {
  const track = $('track');
  track.innerHTML = '';
  const { items, total } = state.tl;
  items.forEach((it, i) => {
    const s = it.scene;
    const el = document.createElement('div');
    el.className = 'clip' + (s.id === state.selected ? ' selected' : '') + (s.kind !== 'screen' ? ' card' : '');
    el.style.width = Math.max(40, it.shown * PX_PER_SEC - 3) + 'px';
    if (i > 0) el.style.marginLeft = -(TRANSITION * PX_PER_SEC) / 2 + 'px';
    el.draggable = true;
    el.dataset.id = s.id;
    const a = state.data.assets[s.asset];
    if (a && state.images.get(a.file)) { const img = document.createElement('img'); img.src = state.images.get(a.file).src; img.alt = ''; el.appendChild(img); }
    const meta = document.createElement('div');
    meta.className = 'meta';
    const badges = [];
    if ((s.speed || 1) !== 1) badges.push(`${s.speed}x`);
    if (s.focus) badges.push('zoom');
    if (s.scroll) badges.push('scroll');
    if (s.tap) badges.push('tap');
    meta.innerHTML = `<b></b><span>${it.shown.toFixed(1)}s</span><span>${badges.map((b) => `<i class="badge">${b}</i>`).join('')}</span>`;
    meta.querySelector('b').textContent = sceneName(s);
    el.appendChild(meta);
    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.title = 'Drag to change length';
    el.appendChild(handle);
    el.addEventListener('click', () => { select(s.id); state.t = it.start + 0.01; updateTimeUI(); });
    // reorder by drag and drop
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', s.id); });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dragover'); });
    el.addEventListener('dragleave', () => el.classList.remove('dragover'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('dragover');
      const from = e.dataTransfer.getData('text/plain');
      if (from && from !== s.id) ops([{ op: 'move', scene: from, to: i + 1 }]);
    });
    // resize by dragging the right edge
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      el.draggable = false;
      handle.setPointerCapture(e.pointerId);
      const x0 = e.clientX;
      const shown0 = it.shown;
      const move = (ev) => {
        const shown = Math.max(0.6, shown0 + (ev.clientX - x0) / PX_PER_SEC);
        el.style.width = shown * PX_PER_SEC - 3 + 'px';
        meta.querySelector('span').textContent = shown.toFixed(1) + 's';
      };
      const up = (ev) => {
        handle.removeEventListener('pointermove', move);
        const shown = Math.max(0.6, shown0 + (ev.clientX - x0) / PX_PER_SEC);
        ops([{ op: 'update', scene: s.id, duration: Math.round(shown * (s.speed || 1) * 10) / 10 }]);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up, { once: true });
    });
    track.appendChild(el);
  });
  // ruler
  const ruler = $('ruler');
  ruler.innerHTML = '';
  ruler.style.width = Math.max(total * PX_PER_SEC, 200) + 'px';
  track.style.width = ruler.style.width;
  for (let s = 0; s <= Math.ceil(total); s += total > 40 ? 5 : 2) {
    const sp = document.createElement('span');
    sp.style.left = s * PX_PER_SEC + 'px';
    sp.textContent = s + 's';
    ruler.appendChild(sp);
  }
  // captured screens not in the video
  const unused = $('unused');
  unused.innerHTML = '';
  const ids = state.data.order.filter((id) => !state.data.scenes.some((s) => s.asset === id));
  unused.parentElement.hidden = !ids.length;
  for (const id of ids) {
    const a = state.data.assets[id];
    const b = document.createElement('button');
    b.title = 'Add to the video';
    if (state.images.get(a.file)) { const img = document.createElement('img'); img.src = state.images.get(a.file).src; img.alt = ''; b.appendChild(img); }
    b.append('+ ' + (a.title || a.route || id));
    b.addEventListener('click', () => ops([{ op: 'add', asset: id }]));
    unused.appendChild(b);
  }
}

$('ruler').addEventListener('click', (e) => {
  const x = e.clientX - $('ruler').getBoundingClientRect().left;
  state.t = Math.max(0, Math.min(state.tl.total, x / PX_PER_SEC));
  updateTimeUI();
});

function select(id) {
  state.selected = id;
  renderTrack();
  renderInspector();
}

// ---- inspector -------------------------------------------------------------

function field(label, input) {
  const f = document.createElement('label');
  f.className = 'field';
  const sp = document.createElement('span');
  sp.textContent = label;
  f.append(sp, input);
  return f;
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
}

function rangeWithNumber(value, min, max, step, onChange) {
  const wrap = el('div', { className: 'inline' });
  const r = el('input', { type: 'range', min, max, step, value });
  const n = el('input', { type: 'number', min, max, step, value });
  r.addEventListener('input', () => { n.value = r.value; onChange(Number(r.value)); });
  n.addEventListener('change', () => { r.value = n.value; onChange(Number(n.value)); });
  wrap.append(r, n);
  return wrap;
}

function renderInspector() {
  const box = $('sceneTab');
  box.innerHTML = '';
  const s = state.data?.scenes.find((x) => x.id === state.selected);
  if (!s) { box.append(el('p', { className: 'muted', textContent: 'Select a scene in the timeline.' })); return; }
  const a = state.data.assets[s.asset];
  box.append(el('div', { className: 'muted', textContent: `${s.id} · ${s.kind === 'screen' ? a?.route || a?.title || '' : s.kind}` }));

  const title = el('input', { type: 'text', value: s.caption?.title || '' });
  title.addEventListener('input', () => opsSoon('title' + s.id, [{ op: 'update', scene: s.id, title: title.value }]));
  box.append(field(s.kind === 'outro' ? 'Button text' : s.kind === 'intro' ? 'App name' : 'Title', title));
  const sub = el('textarea', { value: s.caption?.subtitle || '' });
  sub.addEventListener('input', () => opsSoon('sub' + s.id, [{ op: 'update', scene: s.id, subtitle: sub.value }]));
  box.append(field('Subtitle', sub));

  box.append(field('Duration (s)', rangeWithNumber(s.duration, 1, 12, 0.1, (v) => opsSoon('dur' + s.id, [{ op: 'update', scene: s.id, duration: v }]))));
  const speed = el('select');
  for (const v of [0.5, 0.75, 1, 1.25, 1.5, 2, 3]) speed.append(el('option', { value: v, textContent: v + 'x', selected: (s.speed || 1) === v }));
  speed.addEventListener('change', () => ops([{ op: 'update', scene: s.id, speed: Number(speed.value) }]));
  box.append(field('Speed', speed));

  if (s.kind === 'screen') {
    const tr = el('select');
    for (const v of ['slide', 'fade', 'zoom', 'rise', 'none']) tr.append(el('option', { value: v, textContent: v, selected: s.transition === v }));
    tr.addEventListener('change', () => ops([{ op: 'update', scene: s.id, transition: tr.value }]));
    box.append(field('Transition in', tr));

    // zoom area: drag on the screenshot to choose it
    const img = a && state.images.get(a.file);
    if (img) {
      const pick = el('div', { className: 'focuspick', title: 'Drag to choose the zoom area' });
      const pic = el('img', { src: img.src, alt: 'Screen', draggable: false });
      const boxEl = el('div', { className: 'box' });
      pick.append(pic, boxEl);
      const k = () => pic.clientWidth / a.dpW;
      const showBox = (f) => {
        boxEl.hidden = !f;
        if (!f) return;
        Object.assign(boxEl.style, { left: f.x * k() + 'px', top: f.y * k() + 'px', width: f.w * k() + 'px', height: f.h * k() + 'px' });
      };
      pic.addEventListener('load', () => showBox(s.focus));
      requestAnimationFrame(() => showBox(s.focus));
      pick.addEventListener('pointerdown', (e) => {
        pick.setPointerCapture(e.pointerId);
        const r0 = pick.getBoundingClientRect();
        const x0 = (e.clientX - r0.left) / k();
        const y0 = (e.clientY - r0.top) / k();
        let f = null;
        const move = (ev) => {
          const x1 = (ev.clientX - r0.left) / k();
          const y1 = (ev.clientY - r0.top) / k();
          f = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
          showBox(f);
        };
        pick.addEventListener('pointermove', move);
        pick.addEventListener('pointerup', () => {
          pick.removeEventListener('pointermove', move);
          if (f && f.w > 12 && f.h > 12) {
            const zoom = Math.round(Math.max(1.4, Math.min(2.2, (a.dpW * 1.66) / f.w, (a.dpH * 0.6) / f.h)) * 100) / 100; // same rule as the director
            ops([{ op: 'update', scene: s.id, focus: f, zoom }]);
          }
        }, { once: true });
      });
      const zoomRow = el('div', { className: 'row' });
      const clear = el('button', { className: 'btn small', type: 'button', textContent: s.focus ? 'No zoom' : 'Drag on the screen to zoom' });
      clear.disabled = !s.focus;
      clear.addEventListener('click', () => ops([{ op: 'update', scene: s.id, focus: null, zoom: 1 }]));
      zoomRow.append(clear);
      box.append(field('Zoom area', pick), zoomRow);
      if (s.focus) box.append(field('Zoom amount', rangeWithNumber(s.zoom || 1.6, 1.1, 3, 0.05, (v) => opsSoon('zoom' + s.id, [{ op: 'update', scene: s.id, zoom: v }]))));
    }
    if (a?.scroll) {
      box.append(field('Scroll how far (%)', rangeWithNumber(Math.round((s.scroll?.to || 0) * 100), 0, 100, 1, (v) => opsSoon('scroll' + s.id, [{ op: 'update', scene: s.id, scroll: v / 100 }]))));
    }
    if (s.notes) box.append(el('div', { className: 'notes', textContent: 'Director: ' + s.notes }));
  }

  const row = el('div', { className: 'row' });
  const idx = state.data.scenes.indexOf(s);
  const left = el('button', { className: 'btn small', type: 'button', textContent: '← Earlier' });
  left.disabled = idx === 0;
  left.addEventListener('click', () => ops([{ op: 'move', scene: s.id, to: idx }]));
  const right = el('button', { className: 'btn small', type: 'button', textContent: 'Later →' });
  right.disabled = idx === state.data.scenes.length - 1;
  right.addEventListener('click', () => ops([{ op: 'move', scene: s.id, to: idx + 2 }]));
  const del = el('button', { className: 'btn small danger', type: 'button', textContent: 'Remove' });
  del.addEventListener('click', () => ops([{ op: 'remove', scene: s.id }]));
  row.append(left, right, del);
  box.append(row);
}

function renderVideoTab() {
  const box = $('videoTab');
  box.innerHTML = '';
  const st = state.data.settings;
  const text = (label, key) => {
    const i = el('input', { type: 'text', value: st[key] || '' });
    i.addEventListener('input', () => opsSoon('set' + key, [{ op: 'settings', [key]: i.value }]));
    box.append(field(label, i));
  };
  text('App name', 'appName');
  text('Tagline', 'tagline');
  text('Call to action (last screen)', 'cta');
  const colors = el('div', { className: 'inline' });
  const th = st.theme || {};
  const c1 = el('input', { type: 'color', value: (th.bg && th.bg[0]) || '#4f46e5', title: 'Background 1' });
  const c2 = el('input', { type: 'color', value: (th.bg && th.bg[1]) || '#111827', title: 'Background 2' });
  const ac = el('input', { type: 'color', value: th.accent || '#6366f1', title: 'Accent' });
  const setTheme = () => opsSoon('theme', [{ op: 'settings', theme: { bg: [c1.value, c2.value], accent: ac.value } }]);
  [c1, c2, ac].forEach((c) => c.addEventListener('input', setTheme));
  colors.append(c1, c2, ac);
  box.append(field('Colors (background, background, accent)', colors));
  const side = el('select');
  for (const [v, label] of [['left', 'Text left · phone right'], ['right', 'Text right · phone left']]) side.append(el('option', { value: v, textContent: label, selected: (st.captionSide || 'left') === v }));
  side.addEventListener('change', () => ops([{ op: 'settings', captionSide: side.value }]));
  box.append(field('Caption side (16:9)', side));
  const snd = st.sound || {};
  const sfxBox = el('input', { type: 'checkbox', checked: snd.sfx !== false });
  const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: snd.volume != null ? snd.volume : 0.8 });
  const setSound = () => opsSoon('sound', [{ op: 'settings', sound: { sfx: sfxBox.checked, volume: Number(vol.value) } }]);
  sfxBox.addEventListener('change', setSound);
  vol.addEventListener('input', setSound);
  const soundRow = el('div', { className: 'inline' });
  soundRow.append(sfxBox, el('span', { textContent: 'Pops, clicks, whooshes', className: 'muted' }), vol);
  box.append(field('Sound effects', soundRow));
  const fps = el('select');
  for (const v of [24, 30, 60]) fps.append(el('option', { value: v, textContent: v + ' fps', selected: st.fps === v }));
  fps.addEventListener('change', () => ops([{ op: 'settings', fps: Number(fps.value) }]));
  box.append(field('Frame rate', fps));
  const replan = el('button', { className: 'btn', type: 'button', textContent: 'Re-plan automatically' });
  replan.addEventListener('click', () => { if (confirm('Rebuild the whole timeline from the captured screens? Your edits will be replaced.')) ops([{ op: 'plan' }]); });
  box.append(replan);
}

function renderAll() {
  $('empty').hidden = !!state.data.scenes.length;
  $('appName').textContent = state.data.settings.appName ? '· ' + state.data.settings.appName : '';
  document.querySelectorAll('#formatSeg button').forEach((b) => b.classList.toggle('active', b.dataset.format === state.data.settings.format));
  sizeCanvas();
  renderTrack();
  renderInspector();
  renderVideoTab();
  updateTimeUI();
}

// ---- chat / prompt ---------------------------------------------------------

function renderChat() {
  const box = $('msgs');
  box.innerHTML = '';
  const names = { you: 'You', studio: 'Studio', claude: 'Claude', agent: 'Agent' };
  for (const m of state.chat.slice(-60)) {
    const d = el('div', { className: 'msg ' + m.from });
    d.append(el('b', { textContent: names[m.from] || m.from }), m.text);
    box.append(d);
  }
  box.scrollTop = box.scrollHeight;
}

$('promptForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('promptInput').value.trim();
  if (!text) return;
  $('promptInput').value = '';
  try {
    const r = await fetch('/api/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, scene: state.selected, t: Math.round(state.t * 10) / 10 }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
  } catch (err) {
    // keep the text so nothing typed is lost, and say what happened
    $('promptInput').value = text;
    state.chat.push({ from: 'studio', text: 'Could not reach the studio server (is your AI agent session running?). Your text is still in the box — press Send again.', t: Date.now() });
    renderChat();
  }
});
$('promptInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('promptForm').requestSubmit(); }
});

// ---- export ----------------------------------------------------------------

let exporting = false;
async function exportVideo(requestId = null) {
  if (exporting || !state.data?.scenes.length) return;
  exporting = true;
  setPlaying(false);
  const dlg = $('exportDlg');
  $('exportTitle').textContent = 'Rendering…';
  $('exportLink').hidden = true;
  $('exportInfo').textContent = '';
  dlg.showModal();
  try {
    $('exportInfo').textContent = 'Loading frames…';
    await loadImages(state.data, '/assets/', state.images); // every frame must be ready before encoding
    const mb = await import('/vendor/mediabunny.mjs');
    const [W, H] = FORMATS[state.data.settings.format || 'landscape'];
    const fps = state.data.settings.fps || 30;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const octx = out.getContext('2d', { alpha: false });
    let codec = 'avc';
    let format = new mb.Mp4OutputFormat();
    let ext = 'mp4';
    if (!(await mb.canEncodeVideo('avc', { width: W, height: H }))) {
      codec = 'vp9'; format = new mb.WebMOutputFormat(); ext = 'webm';
    }
    const output = new mb.Output({ format, target: new mb.BufferTarget() });
    const source = new mb.CanvasSource(out, { codec, quality: mb.QUALITY_HIGH });
    output.addVideoTrack(source, { frameRate: fps });
    const tl = computeTimeline(state.data);
    // sound effects track (pops, clicks, whooshes, chimes)
    let audioSource = null;
    if ((state.data.settings.sound || {}).sfx !== false) {
      const acodec = ext === 'mp4' && (await mb.canEncodeAudio('aac')) ? 'aac' : 'opus';
      if (await mb.canEncodeAudio(acodec)) {
        audioSource = new mb.AudioBufferSource({ codec: acodec, quality: mb.QUALITY_HIGH });
        output.addAudioTrack(audioSource);
      }
    }
    await output.start();
    if (audioSource) {
      $('exportInfo').textContent = 'Mixing sound…';
      await audioSource.add(await renderSoundtrack(state.data, tl));
      audioSource.close();
    }
    const frames = Math.ceil(tl.total * fps);
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      const t = i / fps;
      drawFrame(octx, state.data, state.images, t, W, H, tl);
      octx.getImageData(0, 0, 1, 1); // flush: an off-page canvas can otherwise be captured stale
      await source.add(t, 1 / fps);
      if (i % 10 === 0) {
        $('exportProgress').value = i / frames;
        $('exportInfo').textContent = `Frame ${i} of ${frames} · ${W}x${H} ${codec.toUpperCase()}`;
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    source.close();
    await output.finalize();
    const buf = output.target.buffer;
    const name = `launch-${state.data.settings.format}.${ext}`;
    const res = await fetch(`/api/render?file=${name}&seconds=${tl.total.toFixed(2)}${requestId ? '&id=' + requestId : ''}`, { method: 'POST', body: buf });
    const saved = await res.json();
    $('exportProgress').value = 1;
    $('exportTitle').textContent = 'Done';
    $('exportInfo').textContent = `${(buf.byteLength / 1048576).toFixed(1)} MB · ${tl.total.toFixed(1)}s · rendered in ${((performance.now() - t0) / 1000).toFixed(0)}s · saved to ${saved.file}`;
    const link = $('exportLink');
    link.href = URL.createObjectURL(new Blob([buf], { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' }));
    link.download = name;
    link.hidden = false;
  } catch (err) {
    $('exportTitle').textContent = 'Render failed';
    $('exportInfo').textContent = String(err && err.message || err);
    fetch('/api/render?error=' + encodeURIComponent(String(err && err.message || err)) + (requestId ? '&id=' + requestId : ''), { method: 'POST' });
  } finally {
    exporting = false;
  }
}

// ---- wiring ----------------------------------------------------------------

$('playBtn').addEventListener('click', () => setPlaying(!state.playing));
$('exportBtn').addEventListener('click', () => exportVideo());
$('exportClose').addEventListener('click', () => $('exportDlg').close());
$('scrub').addEventListener('input', () => { state.t = (Number($('scrub').value) / 1000) * (state.tl?.total || 0); setPlaying(false); updateTimeUI(); });
document.querySelectorAll('#formatSeg button').forEach((b) => b.addEventListener('click', () => ops([{ op: 'settings', format: b.dataset.format }])));
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  $('sceneTab').hidden = b.dataset.tab !== 'scene';
  $('videoTab').hidden = b.dataset.tab !== 'video';
}));
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!state.playing); }
});
window.addEventListener('resize', () => state.data && sizeCanvas());

await fetchProject();
connectEvents();
requestAnimationFrame(loop);
const renderParam = new URLSearchParams(location.search).get('render');
if (renderParam != null) exportVideo(renderParam && renderParam !== '1' ? renderParam : null);
