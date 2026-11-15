/* =====================================================================
   Space Mission Cube — detailed launch vehicles for the launch movie
   ---------------------------------------------------------------------
   Each rocket is built from its real dimensions (in metres, then scaled
   down) and real colours, split into the pieces that come apart in
   flight: boosters, first stage, upper stage, payload fairing halves
   (or Apollo's launch escape tower) and the payload itself.

     Atlas V 401 / 541   orange-tan first stage (spray-on foam insulation),
                         Centaur upper stage, 4 m or 5 m fairing;
                         541 = 5 m fairing, 4 solid boosters, 1 Centaur engine
     Delta IV Heavy      three orange foam-covered cores side by side
     Ariane 5 ECA        white core stage + two big solid boosters
     Medium-lift         a generic two-stage medium rocket
     Super-heavy         a stainless-steel future design
     Saturn V            S-IC with its black-and-white roll pattern,
                         5 F-1 engines, fins, S-II, S-IVB, the Apollo
                         spacecraft and the launch escape tower

   Exhaust types (they really look different):
     kerosene  bright orange, sooty      (Atlas V RD-180, Saturn V F-1)
     hydrogen  faint, almost see-through (Delta IV RS-68, Ariane Vulcain, upper stages)
     solid     dazzling white-yellow with thick smoke (solid boosters)
     methane   bright blue-ish orange    (the super-heavy design)
   ===================================================================== */

