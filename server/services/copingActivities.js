/**
 * services/copingActivities.js — the ONLY source of coping activities.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *   So a language model cannot invent an exercise. When the Companion is built,
 *   it may reference an activity by ID and nothing else — it never writes the
 *   steps, the cautions, or the citation. Everything a user is told to DO comes
 *   from this reviewed list.
 *
 * APPROVAL STATUS
 *   Every activity here is `pending_review`. NONE are exposed to users yet,
 *   because none has been reviewed by a qualified mental-health professional.
 *   `getAvailableActivities()` returns an empty list until that happens, and
 *   that is the correct behaviour — not a bug to work around.
 *
 * SOURCES
 *   Every `source` below is a real, checkable publication. Where a claim could
 *   not be tied to a specific source, the field says so rather than inventing
 *   one. `evidenceType` distinguishes evidence for the GENERAL TECHNIQUE from
 *   evidence about THIS APP — of which there is none.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const APPROVAL = Object.freeze({
  PENDING: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
});

const EVIDENCE_TYPE = Object.freeze({
  // Research supports the general technique. Says nothing about this app.
  GENERAL_TECHNIQUE: "general_technique",
  // An established description of a practice, not an outcome study.
  ESTABLISHED_PRACTICE: "established_practice",
  // Evidence about TARN itself. Nothing qualifies — none exists.
  THIS_PRODUCT: "this_product",
});

/**
 * Required on every activity. An entry missing any of these is a data error and
 * is rejected at load, not silently shown with a gap.
 */
const REQUIRED_FIELDS = Object.freeze([
  "id", "title", "purpose", "steps", "estimatedMinutes",
  "cautions", "source", "evidenceType", "reviewedOn", "reviewer", "approvalStatus",
]);

