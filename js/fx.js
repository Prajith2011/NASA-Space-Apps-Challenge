/* =====================================================================
   Space Mission Cube — cinematic graphics toolkit (FX)
   ---------------------------------------------------------------------
   Shared by the Hangar inspector and the workshop 3D view.

   1. POST-PROCESSING  (createComposer)
        HDR render with 4× MSAA → selection outlines → bloom (bright things
        glow) → film grade: ACES tone mapping, gentle vignette, film grain
        and a hint of lens colour fringing.
   2. ENVIRONMENTS     (buildEnvironment)
        "mars"   Mars surface: butterscotch sky, dusty haze, rolling hills,
                 a crater rim on the horizon, rocks and drifting dust
        "moon"   Moon surface: black sky, craters, rocks, Earth in the sky
        "l2"     Deep space far from Earth: Milky Way and a blazing Sun
        "orbit"  Low Earth orbit: Earth below with clouds + atmosphere glow
        "studio" Light theme: a bright clean-room assembly hall
   Everything is generated in code (no image files to download).
   ===================================================================== */

(function () {
  const T = THREE;

  /* =====================================================================
     NOISE (seeded value noise + fractal "fbm" layers)
     ===================================================================== */
  function hash(x, y, z, seed) {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n & 0xffff) / 0xffff;
  }
  function noise3(x, y, z, seed = 1) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const l = (a, b, t) => a + (b - a) * t;
    const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz, seed);
    return l(
      l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
      l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
  }
  function fbm(x, y, z, oct = 5, seed = 1) {
    let a = 0.5, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * noise3(x * f, y * f, z * f, seed + i * 31);
      n += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / n;
  }
  const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

  /* Run a function for every pixel of an equirectangular (world-map style) image */
  function sphereCanvas(w, h, pixel) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    const img = g.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      const lat = Math.PI / 2 - ((y + 0.5) / h) * Math.PI;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      for (let x = 0; x < w; x++) {
        const lon = ((x + 0.5) / w) * Math.PI * 2;
        const rgb = pixel(cl * Math.cos(lon), sl, cl * Math.sin(lon), lat);
        const i = (y * w + x) * 4;
        d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = rgb[3] == null ? 255 : rgb[3];
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  const canvases = {};
  const once = (key, make) => canvases[key] || (canvases[key] = make());
  function tex(canvas, srgb = true) {
    const t = new T.CanvasTexture(canvas);
    if (srgb) t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }

  /* =====================================================================
     PROCEDURAL SKIES AND PLANETS
     ===================================================================== */
  /* The Milky Way: a glowing band with dark dust lanes, a bright core,
     faint nebulae and ~14,000 stars of different colours */
  function milkyWayCanvas() {
    return once("milkyway", () => {
      const n = new T.Vector3(0.28, 0.86, 0.42).normalize();          // galactic "north"
      const gc = new T.Vector3(1, 0, -0.33).projectOnPlane(n).normalize(); // galactic centre
      const small = sphereCanvas(1024, 512, (x, y, z) => {
        const dn = x * n.x + y * n.y + z * n.z;
        const core = Math.exp(-(1 - (x * gc.x + y * gc.y + z * gc.z)) * 2.2);
        const f = fbm(x * 3.5 + 9, y * 3.5, z * 3.5, 5, 3);
        const f2 = fbm(x * 8 + 2, y * 8, z * 8, 4, 7);
        let glow = Math.exp((-dn * dn) / (0.02 + core * 0.03)) * (0.2 + f * 1.0) * (0.4 + core * 0.8);
        glow *= 1 - Math.exp((-dn * dn) / 0.003) * smooth(0.42, 0.66, f2) * 0.85; // dust lanes
        const neb = Math.max(0, fbm(x * 2 + 5, y * 2, z * 2, 4, 11) - 0.55) * 1.8;
        const warm = Math.min(1, core * 1.4);
        const r = glow * (0.55 + 0.45 * warm) + neb * 0.35 + 0.012;
        const gg = glow * (0.6 + 0.25 * warm) + neb * 0.08 + 0.014;
        const b = glow * (0.85 - 0.3 * warm) + neb * 0.22 + 0.03;
        const k = 105;
        return [Math.min(255, r * k), Math.min(255, gg * k), Math.min(255, b * k)];
      });
      const c = document.createElement("canvas");
      c.width = 2048; c.height = 1024;
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(small, 0, 0, 2048, 1024);
      const r = rng(42);
      const tints = ["#ffffff", "#cfe0ff", "#ffe9c8", "#fff6e0", "#bcd2ff", "#ffd0a8"];
      for (let i = 0; i < 14000; i++) {
        const x = r() * 2048, y = r() * 1024;
        // more stars near the galactic band
        const lat = Math.PI / 2 - (y / 1024) * Math.PI, lon = (x / 2048) * Math.PI * 2;
        const dir = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
        const dn = dir[0] * n.x + dir[1] * n.y + dir[2] * n.z;
        if (r() > 0.35 + 0.65 * Math.exp((-dn * dn) / 0.06)) continue;
        const b = Math.pow(r(), 5);
        g.globalAlpha = 0.25 + b * 0.75;
        g.fillStyle = tints[(r() * tints.length) | 0];
        const s = b > 0.6 ? 2 : b > 0.15 ? 1.4 : 1;
        g.fillRect(x, y, s, s);
        if (b > 0.75) { // the brightest stars get a soft halo
          const grad = g.createRadialGradient(x + 1, y + 1, 0, x + 1, y + 1, 7);
          grad.addColorStop(0, "rgba(255,255,255,0.5)");
          grad.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = grad;
          g.fillRect(x - 7, y - 7, 16, 16);
        }
      }
      g.globalAlpha = 1;
      return c;
    });
  }

  /* Earth: oceans, continents, deserts, forests, ice caps (+ a separate cloud layer) */
  function earthCanvas() {
    return once("earth", () => sphereCanvas(1024, 512, (x, y, z, lat) => {
      const c = fbm(x * 1.6 + 4, y * 1.6, z * 1.6, 6, 21);
      const al = Math.abs(lat);
      // polar ice with a ragged, soft edge
      const ice = smooth(1.1, 1.24, al + (fbm(x * 6, y * 6, z * 6, 3, 5) - 0.5) * 0.18);
      if (ice > 0.98) return [235, 242, 250];
      if (c < 0.52) {
        const d = smooth(0.38, 0.52, c);
        return [8 + 22 * d, 32 + 60 * d, 78 + 80 * d].map((v, i) => v * (1 - ice) + [225, 235, 245][i] * ice);
      }
      const m = fbm(x * 5 + 3, y * 5, z * 5, 4, 9);
      const hgt = fbm(x * 12, y * 12, z * 12, 3, 13);
      let col;
      if (al > 0.2 && al < 0.62 && m < 0.5) col = [196, 164, 112];      // desert
      else if (al > 0.95) col = [120, 128, 104];                          // tundra
      else if (m > 0.55) col = [44, 86, 40];                              // forest
      else col = [96, 128, 62];                                           // grassland
      const k = 0.8 + hgt * 0.45;
      return col.map((v, i) => Math.min(255, v * k * (1 - ice) + [235, 242, 250][i] * ice));
    }));
  }
  function cloudCanvas() {
    return once("clouds", () => sphereCanvas(1024, 512, (x, y, z) => {
      const v = fbm(x * 2.6 + 7, y * 4.5, z * 2.6, 6, 33);
      const a = smooth(0.53, 0.78, v);
      return [255, 255, 255, a * 235];
    }));
  }
  /* Mars sky: darker ochre overhead, glowing butterscotch at the horizon */
  function marsSkyCanvas() {
    return once("marssky", () => {
      const c = document.createElement("canvas");
      c.width = 8; c.height = 512;
      const g = c.getContext("2d");
      const grad = g.createLinearGradient(0, 0, 0, 512);
      [[0, "#3c2a22"], [0.25, "#6e4a35"], [0.42, "#b5835c"], [0.49, "#e2b88f"], [0.5, "#e9c29b"], [1, "#b98a64"]].forEach(([o, col]) => grad.addColorStop(o, col));
      g.fillStyle = grad;
      g.fillRect(0, 0, 8, 512);
      return c;
    });
  }
  function glowCanvas(key, stops, w = 256, h = 256) {
    return once(key, () => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      stops.forEach(([o, col]) => grad.addColorStop(o, col));
      g.fillStyle = grad;
      g.save();
      g.scale(1, h / w);
      g.fillRect(0, 0, w, w);
      g.restore();
      return c;
    });
  }
  const sunGlow = () => glowCanvas("sun", [[0, "rgba(255,255,255,1)"], [0.06, "rgba(255,250,235,1)"], [0.18, "rgba(255,214,150,0.45)"], [0.45, "rgba(255,170,90,0.1)"], [1, "rgba(255,150,80,0)"]]);
  const softDot = () => glowCanvas("dot", [[0, "rgba(255,255,255,1)"], [0.4, "rgba(255,255,255,0.5)"], [1, "rgba(255,255,255,0)"]], 64, 64);
  const streak = () => glowCanvas("streak", [[0, "rgba(255,240,220,0.9)"], [0.3, "rgba(255,210,160,0.25)"], [1, "rgba(255,200,150,0)"]], 512, 32);

  /* Sky dome that always surrounds the camera */
  function skyDome(canvas, brightness = 1) {
    const t = tex(canvas);
    const m = new T.Mesh(new T.SphereGeometry(450, 64, 32), new T.MeshBasicMaterial({ map: t, side: T.BackSide, depthWrite: false, fog: false }));
    m.material.color.setScalar(brightness);
    m.renderOrder = -10;
    return m;
  }

  /* A planet with optional clouds and a glowing atmosphere */
  /* Extra Earth maps: shiny oceans (roughness) and city lights (glow) */
  function earthMaps() {
    return once("earthmaps", () => {
      const src = earthCanvas();
      const w = src.width, h = src.height;
      const d = src.getContext("2d").getImageData(0, 0, w, h).data;
      const mk = () => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
      const rough = mk(), lights = mk();
      const rd = rough.getContext("2d").createImageData(w, h), ld = lights.getContext("2d").createImageData(w, h);
      const r = rng(99);
      for (let i = 0; i < w * h; i++) {
        const R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2];
        const ocean = B > R + 25 && B > G;
        const ice = R > 220 && G > 220;
        const v = ocean ? 45 : 225;
        rd.data.set([v, v, v, 255], i * 4);
        let L = 0;
        if (!ocean && !ice) {
          const x = i % w, y = (i / w) | 0;
          const n = noise3(x * 0.045, y * 0.045, 0.5, 5);
          if (n > 0.6 && r() < 0.5) L = 120 + r() * 135;
          else if (n > 0.52 && r() < 0.08) L = 90;
        }
        ld.data.set([L, L * 0.78, L * 0.45, 255], i * 4);
      }
      rough.getContext("2d").putImageData(rd, 0, 0);
      lights.getContext("2d").putImageData(ld, 0, 0);
      return { rough, lights };
    });
  }

  function planet(radius, opts = {}) {
    const g = new T.Group();
    const sunDir = (opts.sunDir || new T.Vector3(1, 0.4, 0.3)).clone().normalize();
    const isEarth = !opts.canvas;
    const mat = new T.MeshStandardMaterial({ map: tex(opts.canvas || earthCanvas()), roughness: 0.85, metalness: 0, fog: false });
    if (isEarth) {
      const em = earthMaps();
      mat.roughnessMap = tex(em.rough, false);
      mat.roughness = 1;
      mat.emissiveMap = tex(em.lights);
      mat.emissive = new T.Color(0xffc27a);
      mat.emissiveIntensity = 1.6;
      // city lights only on the night side
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.sunDirW = { value: sunDir };
        sh.fragmentShader = "uniform vec3 sunDirW;\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\n vec3 sdv = normalize((viewMatrix * vec4(sunDirW, 0.0)).xyz);\n totalEmissiveRadiance *= smoothstep(0.12, -0.25, dot(normal, sdv));");
      };
    }
    const surf = new T.Mesh(new T.SphereGeometry(radius, 96, 64), mat);
    g.add(surf);
    let clouds = null;
    if (opts.clouds !== false) {
      clouds = new T.Mesh(new T.SphereGeometry(radius * 1.006, 96, 64),
        new T.MeshStandardMaterial({ map: tex(cloudCanvas()), transparent: true, depthWrite: false, roughness: 1, fog: false }));
      g.add(clouds);
    }
    // atmosphere: a soft blue halo around the edge (two shells)
    const glowMat = (side, power, k) => new T.ShaderMaterial({
      uniforms: { color: { value: new T.Color(0x4f9dff) }, power: { value: power }, k: { value: k } },
      vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
      fragmentShader: side === T.BackSide
        ? "uniform vec3 color; uniform float power; uniform float k; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(clamp(-dot(vN, vV) * 2.7, 0.0, 1.0), power); gl_FragColor = vec4(color*f*k, f); }"
        : "uniform vec3 color; uniform float power; uniform float k; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), power); gl_FragColor = vec4(color*f*k, f); }",
      side, blending: T.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
    });
    const inner = new T.Mesh(new T.SphereGeometry(radius * 1.012, 64, 48), glowMat(T.FrontSide, 2.6, 1.6));
    const outer = new T.Mesh(new T.SphereGeometry(radius * 1.07, 64, 48), glowMat(T.BackSide, 2.2, 1.8));
    g.add(inner, outer);
    g.userData.surface = surf;
    g.userData.clouds = clouds;
    return g;
  }

  /* The Sun: an over-bright glow (the bloom makes it blaze) + a lens streak */
  function sun(dir, size = 70) {
    const g = new T.Group();
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex(sunGlow()), blending: T.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    s.material.color.setScalar(4);
    s.scale.set(size, size, 1);
    const st = new T.Sprite(new T.SpriteMaterial({ map: tex(streak()), blending: T.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    st.material.color.setScalar(2.2);
    st.scale.set(size * 4.2, size * 0.18, 1);
    g.add(s, st);
    g.position.copy(dir.clone().normalize().multiplyScalar(400));
    return g;
  }

  /* =====================================================================
     TERRAIN (Mars and Moon)
     ===================================================================== */
  function makeHeight(kind, clear = 4.5) {
    const r = rng(kind === "moon" ? 77 : 19);
    const craters = [];
    if (kind === "moon") {
      craters.push({ x: 15, z: -10, R: 5.5, d: 1.2 }, { x: -22, z: 14, R: 9, d: 2 });
      for (let i = 0; i < 70; i++) {
        const a = r() * Math.PI * 2, rr = 9 + Math.pow(r(), 1.3) * 230, R = 1 + Math.pow(r(), 2.2) * 26;
        craters.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, R, d: R * (0.18 + r() * 0.1) });
      }
    }
    return (x, z) => {
      const rad = Math.hypot(x, z);
      const flat = smooth(clear, clear + 21.5, rad);
      let h = (fbm(x * 0.018, 0.3, z * 0.018, 5, kind === "moon" ? 4 : 2) - 0.5) * 2 * (kind === "moon" ? 6 : 11) * flat * flat;
      h += (fbm(x * 0.22 + 3, 1.7, z * 0.22, 4, 8) - 0.5) * 0.5 * (0.15 + 0.85 * smooth(clear * 0.62, clear * 2, rad));
      if (kind === "mars") h += smooth(110, 230, rad) * 34 * (0.55 + 0.6 * fbm(Math.atan2(z, x) * 3, 0, 0, 4, 6));
      else h += smooth(160, 300, rad) * 16 * fbm(Math.atan2(z, x) * 4, 0, 0, 4, 9);
      for (const c of craters) {
        const d = Math.hypot(x - c.x, z - c.z) / c.R;
        if (d < 1) h -= c.d * (1 - d * d);
        h += c.d * 0.4 * Math.exp(-((d - 1) * (d - 1)) / 0.06);
      }
      return h;
    };
  }

  function terrain(kind, clear = 4.5) {
    const height = makeHeight(kind, clear);
    const N = 220, R = 360;
    const geo = new T.PlaneGeometry(2, 2, N, N);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const cols = new Float32Array(pos.count * 3);
    const warp = (u) => Math.sign(u) * Math.pow(Math.abs(u), 1.9) * R; // finer grid near the spacecraft
    for (let i = 0; i < pos.count; i++) {
      const x = warp(pos.getX(i)), z = warp(pos.getZ(i));
      pos.setXYZ(i, x, height(x, z), z);
      uv.setXY(i, x / 11, z / 11);
      const v = 0.72 + 0.55 * fbm(x * 0.03 + 50, 2, z * 0.03, 4, kind === "moon" ? 15 : 17);
      const mare = kind === "moon" ? 1 - 0.35 * smooth(0.5, 0.65, fbm(x * 0.006, 4, z * 0.006, 3, 2)) : 1;
      cols.set([v * mare, v * mare * (kind === "mars" ? 0.97 : 1), v * mare * (kind === "mars" ? 0.93 : 1)], i * 3);
    }
    geo.setAttribute("color", new T.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const map = Models.groundTexture(kind).clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = T.RepeatWrapping;
    const ground = new T.Mesh(geo, new T.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.025, vertexColors: true, roughness: 0.96, metalness: 0 }));
    ground.receiveShadow = true;

    // Rocks: lumpy, faceted stones (three shapes, many copies each)
    const group = new T.Group();
    group.add(ground);
    const r = rng(kind === "moon" ? 5 : 9);
    const rockMat = new T.MeshStandardMaterial({ color: kind === "mars" ? 0x4a2416 : 0x55555a, roughness: 1, metalness: 0, flatShading: true, envMapIntensity: 0.25 });
    for (let k = 0; k < 3; k++) {
      const g = new T.IcosahedronGeometry(1, 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const s = 0.7 + 0.6 * fbm(x * 1.4 + k * 7, y * 1.4, z * 1.4, 3, 3 + k);
        p.setXYZ(i, x * s, y * s * (0.55 + k * 0.12), z * s);
      }
      g.computeVertexNormals();
      const count = 140;
      const inst = new T.InstancedMesh(g, rockMat, count);
      const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), ps = new T.Vector3();
      for (let i = 0; i < count; i++) {
        const a = r() * Math.PI * 2;
        const big = r() < 0.06;
        const rr = big ? clear + 10 + r() * 60 : clear * 0.76 + Math.pow(r(), 1.7) * 55;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        const s = big ? 0.8 + r() * 1.6 : 0.03 + Math.pow(r(), 3.2) * 0.45;
        ps.set(x, height(x, z) - s * 0.2, z);
        q.setFromEuler(new T.Euler(r() * 0.4, r() * 6.3, r() * 0.4));
        sc.set(s * (0.8 + r() * 0.5), s, s * (0.8 + r() * 0.5));
        inst.setMatrixAt(i, m4.compose(ps, q, sc));
      }
      inst.castShadow = inst.receiveShadow = true;
      group.add(inst);
    }
    return group;
  }

  /* Wind-blown dust specks that catch the sunlight (Mars) */
  function dust() {
    const n = 1400, pos = new Float32Array(n * 3), r = rng(3);
    for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * 50, r() * 7, (r() - 0.5) * 50], i * 3);
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    const pts = new T.Points(geo, new T.PointsMaterial({ map: tex(softDot()), color: 0xf0c9a0, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false }));
    pts.userData.update = (dt) => {
      const p = geo.attributes.position;
      for (let i = 0; i < n; i++) {
        let x = p.getX(i) + dt * (0.9 + (i % 7) * 0.08);
        let y = p.getY(i) + Math.sin(x * 0.7 + i) * dt * 0.12;
        if (x > 25) x -= 50;
        if (y > 7) y = 0; else if (y < 0) y = 7;
        p.setXY(i, x, y);
      }
      p.needsUpdate = true;
    };
    return pts;
  }

  /* A twisting dust devil wandering across the Mars plain */
  function dustDevil(height) {
    const n = 800, pos = new Float32Array(n * 3), r = rng(12);
    const seeds = [];
    for (let i = 0; i < n; i++) seeds.push({ h: r() * 18, a: r() * 6.28, s: 0.6 + r() * 0.8, j: r() });
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    const pts = new T.Points(geo, new T.PointsMaterial({ map: tex(softDot()), color: 0xd6a479, size: 0.55, transparent: true, opacity: 0.4, depthWrite: false }));
    const g = new T.Group();
    g.add(pts);
    g.userData.update = (dt, t) => {
      for (let i = 0; i < n; i++) {
        const sd = seeds[i];
        sd.a += dt * (3.2 - sd.h * 0.1) * sd.s;
        sd.h += dt * 1.6 * sd.s;
        if (sd.h > 18) sd.h = 0;
        const rad = 0.35 + sd.h * sd.h * 0.012 + sd.j * 0.4;
        pos[i * 3] = Math.cos(sd.a) * rad;
        pos[i * 3 + 1] = sd.h;
        pos[i * 3 + 2] = Math.sin(sd.a) * rad;
      }
      geo.attributes.position.needsUpdate = true;
      const x = -30 + Math.sin(t * 0.00004) * 22, z = -48 + Math.cos(t * 0.00003) * 10;
      g.position.set(x, height(x, z), z);
    };
    return g;
  }
  /* Faint specks drifting past in space: gives a sense of depth */
  function spaceDust() {
    const n = 320, pos = new Float32Array(n * 3), r = rng(8);
    for (let i = 0; i < n; i++) {
      const v = new T.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(3 + r() * 14);
      pos.set([v.x, v.y + 2, v.z], i * 3);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: tex(softDot()), color: 0xcfe0ff, size: 0.06, transparent: true, opacity: 0.55, depthWrite: false }));
    p.userData.update = (dt) => { p.rotation.y += dt * 0.012; p.rotation.x += dt * 0.004; };
    return p;
  }
  /* Soft dark "contact shadow" under a spacecraft standing on the ground */
  function contactShadow(w, d) {
    const c = once("ao", () => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 256;
      const g = cv.getContext("2d");
      const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
      grad.addColorStop(0, "rgba(0,0,0,0.75)"); grad.addColorStop(0.55, "rgba(0,0,0,0.35)"); grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      return cv;
    });
    const m = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshBasicMaterial({ map: tex(c, false), transparent: true, depthWrite: false, fog: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    m.renderOrder = 1;
    return m;
  }

  /* =====================================================================
     LENS FLARE: ghost reflections when you look towards the Sun
     ===================================================================== */
  function hexCanvas() {
    return once("hex", () => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 60);
      grad.addColorStop(0, "rgba(255,255,255,0.25)"); grad.addColorStop(0.8, "rgba(255,255,255,0.5)"); grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); }
      g.fill();
      return c;
    });
  }
  function ringCanvas() {
    return once("ring", () => glowCanvas("ringx", [[0, "rgba(255,255,255,0)"], [0.75, "rgba(255,255,255,0)"], [0.86, "rgba(255,255,255,0.6)"], [1, "rgba(255,255,255,0)"]], 128, 128));
  }
  function createFlare() {
    const g = new T.Group();
    const spec = [[0.62, 0.05, hexCanvas, 0xffd9a0], [0.32, 0.03, softDot, 0xa0c8ff], [-0.12, 0.11, ringCanvas, 0xffb070],
      [-0.42, 0.06, hexCanvas, 0x9fffd0], [-0.78, 0.15, hexCanvas, 0xc0a0ff], [-1.15, 0.04, softDot, 0xffffff]];
    spec.forEach(([k, size, c, col]) => {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex(c()), color: col, blending: T.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: 0, fog: false }));
      sp.userData = { k, size };
      sp.renderOrder = 30;
      g.add(sp);
    });
    let vis = 0;
    const v = new T.Vector3(), cam = new T.Vector3();
    g.userData.update = (camera, sunWorld, visibleTarget, dt) => {
      vis += (visibleTarget - vis) * Math.min(1, dt * 6);
      const p = sunWorld.clone().project(camera);
      if (p.z > 1 || Math.abs(p.x) > 1.5 || Math.abs(p.y) > 1.5 || vis < 0.01) { g.visible = false; return; }
      g.visible = true;
      const fade = Math.max(0, 1 - Math.hypot(p.x, p.y) / 1.5) * vis;
      camera.getWorldPosition(cam);
      g.children.forEach((sp) => {
        v.set(p.x * sp.userData.k, p.y * sp.userData.k, 0.5).unproject(camera).sub(cam).normalize();
        sp.position.copy(cam).addScaledVector(v, 6);
        sp.scale.setScalar(sp.userData.size * 6 * (1 + (1 - fade) * 0.3));
        sp.material.opacity = fade * 0.5;
      });
    };
    return g;
  }

  /* =====================================================================
     ENVIRONMENTS
     ===================================================================== */
  function buildEnvironment(kind, opts = {}) {
    const clear = opts.clear || 4.5;
    const world = new T.Group();   // fixed in place (ground, nearby planets)
    const far = new T.Group();     // follows the camera (sky, Sun, distant planets)
    const updates = [];
    const env = {
      world, far, kind, fog: null, background: null, exposure: 1.0,
      sunDir: new T.Vector3(7, 12, 8).normalize(), sunColor: 0xfff4e0, sunIntensity: 2.3,
      hemi: { sky: 0xc8d8ff, ground: 0x1a1a24, intensity: 0.45 }, rim: 0.9, reflect: "space",
      update(dt, t, camera) { far.position.copy(camera.position); updates.forEach((u) => u(dt, t)); },
    };

    if (kind === "mars") {
      far.add(skyDome(marsSkyCanvas()));
      world.add(terrain("mars", clear));
      const devil = dustDevil(makeHeight("mars", clear));
      world.add(devil);
      updates.push((dt, t) => devil.userData.update(dt, t));
      const d = dust();
      world.add(d);
      updates.push((dt) => d.userData.update(dt));
      const sd = new T.Vector3(0.55, 0.62, 0.45);
      const s = sun(sd, 26);
      s.children[0].material.color.setScalar(3);
      s.children[1].visible = false;
      far.add(s);
      Object.assign(env, { fog: new T.FogExp2(0xc9976d, 0.0085), sunDir: sd.normalize(), sunColor: 0xffeedd, sunIntensity: 2.6,
        hemi: { sky: 0xf1c49a, ground: 0x6e3820, intensity: 0.75 }, rim: 0.35, reflect: "mars", exposure: 0.95 });
    } else if (kind === "moon") {
      far.add(skyDome(milkyWayCanvas(), 0.5));
      world.add(terrain("moon", clear));
      const earth = planet(16, { sunDir: new T.Vector3(0.75, 0.42, 0.5) });
      far.add(sun(new T.Vector3(0.75, 0.42, 0.5), 38));
      env.skySun = new T.Vector3(0.75, 0.42, 0.5).normalize();
      earth.position.set(-150, 120, -330);
      earth.rotation.z = 0.4;
      far.add(earth);
      updates.push((dt) => (earth.rotation.y += dt * 0.01));
      const sd = new T.Vector3(0.75, 0.42, 0.5);
      Object.assign(env, { sunDir: sd.normalize(), sunColor: 0xffffff, sunIntensity: 3.3,
        hemi: { sky: 0x9fb0c8, ground: 0x6a6a6a, intensity: 0.16 }, rim: 0.5, reflect: "moon", exposure: 1.0 });
    } else if (kind === "l2" || kind === "orbit") {
      far.add(skyDome(milkyWayCanvas(), 0.7));
      const sd = kind === "l2" ? new T.Vector3(-0.5, -0.35, -0.8) : new T.Vector3(0.75, 0.5, -0.45);
      far.add(sun(sd, kind === "l2" ? 55 : 70));
      env.skySun = sd.clone().normalize();
      const motes = spaceDust();
      world.add(motes);
      updates.push((dt) => motes.userData.update(dt));
      if (kind === "l2") {
        // Earth and Moon: tiny and far away, 1.5 million km from Webb
        const e = planet(2.4, { clouds: false, sunDir: sd });
        e.position.set(140, -60, 380);
        const m = new T.Mesh(new T.SphereGeometry(0.7, 32, 24), new T.MeshStandardMaterial({ color: 0x999999, roughness: 1, fog: false }));
        m.position.set(152, -57, 382);
        far.add(e, m);
        Object.assign(env, { sunDir: new T.Vector3(0.45, 0.85, 0.5).normalize(), sunIntensity: 2.0,
          hemi: { sky: 0xb8c8ff, ground: 0x1a1a2a, intensity: 0.4 }, rim: 1.1, reflect: "space", exposure: 1.05 });
      } else {
        // Hubble's view: Earth filling the bottom of the screen, slowly turning
        const e = planet(70, { sunDir: sd.clone().setY(0.7) });
        e.position.set(0, -76, -12);
        e.rotation.set(0.35, 0, 0.2);
        world.add(e);
        updates.push((dt) => {
          e.userData.surface.rotation.y += dt * 0.006;
          if (e.userData.clouds) e.userData.clouds.rotation.y += dt * 0.009;
        });
        Object.assign(env, { sunDir: sd.clone().setY(0.7).normalize(), sunIntensity: 2.5,
          hemi: { sky: 0x9fb6e0, ground: 0x2f63b8, intensity: 0.6 }, rim: 0.9, reflect: "orbit", exposure: 1.0 });
      }
    } else {
      // studio (light theme): clean-room floor + soft white background
      const floor = new T.Mesh(new T.CircleGeometry(16, 64),
        new T.MeshStandardMaterial({ map: Models.floorTex(), roughness: 0.9, metalness: 0, alphaMap: Models.fadeTex(), transparent: true }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      world.add(floor);
      const c = document.createElement("canvas");
      c.width = 8; c.height = 512;
      const g = c.getContext("2d");
      const grad = g.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, "#f7f9fc"); grad.addColorStop(0.6, "#dde5f0"); grad.addColorStop(1, "#c5d1e0");
      g.fillStyle = grad;
      g.fillRect(0, 0, 8, 512);
      Object.assign(env, { background: tex(c), sunDir: new T.Vector3(7, 12, 8).normalize(), sunIntensity: 2.2,
        hemi: { sky: 0xffffff, ground: 0x8a96a8, intensity: 0.5 }, rim: 0.6, reflect: "studio", exposure: 0.8 });
    }
    return env;
  }

  /* =====================================================================
     POST-PROCESSING
     ===================================================================== */
  const GradeShader = {
    uniforms: {
      tDiffuse: { value: null }, exposure: { value: 1.0 }, time: { value: 0 },
      vignette: { value: 0.35 }, grain: { value: 0.035 }, fringe: { value: 0.006 }, tint: { value: new T.Vector3(1, 1, 1) },
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float exposure, time, vignette, grain, fringe; uniform vec3 tint;
      varying vec2 vUv;
      vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
      vec3 aces(vec3 c){
        const mat3 IN = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
        const mat3 OUT = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
        c *= exposure / 0.6; c = IN*c; c = RRTAndODTFit(c); c = OUT*c; return clamp(c, 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c){ return mix(pow(c, vec3(0.41666))*1.055 - 0.055, c*12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
      float rand(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 d = vUv - 0.5;
        float r2 = dot(d, d);
        vec2 off = d * fringe * r2 * 4.0;
        vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
        col = toSRGB(aces(col)) * tint;
        col *= 1.0 - vignette * smoothstep(0.08, 0.55, r2);
        col += (rand(vUv*917.0 + time) - 0.5) * grain;
        gl_FragColor = vec4(col, 1.0);
      }`,
  };

  function createComposer(renderer, scene, camera) {
    const size = renderer.getSize(new T.Vector2());
    const pr = renderer.getPixelRatio();
    const w = Math.max(1, size.x * pr), h = Math.max(1, size.y * pr);
    const gl2 = renderer.capabilities.isWebGL2;
    const hdr = gl2 && !!renderer.extensions.get("EXT_color_buffer_float");
    const pars = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: hdr ? T.HalfFloatType : T.UnsignedByteType };
    let rt;
    if (gl2 && T.WebGLMultisampleRenderTarget) { rt = new T.WebGLMultisampleRenderTarget(w, h, pars); rt.samples = 4; }
    else rt = new T.WebGLRenderTarget(w, h, pars);
    const composer = new T.EffectComposer(renderer, rt);
    composer.addPass(new T.RenderPass(scene, camera));

    const outline = (color, hidden, strength, pulse) => {
      const p = new T.OutlinePass(new T.Vector2(size.x, size.y), scene, camera);
      p.visibleEdgeColor.set(color);
      p.hiddenEdgeColor.set(hidden);
      p.edgeStrength = strength;
      p.edgeGlow = 0.6;
      p.edgeThickness = 1.4;
      p.pulsePeriod = pulse;
      p.enabled = false;
      composer.addPass(p);
      return p;
    };
    const danger = outline(0xff2848, 0x6a0618, 5, 1.3);
    const hover = outline(0x3ee8ff, 0x0b5d78, 6, 0);
    // Cap how bright anything can be when it feeds the bloom, so very hot
    // sources (flames, the Sun) glow smoothly instead of showing square halos
    const hp = T.LuminosityHighPassShader;
    if (hp && !hp.fragmentShader.includes("min( mix(")) {
      hp.fragmentShader = hp.fragmentShader.replace("gl_FragColor = mix( outputColor, texel, alpha );",
        "gl_FragColor = min( mix( outputColor, texel, alpha ), vec4( 1.2 ) );");
    }
    const bloom = new T.UnrealBloomPass(new T.Vector2(size.x, size.y), 0.6, 0.35, 2.2);
    composer.addPass(bloom);
    const grade = new T.ShaderPass(GradeShader);
    composer.addPass(grade);
    if (!gl2) {
      const fxaa = new T.ShaderPass(T.FXAAShader);
      fxaa.uniforms.resolution.value.set(1 / w, 1 / h);
      composer.addPass(fxaa);
    }
    // tone mapping now happens in the grade pass, so the bloom sees true HDR brightness
    renderer.toneMapping = T.NoToneMapping;

    return {
      composer, bloom, grade, hover, danger,
      setSize(cw, ch) { composer.setSize(cw, ch); },
      setOutlines(hoverObjs, dangerObjs) {
        hover.selectedObjects = hoverObjs;
        hover.enabled = hoverObjs.length > 0;
        danger.selectedObjects = dangerObjs;
        danger.enabled = dangerObjs.length > 0;
      },
      /* Match the current website theme: outline colour + colour grade */
      setTheme() {
        if (!window.SMCTheme) return new T.Color(0x22d3ee);
        const acc = new T.Color(SMCTheme.cssVar("--a1") || "#22d3ee");
        hover.visibleEdgeColor.copy(acc);
        hover.hiddenEdgeColor.copy(acc).multiplyScalar(0.35);
        const g = (SMCTheme.cssVar("--grade") || "1 1 1").split(/\s+/).map(Number);
        if (g.length === 3 && g.every((x) => !isNaN(x))) grade.uniforms.tint.value.set(g[0], g[1], g[2]);
        return acc;
      },
      setLook(light) {
        grade.uniforms.vignette.value = light ? 0.12 : 0.38;
        grade.uniforms.grain.value = light ? 0.012 : 0.03;
        bloom.strength = light ? 0.3 : 0.6;
        bloom.threshold = light ? 3.0 : 2.2;
      },
      render(t) {
        grade.uniforms.time.value = (t || 0) % 1000;
        composer.render();
      },
    };
  }

  window.FX = {
    available: () => !!(T.EffectComposer && T.RenderPass && T.UnrealBloomPass && T.OutlinePass && T.ShaderPass),
    createComposer, buildEnvironment, planet, sun, milkyWayCanvas, noise3, fbm, tex, softDot, createFlare, contactShadow,
  };
})();
