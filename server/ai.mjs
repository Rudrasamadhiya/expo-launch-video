// Optional: lets the studio's prompt box use Claude directly when Anthropic
// credentials are available (ANTHROPIC_API_KEY, or an `ant auth login`
// profile). Without credentials, prompts the local parser can't handle are
// sent to the user's AI agent through the video_wait_for_prompt MCP tool.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { summary } from './project.mjs';

const MODEL = process.env.LAUNCH_VIDEO_MODEL || 'claude-opus-5-5';

const Op = z.object({
  op: z.enum(['update', 'move', 'remove', 'add', 'settings', 'plan']),
  scene: z.string().nullable().describe('scene id ("s3"), 1-based position, or screen name/route'),
  asset: z.string().nullable().describe('captured screen id or route, for "add"'),
  to: z.string().nullable().describe('new position for "move": a number, "first" or "last"'),
  duration: z.number().nullable().describe('seconds before speed is applied'),
  speed: z.number().nullable().describe('playback speed, 1 = normal, 2 = twice as fast'),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  transition: z.enum(['slide', 'fade', 'zoom', 'rise', 'none']).nullable(),
  focus: z.string().nullable().describe('label of an element on that screen to zoom into, or "none"'),
  zoom: z.number().nullable().describe('zoom amount 1-3'),
  scroll: z.number().nullable().describe('how far to scroll, 0-1 (0 = no scroll)'),
  format: z.enum(['landscape', 'portrait', 'square']).nullable(),
  appName: z.string().nullable(),
  tagline: z.string().nullable(),
  cta: z.string().nullable(),
  accent: z.string().nullable().describe('hex brand color'),
  targetSeconds: z.number().nullable().describe('for "plan": desired total length'),
});
const Edit = z.object({
  reply: z.string().describe('one short sentence to the user about what changed'),
  ops: z.array(Op),
});

let client = null;
let disabled = process.env.LAUNCH_VIDEO_AI === 'off';

/** False once we know there are no usable credentials (credentials resolve on the first request). */
export function aiAvailable() {
  if (disabled) return false;
  if (!client) client = new Anthropic();
  return true;
}

function isAuthProblem(err) {
  return err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError
    || /authentication|api key|credentials/i.test(String(err && err.message));
}

function toOps(raw) {
  return raw.map((o) => {
    const op = {};
    for (const [k, v] of Object.entries(o)) if (v !== null) op[k] = v;
    if (op.focus && /^(none|no|off)$/i.test(op.focus)) op.focus = null;
    if (op.scroll === 0) op.scroll = false;
    if (op.to && /^\d+$/.test(op.to)) op.to = Number(op.to);
    if (op.accent) { op.theme = { accent: op.accent, bg: [op.accent, '#0f0f1a'] }; delete op.accent; }
    return op;
  });
}

/** Turn a free-form request ("make the intro punchier") into edit ops. */
export async function promptToOps(text, data) {
  if (!aiAvailable()) throw new Error('no Anthropic credentials');
  const screens = Object.values(data.assets).map((a) => {
    const labels = (a.elements || []).filter((e) => e.label && e.y < (a.dpH || 800)).slice(0, 30).map((e) => e.label);
    return `${a.id} ${a.route || ''} "${a.title}": ${labels.join(' | ')}`;
  }).join('\n');
  let response;
  try {
    response = await requestEdit(text, data, screens);
  } catch (err) {
    if (isAuthProblem(err)) { disabled = true; const e = new Error('no Anthropic credentials'); e.code = 'NO_AUTH'; throw e; }
    throw err;
  }
  if (response.stop_reason === 'refusal') throw new Error('the model declined this request');
  const out = response.parsed_output;
  if (!out) throw new Error('could not understand the request');
  return { reply: out.reply, ops: toOps(out.ops) };
}

function requestEdit(text, data, screens) {
  return client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(Edit) },
    system: 'You edit an app launch video. The timeline is a list of scenes (intro, one per app screen, outro). '
      + 'Turn the user\'s request into edit operations. Only use fields you need; leave the rest null. '
      + 'Write captions like short, punchy marketing copy (titles under 6 words).',
    messages: [{
      role: 'user',
      content: `Timeline:\n${summary(data)}\n\nCaptured screens (element labels):\n${screens}\n\nRequest: ${text}`,
    }],
  });
}
