// 3D-квартал Λεμονιές: three.js r147 (глобальный THREE) + модели Kenney (CC0) из js/models.js.
// Игрок управляет путником: WASD/стрелки, Shift — бегом, клик по земле — идти туда.
// Интерфейс игры (ui.js) зовёт WORLD.show / travel / anchor / talk / finale и получает onPick / onLoc / onLocked.
var WORLD = (function () {
    "use strict";
    var T = window.THREE;
    var api = { ok: false, timeScale: 1 };
    if (!T || !window.MODELS) { return api; }

    var renderer, scene, camera, clock, holder, canvas;
    var hemi, sun, fill;
    var models = {}, kitTex = {};
    var hits = [];            // { obj, kind: npc|sign|door, id }
    var npcs = {};            // id -> житель
    var signs = {};           // id -> { at: Vector3 (точка, откуда читать), loc }
    var doors = {};           // loc -> дверь
    var rooms = {};           // loc -> интерьер
    var cols = [];            // коллайдеры: { t: "c", x, z, r } | { t: "b", x0, x1, z0, z1 }; off — выключен
    var swayers = [], ticks = [], lamps = [], nightOnly = [], dayOnly = [], fadeWalls = [], blockers = [];
    var ready = false;
    var coverMode = true, night = false, finaleOn = false, inside = null;
    var hero = null;
    var keys = {};
    var path = [], pending = null;   // путь героя и действие по приходу
    var camT = new T.Vector3(0, 1.3, 3), camYaw = 0, camGoalYaw = 0, camPitch = 0.62, camD = 10, zoomD = 10, camOverride = null;
    var mouse = new T.Vector2(), ray = new T.Raycaster(), groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
    var onPick = null, onFrame = null, onLoc = null, onLocked = null;
    var drag = null, dragged = false, lastLoc = null, lockedCool = 0, doorCool = 0;
    var tmpV = new T.Vector3(), tmpV2 = new T.Vector3();
    var bgDay, bgNight, bgIn, stars, fadeEl, promptEl, hoverEl, marker;
    var near = null;
    var HERO_R = 0.36;
    var userRotT = -10, followMove = false;   // когда игрок сам крутил камеру; идёт ли герой «вперёд»

    // ---------------------------------------------------------------- утилиты
    function rnd(seed) { var s = seed || 1; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
    function mat(color, o) {
        o = o || {};
        return new T.MeshStandardMaterial({ color: color, roughness: o.r != null ? o.r : 0.85, metalness: 0, emissive: o.e || 0x000000, emissiveIntensity: o.ei || 1, transparent: !!o.op, opacity: o.op || 1, flatShading: !!o.flat });
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
    function resolve(p, r) {
        for (var pass = 0; pass < 3; pass++) {
            for (var i = 0; i < cols.length; i++) {
                var c = cols[i];
                if (c.off) { continue; }
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
        var d = Math.sqrt(p.x * p.x + p.z * p.z), R = 36;
        if (d > R - r) { p.x *= (R - r) / d; p.z *= (R - r) / d; }
    }
    function blockedAt(x, z, r) {
        if (!inside && Math.sqrt(x * x + z * z) > 36 - r) { return true; }
        for (var i = 0; i < cols.length; i++) {
            var c = cols[i];
            if (c.off) { continue; }
            if (c.t === "c") { if (dist2(x, z, c.x, c.z) < c.r + r) { return true; } }
            else { var cx = Math.max(c.x0, Math.min(x, c.x1)), cz = Math.max(c.z0, Math.min(z, c.z1)); if (dist2(x, z, cx, cz) < r) { return true; } }
        }
        return false;
    }

    // ---------------------------------------------------------------- поиск пути (A* по сетке 0.5 м)
    function findPath(sx, sz, gx, gz) {
        var C = 0.5, r = HERO_R + 0.06;
        var x0 = Math.min(sx, gx) - 10, z0 = Math.min(sz, gz) - 10, x1 = Math.max(sx, gx) + 10, z1 = Math.max(sz, gz) + 10;
        var W = Math.min(180, Math.ceil((x1 - x0) / C)), H = Math.min(180, Math.ceil((z1 - z0) / C));
        var cache = new Int8Array(W * H);
        function free(ix, iz) {
            if (ix < 0 || iz < 0 || ix >= W || iz >= H) { return false; }
            var k = iz * W + ix;
            if (!cache[k]) { cache[k] = blockedAt(x0 + (ix + 0.5) * C, z0 + (iz + 0.5) * C, r) ? 2 : 1; }
            return cache[k] === 1;
        }
        var si = Math.floor((sx - x0) / C), sj = Math.floor((sz - z0) / C);
        var gi = Math.floor((gx - x0) / C), gj = Math.floor((gz - z0) / C);
        if (!free(gi, gj)) {
            var found = false;
            for (var rad = 1; rad < 8 && !found; rad++) {
                for (var a = -rad; a <= rad && !found; a++) {
                    for (var b = -rad; b <= rad && !found; b++) {
                        if (Math.max(Math.abs(a), Math.abs(b)) === rad && free(gi + a, gj + b)) { gi += a; gj += b; found = true; }
                    }
                }
            }
            if (!found) { return null; }
        }
        var N = W * H, g = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
        var heap = [];
        function push(k, f) { heap.push([f, k]); var i = heap.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) { break; } var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } }
        function pop() { var top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; var i = 0; for (;;) { var l = i * 2 + 1, rr = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) { m = l; } if (rr < heap.length && heap[rr][0] < heap[m][0]) { m = rr; } if (m === i) { break; } var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; }
        if (si < 0 || sj < 0 || si >= W || sj >= H) { return null; }
        var sk = sj * W + si, gk = gj * W + gi;
        g[sk] = 0; push(sk, 0);
        var D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
        var iter = 0;
        while (heap.length && iter++ < 40000) {
            var cur = pop()[1];
            if (closed[cur]) { continue; }
            if (cur === gk) { break; }
            closed[cur] = 1;
            var ci = cur % W, cj = (cur / W) | 0;
            for (var d = 0; d < 8; d++) {
                var ni = ci + D[d][0], nj = cj + D[d][1];
                if (!free(ni, nj)) { continue; }
                if (D[d][2] > 1 && (!free(ci + D[d][0], cj) || !free(ci, cj + D[d][1]))) { continue; }
                var nk = nj * W + ni, ng = g[cur] + D[d][2];
                if (ng < g[nk]) { g[nk] = ng; from[nk] = cur; push(nk, ng + Math.hypot(gi - ni, gj - nj)); }
            }
        }
        if (from[gk] < 0 && gk !== sk) { return null; }
        var pts = [], k2 = gk;
        while (k2 !== -1 && k2 !== sk) { pts.push(new T.Vector3(x0 + (k2 % W + 0.5) * C, 0, z0 + (((k2 / W) | 0) + 0.5) * C)); k2 = from[k2]; }
        pts.reverse();
        var out = [], here = new T.Vector3(sx, 0, sz), i2 = 0;
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

    // ---------------------------------------------------------------- палитра Kenney
    // suburban: зелёные крыши -> терракота; commercial: зелёное -> синее, тёмно-серый цоколь -> эгейский синий
    function recolor(dataUrl, kit, cb) {
        var img = new Image();
        img.onload = function () {
            var c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
            var g = c.getContext("2d"); g.drawImage(img, 0, 0);
            if (kit === "sub" || kit === "com") {
                var d = g.getImageData(0, 0, c.width, c.height), p = d.data;
                for (var i = 0; i < p.length; i += 4) {
                    var r = p[i], gg = p[i + 1], b = p[i + 2];
                    var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 510;
                    if (mx === gg && gg > r + 15 && gg > b - 5 && (mx - mn) > 40) {
                        var tg = kit === "sub" ? [200, 98, 62] : [48, 108, 168], k = l / 0.5;
                        p[i] = Math.min(255, tg[0] * k); p[i + 1] = Math.min(255, tg[1] * k); p[i + 2] = Math.min(255, tg[2] * k);
                    } else if (kit === "com" && b >= r && b - r < 45 && mx < 120 && (mx - mn) < 50) {
                        var k2 = 0.75 + l * 0.7;
                        p[i] = Math.min(255, 70 * k2 + 12); p[i + 1] = Math.min(255, 128 * k2 + 14); p[i + 2] = Math.min(255, 186 * k2 + 18);
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
                    function (err) { console.warn("[Λεμονιές] модель не загрузилась: " + key, err); if (--n === 0) { done(); } });
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
                    if (kit === "nat" && m.color && !m.userData.tinted) {
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
    // экземпляр модели: h — высота, w — ширина, s — масштаб; col — коллайдер: "b" (бокс) или радиус круга; block — заслоняет камеру
    function inst(key, x, z, o, parent) {
        o = o || {};
        var m = models[key];
        if (!m) { console.warn("[Λεμονιές] нет модели " + key); return new T.Group(); }
        var root = new T.Group();
        var obj = o.unique ? m.scene : m.scene.clone(true);
        var sc = o.h ? o.h / m.size.y : o.w ? o.w / m.size.x : o.s || 1;
        obj.scale.setScalar(sc);
        obj.position.y = -m.min.y * sc;
        if (!o.nocenter) { obj.position.x = -(m.min.x + m.size.x / 2) * sc; obj.position.z = -(m.min.z + m.size.z / 2) * sc; }
        root.add(obj);
        root.position.set(x, o.y || 0, z);
        root.rotation.y = o.rot || 0;
        root.userData.size = m.size.clone().multiplyScalar(sc);
        (parent || scene).add(root);
        if (o.col === "b") { colObj(root, o.shrink); }
        else if (typeof o.col === "number") { root.updateMatrixWorld(true); root.getWorldPosition(tmpV); colC(tmpV.x, tmpV.z, o.col); }
        if (o.block) { blockers.push(root); }
        return root;
    }

    // ---------------------------------------------------------------- текстуры и таблички
    function canvasTex(c) { var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; }
    function tileTex(a, b, n, grout) {
        var c = document.createElement("canvas"); c.width = c.height = 256;
        var g = c.getContext("2d"), r = rnd(7), s = 256 / n;
        g.fillStyle = grout; g.fillRect(0, 0, 256, 256);
        for (var y = 0; y < n; y++) { for (var x = 0; x < n; x++) { g.fillStyle = r() < 0.5 ? a : b; g.globalAlpha = 0.85 + r() * 0.15; g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4); } }
        g.globalAlpha = 1;
        var t = canvasTex(c); t.wrapS = t.wrapT = T.RepeatWrapping;
        return t;
    }
    function gradTex(stops) {
        var c = document.createElement("canvas"); c.width = 4; c.height = 256;
        var g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
        stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
        g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
        return canvasTex(c);
    }
    // все таблички — тёмный крупный текст на светлом поле; рамка лишь подсказывает материал (дерево, эмаль, доска)
    var SIGN_STYLE = {
        wood:  { bg: "#fdf6e6", edge: "#8c6447", ink: "#231f1c", hl: "#b0401f" },
        plate: { bg: "#ffffff", edge: "#2f6fa3", ink: "#14304f", hl: "#b0401f" },
        chalk: { bg: "#fbfaf4", edge: "#2f4a3a", ink: "#1d2a24", hl: "#b0401f" },
        paper: { bg: "#fffdf6", edge: "#c9b48c", ink: "#231f1c", hl: "#b0401f" },
        cork:  { bg: "#fffdf6", edge: "#a77a4c", ink: "#231f1c", hl: "#b0401f" },
    };
    function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function segsOf(line) { return (typeof parseLine === "function" ? parseLine(line) : [{ t: line }]).map(function (s) { return s.w ? { t: s.s, hl: true } : { t: s.t }; }); }
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
        // высокое разрешение: не меньше 1024 px по ширине таблички
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
            signs[id] = { at: at ? new T.Vector3(at[0], 0, at[1]) : new T.Vector3(p.x + nrm.x * 1.1, 0, p.z + nrm.z * 1.1), loc: s.loc };
        }
        return me;
    }
    function markerTex(kind) {
        var c = document.createElement("canvas"); c.width = c.height = 128;
        var g = c.getContext("2d");
        g.fillStyle = kind === "ready" ? "#f4c84a" : "#fffaf0"; g.strokeStyle = "#2b2a33"; g.lineWidth = 8;
        g.beginPath(); g.ellipse(64, 54, 50, 42, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(44, 88); g.lineTo(34, 120); g.lineTo(66, 94); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.ellipse(64, 54, 44, 36, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#2b2a33"; g.font = "900 64px 'Segoe UI', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(kind === "ready" ? "!" : "?", 64, 58);
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
    var NPC_MODEL = { takis: "chars/character-male-g", sofia: "chars/character-female-b", nikos: "chars/character-male-e", eleni: "chars/character-female-d", anna: "chars/character-female-c", giorgos: "chars/character-male-f" };
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
    function addNpc(id, loc, x, z, rot) {
        var n = character(NPC_MODEL[id], x, z, rot);
        var hit = new T.Mesh(new T.CylinderGeometry(0.6, 0.6, 2.1, 8), new T.MeshBasicMaterial());
        hit.visible = false; hit.position.y = 1.05; n.root.add(hit);
        var spr = new T.Sprite(new T.SpriteMaterial({ map: markerTex("wait"), depthTest: false, transparent: true }));
        spr.scale.set(0.6, 0.6, 1); spr.position.y = 2.55; spr.renderOrder = 10; spr.visible = false; n.root.add(spr);
        n.id = id; n.loc = loc; n.hit = hit; n.marker = spr; n.baseYaw = n.yaw = n.targetYaw = rot || 0;
        n.home = n.root.position.clone(); n.homeYaw = rot || 0; n.talkUntil = 0;
        n.col = colC(x, z, 0.42, "npc:" + id);
        npcs[id] = n;
        hits.push({ obj: hit, kind: "npc", id: id });
        return n;
    }
    // предмет в правой руке жителя (крепим к кости руки, чтобы двигался с анимацией)
    function holdInHand(n, key, h) {
        var bone = null;
        n.root.traverse(function (o) { if (o.isBone && /arm-right/i.test(o.name)) { bone = o; } });
        if (!bone) { return; }
        n.root.updateMatrixWorld(true);
        var it = inst(key, 0, 0, { h: h });
        var bp = new T.Vector3(); bone.getWorldPosition(bp);
        var side = new T.Vector3(-0.42, 0, 0.12).applyAxisAngle(new T.Vector3(0, 1, 0), n.root.rotation.y);
        it.position.set(bp.x + side.x, 0.62, bp.z + side.z);
        it.updateMatrixWorld(true);
        bone.attach(it);
    }
    function moveNpc(n, x, z, yaw) {
        n.root.position.set(x, 0, z); n.col.x = x; n.col.z = z;
        n.baseYaw = n.targetYaw = n.yaw = yaw; n.root.rotation.y = yaw;
    }
    function makeHero(x, z) {
        var h = character("chars/character-worker", 0, 0, 0);
        h.root.updateMatrixWorld(true);
        var torso = null;
        h.root.traverse(function (o) { if (o.isBone && /torso/i.test(o.name)) { torso = o; } });
        // рюкзак путника крепим к кости торса — качается вместе с героем
        var pack = new T.Group();
        box(0.5, 0.58, 0.26, 0x6b8a3a, 0, 0.75, -0.3, pack);
        box(0.44, 0.18, 0.06, 0x56702d, 0, 0.92, -0.45, pack);
        box(0.52, 0.12, 0.3, 0x8c6447, 0, 1.3, -0.3, pack);
        cyl(0.09, 0.09, 0.5, 0xc8643b, 0, 1.38, -0.3, pack, 8).rotation.z = Math.PI / 2;
        h.root.add(pack); pack.updateMatrixWorld(true);
        if (torso) { pack.children.slice().forEach(function (c) { torso.attach(c); }); h.root.remove(pack); }
        h.root.position.set(x, 0, z);
        h.yaw = Math.PI; h.speed = 0;
        shadowAll(h.root);
        return h;
    }
    function dog(x, z, rot, moving) {
        var g = new T.Group(), fur = mat(0xc98b52), dark = mat(0x6b4a33);
        box(0.62, 0.3, 0.28, fur, 0, 0.28, 0, g);
        var head = box(0.3, 0.26, 0.24, fur, 0.36, 0.48, 0, g);
        box(0.12, 0.1, 0.12, dark, 0.54, 0.5, 0, g);
        box(0.06, 0.14, 0.08, dark, 0.3, 0.72, 0.09, g); box(0.06, 0.14, 0.08, dark, 0.3, 0.72, -0.09, g);
        [[0.22, 0.09], [0.22, -0.09], [-0.22, 0.09], [-0.22, -0.09]].forEach(function (p) { box(0.08, 0.28, 0.08, fur, p[0], 0, p[1], g); });
        var tail = new T.Group(); tail.position.set(-0.31, 0.52, 0); g.add(tail);
        box(0.06, 0.22, 0.06, dark, 0, 0, 0, tail).rotation.z = 0.5;
        g.position.set(x, 0, z); g.rotation.y = rot || 0; shadowAll(g); scene.add(g);
        if (!moving) { colC(x, z, 0.35); }
        ticks.push(function (t) { tail.rotation.z = Math.sin(t * 9) * 0.5; head.rotation.z = Math.sin(t * 1.3) * 0.08; });
        return g;
    }
    // «Ο σκύλος μου κάνει βόλτα εδώ» — собака гуляет по кругу у фонтана
    function walkingDog(cx, cz, r) {
        var g = dog(cx + r, cz, 0, true), c = colC(cx + r, cz, 0.35);
        ticks.push(function (t) {
            var a = t * 0.32, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            g.position.set(x, Math.abs(Math.sin(t * 11)) * 0.04, z); g.rotation.y = -a - Math.PI / 2;
            c.x = x; c.z = z;
        });
        return g;
    }
    var lemonGeo, lemonMat;
    function lemonTree(x, z, h, seed, noCol, y0) {
        var t = inst(seed % 2 ? "nat/tree_default" : "nat/tree_fat", x, z, { h: h || 3.2, rot: seed * 1.7, y: y0 || 0 });
        var s = t.userData.size, r = rnd(seed + 3);
        lemonGeo = lemonGeo || new T.SphereGeometry(0.1, 7, 5);
        lemonMat = lemonMat || mat(0xf4d03a, { e: 0x5a4200, ei: 0.25 });
        for (var i = 0; i < 12; i++) {
            var a = r() * Math.PI * 2, yy = s.y * (0.45 + r() * 0.42), rad = (s.x * 0.5) * (0.65 + r() * 0.25) * (1 - Math.abs(yy / s.y - 0.68));
            var l = mesh(lemonGeo, lemonMat, Math.cos(a) * rad * 1.15, yy, Math.sin(a) * rad * 1.15, t);
            l.scale.set(1, 1.25, 1); l.castShadow = false;
        }
        swayers.push({ o: t, ph: seed });
        if (!noCol) { colC(x, z, 0.45); }
        return t;
    }
    function tree(key, x, z, h, seed) { var t = inst(key, x, z, { h: h, rot: (seed || 1) * 1.3 }); swayers.push({ o: t, ph: seed || 1 }); colC(x, z, 0.45); return t; }
    function lampPost(x, z, withLight) {
        var g = new T.Group();
        cyl(0.06, 0.08, 2.6, 0x2b2a33, 0, 0, 0, g, 8);
        box(0.5, 0.06, 0.06, 0x2b2a33, 0.2, 2.5, 0, g);
        var bulbM = mat(0xfff1c4);
        mesh(new T.SphereGeometry(0.14, 10, 8), bulbM, 0.42, 2.38, 0, g);
        cyl(0.14, 0.2, 0.12, 0x2b2a33, 0.42, 2.44, 0, g, 8);
        g.position.set(x, 0, z); scene.add(g);
        var pl = null;
        if (withLight) { pl = new T.PointLight(0xffc977, 0, 9, 1.6); pl.position.set(x + 0.42, 2.2, z); scene.add(pl); }
        lamps.push({ bulb: bulbM, light: pl });
        colC(x, z, 0.16);
        return g;
    }
    function bench(x, z, rot) { return inst("furn/bench", x, z, { h: 0.8, rot: rot || 0, col: "b", shrink: 0.05 }); }
    function cafeTable(x, z, food) {
        inst("furn/tableRound", x, z, { h: 0.66 });
        inst("furn/chairCushion", x - 0.62, z + 0.1, { h: 0.78, rot: Math.PI / 2 });
        inst("furn/chairCushion", x + 0.62, z - 0.1, { h: 0.78, rot: -Math.PI / 2 });
        (food || []).forEach(function (f) { inst("food/" + f[0], x + f[1], z + f[2], { y: 0.67, h: f[3] || 0.16 }); });
        colC(x, z, 0.85);
    }
    // скрипка из простых форм
    function violin(x, y, z, rot, parent) {
        var g = new T.Group(), wood = mat(0x9a4a1e, { r: 0.5 }), dark = mat(0x2b2a33);
        var b1 = mesh(new T.SphereGeometry(0.13, 14, 10), wood, 0, 0, -0.08, g); b1.scale.set(1, 0.28, 1.15);
        var b2 = mesh(new T.SphereGeometry(0.1, 14, 10), wood, 0, 0, 0.12, g); b2.scale.set(1, 0.28, 1.1);
        box(0.05, 0.04, 0.34, dark, 0, 0.0, 0.36, g);
        box(0.07, 0.06, 0.08, wood, 0, -0.01, 0.55, g);
        g.position.set(x, y, z); g.rotation.y = rot || 0; (parent || scene).add(g);
        return g;
    }
    var colGeo, capGeo, colMat;
    function column(x, y0, z, h) {
        colGeo = colGeo || new T.CylinderGeometry(0.2, 0.24, 1, 14);
        capGeo = capGeo || new T.BoxGeometry(0.62, 0.16, 0.62);
        colMat = colMat || mat(0xfaf5ea);
        var c = mesh(colGeo, colMat, x, y0 + h / 2, z); c.scale.y = h - 0.32;
        mesh(capGeo, colMat, x, y0 + 0.08, z); mesh(capGeo, colMat, x, y0 + h - 0.08, z);
        colC(x, z, 0.3);
    }
    // греческая дверь (синяя) на фасаде, лицом к +z; доски крест-накрест — пока заперто
    function doorMesh(x, z) {
        var g = new T.Group();
        box(1.5, 2.5, 0.12, 0xfaf5ea, 0, 0, 0, g);
        var leafM = mat(0x2f6fa3), leaf = box(1.1, 2.2, 0.08, leafM, 0, 0.02, 0.08, g);
        box(0.08, 0.08, 0.08, 0xf4c84a, 0.38, 1.05, 0.15, g);
        for (var i = 0; i < 3; i++) { box(0.9, 0.04, 0.03, 0x24578a, 0, 0.45 + i * 0.6, 0.13, g); }
        var bar = new T.Group(); g.add(bar);
        box(1.5, 0.12, 0.06, 0x7a5a3a, 0, 1.1, 0.2, bar).rotation.z = 0.35;
        box(1.5, 0.12, 0.06, 0x7a5a3a, 0, 1.1, 0.2, bar).rotation.z = -0.35;
        g.position.set(x, 0, z); scene.add(g);
        return { g: g, leaf: leaf, bar: bar };
    }

    // ---------------------------------------------------------------- места квартала
    // раскладка сверена с текстами: указатель «← Εστιατόριο, ↑ Βιβλιοθήκη, ↗ Πανεπιστήμιο, ↓ Πάρκο» (смотрим на север),
    // дом Софии «κοντά στο πάρκο», парк «μεγάλο», площадь и квартал маленькие (см. _CONSISTENCY.md)
    var Z = { plateia: [0, 0], estiatorio: [-17, 0], spiti: [15, 16], vivliothiki: [-4, -15], panepistimio: [13, -14], parko: [0, 21] };
    var PARK_R = 11.5;
    var SPAWN = {};   // ключ -> { x, z, yaw, inside }
    function addDoor(loc, x, fz) {
        var d = doorMesh(x, fz + 0.04);
        var spr = new T.Sprite(new T.SpriteMaterial({ map: lockTex(), depthTest: false, transparent: true }));
        spr.scale.set(0.9, 0.9, 1); spr.position.set(x, 3.0, fz + 0.4); spr.renderOrder = 9; spr.visible = false; scene.add(spr);
        var hitM = new T.Mesh(new T.BoxGeometry(1.6, 2.6, 0.6), new T.MeshBasicMaterial()); hitM.visible = false; hitM.position.set(x, 1.3, fz + 0.2); scene.add(hitM);
        hits.push({ obj: hitM, kind: "door", id: loc });
        doors[loc] = { loc: loc, x: x, z: fz + 0.75, fz: fz, mesh: d, lock: spr, locked: false };
        SPAWN[loc + ":out"] = { x: x, z: fz + 2.0, yaw: 0 };
    }

    function build() {
        var ground = new T.Mesh(new T.CircleGeometry(95, 48), mat(0xaeb36f));
        ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
        var paveT = tileTex("#e8d7b3", "#dcc69c", 8, "#bfa47a"); paveT.repeat.set(5, 5);
        var plaza = new T.Mesh(new T.CircleGeometry(7.4, 40), new T.MeshStandardMaterial({ map: paveT, roughness: 0.95 }));
        plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.012; plaza.receiveShadow = true; scene.add(plaza);
        var ring = new T.Mesh(new T.RingGeometry(7.4, 7.8, 48), mat(0xc8b48e)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.014; ring.receiveShadow = true; scene.add(ring);
        var streetT = tileTex("#ddc9a3", "#d2bb92", 6, "#b39770");
        function street(x1, z1, x2, z2, w) {
            var dx = x2 - x1, dz = z2 - z1, len = Math.sqrt(dx * dx + dz * dz);
            var t = streetT.clone(); t.needsUpdate = true; t.repeat.set(w / 2.2, len / 2.2);
            var s = new T.Mesh(new T.PlaneGeometry(w, len), new T.MeshStandardMaterial({ map: t, roughness: 0.95 }));
            s.rotation.x = -Math.PI / 2; s.rotation.z = -Math.atan2(dx, -dz);
            s.position.set((x1 + x2) / 2, 0.008, (z1 + z2) / 2); s.receiveShadow = true; scene.add(s);
        }
        street(0, 0, -19, 0, 3.6);
        street(0, 0, -4, -11, 3.2); street(0, 0, 12.5, -10, 3.2); street(0, 0, 0, 10, 3.4); street(0, 0, 14.5, 15, 3.2);
        function pad(x, z, w2, d2) {
            var t = paveT.clone(); t.needsUpdate = true; t.repeat.set(w2 / 2, d2 / 2);
            var s = new T.Mesh(new T.PlaneGeometry(w2, d2), new T.MeshStandardMaterial({ map: t, roughness: 0.95 }));
            s.rotation.x = -Math.PI / 2; s.position.set(x, 0.01, z); s.receiveShadow = true; scene.add(s);
        }

        // ---- площадь и киоск Такиса
        var P = Z.plateia;
        cyl(1.25, 1.35, 0.45, 0xd9c7a2, P[0], 0, P[1], scene, 24);
        cyl(1.1, 1.1, 0.06, 0x7b5a3a, P[0], 0.42, P[1], scene, 24).castShadow = false;
        lemonTree(P[0], P[1], 3.6, 4, true, 0.46); colC(P[0], P[1], 1.4);
        [[-5.6, 3.8, 5], [5.4, 4.2, 6], [5.2, -4.6, 7], [-5.4, -4.8, 8]].forEach(function (p) { lemonTree(P[0] + p[0], P[1] + p[1], 3.0, p[2]); });
        var K = new T.Group(); K.position.set(P[0] - 3.8, 0, P[1] - 1.8); K.rotation.y = 0.35; scene.add(K);
        box(1.9, 0.25, 1.6, 0xe9dcc0, 0, 0, 0, K);
        box(1.8, 1.9, 1.5, 0x2f6fa3, 0, 0.25, 0, K);
        box(1.5, 0.9, 0.05, 0xfffaf0, 0, 1.0, 0.76, K);
        for (var i = 0; i < 5; i++) { box(0.24, 0.32, 0.04, [0xc9473d, 0xf4c84a, 0x5e8c3a, 0x7d5ba6, 0xe08a5a][i], -0.56 + i * 0.28, 1.18, 0.8, K); }
        box(2.3, 0.14, 2.0, 0xfffaf0, 0, 2.15, 0.1, K);
        for (var j = 0; j < 6; j++) { box(0.38, 0.22, 0.06, j % 2 ? 0xfffaf0 : 0x2f6fa3, -0.95 + j * 0.38, 1.94, 1.08, K); }
        box(0.9, 0.08, 0.5, 0x8c6447, 0, 0.95, 0.95, K);
        inst("food/cup-coffee", 0.2, 0.98, { y: 1.0, h: 0.14 }, K);
        colC(P[0] - 3.8, P[1] - 1.8, 1.25);
        var sp = new T.Group(); sp.position.set(P[0] + 2.7, 0, P[1] + 0.8); sp.rotation.y = -0.25; scene.add(sp);
        cyl(0.08, 0.1, 3.7, 0x6b4a33, 0, 0, 0, sp, 8);
        SIGNS.signpost.lines.forEach(function (l, k) { signPanel("signpost", 2.3, 0.48, k % 2 ? -0.14 : 0.14, 3.35 - k * 0.56, 0.1, sp, [l], "wood", [P[0] + 2.4, P[1] + 2.3]); });
        colC(P[0] + 2.7, P[1] + 0.8, 0.3);
        cafeTable(P[0] - 1.3, P[1] + 2.9, [["cup-coffee", 0.15, 0, 0.14]]);
        bench(P[0] + 3.9, P[1] - 3.6, -0.6); bench(P[0] - 1.0, P[1] - 5.0, 0.1);
        lampPost(P[0] + 4.6, P[1] + 2.4); lampPost(P[0] - 4.9, P[1] + 1.4);
        inst("nat/pot_large", P[0] + 1.8, P[1] - 2.8, { h: 0.6, col: 0.45 }); inst("nat/flower_redA", P[0] + 1.8, P[1] - 2.8, { y: 0.45, h: 0.45 });
        var tk = addNpc("takis", "plateia", P[0] - 2.4, P[1] + 0.2, 0.5);
        // «Τώρα πίνω καφέ» — чашка в руке у Такиса; «Ο καφές εδώ είναι φτηνός: ένα ευρώ» — цена на киоске
        holdInHand(tk, "food/cup-coffee", 0.2);
        var pc = document.createElement("canvas"); pc.width = 512; pc.height = 256;
        var pg = pc.getContext("2d"); pg.fillStyle = "#fffaf0"; pg.fillRect(0, 0, 512, 256); pg.strokeStyle = "#2f6fa3"; pg.lineWidth = 16; pg.strokeRect(8, 8, 496, 240);
        pg.fillStyle = "#2b2a33"; pg.font = "800 150px 'Segoe UI', Arial, sans-serif"; pg.textAlign = "center"; pg.textBaseline = "middle"; pg.fillText("☕ 1 €", 256, 136);
        var pm = new T.Mesh(new T.PlaneGeometry(0.9, 0.45), new T.MeshStandardMaterial({ map: canvasTex(pc), roughness: 0.9 }));
        pm.position.set(-0.4, 0.55, 0.8); K.add(pm);
        SPAWN.plateia = { x: 0.6, z: 4.6, yaw: Math.PI };

        // ---- дом Софии у самого парка: «Το διαμέρισμα ... κοντά στο πάρκο»
        var S = Z.spiti;
        var hs = inst("com/building-a", S[0], S[1] - 3.6, { h: 8.2, col: "b", block: true });
        var sfz = S[1] - 3.6 + hs.userData.size.z / 2;
        pad(S[0], sfz + 1.4, 7, 2.8);
        addDoor("spiti", S[0], sfz);
        signPanel("door", 1.3, 0.6, S[0] + 1.45, 1.8, sfz + 0.06, null, null, null, [S[0] + 1.1, sfz + 1.3]);
        inst("nat/pot_large", S[0] - 1.8, sfz + 0.6, { h: 0.6, col: 0.4 }); inst("nat/plant_bushDetailed", S[0] - 1.8, sfz + 0.6, { y: 0.45, h: 0.7 });
        inst("furn/pottedPlant", S[0] + 2.6, sfz + 0.6, { h: 0.9, col: 0.3 });
        lemonTree(S[0] + 3.4, S[1] + 2.6, 2.8, 11);
        var Kt = new T.Group(); Kt.position.set(S[0] + 4.6, 0, S[1] - 3.0); scene.add(Kt);
        [[-1.2, -0.9], [1.2, -0.9], [-1.2, 0.9], [1.2, 0.9]].forEach(function (p) { cyl(0.07, 0.07, 2.5, 0xfffaf0, p[0], 0, p[1], Kt, 8); colC(Kt.position.x + p[0], Kt.position.z + p[1], 0.12); });
        for (var q = 0; q < 5; q++) { box(0.08, 0.08, 2.1, 0x8c6447, -1.1 + q * 0.55, 2.5, 0, Kt); }
        for (var v = 0; v < 7; v++) { var lf = mesh(new T.IcosahedronGeometry(0.28, 0), mat(0x5e8c3a, { flat: true }), -1.1 + v * 0.37, 2.62, -0.7 + (v % 3) * 0.7, Kt); lf.scale.y = 0.5; }
        cafeTable(S[0] + 4.6, S[1] - 3.0, [["lemon", 0, 0, 0.1]]);

        // ---- ресторан Никоса: «Το εστιατόριο είναι μικρό, αλλά η κουζίνα είναι μεγάλη» —
        // маленький зал спереди и огромная кухня-пристройка сзади (трубы, пар)
        var R = Z.estiatorio;
        var rb = inst("com/building-c", R[0] + 0.4, R[1] - 2.6, { h: 4.6, col: "b", block: true });
        var rs = rb.userData.size, rfz = R[1] - 2.6 + rs.z / 2;
        var kit = box(10.5, 5.2, 6.5, 0xf3ece0, R[0], 0, R[1] - 2.6 - rs.z / 2 - 3.0); kit.userData.blocker = true; blockers.push(kit);
        colB(R[0] - 5.25, R[0] + 5.25, R[1] - 2.6 - rs.z / 2 - 6.25, R[1] - 2.6 - rs.z / 2 + 0.25);
        box(10.7, 0.25, 6.7, 0x2f6fa3, R[0], 5.2, R[1] - 2.6 - rs.z / 2 - 3.0);
        var steams = [];
        [-3.4, -1.2, 1.0, 3.2].forEach(function (dx, k) {
            var cx = R[0] + dx, cz = R[1] - 2.6 - rs.z / 2 - 3.6;
            cyl(0.32, 0.36, 1.6, 0xb8b0a4, cx, 5.4, cz, scene, 10);
            for (var sI = 0; sI < 3; sI++) { var sm = mesh(new T.IcosahedronGeometry(0.34, 0), mat(0xffffff, { op: 0.55, r: 1 }), cx, 7.2, cz); sm.castShadow = false; steams.push({ m: sm, x: cx, z: cz, ph: k * 0.37 + sI / 3 }); }
        });
        ticks.push(function (t) { steams.forEach(function (s) { var k = (t * 0.35 + s.ph) % 1; s.m.position.set(s.x + Math.sin(k * 6 + s.ph) * 0.2, 7.0 + k * 2.6, s.z); s.m.scale.setScalar(0.6 + k * 1.4); s.m.material.opacity = 0.55 * (1 - k); }); });
        pad(R[0], rfz + 1.8, 10, 4.6);
        addDoor("estiatorio", R[0] + 0.4, rfz);
        var rn = new T.Group(); rn.position.set(R[0] + 0.4, rs.y, rfz - 0.4); scene.add(rn);
        cyl(0.05, 0.05, 0.6, 0x2b2a33, -1.6, 0, 0, rn, 6); cyl(0.05, 0.05, 0.6, 0x2b2a33, 1.6, 0, 0, rn, 6);
        signPanel("restname", 4.2, 0.85, 0, 1.0, 0, rn, null, null, [R[0] - 0.6, rfz + 2.4]);
        signPanel("hours", 1.2, 0.85, R[0] + 2.3, 1.6, rfz + 0.06, null, null, null, [R[0] + 2.3, rfz + 1.2]);
        var mn = new T.Group(); mn.position.set(R[0] - 3.4, 0, R[1] + 1.4); mn.rotation.y = 0.35; scene.add(mn);
        signPanel("menu", 1.3, 1.25, 0, 0.75, 0.0, mn, null, null, [R[0] - 3.0, R[1] + 2.7]).rotation.x = -0.18;
        box(0.06, 1.5, 0.06, 0x6b4a33, -0.6, 0, -0.2, mn); box(0.06, 1.5, 0.06, 0x6b4a33, 0.6, 0, -0.2, mn);
        colC(R[0] - 3.4, R[1] + 1.3, 0.55);
        cafeTable(R[0] + 4.0, rfz + 2.8, [["plate-dinner", 0, 0, 0.05], ["fish", 0, 0, 0.12], ["wine-red", 0.22, 0.15, 0.32]]);
        inst("com/detail-parasol-a", R[0] + 4.0, rfz + 2.8, { h: 2.1 });
        lemonTree(R[0] + 5.6, R[1] + 3.2, 2.6, 13);
        lampPost(R[0] - 5.2, R[1] + 2.6);

        // ---- библиотека: прямо на север от площади (↑), портик с колоннами
        var L = Z.vivliothiki;
        var lb = inst("com/building-c", L[0], L[1] - 3.8, { h: 7.6, col: "b", block: true });
        var lfz = L[1] - 3.8 + lb.userData.size.z / 2;
        pad(L[0], lfz + 2.4, 9, 4.6);
        box(5.8, 0.12, 2.4, 0xefe4cc, L[0], 0, lfz + 1.1);
        [-2.3, -1.0, 1.0, 2.3].forEach(function (cx) { column(L[0] + cx, 0.12, lfz + 1.9, 3.1); });
        box(5.6, 0.4, 2.2, 0xf6efe0, L[0], 3.22, lfz + 1.1);
        addDoor("vivliothiki", L[0], lfz);
        signPanel("libhours", 1.5, 2.4, L[0] + 4.1, 1.5, lfz + 2.2, null, null, null, [L[0] + 4.1, lfz + 3.4]);
        box(0.08, 0.3, 0.08, 0x6b4a33, L[0] + 4.1, 0, lfz + 2.16); colC(L[0] + 4.1, lfz + 2.2, 0.55);
        inst("furn/bookcaseOpenLow", L[0] - 4.2, lfz + 1.8, { h: 0.9, rot: 0.25, col: "b" }); inst("furn/books", L[0] - 4.2, lfz + 1.8, { y: 0.9, h: 0.2 });
        lemonTree(L[0] - 6.0, L[1] - 0.4, 3.0, 17);

        // ---- университет: на северо-восток (↗), «μεγάλο και όμορφο» — самое большое здание с портиком и фронтоном
        var U = Z.panepistimio;
        var ub = inst("com/building-k", U[0], U[1] - 4.6, { w: 11, col: "b", block: true });
        var ufz = U[1] - 4.6 + ub.userData.size.z / 2;
        pad(U[0], ufz + 2.6, 12, 5);
        box(8.6, 0.14, 2.8, 0xefe4cc, U[0], 0, ufz + 1.3);
        [-3.6, -2.2, -1.1, 1.1, 2.2, 3.6].forEach(function (cx) { column(U[0] + cx, 0.14, ufz + 2.3, 3.6); });
        box(8.4, 0.45, 2.6, 0xf6efe0, U[0], 3.74, ufz + 1.3);
        var ped = new T.Shape(); ped.moveTo(-4.2, 0); ped.lineTo(4.2, 0); ped.lineTo(0, 1.25); ped.lineTo(-4.2, 0);
        mesh(new T.ExtrudeGeometry(ped, { depth: 0.5, bevelEnabled: false }), mat(0xfaf3e3), U[0], 4.19, ufz + 2.1);
        addDoor("panepistimio", U[0], ufz);
        var bd = new T.Group(); bd.position.set(U[0] - 6.4, 0, ufz + 3.4); bd.rotation.y = 0.3; scene.add(bd);
        box(0.1, 2.2, 0.1, 0x6b4a33, -1.05, 0, 0, bd); box(0.1, 2.2, 0.1, 0x6b4a33, 1.05, 0, 0, bd);
        signPanel("board", 2.3, 1.4, 0, 1.55, 0.07, bd);
        colC(U[0] - 6.4 - 1.0, ufz + 3.1, 0.2); colC(U[0] - 6.4 + 1.0, ufz + 3.7, 0.2);
        tree("nat/tree_detailed", U[0] + 7.4, U[1] + 0.4, 3.6, 21);
        bench(U[0] + 4.4, ufz + 4.2, -0.15);

        // ---- парк за оградой с калиткой: «Το πάρκο είναι μεγάλο» — заметно больше площади
        var K2 = Z.parko, PR = PARK_R;
        var grass = new T.Mesh(new T.CircleGeometry(PR + 0.2, 56), mat(0x9ccf6a));
        grass.rotation.x = -Math.PI / 2; grass.position.set(K2[0], 0.014, K2[1]); grass.receiveShadow = true; scene.add(grass);
        var pth = new T.Mesh(new T.RingGeometry(2.4, 3.4, 40), mat(0xe9dcc0)); pth.rotation.x = -Math.PI / 2; pth.position.set(K2[0], 0.018, K2[1]); pth.receiveShadow = true; scene.add(pth);
        var pth2 = new T.Mesh(new T.RingGeometry(7.0, 7.9, 56), mat(0xe9dcc0)); pth2.rotation.x = -Math.PI / 2; pth2.position.set(K2[0], 0.018, K2[1]); pth2.receiveShadow = true; scene.add(pth2);
        var lane = new T.Mesh(new T.PlaneGeometry(2.4, PR - 3.2), mat(0xe9dcc0)); lane.rotation.x = -Math.PI / 2; lane.position.set(K2[0], 0.017, K2[1] - (PR + 3.4) / 2); lane.receiveShadow = true; scene.add(lane);
        var NS = 48, gateA = -Math.PI / 2;
        for (var fa = 0; fa < NS; fa++) {
            var am = (fa + 0.5) / NS * Math.PI * 2;
            if (Math.abs(angWrap(am - gateA)) < 0.09) { continue; }
            var fx = K2[0] + Math.cos(am) * PR, fz = K2[1] + Math.sin(am) * PR;
            inst("nat/fence_simple", fx, fz, { w: PR * 2 * Math.PI / NS + 0.06, h: 0.9, rot: Math.PI / 2 - am });
            colC(fx, fz, 0.6);
        }
        var gx = K2[0] + Math.cos(gateA) * PR, gz = K2[1] + Math.sin(gateA) * PR;
        var gate = inst("nat/fence_gate", gx, gz, { w: 1.6, h: 1.0 });
        var gateCol = colB(gx - 0.95, gx + 0.95, gz - 0.25, gz + 0.25, "gate");
        var gLock = new T.Sprite(new T.SpriteMaterial({ map: lockTex(), depthTest: false, transparent: true }));
        gLock.scale.set(0.9, 0.9, 1); gLock.position.set(gx, 1.9, gz); gLock.renderOrder = 9; scene.add(gLock);
        doors.parko = { loc: "parko", gate: true, x: gx, z: gz - 0.9, g: gate, col: gateCol, lock: gLock, locked: true };
        var gHit = new T.Mesh(new T.BoxGeometry(2.2, 1.6, 0.8), new T.MeshBasicMaterial()); gHit.visible = false; gHit.position.set(gx, 0.8, gz); scene.add(gHit);
        hits.push({ obj: gHit, kind: "door", id: "parko" });
        var ps = new T.Group(); ps.position.set(gx + 2.5, 0, gz - 1.1); ps.rotation.y = -0.2; scene.add(ps);
        cyl(0.07, 0.07, 1.3, 0x6b4a33, -0.8, 0, 0, ps, 6); cyl(0.07, 0.07, 1.3, 0x6b4a33, 0.8, 0, 0, ps, 6);
        signPanel("parksign", 2.2, 1.2, 0, 1.6, 0.06, ps, null, null, [gx + 2.3, gz - 2.5]);
        colC(gx + 2.5, gz - 1.1, 0.9);
        cyl(1.6, 1.7, 0.45, 0xe7dcc6, K2[0], 0, K2[1], scene, 28);
        var water = mesh(new T.CylinderGeometry(1.42, 1.42, 0.05, 28), mat(0x6fb7dc, { r: 0.2, e: 0x0b2f44, ei: 0.4 }), K2[0], 0.38, K2[1]); water.castShadow = false;
        cyl(0.18, 0.26, 1.1, 0xe7dcc6, K2[0], 0.4, K2[1], scene, 10);
        cyl(0.55, 0.3, 0.16, 0xe7dcc6, K2[0], 1.42, K2[1], scene, 16);
        colC(K2[0], K2[1], 1.75);
        var dropsM = mat(0xa8dcf3, { op: 0.6, r: 0.1 }), drops = [];
        for (var dI = 0; dI < 10; dI++) { var dm = mesh(new T.SphereGeometry(0.045, 6, 4), dropsM, K2[0], 1.6, K2[1]); dm.castShadow = false; drops.push({ m: dm, a: dI / 10 * Math.PI * 2, ph: dI / 10 }); }
        ticks.push(function (t) { drops.forEach(function (d) { var k = (t * 0.7 + d.ph) % 1, r = 0.2 + k; d.m.position.set(K2[0] + Math.cos(d.a) * r, 1.65 + Math.sin(k * Math.PI) * 0.55 - k * 1.1, K2[1] + Math.sin(d.a) * r); }); });
        [[-6.4, -4.2, "nat/tree_oak", 3.8], [6.6, -4.0, "nat/tree_detailed", 4.0], [-8.6, 2.6, "nat/tree_default", 3.6], [8.8, 3.0, "nat/tree_oak", 3.6], [-4.6, 8.6, "nat/tree_fat", 3.2], [4.8, 8.8, "nat/tree_simple", 3.4],
         [-9.2, -1.8, "nat/tree_detailed", 3.4], [9.4, -1.4, "nat/tree_default", 3.4], [0.4, 9.8, "nat/tree_oak", 3.6]].forEach(function (p, k) { tree(p[2], K2[0] + p[0], K2[1] + p[1], p[3], 30 + k); });
        lemonTree(K2[0] - 2.4, K2[1] + 5.4, 2.8, 37); lemonTree(K2[0] + 2.6, K2[1] + 5.2, 2.6, 38);
        [[-4.4, 1.0, "flower_redA"], [-4.0, 1.6, "flower_yellowA"], [4.4, 1.2, "flower_purpleA"], [4.8, 0.6, "flower_redA"], [3.8, -1.6, "flower_yellowA"], [-3.6, -1.8, "flower_purpleA"], [-1.6, 4.2, "flower_redA"], [1.6, 4.4, "flower_yellowA"],
         [-5.6, -6.4, "flower_redA"], [5.8, -6.2, "flower_purpleA"], [-9.6, 4.8, "flower_yellowA"], [9.4, 5.4, "flower_redA"]].forEach(function (p) { inst("nat/" + p[2], K2[0] + p[0], K2[1] + p[1], { h: 0.5 }); });
        [[-5.4, 0.2], [5.6, -0.4], [-6.4, 6.4], [6.8, 6.6]].forEach(function (p) { inst("nat/plant_bushLarge", K2[0] + p[0], K2[1] + p[1], { h: 0.9, col: 0.55 }); });
        bench(K2[0] + 2.6, K2[1] + 3.2, -0.6); bench(K2[0] - 3.8, K2[1] - 2.8, 0.9); bench(K2[0] - 5.6, K2[1] + 4.0, 0.5);
        lampPost(K2[0] - 3.2, K2[1] + 3.0, true); lampPost(K2[0] + 3.6, K2[1] - 2.8, true); lampPost(K2[0] + 4.4, K2[1] + 2.4, true);
        addNpc("giorgos", "parko", K2[0] - 3.4, K2[1] - 1.4, 0.6);
        walkingDog(K2[0], K2[1], 5.2);
        SPAWN.parko = { x: K2[0], z: K2[1] - PR + 2.0, yaw: 0 };

        // ---- соседние дома и город вдали («η πόλη είναι μεγάλη»)
        [["sub/building-type-m", -27, -6, 5.4, 0.2], ["sub/building-type-t", -26, 9, 5.4, 0.4], ["sub/building-type-o", 28, -2, 5.4, -0.3], ["sub/building-type-k", 27, 9.5, 6.2, -0.5],
         ["sub/building-type-c", -20, -27, 5.2, 0.6], ["sub/building-type-m", 26, -27, 5.4, -0.6], ["sub/building-type-t", -16, 28, 5.2, 2.8], ["sub/building-type-o", 16, 29, 5.2, -2.9],
         ["com/building-f", -6, -30, 9.5, 0], ["com/building-g", 2.5, -31, 10.5, 0], ["com/building-h", -24, -17, 8, 0.4], ["com/building-a", 27, -18, 8.5, -0.4]].forEach(function (b) { inst(b[0], b[1], b[2], { h: b[3], rot: b[4], col: "b", shrink: 0.6, block: true }); });
        [[-12, 6], [-8, -7], [6.5, -6.5], [-20, 12], [22, 12], [-31, 1], [31, 1], [-12, -10]].forEach(function (p, k) { tree("sub/tree-large", p[0], p[1], 4.2 + (k % 3) * 0.6, 50 + k); });
        [[-9.5, 7.5], [8.4, 6.6]].forEach(function (p, k) { lemonTree(p[0], p[1], 2.4, 60 + k); });
        var city = ["com/building-k", "com/building-h", "com/building-g", "com/building-f", "com/building-e", "com/building-a"];
        for (var cI = 0; cI < 14; cI++) {
            var cb = inst(city[cI % city.length], -62 + cI * 9.5, -62 - (cI % 3) * 6, { h: 18 + ((cI * 37) % 5) * 6, rot: (cI % 2) * 0.3 });
            cb.traverse(function (o) { if (o.isMesh) { o.castShadow = false; } });
        }
        [[-48, -44, 22], [40, -46, 26], [-72, -10, 18], [72, -8, 20]].forEach(function (h) { var hm = mesh(new T.SphereGeometry(h[2], 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xb9c98d, { flat: true }), h[0], -h[2] * 0.55, h[1]); hm.castShadow = false; });

        // ---- облака, птицы, светлячки
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
        for (var bI = 0; bI < 6; bI++) {
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
        var ffGeo = new T.BufferGeometry(), ffPos = [];
        for (var fI = 0; fI < 40; fI++) { ffPos.push(K2[0] + (Math.random() - 0.5) * 14, 0.4 + Math.random() * 2.2, K2[1] + (Math.random() - 0.5) * 12); }
        ffGeo.setAttribute("position", new T.Float32BufferAttribute(ffPos, 3));
        var ff = new T.Points(ffGeo, new T.PointsMaterial({ color: 0xfff59a, size: 0.14, transparent: true, opacity: 0.9, depthWrite: false }));
        ff.visible = false; scene.add(ff); nightOnly.push(ff);
        ticks.push(function (t) { if (ff.visible) { ff.material.opacity = 0.55 + Math.sin(t * 3) * 0.35; } });

        buildRooms();
    }

    // ---------------------------------------------------------------- интерьеры: комнаты без потолка в стороне от квартала
    function buildRooms() {
        var under = new T.Mesh(new T.PlaneGeometry(400, 60), mat(0x3a2c22)); under.rotation.x = -Math.PI / 2; under.position.set(0, -0.02, 200); scene.add(under);
        // «Είναι μικρό, αλλά είναι φτηνό» — квартира Софии маленькая: кухонный угол, стол, кровать
        room("spiti", -60, 200, 6.6, 5.4, 0xe9d7c0, function (c) {
            inst("furn/kitchenCabinet", c.x - 2.75, c.z - 2.3, { h: 0.85, col: "b" });
            inst("furn/kitchenStove", c.x - 2.0, c.z - 2.3, { h: 0.85, col: "b" });
            inst("furn/kitchenSink", c.x - 1.25, c.z - 2.3, { h: 0.85, col: "b" });
            inst("furn/kitchenFridgeSmall", c.x - 0.45, c.z - 2.35, { h: 1.05, col: "b" });
            inst("furn/kitchenCabinetUpper", c.x - 1.6, c.z - 2.55, { y: 1.5, h: 0.6 });
            inst("food/pot-stew", c.x - 2.0, c.z - 2.25, { y: 0.86, h: 0.2 });
            inst("furn/table", c.x - 1.9, c.z - 0.2, { h: 0.68, col: "b" });
            inst("food/salad", c.x - 2.1, c.z - 0.2, { y: 0.69, h: 0.12 }); inst("food/lemon", c.x - 1.6, c.z - 0.1, { y: 0.69, h: 0.1 });
            inst("furn/chair", c.x - 2.9, c.z - 0.2, { h: 0.8, rot: Math.PI / 2 });
            inst("furn/loungeSofa", c.x + 2.1, c.z - 2.1, { w: 1.8, col: "b" });
            inst("furn/rugRectangle", c.x + 1.9, c.z - 0.7, { w: 1.8 });
            inst("furn/pottedPlant", c.x + 2.9, c.z + 1.9, { h: 0.9, col: 0.3 });
            addNpc("sofia", "spiti", c.x + 0.3, c.z - 1.0, 0.2);
        });
        // «Το εστιατόριο είναι μικρό, αλλά η κουζίνα είναι μεγάλη» — два столика у входа и огромная кухня
        room("estiatorio", -20, 200, 13, 9, 0xf1e6d3, function (c) {
            var kt = tileTex("#f6f6f2", "#d9e6ef", 6, "#b9c8d3"); kt.repeat.set(4, 4);
            var kf = new T.Mesh(new T.PlaneGeometry(9.4, 9), new T.MeshStandardMaterial({ map: kt, roughness: 0.6 })); kf.rotation.x = -Math.PI / 2; kf.position.set(c.x + 1.8, 0.015, c.z); kf.receiveShadow = true; scene.add(kf);
            // перегородка с раздачей между залом и кухней
            for (var k = 0; k < 5; k++) { inst("furn/kitchenBar", c.x - 2.9, c.z - 3.9 + k * 1.0, { h: 1.0, w: 1.0, rot: Math.PI / 2 }); }
            colB(c.x - 3.3, c.x - 2.5, c.z - 4.5, c.z + 0.7);
            inst("food/wine-red", c.x - 2.9, c.z - 0.2, { y: 1.0, h: 0.32 }); inst("food/loaf", c.x - 2.9, c.z - 1.6, { y: 1.0, h: 0.14 });
            // зал: всего два столика
            cafeTable(c.x - 5.0, c.z + 2.6, [["plate-dinner", 0, 0, 0.05], ["fish", 0, 0, 0.12]]);
            cafeTable(c.x - 5.0, c.z - 0.6, [["salad", 0, 0, 0.14]]);
            // кухня: длинный ряд плит с кастрюлями, мойки, холодильники, остров
            for (var s2 = 0; s2 < 5; s2++) {
                inst("furn/kitchenStove", c.x - 1.6 + s2 * 0.85, c.z - 4.05, { h: 0.85 });
                inst("food/" + (s2 % 2 ? "pot-stew" : "pan-stew"), c.x - 1.6 + s2 * 0.85, c.z - 4.0, { y: 0.86, h: 0.22 });
            }
            colB(c.x - 2.1, c.x + 2.1, c.z - 4.5, c.z - 3.6);
            for (var s3 = 0; s3 < 3; s3++) { inst("furn/kitchenSink", c.x + 2.6 + s3 * 0.85, c.z - 4.05, { h: 0.85 }); }
            colB(c.x + 2.1, c.x + 4.9, c.z - 4.5, c.z - 3.6);
            for (var f2 = 0; f2 < 3; f2++) { inst("furn/kitchenFridgeSmall", c.x + 6.05, c.z - 2.6 + f2 * 0.95, { h: 1.6, rot: -Math.PI / 2 }); }
            colB(c.x + 5.6, c.x + 6.5, c.z - 3.1, c.z - 0.3);
            for (var u2 = 0; u2 < 6; u2++) { inst("furn/kitchenCabinetUpper", c.x - 1.6 + u2 * 1.05, c.z - 4.35, { y: 1.55, h: 0.6 }); }
            for (var i2 = 0; i2 < 4; i2++) { inst("furn/kitchenCabinet", c.x + 0.2 + i2 * 0.8, c.z - 0.8, { h: 0.85 }); }
            colB(c.x - 0.2, c.x + 3.0, c.z - 1.2, c.z - 0.4);
            inst("food/pot-stew", c.x + 0.6, c.z - 0.75, { y: 0.86, h: 0.26 }); inst("food/fish", c.x + 1.6, c.z - 0.8, { y: 0.86, h: 0.1 }); inst("food/tomato", c.x + 2.4, c.z - 0.8, { y: 0.86, h: 0.12 });
            addNpc("nikos", "estiatorio", c.x + 1.0, c.z - 2.4, 0);
        });
        room("vivliothiki", 20, 200, 11, 8, 0xe6dccb, function (c) {
            for (var i = 0; i < 6; i++) { inst(i % 2 ? "furn/bookcaseOpen" : "furn/bookcaseClosedWide", c.x - 4.2 + i * 1.65, c.z - 3.65, { h: 2.0, col: "b" }); }
            [-1, 1].forEach(function (sx) { for (var k = 0; k < 2; k++) { inst("furn/bookcaseOpen", c.x + sx * 5.15, c.z - 1.6 + k * 1.6, { h: 2.0, rot: -sx * Math.PI / 2, col: "b" }); } });
            [[-2.0, 0.6], [2.0, 0.6]].forEach(function (p) {
                inst("furn/table", c.x + p[0], c.z + p[1], { h: 0.7, col: "b" });
                inst("furn/books", c.x + p[0] - 0.2, c.z + p[1], { y: 0.71, h: 0.16 }); inst("furn/lampRoundTable", c.x + p[0] + 0.35, c.z + p[1], { y: 0.71, h: 0.45 });
                inst("furn/chair", c.x + p[0], c.z + p[1] + 0.8, { h: 0.8, rot: Math.PI });
            });
            inst("furn/rugRound", c.x, c.z - 1.6, { w: 2.6 });
            inst("furn/pottedPlant", c.x + 4.6, c.z + 3.0, { h: 1.0, col: 0.3 });
            violin(c.x + 2.25, 0.73, c.z + 0.45, 0.4);
            addNpc("eleni", "vivliothiki", c.x - 0.2, c.z - 2.4, 0);
        });
        // «Το πανεπιστήμιο είναι μεγάλο» — самая большая комната: аудитория с рядами парт
        room("panepistimio", 60, 200, 15, 11, 0xece5d6, function (c) {
            box(5.6, 1.8, 0.08, 0x2f4a3a, c.x, 1.0, c.z - 5.4).castShadow = false;
            box(5.8, 0.1, 0.16, 0x8c6447, c.x, 0.95, c.z - 5.36);
            for (var w = 0; w < 5; w++) { box(0.8 + (w % 2) * 0.5, 0.04, 0.02, 0xf3f1e6, c.x - 2.0 + w * 0.9, 1.5 + (w % 3) * 0.35, c.z - 5.35); }
            inst("furn/desk", c.x + 3.6, c.z - 4.0, { h: 0.75, col: "b" });
            for (var r2 = 0; r2 < 3; r2++) { for (var k2 = 0; k2 < 4; k2++) {
                var dx = c.x - 5.1 + k2 * 3.4, dz = c.z - 1.6 + r2 * 2.2;
                inst("furn/desk", dx, dz, { h: 0.72, col: "b" }); inst("furn/chairDesk", dx, dz + 0.75, { h: 0.85, rot: Math.PI });
                if ((r2 + k2) % 2) { inst("furn/books", dx - 0.2, dz, { y: 0.73, h: 0.14 }); }
            } }
            inst("furn/pottedPlant", c.x - 6.8, c.z - 4.8, { h: 1.1, col: 0.3 });
            addNpc("anna", "panepistimio", c.x + 0.6, c.z - 3.6, 0);
        });
    }
    function room(loc, x, z, w, d, wallC, fillFn) {
        var c = { x: x, z: z };
        var floorT = tileTex("#d2ad82", "#cba57a", 4, "#b48c63"); floorT.repeat.set(w / 2, d / 2);
        var fl = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshStandardMaterial({ map: floorT, roughness: 0.9 }));
        fl.rotation.x = -Math.PI / 2; fl.position.set(x, 0.01, z); fl.receiveShadow = true; scene.add(fl);
        var H = 2.9, t = 0.2;
        function wall(cx, cz, ww, dd, nx, nz) {
            var m = mat(wallC); m.transparent = true;
            var me = box(ww, H, dd, m, cx, 0, cz); me.castShadow = false;
            fadeWalls.push({ m: me, n: new T.Vector3(nx, 0, nz), room: loc });
            colB(cx - ww / 2, cx + ww / 2, cz - dd / 2, cz + dd / 2);
        }
        wall(x, z - d / 2 - t / 2, w + t * 2, t, 0, 1);
        wall(x - w / 2 - t / 2, z, t, d, 1, 0); wall(x + w / 2 + t / 2, z, t, d, -1, 0);
        var gap = 1.5, seg = (w - gap) / 2 + t;
        wall(x - gap / 2 - seg / 2, z + d / 2 + t / 2, seg, t, 0, -1);
        wall(x + gap / 2 + seg / 2, z + d / 2 + t / 2, seg, t, 0, -1);
        box(1.6, 1.0, 0.04, 0xbfe3f5, x + w / 4, 1.2, z - d / 2 + 0.02, null, { e: 0x5f8fae, ei: 0.4 }).castShadow = false;
        var rug = new T.Mesh(new T.PlaneGeometry(1.4, 0.8), mat(0x2f6fa3)); rug.rotation.x = -Math.PI / 2; rug.position.set(x, 0.02, z + d / 2 - 0.6); scene.add(rug);
        // светлый проём двери наружу
        var glow = new T.Mesh(new T.PlaneGeometry(gap, 2.4), new T.MeshBasicMaterial({ color: 0xfff3d2 })); glow.position.set(x, 1.2, z + d / 2 + t + 0.02); glow.rotation.y = Math.PI; scene.add(glow);
        var lightP = new T.PointLight(0xffe2b0, 0.5, 14, 1.4); lightP.position.set(x, 2.8, z); scene.add(lightP);
        rooms[loc] = { c: c, w: w, d: d };
        SPAWN[loc] = { x: x, z: z + d / 2 - 1.3, yaw: Math.PI, inside: loc };
        fillFn(c);
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
        bgDay = gradTex([[0, "#6fb7e6"], [0.55, "#b9def2"], [1, "#fcefd2"]]);
        bgNight = gradTex([[0, "#070b1f"], [0.6, "#1b2350"], [1, "#4a3f6b"]]);
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
        scene.background = inside ? bgIn : night ? bgNight : bgDay;
        scene.fog = inside ? new T.Fog(0x3a2c22, 20, 45) : night ? new T.Fog(0x1d2350, 30, 95) : new T.Fog(0xf3ead2, 40, 110);
        hemi.color.set(night ? 0x5566aa : 0xeaf2ff); hemi.groundColor.set(night ? 0x1a1a2a : 0x8a7650); hemi.intensity = night ? 0.45 : inside ? 0.7 : 0.55;
        sun.color.set(night ? 0x9fb4ff : 0xffe9c4); sun.intensity = night ? 0.28 : 0.85;
        fill.intensity = night ? 0.1 : 0.25;
        stars.visible = night && !inside;
        lamps.forEach(function (l) { if (l.light) { l.light.intensity = night ? 1.5 : 0; } l.bulb.emissive.set(night ? 0xffd27a : 0x000000); });
        nightOnly.forEach(function (o) { o.visible = night; });
        dayOnly.forEach(function (o) { o.visible = !night; });
    }

    // ---------------------------------------------------------------- герой: движение
    function heroPos() { return hero.root.position; }
    function goTo(x, z, then) {
        var p = heroPos();
        var pts = findPath(p.x, p.z, x, z);
        // запасной путь: сетка со сдвигом, потом прямо к цели (коллизии сами обведут вокруг мелких препятствий)
        if (!pts) { pts = findPath(p.x + 0.25, p.z + 0.25, x, z); if (pts) { pts.unshift(new T.Vector3(p.x + 0.25, 0, p.z + 0.25)); } }
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
    function updateHero(dt) {
        var p = heroPos(), vx = 0, vz = 0, run = keys.ShiftLeft || keys.ShiftRight;
        var f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
        var s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
        followMove = (f > 0 && !s) || (!f && !s && path.length > 0);
        if (f || s) {
            if (path.length || pending) { cancelPath(); }
            var fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
            vx = fx * f + rx * s; vz = fz * f + rz * s;
            var l = Math.sqrt(vx * vx + vz * vz); vx /= l; vz /= l;
        } else if (path.length) {
            var wp = path[0], dx = wp.x - p.x, dz = wp.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
            if (d < (hero.speed > 6 ? 0.45 : 0.25)) { path.shift(); }
            else { vx = dx / d; vz = dz / d; run = run || pathLen() > 6; }
        }
        if (!path.length && pending && !(f || s)) {
            var pd = pending; pending = null;
            if (!pd.reach || dist2(p.x, p.z, pd.x, pd.z) <= pd.reach + 0.7) { pd.fn(); }
        }
        var speed = (vx || vz) ? (run ? 9.0 : 5.0) : 0;
        hero.speed += (speed - hero.speed) * Math.min(1, dt * 16);
        if (vx || vz) {
            var q = resolve({ x: p.x + vx * hero.speed * dt, z: p.z + vz * hero.speed * dt }, HERO_R);
            p.x = q.x; p.z = q.z;
            hero.yaw += angWrap(Math.atan2(vx, vz) - hero.yaw) * Math.min(1, dt * 12);
        }
        hero.root.rotation.y = hero.yaw;
        play(hero, hero.speed > 6.5 ? "sprint" : hero.speed > 0.4 ? "walk" : "idle", false, 0.15);
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
        Object.keys(doors).forEach(function (loc) {
            var d = doors[loc];
            if (dist2(p.x, p.z, d.x, d.z) > (d.gate ? 1.3 : 0.8)) { return; }
            if (d.locked) { if (lockedCool < t) { lockedCool = t + 3; if (onLocked) { onLocked(loc); } } return; }
            if (!d.gate) { travelTo(loc); }
        });
    }
    function regionOf() {
        if (inside) { return inside; }
        var p = heroPos();
        if (dist2(p.x, p.z, Z.parko[0], Z.parko[1]) < 9.0) { return "parko"; }
        var best = "plateia", bd = 5.5;
        ["spiti", "estiatorio", "vivliothiki", "panepistimio"].forEach(function (l) { var d = doors[l], dd = dist2(p.x, p.z, d.x, d.z + 1.5); if (dd < bd && !d.locked) { bd = dd; best = l; } });
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
        camYaw = camGoalYaw = 0;
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
            if (d < Math.min(bd, 1.6)) { bd = d; best = { kind: "sign", id: id }; }
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
        // к табличке — просто подойти: её текст сам всплывёт крупно; E откроет её во весь экран
        else if (h.kind === "sign") { var s = signs[h.id]; approach(s.at.x, s.at.z, 1.0, function () { }); }
        else if (h.kind === "door") {
            var d = doors[h.id];
            if (d.locked) { approach(d.x, d.z - (d.gate ? 0.6 : 0), 1.5, function () { if (onLocked) { onLocked(h.id); } }); }
            else if (d.gate) { goTo(Z.parko[0], Z.parko[1] - 6.0); }
            else { goTo(d.x, d.z); }
        }
    }

    // ---------------------------------------------------------------- камера
    var camRay = new T.Raycaster();
    function updateCamera(dt, t) {
        var p = heroPos();
        if (coverMode) {
            camT.lerp(tmpV.set(0, 1.5, 2), 1 - Math.exp(-dt * 2));
            var cy = t * 0.06, cp = 0.7, cd = 30;
            camera.position.set(camT.x + Math.sin(cy) * cd * Math.cos(cp), camT.y + cd * Math.sin(cp), camT.z + Math.cos(cy) * cd * Math.cos(cp));
            camera.lookAt(camT);
        } else {
            var goalT = camOverride ? camOverride.t : tmpV.set(p.x, 1.3, p.z);
            camT.lerp(goalT, 1 - Math.exp(-dt * (camOverride ? 2 : 10)));
            // камера сама заходит за спину, когда герой идёт вперёд или по клику (если игрок её недавно не крутил)
            if (!camOverride && followMove && hero.speed > 0.5 && t - userRotT > 2.5) { camGoalYaw += angWrap(hero.yaw + Math.PI - camGoalYaw) * Math.min(1, dt * 1.1); }
            camYaw += angWrap(camGoalYaw - camYaw) * Math.min(1, dt * 8);
            var want = camOverride ? camOverride.d : zoomD;
            var pitch = camOverride ? 0.42 : inside ? Math.max(camPitch, 0.85) : camPitch;
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
            if ((c === "KeyE" || c === "Space") && near) { e.preventDefault(); cancelPath(); act(near); return; }
            if (c === "KeyQ") { camGoalYaw += 0.4; userRotT = clock.elapsedTime; e.preventDefault(); return; }
            if (c === "KeyE") { camGoalYaw -= 0.4; userRotT = clock.elapsedTime; e.preventDefault(); return; }
            if (/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(c)) { keys[c] = true; if (/^Arrow/.test(c)) { e.preventDefault(); } }
        });
        window.addEventListener("keyup", function (e) { keys[e.code] = false; });
        window.addEventListener("blur", function () { keys = {}; });
        canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
        canvas.addEventListener("pointerdown", function (e) {
            if (coverMode || finaleOn) { return; }
            if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) { document.activeElement.blur(); }
            drag = { x: e.clientX, y: e.clientY, yaw: camGoalYaw, pitch: camPitch, right: e.button === 2 }; dragged = false;
        });
        window.addEventListener("pointermove", function (e) {
            var r = canvas.getBoundingClientRect();
            if (drag) {
                var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                if (Math.abs(dx) > 6 || Math.abs(dy) > 6) { dragged = true; }
                if (dragged) { camGoalYaw = drag.yaw - dx * 0.006; camPitch = Math.max(0.3, Math.min(1.15, drag.pitch + dy * 0.004)); userRotT = clock.elapsedTime; }
            }
            if (e.target !== canvas || coverMode || finaleOn) { hoverEl.classList.remove("on"); return; }
            var h = pickHit(e);
            canvas.style.cursor = drag && dragged ? "grabbing" : h ? "pointer" : "default";
            if (h) {
                hoverEl.textContent = h.kind === "npc" ? NPCS[h.id].name : h.kind === "sign" ? SIGNS[h.id].title :
                    (doors[h.id].locked ? "Закрыто: " : h.kind === "door" && doors[h.id].gate ? "Калитка: " : "Войти: ") + (typeof plain === "function" ? plain(locName(h.id)) : h.id);
                hoverEl.style.left = (e.clientX - r.left + 16) + "px"; hoverEl.style.top = (e.clientY - r.top + 14) + "px";
                hoverEl.classList.add("on");
            } else { hoverEl.classList.remove("on"); }
        });
        window.addEventListener("pointerup", function () { drag = null; });
        canvas.addEventListener("click", function (e) {
            if (coverMode || finaleOn) { return; }
            if (dragged) { dragged = false; e.stopPropagation(); return; }
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
            zoomD = Math.max(4.5, Math.min(19, zoomD * (e.deltaY > 0 ? 1.1 : 0.9)));
        }, { passive: false });
    }
    function locName(id) { var l = (window.LOCS || []).filter(function (x) { return x.id === id; })[0]; return l ? l.name : id; }
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
            if (n.cur !== "idle" && n.acts[n.cur] && n.acts[n.cur].loop === T.LoopOnce && !n.acts[n.cur].isRunning()) { play(n, "idle"); }
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
        var pos = near.kind === "npc" ? npcs[near.id].root.position : signs[near.id].at;
        tmpV.set(pos.x, 0.1, pos.z).project(camera);
        var w = canvas.clientWidth, h = canvas.clientHeight;
        promptEl.innerHTML = "<b>E</b> " + (near.kind === "npc" ? "поговорить: " + NPCS[near.id].name : "во весь экран: " + SIGNS[near.id].title) + (near.kind === "npc" ? " <span>или клик</span>" : "");
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
                hero = makeHero(SPAWN.plateia.x, SPAWN.plateia.z);
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
    api.start = function (loc) { placeHero(SPAWN[loc] || SPAWN.plateia); lastLoc = null; };
    api.show = function (loc, st, markers) {
        if (!ready) { return; }
        Object.keys(doors).forEach(function (l) {
            var d = doors[l], open = typeof locUnlocked === "function" ? locUnlocked(st, l) : true;
            d.locked = !open; d.lock.visible = !open;
            if (d.gate) { d.col.off = open; d.g.rotation.y = open ? -1.4 : 0; d.g.position.x = open ? d.x - 0.8 : d.x; }
            else { d.mesh.bar.visible = !open; d.mesh.leaf.material.color.set(open ? 0x2f6fa3 : 0x51606e); }
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
    api.finale = function (on) {
        if (!ready) { return; }
        var K2 = Z.parko, e = npcs.eleni, n = npcs.nikos;
        if (on) {
            finaleOn = true; cancelPath(); keys = {};
            placeHero({ x: K2[0] + 2.2, z: K2[1] + 4.8, yaw: -2.6 });
            api.setNight(true);
            moveNpc(e, K2[0] - 0.75, K2[1] + 2.6, 0.85); moveNpc(n, K2[0] + 0.75, K2[1] + 2.6, -0.85);
            camOverride = { t: new T.Vector3(K2[0], 1.2, K2[1] + 2.5), d: 8, yaw: 0.15 };
            Object.keys(npcs).forEach(function (id) { npcs[id].marker.visible = false; });
        } else {
            finaleOn = false; camOverride = null;
            api.setNight(false);
            moveNpc(e, e.home.x, e.home.z, e.homeYaw); moveNpc(n, n.home.x, n.home.z, n.homeYaw);
        }
    };
    // отладка и снимки экрана
    api.snap = function () { var p = heroPos(); camT.set(p.x, 1.3, p.z); camYaw = camGoalYaw; camD = zoomD; };
    api.debug = {
        hero: function () { var p = heroPos(); return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), inside: inside, region: regionOf(), anim: hero.cur, path: path.length, near: near }; },
        goTo: function (x, z) { return goTo(x, z); },
        click: function (kind, id) { interactTarget({ kind: kind, id: id }); return path.length; },
        key: function (code, down) { keys[code] = !!down; },
        place: function (x, z, yaw) { placeHero({ x: x, z: z, yaw: yaw || 0, inside: null }); },
        doors: function () { var o = {}; Object.keys(doors).forEach(function (k) { o[k] = { x: +doors[k].x.toFixed(2), z: +doors[k].z.toFixed(2), locked: doors[k].locked }; }); return o; },
        npcPos: function (id) { var p = npcs[id].root.position; return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }; },
        blocked: function (x, z) { return blockedAt(x, z, HERO_R); },
        setYaw: function (y) { camYaw = camGoalYaw = y; },
        zoom: function (d) { zoomD = d; camD = d; },
        sign: function (id) { var a = signs[id].at; return { x: +a.x.toFixed(2), z: +a.z.toFixed(2), blocked: blockedAt(a.x, a.z, HERO_R) }; },
        colsNear: function (x, z, r) { return cols.filter(function (c) { return !c.off && (c.t === "c" ? dist2(x, z, c.x, c.z) < c.r + r : dist2(x, z, Math.max(c.x0, Math.min(x, c.x1)), Math.max(c.z0, Math.min(z, c.z1))) < r); }).map(function (c) { return c.t === "c" ? ["c", +c.x.toFixed(1), +c.z.toFixed(1), c.r] : ["b", +c.x0.toFixed(1), +c.x1.toFixed(1), +c.z0.toFixed(1), +c.z1.toFixed(1)]; }); },
    };
    api.stats = function () { return { draws: renderer.info.render.calls, tris: renderer.info.render.triangles, models: Object.keys(models).length, frames: api.frames || 0, colliders: cols.length }; };
    api.hasModel = function (k) { return !!models[k]; };
    return api;
})();
