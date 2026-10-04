// models/userConsent.model.js — a record of what the user agreed to, and when.
//
// Consent is stored as an append-only log rather than a boolean on the user
// row. If the wording of a notice changes, an old "true" would silently claim
// the user agreed to text they never saw. Each row therefore records WHICH
// version of WHICH notice was accepted, and withdrawal is a new row, not an
// edit — so the history of what someone agreed to stays intact.

const { DataTypes } = require("sequelize");
const db = require("../db");

const UserConsent = db.define(
  "UserConsent",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    // What was being agreed to.
    consentType: {
      type: DataTypes.ENUM(
        "product_limitations", // the "not medical advice" notice
        "privacy_notice",
        "data_import",         // bringing old browser entries in
      ),
      allowNull: false,
    },

    // Which wording. Bump this whenever the text changes so old consents are
    // not treated as agreement to new terms.
    consentVersion: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    granted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    grantedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    // Set on the withdrawal row, not by editing the original.
    withdrawnAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "user_consents",
    indexes: [{ fields: ["userId", "consentType"] }],
  },
);

module.exports = UserConsent;
