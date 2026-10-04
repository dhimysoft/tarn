// Check-in CRUD, validation, and the rule that one user cannot reach another's data.

const test = require("node:test");
const assert = require("node:assert/strict");

const { app, request, db, WellnessCheckIn, resetDatabase, signUpAgent, VALID_CHECK_IN } = require("./helpers");

test.before(resetDatabase);
test.after(async () => db.close());

test("a new account sees an honest empty state, not a zeroed dashboard", async () => {
  const agent = await signUpAgent("fresh@example.com");

  const res = await agent.get("/api/check-ins/latest");

  assert.equal(res.status, 200);
  assert.equal(res.body.checkIn, null);
  assert.equal(res.body.snapshot, null, "no snapshot should be invented with no data");
  assert.equal(res.body.entryCount, 0);
});

test("a check-in is created and all five signals are stored", async () => {
  const agent = await signUpAgent("creator@example.com");

  const res = await agent.post("/api/check-ins").send(VALID_CHECK_IN);

  assert.equal(res.status, 201);
  // Regression test: the five signal columns once shared one attribute object,
  // so Sequelize wrote sleepQuality five times and dropped the other four.
  assert.equal(res.body.checkIn.sleepQuality, 7);
  assert.equal(res.body.checkIn.stressLevel, 4);
  assert.equal(res.body.checkIn.mood, 6);
  assert.equal(res.body.checkIn.energy, 5);
  assert.equal(res.body.checkIn.focus, 6);
});

test("the snapshot comes back with its formula, and is not called clinical", async () => {
  const agent = await signUpAgent("snap@example.com");

  const res = await agent.post("/api/check-ins").send(VALID_CHECK_IN);

  assert.ok(res.body.snapshot.score >= 0 && res.body.snapshot.score <= 100);
  assert.ok(res.body.snapshot.formula, "the calculation must be published with the result");
  assert.equal(res.body.snapshot.isClinical, false);
  assert.ok(Array.isArray(res.body.snapshot.contributions));
});

test("the check-in is attached to the session user, never to a userId in the body", async () => {
  const agent = await signUpAgent("owner@example.com");
  const other = await signUpAgent("victim@example.com");

  const victim = await other.get("/api/auth/me");
  const victimId = victim.body.user.id;

  // Try to plant the row on someone else's account.
  const res = await agent.post("/api/check-ins").send({ ...VALID_CHECK_IN, userId: victimId });

  assert.equal(res.status, 201);
  assert.notEqual(res.body.checkIn.userId, victimId, "the body must not be able to set the owner");

  assert.equal((await other.get("/api/check-ins")).body.total, 0);
});

test("out-of-range signals are rejected", async () => {
  const agent = await signUpAgent("invalid@example.com");

  for (const bad of [
    { ...VALID_CHECK_IN, sleepQuality: 0 },
    { ...VALID_CHECK_IN, sleepQuality: 11 },
    { ...VALID_CHECK_IN, mood: 5.5 },
    { ...VALID_CHECK_IN, focus: "high" },
  ]) {
    const res = await agent.post("/api/check-ins").send(bad);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(bad).slice(0, 60)}`);
  }
});

test("a missing signal is rejected", async () => {
  const agent = await signUpAgent("missing@example.com");
  const { focus, ...withoutFocus } = VALID_CHECK_IN;

  assert.equal((await agent.post("/api/check-ins").send(withoutFocus)).status, 400);
});

test("optional fields are accepted and bounded", async () => {
  const agent = await signUpAgent("optional@example.com");

  const ok = await agent.post("/api/check-ins").send({
    ...VALID_CHECK_IN, anxietyIntensity: 6, studyHours: 3.5, workHours: 2, notes: "a note",
  });
  assert.equal(ok.status, 201);

  assert.equal((await agent.post("/api/check-ins").send({ ...VALID_CHECK_IN, anxietyIntensity: 11 })).status, 400);
  assert.equal((await agent.post("/api/check-ins").send({ ...VALID_CHECK_IN, studyHours: 25 })).status, 400);
  assert.equal((await agent.post("/api/check-ins").send({ ...VALID_CHECK_IN, notes: "x".repeat(2001) })).status, 400);
});

test("history is listed newest first and paginates", async () => {
  const agent = await signUpAgent("history@example.com");

  for (let i = 0; i < 3; i++) {
    await agent.post("/api/check-ins").send({ ...VALID_CHECK_IN, mood: 4 + i });
  }

  const res = await agent.get("/api/check-ins?limit=2");
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 3);
  assert.equal(res.body.checkIns.length, 2);
  assert.ok(
    new Date(res.body.checkIns[0].createdAt) >= new Date(res.body.checkIns[1].createdAt),
    "newest entry must come first",
  );
});

// The most important rule in the application.
test("one user cannot read or delete another user's check-in", async () => {
  const owner = await signUpAgent("mine@example.com");
  const stranger = await signUpAgent("theirs@example.com");

  const created = await owner.post("/api/check-ins").send(VALID_CHECK_IN);
  const id = created.body.checkIn.id;

  // 404 rather than 403 — a 403 would confirm the id exists.
  assert.equal((await stranger.get(`/api/check-ins/${id}`)).status, 404);
  assert.equal((await stranger.delete(`/api/check-ins/${id}`)).status, 404);

  // The owner's entry is untouched, and the stranger's list is still empty.
  assert.equal((await owner.get(`/api/check-ins/${id}`)).status, 200);
  assert.equal((await stranger.get("/api/check-ins")).body.total, 0);
});

test("the owner can delete their own check-in", async () => {
  const agent = await signUpAgent("deleter@example.com");
  const created = await agent.post("/api/check-ins").send(VALID_CHECK_IN);

  assert.equal((await agent.delete(`/api/check-ins/${created.body.checkIn.id}`)).status, 204);
  assert.equal((await agent.get("/api/check-ins")).body.total, 0);
});

test("a malformed id is a 400, not a 500", async () => {
  const agent = await signUpAgent("badid@example.com");

  assert.equal((await agent.get("/api/check-ins/not-a-uuid")).status, 400);
  assert.equal((await agent.delete("/api/check-ins/not-a-uuid")).status, 400);
});

test("deleting a user cascades to their check-ins", async () => {
  const agent = await signUpAgent("cascade@example.com");
  await agent.post("/api/check-ins").send(VALID_CHECK_IN);

  const me = await agent.get("/api/auth/me");
  const userId = me.body.user.id;

  assert.equal(await WellnessCheckIn.count({ where: { userId } }), 1);

  await db.query('DELETE FROM users WHERE id = :id', { replacements: { id: userId } });

  // ON DELETE CASCADE is what makes "delete my account" actually delete data.
  assert.equal(await WellnessCheckIn.count({ where: { userId } }), 0);
});
