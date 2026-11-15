/* =====================================================================
   Space Mission Cube — difficulty levels
   ---------------------------------------------------------------------
   Each level has its own page (beginner.html, intermediate.html,
   advanced.html). The page says which level it is in
   <html data-level="…">, and this file gives the rest of the game the
   settings for that level:

                     Beginner        Intermediate     Advanced
   Words             simple + word   full terms +     full technical
                     helper          word helper      terms
   Dangers per scan  exactly 5       5–7              7–9
   Severity in feed  shown           shown            hidden until you open it
   Vulnerabilities   top 2 per part  all              all
   Workshop          Easy mode       Easy mode on     Easy mode off,
                     always on       (can turn off)   1 hint, numbers open
   Moon landing      ≤ 5 m/s, +35%   ≤ 4 m/s          ≤ 3 m/s, −10% fuel
                     fuel
   Rover battery     drains slower   normal           drains faster
   ===================================================================== */

(function () {
  const id = (document.documentElement.dataset.level || "intermediate").toLowerCase();
  const LEVELS = {
    beginner: {
      id: "beginner", name: "Beginner", icon: "🌱",
      dangers: [5, 5], scanMs: [340, 480], dangerMs: 1100, sevInFeed: true, simple: true, glossary: true, maxVulns: 2,
      readings: "simple", easyLocked: true, easyDefault: true, hints: Infinity, numbersOpen: false,
      landSpeed: 5, fuelMul: 1.35, roverDrain: 0.6, telescopeHint: true,
    },
    intermediate: {
      id: "intermediate", name: "Intermediate", icon: "🚀",
      dangers: [5, 7], scanMs: [170, 290], dangerMs: 700, sevInFeed: true, simple: false, glossary: true, maxVulns: 99,
      readings: "normal", easyLocked: false, easyDefault: true, hints: Infinity, numbersOpen: false,
      landSpeed: 4, fuelMul: 1, roverDrain: 1, telescopeHint: false,
    },
    advanced: {
      id: "advanced", name: "Advanced", icon: "🧑‍🚀",
      dangers: [7, 9], scanMs: [90, 150], dangerMs: 450, sevInFeed: false, simple: false, glossary: false, maxVulns: 99,
      readings: "technical", easyLocked: false, easyDefault: false, hints: 1, numbersOpen: true,
      landSpeed: 3, fuelMul: 0.9, roverDrain: 1.3, telescopeHint: false,
    },
  };
  const L = LEVELS[id] || LEVELS.intermediate;
  try { localStorage.setItem("smc-level", L.id); } catch (e) { /* ignore */ }

  /* ---------- Beginner: every part explained in simple words ----------
     Looked up as "<spacecraft id>:<part id>" first, then just "<part id>". */
  const SIMPLE = {
    // Mars rovers (Curiosity and Perseverance share many parts)
    body: "The main box of the rover. It keeps the computers and lab tools warm and safe.",
    wheels: "The six metal wheels that roll the rover over rocks and sand.",
    suspension: "The bendy leg system that keeps all six wheels on the ground when driving over bumpy rocks.",
    mmrtg: "The rover's power plant. Heat from a small amount of radioactive material is turned into electricity, day and night.",
    battery: "Rechargeable batteries, like a phone's, for moments that need extra power.",
    mast: "The rover's \"neck\". It holds the cameras up high so the rover can look around.",
    navcam: "Black-and-white cameras that help the rover see where it is safe to drive.",
    hazcam: "Low cameras that spot rocks and holes right next to the wheels.",
    hga: "A dish antenna that talks straight to Earth.",
    uhf: "A radio that sends data up to spacecraft circling Mars, which pass it on to Earth.",
    lga: "A small backup antenna for simple messages.",
    arm: "The robot arm. It holds tools against rocks, like a geologist's hand.",
    turret: "The \"hand\" at the end of the arm, holding a drill, a close-up camera and other tools.",
    chemcam: "A laser that zaps rocks from far away to find out what they are made of.",
    mastcam: "Colour cameras that take photos and videos of Mars.",
    rems: "A small weather station: wind, temperature, air pressure and humidity.",
    sam: "A mini chemistry lab that heats rock powder to look for chemicals linked to life.",
    chemin: "A tool that shines X-rays through rock powder to find out which minerals it contains.",
    rad: "A sensor that measures the harmful space radiation that reaches Mars.",
    dan: "A sensor that looks for water hidden in the ground.",
    supercam: "A laser that zaps rocks from far away to study them. Its microphone recorded sounds on Mars.",
    mastcamz: "Colour cameras that can zoom and take 3D photos.",
    meda: "A weather station: wind, temperature, dust and sunlight.",
    caching: "A robot inside the rover that seals rock samples in tubes for a possible future trip to Earth.",
    moxie: "An experiment that made oxygen out of the Martian air.",
    rimfax: "A radar that sees layers of rock underground.",
    ingenuity: "A small helicopter: the first aircraft to fly on another planet.",
    // James Webb
    "jwst:primary": "The giant gold mirror that collects light from very faraway galaxies.",
    wings: "The two sides of the mirror, folded back so it could fit inside the rocket.",
    "jwst:secondary": "A small mirror that bounces the light back towards the cameras.",
    struts: "Three long arms that hold the small mirror in place.",
    backplane: "The stiff frame that holds all the mirror pieces.",
    isim: "The box of cameras and science tools behind the mirror.",
    radiators: "Black panels that let heat escape into space to keep the cameras cold.",
    cryocooler: "A refrigerator that makes one camera (MIRI) extra cold.",
    sunshield: "A five-layer sunshade the size of a tennis court that blocks the Sun's heat.",
    pallets: "Fold-out supports that pulled the sunshield open.",
    flap: "A small flap that helps balance the gentle push of sunlight.",
    "jwst:bus": "The \"engine room\": computer, fuel, thrusters and power controls.",
    "jwst:solar": "A solar panel that turns sunlight into electricity.",
    "jwst:hga": "A dish antenna that sends pictures back to Earth.",
    trackers: "Small cameras that look at stars to tell which way the telescope is pointing.",
    thrusters: "Small rockets that keep the telescope in the right place.",
    tower: "A pole that pushes the cold telescope away from the warm engine room.",
    adapter: "The ring that attached the telescope to the top of its rocket.",
    // Hubble
    door: "A lid that can close to protect the telescope from bright sunlight.",
    tube: "The long tube that blocks stray light and holds the mirrors.",
    "hubble:primary": "The main mirror, 2.4 m wide, that collects light.",
    "hubble:secondary": "A smaller mirror that sends the light to the cameras.",
    instruments: "The cameras and science tools at the back of the telescope.",
    nicmos: "An infrared camera that needed to be kept very cold.",
    fgs: "Sensors that lock onto stars so Hubble can hold perfectly still.",
    gyros: "Spinning sensors that tell Hubble how it is turning.",
    "hubble:solar": "Two solar panel wings that make electricity.",
    "hubble:batteries": "Batteries that keep Hubble running while it passes through Earth's shadow.",
    "hubble:hga": "Two dish antennas that send data back to Earth.",
    aft: "The back section, with doors astronauts opened to swap instruments.",
    equip: "The middle ring holding the computers, batteries and radios.",
    handrails: "Yellow rails that astronauts held onto during spacewalks.",
    trunnions: "Pins that held Hubble inside the Space Shuttle during launch.",
    // Apollo Lunar Module
    descent: "The bottom half: the landing engine, fuel and legs. It stayed on the Moon.",
    legs: "Four legs that soaked up the bump of landing.",
    footpads: "Wide feet that stop the lander sinking into Moon dust.",
    probes: "Long sensors under the feet that turned on a light when they touched the Moon.",
    ladder: "The ladder Neil Armstrong climbed down to step onto the Moon.",
    de: "The landing engine. It could be turned up and down to land gently.",
    dtanks: "Tanks holding the fuel for landing.",
    mesa: "A fold-down shelf with tools, a TV camera and rock boxes.",
    easep: "Science experiments left on the Moon, including a mirror for laser beams from Earth.",
    landingradar: "A radar that measured how high and how fast the lander was going.",
    "apollo-lm:ascent": "The top half: a small cabin for two astronauts. It flew back up to lunar orbit.",
    ae: "The engine that launched the cabin off the Moon.",
    windows: "Small triangle windows the crew looked through while landing.",
    hatch: "The square door the astronauts crawled through to get outside.",
    dock: "The tunnel on top that joined the Command Module, so the crew could move between them.",
    rcs: "Small thrusters that turned and steered the lander.",
    radar: "A radar that tracked the Command Module so the lander could meet up with it again.",
    sband: "A dish antenna that sent voices, data and TV pictures to Earth.",
    "apollo-lm:batteries": "Batteries that powered the lander (it had no solar panels).",
  };
  const simple = (craftId, item) => SIMPLE[craftId + ":" + item.id] || SIMPLE[item.id] || null;

  /* ---------- The word helper (glossary) ---------- */
  const GLOSSARY = [
    ["MMRTG", "Multi-Mission Radioisotope Thermoelectric Generator: a nuclear power source that turns heat from decaying plutonium-238 into electricity."],
    ["plutonium-238", "A radioactive material that gives off steady heat for decades as it slowly decays."],
    ["thermocouples?", "Junctions of two different metals that make electricity when one side is hot and the other is cold."],
    ["gimbals?", "Pivoting mounts that let an antenna or engine point in different directions."],
    ["actuators?", "Small motors that move or adjust a part."],
    ["cryocoolers?", "Refrigerators that cool instruments to extremely low temperatures."],
    ["infrared", "Light with longer waves than red light. We can't see it, but we feel it as heat."],
    ["beryllium", "A light, stiff metal that keeps its shape when it is very cold."],
    ["micrometeoroids?", "Specks of space dust or rock, usually smaller than a grain of sand, moving extremely fast."],
    ["spectrographs?|spectrometers?", "Instruments that split light into its colours to work out what something is made of."],
    ["organic molecules", "Carbon-based chemicals. They are building blocks of life, but they can also form without life."],
    ["Deep Space Network", "NASA's giant radio dishes in California, Spain and Australia that talk to distant spacecraft."],
    ["solar conjunction", "When the Sun is between Earth and Mars and blocks radio signals."],
    ["orbiters?", "Spacecraft that circle a planet or moon."],
    ["L2", "A point in space about 1.5 million km from Earth, on the side facing away from the Sun. A spacecraft there stays lined up with Earth as both go around the Sun."],
    ["Kapton", "A thin, tough plastic film that survives very hot and very cold temperatures."],
    ["hypergolic", "Describes a fuel and an oxidiser that ignite as soon as they touch, so no spark is needed."],
    ["throttleable", "Able to be turned up or down, like a car's accelerator."],
    ["Δv|delta-v", "\"Delta-v\": how much a spacecraft can change its speed using all of its fuel."],
    ["Isp", "Specific impulse: how efficiently a rocket engine uses its propellant. Higher is better."],
    ["fairing", "The nose cone that protects a spacecraft inside the rocket during launch."],
    ["corrective optics", "Extra mirrors added in 1993 to cancel out the shape error in Hubble's main mirror."],
    ["gyroscopes?|gyros", "Spinning sensors that measure how a spacecraft is turning."],
    ["reaction wheels?", "Spinning wheels that turn a spacecraft by speeding up or slowing down, without using fuel."],
    ["safe mode", "A protective state where a spacecraft pauses its normal work and waits for instructions from Earth."],
    ["grousers?", "Raised treads on a wheel that give it grip."],
    ["rocker-bogie", "A suspension design that lets a rover's wheels climb over obstacles while all six stay on the ground."],
    ["RCS", "Reaction Control System: small thrusters that turn and steer a spacecraft."],
    ["X-rays?", "Very high-energy light that can pass through many materials."],
    ["radiation", "Energy travelling as light or tiny particles. Space radiation can damage electronics and living things."],
    ["thrusters?", "Small rocket engines used to steer or make small moves."],
    ["oxidiser", "The chemical that lets fuel burn (on Earth, oxygen in the air does this job)."],
  ];
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* Turns plain text into HTML where tricky words get a dotted underline and a pop-up definition */
  // one pass over the plain text, so definitions never get matched inside each other
  const COMBINED = new RegExp("(^|[^\\w\\-])(" + GLOSSARY.map(([p]) => "(" + p + ")").join("|") + ")(?![\\w])", "gi");
  function glossify(text) {
    text = String(text);
    if (!L.glossary) return escapeHtml(text);
    const used = new Set();
    let out = "", last = 0, m;
    COMBINED.lastIndex = 0;
    while ((m = COMBINED.exec(text))) {
      const start = m.index + m[1].length, word = m[2];
      let i = 0;
      while (i < GLOSSARY.length && m[3 + i] === undefined) i++;
      out += escapeHtml(text.slice(last, start));
      if (!used.has(i)) {
        used.add(i);
        out += `<span class="gloss" tabindex="0" data-def="${escapeHtml(GLOSSARY[i][1])}">${escapeHtml(word)}</span>`;
      } else out += escapeHtml(word);
      last = start + word.length;
      if (COMBINED.lastIndex === m.index) COMBINED.lastIndex++;
    }
    return out + escapeHtml(text.slice(last));
  }

  /* ---------- Diagnostic readings in the right style for the level ---------- */
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const SIMPLE_SYMPTOMS = ["it is getting too hot", "it is shaking more than it should", "it is using too much power", "it failed a safety check",
    "it is wearing out", "its signal is weak", "it is not responding properly", "it is moving more slowly than it should"];
  const METRICS = [
    () => `sensor readings ${rnd(12, 48)}% outside safe limits`, () => `temperature ${rnd(6, 31)} °C above the limit`,
    () => `vibration ${(1.6 + Math.random() * 2.4).toFixed(1)}× normal`, () => `current draw up ${rnd(14, 60)}%`,
    () => `self-test failed ${rnd(1, 3)} of 5 checks`, () => `signal noise ${(1.8 + Math.random() * 3).toFixed(1)}× normal`,
    () => `wear indicator at ${rnd(71, 96)}%`, () => `response ${rnd(2, 9)}× slower than spec`, () => `pressure ${rnd(8, 35)}% off target`,
  ];
  const TECH = [
    () => `TLM ${["T", "V", "I", "P"][rnd(0, 3)]}-${rnd(100, 899)} out of limits (${rnd(12, 48)}% beyond red line)`,
    () => `thermal: +${rnd(6, 31)} °C over the operating limit, heater duty cycle ${rnd(70, 100)}%`,
    () => `vibration ${(1.6 + Math.random() * 2.4).toFixed(1)} g RMS (limit ${(0.8 + Math.random() * 0.6).toFixed(1)} g)`,
    () => `bus current +${rnd(14, 60)}% vs. nominal, possible short`,
    () => `built-in test: ${rnd(1, 3)}/5 checks failed`,
    () => `link margin down ${rnd(3, 9)} dB, bit error rate rising`,
    () => `motor current ${rnd(2, 4)}× nominal, possible bearing wear`,
    () => `pressure ${rnd(8, 35)}% off setpoint, possible leak`,
  ];
  function reading(item, vuln) {
    if (L.readings === "simple") return `${vuln[1]}: ${pick(SIMPLE_SYMPTOMS)}.`;
    if (L.readings === "technical") return `[FDIR ${rnd(10, 99)}-${rnd(100, 999)}] ${vuln[1]}: ${pick(TECH)()}.`;
    return `${vuln[1]} risk: ${pick(METRICS)()}.`;
  }

  window.LEVEL = Object.assign({}, L, { all: LEVELS, simpleFor: simple, glossify, reading });
})();
