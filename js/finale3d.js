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
      <div id="fBars" class="cine-bars" aria-hidden="true"><span></span><span></span></div>
      <div id="fFade" class="absolute inset-0 bg-black pointer-events-none" style="opacity:0"></div>
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
  let fx = null; // cinematic post-processing (fx.js)
  let frozen = false; // testing helper: pause the action but keep drawing
  // difficulty level (js/level.js): landing speed limit, fuel, rover battery drain, telescope hints
  const LV = window.LEVEL || { id: "intermediate", landSpeed: 4, fuelMul: 1, roverDrain: 1, telescopeHint: false };
  // sound effects (js/audio.js); silent stand-ins if it is missing
  const snd = window.Sound || { play() {}, loop: () => ({ set() {}, stop() {} }), stopAll() {} };
  function newScene(bg) {
    if (scene) scene.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    scene = new T.Scene();
    scene.background = new T.Color(bg);
    if (!envMap) envMap = Models.makeEnvMap(renderer, "space");
    scene.environment = envMap; // reflections on metal, foil and mirrors
    // Space stages get the real Milky Way behind the stars
    if (bg === 0x000000 && window.FX) {
      const sky = new T.Mesh(new T.SphereGeometry(1200, 64, 32), new T.MeshBasicMaterial({ map: FX.tex(FX.milkyWayCanvas()), side: T.BackSide, depthWrite: false, fog: false }));
      sky.material.color.setScalar(0.55);
      scene.add(sky);
    }
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
    m.material.color.multiplyScalar(1.8); // over-bright, so the bloom makes the exhaust blaze
    m.rotation.x = Math.PI; // point down
    return m;
  }

  function resize() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (fx) fx.setSize(w, h);
  }

  /* ---------- Launch helpers ---------- */
  const softMap = () => (window.FX ? FX.tex(FX.softDot(), false) : null);

  /* A rocket exhaust plume: white-hot core, orange flame, wide glowing outer
     plume, flickering "shock diamonds" and a bright glow at the nozzle.
     update(time, length 0–1, spread 0–1): spread grows as the air thins. */
  function makePlume(pal) {
    const g = new T.Group();
    const add = (geo, col, op) => {
      const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: new T.Color(...col), transparent: true, opacity: op,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
      g.add(m);
      return m;
    };
    /* Flame cones use a soft glowing shader: bright in the middle, fading to
       nothing at the edges and towards the tail, so they look like hot gas */
    const flameMat = (col, op, edge) => new T.ShaderMaterial({
      uniforms: { color: { value: new T.Color(...col) }, opacity: { value: op }, edge: { value: edge } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vL;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          vL = uv.y; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; uniform float edge; varying vec3 vN; varying vec3 vV; varying float vL;
        void main(){
          float facing = pow(abs(dot(normalize(vN), normalize(vV))), edge);
          float along = smoothstep(0.0, 0.85, vL);   // vL is 0 at the tail and 1 at the nozzle
          float a = facing * along * opacity;
          gl_FragColor = vec4(color * a, a);
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    });
    const cone = (r, len) => { const geo = new T.CylinderGeometry(r, r * 0.12, len, 32, 1, true); geo.translate(0, -len / 2, 0); return geo; };
    const addFlame = (geo, col, op, edge) => { const m = new T.Mesh(geo, flameMat(col, op, edge)); g.add(m); return m; };
    const core = addFlame(cone(0.2, 1.4), pal.core, 1.0, 0.8);
    const inner = addFlame(cone(0.36, 4.0), pal.inner, 1.0, 1.2);
    const outer = addFlame(cone(0.62, 9.0), pal.outer, 0.6, 2.0);
    const diamonds = [0.45, 0.9, 1.35, 1.8].map((y, i) => {
      const m = add(new T.SphereGeometry(0.12 - i * 0.018, 12, 8), pal.core, 0.8);
      m.scale.y = 1.9;
      m.position.y = -y;
      return m;
    });
    const glow = new T.Sprite(new T.SpriteMaterial({ map: softMap(), color: new T.Color(...pal.glow), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    glow.position.y = -0.35;
    glow.material.color.multiplyScalar(0.6);
    g.add(glow);
    g.userData.update = (t, k, spread) => {
      g.visible = k > 0.02;
      if (!g.visible) return;
      core.scale.set(1, (0.9 + Math.random() * 0.25) * k, 1);
      inner.scale.set(1 + spread * 0.6, (0.9 + Math.random() * 0.2) * k, 1 + spread * 0.6);
      outer.scale.set(1 + spread * 2.4, (0.85 + Math.random() * 0.3) * k * (1 + spread * 0.7), 1 + spread * 2.4);
      outer.material.uniforms.opacity.value = 0.6 * (1 - spread * 0.4);
      diamonds.forEach((d, i) => {
        d.visible = spread < 0.6;
        d.material.opacity = (0.55 + 0.45 * Math.sin(t * 45 + i * 1.7)) * 0.85 * (1 - spread);
      });
      glow.scale.setScalar(3.2 * (0.9 + Math.random() * 0.2) * Math.max(0.3, k));
    };
    return g;
  }

  /* A pool of soft round sprites used for smoke, steam and vapour */
  function particles(n, color, additive = false) {
    const map = softMap();
    const list = [];
    for (let i = 0; i < n; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false,
        blending: additive ? T.AdditiveBlending : T.NormalBlending }));
      s.visible = false;
      s.userData.life = -1;
      scene.add(s);
      list.push(s);
    }
    let next = 0;
    return {
      list,
      spawn(pos, vel, o) {
        const s = list[next];
        next = (next + 1) % n;
        Object.assign(s.userData, { life: 0, max: o.life, v: vel.clone(), drag: o.drag || 0, rise: o.rise || 0, s0: o.s0, s1: o.s1, a0: o.a0,
          c0: new T.Color(o.c0 || color), c1: new T.Color(o.c1 || color) });
        s.position.copy(pos);
        s.material.rotation = Math.random() * 6.28;
        s.visible = true;
      },
      update(dt) {
        list.forEach((s) => {
          const u = s.userData;
          if (u.life < 0) return;
          u.life += dt;
          const k = u.life / u.max;
          if (k >= 1) { u.life = -1; s.visible = false; return; }
          u.v.multiplyScalar(Math.max(0, 1 - u.drag * dt));
          u.v.y += u.rise * dt;
          s.position.addScaledVector(u.v, dt);
          s.scale.setScalar(u.s0 + (u.s1 - u.s0) * Math.sqrt(k));
          s.material.opacity = u.a0 * (k < 0.08 ? k / 0.08 : 1 - (k - 0.08) / 0.92);
          s.material.color.copy(u.c0).lerp(u.c1, Math.min(1, k * 2.5));
        });
      },
      hide() { list.forEach((s) => { s.visible = false; s.userData.life = -1; }); },
    };
  }

  /* Fluffy cloud texture (overlapping soft circles) */
  let cloudCanvas = null;
  function cloudTex() {
    if (!cloudCanvas) {
      cloudCanvas = document.createElement("canvas");
      cloudCanvas.width = cloudCanvas.height = 256;
      const g = cloudCanvas.getContext("2d");
      for (let i = 0; i < 26; i++) {
        const x = 50 + Math.random() * 156, y = 90 + Math.random() * 80, r = 20 + Math.random() * 45;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, "rgba(255,255,255,0.55)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    const t = new T.CanvasTexture(cloudCanvas);
    t.encoding = T.sRGBEncoding;
    return t;
  }

  /* =====================================================================
     STAGE 1 — Launch movie (about 20 seconds, six camera shots)
       0.0 s  wide shot of the pad at dusk: vapour venting, countdown
       2.4 s  close-up of the engines: ignition, water-deluge steam, sparks
       3.2 s  liftoff (hold-downs release)
       3.4 s  camera on the tower: the rocket thunders up past it
       5.8 s  long-lens tracking shot: clouds, Max-Q vapour cone,
              solid boosters separate (rockets that have them)
       9.0 s  camera on the rocket looking down: Earth's curve below,
              stage separation seen from on board
      11.0 s  space: second stage ignites, payload fairing opens (Apollo:
              the launch escape tower is jettisoned)
      13.4 s  Mars & Moon: parking orbit around Earth, then a second burn.
              Webb heads straight on towards L2.
     Then "… later" and the playable mission starts.
     Rocket shapes, colours and staging come from js/launchvehicles.js.
     ===================================================================== */
  const EXHAUST = {
    kerosene: { core: [2.6, 2.2, 1.6], inner: [2.0, 1.0, 0.3], outer: [1.1, 0.45, 0.12], glow: [2.0, 1.1, 0.5], smoke: 0.85 },
    hydrogen: { core: [2.0, 1.8, 2.2], inner: [1.2, 0.5, 0.42], outer: [0.45, 0.18, 0.2], glow: [1.4, 0.7, 0.6], smoke: 0.45 },
    solid: { core: [2.8, 2.6, 2.2], inner: [2.4, 1.7, 0.9], outer: [1.4, 0.95, 0.5], glow: [2.4, 1.8, 1.1], smoke: 1.0 },
    methane: { core: [2.0, 2.1, 2.6], inner: [1.6, 0.9, 0.6], outer: [0.8, 0.45, 0.35], glow: [1.6, 1.1, 1.0], smoke: 0.5 },
    vacuum: { core: [1.7, 2.0, 2.6], inner: [0.5, 0.75, 1.8], outer: [0.25, 0.35, 0.95], glow: [0.9, 1.2, 2.3] },
  };

  /* A soft white cone of condensed water vapour that can wrap a rocket near Max-Q */
  function vapourCone() {
    const geo = new T.CylinderGeometry(1, 0.55, 1.6, 40, 1, true);
    const mat = new T.ShaderMaterial({
      uniforms: { opacity: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vL;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vL = uv.y; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float opacity; varying vec3 vN; varying vec3 vV; varying float vL;
        void main(){ float f = 0.35 + 0.65 * pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.2);
          float a = f * smoothstep(0.0, 0.5, vL) * smoothstep(1.0, 0.75, vL) * opacity; gl_FragColor = vec4(vec3(2.2) * a, a); }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    });
    return new T.Mesh(geo, mat);
  }

  function startLaunch() {
    stage = "launch";
    stageT = 0;
    newScene(0x0d1b3a);
    scene.fog = new T.Fog(0x3a3550, 90, 520);
    lights([20, 40, 30], 0.5);
    const starPts = stars(1600, 900);
    starPts.material.transparent = true;
    starPts.material.opacity = 0.25;
    scene.add(starPts);

    // ---- The rocket the player chose (detailed, real proportions) ----
    const type = parts.launch ? parts.launch.id : "saturnv";
    const V = LaunchVehicles.build(type, mission.id, parts);
    const H = V.heightW, RW = V.radiusW, S = H / 12;        // S scales the whole movie to the rocket's size
    const [s1, s2] = V.stages;
    scene.add(s1, s2);
    if (V.payload) V.payload.visible = false;                // hidden inside the fairing until it opens

    // ---- Dusk sky dome (fades away as we climb) ----
    const skyC = document.createElement("canvas");
    skyC.width = 4; skyC.height = 256;
    const sg = skyC.getContext("2d");
    const grad = sg.createLinearGradient(0, 0, 0, 256);
    [[0, "#050b1e"], [0.3, "#132a5c"], [0.43, "#3d4f86"], [0.48, "#c9805a"], [0.5, "#f2a66a"], [0.52, "#3a2a22"], [1, "#120e0c"]].forEach(([o, c]) => grad.addColorStop(o, c));
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 4, 256);
    const skyTex = new T.CanvasTexture(skyC);
    skyTex.encoding = T.sRGBEncoding;
    const sky = new T.Mesh(new T.SphereGeometry(950, 48, 24), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, depthWrite: false, fog: false, transparent: true }));
    sky.renderOrder = -10;
    scene.add(sky);

    // ---- The launch site ----
    const site = new T.Group();
    scene.add(site);
    const ground = new T.Mesh(new T.PlaneGeometry(1400, 1400), new T.MeshStandardMaterial({ color: 0x26301f, roughness: 1, map: tiled("moon", 120) }));
    ground.rotation.x = -Math.PI / 2;
    site.add(ground);
    // the ocean beside the launch site, catching the sunset
    const ocean = new T.Mesh(new T.PlaneGeometry(900, 1400), new T.MeshStandardMaterial({ color: 0x0c1830, metalness: 0.6, roughness: 0.18 }));
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(600, 0.05, 0);
    site.add(ocean);
    const concrete = (rep = 2) => new T.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.9, map: tiled("moon", rep) });
    const padR = Math.max(9, RW * 3);
    const pad = new T.Mesh(new T.CylinderGeometry(padR, padR * 1.08, 0.6, 48), concrete(3));
    pad.position.y = 0.3;
    const trench = new T.Mesh(new T.BoxGeometry(RW * 1.6, 0.62, padR * 2.05), new T.MeshStandardMaterial({ color: 0x151515, roughness: 1 }));
    trench.position.y = 0.3;
    site.add(pad, trench);
    // launch mount: four steel legs and a table the rocket stands on
    const mountY = 0.6, mountH = Math.max(1.0, 0.5 * S);
    const steelM = () => new T.MeshStandardMaterial({ color: 0x23262c, metalness: 0.35, roughness: 0.8 });
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => {
      const leg = new T.Mesh(new T.BoxGeometry(0.4 * S, mountH, 0.4 * S), steelM());
      leg.position.set(a * RW * 1.1, mountY + mountH / 2, b * RW * 1.1);
      site.add(leg);
    });
    const table = new T.Mesh(new T.CylinderGeometry(RW * 1.45, RW * 1.45, 0.25 * S, 36, 1, true), steelM());
    table.position.y = mountY + mountH;
    site.add(table);
    const baseY = mountY + mountH + 0.12 * S;                  // the rocket stands on the mount
    // water tower and tanks
    const tankM = new T.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.4, roughness: 0.4 });
    const wt = new T.Mesh(new T.SphereGeometry(2.6 * S, 24, 16), tankM);
    wt.position.set(-75 * S, 16 * S, -70 * S);
    site.add(wt);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => {
      const l = new T.Mesh(new T.CylinderGeometry(0.2 * S, 0.2 * S, 15 * S, 8), steelM());
      l.position.set(-75 * S + a * 1.8 * S, 7.5 * S, -70 * S + b * 1.8 * S);
      site.add(l);
    });
    // the assembly building far away, its windows lit
    const vab = new T.Mesh(new T.BoxGeometry(60, 70, 50), new T.MeshStandardMaterial({ color: 0x4a4f59, roughness: 0.8 }));
    vab.position.set(-420, 35, -520);
    site.add(vab);
    // four lightning-protection masts with wires over the pad (modern pads; Apollo's pad didn't have them)
    const hasMasts = type !== "saturnv";
    const mastH = H * 1.35, mastR = padR * 2.2;
    const wireMat = new T.LineBasicMaterial({ color: 0x8890a0, transparent: true, opacity: 0.6 });
    const mastTops = [];
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => {
      const m = new T.Mesh(new T.CylinderGeometry(0.06 * S, 0.16 * S, mastH, 8), steelM());
      m.visible = hasMasts;
      m.position.set(a * mastR, mastH / 2, b * mastR);
      site.add(m);
      mastTops.push(new T.Vector3(a * mastR, mastH, b * mastR));
    });
    const wires = [];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const A = mastTops[i], B = mastTops[j];
      const pts = [];
      for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new T.Vector3().lerpVectors(A, B, t).add(new T.Vector3(0, -Math.sin(t * Math.PI) * H * 0.12, 0))); }
      wires.push(new T.Line(new T.BufferGeometry().setFromPoints(pts), wireMat));
    }
    wires.forEach((wr) => { wr.visible = hasMasts; site.add(wr); });

    // steel lattice umbilical tower + access arms that swing away at liftoff
    const steel = () => new T.MeshStandardMaterial({ color: 0xb8402c, metalness: 0.6, roughness: 0.45 });
    const beam = (a, b, r, parent) => {
      const va = new T.Vector3(...a), vb = new T.Vector3(...b);
      const m = new T.Mesh(new T.CylinderGeometry(r, r, va.distanceTo(vb), 6), steel());
      m.position.copy(va).add(vb).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
      parent.add(m);
      return m;
    };
    const tower = new T.Group();
    const TH = Math.max(14, H * 1.04), w = 0.8 * S, step = 1.4 * S;
    [[-w, -w], [w, -w], [w, w], [-w, w]].forEach(([x, z]) => beam([x, 0, z], [x, TH, z], 0.08 * S, tower));
    for (let y = 0; y < TH - 0.1; y += step) {
      [[-w, -w, w, -w], [w, -w, w, w], [w, w, -w, w], [-w, w, -w, -w]].forEach(([x1, z1, x2, z2]) => {
        beam([x1, y, z1], [x2, y, z2], 0.035 * S, tower);
        beam([x1, y, z1], [x2, Math.min(TH, y + step), z2], 0.025 * S, tower);
      });
    }
    beam([0, TH, 0], [0, TH + 4 * S, 0], 0.05 * S, tower);
    const beacon = new T.Mesh(new T.SphereGeometry(0.18 * S, 10, 8), new T.MeshBasicMaterial({ color: new T.Color(3, 0.2, 0.15), fog: false }));
    beacon.position.y = TH + 4.1 * S;
    tower.add(beacon);
    const towerX = -(RW * 1.6 + w + 1.2 * S);
    tower.position.set(towerX, 0.6, 0);
    site.add(tower);
    const armLen = -towerX - w - RW * 0.95;
    const arms = [0.3, 0.58, 0.86].map((f) => {
      const pivot = new T.Group();
      pivot.position.set(w, TH * f, 0);
      beam([0, 0, 0], [armLen, 0, 0], 0.11 * S, pivot);
      const walk = new T.Mesh(new T.BoxGeometry(armLen, 0.08 * S, 0.7 * S), steel());
      walk.position.set(armLen / 2, -0.12 * S, 0);
      pivot.add(walk);
      tower.add(pivot);
      return pivot;
    });

    // floodlights with faint beams, and the glow from the engines
    [[-16, 12], [16, 12], [0, -18]].forEach(([x, z]) => {
      x *= S; z *= S;
      const sp = new T.SpotLight(0xdfe8ff, 1.1, 120 * S, 0.42, 0.6);
      sp.position.set(x, 12 * S, z);
      sp.target.position.set(0, H * 0.5, 0);
      scene.add(sp, sp.target);
      const beamGeo = new T.ConeGeometry(3 * S, 24 * S, 24, 1, true);
      beamGeo.translate(0, -12 * S, 0);
      const lightBeam = new T.Mesh(beamGeo, new T.MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.022, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      lightBeam.position.set(x, 12 * S, z);
      lightBeam.lookAt(0, H * 0.5, 0);
      lightBeam.rotateX(-Math.PI / 2);
      site.add(lightBeam);
      const lamp = new T.Mesh(new T.SphereGeometry(0.3 * S, 10, 8), new T.MeshBasicMaterial({ color: new T.Color(4, 4, 4.4), fog: false }));
      lamp.position.set(x, 12 * S, z);
      site.add(lamp);
    });
    const glow = new T.PointLight(0xff8a3a, 0, 90 * S, 2);
    scene.add(glow);
    const horizon = new T.Group();
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, r = 140 + Math.random() * 260;
      if (Math.cos(a) * r > 160) continue; // none out over the ocean
      const s = new T.Sprite(new T.SpriteMaterial({ map: softMap(), color: new T.Color().setHSL(0.08 + Math.random() * 0.06, 0.8, 0.6).multiplyScalar(2.2),
        blending: T.AdditiveBlending, transparent: true, depthWrite: false }));
      s.position.set(Math.cos(a) * r, 0.4 + Math.random() * 2, Math.sin(a) * r);
      s.scale.setScalar(0.8 + Math.random() * 1.6);
      horizon.add(s);
    }
    site.add(horizon);

    // ---- Exhaust plumes (each engine type looks different) ----
    const plumes = [];
    const addPlume = (group, ud, vacuum) => {
      const pal = vacuum ? EXHAUST.vacuum : EXHAUST[ud.exhaust] || EXHAUST.kerosene;
      const p = makePlume(pal);
      p.position.y = ud.nozzleY;
      const k = ud.plumeR / 0.62;
      p.scale.set(k, k * (vacuum ? 1.4 : 1), k);
      group.add(p);
      return p;
    };
    const plume1 = addPlume(s1, s1.userData);
    const boosterPlumes = V.boosters.map((b) => addPlume(b, b.userData));
    const plume2 = addPlume(s2, s2.userData, true);
    // engine bells glow hot while firing
    const hotBells = [];
    s1.traverse((o) => { if (o.isMesh && o.material && o.material.side === T.DoubleSide && o.material.emissive) hotBells.push(o.material); });
    const cone = vapourCone();
    scene.add(cone);

    // ---- Smoke, steam, vapour, water spray, fire, sparks and clouds ----
    const smoke = particles(320, 0xd8d4cc);
    const steam = particles(160, 0xf2f2f2);
    const vapour = particles(40, 0xffffff);
    const puffs = particles(60, 0xffffff);
    const water = particles(90, 0xcfe6ff);
    const fire = particles(70, 0xffa040, true);
    const sparkN = 260, sparkPos = new Float32Array(sparkN * 3), sparkVel = [];
    for (let i = 0; i < sparkN; i++) { sparkVel.push(new T.Vector3()); sparkPos[i * 3 + 1] = -50; }
    const sparkGeo = new T.BufferGeometry();
    sparkGeo.setAttribute("position", new T.BufferAttribute(sparkPos, 3));
    const sparks = new T.Points(sparkGeo, new T.PointsMaterial({ map: softMap(), color: new T.Color(3, 1.6, 0.5), size: 0.35 * S, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    scene.add(sparks);
    const clouds = new T.Group();
    const cTex = cloudTex();
    for (let i = 0; i < 50; i++) {
      const c = new T.Sprite(new T.SpriteMaterial({ map: cTex, color: 0xffe4d0, transparent: true, opacity: 0.9, depthWrite: false }));
      c.position.set((-60 + Math.random() * 170) * S, (62 + Math.random() * 18) * S, (-70 + Math.random() * 140) * S);
      c.scale.set((30 + Math.random() * 30) * S, (14 + Math.random() * 10) * S, 1);
      clouds.add(c);
    }
    scene.add(clouds);

    // ---- Flight path (sped up for the game) ----
    const flight = (t) => {
      const L = Math.max(0, t - 3.2);
      const after = Math.max(0, L - 3.5);
      return { y: baseY + 1.25 * S * Math.pow(L, 2.2), x: 0.9 * S * Math.pow(after, 2.4), pitch: Math.min(0.55, after * 0.09) };
    };
    const place = (obj, f) => { obj.position.set(f.x, f.y, 0); obj.rotation.set(0, 0, -f.pitch); };
    place(s1, flight(0)); place(s2, flight(0));
    const v3 = (x, y, z) => new T.Vector3(x, y, z);
    const sepLocal = (V.sepY[0] || 30);                       // metres, in the stage groups' own units
    const world = (g, x, y, z) => g.localToWorld(v3(x, y, z));

    // ---- How this mission leaves Earth (simplified real flight plans) ----
    const J = {
      "mars-rover": { parking: true, burn: "TRANS-MARS INJECTION", burnShort: "MARS BURN", parkAlt: "between about 165 and 325 km", parkKm: 165,
        burnMsg: "🔥 Second burn: speeding up to escape Earth's gravity",
        away: "ON THE WAY TO MARS", awayMsg: "☀️ Free of Earth, the spacecraft now orbits the Sun, on a path that meets Mars",
        later: "ABOUT 8 MONTHS LATER…", arrive: "🔴 Arriving at Mars: entry, descent and landing!", escape: 41000 },
      "lunar-lander": { parking: true, burn: "TRANS-LUNAR INJECTION", burnShort: "MOON BURN", parkAlt: "about 185 km", parkKm: 185,
        burnMsg: "🔥 Third-stage burn: speeding up to leave Earth orbit for the Moon",
        away: "ON THE WAY TO THE MOON", awayMsg: "🌕 Now coasting on a long loop out to the Moon (the Moon itself orbits Earth)",
        later: "ABOUT 4 DAYS LATER…", arrive: "🌕 Four days after launch: time to land on the Moon!", escape: 39000 },
      "deep-space-telescope": { parking: false,
        away: "ON COURSE TO L2", awayMsg: "🔭 No parking orbit: the rocket sent Webb straight towards L2, 1.5 million km from Earth",
        later: "ABOUT 2 WEEKS LATER…", arrive: "🔭 Webb unfolded during its month-long trip to L2: time to unfold it!", escape: 36000 },
    }[mission.id] || { parking: false, away: "ON ITS WAY", awayMsg: "", later: "LATER…", arrive: "", escape: 36000 };
    const TL = J.parking
      ? { burn1End: 13.4, orbit: 13.6, burn2: 15.0, burn2End: 16.9, away: 16.8, skip: 18.6, play: 20.2 }
      : { burn1End: 14.6, orbit: null, burn2: null, burn2End: null, away: 13.8, skip: 15.8, play: 17.4 };
    const burning = (t) => (t >= 11.3 && t < TL.burn1End) || (TL.burn2 != null && t >= TL.burn2 && t < TL.burn2End);
    const names = { saturnv: ["S-IC", "S-II"], a401: ["Atlas booster", "Centaur"], a541: ["Atlas booster", "Centaur"], d4h: ["core stage", "upper stage"],
      ariane5: ["core stage", "upper stage"], medium: ["first stage", "second stage"], superheavy: ["booster", "ship"] }[type] || ["first stage", "second stage"];

    // ---- Cinematic overlay ----
    $f("fBars").classList.add("on");
    const dip = () => {
      const el = $f("fFade");
      el.style.transition = "none";
      el.style.opacity = "0.9";
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = "opacity 0.45s ease-out"; el.style.opacity = "0"; }));
    };
    const name = parts.launch ? parts.launch.name : "Saturn V";
    setHeader("STAGE 1 · LAUNCH", `${name} launch`, "Sit back: your spacecraft is about to leave Earth.");
    stats([]);
    const c = $f("fControls");
    c.innerHTML = `<button id="fSkipLaunch" class="finale-btn text-xs">Skip launch ⏭</button>`;
    c.querySelector("#fSkipLaunch").addEventListener("click", () => startPlay());

    // ---- State ----
    const roar = snd.loop("rocket");
    let stage2 = null;
    let lastCount = null, lastShot = -1, shake = 0, bigUntil = 0;
    let sepDone = false, boostersOff = false, fairingOff = false;
    const lowerVel = v3(0, 0, 0), upperVel = v3(0, 0, 0), spin = v3(0, 0, 0), sepDir = v3(0, 1, 0);
    const loose = [];                 // jettisoned pieces: { obj, vel, spin }
    let earth = null, sunG = null, milky = null;
    const earthOff = v3(60, -1080, -160).multiplyScalar(S), sunOff = v3(0, 0, 0); // camera stays above the glowing atmosphere
    let smokeT = 0, steamT = 0, ventT = 0;
    const done = {};
    const once = (key, t, fn) => { if (!done[key] && stageT >= t) { done[key] = true; fn(); } };
    const say = (txt, secs = 1.4) => { big(txt); bigUntil = stageT + secs; };
    const pad2 = (n) => String(Math.floor(n)).padStart(2, "0");
    const jettison = (obj, vel, sp) => { scene.attach(obj); loose.push({ obj, vel, spin: sp }); };

    function toSpace() {
      site.visible = false;
      clouds.visible = false;
      steam.hide();
      water.hide();
      smoke.hide();      // smoke only forms in the lower atmosphere
      fire.hide();
      sky.visible = false;
      scene.fog = null;
      scene.background = new T.Color(0x000000);
      starPts.material.opacity = 1;
      const up = s2.position.clone();
      const sunDir = v3(-0.55, 0.2, -0.8).normalize();
      if (window.FX) {
        earth = FX.planet(520 * S, { sunDir: v3(0.6, 0.4, -0.5) });
        // seen up close, so: thinner clouds and a slightly darker surface, like real onboard footage
        if (earth.userData.clouds) { earth.userData.clouds.material.transparent = true; earth.userData.clouds.material.opacity = 0.55; }
        earth.userData.surface.material.color.setScalar(0.75);
        earth.position.copy(up).add(earthOff);
        earth.rotation.set(Math.PI / 2 - 0.35, 2.2, 0); // tilt so the rocket flies over oceans and land, not the pole
        scene.add(earth);
        sunG = FX.sun(sunDir, 60 * S);
        sunOff.copy(sunDir).multiplyScalar(420 * S);
        sunG.position.copy(up).add(sunOff);
        scene.add(sunG);
        milky = new T.Mesh(new T.SphereGeometry(1400, 48, 24), new T.MeshBasicMaterial({ map: FX.tex(FX.milkyWayCanvas()), side: T.BackSide, depthWrite: false, fog: false }));
        milky.material.color.setScalar(0.5);
        milky.renderOrder = -10;
        milky.position.copy(up);
        scene.add(milky);
      }
    }

    play = {
      update(dt) {
        stageT += dt;
        const t = stageT;

        // ---------- story beats ----------
        const count = t < 3 ? 3 - Math.floor(t) : null;
        if (count !== lastCount) { lastCount = count; if (count) { snd.play("countdown"); say(String(count), 0.9); } }
        once("go", 0.6, () => { msg("✅ All systems are GO for launch", 2200); snd.play("go"); });
        once("ign", 2.6, () => {
          msg(type === "saturnv" ? "🔥 Ignition: five F-1 engines start, then hold-down arms keep the rocket still until full thrust"
            : "🔥 Main engine start: water floods the pad to soak up the sound", 2800);
          snd.play("ignition"); shake = 0.6;
        });
        once("lift", 3.2, () => { say("LIFTOFF!", 1.6); snd.play("release"); });
        once("clear", 5.0, () => msg("🗼 The rocket has cleared the tower", 2200));
        once("maxq", 7.0, () => msg("💨 Max-Q: the moment of greatest air pressure on the rocket", 2800));
        if (V.boosters.length) once("bsep", 8.3, () => {
          say(V.boosters[0].userData.exhaust === "solid" ? "BOOSTER SEPARATION" : "SIDE CORES SEPARATE", 1.3);
          snd.play("separation");
          boostersOff = true;
          V.boosters.forEach((b, i) => {
            const out = world(b, 0, 0, 0).sub(world(s1, 0, 0, 0)).setY(0).normalize();
            jettison(b, out.multiplyScalar(3 * S).add(v3(0, 4 * S, 0)), v3(0.3, 0, (i % 2 ? -1 : 1) * 0.5));
          });
        });
        once("meco", 10.1, () => msg(`${names[0][0].toUpperCase() + names[0].slice(1)} engine cut-off`, 1500));
        once("sep", 10.5, () => {
          sepDone = true;
          say("STAGE SEPARATION", 1.5);
          snd.play("separation");
          const f0 = flight(t - 0.02), f1 = flight(t);
          sepDir.set(f1.x - f0.x, f1.y - f0.y, 0).normalize();
          upperVel.copy(sepDir).multiplyScalar(6 * S);
          lowerVel.copy(sepDir).multiplyScalar(5.2 * S);
          spin.set(0.25 + Math.random() * 0.2, 0.3, 0.55);
          const p = world(s2, 0, sepLocal, 0);
          for (let i = 0; i < 30; i++) {
            const a = (i / 30) * Math.PI * 2;
            puffs.spawn(p, v3(Math.cos(a) * 6 * S, (Math.random() - 0.5) * 2, Math.sin(a) * 6 * S), { life: 1.4, drag: 1.4, s0: 0.3 * S, s1: 1.6 * S, a0: 0.6 });
          }
        });
        once("s2", 11.3, () => { msg(`🔵 ${names[1][0].toUpperCase() + names[1].slice(1)} ignition`, 2200); snd.play("stage2"); stage2 = snd.loop("thruster"); });
        once("fairing", 12.2, () => {
          if (V.les) {                          // Apollo: the launch escape tower is no longer needed
            say("ESCAPE TOWER JETTISON", 1.4);
            snd.play("release");
            jettison(V.les, sepDir.clone().multiplyScalar(14 * S), v3(0.2, 0, 0.4));
          } else if (V.fairing) {
            say("FAIRING SEPARATION", 1.4);
            snd.play("separation");
            msg("🛰 The nose cone splits open: there's your spacecraft!", 2600);
            fairingOff = true;
            if (V.payload) V.payload.visible = true;
            [V.fairing.left, V.fairing.right].forEach((h) => {
              const side = h.userData.dir;
              const out = v3(0, 0, side).applyQuaternion(s2.quaternion);
              jettison(h, out.multiplyScalar(4 * S).add(sepDir.clone().multiplyScalar(4 * S)), v3(side * 0.9, 0, 0));
            });
          }
        });
        if (TL.orbit != null) {
          once("seco", TL.burn1End, () => msg(`${names[1][0].toUpperCase() + names[1].slice(1)} engine cut-off`, 1200));
          once("orbit", TL.orbit, () => { say("EARTH ORBIT", 1.6); snd.play("orbit");
            msg(`🛰 A "parking orbit" around Earth, ${J.parkAlt} up. Not fast enough to leave Earth yet!`, 2800); });
          once("burn2", TL.burn2, () => { say(J.burn, 1.6); snd.play("stage2"); msg(J.burnMsg, 2200); });
        }
        once("away", TL.away, () => { say(J.away, 1.8); snd.play("orbit"); if (J.awayMsg) msg(J.awayMsg, 3200); });
        once("skip", TL.skip, () => {
          const el = $f("fFade");
          el.style.transition = "opacity 0.8s ease-in";
          el.style.opacity = "1";
          say(J.later, 3);
          msg(J.arrive, 2600);
          snd.stopAll(0.8);
        });
        if (bigUntil && t > bigUntil) { big(""); bigUntil = 0; }

        // ---------- rocket motion ----------
        const f = flight(t);
        if (!sepDone) { place(s1, f); place(s2, f); }
        else {
          if (burning(t)) upperVel.addScaledVector(sepDir, 7 * S * dt);
          s2.position.addScaledVector(upperVel, dt);
          lowerVel.addScaledVector(sepDir, -2.2 * S * dt);
          s1.position.addScaledVector(lowerVel, dt);
          s1.rotation.x += spin.x * dt;
          s1.rotation.z += spin.z * dt;
        }
        loose.forEach((l) => {
          l.vel.y -= (earth ? 0 : 6 * S) * dt;
          l.obj.position.addScaledVector(l.vel, dt);
          l.obj.rotation.x += l.spin.x * dt;
          l.obj.rotation.z += l.spin.z * dt;
        });
        const L = Math.max(0, t - 3.2);
        const alt = sepDone ? 200 * S : f.y;
        const thin = Math.min(1, alt / (110 * S));
        if (earth) {
          earth.position.copy(s2.position).add(earthOff);
          earth.rotation.y += dt * 0.012;
          if (t > TL.away) earthOff.add(v3(0, -45 * S * dt, 25 * S * dt));
          sunG.position.copy(s2.position).add(sunOff);
          milky.position.copy(s2.position);
        }
        const k1 = sepDone ? 0 : t < 2.6 ? 0 : Math.min(1, (t - 2.6) * 2.5);
        plume1.userData.update(t, k1, thin);
        boosterPlumes.forEach((p) => p.userData.update(t, boostersOff ? 0 : k1, thin));
        plume2.userData.update(t, burning(t) ? Math.min(1, (t - (t >= (TL.burn2 || 99) ? TL.burn2 : 11.3)) * 2) : 0, 1);
        hotBells.forEach((m) => m.emissive.setRGB(k1 * 0.5, k1 * 0.16, 0));
        roar.set(t < 2.6 ? 0 : sepDone ? 0 : Math.min(1, (t - 2.6) * 2) * Math.max(0.25, 1 - Math.max(0, t - 4) / 7));
        if (stage2) stage2.set(burning(t) ? 0.55 : 0);

        // Max-Q vapour cone wraps the rocket for a moment
        const vq = Math.max(0, 1 - Math.abs(t - 7.3) / 0.7);
        cone.visible = vq > 0.01 && !sepDone;
        if (cone.visible) {
          cone.position.copy(world(s2, 0, V.height * 0.55, 0));
          cone.quaternion.copy(s2.quaternion);
          cone.scale.set(RW * 2.4, H * 0.18, RW * 2.4);
          cone.material.uniforms.opacity.value = vq * (0.75 + Math.random() * 0.25);
        }

        // tower arms swing away, the beacon blinks
        const armK = Math.min(1, Math.max(0, (t - 3.0) / 1.3));
        arms.forEach((a, i) => (a.rotation.y = -armK * (1.3 + i * 0.1)));
        beacon.material.color.setRGB(Math.sin(t * 6) > 0 ? 3 : 0.3, 0.15, 0.1);

        const nozzle = world(s1, 0, s1.userData.nozzleY, 0);
        glow.position.copy(nozzle).add(v3(0, -1.5 * S, 0));
        glow.intensity = !sepDone && t > 2.6 ? (3 + Math.random() * 1.5) * Math.max(0.1, 1 - L / 6) : 0;

        // ---------- particles ----------
        ventT -= dt;
        if (t < 3.2 && ventT <= 0) {           // white vapour boiling off the super-cold propellants
          ventT = 0.08;
          const side = Math.random() < 0.5 ? -1 : 1;
          const p = world(s2, side * V.radius * (V.boosters.length ? 0.55 : 1.02), sepLocal * (0.3 + Math.random() * 0.9), (Math.random() - 0.5) * V.radius);
          vapour.spawn(p, v3(side * (0.6 + Math.random()) * S, -0.8 * S - Math.random() * 0.6, 0), { life: 2.4, drag: 0.4, rise: -0.2, s0: 0.5 * S, s1: 2.6 * S, a0: 0.35 });
        }
        if (t > 2.3 && t < 3.6) {              // sound-suppression water sprays onto the pad
          for (let i = 0; i < 2; i++) {
            const a = Math.random() * Math.PI * 2;
            water.spawn(v3(Math.cos(a) * padR * 0.9, 0.8, Math.sin(a) * padR * 0.9), v3(-Math.cos(a) * 6 * S, 5 * S, -Math.sin(a) * 6 * S),
              { life: 1.2, drag: 0.6, rise: -9 * S, s0: 0.6 * S, s1: 1.8 * S, a0: 0.6 });
          }
        }
        if (type === "d4h" && t > 2.6 && t < 4.4) {   // Delta IV's famous fireball: leftover hydrogen burns up the sides
          for (let i = 0; i < 2; i++) {
            const p = world(s1, (Math.random() - 0.5) * 6, Math.random() * 6, (Math.random() - 0.5) * 6);
            fire.spawn(p, v3((Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 2).multiplyScalar(S),
              { life: 1.4, drag: 0.5, rise: 2 * S, s0: 1.2 * S, s1: 5 * S, a0: 0.7, c0: 0xffc070, c1: 0x902010 });
          }
        }
        fire.update(dt);
        water.update(dt);
        steamT -= dt;
        if (t > 2.6 && t < 7.5 && steamT <= 0) {
          steamT = 0.025;
          [-1, 1].forEach((dir) => steam.spawn(v3((Math.random() - 0.5) * RW * 2, 0.9, dir * padR * 1.05),
            v3((Math.random() - 0.5) * 5 * S, (2 + Math.random() * 3) * S, dir * (10 + Math.random() * 8) * S),
            { life: 4.5, drag: 0.55, rise: 0.6 * S, s0: 3 * S, s1: 16 * S, a0: 0.85, c0: 0xffc89a, c1: 0xe8e8ea }));
        }
        smokeT -= dt;
        const smokeK = Math.max((EXHAUST[s1.userData.exhaust] || {}).smoke || 0.7, boostersOff ? 0 : V.boosters.length ? EXHAUST[V.boosters[0].userData.exhaust].smoke : 0);
        if (t > 3.2 && !sepDone && !earth && smokeT <= 0) {
          smokeT = 0.024;
          const low = alt < baseY + 8 * S;
          const src = V.boosters.length && !boostersOff ? world(V.boosters[Math.floor(Math.random() * V.boosters.length)], 0, -3, 0) : nozzle;
          smoke.spawn(src.clone().add(v3((Math.random() - 0.5) * RW, -2 * S, (Math.random() - 0.5) * RW)),
            low ? v3((Math.random() - 0.5) * 14 * S, Math.random() * 2, (Math.random() - 0.5) * 14 * S) : v3((Math.random() - 0.5) * 1.5 * S, -2 * S - Math.random() * 2, (Math.random() - 0.5) * 1.5 * S),
            { life: low ? 4 : 7, drag: 0.6, rise: 0.15, s0: (low ? 3 : 2.4) * S * (0.6 + smokeK * 0.5), s1: (low ? 14 : 10 + thin * 10) * S * (0.6 + smokeK * 0.5),
              a0: 0.8 * smokeK * (1 - thin * 0.6), c0: 0xffb070, c1: 0xcfcac2 });
        }
        smoke.update(dt); steam.update(dt); vapour.update(dt); puffs.update(dt);

        if (t > 2.6 && t < 3.6) {
          for (let i = 0; i < 7; i++) {
            const j = Math.floor(Math.random() * sparkN);
            sparkPos.set([nozzle.x + (Math.random() - 0.5) * 2 * S, Math.max(0.7, nozzle.y - S), nozzle.z + (Math.random() - 0.5) * 2 * S], j * 3);
            const a = Math.random() * Math.PI * 2;
            sparkVel[j].set(Math.cos(a) * (5 + Math.random() * 9) * S, (3 + Math.random() * 7) * S, Math.sin(a) * (5 + Math.random() * 9) * S);
          }
        }
        for (let i = 0; i < sparkN; i++) {
          sparkVel[i].y -= 14 * S * dt;
          sparkPos[i * 3] += sparkVel[i].x * dt;
          sparkPos[i * 3 + 1] = Math.max(0.65, sparkPos[i * 3 + 1] + sparkVel[i].y * dt);
          sparkPos[i * 3 + 2] += sparkVel[i].z * dt;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        sparks.material.opacity = t > 2.6 && t < 5 ? 1 - Math.max(0, t - 3.8) / 1.2 : 0;

        // ---------- sky: dusk → black space ----------
        const kSky = Math.min(1, Math.max(0, (alt - 15 * S) / (100 * S)));
        if (scene.background && scene.background.isColor && !earth) scene.background.setRGB(0.05 * (1 - kSky), 0.1 * (1 - kSky), 0.22 * (1 - kSky));
        sky.material.opacity = 1 - kSky;
        if (scene.fog) { scene.fog.color.setRGB(0.23 * (1 - kSky), 0.21 * (1 - kSky), 0.31 * (1 - kSky)); scene.fog.far = 520 + kSky * 900; }
        if (!earth) starPts.material.opacity = 0.25 + kSky * 0.75;

        // ---------- camera direction: six shots ----------
        const shot = t < 2.4 ? 0 : t < 3.4 ? 1 : t < 5.8 ? 2 : t < 9.0 ? 3 : t < 11.0 ? 4 : 5;
        if (shot !== lastShot) {
          if (lastShot >= 0) dip();
          lastShot = shot;
          camera.up.set(0, 1, 0);
          if (shot === 4) toSpace();
          if (shot === 3) { const p = s2.position; camera.position.set(p.x + 24 * S, p.y - 3 * S, p.z + 28 * S); }
        }
        const up = s2.position;
        let look;
        if (shot === 0) {            // slow orbit around the pad at dusk
          const a = 0.9 + t * 0.09;
          camera.position.set(Math.sin(a) * 34 * S, 5 * S + t * 0.6 * S, Math.cos(a) * 34 * S);
          look = v3(0, H * 0.55, 0);
          camera.fov = 40;
        } else if (shot === 1) {     // close-up of the engines as they light
          camera.position.set(RW * 3.4 + 5 * S, baseY * 0.35 + 0.3, RW * 3 + 9 * S);
          look = v3(0, baseY + H * 0.12, 0);
          camera.fov = 40;
        } else if (shot === 2) {     // camera on the tower, looking up as the rocket roars past
          camera.position.set(towerX + w * 2.2, TH * 0.32, 3.2 * S);
          look = world(s1, 0, V.height * 0.32, 0);
          camera.fov = 62;
        } else if (shot === 3) {     // long-lens tracking shot, through the clouds
          camera.position.lerp(v3(up.x + 24 * S, up.y - 3 * S, up.z + 28 * S), 0.06);
          look = v3(up.x, up.y + H * 0.4, up.z);
          camera.fov = 32;
        } else if (shot === 4) {     // onboard camera on the upper stage, looking down the rocket
          const sc = V.height / 56;           // camera offsets grow with the rocket's size
          camera.position.copy(world(s2, V.radius + 2.5 * sc, sepLocal + 22 * sc, 0.6 * sc));
          look = world(s2, V.radius + 24 * sc, sepLocal - 60 * sc, 0);       // down the side of the rocket, out to Earth's horizon
          camera.up.copy(v3(1, 0, 0).applyQuaternion(s2.quaternion));
          camera.fov = 72;
        } else {                     // space chase shot
          const a = 0.7 + (t - 11) * 0.14;
          camera.position.set(up.x + Math.sin(a) * 34 * S, up.y + H * 0.75, up.z + Math.cos(a) * 34 * S);
          look = world(s2, 0, (V.fairing ? V.fairing.y : sepLocal + 20), 0);
          camera.fov = 44;
        }
        camera.updateProjectionMatrix();
        camera.lookAt(look);

        const roarK = !sepDone && t > 2.6 ? Math.max(0, 1 - L / 8) : 0;
        shake = Math.max(shake * Math.pow(0.1, dt), shot === 2 ? 0.25 * S * roarK : shot === 1 ? 0.15 * S * roarK : shot <= 3 ? 0.05 * S * roarK : shot === 4 ? 0.02 * S : 0);
        if (shake > 0.002) camera.position.add(v3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));

        // ---------- mission readouts ----------
        let altKm = Math.max(0, (f.y - baseY) / S * 0.6);
        let speed = 0;
        if (t > 3.2) speed = Math.min(7750, 2.75 * Math.pow(L, 1.2) * 260);
        if (t > 10.5) {
          if (J.parking) {
            altKm = Math.min(J.parkKm, 59 + (t - 10.5) * 44);
            speed = 7750 + Math.min(1, (t - 10.5) / 2.9) * 20250;
            if (t > TL.burn2) {
              speed = 28000 + Math.min(1, (t - TL.burn2) / (TL.burn2End - TL.burn2)) * (J.escape - 28000);
              altKm = J.parkKm + (t - TL.burn2) * 260;
            }
          } else {
            altKm = 59 + (t - 10.5) * 70;
            speed = 7750 + Math.min(1, (t - 10.5) / 4.1) * (J.escape - 7750);
          }
        }
        stats([
          { label: "MISSION TIME", value: t < 3.2 ? `T−00:0${Math.ceil(3.2 - t)}` : `T+00:${pad2(L)}` },
          { label: "ALTITUDE", value: `${altKm.toFixed(altKm < 10 ? 1 : 0)} km` },
          { label: "SPEED", value: `${Math.round(speed).toLocaleString("en-US")} km/h` },
          { label: "STAGE", value: !sepDone ? (V.boosters.length && !boostersOff ? "1 · BOOST + BOOSTERS" : "1 · BOOST") : t < 11.3 ? "COAST"
              : t < TL.burn1End ? (J.parking ? "2 · ORBIT BURN" : "2 · BURN TO L2")
              : TL.burn2 != null && t < TL.burn2 ? "PARKING ORBIT"
              : TL.burn2End != null && t < TL.burn2End ? "2 · " + J.burnShort
              : J.parking && mission.id === "mars-rover" ? "ORBITING THE SUN" : "COASTING", color: sepDone ? "#93c5fd" : "#fdba74" },
        ]);

        if (t > TL.play) { camera.up.set(0, 1, 0); startPlay(); }
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

    const earth = window.FX ? FX.planet(14) : new T.Mesh(new T.SphereGeometry(14, 32, 24), new T.MeshStandardMaterial({ color: 0x3a7bd5, emissive: 0x0a1a40, roughness: 0.8 }));
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
      // a shallow crater: darker floor + a raised, sunlit rim
      const floor = new T.Mesh(new T.CircleGeometry(r * 0.88, 32), new T.MeshStandardMaterial({ color: 0x6a6a70, roughness: 1, map: tiled("moon", 2) }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(x, 0.03, z);
      const rim = new T.Mesh(new T.TorusGeometry(r, r * 0.13, 8, 36), new T.MeshStandardMaterial({ color: 0x9a9aa0, roughness: 1, map: tiled("moon", 3) }));
      rim.rotation.x = -Math.PI / 2;
      rim.scale.z = 0.35;
      rim.position.set(x, 0.02, z);
      scene.add(floor, rim);
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
    const fuelMax = (22 + Math.min(Math.max((dv - 2100) / 4, 0), 20)) * LV.fuelMul;
    const s = { x: 28, y: 110, vx: 0, vy: -9, fuel: fuelMax, done: false };

    setHeader("STAGE 2 · POWERED DESCENT", "Land your lander!",
      `Hold <b>THRUST</b> (Space / ↑) to slow down. Use <b>◀ ▶</b> to reach the <span class="text-emerald-300">green circle</span>. Touch down slower than <b>${LV.landSpeed} m/s</b>.<br><span class="text-slate-400">Your design's Δv (${dv} m/s) gives you ${fuelMax.toFixed(0)} seconds of fuel.</span>`);
    controlButtons([{ key: "left", label: "◀" }, { key: "up", label: "THRUST" }, { key: "right", label: "▶" }]);
    msg("Tip: don't brake too early. Hovering wastes fuel, just like for Apollo 11!", 5000);

    const engine = snd.loop("thruster");
    let rcsT = 0, warnT = 0;
    play = {
      update(dt) {
        if (s.done) { engine.set(0); return; }
        const thrust = keys.up && s.fuel > 0;
        const side = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        engine.set(thrust ? 1 : 0);
        rcsT -= dt;
        if (side && s.fuel > 0 && rcsT <= 0) { rcsT = 0.18; snd.play("rcs"); }
        warnT -= dt;
        if (s.fuel > 0 && s.fuel / fuelMax < 0.2 && warnT <= 0) { warnT = 1.2; snd.play("lowFuel"); }
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
          { label: "DESCENT SPEED", value: `${(-s.vy).toFixed(1)} m/s`, color: -s.vy > LV.landSpeed ? "#fb7185" : "#6ee7b7" },
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
          const soft = speed <= LV.landSpeed && side <= 3;
          const onTarget = dist < 6;
          engine.set(0);
          snd.play(soft ? "touchdown" : "crash");
          if (!soft) {
            lander.rotation.z = 0.5;
            endPanel(false, "💥 Crash landing!",
              speed > LV.landSpeed
                ? `You hit the surface at <b>${speed.toFixed(1)} m/s</b>. Brake earlier and touch down below ${LV.landSpeed} m/s.`
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

    const motors = snd.loop("rover");
    const wind = snd.loop("wind");
    play = {
      debug: () => ({ ...s, targets: targetsPos }),
      update(dt) {
        if (s.done) { motors.set(0, 0); return; }
        s.t += dt;
        const stormOn = s.storm > 0;
        if (stormOn) s.storm -= dt;

        const canDrive = s.energy > 0;
        const fwd = canDrive ? (keys.up ? 1 : 0) - (keys.down ? 0.6 : 0) : 0;
        const turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
        s.yaw += turn * 1.8 * dt;
        s.x += Math.cos(s.yaw) * fwd * 6 * dt;
        s.z -= Math.sin(s.yaw) * fwd * 6 * dt;
        s.energy += (fwd ? -12 * LV.roverDrain : 0) * dt + charge(stormOn) * dt;
        s.energy = Math.min(100, Math.max(0, s.energy));
        motors.set(Math.abs(fwd), canDrive ? Math.abs(turn) : 0);
        wind.set(stormOn ? 1 : 0.3);
        if (!canDrive && !s.lowMsg) { s.lowMsg = true; snd.play("batteryEmpty"); msg("🔋 Battery empty: waiting to recharge…", 2500); }
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
        if (scene.fog && scene.background && scene.background.isColor) scene.fog.color.copy(scene.background);

        targets.forEach((g, i) => { g.visible = i >= s.idx; g.children[0].material.opacity = i === s.idx ? 0.6 : 0.2; });
        const tg = targets[s.idx];
        const dist = Math.hypot(tg.position.x - s.x, tg.position.z - s.z);
        if (dist < 2.7) {
          msg("🔬 " + FACTS[s.idx], 5500);
          snd.play("sample");
          s.idx += 1;
          if (s.idx === 1) {
            s.storm = 30;
            setTimeout(() => snd.play("stormAlarm"), 5600);
            setTimeout(() => msg(solar
              ? "🌪️ DUST STORM! Your solar panels now make only 30% power in this game (giant real storms can cut it to a few percent). Drive carefully!"
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
    const earth = window.FX ? FX.planet(10) : new T.Mesh(new T.SphereGeometry(10, 32, 24), new T.MeshStandardMaterial({ color: 0x3a7bd5, emissive: 0x081830 }));
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
    const markNext = () => {
      if (!LV.telescopeHint) return;
      c.querySelectorAll("[data-step]").forEach((b) => b.classList.toggle("next-hint", !!steps[next] && b.dataset.step === steps[next].id));
    };
    setTimeout(markNext, 50);
    c.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
      if (anim || done) return;
      const id = b.dataset.step;
      if (id === steps[next].id) {
        anim = { id, t: 0 };
        b.disabled = true;
        b.classList.add("done");
        msg(`✓ ${steps[next].label}…`, 1800);
        snd.play("deploy");
        next += 1;
        markNext();
      } else {
        mistakes += 1;
        snd.play("wrong");
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
    snd.stopAll(0.8);
    $f("fBars").classList.remove("on");
    const fade = $f("fFade");                     // fade back in after the "months later" cut
    if (fade.style.opacity && fade.style.opacity !== "0") {
      fade.style.transition = "opacity 1.2s ease-out";
      requestAnimationFrame(() => (fade.style.opacity = "0"));
    }
    big("");
    msg("");
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
    snd.stopAll(0.6);
    setTimeout(() => snd.play(success ? "fanfare" : "fail"), success ? 300 : 900);
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
    if (play && !frozen) play.update(dt);
    if (fx) {
      fx.composer.passes[0].scene = scene; // each stage builds a new scene
      fx.render(t / 1000);
    } else renderer.render(scene, camera);
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
    renderer.localClippingEnabled = true; // lets the rocket split at the stage line
    $f("fCanvas").appendChild(renderer.domElement);
    camera = new T.PerspectiveCamera(50, 1, 0.1, 3000);
    fx = null;
    if (window.FX && FX.available()) {
      try { fx = FX.createComposer(renderer, new T.Scene(), camera); fx.grade.uniforms.exposure.value = 1.1; fx.setLook(false); } catch (e) { fx = null; }
    }
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
    snd.stopAll(0.3);
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
    if (controls) { controls.dispose(); controls = null; }
    if (scene) scene.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    scene = null;
    play = null;
    if (envMap) { envMap.dispose(); envMap = null; }
    if (fx) { fx.composer.renderTarget1.dispose(); fx.composer.renderTarget2.dispose(); fx = null; }
    if (renderer) { renderer.dispose(); renderer = null; }
    if (root) root.remove();
    root = null;
    if (savedTheme) document.documentElement.dataset.theme = savedTheme;
    if (onFinish) onFinish(reveal);
  }

  window.Finale3D = {
    start,
    /* Testing helper: freeze the action (screenshots of a single moment) */
    debugFreeze: (on) => (frozen = !!on),
    /* Testing helper: advance the game by n frames (works even when the tab is in the background) */
    debugStep(n = 1, dt = 1 / 30, input = {}) {
      Object.assign(keys, input);
      for (let i = 0; i < n && play; i++) play.update(dt);
      return play && play.debug ? play.debug() : null;
    },
  };
})();
