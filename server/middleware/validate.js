// middleware/validate.js — input validation at the trust boundary.
//
// Hand-written rather than pulled from a library: the rules are few, and
// keeping them here means the error messages say what a person did wrong
// instead of echoing a schema path.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// bcrypt only reads the first 72 BYTES of a password and modern versions throw
// rather than truncating, so the limit is enforced before hashing.
const MAX_PASSWORD_BYTES = 72;
const MIN_PASSWORD_LENGTH = 8;

function validateCredentials({ email, password }) {
  if (!email || typeof email !== "string") return "Email is required.";
  if (!EMAIL_PATTERN.test(email.trim())) return "Enter a valid email address.";
  if (!password || typeof password !== "string") return "Password is required.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return "Password is too long. Please use 72 bytes or fewer.";
  }
  return null;
}

const SIGNALS = ["sleepQuality", "stressLevel", "mood", "energy", "focus"];

function validateCheckIn(body) {
  if (!body || typeof body !== "object") return "A check-in body is required.";

  for (const key of SIGNALS) {
    const value = body[key];
    if (!Number.isInteger(value) || value < 1 || value > 10) {
      return `${key} must be a whole number from 1 to 10.`;
    }
  }

  if (body.anxietyIntensity != null) {
    const v = body.anxietyIntensity;
    if (!Number.isInteger(v) || v < 0 || v > 10) {
      return "anxietyIntensity must be a whole number from 0 to 10.";
    }
  }

  for (const key of ["studyHours", "workHours"]) {
    const v = body[key];
    if (v == null) continue;
    if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 24) {
      return `${key} must be a number from 0 to 24.`;
    }
  }

  if (body.notes != null) {
    if (typeof body.notes !== "string") return "notes must be text.";
    if (body.notes.length > 2000) return "notes must be 2000 characters or fewer.";
  }

  return null;
}

module.exports = { validateCredentials, validateCheckIn, SIGNALS, MIN_PASSWORD_LENGTH };
