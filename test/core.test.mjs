import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Project, summary, timeline } from '../server/project.mjs';
import { findTitle, findFocus, autoScene, plan } from '../server/director.mjs';
import { parsePrompt, resolveRelative } from '../server/prompt.mjs';

// Modeled on a real dashboard capture: greeting + name, stat row, a list that scrolls.
const dashboard = {
  route: '/dashboard', dpW: 360, dpH: 720, file: 'a.jpg', w: 360, h: 720,
  elements: [
    { role: 'text', label: 'Good afternoon,', x: 88, y: 52, w: 120, h: 18, fontSize: 14 },
    { role: 'text', label: 'Aarav Sharma', x: 88, y: 72, w: 180, h: 30, fontSize: 24 },
    { role: 'text', label: '51%', x: 40, y: 168, w: 40, h: 22, fontSize: 18 },
    { role: 'text', label: 'Top 42%', x: 110, y: 168, w: 70, h: 22, fontSize: 18 },
    { role: 'text', label: '4', x: 215, y: 168, w: 12, h: 22, fontSize: 18 },
    { role: 'text', label: '7h 1m', x: 285, y: 168, w: 50, h: 22, fontSize: 18 },
    { role: 'text', label: 'Progress', x: 30, y: 194, w: 60, h: 14, fontSize: 11 },
    { role: 'text', label: 'Rank', x: 125, y: 194, w: 40, h: 14, fontSize: 11 },
    { role: 'button', label: 'Continue practicing', x: 16, y: 236, w: 328, h: 88 },
    { role: 'scroll', label: '', x: 0, y: 0, w: 360, h: 720, contentH: 2100 },
  ],
  scroll: { file: 'a-scroll.jpg', w: 360, h: 2100, viewport: { x: 0, y: 0, w: 360, h: 720 }, contentH: 2100 },
};
const analytics = {
  route: '/analytics', dpW: 360, dpH: 720,
  elements: [
    { role: 'text', label: 'ANALYTICS', x: 16, y: 50, w: 80, h: 14, fontSize: 11 },
    { role: 'text', label: 'Performance Insights', x: 16, y: 68, w: 250, h: 30, fontSize: 24 },
    { role: 'text', label: 'Track your progress and spot what to improve next.', x: 16, y: 100, w: 320, h: 18, fontSize: 13 },
    { role: 'button', label: 'Start a mock test', x: 16, y: 600, w: 328, h: 48 },
  ],
};

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elv-'));
  const p = new Project(dir);
  p.data.settings.appName = 'StudyApp';
  p.data.settings.tagline = "India's most realistic JEE platform";
  p.addAsset(dashboard);
  p.addAsset(analytics);
  p.applyOps([{ op: 'plan' }]);
  return p;
}

test('title skips the greeting and the user name after it', () => {
  assert.equal(findTitle(dashboard), 'Dashboard');
  assert.equal(findTitle(analytics), 'Performance Insights');
});

test('focus finds the stats row, then a big CTA', () => {
  const f = findFocus(dashboard);
  assert.match(f.reason, /stats row \(51%, Top 42%, 4, 7h 1m\)/);
  assert.ok(f.rect.y < 168 && f.rect.y + f.rect.h > 194 + 14, 'includes the labels under the numbers');
  assert.match(findFocus(analytics).reason, /button "Start a mock test"/);
});

test('long scrolls are sped up, short screens are not', () => {
  const s = autoScene({ ...dashboard, id: 'a1' });
  assert.equal(s.speed, 1.4);
  assert.ok(s.scroll && s.scroll.to > 0 && s.scroll.to <= 1);
  assert.ok(s.zoom >= 1.25 && s.zoom <= 2.2);
  const s2 = autoScene({ ...analytics, id: 'a2' });
  assert.equal(s2.speed, 1);
  assert.equal(s2.scroll, null);
});

test('plan: intro, screens, outro; target length is respected', () => {
  const p = tmpProject();
  assert.deepEqual(p.data.scenes.map((s) => s.kind), ['intro', 'screen', 'screen', 'outro']);
  assert.equal(p.data.scenes[0].caption.title, 'StudyApp');
  p.applyOps([{ op: 'plan', targetSeconds: 12 }]);
  assert.ok(Math.abs(p.totalSeconds() - 12) < 1.2, `total ${p.totalSeconds()}`);
});

