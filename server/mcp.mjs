// MCP server for AI agents: everything expo-mcp-bridge offers (app_* tools to
// drive the phone) plus video_* tools to capture screens, plan the launch
// video, edit it, collaborate through the studio and render the MP4.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Hub } from 'expo-mcp-bridge/server/hub.mjs';
import { registerAppTools } from 'expo-mcp-bridge/server/mcp.mjs';
import { Project, summary } from './project.mjs';
import { findFocus } from './director.mjs';
import { captureScreen, captureTap, recordScreen } from './capture.mjs';
import { Studio } from './studio-server.mjs';

const { version: VERSION } = createRequire(import.meta.url)('../package.json');
const log = (...a) => process.stderr.write('[expo-launch-video] ' + a.join(' ') + '\n');
const text = (s) => ({ content: [{ type: 'text', text: s }] });
const wrap = (fn) => async (args) => {
  try { return await fn(args || {}); } catch (err) { return { content: [{ type: 'text', text: 'Error: ' + (err?.message || String(err)) }], isError: true }; }
};

/** App name, description and icon from the Expo config, used for the intro/outro. */
export function readAppInfo(root, project) {
  const s = project.data.settings;
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')); } catch {}
  const expo = cfg?.expo || cfg || {};
  if (!s.appName && expo.name) s.appName = expo.name;
  if (!s.tagline && expo.description) s.tagline = expo.description;
  const icon = expo.icon || expo.android?.adaptiveIcon?.foregroundImage;
  if (!s.icon && icon && fs.existsSync(path.join(root, icon))) {
    fs.copyFileSync(path.join(root, icon), path.join(project.assetsDir(), 'icon' + path.extname(icon)));
    s.icon = 'icon' + path.extname(icon);
  }
}

function describeAsset(a) {
  const parts = [`${a.id} ${a.route || ''} "${a.title}"`.replace(/\s+/g, ' '), `${a.elements.length} elements`];
  if (a.scroll) parts.push(`scrolls ${(a.scroll.contentH / a.scroll.viewport.h).toFixed(1)} screens`);
  if (a.scrollError) parts.push('scroll capture failed: ' + a.scrollError);
  const f = findFocus(a);
  if (f) parts.push('zoom candidate: ' + f.reason);
  if (a.tap) parts.push(`tap "${a.tap.label}" → ${a.tap.after}`);
  return parts.join(' · ');
}