const ACTIVITIES = Object.freeze([
  Object.freeze({
    id: "paced-breathing-4-6",
    title: "Paced breathing",
    purpose: "A paced-breathing exercise that may support a moment of relaxation.",
    steps: Object.freeze([
      "Sit with both feet on the floor and let your shoulders drop.",
      "Breathe in through your nose while counting to four.",
      "Breathe out through your mouth while counting to six.",
      "Keep going for about two minutes, at a pace that feels comfortable.",
      "If counting feels awkward, just make the out-breath a little longer than the in-breath.",
    ]),
    estimatedMinutes: 2,
    cautions: Object.freeze([
      "Stop if you feel dizzy, light-headed or uncomfortable at any point.",
      "Breathe at a pace that suits you. This is not a test and there is no correct speed.",
      "This is not a treatment for anxiety or a way to prevent a panic attack.",
    ]),
    source: Object.freeze({
      title: "Slow breathing: physiological effects and therapeutic potential",
      authors: "Zaccaro A, et al.",
      publication: "Frontiers in Human Neuroscience",
      year: 2018,
      doi: "10.3389/fnhum.2018.00353",
    }),
    evidenceType: EVIDENCE_TYPE.GENERAL_TECHNIQUE,
    evidenceLimitations:
      "Supports slow breathing as a general technique. Says nothing about this implementation, " +
      "this app, or any individual outcome.",
    reviewedOn: null,
    reviewer: null,
    approvalStatus: APPROVAL.PENDING,
  }),

  Object.freeze({
    id: "grounding-5-4-3-2-1",
    title: "5-4-3-2-1 grounding",
    purpose: "A short attention exercise that some people find helps them feel more present.",
    steps: Object.freeze([
      "Look around and silently name five things you can see.",
      "Notice four things you can feel: your feet on the floor, a chair, fabric.",
      "Listen for three things you can hear.",
      "Notice two things you can smell, or two smells you like.",
      "Name one thing you can taste, or one thing you are glad about.",
    ]),
    estimatedMinutes: 3,
    cautions: Object.freeze([
      "There is no right answer and nothing to score.",
      "If focusing on your body feels uncomfortable, stop and try something else.",
      "This is a focusing exercise, not a treatment.",
    ]),
    source: Object.freeze({
      title: "Grounding techniques (patient information)",
      authors: "University of Rochester Medical Center",
      publication: "Behavioral Health Partners",
      year: 2018,
      url: "https://www.urmc.rochester.edu/behavioral-health-partners/bhp-blog/april-2018/5-4-3-2-1-coping-technique-for-anxiety.aspx",
    }),
    evidenceType: EVIDENCE_TYPE.ESTABLISHED_PRACTICE,
    evidenceLimitations:
      "A widely published description of a grounding practice, not an outcome study. " +
      "No claim is made about effectiveness.",
    reviewedOn: null,
    reviewer: null,
    approvalStatus: APPROVAL.PENDING,
  }),

  Object.freeze({
    id: "balanced-thought-note",
    title: "Write a more balanced thought",
    purpose: "A short writing exercise for looking at a worry from more than one angle.",
    steps: Object.freeze([
      "Write down the thought exactly as it turned up, in your own words.",
      "Write what makes that thought feel true right now.",
      "Write anything that does not quite fit it: an exception, or another reading.",
      "Write a sentence that takes both into account.",
      "Notice whether the feeling shifted at all. It is fine if it did not.",
    ]),
    estimatedMinutes: 8,
    cautions: Object.freeze([
      "This is inspired by common cognitive behavioral therapy techniques. It is for " +
        "self-reflection and is not CBT treatment or a substitute for working with a licensed professional.",
      "The aim is not to decide the thought is wrong. It is to look at it from more than one side.",
      "If writing about it makes things feel worse, it is fine to stop.",
    ]),
    source: Object.freeze({
      title: "Cognitive Therapy of Depression",
      authors: "Beck AT, Rush AJ, Shaw BF, Emery G",
      publication: "Guilford Press",
      year: 1979,
      isbn: "978-0898629194",
    }),
    evidenceType: EVIDENCE_TYPE.GENERAL_TECHNIQUE,
    evidenceLimitations:
      "The foundational description of cognitive restructuring as a clinical technique. " +
      "This exercise is a simplified self-reflection adaptation, not the clinical protocol, " +
      "and has not been evaluated.",
    reviewedOn: null,
    reviewer: null,
    approvalStatus: APPROVAL.PENDING,
  }),

  Object.freeze({
    id: "one-small-task",
    title: "Pick one small task",
    purpose: "A planning exercise for when everything feels like too much at once.",
    steps: Object.freeze([
      "Write down everything on your mind, in any order.",
      "Circle the one thing that would take under ten minutes.",
      "Do only that one.",
      "Cross it off. Then decide separately whether you want to do another.",
    ]),
    estimatedMinutes: 10,
    cautions: Object.freeze([
      "This is a way to make a start, not a productivity system.",
      "Not finishing the list is not a failure.",
    ]),
    source: Object.freeze({
      title: "Behavioral activation for depression: a clinician's guide",
      authors: "Martell CR, Dimidjian S, Herman-Dunn R",
      publication: "Guilford Press",
      year: 2010,
      isbn: "978-1606238059",
    }),
    evidenceType: EVIDENCE_TYPE.GENERAL_TECHNIQUE,
    evidenceLimitations:
      "Describes behavioural activation as a clinical approach. This is a simplified " +
      "self-help adaptation and has not been evaluated.",
    reviewedOn: null,
    reviewer: null,
    approvalStatus: APPROVAL.PENDING,
  }),

  Object.freeze({
    id: "reach-out-to-someone",
    title: "Think of one person you could tell",
    purpose: "A prompt for identifying someone you might talk to.",
    steps: Object.freeze([
      "Think of one person you would not mind hearing from you today.",
      "Decide what you would want them to know. It can be very short.",
      "Send it, or write it down to send later. Either counts.",
    ]),
    estimatedMinutes: 5,
    cautions: Object.freeze([
      "There is no obligation to tell anyone anything.",
      "If you are in distress right now, a crisis line is staffed by people trained for exactly this.",
    ]),
    source: Object.freeze({
      title: "Social relationships and mortality risk: a meta-analytic review",
      authors: "Holt-Lunstad J, Smith TB, Layton JB",
      publication: "PLoS Medicine",
      year: 2010,
      doi: "10.1371/journal.pmed.1000316",
    }),
    evidenceType: EVIDENCE_TYPE.GENERAL_TECHNIQUE,
    evidenceLimitations:
      "Supports an association between social connection and health outcomes at population " +
      "level. It does not show that this prompt produces any individual benefit.",
    reviewedOn: null,
    reviewer: null,
    approvalStatus: APPROVAL.PENDING,
  }),
]);