test('ops: update, move, remove, add, settings', () => {
  const p = tmpProject();
  p.applyOps([{ op: 'update', scene: 'dashboard', duration: 5, speed: 2, title: 'Your day at a glance' }]);
  const d = p.findScene('dashboard');
  assert.equal(d.duration, 5); assert.equal(d.speed, 2); assert.equal(d.caption.title, 'Your day at a glance');
  p.applyOps([{ op: 'update', scene: 'analytics', focus: 'Performance Insights' }]);
  assert.equal(p.findScene('analytics').focus.label, 'Performance Insights');
  p.applyOps([{ op: 'move', scene: 'analytics', to: 2 }]);
  assert.equal(p.data.scenes[1].asset, p.findAsset('/analytics').id);
  p.applyOps([{ op: 'remove', scene: 'dashboard' }]);
  assert.throws(() => p.findScene('dashboard'), /no scene/);
  p.applyOps([{ op: 'add', asset: 'dashboard' }]);
  assert.equal(p.data.scenes.at(-2).asset, p.findAsset('/dashboard').id, 'added before the outro');
  p.applyOps([{ op: 'settings', format: 'portrait', cta: 'Get it on Google Play' }]);
  assert.equal(p.findScene('outro').caption.title, 'Get it on Google Play');
  assert.throws(() => p.applyOps([{ op: 'settings', format: 'wide' }]), /format/);
});

test('timeline overlaps scenes and summary is compact', () => {
  const p = tmpProject();
  const tl = timeline(p.data);
  assert.ok(tl.items[1].start < tl.items[0].end, 'scenes overlap for transitions');
  const s = summary(p.data);
  assert.match(s, /^landscape 1920x1080 · 30fps · [\d.]+s · 4 scenes/);
  assert.match(s, /\/dashboard [\d.]+s \(\S+ @1\.4x\) rise "Dashboard"/);
  assert.match(s, /zoom [\d.]+x on "51% · Top 42% · 4 · 7h 1m"/);
  assert.ok(s.length < 900, `summary is short (${s.length} chars)`);
});

test('prompt parser understands common edits', () => {
  const cases = {
    'make dashboard 4s': [{ op: 'update', scene: 'dashboard', duration: 4 }],
    'Speed up analytics 2x': [{ op: 'update', scene: 'analytics', speed: 2 }],
    'slow down the 2nd scene': [{ op: 'update', scene: 2, speed: 0.75 }],
    'remove pricing': [{ op: 'remove', scene: 'pricing' }],
    'move settings to 3': [{ op: 'move', scene: 'settings', to: 3 }],
    'move faq after help': [{ op: 'move', scene: 'faq', after: 'help' }],
    'zoom on Log In in login': [{ op: 'update', scene: 'login', focus: 'Log In' }],
    'no zoom on dashboard': [{ op: 'update', scene: 'dashboard', focus: null, zoom: 1 }],
    'no scroll on mistakes': [{ op: 'update', scene: 'mistakes', scroll: false }],
    'title dashboard: Your day at a glance': [{ op: 'update', scene: 'dashboard', title: 'Your day at a glance' }],
    'portrait': [{ op: 'settings', format: 'portrait' }],
    'make it 30 seconds': [{ op: 'plan', targetSeconds: 30 }],
    'fade transition on analytics': [{ op: 'update', scene: 'analytics', transition: 'fade' }],
    'cta: Get it on Google Play': [{ op: 'settings', cta: 'Get it on Google Play' }],
    'color #7c3aed': [{ op: 'settings', theme: { accent: '#7c3aed', bg: ['#7c3aed', '#0f0f1a'] } }],
    'mute': [{ op: 'settings', sound: { sfx: false } }],
    'sound on': [{ op: 'settings', sound: { sfx: true } }],
    'volume 60%': [{ op: 'settings', sound: { volume: 0.6 } }],
    'text on the right': [{ op: 'settings', captionSide: 'right' }],
  };
  for (const [input, want] of Object.entries(cases)) assert.deepEqual(parsePrompt(input), want, input);
  assert.equal(parsePrompt('make the intro feel more exciting and premium'), null, 'free-form goes to the AI');
});

test('relative edits resolve against the project', () => {
  const p = tmpProject();
  const before = p.findScene('analytics').duration;
  const ops = resolveRelative(parsePrompt('make analytics shorter'), p);
  p.applyOps(ops);
  assert.equal(p.findScene('analytics').duration, Math.round(before * 0.75 * 10) / 10);
});
