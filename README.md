# Space Mission Cube: Engineering Trade-Offs

A 3D game for the 2026 NASA Space Apps Challenge, **Space Mission Design Game**.

Spacecraft engineering works like a Rubik's cube: **fixing one thing usually breaks another.**
Each mission starts out broken. Players fix the **3D spacecraft** by swapping its parts until every
question on the mission checklist is answered **YES**. Then they **launch it and play the mission in 3D
with the spacecraft they designed**, and finally see what NASA actually built and why.

The home page is the **Spacecraft Hangar**: five real NASA spacecraft to inspect in 3D, part by part.
A **Diagnose** scan finds dangerous parts and connections, and each finding leads straight into the
trade-off game to fix it.

## How to run it

**Easiest:** double-click `index.html`. It opens in your web browser.
(You need internet, because the 3D engine, styling and fonts load from the web.)

## Levels

The site starts by asking **"Which level would you like to try out?"** (`index.html`). Each level has its own page,
built from one template so they stay identical apart from the level:

| | 🌱 Beginner (`beginner.html`) | 🚀 Intermediate (`intermediate.html`) | 🧑‍🚀 Advanced (`advanced.html`) |
|---|---|---|---|
| Words | simple words for every part + word helper | real terms + word helper | full technical language |
| Dangers per scan | exactly 5, slower | 5–7 | 7–9, fast, severity hidden until opened |
| Risks shown per part | top 2 | all | all |
| Workshop | Easy mode always on, unlimited hints | Easy mode on (optional) | Easy mode off, numbers open, 1 hint |
| Moon landing | ≤ 5 m/s, +35% fuel | ≤ 4 m/s | ≤ 3 m/s, −10% fuel |
| Mars rover battery | drains slower | normal | drains faster |

To change the pages, edit `tools/app-template.html` and run `node tools/build-pages.js`.

## Accuracy

All spacecraft facts, dates, numbers and "(real)" events were fact-checked against NASA, JPL, ESA and other
sources. Component masses, costs and power numbers in the puzzle, and the diagnostic sensor readings, are
simplified or simulated for gameplay (the game says so).

## The Spacecraft Hangar

| Spacecraft | Parts | Connections | Repairs happen in |
|---|---|---|---|
| Curiosity rover | 20 | 9 | The Overweight Mars Rover |
| Perseverance rover + Ingenuity helicopter | 20 | 10 | The Overweight Mars Rover |
| James Webb Space Telescope | 18 | 8 | The Power-Starved Telescope |
| Hubble Space Telescope (cut-away view) | 15 | 6 | The Power-Starved Telescope |
| Apollo 11 Lunar Module "Eagle" | 19 | 8 | The Lunar Lander Descent Failure |

1. **Pick a spacecraft.** Rotate and zoom the 3D model; **hover** any part to see its name.
2. **Parts & links list** (side panel): every part and connection, searchable. Hovering a row lights it up in 3D.
3. **Click a part or connection** for a pop-up with an overview and its **known vulnerabilities**, each with a
   severity level (Critical, High, Medium, Low). Many are things that really happened on the mission (marked "real").
4. **🩺 Diagnose** scans every part and connection one by one. The live feed shows each check as
   **SAFE (green)** or **DANGER (red)**. Dangerous parts glow red on the 3D model, and dangerous connections appear as
   red links between the two parts they join. Safe parts are left alone. Every spacecraft always hides **at least 5 dangers**
   (5–7), picked at random **every time you open it**: some based on real events, the rest from that part's known
   vulnerabilities with fresh sensor readings. Running the scan again rolls a new set.
5. **Click a red finding**, then **Fix it in the Trade-Off Workshop**. The game opens with a "repair order" banner and the
   related part glowing. Solve the puzzle, then **re-run the diagnostic**: all checks pass, and the spacecraft is marked
   ✓ Repaired in the hangar.

## Design: Liquid Glass + 12 themes

