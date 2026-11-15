/* =====================================================================
   Space Mission Cube — user interface
   ---------------------------------------------------------------------
   Screens:  Mission Select → 3D Workshop (the "cube") → Solved!
             → 3D Launch + playable finale → NASA Reveal
   (The Spacecraft Hangar home page lives in hangar.js. When the player
    comes here from a diagnostic, "repairCtx" remembers which spacecraft
    and finding sent them, so the game can show it and send them back.)
   ===================================================================== */

(function () {
  const $ = (id) => document.getElementById(id);
  const app = $("app");
  const E = window.Engine;
  const has3D = () => window.Viewer3D && Viewer3D.available();
  // Difficulty level of this page (js/level.js)
  const LV = window.LEVEL || { id: "intermediate", name: "Intermediate", icon: "🚀", hints: Infinity, easyLocked: false, easyDefault: true, numbersOpen: false, glossify: null };
  const gl = (t) => (LV.glossify ? LV.glossify(t) : esc(t));

  let timerHandle = null;
  let volume = 0.7;   // master volume 0–1 (the slider in the top bar)
  let muted = false;
  let lastSwappedSlot = null;
  let repairCtx = null; // set when a Hangar diagnostic sent the player here

  /* ---------------- Small helpers ---------------- */
  const fmt = (n, decimals = 0) =>
    typeof n === "number" ? n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : n;

  function fmtTime(ms) {
    const total = ms / 1000;
    const m = Math.floor(total / 60);
    const s = (total % 60).toFixed(1).padStart(4, "0");
    return `${String(m).padStart(2, "0")}:${s}`;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* Explanations: escape, then add thousands separators (2065 → 2,065) */
  const whyText = (s) => esc(s).replace(/\b\d{4,}\b/g, (d) => Number(d).toLocaleString("en-US"));

  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  /* ---------------- Sound effects (js/audio.js synthesises them) ---------------- */
  const S = (name) => window.Sound && Sound.play(name);
  const beep = (freq, duration = 0.08, type = "sine", delay = 0, vol = 0.08) => window.Sound && Sound.tone(freq, duration, type, delay, vol);
  const sfx = {
    click: () => S("click"), good: () => S("good"), bad: () => S("bad"), win: () => S("win"), scan: () => S("scanStart"),
    swap: () => S("swap"), alarm: () => S("alarm"), tick: () => S("scanTick"), safe: () => S("safe"), done: () => S("scanDone"),
    whoosh: () => S("whoosh"), open: () => S("open"), explode: () => S("explode"), assemble: () => S("assemble"),
    clank: () => S("clank"), hover: () => S("hover"),
  };

  /* ---------------- Toasts ---------------- */
  function toast(html, kind = "info", ms = 4200) {
    const colors = {
      info: "border-cyan-400/50 bg-space-800/95",
      bad: "border-rose-500/60 bg-rose-950/95",
      good: "border-emerald-400/60 bg-emerald-950/95",
      hint: "border-amber-400/60 bg-amber-950/95",
    };
    const el = document.createElement("div");
    el.className = `toast rounded-xl border px-4 py-3 text-sm shadow-xl ${colors[kind]}`;
    el.innerHTML = html;
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  /* ---------------- HUD & timer ---------------- */
  function showHud(show) {
    $("hud").classList.toggle("hidden", !show);
    $("hud").classList.toggle("flex", show);
  }
  function updateHud() {
    $("timer").textContent = fmtTime(E.elapsed());
    $("moves").textContent = E.state.moves;
  }
  function startTimerLoop() {
    clearInterval(timerHandle);
    timerHandle = setInterval(updateHud, 100);
  }

  /* ---------------- Modal ---------------- */
  function showModal(html, borderClass = "border-emerald-400/40") {
    $("modalCard").className = `modal-card w-full max-w-md rounded-2xl border ${borderClass} bg-space-900 p-6 text-center`;
    $("modalCard").innerHTML = html;
    $("modal").classList.remove("hidden");
    $("modal").classList.add("flex");
  }
  function hideModal() {
    $("modal").classList.add("hidden");
    $("modal").classList.remove("flex");
  }

  /* Stop everything game-related (used when switching to the Hangar) */
  function leaveGame() {
    clearInterval(timerHandle);
    showHud(false);
    closeDrawer();
    hideModal();
    if (has3D()) Viewer3D.pause();
  }

  /* =====================================================================
     SCREEN 1 — Mission select
     ===================================================================== */
  function renderMenu() {
    clearInterval(timerHandle);
    showHud(false);
    closeDrawer();
    if (has3D()) Viewer3D.pause();
    if (window.Inspector) Inspector.pause();
    repairCtx = null;
    try { history.replaceState(null, "", "#workshop"); } catch (e) { /* ignore */ }
    const best = E.loadBest();

    app.innerHTML = `
      <button id="menuHangar" class="text-xs text-cyan-300 hover:text-cyan-200 mb-4">← Back to the Spacecraft Hangar</button>
      <section class="text-center max-w-3xl mx-auto mb-8">
        <p class="font-display text-xs tracking-[0.3em] text-cyan-400 mb-3">NASA SPACE APPS CHALLENGE 2026</p>
        <h1 class="font-display text-3xl sm:text-5xl font-black text-white mb-4">Trade-Off Workshop</h1>
        <p class="text-lg text-slate-300 mb-2">Fix broken spacecraft in 3D, then launch them and fly the mission!</p>
        <p class="text-slate-400">Every spacecraft below has a problem. Swap its parts until every checklist answer is
          <b class="text-emerald-300">YES</b>. Careful: like a Rubik's cube, fixing one thing can break another.</p>
        <a href="tutorial.html" class="inline-flex items-center gap-2 mt-5 rounded-lg border border-cyan-400/50 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-400/10">📘 New here? Read the tutorial first</a>
      </section>

      <section class="grid gap-5 md:grid-cols-3">
        ${window.MISSIONS.map((m) => {
          const b = best[m.id];
          return `
          <button class="mission-card text-left rounded-2xl border border-slate-600/40 bg-space-900/80 p-5 flex flex-col" data-mission="${m.id}">
            <div class="flex items-center justify-between mb-3">
              <span class="text-4xl">${m.icon}</span>
              <span class="text-[10px] font-display tracking-widest px-2 py-1 rounded-full border border-cyan-400/40 text-cyan-300">${m.difficulty.toUpperCase()}</span>
            </div>
            <p class="text-xs text-cyan-400 font-semibold mb-1">${m.tag}</p>
            <h2 class="font-display text-lg text-white mb-2">${m.title}</h2>
            <p class="text-sm text-slate-400 mb-4 flex-1">${m.briefing}</p>
            <p class="text-xs text-slate-300 mb-1 font-semibold">What's wrong:</p>
            <ul class="text-xs text-rose-300 space-y-1 mb-3">
              ${m.problems.map((p) => `<li>⚠ ${p}</li>`).join("")}
            </ul>
            <p class="text-xs text-emerald-300/90 mb-4">🎮 Finale: ${{ "mars-rover": "drive your rover through a dust storm", "deep-space-telescope": "unfold your telescope in space", "lunar-lander": "pilot your lander to a touchdown" }[m.id]}</p>
            <div class="flex items-center justify-between text-xs border-t border-slate-700/60 pt-3">
              <span class="text-slate-400">Par: <b class="text-white">${E.par(m)} moves</b></span>
              <span class="text-slate-400">${b ? `Best: <b class="text-emerald-300">${b.bestMoves} moves · ${fmtTime(b.bestTime)}</b>` : "Not solved yet"}</span>
            </div>
          </button>`;
        }).join("")}
      </section>

      <section class="mt-10 grid gap-4 sm:grid-cols-4 text-sm">
        ${[
          ["1. Read the checklist", "Each ✗ is a problem, explained in plain words."],
          ["2. Click a part", "Click the 3D spacecraft (or the parts list) to swap a component."],
          ["3. Get all YES", "When every answer is ✓ YES, the mission is ready."],
          ["4. Launch & fly", "Launch it and play the mission with YOUR design."],
        ].map(([t, d]) => `
          <div class="rounded-xl border border-slate-700/60 bg-space-900/60 p-4" data-reveal>
            <p class="font-display text-cyan-300 text-xs mb-1">${t}</p><p class="text-slate-400">${d}</p>
          </div>`).join("")}
      </section>`;

    app.querySelectorAll("[data-mission]").forEach((btn) =>
      btn.addEventListener("click", () => {
        sfx.click();
        startMission(window.MISSIONS.find((m) => m.id === btn.dataset.mission));
      })
    );
    $("menuHangar").addEventListener("click", () => { sfx.click(); Hangar.render(); });
  }

  /* =====================================================================
     SCREEN 2 — 3D workshop (the cube)
     ===================================================================== */
  function startMission(mission, ctx) {
    if (arguments.length > 1) repairCtx = ctx || null;
    if (window.Inspector) Inspector.pause();
    try { history.replaceState(null, "", "#" + mission.id); } catch (e) { /* ignore */ }
    E.start(mission);
    lastSwappedSlot = null;
    showHud(true);
    $("par").textContent = E.par(mission);
    updateHud();
    startTimerLoop();
    if (has3D()) Viewer3D.resume();
    renderDashboard();
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!storage.get("smc-welcomed")) showWelcome();
  }

  /* First-time quick guide */
  function showWelcome() {
    showModal(`
      <p class="font-display text-xs tracking-[0.3em] text-cyan-300 mb-2">WELCOME, ENGINEER</p>
      <h2 class="font-display text-2xl text-white mb-4">How to play</h2>
      <ol class="text-left text-sm text-slate-300 space-y-3 mb-5">
        <li><b class="text-white">1. Look at the Mission Checklist.</b> Every <span class="text-rose-300">✗</span> is a problem, with a tip on how to fix it.</li>
        <li><b class="text-white">2. Click a part</b> on the 3D spacecraft (or in the parts list) to choose a different one. Each swap = 1 move.</li>
        <li><b class="text-white">3. Watch out!</b> Fixing one problem can create another, just like twisting a Rubik's cube.</li>
        <li><b class="text-white">4. Turn every answer into <span class="text-emerald-300">✓ YES</span></b>, then launch and fly your mission in 3D!</li>
      </ol>
      <div class="flex flex-col sm:flex-row gap-2">
        <button id="welcomeGo" class="flex-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-space-950 font-semibold px-4 py-3">Got it, let's go!</button>
        <a href="tutorial.html" class="flex-1 rounded-lg border border-slate-500/60 px-4 py-3 hover:bg-white/5">Full tutorial</a>
      </div>`, "border-cyan-400/40");
    $("welcomeGo").addEventListener("click", () => {
      storage.set("smc-welcomed", "1");
      hideModal();
    });
  }

  function renderDashboard() {
    const st = E.state;
    const m = st.mission;
    const parts = E.partsFor(m, st.sel);
    const constraints = E.current();
    const okCount = constraints.filter((c) => c.ok).length;
    const total = constraints.length;

    app.innerHTML = `
      <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p class="text-xs text-cyan-400 font-semibold">${m.icon} ${m.tag}</p>
          <h1 class="font-display text-2xl sm:text-3xl text-white">${m.title}</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          <button id="hintBtn" class="rounded-lg border border-amber-400/50 text-amber-300 px-3 py-2 text-sm hover:bg-amber-400/10">💡 Hint</button>
          <button id="resetBtn" class="rounded-lg border border-slate-500/50 px-3 py-2 text-sm hover:bg-white/5">↺ Start over</button>
          <a href="tutorial.html" target="_blank" rel="noopener" class="rounded-lg border border-cyan-400/40 text-cyan-200 px-3 py-2 text-sm hover:bg-cyan-400/10">📘 Tutorial</a>
        </div>
      </div>

      ${repairCtx ? repairBannerHtml(m) : ""}

      <!-- Goal + progress -->
      <div class="rounded-xl border border-slate-700/60 bg-space-900/80 px-4 py-3 mb-5">
        <div class="flex flex-wrap items-center justify-between gap-2 text-sm mb-2">
          <span><b class="text-white">🎯 Your goal:</b> <span class="text-slate-300">turn every checklist answer into <b class="text-emerald-300">✓ YES</b>.</span></span>
          <span class="font-display text-xs ${okCount === total ? "text-emerald-300" : "text-slate-300"}">${okCount} / ${total} YES</span>
        </div>
        <div class="gauge-track"><div class="gauge-fill ${okCount === total ? "ok" : "progress"}" style="width:${(okCount / total) * 100}%"></div></div>
      </div>

      <div class="grid gap-5 lg:grid-cols-5">
        <!-- 3D spacecraft -->
        <section class="lg:col-span-3">
          <div id="viewer" class="viewer relative h-[320px] sm:h-[440px] rounded-2xl overflow-hidden border border-cyan-500/30 bg-space-900">
            ${has3D() ? "" : `<div class="absolute inset-0 flex items-center justify-center p-6 text-center text-slate-400 text-sm">3D view needs an internet connection to load. You can still play using the parts list below.</div>`}
            <div class="absolute top-2 left-2 right-2 flex flex-wrap gap-2 pointer-events-none z-10">
              <span class="viewer-pill">🖱️ Drag to rotate</span><span class="viewer-pill">🔍 Scroll / pinch to zoom</span><span class="viewer-pill text-cyan-200">👆 Click a part to swap it</span>
            </div>
            <span class="viewer-pill absolute bottom-2 left-2 z-10 pointer-events-none">🚀 The rocket on the left is not to scale</span>
            <div id="viewerTip" class="viewer-tip hidden"></div>
          </div>
        </section>

        <!-- Plain-language checklist -->
        <section class="lg:col-span-2">
          <h2 class="font-display text-sm tracking-widest text-slate-400 mb-3">MISSION CHECKLIST</h2>
          <div class="space-y-2">${constraints.map(checkItemHtml).join("")}</div>
        </section>
      </div>

      <!-- Parts list -->
      <h2 class="font-display text-sm tracking-widest text-slate-400 mt-8 mb-3">SPACECRAFT PARTS <span class="text-slate-500 normal-case tracking-normal font-sans text-xs">(click one to swap it)</span></h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        ${m.slots.map((slot) => {
          const opt = parts[slot.id];
          return `
          <button class="slot-card text-left rounded-xl border border-slate-600/50 bg-space-900/80 p-4 ${lastSwappedSlot === slot.id ? "swapped" : ""}" data-slot="${slot.id}">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-display tracking-wider text-cyan-400">${slot.icon} ${slot.label.toUpperCase()}</span>
              <span class="text-[10px] text-cyan-300/80">Swap ›</span>
            </div>
            <p class="font-semibold text-white mb-2">${esc(opt.name)}</p>
            <div class="flex flex-wrap gap-1">${statChips(slot, opt)}</div>
          </button>`;
        }).join("")}
        <div class="rounded-xl border border-dashed border-slate-600/50 p-4 text-sm text-slate-400">
          <b class="text-slate-300">Can't change:</b> ${m.fixed.label}
          <div class="flex flex-wrap gap-1 mt-2"><span class="chip">${fmt(m.fixed.mass)} kg</span>
          ${m.fixed.draw ? `<span class="chip">−${fmt(m.fixed.draw)} W</span>` : ""}
          <span class="chip">$${fmt(m.fixed.cost)}M</span></div>
        </div>
      </div>

      <div class="grid gap-5 lg:grid-cols-2 mt-8">
        <details class="rounded-xl border border-slate-700/60 bg-space-900/60 p-4" ${(storage.get("smc-numbers-" + LV.id) || (LV.numbersOpen ? "open" : "")) === "open" ? "open" : ""} id="numbersBox">
          <summary class="cursor-pointer font-display text-sm tracking-widest text-slate-300">📊 SHOW THE NUMBERS</summary>
          <div class="space-y-3 mt-4">${constraints.map(gaugeHtml).join("")}</div>
        </details>
        <div>
          <h2 class="font-display text-sm tracking-widest text-slate-400 mb-3">MOVE LOG</h2>
          <div class="rounded-xl border border-slate-700/60 bg-space-900/60 p-3 max-h-72 overflow-y-auto text-sm space-y-2">
            ${st.log.length
              ? st.log.map((l) => `
                <div class="border-b border-slate-800 pb-2 last:border-0">
                  <span class="font-display text-cyan-400 text-xs">#${l.n}</span>
                  <span class="text-slate-300">${esc(l.slot)}: ${esc(l.from)} → <b class="text-white">${esc(l.to)}</b></span>
                  ${l.fixed.map((c) => `<span class="block text-emerald-300 text-xs">✓ Fixed: ${esc(c.question || c.label)}</span>`).join("")}
                  ${l.broke.map((c) => `<span class="block text-rose-300 text-xs">✗ Broke: ${esc(c.question || c.label)} ${whyText(c.why)}</span>`).join("")}
                </div>`).join("")
              : `<p class="text-slate-500">No moves yet. The timer starts on your first swap.</p>`}
          </div>
        </div>
      </div>`;

    // Wire up the parts list and checklist buttons
    app.querySelectorAll("[data-slot]").forEach((btn) =>
      btn.addEventListener("click", () => { sfx.click(); openDrawer(btn.dataset.slot); })
    );
    app.querySelectorAll("[data-open]").forEach((btn) =>
      btn.addEventListener("click", () => { sfx.click(); openDrawer(btn.dataset.open); })
    );
    // Hovering a checklist item lights up the 3D parts that affect it
    app.querySelectorAll("[data-affects]").forEach((item) => {
      item.addEventListener("mouseenter", () => has3D() && Viewer3D.highlight(item.dataset.affects.split(",")));
      item.addEventListener("mouseleave", () => has3D() && Viewer3D.highlight([]));
    });
    $("numbersBox").addEventListener("toggle", (e) => storage.set("smc-numbers-" + LV.id, e.target.open ? "open" : "closed"));
    $("resetBtn").addEventListener("click", () => { sfx.click(); startMission(m); });
    $("hintBtn").addEventListener("click", showHint);
    if ($("repairBack")) $("repairBack").addEventListener("click", () => { sfx.click(); Hangar.returnFromWorkshop(repairCtx.craftId, false); });

    // 3D view
    if (has3D()) {
      Viewer3D.mount($("viewer"));
      Viewer3D.show(m, st.sel, lastSwappedSlot);
      // Coming from a diagnostic: the related part glows until the first move
      Viewer3D.highlight(repairCtx && repairCtx.slot && st.moves === 0 ? [repairCtx.slot] : []);
      Viewer3D.onPick((slot) => { sfx.click(); openDrawer(slot); });
      Viewer3D.onHover((slot, e) => {
        const tip = $("viewerTip");
        if (!tip) return;
        if (!slot) return tip.classList.add("hidden");
        const s = m.slots.find((x) => x.id === slot);
        const r = $("viewer").getBoundingClientRect();
        tip.innerHTML = `<b>${s.icon} ${s.label}</b><br>${esc(E.partsFor(m, E.state.sel)[slot].name)}<br><span class="text-cyan-300">Click to swap</span>`;
        tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 190) + "px";
        tip.style.top = Math.min(e.clientY - r.top + 14, r.height - 80) + "px";
        tip.classList.remove("hidden");
      });
    }
  }

  /* "Repair order" banner shown when a Hangar diagnostic sent the player here */
  function repairBannerHtml(m) {
    const c = repairCtx;
    const slot = c.slot && m.slots.find((s) => s.id === c.slot);
    const sevName = { C: "Critical", H: "High", M: "Medium", L: "Low" }[c.sev];
    return `
      <div class="repair-banner rounded-xl border border-rose-400/50 bg-rose-500/10 px-4 py-3 mb-4 flex flex-wrap items-start gap-3">
        <div class="flex-1 min-w-[240px]">
          <p class="font-display text-xs tracking-widest text-rose-300 mb-1">🛠 ${c.reading ? "REPAIR ORDER FROM THE" : "SENT HERE FROM THE"} ${esc(c.craftName.toUpperCase())} ${c.reading ? "DIAGNOSTIC" : "INSPECTION"}</p>
          ${c.reading
            ? `<p class="text-sm text-white mb-1">${sevName ? `<span class="sev sev-${c.sev}">${sevName}</span> ` : ""}<b>${esc(c.itemName)}:</b> ${esc(c.reading)}</p>`
            : `<p class="text-sm text-white mb-1">Exploring: <b>${esc(c.itemName || c.craftName)}</b></p>`}
          <p class="text-xs text-slate-300">Engineers fix problems by redesigning the whole spacecraft, because every part affects the others.
            ${slot ? `The related part here is the <b class="text-white">${slot.icon} ${slot.label}</b>${E.state.moves === 0 ? " (glowing)" : ""}.` : ""}
            Turn every checklist answer into <b class="text-emerald-300">✓ YES</b>, then re-run the diagnostic.</p>
        </div>
        <button id="repairBack" class="rounded-lg border border-slate-500/60 px-3 py-2 text-xs hover:bg-white/5 shrink-0">🛰 Back to ${esc(c.craftName)}</button>
      </div>`;
  }

  /* One plain-language checklist row */
  function checkItemHtml(c) {
    const m = E.state.mission;
    const affects = (c.affects || []).filter((id) => m.slots.some((s) => s.id === id));
    if (c.ok) {
      return `
        <div class="check-item ok rounded-xl border border-emerald-400/30 bg-emerald-950/20 px-4 py-3 flex items-center gap-3" data-affects="${affects.join(",")}">
          <span class="check-icon ok">✓</span>
          <span class="text-sm text-slate-200 flex-1">${esc(c.question || c.label)}</span>
          <span class="font-display text-xs text-emerald-300">YES</span>
        </div>`;
    }
    return `
      <div class="check-item bad rounded-xl border border-rose-500/50 bg-rose-950/30 px-4 py-3" data-affects="${affects.join(",")}">
        <div class="flex items-center gap-3">
          <span class="check-icon bad">✗</span>
          <span class="text-sm text-white font-semibold flex-1">${esc(c.question || c.label)}</span>
          <span class="font-display text-xs text-rose-300">NO</span>
        </div>
        <p class="text-xs text-rose-200 mt-2 ml-9">${LV.glossify ? gl(String(c.why).replace(/\b\d{4,}\b/g, (d) => Number(d).toLocaleString("en-US"))) : whyText(c.why)}</p>
        ${c.fix ? `<p class="text-xs text-amber-200 mt-1 ml-9">💡 ${gl(c.fix)}</p>` : ""}
        ${affects.length ? `<div class="flex flex-wrap gap-1 mt-2 ml-9"><span class="text-[11px] text-slate-400 mr-1">Parts to try:</span>
          ${affects.map((id) => { const s = m.slots.find((x) => x.id === id); return `<button data-open="${id}" class="part-chip">${s.icon} ${s.label}</button>`; }).join("")}</div>` : ""}
      </div>`;
  }

  /* Build one gauge card for a constraint (inside "Show the numbers") */
  function gaugeHtml(c) {
    const cls = c.ok ? "ok" : "bad";
    if (c.type === "bool") {
      return `
        <div class="gauge-card ${cls} rounded-xl border bg-space-900/80 p-4">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-white">${c.label}</span>
            <span class="font-display text-sm ${c.ok ? "text-emerald-300" : "text-rose-400"}">${c.ok ? "✓ YES" : "✗ NO"}</span>
          </div>
          <p class="text-[11px] text-slate-500 mt-2">${esc(c.learn)}</p>
        </div>`;
    }
    // The limit tick sits at 80% of the bar so going over is visible.
    const ratio = c.value / c.limit;
    const width = Math.max(3, Math.min(ratio * 80, 100));
    const comparison = c.type === "max" ? "≤" : "≥";
    return `
      <div class="gauge-card ${cls} rounded-xl border bg-space-900/80 p-4">
        <div class="flex items-baseline justify-between mb-2 gap-2">
          <span class="font-semibold text-white">${c.label}</span>
          <span class="text-sm tabular-nums ${c.ok ? "text-emerald-300" : "text-rose-400"}">
            ${fmt(c.value, c.decimals)} <span class="text-slate-400">${comparison} ${fmt(c.limit, c.decimals)} ${c.unit}</span>
          </span>
        </div>
        <div class="gauge-track"><div class="gauge-fill ${cls}" style="width:${width}%"></div><div class="gauge-limit" style="left:80%"></div></div>
        <div class="flex justify-between text-[10px] text-slate-500 mt-1"><span>${c.type === "max" ? "Must stay under the white line" : "Must reach the white line"}</span><span>${c.limitLabel}: ${fmt(c.limit, c.decimals)} ${c.unit}</span></div>
        <p class="text-[11px] text-slate-500 mt-2">📚 ${esc(c.learn)}</p>
      </div>`;
  }

  /* Small labelled numbers for a component option */
  function statChips(slot, opt, compare) {
    const defs = [
      ["cap", (v) => `lifts ${fmt(v)} kg`],
      ["width", (v) => `${v} m wide`],
      ["mass", (v) => `${fmt(v)} kg`],
      ["prop", (v) => `${fmt(v)} kg fuel`],
      ["isp", (v) => `efficiency ${v} s`],
      ["gen", (v) => `makes ${fmt(v)} W${opt.solar ? " (in sun)" : ""}`],
      ["buffer", (v) => `+${v} W reserve`],
      ["draw", (v) => `uses ${fmt(v)} W`],
      ["energy", (v) => (slot.id === "battery" ? `stores ${v} kWh` : `uses ${v} kWh`)],
      ["sci", (v) => `${v} science`],
      ["link", (v) => `sends ${v} pts`],
      ["cost", (v) => `$${fmt(v)}M`],
    ];
    return defs
      .filter(([k]) => opt[k] != null)
      .map(([k, f]) => {
        let delta = "";
        if (compare && compare[k] != null && compare !== opt && opt[k] !== compare[k]) {
          const d = opt[k] - compare[k];
          // For mass, power use, width and cost, going up is bad. For everything else, going up is good.
          const upIsBad = ["mass", "draw", "cost", "width", "energy"].includes(k) && !(k === "energy" && slot.id === "battery");
          const good = upIsBad ? d < 0 : d > 0;
          delta = ` <span class="${good ? "delta-down" : "delta-up"}">(${d > 0 ? "+" : ""}${fmt(+d.toFixed(1))})</span>`;
        }
        return `<span class="chip">${f(opt[k])}${delta}</span>`;
      })
      .join("");
  }

  /* ---------------- Drawer: choose a different component ---------------- */
  function openDrawer(slotId) {
    const st = E.state;
    const m = st.mission;
    if (st.solved) return;
    const slot = m.slots.find((s) => s.id === slotId);
    const current = slot.options.find((o) => o.id === st.sel[slotId]);
    const preview = $("previewToggle").checked;
    const now = E.current();

    $("drawerTitle").textContent = `${slot.icon} ${slot.label}`;
    $("drawerOptions").innerHTML = slot.options.map((opt) => {
      const isCurrent = opt.id === current.id;
      let previewHtml = "";
      if (preview && !isCurrent) {
        const after = E.evaluate(m, { ...st.sel, [slotId]: opt.id });
        const fixes = after.filter((c, i) => c.ok && !now[i].ok).map((c) => `<span class="text-emerald-300">✓ fixes: ${esc(c.question || c.label)}</span>`);
        const breaks = after.filter((c, i) => !c.ok && now[i].ok).map((c) => `<span class="text-rose-300">✗ breaks: ${esc(c.question || c.label)}</span>`);
        previewHtml = `<div class="mt-2 text-xs flex flex-col gap-0.5">${[...fixes, ...breaks].join("") || '<span class="text-slate-500">Doesn\'t change any checklist answer</span>'}</div>`;
      }
      return `
        <button class="option-card w-full text-left rounded-xl border p-4 ${isCurrent ? "border-cyan-400 bg-cyan-400/10 cursor-default" : "border-slate-600/50"}"
          data-option="${opt.id}" ${isCurrent ? "disabled" : ""}>
          <div class="flex items-start justify-between gap-2">
            <p class="font-semibold text-white">${esc(opt.name)}</p>
            ${isCurrent ? '<span class="text-[10px] font-display text-cyan-300 whitespace-nowrap">INSTALLED</span>' : '<span class="text-[10px] font-display text-slate-400 whitespace-nowrap">SWAP IN ›</span>'}
          </div>
          <p class="text-xs text-slate-400 mt-1 mb-2">${esc(opt.note)}</p>
          <div class="flex flex-wrap gap-1">${statChips(slot, opt, current)}</div>
          ${previewHtml}
        </button>`;
    }).join("");

    $("drawerOptions").querySelectorAll("[data-option]:not([disabled])").forEach((btn) =>
      btn.addEventListener("click", () => doMove(slotId, btn.dataset.option))
    );

    $("drawer").classList.add("open");
    $("drawer").setAttribute("aria-hidden", "false");
    $("drawerBackdrop").classList.remove("hidden");
  }

  function closeDrawer() {
    $("drawer").classList.remove("open");
    $("drawer").setAttribute("aria-hidden", "true");
    $("drawerBackdrop").classList.add("hidden");
  }

  /* ---------------- Making a move ---------------- */
  function doMove(slotId, optionId) {
    const result = E.move(slotId, optionId);
    closeDrawer();
    if (!result) return;
    lastSwappedSlot = slotId;
    sfx.swap();
    updateHud();
    renderDashboard();

    if (result.solved) {
      sfx.win();
      setTimeout(showWin, 600);
      return;
    }
    // Explain WHY the move broke something, like a Rubik's cube twist
    if (result.broke.length) {
      sfx.bad();
      toast(
        `<b class="text-rose-300">Fixing one thing broke another!</b><br>` +
          result.broke.map((c) => `<span class="text-slate-200">✗ ${esc(c.question || c.label)}</span><br><span class="text-slate-400">${whyText(c.why)}</span>`).join("<br>"),
        "bad",
        6500
      );
    } else if (result.fixed.length) {
      sfx.good();
      toast(`<b class="text-emerald-300">Nice! Fixed: ${result.fixed.map((c) => esc(c.question || c.label)).join(" & ")}</b>`, "good");
    } else {
      sfx.click();
      toast("That swap didn't change any checklist answer. Check the numbers to see what moved.", "info", 3500);
    }
  }

  /* ---------------- Hint ---------------- */
  function showHint() {
    const st = E.state;
    if (st.hints >= LV.hints) {
      sfx.bad();
      toast(`🧑‍🚀 <b>Advanced level:</b> only ${LV.hints} hint per mission. Check "Show the numbers" to work it out!`, "hint", 4500);
      return;
    }
    const slot = E.hint(st.mission, st.sel);
    if (!slot) return;
    st.hints += 1;
    sfx.click();
    toast(`💡 <b>Hint:</b> try changing the <b class="text-amber-300">${slot.icon} ${slot.label}</b>. It's glowing in 3D.`, "hint", 5000);
    const card = app.querySelector(`[data-slot="${slot.id}"]`);
    if (card) {
      card.classList.remove("hinted");
      void card.offsetWidth; // restart the animation
      card.classList.add("hinted");
    }
    if (has3D()) {
      Viewer3D.highlight([slot.id]);
      setTimeout(() => Viewer3D.highlight([]), 4500);
    }
  }

  /* =====================================================================
     SCREEN 3 — Solved! modal
     ===================================================================== */
  function showWin() {
    const st = E.state;
    const m = st.mission;
    const time = E.elapsed();
    const parMoves = E.par(m);
    const stars = E.stars(st.moves, parMoves);
    const saved = E.saveResult(m.id, st.moves, time);
    if (repairCtx && window.Hangar) Hangar.repaired.set(repairCtx.craftId, true);

    showModal(`
      <p class="font-display text-xs tracking-[0.3em] text-emerald-300 mb-2">ALL CHECKS PASSED</p>
      <h2 class="font-display text-3xl text-white mb-4">Solved! 🎉</h2>
      <div class="flex justify-center gap-2 mb-4">
        ${[1, 2, 3].map((i) => `<span class="star ${i <= stars ? "on" : ""}" style="animation-delay:${i * 0.15}s">⭐</span>`).join("")}
      </div>
      <div class="grid grid-cols-3 gap-2 mb-4">
        <div class="hud-box"><span class="hud-label">TIME</span><span class="hud-value">${fmtTime(time)}</span></div>
        <div class="hud-box"><span class="hud-label">MOVES</span><span class="hud-value">${st.moves}</span></div>
        <div class="hud-box"><span class="hud-label">PAR</span><span class="hud-value">${parMoves}</span></div>
      </div>
      <p class="text-sm text-slate-300 mb-1">
        ${st.moves <= parMoves ? "Perfect solve: you matched the fewest possible moves!" : `Can you solve it in ${parMoves} moves? There is more than one way!`}
      </p>
      ${st.hints ? `<p class="text-xs text-amber-300 mb-1">Hints used: ${st.hints}</p>` : ""}
      ${saved.newBestMoves || saved.newBestTime ? `<p class="text-xs text-emerald-300 mb-1">🏆 New personal best${saved.newBestMoves && saved.newBestTime ? "s" : ""}!</p>` : ""}
      <div class="flex flex-col gap-2 mt-5">
        ${has3D() ? `<button id="launchBtn" class="rounded-lg bg-emerald-400 hover:bg-emerald-300 text-space-950 font-bold px-4 py-3 font-display tracking-wider">🚀 LAUNCH THE MISSION!</button>` : ""}
        ${repairCtx ? `<button id="rescanBtn" class="rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-semibold px-4 py-2.5 text-sm">🩺 Back to ${esc(repairCtx.craftName)}: re-run the diagnostic</button>` : ""}
        <div class="flex gap-2">
          <button id="revealBtn" class="flex-1 rounded-lg border border-cyan-400/50 text-cyan-200 px-4 py-2.5 hover:bg-cyan-400/10 text-sm">Skip to NASA reveal</button>
          <button id="againBtn" class="flex-1 rounded-lg border border-slate-500/60 px-4 py-2.5 hover:bg-white/5 text-sm">Play again</button>
        </div>
      </div>`);
    if (has3D()) {
      $("launchBtn").addEventListener("click", () => {
        hideModal();
        sfx.whoosh();
        Viewer3D.pause();
        Finale3D.start(m, { ...st.sel }, () => renderReveal());
      });
    }
    $("revealBtn").addEventListener("click", () => { hideModal(); renderReveal(); });
    if ($("rescanBtn")) $("rescanBtn").addEventListener("click", () => { hideModal(); Hangar.returnFromWorkshop(repairCtx.craftId, true); });
    $("againBtn").addEventListener("click", () => { hideModal(); startMission(m); });
  }

  /* =====================================================================
     SCREEN 4 — The reveal: your design vs. what NASA built
     ===================================================================== */
  function renderReveal() {
    clearInterval(timerHandle);
    if (has3D()) Viewer3D.pause();
    const st = E.state;
    const m = st.mission;
    const parts = E.partsFor(m, st.sel);
    // A slot counts as "changed" only if it ends up different from the scrambled start
    const changed = new Set(m.slots.filter((s) => st.sel[s.id] !== m.start[s.id]).map((s) => s.label));
    const otherSolutions = E.solutions(m).filter((s) => E.distance(m, s, st.sel) > 0).length;

    app.innerHTML = `
      <p class="font-display text-xs tracking-[0.3em] text-cyan-400 mb-2">THE REVEAL</p>
      <h1 class="font-display text-2xl sm:text-4xl text-white mb-2">Your Design vs. What NASA Actually Built</h1>
      <p class="text-slate-400 mb-6">Real mission: <b class="text-white">${m.nasa.name}</b></p>

      <div class="rounded-2xl border border-slate-700/60 bg-space-900/80 overflow-hidden mb-8">
        <div class="grid grid-cols-3 bg-space-800 text-xs font-display tracking-wider text-slate-400">
          <div class="p-3">SYSTEM</div><div class="p-3 text-cyan-300">YOUR FIXED DESIGN</div><div class="p-3 text-amber-300">WHAT NASA BUILT</div>
        </div>
        ${m.slots.map((slot) => `
          <div class="grid grid-cols-3 border-t border-slate-800 text-sm">
            <div class="p-3 text-slate-300">${slot.icon} ${slot.label}</div>
            <div class="p-3 text-white">${esc(parts[slot.id].name)} ${changed.has(slot.label) ? '<span class="text-[10px] text-cyan-400">(you changed this)</span>' : ""}</div>
            <div class="p-3 text-slate-300">${esc(m.nasa.design[slot.id] || "–")}</div>
          </div>`).join("")}
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2 rounded-2xl border border-amber-400/30 bg-space-900/80 p-5">
          <h2 class="font-display text-lg text-amber-300 mb-3">Why NASA made these choices</h2>
          <ul class="space-y-3 text-slate-300">
            ${m.nasa.why.map((w) => `<li class="flex gap-2"><span class="text-amber-300">▸</span><span>${esc(w)}</span></li>`).join("")}
          </ul>
        </section>
        <section class="rounded-2xl border border-cyan-400/30 bg-space-900/80 p-5">
          <h2 class="font-display text-lg text-cyan-300 mb-3">Engineering lesson</h2>
          <p class="text-sm text-slate-300 mb-3">There is rarely one perfect design. This puzzle has
            <b class="text-white">${E.solutions(m).length} different valid designs</b>${otherSolutions ? `, so ${otherSolutions} other way${otherSolutions > 1 ? "s" : ""} to solve it besides yours` : ""}.
            Real engineers compare options like these in "trade studies" before picking one.</p>
          <h3 class="text-xs font-display text-slate-400 mt-4 mb-2">SOURCES</h3>
          <ul class="text-sm space-y-1">
            ${m.nasa.sources.map((s) => `<li><a class="text-cyan-300 underline hover:text-cyan-200" href="${s.url}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join("")}
          </ul>
        </section>
      </div>

      <div class="flex flex-wrap gap-3 mt-8">
        <button id="replayBtn" class="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-space-950 font-semibold px-5 py-3">↺ Try to beat par</button>
        ${repairCtx ? `<button id="revealRescan" class="rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-semibold px-5 py-3">🩺 Back to ${esc(repairCtx.craftName)}: re-run the diagnostic</button>` : ""}
        <button id="menuBtn" class="rounded-lg border border-slate-500/60 px-5 py-3 hover:bg-white/5">Choose another mission</button>
      </div>`;

    $("replayBtn").addEventListener("click", () => startMission(m));
    $("menuBtn").addEventListener("click", renderMenu);
    if ($("revealRescan")) $("revealRescan").addEventListener("click", () => Hangar.returnFromWorkshop(repairCtx.craftId, true));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------------- Global wiring ---------------- */
  $("homeBtn").addEventListener("click", () => Hangar.render());
  $("navHangar").addEventListener("click", () => { sfx.click(); Hangar.render(); });
  $("navWorkshop").addEventListener("click", () => { sfx.click(); renderMenu(); });
  $("drawerClose").addEventListener("click", closeDrawer);
  $("drawerBackdrop").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
  /* ---------------- Volume slider ---------------- */
  const volSlider = $("volume");
  function showVolume() {
    const pct = muted ? 0 : Math.round(volume * 100);
    $("soundBtn").textContent = pct === 0 ? "🔇" : pct < 34 ? "🔈" : pct < 67 ? "🔉" : "🔊";
    $("soundBtn").title = muted ? "Unmute" : "Mute";
    volSlider.value = pct;
    volSlider.style.setProperty("--vol", pct + "%");
    $("volVal").textContent = pct + "%";
    if (window.Sound) { Sound.setVolume(volume); Sound.setMuted(muted); }
  }
  const savedVol = storage.get("smc-volume");
  if (savedVol != null && !isNaN(+savedVol)) volume = Math.min(1, Math.max(0, +savedVol / 100));
  muted = storage.get("smc-muted") === "1";
  showVolume();
  let lastPreview = 0;
  volSlider.addEventListener("input", () => {
    volume = volSlider.value / 100;
    muted = false;
    storage.set("smc-volume", volSlider.value);
    storage.set("smc-muted", "0");
    showVolume();
    if (performance.now() - lastPreview > 120) { lastPreview = performance.now(); beep(660, 0.06, "sine", 0, 0.08); }
  });
  $("soundBtn").addEventListener("click", () => {
    muted = !muted;
    if (!muted && volume === 0) volume = 0.5;
    storage.set("smc-muted", muted ? "1" : "0");
    showVolume();
    if (!muted) sfx.good();
  });

  // Easy mode (preview of what each option fixes/breaks) is ON by default
  const pref = storage.get("smc-easy-" + LV.id) ?? (LV.easyDefault ? "1" : "0");
  $("previewToggle").checked = pref == null ? true : pref === "1";
  $("previewToggle").addEventListener("change", (e) => storage.set("smc-easy-" + LV.id, e.target.checked ? "1" : "0"));
  if (LV.easyLocked) {               // Beginner: Easy mode always on
    $("previewToggle").checked = true;
    $("previewToggle").disabled = true;
    $("previewToggle").parentElement.title = "Always on at Beginner level: each choice shows what it would fix or break";
  }

  // Shared with the Spacecraft Hangar (hangar.js)
  window.UI = { startMission, renderMenu, leaveGame, sfx, toast, esc, storage };

  /* Start-up routing (runs once hangar.js has loaded too):
       index.html#mars-rover     → straight into a workshop mission
       index.html#craft-hubble   → inspect a spacecraft
       index.html#workshop       → the workshop mission list
       index.html                → the Spacecraft Hangar */
  window.addEventListener("DOMContentLoaded", () => {
    const h = location.hash.slice(1);
    const mission = window.MISSIONS.find((m) => m.id === h);
    const craft = window.SPACECRAFT && window.SPACECRAFT.find((c) => "craft-" + c.id === h);
    if (mission) startMission(mission);
    else if (craft) Hangar.inspect(craft);
    else if (h === "workshop") renderMenu();
    else Hangar.render();
  });
})();
