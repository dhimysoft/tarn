// app.js — builds the Express application.
//
// Same split as the TTP capstones: this file ASSEMBLES the app and exports it;
// server.js connects to the database and opens the port. Keeping them apart is
// what lets the tests import the app and make real requests without binding a
// port or racing another test file.

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const { sessionMiddleware } = require("./middleware/session");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth.routes");
const checkInRoutes = require("./routes/checkIn.routes");

const app = express();

// Sessions ride on a cookie, so the browser must be allowed to send it. CORS
// is restricted to one exact origin — a wildcard cannot be used with
// credentials, and should not be anyway.
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(helmet());
app.use(cors({ origin: FRONTEND_URL, credentials: true }));

// Tests make hundreds of requests; the log would bury the results.
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// Bounded body size. Check-in notes are capped at 2000 characters, so anything
// approaching this is not a legitimate request.
app.use(express.json({ limit: "64kb" }));

// Trust the first proxy in production so `secure` cookies work behind a load
// balancer. Left off locally, where there is no proxy.
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(sessionMiddleware);

// Rate limits. Auth is tighter than the rest because that is where guessing
// happens. Disabled under test so the suite is not throttled by itself.
const isTest = process.env.NODE_ENV === "test";

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 100000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 100000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

app.use("/api", generalLimiter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/check-ins", checkInRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
