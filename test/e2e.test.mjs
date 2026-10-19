// End to end: a fake app with the real <AgentBridge> (fake react-native), the
// real expo-launch-video MCP server over stdio, driven like an AI agent would,
// plus the studio's HTTP API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const PHONE_PORT = 18348;
const STUDIO_PORT = 18790;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'elv-e2e-'));

const Module = require('node:module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'react-native') return path.join(here, 'fake-rn.cjs');
  if (req === 'react-native-view-shot') return path.join(here, 'fake-viewshot.cjs');
  return origResolve.call(this, req, ...rest);
};
globalThis.__DEV__ = true;
globalThis.WebSocket = WebSocket;
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = require('react');
const TR = require('react-test-renderer');
const { AgentBridge } = require('expo-mcp-bridge');
const { Text, View, TextInput, Pressable, ScrollView } = require('./fake-rn.cjs');
const h = React.createElement;

function DemoApp() {
  const [msg, setMsg] = React.useState('');
  return h(View, null,
    h(Text, { style: { fontSize: 28 }, __testRect: { x: 16, y: 60, w: 260, h: 34 } }, 'Performance Insights'),
    h(Text, { style: { fontSize: 13 }, __testRect: { x: 16, y: 98, w: 320, h: 18 } }, 'Track your progress and spot what to improve next.'),
    h(Text, { style: { fontSize: 20 }, __testRect: { x: 40, y: 170, w: 40, h: 24 } }, '130k+'),
    h(Text, { __testRect: { x: 30, y: 196, w: 70, h: 14 } }, 'Questions'),
    h(Text, { style: { fontSize: 20 }, __testRect: { x: 150, y: 170, w: 30, h: 24 } }, '21'),
    h(Text, { __testRect: { x: 140, y: 196, w: 50, h: 14 } }, 'Exams'),
    h(TextInput, { placeholder: 'Email', value: '', onChangeText() {} }),
    h(Pressable, { onPress: () => setMsg('Welcome'), testID: 'login', __testRect: { x: 16, y: 520, w: 328, h: 48 } }, h(Text, null, 'Log in')),
    msg ? h(Text, null, msg) : null,
    h(ScrollView, { __testRect: { x: 0, y: 0, w: 390, h: 844 }, __contentRect: { x: 0, y: 0, w: 390, h: 2600 } },
      ...Array.from({ length: 4 }, (_, i) => h(Text, { key: i }, 'Row ' + i))),
  );
}

let client, renderer;
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
  return { text: r.content.map((c) => c.text ?? `<${c.type}>`).join('\n'), isError: r.isError };
};
const studio = (p, init) => fetch(`http://localhost:${STUDIO_PORT}${p}`, init);

before(async () => {
  client = new Client({ name: 'test', version: '1' });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [path.join(here, '..', 'server', 'cli.mjs')],
    cwd: DIR,
    env: { ...process.env, EXPO_MCP_PORT: String(PHONE_PORT), LAUNCH_VIDEO_PORT: String(STUDIO_PORT), LAUNCH_VIDEO_DIR: path.join(DIR, 'launch-video'), LAUNCH_VIDEO_AI: 'off' },
    stderr: 'pipe',
  }));
  renderer = TR.create(h(React.Fragment, null, h(DemoApp), h(AgentBridge, { host: 'localhost', port: PHONE_PORT })));
});

after(async () => {
  renderer?.unmount();
  await client?.close();
});

test('one server offers app control and video tools', async () => {
  const names = (await client.listTools()).tools.map((t) => t.name);
  for (const n of ['app_status', 'app_tap', 'app_type', 'device_key', 'video_capture', 'video_record', 'video_plan', 'video_edit', 'video_studio', 'video_render', 'video_wait_for_prompt', 'video_reply']) assert.ok(names.includes(n), n);
  assert.match((await call('app_status')).text, /^Connected/);
});

test('video_capture: stills, elements, scroll capture, zoom candidate', async () => {
  const r = await call('video_capture', { name: 'Analytics' });
  assert.match(r.text, /a\d+ "Analytics" · \d+ elements · scrolls [\d.]+ screens · zoom candidate: stats row \(130k\+, 21\)/);
  const files = fs.readdirSync(path.join(DIR, 'launch-video', 'assets'));
  assert.ok(files.includes('analytics.jpg') && files.includes('analytics-scroll.jpg'), files.join(','));
});

