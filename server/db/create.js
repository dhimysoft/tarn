// db/create.js — creates the local databases.
//
// The migrations can create TABLES but not the database itself, and a missing
// database fails with a confusing "database does not exist" on first run. This
// reads the names from the same URLs the app uses, so they cannot drift apart.

require("dotenv").config();

const { execFileSync } = require("node:child_process");

function nameFrom(url) {
  if (!url) return null;
  try {
    return new URL(url).pathname.replace(/^\//, "") || null;
  } catch {
    return null;
  }
}

const names = [
  nameFrom(process.env.DATABASE_URL),
  nameFrom(process.env.TEST_DATABASE_URL),
].filter(Boolean);

if (!names.length) {
  console.error("❌ No DATABASE_URL found. Copy .env.example to .env first.");
  process.exit(1);
}

let created = 0;

for (const name of names) {
  try {
    // Fixed argument list, never a shell string — the name comes from a URL.
    execFileSync("createdb", [name], { stdio: "pipe" });
    console.log(`  ${name}: created`);
    created += 1;
  } catch (error) {
    const message = String(error.stderr || "");
    if (/already exists/i.test(message)) {
      console.log(`  ${name}: already exists`);
    } else if (/command not found|ENOENT/i.test(message + error.code)) {
      console.error("❌ createdb not found — is PostgreSQL installed and on your PATH?");
      process.exit(1);
    } else {
      console.error(`❌ ${name}: ${message.trim() || error.message}`);
      process.exit(1);
    }
  }
}

console.log(`\nDone — ${created} created. Next: npm run db:migrate`);
