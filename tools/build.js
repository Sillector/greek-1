// Сборка игры: quests/<slug>/quest.json + engine/ + нужные модели и пиктограммы -> games/<slug>/ (самодостаточная папка).
// Запуск: node tools/build.js <slug> [--force]  (без --force сначала зовёт validate и не собирает при ошибках)
// Игра открывается двойным щелчком (file://), с флешки, из любой папки и в iframe: все пути относительные, сеть не нужна.
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var L = require("./lib/quest.js");

var slug = process.argv[2];
if (!slug) { console.error("использование: node tools/build.js <slug> [--force]"); process.exit(2); }
var force = process.argv.indexOf("--force") > 0;
if (!force) {
    var v = cp.spawnSync(process.execPath, [path.join(__dirname, "validate.js"), slug], { encoding: "utf8" });
    if (v.status !== 0) { process.stdout.write(v.stdout + v.stderr); console.error("\nСборка остановлена: validate не прошёл (или --force)."); process.exit(1); }
}
var q = L.loadQuest(slug);
var ROOT = L.ROOT, OUT = path.join(ROOT, "games", slug), ENG = path.join(ROOT, "engine");
var cat = L.catalog();

function rmrf(p) { if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); } }
function mkdir(p) { fs.mkdirSync(p, { recursive: true }); }
function copy(a, b) { mkdir(path.dirname(b)); fs.copyFileSync(a, b); }
rmrf(OUT); mkdir(OUT);

// ---------------------------------------------------------------- модели: всё, на что ссылается квест, + то, что движок ставит сам
var ENGINE_MODELS = ["chars/character-worker", "furn/tableRound", "furn/chairCushion", "nat/fence_simple", "nat/fence_gate"];
var used = {};
ENGINE_MODELS.forEach(function (m) { used[m] = 1; });
JSON.stringify(q, function (k, v2) { if (typeof v2 === "string" && cat.models[v2]) { used[v2] = 1; } return v2; });
q.world.zones.forEach(function (z) {
    if (z.border && z.border.type && z.border.type !== "none") {
        used[z.border.model || (z.border.type === "hedge" ? "town/hedge" : z.border.type === "wall" ? "town/wall-half" : "nat/fence_simple")] = 1;
        used[z.border.gateModel || "nat/fence_gate"] = 1;
    }
});
((q.world.env || {}).backdrop || []).forEach(function (b) {
    if (b.kind === "city") { ["com/building-k", "com/building-h", "com/building-g", "com/building-f", "com/building-e", "com/building-a"].forEach(function (m) { used[m] = 1; }); }
    if (b.kind === "forest") { ["nat/tree_pineDefaultA", "nat/tree_default"].forEach(function (m) { used[m] = 1; }); }
});
var kits = {}, glb = {}, total = 0;
Object.keys(used).sort().forEach(function (id) {
    var kit = id.split("/")[0], name = id.slice(kit.length + 1);
    var f = path.join(ROOT, "assets", "kenney", kit, name + ".glb");
    if (!fs.existsSync(f)) { console.error("нет файла модели: " + f); process.exit(1); }
    var b = fs.readFileSync(f); total += b.length;
    glb[id] = { kit: kit, b64: b.toString("base64") };
    if (!kits[kit]) {
        var png = path.join(ROOT, "assets", "kenney", kit, "colormap.png");
        kits[kit] = fs.existsSync(png) ? "data:image/png;base64," + fs.readFileSync(png).toString("base64") : null;
    }
});
Object.keys(kits).forEach(function (k) { if (!kits[k]) { delete kits[k]; } });
mkdir(path.join(OUT, "data"));
var modelsJs = "// Модели Kenney (CC0, www.kenney.nl) для «" + q.meta.title + "», собраны tools/build.js — не править руками.\nwindow.MODELS = " + JSON.stringify({ kits: kits, glb: glb }) + ";\n";
fs.writeFileSync(path.join(OUT, "data", "models.js"), modelsJs);

// ---------------------------------------------------------------- пиктограммы
var pics = {};
function addPic(id) { if (!id || pics[id]) { return; } var p = L.pictoPath(slug, id); if (p) { pics[id] = fs.readFileSync(p, "utf8").trim(); } else { console.warn("нет пиктограммы " + id); } }
Object.keys(q.words).forEach(function (w) { addPic(q.words[w].picto || w); });
q.world.zones.forEach(function (z) { addPic(z.picto); });
q.quests.forEach(function (x) { if (typeof x.pic === "string") { addPic(x.pic); } else { (x.pic || []).forEach(addPic); } });
Object.keys(q.items || {}).forEach(function (k) { addPic(q.items[k].picto); });
fs.writeFileSync(path.join(OUT, "data", "pictos.js"), "// Пиктограммы (assets/pictos + quests/" + slug + "/pictos), собраны tools/build.js.\nwindow.PICTOS = " + JSON.stringify(pics) + ";\n");

