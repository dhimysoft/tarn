// routes/auth.routes.js — register, log in, log out, who am I.
//
// Follows the TTP capstone auth route shape. The difference is that logging in
// writes a session row rather than signing a token, so logging out can actually
// end it — here and, with logoutAll, everywhere.

const express = require("express");
const bcrypt = require("bcrypt");

const { User, UserConsent, Session } = require("../models");
const { requireAuth } = require("../middleware/requireAuth");
const { validateCredentials } = require("../middleware/validate");

const router = express.Router();

const BCRYPT_ROUNDS = 12;

// Bump when the wording of a notice changes, so an old consent is never
// treated as agreement to new text.
const CONSENT_VERSION = "2026-09-04";

/** Regenerate the session id on login. Without this a session id captured
 *  before authentication would still be valid after it — session fixation. */
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

// POST /api/auth/register
router.post("/register", async (req, res, next) => {
  try {
    const { email, password, name, acceptedProductLimitations, acceptedPrivacyNotice } = req.body || {};

    const problem = validateCredentials({ email, password });
    if (problem) return res.status(400).json({ error: problem });

    // The product-limitations notice is not a nicety here — it is the notice
    // saying this is not medical advice, so an account cannot exist without it.
    if (!acceptedProductLimitations || !acceptedPrivacyNotice) {
      return res.status(400).json({
        error: "You must accept the product limitations and privacy notice to create an account.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const existing = await User.findOne({ where: { email: cleanEmail } });
    if (existing) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({
      email: cleanEmail,
      passwordHash,
      name: typeof name === "string" && name.trim() ? name.trim() : null,
    });

    // Record what was agreed to, and which wording.
    await UserConsent.bulkCreate([
      { userId: user.id, consentType: "product_limitations", consentVersion: CONSENT_VERSION },
      { userId: user.id, consentType: "privacy_notice", consentVersion: CONSENT_VERSION },
    ]);

    await startSession(req, user);
    return res.status(201).json({ user });
  } catch (error) {
    return next(error);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ where: { email: String(email).trim().toLowerCase() } });

    // A wrong password and an unknown account return the SAME message, so this
    // endpoint cannot be used to discover which emails have accounts.
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: "Invalid email or password." });

    await startSession(req, user);
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

// POST /api/auth/logout — ends this session only.
router.post("/logout", (req, res, next) => {
  if (!req.session) return res.status(204).end();
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("tarn.sid");
    return res.status(204).end();
  });
});

// POST /api/auth/logout-all — ends every session for this user.
// This is the thing a JWT could not do without a blocklist.
router.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // connect-pg-simple stores the session as JSON, so the owner is matched
    // inside the document rather than in a column.
    await Session.sequelize.query(
      `DELETE FROM session WHERE (sess -> 'userId') ::text = :quoted`,
      { replacements: { quoted: `"${userId}"` } },
    );

    res.clearCookie("tarn.sid");
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
module.exports.CONSENT_VERSION = CONSENT_VERSION;
