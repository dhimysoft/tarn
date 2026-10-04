// middleware/errorHandler.js — one place every error ends up.
//
// Express knows this is the error handler because it takes four arguments.
//
// The rule: tell the client what THEY did wrong, never what the server looks
// like inside. 4xx messages are useful and safe, so they pass through. 5xx
// messages routinely carry database details, file paths and driver internals,
// so those go to the log and the client gets one sentence.

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    // Log the method and path, never the body — a request body here may hold
    // check-in notes, which are exactly what must stay out of logs.
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  const isClientError = status >= 400 && status < 500;

  res.status(status).json({
    error: isClientError ? err.message || "Invalid request." : "Something went wrong on the server.",
  });
}

function notFound(req, res) {
  res.status(404).json({ error: "Not found" });
}

module.exports = { errorHandler, notFound };