// ---------------------------------------------------------------- данные квеста: ответы — в обфусцированном виде
var key = q.meta.saveKey;
function enc(s) {
    var b = Buffer.from(String(s), "utf8"), o = Buffer.alloc(b.length);
    for (var i = 0; i < b.length; i++) { o[i] = b[i] ^ key.charCodeAt(i % key.length); }
    return "~" + o.toString("base64");
}
var data = JSON.parse(JSON.stringify(q));
delete data.claims;   // утверждения нужны только проверке
data.quests.forEach(function (x) { (x.parts || []).forEach(function (p) { if (typeof p === "object") { p.a = p.a.map(enc); } }); });
data.mystery.ru = data.mystery.ru.map(enc);
if (data.mystery.question) { data.mystery.question.answer = enc(data.mystery.question.answer); }
fs.writeFileSync(path.join(OUT, "data", "quest.js"), "// Квест «" + q.meta.title + "» (quests/" + slug + "/quest.json), собран tools/build.js. Ответы зашифрованы.\nvar QUEST = " + JSON.stringify(data) + ";\n");

// ---------------------------------------------------------------- движок, страница, лицензии
["logic.js", "layout.js", "art.js", "sound.js", "world.js", "ui.js"].forEach(function (f) { copy(path.join(ENG, "js", f), path.join(OUT, "js", f)); });
copy(path.join(ENG, "css", "game.css"), path.join(OUT, "css", "game.css"));
["three.min.js", "GLTFLoader.js"].forEach(function (f) { copy(path.join(ENG, "lib", f), path.join(OUT, "lib", f)); });
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
var theme = q.meta.theme ? ":root{" + Object.keys(q.meta.theme).map(function (k) { return "--" + k + ":" + q.meta.theme[k]; }).join(";") + "}" : "";
var html = fs.readFileSync(path.join(ENG, "template.html"), "utf8")
    .replace(/\{\{TITLE\}\}/g, esc(q.meta.title)).replace(/\{\{KICKER\}\}/g, esc(q.meta.kicker || "игра без переводчика"))
    .replace(/\{\{TITLE_GR\}\}/g, esc(q.meta.titleGr)).replace(/\{\{TITLE_RU\}\}/g, esc(q.meta.titleRu))
    .replace(/\{\{COVER_TEXT\}\}/g, esc(q.meta.cover)).replace(/\{\{MYSTERY_BTN\}\}/g, esc(q.meta.mysteryBtn))
    .replace(/\{\{MYSTERY_TITLE\}\}/g, esc(q.mystery.title)).replace(/\{\{THEME_CSS\}\}/g, theme);
fs.writeFileSync(path.join(OUT, "index.html"), html);
mkdir(path.join(OUT, "licenses"));
copy(path.join(ROOT, "assets", "licenses", "three.js-LICENSE.txt"), path.join(OUT, "licenses", "three.js-LICENSE.txt"));
var credits = ["«" + q.meta.title + "» — собрано движком game-greek.", "", "Модели: Kenney (www.kenney.nl), лицензия CC0:"];
Object.keys(glb).map(function (id) { return id.split("/")[0]; }).filter(function (k, i, a) { return a.indexOf(k) === i; }).forEach(function (kit) {
    copy(path.join(ROOT, "assets", "kenney", kit, "License.txt"), path.join(OUT, "licenses", "kenney-" + kit + "-License.txt"));
    credits.push("  " + (cat.kits[kit] ? cat.kits[kit].title : kit));
});
credits.push("", "3D: three.js r147 (MIT), licenses/three.js-LICENSE.txt");
fs.writeFileSync(path.join(OUT, "licenses", "CREDITS.txt"), credits.join("\n") + "\n");

// ---------------------------------------------------------------- итог
function du(p) { var s = 0; fs.readdirSync(p, { withFileTypes: true }).forEach(function (e) { var f = path.join(p, e.name); s += e.isDirectory() ? du(f) : fs.statSync(f).size; }); return s; }
console.log("games/" + slug + "/index.html — моделей " + Object.keys(glb).length + " (" + (total / 1048576).toFixed(1) + " МБ исходников), пиктограмм " + Object.keys(pics).length + ", папка " + (du(OUT) / 1048576).toFixed(1) + " МБ");
