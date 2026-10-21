<p align="center">
  <a href="https://rudrasamadhiya.github.io/expo-agent-kit/docs/video/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Rudrasamadhiya/expo-launch-video/main/.github/assets/banner-dark.svg">
      <img alt="expo-launch-video — your AI agent shoots and edits a launch video of your app, live" src="https://raw.githubusercontent.com/Rudrasamadhiya/expo-launch-video/main/.github/assets/banner-light.svg" width="100%">
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/expo-launch-video"><img alt="npm version" src="https://img.shields.io/npm/v/expo-launch-video?style=flat-square&labelColor=0b0b0b&color=ff2da8"></a>
  <a href="https://github.com/Rudrasamadhiya/expo-launch-video/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Rudrasamadhiya/expo-launch-video/ci.yml?branch=main&style=flat-square&labelColor=0b0b0b&label=CI"></a>
  <a href="https://www.npmjs.com/package/expo-launch-video"><img alt="node" src="https://img.shields.io/node/v/expo-launch-video?style=flat-square&labelColor=0b0b0b&color=cbb3e8"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/npm/l/expo-launch-video?style=flat-square&labelColor=0b0b0b&color=e34234"></a>
</p>

<p align="center">
  <a href="https://rudrasamadhiya.github.io/expo-agent-kit/"><b>Website</b></a> ·
  <a href="https://rudrasamadhiya.github.io/expo-agent-kit/docs/video/"><b>Docs</b></a> ·
  <a href="https://rudrasamadhiya.github.io/expo-agent-kit/docs/video/studio/"><b>The studio</b></a> ·
  <a href="https://rudrasamadhiya.github.io/expo-agent-kit/docs/video/tools/"><b>Tools reference</b></a> ·
  <a href="CHANGELOG.md"><b>Changelog</b></a>
</p>

---

**expo-launch-video** lets your AI agent shoot and edit a launch video of your Expo app — live from your phone. Ask Claude Code, Antigravity or Cursor for a video; it records the real app (page loads, scrolling, taps, panels opening), picks the best takes, writes the captions and cuts a polished video with motion graphics, break-out pop-outs and sound. Then it opens a studio where you tweak the result by dragging, or just by **typing what you want**. Export is a real **1080p MP4**, rendered in your browser. No After Effects, no ffmpeg, no screen-recording app.

