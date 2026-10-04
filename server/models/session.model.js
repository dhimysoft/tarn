// models/session.model.js — the express-session store table.
//
// connect-pg-simple owns the rows: it writes, reads and expires them. This
// model exists so the table is created by a MIGRATION like everything else,
// rather than by the library's own CREATE TABLE at boot, and so "log out of
// every device" can be implemented as a query rather than a hope.
//
// The column names and types are dictated by connect-pg-simple and must not be
// renamed to match our other tables.

const { DataTypes } = require("sequelize");
const db = require("../db");

const Session = db.define(
  "Session",
  {
    sid: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    // The serialised session. It holds a userId and nothing else — no name,
    // no email, and never any check-in or journal content.
    sess: {
      type: DataTypes.JSON,
      allowNull: false,
    },

    expire: {
      type: DataTypes.DATE(6),
      allowNull: false,
    },
  },
  {
    tableName: "session",
    timestamps: false, // connect-pg-simple manages expiry itself
  },
);

module.exports = Session;
