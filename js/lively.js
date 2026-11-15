/* =====================================================================
   Space Mission Cube — "lively" page effects (every page)
   ---------------------------------------------------------------------
   • Glowing colour orbs drift behind the Liquid Glass (and lean gently
     away from the mouse, like looking through a window)
   • The glass sheen follows the mouse (--mx / --my)
   • A soft ripple where you click
   • Sections float in as you scroll to them ([data-reveal])
   ===================================================================== */

(function () {
  const root = document.documentElement;
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Mouse-following sheen + backdrop parallax (at most once per frame)
  let raf = 0, mx = 0, my = 0;
  window.addEventListener("pointermove", (e) => {
    mx = e.clientX; my = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      root.style.setProperty("--mx", mx + "px");
      root.style.setProperty("--my", my + "px");
      if (!still) {
        root.style.setProperty("--px", ((mx / innerWidth - 0.5) * -36).toFixed(1) + "px");
        root.style.setProperty("--py", ((my / innerHeight - 0.5) * -36).toFixed(1) + "px");
      }
    });
  }, { passive: true });

  // Click ripple
  window.addEventListener("pointerdown", (e) => {
    if (still || !e.target.closest || !e.target.closest("button, a, [data-item], label")) return;
    const r = document.createElement("span");
    r.className = "ripple";
    r.style.left = e.clientX + "px";
    r.style.top = e.clientY + "px";
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 650);
  }, { passive: true });

  // Float-in on scroll
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("revealed"); io.unobserve(en.target); }
      }), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" })
    : null;
  function scan() {
    document.querySelectorAll("[data-reveal]:not(.revealed)").forEach((el) => (io ? io.observe(el) : el.classList.add("revealed")));
  }
  let pending = false;
  const later = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; scan(); }); } };

  document.addEventListener("DOMContentLoaded", () => {
    // The drifting colour orbs behind everything
    if (!document.querySelector(".backdrop")) {
      const b = document.createElement("div");
      b.className = "backdrop";
      b.setAttribute("aria-hidden", "true");
      b.innerHTML = '<div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div><div class="orb o4"></div>';
      document.body.prepend(b);
    }
    scan();
    new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  });

  window.Lively = { scan };
})();
