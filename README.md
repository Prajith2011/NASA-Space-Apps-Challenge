# Space Mission Cube: Engineering Trade-Offs

A 3D game for the 2026 NASA Space Apps Challenge, **Space Mission Design Game**.

Spacecraft engineering works like a Rubik's cube: **fixing one thing usually breaks another.**
Each mission starts out broken. Players fix the **3D spacecraft** by swapping its parts until every
question on the mission checklist is answered **YES**. Then they **launch it and play the mission in 3D
with the spacecraft they designed**, and finally see what NASA actually built and why.

## How to run it

**Easiest:** double-click `index.html`. It opens in your web browser.
(You need internet, because the 3D engine, styling and fonts load from the web.)

**To share it with judges:** upload the folder to GitHub and turn on GitHub Pages
(repository → Settings → Pages → Deploy from branch → `main` / root).
You get a public link like `https://YOUR-NAME.github.io/space-mission-cube/` that needs no login.

## Pages

- `index.html`: the game
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
├── css/styles.css      Gauges, checklist, 3D overlay, finale buttons, animations, light-mode colours
└── js/
    ├── theme.js        Dark/light mode: follows the computer's setting, ☀️/🌙 button remembers your choice
    ├── missions.js     ← Mission data: parts, numbers, constraint maths, checklist wording, NASA facts
    ├── engine.js       Game state, moves, timer, par/hint solver, saved scores
    ├── models.js       Detailed 3D models + procedural textures (solar cells, gold foil, Mars/Moon soil)
    │                   and the reflection environment
    ├── viewer3d.js     3D workshop: filmic lighting, soft shadows, rotate/zoom, click-to-swap, highlight glow
    ├── finale3d.js     Launch cinematic + the three playable 3D missions
    └── ui.js           Screens: mission select, workshop, swap drawer, win screen, reveal
```

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

**Before you submit:** open each link and double-check the facts quoted in `js/missions.js` and `js/finale3d.js`.

## Tools used

HTML, Tailwind CSS (CDN), vanilla JavaScript, [Three.js](https://threejs.org/) r128 for 3D (CDN),
Google Fonts (Orbitron, Inter).

## Use of AI (required disclosure for Space Apps)

The game concept (the Rubik's cube trade-off mechanic, the missions, the 3D finales and the NASA reveal)
was designed by our team. An AI coding assistant (Claude) was used to help **write the code** (including
the 3D models and finales) and draft the mission and tutorial text from our design spec. We reviewed,
tested and edited the result. *(Team: update this section to describe exactly what you changed yourselves.)*
