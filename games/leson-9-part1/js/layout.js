// Геометрия мира без three.js: раскладка зон, координаты, площади, расстояния.
// Общая для движка (world.js) и проверки (tools/validate.js), чтобы утверждения о сцене проверялись по тем же числам.
var LAYOUT = (function () {
    function rot2(x, z, a) { var c = Math.cos(a), s = Math.sin(a); return [x * c + z * s, -x * s + z * c]; }

    // центры открытых зон: явные center, иначе по world.layout (ring / line / grid)
    function resolve(world) {
        var out = {}, outdoor = world.zones.filter(function (z) { return z.kind !== "interior"; });
        var free = outdoor.filter(function (z) { return !z.center; });
        var L = world.layout || { type: "ring", r: 20 };
        free.forEach(function (z, i) {
            var n = free.length, c;
            if (L.type === "line") { c = [(i - (n - 1) / 2) * (L.step || 22), 0]; }
            else if (L.type === "grid") { var cols = L.cols || Math.ceil(Math.sqrt(n)); c = [((i % cols) - (cols - 1) / 2) * (L.step || 24), (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * (L.step || 24)]; }
            else { var a = (L.start || 0) + i / n * Math.PI * 2; c = [Math.sin(a) * (L.r || 20), -Math.cos(a) * (L.r || 20)]; }
            out[z.id] = c;
        });
        outdoor.forEach(function (z) { if (z.center) { out[z.id] = z.center.slice(); } });
        // интерьеры — в стороне от мира, в ряд
        var ix = 0;
        world.zones.forEach(function (z) {
            if (z.kind === "interior") { out[z.id] = [-80 + ix * 40, 220]; ix += 1; }
        });
        return out;
    }

    function zoneSize(z) {
        if (z.kind === "interior") { return { w: z.size[0], d: z.size[1], area: z.size[0] * z.size[1] }; }
        if (z.radius) { return { w: z.radius * 2, d: z.radius * 2, area: Math.PI * z.radius * z.radius }; }
        var r = z.rect || [16, 16];
        return { w: r[0], d: r[1], area: r[0] * r[1] };
    }

    function inZone(z, c, x, z2, margin) {
        margin = margin || 0;
        if (z.kind === "interior") { return Math.abs(x - c[0]) <= z.size[0] / 2 + margin && Math.abs(z2 - c[1]) <= z.size[1] / 2 + margin; }
        if (z.radius) { var dx = x - c[0], dz = z2 - c[1]; return Math.sqrt(dx * dx + dz * dz) <= z.radius + margin; }
        var r = z.rect || [16, 16];
        return Math.abs(x - c[0]) <= r[0] / 2 + margin && Math.abs(z2 - c[1]) <= r[1] / 2 + margin;
    }

    // размер экземпляра модели при заданных h / w / s
    function scaled(size, o) {
        if (!size) { return null; }
        var k = o.h ? o.h / size[1] : o.w ? o.w / size[0] : o.s || 1;
        return [size[0] * k, size[1] * k, size[2] * k];
    }

    // все предметы мира с мировыми координатами: { item, zone, x, z, size }
    function placed(world, sizes) {
        var C = resolve(world), out = [];
        world.zones.forEach(function (zn) {
            var c = C[zn.id];
            (function walk(list, ox, oz, a) {
                (list || []).forEach(function (it) {
                    if (it.p === "repeat") {
                        for (var k = 0; k < (it.n || 1); k++) {
                            var copy = JSON.parse(JSON.stringify(it.item));
                            copy.at = [(it.at ? it.at[0] : 0) + k * (it.step ? it.step[0] : 1), (it.at ? it.at[1] : 0) + k * (it.step ? it.step[1] : 0)];
                            if (it.id) { copy.id = it.id + "-" + k; }
                            walk([copy], ox, oz, a);
                        }
                        return;
                    }
                    var at = it.at || [0, 0], r = rot2(at[0], at[1], a);
                    var x = ox + r[0], z = oz + r[1];
                    var sz = it.m && sizes ? scaled(sizes[it.m], it) : it.p === "boat" ? [(it.len || 4) * 0.36, (it.len || 4) * 0.2, it.len || 4] : it.size ? [it.size[0], it.size[1], it.size[2] != null ? it.size[2] : it.size[0]] : null;
                    out.push({ item: it, zone: zn.id, x: x, z: z, size: sz });
                    if (it.on) { walk(it.on, x, z, a + (it.rot || 0)); }
                });
            })(zn.props, c[0], c[1], 0);
        });
        return out;
    }

    function findProp(world, sizes, id) {
        var all = placed(world, sizes);
        for (var i = 0; i < all.length; i++) { if (all[i].item.id === id) { return all[i]; } }
        return null;
    }

    // где вход в интерьер: позиция двери здания в открытой зоне (для расстояний «рядом»)
    function interiorEntrance(world, sizes, zoneId) {
        var all = placed(world, sizes);
        for (var i = 0; i < all.length; i++) {
            var p = all[i];
            if (p.item.door && p.item.door.to === zoneId) { return p; }
        }
        return null;
    }

    // точка для утверждения: zone:<id> | prop:<id> | npc:<id> | area:<zone>.<area>
    function point(world, sizes, npcs, ref) {
        var C = resolve(world), parts = ref.split(":"), kind = parts[0], id = parts.slice(1).join(":");
        if (kind === "zone") {
            var zn = world.zones.filter(function (z) { return z.id === id; })[0];
            if (!zn) { return null; }
            if (zn.kind === "interior") { var e = interiorEntrance(world, sizes, id); return e ? [e.x, e.z] : C[id]; }
            return C[id];
        }
        if (kind === "prop") { var p = findProp(world, sizes, id); return p ? [p.x, p.z] : null; }
        if (kind === "npc") {
            var n = npcs[id]; if (!n) { return null; }
            var zz = world.zones.filter(function (z) { return z.id === n.zone; })[0];
            if (zz && zz.kind === "interior") { return point(world, sizes, npcs, "zone:" + n.zone); }
            return [C[n.zone][0] + n.at[0], C[n.zone][1] + n.at[1]];
        }
        return null;
    }

    // величина для сравнения: area | height | width
    function measure(world, sizes, ref, metric) {
        var parts = ref.split(":"), kind = parts[0], id = parts.slice(1).join(":");
        metric = metric || "area";
        if (kind === "zone") {
            var zn = world.zones.filter(function (z) { return z.id === id; })[0];
            if (!zn) { return null; }
            var s = zoneSize(zn);
            return metric === "width" ? s.w : s.area;
        }
        if (kind === "area") {
            var zid = id.split(".")[0], aid = id.split(".")[1];
            var z2 = world.zones.filter(function (z) { return z.id === zid; })[0];
            var ar = z2 && (z2.areas || []).filter(function (a) { return a.id === aid; })[0];
            return ar ? (metric === "width" ? ar.rect[2] : ar.rect[2] * ar.rect[3]) : null;
        }
        if (kind === "prop") {
            var p = findProp(world, sizes, id);
            if (!p || !p.size) { return null; }
            return metric === "height" ? p.size[1] : metric === "width" ? p.size[0] : p.size[0] * p.size[2];
        }
        return null;
    }

    function dist(a, b) { var dx = a[0] - b[0], dz = a[1] - b[1]; return Math.sqrt(dx * dx + dz * dz); }

    return { resolve: resolve, zoneSize: zoneSize, inZone: inZone, placed: placed, findProp: findProp, point: point, measure: measure, dist: dist, scaled: scaled, rot2: rot2, interiorEntrance: interiorEntrance };
})();
if (typeof module !== "undefined") { module.exports = LAYOUT; }