> *"Make a 45 second launch video of the app: landing, login, dashboard, the question bank and one exam. Captions should sell the benefits."*

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Features](#features)
- [How a video gets made](#how-a-video-gets-made)
- [Common questions](#common-questions)
- [Tools](#tools)
- [The studio](#the-studio)
- [CLI and environment](#cli-and-environment)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Requirements](#requirements)
- [Related](#related)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
npx expo install expo-mcp-bridge react-native-view-shot
npm install --save-dev expo-launch-video
npx expo-launch-video init
```

`init` writes `.mcp.json` with a **`launch-video`** server — it includes every `app_*` tool from [expo-mcp-bridge](https://github.com/Rudrasamadhiya/expo-mcp-bridge), so one server does both — plus the directing skill for Claude Code (`.claude/skills/launch-video`), the same playbook in `AGENTS.md` for Antigravity, Cursor and others, and a `.gitignore` entry for the project folder.

## Quick start

**The one-shot way.** Paste this into your agent inside your Expo project:

```text
Read https://raw.githubusercontent.com/Rudrasamadhiya/expo-launch-video/main/AI_SETUP.md and set up app control and launch videos in this project.
```

**By hand:**

1. Install the packages and run `init` (above).
2. Mount the bridge once in your root layout:

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

3. Run `npx expo start` and open the app on your phone (same Wi-Fi).
4. Restart your agent and ask for a video.

On Windows the MCP config uses `"command": "cmd", "args": ["/c", "npx", "expo-launch-video"]`.

## Features

- **Real footage from the phone.** Screen recordings at about 10–15 fps captured in-app: page loads and animations on camera, smooth scrolls from full-page captures, taps mid-take.
- **Auto-directed.** A director plans timing, zooms into stat rows and buttons, speeds up long scrolls, and writes captions and pop-up chips from the real numbers on screen.
- **Motion graphics.** Kinetic typography, glass callouts, light sweeps, accent wipes, and an animated intro and outro with a logo burst and a pulsing call to action.
- **Break-out pop-outs.** A tapped card lifts off the phone to center stage; a panel that opens springs out into a side-by-side layout.
- **Sound design.** Synthesized pops, clicks, whooshes and chimes timed to every animation, mixed into an AAC track in the MP4.
- **Prompt the studio.** *"speed up analytics 2x"*, *"text on the right"*, *"zoom into the Start button"*. Simple edits apply instantly; anything else goes to your agent, which edits the video live.
- **Every format.** 16:9 for stores and YouTube, 9:16 for Reels and Shorts, 1:1 for feeds.

## How a video gets made

```text
1. Shoot    video_record {route:"/dashboard", seconds:8, scroll:true}    live from the phone
            video_record {tap:"My Analytics", seconds:6}                  tap → hero / side pop-out
2. Plan     video_plan {targetSeconds:45, format:"landscape"}             timing, zooms, captions, chips
3. Direct   video_edit [{op:"update", scene:"dashboard", title:"…"}]      refine any scene
4. Studio   video_studio  →  you drag, trim and type prompts              video_wait_for_prompt / video_reply
5. Render   video_render  →  launch-video/out/launch-landscape.mp4
```

## Common questions

### How do I make an App Store preview video of my Expo app with AI?

Install this package next to expo-mcp-bridge, run `npx expo-launch-video init`, open the app on your phone and ask your agent: *"Make a 30 second App Store preview, portrait."* It records the real app, plans the video and opens a studio; export gives you a 1080p MP4.

### Can Claude Code or Cursor make a promo video of my React Native app?

Yes, any MCP agent can. The agent records page loads, scrolls and taps live from the phone, writes captions from the real content on screen, and adds zooms, pop-outs, motion graphics and sound.

### Do I need a screen recorder or a video editor?

No. Recording happens inside the app through expo-mcp-bridge, editing happens in a browser studio you can drag or prompt (*"speed up analytics 2x"*), and the MP4 is rendered in Chrome or Edge.

### Which formats can it export?

16:9 for YouTube and websites, 9:16 for App Store and Play Store previews, Reels, Shorts and TikTok, and 1:1 for social feeds.

## Tools

In addition to every `app_*` tool from expo-mcp-bridge. Full parameters are in the [tools reference](https://rudrasamadhiya.github.io/expo-agent-kit/docs/video/tools/).

| Tool | Description |
| --- | --- |
| `video_record` | Screen-record the phone: open the page on camera, hold while it loads, scroll — or tap mid-take |
| `video_capture` | High-resolution stills and full-page scroll captures for one or many routes |
| `video_capture_tap` | Before / tap / after stills of an interaction |
| `video_plan` | Auto-plan the whole timeline from the captures |
| `video_edit` | Edit scenes: order, duration, speed, captions, chips, zooms (including timed zooms), pop-outs, transitions, format, caption side, theme, sound |
| `video_timeline` | The whole plan in a few lines |
| `video_studio` | Open the studio in the browser |
| `video_wait_for_prompt` | Wait for what the user types in the studio |
| `video_reply` | Answer the user in the studio after an edit |
| `video_render` | Export the MP4 and return its path |

## The studio

A browser editor with live preview, a drag-to-reorder and drag-to-resize timeline, a per-scene inspector (captions, duration, speed, transitions, draw a zoom area, scroll amount), video settings (format, caption side, colors from your app, sound) and a prompt box. It understands common edits on its own:

```text
make dashboard 4s · speed up analytics 2x · slow down the 3rd scene · remove pricing
move faq after help · zoom on Log In in login · no zoom on dashboard · scroll mistakes 60%
title dashboard: Your day at a glance · fade transition on analytics · portrait · square
text on the right · make it 30 seconds · cta: Get it on Google Play · color #7c3aed · mute · volume 60%
```

With `ANTHROPIC_API_KEY` set (or an `ant auth login` profile), free-form requests go straight to Claude (`claude-opus-5-5`); otherwise they go to your agent through `video_wait_for_prompt`. Prompts carry the scene you have selected, so *"fix this"* means that scene.

Reopen a project without an agent with `npx expo-launch-video studio`.

## CLI and environment

```bash
npx expo-launch-video init      # .mcp.json ("launch-video" server), skills, AGENTS.md, .gitignore
npx expo-launch-video studio    # reopen the studio for ./launch-video (edit, preview, export)
npx expo-launch-video           # run the MCP server (your agent starts this for you)
npx expo-launch-video --help
```

| Variable | Default | Description |
| --- | --- | --- |
| `EXPO_MCP_PORT` | `8347` | Port the phone connects to (shared with expo-mcp-bridge) |
| `LAUNCH_VIDEO_PORT` | `8790` | Studio web server (the next free port if taken) |
| `LAUNCH_VIDEO_DIR` | `./launch-video` | Where captures, `project.json` and renders live |
| `LAUNCH_VIDEO_AI` | on | `off` sends studio prompts to your agent instead of the Claude API |
| `LAUNCH_VIDEO_MODEL` | `claude-opus-5-5` | Model for direct studio edits (needs Anthropic credentials) |

## Project structure

```text
server/       MCP server, director (auto-planning), capture and recording, studio server,
              prompt parser, optional Claude edits
studio/       the editor (vanilla JS): renderer, motion graphics, sound design,
              MP4 export (Mediabunny / WebCodecs)
skill/        the directing playbook installed by init
AI_SETUP.md   one-shot setup guide an AI agent can follow
```

Projects live in `launch-video/` inside your app (captures, `project.json`, renders in `out/`); `init` adds the folder to `.gitignore`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| The render dialog never finishes | Keep the studio tab visible; exports use the browser's hardware encoder (Chrome or Edge). |
| A page capture shows an old screen | Update both packages — captures use the visible screen view. |
| Lists are empty in recordings | The app may need dev environment variables (for example `EXPO_PUBLIC_*` set only in `eas.json`); start Metro with them set. |
| A panel covers later takes | Close modals between takes — `video_record` warns you when one is still open. |
| Anything else | See the [expo-mcp-bridge troubleshooting](https://github.com/Rudrasamadhiya/expo-mcp-bridge#troubleshooting) table. |

## Requirements

- Node.js 20 or newer
- An Expo app with `expo-mcp-bridge` mounted
- Chrome or Edge for export (WebCodecs H.264 + AAC)

## Related

- [**expo-mcp-bridge**](https://github.com/Rudrasamadhiya/expo-mcp-bridge) — the app-control layer this package builds on.
- [**Expo Agent Kit**](https://rudrasamadhiya.github.io/expo-agent-kit/) — the website and full documentation for both libraries.

## Contributing

```bash
npm install
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

[MIT](LICENSE) © Rudra Samadhiya

Exports are muxed with [Mediabunny](https://mediabunny.dev) (MPL-2.0).
