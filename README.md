# expo-launch-video

[![npm](https://img.shields.io/npm/v/expo-launch-video)](https://www.npmjs.com/package/expo-launch-video)
[![CI](https://github.com/Rudrasamadhiya/expo-launch-video/actions/workflows/ci.yml/badge.svg)](https://github.com/Rudrasamadhiya/expo-launch-video/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/expo-launch-video)](LICENSE)

**Your AI agent shoots and edits a launch video of your Expo app — live from your phone.**

Ask Claude Code, Antigravity or Cursor *"make a 30 second launch video of my app"*. It records your real app on your phone (page loads, scrolling, taps, panels opening), picks the best takes, writes the captions, and cuts a polished video with motion graphics, break-out pop-outs and sound — then opens a studio where you tweak it by dragging or just **typing what you want**. Export is a real **1080p MP4**, rendered in your browser. No After Effects, no ffmpeg, no screen-recording app.

- 🎥 **Real footage from the phone** — screen recordings at ~10–15 fps captured in-app, page loads and animations on camera, smooth scrolls from full-page captures.
- 🧠 **Auto-directed** — a director plans timing, zooms into stat rows and buttons, speeds up long scrolls, writes captions and pop-up chips from the real numbers on screen.
- ✨ **Motion graphics** — kinetic typography, glass pop-up callouts, light sweeps, accent wipes, animated intro/outro with logo burst and pulsing CTA.
- 🚀 **Break-out pop-outs** — a tapped card lifts off the phone to center stage; a panel that opens springs out into a side-by-side layout.
- 🔊 **Sound design** — synthesized pops, clicks, whooshes and chimes timed to every animation (AAC track in the MP4).
- 💬 **Prompt the studio** — *"speed up analytics 2x"*, *"text on the right"*, *"zoom into the Start button"*. Simple edits apply instantly; anything else goes to your AI agent, which edits the video live.
- 📐 **16:9, 9:16, 1:1** — store/YouTube, Reels/Shorts, feeds.

Includes everything from [**expo-mcp-bridge**](https://github.com/Rudrasamadhiya/expo-mcp-bridge) (the agent can also tap, type, read logs… in the same session).

---

## 🚀 Quick start

### Option A — let your AI do it (one shot)
Paste this to your agent inside your Expo project:

> Read https://raw.githubusercontent.com/Rudrasamadhiya/expo-launch-video/main/AI_SETUP.md and set up app control and launch videos in this project.

### Option B — by hand
```bash
npx expo install expo-mcp-bridge react-native-view-shot
npm install --save-dev expo-launch-video
npx expo-launch-video init
```
Mount the bridge in your root layout (`app/_layout.tsx`):
```tsx
import { Stack, router } from 'expo-router';
import { AgentBridge } from 'expo-mcp-bridge';

export default function RootLayout() {
  return (
    <>
      <Stack />
      <AgentBridge router={router} />
    </>
  );
}
```
Run `npx expo start`, open the app on your phone (same Wi-Fi), restart your agent and ask:

> *"Make a 45 second launch video of the app: landing, login, dashboard, the question bank and one exam. Captions should sell the benefits."*

`init` writes `.mcp.json` (server **`launch-video`**, which includes all `app_*` tools), the **directing skill** for Claude Code (`.claude/skills/launch-video`) and the same playbook in **`AGENTS.md`** for Antigravity, Cursor and others. Windows: `"command": "cmd", "args": ["/c", "npx", "expo-launch-video"]`.

---

## 🎬 How a video gets made

```text
 1. Shoot     video_record {route:"/dashboard", seconds:8, scroll:true}     ← live from the phone
              video_record {tap:"My Analytics", seconds:6}                   ← tap → hero / side pop-out
 2. Plan      video_plan {targetSeconds:45, format:"landscape"}              ← timing, zooms, captions, chips
 3. Direct    video_edit [{op:"update", scene:"dashboard", title:"Your prep at a glance", …}]
 4. Studio    video_studio  →  you drag, trim, type prompts  ⇄  video_wait_for_prompt / video_reply
 5. Render    video_render  →  launch-video/out/launch-landscape.mp4
```

### Tools (in addition to all `app_*` tools)
| Tool | What it does |
|---|---|
| `video_record` | Screen-record the phone: opens the page on camera, holds while it loads, scrolls; or taps mid-take |
| `video_capture` | High-res stills + full-page scroll captures for one or many routes |
| `video_capture_tap` | Before / tap / after stills of an interaction |
| `video_plan` | Auto-plan the whole timeline from the captures |
| `video_edit` | Edit scenes: order, duration, speed, captions, chips, zooms (incl. timed zooms), pop-outs, transitions, format, caption side, theme, sound |
| `video_timeline` | The whole plan in a few lines |
| `video_studio` | Open the studio in the browser |
| `video_wait_for_prompt` / `video_reply` | Collaborate with what the user types in the studio |
| `video_render` | Export the MP4 and return its path |

### The studio
Live preview, drag-to-reorder / drag-to-resize timeline, per-scene inspector (captions, duration, speed, transitions, draw a zoom area, scroll amount), video settings (format, caption side, colors from your app, sound), and the prompt box. It understands common edits on its own:

```text
make dashboard 4s · speed up analytics 2x · slow down the 3rd scene · remove pricing
move faq after help · zoom on Log In in login · no zoom on dashboard · scroll mistakes 60%
title dashboard: Your day at a glance · fade transition on analytics · portrait · square
text on the right · make it 30 seconds · cta: Get it on Google Play · color #7c3aed · mute · volume 60%
```
With `ANTHROPIC_API_KEY` set (or an `ant auth login` profile), free-form requests go to Claude (`claude-opus-5-5`) directly; otherwise they go to your agent via `video_wait_for_prompt`. Prompts carry the scene you have selected, so *"fix this"* means that scene.

Run `npx expo-launch-video studio` to reopen a project without an agent.

---

## 💻 CLI
```bash
npx expo-launch-video init      # in your Expo project: .mcp.json ("launch-video" server), both skills, AGENTS.md, .gitignore
npx expo-launch-video studio    # reopen the studio for ./launch-video without an agent (edit, preview, export)
npx expo-launch-video           # run the MCP server (your agent starts this from .mcp.json)
npx expo-launch-video --help
```
| Environment variable | Default | What |
|---|---|---|
| `EXPO_MCP_PORT` | `8347` | Port the phone connects to (shared with expo-mcp-bridge) |
| `LAUNCH_VIDEO_PORT` | `8790` | Studio web server (next free port if taken) |
| `LAUNCH_VIDEO_DIR` | `./launch-video` | Where captures, `project.json` and renders live |
| `LAUNCH_VIDEO_AI` | on | `off` sends studio prompts to your agent instead of the Claude API |
| `LAUNCH_VIDEO_MODEL` | `claude-opus-5-5` | Model for direct studio edits (needs Anthropic credentials) |

## 🧩 What's in the box
```text
server/   MCP server, director (auto-planning), capture/recording, studio server, prompt parser, optional Claude edits
studio/   the editor (vanilla JS): renderer, motion graphics, sound design, MP4 export (Mediabunny / WebCodecs)
skill/    the directing playbook installed by init
AI_SETUP.md   one-shot setup guide an AI agent can follow
```
Projects live in `launch-video/` in your app (captures, `project.json`, renders in `out/`); `init` adds it to `.gitignore`.

## 🩺 Troubleshooting
| Symptom | Fix |
|---|---|
| Render dialog never finishes | Keep the studio tab visible; exports use the browser's hardware encoder (Chrome / Edge). |
| Screenshots of a page show an old screen | Update both packages — captures now use the visible screen view. |
| Empty lists in recordings | The app may need dev env vars (e.g. `EXPO_PUBLIC_*` only in `eas.json`); start Metro with them set. |
| A panel covers later takes | Close modals between takes (the tool warns you). |
| Everything else | See [expo-mcp-bridge troubleshooting](https://github.com/Rudrasamadhiya/expo-mcp-bridge#-troubleshooting). |

## Requirements
Node ≥ 20 · an Expo app with `expo-mcp-bridge` mounted · Chrome or Edge for export (WebCodecs H.264 + AAC).

## Contributing
`npm install && npm test`. See [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed.