- **Liquid Glass look** (inspired by Apple's design): see-through panels that blur and brighten the colours behind
  them, bright rims of light, a sheen that follows the mouse, capsule-shaped buttons with a springy press, and a
  floating glass top bar. Glowing colour orbs drift slowly behind the page.
- **12 themes** (🎨 button): Deep Space, Clean Room, Nebula, Aurora, Mars Dust, Solar Flare, Ocean World, Neon City,
  Sunset Orbit, Lunar Silver, Arctic Ice and Retro NASA. Dark themes show spacecraft on location; light themes show a
  clean room. The 3D outlines, scan colours and colour grading follow the theme.
- **Volume slider** in the top bar (click the speaker to mute). Saved in the browser.
- **Sound effects**, all synthesised live (no audio files): launch countdown beeps, an ignition boom and a roaring
  engine that fades as the rocket climbs; the lander's engine hiss, side-thruster puffs, low-fuel warning, touchdown
  thud or crash; the rover's electric motors that whine higher with speed, gravel crunch, steering servos, Mars wind
  that howls in the dust storm, and a chime for each sample; the telescope's motor whir and latch clunk; plus
  diagnostic scan ticks and alarms, part-swap clunks, assembly clicks and success fanfares.
- **Lively motion:** click ripples, sections that float in as you scroll, a spinning cube logo, shimmering progress bars,
  pulsing critical badges and flashing danger rows.

## Graphics

Everything is drawn in code (no image or model files), using Three.js:

- **Cinematic rendering:** HDR lighting with 4× anti-aliasing, bloom (bright things glow), ACES film tone mapping,
  vignette, film grain and soft shadows. Hovered parts get a glowing outline that also shows through other parts.
- **On-location scenes:** Curiosity and Perseverance on Mars (dusty sky, hills, a crater rim, rocks, blowing dust);
  the Lunar Module on cratered Moon ground with Earth in the sky; Webb in deep space with a blazing Sun; Hubble in
  orbit above a turning Earth with clouds and a glowing atmosphere. The Milky Way, Earth and terrain are all generated
  with noise maths. Light mode switches to a clean-room assembly hall.
- **Detail:** rounded machined edges, panel seams and rivets, wheel spokes, cable trays, Webb's segment frames and
  actuators, its five-layer Kapton sunshield, Hubble's quilted insulation, and Ingenuity's spinning rotors.
- **Extra realism:** lens-flare ghosts when you look towards the Sun, Earth with shiny oceans and city lights on its
  night side, a dust devil wandering across Mars, specks of space dust drifting past, and soft contact shadows.
  The workshop puzzle also puts each spacecraft on location (Mars, the Moon, deep space) in dark themes.
- **Animation:** each spacecraft assembles itself part by part as the camera swoops in; an **Exploded view** slides
  every part outward; the diagnostic adds a holographic scanning grid, shock-wave pings and pulsing red outlines and links.
  The launch finale is a ~15-second movie with four camera shots: a dusk countdown on the pad (venting vapour,
  floodlight beams, blinking tower beacon), ignition with water-deluge steam and sparks, a low "thunder past the
  camera" liftoff as the tower arms swing away, a long-lens tracking shot through the clouds as the sky turns black,
  then space: Earth's glowing horizon below, the rocket splitting at its stage line, the spent stage tumbling away and
  the second stage burning blue. The ending follows each real mission: Curiosity and Apollo first coast in a "parking
  orbit" around Earth, then fire again (trans-Mars / trans-lunar injection); after escaping Earth, the Mars spacecraft
  orbits the Sun until it meets Mars ("about 8 months later…"). Webb skips the parking orbit and heads straight to L2.
  Live readouts show mission time, altitude, speed and stage.
- **Smooth on any computer:** if frames get slow (for example on a laptop's built-in graphics), the 3D views
  automatically render fewer pixels.

## Pages

- `index.html`: the level chooser ("Which level would you like to try out?")
- `beginner.html`, `intermediate.html`, `advanced.html`: the Spacecraft Hangar and the game at each level
  (add `#workshop` for the mission list, `#craft-hubble` to open a spacecraft, `#mars-rover` to open a mission)
- `tutorial.html`: the detailed tutorial (the goal, the screen explained, plain-English space science,
  an interactive rocket-equation slider, a full walkthrough, finale controls and scoring)

## How to play (short version)

1. Pick a mission. A quick "How to play" guide appears the first time.
2. Read the **Mission Checklist**. Every ✗ NO explains the problem, gives a tip and lists the parts to try.
3. **Click a part on the 3D spacecraft** (or in the parts list) and pick a different one. Each swap = 1 move.
4. When every answer is ✓ YES, press **🚀 Launch the mission!**
5. Play the 3D finale, then see **Your Design vs. What NASA Built**.

**Easy mode** (on by default) shows what each option would fix or break before you choose it.
The **☀️/🌙 button** (top right) switches between dark mode (deep space) and light mode (a bright
clean-room assembly hall). The first visit follows the computer's own setting.
**Hint** makes a useful part glow in 3D. Best times and fewest moves are saved in the browser.

## The 3D finales

| Mission | Finale | Controls | How your design matters |
|---|---|---|---|
| 🌕 Lunar lander (Apollo 11) | Pilot the descent and land gently on the target | Space/↑ thrust, ←/→ sideways (or on-screen buttons) | Your design's Δv sets how many seconds of fuel you get |
| 🔴 Mars rover (Curiosity) | Drive to 3 science targets, then survive a dust storm | ↑/↓ drive, ←/→ steer, WASD, or on-screen buttons | Solar rovers slow down in the storm; nuclear rovers keep going |
| 🔭 Telescope (Webb) | Unfold the telescope in the correct order | Click the step buttons, drag to look around | Shows the folding mirror and the sunshield you chose |

## Missions

| Mission | Inspired by | What's broken | Checklist questions |
|---|---|---|---|
| The Overweight Mars Rover | Curiosity | Too heavy, no power in dust storms | Light enough? Power in a dust storm? Enough science sent home? Within budget? |
| The Power-Starved Telescope | James Webb Space Telescope | Too heavy, mirror doesn't fit the rocket, coolers use too much power | Light enough? Fits the nose cone? Enough power? Cameras cold? Sees far enough? Within budget? |
| The Lunar Lander Descent Failure | Apollo 11 Lunar Module | Not enough Δv, over the Saturn V allocation | Enough Δv? Saturn V can carry it? Can hover? Batteries last? Enough science? Within budget? |

Each mission has **more than one valid solution**, because real engineering rarely has one perfect answer.

## File structure

```
space-mission-cube/
├── index.html          The game page (loads Three.js, Tailwind, fonts)
├── tutorial.html       Detailed tutorial page
├── css/glass.css       Liquid Glass design, the 12 themes, volume slider, lively animations
├── css/styles.css      Gauges, checklist, 3D overlay, finale buttons, animations, light-mode colours
└── js/
    ├── theme.js        12 themes + the 🎨 picker (follows the computer's dark/light setting on the first visit)
    ├── lively.js       Page motion: drifting orbs, mouse-following glass sheen, click ripples, scroll reveals
    ├── audio.js        Sound engine: every effect and engine loop synthesised with Web Audio, one master volume
    ├── missions.js     ← Mission data: parts, numbers, constraint maths, checklist wording, NASA facts
    ├── engine.js       Game state, moves, timer, par/hint solver, saved scores
    ├── models.js       Detailed 3D models + procedural textures (solar cells, gold foil, Mars/Moon soil)
    │                   and the reflection environment
    ├── viewer3d.js     3D workshop: filmic lighting, soft shadows, rotate/zoom, click-to-swap, highlight glow
    ├── finale3d.js     Launch cinematic + the three playable 3D missions
    ├── ui.js           Screens: mission select, workshop, swap drawer, win screen, reveal
    ├── level.js        Level settings, simple words for every part (Beginner), the word-helper glossary
    ├── launchvehicles.js  Detailed launch rockets (real proportions, staging, fairings, payloads)
    ├── craftdata.js    ← Hangar data: real spacecraft, parts, connections, vulnerabilities, diagnostic faults
    ├── craftmodels.js  Detailed 3D models of the five real spacecraft (every part tagged by id)
    ├── fx.js           Cinematic effects: bloom, outlines, film grade, Milky Way, Earth, Mars/Moon terrain
    ├── inspector.js    Hangar 3D view: hover names, red highlights, connection links, scanning beam
    └── hangar.js       Screens: hangar, inspector, live diagnostic feed, part pop-up, link into the game
```

**To add a new spacecraft to the hangar:** add an entry to `js/craftdata.js` (parts, connections, faults, and the
`mission` it repairs in) and a builder in `js/craftmodels.js` that tags each part group with `userData.part`.

**To add a new mission:** copy a mission block in `js/missions.js` (slots, options, `start`, `evaluate()`,
`help` checklist wording and `nasa` facts), then add a model builder in `js/models.js`.
Par and hints are calculated automatically.

## The science

- **Rocket equation (lunar lander):** Δv = Isp × g₀ × ln(full mass ÷ empty mass). Adding fuel also adds
  mass, so making the lander lighter is often worth more than adding fuel. The tutorial has a slider to try this.
- **Dust storms (Mars rover):** in the game, solar panels drop to 30% output in a dust storm. A
  radioisotope generator gives steady power regardless.
- **Infrared telescopes:** the instruments must be extremely cold, or the telescope's own heat hides
  faint galaxies. A sunshield cools the telescope without using power.
- **Webb's deployment order:** solar array first, then the sunshield, then the secondary mirror, then the
  primary mirror wings.

> **Note:** component numbers (masses, costs, power) and finale physics are **simplified for gameplay**.
> The "What NASA Built" facts are real and link to their NASA sources.

## NASA data and resources used

- [Design and Develop Science Missions (NASA)](https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf): mission segments and the design process
- [Mars Science Laboratory / Curiosity (NASA)](https://science.nasa.gov/mission/msl-curiosity/)
- [James Webb Space Telescope (NASA)](https://science.nasa.gov/mission/webb/)
- [Webb "Build It Yourself" learning game (NASA)](https://science.nasa.gov/mission/webb/game-build-it-yourself/)
- [Apollo 11 mission (NASA)](https://www.nasa.gov/mission/apollo-11/)
- [Mars 2020 Perseverance rover (NASA)](https://science.nasa.gov/mission/mars-2020-perseverance/)
- [Hubble Space Telescope (NASA)](https://science.nasa.gov/mission/hubble/)

## Tools used

HTML, Tailwind CSS (CDN), vanilla JavaScript, [Three.js](https://threejs.org/) r128 for 3D (CDN),
Google Fonts (Orbitron, Inter).

## Use of AI (required disclosure for Space Apps)

The game concept (the Rubik's cube trade-off mechanic, the missions, the 3D finales, the NASA reveal, and the
Spacecraft Hangar with its 3D inspection and diagnostic)
was designed by our team. An AI coding assistant (Claude) was used to help **write the code** (including
the 3D models and finales) and draft the mission, tutorial and spacecraft-part text from our design spec. We reviewed,
tested and edited the result.
