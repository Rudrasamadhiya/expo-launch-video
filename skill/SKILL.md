---
name: launch-video
description: Direct and produce a professional launch / promo video of the running Expo app with the launch-video MCP tools - live screen recordings from the phone, kinetic captions, pop-up callouts, break-out pop-outs, studio collaboration and MP4 render. Use when asked for a launch video, promo video, app trailer, store video or reel.
---

# Directing a launch video

You are the director, editor and copywriter. The tools shoot real footage from the phone; your job is the story, the selection and the words.

## 1. Plan the story before shooting (30–60 s)
Hook → the problem it solves → 4–7 hero features → proof → call to action.
Pick the screens that *show* each beat. Skip settings, legal, empty states and screens full of personal data.

## 2. Shoot (all footage is real, from the phone)
- `app_status` first. If logged-out screens are wanted, ask the user to log out/in themselves (native dialogs and passwords are theirs).
- **Pages:** `video_record {route, seconds: 6–8, scroll: true}`. Recording starts before the page opens, so loaders and entrance animations are on camera; it holds, then scrolls.
- **Signature interactions:** `video_record {seconds: 6, tap: "<button text>", tapAt: 1}` on the current page. The tapped element becomes a **hero pop-out** automatically; a panel/modal that opens becomes a **side-by-side pop-out**.
- After a take that opens a modal, close it before the next shot (the tool warns you).
- Check a take by looking at one frame file if unsure; `video_edit {op:"drop"}` bad takes and reshoot.
- If content doesn't load (empty lists), check `app_logs`/`app_network` before shooting around it.

## 3. Assemble
`video_plan {targetSeconds, format}` (landscape for stores/YouTube, portrait for Reels/Shorts), then refine with one `video_edit` call:
- **Order** scenes to follow the story; remove weak ones.
- **Captions:** title ≤ 5 words, benefit-led ("Know where you stand", not "Analytics screen"). Subtitle ≤ 14 words, concrete. Never the user's personal name or data.
- **Pop-up callouts** (`callouts: [{value, label}]`): 1–2 per scene, real numbers or crisp facts from the screen ("130k+ · Questions"). `callouts: "auto"` derives them from the screen.
- **Break-outs** (`popouts`): `"auto"` from taps/modals, or explicit `{style:"hero", at, hold, rect, label}` / `{style:"side", at, hold}` (times in recording seconds). Use at most one hero per 3 scenes so it stays special.
- **Pacing:** 3–6 s per scene on screen. Long scrolls 1.4–1.7×; scenes with break-outs ≤ 1.2× so they breathe. Use `transition: "zoom"` (accent wipe) for chapter changes, `slide` otherwise.
- Intro/outro come from `appName`, `tagline`, `cta` settings.

## 4. Collaborate in the studio
`video_studio` opens the editor: live preview, timeline (drag to reorder/resize), per-scene inspector, prompt box. Then loop:
`video_wait_for_prompt` → apply with `video_edit` → `video_reply` a one-line summary → wait again. Common edits typed by the user are applied by the studio itself.

## 5. Deliver
`video_render` → MP4 path. Offer a portrait cut (`video_edit {op:"settings", format:"portrait"}` then render again) for social.

## Keep it cheap
`video_timeline` is the whole plan in a few lines; don't screenshot to review — read the timeline and spot-check a frame file.
