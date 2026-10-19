# Contributing

```bash
git clone https://github.com/Rudrasamadhiya/expo-launch-video
cd expo-launch-video
npm install
npm test
```

## Layout
| Path | What |
|---|---|
| `server/mcp.mjs` | MCP server: `app_*` tools from expo-mcp-bridge + `video_*` tools |
| `server/capture.mjs` | Stills, full-page scroll captures, screen recordings |
| `server/director.mjs` | Auto-planning: timing, zooms, captions, callouts, pop-outs |
| `server/project.mjs` | Project model and edit operations (`applyOps`) |
| `server/prompt.mjs` | Studio prompt parser (no AI needed) |
| `server/ai.mjs` | Optional Claude edits when Anthropic credentials exist |
| `server/studio-server.mjs` | Studio HTTP server, live events, render hand-off |
| `studio/render.js` · `motion.js` · `audio.js` | Frame renderer, motion graphics, sound design (shared by preview and export) |
| `studio/studio.js` | The editor UI and MP4 export |

The renderer is a pure function of time — keep it that way so preview and export always match.

## Trying changes in a real app
```bash
npm pack            # in this repo (and in expo-mcp-bridge if you changed it)
cd ../your-expo-app
npm i --no-save ../expo-launch-video/expo-launch-video-<version>.tgz
npx expo start --clear
```

## Releasing
Bump `version` in `package.json`, add a `CHANGELOG.md` entry, `npm test && npm publish`, tag `v<version>`.
