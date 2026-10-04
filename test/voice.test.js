/**
 * voice.test.js
 *
 * The sentence reader and the crisis check behind "Say or type your check-in"
 * (frontend/voice.js). Both are plain functions that run on the device.
 *
 * The crisis tests come in two halves on purpose: phrases that MUST show the
 * help link, and everyday sentences that must NOT. Passing both halves does not
 * mean every unsafe situation is caught (see docs/AI_SAFETY.md): it only stops
 * the specific mistakes we know about from coming back.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseCheckin, checkForCrisis } from "../frontend/voice.js";

const v = (text) => parseCheckin(text).values;
const h = (text) => parseCheckin(text).hours;

// ---------------- reading a sentence ----------------

test("one sentence fills several signals and the study hours", () => {
  const r = parseCheckin("I slept well, stress is moderate, mood is good, energy is low, studied four hours.");
  assert.deepEqual(r.values, { sleep: 7, stress: 5, mood: 7, energy: 3 });
  assert.deepEqual(r.hours, { study: 4 });
});

test("plain numbers work, as digits or words", () => {
  assert.deepEqual(v("sleep is a 7, stress 8 out of 10, mood is six"), { sleep: 7, stress: 8, mood: 6 });
  assert.equal(v("my focus is seven out of ten").focus, 7);
});

test("single words that carry their own meaning", () => {
  assert.equal(v("I am exhausted").energy, 1);
  assert.equal(v("I am so tired").energy, 2);
  assert.equal(v("I feel sad").mood, 3);
  assert.equal(v("I feel happy").mood, 8);
  assert.equal(v("I am distracted").focus, 3);
  assert.equal(v("I am overwhelmed").stress, 10);
  assert.equal(v("I am stressed").stress, 7);
  assert.equal(v("feeling calm").stress, 2);
});

test("stress runs the other way from everything else", () => {
  assert.ok(v("stress is low").stress <= 3, "low stress is a LOW number");
  assert.ok(v("stress is high").stress >= 8, "high stress is a HIGH number");
  assert.ok(v("sleep is high").sleep >= 7 || v("sleep is good").sleep >= 7);
  assert.ok(v("stress is good").stress <= 3, "good stress means little stress");
  assert.ok(v("stress is bad").stress >= 8, "bad stress means a lot of stress");
});

test("'not' reverses the meaning", () => {
  assert.ok(v("sleep was not good").sleep <= 4);
  assert.ok(v("I am not stressed").stress <= 4);
  assert.ok(v("mood is not great").mood <= 4);
  assert.equal(v("sleep was not bad").sleep, 6, "'not bad' is a little above average, not terrible");
});

test("'very', 'really' and 'extremely' push away from the middle; 'a bit' pulls in", () => {
  assert.equal(v("very good mood").mood, 8);
  assert.equal(v("extremely tired").energy, 1);
  assert.ok(v("I am a bit stressed").stress < v("I am stressed").stress);
  assert.ok(v("I am really stressed").stress >= 8);
});

test("sleep phrases that are not about a score", () => {
  assert.ok(v("I barely slept").sleep <= 2);
  assert.ok(v("I didn't sleep").sleep <= 2);
  assert.ok(v("I slept terribly").sleep <= 2);
  assert.ok(v("I slept like a baby").sleep >= 8);
  assert.equal("sleep" in v("I slept four hours"), false, "hours of sleep are not a quality score, so nothing is guessed");
});

test("trouble focusing is low focus", () => {
  assert.ok(v("I can't focus").focus <= 4);
  assert.ok(v("hard to concentrate today").focus <= 4);
  assert.ok(v("I am sharp today").focus >= 8);
});

test("hours for study and work, in the ways people say them", () => {
  assert.deepEqual(h("worked six hours"), { work: 6 });
  assert.deepEqual(h("four hours of class and two hours of work"), { study: 4, work: 2 });
  assert.deepEqual(h("I studied for three hours and worked for five"), { study: 3, work: 5 });
  assert.equal(h("studied for two and a half hours").study, 3, "a half rounds up to a whole hour");
  assert.equal(h("worked 4.5 hours").work, 5);
  assert.deepEqual(h("no classes today"), { study: 0 });
  assert.deepEqual(h("day off from work"), { work: 0 });
});

test("hours are limited to the form's 0 to 16", () => {
  assert.equal(h("studied 40 hours").study, 16);
});

test("only what was said is filled in", () => {
  assert.deepEqual(parseCheckin("mood is good").values, { mood: 7 });
  assert.deepEqual(parseCheckin("mood is good").hours, {});
});

test("a sentence it cannot read fills nothing, and says so", () => {
  for (const nothing of ["", "   ", "hello there", "what is the weather", "I like pizza"]) {
    assert.equal(parseCheckin(nothing).understood, 0, JSON.stringify(nothing));
  }
  assert.equal(parseCheckin(undefined).understood, 0);
  assert.equal(parseCheckin(null).understood, 0);
});

test("every value is a whole number from 1 to 10", () => {
  const all = v("extremely terrible sleep, super overwhelmed, perfect mood, peak energy, laser focus, sleep is 99");
  for (const n of Object.values(all)) assert.ok(Number.isInteger(n) && n >= 1 && n <= 10, String(n));
});

// ---------------- the crisis check: these MUST show the help link ----------------

test("direct phrases are caught", () => {
  const must = [
    "I want to kill myself",
    "I've been thinking about suicide",
    "i am feeling suicidal",
    "I want to die",
    "I want to hurt myself",
    "I want to harm myself",
    "I am thinking of ending my life",
    "I wish I was dead",
    "there is no reason to live",
    "everyone would be better off without me",
    "I don't want to be here anymore",
    "I just want to end it all",
    "self-harm",
    "I keep cutting myself",
  ];
  for (const s of must) assert.equal(checkForCrisis(s), true, s);
});

test("disguised spellings are caught", () => {
  for (const s of ["K1LL MYS3LF", "kiiiill myselffff", "KILLMYSELF", "k i l l   m y s e l f", "kill   myself", "su1c1de"]) {
    assert.equal(checkForCrisis(s), true, s);
  }
});

test("a crisis phrase hidden in an otherwise ordinary check-in is still caught", () => {
  assert.equal(checkForCrisis("I slept well, stress is high, and I want to kill myself"), true);
});

// ---------------- the crisis check: these must NOT ----------------

test("everyday sentences do not trigger it", () => {
  const mustNot = [
    "I slept well, stress is moderate, mood is good",
    "this deadline is killing me",
    "my stress is killing me",
    "that exam will kill me",
    "I'm so tired I could die",
    "I was reading about suicide prevention month",
    "I want to die my hair blue",
    "I am dying to see the new movie",
    "I'm dying to try that restaurant",
    "I will send it all tomorrow",
    "the battery died",
    "I studied four hours and worked two",
    "energy is low, focus is sharp",
  ];
  for (const s of mustNot) assert.equal(checkForCrisis(s), false, s);
});

test("empty and odd input never throws", () => {
  for (const s of [undefined, null, "", "   ", 42, {}]) assert.equal(checkForCrisis(s), false);
});
