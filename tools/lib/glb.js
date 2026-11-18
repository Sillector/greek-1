// Чтение GLB без зависимостей: JSON-часть, габариты по иерархии узлов, анимации, кости, внешние текстуры.
"use strict";
var fs = require("fs");

function readGlb(file) {
    var b = fs.readFileSync(file);
    if (b.readUInt32LE(0) !== 0x46546c67) { throw new Error("не GLB: " + file); }
    var len = b.readUInt32LE(12);
    var json = JSON.parse(b.slice(20, 20 + len).toString("utf8"));
    return { json: json, bytes: b.length };
}

// 4x4 матрицы, столбцами (как в glTF)
function ident() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) { for (var r = 0; r < 4; r++) { var s = 0; for (var k = 0; k < 4; k++) { s += a[k * 4 + r] * b[c * 4 + k]; } o[c * 4 + r] = s; } }
    return o;
}
function trs(n) {
    if (n.matrix) { return n.matrix.slice(); }
    var t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    var x = q[0], y = q[1], z = q[2], w = q[3];
    var m = [
        (1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + z * w)) * s[0], (2 * (x * z - y * w)) * s[0], 0,
        (2 * (x * y - z * w)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + x * w)) * s[1], 0,
        (2 * (x * z + y * w)) * s[2], (2 * (y * z - x * w)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
        t[0], t[1], t[2], 1,
    ];
    return m;
}
function apply(m, p) {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}

// Габариты модели в её собственных единицах (как их увидит three.js Box3.setFromObject без скиннинга)
function info(file) {
    var g = readGlb(file), j = g.json;
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    var scene = j.scenes ? j.scenes[j.scene || 0] : { nodes: (j.nodes || []).map(function (_, i) { return i; }) };
    function visit(ni, parent) {
        var n = j.nodes[ni], m = mul(parent, trs(n));
        if (n.mesh != null) {
            j.meshes[n.mesh].primitives.forEach(function (p) {
                var acc = j.accessors[p.attributes.POSITION];
                if (!acc || !acc.min) { return; }
                for (var cx = 0; cx < 2; cx++) { for (var cy = 0; cy < 2; cy++) { for (var cz = 0; cz < 2; cz++) {
                    var q = apply(m, [cx ? acc.max[0] : acc.min[0], cy ? acc.max[1] : acc.min[1], cz ? acc.max[2] : acc.min[2]]);
                    for (var k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); }
                } } }
            });
        }
        (n.children || []).forEach(function (c) { visit(c, m); });
    }
    (scene.nodes || []).forEach(function (ni) { visit(ni, ident()); });
    if (mn[0] === Infinity) { mn = [0, 0, 0]; mx = [0, 0, 0]; }
    var bones = [];
    (j.skins || []).forEach(function (s) { s.joints.forEach(function (ji) { bones.push(j.nodes[ji].name); }); });
    return {
        bytes: g.bytes,
        size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].map(function (v) { return +v.toFixed(3); }),
        min: mn.map(function (v) { return +v.toFixed(3); }),
        anims: (j.animations || []).map(function (a) { return a.name; }),
        bones: bones,
        images: (j.images || []).filter(function (im) { return im.uri; }).map(function (im) { return im.uri; }),
    };
}

module.exports = { readGlb: readGlb, info: info };
