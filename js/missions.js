  /* =====================================================================
     Space Mission Cube — mission data
     ---------------------------------------------------------------------
     Each mission is a "scrambled cube": a spacecraft design with several
     broken constraints. Every slot (launcher, power, science…) has a few
     component options. Swapping one option = one "move".
  
     NUMBERS: the component values are SIMPLIFIED for gameplay. They are
     inspired by real NASA missions, but they are rounded and tuned so the
     puzzle works. The "What NASA Built" facts at the end of each mission
     are the real-world part and come from the NASA sources listed.
  
     Option fields used by the evaluate() functions:
       mass (kg)   cost ($ millions)   draw (W used)   gen (W made)
       plus mission-specific fields (cap, width, isp, prop, energy …)
     ===================================================================== */
  
  (function () {
    /* Small helper: add up one numeric field across all chosen parts. */
    function sum(parts, field) {
      return Object.values(parts).reduce((t, p) => t + (p[field] || 0), 0);
    }
  
    const G0 = 9.80665; // standard gravity, used in the rocket equation
  
    const MISSIONS = [
      /* ---------------------------------------------------------------
         MISSION 1 — The Overweight Mars Rover  (inspired by Curiosity)
         --------------------------------------------------------------- */
      {
        id: "mars-rover",
        title: "The Overweight Mars Rover",
        tag: "Mars Rover Challenge",
        icon: "🔴",
        difficulty: "Beginner",
        realName: "Curiosity (Mars Science Laboratory)",
        briefing:
          "A car-sized rover must drive across Mars, drill rocks and look for signs that Mars could once have supported life. The design team got carried away: the spacecraft is too heavy for its rocket, and the rover will freeze when a Martian dust storm blocks the Sun.",
        problems: [
          "Too heavy for the launch rocket",
          "Not enough power during dust storms",
        ],
        fixed: { label: "Cruise stage, heat shield & sky-crane lander", mass: 3000, cost: 900 },
        limits: { budget: 1900, science: 6 },
        /* Plain-language checklist: a yes/no question, a fix tip, and which parts affect it */
        help: {
          mass: { question: "Is it light enough for the rocket?", fix: "Make the spacecraft lighter, or pick a stronger rocket (stronger rockets cost more!).", affects: ["launch", "body", "power", "science"] },
          power: { question: "Does it have enough power during a dust storm?", fix: "Use a power source that dust can't block, add battery reserve, or use instruments that need less power.", affects: ["power", "battery", "science"] },
          science: { question: "Can it send home enough science?", fix: "Pick stronger instruments, and make sure the radio can send all the data home.", affects: ["science", "comms"] },
          budget: { question: "Is it within budget?", fix: "Swap expensive parts for cheaper ones.", affects: ["launch", "power", "science", "body"] },
        },
        slots: [
          {
            id: "launch", label: "Launch Vehicle", icon: "🚀",
            options: [
              { id: "a401", name: "Atlas V 401", note: "Cheapest ride, smallest lift.", cap: 3400, cost: 150 },
              { id: "a541", name: "Atlas V 541", note: "Five side boosters for extra lift.", cap: 3700, cost: 220 },
              { id: "d4h", name: "Delta IV Heavy", note: "Huge lift, huge price.", cap: 5500, cost: 400 },
            ],
          },
          {
            id: "body", label: "Rover Body", icon: "🛞",
            options: [
              { id: "std", name: "Standard aluminium chassis", note: "Proven and affordable.", mass: 450, draw: 40, cost: 300 },
              { id: "light", name: "Lightweight composite chassis", note: "70 kg lighter, but costs more.", mass: 380, draw: 40, cost: 380 },
            ],
          },
          {
            id: "power", label: "Power Source", icon: "⚡",
            options: [
              { id: "solarS", name: "Small solar panels", note: "Light, but dust storms cut output to 30%.", mass: 40, gen: 150, solar: true, cost: 30 },
              { id: "solarL", name: "Large solar wings", note: "Lots of sunlight power, but dust storms cut output to 30%.", mass: 90, gen: 300, solar: true, cost: 50 },
              { id: "mmrtg", name: "Nuclear power generator (MMRTG)", note: "Steady power day, night and in storms. Expensive.", mass: 45, gen: 110, cost: 120 },
            ],
          },
          {
            id: "battery", label: "Battery Bank", icon: "🔋",
            options: [
              { id: "small", name: "Small lithium-ion pack", note: "Adds a 20 W average reserve.", mass: 20, buffer: 20, cost: 10 },
              { id: "large", name: "Large lithium-ion pack", note: "Adds a 60 W average reserve.", mass: 60, buffer: 60, cost: 25 },
            ],
          },
          {
            id: "science", label: "Science Suite", icon: "🔬",
            options: [
              { id: "basic", name: "Cameras + weather station", note: "Simple and light.", mass: 40, draw: 40, sci: 3, cost: 80 },
              { id: "standard", name: "Cameras, laser spectrometer & drill", note: "Analyses rocks from a distance and up close.", mass: 75, draw: 80, sci: 6, cost: 200 },
              { id: "lab", name: "Full onboard chemistry lab", note: "Bakes rock samples to find organic molecules. Power-hungry.", mass: 120, draw: 110, sci: 9, cost: 350 },
            ],
          },
          {
            id: "comms", label: "Communications", icon: "📡",
            options: [
              { id: "dte", name: "Direct-to-Earth antenna only", note: "Slow link. Can only send back 5 science points.", mass: 15, draw: 20, link: 5, cost: 20 },
              { id: "relay", name: "Direct-to-Earth + orbiter relay radio", note: "Uses Mars orbiters as a relay. Sends up to 10 science points.", mass: 30, draw: 30, link: 10, cost: 40 },
            ],
          },
        ],
        start: { launch: "a541", body: "std", power: "solarL", battery: "large", science: "lab", comms: "relay" },
  
        evaluate(p, m) {
          const mass = m.fixed.mass + sum(p, "mass");
          const cap = p.launch.cap;
          const stormGen = p.power.solar ? Math.round(p.power.gen * 0.3) : p.power.gen;
          const supply = stormGen + p.battery.buffer;
          const draw = sum(p, "draw");
          const science = Math.min(p.science.sci, p.comms.link);
          const cost = m.fixed.cost + sum(p, "cost");
          return [
            {
              id: "mass", label: "Launch Mass", unit: "kg", type: "max", value: mass, limit: cap,
              limitLabel: `${p.launch.name} can lift`,
              why: `The spacecraft is ${mass - cap} kg too heavy for the ${p.launch.name}.`,
              learn: "Every rocket has a maximum mass it can send to Mars. Heavier spacecraft need bigger, more expensive rockets.",
            },
            {
              id: "power", label: "Dust-Storm Power", unit: "W", type: "min", value: supply, limit: draw,
              limitLabel: "Rover needs",
              why: p.power.solar
                ? `In a dust storm the solar panels make only ${stormGen} W (30% of ${p.power.gen} W). With the battery reserve that is ${supply} W, but the rover needs ${draw} W.`
                : `The generator and battery give ${supply} W, but the rover needs ${draw} W.`,
              learn: "Martian dust storms can block most sunlight for weeks. Instruments, heaters and radios all draw power at the same time.",
            },
            {
              id: "science", label: "Science Returned", unit: "pts", type: "min", value: science, limit: m.limits.science,
              limitLabel: "Mission goal",
              why: p.science.sci > p.comms.link
                ? `The instruments collect ${p.science.sci} points, but the radio can only send back ${p.comms.link}. Data stuck on Mars doesn't count!`
                : `The science suite only produces ${p.science.sci} points. The goal is ${m.limits.science}.`,
              learn: "Science only counts once the data reaches Earth, so the radio link matters as much as the instruments.",
            },
            {
              id: "budget", label: "Budget", unit: "$M", type: "max", value: cost, limit: m.limits.budget,
              limitLabel: "Budget cap",
              why: `The mission costs $${cost}M, which is $${cost - m.limits.budget}M over the $${m.limits.budget}M budget.`,
              learn: "NASA missions have a cost cap. Bigger rockets and fancier parts quickly eat the budget.",
            },
          ];
        },
  
        nasa: {
          name: "Curiosity rover (Mars Science Laboratory)",
          design: {
            launch: "Atlas V 541, launched 26 Nov 2011",
            body: "Car-sized rover, about 899 kg",
            power: "One MMRTG nuclear generator (about 110 W at launch)",
            battery: "Two lithium-ion batteries for peak demands",
            science: "10 instruments, including an onboard chemistry lab, a laser spectrometer and a drill",
            comms: "Direct-to-Earth antennas + UHF relay through Mars orbiters",
          },
          why: [
            "NASA's earlier solar-powered rovers, Spirit and Opportunity, were limited by dust on their panels. Opportunity went silent during a planet-wide dust storm in 2018.",
            "An MMRTG makes steady power from the heat of decaying plutonium-238, day or night, in any season and through dust storms. Its waste heat also keeps the rover's parts warm.",
            "The generator alone cannot cover peak demand (driving plus drilling plus heating), so batteries store energy for those moments, just like the battery slot in this game.",
            "Most of Curiosity's data reaches Earth by being relayed through spacecraft orbiting Mars, because they pass overhead with a faster connection than the rover's own direct link.",
          ],
          sources: [
            { label: "NASA: Mars Science Laboratory / Curiosity", url: "https://science.nasa.gov/mission/msl-curiosity/" },
            { label: "NASA: Design and Develop Science Missions", url: "https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf" },
          ],
        },
      },
  
      /* ---------------------------------------------------------------
         MISSION 2 — The Power-Starved Telescope  (inspired by Webb)
         --------------------------------------------------------------- */
      {
        id: "deep-space-telescope",
        title: "The Power-Starved Telescope",
        tag: "Deep Space Telescope",
        icon: "🔭",
        difficulty: "Intermediate",
        realName: "James Webb Space Telescope",
        briefing:
          "A giant infrared telescope will look back to the first galaxies. Infrared cameras must be extremely cold, or the telescope's own heat drowns out the faint light. The current design uses a huge solid mirror that doesn't fit any rocket, and cooling every instrument with machines uses more power than the solar panels make.",
        problems: [
          "Too heavy for the rocket",
          "Mirror too wide for the rocket's nose cone",
          "Coolers use more power than the solar panels make",
        ],
        fixed: { label: "Spacecraft bus (computers, thrusters, radios)", mass: 1800, draw: 400, cost: 1500 },
        limits: { budget: 6500, science: 12 },
        help: {
          mass: { question: "Is it light enough for the rocket?", fix: "Use a lighter mirror or lighter parts, or a stronger rocket.", affects: ["mirror", "cooling", "power", "launch"] },
          fit: { question: "Does it fit inside the rocket's nose cone?", fix: "Use parts that fold up for launch, or a rocket with a wider nose cone.", affects: ["mirror", "cooling", "launch"] },
          power: { question: "Do the solar panels make enough power?", fix: "Use a bigger solar array, or a cooling system that uses less power.", affects: ["power", "cooling", "instruments"] },
          cold: { question: "Are the infrared cameras cold enough?", fix: "Use a cooling system that gets very cold.", affects: ["cooling", "instruments"] },
          science: { question: "Can it see far enough?", fix: "A bigger mirror plus working infrared instruments can see further.", affects: ["mirror", "instruments"] },
          budget: { question: "Is it within budget?", fix: "Swap expensive parts for cheaper ones.", affects: ["launch", "mirror", "cooling"] },
        },
        slots: [
          {
            id: "launch", label: "Launch Vehicle", icon: "🚀",
            options: [
              { id: "medium", name: "Medium-lift rocket", note: "Affordable, 4.0 m wide nose cone.", cap: 4500, width: 4.0, cost: 120 },
              { id: "ariane5", name: "Ariane 5 ECA", note: "Heavy-lift, 4.5 m wide nose cone.", cap: 6600, width: 4.5, cost: 200 },
              { id: "superheavy", name: "Super-heavy rocket (future design)", note: "8 m nose cone, but still in development and very costly.", cap: 20000, width: 8.0, cost: 2500 },
            ],
          },
          {
            id: "mirror", label: "Primary Mirror", icon: "🪞",
            options: [
              { id: "mono4", name: "Solid glass mirror, 4 m", note: "Fits in a rocket, but collects less light.", mass: 1800, width: 4.0, sci: 4, cost: 900 },
              { id: "mono65", name: "Solid glass mirror, 6.5 m", note: "Huge light-collecting area. Heavy, and can't fold.", mass: 4000, width: 6.5, sci: 8, cost: 1600 },
              { id: "seg65", name: "Folding beryllium mirror, 6.5 m (18 segments)", note: "Light and folds up for launch. Expensive and complex.", mass: 700, width: 4.4, sci: 8, cost: 2400 },
            ],
          },
          {
            id: "cooling", label: "Cooling System", icon: "❄️",
            options: [
              { id: "radiator", name: "Simple radiator panels", note: "Cheap, but not cold enough for infrared cameras.", mass: 150, draw: 50, width: 3.0, cold: false, cost: 50 },
              { id: "cryoAll", name: "Machine coolers on every instrument", note: "Gets very cold, but uses a lot of power.", mass: 450, draw: 1500, width: 3.0, cold: true, cost: 300 },
              { id: "sunshield", name: "5-layer folding sunshield + one small cooler", note: "Shades the telescope so it cools itself. Tennis-court sized when open.", mass: 800, draw: 300, width: 4.5, cold: true, cost: 900 },
            ],
          },
          {
            id: "power", label: "Solar Array", icon: "☀️",
            options: [
              { id: "s1", name: "Solar array, 1 kW", note: "Light and cheap.", mass: 100, gen: 1000, cost: 40 },
              { id: "s2", name: "Solar array, 2 kW", note: "A balanced choice.", mass: 200, gen: 2000, cost: 80 },
              { id: "s4", name: "Solar array, 4 kW", note: "Plenty of power, but heavy.", mass: 600, gen: 4000, cost: 160 },
            ],
          },
          {
            id: "instruments", label: "Instruments", icon: "🔬",
            options: [
              { id: "vis", name: "Visible-light camera", note: "Works at room temperature. Can't see the earliest galaxies.", mass: 400, draw: 200, sci: 2, ir: false, cost: 300 },
              { id: "ir", name: "Full infrared suite (cameras + spectrographs)", note: "Sees the first galaxies. Must be kept extremely cold.", mass: 1300, draw: 500, sci: 5, ir: true, cost: 900 },
            ],
          },
        ],
        start: { launch: "ariane5", mirror: "mono65", cooling: "cryoAll", power: "s2", instruments: "ir" },
  
        evaluate(p, m) {
          const mass = m.fixed.mass + sum(p, "mass");
          const cap = p.launch.cap;
          const widest = Math.max(p.mirror.width, p.cooling.width);
          const fairing = p.launch.width;
          const draw = m.fixed.draw + sum(p, "draw");
          const gen = p.power.gen;
          const coldOK = !p.instruments.ir || p.cooling.cold;
          const science = p.mirror.sci + (coldOK ? p.instruments.sci : 0);
          const cost = m.fixed.cost + sum(p, "cost");
          const widestPart = p.mirror.width >= p.cooling.width ? p.mirror.name : p.cooling.name;
          return [
            {
              id: "mass", label: "Launch Mass", unit: "kg", type: "max", value: mass, limit: cap,
              limitLabel: `${p.launch.name} can lift`,
              why: `The telescope is ${mass - cap} kg too heavy for the ${p.launch.name}.`,
              learn: "The rocket must push the telescope 1.5 million km from Earth. Every kilogram counts.",
            },
            {
              id: "fit", label: "Fits in Nose Cone", unit: "m", type: "max", value: widest, limit: fairing, decimals: 1,
              limitLabel: "Nose cone width",
              why: `The widest part (${widestPart}) is ${widest} m across when folded, but the ${p.launch.name} nose cone is only ${fairing} m wide.`,
              learn: "A rocket's payload must fit inside its nose cone (the fairing). Big telescopes have to fold up like origami.",
            },
            {
              id: "power", label: "Power Balance", unit: "W", type: "min", value: gen, limit: draw,
              limitLabel: "Telescope needs",
              why: `The solar array makes ${gen} W, but the telescope needs ${draw} W.`,
              learn: "Machine coolers (cryocoolers) work like a fridge and use lots of electricity. Shading the telescope uses none.",
            },
            {
              id: "cold", label: "Infrared Cameras Cold", unit: "", type: "bool", value: coldOK, limit: true,
              why: "The radiator can't make the infrared cameras cold enough. They would be blinded by their own heat.",
              learn: "Infrared light is heat. A warm telescope glows in infrared and hides the faint galaxies it is trying to see.",
            },
            {
              id: "science", label: "Science Power", unit: "pts", type: "min", value: science, limit: m.limits.science,
              limitLabel: "Mission goal",
              why: `Mirror (${p.mirror.sci}) + working instruments (${coldOK ? p.instruments.sci : 0}) = ${science} points. The goal is ${m.limits.science}.`,
              learn: "A bigger mirror collects more light, so you can see fainter, more distant objects.",
            },
            {
              id: "budget", label: "Budget", unit: "$M", type: "max", value: cost, limit: m.limits.budget,
              limitLabel: "Budget cap",
              why: `The mission costs $${cost}M, which is $${cost - m.limits.budget}M over budget.`,
              learn: "Flagship telescopes cost billions, so every design choice is also a money choice.",
            },
          ];
        },
  
        nasa: {
          name: "James Webb Space Telescope",
          design: {
            launch: "Ariane 5 (provided by the European Space Agency), launched 25 Dec 2021",
            mirror: "6.5 m mirror made of 18 gold-coated beryllium segments that folded for launch",
            cooling: "Tennis-court-sized 5-layer sunshield for passive cooling + a cryocooler only for the MIRI instrument",
            power: "Solar array of about 2 kW",
            instruments: "Four infrared science instruments (NIRCam, NIRSpec, MIRI, NIRISS/FGS)",
          },
          why: [
            "No available rocket nose cone could hold a solid 6.5 m mirror, so Webb's mirror was split into 18 segments that folded up and unfolded in space.",
            "Beryllium is very light and holds its shape at extremely cold temperatures, which saved a lot of mass compared with glass.",
            "Instead of powering machine coolers for everything, Webb's sunshield blocks heat from the Sun, Earth and Moon so the telescope cools itself to below about −223 °C (50 K). Only MIRI, which needs to be even colder, uses a cryocooler.",
            "Webb orbits about 1.5 million km from Earth near a point called L2. There, the Sun, Earth and Moon all stay on one side, behind the sunshield.",
          ],
          sources: [
            { label: "NASA: James Webb Space Telescope", url: "https://science.nasa.gov/mission/webb/" },
            { label: "NASA: Webb learning game (build a telescope)", url: "https://science.nasa.gov/mission/webb/game-build-it-yourself/" },
          ],
        },
      },
  
      /* ---------------------------------------------------------------
         MISSION 3 — The Lunar Lander Descent Failure  (inspired by Apollo 11)
         --------------------------------------------------------------- */
      {
        id: "lunar-lander",
        title: "The Lunar Lander Descent Failure",
        tag: "Lunar Lander",
        icon: "🌕",
        difficulty: "Advanced",
        realName: "Apollo Lunar Module (Apollo 11 'Eagle')",
        briefing:
          "Two astronauts must fly from lunar orbit down to the surface and land gently. At the last minute, extra science experiments were bolted on. Now the lander is heavier, its fuel can't slow it down enough, and the Saturn V rocket can't carry it.",
        problems: [
          "Not enough Δv (speed change) to land safely",
          "Over the Saturn V lander mass allocation",
        ],
        fixed: { label: "Descent stage frame, guidance computer & radar", mass: 500, cost: 300 },
        limits: { budget: 1600, science: 5, dv: 2100, allocation: 16500, baseEnergy: 40 },
        help: {
          dv: { question: "Does it have enough fuel power (Δv) to land?", fix: "Make the lander lighter (the best trick!), add fuel, or use a more efficient engine.", affects: ["ascent", "structure", "science", "tanks", "engine"] },
          mass: { question: "Can the Saturn V carry it?", fix: "Remove weight: lighter parts, fewer extras or smaller tanks.", affects: ["ascent", "structure", "science", "tanks", "battery"] },
          throttle: { question: "Can the engine hover?", fix: "Use a liquid engine that can be throttled up and down.", affects: ["engine"] },
          energy: { question: "Do the batteries last long enough?", fix: "Use a bigger battery, or experiments that need less energy.", affects: ["battery", "science"] },
          science: { question: "Is there enough science?", fix: "Carry a better experiments package.", affects: ["science"] },
          budget: { question: "Is it within budget?", fix: "Swap expensive parts for cheaper ones.", affects: ["ascent", "structure", "engine"] },
        },
        slots: [
          {
            id: "engine", label: "Descent Engine", icon: "🔥",
            options: [
              { id: "pf", name: "Throttleable pressure-fed engine", note: "Simple and reliable. Isp 305 s.", mass: 180, isp: 305, throttle: true, cost: 200 },
              { id: "hp", name: "High-performance pump-fed engine", note: "More efficient (Isp 330 s), but heavier and pricier.", mass: 400, isp: 330, throttle: true, cost: 450 },
              { id: "solid", name: "Solid rocket motor", note: "Cheap and light, but once lit it can't be throttled or stopped.", mass: 150, isp: 290, throttle: false, cost: 80 },
            ],
          },
          {
            id: "tanks", label: "Propellant Tanks", icon: "🛢️",
            options: [
              { id: "small", name: "Small tanks: 7,000 kg propellant", note: "Lighter lander.", prop: 7000, mass: 300, cost: 60 },
              { id: "med", name: "Medium tanks: 8,200 kg propellant", note: "The baseline.", prop: 8200, mass: 380, cost: 80 },
              { id: "large", name: "Large tanks: 9,500 kg propellant", note: "More fuel, but all that fuel has mass too.", prop: 9500, mass: 480, cost: 110 },
            ],
          },
          {
            id: "ascent", label: "Ascent Stage (crew cabin)", icon: "👩‍🚀",
            options: [
              { id: "std", name: "Standard ascent stage", note: "Crew cabin plus the engine to return to orbit.", mass: 4900, cost: 400 },
              { id: "light", name: "Weight-saving ascent stage", note: "Thinner skins and foil insulation. Saves 400 kg for extra cost.", mass: 4500, cost: 520 },
            ],
          },
          {
            id: "structure", label: "Legs & Structure", icon: "🦿",
            options: [
              { id: "std", name: "Standard legs and structure", note: "Strong and simple.", mass: 1900, cost: 150 },
              { id: "light", name: "Lightened legs and structure", note: "Saves 300 kg, costs more to build and test.", mass: 1600, cost: 250 },
            ],
          },
          {
            id: "science", label: "Surface Experiments", icon: "🔬",
            options: [
              { id: "min", name: "Simple package: seismometer + laser mirror", note: "Light and quick to set up.", mass: 100, sci: 5, energy: 5, cost: 50 },
              { id: "full", name: "Full experiments station", note: "Several long-running experiments.", mass: 250, sci: 7, energy: 10, cost: 120 },
              { id: "extra", name: "Full station + last-minute extras", note: "Maximum science. Very heavy.", mass: 650, sci: 9, energy: 20, cost: 250 },
            ],
          },
          {
            id: "battery", label: "Battery Bank", icon: "🔋",
            options: [
              { id: "small", name: "Small silver-zinc battery bank", note: "45 kWh.", mass: 250, energy: 45, cost: 30 },
              { id: "large", name: "Large silver-zinc battery bank", note: "70 kWh.", mass: 400, energy: 70, cost: 50 },
            ],
          },
        ],
        start: { engine: "pf", tanks: "med", ascent: "std", structure: "std", science: "extra", battery: "large" },
  
        evaluate(p, m) {
          const dry = m.fixed.mass + sum(p, "mass");     // everything except propellant
          const prop = p.tanks.prop;
          const wet = dry + prop;                          // fully fuelled
          const dv = Math.round(p.engine.isp * G0 * Math.log(wet / dry)); // Tsiolkovsky rocket equation
          const energyNeed = m.limits.baseEnergy + p.science.energy;
          const cost = m.fixed.cost + sum(p, "cost");
          return [
            {
              id: "dv", label: "Δv (Fuel Reach)", unit: "m/s", type: "min", value: dv, limit: m.limits.dv,
              limitLabel: "Needed to land",
              why: `The lander can only change its speed by ${dv} m/s, but it needs ${m.limits.dv} m/s to slow down from orbit and hover to land. Extra mass means the fuel does less.`,
              learn: "The rocket equation: Δv = Isp × g × ln(full mass ÷ empty mass). Adding fuel also adds mass, so lightening the lander often helps more than adding fuel.",
            },
            {
              id: "mass", label: "Saturn V Allocation", unit: "kg", type: "max", value: wet, limit: m.limits.allocation,
              limitLabel: "Lander allowance",
              why: `The fuelled lander weighs ${wet} kg, ${wet - m.limits.allocation} kg more than the Saturn V can carry for it.`,
              learn: "The Saturn V had to launch the command module, the service module AND the lander. Each piece had a strict mass allowance.",
            },
            {
              id: "throttle", label: "Engine Can Hover", unit: "", type: "bool", value: p.engine.throttle, limit: true,
              why: "A solid rocket motor can't be throttled down to hover, so the crew could not steer around boulders to pick a safe landing spot.",
              learn: "Landing needs fine control: slowing gradually, hovering and moving sideways. That needs a throttleable liquid engine.",
            },
            {
              id: "energy", label: "Battery Energy", unit: "kWh", type: "min", value: p.battery.energy, limit: energyNeed,
              limitLabel: "Lander needs",
              why: `The batteries store ${p.battery.energy} kWh, but the lander and experiments need ${energyNeed} kWh.`,
              learn: "Landers run on batteries during their short mission, so extra experiments mean extra battery mass.",
            },
            {
              id: "science", label: "Science Value", unit: "pts", type: "min", value: p.science.sci, limit: m.limits.science,
              limitLabel: "Mission goal",
              why: `The experiments give ${p.science.sci} points. The goal is ${m.limits.science}.`,
              learn: "Even a short visit can do lasting science, for example with a seismometer that keeps listening for moonquakes.",
            },
            {
              id: "budget", label: "Budget", unit: "$M", type: "max", value: cost, limit: m.limits.budget,
              limitLabel: "Budget cap",
              why: `The lander costs $${cost}M, which is $${cost - m.limits.budget}M over budget.`,
              learn: "Weight-saving parts work, but every one of them costs money.",
            },
          ];
        },
  
        nasa: {
          name: "Apollo 11 Lunar Module 'Eagle'",
          design: {
            engine: "Throttleable descent engine, so the crew could hover and steer",
            tanks: "Propellant made up more than half of the lander's mass",
            ascent: "Separate ascent stage that lifted the crew back to lunar orbit",
            structure: "Built through a dedicated weight-reduction program (thinner skins, foil insulation)",
            science: "A simplified science package (seismometer + laser reflector) for the first landing",
            battery: "Silver-zinc batteries (no solar panels or fuel cells)",
          },
          why: [
            "During development the Lunar Module was over its mass target. The builder, Grumman, ran a dedicated weight-reduction program that shaved off weight wherever possible.",
            "Because of the rocket equation, every kilogram removed from the lander lets the same fuel produce more Δv. That's why lightening the lander often beats adding fuel.",
            "Apollo 11 carried a smaller, simplified science package because the first moonwalk was short. Later Apollo missions, with longer stays, carried the full ALSEP experiment stations.",
            "On 20 July 1969, Neil Armstrong flew past a boulder field to find a safe spot and landed with well under a minute of descent fuel to spare. The throttleable engine made that possible.",
          ],
          sources: [
            { label: "NASA: Apollo 11 mission", url: "https://www.nasa.gov/mission/apollo-11/" },
            { label: "NASA: Design and Develop Science Missions", url: "https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf" },
          ],
        },
      },
    ];
  
    /* Expose globally so the page works by just double-clicking index.html
       (ES modules would need a local web server). */
    (typeof window !== "undefined" ? window : globalThis).MISSIONS = MISSIONS;
  })();
