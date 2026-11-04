# Changelog

## 0.1.3

- **The phone moves between scenes.** New per-scene `side` (`"left"` / `"right"`, landscape): when it changes, the phone glides across the frame with a slight dip and lean, and the new caption sweeps in over it before settling. `video_plan` alternates sides automatically; set or clear it with `video_edit {op:"update", scene, side}`. The timeline summary shows `text left/right`.
- **Light themes look right.** Pale backgrounds (e.g. `bg: ["#FAF7E8", "#EADFC0"]`) now get warm white highlights instead of an accent wash, dark ink captions and subtitles (from `theme.text`), a soft warm vignette instead of black, and an accent-filled call-to-action pill.

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