test('video_record: live frames while scrolling, and a tap that becomes a pop-out', async () => {
  let r = await call('video_record', { name: 'Scroll take', seconds: 0.6, scroll: true });
  assert.match(r.text, /recorded \d+ frames in 0\.6s .*scroll\)/);
  r = await call('video_record', { name: 'Login tap', seconds: 0.8, tap: 'Log in', tapAt: 0.3 });
  assert.match(r.text, /tap\)/);
  const data = JSON.parse(fs.readFileSync(path.join(DIR, 'launch-video', 'project.json'), 'utf8'));
  const take = Object.values(data.assets).find((a) => a.name === 'Login tap');
  assert.equal(take.recording.tap.label, 'Log in');
  assert.ok(take.recording.frames.length >= 4);
});

test('video_plan + video_edit: timeline with captions, chips, pop-outs and sound', async () => {
  let r = await call('video_plan', { targetSeconds: 14, appName: 'Demo', tagline: 'The demo app', cta: 'Get it now' });
  assert.match(r.text, /^landscape 1920x1080 · 30fps · [\d.]+s · 5 scenes · sound on/);
  assert.match(r.text, /intro [\d.]+s "Demo" \/ "The demo app"/);
  assert.match(r.text, /pop-ups: 130k\+ Questions, 21 Exams/);
  assert.match(r.text, /break-outs: hero "Log in"/);
  assert.match(r.text, /outro [\d.]+s "Get it now"/);
  r = await call('video_edit', { ops: [
    { op: 'update', scene: 'analytics', title: 'Know where you stand', speed: 1.5 },
    { op: 'settings', captionSide: 'right', format: 'portrait', sound: { volume: 0.5 } },
    { op: 'move', scene: 'login tap', to: 2 },
  ] });
  assert.match(r.text, /^updated s\d+; updated settings; moved s\d+ to #2\nportrait 1080x1920/);
  assert.match(r.text, /\n2\. s\d+ Login tap/);
  assert.match(r.text, /"Know where you stand"/);
  assert.match((await call('video_edit', { ops: [{ op: 'remove', scene: 'nope' }] })).text, /Error: no scene matching "nope"/);
});

test('studio: project API, local prompt edits, agent hand-off with scene context', async () => {
  const p = await (await studio('/api/project')).json();
  assert.equal(p.data.settings.appName, 'Demo');
  assert.ok(p.timeline.length === 5);
  let r = await (await studio('/api/prompt', { method: 'POST', body: JSON.stringify({ text: 'make it 10 seconds' }) })).json();
  assert.equal(r.handledBy, 'studio');
  assert.match(r.message, /planned 5 scenes/);
  const fresh = await (await studio('/api/project')).json(); // the re-plan above made new scenes
  const selected = fresh.data.scenes[1].id;
  const waiting = call('video_wait_for_prompt', { timeoutSeconds: 20 });
  await new Promise((res) => setTimeout(res, 300));
  r = await (await studio('/api/prompt', { method: 'POST', body: JSON.stringify({ text: 'make this one feel more premium', scene: selected, t: 3.2 }) })).json();
  assert.equal(r.handledBy, 'agent');
  const got = await waiting;
  assert.match(got.text, /User asked: make this one feel more premium\nThey were looking at scene #2 s\d+/);
  assert.match((await call('video_reply', { text: 'On it' })).text, /Sent/);
  const after = await (await studio('/api/project')).json();
  assert.ok(after.chat.some((m) => m.from === 'agent' && m.text === 'On it'));
});

test('studio: serves the editor, vendor encoder, and byte ranges', async () => {
  const html = await (await studio('/')).text();
  assert.match(html, /Launch Video Studio/);
  assert.equal((await studio('/vendor/mediabunny.mjs')).status, 200);
  for (const f of ['render.js', 'motion.js', 'audio.js', 'studio.js']) assert.equal((await studio('/studio/' + f)).status, 200, f);
  const ranged = await studio('/assets/analytics.jpg', { headers: { range: 'bytes=0-3' } });
  assert.equal(ranged.status, 206);
  assert.equal((await ranged.arrayBuffer()).byteLength, 4);
});
