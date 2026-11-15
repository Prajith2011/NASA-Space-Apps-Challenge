/* =====================================================================
   Space Mission Cube — sound engine
   ---------------------------------------------------------------------
   Every sound is synthesised live with the Web Audio API (no sound files
   to download). Everything goes through one master volume, which the
   🔊 slider in the top bar controls.

   One-shot effects   Sound.play("liftoff"), Sound.play("alarm"), …
   Looping sounds     const eng = Sound.loop("rocket"); eng.set(0.8); eng.stop();
                      "rocket"  launch roar (rumble + crackle)
                      "thruster" lunar lander descent engine hiss
                      "rover"   electric wheel motors + gravel crunch
                      "wind"    Mars wind / dust storm
   ===================================================================== */

(function () {
  let ctx = null, master = null, comp = null;
  let volume = 0.7, muted = false;
  const loops = new Set();
  const buffers = {};

  function ac() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();      // keeps loud moments from distorting
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(comp).connect(ctx.destination);
    return ctx;
  }
  const ready = () => { const c = ac(); if (c && c.state === "suspended") c.resume(); return c; };
  // Browsers only allow sound after the first click or key press
  ["pointerdown", "keydown"].forEach((ev) => window.addEventListener(ev, () => ready(), { passive: true }));

  function setLevel() { if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03); }

  /* ---------- Noise sources ---------- */
  function noiseBuffer(kind) {
    if (buffers[kind]) return buffers[kind];
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // deep rumble
      else d[i] = w;
    }
    return (buffers[kind] = b);
  }
  function noise(kind = "white") {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(kind);
    s.loop = true;
    return s;
  }
  function filter(type, freq, q = 1) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }
  function gain(v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }

  /* ---------- Building blocks for one-shot sounds ---------- */
  function tone(freq, dur = 0.1, type = "sine", delay = 0, vol = 0.1, slideTo = null) {
    const c = ready();
    if (!c || muted || volume <= 0) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function burst(dur = 0.3, type = "lowpass", freq = 800, vol = 0.3, delay = 0, kind = "white", sweepTo = null) {
    const c = ready();
    if (!c || muted || volume <= 0) return;
    const t = c.currentTime + delay;
    const s = noise(kind), f = filter(type, freq, 0.8), g = c.createGain();
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  /* ---------- The library of one-shot effects ---------- */
  const FX = {
    click: () => tone(1100, 0.04, "square", 0, 0.025),
    tick: () => tone(2400, 0.025, "sine", 0, 0.012),
    hover: () => tone(1800, 0.03, "sine", 0, 0.008),
    good: () => { tone(660, 0.09, "triangle", 0, 0.07); tone(990, 0.12, "triangle", 0.08, 0.07); },
    bad: () => { tone(220, 0.18, "sawtooth", 0, 0.05, 160); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, "triangle", i * 0.11, 0.08)),
    fanfare: () => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, "triangle", i * 0.12, 0.08)); tone(1568, 0.6, "sine", 0.62, 0.05); burst(1.2, "highpass", 6000, 0.03, 0.6); },
    fail: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, "sawtooth", i * 0.16, 0.04)); },
    swap: () => { burst(0.08, "bandpass", 1800, 0.12); tone(140, 0.12, "square", 0.02, 0.05, 90); tone(880, 0.06, "sine", 0.08, 0.04); },
    whoosh: () => burst(0.45, "bandpass", 400, 0.18, 0, "white", 2600),
    whooshDown: () => burst(0.45, "bandpass", 2600, 0.16, 0, "white", 300),
    open: () => { burst(0.2, "bandpass", 900, 0.08, 0, "white", 2400); tone(1320, 0.08, "sine", 0.05, 0.03); },
    theme: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, "sine", i * 0.06, 0.04)),
    // diagnostic
    scanStart: () => { tone(300, 0.6, "sine", 0, 0.06, 1200); tone(450, 0.6, "triangle", 0.05, 0.03, 1800); burst(0.6, "bandpass", 500, 0.06, 0, "white", 4000); },
    scanTick: () => tone(1500 + Math.random() * 400, 0.03, "sine", 0, 0.015),
    safe: () => tone(1900, 0.05, "sine", 0, 0.02),
    alarm: () => { tone(880, 0.14, "square", 0, 0.05); tone(660, 0.18, "square", 0.15, 0.05); burst(0.25, "lowpass", 300, 0.15, 0, "brown"); },
    scanDone: () => { tone(1200, 0.12, "sine", 0, 0.05); tone(1600, 0.2, "sine", 0.1, 0.05); },
    clank: () => { tone(180 + Math.random() * 80, 0.09, "square", 0, 0.03, 90); burst(0.06, "bandpass", 2500, 0.05); },
    assemble: () => { tone(120, 1.6, "sawtooth", 0, 0.025, 480); burst(1.6, "bandpass", 300, 0.05, 0, "white", 1800); },
    explode: () => { burst(0.6, "bandpass", 1600, 0.16, 0, "white", 250); tone(220, 0.5, "sine", 0, 0.05, 110); },
    // launch
    countdown: () => tone(880, 0.16, "sine", 0, 0.08),
    go: () => { tone(660, 0.12, "sine", 0, 0.06); tone(990, 0.2, "sine", 0.12, 0.06); },
    release: () => { burst(0.5, "highpass", 1800, 0.25, 0, "white", 6000); tone(110, 0.25, "square", 0, 0.08, 60); burst(0.12, "bandpass", 900, 0.2, 0.05); },
    separation: () => { burst(0.18, "lowpass", 3000, 0.7); tone(90, 0.4, "sine", 0, 0.3, 40); burst(1.2, "bandpass", 2200, 0.15, 0.1, "white", 300); tone(180, 0.15, "square", 0.05, 0.06, 70); },
    stage2: () => { burst(1.4, "bandpass", 300, 0.3, 0, "white", 1500); tone(70, 1.2, "sawtooth", 0, 0.05, 140); },
    orbit: () => { [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.5, "sine", i * 0.09, 0.05)); burst(1.5, "highpass", 7000, 0.02, 0.3); },
    ignition: () => { burst(1.4, "lowpass", 2000, 0.6, 0, "white", 120); burst(2.2, "lowpass", 160, 0.9, 0, "brown"); tone(60, 1.8, "sine", 0, 0.25, 35); },
    // lander
    rcs: () => burst(0.09, "highpass", 2500, 0.08),
    lowFuel: () => { tone(1000, 0.1, "square", 0, 0.04); tone(1000, 0.1, "square", 0.16, 0.04); },
    touchdown: () => { burst(0.5, "lowpass", 220, 0.6, 0, "brown"); tone(70, 0.4, "sine", 0, 0.2, 40); },
    crash: () => { burst(1.6, "lowpass", 900, 0.9, 0, "white", 80); burst(2.2, "lowpass", 140, 1, 0, "brown"); tone(50, 1.2, "sine", 0, 0.3, 25); },
    // rover
    sample: () => { [988, 1319, 1568, 1976].forEach((f, i) => tone(f, 0.18, "sine", i * 0.07, 0.05)); burst(0.25, "highpass", 5000, 0.03); },
    stormAlarm: () => { for (let i = 0; i < 3; i++) { tone(700, 0.22, "sawtooth", i * 0.5, 0.04, 500); } },
    batteryEmpty: () => tone(500, 0.6, "triangle", 0, 0.05, 120),
    // telescope
    deploy: () => { tone(260, 1.6, "sawtooth", 0, 0.02, 420); burst(1.6, "bandpass", 1200, 0.03); tone(150, 0.12, "square", 1.65, 0.06, 80); burst(0.08, "bandpass", 3000, 0.08, 1.65); },
    wrong: () => { tone(160, 0.25, "square", 0, 0.05); tone(150, 0.25, "square", 0.05, 0.04); },
  };

  /* ---------- Looping sounds ---------- */
  const LOOPS = {
    /* Rocket launch: deep rumble + roar + crackle. set(power 0–1) */
    rocket() {
      const out = gain(0);
      const rumble = noise("brown"), rLp = filter("lowpass", 160);
      const roar = noise("white"), roLp = filter("lowpass", 900), roG = gain(0.35);
      const crack = noise("white"), cHp = filter("highpass", 2500), cG = gain(0.0);
      const sub = ctx.createOscillator(); sub.frequency.value = 42; const subG = gain(0.25);
      rumble.connect(rLp).connect(out);
      roar.connect(roLp).connect(roG).connect(out);
      crack.connect(cHp).connect(cG).connect(out);
      sub.connect(subG).connect(out);
      [rumble, roar, crack, sub].forEach((s) => s.start());
      return {
        out, nodes: [rumble, roar, crack, sub],
        set(p) {
          const t = ctx.currentTime;
          out.gain.setTargetAtTime(p * 0.9, t, 0.15);
          roLp.frequency.setTargetAtTime(400 + p * 900, t, 0.2);
          // crackle flickers randomly, like a real rocket's shock waves
          cG.gain.setTargetAtTime(p * (0.04 + Math.random() * 0.12), t, 0.02);
        },
      };
    },
    /* Lunar lander descent engine: a breathy hiss. set(on 0–1) */
    thruster() {
      const out = gain(0);
      const n = noise("white"), bp = filter("bandpass", 700, 0.7), lp = filter("lowpass", 1800);
      const low = noise("brown"), lowLp = filter("lowpass", 200), lowG = gain(0.6);
      n.connect(bp).connect(lp).connect(out);
      low.connect(lowLp).connect(lowG).connect(out);
      n.start(); low.start();
      return {
        out, nodes: [n, low],
        set(on) {
          const t = ctx.currentTime;
          out.gain.setTargetAtTime(on * 0.45, t, on ? 0.03 : 0.08);
          bp.frequency.setTargetAtTime(600 + Math.random() * 250, t, 0.05);
        },
      };
    },
    /* Mars rover: electric wheel motors that whine higher as you speed up, plus gravel crunch. set(speed 0–1, turning 0–1) */
    rover() {
      const out = gain(0);
      const m = ctx.createOscillator(); m.type = "sawtooth"; m.frequency.value = 80;
      const m2 = ctx.createOscillator(); m2.type = "triangle"; m2.frequency.value = 160;
      const mLp = filter("lowpass", 700, 2), mG = gain(0.16), m2G = gain(0.05);
      const gravel = noise("white"), gBp = filter("bandpass", 1600, 0.6), gG = gain(0);
      const rumble = noise("brown"), rLp = filter("lowpass", 120), rG = gain(0);
      const servo = ctx.createOscillator(); servo.type = "square"; servo.frequency.value = 520;
      const sLp = filter("lowpass", 1400), sG = gain(0);
      m.connect(mLp).connect(mG).connect(out);
      m2.connect(m2G).connect(out);
      gravel.connect(gBp).connect(gG).connect(out);
      rumble.connect(rLp).connect(rG).connect(out);
      servo.connect(sLp).connect(sG).connect(out);
      [m, m2, gravel, rumble, servo].forEach((s) => s.start());
      return {
        out, nodes: [m, m2, gravel, rumble, servo],
        set(speed, turn = 0) {
          const t = ctx.currentTime;
          const moving = Math.max(speed, turn * 0.5);
          out.gain.setTargetAtTime(moving > 0.01 ? 0.55 : 0, t, moving > 0.01 ? 0.05 : 0.15);
          m.frequency.setTargetAtTime(70 + speed * 150, t, 0.1);
          m2.frequency.setTargetAtTime(140 + speed * 300, t, 0.1);
          gG.gain.setTargetAtTime(speed * (0.12 + Math.random() * 0.1), t, 0.03); // crunchy, uneven gravel
          gBp.frequency.setTargetAtTime(1200 + Math.random() * 900, t, 0.05);
          rG.gain.setTargetAtTime(speed * 0.5, t, 0.1);
          sG.gain.setTargetAtTime(turn * 0.025, t, 0.05);                         // steering servos
        },
      };
    },
    /* Mars wind: soft gusts, a howling roar during a dust storm. set(strength 0–1) */
    wind() {
      const out = gain(0);
      const n = noise("white"), bp = filter("bandpass", 500, 0.9);
      const low = noise("brown"), lp = filter("lowpass", 300), lowG = gain(0.5);
      n.connect(bp).connect(out);
      low.connect(lp).connect(lowG).connect(out);
      n.start(); low.start();
      return {
        out, nodes: [n, low],
        set(s) {
          const t = ctx.currentTime;
          const gust = 0.6 + 0.4 * Math.sin(t * 0.7) * Math.sin(t * 0.23);
          out.gain.setTargetAtTime(s * 0.35 * gust, t, 0.3);
          bp.frequency.setTargetAtTime(300 + s * 700 * gust, t, 0.3);
        },
      };
    },
  };

  function loop(name) {
    const c = ready();
    if (!c || !LOOPS[name]) return { set() {}, stop() {} };
    const l = LOOPS[name]();
    l.out.connect(master);
    const handle = {
      set: (...a) => l.set(...a),
      stop(fade = 0.4) {
        if (!loops.has(handle)) return;
        loops.delete(handle);
        const t = ctx.currentTime;
        l.out.gain.cancelScheduledValues(t);
        l.out.gain.setTargetAtTime(0, t, fade / 3);
        setTimeout(() => { l.nodes.forEach((n) => { try { n.stop(); } catch (e) { /* already stopped */ } }); l.out.disconnect(); }, fade * 1000 + 200);
      },
    };
    loops.add(handle);
    return handle;
  }

  window.Sound = {
    play: (name) => { if (FX[name]) FX[name](); },
    tone,
    loop,
    stopAll: (fade) => [...loops].forEach((h) => h.stop(fade)),
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); setLevel(); },
    setMuted(m) { muted = !!m; setLevel(); },
    get volume() { return volume; },
    get muted() { return muted; },
    /* Testing helper: the audio context, master volume node and how many loops are playing */
    debug: () => ({ state: ctx && ctx.state, master: master && master.gain.value, loops: loops.size, ctx, masterNode: master }),
  };
})();
