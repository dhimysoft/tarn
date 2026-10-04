// server.js — starts the application.
//
// app.js builds the Express app; this runs it. Verifying the database
// connection before listening means a misconfigured DATABASE_URL fails here,
// with a message, rather than on the first request.

require("dotenv").config();

const app = require("./app");
const db = require("./db");

const PORT = process.env.PORT || 4300;

async function start() {
  try {
    await db.authenticate();
    console.log("🐘 Database connection established.");
  } catch (error) {
    // Sequelize connection errors often arrive with an EMPTY .message, which
    // prints as a bare "Unable to connect:" and says nothing. Fall back to the
    // error name, and for a refused connection name the likely cause.
    const detail = error.message || error.original?.message || error.name || "unknown error";
    console.error("❌ Could not connect to PostgreSQL:", detail);

    if (error.name === "SequelizeConnectionRefusedError" || /ECONNREFUSED/.test(detail)) {
      // Host and port only — never the credentials in the URL.
      const where = (process.env.DATABASE_URL || "").replace(/^.*@/, "").replace(/\?.*$/, "");
      console.error(
        `\n  Nothing is listening at ${where || "(DATABASE_URL not set)"}.\n` +
          "  Start PostgreSQL and check the PORT in DATABASE_URL. The default is 5432.\n",
      );
    } else if (/does not exist/i.test(detail)) {
      console.error("\n  Create it first:  npm run db:create && npm run db:migrate\n");
    }
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 TARN API listening on http://localhost:${PORT}`);
    console.log(`   Health check:  http://localhost:${PORT}/api/health`);
  });
}

start();
