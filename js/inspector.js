/* =====================================================================
   Space Mission Cube — 3D inspector (Spacecraft Hangar)
   ---------------------------------------------------------------------
   Shows one real spacecraft "on location":
     Curiosity / Perseverance → on the surface of Mars
     Apollo Lunar Module      → on the Moon, with Earth in the sky
     James Webb               → deep space, with the Sun blazing far away
     Hubble                   → in orbit, with Earth turning below
   (Light theme: a bright clean-room assembly hall instead.)

   Cinematic touches
     • the spacecraft assembles itself, part by part, as the camera swoops in
     • Exploded view: every part slides outward so you can see inside
     • hover = glowing cyan outline (also visible through other parts)
     • diagnostic: holographic scanning grid, each checked part flashes,
       dangers get a pulsing red outline, a shock-wave ping and a small
       camera shake; dangerous connections are glowing red links
     • HDR bloom, ACES film tone mapping, vignette and film grain (fx.js)
   ===================================================================== */

(function () {
  const T = THREE;
  const ENV = { curiosity: "mars", perseverance: "mars", "apollo-lm": "moon", jwst: "l2", hubble: "orbit" };
  const RED = new T.Color(0xff1f3d), CYAN = new T.Color(0x22d3ee);

  let renderer, scene, camera, controls, hemi, sun, rim, fill, fx = null, env = null, container;
  let paused = true;
  let craft = null;
  let rig, model;                // rig = model + links + effects (moves together)
  let meshes = [];               // { m, pid }
  let partGroups = {};           // part id -> [groups]
  let movers = [];               // { g, base, offset, delay } for intro + exploded view
  let baseCenters = {}, centerOffsets = {};
  let size = 5, bounds = null, modelCenter = new T.Vector3();
  let hoverId = null, selectedId = null, scanId = null;
  let focusIds = new Set(), flags = new Set();
  let pickCb = () => {}, hoverCb = () => {};
  let camAnim = null;
  let scanBeam = null, scanning = false;
  let explode = 0, explodeTarget = 0;
  let introT0 = 0, introOn = false;
  let shake = 0;
  let spinners = [];
  let pings = [];
  let lastT = performance.now();
  let flare = null, flareVis = 0, frameNo = 0, aoMesh = null;
  let accent = new T.Color(0x22d3ee);
  const connGroup = new T.Group();
  const connObjs = {};
  const envMaps = {};
  const raycaster = new T.Raycaster();
  const pointer = new T.Vector2();
  let downAt = null;

  const theme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const connById = (id) => craft && craft.connections.find((c) => c.id === id);
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  function init() {
    renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    scene = new T.Scene();
    hemi = new T.HemisphereLight(0xc8d8ff, 0x1a1a24, 0.45);
    sun = new T.DirectionalLight(0xfff4e0, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 60 });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    rim = new T.DirectionalLight(0x6fd8ff, 0.9);
    rim.position.set(-8, 5, -7);
    fill = new T.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-4, 2, 9);
    scene.add(hemi, sun, sun.target, rim, fill);

    rig = new T.Group();
    rig.add(connGroup);
    scene.add(rig);

    // Holographic scanning grid that sweeps across the spacecraft
    scanBeam = new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShaderMaterial({
      uniforms: { time: { value: 0 }, color: { value: new T.Color(0x22d3ee) } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: `uniform float time; uniform vec3 color; varying vec2 vUv;
        void main(){
          vec2 g = abs(fract(vUv*28.0 + vec2(0.0, time*0.4)) - 0.5);
          float line = smoothstep(0.43, 0.5, max(g.x, g.y));
          float r = length(vUv - 0.5) * 2.0;
          float fade = smoothstep(1.0, 0.55, r);
          float ring = smoothstep(0.035, 0.0, abs(r - 0.92));
          float a = (0.025 + line * 0.22) * fade + ring * 0.55;
          gl_FragColor = vec4(color * (1.2 + ring * 2.6), a);
        }`,
      transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    }));
    scanBeam.rotation.x = -Math.PI / 2;
    scanBeam.visible = false;
    rig.add(scanBeam);

    camera = new T.PerspectiveCamera(36, 1, 0.05, 1200);
    controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.rotateSpeed = 0.8;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controls.addEventListener("start", () => { controls.autoRotate = false; camAnim = null; });

    if (window.FX && FX.available()) {
      try { fx = FX.createComposer(renderer, scene, camera); } catch (e) { fx = null; }
      flare = FX.createFlare();
      scene.add(flare);
    }

    const el = renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
    el.addEventListener("pointerup", (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved < 6) {
        const hit = pick(e);
        if (hit) pickCb(hit);
      }
    });
    el.addEventListener("pointermove", (e) => {
      const hit = pick(e);
      const id = hit ? hit.id : null;
      if (id !== hoverId) {
        hoverId = id;
        el.style.cursor = id ? "pointer" : "grab";
      }
      hoverCb(hit, e);
    });
    el.addEventListener("pointerleave", () => { hoverId = null; hoverCb(null); });

    new ResizeObserver(resize).observe(document.body);
    window.addEventListener("themechange", () => { if (craft) { applyEnvironment(); frame(true); } });
    loop();
  }

  function disposeTree(root) {
    root.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }

  /* ---------- Location: sky, ground, lighting ---------- */
  function applyEnvironment() {
    if (env) {
      scene.remove(env.world, env.far);
      disposeTree(env.world);
      disposeTree(env.far);
    }
    const light = theme() === "light";
    const kind = light ? "studio" : ENV[craft.id];
    env = window.FX ? FX.buildEnvironment(kind) : null;
    if (!env) return;
    scene.add(env.world, env.far);
    scene.fog = env.fog;
    scene.background = env.background || new T.Color(0x000000);
    if (!envMaps[env.reflect]) envMaps[env.reflect] = Models.makeEnvMap(renderer, env.reflect);
    scene.environment = envMaps[env.reflect];
    hemi.color.set(env.hemi.sky);
    hemi.groundColor.set(env.hemi.ground);
    hemi.intensity = env.hemi.intensity;
    sun.color.set(env.sunColor);
    sun.intensity = env.sunIntensity;
    rim.intensity = env.rim;
    if (fx) {
      fx.grade.uniforms.exposure.value = env.exposure * 1.05;
      fx.setLook(light);
      accent = fx.setTheme();             // outlines + colour grade follow the website theme
      scanBeam.material.uniforms.color.value.copy(accent);
    } else {
      renderer.toneMappingExposure = env.exposure * 1.05;
    }
    placeSun();
  }
  function placeSun() {
    if (!env) return;
    sun.target.position.copy(modelCenter);
    sun.position.copy(modelCenter).addScaledVector(env.sunDir, 25);
  }

  function partOf(obj) {
    while (obj) {
      if (obj.userData && obj.userData.part) return obj.userData.part;
      obj = obj.parent;
    }
    return null;
  }

  function pick(e) {
    if (!model) return null;
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const visibleLinks = connGroup.children.filter((c) => c.visible);
    const lh = raycaster.intersectObjects(visibleLinks, true);
    if (lh.length) {
      let o = lh[0].object;
      while (o && !o.userData.conn) o = o.parent;
      if (o) return { kind: "conn", id: o.userData.conn };
    }
    const hits = raycaster.intersectObject(model, true);
    for (const h of hits) {
      const id = partOf(h.object);
      if (id) return { kind: "part", id };
    }
    return null;
  }

  function resize() {
    if (!container || !renderer) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    setRenderSize(w, h);
  }
  function setRenderSize(w, h) {
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (fx) fx.setSize(w, h);
  }

  /* ---------- Load a spacecraft ---------- */
  function load(c, opts = {}) {
    if (!renderer) init();
    const changed = !craft || craft.id !== c.id || !env;
    craft = c;
    if (model) { rig.remove(model); disposeTree(model); }
    Object.keys(connObjs).forEach((k) => { connGroup.remove(connObjs[k]); disposeTree(connObjs[k]); delete connObjs[k]; });
    pings.forEach((p) => { rig.remove(p.mesh); disposeTree(p.mesh); });
    pings = [];
    flags = new Set(); focusIds = new Set(); selectedId = scanId = hoverId = null;
    scanning = false;
    scanBeam.visible = false;
    explode = explodeTarget = 0;
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);

    model = CraftModels.build(c.id);
    Models.enableShadows(model);
    rig.add(model);
    if (aoMesh) { rig.remove(aoMesh); disposeTree(aoMesh); aoMesh = null; }

    model.updateMatrixWorld(true);
    let box3 = new T.Box3().setFromObject(model);
    if (!c.view.ground && box3.min.y < 0.6) {
      model.position.y += 0.6 - box3.min.y;
      model.updateMatrixWorld(true);
      box3 = new T.Box3().setFromObject(model);
    }
    bounds = box3;
    size = box3.getSize(new T.Vector3()).length();
    modelCenter = box3.getCenter(new T.Vector3());
    // soft contact shadow so ground vehicles sit firmly on the ground
    if (c.view.ground && window.FX) {
      const bs = box3.getSize(new T.Vector3());
      aoMesh = FX.contactShadow(bs.x * 1.3, bs.z * 1.3);
      aoMesh.position.x = modelCenter.x;
      aoMesh.position.z = modelCenter.z;
      rig.add(aoMesh);
    }

    // Every mesh's part, glow and colour; each part's centre; spinning bits
    meshes = [];
    spinners = [];
    partGroups = {};
    model.traverse((o) => {
      if (o.userData.part) (partGroups[o.userData.part] = partGroups[o.userData.part] || []).push(o);
      if (o.userData.spin) spinners.push(o);
      if (o.isMesh) {
        const pid = partOf(o);
        if (pid) {
          o.userData.baseEmissive = o.material.emissive ? o.material.emissive.getHex() : 0;
          o.userData.baseColor = o.material.color ? o.material.color.clone() : null;
          meshes.push({ m: o, pid });
        }
      }
    });
    baseCenters = {};
    centerOffsets = {};
    movers = [];
    const ids = Object.keys(partGroups);
    ids.forEach((id, i) => {
      const b = new T.Box3();
      partGroups[id].forEach((g) => b.expandByObject(g));
      const ctr = b.getCenter(new T.Vector3());
      baseCenters[id] = ctr;
      // which way this part slides in the exploded view (outward from the middle)
      let W = ctr.clone().sub(modelCenter).multiplyScalar(0.9);
      if (W.length() < size * 0.06) W = new T.Vector3(0, size * 0.12, 0);
      if (c.view.ground) W.y = Math.max(W.y, 0) + size * 0.05; // never push parts into the ground
      centerOffsets[id] = W;
      partGroups[id].forEach((g) => {
        const p = g.parent;
        const a = p.worldToLocal(ctr.clone()), bb = p.worldToLocal(ctr.clone().add(W));
        movers.push({ g, id, base: g.position.clone(), offset: bb.sub(a), delay: (i / ids.length) * 1.1, f: 0 });
      });
    });

    if (changed || opts.forceEnv) applyEnvironment();
    // The Sun's shadow box follows the spacecraft size
    const s = Math.max(6, size * 0.75);
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    sun.shadow.camera.updateProjectionMatrix();
    placeSun();

    frame(false);
    introOn = !!opts.intro;
    introT0 = performance.now();
    if (introOn) {
      // camera starts far out and high, then swoops in
      const endP = camera.position.clone(), endT = controls.target.clone();
      const dir = endP.clone().sub(endT).normalize();
      camera.position.copy(endT.clone().add(dir.multiplyScalar(size * 2.6)).add(new T.Vector3(0, size * 0.9, 0)));
      camAnim = { t0: performance.now(), dur: 2600, fromP: camera.position.clone(), fromT: endT.clone(), toP: endP, toT: endT, ease: easeInOut };
      controls.autoRotate = false;
      setTimeout(() => { if (!camAnim) controls.autoRotate = true; }, 2700);
    }
    applyMovers(performance.now());
  }

  /* Position every part for the current intro / exploded-view state */
  function applyMovers(t) {
    const it = (t - introT0) / 1000;
    let any = false;
    movers.forEach((mv) => {
      let f = explode;
      if (introOn) {
        const k = Math.min(Math.max((it - mv.delay) / 1.2, 0), 1);
        f += (1 - easeOut(k)) * 3.2;
        if (k < 1) any = true;
      }
      mv.g.position.copy(mv.base).addScaledVector(mv.offset, f);
      mv.f = f;
    });
    if (introOn && !any) introOn = false;
  }
  function centerNow(id) {
    const mv = movers.find((m) => m.id === id);
    const f = mv ? mv.f : 0;
    return baseCenters[id].clone().addScaledVector(centerOffsets[id], f).add(rig.position);
  }

  /* Point the camera at the whole spacecraft */
  function frame(animate = true) {
    const target = modelCenter.clone().add(new T.Vector3(0, craft.view.ground ? size * (explodeTarget ? 0.12 : 0.06) : 0, 0));
    const dir = new T.Vector3(...craft.view.cam).sub(new T.Vector3(...craft.view.target)).normalize();
    if (craft.view.ground && theme() !== "light") dir.y *= 0.55; // a lower camera shows the horizon and sky
    dir.normalize();
    const dist = size * (explodeTarget ? 1.6 : craft.view.ground ? 1.18 : 1.05);
    const pos = target.clone().add(dir.multiplyScalar(dist));
    controls.minDistance = Math.max(1.2, size * 0.12);
    controls.maxDistance = size * 3.2;
    controls.maxPolarAngle = craft.view.ground ? Math.PI * 0.49 : Math.PI * 0.92;
    if (animate) moveCamera(pos, target);
    else {
      camera.position.copy(pos);
      controls.target.copy(target);
      controls.autoRotate = true;
    }
  }

  function moveCamera(pos, target, dur = 900) {
    controls.autoRotate = false;
    camAnim = { t0: performance.now(), dur, fromP: camera.position.clone(), fromT: controls.target.clone(), toP: pos, toT: target, ease: easeOut };
  }

  function focus(id) {
    const c = connById(id);
    const target = c ? centerNow(c.a).add(centerNow(c.b)).multiplyScalar(0.5) : baseCenters[id] && centerNow(id);
    if (!target) return;
    const dir = camera.position.clone().sub(controls.target).normalize();
    const dist = Math.max(size * 0.32, 2.2);
    moveCamera(target.clone().add(dir.multiplyScalar(dist)), target.clone());
  }

  /* ---------- Connection links ---------- */
  function linkObj(id) {
    const c = connById(id);
    if (!c || !baseCenters[c.a] || !baseCenters[c.b]) return null;
    const a = centerNow(c.a).sub(rig.position), b = centerNow(c.b).sub(rig.position);
    const key = a.toArray().concat(b.toArray()).map((v) => v.toFixed(3)).join();
    if (connObjs[id] && connObjs[id].userData.key === key) return connObjs[id];
    if (connObjs[id]) { connGroup.remove(connObjs[id]); disposeTree(connObjs[id]); }
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += Math.max(0.25, a.distanceTo(b) * 0.25);
    const curve = new T.QuadraticBezierCurve3(a, mid, b);
    const mat = (o) => new T.MeshBasicMaterial({ color: 0xff2848, transparent: true, opacity: o, depthTest: false, fog: false, blending: T.AdditiveBlending });
    const g = new T.Group();
    g.userData.conn = id;
    g.userData.key = key;
    const r = Math.max(0.03, size * 0.005);
    g.add(new T.Mesh(new T.TubeGeometry(curve, 40, r, 8, false), mat(1)));          // bright core
    g.add(new T.Mesh(new T.TubeGeometry(curve, 40, r * 2.6, 8, false), mat(0.25)));  // soft glow
    [a, b].forEach((p) => {
      const s = new T.Mesh(new T.SphereGeometry(r * 2.8, 16, 12), mat(1));
      s.position.copy(p);
      g.add(s);
    });
    // energy pulse that travels along the link
    const bead = new T.Mesh(new T.SphereGeometry(r * 2.2, 12, 10), mat(1));
    bead.userData.curve = curve;
    g.add(bead);
    g.userData.bead = bead;
    const hitTube = new T.Mesh(new T.TubeGeometry(curve, 16, r * 5, 6, false), new T.MeshBasicMaterial({ visible: false }));
    g.add(hitTube);
    g.children.forEach((m) => (m.renderOrder = 10));
    connGroup.add(g);
    connObjs[id] = g;
    return g;
  }

  /* Expanding shock-wave ring when the scan finds something */
  function ping(id, color, strength = 1) {
    const c = connById(id);
    const pos = c ? centerNow(c.a).add(centerNow(c.b)).multiplyScalar(0.5) : centerNow(id);
    const m = new T.Mesh(new T.RingGeometry(0.86, 1, 64), new T.MeshBasicMaterial({ color, transparent: true, depthTest: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false }));
    m.material.color.multiplyScalar(4 * strength);
    m.position.copy(pos.sub(rig.position));
    m.renderOrder = 12;
    rig.add(m);
    pings.push({ mesh: m, t0: performance.now(), max: size * 0.18 * strength });
  }


  /* Adaptive quality: if frames are slow (e.g. a laptop's built-in graphics),
     render fewer pixels so animation stays smooth */
  const perf = { ema: 1 / 60, frames: 0, level: 0 };
  function adaptQuality(dt) {
    if (dt <= 0 || dt > 0.25) return;
    perf.ema = perf.ema * 0.95 + dt * 0.05;
    if (++perf.frames < 90 || perf.level >= 2 || perf.ema < 1 / 42) return;
    perf.level++;
    perf.frames = 0;
    renderer.setPixelRatio(perf.level === 1 ? 1 : 0.8);
    if (perf.level === 2) { sun.shadow.mapSize.set(2048, 2048); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    resize();
  }

  /* ---------- Animation loop ---------- */
  function loop() {
    requestAnimationFrame(loop);
    if (paused || !container || !model) return;
    render(performance.now());
  }

  function render(t) {
    adaptQuality((t - lastT) / 1000);
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    const pulse = 0.55 + 0.45 * Math.sin(t / 200);
    const flash = 0.6 + 0.4 * Math.sin(t / 60);

    // exploded view eases in and out
    if (Math.abs(explode - explodeTarget) > 0.0005) explode += (explodeTarget - explode) * Math.min(1, dt * 4.5);
    else explode = explodeTarget;
    applyMovers(t);

    // gentle floating for spacecraft that are in space
    if (!craft.view.ground) {
      rig.position.y = Math.sin(t / 1600) * size * 0.006;
      rig.rotation.z = Math.sin(t / 2300) * 0.008;
    }
    spinners.forEach((o) => (o.rotation.y += o.userData.spin * dt * 6));

    if (camAnim) {
      const k = Math.min((t - camAnim.t0) / camAnim.dur, 1);
      const e = camAnim.ease(k);
      camera.position.lerpVectors(camAnim.fromP, camAnim.toP, e);
      controls.target.lerpVectors(camAnim.fromT, camAnim.toT, e);
      if (k >= 1) camAnim = null;
    }

    // part glow + colour tint (outlines do the heavy lifting when post-processing is on)
    const scanConn = connById(scanId);
    const selConn = connById(selectedId);
    const tintK = fx ? 0.6 : 1;
    const hoverParts = new Set();
    meshes.forEach(({ m, pid }) => {
      const em = m.material.emissive, base = m.userData.baseColor, col = m.material.color;
      if (!em) return;
      const tint = (c, k) => base && col.copy(base).lerp(c, k * tintK);
      if (pid === hoverId || pid === selectedId || focusIds.has(pid)) { em.setHex(0x0b5f78); tint(CYAN, 0.35); hoverParts.add(pid); }
      else if (pid === scanId || (scanConn && (scanConn.a === pid || scanConn.b === pid))) { em.setRGB(0.05 * flash, 0.6 * flash, 0.8 * flash); tint(CYAN, 0.45 * flash); hoverParts.add(pid); }
      else if (flags.has(pid)) { em.setRGB(0.9 * pulse, 0.02, 0.05); tint(RED, 0.45 + 0.3 * pulse); }
      else if (selConn && (selConn.a === pid || selConn.b === pid)) { em.setHex(0x0b4f63); tint(CYAN, 0.25); hoverParts.add(pid); }
      else { em.setHex(m.userData.baseEmissive || 0); if (base) col.copy(base); }
    });
    if (fx) {
      const hov = [], dang = [];
      hoverParts.forEach((id) => hov.push(...partGroups[id]));
      flags.forEach((id) => partGroups[id] && !hoverParts.has(id) && dang.push(...partGroups[id]));
      fx.setOutlines(hov, dang);
    }

    // connection links: red when flagged, cyan while checked or highlighted, with a travelling pulse
    craft.connections.forEach((c) => {
      const isFlag = flags.has(c.id), isScan = scanId === c.id, isFocus = focusIds.has(c.id) || selectedId === c.id || hoverId === c.id;
      if (!isFlag && !isScan && !isFocus) { if (connObjs[c.id]) connObjs[c.id].visible = false; return; }
      const o = linkObj(c.id);
      if (!o) return;
      o.visible = true;
      const hot = isScan || (isFocus && !isFlag);
      o.children.forEach((m, i) => {
        if (m.material.visible === false) return;
        m.material.color.setHex(hot ? 0x22d3ee : 0xff2848).multiplyScalar(i === 1 ? 2 : 5); // over-bright so it blooms
        if (i === 1) m.material.opacity = 0.18 + 0.15 * pulse;
      });
      const bead = o.userData.bead;
      bead.position.copy(bead.userData.curve.getPoint(((t / 900) + c.id.length * 0.13) % 1));
    });

    // scanning grid
    if (scanning && bounds) {
      const s = bounds.getSize(new T.Vector3());
      const k = (Math.sin(t / 520) + 1) / 2;
      const span = Math.max(s.x, s.z) * 1.35 + 0.6;
      scanBeam.visible = true;
      scanBeam.scale.set(span, span, 1);
      scanBeam.position.set(modelCenter.x, bounds.min.y + k * s.y, modelCenter.z);
      scanBeam.material.uniforms.time.value = t / 1000;
    } else scanBeam.visible = false;

    // shock-wave pings
    pings = pings.filter((p) => {
      const k = (t - p.t0) / 900;
      if (k >= 1) { rig.remove(p.mesh); disposeTree(p.mesh); return false; }
      p.mesh.scale.setScalar(0.05 + easeOut(k) * p.max);
      p.mesh.material.opacity = 1 - k;
      p.mesh.quaternion.copy(camera.quaternion);
      return true;
    });

    controls.update();
    if (env) env.update(dt, t, camera);

    // lens flare when the Sun is in view (and not hidden behind the spacecraft)
    if (flare) {
      if (env && env.skySun) {
        if (frameNo++ % 6 === 0) {
          raycaster.set(camera.position, env.skySun);
          flareVis = raycaster.intersectObject(model, true).length ? 0 : 1;
        }
        flare.userData.update(camera, camera.position.clone().addScaledVector(env.skySun, 400), flareVis, dt);
      } else flare.visible = false;
    }

    // a short camera shake when a danger is found
    let saved = null;
    if (shake > 0.001) {
      saved = camera.position.clone();
      const a = shake * size * 0.004;
      camera.position.add(new T.Vector3((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a));
      shake *= Math.pow(0.02, dt);
    }
    if (fx) fx.render(t / 1000); else renderer.render(scene, camera);
    if (saved) camera.position.copy(saved);
  }

  /* ---------- Public API ---------- */
  window.Inspector = {
    available: () => typeof THREE !== "undefined" && !!THREE.OrbitControls && !!window.CraftModels,
    mount(el) {
      if (!renderer) init();
      container = el;
      el.appendChild(renderer.domElement);
      paused = false;
      lastT = performance.now();
      perf.frames = 0;
      resize();
    },
    load,
    frame: () => frame(true),
    focus,
    pause: () => { paused = true; container = null; },
    onPick: (cb) => (pickCb = cb),
    onHover: (cb) => (hoverCb = cb),
    setHover: (id) => { focusIds = new Set(id ? [id] : []); },
    select: (id) => (selectedId = id),
    setScanning: (on) => (scanning = on),
    setScanId: (id) => (scanId = id),
    flag(id) {
      flags.add(id);
      ping(id, 0xff2848);
      shake = 1;
    },
    pingSafe: (id) => ping(id, 0x34d399, 0.35),
    clearFlags: () => (flags = new Set()),
    setExploded(on) {
      explodeTarget = on ? 1 : 0;
      frame(true);
    },
    isExploded: () => explodeTarget === 1,
    /* Testing helper: look inside (renderer, scene, effects) */
    debug: () => ({ renderer, scene, camera, controls, fx, env, sun, hemi }),
    /* Render a still picture of a spacecraft (for the hangar cards) */
    snapshot(c, w = 560, h = 385) {
      if (!renderer) init();
      const keep = container;
      container = null;
      load(c, { forceEnv: true });
      controls.update();
      setRenderSize(w, h);
      if (env) env.update(0, 0, camera);
      if (fx) fx.render(0); else renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL("image/jpeg", 0.88);
      container = keep;
      return url;
    },
  };
})();
