// Каталог моделей: assets/kenney/<kit>/*.glb -> assets/catalog.json
// Габариты и анимации читаются из файлов, теги — по набору (среда) и по имени (что модель «показывает»).
// Ручные уточнения — assets/catalog.overrides.json: { "kit/name": { tags:[], shows:[], scale:{...}, note } }.
// Запуск: node tools/catalog.js
"use strict";
var fs = require("fs");
var path = require("path");
var glb = require("./lib/glb.js");
var root = path.join(__dirname, "..");
var base = path.join(root, "assets", "kenney");

// набор -> откуда, среды
var KITS = {
    chars:  { title: "Kenney Mini Characters", env: ["people"] },
    sub:    { title: "Kenney City Kit (Suburban)", env: ["urban", "suburban", "village"] },
    com:    { title: "Kenney City Kit (Commercial)", env: ["urban", "city"] },
    food:   { title: "Kenney Food Kit", env: ["food", "indoor-home", "indoor-public", "market"] },
    nat:    { title: "Kenney Nature Kit", env: ["nature", "rural", "park", "coast", "mountain", "forest"] },
    furn:   { title: "Kenney Furniture Kit", env: ["indoor-home", "indoor-public"] },
    boat:   { title: "Kenney Watercraft Kit", env: ["coast", "water", "transport", "port"] },
    town:   { title: "Kenney Fantasy Town Kit", env: ["village", "market", "old-town", "rural"] },
    pirate: { title: "Kenney Pirate Kit", env: ["coast", "port", "island", "beach"] },
    car:    { title: "Kenney Car Kit", env: ["urban", "transport", "road"] },
    surv:   { title: "Kenney Survival Kit", env: ["camp", "nature", "rural", "forest"] },
    holi:   { title: "Kenney Holiday Kit", env: ["winter", "holiday", "village"] },
    train:  { title: "Kenney Train Kit", env: ["transport", "station", "rail"] },
};

// слово в имени файла -> понятия (англ. теги, по ним генератор ищет модели под слова)
var RULES = [
    [/^character|^char-/, ["person", "character"]],
    [/female/, ["woman"]], [/male(?!-)|male-/, ["man"]],
    [/building|house|home/, ["building", "house"]],
    [/skyscraper|tower/, ["tall-building", "tower"]],
    [/shop|store|market|stall/, ["shop", "market", "stall"]],
    [/tree|pine|palm|oak|birch/, ["tree"]], [/palm/, ["palm", "beach"]], [/pine/, ["pine", "mountain", "winter"]],
    [/bush|hedge|plant(?!er)|grass|flower|lily|mushroom/, ["plant"]], [/flower/, ["flower"]],
    [/rock|stone|cliff/, ["rock"]], [/mountain|cliff/, ["mountain"]],
    [/fence|gate|wall|railing/, ["fence"]], [/gate|door/, ["gate"]],
    [/bench|chair|stool|sofa|couch|seat/, ["seat"]], [/bench/, ["bench"]], [/chair|stool/, ["chair"]], [/sofa|couch|lounge/, ["sofa"]],
    [/table|desk|bar/, ["table"]], [/desk/, ["desk"]],
    [/bed(?!room)/, ["bed"]], [/bath|toilet|shower|sink/, ["bathroom"]],
    [/kitchen|stove|oven|fridge|fridge|sink|cabinet/, ["kitchen"]], [/stove|oven/, ["stove"]], [/fridge/, ["fridge"]],
    [/book|shelf|bookcase/, ["books"]], [/lamp|lantern|light/, ["lamp"]],
    [/tv|television|computer|laptop|radio|speaker/, ["electronics"]],
    [/rug|carpet/, ["rug"]], [/plant|potted/, ["houseplant"]], [/window|curtain/, ["window"]],
    [/boat|ship|canoe|kayak|yacht|liner|tug|tow/, ["boat", "transport"]], [/sail/, ["sailboat"]], [/fishing/, ["fishing"]],
    [/dock|pier|bridge|plank/, ["pier"]], [/buoy/, ["buoy"]], [/barrel|crate|chest|cargo|box/, ["container", "cargo"]],
    [/car|truck|van|taxi|bus|police|ambulance|firetruck|sedan|suv|race/, ["vehicle", "car"]], [/taxi/, ["taxi"]], [/bus/, ["bus"]], [/truck|van|delivery/, ["truck"]], [/police/, ["police"]], [/ambulance/, ["ambulance", "hospital"]],
    [/train|wagon|locomotive|rail|track|station/, ["train", "rail"]],
    [/tent|campfire|fire|axe|bedroll|backpack/, ["camping"]],
    [/fountain/, ["fountain"]], [/well/, ["well"]], [/mill/, ["mill"]], [/cart|wheel/, ["cart"]],
    [/road|path|street|sidewalk|crossing/, ["road"]], [/sign|banner|flag/, ["sign"]],
    [/snow|ice|present|gift|candy|xmas|christmas|reindeer|sled/, ["winter", "holiday"]],
    // еда
    [/apple|banana|orange|lemon|pear|grape|cherry|strawberry|melon|pineapple|coconut|avocado|fruit|peach/, ["fruit", "food"]],
    [/carrot|tomato|potato|onion|pepper|corn|cabbage|lettuce|broccoli|eggplant|pumpkin|cucumber|mushroom|vegetable|salad/, ["vegetable", "food"]],
    [/bread|loaf|bun|croissant|baguette|donut|cake|pie|cookie|muffin|pancake|waffle/, ["bakery", "food"]],
    [/(^|-)fish($|-)|shrimp|sushi|crab|lobster|octopus/, ["fish", "food"]],
    [/meat|steak|sausage|ham|chicken|bacon|burger|hotdog|pizza|taco|sandwich|fries|kebab|stew/, ["meal", "food"]],
    [/cheese|egg|milk|butter|yogurt/, ["dairy", "food"]],
    [/coffee|tea|cup|mug|glass|bottle|wine|soda|juice|water|can-/, ["drink"]], [/coffee/, ["coffee"]], [/wine/, ["wine"]],
    [/plate|bowl|pan|pot|knife|fork|spoon|cutting|utensil|whisk|ladle|rolling/, ["tableware", "kitchen"]],
    [/ice-cream|icecream|popsicle|candy|chocolate|lollipop/, ["sweets", "food"]],
];

