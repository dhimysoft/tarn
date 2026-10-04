// middleware/requireAuth.js — who is making this request?
//
// Same job as the TTP capstone middleware of the same name, with the identity
// coming from the server-side session rather than a JWT.
//
// Every route that touches a user's own data goes through this, and every
// query downstream filters on req.user.id — never on an id taken from the URL
// or the body. That is what keeps one account's records out of another's.

const { User } = require("../models");

async function requireAuth(req, res, next) {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const user = await User.findByPk(userId);

    // The session referenced a user who no longer exists — deleted account, or
    // a database restored from an older backup. Clear it rather than 500ing.
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Authentication required." });
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireAuth };
