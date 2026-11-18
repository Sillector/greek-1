// Упаковка моделей Kenney (CC0) в js/models.js, чтобы игра открывалась двойным щелчком (file://).
// Запуск: node tools/pack-models.js
// Источник — распакованные архивы в _downloads/. Берём только модели из списка ниже.
"use strict";
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var dl = path.join(root, "_downloads");

// kit: каталог набора и папка формата; tex: есть ли внешняя текстура colormap.png
var KITS = {
    chars: { dir: "mini-characters/Models/GLB format", tex: true },
    sub:   { dir: "city-kit-suburban/Models/GLB format", tex: true },
    com:   { dir: "city-kit-commercial/Models/GLB format", tex: true },
    food:  { dir: "food-kit/Models/GLB format", tex: true },
    nat:   { dir: "nature-kit/Models/GLTF format", tex: false },
    furn:  { dir: "furniture-kit/Models/GLTF format", tex: false },
};

var LIST = {
    chars: ["character-worker", "character-male-g", "character-female-b", "character-male-e", "character-female-d", "character-female-c", "character-male-f"],
    sub: ["building-type-c", "building-type-m", "building-type-t", "building-type-k", "building-type-o", "fence-1x3", "fence-low", "planter", "path-stones-long", "tree-large", "tree-small"],
    com: ["building-a", "building-c", "building-e", "building-k", "building-f", "building-g", "building-h", "detail-awning-wide", "detail-parasol-a", "detail-parasol-b"],
    food: ["lemon", "loaf", "salad", "plate-dinner", "cup-coffee", "pot-stew", "wine-red", "fish", "bread", "tomato", "pan-stew", "frying-pan"],
    nat: ["tree_oak", "tree_default", "tree_detailed", "tree_fat", "tree_simple", "plant_bush", "plant_bushLarge", "plant_bushDetailed", "flower_redA", "flower_yellowA", "flower_purpleA", "statue_column", "rock_smallA", "grass", "grass_large", "pot_large", "lily_large", "stump_round", "fence_simple", "fence_gate"],
    furn: ["kitchenStove", "kitchenCabinet", "kitchenFridgeSmall", "kitchenSink", "table", "tableRound", "chair", "chairCushion", "bench", "bookcaseOpen", "bookcaseOpenLow", "books", "pottedPlant", "plantSmall2", "rugRound", "desk", "chairDesk", "kitchenBar", "rugRectangle", "lampRoundTable", "bookcaseClosedWide", "sideTable", "kitchenCabinetUpper", "loungeSofa", "tableCloth"],
};

var out = { kits: {}, glb: {} };
var total = 0, missing = [];
Object.keys(LIST).forEach(function (kit) {
    var k = KITS[kit];
    if (k.tex) {
        var png = fs.readFileSync(path.join(dl, k.dir, "Textures", "colormap.png"));
        out.kits[kit] = "data:image/png;base64," + png.toString("base64");
        total += png.length;
    }
    LIST[kit].forEach(function (name) {
        var f = path.join(dl, k.dir, name + ".glb");
        if (!fs.existsSync(f)) { missing.push(kit + "/" + name); return; }
        var b = fs.readFileSync(f);
        total += b.length;
        out.glb[kit + "/" + name] = { kit: kit, b64: b.toString("base64") };
    });
});
if (missing.length) { console.error("Нет файлов: " + missing.join(", ")); process.exit(1); }
var js = "// Модели Kenney (CC0, www.kenney.nl), упакованы tools/pack-models.js — не править руками.\n" +
    "window.MODELS = " + JSON.stringify(out) + ";\n";
fs.writeFileSync(path.join(root, "js", "models.js"), js);
console.log("models.js: " + Object.keys(out.glb).length + " моделей, исходно " + (total / 1048576).toFixed(2) + " МБ, файл " + (js.length / 1048576).toFixed(2) + " МБ");
