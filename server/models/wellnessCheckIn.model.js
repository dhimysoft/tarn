// models/wellnessCheckIn.model.js — one daily check-in.
//
// Every column here is a number the user chose on a slider. Nothing is
// inferred, measured, or diagnosed. The names say "reported" where that is not
// already obvious, so a future reader does not mistake these for observations.

const { DataTypes } = require("sequelize");
const db = require("../db");

// All five reported signals use the same 1-10 scale.
//
// This MUST be a factory returning a fresh object, not one shared object.
// Sequelize mutates each attribute definition to attach its column name, so
// passing the same object five times makes all five collapse onto whichever
// was defined last — the INSERT then writes "sleepQuality" five times and the
// other four columns are never sent at all.
const signal = () => ({
  type: DataTypes.INTEGER,
  allowNull: false,
  validate: { min: 1, max: 10 },
});

const WellnessCheckIn = db.define(
  "WellnessCheckIn",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },

    // Non-null and enforced at the database level. Every private record
    // belongs to exactly one user.
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    sleepQuality: signal(),
    stressLevel: signal(),
    mood: signal(),
    energy: signal(),
    focus: signal(),

    // Optional. Asked for, never required, and never used to infer a condition.
    anxietyIntensity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 0, max: 10 },
    },

    studyHours: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: true,
      validate: { min: 0, max: 24 },
    },

    workHours: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: true,
      validate: { min: 0, max: 24 },
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // The snapshot is stored rather than recomputed, so a past entry keeps the
    // number the user actually saw even if the weights are ever changed. The
    // formula that produced it is published in docs/PRODUCT_BOUNDARIES.md.
    snapshotScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 0, max: 100 },
    },

    // Set only on rows brought in from the old browser storage, so an import
    // can never run twice and imported rows stay distinguishable from ones
    // entered in the app.
    importChecksum: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "wellness_check_ins",
    indexes: [
      // The dashboard always reads "this user's entries, newest first".
      { fields: ["userId", "createdAt"] },
      // Makes the duplicate-import guard a constraint rather than a convention.
      { unique: true, fields: ["userId", "importChecksum"], name: "wellness_check_ins_user_import_unique" },
    ],
  },
);

module.exports = WellnessCheckIn;