export async function startServer({ root = process.cwd() } = {}) {
  const dir = process.env.LAUNCH_VIDEO_DIR || path.join(root, 'launch-video');
  const project = new Project(dir);
  readAppInfo(root, project);
  const hub = new Hub({ log });
  await hub.start();
  const studio = new Studio(project, { log });
  await studio.start();

  const server = new McpServer({ name: 'expo-launch-video', version: VERSION });
  registerAppTools(server, hub);

  server.registerTool('video_capture', {
    description: 'Capture app screens for the launch video: screenshot, element positions and the full scroll content. Give routes to capture several screens in one call (in video order), or nothing to capture the current screen.',
    inputSchema: {
      routes: z.array(z.string()).optional().describe('expo-router paths, e.g. ["/dashboard", "/analytics"]'),
      name: z.string().optional().describe('name for the current screen when routes is empty'),
      scroll: z.boolean().optional().describe('capture scroll content (default true)'),
    },
  }, wrap(async ({ routes, name, scroll }) => {
    const out = [];
    if (routes && routes.length) {
      for (const route of routes) {
        try { out.push(describeAsset(await captureScreen(hub, project, { route, scroll: scroll !== false }))); } catch (err) { out.push(`${route}: failed - ${err.message}`); }
      }
    } else {
      out.push(describeAsset(await captureScreen(hub, project, { name, scroll: scroll !== false })));
    }
    return text(out.join('\n') + `\nStudio: ${studio.url}`);
  }));

  server.registerTool('video_record', {
    description: 'Screen-record the phone for a few seconds (real frames, ~6-12 fps): optionally navigate first, scroll smoothly, or tap an element mid-way. The clip plays in the video as a live recording.',
    inputSchema: {
      route: z.string().optional().describe('page to open; the opening (loading, entrance animations) is recorded live'),
      name: z.string().optional(),
      seconds: z.number().optional().describe('1-15, default 4'),
      scroll: z.union([z.boolean(), z.number()]).optional().describe('scroll smoothly while recording (true, or distance in dp)'),
      scrollFrom: z.number().optional().describe('when scrolling starts, as a fraction of the recording (default 0.5 with route: hold while the page loads)'),
      liveLoad: z.boolean().optional().describe('record the page opening (default true when route is given)'),
      tap: z.string().optional().describe('visible text of an element to tap mid-recording'),
      tapAt: z.number().optional().describe('second at which to tap (default: halfway)'),
    },
  }, wrap(async (a) => {
    const asset = await recordScreen(hub, project, a);
    const r = asset.recording;
    const modalOpen = r.frames.length && r.frames[r.frames.length - 1].overlay;
    return text(`${describeAsset(asset)} · recorded ${r.frames.length} frames in ${r.seconds}s (${r.fps} fps, ${r.action})`
      + (modalOpen ? '\n⚠ A modal is still open on the phone and covers every screen: close it (app_snapshot, then tap its close button) before the next shot.' : ''));
  }));

  server.registerTool('video_capture_tap', {
    description: 'Capture an interaction: the current screen, a tap on an element (animated finger + ripple in the video) and the screen it leads to.',
    inputSchema: {
      ref: z.string().optional(), text: z.string().optional(), testID: z.string().optional(),
      name: z.string().optional().describe('name for the screen before the tap'),
    },
  }, wrap(async ({ name, ...target }) => {
    const { before, after } = await captureTap(hub, project, target, { name });
    return text(describeAsset(before) + '\n' + describeAsset(after));
  }));

  server.registerTool('video_plan', {
    description: 'Build the video timeline from all captured screens: intro, one scene per screen with automatic timing, zooms, scroll speed-ups and captions, then an outro. Replaces the current timeline.',
    inputSchema: {
      targetSeconds: z.number().optional().describe('desired total length'),
      format: z.enum(['landscape', 'portrait', 'square']).optional(),
      appName: z.string().optional(), tagline: z.string().optional(), cta: z.string().optional(),
    },
  }, wrap(async ({ targetSeconds, ...settings }) => {
    if (!project.data.order.length) throw new Error('nothing captured yet; use video_capture first');
    const ops = [];
    if (Object.keys(settings).length) ops.push({ op: 'settings', ...settings });
    ops.push({ op: 'plan', targetSeconds });
    project.applyOps(ops, 'plan');
    return text(summary(project.data) + `\nStudio: ${studio.url}`);
  }));

  server.registerTool('video_timeline', {
    description: 'Show the current video timeline (compact).',
    inputSchema: {},
  }, wrap(async () => text(summary(project.data))));

  server.registerTool('video_edit', {
    description: [
      'Edit the timeline. ops is a list of:',
      '{op:"update", scene, duration?, speed?, title?, subtitle?, transition?("slide"|"fade"|"zoom"|"rise"|"none"), focus?(element label | {x,y,w,h} dp | null), zoom?(1-3), zoomTimes?([inStart,inEnd,outStart,outEnd] recording seconds, for recordings), scroll?(0-1 | false), callouts?, popouts?}',
      '{op:"move", scene, to(number|"first"|"last") | before | after} · {op:"remove", scene} · {op:"add", asset, at?} · {op:"drop", asset} (discard a bad capture)',
      '{op:"settings", format?, appName?, tagline?, cta?, captionSide?("left"|"right"), sound?{sfx: bool, volume: 0-1}, theme?{accent, bg:[c1,c2]}} · {op:"plan", targetSeconds?}',
      'scene = id ("s3"), 1-based position, or a screen name/route ("dashboard").',
    ].join('\n'),
    inputSchema: { ops: z.array(z.object({ op: z.string() }).passthrough()).min(1) },
  }, wrap(async ({ ops }) => {
    const done = project.applyOps(ops, 'agent');
    return text(done.join('; ') + '\n' + summary(project.data));
  }));

  server.registerTool('video_studio', {
    description: 'Open the studio in the browser: live preview, timeline, per-scene controls and a prompt box where the user can type edits.',
    inputSchema: { open: z.boolean().optional().describe('open the browser (default true)') },
  }, wrap(async ({ open }) => text('Studio: ' + (open === false ? studio.url : studio.open()))));

  server.registerTool('video_render', {
    description: 'Render the video to MP4 (in the studio tab, opening it if needed) and return the file path.',
    inputSchema: {},
  }, wrap(async () => {
    if (!project.data.scenes.length) throw new Error('timeline is empty; run video_plan first');
    const r = await studio.requestRender();
    return text(`Rendered ${r.file} (${(r.bytes / 1048576).toFixed(1)} MB${r.seconds ? ', ' + r.seconds.toFixed(1) + 's' : ''})`);
  }));

  server.registerTool('video_wait_for_prompt', {
    description: 'Wait for the user to type an edit request in the studio prompt box (ones the studio could not apply itself). Apply it with video_edit, answer with video_reply, then call this again to keep collaborating.',
    inputSchema: { timeoutSeconds: z.number().int().optional().describe('default 600') },
  }, wrap(async ({ timeoutSeconds }) => {
    const p = await studio.waitForPrompt((timeoutSeconds || 600) * 1000);
    if (!p) return text('No request yet (timed out). Call again to keep waiting.');
    const where = p.view ? `\nThey were looking at scene #${p.view.position} ${p.view.scene} "${p.view.title}" at ${p.view.time}s of the video ("this" means that scene).` : '';
    return text(`User asked: ${p.text}${where}\n\nTimeline:\n${summary(project.data)}`);
  }));

  server.registerTool('video_reply', {
    description: 'Show a short message to the user in the studio chat.',
    inputSchema: { text: z.string() },
  }, wrap(async ({ text: t }) => { studio.say('agent', t); return text('Sent.'); }));

  await server.connect(new StdioServerTransport());
  log(`MCP server ready (v${VERSION}); project in ${dir}`);
  const shutdown = () => { hub.close(); studio.close(); process.exit(0); };
  process.stdin.on('close', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
