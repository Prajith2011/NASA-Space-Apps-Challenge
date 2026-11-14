/* =====================================================================
   Space Mission Cube — 3D workshop viewer (dashboard)
   ---------------------------------------------------------------------
   Shows the spacecraft you are designing. Drag to rotate, scroll/pinch
   to zoom, hover a part to see its name, click a part to swap it.
   ===================================================================== */

(function () {
  const T = THREE;

  /* Camera framing for each mission */
  const FRAMING = {
    "mars-rover": { cam: [7, 4.5, 8], target: [-1.5, 1.6, 0], ground: 0x7a3418 },
    "deep-space-telescope": { cam: [9, 5.5, 10], target: [-2, 2.2, 0], ground: null },
    "lunar-lander": { cam: [7, 4.5, 8.5], target: [-1.5, 1.8, 0], ground: 0x5c5c5c },
  };

  let renderer, scene, camera, controls, craftRoot, groundMesh;
  let container = null;
  let paused = false;
  let hoverSlot = null;
  let highlighted = new Set();
  let pickCb = () => {};
  let hoverCb = () => {};
  let popTargets = [], popStart = 0;
  const raycaster = new T.Raycaster();
  const pointer = new T.Vector2();
  let downAt = null;

  function init() {
    renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = T.sRGBEncoding;

    scene = new T.Scene();
    scene.background = new T.Color(0x060a16);
    scene.add(makeStars(1500, 90));

    scene.add(new T.HemisphereLight(0xc8d8ff, 0x202030, 0.75));
    const sun = new T.DirectionalLight(0xffffff, 1.15);
    sun.position.set(6, 10, 7);
    scene.add(sun);
    const rim = new T.DirectionalLight(0x22d3ee, 0.45);
    rim.position.set(-7, 4, -6);
    scene.add(rim);

    camera = new T.PerspectiveCamera(40, 1, 0.1, 500);
    controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.55;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.7;
    controls.addEventListener("start", () => (controls.autoRotate = false));

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
    loop();
  }

  function makeStars(n, radius) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new T.Vector3().randomDirection ? new T.Vector3().randomDirection() : randomDir();
      v.multiplyScalar(radius * (0.6 + Math.random() * 0.4));
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    return new T.Points(geo, new T.PointsMaterial({ color: 0xffffff, size: 0.35, sizeAttenuation: true }));
  }
  function randomDir() {
    const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    return new T.Vector3(s * Math.cos(t), u, s * Math.sin(t));
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
  }

  /* Remember each mesh's own glow so highlights can be undone */
  function prepare(root) {
    root.traverse((o) => {
      if (o.isMesh) o.userData.baseEmissive = o.material.emissive ? o.material.emissive.getHex() : 0;
    });
  }

  function disposeTree(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  /* ---------- Public: show a mission's spacecraft ---------- */
  let currentMissionId = null;
  function show(mission, sel, swappedSlot) {
    if (!renderer) init();
    const parts = Engine.partsFor(mission, sel);
    const f = FRAMING[mission.id];

    if (craftRoot) { scene.remove(craftRoot); disposeTree(craftRoot); }
    craftRoot = new T.Group();

    const craft = Models.buildCraft(mission.id, parts);
    if (mission.id === "deep-space-telescope") craft.position.y = 0.6;
    craftRoot.add(craft);

    // The launch rocket stands next to the spacecraft (not to scale)
    const rocketType = parts.launch ? parts.launch.id : "saturnv";
    const rocket = Models.buildRocket(rocketType);
    const rocketGroup = new T.Group();
    if (parts.launch) rocketGroup.userData.slot = "launch";
    rocketGroup.add(rocket);
    rocketGroup.position.set(mission.id === "deep-space-telescope" ? -7.5 : -5.5, 0, -1);
    rocketGroup.scale.setScalar(mission.id === "deep-space-telescope" ? 0.95 : 0.8);
    craftRoot.add(rocketGroup);

    prepare(craftRoot);
    scene.add(craftRoot);

    // Ground
    if (groundMesh) { scene.remove(groundMesh); disposeTree(groundMesh); groundMesh = null; }
    if (f.ground) {
      groundMesh = new T.Mesh(new T.CircleGeometry(14, 48), new T.MeshStandardMaterial({ color: f.ground, roughness: 1 }));
      groundMesh.rotation.x = -Math.PI / 2;
      scene.add(groundMesh);
    }

    // Only reset the camera when switching missions
    if (currentMissionId !== mission.id) {
      camera.position.set(...f.cam);
      controls.target.set(...f.target);
      controls.autoRotate = true;
      currentMissionId = mission.id;
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

  /* ---------- Animation loop ---------- */
  function loop() {
    requestAnimationFrame(loop);
    if (paused || !container || !craftRoot) return;
    const t = performance.now();

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

    controls.update();
    renderer.render(scene, camera);
  }

  window.Viewer3D = {
    mount,
    show,
    highlight: (slots) => (highlighted = new Set(slots || [])),
    onPick: (cb) => (pickCb = cb),
    onHover: (cb) => (hoverCb = cb),
    pause: () => (paused = true),
    resume: () => { paused = false; resize(); },
    available: () => typeof THREE !== "undefined" && !!THREE.OrbitControls,
  };
})();
