/* =====================================================================
   Space Mission Cube — themes
   ---------------------------------------------------------------------
   Loaded in <head> so the right theme is set before the page draws.
   12 themes. Each one sets:
     <html data-skin="nebula">   colours (see the THEMES section in styles.css)
     <html data-theme="dark">    dark or light, which also decides the 3D scenery
                                 (dark = on location in space, light = clean room)
   • First visit: follows the computer's dark/light setting
   • The 🎨 button ([data-theme-toggle]) opens a picker; the choice is remembered
   • Fires a "themechange" event so the 3D views can restyle themselves
   ===================================================================== */

(function () {
  const KEY = "smc-skin";
  const root = document.documentElement;
  const SKINS = [
    { id: "deep-space", name: "Deep Space", mode: "dark", sw: ["#22d3ee", "#1e3a8a", "#04060f"] },
    { id: "clean-room", name: "Clean Room", mode: "light", sw: ["#0891b2", "#c7d2fe", "#eef2f8"] },
    { id: "nebula", name: "Nebula", mode: "dark", sw: ["#c084fc", "#db2777", "#0b0414"] },
    { id: "aurora", name: "Aurora", mode: "dark", sw: ["#34d399", "#22d3ee", "#021412"] },
    { id: "mars-dust", name: "Mars Dust", mode: "dark", sw: ["#fb923c", "#c2410c", "#140805"] },
    { id: "solar-flare", name: "Solar Flare", mode: "dark", sw: ["#fbbf24", "#ef4444", "#120a02"] },
    { id: "ocean-world", name: "Ocean World", mode: "dark", sw: ["#38bdf8", "#14b8a6", "#020b1a"] },
    { id: "neon-city", name: "Neon City", mode: "dark", sw: ["#f472b6", "#06b6d4", "#07020f"] },
    { id: "sunset-orbit", name: "Sunset Orbit", mode: "dark", sw: ["#fb7185", "#f97316", "#12060d"] },
    { id: "lunar-silver", name: "Lunar Silver", mode: "dark", sw: ["#e2e8f0", "#64748b", "#08090c"] },
    { id: "arctic", name: "Arctic Ice", mode: "light", sw: ["#0284c7", "#99f6e4", "#eef6fb"] },
    { id: "retro-nasa", name: "Retro NASA", mode: "light", sw: ["#dc2626", "#fde68a", "#f6efe2"] },
  ];
  const read = () => { try { return localStorage.getItem(KEY) || (localStorage.getItem("smc-theme") === "light" ? "clean-room" : localStorage.getItem("smc-theme") ? "deep-space" : null); } catch (e) { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch (e) { /* ignore */ } };
  const systemSkin = () => (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "clean-room" : "deep-space");
  const byId = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

  function set(id, save) {
    const skin = byId(id);
    root.dataset.skin = skin.id;
    root.dataset.theme = skin.mode;
    root.style.colorScheme = skin.mode;
    if (save) write(skin.id);
    updateButtons();
    markPicker();
    window.dispatchEvent(new Event("themechange"));
  }

  function updateButtons() {
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
      b.innerHTML = "🎨";
      b.title = `Theme: ${byId(root.dataset.skin).name} (click to change)`;
      b.setAttribute("aria-label", "Choose a theme");
      b.setAttribute("aria-haspopup", "true");
    });
  }

  /* ---------- The theme picker (a floating glass panel) ---------- */
  let picker = null;
  function buildPicker() {
    picker = document.createElement("div");
    picker.className = "theme-picker";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "Choose a theme");
    picker.innerHTML = `
      <p class="theme-picker-title">Choose a theme</p>
      <div class="theme-grid">
        ${SKINS.map((s) => `
          <button type="button" class="theme-swatch" data-skin-id="${s.id}" title="${s.name}">
            <span class="theme-dot" style="background: radial-gradient(circle at 30% 30%, ${s.sw[0]}, ${s.sw[1]} 55%, ${s.sw[2]})"></span>
            <span class="theme-name">${s.name}</span>
            <span class="theme-mode">${s.mode === "light" ? "☀️" : "🌙"}</span>
          </button>`).join("")}
      </div>`;
    document.body.appendChild(picker);
    picker.addEventListener("click", (e) => {
      const b = e.target.closest("[data-skin-id]");
      if (b) { set(b.dataset.skinId, true); if (window.Sound) Sound.play("theme"); }
    });
    markPicker();
  }
  function markPicker() {
    if (!picker) return;
    picker.querySelectorAll("[data-skin-id]").forEach((b) => b.classList.toggle("active", b.dataset.skinId === root.dataset.skin));
  }
  function openPicker(btn) {
    if (!picker) buildPicker();
    const r = btn.getBoundingClientRect();
    picker.style.top = r.bottom + 10 + "px";
    picker.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    picker.classList.add("open");
  }
  const closePicker = () => picker && picker.classList.remove("open");

  set(read() || systemSkin(), false);

  if (window.matchMedia) {
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (!read()) set(systemSkin(), false); });
  }

  document.addEventListener("DOMContentLoaded", () => {
    updateButtons();
    document.querySelectorAll("[data-theme-toggle]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (picker && picker.classList.contains("open")) closePicker(); else openPicker(b);
      }));
    document.addEventListener("click", (e) => { if (picker && !picker.contains(e.target)) closePicker(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePicker(); });
  });

  /* Read a colour from the current theme (used by the 3D views) */
  const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();

  window.SMCTheme = { set: (t) => set(t, true), current: () => root.dataset.theme, skin: () => root.dataset.skin, skins: SKINS, cssVar };
})();
