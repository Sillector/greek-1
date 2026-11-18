// 3D-мир движка: three.js r147 (глобальный THREE) + модели Kenney (CC0) из models.js.
// Всё, что стоит в мире, строится из QUEST.world (зоны, предметы, тропы, вода, фон) — кода под конкретную игру здесь нет.
// Игрок управляет путником: WASD/стрелки, Shift — бегом, клик по земле — идти туда; E/пробел/F — говорить; Z/C или ПКМ — камера.
// Интерфейс (ui.js) зовёт WORLD.show / travel / anchor / talk / finale и получает onPick / onLoc / onLocked.
var WORLD = (function () {
    "use strict";
    var T = window.THREE;
    var api = { ok: false, timeScale: 1 };
    if (!T || !window.MODELS) { return api; }
    var W = QUEST.world, ENV = W.env || {};
    var CENTERS = LAYOUT.resolve(W);
    var ZBY = {};
    W.zones.forEach(function (z) { ZBY[z.id] = z; });

    var renderer, scene, camera, clock, holder, canvas;
    var hemi, sun, fill;
    var models = {}, kitTex = {};
    var hits = [];            // { obj, kind: npc|sign|door|mystery, id }
    var npcs = {};
    var signs = {};           // id -> { at: Vector3, zone }
    var doors = {};           // id -> { to, x, z, ... } — двери зданий и калитки зон
    var rooms = {};           // interiorId -> { c, w, d, door }
    var props = {};           // id предмета -> объект
    var cols = [];
    var walkRects = [];       // мостки над водой: тут вода не мешает
    var swayers = [], ticks = [], lamps = [], nightOnly = [], dayOnly = [], fadeWalls = [], blockers = [];
    var ready = false;
    var coverMode = true, night = ENV.time === "night", evening = ENV.time === "evening", finaleOn = false, inside = null;
    var hero = null;
    var keys = {};
    var path = [], pending = null;
    var camT = new T.Vector3(0, 1.3, 3), camYaw = 0, camGoalYaw = 0, camPitch = 0.62, camOverride = null;
    // по умолчанию — самый дальний вид; колесо приближает
    var ZOOM_MIN = 4.5, ZOOM_MAX = W.zoomMax || 19, camD = ZOOM_MAX, zoomD = ZOOM_MAX;
    var mouse = new T.Vector2(), ray = new T.Raycaster(), groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
    var onPick = null, onFrame = null, onLoc = null, onLocked = null;
    var lastLoc = null, lockedCool = 0, doorCool = 0;
    var tmpV = new T.Vector3(), tmpV2 = new T.Vector3();
    var bgDay, bgNight, bgEve, bgIn, stars, fadeEl, promptEl, hoverEl, marker;
    var near = null;
    var HERO_R = 0.36;
    var exitCam = null, EXIT_R = 5;
    var followMove = false, camZone = null, camGoalPitch = 0.62, moveYaw = 0, lastInKey = "0,0";
    var BOUND = W.bound || 0;
    var SPAWN = {};
    var LOG = "[" + (QUEST.meta.slug || "game") + "]";

    function rnd(seed) { var s = seed || 1; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
    function col(c) { return typeof c === "string" ? new T.Color(c).getHex() : c; }
    function mat(color, o) {
        o = o || {};
        return new T.MeshStandardMaterial({ color: col(color), roughness: o.r != null ? o.r : 0.85, metalness: 0, emissive: o.e || 0x000000, emissiveIntensity: o.ei || 1, transparent: !!o.op, opacity: o.op || 1, flatShading: !!o.flat });
    }
    function mesh(geo, m, x, y, z, parent) {
        var me = new T.Mesh(geo, m);
        me.position.set(x || 0, y || 0, z || 0);
        me.castShadow = true; me.receiveShadow = true;
        (parent || scene).add(me);
        return me;
    }
    function box(w, h, d, color, x, y, z, parent, o) { return mesh(new T.BoxGeometry(w, h, d), typeof color === "object" ? color : mat(color, o), x, y + h / 2, z, parent); }
    function cyl(rt, rb, h, color, x, y, z, parent, seg, o) { return mesh(new T.CylinderGeometry(rt, rb, h, seg || 12), typeof color === "object" ? color : mat(color, o), x, y + h / 2, z, parent); }
    function b64buf(b64) { var bin = atob(b64), n = bin.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) { u[i] = bin.charCodeAt(i); } return u.buffer; }
    function shadowAll(o) { o.traverse(function (c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); }
    function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
    function angWrap(a) { while (a > Math.PI) { a -= Math.PI * 2; } while (a < -Math.PI) { a += Math.PI * 2; } return a; }

    // ---------------------------------------------------------------- коллизии
    function colC(x, z, r, tag) { var c = { t: "c", x: x, z: z, r: r, tag: tag }; cols.push(c); return c; }
    function colB(x0, x1, z0, z1, tag) { var c = { t: "b", x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), tag: tag }; cols.push(c); return c; }
    function colObj(o, shrink, tag) {
        o.updateMatrixWorld(true);
        var bb = new T.Box3().setFromObject(o), s = shrink == null ? 0.1 : shrink;
        return colB(bb.min.x + s, bb.max.x - s, bb.min.z + s, bb.max.z - s, tag);
    }
    function onWalk(x, z) {
        for (var i = 0; i < walkRects.length; i++) { var r = walkRects[i]; if (x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3]) { return true; } }
        return false;
    }
    function skip(c, x, z) { return c.off || (c.tag === "water" && onWalk(x, z)); }
    function resolveP(p, r) {
        for (var pass = 0; pass < 3; pass++) {
            for (var i = 0; i < cols.length; i++) {
                var c = cols[i];
                if (skip(c, p.x, p.z)) { continue; }
                if (c.t === "c") {
                    var dx = p.x - c.x, dz = p.z - c.z, d = Math.sqrt(dx * dx + dz * dz), m = c.r + r;
                    if (d < m) { if (d < 1e-4) { dx = 1; dz = 0; d = 1; } p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
                } else {
                    var cx = Math.max(c.x0, Math.min(p.x, c.x1)), cz = Math.max(c.z0, Math.min(p.z, c.z1));
                    var ex = p.x - cx, ez = p.z - cz, e = Math.sqrt(ex * ex + ez * ez);
                    if (e < r) {
                        if (e > 1e-4) { p.x = cx + ex / e * r; p.z = cz + ez / e * r; }
                        else {
                            var l = p.x - c.x0, rr = c.x1 - p.x, t2 = p.z - c.z0, b = c.z1 - p.z, mn = Math.min(l, rr, t2, b);
                            if (mn === l) { p.x = c.x0 - r; } else if (mn === rr) { p.x = c.x1 + r; } else if (mn === t2) { p.z = c.z0 - r; } else { p.z = c.z1 + r; }
                        }
                    }
                }
            }
            bound(p, r);
        }
        return p;
    }
    function bound(p, r) {
        if (inside) { return; }
        var d = Math.sqrt(p.x * p.x + p.z * p.z), R = BOUND;
        if (d > R - r) { p.x *= (R - r) / d; p.z *= (R - r) / d; }
    }
    function blockedAt(x, z, r) {
        if (!inside && Math.sqrt(x * x + z * z) > BOUND - r) { return true; }
        for (var i = 0; i < cols.length; i++) {
            var c = cols[i];
            if (skip(c, x, z)) { continue; }
            if (c.t === "c") { if (dist2(x, z, c.x, c.z) < c.r + r) { return true; } }
            else { var cx = Math.max(c.x0, Math.min(x, c.x1)), cz = Math.max(c.z0, Math.min(z, c.z1)); if (dist2(x, z, cx, cz) < r) { return true; } }
        }
        return false;
    }

    // ---------------------------------------------------------------- поиск пути (A* по сетке 0.5 м)
    function findPath(sx, sz, gx, gz) {
        var C = 0.5, r = HERO_R + 0.06;
        var x0 = Math.min(sx, gx) - 10, z0 = Math.min(sz, gz) - 10, x1 = Math.max(sx, gx) + 10, z1 = Math.max(sz, gz) + 10;
        var W2 = Math.min(200, Math.ceil((x1 - x0) / C)), H = Math.min(200, Math.ceil((z1 - z0) / C));
        var cache = new Int8Array(W2 * H);
        function free(ix, iz) {
            if (ix < 0 || iz < 0 || ix >= W2 || iz >= H) { return false; }
            var k = iz * W2 + ix;
            if (!cache[k]) { cache[k] = blockedAt(x0 + (ix + 0.5) * C, z0 + (iz + 0.5) * C, r) ? 2 : 1; }
            return cache[k] === 1;
        }
        function nearestFree(c) {
            if (free(c[0], c[1])) { return c; }
            for (var rad = 1; rad < 8; rad++) {
                for (var a = -rad; a <= rad; a++) {
                    for (var b = -rad; b <= rad; b++) {
                        if (Math.max(Math.abs(a), Math.abs(b)) === rad && free(c[0] + a, c[1] + b)) { return [c[0] + a, c[1] + b]; }
                    }
                }
            }
            return null;
        }
        var s = nearestFree([Math.floor((sx - x0) / C), Math.floor((sz - z0) / C)]);   // старт у стены тоже ищет ближайшую свободную клетку
        var g0 = nearestFree([Math.floor((gx - x0) / C), Math.floor((gz - z0) / C)]);
        if (!s || !g0) { return null; }
        var si = s[0], sj = s[1], gi = g0[0], gj = g0[1];
        var N = W2 * H, g = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
        var heap = [];
        function push(k, f) { heap.push([f, k]); var i = heap.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) { break; } var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } }
        function pop() { var top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; var i = 0; for (;;) { var l = i * 2 + 1, rr = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) { m = l; } if (rr < heap.length && heap[rr][0] < heap[m][0]) { m = rr; } if (m === i) { break; } var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; }
        var sk = sj * W2 + si, gk = gj * W2 + gi;
        g[sk] = 0; push(sk, 0);
        var D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
        var iter = 0;
        while (heap.length && iter++ < 50000) {
            var cur = pop()[1];
            if (closed[cur]) { continue; }
            if (cur === gk) { break; }
            closed[cur] = 1;
            var ci = cur % W2, cj = (cur / W2) | 0;
            for (var d = 0; d < 8; d++) {
                var ni = ci + D[d][0], nj = cj + D[d][1];
                if (!free(ni, nj)) { continue; }
                if (D[d][2] > 1 && (!free(ci + D[d][0], cj) || !free(ci, cj + D[d][1]))) { continue; }
                var nk = nj * W2 + ni, ng = g[cur] + D[d][2];
                if (ng < g[nk]) { g[nk] = ng; from[nk] = cur; push(nk, ng + Math.hypot(gi - ni, gj - nj)); }
            }
        }
        if (from[gk] < 0 && gk !== sk) { return null; }
        var pts = [], k2 = gk;
        while (k2 !== -1 && k2 !== sk) { pts.push(new T.Vector3(x0 + (k2 % W2 + 0.5) * C, 0, z0 + (((k2 / W2) | 0) + 0.5) * C)); k2 = from[k2]; }
        pts.reverse();
        var out = [], here = new T.Vector3(sx, 0, sz), i2 = 0;
        if (pts.length && !lineFree(here, pts[0], r)) { out.push(new T.Vector3(x0 + (si + 0.5) * C, 0, z0 + (sj + 0.5) * C)); here = out[0]; }
        while (i2 < pts.length) {
            var j2 = pts.length - 1;
            while (j2 > i2 && !lineFree(here, pts[j2], r)) { j2--; }
            out.push(pts[j2]); here = pts[j2]; i2 = j2 + 1;
        }
        return out;
    }
    function lineFree(a, b, r) {
        var d = a.distanceTo(b), n = Math.ceil(d / 0.25);
        for (var i = 1; i <= n; i++) { var t = i / n; if (blockedAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, r)) { return false; } }
        return true;
    }

    // ---------------------------------------------------------------- загрузка моделей
    // палитру наборов можно перекрасить из данных: QUEST.world.env.recolor = { kit: { from: "green", to: "#c8643e" } }
    function recolor(dataUrl, kit, cb) {
        var img = new Image();
        img.onload = function () {
            var c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
            var g = c.getContext("2d"); g.drawImage(img, 0, 0);
            var rc = (ENV.recolor || {})[kit];
            if (rc && rc.green) {
                var d = g.getImageData(0, 0, c.width, c.height), p = d.data, tg = new T.Color(rc.green);
                for (var i = 0; i < p.length; i += 4) {
                    var r = p[i], gg = p[i + 1], b = p[i + 2];
                    var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 510;
                    if (mx === gg && gg > r + 15 && gg > b - 5 && (mx - mn) > 40) {
                        var k = l / 0.5;
                        p[i] = Math.min(255, tg.r * 255 * k); p[i + 1] = Math.min(255, tg.g * 255 * k); p[i + 2] = Math.min(255, tg.b * 255 * k);
                    }
                }
                g.putImageData(d, 0, 0);
            }
            var tex = new T.CanvasTexture(c);
            tex.flipY = false; tex.encoding = T.sRGBEncoding;
            tex.magFilter = T.NearestFilter; tex.minFilter = T.NearestMipmapLinearFilter;
            cb(tex, c.toDataURL());
        };
        img.onerror = function () { cb(null, dataUrl); };
        img.src = dataUrl;
    }
    function loadAll(done) {
        var M = window.MODELS, kits = Object.keys(M.kits), left = kits.length, kitUrl = {};
        kits.forEach(function (k) { recolor(M.kits[k], k, function (tex, url) { kitTex[k] = tex; kitUrl[k] = url; if (--left === 0) { parseAll(); } }); });
        if (!kits.length) { parseAll(); }
        function parseAll() {
            var keys2 = Object.keys(M.glb), n = keys2.length, loaders = {};
            if (!n) { done(); return; }
            function loaderFor(kit) {
                if (!loaders[kit]) {
                    var man = new T.LoadingManager();
                    man.setURLModifier(function (u) { return /colormap\.png$/.test(u) && kitUrl[kit] ? kitUrl[kit] : u; });
                    loaders[kit] = new T.GLTFLoader(man);
                }
                return loaders[kit];
            }
            keys2.forEach(function (key) {
                var e = M.glb[key];
                loaderFor(e.kit).parse(b64buf(e.b64), "", function (g) { prepModel(key, e.kit, g); if (--n === 0) { done(); } },
                    function (err) { console.warn(LOG + " модель не загрузилась: " + key, err); if (--n === 0) { done(); } });
            });
        }
    }
    function prepModel(key, kit, g) {
        g.scene.traverse(function (c) {
            if (c.isMesh) {
                c.castShadow = true; c.receiveShadow = true;
                (Array.isArray(c.material) ? c.material : [c.material]).forEach(function (m) {
                    if (m.metalness !== undefined) { m.metalness = 0; m.roughness = Math.max(m.roughness || 0, 0.7); }
                    if (m.map && kitTex[kit]) { m.map = kitTex[kit]; m.needsUpdate = true; }
                    if (kit === "nat" && m.color && !m.userData.tinted && ENV.warmNature !== false) {
                        var hsl = {}; m.color.getHSL(hsl);
                        if (hsl.h > 0.25 && hsl.h < 0.56 && hsl.s > 0.2) { m.color.setHSL(0.24 + (hsl.h - 0.25) * 0.25, hsl.s * 0.8, hsl.l * 0.8); }
                        m.userData.tinted = true;
                    }
                });
                if (c.isSkinnedMesh) { c.frustumCulled = false; }
            }
        });
        g.scene.updateMatrixWorld(true);
        var bb = new T.Box3().setFromObject(g.scene);
        models[key] = { scene: g.scene, animations: g.animations || [], size: bb.getSize(new T.Vector3()), min: bb.min.clone() };
    }
    // экземпляр модели: h — высота, w — ширина, s — масштаб; col — "b" (бокс) или радиус круга; block — заслоняет камеру
    function inst(key, x, z, o, parent) {
        o = o || {};
        var m = models[key];
        if (!m) { console.warn(LOG + " нет модели " + key); return new T.Group(); }
        var root = new T.Group();
        var obj = o.unique ? m.scene : m.scene.clone(true);
        var sc = o.h ? o.h / m.size.y : o.w ? o.w / m.size.x : o.d ? o.d / m.size.z : o.s || 1;
        if (o.stretch) { obj.scale.set(o.stretch[0] / m.size.x, o.stretch[1] / m.size.y, o.stretch[2] / m.size.z); sc = 0; }
        if (sc) { obj.scale.setScalar(sc); }
        var sx = obj.scale.x, sy = obj.scale.y, sz2 = obj.scale.z;
        obj.position.y = -m.min.y * sy;
        if (!o.nocenter) { obj.position.x = -(m.min.x + m.size.x / 2) * sx; obj.position.z = -(m.min.z + m.size.z / 2) * sz2; }
        root.add(obj);
        root.position.set(x, o.y || 0, z);
        root.rotation.y = o.rot || 0;
        root.userData.size = new T.Vector3(m.size.x * sx, m.size.y * sy, m.size.z * sz2);
        (parent || scene).add(root);
        if (o.col === "b") { colObj(root, o.shrink); }
        else if (typeof o.col === "number") { root.updateMatrixWorld(true); root.getWorldPosition(tmpV); colC(tmpV.x, tmpV.z, o.col); }
        if (o.block) { blockers.push(root); }
        return root;
    }

    // ---------------------------------------------------------------- текстуры и таблички
    function canvasTex(c) { var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; }
    function tileTex(a, b, n, grout, seed) {
        var c = document.createElement("canvas"); c.width = c.height = 256;
        var g = c.getContext("2d"), r = rnd(seed || 7), s = 256 / n;
        g.fillStyle = grout; g.fillRect(0, 0, 256, 256);
        for (var y = 0; y < n; y++) { for (var x = 0; x < n; x++) { g.fillStyle = r() < 0.5 ? a : b; g.globalAlpha = 0.85 + r() * 0.15; g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4); } }
        g.globalAlpha = 1;
        var t = canvasTex(c); t.wrapS = t.wrapT = T.RepeatWrapping;
        return t;
    }
    function plankTex(a, b, line) {
        var c = document.createElement("canvas"); c.width = c.height = 256;
        var g = c.getContext("2d"), r = rnd(11);
        for (var i = 0; i < 8; i++) { g.fillStyle = r() < 0.5 ? a : b; g.fillRect(0, i * 32, 256, 32); g.fillStyle = line; g.fillRect(0, i * 32, 256, 2); g.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32); }
        var t = canvasTex(c); t.wrapS = t.wrapT = T.RepeatWrapping;
        return t;
    }
    function noiseTex(a, b, seed) {
        var c = document.createElement("canvas"); c.width = c.height = 128;
        var g = c.getContext("2d"), r = rnd(seed || 3);
        g.fillStyle = a; g.fillRect(0, 0, 128, 128);
        for (var i = 0; i < 900; i++) { g.fillStyle = b; g.globalAlpha = 0.15 + r() * 0.35; g.fillRect(r() * 128, r() * 128, 2 + r() * 3, 2 + r() * 3); }
        var t = canvasTex(c); t.wrapS = t.wrapT = T.RepeatWrapping;
        return t;
    }
    var GROUND = {
        paving: function () { return tileTex("#e8d7b3", "#dcc69c", 8, "#bfa47a"); },
        cobble: function () { return tileTex("#c9c2b5", "#b8b0a2", 10, "#8f877a", 5); },
        street: function () { return tileTex("#ddc9a3", "#d2bb92", 6, "#b39770"); },
        tiles:  function () { return tileTex("#f6f6f2", "#d9e6ef", 6, "#b9c8d3"); },
        wood:   function () { return tileTex("#d2ad82", "#cba57a", 4, "#b48c63"); },
        planks: function () { return plankTex("#a9784c", "#9a6b42", "#6b4a2e"); },
        grass:  function () { return noiseTex("#9ccf6a", "#7fb455", 4); },
        sand:   function () { return noiseTex("#ecd9a8", "#d8c08a", 6); },
        dirt:   function () { return noiseTex("#b99a6e", "#9b7d55", 8); },
        snow:   function () { return noiseTex("#f4f6fa", "#dfe6ef", 9); },
        stone:  function () { return tileTex("#d9d4ca", "#cdc6b8", 5, "#a9a191", 13); },
        carpet: function () { return noiseTex("#b0574a", "#9a4639", 10); },
    };
    var groundCache = {};
    function groundMat(kind, repX, repZ) {
        var mk = GROUND[kind] || GROUND.paving;
        var base = groundCache[kind] || (groundCache[kind] = mk());
        var t = base.clone(); t.needsUpdate = true; t.repeat.set(repX, repZ);
        return new T.MeshStandardMaterial({ map: t, roughness: 0.95 });
    }
    function gradTex(stops) {
        var c = document.createElement("canvas"); c.width = 4; c.height = 256;
        var g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
        stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
        g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
        return canvasTex(c);
    }
    // все таблички — тёмный крупный текст на светлом поле; рамка подсказывает материал
    var SIGN_STYLE = {
        wood:  { bg: "#fdf6e6", edge: "#8c6447", ink: "#231f1c", hl: "#b0401f" },
        plate: { bg: "#ffffff", edge: "#2f6fa3", ink: "#14304f", hl: "#b0401f" },
        chalk: { bg: "#fbfaf4", edge: "#2f4a3a", ink: "#1d2a24", hl: "#b0401f" },
        paper: { bg: "#fffdf6", edge: "#c9b48c", ink: "#231f1c", hl: "#b0401f" },
        cork:  { bg: "#fffdf6", edge: "#a77a4c", ink: "#231f1c", hl: "#b0401f" },
        metal: { bg: "#f7f9fb", edge: "#5a6672", ink: "#1b2530", hl: "#b0401f" },
        stone: { bg: "#f4f0e6", edge: "#8d877a", ink: "#2b2822", hl: "#9c3a1a" },
    };
    function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function segsOf(line) { return parseLine(line).map(function (s) { return s.w ? { t: s.s, hl: true } : { t: s.t }; }); }
    function signCanvas(lines, style, w, h) {
        var S = SIGN_STYLE[style] || SIGN_STYLE.paper;
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        var g = c.getContext("2d"), rr = Math.min(w, h) * 0.08;
        g.fillStyle = S.edge; roundRect(g, 0, 0, w, h, rr); g.fill();
        var bw = Math.max(10, Math.min(w, h) * 0.06);
        g.fillStyle = S.bg; roundRect(g, bw, bw, w - bw * 2, h - bw * 2, rr * 0.6); g.fill();
        var pad = bw + Math.min(w, h) * 0.07, innerW = w - pad * 2;
        var segLines = lines.map(segsOf), lh = (h - pad * 2) / lines.length, fs = lh * 0.7;
        function width(segs, f) { g.font = "700 " + f + "px 'Segoe UI', 'Noto Sans', Arial, sans-serif"; return segs.reduce(function (a, s) { return a + g.measureText(s.t).width; }, 0); }
        segLines.forEach(function (sl) { while (width(sl, fs) > innerW && fs > 10) { fs -= 1; } });
        g.textBaseline = "middle";
        segLines.forEach(function (sl, i) {
            var x = (w - width(sl, fs)) / 2, y = pad + lh * (i + 0.5);
            sl.forEach(function (s) {
                g.font = "700 " + fs + "px 'Segoe UI', 'Noto Sans', Arial, sans-serif";
                g.fillStyle = s.hl ? S.hl : S.ink; g.fillText(s.t, x, y);
                var sw = g.measureText(s.t).width;
                if (s.hl) { g.fillRect(x, y + fs * 0.55, sw, Math.max(3, fs * 0.08)); }
                x += sw;
            });
        });
        return c;
    }
    // табличка-панель лицом к +z (в системе родителя); at — откуда её читать (мировые x,z)
    function signPanel(id, ww, hh, x, y, z, parent, lines, style, at) {
        var s = SIGNS[id];
        var ppm = Math.max(1024 / ww, 460);
        var c = signCanvas(lines || s.lines, style || s.style, Math.round(ww * ppm), Math.round(hh * ppm));
        var tex = canvasTex(c); tex.generateMipmaps = true; tex.minFilter = T.LinearMipmapLinearFilter; tex.magFilter = T.LinearFilter;
        var front = new T.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18 }), back = mat(0x5b3d28);
        var me = new T.Mesh(new T.BoxGeometry(ww, hh, 0.06), [back, back, back, back, front, back]);
        me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true;
        (parent || scene).add(me);
        hits.push({ obj: me, kind: "sign", id: id });
        if (!signs[id]) {
            me.updateMatrixWorld(true);
            var p = new T.Vector3(); me.getWorldPosition(p);
            var nrm = new T.Vector3(0, 0, 1).transformDirection(me.matrixWorld); nrm.y = 0; nrm.normalize();
            signs[id] = { at: at ? new T.Vector3(at[0], 0, at[1]) : new T.Vector3(p.x + nrm.x * 1.2, 0, p.z + nrm.z * 1.2), zone: s.place.zone };
        }
        return me;
    }
    function textPlate(text, w, h, fg, bg, edge) {
        var c = document.createElement("canvas"); c.width = Math.round(w * 600); c.height = Math.round(h * 600);
        var g = c.getContext("2d");
        g.fillStyle = edge || "#2f6fa3"; roundRect(g, 0, 0, c.width, c.height, c.height * 0.12); g.fill();
        g.fillStyle = bg || "#fffaf0"; roundRect(g, c.height * 0.07, c.height * 0.07, c.width - c.height * 0.14, c.height * 0.86, c.height * 0.09); g.fill();
        var fs = c.height * 0.6; g.font = "800 " + fs + "px 'Segoe UI', Arial, sans-serif";
        while (g.measureText(text).width > c.width * 0.86 && fs > 8) { fs -= 2; g.font = "800 " + fs + "px 'Segoe UI', Arial, sans-serif"; }
        g.fillStyle = fg || "#2b2a33"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, c.width / 2, c.height * 0.54);
        return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map: canvasTex(c), roughness: 0.9, side: T.DoubleSide }));
    }
    // kind: wait «?» | ready «!» | new «…» (есть неуслышанные реплики); суффикс «+new» — красная точка поверх «?» / «!»
    function markerTex(kind) {
        var c = document.createElement("canvas"); c.width = c.height = 128;
        var g = c.getContext("2d");
        var dot = /\+new$/.test(kind); kind = kind.replace("+new", "");
        g.fillStyle = kind === "ready" ? "#f4c84a" : kind === "new" ? "#bfe3f5" : "#fffaf0"; g.strokeStyle = "#2b2a33"; g.lineWidth = 8;
        g.beginPath(); g.ellipse(64, 54, 50, 42, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(44, 88); g.lineTo(34, 120); g.lineTo(66, 94); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.ellipse(64, 54, 44, 36, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#2b2a33"; g.font = "900 64px 'Segoe UI', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        if (kind === "new") { [40, 64, 88].forEach(function (x) { g.beginPath(); g.arc(x, 56, 8, 0, 7); g.fill(); }); }
        else { g.fillText(kind === "ready" ? "!" : "?", 64, 58); }
        if (dot) { g.fillStyle = "#d8483a"; g.lineWidth = 6; g.beginPath(); g.arc(102, 24, 17, 0, 7); g.fill(); g.stroke(); }
        return canvasTex(c);
    }
    var markerTexs = {};
    function lockTex() {
        var c = document.createElement("canvas"); c.width = c.height = 128;
        var g = c.getContext("2d");
        g.fillStyle = "#2b2a33"; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
        g.fillStyle = "#f6ecd6"; g.fillRect(40, 58, 48, 38);
        g.strokeStyle = "#f6ecd6"; g.lineWidth = 10; g.beginPath(); g.arc(64, 58, 16, Math.PI, 0); g.stroke();
        return canvasTex(c);
    }

    // ---------------------------------------------------------------- персонажи
    function character(key, x, z, rot) {
        var root = inst(key, x, z, { h: 2.0, unique: true, rot: rot || 0, nocenter: true });
        var m = models[key], mixer = new T.AnimationMixer(root.children[0]), acts = {};
        m.animations.forEach(function (clip) { acts[clip.name] = mixer.clipAction(clip); });
        if (acts.idle) { acts.idle.play(); acts.idle.time = Math.random() * 2; }
        return { root: root, mixer: mixer, acts: acts, cur: "idle" };
    }
    function play(n, name, once, fade) {
        var a = n.acts[name];
        if (!a || (n.cur === name && !once)) { return; }
        var prev = n.acts[n.cur];
        a.reset(); a.setLoop(once ? T.LoopOnce : T.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = !!once;
        a.play();
        if (prev && prev !== a) { a.crossFadeFrom(prev, fade || 0.25, false); }
        n.cur = name;
    }
    function addNpc(id) {
        var d = NPCS[id], zc = zoneOrigin(d.zone);
        var x = zc[0] + d.at[0], z = zc[1] + d.at[1], rot = d.rot || 0;
        var n = character(d.model || "chars/character-male-e", x, z, rot);
        var hit = new T.Mesh(new T.CylinderGeometry(0.6, 0.6, 2.1, 8), new T.MeshBasicMaterial());
        hit.visible = false; hit.position.y = 1.05; n.root.add(hit);
        var spr = new T.Sprite(new T.SpriteMaterial({ map: markerTex("wait"), depthTest: false, transparent: true }));
        spr.scale.set(0.6, 0.6, 1); spr.position.y = 2.55; spr.renderOrder = 10; spr.visible = false; n.root.add(spr);
        n.id = id; n.zone = d.zone; n.hit = hit; n.marker = spr; n.baseYaw = n.yaw = n.targetYaw = rot;
        n.home = n.root.position.clone(); n.homeYaw = rot; n.talkUntil = 0;
        n.col = colC(x, z, 0.42, "npc:" + id);
        npcs[id] = n;
        hits.push({ obj: hit, kind: "npc", id: id });
        if (d.anim && n.acts[d.anim]) { play(n, d.anim); n.baseAnim = d.anim; }
        if (d.hold) { holdInHand(n, d.hold, d.holdH || 0.16); }
        return n;
    }
    // кисть: самая дальняя от плеча вершина, привязанная к кости правой руки (по скину) — предмет ложится в ладонь, а не на голову
    function handPoint(n) {
        var sm = null;
        n.root.traverse(function (o) { if (o.isSkinnedMesh && !sm) { sm = o; } });
        if (!sm) { return null; }
        var bones = sm.skeleton.bones, bi = -1;
        for (var i = 0; i < bones.length; i++) { if (/arm-right/i.test(bones[i].name)) { bi = i; break; } }
        if (bi < 0) { return null; }
        var pos = sm.geometry.attributes.position, si = sm.geometry.attributes.skinIndex, sw = sm.geometry.attributes.skinWeight;
        var inv = sm.skeleton.boneInverses[bi], v = new T.Vector3(), best = null, bestD = -1;
        for (var k = 0; k < pos.count; k++) {
            var w = 0;
            for (var c = 0; c < 4; c++) { if (si.array[k * si.itemSize + c] === bi) { w += sw.array[k * sw.itemSize + c]; } }
            if (w < 0.5) { continue; }
            v.fromBufferAttribute(pos, k).applyMatrix4(sm.bindMatrix).applyMatrix4(inv);
            var d = v.length();
            if (d > bestD) { bestD = d; best = v.clone(); }
        }
        return best ? { bone: bones[bi], local: best } : null;
    }
    function holdInHand(n, key, h) {
        n.root.updateMatrixWorld(true);
        var hp = handPoint(n);
        if (!hp) { return; }
        var it = inst(key, 0, 0, { h: h });
        var wp = hp.bone.localToWorld(hp.local.clone());
        it.position.set(wp.x, wp.y - h * 0.55, wp.z);
        it.updateMatrixWorld(true);
        hp.bone.attach(it);
    }
    function moveNpc(n, x, z, yaw) {
        n.root.position.set(x, 0, z); n.col.x = x; n.col.z = z;
        n.baseYaw = n.targetYaw = n.yaw = yaw; n.root.rotation.y = yaw;
    }
    function makeHero() {
        var h = character(W.heroModel || "chars/character-worker", 0, 0, 0);
        h.root.updateMatrixWorld(true);
        var torso = null;
        h.root.traverse(function (o) { if (o.isBone && /torso/i.test(o.name)) { torso = o; } });
        // рюкзак путника — на кости торса, чтобы качался с героем
        var pack = new T.Group();
        box(0.5, 0.58, 0.26, 0x6b8a3a, 0, 0.75, -0.3, pack);
        box(0.44, 0.18, 0.06, 0x56702d, 0, 0.92, -0.45, pack);
        box(0.52, 0.12, 0.3, 0x8c6447, 0, 1.3, -0.3, pack);
        cyl(0.09, 0.09, 0.5, 0xc8643b, 0, 1.38, -0.3, pack, 8).rotation.z = Math.PI / 2;
        h.root.add(pack); pack.updateMatrixWorld(true);
        if (torso) { pack.children.slice().forEach(function (c) { torso.attach(c); }); h.root.remove(pack); }
        h.yaw = Math.PI; h.speed = 0;
        shadowAll(h.root);
        return h;
    }

    // ---------------------------------------------------------------- процедурные предметы (p: ...)
    var fruitGeo;
    function fruitTree(it, x, z, parent) {
        var t = inst(it.m || "nat/tree_default", x, z, { h: it.h || 3.2, rot: (it.seed || 1) * 1.7, y: it.y || 0 }, parent);
        var s = t.userData.size, r = rnd((it.seed || 1) + 3);
        fruitGeo = fruitGeo || new T.SphereGeometry(0.1, 7, 5);
        var fm = mat(it.fruit || 0xf4d03a, { e: 0x3a2a00, ei: 0.2 });
        for (var i = 0; i < 12; i++) {
            var a = r() * Math.PI * 2, yy = s.y * (0.45 + r() * 0.42), rad = (s.x * 0.5) * (0.65 + r() * 0.25) * (1 - Math.abs(yy / s.y - 0.68));
            var l = mesh(fruitGeo, fm, Math.cos(a) * rad * 1.15, yy, Math.sin(a) * rad * 1.15, t);
            l.scale.set(1, 1.2, 1); l.castShadow = false;
        }
        swayers.push({ o: t, ph: it.seed || 1 });
        return t;
    }
    function lampPost(withLight, parent) {
        var g = new T.Group();
        cyl(0.06, 0.08, 2.6, 0x2b2a33, 0, 0, 0, g, 8);
        box(0.5, 0.06, 0.06, 0x2b2a33, 0.2, 2.5, 0, g);
        var bulbM = mat(0xfff1c4);
        mesh(new T.SphereGeometry(0.14, 10, 8), bulbM, 0.42, 2.38, 0, g);
        cyl(0.14, 0.2, 0.12, 0x2b2a33, 0.42, 2.44, 0, g, 8);
        (parent || scene).add(g);
        var pl = null;
        if (withLight) { pl = new T.PointLight(0xffc977, 0, 9, 1.6); pl.position.set(0.42, 2.2, 0); g.add(pl); }
        lamps.push({ bulb: bulbM, light: pl });
        return g;
    }
    function cafeTable(food, parent) {
        var g = new T.Group(); (parent || scene).add(g);
        inst("furn/tableRound", 0, 0, { h: 0.66 }, g);
        inst("furn/chairCushion", -0.62, 0.1, { h: 0.78, rot: Math.PI / 2 }, g);
        inst("furn/chairCushion", 0.62, -0.1, { h: 0.78, rot: -Math.PI / 2 }, g);
        (food || []).forEach(function (f) { inst(f[0], f[1], f[2], { y: 0.67, h: f[3] || 0.16 }, g); });
        return g;
    }
    function violin(parent) {
        var g = new T.Group(), wood = mat(0x9a4a1e, { r: 0.5 }), dark = mat(0x2b2a33);
        var b1 = mesh(new T.SphereGeometry(0.13, 14, 10), wood, 0, 0, -0.08, g); b1.scale.set(1, 0.28, 1.15);
        var b2 = mesh(new T.SphereGeometry(0.1, 14, 10), wood, 0, 0, 0.12, g); b2.scale.set(1, 0.28, 1.1);
        box(0.05, 0.04, 0.34, dark, 0, 0.0, 0.36, g);
        box(0.07, 0.06, 0.08, wood, 0, -0.01, 0.55, g);
        (parent || scene).add(g);
        return g;
    }
    var colGeo, capGeo, colMat;
    function column(h, parent) {
        var g = new T.Group();
        colGeo = colGeo || new T.CylinderGeometry(0.2, 0.24, 1, 14);
        capGeo = capGeo || new T.BoxGeometry(0.62, 0.16, 0.62);
        colMat = colMat || mat(0xfaf5ea);
        var c = mesh(colGeo, colMat, 0, h / 2, 0, g); c.scale.y = h - 0.32;
        mesh(capGeo, colMat, 0, 0.08, 0, g); mesh(capGeo, colMat, 0, h - 0.08, 0, g);
        (parent || scene).add(g);
        return g;
    }
    function dogMesh(parent) {
        var g = new T.Group(), fur = mat(0xc98b52), dark = mat(0x6b4a33);
        box(0.62, 0.3, 0.28, fur, 0, 0.28, 0, g);
        var head = box(0.3, 0.26, 0.24, fur, 0.36, 0.48, 0, g);
        box(0.12, 0.1, 0.12, dark, 0.54, 0.5, 0, g);
        box(0.06, 0.14, 0.08, dark, 0.3, 0.72, 0.09, g); box(0.06, 0.14, 0.08, dark, 0.3, 0.72, -0.09, g);
        [[0.22, 0.09], [0.22, -0.09], [-0.22, 0.09], [-0.22, -0.09]].forEach(function (p) { box(0.08, 0.28, 0.08, fur, p[0], 0, p[1], g); });
        var tail = new T.Group(); tail.position.set(-0.31, 0.52, 0); g.add(tail);
        box(0.06, 0.22, 0.06, dark, 0, 0, 0, tail).rotation.z = 0.5;
        shadowAll(g); (parent || scene).add(g);
        ticks.push(function (t) { tail.rotation.z = Math.sin(t * 9) * 0.5; head.rotation.z = Math.sin(t * 1.3) * 0.08; });
        return g;
    }
    function catMesh(parent) {
        var g = new T.Group(), fur = mat(0x8a8a92), dark = mat(0x3a3a42);
        box(0.42, 0.2, 0.18, fur, 0, 0.18, 0, g);
        box(0.2, 0.18, 0.18, fur, 0.26, 0.3, 0, g);
        box(0.05, 0.08, 0.05, dark, 0.3, 0.48, 0.06, g); box(0.05, 0.08, 0.05, dark, 0.3, 0.48, -0.06, g);
        [[0.15, 0.06], [0.15, -0.06], [-0.15, 0.06], [-0.15, -0.06]].forEach(function (p) { box(0.05, 0.18, 0.05, fur, p[0], 0, p[1], g); });
        var tail = new T.Group(); tail.position.set(-0.22, 0.3, 0); g.add(tail);
        box(0.04, 0.3, 0.04, dark, 0, 0, 0, tail).rotation.z = 0.3;
        shadowAll(g); (parent || scene).add(g);
        ticks.push(function (t) { tail.rotation.z = 0.3 + Math.sin(t * 2) * 0.3; });
        return g;
    }
    function steam(parent, y) {
        var g = new T.Group(); (parent || scene).add(g);
        var ps = [];
        for (var i = 0; i < 3; i++) { var sm = mesh(new T.IcosahedronGeometry(0.34, 0), mat(0xffffff, { op: 0.55, r: 1 }), 0, y, 0, g); sm.castShadow = false; ps.push({ m: sm, ph: i / 3 }); }
        ticks.push(function (t) { ps.forEach(function (s) { var k = (t * 0.35 + s.ph) % 1; s.m.position.set(Math.sin(k * 6 + s.ph) * 0.2, y + k * 2.6, 0); s.m.scale.setScalar(0.6 + k * 1.4); s.m.material.opacity = 0.55 * (1 - k); }); });
        return g;
    }
    function fountain(r, parent) {
        var g = new T.Group(); (parent || scene).add(g);
        cyl(r, r + 0.1, 0.45, 0xe7dcc6, 0, 0, 0, g, 28);
        var water = mesh(new T.CylinderGeometry(r - 0.18, r - 0.18, 0.05, 28), mat(0x6fb7dc, { r: 0.2, e: 0x0b2f44, ei: 0.4 }), 0, 0.38, 0, g); water.castShadow = false;
        cyl(0.18, 0.26, 1.1, 0xe7dcc6, 0, 0.4, 0, g, 10);
        cyl(0.55, 0.3, 0.16, 0xe7dcc6, 0, 1.42, 0, g, 16);
        var dm = mat(0xa8dcf3, { op: 0.6, r: 0.1 }), drops = [];
        for (var i = 0; i < 10; i++) { var d = mesh(new T.SphereGeometry(0.045, 6, 4), dm, 0, 1.6, 0, g); d.castShadow = false; drops.push({ m: d, a: i / 10 * Math.PI * 2, ph: i / 10 }); }
        ticks.push(function (t) { drops.forEach(function (d) { var k = (t * 0.7 + d.ph) % 1, rr = 0.2 + k; d.m.position.set(Math.cos(d.a) * rr, 1.65 + Math.sin(k * Math.PI) * 0.55 - k * 1.1, Math.sin(d.a) * rr); }); });
        return g;
    }
    function kiosk(color, parent) {
        var K = new T.Group(); (parent || scene).add(K);
        var c = color || "#2f6fa3";
        box(1.9, 0.25, 1.6, 0xe9dcc0, 0, 0, 0, K);
        box(1.8, 1.9, 1.5, c, 0, 0.25, 0, K);
        box(1.5, 0.9, 0.05, 0xfffaf0, 0, 1.0, 0.76, K);
        for (var i = 0; i < 5; i++) { box(0.24, 0.32, 0.04, [0xc9473d, 0xf4c84a, 0x5e8c3a, 0x7d5ba6, 0xe08a5a][i], -0.56 + i * 0.28, 1.18, 0.8, K); }
        box(2.3, 0.14, 2.0, 0xfffaf0, 0, 2.15, 0.1, K);
        for (var j = 0; j < 6; j++) { box(0.38, 0.22, 0.06, j % 2 ? 0xfffaf0 : c, -0.95 + j * 0.38, 1.94, 1.08, K); }
        box(0.9, 0.08, 0.5, 0x8c6447, 0, 0.95, 0.95, K);
        return K;
    }
    function awningStall(color, parent) {
        var g = new T.Group(); (parent || scene).add(g);
        var c = color || "#c9473d";
        box(2.2, 0.85, 1.0, 0x9a6b42, 0, 0, 0, g);
        box(2.3, 0.06, 1.1, 0xc08a5b, 0, 0.85, 0, g);
        [[-1.05, -0.45], [1.05, -0.45], [-1.05, 0.45], [1.05, 0.45]].forEach(function (p) { cyl(0.04, 0.04, 2.3, 0x6b4a33, p[0], 0, p[1], g, 6); });
        for (var j = 0; j < 7; j++) { var st = box(0.34, 0.06, 1.4, j % 2 ? 0xfffaf0 : c, -1.02 + j * 0.34, 2.3, 0.1, g); st.rotation.x = -0.18; }
        return g;
    }
    function crates(parent) {
        var g = new T.Group(); (parent || scene).add(g);
        box(0.6, 0.45, 0.45, 0xb08350, 0, 0, 0, g); box(0.5, 0.4, 0.4, 0xa07646, 0.1, 0.45, 0.02, g);
        return g;
    }
    // дом: стены цвета color, крыша roof, окна, дверь (в интерьер, если door.to); фасад к +z
    function houseMesh(it, G) {
        var sz = it.size || [5, 3.2, 4.5], w = sz[0], h = sz[1], d = sz[2];
        var wall = box(w, h, d, it.color || "#f7f1e6", 0, 0, 0, G); blockers.push(wall);
        var roofC = col(it.roof || "#c8643b");
        var rs = new T.Shape(); rs.moveTo(-w / 2 - 0.3, 0); rs.lineTo(w / 2 + 0.3, 0); rs.lineTo(0, Math.max(1.0, w * 0.32)); rs.lineTo(-w / 2 - 0.3, 0);
        var roof = mesh(new T.ExtrudeGeometry(rs, { depth: d + 0.5, bevelEnabled: false }), mat(roofC, { flat: true }), 0, h, -d / 2 - 0.25, G); blockers.push(roof);
        var winC = col(it.trim || "#2f6fa3");
        var nw = Math.max(1, Math.floor(w / 2.2));
        for (var i = 0; i < nw; i++) {
            var wx = -w / 2 + (i + 0.5) * w / nw;
            if (it.door && Math.abs(wx - (it.door.x || 0)) < 1.0) { continue; }
            box(0.8, 0.9, 0.06, 0xbfe3f5, wx, h * 0.45, d / 2 + 0.01, G, { e: 0x5f8fae, ei: 0.3 }).castShadow = false;
            box(0.42, 0.95, 0.05, winC, wx - 0.62, h * 0.45 - 0.02, d / 2 + 0.03, G); box(0.42, 0.95, 0.05, winC, wx + 0.62, h * 0.45 - 0.02, d / 2 + 0.03, G);
        }
        if (!it.door) { box(1.0, 2.0, 0.08, winC, 0, 0, d / 2 + 0.02, G); }
        return { x: w, y: h + Math.max(1.0, w * 0.32), z: d };
    }
    // лодка: корпус цвета color длиной len, покачивается на воде (on water — y воды)
    function boatMesh(it, parent) {
        var L = it.len || 4, W = L * 0.36, Hh = L * 0.2, g = new T.Group(); (parent || scene).add(g);
        var hs = new T.Shape(); hs.moveTo(-L / 2, Hh); hs.lineTo(L / 2 + L * 0.08, Hh); hs.quadraticCurveTo(L / 2, 0, L * 0.3, 0); hs.lineTo(-L / 2 + L * 0.08, 0); hs.lineTo(-L / 2, Hh);
        var side = mat(it.color || "#2f6fa3", { flat: true });
        var ic = new T.Color(col(it.color || "#2f6fa3")).multiplyScalar(0.78), inner = mat(it.inner ? col(it.inner) : ic.getHex());
        var seat = mat(0xa9784c);
        var hull = mesh(new T.ExtrudeGeometry(hs, { depth: W, bevelEnabled: false }), side, 0, 0, 0, g);
        hull.rotation.y = -Math.PI / 2; hull.position.set(W / 2, 0, 0);
        box(L * 0.9, 0.06, W * 0.84, inner, 0, Hh * 0.55, 0, g).rotation.y = Math.PI / 2;
        box(W * 0.9, 0.08, 0.3, seat, 0, Hh * 0.7, -L * 0.1, g); box(W * 0.9, 0.08, 0.3, seat, 0, Hh * 0.7, L * 0.22, g);
        // борт сверху — цветом лодки, тонкая светлая полоса по краю: цвет виден и с высокой камеры
        var rim = mat(col(it.stripe || "#fffaf0"));
        box(0.14, 0.1, L * 0.92, rim, -W / 2 + 0.05, Hh - 0.05, 0, g); box(0.14, 0.1, L * 0.92, rim, W / 2 - 0.05, Hh - 0.05, 0, g);
        box(W, 0.1, 0.14, rim, 0, Hh - 0.05, -L * 0.46, g);
        if (it.mast) { cyl(0.06, 0.07, L * 0.75, 0x6b4a33, 0, Hh * 0.6, L * 0.08, g, 6); }
        if (it.float !== false) { var ph = (it.seed || 1) * 1.7; ticks.push(function (t) { g.position.y = (it.y || -0.18) + Math.sin(t * 1.4 + ph) * 0.05; g.rotation.z = Math.sin(t * 1.1 + ph) * 0.03; }); }
        return g;
    }
    // горка фруктов/овощей в ящике: color — цвет, n — сколько
    function pileMesh(it, parent) {
        var g = new T.Group(); (parent || scene).add(g);
        var w = it.size ? it.size[0] : 0.7, d = it.size ? it.size[2] || it.size[1] : 0.5;
        if (it.crate !== false) { box(w, 0.22, d, 0xb08350, 0, 0, 0, g); }
        var fm = mat(it.color || "#c9473d", { r: 0.5 }), geo = new T.SphereGeometry(it.r || 0.07, 10, 8), r = rnd(it.seed || 5);
        for (var i = 0; i < (it.n || 18); i++) {
            var f = mesh(geo, fm, (r() - 0.5) * (w - 0.12), 0.2 + r() * 0.1 + (i > 10 ? 0.08 : 0), (r() - 0.5) * (d - 0.12), g);
            f.castShadow = false;
        }
        return g;
    }
    function pier(it, x, z) {
        var w = it.rect[0], d = it.rect[1], h = it.h != null ? it.h : 0.25;
        var g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = it.rot || 0; scene.add(g);
        var top = mesh(new T.BoxGeometry(w, 0.14, d), groundMat("planks", w / 2, d / 2), 0, h, 0, g);
        top.receiveShadow = true;
        for (var px = -w / 2 + 0.3; px <= w / 2 - 0.2; px += Math.max(1.6, w / 3)) {
            for (var pz = -d / 2 + 0.3; pz <= d / 2 - 0.2; pz += 2.4) { cyl(0.11, 0.11, 1.4, 0x6b4a2e, px, -1.2, pz, g, 7); }
        }
        // мостки ходибельны: над ними вода не мешает (прямоугольник в мировых осях; мостки — без поворота или с поворотом на 90°)
        var a = Math.abs(Math.round((it.rot || 0) / (Math.PI / 2))) % 2 === 1;
        var hw = (a ? d : w) / 2, hd = (a ? w : d) / 2;
        walkRects.push([x - hw, x + hw, z - hd, z + hd]);
        return g;
    }

    // ---------------------------------------------------------------- предметы из данных
    function zoneOrigin(zoneId) { return CENTERS[zoneId]; }
    function addProp(it, ox, oz, parent, parentRot) {
        if (it.p === "repeat") {
            for (var k = 0; k < (it.n || 1); k++) {
                var copy = JSON.parse(JSON.stringify(it.item));
                copy.at = [(it.at ? it.at[0] : 0) + k * (it.step ? it.step[0] : 1), (it.at ? it.at[1] : 0) + k * (it.step ? it.step[1] : 0)];
                if (it.id) { copy.id = it.id + "-" + k; }
                addProp(copy, ox, oz, parent, parentRot);
            }
            return;
        }
        var at = it.at || [0, 0], r = LAYOUT.rot2(at[0], at[1], parentRot || 0);
        var x = ox + r[0], z = oz + r[1], rot = (it.rot || 0) + (parentRot || 0);
        var o = null, colDone = false;
        var opt = { h: it.h, w: it.w, s: it.s, rot: rot, y: it.y || 0, block: it.block };
        switch (it.p) {
            case "building": o = building(it, x, z, rot); colDone = true; break;
            case "tree": o = fruitTree(it, x, z); if (it.col !== false) { colC(x, z, it.col || 0.45); } colDone = true; break;
            case "lamp": o = lampPost(it.light, null); o.position.set(x, 0, z); if (it.col !== false) { colC(x, z, 0.16); } colDone = true; break;
            case "table": o = cafeTable(it.food, null); o.position.set(x, it.y || 0, z); o.rotation.y = rot; if (it.col !== false) { colC(x, z, 0.85); } colDone = true; break;
            case "violin": o = violin(null); o.position.set(x, it.y || 0.75, z); o.rotation.y = rot; colDone = true; break;
            case "column": o = column(it.h || 3, null); o.position.set(x, it.y || 0, z); colC(x, z, 0.3); colDone = true; break;
            case "dog": o = dogMesh(null); o.position.set(x, 0, z); o.rotation.y = rot;
                if (it.walk) { walker(o, x, z, it.walk); } else if (it.col !== false) { colC(x, z, 0.35); }
                colDone = true; break;
            case "cat": o = catMesh(null); o.position.set(x, it.y || 0, z); o.rotation.y = rot; colDone = true; break;
            case "fountain": o = fountain(it.r || 1.6, null); o.position.set(x, 0, z); colC(x, z, (it.r || 1.6) + 0.15); colDone = true; break;
            case "kiosk": o = kiosk(it.color, null); o.position.set(x, 0, z); o.rotation.y = rot; colC(x, z, 1.25); colDone = true; break;
            case "stall": o = awningStall(it.color, null); o.position.set(x, 0, z); o.rotation.y = rot; colObj(o, 0.05); colDone = true; break;
            case "crates": o = crates(null); o.position.set(x, 0, z); o.rotation.y = rot; colC(x, z, 0.4); colDone = true; break;
            case "steam": o = steam(null, it.y || 5); o.position.set(x, 0, z); colDone = true; break;
            case "pier": o = pier(it, x, z); colDone = true; break;
            case "boat": o = boatMesh(it, null); o.position.set(x, it.y || -0.18, z); o.rotation.y = rot; colDone = true;
                if (it.col !== false && !it.float) { colObj(o, 0.1); } break;
            case "pile": o = pileMesh(it, null); o.position.set(x, it.y || 0, z); o.rotation.y = rot; colDone = true; break;
            case "ring": o = new T.Mesh(new T.RingGeometry(it.r1, it.r2, 56), mat(it.color || "#e9dcc0")); o.rotation.x = -Math.PI / 2; o.position.set(x, 0.026, z); o.receiveShadow = true; scene.add(o); colDone = true; break;
            case "strip": o = new T.Mesh(new T.PlaneGeometry(it.size[0], it.size[1]), it.ground ? groundMat(it.ground, it.size[0] / 2, it.size[1] / 2) : mat(it.color || "#e9dcc0")); o.rotation.x = -Math.PI / 2; o.rotation.z = -rot; o.position.set(x, 0.024, z); o.receiveShadow = true; scene.add(o); colDone = true; break;
            case "pricetag": o = textPlate(it.text, it.size ? it.size[0] : 0.9, it.size ? it.size[1] : 0.45, it.fg, it.bg, it.edge); o.position.set(x, it.y || 1, z); o.rotation.y = rot; scene.add(o); colDone = true; break;
            case "box": o = box(it.size[0], it.size[1], it.size[2] != null ? it.size[2] : it.size[0], it.color || "#e9dcc0", x, it.y || 0, z); o.rotation.y = rot;
                if (it.col !== false) { colObj(o, 0.02); } colDone = true; if (it.block) { blockers.push(o); } break;
            case "cyl": o = cyl(it.r || 0.3, it.r2 != null ? it.r2 : (it.r || 0.3), it.hh || it.h || 1, it.color || "#e7dcc6", x, it.y || 0, z, null, 16); if (it.col !== false) { colC(x, z, (it.r || 0.3) + 0.05); } colDone = true; break;
            case "light": var pl = new T.PointLight(col(it.color || "#ffd9a0"), it.i || 0.6, it.d || 10, 1.5); pl.position.set(x, it.y || 2.6, z); scene.add(pl); o = pl; colDone = true; break;
            default:
                if (!it.m) { console.warn(LOG + " предмет без модели", it); return; }
                o = inst(it.m, x, z, opt);
                if (it.sway) { swayers.push({ o: o, ph: it.seed || x }); }
        }
        if (!colDone && it.col !== false && o && o.userData.size) {
            var sz = o.userData.size;
            if (it.col === "b" || (!it.col && Math.max(sz.x, sz.z) > 1.4)) { colObj(o, it.shrink); }
            else if (typeof it.col === "number") { colC(x, z, it.col); }
            else if (!it.col && (it.y || 0) < 0.5 && sz.y > 0.35) { colC(x, z, Math.max(0.15, Math.min(sz.x, sz.z) * 0.45)); }
        }
        if (it.id) { props[it.id] = o; }
        if (it.nightOnly) { nightOnly.push(o); } if (it.dayOnly) { dayOnly.push(o); }
        if (it.on) { it.on.forEach(function (c) { var c2 = JSON.parse(JSON.stringify(c)); c2.y = (c2.y || 0) + (it.onY != null ? it.onY : (o && o.userData.size ? o.userData.size.y : 0)) + (it.y || 0); addProp(c2, x, z, null, rot); }); }
    }
    function walker(o, cx, cz, r) {
        var c = colC(cx + r, cz, 0.35);
        ticks.push(function (t) {
            var a = t * 0.32, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            o.position.set(x, Math.abs(Math.sin(t * 11)) * 0.04, z); o.rotation.y = -a - Math.PI / 2;
            c.x = x; c.z = z;
        });
    }

    // здание: модель + дверь (вход в интерьер) + украшения; фасад смотрит на +z, rot поворачивает всё целиком
    function building(it, x, z, rot) {
        var G = new T.Group(); G.position.set(x, 0, z); G.rotation.y = rot; scene.add(G);
        var b, sz;
        if (it.m) { b = inst(it.m, 0, 0, { h: it.h, w: it.w, s: it.s }, G); blockers.push(b); sz = b.userData.size; }
        else { b = new T.Group(); G.add(b); var hs2 = houseMesh(it, b); sz = new T.Vector3(hs2.x, hs2.y, hs2.z); }
        var fz = sz.z / 2;
        G.updateMatrixWorld(true);
        // коллайдер по габаритам с учётом поворота
        var bb = new T.Box3().setFromObject(b);
        colB(bb.min.x + 0.1, bb.max.x - 0.1, bb.min.z + 0.1, bb.max.z - 0.1);
        G.userData.size = sz; G.userData.front = fz;
        (it.deco || []).forEach(function (d) { decorate(G, d, sz); });
        if (it.door) { addDoor(it.door.to, G, it.door.x || 0, fz, it.door.camera); }
        return G;
    }
    function decorate(G, d, sz) {
        var fz = sz.z / 2;
        if (d.p === "portico") {
            var n = d.cols || 4, w = d.w || Math.min(sz.x * 0.9, 6), h = d.h || 3.1, depth = d.depth || 2.2;
            box(w + 0.2, 0.12, depth + 0.2, 0xefe4cc, 0, 0, fz + depth / 2, G);
            for (var i = 0; i < n; i++) {
                var cx = -w / 2 + 0.3 + i * (w - 0.6) / (n - 1);
                if (Math.abs(cx) < 0.9) { continue; }
                var c = column(h, G); c.position.set(cx, 0.12, fz + depth - 0.3);
                G.updateMatrixWorld(true); c.getWorldPosition(tmpV); colC(tmpV.x, tmpV.z, 0.3);
            }
            box(w, 0.4, depth, 0xf6efe0, 0, h + 0.12, fz + depth / 2, G);
            if (d.pediment) {
                var ped = new T.Shape(); ped.moveTo(-w / 2, 0); ped.lineTo(w / 2, 0); ped.lineTo(0, 1.2); ped.lineTo(-w / 2, 0);
                mesh(new T.ExtrudeGeometry(ped, { depth: 0.5, bevelEnabled: false }), mat(0xfaf3e3), 0, h + 0.52, fz + depth - 0.6, G);
            }
        } else if (d.p === "kitchen-annex") {
            // пристройка-кухня сзади (видимый объём для утверждений вида «кухня большая»)
            var kw = d.w || 10, kh = d.h || 5, kd = d.d || 6.5, kz = -sz.z / 2 - kd / 2;
            var k = box(kw, kh, kd, d.color || 0xf3ece0, 0, 0, kz, G); blockers.push(k);
            box(kw + 0.2, 0.25, kd + 0.2, d.roof || 0x2f6fa3, 0, kh, kz, G);
            G.updateMatrixWorld(true);
            var bb2 = new T.Box3().setFromObject(k); colB(bb2.min.x, bb2.max.x, bb2.min.z, bb2.max.z);
            (d.chimneys || [-3.4, -1.2, 1.0, 3.2]).forEach(function (dx) {
                cyl(0.32, 0.36, 1.6, 0xb8b0a4, dx, kh + 0.2, kz - 0.6, G, 10);
                var st = steam(G, kh + 2); st.position.set(dx, 0, kz - 0.6);
            });
        } else if (d.p === "awning") {
            var aw = d.w || sz.x * 0.8;
            for (var j = 0; j < Math.round(aw / 0.4); j++) { var s2 = box(0.4, 0.06, 1.2, j % 2 ? 0xfffaf0 : col(d.color || "#2f6fa3"), -aw / 2 + 0.2 + j * 0.4, d.y || 2.6, fz + 0.6, G); s2.rotation.x = 0.25; }
        } else if (d.p === "pad") {
            var t = groundMat(d.ground || "paving", (d.w || 7) / 2, (d.d || 3) / 2);
            var pd = new T.Mesh(new T.PlaneGeometry(d.w || 7, d.d || 3), t); pd.rotation.x = -Math.PI / 2; pd.position.set(0, 0.012, fz + (d.d || 3) / 2); pd.receiveShadow = true; G.add(pd);
        } else if (d.p === "nameplate") {
            // табличка-вывеска на фасаде (sign id); сам текст — в QUEST.signs
            G.updateMatrixWorld(true);
            var at = new T.Vector3(0, 0, fz + 2.4).applyMatrix4(G.matrixWorld);
            signPanel(d.sign, d.w || 4, d.h || 0.85, d.x || 0, d.y || sz.y + 0.5, fz + 0.06, G, null, null, [at.x, at.z]);
        }
    }

    // дверь здания, лицом к +z в системе здания
    function doorMesh(parent, x, fz) {
        var g = new T.Group();
        box(1.5, 2.5, 0.12, 0xfaf5ea, 0, 0, 0, g);
        var leafM = mat(QUEST.world.doorColor || 0x2f6fa3), leaf = box(1.1, 2.2, 0.08, leafM, 0, 0.02, 0.08, g);
        box(0.08, 0.08, 0.08, 0xf4c84a, 0.38, 1.05, 0.15, g);
        for (var i = 0; i < 3; i++) { box(0.9, 0.04, 0.03, 0x24578a, 0, 0.45 + i * 0.6, 0.13, g); }
        var bar = new T.Group(); g.add(bar);
        box(1.5, 0.12, 0.06, 0x7a5a3a, 0, 1.1, 0.2, bar).rotation.z = 0.35;
        box(1.5, 0.12, 0.06, 0x7a5a3a, 0, 1.1, 0.2, bar).rotation.z = -0.35;
        g.position.set(x, 0, fz + 0.04); parent.add(g);
        return { g: g, leaf: leaf, leafM: leafM, bar: bar };
    }
    function addDoor(to, G, x, fz, cam) {
        var d = doorMesh(G, x, fz);
        var spr = new T.Sprite(new T.SpriteMaterial({ map: lockTex(), depthTest: false, transparent: true }));
        spr.scale.set(0.9, 0.9, 1); spr.position.set(x, 3.0, fz + 0.4); spr.renderOrder = 9; spr.visible = false; G.add(spr);
        var hitM = new T.Mesh(new T.BoxGeometry(1.6, 2.6, 0.6), new T.MeshBasicMaterial()); hitM.visible = false; hitM.position.set(x, 1.3, fz + 0.2); G.add(hitM);
        G.updateMatrixWorld(true);
        var front = new T.Vector3(x, 0, fz + 0.75).applyMatrix4(G.matrixWorld);
        var out = new T.Vector3(x, 0, fz + 2.0).applyMatrix4(G.matrixWorld);
        hits.push({ obj: hitM, kind: "door", id: to });
        doors[to] = { to: to, x: front.x, z: front.z, mesh: d, lock: spr, locked: false, yaw: G.rotation.y };
        // выход из здания: камера фиксирована — снаружи, лицом к фасаду (или door.camera), пока герой не отойдёт от двери
        SPAWN[to + ":out"] = { x: out.x, z: out.z, yaw: G.rotation.y, exit: { x: out.x, z: out.z, yaw: cam && cam.yaw != null ? cam.yaw : G.rotation.y, pitch: cam && cam.pitch != null ? cam.pitch : 0.8, d: cam && cam.d || null } };
    }

    // ---------------------------------------------------------------- зоны
    function buildOutdoor(zn) {
        var c = CENTERS[zn.id], sz = LAYOUT.zoneSize(zn);
        if (zn.ground && zn.ground !== "none") {
            var gm = groundMat(zn.ground, sz.w / (zn.tile || 2.2), sz.d / (zn.tile || 2.2));
            var geo = zn.radius ? new T.CircleGeometry(zn.radius, 48) : new T.PlaneGeometry(sz.w, sz.d);
            var f = new T.Mesh(geo, gm); f.rotation.x = -Math.PI / 2; f.position.set(c[0], 0.012 + (zn.layer || 0) * 0.002, c[1]); f.receiveShadow = true; scene.add(f);
            if (zn.radius && zn.rim !== false) { var ring = new T.Mesh(new T.RingGeometry(zn.radius, zn.radius + 0.4, 48), mat(zn.rim || 0xc8b48e)); ring.rotation.x = -Math.PI / 2; ring.position.set(c[0], 0.014, c[1]); ring.receiveShadow = true; scene.add(ring); }
        }
        if (zn.border && zn.border.type && zn.border.type !== "none") { border(zn, c); }
        (zn.props || []).forEach(function (it) { addProp(it, c[0], c[1], null, 0); });
        var sp = zn.spawn || { at: [0, 0], yaw: 0 };
        SPAWN[zn.id] = { x: c[0] + sp.at[0], z: c[1] + sp.at[1], yaw: sp.yaw || 0 };
    }
    // ограда вокруг зоны с калиткой; если у зоны есть lock — калитка заперта до выполнения условий
    function border(zn, c) {
        var B = zn.border, model = B.model || (B.type === "hedge" ? "town/hedge" : B.type === "wall" ? "town/wall-half" : "nat/fence_simple");
        var hgt = B.h || (B.type === "hedge" ? 1.0 : B.type === "wall" ? 1.2 : 0.9);
        var gateA = B.gate != null ? B.gate : Math.PI / 2;   // угол калитки: 0 — восток (+x), π/2 — юг (+z), -π/2 — север
        var gw = B.gateW || 1.8;
        if (zn.radius) {
            var R = zn.radius, NS = Math.max(16, Math.round(R * Math.PI * 2 / 1.6));
            for (var i = 0; i < NS; i++) {
                var am = (i + 0.5) / NS * Math.PI * 2;
                if (Math.abs(angWrap(am - gateA)) * R < gw / 2 + 0.5) { continue; }
                var fx = c[0] + Math.cos(am) * R, fz = c[1] + Math.sin(am) * R;
                fencePiece(model, fx, fz, R * 2 * Math.PI / NS + 0.06, hgt, Math.PI / 2 - am);
                colC(fx, fz, 0.6);
            }
            gate(zn, c[0] + Math.cos(gateA) * R, c[1] + Math.sin(gateA) * R, Math.PI / 2 - gateA, gw, hgt);
        } else {
            var w = zn.rect[0], d = zn.rect[1], seg = 1.6;
            // стороны: N (z-), S (z+), W (x-), E (x+); калитка — на стороне, ближайшей к углу gateA
            var sides = [["S", 0, d / 2, w, 0], ["N", 0, -d / 2, w, 0], ["E", w / 2, 0, d, Math.PI / 2], ["W", -w / 2, 0, d, Math.PI / 2]];
            var gs = Math.abs(Math.cos(gateA)) > Math.abs(Math.sin(gateA)) ? (Math.cos(gateA) > 0 ? "E" : "W") : (Math.sin(gateA) > 0 ? "S" : "N");
            sides.forEach(function (s) {
                var n = Math.max(1, Math.round(s[3] / seg)), L = s[3] / n;
                for (var k = 0; k < n; k++) {
                    var t = -s[3] / 2 + (k + 0.5) * L;
                    if (s[0] === gs && Math.abs(t) < gw / 2 + 0.2) { continue; }
                    var px = c[0] + s[1] + (s[4] ? 0 : t), pz = c[1] + s[2] + (s[4] ? t : 0);
                    fencePiece(model, px, pz, L + 0.04, hgt, s[4]);
                    if (s[4]) { colB(px - 0.2, px + 0.2, pz - L / 2, pz + L / 2); } else { colB(px - L / 2, px + L / 2, pz - 0.2, pz + 0.2); }
                }
                if (s[0] === gs) { gate(zn, c[0] + s[1], c[1] + s[2], s[4], gw, hgt); }
            });
        }
    }
    function fencePiece(model, x, z, len, hgt, rot) {
        var m = models[model]; if (!m) { return; }
        var alongZ = m.size.z > m.size.x * 1.5;
        var th = alongZ ? m.size.x / m.size.y * hgt : m.size.z / m.size.y * hgt;
        inst(model, x, z, { stretch: alongZ ? [Math.max(0.2, th), hgt, len] : [len, hgt, Math.max(0.07, th)], rot: rot + (alongZ ? Math.PI / 2 : 0) });
    }
    function gate(zn, gx, gz, rot, gw, hgt) {
        var g = inst(zn.border.gateModel || "nat/fence_gate", gx, gz, { w: gw - 0.2, h: hgt + 0.1, rot: rot });
        var horiz = Math.abs(Math.sin(rot)) < 0.5;
        var gc = horiz ? colB(gx - gw / 2, gx + gw / 2, gz - 0.25, gz + 0.25, "gate") : colB(gx - 0.25, gx + 0.25, gz - gw / 2, gz + gw / 2, "gate");
        var lk = new T.Sprite(new T.SpriteMaterial({ map: lockTex(), depthTest: false, transparent: true }));
        lk.scale.set(0.9, 0.9, 1); lk.position.set(gx, hgt + 1.0, gz); lk.renderOrder = 9; scene.add(lk);
        var hm = new T.Mesh(new T.BoxGeometry(horiz ? gw + 0.4 : 0.8, 1.6, horiz ? 0.8 : gw + 0.4), new T.MeshBasicMaterial()); hm.visible = false; hm.position.set(gx, 0.8, gz); scene.add(hm);
        hits.push({ obj: hm, kind: "door", id: zn.id });
        var c = CENTERS[zn.id], dx = c[0] - gx, dz = c[1] - gz, dl = Math.sqrt(dx * dx + dz * dz) || 1;
        doors[zn.id] = { to: zn.id, gate: true, x: gx - dx / dl * 0.9, z: gz - dz / dl * 0.9, inX: gx + dx / dl * 2.5, inZ: gz + dz / dl * 2.5, g: g, col: gc, lock: lk, locked: true, horiz: horiz, gx: gx, gz: gz };
    }
    function buildInterior(zn) {
        var c = { x: CENTERS[zn.id][0], z: CENTERS[zn.id][1] }, w = zn.size[0], d = zn.size[1];
        var fl = new T.Mesh(new T.PlaneGeometry(w, d), groundMat(zn.floor || "wood", w / 2, d / 2));
        fl.rotation.x = -Math.PI / 2; fl.position.set(c.x, 0.01, c.z); fl.receiveShadow = true; scene.add(fl);
        (zn.areas || []).forEach(function (a) {
            if (!a.floor) { return; }
            var af = new T.Mesh(new T.PlaneGeometry(a.rect[2], a.rect[3]), groundMat(a.floor, a.rect[2] / 1.5, a.rect[3] / 1.5));
            af.rotation.x = -Math.PI / 2; af.position.set(c.x + a.rect[0], 0.015, c.z + a.rect[1]); af.receiveShadow = true; scene.add(af);
        });
        var H = zn.wallH || 2.9, t = 0.2, wallC = zn.wall || "#e9d7c0";
        function wall(cx, cz, ww, dd, nx, nz) {
            var m = mat(wallC); m.transparent = true;
            var me = box(ww, H, dd, m, cx, 0, cz); me.castShadow = false;
            fadeWalls.push({ m: me, n: new T.Vector3(nx, 0, nz), room: zn.id });
            colB(cx - ww / 2, cx + ww / 2, cz - dd / 2, cz + dd / 2);
        }
        wall(c.x, c.z - d / 2 - t / 2, w + t * 2, t, 0, 1);
        wall(c.x - w / 2 - t / 2, c.z, t, d, 1, 0); wall(c.x + w / 2 + t / 2, c.z, t, d, -1, 0);
        var gap = 1.5, seg = (w - gap) / 2 + t;
        wall(c.x - gap / 2 - seg / 2, c.z + d / 2 + t / 2, seg, t, 0, -1);
        wall(c.x + gap / 2 + seg / 2, c.z + d / 2 + t / 2, seg, t, 0, -1);
        if (zn.window !== false) { box(1.6, 1.0, 0.04, 0xbfe3f5, c.x + w / 4, 1.2, c.z - d / 2 + 0.02, null, { e: 0x5f8fae, ei: 0.4 }).castShadow = false; }
        var rug = new T.Mesh(new T.PlaneGeometry(1.4, 0.8), mat(0x2f6fa3)); rug.rotation.x = -Math.PI / 2; rug.position.set(c.x, 0.02, c.z + d / 2 - 0.6); scene.add(rug);
        var glow = new T.Mesh(new T.PlaneGeometry(gap, 2.4), new T.MeshBasicMaterial({ color: 0xfff3d2 })); glow.position.set(c.x, 1.2, c.z + d / 2 + t + 0.02); glow.rotation.y = Math.PI; scene.add(glow);
        var lightP = new T.PointLight(0xffe2b0, zn.light != null ? zn.light : 0.5, 14 + Math.max(w, d) * 0.5, 1.4); lightP.position.set(c.x, 2.8, c.z); scene.add(lightP);
        rooms[zn.id] = { c: c, w: w, d: d };
        SPAWN[zn.id] = { x: c.x, z: c.z + d / 2 - 1.3, yaw: Math.PI, inside: zn.id };
        (zn.props || []).forEach(function (it) { addProp(it, c.x, c.z, null, 0); });
    }

    // тропы между зонами, вода, фон
    function buildPaths() {
        (W.paths || []).forEach(function (p) {
            var a = p.fromAt || CENTERS[p.from], b = p.toAt || CENTERS[p.to];
            var pts = [a].concat(p.via || []).concat([b]);
            for (var i = 0; i < pts.length - 1; i++) {
                var x1 = pts[i][0], z1 = pts[i][1], x2 = pts[i + 1][0], z2 = pts[i + 1][1];
                var dx = x2 - x1, dz = z2 - z1, len = Math.sqrt(dx * dx + dz * dz), w = p.w || 3.2;
                var s = new T.Mesh(new T.PlaneGeometry(w, len + w * 0.5), groundMat(p.ground || "street", w / 2.2, len / 2.2));
                s.rotation.x = -Math.PI / 2; s.rotation.z = -Math.atan2(dx, -dz);
                s.position.set((x1 + x2) / 2, 0.008, (z1 + z2) / 2); s.receiveShadow = true; scene.add(s);
            }
        });
    }
    var waterMats = [];
    function buildWater() {
        (W.water || []).forEach(function (wa) {
            var m = new T.MeshStandardMaterial({ color: col(wa.color || "#4f9fc7"), roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92, emissive: 0x0b2f44, emissiveIntensity: 0.25 });
            waterMats.push(m);
            var y = wa.level != null ? wa.level : -0.12, me;
            if (wa.circle) { me = new T.Mesh(new T.CircleGeometry(wa.circle[2], 48), m); me.position.set(wa.circle[0], y, wa.circle[1]); colC(wa.circle[0], wa.circle[1], wa.circle[2] - 0.3, "water"); }
            else { var r = wa.rect; me = new T.Mesh(new T.PlaneGeometry(r[2], r[3], 24, 24), m); me.position.set(r[0], y, r[1]); colB(r[0] - r[2] / 2 + 0.3, r[0] + r[2] / 2 - 0.3, r[1] - r[3] / 2 + 0.3, r[1] + r[3] / 2 - 0.3, "water"); }
            me.rotation.x = -Math.PI / 2; me.receiveShadow = true; scene.add(me);
            // берег: светлая полоса песка вокруг воды
            if (wa.shore !== false && wa.rect) {
                var sh = new T.Mesh(new T.PlaneGeometry(wa.rect[2] + 2.4, wa.rect[3] + 2.4), groundMat(wa.shore || "sand", 6, 6));
                sh.rotation.x = -Math.PI / 2; sh.position.set(wa.rect[0], 0.004, wa.rect[1]); sh.receiveShadow = true; scene.add(sh);
                me.position.y = Math.max(y, 0.006);
            }
        });
        ticks.push(function (t) { waterMats.forEach(function (m, i) { m.emissiveIntensity = 0.22 + Math.sin(t * 1.3 + i) * 0.06; }); });
    }
    function buildBackdrop() {
        (ENV.backdrop || []).forEach(function (b, bi) {
            var a0 = b.dir != null ? b.dir : -Math.PI / 2, spread = b.spread || 1.6, R = b.r || 70, n = b.n || 14, r = rnd(31 + bi);
            for (var i = 0; i < n; i++) {
                var a = a0 - spread / 2 + spread * (i + 0.5) / n, x = Math.cos(a) * (R + r() * 10), z = Math.sin(a) * (R + r() * 10);
                if (b.kind === "city") {
                    var city = ["com/building-k", "com/building-h", "com/building-g", "com/building-f", "com/building-e", "com/building-a"];
                    var cb = inst(city[i % city.length], x, z, { h: 18 + ((i * 37) % 5) * 6, rot: -a + Math.PI / 2 });
                    cb.traverse(function (o) { if (o.isMesh) { o.castShadow = false; } });
                } else if (b.kind === "hills") {
                    var hr = 14 + r() * 12, hm = mesh(new T.SphereGeometry(hr, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(b.color || 0xb9c98d, { flat: true }), x, -hr * 0.55, z); hm.castShadow = false;
                } else if (b.kind === "mountains") {
                    var mh = 26 + r() * 22, mm = mesh(new T.ConeGeometry(mh * 0.7, mh, 7), mat(b.color || 0x9aa3a8, { flat: true }), x, mh / 2 - 2, z); mm.castShadow = false;
                    var cap = mesh(new T.ConeGeometry(mh * 0.23, mh * 0.33, 7), mat(0xffffff, { flat: true }), x, mh - mh * 0.165 - 2, z); cap.castShadow = false;
                } else if (b.kind === "forest") {
                    var tr = inst(r() < 0.5 ? "nat/tree_pineDefaultA" : "nat/tree_default", x, z, { h: 6 + r() * 4, rot: r() * 6 });
                    tr.traverse(function (o) { if (o.isMesh) { o.castShadow = false; } });
                } else if (b.kind === "sea" && i === 0) {
                    var sea = new T.Mesh(new T.CircleGeometry(400, 64, a0 - spread / 2, spread), new T.MeshStandardMaterial({ color: col(b.color || "#4f9fc7"), roughness: 0.3, emissive: 0x0b2f44, emissiveIntensity: 0.25 }));
                    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.2; scene.add(sea); waterMats.push(sea.material);
                }
            }
        });
    }
    function buildSky() {
        var cloudM = mat(0xffffff, { r: 1, e: 0x777777, ei: 0.35, flat: true });
        for (var cl = 0; cl < 7; cl++) {
            var cg = new T.Group();
            for (var pI = 0; pI < 4; pI++) { var pm2 = mesh(new T.IcosahedronGeometry(1.4 + (pI % 2) * 0.5, 1), cloudM, pI * 1.3 - 2, (pI % 2) * 0.5, (pI % 3) * 0.4, cg); pm2.castShadow = false; pm2.receiveShadow = false; }
            cg.position.set(-60 + cl * 19, 20 + (cl % 3) * 3, -30 + (cl % 4) * 12); cg.scale.y = 0.6; scene.add(cg); dayOnly.push(cg);
            (function (g, sp2) { ticks.push(function (t, dt) { g.position.x += dt * sp2; if (g.position.x > 70) { g.position.x = -70; } }); })(cg, 0.6 + (cl % 3) * 0.3);
        }
        var birdGeo = new T.BufferGeometry();
        birdGeo.setAttribute("position", new T.Float32BufferAttribute([0, 0, 0.2, -0.5, 0.1, 0, 0, 0, -0.2, 0, 0, 0.2, 0.5, 0.1, 0, 0, 0, -0.2], 3));
        var birdM = new T.MeshBasicMaterial({ color: 0x3a3a48, side: T.DoubleSide });
        for (var bI = 0; bI < (ENV.birds != null ? ENV.birds : 6); bI++) {
            var bird = new T.Mesh(birdGeo.clone(), birdM); scene.add(bird); dayOnly.push(bird);
            (function (b, k) {
                var pos = b.geometry.attributes.position;
                ticks.push(function (t) {
                    var a = t * 0.25 + k * 1.05, r = 14 + (k % 3) * 3;
                    b.position.set(Math.cos(a) * r, 11 + (k % 2) * 2 + Math.sin(t + k) * 0.5, -6 + Math.sin(a) * r * 0.6);
                    b.rotation.y = -a;
                    var f = Math.sin(t * 9 + k) * 0.25; pos.setY(1, 0.1 + f); pos.setY(4, 0.1 + f); pos.needsUpdate = true;
                });
            })(bird, bI);
        }
        // светлячки ночью над зонами с fireflies: true
        W.zones.forEach(function (zn) {
            if (!zn.fireflies) { return; }
            var c = CENTERS[zn.id], g = new T.BufferGeometry(), ps = [], s2 = LAYOUT.zoneSize(zn);
            for (var i = 0; i < 40; i++) { ps.push(c[0] + (Math.random() - 0.5) * s2.w * 0.8, 0.4 + Math.random() * 2.2, c[1] + (Math.random() - 0.5) * s2.d * 0.8); }
            g.setAttribute("position", new T.Float32BufferAttribute(ps, 3));
            var ff = new T.Points(g, new T.PointsMaterial({ color: 0xfff59a, size: 0.14, transparent: true, opacity: 0.9, depthWrite: false }));
            ff.visible = false; scene.add(ff); nightOnly.push(ff);
            ticks.push(function (t) { if (ff.visible) { ff.material.opacity = 0.55 + Math.sin(t * 3) * 0.35; } });
        });
        // погода
        if (ENV.weather === "rain" || ENV.weather === "snow") {
            var snow = ENV.weather === "snow", pg = new T.BufferGeometry(), arr = [];
            for (var q = 0; q < 900; q++) { arr.push((Math.random() - 0.5) * 60, Math.random() * 20, (Math.random() - 0.5) * 60); }
            pg.setAttribute("position", new T.Float32BufferAttribute(arr, 3));
            var pts = new T.Points(pg, new T.PointsMaterial({ color: snow ? 0xffffff : 0xaac8e8, size: snow ? 0.12 : 0.06, transparent: true, opacity: 0.8, depthWrite: false }));
            scene.add(pts);
            ticks.push(function (t, dt) {
                var p = pg.attributes.position;
                for (var i = 0; i < p.count; i++) { var y = p.getY(i) - dt * (snow ? 1.5 : 14); if (y < 0) { y += 20; } p.setY(i, y); }
                p.needsUpdate = true; pts.position.set(camT.x, 0, camT.z);
            });
        }
    }

    function build() {
        var gr = new T.Mesh(new T.CircleGeometry(Math.max(95, BOUND + 40), 48), mat(ENV.groundColor || 0xaeb36f));
        gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true; scene.add(gr);
        if (!BOUND) {
            var far = 0;
            W.zones.forEach(function (z) { if (z.kind === "interior") { return; } var c = CENTERS[z.id], s = LAYOUT.zoneSize(z); far = Math.max(far, Math.sqrt(c[0] * c[0] + c[1] * c[1]) + Math.max(s.w, s.d) / 2); });
            BOUND = far + 8;
        }
        buildPaths();
        buildWater();
        W.zones.forEach(function (z) { if (z.kind === "interior") { buildInterior(z); } else { buildOutdoor(z); } });
        (W.props || []).forEach(function (it) { addProp(it, 0, 0, null, 0); });
        Object.keys(SIGNS).forEach(placeSign);
        if (QUEST.mystery && QUEST.mystery.place) { placeMystery(QUEST.mystery.place); }
        Object.keys(NPCS).forEach(addNpc);
        buildBackdrop();
        buildSky();
    }
    // табличка из данных: place = { zone, at, y, size:[w,h], rot, mount: post|posts|wall|stand|board|signpost|none, readAt }
    function placeSign(id) {
        var s = SIGNS[id], p = s.place;
        if (!p || p.mount === "facade") { return; }   // вывески на фасаде ставит само здание (deco: nameplate)
        var c = CENTERS[p.zone], at = p.at || [0, 0];
        var x = c[0] + at[0], z = c[1] + at[1], w = p.size ? p.size[0] : 1.4, h = p.size ? p.size[1] : 0.9, y = p.y != null ? p.y : 1.6;
        var G = new T.Group(); G.position.set(x, 0, z); G.rotation.y = p.rot || 0; scene.add(G);
        var readAt = p.readAt ? [c[0] + p.readAt[0], c[1] + p.readAt[1]] : null;
        if (p.mount === "signpost") {
            cyl(0.08, 0.1, y + s.lines.length * 0.56, 0x6b4a33, 0, 0, 0, G, 8);
            s.lines.forEach(function (l, k) { signPanel(id, w, 0.48, k % 2 ? -0.14 : 0.14, y + (s.lines.length - 1 - k) * 0.56, 0.1, G, [l], s.style, readAt); });
            colC(x, z, 0.3);
            return;
        }
        if (p.mount === "post") { cyl(0.07, 0.07, y - h / 2 + 0.1, 0x6b4a33, 0, 0, -0.05, G, 6); colC(x, z, 0.3); }
        if (p.mount === "posts" || p.mount === "board") { box(0.1, y + h / 2, 0.1, 0x6b4a33, -w / 2 + 0.05, 0, -0.04, G); box(0.1, y + h / 2, 0.1, 0x6b4a33, w / 2 - 0.05, 0, -0.04, G); colC(x, z, Math.min(1.0, w / 2)); }
        if (p.mount === "stand") { box(0.06, y, 0.06, 0x6b4a33, -w / 2 + 0.1, 0, -0.25, G); box(0.06, y, 0.06, 0x6b4a33, w / 2 - 0.1, 0, -0.25, G); colC(x, z, 0.55); }
        var me = signPanel(id, w, h, 0, y, 0.06, G, null, null, readAt);
        if (p.tilt) { me.rotation.x = p.tilt; }
    }
    function placeMystery(p) {
        var c = CENTERS[p.zone], x = c[0] + p.at[0], z = c[1] + p.at[1], G = new T.Group(); G.position.set(x, 0, z); G.rotation.y = p.rot || 0; scene.add(G);
        if (p.kind === "stone") { box(1.2, 1.5, 0.35, 0xbdb6a6, 0, 0, 0, G).rotation.x = -0.06; }
        else if (p.kind === "board") { box(1.6, 1.1, 0.08, 0x8c6447, 0, 1.0, 0, G); box(0.08, 1.0, 0.08, 0x6b4a33, -0.7, 0, 0, G); box(0.08, 1.0, 0.08, 0x6b4a33, 0.7, 0, 0, G); }
        else if (p.kind === "bottle") { cyl(0.1, 0.12, 0.42, 0x5e9c6b, 0, p.y || 0, 0, G, 10, { op: 0.8 }); }
        else { box(0.5, 0.06, 0.36, 0xf3e6c4, 0, p.y || 0.75, 0, G); }
        var spr = new T.Sprite(new T.SpriteMaterial({ map: markerTex("ready"), depthTest: false, transparent: true }));
        spr.scale.set(0.55, 0.55, 1); spr.position.set(0, (p.y || 1.2) + 1.0, 0); spr.renderOrder = 10; G.add(spr);
        var hm = new T.Mesh(new T.BoxGeometry(1.4, 2, 1.0), new T.MeshBasicMaterial()); hm.visible = false; hm.position.y = 1; G.add(hm);
        hits.push({ obj: hm, kind: "mystery", id: "mystery" });
        G.updateMatrixWorld(true);
        var at = new T.Vector3(0, 0, 1.3).applyMatrix4(G.matrixWorld);
        signs.__mystery = { at: at, zone: p.zone, mystery: true };
        colC(x, z, 0.5);
    }

    // ---------------------------------------------------------------- свет, небо, время суток
    function setupLights() {
        hemi = new T.HemisphereLight(0xeaf2ff, 0x8a7650, 0.55); scene.add(hemi);
        sun = new T.DirectionalLight(0xffe9c4, 0.85);
        sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
        var sc = sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 90;
        sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
        scene.add(sun); scene.add(sun.target);
        fill = new T.DirectionalLight(0xbfd8ff, 0.25); fill.position.set(-20, 12, -10); scene.add(fill);
        var sky = ENV.sky || {};
        bgDay = gradTex(sky.day || [[0, "#6fb7e6"], [0.55, "#b9def2"], [1, "#fcefd2"]]);
        bgEve = gradTex(sky.evening || [[0, "#3b3f7a"], [0.55, "#c9799a"], [1, "#f7c38a"]]);
        bgNight = gradTex(sky.night || [[0, "#070b1f"], [0.6, "#1b2350"], [1, "#4a3f6b"]]);
        bgIn = gradTex([[0, "#2a1f19"], [1, "#4a372b"]]);
        var sg = new T.BufferGeometry(), sp = [], r = rnd(99);
        for (var i = 0; i < 400; i++) { var a = r() * Math.PI * 2, e = 0.12 + r() * 1.2, R = 140; sp.push(Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, Math.sin(a) * Math.cos(e) * R); }
        sg.setAttribute("position", new T.Float32BufferAttribute(sp, 3));
        stars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 0.9, fog: false }));
        stars.visible = false; scene.add(stars);
        applyTime();
    }
    function applyTime() {
        if (!hemi) { return; }
        var fogC = ENV.fog || "#f3ead2";
        scene.background = inside ? bgIn : night ? bgNight : evening ? bgEve : bgDay;
        scene.fog = inside ? new T.Fog(0x3a2c22, 20, 45) : night ? new T.Fog(0x1d2350, 30, 95) : evening ? new T.Fog(0x8a6a86, 35, 105) : new T.Fog(col(fogC), 40, 110);
        hemi.color.set(night ? 0x5566aa : evening ? 0xffd2b0 : 0xeaf2ff); hemi.groundColor.set(night ? 0x1a1a2a : 0x8a7650); hemi.intensity = night ? 0.45 : inside ? 0.7 : 0.55;
        sun.color.set(night ? 0x9fb4ff : evening ? 0xffb07a : 0xffe9c4); sun.intensity = night ? 0.28 : evening ? 0.6 : 0.85;
        fill.intensity = night ? 0.1 : 0.25;
        stars.visible = (night || evening) && !inside;
        var dark = night || evening;
        lamps.forEach(function (l) { if (l.light) { l.light.intensity = dark ? 1.5 : 0; } l.bulb.emissive.set(dark ? 0xffd27a : 0x000000); });
        nightOnly.forEach(function (o) { o.visible = dark; });
        dayOnly.forEach(function (o) { o.visible = !night; });
    }

    // ---------------------------------------------------------------- герой: движение
    function heroPos() { return hero.root.position; }
    function goTo(x, z, then) {
        var p = heroPos();
        var pts = findPath(p.x, p.z, x, z);
        if (!pts) { pts = [new T.Vector3(x, 0, z)]; }
        path = pts;
        pending = then || null;
        return path.length;
    }
    function cancelPath() { path = []; pending = null; }
    function approach(x, z, reach, then) {
        var p = heroPos(), d = dist2(p.x, p.z, x, z);
        if (d <= reach) { cancelPath(); then(); return; }
        var k = Math.max(0, d - reach * 0.8) / d;
        goTo(p.x + (x - p.x) * k, p.z + (z - p.z) * k, { x: x, z: z, reach: reach, fn: then });
    }
    var WALK = W.walkSpeed || 5.0, RUN = W.runSpeed || 9.0;
    function updateHero(dt) {
        var p = heroPos(), vx = 0, vz = 0, run = keys.ShiftLeft || keys.ShiftRight;
        var f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
        var s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
        followMove = (f > 0 && !s) || (!f && !s && path.length > 0);
        if (f || s) {
            if (path.length || pending) { cancelPath(); }
            // направление «вперёд» запоминается, пока не сменится набор клавиш: камера, поворачиваясь при входе в локацию, не уводит героя в сторону
            var inKey = f + "," + s; if (inKey !== lastInKey) { lastInKey = inKey; moveYaw = camGoalYaw; }
            var fx = -Math.sin(moveYaw), fz = -Math.cos(moveYaw), rx = Math.cos(moveYaw), rz = -Math.sin(moveYaw);
            vx = fx * f + rx * s; vz = fz * f + rz * s;
            var l = Math.sqrt(vx * vx + vz * vz); vx /= l; vz /= l;
        } else if (path.length) {
            lastInKey = "0,0";
            var wp = path[0], dx = wp.x - p.x, dz = wp.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
            if (d < (hero.speed > 6 ? 0.45 : 0.25)) { path.shift(); }
            else { vx = dx / d; vz = dz / d; run = run || pathLen() > 6; }
        }
        if (!(f || s)) { lastInKey = "0,0"; }
        if (!path.length && pending && !(f || s)) {
            var pd = pending; pending = null;
            if (!pd.reach || dist2(p.x, p.z, pd.x, pd.z) <= pd.reach + 0.7) { pd.fn(); }
        }
        var speed = (vx || vz) ? (run ? RUN : WALK) : 0;
        hero.speed += (speed - hero.speed) * Math.min(1, dt * 16);
        if (vx || vz) {
            var q = resolveP({ x: p.x + vx * hero.speed * dt, z: p.z + vz * hero.speed * dt }, HERO_R);
            p.x = q.x; p.z = q.z;
            hero.yaw += angWrap(Math.atan2(vx, vz) - hero.yaw) * Math.min(1, dt * 12);
        }
        hero.root.rotation.y = hero.yaw;
        play(hero, hero.speed > (WALK + RUN) / 2 ? "sprint" : hero.speed > 0.4 ? "walk" : "idle", false, 0.15);
        if (hero.acts.walk) { hero.acts.walk.timeScale = Math.max(0.8, hero.speed / 3.0); }
        if (hero.acts.sprint) { hero.acts.sprint.timeScale = Math.max(0.9, hero.speed / 7.0); }
    }
    function pathLen() { var p = heroPos(), l = 0, a = p; path.forEach(function (w) { l += dist2(a.x, a.z, w.x, w.z); a = w; }); return l; }

    // двери, выходы, области
    function updateDoors(t) {
        if (doorCool > t) { return; }
        var p = heroPos();
        if (inside) {
            var rm = rooms[inside];
            if (p.z > rm.c.z + rm.d / 2 - 0.1 && Math.abs(p.x - rm.c.x) < 0.9) { travelTo(inside + ":out"); }
            return;
        }
        Object.keys(doors).forEach(function (id) {
            var d = doors[id];
            if (dist2(p.x, p.z, d.x, d.z) > (d.gate ? 1.3 : 0.8)) { return; }
            if (d.locked) { if (lockedCool < t) { lockedCool = t + 3; if (onLocked) { onLocked(id); } } return; }
            if (!d.gate) { travelTo(id); }
        });
    }
    function regionOf() {
        if (inside) { return inside; }
        var p = heroPos(), best = null, bd = 1e9;
        W.zones.forEach(function (z) {
            if (z.kind === "interior") { return; }
            var c = CENTERS[z.id];
            if (LAYOUT.inZone(z, c, p.x, p.z, 0.5)) {
                var a = LAYOUT.zoneSize(z).area;
                if (a < bd) { bd = a; best = z.id; }
            }
        });
        if (best) { return best; }
        bd = 1e9;
        // вне всех зон — ближайшая по краю
        W.zones.forEach(function (z) {
            if (z.kind === "interior") { return; }
            var c = CENTERS[z.id], s = LAYOUT.zoneSize(z), d = dist2(p.x, p.z, c[0], c[1]) - Math.min(s.w, s.d) / 2;
            if (d < bd) { bd = d; best = z.id; }
        });
        return best;
    }
    function fade(cb) {
        fadeEl.classList.add("on");
        setTimeout(function () { cb(); setTimeout(function () { fadeEl.classList.remove("on"); }, 120); }, 330);
    }
    function placeHero(sp) {
        inside = sp.inside || null;
        hero.root.position.set(sp.x, 0, sp.z); hero.yaw = sp.yaw; hero.root.rotation.y = sp.yaw; hero.speed = 0;
        cancelPath(); keys = {};
        exitCam = sp.exit || null;
        camZone = camZoneAt();
        var zc = camZone ? zoneCamera(camZone) : exitCam;
        camYaw = camGoalYaw = moveYaw = zc ? zc.yaw : sp.yaw + Math.PI;
        camPitch = camGoalPitch = zc ? zc.pitch : 0.62;
        lastInKey = "0,0";
        camT.set(sp.x, 1.3, sp.z); camD = zoomD;
        applyTime();
        doorCool = clock.elapsedTime + 0.8;
    }
    function travelTo(key) {
        var sp = SPAWN[key]; if (!sp) { return; }
        doorCool = clock.elapsedTime + 2;
        fade(function () { placeHero(sp); });
    }
    function findNear() {
        var p = heroPos(), best = null, bd = 2.1;
        Object.keys(npcs).forEach(function (id) {
            var n = npcs[id], d = dist2(p.x, p.z, n.root.position.x, n.root.position.z);
            if (d < bd) { bd = d; best = { kind: "npc", id: id }; }
        });
        Object.keys(signs).forEach(function (id) {
            var s = signs[id], d = dist2(p.x, p.z, s.at.x, s.at.z);
            if (d < Math.min(bd, 1.6)) { bd = d; best = s.mystery ? { kind: "mystery", id: "mystery" } : { kind: "sign", id: id }; }
        });
        return best;
    }
    function act(a) {
        if (!a || !onPick) { return; }
        if (a.kind === "npc") { faceHero(npcs[a.id]); }
        onPick(a);
    }
    function faceHero(n) {
        var p = heroPos();
        n.targetYaw = Math.atan2(p.x - n.root.position.x, p.z - n.root.position.z);
        hero.yaw = Math.atan2(n.root.position.x - p.x, n.root.position.z - p.z);
    }
    function interactTarget(h) {
        if (h.kind === "npc") { var n = npcs[h.id]; approach(n.root.position.x, n.root.position.z, 1.7, function () { act({ kind: "npc", id: h.id }); }); }
        else if (h.kind === "sign") { var s = signs[h.id]; approach(s.at.x, s.at.z, 1.0, function () { }); }
        else if (h.kind === "mystery") { var m = signs.__mystery; approach(m.at.x, m.at.z, 1.2, function () { act({ kind: "mystery", id: "mystery" }); }); }
        else if (h.kind === "door") {
            var d = doors[h.id];
            if (d.locked) { approach(d.x, d.z, 1.5, function () { if (onLocked) { onLocked(h.id); } }); }
            else if (d.gate) { goTo(d.inX, d.inZ); }
            else { goTo(d.x, d.z); }
        }
    }

    // ---------------------------------------------------------------- камера
    var camRay = new T.Raycaster();
    // Камера локации: у каждой зоны свой постоянный ракурс (zone.camera = {yaw, pitch, d}).
    // По умолчанию — со спины героя в точке появления; интерьер — с входа, сверху.
    // Зона с camera: "free" и зоны-подложки (nav: false) — свободная камера: она поворачивается туда, куда идёт герой.
    function zoneCamera(id) {
        var z = ZBY[id] || {}, c = (z.camera && typeof z.camera === "object") ? z.camera : {}, sp = SPAWN[id], interior = z.kind === "interior";
        return {
            yaw: c.yaw != null ? c.yaw : interior ? 0 : (sp ? sp.yaw + Math.PI : 0),
            pitch: c.pitch != null ? c.pitch : interior ? 0.85 : 0.62,
            d: c.d || null
        };
    }
    function isFreeZone(z) { return z.camera === "free" || (z.nav === false && !(z.camera && typeof z.camera === "object")); }
    function camZoneAt() {
        if (inside) { return inside; }
        var p = heroPos(), best = null, bd = 1e9;
        W.zones.forEach(function (z) {
            if (z.kind === "interior" || isFreeZone(z)) { return; }
            // запас на выходе больше, чем на входе: у края локации камера не дёргается туда-сюда
            if (LAYOUT.inZone(z, CENTERS[z.id], p.x, p.z, z.id === camZone ? 0.8 : -0.3)) {
                var a = LAYOUT.zoneSize(z).area;
                if (a < bd) { bd = a; best = z.id; }
            }
        });
        return best;
    }
    function updateCamera(dt, t) {
        var p = heroPos();
        if (coverMode) {
            var cc = W.cover || {}, ct = cc.at || [0, 0];
            camT.lerp(tmpV.set(ct[0], 1.5, ct[1]), 1 - Math.exp(-dt * 2));
            var cy = t * 0.06, cp = 0.7, cd = cc.d || 30;
            camera.position.set(camT.x + Math.sin(cy) * cd * Math.cos(cp), camT.y + cd * Math.sin(cp), camT.z + Math.cos(cy) * cd * Math.cos(cp));
            camera.lookAt(camT);
        } else {
            var goalT = camOverride ? camOverride.t : tmpV.set(p.x, 1.3, p.z);
            camT.lerp(goalT, 1 - Math.exp(-dt * (camOverride ? 2 : 10)));
            var zc = null;
            if (!camOverride) {
                if (exitCam && dist2(p.x, p.z, exitCam.x, exitCam.z) > EXIT_R) { exitCam = null; }
                camZone = camZoneAt();
                zc = camZone ? zoneCamera(camZone) : exitCam;
                if (zc) { camGoalYaw = camYaw + angWrap(zc.yaw - camYaw); camGoalPitch = zc.pitch; }
                else { camGoalPitch = 0.62; if (followMove && hero.speed > 0.5) { camGoalYaw += angWrap(hero.yaw + Math.PI - camGoalYaw) * Math.min(1, dt * 1.6); } }
            }
            camYaw += angWrap(camGoalYaw - camYaw) * Math.min(1, dt * (zc ? 2.6 : 8));
            camPitch += (camGoalPitch - camPitch) * Math.min(1, dt * 2.6);
            var want = camOverride ? camOverride.d : zc && zc.d ? zc.d * zoomD / ZOOM_MAX : zoomD;
            var pitch = camOverride ? 0.42 : camPitch;
            var yaw = camOverride ? camOverride.yaw : camYaw;
            var dir = tmpV2.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
            if (!inside && !camOverride) {
                camRay.set(camT, dir); camRay.far = want;
                var hit = camRay.intersectObjects(blockers, true)[0];
                if (hit) { want = Math.max(3.2, hit.distance - 0.5); }
            }
            camD += (want - camD) * Math.min(1, dt * (want < camD ? 14 : 3));
            camera.position.copy(camT).addScaledVector(dir, camD);
            camera.lookAt(camT);
            fadeWalls.forEach(function (w) {
                if (w.room !== inside) { return; }
                var side = tmpV.copy(camera.position).sub(w.m.position).dot(w.n);
                var op = side < 0 ? 0.15 : 1;
                w.m.material.opacity += (op - w.m.material.opacity) * Math.min(1, dt * 8);
                w.m.material.depthWrite = w.m.material.opacity > 0.9;
            });
        }
        sun.position.set(camT.x + (night ? -18 : 22), night ? 30 : 34, camT.z + (night ? 12 : 18));
        sun.target.position.set(camT.x, 0, camT.z);
    }

    // ---------------------------------------------------------------- ввод
    function typing() {
        var a = document.activeElement, wp = document.getElementById("wordpop");
        return !!((a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) || document.body.classList.contains("modal") || (wp && wp.classList.contains("on")));
    }
    function bindInput() {
        window.addEventListener("keydown", function (e) {
            if (!ready || coverMode || finaleOn || typing()) { keys = {}; return; }
            var c = e.code;
            // говорить — E / пробел / F; камеру игрок не крутит: в локации ракурс задан данными, между локациями она идёт за героем
            if ((c === "KeyE" || c === "Space" || c === "KeyF") && near) { e.preventDefault(); cancelPath(); act(near); return; }
            if (/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(c)) { keys[c] = true; if (/^Arrow/.test(c)) { e.preventDefault(); } }
        });
        window.addEventListener("keyup", function (e) { keys[e.code] = false; });
        window.addEventListener("blur", function () { keys = {}; });
        canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
        canvas.addEventListener("pointerdown", function (e) {
            if (coverMode || finaleOn) { return; }
            if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) { document.activeElement.blur(); }
        });
        window.addEventListener("pointermove", function (e) {
            var r = canvas.getBoundingClientRect();
            if (e.target !== canvas || coverMode || finaleOn) { hoverEl.classList.remove("on"); return; }
            var h = pickHit(e);
            canvas.style.cursor = h ? "pointer" : "default";
            if (h) {
                hoverEl.textContent = h.kind === "npc" ? NPCS[h.id].name : h.kind === "sign" ? SIGNS[h.id].title : h.kind === "mystery" ? (QUEST.mystery.title || "Загадка") :
                    (doors[h.id].locked ? "Закрыто: " : doors[h.id].gate ? "Вход: " : "Войти: ") + plainName(h.id);
                hoverEl.style.left = (e.clientX - r.left + 16) + "px"; hoverEl.style.top = (e.clientY - r.top + 14) + "px";
                hoverEl.classList.add("on");
            } else { hoverEl.classList.remove("on"); }
        });
        canvas.addEventListener("click", function (e) {
            if (coverMode || finaleOn) { return; }
            var h = pickHit(e);
            if (h) { e.stopPropagation(); interactTarget(h); return; }
            var r = canvas.getBoundingClientRect();
            mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
            ray.setFromCamera(mouse, camera);
            var gp = ray.ray.intersectPlane(groundPlane, new T.Vector3());
            if (gp) { goTo(gp.x, gp.z); marker.position.set(gp.x, 0.04, gp.z); marker.visible = true; marker.userData.t = clock.elapsedTime; }
        });
        canvas.addEventListener("wheel", function (e) {
            if (coverMode || finaleOn) { return; }
            e.preventDefault();
            zoomD = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomD * (e.deltaY > 0 ? 1.1 : 0.9)));
        }, { passive: false });
    }
    function plainName(id) { var z = ZBY[id]; return z ? parseLine(z.name).map(function (s) { return s.w ? s.s : s.t; }).join("") : id; }
    function pickHit(e) {
        var r = canvas.getBoundingClientRect();
        mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(mouse, camera);
        var res = ray.intersectObjects(hits.map(function (h) { return h.obj; }), false);
        for (var i = 0; i < res.length; i++) { for (var j = 0; j < hits.length; j++) { if (hits[j].obj === res[i].object) { return hits[j]; } } }
        return null;
    }

    // ---------------------------------------------------------------- цикл
    function loop() {
        requestAnimationFrame(loop);
        var dt = Math.min(clock.getDelta(), 0.1) * (api.timeScale || 1), t = clock.elapsedTime;
        if (!coverMode && !finaleOn) {
            var steps = Math.ceil(dt / 0.025);
            for (var s = 0; s < steps; s++) { updateHero(dt / steps); }
            updateDoors(t);
        }
        hero.mixer.update(dt);
        Object.keys(npcs).forEach(function (id) {
            var n = npcs[id];
            n.mixer.update(dt);
            if (n.cur !== (n.baseAnim || "idle") && n.acts[n.cur] && n.acts[n.cur].loop === T.LoopOnce && !n.acts[n.cur].isRunning()) { play(n, n.baseAnim || "idle"); }
            n.yaw += angWrap(n.targetYaw - n.yaw) * Math.min(1, dt * 6); n.root.rotation.y = n.yaw;
            if (n.talkUntil && t > n.talkUntil) { n.talkUntil = 0; n.targetYaw = n.baseYaw; }
        });
        swayers.forEach(function (o) { o.o.rotation.z = Math.sin(t * 0.9 + o.ph) * 0.018; o.o.rotation.x = Math.cos(t * 0.7 + o.ph) * 0.012; });
        ticks.forEach(function (f) { f(t, dt); });
        if (marker.visible) { var age = t - marker.userData.t; marker.scale.setScalar(1 + age * 1.5); marker.material.opacity = Math.max(0, 0.9 - age * 1.2); if (age > 0.8) { marker.visible = false; } }
        updateCamera(dt, t);
        if (!coverMode && !finaleOn) {
            var reg = regionOf();
            if (reg !== lastLoc) { lastLoc = reg; if (onLoc) { onLoc(reg); } }
            near = findNear();
            showPrompt();
        } else { near = null; promptEl.classList.remove("on"); }
        renderer.render(scene, camera);
        if (onFrame) { onFrame(); }
        api.frames = (api.frames || 0) + 1;
    }
    function showPrompt() {
        if (!near || typing()) { promptEl.classList.remove("on"); return; }
        var pos = near.kind === "npc" ? npcs[near.id].root.position : near.kind === "mystery" ? signs.__mystery.at : signs[near.id].at;
        tmpV.set(pos.x, 0.1, pos.z).project(camera);
        var w = canvas.clientWidth, h = canvas.clientHeight;
        promptEl.innerHTML = "<b>E</b> " + (near.kind === "npc" ? "поговорить: " + NPCS[near.id].name + " <span>или клик</span>" : near.kind === "mystery" ? "рассмотреть: " + (QUEST.mystery.title || "загадка") : "во весь экран: " + SIGNS[near.id].title);
        promptEl.style.left = ((tmpV.x + 1) / 2 * w) + "px"; promptEl.style.top = Math.min(h - 120, (1 - tmpV.y) / 2 * h + 14) + "px";
        promptEl.classList.add("on");
    }
    function resize() {
        if (!holder) { return; }
        var w = holder.clientWidth || window.innerWidth, h = holder.clientHeight || window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    function overlayEls() {
        fadeEl = document.createElement("div"); fadeEl.className = "world-fade"; holder.appendChild(fadeEl);
        promptEl = document.createElement("div"); promptEl.className = "world-prompt"; holder.appendChild(promptEl);
        hoverEl = document.createElement("div"); hoverEl.className = "hover-label"; holder.appendChild(hoverEl);
        marker = new T.Mesh(new T.RingGeometry(0.25, 0.36, 24), new T.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.9, depthWrite: false }));
        marker.rotation.x = -Math.PI / 2; marker.visible = false; scene.add(marker);
    }

    // ---------------------------------------------------------------- API
    api.init = function (el, cb) {
        holder = el;
        try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); }
        catch (e) { api.error = "WebGL недоступен"; if (cb) { cb(false); } return; }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputEncoding = T.sRGBEncoding;
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
        canvas = renderer.domElement; canvas.className = "world-canvas";
        holder.appendChild(canvas);
        scene = new T.Scene();
        camera = new T.PerspectiveCamera(40, 16 / 9, 0.3, 400);
        clock = new T.Clock();
        resize();
        window.addEventListener("resize", resize);
        if (window.ResizeObserver) { new ResizeObserver(resize).observe(holder); }
        loadAll(function () {
            try {
                overlayEls();
                build();
                hero = makeHero();
                placeHero(SPAWN[W.start || W.zones[0].id]);
                setupLights();
                bindInput();
            } catch (err) { console.error(err); api.error = String(err && err.stack || err); if (cb) { cb(false); } return; }
            ready = true; api.ok = true;
            loop();
            if (cb) { cb(true); }
        });
    };
    api.onPick = function (f) { onPick = f; };
    api.onFrame = function (f) { onFrame = f; };
    api.onLoc = function (f) { onLoc = f; };
    api.onLocked = function (f) { onLocked = f; };
    api.cover = function (on) { coverMode = on; };
    api.start = function (loc) { var sp = SPAWN[loc] || SPAWN[W.start || W.zones[0].id]; placeHero(ZBY[loc] && ZBY[loc].kind === "interior" ? SPAWN[loc] : sp); lastLoc = null; };
    api.show = function (loc, st, markers) {
        if (!ready) { return; }
        Object.keys(doors).forEach(function (id) {
            var d = doors[id], open = locUnlocked(st, id);
            d.locked = !open; d.lock.visible = !open;
            if (d.gate) { d.col.off = open; d.g.rotation.y = (d.horiz ? 0 : Math.PI / 2) + (open ? -1.4 : 0); }
            else { d.mesh.bar.visible = !open; d.mesh.leafM.color.set(open ? (QUEST.world.doorColor || 0x2f6fa3) : 0x51606e); }
        });
        api.setMarkers(markers || {});
    };
    api.setMarkers = function (mk) {
        Object.keys(npcs).forEach(function (id) {
            var n = npcs[id], k = mk[id];
            n.marker.visible = !!k && !finaleOn;
            if (k) { markerTexs[k] = markerTexs[k] || markerTex(k); n.marker.material.map = markerTexs[k]; n.marker.material.needsUpdate = true; }
        });
    };
    api.near = function () { return near; };
    api.travel = function (loc) { if (ready && SPAWN[loc]) { travelTo(loc); } };
    api.region = function () { return ready ? regionOf() : null; };
    api.anchor = function (npcId, dy) {
        var n = npcs[npcId];
        if (!n || !ready) { return null; }
        n.root.getWorldPosition(tmpV); tmpV.y += (dy == null ? 2.25 : dy);
        tmpV.project(camera);
        var w = canvas.clientWidth, h = canvas.clientHeight;
        return { x: (tmpV.x + 1) / 2 * w, y: (1 - tmpV.y) / 2 * h, w: w, h: h, behind: tmpV.z > 1 };
    };
    api.talk = function (npcId) {
        var n = npcs[npcId]; if (!n) { return; }
        faceHero(n);
        n.talkUntil = clock.elapsedTime + 12;
        play(n, Math.random() < 0.5 ? "emote-yes" : "interact-right", true);
    };
    api.calm = function (npcId) { var n = npcs[npcId]; if (n) { n.talkUntil = clock.elapsedTime + 0.6; } };
    api.dist = function (npcId) { var n = npcs[npcId]; if (!n || !hero) { return 0; } var p = heroPos(); return dist2(p.x, p.z, n.root.position.x, n.root.position.z); };
    api.say = function (npcId) { var n = npcs[npcId]; if (n) { play(n, "emote-yes", true); } };
    api.setNight = function (v) { night = !!v; if (ready) { applyTime(); } };
    // финальная сцена из QUEST.finale: где, кто где стоит, куда смотрит камера
    api.finale = function (on) {
        if (!ready) { return; }
        var F = QUEST.finale || {}, c = CENTERS[F.zone] || [0, 0], room = ZBY[F.zone] && ZBY[F.zone].kind === "interior";
        if (on) {
            finaleOn = true; cancelPath(); keys = {};
            var hp = F.hero || [0, 4, Math.PI];
            placeHero({ x: c[0] + hp[0], z: c[1] + hp[1], yaw: hp[2] || 0, inside: room ? F.zone : null });
            if (F.night) { api.setNight(true); }
            Object.keys(F.cast || {}).forEach(function (id) { var p = F.cast[id], n = npcs[id]; if (n) { moveNpc(n, c[0] + p[0], c[1] + p[1], p[2] || 0); } });
            var cam = F.camera || {}, ca = cam.at || [0, 0];
            camOverride = { t: new T.Vector3(c[0] + ca[0], cam.y || 1.2, c[1] + ca[1]), d: cam.d || 8, yaw: cam.yaw || 0 };
            Object.keys(npcs).forEach(function (id) { npcs[id].marker.visible = false; });
        } else {
            finaleOn = false; camOverride = null;
            night = ENV.time === "night"; applyTime();
            Object.keys(F.cast || {}).forEach(function (id) { var n = npcs[id]; if (n) { moveNpc(n, n.home.x, n.home.z, n.homeYaw); } });
            api.start(F.zone);
        }
    };
    api.snap = function () { var p = heroPos(); camT.set(p.x, 1.3, p.z); camYaw = camGoalYaw; camPitch = camGoalPitch; camD = zoomD; };
    // отладка, снимки экрана и проверка проходимости (tools/shot.mjs)
    api.debug = {
        hero: function () { var p = heroPos(); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), inside: inside, region: regionOf(), anim: hero.cur, path: path.length, near: near }; },
        goTo: function (x, z) { return goTo(x, z); },
        click: function (kind, id) { interactTarget({ kind: kind, id: id }); return path.length; },
        key: function (code, down) { keys[code] = !!down; },
        place: function (x, z, yaw) { placeHero({ x: x, z: z, yaw: yaw || 0, inside: null }); },
        spawn: function (k) { var s = SPAWN[k]; if (s) { placeHero(s); } return !!s; },
        spawns: function () { return Object.keys(SPAWN); },
        doors: function () { var o = {}; Object.keys(doors).forEach(function (k) { o[k] = { x: +doors[k].x.toFixed(2), z: +doors[k].z.toFixed(2), locked: doors[k].locked, gate: !!doors[k].gate }; }); return o; },
        npcPos: function (id) { var p = npcs[id].root.position; return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }; },
        blocked: function (x, z) { return blockedAt(x, z, HERO_R); },
        setYaw: function (y) { camYaw = camGoalYaw = y; },
        cam: function () { return { zone: camZone, exit: !!exitCam, yaw: +camYaw.toFixed(2), goal: +camGoalYaw.toFixed(2), pitch: +camPitch.toFixed(2) }; },
        zoom: function (d) { zoomD = d; camD = d; },
        night: function (v) { api.setNight(v); },
        sign: function (id) { var a = signs[id].at; return { x: +a.x.toFixed(2), z: +a.z.toFixed(2), blocked: blockedAt(a.x, a.z, HERO_R) }; },
        // проходимость: от точки входа каждой открытой зоны до всех жителей и табличек (без учёта запертых дверей)
        reach: function () {
            var out = [], saveOff = [];
            Object.keys(doors).forEach(function (k) { if (doors[k].col) { saveOff.push([doors[k].col, doors[k].col.off]); doors[k].col.off = true; } });
            function test(fromKey, toX, toZ, what, reach) {
                var sp = SPAWN[fromKey]; inside = sp.inside || null;
                var pts = findPath(sp.x, sp.z, toX, toZ);
                var endOk = false;
                if (pts && pts.length) { var e = pts[pts.length - 1]; endOk = dist2(e.x, e.z, toX, toZ) <= reach + 0.8; }
                else { endOk = dist2(sp.x, sp.z, toX, toZ) <= reach; }
                out.push({ what: what, from: fromKey, ok: endOk });
            }
            Object.keys(npcs).forEach(function (id) {
                var n = npcs[id], z = ZBY[n.zone], from = z.kind === "interior" ? n.zone : (W.start || W.zones[0].id);
                test(from, n.root.position.x, n.root.position.z, "npc:" + id, 1.7);
            });
            Object.keys(signs).forEach(function (id) {
                var s = signs[id], z = ZBY[s.zone], from = z && z.kind === "interior" ? s.zone : (W.start || W.zones[0].id);
                test(from, s.at.x, s.at.z, "sign:" + id, 1.6);
            });
            Object.keys(doors).forEach(function (id) { if (!doors[id].gate) { test(W.start || W.zones[0].id, doors[id].x, doors[id].z, "door:" + id, 0.8); } });
            saveOff.forEach(function (p) { p[0].off = p[1]; });
            inside = null;
            return out;
        },
    };
    api.stats = function () { return { draws: renderer.info.render.calls, tris: renderer.info.render.triangles, models: Object.keys(models).length, frames: api.frames || 0, colliders: cols.length }; };
    api.hasModel = function (k) { return !!models[k]; };
    return api;
})();
