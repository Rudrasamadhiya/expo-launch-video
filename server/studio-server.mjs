// Local web server for the studio: serves the editor, the captured images,
// a small JSON API, and a live event stream so edits made by the AI show up
// instantly in the browser (and edits made in the browser reach the AI).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { exec } from 'node:child_process';
import { summary, timeline } from './project.mjs';
import { parsePrompt, resolveRelative } from './prompt.mjs';
import { aiAvailable, promptToOps } from './ai.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_DIR = path.join(here, '..', 'studio');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json', '.mp4': 'video/mp4', '.webm': 'video/webm', '.svg': 'image/svg+xml' };

function mediabunnyPath() {
  const entry = createRequire(import.meta.url).resolve('mediabunny'); // .../dist/bundles/mediabunny.node.cjs
  return path.join(path.dirname(entry), 'mediabunny.min.mjs');
}

export class Studio {
  constructor(project, { port = Number(process.env.LAUNCH_VIDEO_PORT) || 8790, log = () => {} } = {}) {
    this.project = project;
    this.port = port;
    this.log = log;
    this.clients = new Set();
    this.prompts = [];        // typed by the user, waiting for the agent
    this.promptWaiters = [];  // agent calls blocked in video_wait_for_prompt
    this.renderWaiters = [];
    this.chat = [];
    project.on('change', (reason) => this.broadcast('project', { reason }));
  }

  get url() {
    return `http://localhost:${this.port}/`;
  }