(function () {
  const T = THREE;
  const K = 0.17; // metres → scene units

  /* ---------- Canvas textures (painted once, cached) ---------- */
  const cache = {};
  function canvasTex(key, w, h, draw, repeat) {
    if (!cache[key]) {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      draw(c.getContext("2d"), w, h);
      cache[key] = c;
    }
    const t = new T.CanvasTexture(cache[key]);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
  }
  const noise = (g, w, h, n, alpha, light) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(${light ? "255,255,255" : "0,0,0"},${Math.random() * alpha})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 10, 1 + Math.random() * 3);
    }
  };
  const flag = (g, x, y, w, h) => { // simple US flag decal
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? "#ffffff" : "#b22234"; g.fillRect(x, y + (i * h) / 13, w, h / 13 + 0.5); }
    g.fillStyle = "#3c3b6e";
    g.fillRect(x, y, w * 0.4, h * (7 / 13));
  };
  const vText = (g, txt, x, y, size, color) => { // vertical lettering
    g.save(); g.translate(x, y); g.rotate(-Math.PI / 2);
    g.fillStyle = color; g.font = `bold ${size}px Arial, sans-serif`; g.textBaseline = "middle"; g.fillText(txt, 0, 0);
    g.restore();
  };
  /* Atlas / Delta foam: orange-tan with mottling and panel seams */
  const foam = (tone) => canvasTex("foam-" + tone, 512, 1024, (g, w, h) => {
    g.fillStyle = tone === "delta" ? "#d9762b" : "#c98a4b";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = Math.random();
      g.fillStyle = v > 0.5 ? "rgba(255,220,170,0.08)" : "rgba(90,40,10,0.08)";
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 9, 0, 7); g.fill();
    }
    g.strokeStyle = "rgba(70,30,8,0.25)"; g.lineWidth = 2;
    for (let y = 0; y < h; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    flag(g, w * 0.72, h * 0.08, 70, 40);
  });
  const white = (key, extra) => canvasTex("white-" + key, 512, 1024, (g, w, h) => {
    g.fillStyle = "#eef0f2"; g.fillRect(0, 0, w, h);
    noise(g, w, h, 900, 0.035, false);
    g.strokeStyle = "rgba(0,0,0,0.12)"; g.lineWidth = 2;
    for (let y = 64; y < h; y += 160) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    if (extra) extra(g, w, h);
  });
  /* Saturn V first stage: black-and-white roll pattern, "UNITED STATES", flag */
  const saturnSIC = () => white("sic", (g, w, h) => {
    g.fillStyle = "#111";
    // the lower part alternates black and white in quarters; a black band runs round the top
    for (let q = 0; q < 4; q++) if (q % 2 === 0) g.fillRect((q * w) / 4, h * 0.72, w / 4, h * 0.28);
    g.fillRect(0, 0, w, h * 0.03);
    for (let q = 0; q < 4; q++) if (q % 2 === 1) g.fillRect((q * w) / 4, h * 0.03, w / 4, h * 0.08);
    vText(g, "UNITED STATES", w * 0.62, h * 0.62, 34, "#111");
    flag(g, w * 0.56, h * 0.16, 60, 34);
  });
  const saturnSII = () => white("sii", (g, w, h) => { g.fillStyle = "#111"; g.fillRect(0, 0, w, h * 0.06); });
  const saturnSIVB = () => white("sivb", (g, w, h) => {
    g.fillStyle = "#111";
    for (let q = 0; q < 4; q++) if (q % 2 === 0) g.fillRect((q * w) / 4, h * 0.0, w / 4, h * 0.3);
  });
  const steel = () => canvasTex("steel", 512, 1024, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, "#9aa0a8"); gr.addColorStop(0.5, "#d9dde2"); gr.addColorStop(1, "#9aa0a8");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(60,60,70,0.35)"; g.lineWidth = 2;
    for (let y = 0; y < h; y += 42) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } // weld rings
    noise(g, w, h, 1400, 0.06, true);
  });

  /* ---------- Materials ---------- */
  const std = (o) => new T.MeshStandardMaterial(Object.assign({ metalness: 0.15, roughness: 0.55 }, o));
  const MAT = {
    foam: () => std({ map: foam("atlas"), roughness: 0.85 }),
    foamDelta: () => std({ map: foam("delta"), roughness: 0.85 }),
    white: (k) => std({ map: white(k || "plain"), roughness: 0.45 }),
    sic: () => std({ map: saturnSIC(), roughness: 0.45 }),
    sii: () => std({ map: saturnSII(), roughness: 0.45 }),
    sivb: () => std({ map: saturnSIVB(), roughness: 0.45 }),
    steel: () => std({ map: steel(), metalness: 0.9, roughness: 0.28, envMapIntensity: 1.3 }),
    black: () => std({ color: 0x15171c, roughness: 0.6 }),
    silver: () => std({ color: 0xc9ced6, metalness: 0.85, roughness: 0.3 }),
    bell: () => std({ color: 0x2a2d33, metalness: 0.85, roughness: 0.35, side: T.DoubleSide, emissive: 0x000000 }),
    copperBell: () => std({ color: 0x7a4a2a, metalness: 0.8, roughness: 0.4, side: T.DoubleSide, emissive: 0x000000 }),
    red: () => std({ color: 0xc23b2a, roughness: 0.5 }),
  };

  /* ---------- Shape helpers (all sizes in metres) ---------- */
  const mesh = (geo, mat) => new T.Mesh(geo, mat);
  function tube(rBottom, rTop, h, y, mat, seg = 48) {
    const m = mesh(new T.CylinderGeometry(rTop, rBottom, h, seg, 1, false), mat);
    m.position.y = y + h / 2;
    return m;
  }
  function band(r, y, h, mat) { return tube(r * 1.006, r * 1.006, h, y, mat || MAT.black()); }
  /* An ogive nose / fairing profile turned around the axis (phi lets us make half shells) */
  function ogive(r, h, y, mat, phiStart = 0, phiLen = Math.PI * 2, cyl = 0) {
    const pts = [];
    if (cyl > 0) { pts.push(new T.Vector2(r, 0)); }
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(new T.Vector2(Math.max(0.001, r * Math.pow(Math.cos((t * Math.PI) / 2), 0.75)), cyl + t * h));
    }
    const m = mesh(new T.LatheGeometry(pts, 48, phiStart, phiLen), mat);
    m.position.y = y;
    return m;
  }
  /* A rocket engine bell (parabolic nozzle). Returns a group whose origin is the nozzle exit. */
  function bell(exitR, len, mat) {
    const g = new T.Group();
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(new T.Vector2(exitR * (0.32 + 0.68 * Math.pow(1 - t, 0.55)), t * len));
    }
    const nozzle = mesh(new T.LatheGeometry(pts, 32), mat || MAT.bell());
    g.add(nozzle);
    const pump = mesh(new T.CylinderGeometry(exitR * 0.35, exitR * 0.35, len * 0.35, 16), MAT.silver());
    pump.position.y = len * 1.12;
    g.add(pump);
    g.userData.nozzle = nozzle;
    return g;
  }
  function engineCluster(n, exitR, len, spread, y, mat) {
    const g = new T.Group();
    const bells = [];
    for (let i = 0; i < n; i++) {
      const center = n === 5 && i === 4;
      const a = (i / (n === 5 ? 4 : n)) * Math.PI * 2 + Math.PI / 4;
      const b = bell(exitR, len, mat);
      b.position.set(n === 1 || center ? 0 : Math.cos(a) * spread, y - len, n === 1 || center ? 0 : Math.sin(a) * spread);
      g.add(b);
      bells.push(b);
    }
    g.userData.bells = bells;
    return g;
  }
  function fin(r, y, h, w, angle, mat) {
    const s = new T.Shape();
    s.moveTo(0, 0); s.lineTo(w, -h * 0.15); s.lineTo(w, h * 0.55); s.lineTo(0, h);
    const geo = new T.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: false });
    geo.translate(0, 0, -0.175);
    const m = mesh(geo, mat);
    m.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
    m.rotation.y = -angle;
    return m;
  }

  /* ---------- Payloads (what rides on top) ---------- */
  /* Curiosity/Perseverance travelled inside an aeroshell: a cone-shaped
     backshell on top of a heat shield. Webb rode folded up. */
  function aeroshell(r) {
    const g = new T.Group();
    const back = mesh(new T.CylinderGeometry(r * 0.32, r, r * 0.9, 40, 1, false), std({ color: 0xe8e8e4, roughness: 0.6 }));
    back.position.y = r * 0.55;
    const shield = mesh(new T.SphereGeometry(r * 1.02, 40, 12, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), std({ color: 0x5a3a28, roughness: 0.85 }));
    shield.position.y = r * 0.95;
    shield.rotation.x = Math.PI;
    const cruise = mesh(new T.CylinderGeometry(r * 0.95, r * 0.95, r * 0.18, 40), std({ color: 0x23324a, metalness: 0.4, roughness: 0.4 }));
    cruise.position.y = r * 1.08;
    g.add(back, shield, cruise);
    return g;
  }
  function payloadFor(missionId, parts, fitR) {
    let p;
    if (missionId === "mars-rover") p = aeroshell(fitR * 0.92);
    else if (missionId === "deep-space-telescope" && window.Models) {
      p = Models.buildCraft(missionId, parts);
      Models.setTelescopeDeploy(p, { solar: 0, shield: 0, secondary: 0, wings: 0 });  // folded for launch
      const b = new T.Box3().setFromObject(p), s = b.getSize(new T.Vector3());
      const k = (fitR * 1.7) / Math.max(s.x, s.z);
      p.scale.setScalar(k);
      p.position.y = -b.min.y * k;
    } else p = new T.Group();
    return p;
  }

  /* =====================================================================
     The vehicles
     Each returns pieces with positions measured up from the bottom (y = 0).
     ===================================================================== */
  function build(type, missionId, parts) {
    const R = { stages: [], boosters: [], fairing: null, les: null, payload: null, type };
    const stage = (group, nozzleY, exhaust, plumeR, name) => { group.userData = { nozzleY, exhaust, plumeR, name }; R.stages.push(group); return group; };

    if (type === "saturnv") {
      // S-IC: 10.1 m wide, 42 m tall, five F-1 engines, four fins with engine fairings
      const s1 = new T.Group();
      s1.add(tube(5.05, 5.05, 42, 0, MAT.sic()));
      s1.add(engineCluster(5, 1.85, 5.8, 3.0, 0.4, MAT.bell()));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const shroud = ogive(1.4, 6, 0.2, MAT.white("plain"));
        shroud.rotation.x = 0;
        shroud.position.set(Math.cos(a) * 4.5, -1.2, Math.sin(a) * 4.5);
        s1.add(shroud);
        s1.add(fin(5.4, -1.4, 6.5, 3.4, a, MAT.white("plain")));
      }
      stage(s1, -5.4, "kerosene", 7.5, "S-IC");
      // S-II: 24.9 m, five J-2 engines (hidden under the interstage)
      const s2 = new T.Group();
      s2.add(tube(5.05, 5.05, 5.6, 42, MAT.white("plain")));          // interstage
      s2.add(tube(5.05, 5.05, 24.9, 47.6, MAT.sii()));
      s2.add(engineCluster(5, 1.0, 3.4, 2.1, 47.6, MAT.bell()));
      // S-IVB, Instrument Unit, spacecraft adapter, Apollo CSM
      s2.add(tube(5.05, 3.3, 5.2, 72.5, MAT.white("plain")));          // S-II/S-IVB interstage taper
      s2.add(tube(3.3, 3.3, 17.8, 77.7, MAT.sivb()));
      s2.add(band(3.3, 95.5, 0.9, MAT.silver()));                       // Instrument Unit
      s2.add(tube(3.3, 1.95, 8.5, 96.4, MAT.silver()));                 // SLA (the Lunar Module is inside)
      s2.add(tube(1.95, 1.95, 3.9, 104.9, MAT.silver()));               // Service Module
      s2.add(ogive(1.95, 3.3, 108.8, MAT.white("plain")));              // Command Module + boost cover
      stage(s2, 47.6 - 3.4, "hydrogen", 3, "S-II");
      // Launch escape tower: a lattice with a rocket motor, jettisoned after the second stage lights
      const les = new T.Group();
      const lm = MAT.red();
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => {
        const rod = mesh(new T.CylinderGeometry(0.08, 0.08, 3.4, 6), lm);
        rod.position.set(a * 0.55, 113.6, b * 0.55);
        rod.rotation.z = -a * 0.12; rod.rotation.x = b * 0.12;
        les.add(rod);
      });
      les.add(tube(0.33, 0.33, 4.6, 115.2, MAT.white("plain")), ogive(0.33, 1.4, 119.8, lm));
      R.les = les;
      s2.add(les);
      R.height = 121; R.radius = 5.05; R.sepY = [42];
      return finish(R);
    }

    if (type === "a401" || type === "a541") {
      const s1 = new T.Group();
      s1.add(tube(1.905, 1.905, 32.5, 0, MAT.foam()));
      s1.add(band(1.905, 31.5, 1.0, MAT.white("plain")));
      s1.add(engineCluster(2, 0.75, 2.6, 0.75, 0.2, MAT.bell()));     // RD-180: one engine, two nozzles
      stage(s1, -2.4, "kerosene", 2.2, "Atlas booster");
      if (type === "a541") {
        for (let i = 0; i < 4; i++) {     // 4 solid rocket boosters
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const b = new T.Group();
          b.add(tube(0.79, 0.79, 17, 0.6, MAT.white("srb")), ogive(0.79, 2.4, 17.6, MAT.white("srb")));
          const bb = bell(0.55, 1.6, MAT.bell());
          bb.position.y = -1.0;
          b.add(bb);
          b.position.set(Math.cos(a) * 2.75, 0, Math.sin(a) * 2.75);
          b.userData = { nozzleY: -1.0, exhaust: "solid", plumeR: 1.2 };
          R.boosters.push(b);
        }
      }
      const s2 = new T.Group();
      const wide = type === "a541";
      // Centaur upper stage with its RL10 engine
      s2.add(tube(1.905, 1.905, wide ? 4 : 3.2, 32.5, MAT.white("plain")));       // interstage / boattail
      s2.add(tube(1.525, 1.525, 12.7, 35.5, MAT.silver()));
      const rl10 = bell(0.6, 2.2, MAT.copperBell());
      rl10.position.y = 33.0;
      s2.add(rl10);
      stage(s2, 33.0, "hydrogen", 0.8, "Centaur");
      // payload fairing (4 m or 5 m) in two halves
      const fr = wide ? 2.7 : 2.1, fy = wide ? 34.5 : 46.2, fcyl = wide ? 14 : 6, fh = wide ? 7.5 : 5.6;
      R.fairing = fairingHalves(fr, fcyl, fh, fy);
      R.payloadY = wide ? 47 : 47.2; R.payloadR = fr * 0.8;
      R.height = fy + fcyl + fh; R.radius = wide ? 3.4 : 2.1; R.sepY = [32.5];
      R.stages[1].add(R.fairing.left, R.fairing.right);
      return finish(R, missionId, parts);
    }

    if (type === "d4h") {
      const s1 = new T.Group();
      s1.add(tube(2.55, 2.55, 40.8, 0, MAT.foamDelta()));
      const rs = bell(1.2, 3.2, MAT.bell()); rs.position.y = -3.0; s1.add(rs);
      stage(s1, -3.0, "hydrogen", 2.6, "Delta core");
      [-1, 1].forEach((side) => {     // two side boosters (identical cores with nose cones)
        const b = new T.Group();
        b.add(tube(2.55, 2.55, 40.8, 0, MAT.foamDelta()), ogive(2.55, 4.5, 40.8, MAT.foamDelta()));
        const bb = bell(1.2, 3.2, MAT.bell()); bb.position.y = -3.0; b.add(bb);
        b.position.x = side * 5.15;
        b.userData = { nozzleY: -3.0, exhaust: "hydrogen", plumeR: 2.6 };
        R.boosters.push(b);
      });
      const s2 = new T.Group();
      s2.add(tube(2.55, 2.0, 4, 40.8, MAT.white("plain")), tube(2.0, 2.0, 8.5, 44.8, MAT.white("plain")));
      const rl = bell(0.9, 2.6, MAT.copperBell()); rl.position.y = 42.2; s2.add(rl);
      stage(s2, 42.2, "hydrogen", 1, "Delta upper stage");
      R.fairing = fairingHalves(2.55, 12, 7, 53.3);
      R.payloadY = 55; R.payloadR = 2.1;
      R.height = 72.3; R.radius = 7.7; R.sepY = [40.8];
      R.stages[1].add(R.fairing.left, R.fairing.right);
      return finish(R, missionId, parts);
    }

    if (type === "ariane5") {
      const s1 = new T.Group();
      s1.add(tube(2.7, 2.7, 30.5, 0, MAT.white("ariane")));
      const v2 = bell(1.05, 3.0, MAT.bell()); v2.position.y = -2.8; s1.add(v2);
      stage(s1, -2.8, "hydrogen", 2.2, "Ariane core");
      [-1, 1].forEach((side) => {
        const b = new T.Group();
        b.add(tube(1.525, 1.525, 27.5, 0.8, MAT.white("srb")), ogive(1.525, 3.8, 28.3, MAT.white("srb")));
        const bb = bell(1.25, 2.6, MAT.bell()); bb.position.y = -1.8; b.add(bb);
        b.position.x = side * 4.4;
        b.userData = { nozzleY: -1.8, exhaust: "solid", plumeR: 2.4 };
        R.boosters.push(b);
      });
      const s2 = new T.Group();
      s2.add(tube(2.7, 2.7, 4.7, 30.5, MAT.white("plain")));
      const hm = bell(0.5, 1.6, MAT.copperBell()); hm.position.y = 29.3; s2.add(hm);
      stage(s2, 29.3, "hydrogen", 0.6, "Ariane upper stage");
      R.fairing = fairingHalves(2.7, 10, 7, 35.2);
      R.payloadY = 36.5; R.payloadR = 2.2;
      R.height = 52.2; R.radius = 5.9; R.sepY = [30.5];
      R.stages[1].add(R.fairing.left, R.fairing.right);
      return finish(R, missionId, parts);
    }

    if (type === "superheavy") {
      const s1 = new T.Group();
      s1.add(tube(4.5, 4.5, 71, 0, MAT.steel()));
      s1.add(engineCluster(1, 1.1, 2.4, 0, 0.2, MAT.bell()));
      for (let i = 0; i < 4; i++) {                                     // grid fins
        const a = (i / 4) * Math.PI * 2;
        const gf = mesh(new T.BoxGeometry(0.3, 3.2, 4.2), MAT.black());
        gf.position.set(Math.cos(a) * 5, 67, Math.sin(a) * 5);
        gf.rotation.y = -a;
        s1.add(gf);
      }
      stage(s1, -2.2, "methane", 6, "Booster");
      const s2 = new T.Group();
      s2.add(tube(4.5, 4.5, 33, 71, MAT.steel()));
      [[1, 74], [-1, 74], [1, 96], [-1, 96]].forEach(([s, y]) => {      // flaps
        const fl = mesh(new T.BoxGeometry(0.25, y > 80 ? 6 : 9, 3.5), MAT.black());
        fl.position.set(s * 4.7, y + 3, 0);
        s2.add(fl);
      });
      const rv = bell(0.9, 2.4, MAT.bell()); rv.position.y = 69.5; s2.add(rv);
      stage(s2, 69.5, "methane", 1.6, "Ship");
      R.fairing = fairingHalves(4.5, 0.01, 17, 104);
      R.payloadY = 104.5; R.payloadR = 3.2;
      R.height = 121; R.radius = 4.5; R.sepY = [71];
      R.stages[1].add(R.fairing.left, R.fairing.right);
      return finish(R, missionId, parts);
    }

    // "medium": a generic two-stage medium-lift rocket (4 m fairing)
    const s1 = new T.Group();
    s1.add(tube(1.85, 1.85, 42, 0, MAT.white("plain")));
    s1.add(engineCluster(1, 1.3, 2.4, 0, 0.2, MAT.bell()));
    stage(s1, -2.2, "kerosene", 2.2, "First stage");
    const s2 = new T.Group();
    s2.add(tube(1.85, 1.85, 4.5, 42, MAT.black()), tube(1.85, 1.85, 9, 46.5, MAT.white("plain")));
    const m2 = bell(0.9, 2.6, MAT.bell()); m2.position.y = 41.6; s2.add(m2);
    stage(s2, 41.6, "kerosene", 0.9, "Second stage");
    R.fairing = fairingHalves(2.6, 7, 6, 55.5);
    R.payloadY = 56.5; R.payloadR = 2.1;
    R.height = 68.5; R.radius = 2.6; R.sepY = [42];
    R.stages[1].add(R.fairing.left, R.fairing.right);
    return finish(R, missionId, parts);
  }

  /* Two fairing halves, each on a hinge at its base so it can swing away */
  function fairingHalves(r, cylH, noseH, y) {
    const half = (phi, dir) => {
      const pivot = new T.Group();
      pivot.position.set(0, y, 0);
      const shell = ogive(r, noseH, 0, std({ map: white("fairing"), roughness: 0.4, side: T.DoubleSide }), phi, Math.PI, cylH);
      shell.position.y = 0;
      pivot.add(shell);
      pivot.userData.dir = dir;
      return pivot;
    };
    return { left: half(0, 1), right: half(Math.PI, -1), r, y, h: cylH + noseH };
  }

  function finish(R, missionId, parts) {
    // payload inside the fairing (hidden until the fairing opens)
    if (R.fairing && missionId) {
      R.payload = payloadFor(missionId, parts, R.payloadR || 2);
      R.payload.position.y += R.payloadY || R.fairing.y + 0.5;
      R.stages[1].add(R.payload);
    }
    // boosters ride on the first stage (positions in metres) until they separate
    R.boosters.forEach((b) => R.stages[0].add(b));
    R.stages.forEach((g) => {
      g.scale.setScalar(K);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    });
    R.K = K;
    R.heightW = R.height * K;
    R.radiusW = R.radius * K;
    return R;
  }

  window.LaunchVehicles = { build, K };
})();
