// Vercel serverless function: POST /api/wellness/insight
// The deployed site is static files, so this is what lets it reach Gemini. It
// shares gemini.js with the local server, so the same free-only guardrails
// apply. GEMINI_API_KEY is set in the Vercel project's Environment Variables.
import { createInsightService, LIMITS } from "../../backend/gemini.js";

const service = createInsightService({
  apiKey: process.env.GEMINI_API_KEY,
  preferredModel: process.env.GEMINI_MODEL,
  limits: { ...LIMITS, dailyCap: Math.max(1, Number(process.env.GEMINI_DAILY_CAP) || LIMITS.dailyCap) },
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Vercel puts the real visitor first in x-forwarded-for.
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(await service.insight(body, ip));
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}
