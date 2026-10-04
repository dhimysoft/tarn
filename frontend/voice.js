/* ============================================================
   TARN — say or type your check-in

   One sentence ("I slept well, stress is moderate, mood is good, energy is
   low, studied four hours") fills in the sliders. The person checks them and
   presses the usual button.

   THE RULES THIS FILE FOLLOWS (docs/AI_SAFETY.md):

   1. CRISIS CHECK FIRST. What a person says or types is free text, so before
      anything else it goes through checkForCrisis(), a plain list of phrases
      that runs on this device. On a match NOTHING is parsed or filled in; the
      page shows how to get help instead. It is not a risk assessment and it
      does not claim to watch or detect anything: it only decides whether to
      put the help link in front of somebody. It cannot see metaphor, other
      languages or silence, which is why help is also one tap away on every page.

   2. NO AI. The sentence is read by rules in parseCheckin(), on this device.
      It is never sent to Gemini or to any TARN server.

   3. PRIVATE. The text is held in memory only and cleared when the panel
      closes. Nothing is written to localStorage except one yes/no: that the
      person has seen the microphone notice.

   4. HONEST ABOUT THE MICROPHONE. Browsers do the speech-to-text, and most
      send the audio to their maker's servers (Chrome: Google; Safari: Apple).
      So the microphone is off until the person says yes to a plain-words
      notice. Typing never leaves the device and needs no notice.

   The parser and the crisis check are plain functions with no page in them,
   so they are tested (test/voice.test.js). The page wiring is at the bottom.
   ============================================================ */

/* ── Crisis check ────────────────────────────────────────── */

// Parts of a sentence that contain a crisis-looking phrase but are not one.
const BENIGN = [
  /suicide prevention (month|awareness|week|day|training|research|study|class)/g,
  /\bdie my (hair|clothes|shirt|fabric|eggs)\b/g,
  /\b(to|gonna|going to) die for\b/g,
  /\bdying (to|for) (see|try|go|get|meet|know|hear|eat|have)\b/g,
];

// Written run together and lower case, because the check runs on text with the
// spaces taken out (so "kill   myself" and "KILLMYSELF" are both caught).
const SEVERE = [
  'killmyself', 'killingmyself', 'killmyselff', 'endmylife', 'endingmylife', 'takemyownlife', 'takingmyownlife',
  'suicide', 'suicidal', 'wanttodie', 'wantingtodie', 'wishiwasdead', 'wishiwerredead', 'wishiwasntalive',
  'hurtmyself', 'hurtingmyself', 'harmmyself', 'harmingmyself', 'selfharm',
  'cuttingmyself', 'noreasontolive', 'noreasontobealive', 'betteroffdead', 'betteroffwithoutme',
  'dontwanttobehereanymore', 'dontwanttobealive', 'dontwanttolive', 'donotwanttolive',
];

// Phrases that are only a problem as whole words ("send it all" must not match "end it all").
const WORD_PHRASES = [/\bend(ing)? it all\b/, /\bend(ing)? everything\b/, /\bdon'?t want to (be here|exist)\b/];

// A run of the same letter three or more times shrinks to one ("kiiiill" -> "kill"),
// and look-alike digits and symbols become letters ("k1ll mys3lf" -> "kill myself").
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
const normalise = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[01345 7@$!]/g, (c) => (c === ' ' ? ' ' : LEET[c]))
    .replace(/(.)\1{2,}/g, '$1');

// Returns true when the help link should be shown. Deliberately errs towards
// showing it: showing help nobody needed costs a tap, missing it costs more.
export function checkForCrisis(text) {
  let t = normalise(text);
  for (const re of BENIGN) t = t.replace(re, ' ');
  if (WORD_PHRASES.some((re) => re.test(t))) return true;
  const stripped = t.replace(/[^a-z]/g, '');
  const collapsed = stripped.replace(/(.)\1+/g, '$1');
  return SEVERE.some((p) => stripped.includes(p) || collapsed.includes(p.replace(/(.)\1+/g, '$1')));
}

/* ── Reading a sentence ──────────────────────────────────── */

