// middleware/session.js — server-side sessions backed by PostgreSQL.
//
// WHY SESSIONS RATHER THAN A JWT
//
// The TTP capstones put a signed JWT in an httpOnly cookie. That is a good
// pattern and it is reused everywhere else here — but not for the session
// itself, for one reason: a JWT cannot be revoked. It is valid until it
// expires, wherever it is.
//
// TARN has to support "log out of every device" and real session
// expiry over health-adjacent data. With a JWT that means keeping a blocklist
// table and checking it on every request — which is a session store, built the
// hard way and easier to get wrong. So the session id lives in the cookie and
// the session itself lives in Postgres, where deleting a row ends it.
//
// The cookie itself follows the capstone settings exactly.

const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");

const isProd = process.env.NODE_ENV === "production";

const SESSION_MAX_AGE_MS = Number(process.env.SESSION_MAX_AGE_MS) || 7 * 24 * 60 * 60 * 1000;

if (!process.env.SESSION_SECRET) {
  throw new Error("Missing SESSION_SECRET — set it in your .env file.");
}

const PgStore = connectPgSimple(session);

const store = new PgStore({
  conString: process.env.DATABASE_URL,
  tableName: "session",
  // The table is created by a migration, so the library must not create its
  // own — otherwise the schema differs depending on what started first.
  createTableIfMissing: false,
  // Sweep expired rows every 15 minutes.
  pruneSessionInterval: 60 * 15,
});

const sessionMiddleware = session({
  name: "tarn.sid",
  secret: process.env.SESSION_SECRET,
  store,

  // Do not write a session row for every anonymous visitor — only once
  // something is actually stored on it (i.e. after login).
  resave: false,
  saveUninitialized: false,

  // Push the expiry forward on each request, so an active user is not logged
  // out mid-session.
  rolling: true,

  cookie: {
    httpOnly: true,               // page JavaScript cannot read it
    secure: isProd,               // HTTPS only in production
    sameSite: isProd ? "none" : "lax",
    maxAge: SESSION_MAX_AGE_MS,
  },
});

module.exports = { sessionMiddleware, store, SESSION_MAX_AGE_MS };