var overrides = {};
try { overrides = JSON.parse(fs.readFileSync(path.join(root, "assets", "catalog.overrides.json"), "utf8")); } catch (e) { /* нет уточнений */ }

var out = { generated: "tools/catalog.js", note: "Не править руками: уточнения — в assets/catalog.overrides.json", kits: {}, models: {} };
var n = 0, bytes = 0;
Object.keys(KITS).forEach(function (kit) {
    var dir = path.join(base, kit);
    if (!fs.existsSync(dir)) { return; }
    var k = KITS[kit];
    out.kits[kit] = { title: k.title, env: k.env, license: "CC0 (assets/kenney/" + kit + "/License.txt)", texture: fs.existsSync(path.join(dir, "colormap.png")) ? "colormap.png" : null };
    fs.readdirSync(dir).filter(function (f) { return /\.glb$/.test(f); }).sort().forEach(function (f) {
        var name = f.replace(/\.glb$/, ""), id = kit + "/" + name;
        var i;
        try { i = glb.info(path.join(dir, f)); } catch (e) { console.warn("пропуск " + id + ": " + e.message); return; }
        var tags = {};
        k.env.forEach(function (t) { tags[t] = 1; });
        var low = name.toLowerCase();
        RULES.forEach(function (r) { if (r[0].test(low)) { r[1].forEach(function (t) { tags[t] = 1; }); } });
        var e = { size: i.size, kb: Math.round(i.bytes / 1024), tags: Object.keys(tags) };
        if (i.anims.length) { e.anims = i.anims; }
        if (i.bones.length) { e.rigged = true; }
        var o = overrides[id];
        if (o) { Object.keys(o).forEach(function (key) { e[key] = key === "tags" ? e.tags.concat(o.tags.filter(function (t) { return e.tags.indexOf(t) < 0; })) : o[key]; }); }
        out.models[id] = e;
        n++; bytes += i.bytes;
    });
});
fs.writeFileSync(path.join(root, "assets", "catalog.json"), JSON.stringify(out, null, 1));
console.log("catalog.json: " + n + " моделей в " + Object.keys(out.kits).length + " наборах, " + (bytes / 1048576).toFixed(1) + " МБ исходников");