const NUMBER_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, a: 1, an: 1 };
const NUM = `(\\d+(?:\\.\\d+)?|${Object.keys(NUMBER_WORDS).filter((w) => w !== 'a' && w !== 'an').join('|')})`;
const toNumber = (w) => (/^\d/.test(w) ? parseFloat(w) : NUMBER_WORDS[w]);

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Which signal does a piece of the sentence talk about?
const SIGNAL_WORDS = {
  sleep:  /\b(sleep\w*|slept|rest(ed)?|insomnia|nap)\b/,
  stress: /\b(stress\w*|pressure|tense|overwhelm\w*|calm|relaxed)\b/,
  mood:   /\b(mood|feeling|feel|feels|happy|cheerful|upbeat|joyful|sad|down|blue|gloomy|miserable|spirits)\b/,
  energy: /\b(energy|energetic|energi[sz]ed|tired|exhausted|drained|sleepy|wiped|fatigued|lively|sluggish|depleted)\b/,
  focus:  /\b(focus\w*|concentrat\w*|distracted|attention|scattered|sharp|foggy|unfocused)\b/,
};

// Words that carry a value of their own for one signal.
const OWN = {
  sleep:  [[/\b(no sleep|didn'?t sleep|did not sleep|barely slept|hardly slept|barely sleep|hardly sleep|couldn'?t sleep|insomnia)\b/, 2], [/\bslept like a (baby|log|rock)\b/, 9]],
  stress: [[/\b(no stress|stress[- ]free|not stressed at all|zero stress)\b/, 1], [/\b(overwhelm\w*|maxed out|through the roof)\b/, 10], [/\b(very high|extremely high|extreme|intense)\b/, 9], [/\b(stressed out|really stressed|very stressed)\b/, 8], [/\b(high|heavy|a lot of)\b/, 8], [/\b(elevated|quite stressed|fairly stressed|pretty stressed|stressed|tense|pressure)\b/, 7], [/\b(moderate|medium|some|manageable|okay|ok|fine|average|so-?so)\b/, 5], [/\b(mild|light|slight|a little|a bit)\b/, 3], [/\b(low|little|minimal|calm)\b/, 2], [/\brelaxed\b/, 2]],
  mood:   [[/\b(miserable|awful|terrible|horrible)\b/, 1], [/\b(sad|down|blue|gloomy|low)\b/, 3], [/\b(happy|cheerful|upbeat|joyful|high)\b/, 8]],
  energy: [[/\b(depleted|exhausted|drained|wiped|fatigued|zonked)\b/, 1], [/\b(tired|sleepy|sluggish|lethargic)\b/, 3], [/\b(full of energy|on fire)\b/, 9], [/\b(energetic|energi[sz]ed|lively|buzzing|high)\b/, 8], [/\bpeak\b/, 10]],
  focus:  [[/\b(can'?t|cannot|couldn'?t|hard to|difficult to|trouble|struggling to|struggle to) (focus|concentrate)\b/, 3], [/\b(scattered|distracted|unfocused|foggy|all over the place)\b/, 3], [/\b(laser|locked in|dialled in|dialed in)\b/, 10], [/\bsharp\b/, 8], [/\bfocused\b/, 7]],
};

// Ordinary scale words, for every signal except stress (which runs the other way).
const SCALE = [
  [/\b(perfect|best ever|flawless)\b/, 10], [/\b(excellent|amazing|fantastic|awesome|superb|wonderful|outstanding)\b/, 9],
  [/\bgreat\b/, 8], [/\b(good|well|nice|solid|positive|better)\b/, 7], [/\b(above average|pretty good|fairly good|not bad|decent)\b/, 6],
  [/\b(okay|ok|fine|alright|average|so-?so|moderate|medium|normal|fair)\b/, 5], [/\b(below average|meh|not great)\b/, 4],
  [/\blow\b/, 3], [/\b(bad|poor|poorly|badly|rough|crappy|lousy)\b/, 2], [/\b(terribl[ey]|awful(ly)?|horribl[ey]|dreadful(ly)?|worst)\b/, 1],
];
// For stress "good / fine" means little stress, "bad" means a lot.
const STRESS_SCALE = [[/\b(great|excellent|perfect|amazing)\b/, 2], [/\b(good|well|nice|fine)\b/, 3], [/\b(bad|terrible|awful|horrible|rough)\b/, 8]];

const STRONG = /\b(extremely|incredibly|super)\s+$/;
const MEDIUM = /\b(very|really|so|quite)\s+$/;
const SOFTEN = /\b(a bit|a little|slightly|kind of|sort of|somewhat|fairly|pretty)\s+$/;
const NEGATION = /\b(not|never|isn'?t|wasn'?t|aren'?t|ain'?t|hardly|barely)\s+(?:\w+\s+){0,1}$/;

// "very good" pushes a value away from the middle; "a bit stressed" pulls it in.
function adjust(value, before) {
  const away = value >= 6 ? 1 : -1;
  if (STRONG.test(before)) return clamp(value + 2 * away, 1, 10);
  if (MEDIUM.test(before)) return clamp(value + away, 1, 10);
  if (SOFTEN.test(before)) return clamp(value - away, 1, 10);
  return value;
}

