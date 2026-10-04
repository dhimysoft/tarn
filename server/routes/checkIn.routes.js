// routes/checkIn.routes.js — the user's own wellness check-ins.
//
// Every query filters on req.user.id, taken from the session. No handler here
// trusts a userId from the URL, the body or a query string — that is the single
// rule that keeps one account's entries out of another's.

const express = require("express");
const { Op } = require("sequelize");

const { WellnessCheckIn } = require("../models");
const { requireAuth } = require("../middleware/requireAuth");
const { validateCheckIn } = require("../middleware/validate");
const { calculateSnapshot } = require("../lib/snapshot");

const router = express.Router();

router.use(requireAuth);

/** Consecutive days ending today, from this user's own entries. */
async function currentStreak(userId) {
  const recent = await WellnessCheckIn.findAll({
    where: { userId },
    order: [["createdAt", "DESC"]],
    limit: 60,
    attributes: ["createdAt"],
  });

  if (!recent.length) return 0;

  const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
  const days = [...new Set(recent.map((r) => dayKey(r.createdAt)))];

  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86400000));

  // A streak only counts if it reaches today or yesterday; otherwise it broke.
  if (days[0] !== today && days[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const expected = dayKey(new Date(new Date(days[i - 1]).getTime() - 86400000));
    if (days[i] === expected) streak += 1;
    else break;
  }
  return streak;
}

// POST /api/check-ins
router.post("/", async (req, res, next) => {
  try {
    const problem = validateCheckIn(req.body);
    if (problem) return res.status(400).json({ error: problem });

    const streak = await currentStreak(req.user.id);
    const snapshot = calculateSnapshot(req.body, streak);

    const checkIn = await WellnessCheckIn.create({
      userId: req.user.id,          // from the session, never from the body
      sleepQuality: req.body.sleepQuality,
      stressLevel: req.body.stressLevel,
      mood: req.body.mood,
      energy: req.body.energy,
      focus: req.body.focus,
      anxietyIntensity: req.body.anxietyIntensity ?? null,
      studyHours: req.body.studyHours ?? null,
      workHours: req.body.workHours ?? null,
      notes: typeof req.body.notes === "string" ? req.body.notes.trim() || null : null,
      snapshotScore: snapshot.score,
    });

    return res.status(201).json({ checkIn, snapshot, streak: streak + 1 });
  } catch (error) {
    return next(error);
  }
});

// GET /api/check-ins?limit=&offset=
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { rows, count } = await WellnessCheckIn.findAndCountAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return res.json({ checkIns: rows, total: count, limit, offset });
  } catch (error) {
    return next(error);
  }
});

// GET /api/check-ins/latest — what the dashboard opens with.
router.get("/latest", async (req, res, next) => {
  try {
    const checkIn = await WellnessCheckIn.findOne({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
    });

    if (!checkIn) {
      // An honest empty state, not a zeroed dashboard.
      return res.json({ checkIn: null, snapshot: null, streak: 0, entryCount: 0 });
    }

    const [streak, entryCount] = await Promise.all([
      currentStreak(req.user.id),
      WellnessCheckIn.count({ where: { userId: req.user.id } }),
    ]);

    const snapshot = calculateSnapshot(
      {
        sleepQuality: checkIn.sleepQuality,
        stressLevel: checkIn.stressLevel,
        mood: checkIn.mood,
        energy: checkIn.energy,
        focus: checkIn.focus,
      },
      streak,
    );

    return res.json({ checkIn, snapshot, streak, entryCount });
  } catch (error) {
    return next(error);
  }
});

// GET /api/check-ins/:id
router.get("/:id", async (req, res, next) => {
  try {
    const checkIn = await WellnessCheckIn.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    // 404 rather than 403 for someone else's entry: a 403 would confirm the id
    // exists, which tells an attacker something.
    if (!checkIn) return res.status(404).json({ error: "Check-in not found." });

    return res.json({ checkIn });
  } catch (error) {
    // A malformed UUID makes Postgres throw. That is a bad request, not a
    // server fault.
    if (error?.name === "SequelizeDatabaseError") {
      return res.status(400).json({ error: "Invalid check-in id." });
    }
    return next(error);
  }
});

// DELETE /api/check-ins/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const removed = await WellnessCheckIn.destroy({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!removed) return res.status(404).json({ error: "Check-in not found." });
    return res.status(204).end();
  } catch (error) {
    if (error?.name === "SequelizeDatabaseError") {
      return res.status(400).json({ error: "Invalid check-in id." });
    }
    return next(error);
  }
});

module.exports = router;
