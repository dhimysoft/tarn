// db/index.js — creates and exports one Sequelize connection.
//
// Same pattern as the TTP capstone projects: a single connection built from
// DATABASE_URL so credentials never appear in source, SSL only in production
// because hosted Postgres (Neon, Render) requires it and local does not.

require("dotenv").config();

const { Sequelize } = require("sequelize");

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL — set it in your .env file.");
}

const db = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions:
    process.env.NODE_ENV === "production"
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : {},
});

module.exports = db;
