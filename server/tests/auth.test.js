// Registration, login, sessions, and the rules that keep the API private.

const test = require("node:test");
const assert = require("node:assert/strict");

const { app, request, db, User, UserConsent, resetDatabase, signUpAgent, VALID_CONSENT } = require("./helpers");

test.before(resetDatabase);
test.after(async () => db.close());

test("health check responds without a session", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
});

test("unknown routes return JSON, not an HTML error page", async () => {
  const res = await request(app).get("/api/nope");
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "Not found");
});

test("registration requires both consents", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: "noconsent@example.com", password: "secret123" });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /product limitations and privacy notice/i);
});

test("registration succeeds and never returns the password hash", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: "alice@example.com", password: "secret123", name: "Alice", ...VALID_CONSENT });

  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, "alice@example.com");
  assert.equal(res.body.user.passwordHash, undefined);
  assert.equal(JSON.stringify(res.body).includes("passwordHash"), false);
});

test("registration records what was consented to, and which version", async () => {
  const user = await User.findOne({ where: { email: "alice@example.com" } });
  const consents = await UserConsent.findAll({ where: { userId: user.id } });

  assert.equal(consents.length, 2);
  const types = consents.map((c) => c.consentType).sort();
  assert.deepEqual(types, ["privacy_notice", "product_limitations"]);
  assert.ok(consents[0].consentVersion, "every consent must record its version");
});

test("a short password is rejected", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: "short@example.com", password: "abc", ...VALID_CONSENT });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /at least 8/i);
});

test("an invalid email is rejected", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: "not-an-email", password: "secret123", ...VALID_CONSENT });

  assert.equal(res.status, 400);
});

// bcrypt only reads the first 72 bytes and modern versions throw rather than
// truncating, so this must be caught before hashing.
test("a password over 72 bytes is rejected rather than crashing", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: "long@example.com", password: "x".repeat(100), ...VALID_CONSENT });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /too long/i);
});

test("a duplicate email is rejected with 409", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: "alice@example.com", password: "secret123", ...VALID_CONSENT });

  assert.equal(res.status, 409);
});

test("email is stored lowercase so casing cannot create a second account", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: "ALICE@Example.com", password: "secret123", ...VALID_CONSENT });

  assert.equal(res.status, 409);
});

test("login works, and both failure modes give the same message", async () => {
  const good = await request(app)
    .post("/api/auth/login")
    .send({ email: "alice@example.com", password: "secret123" });
  assert.equal(good.status, 200);

  const wrongPassword = await request(app)
    .post("/api/auth/login")
    .send({ email: "alice@example.com", password: "nope" });
  assert.equal(wrongPassword.status, 401);

  const unknownAccount = await request(app)
    .post("/api/auth/login")
    .send({ email: "ghost@example.com", password: "secret123" });
  assert.equal(unknownAccount.status, 401);

  // If these differed the endpoint would reveal which emails have accounts.
  assert.equal(wrongPassword.body.error, unknownAccount.body.error);
});

test("protected routes reject anonymous requests", async () => {
  assert.equal((await request(app).get("/api/auth/me")).status, 401);
  assert.equal((await request(app).get("/api/check-ins")).status, 401);
  assert.equal((await request(app).post("/api/check-ins").send({})).status, 401);
});

test("the session survives across requests and ends on logout", async () => {
  const agent = await signUpAgent("session@example.com");

  assert.equal((await agent.get("/api/auth/me")).status, 200);
  assert.equal((await agent.post("/api/auth/logout")).status, 204);
  assert.equal((await agent.get("/api/auth/me")).status, 401);
});

test("the session cookie is httpOnly and not readable by page scripts", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: "cookie@example.com", password: "secret123", ...VALID_CONSENT });

  const cookie = (res.headers["set-cookie"] || []).join(";");
  assert.match(cookie, /tarn\.sid/, "the session cookie must be set");
  assert.match(cookie, /HttpOnly/i, "the session cookie must be httpOnly");
  assert.match(cookie, /SameSite/i, "the session cookie must set SameSite");
});

test("logout-all revokes every session for that user", async () => {
  const first = await signUpAgent("multi@example.com");

  // A second, independent login for the same account — a second device.
  const second = request.agent(app);
  await second.post("/api/auth/login").send({ email: "multi@example.com", password: "secret123" });

  assert.equal((await first.get("/api/auth/me")).status, 200);
  assert.equal((await second.get("/api/auth/me")).status, 200);

  await first.post("/api/auth/logout-all");

  // This is what a JWT could not do without a blocklist: the OTHER device's
  // session is dead too.
  assert.equal((await second.get("/api/auth/me")).status, 401);
});
