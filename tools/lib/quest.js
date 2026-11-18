// Общее для инструментов: загрузить квест, каталог, логику движка в vm.
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var ROOT = path.join(__dirname, "..", "..");

function questDir(slug) { return path.join(ROOT, "quests", slug); }
function loadQuest(slug) {
    var f = path.join(questDir(slug), "quest.json");
    if (!fs.existsSync(f)) { throw new Error("нет квеста: " + f); }
    return JSON.parse(fs.readFileSync(f, "utf8"));
}
var _cat = null;
function catalog() { if (!_cat) { _cat = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "catalog.json"), "utf8")); } return _cat; }
function sizes() { var c = catalog().models, o = {}; Object.keys(c).forEach(function (k) { o[k] = c[k].size; }); return o; }

// логика движка (engine/js/logic.js + layout.js) поверх данных квеста — как в браузере
function engine(quest) {
    var ctx = { QUEST: JSON.parse(JSON.stringify(quest)), console: console, Buffer: Buffer };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "engine", "js", "logic.js"), "utf8"), ctx, { filename: "logic.js" });
    vm.runInContext(fs.readFileSync(path.join(ROOT, "engine", "js", "layout.js"), "utf8"), ctx, { filename: "layout.js" });
    return ctx;
}

// пиктограммы: квестовые (quests/<slug>/pictos) перекрывают библиотеку (assets/pictos)
function pictoPath(slug, id) {
    var a = path.join(questDir(slug), "pictos", id + ".svg");
    if (fs.existsSync(a)) { return a; }
    var b = path.join(ROOT, "assets", "pictos", id + ".svg");
    return fs.existsSync(b) ? b : null;
}

// все тексты квеста с адресом источника: npc:<id>:<i> | sign:<id>:<i> | quest:<id> | mystery:<i> | finale:<i> | zone:<id>
function texts(q) {
    var out = [];
    Object.keys(q.npcs).forEach(function (id) { q.npcs[id].lines.forEach(function (l, i) { out.push({ src: "npc:" + id + ":" + i, t: l.t, line: l }); }); });
    Object.keys(q.signs || {}).forEach(function (id) { q.signs[id].lines.forEach(function (l, i) { out.push({ src: "sign:" + id + ":" + i, t: l }); }); });
    (q.quests || []).forEach(function (qq) {
        out.push({ src: "quest:" + qq.id, t: qq.ask });
        if (qq.parts) { out.push({ src: "quest:" + qq.id, t: qq.parts.map(function (p) { return typeof p === "string" ? p : "[[" + p.w + "|" + (p.a[0] || "") + "]]"; }).join("") }); }
        out.push({ src: "quest:" + qq.id, t: qq.thanks });
        if (qq.remind) { out.push({ src: "quest:" + qq.id, t: qq.remind }); }
    });
    // лавки: товар на прилавке — тоже место, где игрок видит слово
    Object.keys(q.npcs).forEach(function (id) { (q.npcs[id].shop || []).forEach(function (s, i) { var it = (q.items || {})[s.item]; if (it) { out.push({ src: "shop:" + id + ":" + i, t: it.gr }); } }); });
    Object.keys(q.items || {}).forEach(function (id) { out.push({ src: "item:" + id, t: q.items[id].gr, nameOnly: true }); });
    if (q.mystery) { q.mystery.lines.forEach(function (l, i) { out.push({ src: "mystery:" + i, t: l }); }); }
    if (q.finale) { (q.finale.lines || []).forEach(function (l, i) { out.push({ src: "finale:" + i, t: l.t }); }); if (q.finale.epilogue && q.finale.epilogue.last) { out.push({ src: "epilogue", t: q.finale.epilogue.last }); } }
    q.world.zones.forEach(function (z) { out.push({ src: "zone:" + z.id, t: z.name, nameOnly: true }); });
    return out;
}

module.exports = { ROOT: ROOT, questDir: questDir, loadQuest: loadQuest, catalog: catalog, sizes: sizes, engine: engine, pictoPath: pictoPath, texts: texts };
