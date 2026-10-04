// config/config.js — connection settings for sequelize-cli (migrations).
//
// The CLI does not load db/index.js, so it needs its own entry point. Both read
// the same DATABASE_URL, which keeps the app and the migrations pointed at one
// database rather than drifting apart.

require("dotenv").config();

const base = {
  dialect: "postgres",
  logging: false,
  // Where sequelize-cli records which migrations have run.
  migrationStorageTableName: "sequelize_meta",
};

module.exports = {
  development: { ...base, url: process.env.DATABASE_URL },
  test: { ...base, url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL },
  production: {
    ...base,
    url: process.env.DATABASE_URL,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  },
};
