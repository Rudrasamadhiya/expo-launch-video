# Changelog

## 0.1.2

- Listed in the official MCP Registry as `io.github.Rudrasamadhiya/expo-launch-video` (adds `mcpName` to package.json and a `server.json`).
- Depends on expo-mcp-bridge ^0.3.2.
- No code changes.

## 0.1.1

- Docs and package page: new README with banner and clearer sections; homepage now points to the documentation site.
- Depends on expo-mcp-bridge ^0.3.1.
- No code changes.

## 0.1.0

First release.

- MCP server `expo-launch-video`: every expo-mcp-bridge `app_*` tool plus `video_record`, `video_capture`, `video_capture_tap`, `video_plan`, `video_edit`, `video_timeline`, `video_studio`, `video_wait_for_prompt`, `video_reply`, `video_render`.
- Live screen recordings from the phone (page loads, smooth scrolls, taps, modals as overlays) and full-page scroll captures.
- Director: timing, zooms on stat rows / buttons / headlines, scroll speed-ups, captions, pop-up chips, hero and side-by-side pop-outs.
- Renderer: phone mockup, camera zooms (incl. timed zooms), in-phone transitions, kinetic typography, glass callouts, light sweeps, accent wipes, animated intro/outro; 16:9, 9:16, 1:1; caption side.
- Sound design: synthesized pops, clicks, whooshes and chimes timed to the animations.
- Studio: live preview, timeline, inspector, prompt box (local parser, Claude when credentials exist, or the agent), MP4 export with Mediabunny.
- Directing skill + `AGENTS.md` playbook; `AI_SETUP.md` one-shot setup.
