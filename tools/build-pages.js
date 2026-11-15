/* Builds the three level pages from one template, so they always stay identical
   except for their level. Run from the project folder:   node tools/build-pages.js */
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..");
const tpl = fs.readFileSync(path.join(__dirname, "app-template.html"), "utf8");
const LEVELS = [
  { id: "beginner", name: "Beginner", icon: "🌱", title: "Beginner" },
  { id: "intermediate", name: "Intermediate", icon: "🚀", title: "Intermediate" },
  { id: "advanced", name: "Advanced", icon: "🧑‍🚀", title: "Advanced" },
];
for (const L of LEVELS) {
  const html = tpl.replace(/{{LEVEL}}/g, L.id).replace(/{{NAME}}/g, L.name).replace(/{{ICON}}/g, L.icon).replace(/{{TITLE}}/g, L.title);
  fs.writeFileSync(path.join(dir, L.id + ".html"), html);
  console.log("wrote " + L.id + ".html");
}
