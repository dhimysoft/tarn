// models/user.model.js — the User table.
//
// Same shape as the TTP capstone User model: UUID primary key, bcrypt hash
// only, and a toJSON override so the hash can never leak into a response.
//
// Unlike the capstone version there is no auth0Id column. TARN has one
// way in — email and password — and an unused nullable column on a table
// holding health-adjacent data is a liability, not a convenience.

const { DataTypes } = require("sequelize");
const db = require("../db");

const User = db.define(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },

    // Optional. Collected only because a greeting reads better with it, and
    // the privacy rule is to collect the minimum necessary.
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },

    // Stores only the bcrypt hash, never the original password.
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // Set when the user asks for deletion. The row is removed for real, but
    // this lets a scheduled job handle deletion asynchronously later without
    // a schema change.
    deletionRequestedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "users",
  },
);

// Never let the password hash into a JSON response.
User.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.passwordHash;
  return values;
};

module.exports = User;
