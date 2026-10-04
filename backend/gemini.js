// gemini.js — the ONLY place TARN talks to Google's Gemini API.
//
// THE RULE THIS FILE EXISTS TO KEEP: using it must never cost money.
//
// How that is made true, in layers (no single one is trusted):
//
//   1. FREE MODELS ONLY. Only models Google lists as "Free of charge" can be
//      called. Anything else (including a model named in GEMINI_MODEL) is
//      ignored, so a typo or a copy-pasted paid model name cannot bill you.
//   2. NO BILLING ACCOUNT. The real guarantee is on Google's side: a key from a
//      project with no billing account cannot be charged. Past the free limit
//      Google answers HTTP 429 and nothing is billed. Never add billing to the
//      project the key belongs to (see README, "Gemini: staying free").
//   3. OUR OWN CEILING. A hard daily cap and per-visitor limits sit well below
//      the free limits, so the app stops asking long before Google would refuse.
//   4. LESS TRAFFIC. Identical inputs are answered from a cache.
//   5. NO LOOPS. A refused key or an exhausted quota pauses all calls for a
//      while instead of retrying.
//
// WHAT IS SENT: only a handful of numbers and category names from the
// check-in. Never anything the person typed. (On the free tier Google may use
// prompts to improve its products, so nothing personal may be in them.)
//
// WHAT COMES BACK is treated as untrusted. It is checked against the rules in
// docs/AI_SAFETY.md, and if it fails ANY check it is discarded and the caller
// shows the built-in text instead. Invalid text is never repaired or shown.

// Models Google lists as "Free of charge" (ai.google.dev/gemini-api/docs/pricing,
// checked 2026-10-04), lightest first. Update this list from that page; never
// add a model that page marks as paid.
// Order = the order tried. gemini-3.1-flash-lite answered in under a second where gemini-3.5-flash-lite took 12s
// on a cold call (measured 2026-10-04), so it goes first; the others are the fallbacks.
export const FREE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];

export const LIMITS = {
  perVisitorPerMinute: 4,
  perVisitorPerHour: 20,
  // Conservative: well under any free daily quota. Raise with GEMINI_DAILY_CAP.
  dailyCap: 150,
  cacheMs: 60 * 60 * 1000,
  // Per attempt. A slow free model is skipped for the next one rather than waited on.
  timeoutMs: 7000,
  // Across all attempts for one request, so a bad day at Google cannot hold a visitor up.
  totalBudgetMs: 14000,
  maxOutputTokens: 512,
  quotaPauseMs: 10 * 60 * 1000,
  keyPauseMs: 60 * 60 * 1000,
};

const TIERS = ['Optimal', 'Good', 'Moderate', 'Low', 'Critical'];
const RISKS = ['Low', 'Moderate', 'High', 'Critical'];

// ---------- 1. which models may be called ----------

// The free models, with the one the owner asked for (if it is free) first.
export function modelList(preferred) {
  const wanted = String(preferred || '').trim();
  if (wanted && FREE_MODELS.includes(wanted)) {
    return [wanted, ...FREE_MODELS.filter((m) => m !== wanted)];
  }
  return [...FREE_MODELS];
}

// ---------- 2. what may be sent ----------

const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null;
};

// Numbers and fixed category names only, each clamped into range. Anything
// else in the request body is dropped, so free text can never reach Google
// and nothing in the body can steer the prompt.
export function sanitizeScores(body) {
  const b = body && typeof body === 'object' ? body : {};
  const score = num(b.wellness_score, 0, 100);
  const recovery = num(b.recovery_index, 0, 100);
  const focus = num(b.focus_readiness, 0, 100);
  if (score === null || recovery === null || focus === null) return null;
  if (!TIERS.includes(b.tier) || !RISKS.includes(b.burnout_risk)) return null;
  return {
    wellness_score: score,
    tier: b.tier,
    stress_pattern: b.burnout_risk,
    recovery,
    focus,
    delta: b.delta === null || b.delta === undefined ? null : num(b.delta, -100, 100),
  };
}

