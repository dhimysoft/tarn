// models/index.js — collects the models and declares how they relate.
//
// Same convention as the TTP capstones: every model is defined in its own
// file, and associations live here in one place so the shape of the data is
// readable without opening five files.

const db = require("../db");

const User = require("./user.model");
const WellnessCheckIn = require("./wellnessCheckIn.model");
const UserConsent = require("./userConsent.model");
const Session = require("./session.model");

// A user has many check-ins; each check-in belongs to exactly one user.
// onDelete: "CASCADE" is what makes "delete my account" actually delete the
// data, rather than leaving orphaned rows behind.
User.hasMany(WellnessCheckIn, { foreignKey: "userId", onDelete: "CASCADE" });
WellnessCheckIn.belongsTo(User, { foreignKey: "userId" });

User.hasMany(UserConsent, { foreignKey: "userId", onDelete: "CASCADE" });
UserConsent.belongsTo(User, { foreignKey: "userId" });

module.exports = { db, User, WellnessCheckIn, UserConsent, Session };
