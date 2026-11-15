/* =====================================================================
   Space Mission Cube — 3D workshop viewer (dashboard)
   ---------------------------------------------------------------------
   Shows the spacecraft you are designing. Drag to rotate, scroll/pinch
   to zoom, hover a part to see its name, click a part to swap it.

   Graphics: filmic tone mapping, reflections (environment map), soft
   shadows and textured ground. Dark theme = deep space, light theme =
   a bright clean-room "assembly hall".
   ===================================================================== */

(function () {
  const T = THREE;

  /* Camera framing for each mission */
  const FRAMING = {
    "mars-rover": { cam: [7, 4.2, 8], target: [-1.4, 1.5, 0], ground: "mars", env: "mars" },
    "deep-space-telescope": { cam: [9, 5.5, 10], target: [-2, 2.2, 0], ground: null, env: "l2" },
    "lunar-lander": { cam: [7, 4.4, 8.5], target: [-1.4, 1.8, 0], ground: "moon", env: "moon" },
  };

  let renderer, scene, camera, controls, craftRoot, groundMesh, stars, hemi, sun;
  let fx = null, sky = null; // cinematic post-processing + Milky Way sky (fx.js)
  let envObj = null;          // dark themes: the real location (Mars, Moon, deep space)
  let container = null;
  let paused = false;
  let hoverSlot = null;
  let highlighted = new Set();
  let pickCb = () => {};
  let hoverCb = () => {};
  let popTargets = [], popStart = 0;
  let currentMissionId = null;
  const envMaps = {};
  const raycaster = new T.Raycaster();
  const pointer = new T.Vector2();
  let downAt = null;

  const theme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

  function init() {
    renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    scene = new T.Scene();
    stars = makeStars(1800, 90);
    scene.add(stars);

    hemi = new T.HemisphereLight(0xc8d8ff, 0x1a1a24, 0.45);
    scene.add(hemi);

    // Key light ("the Sun") casts soft shadows
    sun = new T.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(7, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 45 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    scene.add(sun);

    // Cool rim light from behind for a cinematic edge glow
    const rim = new T.DirectionalLight(0x6fd8ff, 0.9);
    rim.position.set(-8, 5, -7);
    scene.add(rim);

    camera = new T.PerspectiveCamera(38, 1, 0.1, 500);
    controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.53;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.addEventListener("start", () => (controls.autoRotate = false));
    if (window.FX && FX.available()) {
      try { fx = FX.createComposer(renderer, scene, camera); fx.grade.uniforms.exposure.value = 1.05; } catch (e) { fx = null; }
    }

    const el = renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
    el.addEventListener("pointerup", (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved < 6) {
        const slot = pick(e);
        if (slot) pickCb(slot);
      }
    });
    el.addEventListener("pointermove", (e) => {
      const slot = pick(e);
      if (slot !== hoverSlot) {
        hoverSlot = slot;
        el.style.cursor = slot ? "pointer" : "grab";
        hoverCb(slot, e);
      } else if (slot) hoverCb(slot, e);
    });
    el.addEventListener("pointerleave", () => { hoverSlot = null; hoverCb(null); });

    new ResizeObserver(resize).observe(document.body);
    window.addEventListener("themechange", applyTheme);
    applyTheme();
    loop();
  }

  /* Background gradients drawn on a canvas */
  function gradientTexture(stops, radial) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d");
    const grad = radial ? g.createRadialGradient(256, 180, 20, 256, 256, 420) : g.createLinearGradient(0, 0, 0, 512);
    stops.forEach(([o, col]) => grad.addColorStop(o, col));
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }
  const backgrounds = {};

  /* Switch the 3D scene between space (dark) and clean room (light) */
  function applyTheme() {
    if (!scene) return;
    const t = theme();
    if (!backgrounds[t]) {
      backgrounds[t] = t === "dark"
        ? gradientTexture([[0, "#13224a"], [0.55, "#070c1d"], [1, "#03050b"]], true)
        : gradientTexture([[0, "#f7f9fc"], [0.6, "#dde5f0"], [1, "#c5d1e0"]], false);
    }
    scene.background = backgrounds[t];
    // Dark theme: a real Milky Way sky instead of a flat gradient
    if (window.FX && !sky) {
      sky = new T.Mesh(new T.SphereGeometry(450, 64, 32), new T.MeshBasicMaterial({ map: FX.tex(FX.milkyWayCanvas()), side: T.BackSide, depthWrite: false, fog: false }));
      sky.material.color.setScalar(0.6);
      scene.add(sky);
    }
    if (sky) sky.visible = t === "dark";
    if (fx) { fx.setLook(t === "light"); fx.setTheme(); }
    const envKind = t === "dark" ? "space" : "studio";
    if (!envMaps[envKind]) envMaps[envKind] = Models.makeEnvMap(renderer, envKind);
    scene.environment = envMaps[envKind];
    stars.visible = t === "dark";
    hemi.intensity = t === "dark" ? 0.45 : 0.8;
    hemi.color.set(t === "dark" ? 0xc8d8ff : 0xffffff);
    hemi.groundColor.set(t === "dark" ? 0x1a1a24 : 0x9aa6b8);
    if (currentMissionId) buildGround(FRAMING[currentMissionId]);
  }

  function makeStars(n, radius) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const r = radius * (0.6 + Math.random() * 0.4);
      pos.set([s * Math.cos(t) * r, u * r, s * Math.sin(t) * r], i * 3);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    return new T.Points(geo, new T.PointsMaterial({ color: 0xffffff, size: 0.32, sizeAttenuation: true, transparent: true, opacity: 0.9 }));
  }

  function slotOf(obj) {
    while (obj) {
      if (obj.userData && obj.userData.slot) return obj.userData.slot;
      obj = obj.parent;
    }
    return null;
  }

  function pick(e) {
    if (!craftRoot) return null;
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(craftRoot, true);
    for (const h of hits) {
      const s = slotOf(h.object);
      if (s) return s;
    }
    return null;
  }

  function resize() {
    if (!container || !renderer) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (fx) fx.setSize(w, h);
  }

  /* Remember each mesh's own glow so highlights can be undone */
  function prepare(root) {
    root.traverse((o) => {
      if (o.isMesh) o.userData.baseEmissive = o.material.emissive ? o.material.emissive.getHex() : 0;
    });
  }

  function disposeTree(root) {
    root.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  /* Ground: Mars or Moon soil fading into the background; clean-room floor for the telescope in light mode */
  function buildGround(f) {
    if (groundMesh) { scene.remove(groundMesh); disposeTree(groundMesh); groundMesh = null; }
    if (envObj) { scene.remove(envObj.world, envObj.far); disposeTree(envObj.world); disposeTree(envObj.far); envObj = null; }
    scene.fog = null;
    // Dark themes: put the spacecraft on location (terrain kept clear around it and the rocket)
    if (theme() === "dark" && window.FX) {
      envObj = FX.buildEnvironment(f.env, { clear: 10 });
      scene.add(envObj.world, envObj.far);
      scene.fog = envObj.fog;
      if (sky) sky.visible = false;
      stars.visible = false;
      if (!envMaps[envObj.reflect]) envMaps[envObj.reflect] = Models.makeEnvMap(renderer, envObj.reflect);
      scene.environment = envMaps[envObj.reflect];
      hemi.color.set(envObj.hemi.sky);
      hemi.groundColor.set(envObj.hemi.ground);
      hemi.intensity = envObj.hemi.intensity;
      sun.color.set(envObj.sunColor);
      sun.intensity = envObj.sunIntensity;
      sun.position.copy(envObj.sunDir).multiplyScalar(16);
      if (fx) fx.grade.uniforms.exposure.value = envObj.exposure * 1.05;
      return;
    }
    sun.color.set(0xfff4e0);
    sun.intensity = 2.2;
    sun.position.set(7, 12, 8);
    if (fx) fx.grade.uniforms.exposure.value = 1.0;
    // (no texture repeat here: in this Three.js version the fade mask would repeat too)
    let map = null;
    if (f.ground) map = Models.groundTexture(f.ground);
    else if (theme() === "light") map = Models.floorTex();
    else return; // telescope floats in space in dark mode
    groundMesh = new T.Mesh(
      new T.CircleGeometry(16, 64),
      new T.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, alphaMap: Models.fadeTex(), transparent: true })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);
  }

  /* ---------- Public: show a mission's spacecraft ---------- */
  function show(mission, sel, swappedSlot) {
    if (!renderer) init();
    const parts = Engine.partsFor(mission, sel);
    const f = FRAMING[mission.id];

    if (craftRoot) { scene.remove(craftRoot); disposeTree(craftRoot); }
    craftRoot = new T.Group();

    const craft = Models.buildCraft(mission.id, parts);
    if (mission.id === "deep-space-telescope") craft.position.y = 0.9;
    craftRoot.add(craft);

    // The launch rocket stands next to the spacecraft (not to scale)
    const rocketType = parts.launch ? parts.launch.id : "saturnv";
    const rocket = Models.buildRocket(rocketType);
    const rocketGroup = new T.Group();
    if (parts.launch) rocketGroup.userData.slot = "launch";
    rocketGroup.add(rocket);
    rocketGroup.position.set(mission.id === "deep-space-telescope" ? -7.5 : -5.5, 0.15, -1);
    rocketGroup.scale.setScalar(mission.id === "deep-space-telescope" ? 0.95 : 0.8);
    craftRoot.add(rocketGroup);

    Models.enableShadows(craftRoot);
    prepare(craftRoot);
    scene.add(craftRoot);

    // Only reset the camera and ground when switching missions
    if (currentMissionId !== mission.id) {
      currentMissionId = mission.id;
      buildGround(f);
      camera.position.set(...f.cam);
      controls.target.set(...f.target);
      controls.autoRotate = true;
    }

    // Collect the groups of the part that was just swapped, for the "pop" animation
    popTargets = [];
    if (swappedSlot) {
      craftRoot.traverse((o) => {
        if (o.userData.slot === swappedSlot && slotOf(o.parent) !== swappedSlot) popTargets.push({ obj: o, base: o.scale.x });
      });
    }
    popStart = performance.now();
  }

  /* ---------- Public: put the canvas inside a container ---------- */
  function mount(el) {
    if (!renderer) init();
    container = el;
    el.appendChild(renderer.domElement);
    resize();
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
    resize();
  }
  let lastFrame = performance.now();
  /* ---------- Animation loop ---------- */
  function loop() {
    requestAnimationFrame(loop);
    if (paused || !container || !craftRoot) return;
    const t = performance.now();
    adaptQuality((t - lastFrame) / 1000);
    lastFrame = t;

    // "Pop" animation on the part that was just swapped
    const k = Math.min((t - popStart) / 550, 1);
    const back = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // ease-out-back
    const pulse = 0.5 + 0.5 * Math.sin(t / 220);
    popTargets.forEach(({ obj, base }) => obj.scale.setScalar(base * (k < 1 ? Math.max(0.05, back) : 1)));

    craftRoot.traverse((o) => {
      if (!o.isMesh || !o.material.emissive) return;
      const s = slotOf(o);
      if (s && s === hoverSlot) o.material.emissive.setHex(0x0e7490);
      else if (s && highlighted.has(s)) o.material.emissive.setRGB(0.55 * pulse, 0.35 * pulse, 0);
      else o.material.emissive.setHex(o.userData.baseEmissive || 0);
    });

    stars.rotation.y += 0.00008;
    controls.update();
    if (sky) sky.position.copy(camera.position);
    if (envObj) envObj.update(1 / 60, t, camera);
    if (fx) {
      // glowing cyan outline around the part under the mouse
      const hov = [];
      if (hoverSlot) craftRoot.traverse((o) => { if (o.userData.slot === hoverSlot && slotOf(o.parent) !== hoverSlot) hov.push(o); });
      fx.setOutlines(hov, []);
      fx.render(t / 1000);
    } else renderer.render(scene, camera);
  }

  window.Viewer3D = {
    mount,
    show,
    highlight: (slots) => (highlighted = new Set(slots || [])),
    onPick: (cb) => (pickCb = cb),
    onHover: (cb) => (hoverCb = cb),
    pause: () => (paused = true),
    resume: () => { paused = false; perf.frames = 0; lastFrame = performance.now(); resize(); },
    available: () => typeof THREE !== "undefined" && !!THREE.OrbitControls,
    /* Testing helper: move the camera (e.g. for close-up screenshots) */
    debugView(cam, target) {
      controls.autoRotate = false;
      camera.position.set(...cam);
      controls.target.set(...target);
    },
  };
})();
