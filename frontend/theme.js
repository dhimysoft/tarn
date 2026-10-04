/**
 * theme.js — dark/light theme switching.
 *
 * Loaded as a BLOCKING script in <head>, before any stylesheet paints, so the
 * saved theme is applied before first paint. Deferring this causes the page to
 * flash dark and then snap to light, which is worse than not having the feature.
 *
 * Three states:
 *   "dark"  — the user chose dark
 *   "light" — the user chose light
 *   absent  — no choice made, so the operating system decides via
 *             prefers-color-scheme (handled entirely in CSS)
 *
 * The preference is kept in localStorage. That is appropriate here: it is a
 * display setting, not authentication and not journal content, which the
 * product rules keep out of local storage.
 */

(function () {
  var STORAGE_KEY = "aura_theme";

  function stored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      // Private browsing, or storage disabled. Fall back to the OS preference.
      return null;
    }
  }

  function apply(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  // Runs immediately, before first paint.
  apply(stored());

  function currentlyLight() {
    var explicit = document.documentElement.getAttribute("data-theme");
    if (explicit) return explicit === "light";
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  }

  function wireToggle() {
    var button = document.getElementById("theme-toggle");
    if (!button) return;

    function label() {
      var next = currentlyLight() ? "dark" : "light";
      button.setAttribute("aria-label", "Switch to " + next + " theme");
      // aria-pressed would be wrong here — this is not an on/off toggle, it
      // cycles between two named themes, so the label carries the meaning.
    }

    label();

    button.addEventListener("click", function () {
      var next = currentlyLight() ? "dark" : "light";
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (e) {
        // Preference simply will not persist. The switch still works.
      }
      label();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireToggle);
  } else {
    wireToggle();
  }
})();