/** Fail loudly at load if an entry is incomplete, rather than shipping a gap. */
function assertWellFormed() {
  for (const activity of ACTIVITIES) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in activity)) {
        throw new Error(`Coping activity "${activity.id}" is missing required field: ${field}`);
      }
    }
    if (!activity.source || typeof activity.source !== "object" || !activity.source.title) {
      throw new Error(`Coping activity "${activity.id}" has no real source.`);
    }
    if (!Object.values(APPROVAL).includes(activity.approvalStatus)) {
      throw new Error(`Coping activity "${activity.id}" has an invalid approvalStatus.`);
    }
  }
}
assertWellFormed();

/**
 * What users may actually be shown: approved activities only.
 *
 * Returns an empty array today, because nothing has been clinically reviewed.
 * That is intentional. The UI must render an honest empty state rather than
 * falling back to the unapproved list.
 */
function getAvailableActivities() {
  return ACTIVITIES.filter((a) => a.approvalStatus === APPROVAL.APPROVED);
}

/** The IDs a language model is permitted to reference. Approved only. */
function getAllowedActivityIds() {
  return new Set(getAvailableActivities().map((a) => a.id));
}

/** Look up one activity for display. Unapproved and unknown IDs return null. */
function getActivityById(id) {
  return getAvailableActivities().find((a) => a.id === id) || null;
}

/**
 * Deterministic, non-AI recommendations.
 *
 * Plain rules over the numbers the user reported. No model is involved, so the
 * app suggests something useful with no API key and no network — and the
 * reasoning can be read here rather than guessed at.
 *
 * Only ever returns approved activities.
 */
function recommendActivities(signals = {}, limit = 3) {
  const available = getAvailableActivities();
  if (!available.length) return [];

  const scored = available.map((activity) => {
    let score = 0;
    let because = "Generally useful.";

    if (activity.id === "paced-breathing-4-6" && signals.stressLevel >= 7) {
      score += 3;
      because = "You reported high stress today.";
    }
    if (activity.id === "grounding-5-4-3-2-1" && signals.focus <= 4) {
      score += 3;
      because = "You reported difficulty focusing.";
    }
    if (activity.id === "balanced-thought-note" && signals.mood <= 4) {
      score += 3;
      because = "You reported low mood.";
    }
    if (activity.id === "one-small-task" && signals.energy <= 4) {
      score += 3;
      because = "You reported low energy.";
    }
    if (activity.id === "reach-out-to-someone" && signals.mood <= 3 && signals.stressLevel >= 7) {
      score += 4;
      because = "You reported both low mood and high stress.";
    }

    return { activity, score, because };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ activity, because }) => ({ activity, because, source: "deterministic" }));
}

module.exports = {
  getAvailableActivities,
  getAllowedActivityIds,
  getActivityById,
  recommendActivities,
  APPROVAL,
  EVIDENCE_TYPE,
  REQUIRED_FIELDS,
  // Exported for tests and for a future review UI. NEVER serve these to users.
  _ALL_ACTIVITIES_INCLUDING_UNAPPROVED: ACTIVITIES,
};
