/* =====================================================================
   Space Mission Cube — 3D models (built in code with Three.js)
   ---------------------------------------------------------------------
   Every spacecraft is assembled from the parts the player has chosen,
   so swapping a component visibly changes the 3D model.

   Look & feel:
     • Physically based materials + a generated reflection environment,
       so metal, gold foil and mirrors reflect light like the real thing
     • Procedural textures drawn on <canvas>: solar cells, crinkled gold
       insulation foil, Mars and Moon soil (no image files needed)
     • Soft shadows (turned on by the viewer)

   Each part sits inside a group tagged   userData.slot = "<slot id>"
   so clicking a part in 3D knows which component to swap.
   Units are roughly metres for the rover and lander (the telescope and
   rockets are scaled down so everything fits on screen).
   ===================================================================== */

(function () {
  const T = THREE;

  /* =====================================================================
     PROCEDURAL TEXTURES (drawn once, then cached)
     ===================================================================== */
  const texCache = {};
  function canvasTexture(key, size, draw, isColor = true) {
    if (texCache[key]) return texCache[key];
    const c = document.createElement("canvas");
    c.width = c.height = size;
    draw(c.getContext("2d"), size);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 8;
    if (isColor) t.encoding = T.sRGBEncoding;
    texCache[key] = t;
    return t;
  }
  // Seeded random so textures look the same every time
  function rng(seed) {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }

  /* Solar cells: dark blue cells separated by thin silver lines */
  const solarTex = () => canvasTexture("solar", 512, (g, n) => {
    g.fillStyle = "#c9d1dc";
    g.fillRect(0, 0, n, n);
    const cells = 8, gap = 4, s = n / cells;
    for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
      const grad = g.createLinearGradient(i * s, j * s, (i + 1) * s, (j + 1) * s);
      grad.addColorStop(0, "#1a2f6e");
      grad.addColorStop(1, "#0b1838");
      g.fillStyle = grad;
      g.fillRect(i * s + gap, j * s + gap, s - gap * 2, s - gap * 2);
      g.strokeStyle = "rgba(170,190,230,0.25)"; // fine conductor lines
      g.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        g.beginPath();
        g.moveTo(i * s + gap, j * s + (k * s) / 4);
        g.lineTo((i + 1) * s - gap, j * s + (k * s) / 4);
        g.stroke();
      }
    }
  });

  /* Crinkled insulation foil (the gold "wrapping paper" on spacecraft) */
  function foilTex(kind) {
    return canvasTexture("foil-" + kind, 512, (g, n) => {
      const r = rng(kind === "gold" ? 7 : 11);
      const base = { gold: [205, 152, 40], silver: [196, 200, 208], black: [40, 42, 48] }[kind];
      g.fillStyle = `rgb(${base})`;
      g.fillRect(0, 0, n, n);
      for (let i = 0; i < 900; i++) {
        const x = r() * n, y = r() * n, w = 10 + r() * 60, h = 6 + r() * 30;
        const k = 0.75 + r() * 0.5;
        g.fillStyle = `rgba(${base.map((v) => Math.min(255, v * k) | 0)},0.55)`;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + w, y + r() * h);
        g.lineTo(x + w * r(), y + h);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = "rgba(255,255,255,0.18)"; // crease highlights
      for (let i = 0; i < 160; i++) {
        g.beginPath();
        const x = r() * n, y = r() * n;
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 60);
        g.stroke();
      }
    });
  }

  /* Soil for the ground: Mars (red dust) or Moon (grey regolith) */
  function groundTexture(kind) {
    return canvasTexture("ground-" + kind, 1024, (g, n) => {
      const r = rng(kind === "mars" ? 3 : 5);
      const base = kind === "mars" ? [168, 82, 44] : [118, 118, 122];
      g.fillStyle = `rgb(${base})`;
      g.fillRect(0, 0, n, n);
      for (let i = 0; i < 9000; i++) { // grainy noise
        const k = 0.8 + r() * 0.4;
        g.fillStyle = `rgba(${base.map((v) => Math.min(255, v * k) | 0)},0.6)`;
        const s = 1 + r() * 3;
        g.fillRect(r() * n, r() * n, s, s);
      }
      for (let i = 0; i < 260; i++) { // pebbles with a shadow
        const x = r() * n, y = r() * n, s = 2 + r() * 7;
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.beginPath(); g.ellipse(x + 2, y + 2, s, s * 0.7, 0, 0, Math.PI * 2); g.fill();
        const shade = 0.6 + r() * 0.3; // one random shade for all three colour channels
        g.fillStyle = `rgba(${base.map((v) => (v * shade) | 0)},1)`;
        g.beginPath(); g.ellipse(x, y, s, s * 0.7, 0, 0, Math.PI * 2); g.fill();
      }
      if (kind === "moon") { // small craters
        for (let i = 0; i < 40; i++) {
          const x = r() * n, y = r() * n, s = 8 + r() * 40;
          g.strokeStyle = "rgba(255,255,255,0.12)";
          g.lineWidth = 3;
          g.beginPath(); g.arc(x, y, s, Math.PI * 0.9, Math.PI * 1.9); g.stroke();
          g.fillStyle = "rgba(0,0,0,0.12)";
          g.beginPath(); g.arc(x, y, s * 0.85, 0, Math.PI * 2); g.fill();
        }
      }
    });
  }

  /* Soft round fade, used so the ground disc blends into the background */
  const fadeTex = () => canvasTexture("fade", 256, (g, n) => {
    const grad = g.createRadialGradient(n / 2, n / 2, n * 0.25, n / 2, n / 2, n / 2);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(1, "#000");
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  }, false);

  /* Clean-room floor tiles (light theme) */
  const floorTex = () => canvasTexture("floor", 1024, (g, n) => {
    g.fillStyle = "#e9eef5";
    g.fillRect(0, 0, n, n);
    g.strokeStyle = "#c3cedc";
    g.lineWidth = 2;
    const tiles = 16;
    for (let i = 0; i <= tiles; i++) {
      g.beginPath(); g.moveTo((i * n) / tiles, 0); g.lineTo((i * n) / tiles, n); g.stroke();
      g.beginPath(); g.moveTo(0, (i * n) / tiles); g.lineTo(n, (i * n) / tiles); g.stroke();
    }
    g.strokeStyle = "#f2b43a"; // yellow safety circle around the work area
    g.lineWidth = 6;
    g.beginPath(); g.arc(n / 2, n / 2, n * 0.2, 0, Math.PI * 2); g.stroke();
  });

  /* =====================================================================
     MATERIALS (a new one each call so highlighting works per part)
     ===================================================================== */
  const std = (o) => new T.MeshStandardMaterial(o);
  const M = {
    gold: () => std({ map: foilTex("gold"), bumpMap: foilTex("gold"), bumpScale: 0.012, metalness: 0.9, roughness: 0.32, envMapIntensity: 1.2 }),
    silverFoil: () => std({ map: foilTex("silver"), bumpMap: foilTex("silver"), bumpScale: 0.01, metalness: 0.85, roughness: 0.3 }),
    blackFoil: () => std({ map: foilTex("black"), bumpMap: foilTex("black"), bumpScale: 0.01, metalness: 0.3, roughness: 0.55 }),
    alu: () => std({ color: 0xc8ced8, metalness: 0.95, roughness: 0.28 }),
    paint: () => std({ color: 0xeef0f3, metalness: 0.05, roughness: 0.45 }),
    dark: () => std({ color: 0x2b303b, metalness: 0.6, roughness: 0.45 }),
    black: () => std({ color: 0x121419, metalness: 0.2, roughness: 0.65 }),
    lens: () => std({ color: 0x05070c, metalness: 0.9, roughness: 0.05 }),
    carbon: () => std({ color: 0x343a47, metalness: 0.55, roughness: 0.35 }),
    solar: (rx = 1, ry = 1) => {
      const t = solarTex().clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ry);
      return std({ map: t, metalness: 0.25, roughness: 0.3, envMapIntensity: 0.55 });
    },
    copper: () => std({ color: 0xc8813c, metalness: 0.35, roughness: 0.45 }),
    orange: () => std({ color: 0xe0752d, metalness: 0.15, roughness: 0.55 }),
    steel: () => std({ color: 0xc5cad2, metalness: 1, roughness: 0.22 }),
    // (a perfect mirror in space would reflect black, so these keep a little of their own colour)
    mirror: () => std({ color: 0xd99a12, metalness: 0.9, roughness: 0.2, envMapIntensity: 1.5, emissive: 0x2a1600 }),
    glass: () => std({ color: 0xb9cde4, metalness: 0.85, roughness: 0.12, envMapIntensity: 1.4, emissive: 0x0a121c }),
    shield: () => std({ color: 0x7c6eb0, metalness: 0.85, roughness: 0.32, side: T.DoubleSide, envMapIntensity: 1.2 }),
    rtg: () => std({ color: 0x4d525e, metalness: 0.75, roughness: 0.4, emissive: 0x3a0e00 }),
    bell: () => std({ color: 0x3a3e46, metalness: 0.9, roughness: 0.35, side: T.DoubleSide }),
  };

  /* =====================================================================
     SHAPE HELPERS
     ===================================================================== */
  function mesh(geo, mat, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  }
  const box = (w, h, d, mat, x, y, z) => mesh(new T.BoxGeometry(w, h, d), mat, x, y, z);
  const cyl = (rt, rb, h, mat, x, y, z, seg = 32) => mesh(new T.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
  const sphere = (r, mat, x, y, z) => mesh(new T.SphereGeometry(r, 32, 20), mat, x, y, z);

  /* A rod between two points (legs, struts, antennas) */
  function rod(a, b, r, mat) {
    const va = new T.Vector3(...a), vb = new T.Vector3(...b);
    const m = cyl(r, r, va.distanceTo(vb), mat, 0, 0, 0, 10);
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

  /* A flat solar panel with a metal frame (length along x) */
  function solarPanel(w, d, x, y, z) {
    const g = new T.Group();
    g.add(box(w + 0.06, 0.035, d + 0.06, M.alu(), 0, -0.005, 0));
    g.add(box(w, 0.04, d, M.solar(Math.max(1, w / d), 1), 0, 0.005, 0));
    g.position.set(x, y, z);
    return g;
  }

  /* =====================================================================
     ROCKETS (not to scale: shown next to the spacecraft)
     ===================================================================== */
  function nose(r, h, mat, x, y, z = 0) { return mesh(new T.ConeGeometry(r, h, 32), mat, x, y, z); }
  function ogive(r, h, mat, y) {
    // a rounded "bullet" nose made by spinning a curve
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new T.Vector2(r * Math.cos((t * Math.PI) / 2) ** 0.8, t * h));
    }
    return mesh(new T.LatheGeometry(pts, 32), mat, 0, y, 0);
  }
  function band(r, y, h = 0.08, mat = M.black()) { return cyl(r * 1.01, r * 1.01, h, mat, 0, y, 0); }
  function engines(n, r, y, spread) {
    const g = new T.Group();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.add(mesh(new T.CylinderGeometry(r * 0.45, r, r * 1.6, 20, 1, true), M.bell(), n === 1 ? 0 : Math.cos(a) * spread, y, n === 1 ? 0 : Math.sin(a) * spread));
    }
    return g;
  }

  function buildRocket(type) {
    const g = new T.Group();
    const add = (...m) => m.forEach((x) => g.add(x));
    switch (type) {
      case "a401":
      case "a541": {
        const wide = type === "a541";
        add(cyl(0.35, 0.35, 4.2, M.copper(), 0, 2.1, 0), band(0.35, 0.15), band(0.35, 4.2, 0.12),
            cyl(0.3, 0.34, 1, M.paint(), 0, 4.75, 0), band(0.3, 5.2, 0.05),
            cyl(wide ? 0.52 : 0.38, wide ? 0.52 : 0.38, wide ? 1.4 : 1.1, M.paint(), 0, wide ? 5.95 : 5.8, 0),
            ogive(wide ? 0.52 : 0.38, wide ? 1.2 : 0.95, M.paint(), wide ? 6.65 : 6.35), engines(1, 0.24, -0.15, 0));
        if (wide) {
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2, bx = Math.cos(a) * 0.5, bz = Math.sin(a) * 0.5;
            add(cyl(0.12, 0.12, 1.8, M.paint(), bx, 0.95, bz), nose(0.12, 0.35, M.paint(), bx, 2.02, bz),
                mesh(new T.CylinderGeometry(0.06, 0.11, 0.2, 12, 1, true), M.bell(), bx, -0.05, bz));
          }
        }
        break;
      }
      case "d4h":
        [-0.62, 0, 0.62].forEach((x) => {
          add(cyl(0.3, 0.3, 5, M.orange(), x, 2.5, 0), mesh(new T.CylinderGeometry(0.14, 0.26, 0.4, 16, 1, true), M.bell(), x, -0.15, 0));
          if (x) add(nose(0.3, 0.55, M.orange(), x, 5.27, 0));
        });
        add(band(0.3, 5.05), cyl(0.3, 0.3, 0.8, M.paint(), 0, 5.45, 0), cyl(0.42, 0.42, 1.2, M.paint(), 0, 6.45, 0), ogive(0.42, 0.95, M.paint(), 7.05));
        break;
      case "medium":
        add(cyl(0.3, 0.3, 4.5, M.paint(), 0, 2.25, 0), band(0.3, 2.6), band(0.3, 4.5),
            cyl(0.34, 0.34, 1, M.paint(), 0, 5, 0), ogive(0.34, 0.85, M.paint(), 5.5), engines(1, 0.22, -0.15, 0));
        break;
      case "ariane5":
        add(cyl(0.42, 0.42, 4, M.paint(), 0, 2, 0), band(0.42, 4), cyl(0.38, 0.4, 0.8, M.paint(), 0, 4.4, 0),
            cyl(0.48, 0.48, 1.5, M.paint(), 0, 5.55, 0), ogive(0.48, 1.05, M.paint(), 6.3), engines(1, 0.27, -0.15, 0));
        [-0.68, 0.68].forEach((x) => add(cyl(0.21, 0.21, 3.4, M.paint(), x, 1.7, 0), band(0.21, 0.3).translateX(x),
          nose(0.21, 0.55, M.paint(), x, 3.67, 0), mesh(new T.CylinderGeometry(0.12, 0.2, 0.3, 16, 1, true), M.bell(), x, -0.12, 0)));
        break;
      case "superheavy":
        add(cyl(0.8, 0.8, 7, M.steel(), 0, 3.5, 0), band(0.8, 4.4, 0.04, M.dark()), ogive(0.8, 1.8, M.steel(), 7), engines(7, 0.2, -0.15, 0.5));
        [[0.85, 6.6], [-0.85, 6.6]].forEach(([x, y]) => add(box(0.08, 0.7, 0.45, M.dark(), x, y, 0)));
        break;
      case "saturnv":
        add(cyl(0.5, 0.5, 2.6, M.paint(), 0, 1.3, 0), box(1.02, 0.28, 1.02, M.black(), 0, 2.3, 0).rotateY(Math.PI / 4),
            band(0.5, 0.35, 0.3), cyl(0.5, 0.5, 1.9, M.paint(), 0, 3.55, 0), band(0.5, 4.45, 0.1),
            cyl(0.33, 0.5, 0.4, M.paint(), 0, 4.7, 0), cyl(0.33, 0.33, 1.1, M.paint(), 0, 5.45, 0), band(0.33, 5.9, 0.12),
            cyl(0.2, 0.33, 0.7, M.alu(), 0, 6.35, 0), nose(0.2, 0.5, M.paint(), 0, 6.95), rod([0, 7.2, 0], [0, 7.9, 0], 0.03, M.orange()),
            engines(5, 0.17, -0.15, 0.3));
        break;
    }
    return g;
  }

  /* =====================================================================
     MARS ROVER (Curiosity-style: rocker-bogie wheels, mast, arm, RTG)
     ===================================================================== */
  function wheel(x, y, z) {
    const w = new T.Group();
    w.add(cyl(0.34, 0.34, 0.32, M.alu(), 0, 0, 0, 36));
    w.add(cyl(0.13, 0.13, 0.36, M.dark(), 0, 0, 0, 16));
    for (let i = 0; i < 14; i++) { // grousers (the treads)
      const a = (i / 14) * Math.PI * 2;
      const gr = box(0.045, 0.32, 0.025, M.alu(), Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
      gr.rotation.y = -a;
      w.add(gr);
    }
    w.rotation.x = Math.PI / 2; // axle points along z
    w.position.set(x, y, z);
    return w;
  }

  function buildRover(p) {
    const g = new T.Group();

    // --- Body, wheels and suspension ---
    const light = p.body.id === "light";
    const body = slotGroup("body",
      box(2.4, 0.55, 1.6, light ? M.carbon() : M.paint(), 0, 1.05, 0),
      box(2.5, 0.06, 1.7, M.alu(), 0, 1.35, 0),
      box(2.42, 0.14, 1.62, M.gold(), 0, 0.78, 0));
    [1, -1].forEach((dir) => [-0.28, 0.28].forEach((z) => { // hazard cameras
      const c = cyl(0.05, 0.05, 0.06, M.lens(), dir * 1.22, 0.95, z, 12);
      c.rotation.z = Math.PI / 2;
      body.add(c);
    }));
    [-1, 1].forEach((s) => {
      const z = s * 0.92;
      [-1.0, 0, 1.0].forEach((x) => {
        body.add(wheel(x, 0.35, s * 1.12));
        body.add(rod([x, 0.35, z], [x, 0.35, s * 0.98], 0.05, M.dark()));
      });
      const P = [0.15, 1.0, z], B = [0.55, 0.72, z];
      body.add(rod(P, [-1.0, 0.62, z], 0.045, M.alu()), rod([-1.0, 0.62, z], [-1.0, 0.35, z], 0.045, M.alu()),
               rod(P, B, 0.045, M.alu()), rod(B, [0, 0.6, z], 0.04, M.alu()), rod([0, 0.6, z], [0, 0.35, z], 0.04, M.alu()),
               rod(B, [1.0, 0.6, z], 0.04, M.alu()), rod([1.0, 0.6, z], [1.0, 0.35, z], 0.04, M.alu()),
               sphere(0.07, M.dark(), ...P), sphere(0.06, M.dark(), ...B));
    });
    g.add(body);

    // --- Power source ---
    const pw = slotGroup("power");
    if (p.power.id === "solarS") {
      pw.add(solarPanel(2.2, 1.5, 0, 1.42, 0));
    } else if (p.power.id === "solarL") {
      pw.add(solarPanel(2.2, 1.5, 0, 1.42, 0));
      [-1, 1].forEach((s) => {
        const wing = solarPanel(2.2, 1.6, 0, 1.48, s * 1.62);
        wing.rotation.x = s * 0.1;
        pw.add(wing);
      });
    } else {
      // MMRTG: finned cylinder angled off the back, glowing faintly with heat
      const rtg = new T.Group();
      rtg.add(cyl(0.24, 0.24, 0.9, M.rtg(), 0, 0, 0), cyl(0.27, 0.27, 0.06, M.dark(), 0, 0.45, 0), cyl(0.27, 0.27, 0.06, M.dark(), 0, -0.45, 0));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const fin = box(0.03, 0.85, 0.32, M.rtg(), Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36);
        fin.rotation.y = -a;
        rtg.add(fin);
      }
      rtg.position.set(-1.55, 1.25, 0);
      rtg.rotation.z = 0.9;
      pw.add(rtg, rod([-1.2, 1.1, 0], [-1.45, 1.2, 0], 0.05, M.alu()));
    }
    g.add(pw);

    // --- Battery (under the rear deck) ---
    const big = p.battery.id === "large";
    g.add(slotGroup("battery",
      box(big ? 0.9 : 0.5, big ? 0.32 : 0.24, big ? 1.0 : 0.6, M.carbon(), -0.6, 0.62, 0),
      box(big ? 0.92 : 0.52, 0.04, big ? 1.02 : 0.62, M.orange(), -0.6, big ? 0.79 : 0.75, 0)));

    // --- Science instruments ---
    const sci = slotGroup("science",
      rod([0.9, 1.38, 0.5], [0.9, 2.55, 0.5], 0.065, M.paint()),
      box(0.5, 0.3, 0.34, M.paint(), 0.95, 2.72, 0.5),
      cyl(0.1, 0.1, 0.12, M.lens(), 1.24, 2.78, 0.5, 20).rotateZ(Math.PI / 2),          // laser camera
      cyl(0.045, 0.045, 0.08, M.lens(), 1.22, 2.62, 0.4, 12).rotateZ(Math.PI / 2),      // mast cameras
      cyl(0.045, 0.045, 0.08, M.lens(), 1.22, 2.62, 0.6, 12).rotateZ(Math.PI / 2));
    if (p.science.id !== "basic") {
      // robotic arm with a rotating turret and a drill
      sci.add(sphere(0.08, M.dark(), 1.25, 1.05, 0.4),
              rod([1.25, 1.05, 0.4], [1.8, 1.3, 0.4], 0.06, M.paint()), sphere(0.07, M.dark(), 1.8, 1.3, 0.4),
              rod([1.8, 1.3, 0.4], [2.15, 0.85, 0.4], 0.055, M.paint()),
              cyl(0.17, 0.17, 0.22, M.alu(), 2.15, 0.72, 0.4, 20));
      const drill = mesh(new T.ConeGeometry(0.06, 0.32, 16), M.steel(), 2.15, 0.45, 0.4);
      drill.rotation.x = Math.PI;
      sci.add(drill);
    } else {
      sci.add(rod([0.9, 2.2, 0.5], [0.9, 2.2, 0.95], 0.02, M.alu()), box(0.08, 0.08, 0.08, M.paint(), 0.9, 2.2, 0.98));
    }
    if (p.science.id === "lab") {
      sci.add(box(0.6, 0.38, 0.55, M.paint(), 0.1, 1.57, -0.42), box(0.5, 0.3, 0.45, M.gold(), 0.72, 1.53, -0.42),
              cyl(0.07, 0.07, 0.08, M.dark(), 0.0, 1.8, -0.35), cyl(0.07, 0.07, 0.08, M.dark(), 0.2, 1.8, -0.35));
    }
    g.add(sci);

    // --- Communications ---
    const dish = cyl(0.4, 0.32, 0.05, M.paint(), -0.5, 1.82, -0.55, 6);
    dish.rotation.z = 0.5;
    const comms = slotGroup("comms", rod([-0.5, 1.36, -0.55], [-0.5, 1.74, -0.55], 0.04, M.alu()), sphere(0.06, M.dark(), -0.5, 1.75, -0.55), dish);
    if (p.comms.id === "relay") {
      comms.add(cyl(0.05, 0.05, 0.55, M.alu(), -1.0, 1.65, 0.6, 12), sphere(0.06, M.paint(), -1.0, 1.95, 0.6),
                box(0.26, 0.14, 0.22, M.paint(), -1.0, 1.42, 0.6));
    }
    g.add(comms);
    return g;
  }

  /* =====================================================================
     SPACE TELESCOPE (Webb-style; built with "deploy" handles for the game)
     ===================================================================== */
  function hexPositions(R) {
    // Flat-top hexagons in two rings around an empty centre = 18 segments
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const out = [];
    for (let k = 1; k <= 2; k++) {
      let q = -k, r = k;
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

    // Spacecraft bus (fixed): box with foil, radiators, high-gain antenna
    g.add(box(1.7, 0.7, 1.7, M.dark(), 0, 0, 0), box(1.72, 0.22, 1.72, M.silverFoil(), 0, 0.25, 0),
          cyl(0.06, 0.06, 0.4, M.alu(), 0, -0.5, 0.5, 12),
          cyl(0.38, 0.08, 0.16, M.paint(), 0, -0.75, 0.5, 32),
          box(0.25, 0.25, 0.25, M.black(), 0.7, -0.2, -0.7), box(0.25, 0.25, 0.25, M.black(), -0.7, -0.2, -0.7));

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
      for (let i = 0; i < 5; i++) {
        const layer = mesh(geo, M.shield(), 0, 0.42 + i * 0.1, 0);
        layer.scale.setScalar(1 - i * 0.03); // upper layers slightly smaller, like Webb
        layers.add(layer);
      }
      layers.add(rod([-W, 0.4, 0], [W, 0.4, 0], 0.03, M.black()), rod([0, 0.4, -D], [0, 0.4, D], 0.03, M.black()));
      cool.add(layers);
      deploy.shield = layers;
    } else {
      const panels = new T.Group();
      [-1, 1].forEach((s) => {
        panels.add(box(0.05, 1.2, 1.4, M.paint(), s * 1.0, 0.9, -0.2));
        for (let i = 0; i < 6; i++) panels.add(box(0.07, 1.1, 0.02, M.alu(), s * 1.0, 0.9, -0.82 + i * 0.25));
      });
      if (p.cooling.id === "cryoAll") {
        for (let i = 0; i < 4; i++) panels.add(cyl(0.12, 0.12, 0.5, M.steel(), -0.45 + i * 0.3, 1.45, -1.25, 20));
      }
      cool.add(panels);
      deploy.shield = panels;
    }
    g.add(cool);

    // --- Primary mirror (faces +z) ---
    const mirrorRoot = new T.Group();
    mirrorRoot.position.set(0, 2.65, 0.2);
    mirrorRoot.rotation.x = -0.12;
    const mir = slotGroup("mirror");
    if (p.mirror.id === "seg65") {
      const R = 0.42;
      const hexGeo = new T.CylinderGeometry(R * 0.95, R * 0.95, 0.06, 6);
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
      // black backplane behind the gold segments
      const back = (w) => box(w, R * 4.9, 0.1, M.black(), 0, 0, -0.07);
      mir.add(back(R * 3.4));
      wingL.add(box(R * 1.3, R * 3.2, 0.1, M.black(), 0, 0, -0.07));
      wingR.add(box(R * 1.3, R * 3.2, 0.1, M.black(), 0, 0, -0.07));
      mir.add(wingL, wingR);
      deploy.wingL = wingL;
      deploy.wingR = wingR;
    } else {
      const r = p.mirror.id === "mono65" ? 1.8 : 1.1;
      const disc = cyl(r, r, 0.3, M.glass(), 0, 0, 0, 64);
      disc.rotation.x = Math.PI / 2;
      const rim = mesh(new T.TorusGeometry(r, 0.06, 12, 64), M.dark(), 0, 0, 0);
      mir.add(disc, rim);
    }
    mirrorRoot.add(mir);

    // Secondary mirror on a tripod (unfolds in the finale)
    const sec = new T.Group();
    [[0, 1.3], [-1.1, -0.65], [1.1, -0.65]].forEach(([x, y]) => sec.add(rod([x, y, 0.05], [0, 0, 2.4], 0.025, M.black())));
    const sm = cyl(0.2, 0.2, 0.06, M.mirror(), 0, 0, 2.4, 6);
    sm.rotation.x = Math.PI / 2;
    sec.add(sm);
    mirrorRoot.add(sec);
    deploy.secondary = sec;
    g.add(mirrorRoot);

    // --- Instruments (behind the mirror) ---
    const ir = p.instruments.ir;
    g.add(slotGroup("instruments",
      box(ir ? 1.0 : 0.6, ir ? 0.8 : 0.5, ir ? 0.8 : 0.5, ir ? M.gold() : M.silverFoil(), 0, 2.45, -0.75),
      box(ir ? 0.6 : 0.4, 0.12, 0.3, M.black(), 0, ir ? 2.9 : 2.75, -0.75)));

    // --- Solar array (sticks out from the bus) ---
    const len = { s1: 1.2, s2: 2.0, s4: 3.2 }[p.power.id];
    const arrayPivot = new T.Group();
    arrayPivot.position.set(0, -0.15, -0.85);
    const panel = solarPanel(len, 0.9, 0, 0, -len / 2 - 0.05);
    panel.rotation.y = Math.PI / 2;
    panel.position.set(0, 0, -len / 2 - 0.05);
    arrayPivot.add(panel);
    g.add(slotGroup("power", arrayPivot));
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
     LUNAR LANDER (Apollo Lunar Module style)
     ===================================================================== */
  function buildLander(p) {
    const g = new T.Group();

    // Descent stage (fixed): gold-foil octagon with black bands
    g.add(cyl(1.3, 1.3, 1.0, M.gold(), 0, 1.45, 0, 8), cyl(1.32, 1.32, 0.12, M.blackFoil(), 0, 0.98, 0, 8),
          cyl(1.32, 1.32, 0.06, M.blackFoil(), 0, 1.93, 0, 8));

    // --- Legs & structure ---
    const thin = p.structure.id === "light";
    const legs = slotGroup("structure");
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const c = Math.cos(a), s = Math.sin(a);
      const legMat = thin ? M.alu : M.gold;
      legs.add(rod([c * 1.1, 1.6, s * 1.1], [c * 2.2, 0.2, s * 2.2], thin ? 0.05 : 0.08, legMat()));
      legs.add(rod([c * 1.25, 1.0, s * 1.25], [c * 1.95, 0.5, s * 1.95], thin ? 0.03 : 0.05, M.alu()));
      legs.add(rod([(c - s * 0.5) * 1.1, 1.0, (s + c * 0.5) * 1.1], [c * 1.9, 0.48, s * 1.9], 0.03, M.alu()));
      legs.add(cyl(0.3, 0.36, 0.1, M.alu(), c * 2.2, 0.09, s * 2.2, 24));
      if (i !== 0) legs.add(rod([c * 2.2, 0.06, s * 2.2], [c * 2.2, -0.5, s * 2.2], 0.012, M.alu())); // contact probes
    }
    g.add(legs);

    // --- Descent engine ---
    const eng = slotGroup("engine");
    if (p.engine.id === "solid") {
      eng.add(cyl(0.5, 0.5, 0.75, M.black(), 0, 0.6, 0), cyl(0.51, 0.51, 0.06, M.alu(), 0, 0.4, 0),
              mesh(new T.CylinderGeometry(0.14, 0.24, 0.3, 20, 1, true), M.bell(), 0, 0.1, 0));
    } else {
      const big = p.engine.id === "hp";
      eng.add(mesh(new T.CylinderGeometry(0.16, big ? 0.62 : 0.45, big ? 0.9 : 0.7, 32, 1, true), M.bell(), 0, big ? 0.5 : 0.6, 0),
              cyl(0.2, 0.2, 0.12, M.alu(), 0, big ? 0.98 : 0.98, 0, 20));
      if (big) eng.add(box(0.32, 0.3, 0.32, M.steel(), 0.55, 0.85, 0), rod([0.4, 0.8, 0], [0.12, 0.9, 0], 0.04, M.steel()));
    }
    g.add(eng);

    // --- Propellant tanks (domes poking out of the top deck) ---
    const tr = { small: 0.36, med: 0.44, large: 0.54 }[p.tanks.id];
    const tanks = slotGroup("tanks");
    [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].forEach(([x, z]) => tanks.add(sphere(tr, M.silverFoil(), x, 1.85, z)));
    g.add(tanks);

    // --- Ascent stage (crew cabin) ---
    const light = p.ascent.id === "light";
    const k = light ? 0.92 : 1;
    const skin = light ? M.gold : M.silverFoil;
    const asc = slotGroup("ascent");
    const cabin = cyl(0.95 * k, 0.95 * k, 1.15 * k, skin(), 0, 2.62, 0, 8);
    cabin.scale.z = 0.85;
    asc.add(cabin);
    asc.add(box(1.0 * k, 0.95 * k, 0.12, M.dark(), 0, 2.7, 0.78 * k)); // front face
    [-1, 1].forEach((s) => { // two triangular windows
      const tri = new T.Shape();
      tri.moveTo(0, 0); tri.lineTo(0.32 * s, 0); tri.lineTo(0, 0.28); tri.closePath();
      const w = mesh(new T.ShapeGeometry(tri), M.lens(), s * 0.06, 2.82, 0.85 * k);
      w.material.side = T.DoubleSide;
      asc.add(w);
    });
    asc.add(box(0.3, 0.45, 0.06, M.black(), 0, 2.45, 0.85 * k)); // hatch
    asc.add(box(1.1 * k, 0.75 * k, 0.6 * k, skin(), 0, 2.55, -0.8 * k)); // aft equipment bay
    asc.add(cyl(0.3, 0.32, 0.32, M.dark(), 0, 3.32, 0, 20), cyl(0.33, 0.33, 0.05, M.alu(), 0, 3.5, 0, 20)); // docking tunnel
    [[0.85, 0.55], [-0.85, 0.55], [0.85, -0.55], [-0.85, -0.55]].forEach(([x, z]) => { // RCS thruster quads
      asc.add(box(0.14, 0.14, 0.14, M.dark(), x * k, 2.95, z * k));
      [[0.12, 0, 0], [-0.12, 0, 0], [0, 0.12, 0], [0, -0.12, 0]].forEach(([dx, dy]) =>
        asc.add(cyl(0.025, 0.04, 0.08, M.bell(), x * k + dx, 2.95 + dy, z * k, 8).rotateZ(dx ? Math.PI / 2 : 0)));
    });
    asc.add(rod([0.55, 3.15, -0.35], [0.95, 3.6, -0.55], 0.02, M.alu()), cyl(0.2, 0.05, 0.08, M.paint(), 0.98, 3.65, -0.57, 16)); // radar dish
    g.add(asc);

    // --- Science experiments (stored in a side bay) ---
    const sci = slotGroup("science");
    const n = { min: 1, full: 2, extra: 4 }[p.science.id];
    for (let i = 0; i < n; i++) sci.add(box(0.45, 0.35, 0.45, i % 2 ? M.gold() : M.paint(), 1.45, 1.2 + (i >> 1) * 0.4, -0.3 + (i % 2) * 0.55));
    if (p.science.id === "extra") sci.add(box(0.5, 0.5, 1.4, M.paint(), -0.2, 1.3, 1.55), box(0.52, 0.08, 1.42, M.gold(), -0.2, 1.58, 1.55));
    g.add(sci);

    // --- Battery bank ---
    const big = p.battery.id === "large";
    g.add(slotGroup("battery",
      box(big ? 0.5 : 0.35, big ? 0.6 : 0.4, big ? 0.8 : 0.5, M.carbon(), -1.45, 1.4, 0),
      box(0.05, big ? 0.4 : 0.25, big ? 0.6 : 0.35, M.orange(), -1.71 - (big ? 0.0 : -0.08), 1.4, 0)));
    return g;
  }

  /* Build whichever spacecraft a mission needs. */
  function buildCraft(missionId, parts) {
    if (missionId === "mars-rover") return buildRover(parts);
    if (missionId === "deep-space-telescope") return buildTelescope(parts);
    return buildLander(parts);
  }

  /* =====================================================================
     LIGHTING HELPERS
     ===================================================================== */
  /* A soft "photo studio" reflection map: gradient sky + bright light panels.
     Metals and mirrors reflect this, which makes them look real. */
  function makeEnvMap(renderer, kind = "space") {
    const pm = new T.PMREMGenerator(renderer);
    const env = new T.Scene();
    const geo = new T.SphereGeometry(50, 32, 16);
    const top = new T.Color(kind === "studio" ? 0xffffff : 0x9fb6e0), mid = new T.Color(kind === "studio" ? 0xc9d4e4 : 0x2a3654), bot = new T.Color(kind === "studio" ? 0x8a96a8 : 0x07090f);
    const cols = [];
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50;
      const c = y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(bot, -y);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
    env.add(new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    // bright "softbox" panels create crisp highlights on metal
    [[20, 25, 15, 3.5], [-25, 12, -10, 1.6], [0, 30, -25, 1.2], [15, 4, -30, 0.9]].forEach(([x, y, z, b]) => {
      const m = new T.Mesh(new T.PlaneGeometry(14, 9), new T.MeshBasicMaterial({ color: new T.Color(b, b, b * 1.02), side: T.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    });
    const tex = pm.fromScene(env, 0.035).texture;
    pm.dispose();
    return tex;
  }

  /* Turn on shadows for everything in a model */
  function enableShadows(root) {
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  window.Models = {
    buildCraft, buildRover, buildTelescope, buildLander, buildRocket, setTelescopeDeploy,
    makeEnvMap, enableShadows, groundTexture, fadeTex, floorTex,
  };
})();
