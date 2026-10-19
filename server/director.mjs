// The director: turns captured screens into a launch-video timeline.
// Decides how long each screen stays up, what to zoom into (stat rows,
// headline numbers, primary buttons), how far to scroll and how fast,
// and writes default captions. Everything here is a default the AI or the
// user can override.

const NUMBER = /^(top\s*)?[₹$€£]?\s*[\d.,]+\s*(%|\+|k\+?|m\+?|x|h(\s*\d+\s*m)?|min|s)?$/i;

export function prettyRoute(route) {
  const last = String(route || '').split('/').filter(Boolean).pop() || 'home';
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const texts = (a) => (a.elements || []).filter((e) => e.role === 'text' && e.label);
const onFirstScreen = (a, e) => e.y >= 0 && e.y + e.h <= (a.dpH || 800) + 4;

/** Screen title: biggest text near the top, skipping greetings and the names after them. */
export function findTitle(a) {
  const top = texts(a).filter((e) => onFirstScreen(a, e) && e.y < (a.dpH || 800) * 0.35 && e.label.length <= 40);
  const skip = new Set();
  top.forEach((e, i) => {
    if (/,\s*$|^(good\s+(morning|afternoon|evening)|hi|hello|welcome back)\b/i.test(e.label)) {
      skip.add(e);
      const next = top[i + 1];
      if (next && next.y - e.y < 60) skip.add(next); // the user's name after "Good afternoon,"
    }
  });
  const candidates = top.filter((e) => !skip.has(e) && (e.fontSize || 0) >= 18 && !NUMBER.test(e.label.trim()));
  candidates.sort((a2, b) => (b.fontSize || 0) - (a2.fontSize || 0) || a2.y - b.y);
  return candidates[0]?.label || a.name || prettyRoute(a.route);
}

export function findSubtitle(a, title) {
  const t = texts(a).find((e) => e.label === title);
  const below = texts(a).filter((e) => onFirstScreen(a, e) && e.label !== title && e.label.length >= 20 && e.label.length <= 90
    && (!t || (e.y > t.y && e.y - t.y < 160)) && !NUMBER.test(e.label));
  return below[0]?.label || '';
}

function union(list, pad = 0) {
  const x = Math.min(...list.map((e) => e.x)) - pad;
  const y = Math.min(...list.map((e) => e.y)) - pad;
  const r = Math.max(...list.map((e) => e.x + e.w)) + pad;
  const b = Math.max(...list.map((e) => e.y + e.h)) + pad;
  return { x, y, w: r - x, h: b - y };
}

/** Most interesting region on the first screen, with a reason. */
export function findFocus(a) {
  const W = a.dpW || 360;
  const H = a.dpH || 800;
  const visible = (a.elements || []).filter((e) => onFirstScreen(a, e) && e.w > 0 && e.h > 0);
  // 1. a row of numbers (stat cards): pick the row with most numbers
  const nums = visible.filter((e) => e.role === 'text' && NUMBER.test(e.label.trim()));
  const rows = [];
  for (const n of nums) {
    const row = rows.find((r) => Math.abs(r.y - n.y) < 10);
    row ? row.items.push(n) : rows.push({ y: n.y, items: [n] });
  }
  const best = rows.filter((r) => r.items.length >= 2).sort((p, q) => q.items.length - p.items.length || (q.items[0].fontSize || 0) - (p.items[0].fontSize || 0))[0];
  if (best) {
    // include the small labels right under the numbers ("Progress", "Rank"…)
    const box = union(best.items);
    const labels = visible.filter((e) => e.role === 'text' && e.y >= box.y + box.h - 2 && e.y < box.y + box.h + 36 && e.x >= box.x - 20 && e.x + e.w <= box.x + box.w + 20);
    const rect = union([...best.items, ...labels], 14);
    return { rect: clampRect(rect, W, H), reason: `stats row (${best.items.map((e) => e.label).join(', ')})`, label: best.items.map((e) => e.label).join(' · ') };
  }
  // 2. a primary call-to-action button
  const cta = visible.filter((e) => e.role === 'button' && e.label && e.label.length >= 3 && e.label.length <= 32 && !/^icon:/.test(e.label) && e.w >= W * 0.5 && e.h >= 36)
    .sort((p, q) => q.w * q.h - p.w * p.h)[0];
  if (cta) return { rect: clampRect({ x: cta.x - 16, y: cta.y - 16, w: cta.w + 32, h: cta.h + 32 }, W, H), reason: `button "${cta.label}"`, label: cta.label };
  // 3. a big headline number or text below the title
  const big = visible.filter((e) => e.role === 'text' && (e.fontSize || 0) >= 22 && e.y > H * 0.12).sort((p, q) => (q.fontSize || 0) - (p.fontSize || 0))[0];
  if (big) return { rect: clampRect({ x: big.x - 20, y: big.y - 20, w: big.w + 40, h: big.h + 40 }, W, H), reason: `headline "${big.label}"`, label: big.label };
  return null;
}

function clampRect(r, W, H) {
  const x = Math.max(0, r.x);
  const y = Math.max(0, r.y);
  return { x, y, w: Math.min(W - x, r.w), h: Math.min(H - y, r.h) };
}

/**
 * The camera zooms the whole phone, so the focus area can grow past the phone's
 * screen width: aim for it to end up ~1.66 screen-widths wide (fits 16:9 and 9:16).
 */
export function zoomFor(rect, a) {
  const W = a.dpW || 360;
  const H = a.dpH || 800;
  return Math.round(Math.max(1.4, Math.min(2.2, (W * 1.66) / rect.w, (H * 0.6) / rect.h)) * 100) / 100;
}

/**
 * Pop-up callouts: the screen's headline numbers paired with the label under
 * each ("130k+" + "Questions"). Skips zeros and duplicates; at most 2.
 */
export function autoCallouts(a) {
  const visible = texts(a).filter((e) => onFirstScreen(a, e));
  const nums = visible.filter((e) => NUMBER.test(e.label.trim()) && !/^0(\.0+)?\s*%?$|^0h\s*0?m?$/i.test(e.label.trim()));
  const out = [];
  for (const n of nums) {
    const label = visible.find((e) => e !== n && !NUMBER.test(e.label.trim()) && e.y >= n.y + n.h - 4 && e.y < n.y + n.h + 40
      && e.x < n.x + n.w + 30 && e.x + e.w > n.x - 30 && e.label.length <= 22);
    if (!label) continue;
    const item = { value: n.label.trim(), label: label.label.trim() };
    if (!out.some((o) => o.label === item.label)) out.push(item);
  }
  // prefer the most impressive-looking numbers (k+, %, larger values)
  const score = (o) => (/k|\+/i.test(o.value) ? 3 : 0) + (/%/.test(o.value) ? 1 : 0) + Math.min(2, parseFloat(o.value.replace(/[^\d.]/g, '')) / 50 || 0);
  return out.sort((x, y) => score(y) - score(x)).slice(0, 2);
}

/**
 * Break-out effects for a recording, in recording seconds:
 *  - hero: the tapped element lifts off the phone to center screen at the tap
 *  - side: a modal panel springs out next to the phone (side-by-side layout)
 */
export function autoPopouts(a) {
  const rec = a.recording;
  if (!rec) return [];
  const out = [];
  if (rec.tap?.rect) out.push({ style: 'hero', at: Math.max(0.1, rec.tap.at - 0.1), hold: 1.1, rect: rec.tap.rect, label: rec.tap.label });
  if (rec.modalAt != null) out.push({ style: 'side', at: rec.modalAt + 0.3, hold: Math.max(1.5, rec.seconds - rec.modalAt - 0.8) });
  return out;
}

/** Default scene for one captured screen. */
export function autoScene(a, settings = {}) {
  const title = findTitle(a);
  const subtitle = findSubtitle(a, title);
  if (a.recording) {
    // a real screen recording plays as-is; long ones are sped up
    const secs = a.recording.seconds;
    const popouts = autoPopouts(a);
    const speed = secs > 5 ? (popouts.length ? 1.2 : 1.5) : 1;
    return {
      kind: 'screen', asset: a.id, duration: Math.round(secs * 10) / 10, speed, transition: 'slide',
      caption: { title, subtitle }, focus: null, zoom: 1, scroll: null, tap: null, recording: true, callouts: autoCallouts(a), popouts,
      notes: `screen recording (${a.recording.action}, ${secs}s at ${a.recording.fps} fps)${speed > 1 ? ', sped up 1.5x' : ''}`,
    };
  }
  const focus = findFocus(a);
  const notes = [];
  let duration = 2.8;
  let speed = 1;
  let scroll = null;
  if (focus) { duration += 1.0; notes.push('zoom: ' + focus.reason); }
  const sc = a.scroll;
  if (sc && sc.contentH > sc.viewport.h * 1.25) {
    const travel = sc.contentH - sc.viewport.h;
    const screens = sc.contentH / sc.viewport.h; // total content, in screens
    scroll = { to: Math.min(1, (sc.viewport.h * 1.6) / travel) };
    duration += Math.min(2.4, 1.2 + (travel / sc.viewport.h) * 0.5);
    if (screens > 2.5) { speed = 1.4; notes.push(`long scroll (${screens.toFixed(1)} screens) sped up 1.4x`); } else notes.push(`scroll ${Math.round(scroll.to * 100)}%`);
  }
  if (a.tap) { duration += 0.8; notes.push(`tap "${a.tap.label || ''}"`); }
  return {
    kind: 'screen',
    asset: a.id,
    duration: Math.round(Math.min(6.5, duration) * 10) / 10,
    speed,
    transition: 'slide',
    caption: { title, subtitle },
    focus: focus ? { ...focus.rect, label: focus.label } : null,
    zoom: focus ? zoomFor(focus.rect, a) : 1,
    scroll,
    tap: a.tap || null,
    callouts: autoCallouts(a),
    notes: notes.join('; '),
  };
}

export function introScene(settings = {}) {
  return { kind: 'intro', duration: 2.6, speed: 1, transition: 'fade', caption: { title: settings.appName || 'Your app', subtitle: settings.tagline || '' } };
}

export function outroScene(settings = {}) {
  return { kind: 'outro', duration: 3, speed: 1, transition: 'fade', caption: { title: settings.cta || 'Download now', subtitle: settings.appName || '' } };
}

/** Full timeline: intro, one scene per captured screen (capture order), outro. */
export function plan(data, { targetSeconds } = {}) {
  const screens = data.order.map((id) => data.assets[id]).filter(Boolean).map((a) => autoScene(a, data.settings));
  screens.forEach((s, i) => { s.transition = i === 0 ? 'rise' : i % 3 === 2 ? 'zoom' : 'slide'; });
  const scenes = [introScene(data.settings), ...screens, outroScene(data.settings)];
  if (targetSeconds) {
    const overlap = 0.45 * (scenes.length - 1);
    const shown = scenes.reduce((n, s) => n + s.duration / s.speed, 0);
    const k = (targetSeconds + overlap) / shown;
    for (const s of scenes) s.duration = Math.round(Math.max(1.6, s.duration * k) * 10) / 10;
  }
  return scenes;
}
