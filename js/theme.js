/* =====================================================================
   Space Mission Cube — dark / light mode
   ---------------------------------------------------------------------
   Loaded in <head> so the right theme is set before the page draws.
   • First visit: follows the computer's setting (dark or light)
   • Clicking a  [data-theme-toggle]  button switches and remembers it
   • Fires a "themechange" event so the 3D view can change its scenery
   ===================================================================== */

(function () {
  const KEY = "smc-theme";
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch (e) { /* ignore */ } };
  const systemTheme = () => (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");

  function set(theme, save) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    if (save) write(theme);
    updateButtons();
    window.dispatchEvent(new Event("themechange"));
  }

  function updateButtons() {
    const light = root.dataset.theme === "light";
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
      b.innerHTML = light ? "🌙" : "☀️";
      const label = light ? "Switch to dark mode" : "Switch to light mode";
      b.title = label;
      b.setAttribute("aria-label", label);
    });
  }

  set(read() || systemTheme(), false);

  // Follow the computer's setting until the player picks one themselves
  if (window.matchMedia) {
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
      if (!read()) set(systemTheme(), false);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    updateButtons();
    document.querySelectorAll("[data-theme-toggle]").forEach((b) =>
      b.addEventListener("click", () => set(root.dataset.theme === "light" ? "dark" : "light", true))
    );
  });

  window.SMCTheme = { set: (t) => set(t, true), current: () => root.dataset.theme };
})();
