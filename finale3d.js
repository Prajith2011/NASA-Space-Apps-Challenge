/* =====================================================================
   Space Mission Cube — playable 3D finale
   ---------------------------------------------------------------------
   After solving a mission you LAUNCH it, then fly the spacecraft YOU
   designed:
     • Lunar lander  → pilot the landing (your design's Δv = your fuel)
     • Mars rover    → drive to 3 science targets and survive a dust storm
     • Telescope     → unfold it in the right order, like Webb did
   ===================================================================== */

(function () {
  const T = THREE;
  const G_MOON = 1.62;

  let root, renderer, scene, camera, controls, running = false, onFinish = null;
  let mission, sel, parts, stage, stageT = 0, lastT = 0;
  let keys = {};
  let play = null; // the current mini-game object { update(dt), dispose() }
  let savedTheme = null;

  /* ---------------- DOM overlay ---------------- */
  function buildOverlay() {
    root = document.createElement("div");
    root.id = "finale";
    root.className = "fixed inset-0 z-[60] bg-black select-none";
    root.innerHTML = `
      <div id="fCanvas" class="absolute inset-0"></div>
      <div class="absolute top-0 inset-x-0 p-3 sm:p-4 flex items-start justify-between gap-3 pointer-events-none">
        <div class="max-w-md rounded-xl bg-black/55 border border-white/10 px-3 py-2 backdrop-blur-sm">
          <p id="fStage" class="font-display text-[10px] tracking-[0.3em] text-cyan-300"></p>
          <h2 id="fTitle" class="font-display text-lg sm:text-2xl text-white drop-shadow"></h2>
          <p id="fGoal" class="text-xs sm:text-sm text-slate-200 drop-shadow mt-1"></p>
        </div>
        <div class="flex flex-col items-end gap-2">
          <button id="fSkip" class="pointer-events-auto rounded-lg border border-slate-400/50 bg-black/50 px-3 py-1.5 text-xs hover:bg-white/10">Skip to NASA reveal ⏭</button>
          <div id="fStats" class="finale-stats"></div>
        </div>
      </div>
      <div id="fCenter" class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <p id="fBig" class="font-display text-5xl sm:text-7xl text-white drop-shadow-lg"></p>
      </div>
      <div id="fMsg" class="absolute left-1/2 -translate-x-1/2 bottom-28 sm:bottom-24 w-[92%] max-w-xl text-center pointer-events-none"></div>
      <div id="fControls" class="absolute bottom-4 inset-x-0 flex justify-center gap-3 px-3"></div>
      <div id="fPanel" class="absolute inset-0 hidden items-center justify-center bg-black/60 p-4"></div>`;
    document.body.appendChild(root);
    root.querySelector("#fSkip").addEventListener("click", () => finish(true));
  }

  // Safe even after the finale closed (delayed messages then go to a throwaway element)
  const $f = (id) => (root ? root.querySelector("#" + id) : document.createElement("div"));
  function setHeader(stageTxt, title, goal) {
    $f("fStage").textContent = stageTxt;
    $f("fTitle").textContent = title;
    $f("fGoal").innerHTML = goal;
  }
  function big(txt) { $f("fBig").textContent = txt; }
  function msg(html, ms = 3500) {
    const el = $f("fMsg");
    el.innerHTML = html ? `<div class="toast inline-block rounded-xl border border-cyan-400/40 bg-space-900/90 px-4 py-2 text-sm text-slate-100">${html}</div>` : "";
    clearTimeout(msg.t);
    if (html && ms) msg.t = setTimeout(() => (el.innerHTML = ""), ms);
  }
  function stats(rows) {
    // refresh at most ~10 times a second (clearing is always immediate)
    const now = performance.now();
    if (rows.length && now - (stats.last || 0) < 100) return;
    stats.last = now;
    $f("fStats").innerHTML = rows.map((r) => `
      <div class="rounded-lg bg-black/60 border border-slate-600/50 px-3 py-1.5 text-right min-w-[150px]">
        <div class="text-[10px] tracking-widest text-slate-400">${r.label}</div>
        ${r.bar != null
          ? `<div class="h-2 rounded-full bg-slate-700 mt-1 overflow-hidden"><div class="h-full rounded-full" style="width:${Math.max(0, Math.min(100, r.bar))}%;background:${r.color || "#22d3ee"}"></div></div>`
          : `<div class="font-display text-sm" style="color:${r.color || "#e2e8f0"}">${r.value}</div>`}
      </div>`).join("");
  }

  /* Touch / mouse buttons that act like holding a key */
  function controlButtons(defs) {
    const c = $f("fControls");
    c.innerHTML = defs.map((d) => `<button data-key="${d.key}" class="finale-btn">${d.label}</button>`).join("");
    c.querySelectorAll("[data-key]").forEach((b) => {
      const k = b.dataset.key;
      const on = (e) => { e.preventDefault(); keys[k] = true; b.classList.add("active"); };
      const off = () => { keys[k] = false; b.classList.remove("active"); };
      b.addEventListener("pointerdown", on);
      b.addEventListener("pointerup", off);
      b.addEventListener("pointerleave", off);
      b.addEventListener("pointercancel", off);
    });
  }

  function panel(html) {
    const p = $f("fPanel");
    p.innerHTML = `<div class="modal-card w-full max-w-md rounded-2xl border border-emerald-400/40 bg-space-900 p-6 text-center">${html}</div>`;
    p.classList.remove("hidden");
    p.classList.add("flex");
    return p;
  }
  function hidePanel() { $f("fPanel").classList.add("hidden"); $f("fPanel").classList.remove("flex"); }

  /* ---------------- Keyboard ---------------- */
  const keyMap = { ArrowUp: "up", KeyW: "up", Space: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
  function onKey(e) {
    const k = keyMap[e.code];
    if (!k) return;
    e.preventDefault();
    keys[k] = e.type === "keydown";
  }

  /* ---------------- Three.js helpers ---------------- */
  let envMap = null;
  function newScene(bg) {
    if (scene) scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    scene = new T.Scene();
    scene.background = new T.Color(bg);
    if (!envMap) envMap = Models.makeEnvMap(renderer, "space");
    scene.environment = envMap; // reflections on metal, foil and mirrors
    if (controls) { controls.dispose(); controls = null; }
    return scene;
  }
  function stars(n = 1500, r = 300) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos.set([s * Math.cos(t) * r, Math.abs(u) * r, s * Math.sin(t) * r], i * 3);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    return new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: true }));
  }
  function lights(sunPos = [30, 50, 20], hemi = 0.6) {
    scene.add(new T.HemisphereLight(0xdfe8ff, 0x303030, hemi));
    const s = new T.DirectionalLight(0xffffff, 1.2);
    s.position.set(...sunPos);
    scene.add(s);
  }
  /* Soil texture repeated across a big ground plane */
  function tiled(kind, times) {
    const t = Models.groundTexture(kind).clone();
    t.needsUpdate = true;
    t.repeat.set(times, times);
    return t;
  }

  function flame(radius, length) {
    const m = new T.Mesh(
      new T.ConeGeometry(radius, length, 16, 1, true),
      new T.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false })
    );
    m.rotation.x = Math.PI; // point down
    return m;
  }

  function resize() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* =====================================================================
     STAGE 1 — Launch cinematic
     ===================================================================== */
  function startLaunch() {
    stage = "launch";
    stageT = 0;
    newScene(0x0d1b3a);
    scene.fog = new T.Fog(0x0d1b3a, 60, 260);
    lights([20, 40, 30], 0.7);
    scene.add(stars(800, 250));

    const ground = new T.Mesh(new T.PlaneGeometry(600, 600), new T.MeshStandardMaterial({ color: 0x2c3a2c, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const pad = new T.Mesh(new T.BoxGeometry(8, 0.6, 8), new T.MeshStandardMaterial({ color: 0x777777 }));
    pad.position.y = 0.3;
    scene.add(pad);
    const tower = new T.Mesh(new T.BoxGeometry(1.2, 15, 1.2), new T.MeshStandardMaterial({ color: 0xb33a2a, wireframe: true }));
    tower.position.set(-3.2, 7.5, 0);
    scene.add(tower);

    const type = parts.launch ? parts.launch.id : "saturnv";
    const rocket = Models.buildRocket(type);
    rocket.scale.setScalar(1.8);
    rocket.position.y = 0.6;
    scene.add(rocket);
    const f = flame(0.8, 4);
    f.position.y = -1.8;
    f.visible = false;
    rocket.add(f);

    // Smoke puffs
    const smoke = [];
    for (let i = 0; i < 50; i++) {
      const s = new T.Mesh(new T.SphereGeometry(1, 10, 8), new T.MeshBasicMaterial({ color: 0xcfcfcf, transparent: true, opacity: 0, depthWrite: false }));
      s.userData.life = -1;
      scene.add(s);
      smoke.push(s);
    }

    camera.position.set(16, 5, 22);
    const name = parts.launch ? parts.launch.name : "Saturn V";
    setHeader("STAGE 1 · LAUNCH", `${name} launch`, "Sit back: your spacecraft is about to leave Earth.");
    stats([]);
    $f("fControls").innerHTML = "";

    let spawn = 0;
    play = {
      update(dt) {
        stageT += dt;
        const t = stageT;
        if (t < 3) big(String(3 - Math.floor(t)));
        else if (t < 4.2) big("LIFTOFF!");
        else big("");

        const lift = Math.max(0, t - 3);
        rocket.position.y = 0.6 + 1.6 * lift * lift;
        f.visible = t > 2.6;
        f.scale.set(1 + Math.random() * 0.15, 1 + Math.random() * 0.4, 1 + Math.random() * 0.15);
        rocket.position.x = Math.sin(t * 30) * 0.02 * (t > 2.6 && t < 4 ? 1 : 0); // shake at ignition

        // smoke
        spawn += dt;
        if (t > 2.6 && spawn > 0.04) {
          spawn = 0;
          const s = smoke.find((p) => p.userData.life < 0);
          if (s) {
            s.userData.life = 0;
            s.position.set((Math.random() - 0.5) * 3, 0.8, (Math.random() - 0.5) * 3);
            s.userData.v = new T.Vector3((Math.random() - 0.5) * 8, Math.random() * 1.5, (Math.random() - 0.5) * 8);
          }
        }
        smoke.forEach((s) => {
          if (s.userData.life < 0) return;
          s.userData.life += dt;
          const L = s.userData.life;
          s.position.addScaledVector(s.userData.v, dt);
          s.scale.setScalar(1 + L * 2.5);
          s.material.opacity = Math.max(0, 0.6 - L * 0.22);
          if (L > 2.8) s.userData.life = -1;
        });

        // sky darkens as we climb
        const k = Math.min(lift / 6, 1);
        scene.background.setRGB(0.05 * (1 - k), 0.106 * (1 - k), 0.227 * (1 - k));
        scene.fog.color.copy(scene.background);

        camera.lookAt(0, Math.max(5, rocket.position.y * 0.85), 0);
        camera.position.y = 5 + Math.max(0, rocket.position.y - 12) * 0.5;

        if (t > 8.5) startPlay();
      },
    };
  }

  /* =====================================================================
     STAGE 2a — Land on the Moon
     ===================================================================== */
  function startLander() {
    newScene(0x000000);
    lights([-40, 60, 30], 0.35);
    scene.add(stars(2000, 350));

    const earth = new T.Mesh(new T.SphereGeometry(14, 32, 24), new T.MeshStandardMaterial({ color: 0x3a7bd5, emissive: 0x0a1a40, roughness: 0.8 }));
    earth.position.set(-120, 140, -250);
    scene.add(earth);

    const ground = new T.Mesh(new T.PlaneGeometry(900, 900), new T.MeshStandardMaterial({ map: tiled("moon", 45), color: 0x9a9aa0, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // craters and boulders
    for (let i = 0; i < 70; i++) {
      const r = 2 + Math.random() * 9;
      const x = (Math.random() - 0.5) * 300, z = -Math.random() * 200 + 40;
      if (Math.hypot(x, z) < 12) continue;
      const c = new T.Mesh(new T.RingGeometry(r * 0.7, r, 28), new T.MeshStandardMaterial({ color: 0x323236, roughness: 1 }));
      c.rotation.x = -Math.PI / 2;
      c.position.set(x, 0.02, z);
      scene.add(c);
    }
    for (let i = 0; i < 45; i++) {
      const x = (Math.random() - 0.5) * 140, z = (Math.random() - 0.5) * 60;
      if (Math.abs(x) < 9) continue;
      const b = new T.Mesh(new T.DodecahedronGeometry(0.5 + Math.random() * 1.6), new T.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 1 }));
      b.position.set(x, 0.3, z);
      b.rotation.set(Math.random(), Math.random(), 0);
      scene.add(b);
    }

    // landing target
    const zone = new T.Mesh(new T.RingGeometry(5.5, 6.5, 48), new T.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.85 }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.05;
    scene.add(zone);

    const lander = Models.buildLander(parts);
    scene.add(lander);
    const fl = flame(0.4, 2.2);
    fl.position.y = -0.6;
    lander.add(fl);

    // Fuel comes from YOUR design's Δv (more margin = more fuel time)
    const dv = Engine.current().find((c) => c.id === "dv").value;
    const fuelMax = 22 + Math.min(Math.max((dv - 2100) / 4, 0), 20);
    const s = { x: 28, y: 110, vx: 0, vy: -9, fuel: fuelMax, done: false };

    setHeader("STAGE 2 · POWERED DESCENT", "Land your lander!",
      `Hold <b>THRUST</b> (Space / ↑) to slow down. Use <b>◀ ▶</b> to reach the <span class="text-emerald-300">green circle</span>. Touch down slower than <b>4 m/s</b>.<br><span class="text-slate-400">Your design's Δv (${dv} m/s) gives you ${fuelMax.toFixed(0)} seconds of fuel.</span>`);
    controlButtons([{ key: "left", label: "◀" }, { key: "up", label: "THRUST" }, { key: "right", label: "▶" }]);
    msg("Tip: don't brake too early. Hovering wastes fuel, just like for Apollo 11!", 5000);

    play = {
      update(dt) {
        if (s.done) return;
        const thrust = keys.up && s.fuel > 0;
        const side = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        let ay = -G_MOON + (thrust ? 3.6 : 0);
        let ax = s.fuel > 0 ? side * 2.0 : 0;
        if (thrust) s.fuel -= dt;
        if (side && s.fuel > 0) s.fuel -= dt * 0.4;
        s.fuel = Math.max(0, s.fuel);
        s.vy += ay * dt;
        s.vx += ax * dt;
        s.vx *= 1 - 0.6 * dt; // damping so sideways control feels fair (a game simplification)
        s.x += s.vx * dt;
        s.y += s.vy * dt;

        lander.position.set(s.x, Math.max(0, s.y), 0);
        lander.rotation.z = -s.vx * 0.04;
        fl.visible = thrust;
        fl.scale.set(1, 0.8 + Math.random() * 0.5, 1);

        // Camera stays level with the lander, looking slightly down so the ground appears as you descend
        const ly = Math.max(s.y, 0);
        camera.position.set(s.x * 0.8, ly + 5, 20);
        camera.lookAt(s.x * 0.9, Math.max(ly - 3, 1), 0);

        const dist = Math.abs(s.x);
        stats([
          { label: "ALTITUDE", value: `${Math.max(0, s.y).toFixed(0)} m` },
          { label: "DESCENT SPEED", value: `${(-s.vy).toFixed(1)} m/s`, color: -s.vy > 4 ? "#fb7185" : "#6ee7b7" },
          { label: "SIDEWAYS SPEED", value: `${Math.abs(s.vx).toFixed(1)} m/s`, color: Math.abs(s.vx) > 3 ? "#fb7185" : "#6ee7b7" },
          { label: "TARGET", value: dist < 6 ? "ABOVE TARGET ✓" : `${dist.toFixed(0)} m ${s.x > 0 ? "◀" : "▶"}`, color: dist < 6 ? "#6ee7b7" : "#fbbf24" },
          { label: `FUEL ${s.fuel.toFixed(0)} s`, bar: (s.fuel / fuelMax) * 100, color: s.fuel / fuelMax < 0.2 ? "#f43f5e" : "#22d3ee" },
        ]);
        if (s.fuel === 0 && !s.warned) { s.warned = true; msg("⚠ Out of fuel!", 3000); }

        if (s.y <= 0) {
          s.done = true;
          fl.visible = false;
          const speed = -s.vy;
          const side = Math.abs(s.vx);
          const soft = speed <= 4 && side <= 3;
          const onTarget = dist < 6;
          if (!soft) {
            lander.rotation.z = 0.5;
            endPanel(false, "💥 Crash landing!",
              speed > 4
                ? `You hit the surface at <b>${speed.toFixed(1)} m/s</b>. Brake earlier and touch down below 4 m/s.`
                : `You came down gently, but you were sliding sideways at <b>${side.toFixed(1)} m/s</b>, so the lander tipped over. Stop moving sideways (below 3 m/s) before touchdown.`, startLander);
          } else {
            endPanel(true, onTarget ? "🌕 The Eagle has landed!" : "Safe landing!",
              `Touchdown at <b>${speed.toFixed(1)} m/s</b> with <b>${s.fuel.toFixed(0)} s</b> of fuel left${onTarget ? ", right on target" : `, ${dist.toFixed(0)} m from the target`}. Apollo 11 landed with well under a minute of fuel to spare!`, startLander);
          }
        }
      },
    };
  }

  /* =====================================================================
     STAGE 2b — Drive on Mars
     ===================================================================== */
  function startRover() {
    newScene(0xd29a6c);
    scene.fog = new T.Fog(0xd29a6c, 25, 160);
    lights([40, 60, 10], 0.7);

    const ground = new T.Mesh(new T.PlaneGeometry(700, 700), new T.MeshStandardMaterial({ map: tiled("mars", 35), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    for (let i = 0; i < 160; i++) {
      const x = (Math.random() - 0.5) * 220, z = (Math.random() - 0.5) * 220;
      if (Math.hypot(x, z) < 6) continue;
      const r = new T.Mesh(new T.DodecahedronGeometry(0.3 + Math.random() * 1.2), new T.MeshStandardMaterial({ color: 0x6e3a22, roughness: 1 }));
      r.position.set(x, 0.2, z);
      r.rotation.set(Math.random(), Math.random(), 0);
      scene.add(r);
    }

    const rover = Models.buildRover(parts);
    scene.add(rover);

    const FACTS = [
      "Sample 1 analysed! Curiosity found that Gale Crater once held a lake of water.",
      "Sample 2 analysed! Curiosity's onboard lab detected organic molecules in ancient Martian rocks.",
      "Sample 3 analysed! Curiosity also measures radiation on Mars, helping plan for future astronauts.",
    ];
    const targetsPos = [[30, -14], [14, -70], [-40, -56]];
    const targets = targetsPos.map(([x, z]) => {
      const g = new T.Group();
      const beam = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 14, 12, 1, true),
        new T.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false }));
      beam.position.y = 7;
      const ring = new T.Mesh(new T.RingGeometry(2.2, 2.7, 32), new T.MeshBasicMaterial({ color: 0x22d3ee, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      g.add(beam, ring);
      g.position.set(x, 0, z);
      scene.add(g);
      return g;
    });

    // Power model from YOUR design
    const solar = !!parts.power.solar;
    const draw = parts.body.draw + parts.science.draw + parts.comms.draw;
    const charge = (storm) => 4 + (((storm && solar ? parts.power.gen * 0.3 : parts.power.gen) + parts.battery.buffer) - draw) / 6;

    const s = { x: 0, z: 0, yaw: -0.3, energy: 100, idx: 0, storm: 0, done: false, t: 0 };
    setHeader("STAGE 2 · SURFACE OPERATIONS", "Drive to the science targets",
      `Use <b>▲ ▼</b> to drive and <b>◀ ▶</b> to steer (or WASD / arrow keys). Reach the <span class="text-cyan-300">3 glowing targets</span>. Driving drains the battery; your power source recharges it.`);
    controlButtons([{ key: "left", label: "◀" }, { key: "up", label: "▲" }, { key: "down", label: "▼" }, { key: "right", label: "▶" }]);

    play = {
      debug: () => ({ ...s, targets: targetsPos }),
      update(dt) {
        if (s.done) return;
        s.t += dt;
        const stormOn = s.storm > 0;
        if (stormOn) s.storm -= dt;

        const canDrive = s.energy > 0;
        const fwd = canDrive ? (keys.up ? 1 : 0) - (keys.down ? 0.6 : 0) : 0;
        const turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
        s.yaw += turn * 1.8 * dt;
        s.x += Math.cos(s.yaw) * fwd * 6 * dt;
        s.z -= Math.sin(s.yaw) * fwd * 6 * dt;
        s.energy += (fwd ? -12 : 0) * dt + charge(stormOn) * dt;
        s.energy = Math.min(100, Math.max(0, s.energy));
        if (!canDrive && !s.lowMsg) { s.lowMsg = true; msg("🔋 Battery empty: waiting to recharge…", 2500); }
        if (s.energy > 15) s.lowMsg = false;

        rover.position.set(s.x, 0, s.z);
        rover.rotation.y = s.yaw;

        // chase camera
        const back = 11, up = 5.5;
        camera.position.lerp(new T.Vector3(s.x - Math.cos(s.yaw) * back, up, s.z + Math.sin(s.yaw) * back), 0.08);
        camera.lookAt(s.x + Math.cos(s.yaw) * 4, 1.5, s.z - Math.sin(s.yaw) * 4);

        // dust storm visuals
        const targetFar = stormOn ? 45 : 160, targetNear = stormOn ? 4 : 25;
        scene.fog.far += (targetFar - scene.fog.far) * 0.03;
        scene.fog.near += (targetNear - scene.fog.near) * 0.03;
        const sky = stormOn ? [0.55, 0.38, 0.25] : [0.82, 0.6, 0.42];
        scene.background.lerp(new T.Color(...sky), 0.03);
        scene.fog.color.copy(scene.background);

        targets.forEach((g, i) => { g.visible = i >= s.idx; g.children[0].material.opacity = i === s.idx ? 0.6 : 0.2; });
        const tg = targets[s.idx];
        const dist = Math.hypot(tg.position.x - s.x, tg.position.z - s.z);
        if (dist < 2.7) {
          msg("🔬 " + FACTS[s.idx], 5500);
          s.idx += 1;
          if (s.idx === 1) {
            s.storm = 30;
            setTimeout(() => msg(solar
              ? "🌪️ DUST STORM! Your solar panels now make only 30% power. Drive carefully!"
              : "🌪️ DUST STORM! Your nuclear generator keeps making power. Dust can't block it!", 6000), 5600);
          }
          if (s.idx === 3) {
            s.done = true;
            endPanel(true, "🔴 Science mission complete!",
              `All 3 samples analysed in <b>${s.t.toFixed(0)} s</b>. Your ${solar ? "solar" : "nuclear"}-powered rover ${solar ? "had to work around the storm" : "kept going through the storm, just like Curiosity"}.`, startRover);
            return;
          }
        }
        const left = targets[Math.min(s.idx, 2)];
        stats([
          { label: "SAMPLES", value: `${s.idx} / 3` },
          { label: "NEXT TARGET", value: `${dist.toFixed(0)} m` },
          { label: `BATTERY ${s.energy.toFixed(0)}%`, bar: s.energy, color: s.energy < 20 ? "#f43f5e" : "#34d399" },
          { label: "POWER", value: stormOn ? (solar ? "STORM: 30% solar" : "STORM: nuclear OK") : (solar ? "Solar: full sun" : "Nuclear: steady"), color: stormOn && solar ? "#fbbf24" : "#e2e8f0" },
        ]);
        left.rotation.y += dt;
      },
    };
  }

  /* =====================================================================
     STAGE 2c — Unfold the telescope
     ===================================================================== */
  function startTelescope() {
    newScene(0x000000);
    lights([60, 20, 40], 0.45);
    scene.add(stars(2500, 300));
    const earth = new T.Mesh(new T.SphereGeometry(10, 32, 24), new T.MeshStandardMaterial({ color: 0x3a7bd5, emissive: 0x081830 }));
    earth.position.set(140, -40, -220);
    scene.add(earth);

    const tel = Models.buildTelescope(parts);
    scene.add(tel);
    const prog = { solar: 0, shield: 0, secondary: 0, wings: tel.userData.deploy.wingL ? 0 : 1 };
    Models.setTelescopeDeploy(tel, prog);

    controls = new T.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.8, 0);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    camera.position.set(9, 5, 11);

    const shieldLabel = parts.cooling.id === "sunshield" ? "Unfold the sunshield" : "Deploy the cooler radiators";
    const steps = [
      { id: "solar", label: "Unfold the solar array", why: "Power first! Every motor needs electricity, so the solar array must open before anything else. Webb opened its array about half an hour after launch." },
      { id: "shield", label: shieldLabel, why: "Shade comes next. The telescope must start cooling down, and the Sun must not heat the mirror." },
      { id: "secondary", label: "Raise the secondary mirror", why: "Webb raised its secondary mirror before unfolding the side wings of its main mirror." },
    ];
    if (tel.userData.deploy.wingL) steps.push({ id: "wings", label: "Unfold the mirror wings", why: "" });

    let next = 0, anim = null, mistakes = 0, done = false;
    setHeader("STAGE 2 · DEPLOYMENT", "Unfold your telescope",
      "It launched folded up like origami. Pick the deployment steps <b>in the right order</b>. Drag to look around.");
    stats([]);

    const shuffled = steps.map((s) => s).sort(() => Math.random() - 0.5);
    const c = $f("fControls");
    c.innerHTML = shuffled.map((s) => `<button data-step="${s.id}" class="finale-btn text-xs sm:text-sm">${s.label}</button>`).join("");
    c.className = "absolute bottom-4 inset-x-0 flex flex-wrap justify-center gap-2 px-3";
    c.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
      if (anim || done) return;
      const id = b.dataset.step;
      if (id === steps[next].id) {
        anim = { id, t: 0 };
        b.disabled = true;
        b.classList.add("done");
        msg(`✓ ${steps[next].label}…`, 1800);
        next += 1;
      } else {
        mistakes += 1;
        msg(`✗ Not yet! ${steps[next].why}`, 5000);
        b.classList.add("wrong");
        setTimeout(() => b.classList.remove("wrong"), 500);
      }
    }));

    play = {
      update(dt) {
        if (anim) {
          anim.t += dt / 1.8;
          prog[anim.id] = Math.min(anim.t, 1);
          Models.setTelescopeDeploy(tel, prog);
          if (anim.t >= 1) {
            anim = null;
            if (next === steps.length && !done) {
              done = true;
              setTimeout(() => endPanel(true, "🔭 Telescope fully deployed!",
                `Unfolded with <b>${mistakes}</b> mistake${mistakes === 1 ? "" : "s"}. In real life, Webb's unfolding took about two weeks. Then engineers aligned its 18 mirror segments to work as one giant mirror.`, startTelescope), 600);
            }
          }
        }
        stats([{ label: "STEPS DONE", value: `${next} / ${steps.length}` }, { label: "MISTAKES", value: String(mistakes), color: mistakes ? "#fbbf24" : "#6ee7b7" }]);
        controls.update();
      },
    };
  }

  function startPlay() {
    stage = "play";
    big("");
    $f("fControls").className = "absolute bottom-4 inset-x-0 flex justify-center gap-3 px-3";
    keys = {};
    hidePanel();
    if (mission.id === "lunar-lander") startLander();
    else if (mission.id === "mars-rover") startRover();
    else startTelescope();
  }

  /* ---------------- End-of-mission panel ---------------- */
  function endPanel(success, title, body, retryFn) {
    $f("fControls").innerHTML = "";
    const p = panel(`
      <p class="font-display text-xs tracking-[0.3em] ${success ? "text-emerald-300" : "text-rose-300"} mb-2">${success ? "MISSION SUCCESS" : "MISSION FAILED"}</p>
      <h2 class="font-display text-2xl text-white mb-3">${title}</h2>
      <p class="text-sm text-slate-300 mb-5">${body}</p>
      <div class="flex flex-col sm:flex-row gap-2">
        ${success ? `<button id="fReveal" class="flex-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-space-950 font-semibold px-4 py-3">See what NASA built →</button>` : ""}
        <button id="fRetry" class="flex-1 rounded-lg ${success ? "border border-slate-500/60 hover:bg-white/5" : "bg-amber-400 hover:bg-amber-300 text-space-950 font-semibold"} px-4 py-3">${success ? "Play again" : "Try again"}</button>
      </div>`);
    if (success) p.querySelector("#fReveal").addEventListener("click", () => finish(true));
    p.querySelector("#fRetry").addEventListener("click", () => {
      hidePanel();
      keys = {};
      $f("fControls").className = "absolute bottom-4 inset-x-0 flex justify-center gap-3 px-3";
      retryFn();
    });
  }

  /* ---------------- Main loop ---------------- */
  function loop(t) {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min((t - lastT) / 1000 || 0, 0.05);
    lastT = t;
    if (play) play.update(dt);
    renderer.render(scene, camera);
  }

  /* ---------------- Public API ---------------- */
  function start(m, selection, done) {
    mission = m;
    sel = selection;
    parts = Engine.partsFor(m, selection);
    onFinish = done;
    buildOverlay();

    // The finale always uses the dark "space" look (restored when it closes)
    savedTheme = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "dark";

    renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    envMap = null;
    $f("fCanvas").appendChild(renderer.domElement);
    camera = new T.PerspectiveCamera(50, 1, 0.1, 1500);
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    running = true;
    lastT = performance.now();
    startLaunch();
    requestAnimationFrame(loop);
  }

  function finish(reveal) {
    running = false;
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
    if (controls) { controls.dispose(); controls = null; }
    if (scene) scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    scene = null;
    play = null;
    if (envMap) { envMap.dispose(); envMap = null; }
    if (renderer) { renderer.dispose(); renderer = null; }
    if (root) root.remove();
    root = null;
    if (savedTheme) document.documentElement.dataset.theme = savedTheme;
    if (onFinish) onFinish(reveal);
  }

  window.Finale3D = {
    start,
    /* Testing helper: advance the game by n frames (works even when the tab is in the background) */
    debugStep(n = 1, dt = 1 / 30, input = {}) {
      Object.assign(keys, input);
      for (let i = 0; i < n && play; i++) play.update(dt);
      return play && play.debug ? play.debug() : null;
    },
  };
})();
