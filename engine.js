/* =====================================================================
   Space Mission Cube — game engine (no drawing code here)
   ---------------------------------------------------------------------
   Holds the game state, checks constraints, counts moves, runs the
   timer, finds the "par" (fewest possible moves) and saves best scores.
   ===================================================================== */

(function () {
  const STORAGE_KEY = "space-mission-cube-best";

  /* Turn a selection like {launch:"a541", power:"mmrtg"} into the
     actual option objects for that mission. */
  function partsFor(mission, sel) {
    const parts = {};
    for (const slot of mission.slots) {
      parts[slot.id] = slot.options.find((o) => o.id === sel[slot.id]);
    }
    return parts;
  }

  /* A constraint passes when it is inside its limit. */
  function isOk(c) {
    if (c.type === "bool") return c.value === c.limit;
    if (c.type === "max") return c.value <= c.limit;
    return c.value >= c.limit; // "min"
  }

  /* Run the mission's own maths and tag each constraint with ok/fail. */
  function evaluate(mission, sel) {
    return mission.evaluate(partsFor(mission, sel), mission).map((c) => ({ ...(mission.help || {})[c.id], ...c, ok: isOk(c) }));
  }

  /* Visit every possible design (at most a few hundred per mission). */
  function allDesigns(mission) {
    const out = [];
    const walk = (i, sel) => {
      if (i === mission.slots.length) return out.push(sel);
      for (const o of mission.slots[i].options) walk(i + 1, { ...sel, [mission.slots[i].id]: o.id });
    };
    walk(0, {});
    return out;
  }

  /* Number of slots that differ between two designs = moves needed. */
  function distance(mission, a, b) {
    return mission.slots.filter((s) => a[s.id] !== b[s.id]).length;
  }

  /* All designs where every constraint is green. */
  const solutionCache = {};
  function solutions(mission) {
    if (!solutionCache[mission.id]) {
      solutionCache[mission.id] = allDesigns(mission).filter((d) => evaluate(mission, d).every((c) => c.ok));
    }
    return solutionCache[mission.id];
  }

  /* Par = the fewest moves that can solve the scrambled start. */
  function par(mission) {
    return Math.min(...solutions(mission).map((s) => distance(mission, mission.start, s)));
  }

  /* Hint: find the closest solution and point at one slot to change. */
  function hint(mission, sel) {
    const sols = solutions(mission);
    let best = null;
    for (const s of sols) {
      const d = distance(mission, sel, s);
      if (!best || d < best.d) best = { d, s };
    }
    if (!best || best.d === 0) return null;
    return mission.slots.find((slot) => sel[slot.id] !== best.s[slot.id]);
  }

  /* Stars: 3 = matched par, 2 = within 2 extra moves, 1 = solved. */
  function stars(moves, parMoves) {
    if (moves <= parMoves) return 3;
    if (moves <= parMoves + 2) return 2;
    return 1;
  }

  /* ---- Best scores, kept in this browser only (safe if storage is blocked) ---- */
  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveResult(missionId, moves, timeMs) {
    const all = loadBest();
    const prev = all[missionId] || {};
    const rec = {
      bestMoves: prev.bestMoves == null ? moves : Math.min(prev.bestMoves, moves),
      bestTime: prev.bestTime == null ? timeMs : Math.min(prev.bestTime, timeMs),
      solves: (prev.solves || 0) + 1,
    };
    all[missionId] = rec;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      /* storage unavailable: scores just won't persist */
    }
    return {
      rec,
      newBestMoves: prev.bestMoves == null || moves < prev.bestMoves,
      newBestTime: prev.bestTime == null || timeMs < prev.bestTime,
    };
  }

  /* ---- Game state ---- */
  const state = {
    mission: null,
    sel: {},
    moves: 0,
    hints: 0,
    startedAt: null, // timer starts on the first move, like speedcubing
    stoppedAt: null,
    solved: false,
    log: [],
  };

  function start(mission) {
    state.mission = mission;
    state.sel = { ...mission.start };
    state.moves = 0;
    state.hints = 0;
    state.startedAt = null;
    state.stoppedAt = null;
    state.solved = false;
    state.log = [];
  }

  function elapsed() {
    if (!state.startedAt) return 0;
    return (state.stoppedAt || Date.now()) - state.startedAt;
  }

  /* Make one move. Returns what changed so the UI can explain it. */
  function move(slotId, optionId) {
    const m = state.mission;
    if (state.solved || state.sel[slotId] === optionId) return null;
    const before = evaluate(m, state.sel);
    const slot = m.slots.find((s) => s.id === slotId);
    const from = slot.options.find((o) => o.id === state.sel[slotId]);
    const to = slot.options.find((o) => o.id === optionId);

    if (!state.startedAt) state.startedAt = Date.now();
    state.sel = { ...state.sel, [slotId]: optionId };
    state.moves += 1;

    const after = evaluate(m, state.sel);
    const broke = after.filter((c, i) => !c.ok && before[i].ok);
    const fixed = after.filter((c, i) => c.ok && !before[i].ok);
    state.log.unshift({ n: state.moves, slot: slot.label, from: from.name, to: to.name, broke, fixed });

    if (after.every((c) => c.ok)) {
      state.solved = true;
      state.stoppedAt = Date.now();
    }
    return { after, broke, fixed, solved: state.solved };
  }

  window.Engine = {
    state, start, move, evaluate, partsFor, par, hint, stars, elapsed,
    loadBest, saveResult, distance, solutions,
    current: () => evaluate(state.mission, state.sel),
  };
})();
