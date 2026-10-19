#!/usr/bin/env node
// expo-launch-video          MCP server for AI agents (includes all expo-mcp-bridge app_* tools)
// expo-launch-video studio   open the studio for an existing project, without an agent
// expo-launch-video init     configure this Expo project
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const cmd = process.argv[2];

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function init() {
  const root = process.cwd();
  if (!readJson(path.join(root, 'package.json'))) {
    console.error('Run this inside your Expo project (no package.json found).');
    process.exit(1);
  }
  const file = path.join(root, '.mcp.json');
  const cfg = readJson(file) || {};
  cfg.mcpServers = cfg.mcpServers || {};
  const replaced = 'expo-app' in cfg.mcpServers;
  delete cfg.mcpServers['expo-app']; // this server already includes every app_* tool on the same phone connection
  cfg.mcpServers['launch-video'] = process.platform === 'win32'
    ? { command: 'cmd', args: ['/c', 'npx', 'expo-launch-video'] }
    : { command: 'npx', args: ['expo-launch-video'] };
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  const skillDst = path.join(root, '.claude', 'skills', 'launch-video', 'SKILL.md');
  fs.mkdirSync(path.dirname(skillDst), { recursive: true });
  fs.copyFileSync(path.join(here, '..', 'skill', 'SKILL.md'), skillDst);
  // the same playbook for other agents (Antigravity, Cursor, Codex…) via AGENTS.md
  const agents = path.join(root, 'AGENTS.md');
  const playbook = fs.readFileSync(path.join(here, '..', 'skill', 'SKILL.md'), 'utf8').replace(/^---[\s\S]*?---\n/, '');
  const section = `<!-- launch-video:start -->\n${playbook.trim()}\n<!-- launch-video:end -->\n`;
  const existing = fs.existsSync(agents) ? fs.readFileSync(agents, 'utf8') : '';
  fs.writeFileSync(agents, existing.includes('<!-- launch-video:start -->')
    ? existing.replace(/<!-- launch-video:start -->[\s\S]*?<!-- launch-video:end -->\n?/, section)
    : (existing ? existing.trimEnd() + '\n\n' : '') + section);
  // this server includes every app_* tool, so install the app-control guide too
  try {
    const bridgeDir = path.dirname(createRequire(path.join(root, 'package.json')).resolve('expo-mcp-bridge/package.json'));
    const controlSrc = path.join(bridgeDir, 'skill', 'SKILL.md');
    const controlDst = path.join(root, '.claude', 'skills', 'expo-app-control', 'SKILL.md');
    fs.mkdirSync(path.dirname(controlDst), { recursive: true });
    fs.copyFileSync(controlSrc, controlDst);
    const guide = fs.readFileSync(controlSrc, 'utf8').replace(/^---[\s\S]*?---\n/, '');
    const sec = `<!-- expo-app-control:start -->\n${guide.trim()}\n<!-- expo-app-control:end -->\n`;
    const cur = fs.readFileSync(agents, 'utf8');
    fs.writeFileSync(agents, cur.includes('<!-- expo-app-control:start -->')
      ? cur.replace(/<!-- expo-app-control:start -->[\s\S]*?<!-- expo-app-control:end -->\n?/, sec)
      : cur.trimEnd() + '\n\n' + sec);
  } catch { /* expo-mcp-bridge not installed yet: the app-control guide comes with its own init */ }
  const gi = path.join(root, '.gitignore');
  if (fs.existsSync(gi) && !fs.readFileSync(gi, 'utf8').includes('launch-video/')) fs.appendFileSync(gi, '\n# expo-launch-video captures and renders\nlaunch-video/\n');
  console.log(`\n✔ expo-launch-video set up
  .mcp.json                              "launch-video" server${replaced ? ' (replaces "expo-app": it includes all app_* tools)' : ''}
  .claude/skills/launch-video/SKILL.md   directing playbook for Claude Code
  .claude/skills/expo-app-control/       app control guide (tap, type, screenshots, logs, keys)
  AGENTS.md (launch-video section)       the same playbook for Antigravity, Cursor and other agents

• The app needs <AgentBridge /> from expo-mcp-bridge (see its README) and react-native-view-shot.
• Restart your agent, then ask: "make a 30 second launch video of the app".\n`);
}

if (cmd === 'init') init();
else if (cmd === 'studio') {
  const { Project } = await import('./project.mjs');
  const { Studio } = await import('./studio-server.mjs');
  const dir = process.env.LAUNCH_VIDEO_DIR || path.join(process.cwd(), 'launch-video');
  const studio = new Studio(new Project(dir), { log: (m) => console.log(m) });
  await studio.start();
  console.log('Opening', studio.open(), '(Ctrl+C to stop)');
} else if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
  console.log('expo-launch-video          MCP server for AI agents\nexpo-launch-video studio   open the studio for ./launch-video\nexpo-launch-video init     configure this Expo project');
} else {
  const { startServer } = await import('./mcp.mjs');
  await startServer();
}
