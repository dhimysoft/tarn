/**
 * forbidden-claims.test.js
 *
 * Scans user-facing source for language this product must never use, and fails
 * the build if any appears.
 *
 * This is a safety net for WORDING, not a substitute for judgement. It cannot
 * catch a new unsafe claim phrased in new words — it only stops the specific
 * mistakes we have already identified from coming back.
 *
 * Rationale for each pattern is in docs/CLAIMS_REGISTER.md.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The project is an ES module ("type": "module" in package.json), so __dirname
// does not exist and has to be derived from import.meta.url.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// Files a user actually sees. Docs are excluded — they DISCUSS the forbidden
// claims in order to explain why they were removed, which is the opposite of
// making them.
const USER_FACING = [
  "frontend/index.html",
  "frontend/dashboard.html",
  "frontend/crisis.html",
  "frontend/script.js",
  "frontend/voice.js",
];

/**
 * Each entry: the pattern, and why it is forbidden.
 * `allowIn` lists files where the phrase is legitimate (e.g. the crisis page
 * must be able to say the app does NOT diagnose).
 */
const FORBIDDEN = [
  { re: /\bburnout risk\b/i,        why: "Predicts a health outcome from self-reported sliders." },
  { re: /\brecovery index\b/i,      why: "Implies a validated clinical instrument." },
  { re: /\bfocus readiness\b/i,     why: "Implies measured cognitive capacity." },
  { re: /\bconfidence[- ]?(value|bar|score|%)/i, why: "The old confidence figure had no statistical basis." },
  { re: /\bAURA Intelligence\b/,    why: "Old product name; overclaims capability." },
  { re: /\bclinically (proven|validated)\b/i, why: "No study of this application exists." },
  { re: /\bHIPAA[- ]compliant\b/i,  why: "Not formally established." },
  { re: /\bwe (detect|diagnose|treat)\b/i, why: "The app does none of these." },
  { re: /\byou are heading toward\b/i, why: "Predicts a health trajectory." },
  { re: /\bwill reduce your anxiety\b/i, why: "Promises a therapeutic outcome." },
  { re: /\bsustainable hours\b/i,   why: "Predicts work capacity." },
  { re: /\byour (score|snapshot) will improve\b/i, why: "Promises a future result." },
  { re: /\bcures?\b/i,              why: "Medical claim." },
];

// A phrase is allowed when it is being NEGATED — "does not provide diagnosis"
// is the safest sentence in the app, and must not be flagged.
const NEGATION = /\b(not|never|no|cannot|does not|is not|without)\b[^.]{0,80}$/i;

function findViolations(content, file) {
  const violations = [];

  content.split("\n").forEach((line, index) => {
    // Skip the comment blocks that explain what was removed and why.
    const trimmed = line.trim();
    if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return;

    for (const { re, why } of FORBIDDEN) {
      const match = line.match(re);
      if (!match) continue;

      const before = line.slice(0, match.index);
      if (NEGATION.test(before)) continue; // negated — fine

      violations.push(`${file}:${index + 1} — "${match[0]}" — ${why}`);
    }
  });

  return violations;
}

test("no forbidden health or performance claims in user-facing copy", () => {
  const all = [];

  for (const file of USER_FACING) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    all.push(...findViolations(fs.readFileSync(full, "utf8"), file));
  }

  assert.deepEqual(
    all,
    [],
    `\n\nForbidden claims found in user-facing copy:\n\n${all.join("\n")}\n\n` +
      `See docs/CLAIMS_REGISTER.md for why each is prohibited.\n`,
  );
});

test("the crisis page states plainly that entries are not monitored", () => {
  const crisis = fs.readFileSync(path.join(ROOT, "frontend/crisis.html"), "utf8");

  assert.match(crisis, /not a crisis service/i, "must say it is not a crisis service");
  assert.match(crisis, /not monitored/i, "must say entries are not monitored");
  assert.match(crisis, /988/, "must show the 988 lifeline");
  assert.match(crisis, /911/, "must show the emergency number");
});

test("every page offers a route to crisis support", () => {
  for (const file of ["frontend/index.html", "frontend/dashboard.html"]) {
    const content = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.match(content, /crisis\.html/, `${file} must link to crisis support`);
  }
});

test("US crisis numbers are not presented as worldwide resources", () => {
  const crisis = fs.readFileSync(path.join(ROOT, "frontend/crisis.html"), "utf8");

  assert.match(crisis, /United States/, "must scope the numbers to a country");
  assert.match(
    crisis,
    /work in the United States only|Outside the United States/i,
    "must tell people outside the US that these numbers will not connect",
  );
});
