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
     STAGE 1 — Launch cinematic (about 15 seconds, several camera shots)
       0.0 s  dusk on the pad, vapour venting, countdown
       2.6 s  ignition: water-deluge steam billows out of the flame trench
       3.2 s  liftoff: tower arms swing away, smoke column, sparks
       6.2 s  long-lens tracking shot, climbing through the clouds, Max-Q
      10.5 s  space: Earth below, stage separation, second stage burns
      13.4 s  Mars & Moon: engine off in a "parking orbit" around Earth,
              then a second burn sends the spacecraft on its way
              (to Mars: escaping Earth, it then orbits the Sun until it
              meets Mars). Webb skips the parking orbit and heads to L2.
      ~19 s   "8 months later…" → the playable mission starts
     ===================================================================== */
  function startLaunch() {
    stage = "launch";
    stageT = 0;
    newScene(0x0d1b3a);
    scene.fog = new T.Fog(0x3a3550, 90, 480);
    lights([20, 40, 30], 0.5);
    const starPts = stars(1600, 900);
    starPts.material.transparent = true;
    starPts.material.opacity = 0.25;
    scene.add(starPts);

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
    sky.renderOrder = -10; // always drawn first, so smoke and clouds show in front of it
    scene.add(sky);

    // ---- The launch site ----
    const site = new T.Group();
    scene.add(site);
    const ground = new T.Mesh(new T.PlaneGeometry(1400, 1400), new T.MeshStandardMaterial({ color: 0x26301f, roughness: 1, map: tiled("moon", 120) }));
    ground.rotation.x = -Math.PI / 2;
    site.add(ground);
    const concrete = () => new T.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.9, map: tiled("moon", 2) });
    const pad = new T.Mesh(new T.BoxGeometry(12, 0.6, 12), concrete());
    pad.position.y = 0.3;
    const trench = new T.Mesh(new T.BoxGeometry(2.4, 0.62, 12.2), new T.MeshStandardMaterial({ color: 0x151515, roughness: 1 }));
    trench.position.y = 0.3;
    site.add(pad, trench);
    // water towers / tanks beside the pad
    [[-15, -13], [16, -12]].forEach(([x, z]) => {
      const tank = new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 3, 24), new T.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.4, roughness: 0.4 }));
      tank.position.set(x, 1.5, z);
      const dome = new T.Mesh(new T.SphereGeometry(1.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), tank.material);
      dome.position.set(x, 3, z);
      site.add(tank, dome);
    });

    // steel lattice tower + access arms that swing away at liftoff
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
    const TH = 19, w = 0.8;
    [[-w, -w], [w, -w], [w, w], [-w, w]].forEach(([x, z]) => beam([x, 0, z], [x, TH, z], 0.08, tower));
    for (let y = 0; y < TH; y += 1.4) {
      [[-w, -w, w, -w], [w, -w, w, w], [w, w, -w, w], [-w, w, -w, -w]].forEach(([x1, z1, x2, z2]) => {
        beam([x1, y, z1], [x2, y, z2], 0.035, tower);
        beam([x1, y, z1], [x2, y + 1.4, z2], 0.025, tower);
      });
    }
    beam([0, TH, 0], [0, TH + 5, 0], 0.05, tower);
    const beacon = new T.Mesh(new T.SphereGeometry(0.18, 10, 8), new T.MeshBasicMaterial({ color: new T.Color(3, 0.2, 0.15), fog: false }));
    beacon.position.y = TH + 5.1;
    tower.add(beacon);
    tower.position.set(-4.6, 0.6, 0);
    site.add(tower);
    const arms = [5.5, 10, 14.5].map((y) => {
      const pivot = new T.Group();
      pivot.position.set(w, y, 0);
      beam([0, 0, 0], [2.9, 0, 0], 0.11, pivot);
      const walk = new T.Mesh(new T.BoxGeometry(2.9, 0.08, 0.7), steel());
      walk.position.set(1.45, -0.12, 0);
      pivot.add(walk);
      tower.add(pivot);
      return pivot;
    });

    // floodlights with faint light beams, and the glow from the engines
    [[-14, 10], [14, 10], [0, -16]].forEach(([x, z]) => {
      const sp = new T.SpotLight(0xdfe8ff, 1.1, 90, 0.42, 0.6);
      sp.position.set(x, 11, z);
      sp.target.position.set(0, 7, 0);
      scene.add(sp, sp.target);
      const beamGeo = new T.ConeGeometry(3, 22, 24, 1, true);
      beamGeo.translate(0, -11, 0);
      const lightBeam = new T.Mesh(beamGeo, new T.MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.022, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      lightBeam.position.set(x, 11, z);
      lightBeam.lookAt(0, 7, 0);
      lightBeam.rotateX(-Math.PI / 2);
      site.add(lightBeam);
      const lamp = new T.Mesh(new T.SphereGeometry(0.3, 10, 8), new T.MeshBasicMaterial({ color: new T.Color(4, 4, 4.4), fog: false }));
      lamp.position.set(x, 11, z);
      site.add(lamp);
    });
    const glow = new T.PointLight(0xff8a3a, 0, 70, 2);
    scene.add(glow);
    // twinkling lights of the space centre on the horizon
    const horizon = new T.Group();
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * Math.PI * 2, r = 140 + Math.random() * 260;
      const s = new T.Sprite(new T.SpriteMaterial({ map: softMap(), color: new T.Color().setHSL(0.08 + Math.random() * 0.06, 0.8, 0.6).multiplyScalar(2.2),
        blending: T.AdditiveBlending, transparent: true, depthWrite: false }));
      s.position.set(Math.cos(a) * r, 0.4 + Math.random() * 2, Math.sin(a) * r);
      s.scale.setScalar(0.8 + Math.random() * 1.6);
      horizon.add(s);
    }
    site.add(horizon);

    // ---- The rocket, built twice so it can split at the stage line ----
    const type = parts.launch ? parts.launch.id : "saturnv";
    const SEP = { saturnv: 0.34, a401: 0.56, a541: 0.56, d4h: 0.66, medium: 0.55, ariane5: 0.55, superheavy: 0.62 }[type] || 0.5;
    const S = 1.8;
    const lower = Models.buildRocket(type), upper = Models.buildRocket(type);
    [lower, upper].forEach((r) => { r.scale.setScalar(S); scene.add(r); });
    const bb = new T.Box3().setFromObject(lower);
    const baseY = bb.min.y / S, topY = bb.max.y / S;
    const radius = (bb.max.x - bb.min.x) / 2 / S;
    const sepY = baseY + (topY - baseY) * SEP;
    const pLow = new T.Plane(), pUp = new T.Plane();
    lower.traverse((o) => { if (o.isMesh) o.material.clippingPlanes = [pLow]; });
    upper.traverse((o) => { if (o.isMesh) o.material.clippingPlanes = [pUp]; });
    const upperBell = new T.Mesh(new T.CylinderGeometry(0.1, 0.24, 0.42, 20, 1, true), new T.MeshStandardMaterial({ color: 0x3a3e46, metalness: 0.9, roughness: 0.35, side: T.DoubleSide }));
    upperBell.position.y = sepY - 0.2;
    upperBell.visible = false;
    upper.add(upperBell);
    const cutPlanes = () => {
      [[lower, pLow, -1], [upper, pUp, 1]].forEach(([obj, pl, sgn]) => {
        obj.updateMatrixWorld();
        pl.setFromNormalAndCoplanarPoint(new T.Vector3(0, sgn, 0).applyQuaternion(obj.quaternion).normalize(), obj.localToWorld(new T.Vector3(0, sepY, 0)));
      });
    };
    const plume1 = makePlume({ core: [2.6, 2.3, 1.9], inner: [1.8, 0.85, 0.25], outer: [1.0, 0.42, 0.12], glow: [2.0, 1.1, 0.5] });
    plume1.position.y = baseY;
    plume1.scale.setScalar(Math.max(0.8, radius / 0.42));
    lower.add(plume1);
    const plume2 = makePlume({ core: [1.7, 2.0, 2.6], inner: [0.5, 0.75, 1.8], outer: [0.25, 0.35, 0.95], glow: [0.9, 1.2, 2.3] });
    plume2.position.y = sepY - 0.4;
    plume2.scale.set(0.55, 1.3, 0.55);
    upper.add(plume2);

    // ---- Smoke, steam, vapour, sparks and clouds ----
    const smoke = particles(260, 0xd8d4cc);
    const steam = particles(140, 0xf2f2f2);
    const vapour = particles(40, 0xffffff);
    const puffs = particles(40, 0xffffff);
    const sparkN = 220, sparkPos = new Float32Array(sparkN * 3), sparkVel = [];
    for (let i = 0; i < sparkN; i++) sparkVel.push(new T.Vector3());
    const sparkGeo = new T.BufferGeometry();
    sparkGeo.setAttribute("position", new T.BufferAttribute(sparkPos, 3));
    const sparks = new T.Points(sparkGeo, new T.PointsMaterial({ map: softMap(), color: new T.Color(3, 1.6, 0.5), size: 0.35, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    scene.add(sparks);
    const clouds = new T.Group();
    const cTex = cloudTex();
    for (let i = 0; i < 46; i++) {
      const c = new T.Sprite(new T.SpriteMaterial({ map: cTex, color: 0xffe4d0, transparent: true, opacity: 0.9, depthWrite: false }));
      c.position.set(-60 + Math.random() * 160, 62 + Math.random() * 18, -70 + Math.random() * 140);
      c.scale.set(30 + Math.random() * 30, 14 + Math.random() * 10, 1);
      clouds.add(c);
    }
    scene.add(clouds);

    // ---- Flight path (simplified, sped up for the game) ----
    const flight = (t) => {
      const L = Math.max(0, t - 3.2);
      const after = Math.max(0, L - 3.5);
      return { y: 0.6 + 1.25 * Math.pow(L, 2.2), x: 0.9 * Math.pow(after, 2.4), pitch: Math.min(0.55, after * 0.09) };
    };
    const place = (obj, f) => { obj.position.set(f.x, f.y, 0); obj.rotation.set(0, 0, -f.pitch); };

    // ---- Cinematic overlay: letterbox bars, cut fades, skip button ----
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
    /* How each real mission left Earth (simplified):
       • Curiosity: parked in Earth orbit, then the Centaur stage fired again ("trans-Mars injection")
         to escape Earth. After that it orbited the Sun for about 8 months until it met Mars.
       • Apollo 11: parked in Earth orbit, then "trans-lunar injection" sent it on a long loop out to
         the Moon (which itself orbits Earth), arriving about 4 days later.
       • Webb: no parking orbit; the Ariane 5 sent it straight on a path to L2, reached about a month later. */
    const J = {
      "mars-rover": { parking: true, burn: "TRANS-MARS INJECTION", burnShort: "MARS BURN",
        burnMsg: "🔥 Second burn: speeding up to escape Earth's gravity",
        away: "ON THE WAY TO MARS", awayMsg: "☀️ Free of Earth, the spacecraft now orbits the Sun, on a path that meets Mars",
        later: "ABOUT 8 MONTHS LATER…", arrive: "🔴 Arriving at Mars: entry, descent and landing!", escape: 41000 },
      "lunar-lander": { parking: true, burn: "TRANS-LUNAR INJECTION", burnShort: "MOON BURN",
        burnMsg: "🔥 Second burn: speeding up to leave Earth orbit for the Moon",
        away: "ON THE WAY TO THE MOON", awayMsg: "🌕 Now coasting on a long loop out to the Moon (the Moon itself orbits Earth)",
        later: "ABOUT 4 DAYS LATER…", arrive: "🌕 Arriving at the Moon: time to land!", escape: 39000 },
      "deep-space-telescope": { parking: false,
        away: "ON COURSE TO L2", awayMsg: "🔭 No parking orbit: the rocket sent Webb straight towards L2, 1.5 million km from Earth",
        later: "ABOUT 1 MONTH LATER…", arrive: "🔭 Arriving at L2: time to unfold the telescope!", escape: 36000 },
    }[mission.id] || { parking: false, away: "ON ITS WAY", awayMsg: "", later: "LATER…", arrive: "", escape: 36000 };
    // timeline for the second stage (seconds into the launch)
    const TL = J.parking
      ? { burn1End: 13.4, orbit: 13.6, burn2: 15.0, burn2End: 16.9, away: 16.8, skip: 18.6, play: 20.2 }
      : { burn1End: 14.6, orbit: null, burn2: null, burn2End: null, away: 13.8, skip: 15.8, play: 17.4 };
    const burning = (t) => (t >= 11.3 && t < TL.burn1End) || (TL.burn2 != null && t >= TL.burn2 && t < TL.burn2End);
    const roar = snd.loop("rocket");
    let stage2 = null;
    let lastCount = null, lastShot = -1, shake = 0, bigUntil = 0;
    let sepDone = false, lowerVel = new T.Vector3(), upperVel = new T.Vector3(), spin = new T.Vector3(), sepDir = new T.Vector3(0, 1, 0);
    let earth = null, sunG = null, milky = null;
    const earthOff = new T.Vector3(30, -548, -80), sunOff = new T.Vector3(), milkyOff = new T.Vector3();
    let smokeT = 0, steamT = 0, ventT = 0;
    const done = {};
    const once = (key, t, fn) => { if (!done[key] && stageT >= t) { done[key] = true; fn(); } };
    const say = (txt, secs = 1.4) => { big(txt); bigUntil = stageT + secs; };
    const pad2 = (n) => String(Math.floor(n)).padStart(2, "0");
    const v3 = (x, y, z) => new T.Vector3(x, y, z);

    function toSpace() {
      site.visible = false;
      clouds.visible = false;
      steam.hide();
      sky.visible = false;
      scene.fog = null;
      scene.background = new T.Color(0x000000);
      starPts.material.opacity = 1;
      const up = upper.position.clone();
      const sunDir = new T.Vector3(-0.55, 0.2, -0.8).normalize();
      if (window.FX) {
        earth = FX.planet(520, { sunDir: new T.Vector3(0.6, 0.4, -0.5) });
        earth.position.copy(up).add(earthOff);
        earth.rotation.set(0.3, 1.2, 0.15);
        scene.add(earth);
        sunG = FX.sun(sunDir, 60);
        sunOff.copy(sunDir).multiplyScalar(420);
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
        once("ign", 2.6, () => { msg("🔥 Main engine start: water floods the pad to soak up the sound", 2600); snd.play("ignition"); shake = 0.6; });
        once("lift", 3.2, () => { say("LIFTOFF!", 1.6); snd.play("release"); });
        once("clear", 5.0, () => msg("🗼 The rocket has cleared the tower", 2200));
        once("maxq", 7.4, () => msg("💨 Max-Q: the moment of greatest air pressure on the rocket", 2800));
        once("meco", 10.1, () => { msg("First stage engine cut-off", 1500); });
        once("sep", 10.6, () => {
          sepDone = true;
          say("STAGE SEPARATION", 1.5);
          snd.play("separation");
          // from here on, motion is shown slowed down so you can watch the stages part
          const f0 = flight(t - 0.02), f1 = flight(t);
          sepDir.set(f1.x - f0.x, f1.y - f0.y, 0).normalize();
          upperVel.copy(sepDir).multiplyScalar(6);
          lowerVel.copy(sepDir).multiplyScalar(5.2);
          spin.set(0.25 + Math.random() * 0.2, 0.3, 0.55);
          upperBell.visible = true;
          const p = upper.localToWorld(v3(0, sepY, 0));
          for (let i = 0; i < 26; i++) {
            const a = (i / 26) * Math.PI * 2;
            puffs.spawn(p, v3(Math.cos(a) * 6, (Math.random() - 0.5) * 2, Math.sin(a) * 6), { life: 1.6, drag: 1.4, s0: 0.6, s1: 3.2, a0: 0.8 });
          }
        });
        once("s2", 11.3, () => { msg("🔵 Second stage ignition", 2200); snd.play("stage2"); stage2 = snd.loop("thruster"); });
        if (TL.orbit != null) {
          once("seco", TL.burn1End, () => msg("Second stage engine cut-off", 1200));
          once("orbit", TL.orbit, () => { say("EARTH ORBIT", 1.6); snd.play("orbit");
            msg("🛰 A \"parking orbit\" around Earth, about 185 km up. Not fast enough to leave Earth yet!", 2800); });
          once("burn2", TL.burn2, () => { say(J.burn, 1.6); snd.play("stage2"); msg(J.burnMsg, 2200); });
        }
        once("away", TL.away, () => { say(J.away, 1.8); snd.play("orbit"); if (J.awayMsg) msg(J.awayMsg, 3200); });
        once("skip", TL.skip, () => {
          // time skip: fade to black for the long cruise
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
        if (!sepDone) { place(upper, f); place(lower, f); }
        else {
          if (burning(t)) upperVel.addScaledVector(sepDir, 7 * dt); // second stage pushes ahead while its engine burns
          upper.position.addScaledVector(upperVel, dt);
          lowerVel.addScaledVector(sepDir, -2.2 * dt);              // spent first stage falls behind
          lower.position.addScaledVector(lowerVel, dt);
          lower.rotation.x += spin.x * dt;
          lower.rotation.z += spin.z * dt;
        }
        cutPlanes();
        const L = Math.max(0, t - 3.2);
        const alt = sepDone ? 200 : f.y;
        const thin = Math.min(1, alt / 110);
        if (earth) {                       // Earth, Sun and stars stay put around the rocket
          earth.position.copy(upper.position).add(earthOff);
          earth.rotation.y += dt * 0.012;
          if (t > TL.away) earthOff.add(v3(0, -45 * dt, 25 * dt)); // Earth shrinks away behind us
          sunG.position.copy(upper.position).add(sunOff);
          milky.position.copy(upper.position);
        }       // how thin the air is (0 = ground, 1 = space)
        plume1.userData.update(t, sepDone ? 0 : t < 2.6 ? 0 : Math.min(1, (t - 2.6) * 2.5), thin);
        plume2.userData.update(t, burning(t) ? Math.min(1, (t - (t >= (TL.burn2 || 99) ? TL.burn2 : 11.3)) * 2) : 0, 1);
        roar.set(t < 2.6 ? 0 : sepDone ? 0 : Math.min(1, (t - 2.6) * 2) * Math.max(0.25, 1 - Math.max(0, t - 4) / 7));
        if (stage2) stage2.set(burning(t) ? 0.55 : 0);

        // tower arms swing away at liftoff, the beacon blinks
        const armK = Math.min(1, Math.max(0, (t - 3.0) / 1.3));
        arms.forEach((a, i) => (a.rotation.y = -armK * (1.3 + i * 0.1)));
        beacon.material.color.setRGB(Math.sin(t * 6) > 0 ? 3 : 0.3, 0.15, 0.1);

        // engine light on the pad and smoke
        const nozzle = lower.localToWorld(v3(0, baseY, 0));
        glow.position.copy(nozzle).add(v3(0, -1.5, 0));
        glow.intensity = !sepDone && t > 2.6 ? (4 + Math.random() * 2) * Math.max(0.1, 1 - L / 6) : 0;

        // ---------- particles ----------
        ventT -= dt;
        if (t < 3.2 && ventT <= 0) {         // vapour venting from the cold fuel tanks
          ventT = 0.09;
          const side = Math.random() < 0.5 ? -1 : 1;
          const p = lower.localToWorld(v3(side * radius * 1.05, baseY + (topY - baseY) * (0.25 + Math.random() * 0.45), (Math.random() - 0.5) * radius));
          vapour.spawn(p, v3(side * (0.6 + Math.random()), -0.8 - Math.random() * 0.6, 0), { life: 2.4, drag: 0.4, rise: -0.2, s0: 0.5, s1: 2.6, a0: 0.35 });
        }
        steamT -= dt;
        if (t > 2.6 && t < 7.5 && steamT <= 0) {   // water-deluge steam blasting out of both ends of the flame trench
          steamT = 0.03;
          [-1, 1].forEach((dir) => steam.spawn(v3((Math.random() - 0.5) * 2, 0.9, dir * 6),
            v3((Math.random() - 0.5) * 5, 2 + Math.random() * 3, dir * (10 + Math.random() * 8)),
            { life: 4.5, drag: 0.55, rise: 0.6, s0: 3, s1: 15, a0: 0.85, c0: 0xffc89a, c1: 0xe8e8ea }));
        }
        smokeT -= dt;
        if (t > 3.2 && !sepDone && smokeT <= 0) {  // exhaust smoke column left in the sky
          smokeT = 0.028;
          const low = alt < 8;
          smoke.spawn(nozzle.clone().add(v3((Math.random() - 0.5) * 0.8, -1.8 * S, (Math.random() - 0.5) * 0.8)),
            low ? v3((Math.random() - 0.5) * 14, Math.random() * 2, (Math.random() - 0.5) * 14) : v3((Math.random() - 0.5) * 1.5, -2 - Math.random() * 2, (Math.random() - 0.5) * 1.5),
            { life: low ? 4 : 7, drag: 0.6, rise: 0.15, s0: low ? 3 : 2.4, s1: low ? 14 : 10 + thin * 10, a0: 0.75 * (1 - thin * 0.6), c0: 0xffb070, c1: 0xcfcac2 });
        }
        smoke.update(dt);
        steam.update(dt);
        vapour.update(dt);
        puffs.update(dt);

        // sparks thrown off at ignition
        if (t > 2.6 && t < 3.6) {
          for (let i = 0; i < 6; i++) {
            const j = Math.floor(Math.random() * sparkN);
            sparkPos.set([nozzle.x + (Math.random() - 0.5) * 2, Math.max(0.7, nozzle.y - 1), nozzle.z + (Math.random() - 0.5) * 2], j * 3);
            const a = Math.random() * Math.PI * 2;
            sparkVel[j].set(Math.cos(a) * (5 + Math.random() * 9), 3 + Math.random() * 7, Math.sin(a) * (5 + Math.random() * 9));
          }
        }
        for (let i = 0; i < sparkN; i++) {
          sparkVel[i].y -= 14 * dt;
          sparkPos[i * 3] += sparkVel[i].x * dt;
          sparkPos[i * 3 + 1] = Math.max(0.65, sparkPos[i * 3 + 1] + sparkVel[i].y * dt);
          sparkPos[i * 3 + 2] += sparkVel[i].z * dt;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        sparks.material.opacity = t > 2.6 && t < 5 ? 1 - Math.max(0, t - 3.8) / 1.2 : 0;

        // ---------- sky: dusk → dark blue → black space ----------
        const k = Math.min(1, Math.max(0, (alt - 15) / 100));
        if (scene.background && scene.background.isColor && !earth) scene.background.setRGB(0.05 * (1 - k), 0.1 * (1 - k), 0.22 * (1 - k));
        sky.material.opacity = 1 - k;
        if (scene.fog) { scene.fog.color.setRGB(0.23 * (1 - k), 0.21 * (1 - k), 0.31 * (1 - k)); scene.fog.far = 480 + k * 900; }
        if (!earth) starPts.material.opacity = 0.25 + k * 0.75;

        // ---------- camera direction: four shots ----------
        const shot = t < 3.2 ? 0 : t < 6.2 ? 1 : t < 10.5 ? 2 : 3;
        if (shot !== lastShot) {
          if (lastShot >= 0) dip();
          lastShot = shot;
          if (shot === 3) toSpace();
          if (shot === 2) { const p = upper.position; camera.position.set(p.x + 26, p.y - 4, p.z + 30); }
        }
        const up = upper.position;
        let look;
        if (shot === 0) {            // slow orbit around the pad at dusk
          const a = 0.9 + t * 0.09;
          camera.position.set(Math.sin(a) * 30, 5 + t * 0.6, Math.cos(a) * 30);
          look = v3(0, 8.5, 0);
          camera.fov = 40;
        } else if (shot === 1) {     // low ground camera: the rocket thunders up past us
          camera.position.set(9.5, 1.1, 11.5);
          look = v3(up.x, Math.max(6, up.y + 6), 0);
          camera.fov = 52 - (t - 3.2) * 3;
        } else if (shot === 2) {     // long-lens tracking shot, through the clouds
          camera.position.lerp(v3(up.x + 24, up.y - 3, up.z + 28), 0.06);
          look = v3(up.x, up.y + 5, up.z);
          camera.fov = 32;
        } else {                     // in space: orbit the second stage, first stage tumbling away
          const a = 0.7 + (t - 10.5) * 0.14;
          camera.position.set(up.x + Math.sin(a) * 24, up.y + 5, up.z + Math.cos(a) * 24);
          look = upper.localToWorld(v3(0, sepY, 0));
          camera.fov = 44;
        }
        camera.updateProjectionMatrix();
        camera.lookAt(look);

        // camera shake: strongest at ignition and when the rocket roars past
        const roarK = !sepDone && t > 2.6 ? Math.max(0, 1 - L / 8) : 0;
        shake = Math.max(shake * Math.pow(0.1, dt), shot === 1 ? 0.22 * roarK : shot === 0 ? 0.06 * roarK : shot === 2 ? 0.05 * roarK : 0);
        if (shake > 0.002) camera.position.add(v3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));

        // ---------- mission readouts ----------
        let altKm = Math.max(0, (alt - 0.6) * 0.6);
        let speed = 0;
        if (t > 3.2) speed = Math.min(7750, 2.75 * Math.pow(L, 1.2) * 260);
        if (t > 10.5) {
          if (J.parking) {
            altKm = Math.min(185, 59 + (t - 10.5) * 44);
            speed = 7750 + Math.min(1, (t - 10.5) / 2.9) * 20250;                       // ~28,000 km/h: orbital speed
            if (t > TL.burn2) {                                                          // second burn: escape speed
              speed = 28000 + Math.min(1, (t - TL.burn2) / (TL.burn2End - TL.burn2)) * (J.escape - 28000);
              altKm = 185 + (t - TL.burn2) * 260;
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
          { label: "STAGE", value: !sepDone ? "1 · BOOST" : t < 11.3 ? "COAST"
              : t < TL.burn1End ? (J.parking ? "2 · ORBIT BURN" : "2 · BURN TO L2")
              : TL.burn2 != null && t < TL.burn2 ? "PARKING ORBIT"
              : TL.burn2End != null && t < TL.burn2End ? "2 · " + J.burnShort
              : J.parking && mission.id === "mars-rover" ? "ORBITING THE SUN" : "COASTING", color: sepDone ? "#93c5fd" : "#fdba74" },
        ]);

        if (t > TL.play) startPlay();
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
    const fuelMax = 22 + Math.min(Math.max((dv - 2100) / 4, 0), 20);
    const s = { x: 28, y: 110, vx: 0, vy: -9, fuel: fuelMax, done: false };

    setHeader("STAGE 2 · POWERED DESCENT", "Land your lander!",
      `Hold <b>THRUST</b> (Space / ↑) to slow down. Use <b>◀ ▶</b> to reach the <span class="text-emerald-300">green circle</span>. Touch down slower than <b>4 m/s</b>.<br><span class="text-slate-400">Your design's Δv (${dv} m/s) gives you ${fuelMax.toFixed(0)} seconds of fuel.</span>`);
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
          engine.set(0);
          snd.play(soft ? "touchdown" : "crash");
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
        s.energy += (fwd ? -12 : 0) * dt + charge(stormOn) * dt;
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
    if (play) play.update(dt);
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
    /* Testing helper: advance the game by n frames (works even when the tab is in the background) */
    debugStep(n = 1, dt = 1 / 30, input = {}) {
      Object.assign(keys, input);
      for (let i = 0; i < n && play; i++) play.update(dt);
      return play && play.debug ? play.debug() : null;
    },
  };
})();
