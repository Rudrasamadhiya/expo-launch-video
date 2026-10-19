// Understands common edits typed into the studio's prompt box, without any AI:
//   "make dashboard 4s"            "speed up analytics 2x"      "slow down profile"
//   "remove pricing"               "move settings to 3"         "move faq after help"
//   "zoom on Log In in login"      "no zoom on dashboard"       "no scroll on mistakes"
//   "title dashboard: Your day at a glance"   "subtitle 2: ..."
//   "portrait" / "landscape" / "square"       "make it 30 seconds"
//   "fade transition on analytics"            "app name: MyApp"  "tagline: ..."  "cta: ..."
//   "color #7c3aed"
// Returns an array of ops for Project.applyOps, or null when it's not a known pattern.

const SCENE = '(.+?)';

export function parsePrompt(input) {
  const text = input.trim().replace(/[.!]+$/, '');
  const t = text.toLowerCase();
  let m;

  if ((m = /^(?:app\s*name|name)\s*[:=]\s*(.+)$/i.exec(text))) return [{ op: 'settings', appName: m[1].trim() }];
  if ((m = /^tagline\s*[:=]\s*(.+)$/i.exec(text))) return [{ op: 'settings', tagline: m[1].trim() }];
  if ((m = /^(?:cta|call to action|button)\s*[:=]\s*(.+)$/i.exec(text))) return [{ op: 'settings', cta: m[1].trim() }];
  if ((m = /^(?:(?:theme|brand|accent)\s+)?colou?r\s*[:=]?\s*(#[0-9a-f]{3,8})$/i.exec(text))) return [{ op: 'settings', theme: { accent: m[1], bg: [m[1], '#0f0f1a'] } }];
  if (/^(?:make it |switch to |use )?(portrait|vertical|9:16)( video| format)?$/.test(t)) return [{ op: 'settings', format: 'portrait' }];
  if (/^(?:make it |switch to |use )?(landscape|horizontal|16:9)( video| format)?$/.test(t)) return [{ op: 'settings', format: 'landscape' }];
  if (/^(?:make it |switch to |use )?(square|1:1)( video| format)?$/.test(t)) return [{ op: 'settings', format: 'square' }];
  if ((m = /^(?:make (?:it|the (?:whole )?video)|total(?: length)?|target)\s*(?:to be |=|:)?\s*(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)(?: long)?$/.exec(t))) return [{ op: 'plan', targetSeconds: Number(m[1]) }];
  if (/^(re-?plan|auto ?plan|start over|redo the plan)$/.test(t)) return [{ op: 'plan' }];
  if (/^(mute|no sound|silent|turn off (?:the )?(?:sound|sounds|sound effects|audio)|sound off|sfx off)$/.test(t)) return [{ op: 'settings', sound: { sfx: false } }];
  if (/^(unmute|sound on|sfx on|turn on (?:the )?(?:sound|sounds|sound effects|audio)|add sound(?: effects)?)$/.test(t)) return [{ op: 'settings', sound: { sfx: true } }];
  if ((m = /^(?:sound |sfx |audio )?volume\s*(?:to\s*)?(\d+)\s*%?$/.exec(t))) return [{ op: 'settings', sound: { volume: Math.min(1, Number(m[1]) / 100) } }];
  if ((m = /^(?:put |move |show |change )?(?:the )?(?:text|captions?|titles?)(?: side)?(?: (?:to|on))?(?: the)? (left|right)(?: side)?$/.exec(t))) return [{ op: 'settings', captionSide: m[1] }];
  if ((m = /^(?:phone|device)(?: (?:to|on))?(?: the)? (left|right)(?: side)?$/.exec(t))) return [{ op: 'settings', captionSide: m[1] === 'left' ? 'right' : 'left' }];

  if ((m = new RegExp(`^(?:remove|delete|drop|cut) (?:the )?${SCENE}(?: scene)?$`).exec(t))) return [{ op: 'remove', scene: sceneRef(m[1]) }];
  if ((m = new RegExp(`^move (?:the )?${SCENE} (before|after) (?:the )?${SCENE}$`).exec(t))) return [{ op: 'move', scene: sceneRef(m[1]), [m[2]]: sceneRef(m[3]) }];
  if ((m = new RegExp(`^move (?:the )?${SCENE} to (?:the )?(?:position |#)?(\\d+|first|last|start|end)$`).exec(t))) return [{ op: 'move', scene: sceneRef(m[1]), to: /^\d+$/.test(m[2]) ? Number(m[2]) : m[2] }];
  if ((m = new RegExp(`^(?:add|include) (?:the )?${SCENE}(?: screen)?(?: (?:at|to) (?:position |#)?(\\d+))?$`).exec(t))) return [{ op: 'add', asset: m[1].trim(), at: m[2] ? Number(m[2]) : undefined }];

  if ((m = new RegExp(`^speed up (?:the )?${SCENE}(?: (?:by|to) )?(?: ?(\\d+(?:\\.\\d+)?)x)?$`).exec(t))) return [{ op: 'update', scene: sceneRef(m[1]), speed: m[2] ? Number(m[2]) : 1.5 }];
  if ((m = new RegExp(`^slow down (?:the )?${SCENE}(?: (?:to )?(\\d+(?:\\.\\d+)?)x)?$`).exec(t))) return [{ op: 'update', scene: sceneRef(m[1]), speed: m[2] ? Number(m[2]) : 0.75 }];
  if ((m = new RegExp(`^(?:set |make )?(?:the )?${SCENE} (?:speed )?(?:to )?(\\d+(?:\\.\\d+)?)x(?: speed)?$`).exec(t))) return [{ op: 'update', scene: sceneRef(m[1]), speed: Number(m[2]) }];
  if ((m = new RegExp(`^(?:make |set )?(?:the )?${SCENE} (?:duration |length )?(?:to |=)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:s|sec|secs|seconds)(?: long)?$`).exec(t))) return [{ op: 'update', scene: sceneRef(m[1]), duration: Number(m[2]) }];
  if ((m = new RegExp(`^(?:make )?(?:the )?${SCENE} (shorter|longer)$`).exec(t))) return [{ op: 'update', scene: sceneRef(m[1]), relDuration: m[2] === 'shorter' ? 0.75 : 1.3 }];

  if ((m = /^(?:no|remove|stop|don'?t) zoom(?:ing)? (?:on |in |for )?(?:the )?(.+?)$/.exec(t))) return [{ op: 'update', scene: sceneRef(m[1]), focus: null, zoom: 1 }];
  // greedy element part, so "zoom on Log In in login" splits at the last " in "
  if ((m = /^zoom (?:in )?(?:on|into|to) (.+) (?:in|on) (?:the )?(.+?)(?: screen| scene)?(?: (\d+(?:\.\d+)?)x)?$/.exec(t))) {
    const op = { op: 'update', scene: sceneRef(m[2]), focus: originalCase(text, m[1]) };
    if (m[3]) op.zoom = Number(m[3]);
    return [op];
  }
  if ((m = /^(?:no|remove|stop|don'?t) scroll(?:ing)? (?:on |in |for )?(?:the )?(.+?)$/.exec(t))) return [{ op: 'update', scene: sceneRef(m[1]), scroll: false }];
  if ((m = /^scroll (?:the )?(.+?) (?:to )?(\d+)\s*%$/.exec(t))) return [{ op: 'update', scene: sceneRef(m[1]), scroll: Number(m[2]) / 100 }];
  if ((m = /^(fade|slide|zoom|rise|cut|none) transition (?:on|for|to|into) (?:the )?(.+?)$/.exec(t))) return [{ op: 'update', scene: sceneRef(m[2]), transition: m[1] === 'cut' ? 'none' : m[1] }];

  if ((m = /^(title|caption|headline|subtitle|subtext)\s+(?:for |of |on )?(?:the )?(.+?)\s*[:=]\s*(.+)$/i.exec(text))) {
    const field = /^sub/i.test(m[1]) ? 'subtitle' : 'title';
    return [{ op: 'update', scene: sceneRef(m[2].toLowerCase()), [field]: m[3].trim() }];
  }
  return null;
}

function sceneRef(s) {
  const r = s.trim().replace(/^(?:the )/, '').replace(/ (?:screen|scene|page)$/, '').replace(/^scene /, '');
  const ordinal = /^(\d+)(?:st|nd|rd|th)?$/.exec(r);
  return ordinal ? Number(ordinal[1]) : r;
}

function originalCase(original, lower) {
  const i = original.toLowerCase().indexOf(lower);
  return i >= 0 ? original.slice(i, i + lower.length) : lower;
}

/** Expand ops that depend on current values (e.g. "shorter"). */
export function resolveRelative(ops, project) {
  return ops.map((op) => {
    if (op.relDuration) {
      const s = project.findScene(op.scene);
      const { relDuration, ...rest } = op;
      return { ...rest, duration: Math.round(s.duration * relDuration * 10) / 10 };
    }
    return op;
  });
}
