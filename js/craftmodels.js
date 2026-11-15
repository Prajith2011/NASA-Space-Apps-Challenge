/* =====================================================================
   Space Mission Cube — detailed 3D models for the Spacecraft Hangar
   ---------------------------------------------------------------------
   Each real spacecraft is built from many small named parts.
   Every part sits inside a group tagged   userData.part = "<part id>"
   (the ids match js/craftdata.js), so hovering or clicking a mesh tells
   the inspector which part it belongs to.

   Reuses the materials and shape helpers from models.js (Models.kit).
   ===================================================================== */

(function () {
  const T = THREE;
  const { M, mesh, box, cyl, sphere, rod, solarPanel, wheel, hexPositions } = Models.kit;
  const yellow = () => new T.MeshStandardMaterial({ color: 0xf2c230, metalness: 0.1, roughness: 0.5 });

  /* A group that remembers which part it is */
  function part(id, ...children) {
    const g = new T.Group();
    g.userData.part = id;
    children.forEach((c) => g.add(c));
    return g;
  }
  /* Adds a new part group to a parent and returns it */
  const adder = (root) => (id, ...children) => {
    const p = part(id, ...children);
    root.add(p);
    return p;
  };
  const lensX = (r, h, x, y, z) => cyl(r, r, h, M.lens(), x, y, z, 16).rotateZ(Math.PI / 2);

  /* ---- Extra surface detail drawn on canvases ---- */
  const cache = {};
  function canvasTex(key, size, draw, repeat = [1, 1]) {
    if (!cache[key]) {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      draw(c.getContext("2d"), size);
      cache[key] = c;
    }
    const t = new T.CanvasTexture(cache[key]);
    t.encoding = T.sRGBEncoding;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(...repeat);
    t.anisotropy = 8;
    return t;
  }
  /* Webb's sunshield: silvery-violet Kapton with soft wrinkles and seams */
  const membrane = () => canvasTex("membrane", 512, (g, n) => {
    g.fillStyle = "#b7a6d8";
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 70; i++) {
      const x = (i * 97) % n, w = 6 + ((i * 37) % 30);
      const grad = g.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, i % 3 ? "rgba(255,255,255,0.18)" : "rgba(60,40,90,0.18)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.save(); g.translate(n / 2, n / 2); g.rotate(0.5 + (i % 5) * 0.12); g.translate(-n / 2, -n / 2);
      g.fillStyle = grad; g.fillRect(x - n / 2, -n / 2, w, n * 2);
      g.restore();
    }
    g.strokeStyle = "rgba(70,50,110,0.35)";
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, (i * n) / 4); g.lineTo(n, (i * n) / 4); g.stroke(); }
  }, [0.22, 0.22]);
  /* Hubble's quilted silver insulation panels */
  const mli = () => canvasTex("mli", 512, (g, n) => {
    g.drawImage(Models.kit.foilTex("silver").image, 0, 0, n, n);
    g.strokeStyle = "rgba(40,44,52,0.55)";
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo((i * n) / 4, 0); g.lineTo((i * n) / 4, n); g.stroke();
      g.beginPath(); g.moveTo(0, (i * n) / 2); g.lineTo(n, (i * n) / 2); g.stroke();
    }
    g.fillStyle = "rgba(30,30,36,0.6)";
    for (let x = 0; x < n; x += n / 16) for (let y = 0; y < n; y += n / 8) { g.beginPath(); g.arc(x + 8, y + 8, 2.5, 0, 7); g.fill(); }
  }, [6, 2]);
  const mliMat = () => {
    const m = mli();
    return new T.MeshStandardMaterial({ map: m, bumpMap: m, bumpScale: 0.012, metalness: 0.85, roughness: 0.3, envMapIntensity: 1.2 });
  };

  /* =====================================================================
     MARS ROVERS: Curiosity and Perseverance (front = +x)
     ===================================================================== */
  function buildMarsRover(perse) {
    const g = new T.Group();
    const P = adder(g);

    // Body (Warm Electronics Box)
    const bodyPart = P("body",
      box(2.4, 0.55, 1.6, M.paint(), 0, 1.05, 0),
      box(2.5, 0.06, 1.7, M.alu(), 0, 1.35, 0),
      box(2.42, 0.14, 1.62, M.gold(), 0, 0.78, 0),
      // calibration target with colour chips, as on the real rovers
      box(0.2, 0.03, 0.2, M.dark(), 0.55, 1.4, 0.72),
      ...[[0xd23b3b, -0.05, -0.05], [0x3bb34a, 0.05, -0.05], [0x2f6fd8, -0.05, 0.05], [0xf2d23a, 0.05, 0.05]].map(([c, dx, dz]) =>
        box(0.07, 0.012, 0.07, new T.MeshStandardMaterial({ color: c, roughness: 0.6 }), 0.55 + dx, 1.42, 0.72 + dz)),
      // avionics boxes and a cable tray along each side
      box(0.35, 0.1, 0.25, M.dark(), -0.2, 1.42, -0.15), box(0.25, 0.08, 0.2, M.gold(), 0.05, 1.41, 0.45));
    [-1, 1].forEach((sd) => {
      bodyPart.add(rod([-1.1, 1.22, sd * 0.81], [1.1, 1.22, sd * 0.81], 0.018, M.dark()), rod([-1.1, 1.16, sd * 0.81], [1.1, 1.16, sd * 0.81], 0.012, M.copper()));
      for (let i = 0; i < 8; i++) bodyPart.add(box(0.03, 0.08, 0.03, M.alu(), -1.0 + i * 0.29, 1.19, sd * 0.815));
    });

    // Hazard cameras (pairs, front and rear)
    const hz = P("hazcam");
    [1, -1].forEach((dir) => [-0.3, 0.3].forEach((z) => {
      hz.add(box(0.07, 0.12, 0.2, M.dark(), dir * 1.215, 0.92, z));
      [-0.05, 0.05].forEach((dz) => hz.add(lensX(0.03, 0.06, dir * 1.26, 0.92, z + dz)));
    }));

    // Wheels and rocker-bogie suspension
    const wh = P("wheels");
    const sus = P("suspension");
    [-1, 1].forEach((s) => {
      const z = s * 0.92;
      [-1.0, 0, 1.0].forEach((x) => {
        const w = wheel(x, 0.35, s * 1.12);
        if (perse) w.scale.set(1.05, 1.2, 1.05); // Perseverance: bigger, wider wheels
        wh.add(w);
        sus.add(rod([x, 0.35, z], [x, 0.35, s * 0.98], 0.05, M.dark()));
      });
      const Pv = [0.15, 1.0, z], B = [0.55, 0.72, z];
      sus.add(rod(Pv, [-1.0, 0.62, z], 0.045, M.alu()), rod([-1.0, 0.62, z], [-1.0, 0.35, z], 0.045, M.alu()),
        rod(Pv, B, 0.045, M.alu()), rod(B, [0, 0.6, z], 0.04, M.alu()), rod([0, 0.6, z], [0, 0.35, z], 0.04, M.alu()),
        rod(B, [1.0, 0.6, z], 0.04, M.alu()), rod([1.0, 0.6, z], [1.0, 0.35, z], 0.04, M.alu()),
        sphere(0.07, M.dark(), ...Pv), sphere(0.06, M.dark(), ...B));
    });
    // differential bar across the top deck links the left and right rockers
    sus.add(rod([0.15, 1.43, -0.95], [0.15, 1.43, 0.95], 0.03, M.dark()), rod([0.15, 1.43, -0.95], [0.15, 1.0, -0.95], 0.025, M.dark()),
      rod([0.15, 1.43, 0.95], [0.15, 1.0, 0.95], 0.025, M.dark()));

    // MMRTG: finned cylinder angled off the back
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
    P("mmrtg", rtg, rod([-1.2, 1.1, 0], [-1.45, 1.2, 0], 0.05, M.alu()),
      // heat-exchanger pipes that carry spare heat into the body
      rod([-1.25, 1.45, 0.18], [-1.18, 1.25, 0.18], 0.022, M.copper()), rod([-1.25, 1.45, -0.18], [-1.18, 1.25, -0.18], 0.022, M.copper()),
      rod([-1.25, 1.45, 0.18], [-1.4, 1.62, 0.12], 0.022, M.copper()), rod([-1.25, 1.45, -0.18], [-1.4, 1.62, -0.12], 0.022, M.copper()));

    // Batteries (under the rear deck)
    P("battery", box(0.7, 0.28, 0.9, M.carbon(), -0.6, 0.62, 0), box(0.72, 0.04, 0.92, M.orange(), -0.6, 0.77, 0));

    // Remote sensing mast and its head
    P("mast",
      rod([0.9, 1.38, 0.5], [0.9, 2.45, 0.5], 0.065, M.paint()),
      cyl(0.11, 0.11, 0.08, M.dark(), 0.9, 2.42, 0.5, 16),
      box(0.42, 0.24, 0.42, M.paint(), 0.95, 2.6, 0.5));
    // weather sensors on two little booms
    P(perse ? "meda" : "rems",
      rod([0.9, 1.95, 0.5], [0.9, 1.95, 0.92], 0.018, M.alu()), box(0.08, 0.06, 0.12, M.paint(), 0.9, 1.95, 0.96),
      rod([0.9, 1.95, 0.5], [0.55, 1.95, 0.3], 0.018, M.alu()), box(0.08, 0.06, 0.12, M.paint(), 0.52, 1.95, 0.28));
    // laser instrument on top of the head
    P(perse ? "supercam" : "chemcam",
      box(0.4, 0.2, 0.3, M.paint(), 0.95, 2.83, 0.5),
      lensX(perse ? 0.12 : 0.1, 0.1, 1.17, 2.84, 0.5),
      cyl(perse ? 0.13 : 0.11, perse ? 0.13 : 0.11, 0.02, M.dark(), 1.21, 2.84, 0.5, 20).rotateZ(Math.PI / 2));
    // colour cameras
    P(perse ? "mastcamz" : "mastcam",
      box(0.08, 0.1, 0.12, M.dark(), 1.17, 2.66, 0.36), lensX(0.04, 0.06, 1.23, 2.66, 0.36),
      box(0.08, 0.1, 0.12, M.dark(), 1.17, 2.66, 0.64), lensX(0.04, 0.06, 1.23, 2.66, 0.64));
    // navigation cameras on a bar under the head
    P("navcam",
      box(0.1, 0.08, 0.6, M.dark(), 1.12, 2.46, 0.5),
      ...[0.24, 0.32, 0.68, 0.76].map((z) => lensX(0.022, 0.05, 1.18, 2.46, z)));

    // Robotic arm and turret
    P("arm",
      box(0.18, 0.18, 0.18, M.dark(), 1.25, 1.05, 0.4),
      rod([1.25, 1.05, 0.4], [1.8, 1.3, 0.4], 0.06, M.paint()), sphere(0.08, M.dark(), 1.8, 1.3, 0.4),
      rod([1.8, 1.3, 0.4], [2.15, 0.95, 0.4], 0.055, M.paint()), sphere(0.06, M.dark(), 2.15, 0.95, 0.4));
    const tur = P("turret",
      cyl(perse ? 0.22 : 0.18, perse ? 0.22 : 0.18, 0.24, M.alu(), 2.15, 0.78, 0.4, 20),
      box(0.12, 0.16, 0.14, M.paint(), 2.38, 0.78, 0.4),
      box(0.14, 0.12, 0.12, M.gold(), 2.15, 0.78, 0.66),
      box(0.12, 0.12, 0.14, M.dark(), 1.93, 0.78, 0.4));
    const drill = mesh(new T.ConeGeometry(perse ? 0.07 : 0.06, 0.34, 16), M.steel(), 2.15, 0.5, 0.4);
    drill.rotation.x = Math.PI;
    tur.add(drill);

    // Communications
    const dish = cyl(0.33, 0.33, 0.05, M.paint(), -0.55, 1.78, -0.55, 6);
    dish.rotation.z = 0.5;
    P("hga", rod([-0.55, 1.36, -0.55], [-0.55, 1.7, -0.55], 0.04, M.alu()), sphere(0.06, M.dark(), -0.55, 1.72, -0.55), dish);
    P("uhf", cyl(0.05, 0.05, 0.5, M.alu(), -1.0, 1.62, 0.6, 12), sphere(0.06, M.paint(), -1.0, 1.9, 0.6), box(0.24, 0.12, 0.2, M.paint(), -1.0, 1.42, 0.6));
    P("lga", cyl(0.03, 0.03, 0.32, M.alu(), -0.95, 1.52, -0.05, 10), mesh(new T.ConeGeometry(0.06, 0.14, 12), M.paint(), -0.95, 1.74, -0.05));

    if (!perse) {
      // Curiosity's onboard labs (inlets on the deck) and other sensors
      P("sam", box(0.6, 0.12, 0.45, M.paint(), 0.3, 1.44, -0.45), cyl(0.06, 0.06, 0.05, M.dark(), 0.15, 1.52, -0.45, 12), cyl(0.06, 0.06, 0.05, M.dark(), 0.42, 1.52, -0.45, 12));
      P("chemin", box(0.36, 0.1, 0.3, M.gold(), 0.25, 1.43, 0.15), mesh(new T.CylinderGeometry(0.08, 0.03, 0.1, 12, 1, true), M.dark(), 0.25, 1.53, 0.15));
      P("rad", cyl(0.08, 0.09, 0.14, M.dark(), -0.2, 1.45, 0.4, 16), cyl(0.06, 0.06, 0.02, M.lens(), -0.2, 1.53, 0.4, 16));
      P("dan", box(0.32, 0.22, 0.32, M.paint(), -1.05, 0.68, -0.55), box(0.12, 0.12, 0.2, M.dark(), -1.05, 0.68, -0.3));
    } else {
      // Perseverance's sample system, oxygen experiment, radar and helicopter
      P("caching", box(0.7, 0.16, 0.9, M.alu(), 0.6, 0.66, 0),
        cyl(0.17, 0.17, 0.08, M.paint(), 1.24, 1.12, -0.5, 24).rotateZ(Math.PI / 2),
        ...[0, 1, 2, 3, 4].map((i) => cyl(0.025, 0.025, 0.1, M.steel(), 1.27, 1.12 + Math.sin(i * 1.26) * 0.11, -0.5 + Math.cos(i * 1.26) * 0.11, 8).rotateZ(Math.PI / 2)));
      P("moxie", box(0.4, 0.3, 0.06, M.gold(), 0.45, 1.05, -0.83), box(0.1, 0.1, 0.03, M.dark(), 0.6, 1.1, -0.87));
      P("rimfax", box(0.32, 0.12, 0.42, M.dark(), -1.15, 0.66, 0.42));
      const heli = P("ingenuity",
        box(0.18, 0.15, 0.18, M.gold(), 0, 0.33, 0),
        rod([0, 0.4, 0], [0, 0.66, 0], 0.012, M.dark()),
        Object.assign(box(1.0, 0.012, 0.07, M.carbon(), 0, 0.5, 0), { userData: { spin: 2.2 } }),
        Object.assign(box(0.07, 0.012, 1.0, M.carbon(), 0, 0.58, 0), { userData: { spin: -2.2 } }),
        cyl(0.03, 0.03, 0.05, M.alu(), 0, 0.5, 0, 12), cyl(0.03, 0.03, 0.05, M.alu(), 0, 0.58, 0, 12),
        box(0.32, 0.015, 0.2, M.solar(1, 1), 0, 0.67, 0));
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => heli.add(rod([a * 0.06, 0.27, b * 0.06], [a * 0.24, 0.0, b * 0.24], 0.008, M.carbon())));
      heli.position.set(2.4, 0, 1.9);
    }
    return g;
  }

  /* =====================================================================
     JAMES WEBB SPACE TELESCOPE (mirror faces +z, everything unfolded)
     ===================================================================== */
  function buildWebb() {
    const g = new T.Group();
    const P = adder(g);

    P("bus", box(1.7, 0.7, 1.7, M.dark(), 0, 0, 0), box(1.72, 0.22, 1.72, M.silverFoil(), 0, 0.25, 0));
    P("adapter", mesh(new T.CylinderGeometry(0.5, 0.55, 0.16, 32, 1, true), M.alu(), 0, -0.43, 0), mesh(new T.TorusGeometry(0.53, 0.03, 8, 32), M.dark(), 0, -0.5, 0).rotateX(Math.PI / 2));
    P("hga", rod([0.5, -0.35, 0.5], [0.55, -0.7, 0.55], 0.04, M.alu()), cyl(0.36, 0.08, 0.14, M.paint(), 0.55, -0.82, 0.55, 32));
    P("trackers", box(0.25, 0.25, 0.25, M.black(), 0.7, -0.2, -0.7), box(0.25, 0.25, 0.25, M.black(), -0.7, -0.2, -0.7),
      lensX(0.07, 0.04, 0.84, -0.2, -0.7), lensX(0.07, 0.04, -0.84, -0.2, -0.7));
    const thr = P("thrusters");
    [[0.8, 0.8], [-0.8, 0.8], [0.8, -0.8], [-0.8, -0.8]].forEach(([x, z]) => thr.add(mesh(new T.CylinderGeometry(0.03, 0.08, 0.14, 12, 1, true), M.bell(), x, -0.42, z)));
    thr.add(sphere(0.18, M.steel(), -0.55, -0.1, 0.87));
    P("cryocooler", box(0.32, 0.36, 0.32, M.gold(), -0.98, 0.05, 0.35), cyl(0.08, 0.08, 0.2, M.steel(), -0.98, 0.32, 0.35, 12));

    // Sunshield: five layers + pallets and booms that pulled it open
    const W = 3.8, D = 2.4;
    const shape = new T.Shape();
    shape.moveTo(-W, 0); shape.lineTo(-W * 0.55, D); shape.lineTo(W * 0.55, D);
    shape.lineTo(W, 0); shape.lineTo(W * 0.55, -D); shape.lineTo(-W * 0.55, -D); shape.closePath();
    const geo = new T.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const shield = P("sunshield");
    for (let i = 0; i < 5; i++) {
      const mat = new T.MeshStandardMaterial({ map: membrane(), bumpMap: membrane(), bumpScale: 0.01, metalness: 0.75, roughness: 0.38, side: T.DoubleSide, envMapIntensity: 0.9, color: 0xb8b0cc });
      if (i === 4) mat.color.set(0xcfc6e6);
      const layer = mesh(geo, mat, 0, 0.46 + i * 0.1, 0);
      layer.scale.setScalar(1 - i * 0.03);
      shield.add(layer);
    }
    // the edges of the layers are held apart by thin cables at each corner
    [[-W, 0], [-W * 0.55, D], [W * 0.55, D], [W, 0], [W * 0.55, -D], [-W * 0.55, -D]].forEach(([x, z]) =>
      shield.add(rod([x * 0.99, 0.46, z * 0.99], [x * 0.88, 0.86, z * 0.88], 0.012, M.black())));
    P("pallets",
      box(1.3, 0.08, 0.8, M.dark(), 2.2, 0.4, 0), box(1.3, 0.08, 0.8, M.dark(), -2.2, 0.4, 0),
      rod([0, 0.42, -D], [0, 0.42, D], 0.035, M.black()), rod([-W, 0.42, 0], [W, 0.42, 0], 0.03, M.black()));
    const flapShape = new T.Shape();
    flapShape.moveTo(0, -0.5); flapShape.lineTo(0.7, -0.35); flapShape.lineTo(0.7, 0.35); flapShape.lineTo(0, 0.5); flapShape.closePath();
    const flapGeo = new T.ShapeGeometry(flapShape);
    flapGeo.rotateX(-Math.PI / 2);
    const flap = mesh(flapGeo, M.shield(), -W, 0.5, 0);
    flap.rotation.y = Math.PI;
    flap.rotation.z = -0.35;
    P("flap", flap);

    // Deployable tower lifts the telescope away from the warm bus
    P("tower", rod([0, 0.4, -0.35], [0, 2.05, -0.65], 0.13, M.alu()), cyl(0.2, 0.2, 0.08, M.dark(), 0, 0.42, -0.35, 16));

    // Instruments + radiators behind the mirror
    P("isim", box(1.0, 0.8, 0.8, M.gold(), 0, 2.45, -0.75), box(0.6, 0.12, 0.3, M.black(), 0, 2.9, -0.75));
    P("radiators", box(1.3, 1.0, 0.05, M.black(), 0, 2.45, -1.22), box(0.05, 0.8, 0.7, M.black(), 0.62, 2.45, -0.75), box(0.05, 0.8, 0.7, M.black(), -0.62, 2.45, -0.75));

    // Primary mirror (18 segments), wings, backplane, secondary mirror + tripod
    const mirrorRoot = new T.Group();
    mirrorRoot.position.set(0, 2.65, 0.2);
    mirrorRoot.rotation.x = -0.12;
    const R = 0.42;
    const hexGeo = new T.CylinderGeometry(R * 0.95, R * 0.95, 0.06, 6);
    hexGeo.rotateX(Math.PI / 2);
    hexGeo.rotateZ(Math.PI / 6);
    const prim = part("primary"), wings = part("wings");
    const frameGeo = new T.CylinderGeometry(R * 0.985, R * 0.985, 0.05, 6);
    frameGeo.rotateX(Math.PI / 2);
    frameGeo.rotateZ(Math.PI / 6);
    hexPositions(R).forEach((h) => {
      const target = Math.abs(h.q) === 2 ? wings : prim;
      target.add(mesh(hexGeo, M.mirror(), h.x, h.y, 0), mesh(frameGeo, M.black(), h.x, h.y, -0.035));
      // three actuator pads behind each segment
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5;
        target.add(cyl(0.035, 0.035, 0.08, M.steel(), h.x + Math.cos(a) * R * 0.45, h.y + Math.sin(a) * R * 0.45, -0.09, 8).rotateX(Math.PI / 2));
      }
    });
    const back = part("backplane", box(R * 3.4, R * 4.9, 0.1, M.black(), 0, 0, -0.07),
      box(R * 1.3, R * 3.2, 0.1, M.black(), -R * 3.0, 0, -0.07), box(R * 1.3, R * 3.2, 0.1, M.black(), R * 3.0, 0, -0.07));
    const struts = part("struts");
    [[0, 1.3], [-1.1, -0.65], [1.1, -0.65]].forEach(([x, y]) => struts.add(rod([x, y, 0.05], [0, 0, 2.4], 0.025, M.black())));
    const sm = cyl(0.2, 0.2, 0.06, M.mirror(), 0, 0, 2.4, 6);
    sm.rotation.x = Math.PI / 2;
    mirrorRoot.add(prim, wings, back, struts, part("secondary", sm, cyl(0.12, 0.12, 0.12, M.black(), 0, 0, 2.48, 12).rotateX(Math.PI / 2)));
    g.add(mirrorRoot);

    // Solar array sticking out from the bus
    const panel = solarPanel(2.0, 0.9, 0, -0.15, -1.9);
    panel.rotation.y = Math.PI / 2;
    P("solar", panel, rod([0, -0.15, -0.85], [0, -0.15, -0.95], 0.05, M.alu()));
    return g;
  }

  /* =====================================================================
     HUBBLE SPACE TELESCOPE (built standing up, then laid on its side;
     the tube and aft shroud are drawn as a cut-away so you can see inside)
     ===================================================================== */
  function buildHubble() {
    const g = new T.Group();
    const inner = new T.Group();
    const P = adder(inner);
    const open = (r, h, y, mat) => {
      // a cylinder with a slice missing on the side facing the camera (+z)
      const m = mesh(new T.CylinderGeometry(r, r, h, 40, 1, true, 0.55, Math.PI * 2 - 1.1), mat, 0, y, 0);
      m.material.side = T.DoubleSide;
      return m;
    };

    P("aft", open(1.22, 1.6, 0.8, mliMat()), cyl(1.22, 1.22, 0.06, M.dark(), 0, 0.02, 0, 40));
    P("equip", cyl(1.3, 1.3, 1.2, mliMat(), 0, 2.2, 0, 10), cyl(1.31, 1.31, 0.05, M.dark(), 0, 1.62, 0, 10), cyl(1.31, 1.31, 0.05, M.dark(), 0, 2.78, 0, 10));
    P("tube", open(1.1, 3.6, 4.6, mliMat()), mesh(new T.TorusGeometry(1.1, 0.05, 8, 40), M.alu(), 0, 6.4, 0).rotateX(Math.PI / 2),
      mesh(new T.TorusGeometry(1.1, 0.04, 8, 40), M.dark(), 0, 2.85, 0).rotateX(Math.PI / 2));

    // Aperture door, hinged at the rim and swung open
    const hinge = new T.Group();
    hinge.position.set(1.1, 6.45, 0);
    hinge.add(cyl(1.1, 1.1, 0.08, M.silverFoil(), -1.1, 0, 0, 40));
    hinge.rotation.z = 1.9;
    P("door", hinge, cyl(0.08, 0.08, 0.5, M.dark(), 1.1, 6.45, 0, 10).rotateX(Math.PI / 2));

    // Optics inside the tube
    P("primary", cyl(0.98, 0.98, 0.16, M.glass(), 0, 2.98, 0, 48), cyl(0.2, 0.2, 0.18, M.black(), 0, 2.99, 0, 16));
    const sec = P("secondary", cyl(0.2, 0.2, 0.08, M.glass(), 0, 5.6, 0, 24));
    [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((a) => sec.add(rod([0, 5.62, 0], [Math.cos(a) * 1.05, 5.62, Math.sin(a) * 1.05], 0.015, M.black())));

    // Instruments in the aft shroud (visible through the cut-away)
    P("instruments", box(0.7, 1.1, 0.6, M.paint(), -0.35, 0.8, 0.2), box(0.5, 1.1, 0.5, M.alu(), 0.4, 0.8, -0.3), box(0.45, 0.9, 0.45, M.copper(), 0.45, 0.75, 0.45));
    P("nicmos", box(0.42, 0.8, 0.42, M.gold(), -0.45, 0.75, -0.5), box(0.04, 0.9, 0.8, M.black(), -1.32, 1.0, -0.4), rod([-0.66, 1.0, -0.5], [-1.3, 1.0, -0.4], 0.03, M.steel()));
    P("fgs", box(0.6, 0.3, 0.4, M.dark(), 0, 1.45, -0.6), box(0.4, 0.3, 0.6, M.dark(), -0.7, 1.45, 0.1), box(0.4, 0.3, 0.6, M.dark(), 0.7, 1.45, 0.05));

    // Equipment-section bays
    P("gyros", box(0.4, 0.3, 0.12, M.dark(), 0.55, 2.45, 1.22), cyl(0.06, 0.06, 0.06, M.alu(), 0.55, 2.45, 1.3, 12).rotateX(Math.PI / 2));
    P("batteries", box(0.5, 0.55, 0.1, M.carbon(), -0.55, 2.1, 1.24), box(0.52, 0.05, 0.11, M.orange(), -0.55, 2.4, 1.24));

    // Solar arrays on short masts (stiff panels, like the ones fitted in 2002)
    const sol = P("solar");
    [-1, 1].forEach((s) => {
      sol.add(rod([0, 3.15, s * 1.12], [0, 3.15, s * 1.75], 0.05, M.alu()));
      sol.add(box(0.04, 1.3, 2.9, M.alu(), 0, 3.15, s * 3.25), box(0.06, 1.22, 2.8, M.solar(3, 1), 0, 3.15, s * 3.25));
    });

    // High-gain antennas on booms
    const hga = P("hga");
    [-1, 1].forEach((s) => {
      hga.add(rod([s * 1.3, 2.6, 0], [s * 2.6, 2.6, 0], 0.035, M.alu()));
      const d = cyl(0.42, 0.08, 0.12, M.paint(), s * 2.7, 2.6, 0, 32);
      d.rotation.z = s * Math.PI / 2;
      hga.add(d);
    });

    // Yellow handrails for spacewalking astronauts
    const rails = P("handrails");
    [2.2, 3.0, 3.6, 4.3].forEach((a) => rails.add(rod([Math.sin(a) * 1.16, 3.1, Math.cos(a) * 1.16], [Math.sin(a) * 1.16, 6.1, Math.cos(a) * 1.16], 0.02, yellow())));
    [[1.4, 0.4], [-1.4, 0.4]].forEach(([x, y]) => rails.add(rod([x * 0.8, y, 0.75], [x * 0.8, y + 1.0, 0.75], 0.02, yellow())));

    // Shuttle attach fittings (trunnions) and the robot-arm grapple fixture
    P("trunnions", cyl(0.07, 0.07, 0.35, M.steel(), 0, 1.75, 1.45, 12).rotateX(Math.PI / 2), cyl(0.07, 0.07, 0.35, M.steel(), 0, 1.75, -1.45, 12).rotateX(Math.PI / 2),
      box(0.25, 0.25, 0.2, M.dark(), -1.35, 1.9, 0).rotateZ(Math.PI / 2), cyl(0.04, 0.04, 0.2, M.steel(), -1.5, 1.9, 0, 10).rotateZ(Math.PI / 2));

    inner.rotation.z = -Math.PI / 2; // lay it on its side: the aperture now points along +x
    inner.position.set(-3.2, 2.2, 0);
    g.add(inner);
    return g;
  }

  /* =====================================================================
     APOLLO LUNAR MODULE (hatch and ladder face +z)
     ===================================================================== */
  function buildApolloLM() {
    const g = new T.Group();
    const P = adder(g);

    P("descent", cyl(1.3, 1.3, 1.0, M.gold(), 0, 1.45, 0, 8), cyl(1.32, 1.32, 0.12, M.blackFoil(), 0, 0.98, 0, 8),
      cyl(1.32, 1.32, 0.06, M.blackFoil(), 0, 1.93, 0, 8), box(0.7, 0.06, 0.5, M.gold(), 0, 1.98, 1.15));

    // Four legs on the four faces (front leg under the hatch has the ladder)
    const legs = P("legs"), pads = P("footpads"), probes = P("probes");
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const c = Math.cos(a), s = Math.sin(a);
      legs.add(rod([c * 1.15, 1.75, s * 1.15], [c * 2.25, 0.2, s * 2.25], 0.08, M.gold()));
      legs.add(rod([c * 1.3, 1.0, s * 1.3], [c * 2.0, 0.5, s * 2.0], 0.05, M.alu()));
      legs.add(rod([(c - s * 0.55) * 1.2, 1.0, (s + c * 0.55) * 1.2], [c * 1.95, 0.48, s * 1.95], 0.03, M.alu()));
      legs.add(rod([(c + s * 0.55) * 1.2, 1.0, (s - c * 0.55) * 1.2], [c * 1.95, 0.48, s * 1.95], 0.03, M.alu()));
      pads.add(cyl(0.3, 0.36, 0.1, M.alu(), c * 2.25, 0.09, s * 2.25, 24));
      if (i !== 1) probes.add(rod([c * 2.25, 0.06, s * 2.25], [c * 2.35, -0.6, s * 2.35], 0.014, M.alu()));
    }
    // Ladder on the front leg + the porch under the hatch
    const lad = P("ladder", box(0.75, 0.04, 0.4, M.alu(), 0, 1.97, 1.45));
    [-0.25, 0.25].forEach((x) => lad.add(rod([x, 1.92, 1.6], [x, 0.4, 2.15], 0.025, M.alu())));
    for (let k = 1; k <= 8; k++) {
      const t = k / 9;
      lad.add(rod([-0.25, 1.92 - 1.52 * t, 1.6 + 0.55 * t], [0.25, 1.92 - 1.52 * t, 1.6 + 0.55 * t], 0.015, M.alu()));
    }

    P("de", mesh(new T.CylinderGeometry(0.18, 0.52, 0.75, 32, 1, true), M.bell(), 0, 0.58, 0), cyl(0.22, 0.22, 0.12, M.alu(), 0, 0.98, 0, 20));
    const tanks = P("dtanks");
    [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].forEach(([x, z]) => tanks.add(sphere(0.42, M.silverFoil(), x, 1.82, z)));
    P("mesa", box(0.75, 0.6, 0.08, M.silverFoil(), 0.95, 1.42, 0.95).rotateY(-Math.PI / 4), box(0.7, 0.05, 0.1, M.dark(), 0.97, 1.74, 0.97).rotateY(-Math.PI / 4));
    P("easep", box(0.5, 0.4, 0.4, M.gold(), -0.98, 1.3, 0.98).rotateY(Math.PI / 4), box(0.35, 0.28, 0.3, M.paint(), -1.0, 1.66, 1.0).rotateY(Math.PI / 4));
    P("batteries", box(0.35, 0.5, 0.7, M.carbon(), -1.48, 1.4, -0.2), box(0.05, 0.3, 0.5, M.orange(), -1.67, 1.4, -0.2));
    P("landingradar", box(0.5, 0.12, 0.4, M.dark(), 0.65, 0.88, -0.6), box(0.4, 0.02, 0.3, M.alu(), 0.65, 0.81, -0.6));

    // Ascent stage (crew cabin), raised a little so the ascent engine shows between the stages
    const Y = 0.13;
    const asc = P("ascent");
    const cabin = cyl(0.95, 0.95, 1.15, M.silverFoil(), 0, 2.62 + Y, 0, 8);
    cabin.scale.z = 0.85;
    asc.add(cabin, box(1.0, 0.95, 0.12, M.dark(), 0, 2.7 + Y, 0.78), box(1.1, 0.75, 0.6, M.silverFoil(), 0, 2.55 + Y, -0.8));
    P("ae", mesh(new T.CylinderGeometry(0.12, 0.3, 0.3, 24, 1, true), M.bell(), 0, 2.08, 0));
    const win = P("windows");
    [-1, 1].forEach((s) => {
      const tri = new T.Shape();
      tri.moveTo(0, 0); tri.lineTo(0.32 * s, 0); tri.lineTo(0, 0.28); tri.closePath();
      const w = mesh(new T.ShapeGeometry(tri), M.lens(), s * 0.06, 2.82 + Y, 0.85);
      w.material.side = T.DoubleSide;
      win.add(w);
    });
    P("hatch", box(0.34, 0.42, 0.06, M.black(), 0, 2.42 + Y, 0.86), box(0.06, 0.06, 0.04, M.alu(), 0.12, 2.42 + Y, 0.9));
    P("dock", cyl(0.3, 0.32, 0.32, M.dark(), 0, 3.32 + Y, 0, 20), cyl(0.33, 0.33, 0.05, M.alu(), 0, 3.5 + Y, 0, 20),
      mesh(new T.CylinderGeometry(0.06, 0.22, 0.14, 20, 1, true), M.dark(), 0, 3.56 + Y, 0));
    const rcs = P("rcs");
    [[0.85, 0.55], [-0.85, 0.55], [0.85, -0.55], [-0.85, -0.55]].forEach(([x, z]) => {
      rcs.add(box(0.14, 0.14, 0.14, M.dark(), x, 2.95 + Y, z));
      [[0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]].forEach(([dx, dy]) =>
        rcs.add(cyl(0.025, 0.04, 0.08, M.bell(), x + dx, 2.95 + Y + dy, z, 8).rotateZ(dx ? Math.PI / 2 : 0)));
    });
    P("radar", rod([0.55, 3.15 + Y, -0.35], [0.95, 3.6 + Y, -0.55], 0.02, M.alu()), cyl(0.2, 0.05, 0.08, M.paint(), 0.98, 3.65 + Y, -0.57, 16));
    const sb = cyl(0.28, 0.05, 0.08, M.paint(), -0.75, 3.85 + Y, -0.45, 20);
    sb.rotation.x = -0.6;
    P("sband", rod([-0.5, 3.1 + Y, -0.45], [-0.75, 3.8 + Y, -0.45], 0.02, M.alu()), sb);
    return g;
  }

  const BUILDERS = {
    curiosity: () => buildMarsRover(false),
    perseverance: () => buildMarsRover(true),
    jwst: buildWebb,
    hubble: buildHubble,
    "apollo-lm": buildApolloLM,
  };

  window.CraftModels = { build: (id) => BUILDERS[id]() };
})();
