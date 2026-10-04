// tests/helpers.js — shared setup.
//
// Env vars are set BEFORE anything is required, because db/index.js reads
// DATABASE_URL the moment it loads and dotenv will not overwrite a variable
// that is already set. This is what keeps the suite on the throwaway test
// database instead of the development one.

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgresql://localhost:5432/aura_reflect_test";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "test-only-secret-not-used-anywhere-real";
process.env.FRONTEND_URL = "http://localhost:5173";

const request = require("supertest");
const app = require("../app");
const { db, User, WellnessCheckIn, UserConsent } = require("../models");

/**
 * Empty the tables between test files.
 *
 * Refuses to run unless the database name contains "test" — a mistyped URL
 * would otherwise wipe development data, and this is the one guard that makes
 * that impossible rather than merely unlikely.
 */
async function resetDatabase() {
  const name = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "");
  if (!name.includes("test")) {
    throw new Error(`Refusing to run tests against "${name}" — the name must contain "test".`);
  }

  // CASCADE follows the foreign keys, so children go with their parent.
  await db.query('TRUNCATE TABLE "wellness_check_ins", "user_consents", "users", "session" CASCADE;');
}

const VALID_CONSENT = {
  acceptedProductLimitations: true,
  acceptedPrivacyNotice: true,
};

/** Register a user and return an agent that carries their session cookie. */
async function signUpAgent(email, password = "secret123") {
  const agent = request.agent(app);
  const response = await agent
    .post("/api/auth/register")
    .send({ email, password, ...VALID_CONSENT });

  if (response.status !== 201) {
    throw new Error(`setup failed: register returned ${response.status} ${JSON.stringify(response.body)}`);
  }
  return agent;
}

const VALID_CHECK_IN = {
  sleepQuality: 7,
  stressLevel: 4,
  mood: 6,
  energy: 5,
  focus: 6,
};

module.exports = {
  app, request, db, User, WellnessCheckIn, UserConsent,
  resetDatabase, signUpAgent, VALID_CONSENT, VALID_CHECK_IN,
};
