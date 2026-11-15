/* =====================================================================
   Space Mission Cube — Spacecraft Hangar (the home page)
   ---------------------------------------------------------------------
   SCREEN A  Hangar: choose a real spacecraft
   SCREEN B  Inspector: 3D view + parts & connections list.
             Click a part for its overview and vulnerabilities.
             Diagnose = scan every part and connection with a live feed.
             Dangerous findings lead straight into the Trade-Off Workshop
             (the game), and back again to re-run the diagnostic.
   ===================================================================== */

(function () {
  const $ = (id) => document.getElementById(id);
  const app = $("app");
  const UI = window.UI;
  const esc = UI.esc;
  const has3D = () => window.Inspector && Inspector.available();
  const LV = window.LEVEL || { id: "intermediate", name: "Intermediate", icon: "🚀", dangers: [5, 7], scanMs: [170, 290], dangerMs: 700,
    sevInFeed: true, simple: false, maxVulns: 99, simpleFor: () => null, glossify: (t) => UI.esc(t), reading: null };
  const dangerText = LV.dangers[0] === LV.dangers[1] ? `${LV.dangers[0]} dangers` : `${LV.dangers[0]}–${LV.dangers[1]} dangers`;

  const SEV = {
    C: { label: "Critical", rank: 4 },
    H: { label: "High", rank: 3 },
    M: { label: "Medium", rank: 2 },
    L: { label: "Low", rank: 1 },
  };
  const sevBadge = (s) => `<span class="sev sev-${s}">${SEV[s].label}</span>`;
  const worst = (item) => item.vulns.reduce((w, v) => (SEV[v[0]].rank > SEV[w].rank ? v[0] : w), "L");
  const byRank = (a, b) => SEV[b[0]].rank - SEV[a[0]].rank;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const thumbs = { dark: {}, light: {} };
  const theme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

  /* Spacecraft fixed in the workshop (saved in the browser) */
  const repaired = {
    all: () => { try { return JSON.parse(UI.storage.get("smc-repaired") || "{}"); } catch (e) { return {}; } },
    has: (id) => !!repaired.all()[id],
    set(id, on) {
      const r = repaired.all();
      if (on) r[id] = true; else delete r[id];
      UI.storage.set("smc-repaired", JSON.stringify(r));
    },
  };

  /* What the inspector is showing right now */
  let S = null;        // { craft, tab, filter, diag }
  let runToken = 0;    // cancels a running diagnostic when you leave

  const find = (craft, id) => {
    const p = craft.parts.find((x) => x.id === id);
    if (p) return { kind: "part", item: p };
    const c = craft.connections.find((x) => x.id === id);
    return c ? { kind: "conn", item: c } : null;
  };
  const partName = (craft, id) => (craft.parts.find((p) => p.id === id) || {}).name || id;
  const missionOf = (craft) => window.MISSIONS.find((m) => m.id === craft.mission);
  const slotLabel = (craft, slot) => {
    const s = slot && missionOf(craft).slots.find((x) => x.id === slot);
    return s ? `${s.icon} ${s.label}` : null;
  };

  function setHash(h) {
    try { history.replaceState(null, "", h ? "#" + h : location.pathname + location.search); } catch (e) { /* file:// in some browsers */ }
  }

  /* =====================================================================
     SCREEN A — Hangar
     ===================================================================== */
  function renderHangar() {
    runToken++;
    UI.leaveGame();
    if (has3D()) Inspector.pause();
    closeInfo();
    setHash("");
    S = null;

    app.innerHTML = `
      <section class="text-center max-w-3xl mx-auto mb-8">
        <p class="font-display text-xs tracking-[0.3em] text-cyan-400 mb-3">NASA SPACE APPS CHALLENGE 2026 · ${LV.icon} ${LV.name.toUpperCase()} LEVEL</p>
        <h1 class="font-display text-3xl sm:text-5xl font-black text-white mb-4">Spacecraft Hangar</h1>
        <p class="text-lg text-slate-300 mb-2">${LV.id === "beginner"
          ? "Pick a real spacecraft. Look at every part in 3D, find out what could go wrong, then fix it."
          : LV.id === "advanced"
          ? "Select a flight article. Inspect every subsystem and interface, run full fault detection, then re-engineer the design."
          : "Pick a real spacecraft. Explore every part in 3D, run a diagnostic, then fix what it finds."}</p>
        ${LV.id === "beginner" ? `<p class="text-sm text-emerald-300 mb-2">🌱 Beginner level: simple words, and <span class="gloss" tabindex="0" data-def="Like this! Hover over or tap a dotted word to see what it means.">dotted words</span> explain themselves.</p>` : ""}
        <p class="text-slate-400">Each part shows what it does and how it can fail. Dangerous findings go straight to the
          <b class="text-cyan-300">Trade-Off Workshop</b>, where you redesign the spacecraft like a Rubik's cube.</p>
      </section>

      <section class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        ${window.SPACECRAFT.map((c) => {
          const m = missionOf(c);
          const fixed = repaired.has(c.id);
          return `
          <button class="mission-card craft-card card-in text-left rounded-2xl border border-slate-600/40 bg-space-900/80 overflow-hidden flex flex-col" style="--i:${window.SPACECRAFT.indexOf(c)}" data-craft="${c.id}">
            <span class="card-glare" aria-hidden="true"></span>
            <div class="craft-thumb relative">
              <img data-thumb="${c.id}" alt="3D model of ${esc(c.full)}" class="w-full h-full object-cover ${thumbs[theme()][c.id] ? "" : "opacity-0"}" ${thumbs[theme()][c.id] ? `src="${thumbs[theme()][c.id]}"` : ""} />
              <span class="absolute top-2 left-2 text-[10px] font-display tracking-widest px-2 py-1 rounded-full bg-black/55 text-cyan-200">${esc(c.type.toUpperCase())}</span>
              ${fixed ? `<span class="absolute top-2 right-2 text-[10px] font-display tracking-widest px-2 py-1 rounded-full bg-emerald-500/90 text-space-950">✓ REPAIRED</span>` : ""}
            </div>
            <div class="p-5 flex flex-col flex-1">
              <p class="text-xs text-cyan-400 font-semibold mb-1">${c.icon} Launched ${c.launched}</p>
              <h2 class="font-display text-lg text-white mb-1">${esc(c.name)}</h2>
              <p class="text-xs text-slate-400 mb-3">${esc(c.full)}</p>
              <p class="text-sm text-slate-300 mb-4 flex-1">${esc(c.blurb)}</p>
              <div class="flex flex-wrap gap-1 mb-3">
                <span class="chip">${c.parts.length} parts</span>
                <span class="chip">${c.connections.length} connections</span>
                <span class="chip">${c.parts.reduce((n, p) => n + p.vulns.length, 0) + c.connections.reduce((n, k) => n + k.vulns.length, 0)} known risks</span>
              </div>
              <p class="text-xs text-slate-400 border-t border-slate-700/60 pt-3">🧩 Repairs in: <b class="text-slate-200">${m.icon} ${esc(m.title)}</b></p>
            </div>
          </button>`;
        }).join("")}
      </section>

      <section class="mt-10 grid gap-4 sm:grid-cols-4 text-sm">
        ${[
          ["1. Inspect", "Rotate and zoom the 3D model. Hover any part to see its name."],
          ["2. Learn the risks", "Click a part or connection to see what it does and how it can fail."],
          ["3. Diagnose", "Scan the whole spacecraft. Dangerous parts and links light up red."],
          ["4. Fix it", "Click a red finding to redesign the spacecraft in the Trade-Off Workshop."],
        ].map(([t, d]) => `
          <div class="rounded-xl border border-slate-700/60 bg-space-900/60 p-4" data-reveal>
            <p class="font-display text-cyan-300 text-xs mb-1">${t}</p><p class="text-slate-400">${d}</p>
          </div>`).join("")}
      </section>

      <div class="text-center mt-8">
        <button id="toWorkshop" class="rounded-lg border border-cyan-400/50 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-400/10">🧩 Skip straight to the Trade-Off Workshop missions</button>
      </div>`;

    app.querySelectorAll("[data-craft]").forEach((btn) =>
      btn.addEventListener("click", () => {
        UI.sfx.click();
        renderInspector(window.SPACECRAFT.find((c) => c.id === btn.dataset.craft));
      })
    );
    $("toWorkshop").addEventListener("click", () => { UI.sfx.click(); UI.renderMenu(); });
    tiltCards();
    app.querySelectorAll(".craft-card").forEach((c) => c.addEventListener("pointerenter", () => UI.sfx.hover()));
    enterScreen();
    makeThumbs();
    window.scrollTo({ top: 0 });
  }

  /* Cards lean towards the mouse in 3D, with a light glare that follows it */
  function tiltCards() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    app.querySelectorAll(".craft-card").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(900px) rotateY(${x * 9}deg) rotateX(${-y * 9}deg) translateY(-4px)`;
        card.style.setProperty("--gx", (x + 0.5) * 100 + "%");
        card.style.setProperty("--gy", (y + 0.5) * 100 + "%");
      });
      card.addEventListener("pointerleave", () => (card.style.transform = ""));
    });
  }
  /* Fade + slide each new hangar screen in */
  function enterScreen() {
    app.classList.remove("screen-in");
    void app.offsetWidth;
    app.classList.add("screen-in");
  }

  /* Draw a 3D still of each spacecraft for its card (one per frame so the page stays smooth) */
  function makeThumbs() {
    if (!has3D()) return;
    const t = theme();
    const todo = window.SPACECRAFT.filter((c) => !thumbs[t][c.id]);
    const token = runToken;
    const next = () => {
      if (token !== runToken || !todo.length) return;
      const c = todo.shift();
      try { thumbs[t][c.id] = Inspector.snapshot(c); } catch (e) { return; }
      const img = app.querySelector(`[data-thumb="${c.id}"]`);
      if (img) { img.src = thumbs[t][c.id]; img.classList.remove("opacity-0"); }
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }

  /* =====================================================================
     SCREEN B — Inspector
     ===================================================================== */
  function renderInspector(craft, opts = {}) {
    runToken++;
    UI.leaveGame();
    closeInfo();
    setHash("craft-" + craft.id);
    // A fresh, random set of problems every time a spacecraft is opened (at least 5).
    // Straight after a workshop repair, the re-scan is clean so you can see your fix worked.
    const justFixed = !!opts.autoDiagnose && repaired.has(craft.id);
    if (!justFixed && repaired.has(craft.id)) repaired.set(craft.id, false); // a new mission year, new problems
    S = { craft, tab: opts.autoDiagnose ? "diag" : "parts", filter: "", diag: null, faults: justFixed ? {} : pickFaults(craft), justFixed };
    const m = missionOf(craft);
    const fixed = repaired.has(craft.id);

    app.innerHTML = `
      <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <button id="backHangar" class="text-xs text-cyan-300 hover:text-cyan-200 mb-1">← Back to the hangar</button>
          <p class="text-xs text-cyan-400 font-semibold">${craft.icon} ${esc(craft.type)} · launched ${craft.launched}</p>
          <h1 class="font-display text-2xl sm:text-3xl text-white">${esc(craft.full)}</h1>
          ${fixed ? `<p class="text-xs text-emerald-300 mt-1">✓ Repaired in the Trade-Off Workshop</p>` : ""}
        </div>
        <div class="flex flex-wrap gap-2">
          <button id="resetView" class="rounded-lg border border-slate-500/50 px-3 py-2 text-sm hover:bg-white/5">⟲ Reset view</button>
          <button id="explodeBtn" class="rounded-lg border border-cyan-400/50 text-cyan-200 px-3 py-2 text-sm hover:bg-cyan-400/10">💥 Exploded view</button>
          <button id="diagBtn" class="diag-btn rounded-lg px-4 py-2 text-sm font-bold font-display tracking-wider">🩺 DIAGNOSE</button>
        </div>
      </div>

      <div class="grid gap-5 lg:grid-cols-3">
        <section class="lg:col-span-2">
          <div id="insViewer" class="viewer relative h-[340px] sm:h-[520px] rounded-2xl overflow-hidden border border-cyan-500/30 bg-space-900">
            ${has3D() ? "" : `<div class="absolute inset-0 flex items-center justify-center p-6 text-center text-slate-400 text-sm">The 3D view needs an internet connection to load. You can still use the parts list.</div>`}
            <div class="absolute top-2 left-2 right-2 flex flex-wrap gap-2 pointer-events-none z-10">
              <span class="viewer-pill">🖱️ Drag to rotate</span><span class="viewer-pill">🔍 Scroll / pinch to zoom</span><span class="viewer-pill text-cyan-200">👆 Hover a part, click for details</span>
            </div>
            <div id="scanStatus" class="viewer-pill scan-pill absolute bottom-2 left-2 z-10 pointer-events-none hidden"></div>
            <div id="legend" class="absolute bottom-2 right-2 z-10 pointer-events-none hidden flex gap-2">
              <span class="viewer-pill"><span class="dot dot-red"></span> Dangerous</span>
            </div>
            <div id="insTip" class="viewer-tip hidden"></div>
          </div>
          ${craft.id === "hubble" ? `<p class="text-xs text-slate-500 mt-2">Hubble's tube is drawn as a cut-away so you can see the mirrors and instruments inside.</p>` : ""}

          <div class="grid gap-3 grid-cols-2 sm:grid-cols-5 mt-4">
            ${craft.facts.map(([k, v]) => `<div class="rounded-xl border border-slate-700/60 bg-space-900/60 px-3 py-2"><p class="hud-label">${esc(k.toUpperCase())}</p><p class="text-sm text-white">${esc(v)}</p></div>`).join("")}
          </div>
          <p class="text-sm text-slate-400 mt-3">${esc(craft.status)}. Source: <a class="text-cyan-300 underline hover:text-cyan-200" href="${craft.source.url}" target="_blank" rel="noopener">${esc(craft.source.label)}</a></p>
        </section>

        <aside class="side-panel rounded-2xl border border-slate-700/60 bg-space-900/80 flex flex-col">
          <div class="flex border-b border-slate-700/60">
            <button class="side-tab flex-1" data-tab="parts">🧩 Parts & links</button>
            <button class="side-tab flex-1" data-tab="diag">🩺 Diagnostic</button>
          </div>
          <div id="sideBody" class="side-body p-3 overflow-y-auto"></div>
        </aside>
      </div>

      <p class="text-xs text-slate-500 mt-6">Repairs for this spacecraft happen in <b>${m.icon} ${esc(m.title)}</b>. Vulnerabilities marked "real" happened on the actual mission; diagnostic readings are simulated for the game.</p>`;

    $("backHangar").addEventListener("click", () => { UI.sfx.click(); renderHangar(); });
    $("diagBtn").addEventListener("click", () => runDiagnostic());
    $("resetView").addEventListener("click", () => has3D() && Inspector.frame());
    $("explodeBtn").addEventListener("click", () => {
      if (!has3D()) return;
      UI.sfx.click();
      const on = !Inspector.isExploded();
      Inspector.setExploded(on);
      if (on) UI.sfx.explode(); else { UI.sfx.assemble(); setTimeout(() => UI.sfx.clank(), 700); }
      $("explodeBtn").textContent = on ? "🧲 Put it back together" : "💥 Exploded view";
    });
    app.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; renderSide(); }));

    if (has3D()) {
      Inspector.mount($("insViewer"));
      Inspector.load(craft, { intro: true });
      // assembly sound: a rising hum and parts clicking into place
      UI.sfx.assemble();
      for (let i = 0; i < 9; i++) setTimeout(() => UI.sfx.clank(), 250 + i * 150 + Math.random() * 80);
      Inspector.onPick((hit) => { UI.sfx.click(); openInfo(hit.id); });
      Inspector.onHover((hit, e) => {
        const tip = $("insTip");
        if (!tip) return;
        if (!hit) return tip.classList.add("hidden");
        const f = find(craft, hit.id);
        const flagged = S.diag && S.diag.found[hit.id];
        const r = $("insViewer").getBoundingClientRect();
        tip.innerHTML = `<b>${esc(f.item.name)}</b><br><span class="text-slate-400">${f.kind === "conn" ? "Connection" : esc(f.item.group)}</span>
          ${flagged ? `<br><span class="text-rose-300">⚠ ${SEV[flagged.sev].label} finding</span>` : ""}<br><span class="text-cyan-300">Click for details</span>`;
        tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 200) + "px";
        tip.style.top = Math.min(e.clientY - r.top + 14, r.height - 90) + "px";
        tip.classList.remove("hidden");
      });
    }
    renderSide();
    enterScreen();
    window.scrollTo({ top: 0 });
    if (opts.autoDiagnose) setTimeout(() => runDiagnostic(), 2400);
  }

  /* ---------- Side panel ---------- */
  function renderSide() {
    if (!S) return;
    app.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === S.tab));
    const body = $("sideBody");
    if (S.tab === "parts") body.innerHTML = partsListHtml();
    else body.innerHTML = diagHtml();
    wireSide();
    if (S.tab === "parts") {
      const f = $("partFilter");
      f.addEventListener("input", () => {
        S.filter = f.value;
        const pos = f.selectionStart;
        renderSide();
        const nf = $("partFilter");
        nf.focus();
        nf.setSelectionRange(pos, pos);
      });
    }
  }

  function statusDot(id) {
    const d = S.diag;
    if (!d) return `<span class="dot"></span>`;
    if (d.found[id]) return `<span class="dot dot-red"></span>`;
    if (d.checked[id]) return `<span class="dot dot-green"></span>`;
    return `<span class="dot"></span>`;
  }

  function rowHtml(kind, item) {
    const flagged = S.diag && S.diag.found[item.id];
    const sub = kind === "conn" ? `${esc(partName(S.craft, item.a))} ↔ ${esc(partName(S.craft, item.b))}` : `${item.vulns.length} known risk${item.vulns.length > 1 ? "s" : ""}`;
    return `
      <button class="list-row ${flagged ? "flagged" : ""}" data-item="${item.id}">
        ${statusDot(item.id)}
        <span class="flex-1 min-w-0"><span class="block text-sm text-white truncate">${esc(item.name)}</span><span class="block text-[11px] text-slate-400 truncate">${sub}</span></span>
        ${flagged ? sevBadge(flagged.sev) : `<span class="text-[10px] text-slate-500">risk</span>${sevBadge(worst(item))}`}
      </button>`;
  }

  function partsListHtml() {
    const c = S.craft;
    const q = S.filter.trim().toLowerCase();
    const match = (x) => !q || x.name.toLowerCase().includes(q) || (x.group || "").toLowerCase().includes(q);
    const groups = [];
    c.parts.filter(match).forEach((p) => {
      let g = groups.find((x) => x.name === p.group);
      if (!g) groups.push((g = { name: p.group, items: [] }));
      g.items.push(p);
    });
    const conns = c.connections.filter(match);
    return `
      <input id="partFilter" type="search" placeholder="Search ${c.parts.length} parts & ${c.connections.length} connections…" value="${esc(S.filter)}"
        class="w-full rounded-lg bg-space-800 border border-slate-600/50 px-3 py-2 text-sm text-white placeholder-slate-500 mb-3" />
      ${groups.map((g) => `
        <p class="side-head">${esc(g.name.toUpperCase())}</p>
        ${g.items.map((p) => rowHtml("part", p)).join("")}`).join("")}
      ${conns.length ? `<p class="side-head mt-4">🔗 CONNECTIONS</p>${conns.map((k) => rowHtml("conn", k)).join("")}` : ""}
      ${!groups.length && !conns.length ? `<p class="text-sm text-slate-500 p-2">Nothing matches "${esc(S.filter)}".</p>` : ""}`;
  }

  function diagHtml() {
    const d = S.diag;
    const fixed = S.justFixed;
    if (!d) {
      return `
        <div class="p-2">
          <p class="font-display text-sm text-white mb-2">Run a full diagnostic</p>
          <p class="text-sm text-slate-400 mb-3">The scan checks every <b class="text-slate-200">part</b> and every <b class="text-slate-200">connection</b>
            (cables, joints, hinges and pipes) one by one. Safe ones turn <span class="text-emerald-300">green</span> here.
            Dangerous ones turn <span class="text-rose-300">red</span> here <b>and</b> glow red on the 3D model.</p>
          <p class="text-xs text-slate-400 mb-3">🎲 On ${LV.name} level every spacecraft hides <b class="text-slate-200">${dangerText}</b>, and they are different every time you open it.${LV.sevInFeed ? "" : " Severity stays hidden until you open a finding."}</p>
          ${fixed ? `<p class="text-sm text-emerald-300 mb-3">✓ You repaired this spacecraft in the workshop. Run the scan to check your fix!</p>` : ""}
          <button class="diag-btn w-full rounded-lg px-4 py-3 text-sm font-bold font-display tracking-wider" data-run>🩺 START DIAGNOSTIC</button>
        </div>`;
    }
    const pct = Math.round((d.done / d.total) * 100);
    const found = Object.keys(d.found);
    const counts = ["C", "H", "M", "L"].map((s) => [s, found.filter((id) => d.found[id].sev === s).length]).filter(([, n]) => n);
    let summary = "";
    if (!d.running) {
      summary = found.length
        ? `<div class="rounded-xl border border-rose-400/50 bg-rose-500/10 p-3 mb-3">
             <p class="font-display text-sm text-rose-300 mb-1">⚠ ${found.length} DANGEROUS · ${d.total - found.length} SAFE</p>
             <div class="flex flex-wrap gap-1 mb-2">${counts.map(([s, n]) => `<span class="sev sev-${s}">${n} ${SEV[s].label}</span>`).join("")}</div>
             <p class="text-xs text-slate-300 mb-3">Click any red item (here or on the 3D model) to see the problem, then fix it in the workshop.</p>
             <button class="w-full rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-semibold px-3 py-2 text-sm" data-fixworst>🔧 Fix the worst problem in the workshop</button>
           </div>`
        : `<div class="rounded-xl border border-emerald-400/50 bg-emerald-500/10 p-3 mb-3">
             <p class="font-display text-sm text-emerald-300 mb-1">✓ ALL ${d.total} CHECKS PASSED</p>
             <p class="text-xs text-slate-300 mb-3">${fixed ? "Your redesign in the workshop fixed every problem. Great engineering!" : "No dangerous findings this time."}</p>
             <button class="w-full rounded-lg border border-slate-500/60 px-3 py-2 text-sm hover:bg-white/5" data-run>🔁 Simulate another year in space (new problems)</button>
           </div>`;
    }
    return `
      ${summary}
      <div class="flex items-center justify-between text-xs mb-1">
        <span class="text-slate-300">${d.running ? "Scanning…" : "Scan complete"} ${d.done}/${d.total}</span>
        <span class="text-slate-400"><span class="text-emerald-300">${d.done - found.length} safe</span> · <span class="text-rose-300">${found.length} dangerous</span></span>
      </div>
      <div class="gauge-track mb-3"><div class="gauge-fill ${d.running ? "progress" : found.length ? "bad" : "ok"}" style="width:${pct}%"></div></div>
      ${!d.running ? `<button class="w-full rounded-lg border border-cyan-400/40 text-cyan-200 px-3 py-1.5 text-xs mb-3 hover:bg-cyan-400/10" data-run>↻ Run the diagnostic again</button>` : ""}
      <div id="feed" class="space-y-1">${d.log.map(feedRowHtml).join("")}</div>`;
  }

  function feedRowHtml(r) {
    const f = find(S.craft, r.id);
    const cls = r.state === "pending" ? "pending" : r.fault ? "danger" : "safe";
    const icon = r.state === "pending" ? `<span class="spin">◌</span>` : r.fault ? "✗" : "✓";
    const text = r.state === "pending" ? "Checking…" : r.fault ? esc(r.fault.reading) : esc(r.ok);
    return `
      <button class="feed-row ${cls}" data-item="${r.id}">
        <span class="feed-icon">${icon}</span>
        <span class="flex-1 min-w-0">
          <span class="flex items-center gap-1.5"><span class="feed-kind">${f.kind === "conn" ? "LINK" : "PART"}</span><span class="text-sm text-white truncate">${esc(f.item.name)}</span></span>
          <span class="block text-[11px] ${r.fault ? "text-rose-300" : r.state === "pending" ? "text-cyan-300" : "text-emerald-300/90"}">${r.state === "pending" ? text : (r.fault ? "DANGER · " : "SAFE · ") + text}</span>
        </span>
        ${r.fault ? (LV.sevInFeed || (S.diag && S.diag.viewed && S.diag.viewed[r.id]) ? sevBadge(r.fault.sev) : `<span class="sev sev-L" title="Open it to assess">?</span>`) : ""}
      </button>`;
  }

  function wireSide() {
    const body = $("sideBody");
    body.querySelectorAll("[data-item]").forEach((b) => {
      b.addEventListener("click", () => { UI.sfx.click(); openInfo(b.dataset.item, true); });
      b.addEventListener("mouseenter", () => has3D() && Inspector.setHover(b.dataset.item));
      b.addEventListener("mouseleave", () => has3D() && Inspector.setHover(null));
    });
    body.querySelectorAll("[data-run]").forEach((b) => b.addEventListener("click", () => runDiagnostic()));
    body.querySelectorAll("[data-fixworst]").forEach((b) => b.addEventListener("click", () => {
      const d = S.diag;
      const ids = Object.keys(d.found).sort((a, b) => SEV[d.found[b].sev].rank - SEV[d.found[a].sev].rank);
      const best = ids.find((id) => find(S.craft, id).item.slot) || ids[0];
      goWorkshop(best);
    }));

  }

  /* =====================================================================
     DIAGNOSTIC — checks every part and connection with a live feed
     ===================================================================== */
  const SAFE_PART = ["Telemetry nominal", "Temperature in range", "Voltage normal", "Self-test passed", "No faults found", "Within limits"];
  const SAFE_LINK = ["Continuity OK", "Signal clean", "Load within limits", "No leaks or shorts", "Current normal"];
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

  /* Choose the problems hiding in this spacecraft: 5 to 7, different every time.
     They come from two pools, shuffled together:
       • the hand-written faults in craftdata.js (many based on real events)
       • any known vulnerability of any part or connection, with a random sensor reading */
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const METRICS = [
    () => `sensor readings ${rnd(12, 48)}% outside safe limits`,
    () => `temperature ${rnd(6, 31)} °C above the limit`,
    () => `vibration ${(1.6 + Math.random() * 2.4).toFixed(1)}× normal`,
    () => `current draw up ${rnd(14, 60)}%`,
    () => `self-test failed ${rnd(1, 3)} of 5 checks`,
    () => `signal noise ${(1.8 + Math.random() * 3).toFixed(1)}× normal`,
    () => `wear indicator at ${rnd(71, 96)}%`,
    () => `response ${rnd(2, 9)}× slower than spec`,
    () => `pressure ${rnd(8, 35)}% off target`,
  ];
  function pickFaults(craft) {
    const auto = [];
    [...craft.parts, ...craft.connections].forEach((item) =>
      item.vulns.forEach((v) => auto.push({ id: item.id, sev: v[0], reading: LV.reading ? LV.reading(item, v) : `${v[1]} risk: ${pickOne(METRICS)()}.` })));
    const n = rnd(LV.dangers[0], LV.dangers[1]);
    const out = {};
    const take = (f) => { if (!out[f.id] && Object.keys(out).length < n) out[f.id] = f; };
    shuffle(craft.faults).slice(0, rnd(2, 4)).forEach((fl) => take(LV.id === "advanced"
      ? Object.assign({}, fl, { reading: `[FDIR ${rnd(10, 99)}-${rnd(100, 999)}] ${fl.reading}` }) : fl));
    shuffle(auto).forEach(take);
    // make sure at least one finding can be fixed in a matching workshop part
    if (!Object.keys(out).some((id) => find(craft, id).item.slot)) {
      const f = shuffle(auto).find((x) => find(craft, x.id).item.slot && !out[x.id]);
      if (f) { delete out[Object.keys(out)[0]]; out[f.id] = f; }
    }
    return out;
  }

  /* Scan order: each part, followed by the connections that start at it */
  function scanOrder(craft) {
    const order = [], seen = new Set();
    craft.parts.forEach((p) => {
      order.push(p.id);
      craft.connections.filter((c) => c.a === p.id).forEach((c) => { order.push(c.id); seen.add(c.id); });
    });
    craft.connections.forEach((c) => !seen.has(c.id) && order.push(c.id));
    return order;
  }

  async function runDiagnostic() {
    if (!S) return;
    const token = ++runToken;
    const craft = S.craft;
    // the first scan reveals the problems picked when you opened it; later scans roll new ones
    if (S.diag && !S.diag.running) { S.faults = pickFaults(craft); S.justFixed = false; }
    const faults = S.faults;
    const order = scanOrder(craft);
    S.diag = { running: true, total: order.length, done: 0, found: {}, checked: {}, log: [], faults };
    S.tab = "diag";
    closeInfo();
    if (has3D()) { Inspector.clearFlags(); Inspector.setScanning(true); }
    $("diagBtn").disabled = true;
    $("diagBtn").textContent = "🩺 SCANNING…";
    $("legend").classList.remove("hidden");
    $("scanStatus").classList.remove("hidden");
    renderSide();
    UI.sfx.scan();

    for (const id of order) {
      if (token !== runToken) return;
      const fault = faults[id];
      const row = { id, state: "pending", fault: null, ok: "" };
      S.diag.log.push(row);
      if (has3D()) Inspector.setScanId(id);
      const name = find(craft, id).item.name;
      $("scanStatus").textContent = `🩺 Checking ${name}…`;
      appendFeed(row);
      UI.sfx.tick();
      await wait(fault ? LV.dangerMs : LV.scanMs[0] + Math.random() * (LV.scanMs[1] - LV.scanMs[0]));
      if (token !== runToken) return;

      row.state = "done";
      if (fault) {
        row.fault = fault;
        S.diag.found[id] = fault;
        if (has3D()) Inspector.flag(id);
        UI.sfx.alarm();
      } else {
        row.ok = pickOne(find(craft, id).kind === "conn" ? SAFE_LINK : SAFE_PART);
        S.diag.checked[id] = true;
        if (has3D()) Inspector.pingSafe(id);
      }
      S.diag.done++;
      updateFeed(row);
    }

    if (has3D()) { Inspector.setScanId(null); Inspector.setScanning(false); }
    S.diag.running = false;
    const n = Object.keys(S.diag.found).length;
    $("diagBtn").disabled = false;
    $("diagBtn").textContent = "🩺 DIAGNOSE AGAIN";
    $("scanStatus").textContent = n ? `⚠ ${n} dangerous finding${n > 1 ? "s" : ""}: click the red parts` : "✓ All systems nominal";
    if (!n) $("legend").classList.add("hidden");
    if (n) { UI.sfx.done(); setTimeout(() => UI.sfx.alarm(), 250); } else UI.sfx.win();
    if (n && LV.id === "beginner") UI.toast("👉 <b>Click a red part</b> (in the list or on the 3D model) to see what's wrong and how to fix it.", "info", 6000);
    renderSide();
    const body = $("sideBody");
    if (body) body.scrollTop = 0;
  }

  /* Add / update one feed line without redrawing the whole panel */
  function appendFeed(row) {
    if (S.tab !== "diag") return;
    const feed = $("feed");
    if (!feed) return renderSide();
    feed.insertAdjacentHTML("beforeend", feedRowHtml(row));
    const el = feed.lastElementChild;
    el.addEventListener("click", () => openInfo(row.id, true));
    el.addEventListener("mouseenter", () => has3D() && Inspector.setHover(row.id));
    el.addEventListener("mouseleave", () => has3D() && Inspector.setHover(null));
    const body = $("sideBody");
    body.scrollTop = body.scrollHeight;
    updateProgress();
  }
  function updateFeed(row) {
    if (S.tab !== "diag") return;
    const feed = $("feed");
    if (!feed) return;
    const el = feed.querySelector(`[data-item="${row.id}"]:last-child`) || [...feed.querySelectorAll(`[data-item="${row.id}"]`)].pop();
    if (el) {
      el.outerHTML = feedRowHtml(row);
      const nel = [...feed.querySelectorAll(`[data-item="${row.id}"]`)].pop();
      nel.addEventListener("click", () => openInfo(row.id, true));
      nel.addEventListener("mouseenter", () => has3D() && Inspector.setHover(row.id));
      nel.addEventListener("mouseleave", () => has3D() && Inspector.setHover(null));
    }
    updateProgress();
  }
  function updateProgress() {
    const d = S.diag;
    const head = $("sideBody").querySelector(".gauge-fill");
    if (head) head.style.width = Math.round((d.done / d.total) * 100) + "%";
    const label = $("sideBody").querySelector(".flex.items-center.justify-between");
    const found = Object.keys(d.found).length;
    if (label) label.innerHTML = `<span class="text-slate-300">Scanning… ${d.done}/${d.total}</span>
      <span class="text-slate-400"><span class="text-emerald-300">${d.done - found} safe</span> · <span class="text-rose-300">${found} dangerous</span></span>`;
  }

  /* =====================================================================
     PART / CONNECTION POP-UP
     ===================================================================== */
  function openInfo(id, fromList) {
    if (!S) return;
    const craft = S.craft;
    const f = find(craft, id);
    if (!f) return;
    const it = f.item;
    const finding = S.diag && S.diag.found[id];
    const passed = S.diag && S.diag.checked[id];
    if (finding && S.diag) { S.diag.viewed = S.diag.viewed || {}; S.diag.viewed[id] = true; refreshFeedRow(id); }
    const simpleLine = LV.simple ? (f.kind === "part" ? LV.simpleFor(craft.id, it)
      : `A connection (a cable, joint, hinge or pipe) that joins the ${partName(craft, it.a)} and the ${partName(craft, it.b)}.`) : null;
    const vulnList = it.vulns.slice().sort(byRank).slice(0, LV.maxVulns);
    const slot = slotLabel(craft, it.slot);
    const m = missionOf(craft);
    const links = f.kind === "part" ? craft.connections.filter((c) => c.a === id || c.b === id) : [];
    if (has3D()) {
      Inspector.select(id);
      if (fromList) Inspector.focus(id);
    }

    $("infoCard").className = `modal-card info-card w-full max-w-xl max-h-[88vh] overflow-y-auto rounded-2xl border ${finding ? "border-rose-400/60" : "border-cyan-400/40"} bg-space-900 p-5 text-left`;
    $("infoCard").innerHTML = `
      <div class="flex items-start justify-between gap-3 mb-2">
        <div>
          <p class="text-[10px] font-display tracking-[0.25em] ${f.kind === "conn" ? "text-amber-300" : "text-cyan-300"}">${f.kind === "conn" ? "🔗 CONNECTION" : "🧩 PART"} · ${esc(it.group.toUpperCase())}</p>
          <h2 class="font-display text-xl text-white">${esc(it.name)}</h2>
          ${f.kind === "conn" ? `<p class="text-sm text-slate-400 mt-1">Joins <button class="link-btn" data-goto="${it.a}">${esc(partName(craft, it.a))}</button> ↔ <button class="link-btn" data-goto="${it.b}">${esc(partName(craft, it.b))}</button></p>` : ""}
        </div>
        <button id="infoClose" class="icon-btn shrink-0" aria-label="Close">✕</button>
      </div>

      ${finding ? `
        <div class="rounded-xl border border-rose-400/60 bg-rose-500/10 p-3 my-3">
          <p class="text-xs font-display tracking-wider text-rose-300 mb-1">⚠ DIAGNOSTIC FINDING ${sevBadge(finding.sev)}</p>
          <p class="text-sm text-white">${LV.glossify(finding.reading)}</p>
        </div>` : passed ? `<p class="text-xs text-emerald-300 my-2">✓ Passed the last diagnostic</p>` : ""}

      ${simpleLine ? `<p class="simple-line text-sm text-white my-3">💬 ${esc(simpleLine)}</p>` : ""}
      ${LV.simple
        ? `<details class="text-sm text-slate-300 my-3"><summary class="cursor-pointer text-cyan-300">More detail</summary><p class="mt-2">${LV.glossify(it.overview)}</p></details>`
        : `<p class="text-sm text-slate-300 my-3">${LV.glossify(it.overview)}</p>`}

      <h3 class="side-head">${LV.simple ? "WHAT COULD GO WRONG" : "KNOWN VULNERABILITIES"} (${vulnList.length < it.vulns.length ? `top ${vulnList.length} of ${it.vulns.length}` : it.vulns.length})</h3>
      <ul class="space-y-2 mb-4">
        ${vulnList.map(([s, t, d]) => `
          <li class="vuln vuln-${s}">
            <div class="flex items-center gap-2 mb-0.5">${sevBadge(s)}<b class="text-sm text-white">${esc(t)}</b></div>
            <p class="text-xs text-slate-400">${LV.glossify(d)}</p>
          </li>`).join("")}
      </ul>

      ${links.length ? `
        <h3 class="side-head">CONNECTIONS (${links.length})</h3>
        <div class="flex flex-wrap gap-1 mb-4">${links.map((c) => `<button class="link-chip ${S.diag && S.diag.found[c.id] ? "flagged" : ""}" data-goto="${c.id}">🔗 ${esc(c.name)}</button>`).join("")}</div>` : ""}

      <div class="rounded-xl border border-slate-700/60 bg-space-800/60 p-3 text-sm">
        <p class="text-slate-300 mb-2">${finding
          ? `Engineers fix problems like this by <b class="text-white">redesigning the spacecraft</b> and re-balancing the trade-offs.`
          : `Want to see how this part affects the rest of the spacecraft?`}
          ${slot ? ` In the workshop this is the <b class="text-white">${esc(slot)}</b>.` : ` In the workshop you redesign the whole ${esc(m.tag.toLowerCase())}.`}</p>
        <div class="flex flex-col sm:flex-row gap-2">
          <button id="infoFix" class="flex-1 rounded-lg ${finding ? "bg-rose-500 hover:bg-rose-400 text-white" : "bg-cyan-500 hover:bg-cyan-400 text-space-950"} font-semibold px-4 py-2.5">
            🔧 ${finding ? "Fix it in the Trade-Off Workshop" : "Open the Trade-Off Workshop"}</button>
          ${has3D() ? `<button id="infoShow" class="rounded-lg border border-slate-500/60 px-4 py-2.5 hover:bg-white/5">📍 Show in 3D</button>` : ""}
        </div>
      </div>`;

    $("infoModal").classList.remove("hidden");
    $("infoModal").classList.add("flex");
    UI.sfx.open();
    $("infoClose").addEventListener("click", closeInfo);
    $("infoFix").addEventListener("click", () => goWorkshop(id));
    if ($("infoShow")) $("infoShow").addEventListener("click", () => { closeInfo(); Inspector.focus(id); Inspector.select(id); setTimeout(() => S && Inspector.select(null), 2200); });
    $("infoCard").querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => { UI.sfx.click(); openInfo(b.dataset.goto, true); }));
  }

  function refreshFeedRow(id) {
    const feed = $("feed");
    if (!feed || !S.diag) return;
    const row = S.diag.log.find((r) => r.id === id);
    const el = feed.querySelector(`[data-item="${id}"]`);
    if (!row || !el) return;
    el.outerHTML = feedRowHtml(row);
    const nel = feed.querySelector(`[data-item="${id}"]`);
    nel.addEventListener("click", () => openInfo(id, true));
  }

  function closeInfo() {
    const mod = $("infoModal");
    if (!mod) return;
    mod.classList.add("hidden");
    mod.classList.remove("flex");
    if (has3D() && S) Inspector.select(null);
  }

  /* =====================================================================
     INTO THE GAME — and back again
     ===================================================================== */
  function goWorkshop(id) {
    const craft = S.craft;
    const f = find(craft, id);
    const finding = S.diag && S.diag.found[id];
    runToken++; // stop any running scan
    closeInfo();
    UI.sfx.click();
    UI.startMission(missionOf(craft), {
      craftId: craft.id,
      craftName: craft.name,
      itemName: f ? f.item.name : null,
      reading: finding ? finding.reading : null,
      sev: finding ? finding.sev : null,
      slot: f ? f.item.slot : null,
      problems: S.diag ? Object.keys(S.diag.found).length : 0,
    });
  }

  /* Called by the game when the player comes back from the workshop */
  function returnFromWorkshop(craftId, rescan) {
    const craft = window.SPACECRAFT.find((c) => c.id === craftId);
    if (craft) renderInspector(craft, { autoDiagnose: rescan });
    else renderHangar();
  }

  /* Keyboard: Esc closes the pop-up */
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeInfo(); });
  $("infoModal").addEventListener("click", (e) => { if (e.target.id === "infoModal") closeInfo(); });

  // Re-draw card pictures when the theme changes
  window.addEventListener("themechange", () => {
    if (!S && app.querySelector("[data-thumb]")) {
      app.querySelectorAll("[data-thumb]").forEach((img) => {
        const url = thumbs[theme()][img.dataset.thumb];
        if (url) img.src = url;
      });
      makeThumbs();
    }
  });

  window.Hangar = { render: renderHangar, inspect: renderInspector, returnFromWorkshop, repaired, sevBadge, SEV };
})();
