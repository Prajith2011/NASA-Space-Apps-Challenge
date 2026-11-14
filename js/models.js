/* =====================================================================
   Space Mission Cube — 3D models (built from simple shapes with Three.js)
   ---------------------------------------------------------------------
   Every spacecraft is assembled from the parts the player has chosen,
   so swapping a component visibly changes the 3D model.

   Each part is put inside a group tagged with   userData.slot = "<slot id>"
   so clicking a part in 3D knows which component to swap.
   Units are roughly metres for the rover and lander (the telescope and
   rockets are scaled down so everything fits on screen).
   ===================================================================== */

(function () {
  const T = THREE;

  /* ---------- Materials (a new one each call so highlighting is per part) ---------- */
  const M = {
    // (metalness kept moderate: there is no reflection map, so very shiny metal would look dark)
    gold: () => new T.MeshStandardMaterial({ color: 0xe0ac1e, metalness: 0.5, roughness: 0.4, emissive: 0x2a1a00 }),
    silver: () => new T.MeshStandardMaterial({ color: 0xc3c9d2, metalness: 0.55, roughness: 0.35 }),
    white: () => new T.MeshStandardMaterial({ color: 0xe9ecef, metalness: 0.1, roughness: 0.6 }),
    dark: () => new T.MeshStandardMaterial({ color: 0x252a35, metalness: 0.5, roughness: 0.6 }),
    black: () => new T.MeshStandardMaterial({ color: 0x111318, metalness: 0.3, roughness: 0.7 }),
    carbon: () => new T.MeshStandardMaterial({ color: 0x3b4150, metalness: 0.6, roughness: 0.4 }),
    solar: () => new T.MeshStandardMaterial({ color: 0x1c2f7a, metalness: 0.7, roughness: 0.25, emissive: 0x050a2a }),
    copper: () => new T.MeshStandardMaterial({ color: 0xc77b30, metalness: 0.5, roughness: 0.5 }),
    orange: () => new T.MeshStandardMaterial({ color: 0xe0752d, metalness: 0.3, roughness: 0.6 }),
    steel: () => new T.MeshStandardMaterial({ color: 0xb9bec7, metalness: 0.6, roughness: 0.3 }),
    mirror: () => new T.MeshStandardMaterial({ color: 0xf5c542, metalness: 0.55, roughness: 0.22, emissive: 0x4a3200 }),
    glass: () => new T.MeshStandardMaterial({ color: 0xcfe3f5, metalness: 0.5, roughness: 0.15, emissive: 0x0c1a26 }),
    shield: () => new T.MeshStandardMaterial({ color: 0xc8b6e2, metalness: 0.45, roughness: 0.35, side: T.DoubleSide, emissive: 0x1a1426 }),
    rtg: () => new T.MeshStandardMaterial({ color: 0x4a4f5c, metalness: 0.7, roughness: 0.4, emissive: 0x2a0800 }),
  };

  /* ---------- Shape helpers ---------- */
  function mesh(geo, mat, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  }
  const box = (w, h, d, mat, x, y, z) => mesh(new T.BoxGeometry(w, h, d), mat, x, y, z);
  const cyl = (rt, rb, h, mat, x, y, z, seg = 24) => mesh(new T.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
  const sphere = (r, mat, x, y, z) => mesh(new T.SphereGeometry(r, 20, 14), mat, x, y, z);

  /* A thin rod between two points (legs, struts, antennas) */
  function rod(a, b, r, mat) {
    const va = new T.Vector3(...a), vb = new T.Vector3(...b);
    const len = va.distanceTo(vb);
    const m = cyl(r, r, len, mat, 0, 0, 0, 8);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    return m;
  }

  /* A group that remembers which component slot it belongs to */
  function slotGroup(slot, ...children) {
    const g = new T.Group();
    g.userData.slot = slot;
    children.forEach((c) => g.add(c));
    return g;
  }

  /* =====================================================================
     ROCKETS (not to scale: shown next to the spacecraft)
     ===================================================================== */
  function nose(r, h, mat, y) { return mesh(new T.ConeGeometry(r, h, 24), mat, 0, y, 0); }
  function engines(n, r, y, spread) {
    const g = new T.Group();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.add(mesh(new T.ConeGeometry(r, r * 1.6, 12, 1, true), M.black(), Math.cos(a) * spread, y, Math.sin(a) * spread));
    }
    return g;
  }

  function buildRocket(type) {
    const g = new T.Group();
    const add = (...m) => m.forEach((x) => g.add(x));
    switch (type) {
      case "a401":
        add(cyl(0.35, 0.35, 4.2, M.copper(), 0, 2.1, 0), cyl(0.3, 0.33, 1, M.white(), 0, 4.7, 0),
            cyl(0.38, 0.38, 1.1, M.white(), 0, 5.75, 0), nose(0.38, 0.9, M.white(), 6.75), engines(1, 0.22, -0.1, 0));
        break;
      case "a541":
        add(cyl(0.35, 0.35, 4.2, M.copper(), 0, 2.1, 0), cyl(0.3, 0.33, 1, M.white(), 0, 4.7, 0),
            cyl(0.52, 0.52, 1.4, M.white(), 0, 5.9, 0), nose(0.52, 1.1, M.white(), 7.15), engines(1, 0.22, -0.1, 0));
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const bx = Math.cos(a) * 0.48, bz = Math.sin(a) * 0.48;
          const n = nose(0.12, 0.3, M.white(), 1.95);
          n.position.set(bx, 1.95, bz);
          add(cyl(0.12, 0.12, 1.8, M.white(), bx, 0.9, bz), n);
        }
        break;
      case "d4h":
        [-0.62, 0, 0.62].forEach((x) => {
          add(cyl(0.3, 0.3, 5, M.orange(), x, 2.5, 0));
          if (x) { const n = nose(0.3, 0.5, M.orange(), 5.25); n.position.x = x; add(n); }
        });
        add(cyl(0.3, 0.3, 0.8, M.white(), 0, 5.4, 0), cyl(0.42, 0.42, 1.2, M.white(), 0, 6.4, 0), nose(0.42, 0.9, M.white(), 7.45), engines(3, 0.2, -0.1, 0.62));
        break;
      case "medium":
        add(cyl(0.3, 0.3, 4.5, M.white(), 0, 2.25, 0), cyl(0.34, 0.34, 1, M.white(), 0, 5, 0), nose(0.34, 0.8, M.white(), 5.9), engines(1, 0.2, -0.1, 0));
        break;
      case "ariane5":
        add(cyl(0.4, 0.4, 4, M.white(), 0, 2, 0), cyl(0.36, 0.38, 0.8, M.white(), 0, 4.4, 0),
            cyl(0.46, 0.46, 1.5, M.white(), 0, 5.55, 0), nose(0.46, 1, M.white(), 6.8), engines(1, 0.25, -0.1, 0));
        [-0.66, 0.66].forEach((x) => {
          add(cyl(0.2, 0.2, 3.3, M.white(), x, 1.65, 0));
          const n = nose(0.2, 0.5, M.white(), 3.55); n.position.x = x; add(n);
        });
        break;
      case "superheavy":
        add(cyl(0.8, 0.8, 7, M.steel(), 0, 3.5, 0), nose(0.8, 1.6, M.steel(), 7.8), engines(6, 0.18, -0.1, 0.5));
        break;
      case "saturnv":
        add(cyl(0.5, 0.5, 2.6, M.white(), 0, 1.3, 0), box(1.02, 0.25, 1.02, M.black(), 0, 2.2, 0),
            cyl(0.5, 0.5, 1.9, M.white(), 0, 3.55, 0), cyl(0.33, 0.5, 0.4, M.white(), 0, 4.7, 0),
            cyl(0.33, 0.33, 1.1, M.white(), 0, 5.45, 0), cyl(0.2, 0.33, 0.7, M.silver(), 0, 6.35, 0),
            nose(0.2, 0.5, M.white(), 6.95), rod([0, 7.2, 0], [0, 7.9, 0], 0.03, M.dark()), engines(5, 0.17, -0.1, 0.3));
        break;
    }
    return g;
  }

  /* =====================================================================
     MARS ROVER
     ===================================================================== */
  function buildRover(p) {
    const g = new T.Group();

    // --- Body & wheels ---
    const light = p.body.id === "light";
    const body = slotGroup("body",
      box(2.6, 0.5, 1.8, light ? M.carbon() : M.white(), 0, 1.05, 0),
      box(2.62, 0.08, 1.82, M.gold(), 0, 0.82, 0));
    [-0.95, 0, 0.95].forEach((x) => [-1.05, 1.05].forEach((z) => {
      const w = cyl(0.33, 0.33, 0.3, M.dark(), x, 0.35, z, 20);
      w.rotation.x = Math.PI / 2;
      body.add(w);
      body.add(rod([x, 0.35, z * 0.86], [x * 0.6, 0.85, z * 0.8], 0.04, M.silver()));
    }));
    g.add(body);

    // --- Power source ---
    const pw = new T.Group();
    pw.userData.slot = "power";
    if (p.power.id === "solarS") {
      pw.add(box(2.2, 0.05, 1.6, M.solar(), 0, 1.36, 0));
    } else if (p.power.id === "solarL") {
      pw.add(box(2.2, 0.05, 1.6, M.solar(), 0, 1.36, 0));
      [-1, 1].forEach((s) => {
        const wing = box(2.2, 0.05, 1.7, M.solar(), 0, 1.45, s * 1.75);
        wing.rotation.x = s * 0.12;
        pw.add(wing);
      });
    } else {
      // MMRTG: finned cylinder angled off the back, glowing faintly with heat
      const rtg = new T.Group();
      rtg.add(cyl(0.24, 0.24, 0.9, M.rtg(), 0, 0, 0));
      for (let i = 0; i < 8; i++) {
        const fin = box(0.04, 0.85, 0.3, M.rtg(), 0, 0, 0);
        const a = (i / 8) * Math.PI * 2;
        fin.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
        fin.rotation.y = -a;
        rtg.add(fin);
      }
      rtg.position.set(-1.55, 1.25, 0);
      rtg.rotation.z = 0.9;
      pw.add(rtg);
    }
    g.add(pw);

    // --- Battery (under the rear deck) ---
    const big = p.battery.id === "large";
    g.add(slotGroup("battery", box(big ? 0.9 : 0.5, big ? 0.35 : 0.25, big ? 1.0 : 0.6, M.carbon(), -0.6, 0.62, 0)));

    // --- Science instruments ---
    const sci = slotGroup("science",
      cyl(0.06, 0.06, 1.4, M.white(), 0.95, 2.0, 0.55),
      box(0.5, 0.28, 0.35, M.white(), 0.95, 2.8, 0.55),
      box(0.12, 0.1, 0.12, M.dark(), 1.22, 2.8, 0.47));
    if (p.science.id !== "basic") {
      // robotic arm with drill
      sci.add(rod([1.3, 1.0, 0.5], [1.9, 1.15, 0.5], 0.06, M.white()));
      sci.add(rod([1.9, 1.15, 0.5], [2.2, 0.6, 0.5], 0.06, M.white()));
      const drill = mesh(new T.ConeGeometry(0.12, 0.35, 12), M.silver(), 2.2, 0.35, 0.5);
      drill.rotation.x = Math.PI;
      sci.add(drill);
    } else {
      sci.add(rod([0.95, 2.2, 0.55], [0.95, 2.2, 1.0], 0.025, M.silver())); // weather boom
    }
    if (p.science.id === "lab") {
      sci.add(box(0.6, 0.4, 0.6, M.white(), 0.1, 1.55, -0.4), box(0.5, 0.3, 0.5, M.gold(), 0.75, 1.5, -0.4));
    }
    g.add(sci);

    // --- Communications ---
    const dish = cyl(0.38, 0.3, 0.06, M.white(), -0.5, 1.75, -0.55, 6);
    dish.rotation.z = 0.5;
    const comms = slotGroup("comms", rod([-0.5, 1.3, -0.55], [-0.5, 1.7, -0.55], 0.04, M.silver()), dish);
    if (p.comms.id === "relay") {
      comms.add(rod([-1.0, 1.3, 0.6], [-1.0, 2.2, 0.6], 0.02, M.silver()), box(0.25, 0.15, 0.2, M.white(), -1.0, 1.36, 0.6));
    }
    g.add(comms);
    return g;
  }

  /* =====================================================================
     SPACE TELESCOPE  (built with "deploy" handles for the unfolding game)
     ===================================================================== */
  function hexPositions(R) {
    // Flat-top hexagons in two rings around an empty centre = 18 segments
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const out = [];
    for (let k = 1; k <= 2; k++) {
      let q = -k, r = k; // start position, walk around the ring
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < k; j++) {
          out.push({ q, x: R * 1.5 * q, y: R * Math.sqrt(3) * (r + q / 2) });
          q += dirs[i][0];
          r += dirs[i][1];
        }
      }
    }
    return out;
  }

  function buildTelescope(p) {
    const g = new T.Group();
    const deploy = {};

    // Spacecraft bus (fixed, not a slot)
    g.add(box(1.6, 0.6, 1.6, M.dark(), 0, 0, 0));

    // --- Cooling system ---
    const cool = slotGroup("cooling");
    if (p.cooling.id === "sunshield") {
      const shape = new T.Shape();
      const W = 3.8, D = 2.4;
      shape.moveTo(-W, 0); shape.lineTo(-W * 0.55, D); shape.lineTo(W * 0.55, D);
      shape.lineTo(W, 0); shape.lineTo(W * 0.55, -D); shape.lineTo(-W * 0.55, -D); shape.closePath();
      const geo = new T.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const layers = new T.Group();
      for (let i = 0; i < 5; i++) layers.add(mesh(geo, M.shield(), 0, 0.42 + i * 0.09, 0));
      cool.add(layers);
      deploy.shield = layers;
    } else {
      const panels = new T.Group();
      [-1, 1].forEach((s) => panels.add(box(0.05, 1.2, 1.4, M.white(), s * 1.0, 0.9, -0.2)));
      if (p.cooling.id === "cryoAll") {
        for (let i = 0; i < 4; i++) panels.add(cyl(0.12, 0.12, 0.5, M.silver(), -0.45 + i * 0.3, 1.45, -1.25));
      }
      cool.add(panels);
      deploy.shield = panels;
    }
    g.add(cool);

    // --- Primary mirror (faces +z) ---
    const mirrorRoot = new T.Group();
    mirrorRoot.position.set(0, 2.6, 0.2);
    mirrorRoot.rotation.x = -0.12;
    const mir = slotGroup("mirror");
    if (p.mirror.id === "seg65") {
      const R = 0.42;
      const hexGeo = new T.CylinderGeometry(R * 0.94, R * 0.94, 0.07, 6);
      hexGeo.rotateX(Math.PI / 2);
      hexGeo.rotateZ(Math.PI / 6);
      const wingL = new T.Group(), wingR = new T.Group();
      const hinge = R * 2.25;
      wingL.position.x = -hinge;
      wingR.position.x = hinge;
      hexPositions(R).forEach((h) => {
        const seg = mesh(hexGeo, M.mirror(), h.x, h.y, 0);
        if (h.q === 2) { seg.position.x -= hinge; wingR.add(seg); }
        else if (h.q === -2) { seg.position.x += hinge; wingL.add(seg); }
        else mir.add(seg);
      });
      mir.add(wingL, wingR, box(R * 3.2, R * 4.8, 0.12, M.black(), 0, 0, -0.08));
      deploy.wingL = wingL;
      deploy.wingR = wingR;
    } else {
      const r = p.mirror.id === "mono65" ? 1.8 : 1.1;
      const disc = cyl(r, r, 0.3, M.glass(), 0, 0, 0, 48);
      disc.rotation.x = Math.PI / 2;
      mir.add(disc);
    }
    mirrorRoot.add(mir);

    // Secondary mirror on a tripod (fixed part, but it unfolds in the game)
    const sec = new T.Group();
    [[0, 1.3], [-1.1, -0.65], [1.1, -0.65]].forEach(([x, y]) => sec.add(rod([x, y, 0.05], [0, 0, 2.4], 0.025, M.dark())));
    const sm = cyl(0.2, 0.2, 0.06, M.mirror(), 0, 0, 2.4, 6);
    sm.rotation.x = Math.PI / 2;
    sec.add(sm);
    mirrorRoot.add(sec);
    deploy.secondary = sec;
    g.add(mirrorRoot);

    // --- Instruments (behind the mirror) ---
    const ir = p.instruments.ir;
    g.add(slotGroup("instruments", box(ir ? 1.0 : 0.6, ir ? 0.8 : 0.5, ir ? 0.8 : 0.5, ir ? M.gold() : M.silver(), 0, 2.4, -0.75)));

    // --- Solar array (sticks out from the bus) ---
    const len = { s1: 1.2, s2: 2.0, s4: 3.2 }[p.power.id];
    const arrayPivot = new T.Group();
    arrayPivot.position.set(0, -0.15, -0.8);
    arrayPivot.add(box(len, 0.05, 0.9, M.solar(), 0, 0, -len / 2 - 0.05));
    arrayPivot.children[0].rotation.y = Math.PI / 2;
    arrayPivot.children[0].position.set(0, 0, -len / 2 - 0.05);
    const pw = slotGroup("power", arrayPivot);
    g.add(pw);
    deploy.solar = arrayPivot;

    g.userData.deploy = deploy;
    return g;
  }

  /* Set how "unfolded" each telescope part is: 0 = folded for launch, 1 = open */
  function setTelescopeDeploy(model, parts) {
    const d = model.userData.deploy;
    const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
    if (parts.solar != null) d.solar.scale.set(1, 1, 0.08 + 0.92 * ease(parts.solar));
    if (parts.shield != null) {
      const s = ease(parts.shield);
      d.shield.scale.set(0.15 + 0.85 * s, 1, 0.15 + 0.85 * s);
    }
    if (parts.secondary != null) d.secondary.rotation.x = (1 - ease(parts.secondary)) * (Math.PI / 2);
    if (parts.wings != null && d.wingL) {
      const a = (1 - ease(parts.wings)) * (Math.PI / 2);
      d.wingR.rotation.y = a;
      d.wingL.rotation.y = -a;
    }
  }

  /* =====================================================================
     LUNAR LANDER
     ===================================================================== */
  function buildLander(p) {
    const g = new T.Group();

    // Descent stage (fixed) — gold foil octagon
    const stage = cyl(1.3, 1.3, 1.0, M.gold(), 0, 1.45, 0, 8);
    g.add(stage);

    // --- Legs & structure ---
    const thin = p.structure.id === "light";
    const legs = slotGroup("structure");
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const c = Math.cos(a), s = Math.sin(a);
      legs.add(rod([c * 1.1, 1.6, s * 1.1], [c * 2.2, 0.15, s * 2.2], thin ? 0.045 : 0.075, thin ? M.silver() : M.white()));
      legs.add(rod([c * 1.2, 1.0, s * 1.2], [c * 1.9, 0.5, s * 1.9], thin ? 0.03 : 0.05, M.silver()));
      legs.add(cyl(0.32, 0.36, 0.08, M.silver(), c * 2.2, 0.08, s * 2.2));
    }
    g.add(legs);

    // --- Descent engine ---
    const eng = slotGroup("engine");
    if (p.engine.id === "solid") {
      eng.add(cyl(0.5, 0.5, 0.75, M.black(), 0, 0.6, 0), mesh(new T.ConeGeometry(0.22, 0.3, 16, 1, true), M.dark(), 0, 0.1, 0));
    } else {
      const big = p.engine.id === "hp";
      const bell = mesh(new T.ConeGeometry(big ? 0.62 : 0.45, big ? 0.9 : 0.7, 24, 1, true), M.dark(), 0, big ? 0.5 : 0.6, 0);
      bell.material.side = T.DoubleSide;
      eng.add(bell);
      if (big) eng.add(box(0.35, 0.3, 0.35, M.silver(), 0.55, 0.85, 0));
    }
    g.add(eng);

    // --- Propellant tanks (domes poking out of the top deck) ---
    const tr = { small: 0.36, med: 0.44, large: 0.54 }[p.tanks.id];
    const tanks = slotGroup("tanks");
    [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].forEach(([x, z]) => tanks.add(sphere(tr, M.silver(), x, 1.85, z)));
    g.add(tanks);

    // --- Ascent stage (crew cabin) ---
    const light = p.ascent.id === "light";
    const k = light ? 0.9 : 1;
    const asc = slotGroup("ascent",
      box(1.7 * k, 1.2 * k, 1.5 * k, light ? M.gold() : M.silver(), 0, 2.6, 0),
      cyl(0.55 * k, 0.6 * k, 0.9 * k, M.silver(), 0, 2.45, -0.75 * k, 16),
      box(0.5, 0.35, 0.05, M.black(), -0.35, 2.85, 0.76 * k),
      box(0.5, 0.35, 0.05, M.black(), 0.35, 2.85, 0.76 * k),
      cyl(0.3, 0.3, 0.3, M.dark(), 0, 3.35 * (light ? 0.97 : 1), 0, 16),
      rod([0.6, 3.1, -0.3], [1.1, 3.6, -0.5], 0.02, M.white()));
    g.add(asc);

    // --- Science experiments (stored in a side bay) ---
    const sci = slotGroup("science");
    const n = { min: 1, full: 2, extra: 4 }[p.science.id];
    for (let i = 0; i < n; i++) sci.add(box(0.45, 0.35, 0.45, i % 2 ? M.gold() : M.white(), 1.45, 1.2 + (i >> 1) * 0.4, -0.3 + (i % 2) * 0.55));
    if (p.science.id === "extra") sci.add(box(0.5, 0.5, 1.4, M.white(), -0.2, 1.3, 1.55));
    g.add(sci);

    // --- Battery bank ---
    const big = p.battery.id === "large";
    g.add(slotGroup("battery", box(big ? 0.5 : 0.35, big ? 0.6 : 0.4, big ? 0.8 : 0.5, M.carbon(), -1.45, 1.4, 0)));
    return g;
  }

  /* Build whichever spacecraft a mission needs. */
  function buildCraft(missionId, parts) {
    if (missionId === "mars-rover") return buildRover(parts);
    if (missionId === "deep-space-telescope") return buildTelescope(parts);
    return buildLander(parts);
  }

  window.Models = { buildCraft, buildRover, buildTelescope, buildLander, buildRocket, setTelescopeDeploy };
})();