function firstHit(table, clause) {
  for (const [re, value] of table) {
    const m = re.exec(clause);
    if (m) return { value, at: m.index };
  }
  return null;
}

// One value for one signal from one clause, or null if the clause has no usable word.
function scoreClause(signal, clause) {
  // A plain number: "sleep is a 7", "stress 8 out of 10", "mood is six out of ten".
  const num = new RegExp(`\\b${NUM}\\b(?!\\s*(?:hours?|hrs?|minutes?|mins?|am|pm|o'?clock|\\.\\d))`, 'g');
  for (const m of clause.matchAll(num)) {
    const n = toNumber(m[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 10 && !/^(a|an)$/.test(m[1])) return n;
  }

  let hit = firstHit(OWN[signal], clause);
  if (!hit) hit = firstHit(signal === 'stress' ? STRESS_SCALE : SCALE, clause);
  if (!hit) return null;

  const before = clause.slice(0, hit.at);
  let value = adjust(hit.value, before);
  // "not good" is the opposite of "good". The mirror of a value on a 1-10 scale is 11 - value.
  if (NEGATION.test(before) && !/not bad/.test(clause)) value = 11 - value;
  return clamp(value, 1, 10);
}

// "four hours of class", "worked six hours", "studied for two and a half hours", "no classes today".
function readHours(clause, out) {
  const STUDY = /\b(stud(y|ied|ying)|class(es)?|school|lectures?|lab|homework|exam)\b/;
  const WORK = /\b(work(ed|ing)?|job|shift)\b/;
  const kind = STUDY.test(clause) ? 'study' : WORK.test(clause) ? 'work' : null;
  if (!kind) return;

  if (/\b(no|zero|without|off from)\s+(\w+\s+){0,2}(class(es)?|school|study|work|shift|lectures?)\b|\bday off\b|\bnothing (scheduled|today)\b/.test(clause) && !new RegExp(`${NUM}\\s*(hours?|hrs?)`).test(clause)) {
    out[kind] = 0;
    return;
  }
  const m = new RegExp(`${NUM}(\\s+halfhour)?\\s*(hours?|hrs?)?`).exec(clause.replace(/\bfor\b/g, ''));
  const hoursWord = /\b(hours?|hrs?)\b/.test(clause);
  if (!m || (!hoursWord && !/\b(stud(y|ied|ying)|work(ed|ing)?)\s+(for\s+)?\w+/.test(clause))) return;
  const n = toNumber(m[1]);
  if (n === undefined || Number.isNaN(n)) return;
  out[kind] = clamp(Math.round(n + (m[2] ? 0.5 : 0)), 0, 16);
}

// The sentence in, what it said out. Only what was actually said is returned.
//   { values: { sleep?, stress?, mood?, energy?, focus? }, hours: { study?, work? }, understood: number }
export function parseCheckin(text) {
  const values = {};
  const hours = {};
  const clauses = String(text ?? '')
    .toLowerCase()
    .replace(/[“”"]/g, '')
    .replace(/\bi'?m\b/g, 'i am')
    .replace(/\s+and a half\b/g, ' halfhour')
    .split(/[,;!?]+|\.(?!\d)|\band\b|\bbut\b|\bthen\b|\bwhile\b|\balso\b|\bplus\b/)
    .map((c) => c.trim())
    .filter(Boolean);

  // A clause like "slept well" can carry the value for a signal named earlier or
  // implied by its verb, so each clause is matched against every signal.
  for (const clause of clauses) {
    readHours(clause, hours);
    for (const [signal, re] of Object.entries(SIGNAL_WORDS)) {
      if (!re.test(clause) || signal in values) continue;
      const v = scoreClause(signal, clause);
      if (v !== null) values[signal] = v;
    }
  }
  return { values, hours, understood: Object.keys(values).length + Object.keys(hours).length };
}

/* ── On the page ─────────────────────────────────────────── */

export const CRISIS_NOTE =
  'If you are thinking about hurting yourself or ending your life, help is available right now, at any hour. ' +
  'You do not have to go through this alone.';

const SIGNALS = ['sleep', 'stress', 'mood', 'energy', 'focus'];
const CONSENT_KEY = 'tarn_voice_notice_seen';
const SpeechRec = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

function initVoicePanel() {
  const $ = (id) => document.getElementById(id);
  const form = $('checkin-form');
  const box = $('voice-box');
  if (!form || !box) return;

  const open = $('voice-open'), panel = $('voice-panel'), text = $('voice-text');
  const mic = $('voice-mic'), apply = $('voice-apply'), status = $('voice-status');
  const heard = $('voice-heard'), help = $('voice-help'), notice = $('voice-notice'), body = $('voice-body');
  let recognition = null;
  let listening = false;

  const noticeSeen = () => { try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch (_) { return false; } };
  const say = (msg) => { status.textContent = msg; };

  // The microphone only exists where the browser has speech recognition.
  if (!SpeechRec) mic.hidden = true;

  function stopListening() {
    if (recognition) { try { recognition.abort(); } catch (_) {} }
    recognition = null;
    listening = false;
    mic.textContent = '🎤 Start listening';
    mic.setAttribute('aria-pressed', 'false');
  }

  function clearAll() {
    stopListening();
    text.value = '';
    heard.innerHTML = '';
    help.hidden = true;
    body.hidden = false;
    say('');
  }

  function setOpen(isOpen) {
    panel.hidden = !isOpen;
    open.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) text.focus(); else clearAll();
  }

  // Free text goes through the crisis check BEFORE anything else happens to it.
  function submitText() {
    const said = text.value;
    if (!said.trim()) { say('Say or type a sentence first.'); return; }
    if (checkForCrisis(said)) {
      stopListening();
      text.value = '';
      heard.innerHTML = '';
      body.hidden = true;
      help.hidden = false;
      help.querySelector('a').focus();
      return;
    }
    const result = parseCheckin(said);
    heard.innerHTML = '';
    if (!result.understood) {
      say('I could not match that to the sliders. Try naming each one, like "sleep is good, stress is low, mood is okay".');
      return;
    }
    for (const signal of SIGNALS) {
      if (!(signal in result.values)) continue;
      const slider = $(`${signal}-slider`);
      slider.value = result.values[signal];
      slider.dispatchEvent(new Event('input', { bubbles: true })); // updates the label the usual way
      const li = document.createElement('li');
      li.textContent = `${slider.getAttribute('aria-label')}: ${$(`${signal}-label`).textContent}`;
      heard.appendChild(li);
    }
    for (const [key, id, label] of [['study', 'study-input', 'Study / Class'], ['work', 'work-input', 'Work']]) {
      if (!(key in result.hours)) continue;
      $(id).value = result.hours[key];
      const li = document.createElement('li');
      li.textContent = `${label}: ${result.hours[key]} hrs`;
      heard.appendChild(li);
    }
    say('Here is what I filled in. Check the sliders below, change anything that is not right, then press "View My Wellness Reflection".');
  }

  function startListening() {
    recognition = new SpeechRec();
    recognition.lang = 'en-US'; // the reader understands English
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let sentence = '';
      for (const r of event.results) sentence += r[0].transcript;
      text.value = sentence;
      if (event.results[event.results.length - 1].isFinal) submitText();
    };
    recognition.onerror = (event) => {
      const why = event.error;
      say(why === 'not-allowed' || why === 'service-not-allowed' ? 'The microphone is blocked. You can allow it in your browser settings, or type instead.'
        : why === 'no-speech' ? 'I did not hear anything. Try again, or type instead.'
        : why === 'network' ? 'Voice is not available right now. You can type instead.'
        : 'Voice did not work this time. You can type instead.');
      stopListening();
    };
    recognition.onend = () => { if (listening) stopListening(); };
    try {
      recognition.start();
      listening = true;
      mic.textContent = '⏹ Stop listening';
      mic.setAttribute('aria-pressed', 'true');
      say('Listening…');
    } catch (_) {
      say('Voice did not start. You can type instead.');
      stopListening();
    }
  }

  open.addEventListener('click', () => setOpen(panel.hidden));
  apply.addEventListener('click', submitText);
  // Enter in the box fills in the sliders. It must not submit the whole form.
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitText(); } });
  mic.addEventListener('click', () => {
    if (listening) { stopListening(); return; }
    if (!noticeSeen()) { notice.hidden = false; $('voice-notice-yes').focus(); return; }
    startListening();
  });
  $('voice-notice-yes').addEventListener('click', () => {
    try { localStorage.setItem(CONSENT_KEY, '1'); } catch (_) {}
    notice.hidden = true;
    startListening();
  });
  $('voice-notice-no').addEventListener('click', () => { notice.hidden = true; say('No problem. You can type instead.'); text.focus(); });
  $('voice-close').addEventListener('click', () => { setOpen(false); open.focus(); });
  window.addEventListener('pagehide', clearAll);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initVoicePanel);
  else initVoicePanel();
}