  async start() {
    if (this.server) return this.url;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          const server = http.createServer((req, res) => this.handle(req, res).catch((err) => this.send(res, 500, { error: err.message })));
          server.once('error', reject);
          server.listen(this.port, '127.0.0.1', () => { this.server = server; resolve(); });
        });
        this.log(`studio at ${this.url}`);
        return this.url;
      } catch (err) {
        if (err.code !== 'EADDRINUSE') throw err;
        this.port++;
      }
    }
    throw new Error('no free port for the studio');
  }

  open(query = '') {
    const url = this.url + query;
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
    return url;
  }

  broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) res.write(msg);
  }

  say(from, text) {
    const m = { from, text, t: Date.now() };
    this.chat.push(m);
    if (this.chat.length > 100) this.chat.shift();
    this.broadcast('chat', m);
  }

  /** Agent side: wait until the user types something in the studio. */
  waitForPrompt(ms) {
    if (this.prompts.length) return Promise.resolve(this.prompts.shift());
    return new Promise((resolve) => {
      const done = (p) => { clearTimeout(timer); resolve(p); };
      const timer = setTimeout(() => { this.promptWaiters = this.promptWaiters.filter((w) => w !== done); resolve(null); }, ms);
      this.promptWaiters.push(done);
    });
  }

  /** Ask one studio tab (the newest) to export the MP4; resolves with the saved file for this request only. */
  requestRender(ms = 15 * 60 * 1000) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.renderWaiters = this.renderWaiters.filter((w) => w.id !== id); reject(new Error('render did not finish in time (is the studio tab open?)')); }, ms);
      this.renderWaiters.push({ id, done: (r) => { clearTimeout(timer); r.error ? reject(new Error(r.error)) : resolve(r); } });
      const target = [...this.clients].pop();
      if (target) target.write(`event: render
data: ${JSON.stringify({ id })}

`);
      else this.open('?render=' + id);
    });
  }

  finishRender(id, result) {
    const mine = this.renderWaiters.filter((w) => w.id === id);
    this.renderWaiters = this.renderWaiters.filter((w) => w.id !== id);
    mine.forEach((w) => w.done(result));
  }

  async handlePrompt(text, view = {}) {
    this.say('you', text);
    const p = this.project;
    // "this" / "this scene" means the scene selected in the studio
    const selected = view.scene && p.data.scenes.find((x) => x.id === view.scene);
    const resolved = selected ? text.replace(/this (scene|screen|one)|this(?= (?:d|faster|slower|shorter|longer))/gi, selected.id) : text;
    let ops = parsePrompt(resolved);
    if (ops) {
      try {
        const done = p.applyOps(resolveRelative(ops, p), 'prompt');
        const msg = done.join('; ') + ` · now ${p.totalSeconds().toFixed(1)}s`;
        this.say('studio', msg);
        return { handledBy: 'studio', message: msg };
      } catch (err) {
        this.say('studio', err.message);
        return { handledBy: 'studio', error: err.message };
      }
    }
    if (aiAvailable()) {
      try {
        const r = await promptToOps(text, p.data);
        const done = r.ops.length ? p.applyOps(r.ops, 'ai') : [];
        const msg = r.reply + (done.length ? ` (${done.join('; ')})` : '');
        this.say('claude', msg);
        return { handledBy: 'claude', message: msg };
      } catch (err) {
        if (err.code !== 'NO_AUTH') { this.say('studio', 'AI edit failed: ' + err.message); return { handledBy: 'claude', error: err.message }; }
      }
    }
    // hand it to the AI agent (Claude Code, Antigravity…) waiting in video_wait_for_prompt
    const prompt = { text, t: Date.now(), view: selected ? { scene: selected.id, title: selected.caption?.title || '', position: p.data.scenes.indexOf(selected) + 1, time: view.t } : null };
    const waiter = this.promptWaiters.shift();
    if (waiter) waiter(prompt); else this.prompts.push(prompt);
    const msg = waiter ? 'Sent to your AI agent…' : 'Queued for your AI agent. Ask it to "watch the studio" (video_wait_for_prompt) if it isn\'t already.';
    this.say('studio', msg);
    return { handledBy: 'agent', message: msg };
  }

  send(res, code, body, type = 'application/json') {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  }

  async body(req, limit = 512 * 1024 * 1024) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw new Error('body too large');
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }

  serveFile(res, file, req) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return this.send(res, 404, { error: 'not found' });
    const size = fs.statSync(file).size;
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    // byte ranges, so browsers can seek inside rendered videos
    const m = /^bytes=(\d*)-(\d*)$/.exec(req?.headers.range || '');
    if (m) {
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start >= size || start > end) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'no-cache' });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size, 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  }

  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return this.serveFile(res, path.join(STUDIO_DIR, 'index.html'));
    if (req.method === 'GET' && p.startsWith('/studio/')) return this.serveFile(res, path.join(STUDIO_DIR, path.basename(p)));
    if (req.method === 'GET' && p === '/vendor/mediabunny.mjs') return this.serveFile(res, mediabunnyPath());
    if (req.method === 'GET' && p.startsWith('/assets/')) return this.serveFile(res, path.join(this.project.assetsDir(), path.basename(decodeURIComponent(p))), req);
    if (req.method === 'GET' && p.startsWith('/out/')) return this.serveFile(res, path.join(this.project.outDir(), path.basename(decodeURIComponent(p))), req);
    if (req.method === 'GET' && p === '/api/project') {
      return this.send(res, 200, { data: this.project.data, summary: summary(this.project.data), timeline: timeline(this.project.data).items.map((i) => ({ id: i.scene.id, start: i.start, end: i.end })), chat: this.chat });
    }
    if (req.method === 'GET' && p === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('event: hello\ndata: {}\n\n');
      this.clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); this.clients.delete(res); });
      return;
    }
    if (req.method === 'POST' && p === '/api/ops') {
      const { ops } = JSON.parse((await this.body(req)).toString() || '{}');
      try { return this.send(res, 200, { ok: true, done: this.project.applyOps(ops || [], 'studio') }); } catch (err) { return this.send(res, 400, { error: err.message }); }
    }
    if (req.method === 'POST' && p === '/api/prompt') {
      const { text, scene, t } = JSON.parse((await this.body(req)).toString() || '{}');
      if (!text || !text.trim()) return this.send(res, 400, { error: 'empty prompt' });
      return this.send(res, 200, await this.handlePrompt(text.trim(), { scene, t }));
    }
    if (req.method === 'POST' && p === '/api/render') {
      const name = path.basename(url.searchParams.get('file') || 'launch.mp4').replace(/[^\w.-]/g, '_');
      const error = url.searchParams.get('error');
      const id = url.searchParams.get('id');
      if (error) {
        this.finishRender(id, { error });
        return this.send(res, 200, { ok: true });
      }
      const buf = await this.body(req);
      const file = path.join(this.project.outDir(), name);
      fs.writeFileSync(file, buf);
      const result = { file, bytes: buf.length, seconds: Number(url.searchParams.get('seconds')) || null, url: this.url + 'out/' + name };
      this.finishRender(id, result);
      this.say('studio', `Saved ${name} (${(buf.length / 1048576).toFixed(1)} MB)`);
      return this.send(res, 200, result);
    }
    return this.send(res, 404, { error: 'not found' });
  }

  close() {
    for (const c of this.clients) c.end();
    this.server?.close();
  }
}