export function buildPrompt(s) {
  const change =
    s.delta === null ? 'no earlier check-in to compare with'
    : s.delta >= 0 ? `up ${s.delta} points since the last check-in`
    : `down ${Math.abs(s.delta)} points since the last check-in`;

  return `You write one short reflection for a self-reflection and general wellness app. You are not a clinician and you never give medical advice, diagnoses, treatment, or predictions about a person's health or future.

Everything below was reported by the person themselves in a quick check-in. These are not measurements.
- Overall check-in score: ${s.wellness_score}/100 (${s.tier})
- Self-reported stress pattern: ${s.stress_pattern}
- Rest check-in: ${s.recovery}/100
- Focus check-in: ${s.focus}/100
- Change: ${change}

Write exactly 2 or 3 short sentences in a calm, kind, plain voice. Describe what they reported, using words like "you reported". Then end with one small, general, everyday suggestion (for example about rest, a short break, or a walk). Do not mention doctors, therapy, medication, disorders or conditions. Do not promise any result. Do not use bullet points, headings, or emoji.`;
}

// ---------- 3. what comes back ----------

// Everything the policy prohibits that is checkable by pattern. A match means
// the text is thrown away: a validator that "fixes" text can introduce errors
// of its own, so there is no repair path.
const PROHIBITED = [
  [/\b(diagnos\w*|disorder|clinical(ly)?|symptom\w*|depress(ed|ion)|anxiety disorder|mental illness|condition)\b/i, 'diagnosis or clinical language'],
  [/\b(medicat\w*|prescri\w*|antidepressant\w*|dosage|supplement\w*|therapy|therapist|treatment|treat(s|ed)?)\b/i, 'medication or treatment'],
  [/\b(will|going to) (reduce|improve|fix|cure|heal|eliminate|solve)\b/i, 'promised outcome'],
  [/\b(cure|cures|cured|guarantee\w*|proven|clinically)\b/i, 'medical or certainty claim'],
  [/\b(burnout|burn out|heading toward|on track (for|to))\b/i, 'predicting a health outcome'],
  [/\byou('re| are) (safe|fine|okay|ok|not at risk)\b/i, 'asserting the person is safe'],
  [/\b(you (do not|don't) need|no need (for|to see)) (help|a professional|a doctor|support)\b/i, 'discouraging professional help'],
  [/\b(i am|i'm|as) (a|your) (doctor|therapist|clinician|psychologist|counsel+or)\b/i, 'clinical role claim'],
  [/\b(suicid\w*|self[- ]harm|kill|die|emergency)\b/i, 'crisis language (handled by the fixed crisis page, never generated)'],
  [/\b(studies|research|evidence) (show|shows|prove|proves|suggest)\b/i, 'fabricated evidence'],
  [/\bAURA Intelligence\b|\bconfidence[- ]?(value|bar|score|%)/i, 'a phrase the product must not use'],
];

// Returns the cleaned text, or null if it must be discarded. Only the RULE that
// fired is reported, never the text.
export function validateInsight(text) {
  const raw = String(text ?? '');
  // Formatting is checked on the raw text, before line breaks are flattened:
  // a bulleted list is made of line breaks.
  if (/[*#`>\[\]{}]|^\s*([-•]|\d+[.)])\s/m.test(raw)) return { ok: false, rule: 'formatting' };
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t.length < 20 || t.length > 600) return { ok: false, rule: 'length' };
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 2 || sentences.length > 4) return { ok: false, rule: 'shape' };
  for (const [re, rule] of PROHIBITED) if (re.test(t)) return { ok: false, rule };
  return { ok: true, text: t };
}

// ---------- 4. limits ----------

// In memory: one copy per running server. On a serverless host each warm copy
// has its own counters, which is why these ceilings are conservative and why
// the no-billing rule above is the real guarantee.
export function createLimiter(limits = LIMITS, now = Date.now) {
  const visitors = new Map();
  let day = '';
  let dayCount = 0;
  let pausedUntil = 0;
  let pausedBecause = '';

  const today = () => new Date(now()).toISOString().slice(0, 10);

  return {
    // Is a call allowed right now? Reasons are plain words for the response.
    check(visitor) {
      if (now() < pausedUntil) return { ok: false, reason: pausedBecause };
      if (today() !== day) { day = today(); dayCount = 0; }
      if (dayCount >= limits.dailyCap) return { ok: false, reason: 'daily-cap' };
      const t = now();
      const hits = (visitors.get(visitor) || []).filter((x) => t - x < 3_600_000);
      if (hits.filter((x) => t - x < 60_000).length >= limits.perVisitorPerMinute) return { ok: false, reason: 'rate' };
      if (hits.length >= limits.perVisitorPerHour) return { ok: false, reason: 'rate' };
      return { ok: true };
    },
    // Count one real call to Google (not cache hits).
    record(visitor) {
      if (today() !== day) { day = today(); dayCount = 0; }
      dayCount += 1;
      const t = now();
      visitors.set(visitor, [...(visitors.get(visitor) || []).filter((x) => t - x < 3_600_000), t]);
      // Don't let a flood of one-off visitors grow this forever.
      if (visitors.size > 5000) visitors.clear();
    },
    pause(reason, ms) { pausedUntil = now() + ms; pausedBecause = reason; },
    stats: () => ({ day, dayCount, paused: now() < pausedUntil ? pausedBecause : null }),
  };
}

// ---------- 5. the service ----------

const ENDPOINT = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// What the caller gets. `insight` is null whenever the built-in text should be
// shown instead, and `reason` says why in one word (never any detail from
// Google, and never the text that failed validation).
const none = (reason) => ({ insight: null, model: null, source: 'none', reason, advisory: true });

export function createInsightService({
  apiKey,
  preferredModel,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  limits = { ...LIMITS },
} = {}) {
  const limiter = createLimiter(limits, now);
  const cache = new Map();
  const models = modelList(preferredModel);

  return {
    limiter,
    models,

    async insight(body, visitor = 'unknown') {
      const scores = sanitizeScores(body);
      if (!scores) return none('bad-input');
      if (!apiKey) return none('not-configured');

      const key = JSON.stringify(scores);
      const hit = cache.get(key);
      if (hit && now() - hit.at < limits.cacheMs) return { ...hit.value, cached: true };

      const allowed = limiter.check(visitor);
      if (!allowed.ok) return none(allowed.reason);

      const payload = {
        contents: [{ role: 'user', parts: [{ text: buildPrompt(scores) }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: limits.maxOutputTokens },
        // Block anything Google's own filters consider unsafe, strictly.
        safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
          .map((category) => ({ category, threshold: 'BLOCK_LOW_AND_ABOVE' })),
      };

      const started = now();
      let lastReason = 'unavailable';

      for (const model of models) {
        if (now() - started > limits.totalBudgetMs) return none('slow');

        // Every attempt counts toward the daily cap, so a failing model can
        // never turn one visit into a burst of calls.
        const gate = limiter.check(visitor);
        if (!gate.ok) return none(gate.reason);
        limiter.record(visitor);

        let res;
        try {
          res = await fetchImpl(ENDPOINT(model), {
            method: 'POST',
            // The key travels in a header, never in the URL (URLs get logged).
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(limits.timeoutMs),
          });
        } catch (err) {
          // Timed out or unreachable. The next free model may well answer
          // (a cold model can take 12s while another answers in under one).
          lastReason = err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'slow' : 'network';
          continue;
        }

        if (res.ok) {
          let data;
          try { data = await res.json(); } catch { return none('error'); }
          const parts = data?.candidates?.[0]?.content?.parts;
          const raw = Array.isArray(parts) ? parts.filter((p) => p && !p.thought && typeof p.text === 'string').map((p) => p.text).join(' ') : '';
          const checked = validateInsight(raw);
          if (!checked.ok) {
            // Only the rule is logged, never the text.
            console.warn('Gemini answer discarded by rule:', checked.rule);
            return none('discarded');
          }
          const value = { insight: checked.text, model, source: 'gemini', advisory: true };
          cache.set(key, { at: now(), value });
          if (cache.size > 500) cache.clear();
          return value;
        }

        const detail = (await res.text().catch(() => '')).slice(0, 400);
        if (res.status === 429) { limiter.pause('quota', limits.quotaPauseMs); return none('quota'); }
        if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid|API key expired/i.test(detail)) {
          limiter.pause('key', limits.keyPauseMs);
          console.error('Gemini key was refused. Check GEMINI_API_KEY (see README, "Gemini: staying free").');
          return none('key');
        }
        // A retired model (404) or a busy one (5xx): try the next free model.
        if (res.status === 404 || res.status >= 500 || /overloaded|unavailable|not found|not supported|deprecat/i.test(detail)) continue;
        return none('error');
      }
      return none(lastReason);
    },
  };
}
