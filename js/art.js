// Вся графика игры — инлайн-SVG, рисуется кодом.
var ART = (function () {
    var INK = "#2b2a33";
    var C = {
        ink: INK, paper: "#f6ecd6", wall: "#f8f3ea", wall2: "#ece2d0", shade: "#d9cbb3",
        blue: "#2f6fa3", blue2: "#5b9bd1", sky1: "#9fd3ee", sky2: "#fbeed6",
        terra: "#c8643b", terra2: "#e08a5a", lemon: "#f4c84a", leaf: "#5e8c3a", leaf2: "#86b25a",
        wood: "#9a6a43", wood2: "#c08a5b", stone: "#cfc3b0", red: "#c9473d", pink: "#e98aa6",
        purple: "#7d5ba6", green: "#4f8a5b", gray: "#8c8a93", night: "#1d2340",
    };

    function svg(vb, inner, cls) {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '"' + (cls ? ' class="' + cls + '"' : "") + ' preserveAspectRatio="xMidYMid meet">' + inner + "</svg>";
    }
    var S = ' stroke="' + INK + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
    var S2 = ' stroke="' + INK + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

    // ---------------------------------------------------------------- люди
    var LOOKS = {
        takis:   { skin: "#e8b48f", hair: "#3a2b25", style: "cap", cap: "#c9473d", top: "#6f9c84", bottom: "#4a4f6b", mous: true },
        sofia:   { skin: "#f0c3a0", hair: "#7a4a2a", style: "bob", top: "#e98aa6", bottom: "#e98aa6", dress: true, dots: true },
        nikos:   { skin: "#e3ad85", hair: "#d8d6d0", style: "chef", top: "#ffffff", bottom: "#4a4f6b", mous: true, apron: true, old: true },
        eleni:   { skin: "#f2c9aa", hair: "#cfcbc6", style: "bun", top: "#7d5ba6", bottom: "#5a4a6e", dress: true, glasses: true, old: true },
        anna:    { skin: "#d9a17a", hair: "#2f2321", style: "pony", top: "#f4c84a", bottom: "#3f6fa0", phones: true },
        giorgos: { skin: "#c98f68", hair: "#4b3a2e", style: "cap", cap: "#4f8a5b", top: "#4f8a5b", bottom: "#5c5246", beard: true },
    };

    function hair(o) {
        switch (o.style) {
            case "bob":
                return '<path d="M-34,-168 C-38,-212 38,-212 34,-168 L36,-140 C24,-136 26,-160 20,-176 C6,-186 -12,-186 -22,-174 C-26,-160 -24,-138 -36,-140 Z" fill="' + o.hair + '"' + S + "/>";
            case "bun":
                return '<circle cx="0" cy="-212" r="14" fill="' + o.hair + '"' + S + '/><path d="M-31,-166 C-34,-206 34,-206 31,-166 C24,-188 -24,-188 -31,-166 Z" fill="' + o.hair + '"' + S + "/>";
            case "pony":
                return '<path d="M28,-186 C52,-178 54,-140 44,-124 C40,-140 36,-156 26,-168 Z" fill="' + o.hair + '"' + S + '/><path d="M-31,-164 C-36,-208 36,-208 31,-164 C20,-186 -8,-190 -31,-164 Z" fill="' + o.hair + '"' + S + "/>";
            case "chef":
                return '<path d="M-26,-188 L-24,-210 C-44,-214 -40,-244 -18,-238 C-14,-258 14,-258 18,-238 C40,-244 44,-214 24,-210 L26,-188 Z" fill="#fff"' + S + '/><path d="M-26,-188 L26,-188" fill="none"' + S + "/>";
            case "cap":
                return '<path d="M-30,-176 C-30,-212 30,-212 30,-176 Z" fill="' + o.cap + '"' + S + '/><path d="M20,-178 L48,-176 C46,-170 30,-170 18,-172 Z" fill="' + o.cap + '"' + S + "/>";
        }
        return "";
    }

    function face(o, scale) {
        var f = "";
        f += '<circle cx="-11" cy="-170" r="3.4" fill="' + INK + '"/><circle cx="11" cy="-170" r="3.4" fill="' + INK + '"/>';
        f += '<circle cx="-18" cy="-158" r="5" fill="#f08f86" opacity=".45"/><circle cx="18" cy="-158" r="5" fill="#f08f86" opacity=".45"/>';
        if (o.mous) { f += '<path d="M-14,-152 C-8,-158 -2,-156 0,-152 C2,-156 8,-158 14,-152 C8,-148 2,-150 0,-152 C-2,-150 -8,-148 -14,-152 Z" fill="' + (o.old ? "#d8d6d0" : o.hair) + '"' + S2 + "/>"; }
        else { f += '<path d="M-7,-153 C-3,-148 3,-148 7,-153" fill="none"' + S2 + "/>"; }
        if (o.beard) { f += '<path d="M-24,-160 C-22,-134 22,-134 24,-160 C14,-146 -14,-146 -24,-160 Z" fill="' + o.hair + '"' + S2 + "/>"; }
        if (o.glasses) { f += '<circle cx="-11" cy="-170" r="8" fill="none"' + S2 + '/><circle cx="11" cy="-170" r="8" fill="none"' + S2 + '/><path d="M-3,-170 L3,-170" ' + S2 + "/>"; }
        if (o.old) { f += '<path d="M-20,-182 L-6,-180 M6,-180 L20,-182" fill="none" stroke="' + INK + '" stroke-width="1.6" stroke-linecap="round"/>'; }
        return f;
    }

    // Фигура человека, ноги в (x, y)
    function person(id, x, y, s, extra) {
        var o = LOOKS[id];
        var g = '<g transform="translate(' + x + "," + y + ") scale(" + s + ')">';
        g += '<ellipse cx="0" cy="2" rx="40" ry="8" fill="#000" opacity=".12"/>';
        // ноги
        if (o.dress) {
            g += '<path d="M-30,-58 L-36,-6 L36,-6 L30,-58 Z" fill="' + o.bottom + '"' + S + "/>";
            g += '<path d="M-14,-6 L-14,0 M14,-6 L14,0" ' + S + "/>";
        } else {
            g += '<path d="M-20,-60 L-18,-2 L-4,-2 L-2,-40 L2,-40 L4,-2 L18,-2 L20,-60 Z" fill="' + o.bottom + '"' + S + "/>";
        }
        // туловище
        g += '<path d="M-34,-130 C-36,-80 -32,-60 -30,-54 L30,-54 C32,-60 36,-80 34,-130 C20,-142 -20,-142 -34,-130 Z" fill="' + o.top + '"' + S + "/>";
        if (o.dots) { g += '<g fill="#fff" opacity=".8"><circle cx="-14" cy="-110" r="3"/><circle cx="10" cy="-96" r="3"/><circle cx="-6" cy="-80" r="3"/><circle cx="16" cy="-120" r="3"/><circle cx="-20" cy="-70" r="3"/><circle cx="18" cy="-74" r="3"/></g>'; }
        if (o.apron) { g += '<path d="M-22,-112 L22,-112 L26,-50 L-26,-50 Z" fill="#f2efe8"' + S2 + '/><path d="M-10,-90 L10,-90" ' + S2 + "/>"; }
        if (o.phones) { g += '<path d="M-22,-134 C-26,-118 26,-118 22,-134" fill="none" stroke="#3a3a48" stroke-width="5"/><circle cx="-22" cy="-132" r="6" fill="#3a3a48"/><circle cx="22" cy="-132" r="6" fill="#3a3a48"/>'; }
        // руки
        g += '<path d="M-32,-124 C-50,-104 -50,-82 -42,-66" fill="none" stroke="' + o.top + '" stroke-width="15" stroke-linecap="round"/>';
        g += '<path d="M-32,-124 C-50,-104 -50,-82 -42,-66" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linecap="round" opacity=".0"/>';
        g += '<circle cx="-42" cy="-64" r="8" fill="' + o.skin + '"' + S2 + "/>";
        g += '<path d="M32,-124 C50,-104 50,-82 42,-66" fill="none" stroke="' + o.top + '" stroke-width="15" stroke-linecap="round"/>';
        g += '<circle cx="42" cy="-64" r="8" fill="' + o.skin + '"' + S2 + "/>";
        // шея и голова
        g += '<rect x="-8" y="-146" width="16" height="14" fill="' + o.skin + '"/>';
        g += '<circle cx="0" cy="-172" r="31" fill="' + o.skin + '"' + S + "/>";
        g += hair(o) + face(o);
        if (extra) { g += extra; }
        g += "</g>";
        return g;
    }

    function dog(x, y, s) {
        return '<g transform="translate(' + x + "," + y + ") scale(" + s + ')" class="dog">' +
            '<ellipse cx="0" cy="2" rx="30" ry="6" fill="#000" opacity=".12"/>' +
            '<path d="M-26,-12 L-26,0 M-12,-12 L-12,0 M12,-12 L12,0 M24,-12 L24,0" ' + S + "/>" +
            '<ellipse cx="0" cy="-22" rx="32" ry="16" fill="#d9a066"' + S + "/>" +
            '<path class="tail" d="M-30,-28 C-44,-36 -46,-46 -40,-52" fill="none"' + S + "/>" +
            '<circle cx="30" cy="-40" r="14" fill="#d9a066"' + S + "/>" +
            '<path d="M22,-50 C16,-58 20,-62 26,-54 Z" fill="#8d5a33"' + S2 + "/>" +
            '<circle cx="34" cy="-42" r="2.6" fill="' + INK + '"/><circle cx="43" cy="-37" r="3" fill="' + INK + '"/></g>';
    }

    // Портрет для окон просьб
    function portrait(id) {
        return svg("-70 -250 140 150", '<circle cx="0" cy="-175" r="70" fill="#f3e6c9"/>' + person(id, 0, 0, 1), "portrait");
    }

    // ---------------------------------------------------------------- мелкие части сцен
    function house(x, y, w, h, o) {
        o = o || {};
        var g = '<g transform="translate(' + x + "," + y + ')">';
        g += '<rect x="0" y="' + -h + '" width="' + w + '" height="' + h + '" fill="' + (o.wall || C.wall) + '"' + S + "/>";
        if (o.roof !== false) { g += '<path d="M-8,' + -h + " L" + w / 2 + "," + (-h - (o.roofH || 30)) + " L" + (w + 8) + "," + -h + ' Z" fill="' + (o.roofC || C.terra) + '"' + S + "/>"; }
        if (o.flat) { g += '<rect x="-4" y="' + (-h - 8) + '" width="' + (w + 8) + '" height="10" fill="' + C.wall2 + '"' + S + "/>"; }
        if (o.door !== false) {
            var dx = o.doorX != null ? o.doorX : w / 2 - 14;
            g += '<path d="M' + dx + ",0 L" + dx + ",-44 C" + dx + ",-58 " + (dx + 28) + ",-58 " + (dx + 28) + ",-44 L" + (dx + 28) + ',0 Z" fill="' + (o.doorC || C.blue) + '"' + S + "/>";
        }
        (o.windows || []).forEach(function (wn) {
            g += '<rect x="' + wn[0] + '" y="' + wn[1] + '" width="' + (wn[2] || 22) + '" height="' + (wn[3] || 26) + '" fill="' + (o.winC || C.blue2) + '"' + S2 + "/>";
            g += '<path d="M' + (wn[0] + (wn[2] || 22) / 2) + "," + wn[1] + " L" + (wn[0] + (wn[2] || 22) / 2) + "," + (wn[1] + (wn[3] || 26)) + '" stroke="' + INK + '" stroke-width="1.5"/>';
        });
        g += "</g>";
        return g;
    }

    function tree(x, y, s, fruit) {
        var g = '<g transform="translate(' + x + "," + y + ") scale(" + s + ')">';
        g += '<path d="M-6,0 L-4,-60 C-20,-70 -24,-80 -18,-84 M-4,-60 L4,-60 L6,0 Z" fill="' + C.wood + '"' + S + "/>";
        g += '<circle cx="-26" cy="-86" r="30" fill="' + C.leaf + '"' + S + '/><circle cx="24" cy="-90" r="32" fill="' + C.leaf + '"' + S + '/><circle cx="0" cy="-118" r="36" fill="' + C.leaf2 + '"' + S + "/>";
        if (fruit) {
            [[-30, -80], [20, -84], [4, -122], [-12, -100], [34, -104], [-36, -100]].forEach(function (p) {
                g += '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="7" ry="5.5" fill="' + C.lemon + '"' + S2 + "/>";
            });
        }
        return g + "</g>";
    }

    function bush(x, y, s, flowers) {
        var g = '<g transform="translate(' + x + "," + y + ") scale(" + s + ')">';
        g += '<path d="M-40,0 C-50,-30 -20,-46 0,-36 C20,-50 52,-30 40,0 Z" fill="' + C.leaf + '"' + S + "/>";
        if (flowers) { [[-22, -24], [0, -32], [20, -22], [-6, -14], [28, -10]].forEach(function (p) { g += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" fill="' + flowers + '"' + S2 + "/>"; }); }
        return g + "</g>";
    }

    function lamp(x, y, lit) {
        return '<g transform="translate(' + x + "," + y + ')">' + (lit ? '<circle cx="0" cy="-128" r="40" fill="#ffd77a" opacity=".25" class="glow"/>' : "") +
            '<path d="M0,0 L0,-118" ' + S + '/><path d="M-12,-118 L12,-118 L8,-140 L-8,-140 Z" fill="' + (lit ? "#ffe39a" : "#e9e3d6") + '"' + S + '/><path d="M-10,0 L10,0" ' + S + "/></g>";
    }

    function bench(x, y, s) {
        return '<g transform="translate(' + x + "," + y + ") scale(" + (s || 1) + ')"><path d="M-60,-30 L60,-30 M-60,-44 L60,-44 M-60,-58 L60,-58" stroke="' + C.wood + '" stroke-width="9" stroke-linecap="round"/><path d="M-60,-30 L60,-30 M-60,-44 L60,-44 M-60,-58 L60,-58" fill="none" stroke="' + INK + '" stroke-width="1.5" opacity=".5"/><path d="M-50,-30 L-50,0 M50,-30 L50,0" ' + S + "/></g>";
    }

    function lockBadge(x, y) {
        return '<g transform="translate(' + x + "," + y + ')" class="lock"><circle r="22" fill="#2b2a33" opacity=".75"/><rect x="-9" y="-3" width="18" height="14" rx="2" fill="#f6ecd6"/><path d="M-6,-3 L-6,-9 C-6,-17 6,-17 6,-9 L6,-3" fill="none" stroke="#f6ecd6" stroke-width="3"/></g>';
    }

    function cloud(x, y, s) {
        return '<g transform="translate(' + x + "," + y + ") scale(" + s + ')" class="cloud" opacity=".9"><path d="M-40,0 C-60,0 -60,-24 -38,-24 C-36,-44 -6,-48 4,-30 C14,-44 44,-40 42,-18 C60,-18 60,0 42,0 Z" fill="#fff"/></g>';
    }

    function skyGrad(id, a, b) {
        return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs>';
    }

    function hot(kind, val, inner, label) {
        return '<g class="hot" data-' + kind + '="' + val + '" tabindex="0"' + (label ? ' aria-label="' + label + '"' : "") + ">" + inner + "</g>";
    }

    function npcGroup(id, inner, marker) {
        var n = NPCS[id];
        return '<g class="hot npc" data-npc="' + id + '" tabindex="0">' + inner +
            (marker ? '<g transform="translate(' + (n.x * 10 + 34) + "," + (n.y * 5.6 - 6) + ')"><g class="marker ' + marker + '"><title>' + (marker === "ready" ? "Житель просит о помощи — вы уже понимаете, о чём" : "Житель о чём-то просит, но вы пока не понимаете") + "</title>" +
                '<path d="M-22,-18 L22,-18 C28,-18 30,-16 30,-10 L30,8 C30,14 28,16 22,16 L-2,16 L-12,26 L-10,16 L-22,16 C-28,16 -30,14 -30,8 L-30,-10 C-30,-16 -28,-18 -22,-18 Z" fill="' + (marker === "ready" ? "#f4c84a" : "#fffaf0") + '"' + S + "/>" +
                '<text y="7" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="800" fill="' + INK + '">' + (marker === "ready" ? "!" : "?") + "</text></g></g>" : "") +
            "</g>";
    }

    // ---------------------------------------------------------------- сцены 1000×560
    function scenePlateia(st, mk) {
        var g = skyGrad("skyP", C.sky1, C.sky2) + '<rect width="1000" height="560" fill="url(#skyP)"/>';
        g += '<circle cx="840" cy="80" r="40" fill="#fff3c4" class="sun"/>';
        g += cloud(180, 70, 1) + cloud(620, 50, 0.8);
        // большой город вдали
        var sky = "";
        [[300, 120, 40], [345, 160, 34], [384, 100, 46], [434, 190, 30], [470, 140, 44], [520, 210, 36], [560, 130, 50], [616, 170, 32], [652, 110, 44], [700, 150, 38]].forEach(function (b, i) {
            sky += '<rect x="' + b[0] + '" y="' + (300 - b[1]) + '" width="' + b[2] + '" height="' + b[1] + '" fill="#9bb3c9" stroke="#7f98ae" stroke-width="2"/>';
            for (var yy = 300 - b[1] + 12; yy < 290; yy += 18) { sky += '<path d="M' + (b[0] + 8) + "," + yy + " L" + (b[0] + b[2] - 8) + "," + yy + '" stroke="#c5d4e2" stroke-width="3" stroke-dasharray="5 5"/>'; }
        });
        g += '<g class="city" opacity=".85">' + sky + "</g>";
        // холм с домами квартала
        g += '<path d="M0,300 C200,270 800,270 1000,300 L1000,560 L0,560 Z" fill="#efe2c8"/>';
        // библиотека (сзади слева)
        var lib = house(250, 330, 150, 110, { roofC: C.terra, windows: [[14, -92, 24, 34], [112, -92, 24, 34]], doorC: C.wood }) +
            '<g transform="translate(250,330)"><rect x="46" y="-98" width="58" height="40" fill="#f6ecd6"' + S2 + '/>' +
            [0, 1, 2, 3, 4, 5].map(function (i) { return '<rect x="' + (50 + i * 9) + '" y="' + (-94 + (i % 2) * 4) + '" width="7" height="' + (30 - (i % 2) * 4) + '" fill="' + ["#c9473d", "#2f6fa3", "#f4c84a", "#4f8a5b", "#7d5ba6", "#e08a5a"][i] + '"/>'; }).join("") + "</g>";
        g += hot("go", "vivliothiki", lib + (locUnlocked(st, "vivliothiki") ? "" : '<rect x="240" y="180" width="172" height="160" fill="#efe2c8" opacity=".55"/>' + lockBadge(325, 260)), "Библиотека");
        // университет (сзади справа)
        var uni = '<g transform="translate(600,330)"><path d="M-10,-120 L95,-160 L200,-120 Z" fill="' + C.wall2 + '"' + S + '/><rect x="0" y="-120" width="190" height="120" fill="' + C.wall + '"' + S + "/>" +
            [20, 60, 100, 140, 170].map(function (cx) { return '<rect x="' + (cx - 7) + '" y="-112" width="14" height="104" fill="#fff"' + S2 + "/>"; }).join("") +
            '<rect x="-10" y="-8" width="210" height="10" fill="' + C.wall2 + '"' + S2 + '/><path d="M80,-136 L110,-136 L95,-146 Z" fill="' + C.blue + '"/></g>';
        g += hot("go", "panepistimio", uni + (locUnlocked(st, "panepistimio") ? "" : '<rect x="588" y="165" width="215" height="170" fill="#efe2c8" opacity=".55"/>' + lockBadge(695, 260)), "Университет");
        g += tree(500, 340, 0.75, true);
        // ресторан слева
        var rest = house(-10, 470, 210, 170, { roof: false, flat: true, windows: [[130, -150, 40, 46]], doorX: 40, doorC: C.blue }) +
            '<g transform="translate(-10,470)">' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<path d="M' + (20 + i * 30) + ",-120 L" + (50 + i * 30) + ",-120 L" + (50 + i * 30) + ",-96 C" + (42 + i * 30) + ",-88 " + (28 + i * 30) + ",-88 " + (20 + i * 30) + ',-96 Z" fill="' + (i % 2 ? "#fff" : C.blue2) + '"' + S2 + "/>"; }).join("") +
            '<rect x="60" y="-160" width="110" height="26" rx="4" fill="' + C.lemon + '"' + S2 + '/><ellipse cx="78" cy="-147" rx="8" ry="6" fill="#fff59a"' + S2 + "/></g>";
        g += hot("go", "estiatorio", rest, "Ресторан");
        // дом Софии справа
        var sp = house(810, 470, 200, 190, { roofC: C.terra, windows: [[30, -160, 30, 36], [130, -160, 30, 36], [140, -80, 30, 36]], doorX: 60, doorC: C.blue }) +
            '<g transform="translate(810,470)"><rect x="24" y="-118" width="42" height="10" fill="' + C.terra2 + '"' + S2 + '/><circle cx="34" cy="-124" r="7" fill="' + C.pink + '"/><circle cx="48" cy="-126" r="7" fill="#f05a7e"/><circle cx="58" cy="-122" r="6" fill="' + C.pink + '"/></g>';
        g += hot("go", "spiti", sp, "Дом");
        g += bush(780, 470, 0.9, "#f05a7e");
        // мостовая
        g += '<path d="M0,470 L1000,470 L1000,560 L0,560 Z" fill="#e2d4bb"/>';
        for (var r = 0; r < 4; r++) { for (var c = 0; c < 26; c++) { g += '<rect x="' + (c * 40 + (r % 2) * 20 - 10) + '" y="' + (476 + r * 22) + '" width="34" height="16" rx="5" fill="#d6c6aa" opacity=".8"/>'; } }
        // дорожка в парк
        var pk = '<path d="M430,560 C440,520 560,520 570,560 Z" fill="#cfe6a8"' + S + '/><g transform="translate(500,548)"><path d="M-40,0 C-40,-60 40,-60 40,0" fill="none" stroke="' + C.leaf + '" stroke-width="10"/><circle cx="-34" cy="-30" r="6" fill="#f05a7e"/><circle cx="30" cy="-34" r="6" fill="' + C.lemon + '"/><circle cx="0" cy="-50" r="6" fill="#f05a7e"/></g>';
        g += hot("go", "parko", pk + (locUnlocked(st, "parko") ? "" : lockBadge(500, 520)), "Парк");
        // киоск
        g += '<g transform="translate(210,470)"><rect x="-10" y="-150" width="120" height="150" fill="#6f9c84"' + S + '/><rect x="-18" y="-168" width="136" height="22" fill="' + C.red + '"' + S + '/><rect x="6" y="-136" width="88" height="56" fill="#fff8e0"' + S2 + '/><path d="M12,-124 L50,-124 M12,-112 L80,-112 M12,-100 L60,-100" stroke="' + C.gray + '" stroke-width="3"/><rect x="-10" y="-78" width="120" height="10" fill="#557a66"/></g>';
        g += npcGroup("takis", person("takis", 268, 448, 0.62), mk.takis);
        // указатель
        var sign = '<g transform="translate(700,470)"><path d="M0,0 L0,-170" stroke="' + C.wood + '" stroke-width="10"/>' +
            '<path d="M-60,-160 L40,-160 L54,-148 L40,-136 L-60,-136 Z" fill="' + C.wood2 + '"' + S2 + '/><path d="M60,-126 L-40,-126 L-54,-114 L-40,-102 L60,-102 Z" fill="' + C.wood2 + '"' + S2 + '/><path d="M-60,-92 L40,-92 L54,-80 L40,-68 L-60,-68 Z" fill="' + C.wood2 + '"' + S2 + "/>" +
            '<path d="M-48,-148 L20,-148 M-28,-114 L44,-114 M-48,-80 L24,-80" stroke="#f6ecd6" stroke-width="3" stroke-dasharray="6 4"/></g>';
        g += hot("sign", "signpost", sign, "Указатель");
        return g;
    }

    function sceneSpiti(st, mk) {
        var g = '<rect width="1000" height="560" fill="#f3e7d2"/>';
        g += '<rect y="420" width="1000" height="140" fill="#c99868"/>';
        for (var i = 0; i < 12; i++) { g += '<path d="M' + i * 90 + ',420 L' + (i * 90 - 40) + ',560" stroke="#b5845a" stroke-width="3"/>'; }
        g += '<path d="M0,420 L1000,420" ' + S + "/>";
        // окно с видом на парк
        g += '<g transform="translate(330,90)"><rect width="230" height="200" fill="#bfe4f2"' + S + "/>" +
            '<path d="M0,150 C60,130 170,130 230,150 L230,200 L0,200 Z" fill="#9fcf7a"/>' + tree(60, 160, 0.55, false) + tree(170, 165, 0.5, false) + bench(115, 180, 0.4) +
            '<path d="M115,0 L115,200 M0,100 L230,100" stroke="#fff" stroke-width="8"/><rect width="230" height="200" fill="none"' + S + '/><rect x="-14" y="200" width="258" height="16" fill="' + C.wall + '"' + S + "/>" +
            '<path d="M-26,-12 C-10,60 -10,150 -20,214 L-40,214 L-40,-12 Z" fill="' + C.pink + '"' + S2 + '/><path d="M256,-12 C240,60 240,150 250,214 L270,214 L270,-12 Z" fill="' + C.pink + '"' + S2 + "/></g>";
        // дверь с табличкой
        var door = '<g transform="translate(90,420)"><rect x="0" y="-300" width="140" height="300" fill="' + C.blue + '"' + S + '/><rect x="16" y="-280" width="108" height="120" rx="6" fill="none" stroke="#24557d" stroke-width="4"/><rect x="16" y="-140" width="108" height="120" rx="6" fill="none" stroke="#24557d" stroke-width="4"/><circle cx="118" cy="-150" r="7" fill="' + C.lemon + '"' + S2 + "/>" +
            '<rect x="34" y="-250" width="72" height="34" rx="5" fill="#e7d9b8"' + S2 + '/><text x="70" y="-226" text-anchor="middle" font-size="18" font-weight="700" fill="' + INK + '">3</text></g>';
        g += hot("sign", "door", door, "Табличка на двери");
        // кровать
        g += '<g transform="translate(590,420)"><rect x="0" y="-70" width="150" height="50" rx="8" fill="#fff"' + S + '/><rect x="0" y="-40" width="150" height="40" fill="' + C.blue2 + '"' + S + '/><rect x="8" y="-90" width="40" height="26" rx="8" fill="#fff"' + S2 + "/></g>";
        // кухня в углу
        g += '<g transform="translate(780,420)"><rect x="0" y="-130" width="210" height="130" fill="' + C.wall2 + '"' + S + '/><rect x="16" y="-110" width="70" height="90" fill="#fff"' + S2 + '/><circle cx="51" cy="-90" r="10" fill="none"' + S2 + '/><circle cx="51" cy="-50" r="10" fill="none"' + S2 + "/>" +
            '<rect x="100" y="-110" width="96" height="40" fill="#e6d6b8"' + S2 + '/><rect x="100" y="-60" width="96" height="40" fill="#e6d6b8"' + S2 + "/>" +
            '<path d="M26,-130 L26,-150 C26,-170 76,-170 76,-150 L76,-130 Z" fill="' + C.red + '"' + S + '/><path class="steam" d="M40,-176 C30,-190 50,-200 40,-214 M60,-176 C50,-190 70,-200 60,-214" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".9"/>' +
            '<rect x="0" y="-290" width="210" height="14" fill="' + C.wood + '"' + S2 + '/><circle cx="30" cy="-300" r="10" fill="' + C.lemon + '"' + S2 + '/><rect x="60" y="-322" width="22" height="32" fill="' + C.blue2 + '"' + S2 + '/><rect x="100" y="-318" width="30" height="28" fill="' + C.terra2 + '"' + S2 + "/></g>";
        g += npcGroup("sofia", person("sofia", 640, 470, 0.95), mk.sofia);
        g += hot("go", "plateia", '<g transform="translate(40,500)"><path d="M0,0 L30,-20 L30,20 Z" fill="#f6ecd6"' + S + "/></g>", "На площадь");
        return g;
    }

    function sceneEstiatorio(st, mk) {
        var g = '<rect width="1000" height="560" fill="#e9f1f6"/>';
        g += '<rect y="0" width="1000" height="40" fill="' + C.blue + '"/>';
        g += '<rect y="430" width="1000" height="130" fill="#d7c5a8"/>';
        for (var i = 0; i < 20; i++) { g += '<rect x="' + i * 50 + '" y="430" width="50" height="50" fill="' + (i % 2 ? "#cdb999" : "#e2d3b9") + '"/><rect x="' + i * 50 + '" y="480" width="50" height="50" fill="' + (i % 2 ? "#e2d3b9" : "#cdb999") + '"/>'; }
        // вывеска
        g += hot("sign", "restname", '<g transform="translate(400,64)"><rect width="220" height="46" rx="8" fill="' + C.lemon + '"' + S + '/><ellipse cx="28" cy="23" rx="14" ry="11" fill="#fff59a"' + S2 + '/><path d="M54,18 L190,18 M54,30 L160,30" stroke="' + INK + '" stroke-width="4" stroke-linecap="round" opacity=".6"/></g>', "Вывеска");
        // меню-доска
        g += hot("sign", "menu", '<g transform="translate(60,120)"><rect width="180" height="230" rx="6" fill="#2f3b36"' + S + '/><rect x="8" y="8" width="164" height="214" fill="none" stroke="' + C.wood2 + '" stroke-width="6"/><path d="M30,50 L150,50 M30,90 L130,90 M30,124 L140,124" stroke="#f6ecd6" stroke-width="4" stroke-dasharray="10 6" opacity=".8"/><circle cx="90" cy="176" r="26" fill="#f6ecd6" opacity=".9"/><path d="M74,176 L106,176" stroke="#c8643b" stroke-width="6"/></g>', "Меню");
        // часы работы
        g += hot("sign", "hours", '<g transform="translate(280,150)"><rect width="90" height="110" fill="#fffaf0"' + S2 + ' transform="rotate(-3)"/><circle cx="26" cy="34" r="12" fill="' + C.lemon + '"' + S2 + '/><path d="M64,70 C50,70 46,90 60,96 C48,98 40,80 52,72 Z" fill="#7d8fc0"' + S2 + "/></g>", "Часы работы");
        // кухня сзади (раздача)
        g += '<g transform="translate(560,110)"><rect width="380" height="200" fill="#f4f1ea"' + S + '/><rect x="0" y="150" width="380" height="50" fill="' + C.wall2 + '"' + S2 + "/>" +
            '<path d="M60,150 L60,120 C60,96 130,96 130,120 L130,150 Z" fill="#b0b8c0"' + S + '/><path d="M180,150 L180,128 C180,110 240,110 240,128 L240,150 Z" fill="' + C.red + '"' + S + '/><path d="M290,150 L290,134 L350,134 L350,150 Z" fill="#555"' + S + "/>" +
            '<path class="steam" d="M80,90 C70,76 90,66 80,52 M110,90 C100,76 120,66 110,52 M205,104 C195,90 215,80 205,66" fill="none" stroke="#c8ccd2" stroke-width="5" stroke-linecap="round"/>' +
            '<g opacity=".8"><path d="M20,30 L20,70 M14,30 L14,48 M26,30 L26,48" ' + S2 + '/><circle cx="350" cy="50" r="18" fill="none"' + S2 + "/></g></g>";
        // стойка
        g += npcGroup("nikos", person("nikos", 700, 365, 0.95), mk.nikos);
        g += '<rect x="520" y="300" width="460" height="130" fill="' + C.wood2 + '"' + S + '/><rect x="510" y="290" width="480" height="18" fill="' + C.wood + '"' + S + "/>";
        g += '<g transform="translate(860,290)"><ellipse cx="0" cy="-8" rx="30" ry="10" fill="#fff"' + S2 + '/><ellipse cx="-10" cy="-16" rx="9" ry="7" fill="' + C.lemon + '"' + S2 + '/><ellipse cx="8" cy="-17" rx="9" ry="7" fill="' + C.lemon + '"' + S2 + "/></g>";
        // столики
        [[150, 470], [380, 500]].forEach(function (t) {
            g += '<g transform="translate(' + t[0] + "," + t[1] + ')"><path d="M-70,-60 L70,-60 L80,-30 L-80,-30 Z" fill="#fff"' + S + "/>";
            for (var k = 0; k < 7; k++) { g += '<rect x="' + (-70 + k * 20) + '" y="-56" width="10" height="22" fill="' + C.blue2 + '" opacity=".7"/>'; }
            g += '<path d="M-60,-30 L-60,40 M60,-30 L60,40" ' + S + '/><ellipse cx="0" cy="-66" rx="22" ry="7" fill="#fff"' + S2 + "/></g>";
        });
        g += hot("go", "plateia", '<g transform="translate(40,520)"><path d="M0,0 L30,-20 L30,20 Z" fill="#f6ecd6"' + S + "/></g>", "На площадь");
        return g;
    }

    function sceneVivliothiki(st, mk) {
        var g = '<rect width="1000" height="560" fill="#efe1c6"/>';
        g += '<rect y="440" width="1000" height="120" fill="#a8784f"/>';
        var cols = ["#c9473d", "#2f6fa3", "#f4c84a", "#4f8a5b", "#7d5ba6", "#e08a5a", "#5b9bd1", "#8c6a4f"];
        function shelf(x, w) {
            var s = '<rect x="' + x + '" y="40" width="' + w + '" height="400" fill="' + C.wood + '"' + S + "/>";
            for (var r = 0; r < 4; r++) {
                var yy = 60 + r * 95;
                s += '<rect x="' + (x + 10) + '" y="' + yy + '" width="' + (w - 20) + '" height="80" fill="#6e4a2e"/>';
                var bx = x + 14, k = r * 3;
                while (bx < x + w - 24) {
                    var bw = 12 + ((k * 7) % 9), bh = 56 + ((k * 13) % 22);
                    s += '<rect x="' + bx + '" y="' + (yy + 80 - bh) + '" width="' + bw + '" height="' + bh + '" fill="' + cols[k % cols.length] + '"' + S2 + "/>";
                    bx += bw + 2; k++;
                }
            }
            return s;
        }
        g += shelf(20, 230) + shelf(750, 230);
        // окно-арка
        g += '<g transform="translate(400,60)"><path d="M0,240 L0,90 C0,-20 200,-20 200,90 L200,240 Z" fill="#bfe4f2"' + S + '/><path d="M100,0 L100,240 M0,130 L200,130" stroke="#fff" stroke-width="7"/><path d="M0,240 L0,90 C0,-20 200,-20 200,90 L200,240 Z" fill="none"' + S + "/></g>";
        // расписание
        g += hot("sign", "libhours", '<g transform="translate(630,120)"><rect width="96" height="140" fill="#fffaf0"' + S + "/>" +
            [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<rect x="14" y="' + (16 + i * 17) + '" width="' + (i < 5 ? 66 : 20) + '" height="9" fill="' + (i < 5 ? "#9ec3a2" : "#d8c9ad") + '"/>'; }).join("") + "</g>", "Расписание");
        g += npcGroup("eleni", person("eleni", 400, 470, 0.95), mk.eleni);
        // стол
        g += '<g transform="translate(260,470)"><rect x="0" y="-120" width="320" height="22" fill="' + C.wood2 + '"' + S + '/><rect x="16" y="-98" width="22" height="98" fill="' + C.wood + '"' + S + '/><rect x="282" y="-98" width="22" height="98" fill="' + C.wood + '"' + S + "/>" +
            '<path d="M240,-120 L250,-170 L290,-170 L300,-120" fill="#4f8a5b"' + S + '/><path d="M270,-170 L270,-190" ' + S + '/><path d="M246,-120 L246,-112" ' + S + "/>" +
            '<path d="M30,-120 L30,-132 L120,-132 L120,-120 M40,-132 L40,-144 L110,-144 L110,-132" fill="' + C.red + '"' + S2 + "/></g>";
        // футляр скрипки у стола
        g += '<g transform="translate(610,470) rotate(-14)"><path d="M0,0 C-26,0 -30,-40 -16,-56 C-28,-80 -18,-110 0,-112 L6,-150 L14,-150 L18,-112 C36,-110 46,-80 34,-56 C48,-40 44,0 18,0 Z" fill="#5a3b2a"' + S + '/><path d="M2,-20 L16,-20" stroke="' + C.lemon + '" stroke-width="4"/></g>';
        g += hot("go", "plateia", '<g transform="translate(40,520)"><path d="M0,0 L30,-20 L30,20 Z" fill="#f6ecd6"' + S + "/></g>", "На площадь");
        return g;
    }

    function scenePanepistimio(st, mk) {
        var g = skyGrad("skyU", "#a6d8f0", "#fdf1dc") + '<rect width="1000" height="560" fill="url(#skyU)"/>';
        g += cloud(160, 70, 0.9) + cloud(760, 90, 1.1);
        g += '<g transform="translate(150,380)"><path d="M-20,-250 L350,-330 L720,-250 Z" fill="' + C.wall2 + '"' + S + '/><rect x="0" y="-250" width="700" height="250" fill="' + C.wall + '"' + S + "/>" +
            [40, 140, 240, 460, 560, 660].map(function (cx) { return '<rect x="' + (cx - 16) + '" y="-236" width="32" height="226" fill="#fff"' + S2 + '/><rect x="' + (cx - 22) + '" y="-244" width="44" height="12" fill="' + C.wall2 + '"' + S2 + "/>"; }).join("") +
            '<path d="M300,0 L300,-150 C300,-200 400,-200 400,-150 L400,0 Z" fill="' + C.blue + '"' + S + '/><circle cx="350" cy="-290" r="18" fill="#fff"' + S2 + '/><path d="M330,-290 L370,-290 L350,-300 Z" fill="' + INK + '"/></g>';
        g += '<path d="M0,380 L1000,380 L1000,560 L0,560 Z" fill="#e7dcc6"/>';
        for (var s = 0; s < 3; s++) { g += '<rect x="' + (420 - s * 20) + '" y="' + (380 + s * 14) + '" width="' + (160 + s * 40) + '" height="14" fill="#efe6d4"' + S2 + "/>"; }
        g += tree(80, 470, 0.9, false) + tree(930, 470, 0.85, true);
        g += hot("sign", "board", '<g transform="translate(160,280)"><path d="M10,0 L10,180 M150,0 L150,180" stroke="' + C.wood + '" stroke-width="10"/><rect x="0" y="0" width="160" height="120" fill="#c69a6a"' + S + "/>" +
            '<rect x="14" y="12" width="60" height="44" fill="#fff" transform="rotate(-4 44 34)"' + S2 + '/><rect x="84" y="16" width="60" height="40" fill="#fff59a"' + S2 + '/><rect x="30" y="64" width="90" height="44" fill="#e1f0ff"' + S2 + '/><circle cx="44" cy="14" r="4" fill="' + C.red + '"/><circle cx="114" cy="18" r="4" fill="' + C.blue + '"/></g>', "Доска объявлений");
        g += npcGroup("anna", person("anna", 640, 500, 0.92, '<rect x="30" y="-118" width="26" height="36" rx="3" fill="' + C.red + '"' + S2 + ' transform="rotate(10)"/>'), mk.anna);
        g += hot("go", "plateia", '<g transform="translate(40,520)"><path d="M0,0 L30,-20 L30,20 Z" fill="#f6ecd6"' + S + "/></g>", "На площадь");
        return g;
    }

    function sceneParko(st, mk, night) {
        var g = night ? skyGrad("skyN", "#141a36", "#4a3f6b") : skyGrad("skyK", "#a3dbf2", "#f2f7dc");
        g += '<rect width="1000" height="560" fill="url(#' + (night ? "skyN" : "skyK") + ')"/>';
        if (night) {
            for (var i = 0; i < 60; i++) { g += '<circle class="star" cx="' + ((i * 137) % 1000) + '" cy="' + ((i * 71) % 240) + '" r="' + (1 + (i % 3) * 0.6) + '" fill="#fff" style="animation-delay:' + (i % 7) * 0.4 + 's"/>'; }
            g += '<circle cx="820" cy="90" r="34" fill="#fff6d8"/><circle cx="806" cy="82" r="30" fill="#141a36" opacity=".0"/>';
        } else { g += cloud(200, 80, 1) + cloud(700, 60, 0.8) + '<circle cx="880" cy="70" r="36" fill="#fff3c4" class="sun"/>'; }
        g += '<path d="M0,300 C250,260 750,270 1000,300 L1000,560 L0,560 Z" fill="' + (night ? "#2f4a3a" : "#a9d37f") + '"/>';
        g += '<path d="M380,560 C430,450 470,380 520,300 L560,300 C560,380 600,450 700,560 Z" fill="' + (night ? "#5c5a52" : "#ead9b4") + '"/>';
        var t1 = tree(120, 320, 0.9, false) + tree(260, 300, 0.7, false) + tree(820, 320, 0.95, false) + tree(930, 340, 0.7, true) + tree(680, 300, 0.6, false);
        g += night ? '<g opacity=".55">' + t1 + "</g>" : t1;
        // фонтан
        g += '<g transform="translate(540,330)"><ellipse cx="0" cy="0" rx="90" ry="22" fill="' + (night ? "#7d8aa8" : "#dfe9ee") + '"' + S + '/><ellipse cx="0" cy="-4" rx="72" ry="14" fill="' + (night ? "#33507a" : "#8fd0ec") + '"/><path d="M-8,-4 L-8,-40 L8,-40 L8,-4" fill="' + C.stone + '"' + S2 + '/><path class="water" d="M0,-42 C-20,-70 -36,-50 -40,-20 M0,-42 C20,-70 36,-50 40,-20" fill="none" stroke="#bfe6f7" stroke-width="4" stroke-linecap="round"/></g>';
        g += bush(70, 470, 1.1, night ? "#b06a8a" : "#f05a7e") + bush(940, 480, 1, night ? "#b0a14a" : C.lemon);
        g += lamp(340, 480, night) + lamp(760, 480, night);
        g += bench(560, 500, 1.2);
        if (!night) {
            g += hot("sign", "parksign", '<g transform="translate(860,470)"><path d="M0,0 L0,-90" stroke="' + C.wood + '" stroke-width="8"/><rect x="-60" y="-140" width="120" height="60" rx="6" fill="' + C.wood2 + '"' + S + '/><path d="M-44,-120 L40,-120 M-44,-102 L24,-102" stroke="#f6ecd6" stroke-width="4" stroke-dasharray="8 5"/></g>', "Табличка");
            g += npcGroup("giorgos", person("giorgos", 300, 520, 0.9) + dog(400, 522, 0.9), mk.giorgos);
            g += hot("go", "plateia", '<g transform="translate(40,520)"><path d="M0,0 L30,-20 L30,20 Z" fill="#f6ecd6"' + S + "/></g>", "На площадь");
        }
        return g;
    }

    function scene(loc, st, markers) {
        var mk = markers || {};
        var inner = loc === "plateia" ? scenePlateia(st, mk) : loc === "spiti" ? sceneSpiti(st, mk) : loc === "estiatorio" ? sceneEstiatorio(st, mk) :
            loc === "vivliothiki" ? sceneVivliothiki(st, mk) : loc === "panepistimio" ? scenePanepistimio(st, mk) : sceneParko(st, mk, false);
        return svg("0 0 1000 560", inner, "scene scene-" + loc);
    }

    function finaleScene() {
        var g = sceneParko({}, {}, true);
        g += '<g class="fireflies">' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (i) { return '<circle cx="' + (80 + i * 75) + '" cy="' + (330 + (i * 37) % 120) + '" r="3.5" fill="#fff59a" style="animation-delay:' + i * 0.5 + 's"/>'; }).join("") + "</g>";
        var violin = '<g transform="translate(-30,-40) rotate(-150)"><path d="M0,0 C-14,0 -16,-20 -8,-28 C-16,-40 -10,-56 0,-56 C10,-56 16,-40 8,-28 C16,-20 14,0 0,0 Z" fill="#8a4b25"' + S2 + '/><path d="M0,-56 L0,-86" stroke="' + INK + '" stroke-width="4"/></g><path d="M44,-64 L80,-150" stroke="#e9d9b0" stroke-width="3"/>';
        g += '<g class="couple">' + person("eleni", 470, 500, 1, violin) + person("nikos", 640, 500, 1, '<g transform="translate(-44,-74)"><path d="M0,0 L-6,-30 M0,0 L4,-32 M0,0 L10,-26" stroke="' + C.leaf + '" stroke-width="3"/><circle cx="-6" cy="-34" r="7" fill="#f05a7e"/><circle cx="5" cy="-36" r="7" fill="' + C.lemon + '"/><circle cx="11" cy="-28" r="6" fill="#f05a7e"/></g>') + "</g>";
        g += '<g class="notes" fill="#ffe8a8">' + [0, 1, 2, 3].map(function (i) { return '<text x="' + (430 + i * 30) + '" y="300" font-size="30" style="animation-delay:' + i * 0.9 + 's">♪</text>'; }).join("") + "</g>";
        return svg("0 0 1000 560", g, "scene finale-scene");
    }

    function cover() {
        var g = skyGrad("skyC", "#f7b98b", "#fbe7c4") + '<rect width="1000" height="560" fill="url(#skyC)"/>';
        g += '<circle cx="500" cy="330" r="120" fill="#ffe2a8" opacity=".8" class="sun"/>';
        g += '<path d="M0,330 C200,300 800,300 1000,330 L1000,560 L0,560 Z" fill="#3c6f9c"/><path d="M0,345 C300,335 700,335 1000,345" stroke="#9cc6e6" stroke-width="3" fill="none" class="wave"/>';
        g += house(60, 420, 150, 140, { roof: false, flat: true, windows: [[20, -110], [100, -110]], doorX: 60 }) + house(200, 430, 120, 180, { roof: false, flat: true, windows: [[20, -150], [70, -150], [20, -90]], doorX: 44 }) +
            '<path d="M270,250 C270,200 330,200 330,250 Z" fill="' + C.blue + '"' + S + "/>" +
            house(700, 430, 140, 160, { roof: false, flat: true, windows: [[20, -130], [90, -130]], doorX: 56 }) + house(830, 420, 160, 130, { roof: false, flat: true, windows: [[30, -100], [110, -100]], doorX: 66, doorC: C.terra });
        g += '<path d="M0,430 L1000,430 L1000,560 L0,560 Z" fill="#e8d8bd"/>';
        g += '<g transform="translate(860,0)"><path d="M140,-10 C60,40 20,100 -40,150" fill="none" stroke="' + C.wood + '" stroke-width="12" stroke-linecap="round"/>' +
            [[60, 40, -30], [10, 90, 20], [-30, 140, -10], [100, 10, 40]].map(function (l) { return '<path d="M' + l[0] + "," + l[1] + ' c-30,-10 -50,10 -40,30 c30,10 50,-10 40,-30 Z" fill="' + C.leaf + '"' + S2 + ' transform="rotate(' + l[2] + " " + l[0] + " " + l[1] + ')"/>'; }).join("") +
            '<ellipse cx="30" cy="70" rx="22" ry="17" fill="' + C.lemon + '"' + S + '/><ellipse cx="-18" cy="118" rx="20" ry="15" fill="' + C.lemon + '"' + S + "/></g>";
        g += '<g transform="translate(170,440) rotate(-8)"><g class="postcard"><rect x="0" y="0" width="200" height="120" fill="#fffaf0"' + S + '/><rect x="140" y="12" width="44" height="52" fill="' + C.blue2 + '"' + S2 + '/><path d="M150,50 L160,36 L170,46 L178,32" fill="none" stroke="#fff" stroke-width="3"/>' +
            '<path d="M16,30 C40,24 60,36 100,28 M16,52 C46,46 70,58 120,48 M16,74 C30,70 60,80 90,72 M110,96 L184,96" fill="none" stroke="' + C.blue + '" stroke-width="3" stroke-linecap="round"/></g></g>';
        return svg("0 0 1000 560", g, "cover-art").replace('preserveAspectRatio="xMidYMid meet"', 'preserveAspectRatio="xMidYMax slice"');
    }

    // ---------------------------------------------------------------- значки слов 100×100
    function week(idx, mark) {
        var s = '<rect x="8" y="22" width="84" height="62" rx="8" fill="#fffaf0"' + S + '/><rect x="8" y="22" width="84" height="16" rx="6" fill="' + C.red + '"' + S2 + "/>";
        for (var i = 0; i < 7; i++) {
            var x = 13 + i * 11;
            var on = idx === i || (Array.isArray(mark) && mark[i]);
            s += '<rect x="' + x + '" y="46" width="9" height="30" rx="2" fill="' + (on ? (idx === i ? C.blue : C.leaf2) : "#e7dcc6") + '"/>';
            if (Array.isArray(mark) && mark[i]) { s += '<path d="M' + (x + 1) + ",62 L" + (x + 4) + ",66 L" + (x + 8) + ',57" fill="none" stroke="#fff" stroke-width="2"/>'; }
        }
        if (idx != null && idx >= 0) { s += '<path d="M' + (17.5 + idx * 11) + ",90 L" + (13 + idx * 11) + ",96 L" + (22 + idx * 11) + ',96 Z" fill="' + C.blue + '"/>'; }
        return s;
    }
    function clock(h, m, fill) {
        var a = (h % 12 + m / 60) / 12 * Math.PI * 2, b = m / 60 * Math.PI * 2;
        return '<circle cx="50" cy="52" r="34" fill="' + (fill || "#fffaf0") + '"' + S + '/><path d="M50,52 L' + (50 + Math.sin(a) * 18).toFixed(1) + "," + (52 - Math.cos(a) * 18).toFixed(1) + ' M50,52 L' + (50 + Math.sin(b) * 26).toFixed(1) + "," + (52 - Math.cos(b) * 26).toFixed(1) + '" ' + S + "/>";
    }
    function stick(x, y, s, col, skirt) {
        return '<g transform="translate(' + x + "," + y + ") scale(" + s + ')"><circle cx="0" cy="-46" r="10" fill="#f0c3a0"' + S2 + "/>" +
            (skirt ? '<path d="M-12,-34 L-16,-8 L16,-8 L12,-34 Z" fill="' + col + '"' + S2 + '/><path d="M-12,-50 C-16,-36 -14,-30 -16,-26 M12,-50 C16,-36 14,-30 16,-26" stroke="#7a4a2a" stroke-width="5" fill="none" stroke-linecap="round"/>' :
                '<path d="M-11,-34 L-11,-8 L11,-8 L11,-34 Z" fill="' + col + '"' + S2 + "/>") +
            '<path d="M-6,-8 L-6,4 M6,-8 L6,4" ' + S2 + "/></g>";
    }
    function heart(x, y, s, col) { return '<path transform="translate(' + x + "," + y + ") scale(" + s + ')" d="M0,8 C-14,-2 -12,-14 -4,-14 C0,-14 0,-10 0,-8 C0,-10 0,-14 4,-14 C12,-14 14,-2 0,8 Z" fill="' + (col || C.red) + '"' + S2 + "/>"; }
    function sun(x, y, r) {
        var s = '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + C.lemon + '"' + S2 + "/>";
        for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; s += '<path d="M' + (x + Math.cos(a) * (r + 4)).toFixed(1) + "," + (y + Math.sin(a) * (r + 4)).toFixed(1) + " L" + (x + Math.cos(a) * (r + 10)).toFixed(1) + "," + (y + Math.sin(a) * (r + 10)).toFixed(1) + '" ' + S2 + "/>"; }
        return s;
    }

    var ICONS = {
        poli: function () { var s = ""; [[8, 40, 16], [26, 22, 18], [46, 34, 14], [62, 14, 18], [82, 44, 12]].forEach(function (b) { s += '<rect x="' + b[0] + '" y="' + b[1] + '" width="' + b[2] + '" height="' + (88 - b[1]) + '" fill="#9bb3c9"' + S2 + "/>"; for (var y = b[1] + 8; y < 82; y += 10) { s += '<path d="M' + (b[0] + 4) + "," + y + " L" + (b[0] + b[2] - 4) + "," + y + '" stroke="#fff" stroke-width="2.5" stroke-dasharray="3 3"/>'; } }); return s + '<path d="M4,88 L96,88" ' + S + "/>"; },
        geitonia: function () { return '<circle cx="50" cy="54" r="40" fill="#f6efe0" stroke="' + C.terra + '" stroke-width="3" stroke-dasharray="6 5"/>' + house(20, 76, 24, 22, { roofH: 10, door: false, windows: [[7, -16, 10, 10]] }) + house(54, 70, 26, 26, { roofH: 10, roofC: C.blue, door: false, windows: [[8, -18, 10, 10]] }) + tree(42, 88, 0.22, true); },
        diamerisma: function () { var s = '<rect x="22" y="10" width="56" height="80" fill="' + C.wall + '"' + S + "/>"; for (var r = 0; r < 4; r++) { for (var c = 0; c < 3; c++) { var lit = r === 1 && c === 2; s += '<rect x="' + (28 + c * 17) + '" y="' + (16 + r * 18) + '" width="11" height="12" fill="' + (lit ? C.lemon : C.blue2) + '"' + (lit ? S2 : "") + "/>"; } } return s + '<circle cx="75" cy="38" r="16" fill="none" stroke="' + C.red + '" stroke-width="3"/>'; },
        spiti: function () { return house(24, 86, 52, 44, { roofH: 24, windows: [[6, -36, 12, 12]], doorX: 30 }); },
        kouzina: function () { return '<rect x="18" y="50" width="64" height="40" fill="#fff"' + S + '/><circle cx="36" cy="62" r="6" fill="none"' + S2 + '/><circle cx="64" cy="62" r="6" fill="none"' + S2 + '/><rect x="26" y="74" width="48" height="12" fill="#e7dcc6"' + S2 + '/><path d="M28,50 L28,36 C28,26 56,26 56,36 L56,50" fill="' + C.red + '"' + S + '/><path d="M34,22 C30,16 38,12 34,6 M46,22 C42,16 50,12 46,6" fill="none" stroke="' + C.gray + '" stroke-width="2.5" stroke-linecap="round"/>'; },
        fagito: function () { return '<ellipse cx="50" cy="60" rx="40" ry="22" fill="#fff"' + S + '/><ellipse cx="50" cy="58" rx="28" ry="13" fill="#f0e6d4"/><rect x="34" y="46" width="22" height="16" rx="3" fill="' + C.terra2 + '"' + S2 + '/><circle cx="64" cy="54" r="6" fill="' + C.leaf2 + '"' + S2 + '/><circle cx="70" cy="62" r="5" fill="' + C.red + '"' + S2 + "/>"; },
        estiatorio: function () { var s = '<rect x="14" y="36" width="72" height="54" fill="' + C.wall + '"' + S + "/>"; for (var i = 0; i < 4; i++) { s += '<path d="M' + (12 + i * 19) + ",30 L" + (31 + i * 19) + ",30 L" + (31 + i * 19) + ",42 C" + (26 + i * 19) + ",48 " + (17 + i * 19) + ",48 " + (12 + i * 19) + ',42 Z" fill="' + (i % 2 ? "#fff" : C.blue2) + '"' + S2 + "/>"; } return s + '<path d="M34,58 L34,82 M28,58 L28,66 C28,70 40,70 40,66 L40,58 M62,58 C72,58 72,72 64,72 L64,82" fill="none"' + S2 + "/>"; },
        troo: function () { return '<circle cx="44" cy="52" r="32" fill="#f0c3a0"' + S + '/><circle cx="34" cy="44" r="3" fill="' + INK + '"/><circle cx="54" cy="44" r="3" fill="' + INK + '"/><ellipse cx="46" cy="64" rx="10" ry="8" fill="#8a2f2f"' + S2 + '/><path d="M70,74 L90,40 M84,34 L92,48 M88,32 L96,46" ' + S + '/><circle cx="62" cy="70" r="5" fill="' + C.terra2 + '"' + S2 + "/>"; },
        mageirevo: function () { return '<path d="M20,56 L20,80 C20,90 80,90 80,80 L80,56 Z" fill="' + C.red + '"' + S + '/><path d="M14,56 L86,56" ' + S + '/><path d="M60,58 L82,20" stroke="' + C.wood + '" stroke-width="6" stroke-linecap="round"/><path d="M30,44 C24,36 34,30 28,20 M44,44 C38,36 48,30 42,20" fill="none" stroke="' + C.gray + '" stroke-width="3" stroke-linecap="round"/><path d="M30,94 C34,86 40,92 44,86 C48,92 54,86 58,94 C64,88 66,94 70,90" fill="none" stroke="#f08a3a" stroke-width="3"/>'; },
        mikros: function () { return '<rect x="8" y="14" width="72" height="72" fill="none" stroke="' + C.gray + '" stroke-width="2.5" stroke-dasharray="6 5"/>' + house(58, 86, 22, 20, { roofH: 9, door: false }) + '<path d="M18,24 L44,50 M44,50 L44,38 M44,50 L32,50" ' + S2 + "/>"; },
        megalos: function () { return house(14, 90, 70, 58, { roofH: 22, windows: [[8, -46, 14, 14], [48, -46, 14, 14]], doorX: 28 }) + '<path d="M90,30 L90,8 L68,8 M10,30 L10,8 L32,8" fill="none"' + S2 + "/>"; },
        akrivos: function () { return '<path d="M14,40 L46,10 L88,10 L88,52 L58,82 Z" fill="' + C.lemon + '"' + S + '/><circle cx="74" cy="24" r="5" fill="#fff"' + S2 + '/><text x="54" y="58" font-size="26" font-weight="700" text-anchor="middle" fill="' + INK + '" transform="rotate(-45 54 50)">5€</text><g transform="translate(18,74)"><ellipse cx="0" cy="12" rx="12" ry="4" fill="#e3b33a"' + S2 + '/><ellipse cx="0" cy="6" rx="12" ry="4" fill="#e3b33a"' + S2 + '/><ellipse cx="0" cy="0" rx="12" ry="4" fill="#e3b33a"' + S2 + "/></g>"; },
        ftinos: function () { return '<path d="M14,40 L46,10 L88,10 L88,52 L58,82 Z" fill="' + C.leaf2 + '"' + S + '/><circle cx="74" cy="24" r="5" fill="#fff"' + S2 + '/><text x="54" y="58" font-size="26" font-weight="700" text-anchor="middle" fill="' + INK + '" transform="rotate(-45 54 50)">1€</text><ellipse cx="18" cy="82" rx="9" ry="3.5" fill="#e3b33a"' + S2 + "/>"; },
        edo: function () { return '<ellipse cx="50" cy="84" rx="30" ry="8" fill="#e7dcc6"' + S2 + '/><path d="M50,80 C30,52 26,40 26,34 C26,18 38,8 50,8 C62,8 74,18 74,34 C74,40 70,52 50,80 Z" fill="' + C.red + '"' + S + '/><circle cx="50" cy="34" r="9" fill="#fff"' + S2 + "/>"; },
        konta: function () { return house(10, 80, 30, 28, { roofH: 12, door: false }) + house(60, 80, 30, 28, { roofH: 12, roofC: C.blue, door: false }) + '<path d="M42,56 L58,56 M42,56 L47,51 M42,56 L47,61 M58,56 L53,51 M58,56 L53,61" ' + S2 + "/>"; },
        tora: function () { return clock(10, 10) + '<circle cx="50" cy="52" r="42" fill="none" stroke="' + C.red + '" stroke-width="3" class="pulse"/><circle cx="50" cy="52" r="4" fill="' + INK + '"/>'; },
        meta: function () { return '<g transform="translate(-18,0) scale(.7)">' + clock(10, 10) + '</g><path d="M42,40 L62,40" ' + S + '/><path d="M56,32 L64,40 L56,48" fill="none"' + S + '/><g transform="translate(44,20) scale(.55)">' + clock(2, 40, "#fdf3c8") + "</g>"; },
        panepistimio: function () { return '<path d="M8,36 L50,12 L92,36 Z" fill="' + C.wall2 + '"' + S + '/><rect x="12" y="36" width="76" height="48" fill="' + C.wall + '"' + S + '/><path d="M24,40 L24,80 M40,40 L40,80 M60,40 L60,80 M76,40 L76,80" ' + S2 + '/><path d="M8,86 L92,86" ' + S + '/><path d="M38,24 L50,18 L62,24 L50,30 Z" fill="' + INK + '"/>'; },
        vivliothiki: function () { var s = '<rect x="12" y="10" width="76" height="82" fill="' + C.wood + '"' + S + "/>"; var cols = [C.red, C.blue, C.lemon, C.green, C.purple, C.terra2]; for (var r = 0; r < 3; r++) { for (var i = 0; i < 6; i++) { s += '<rect x="' + (18 + i * 11) + '" y="' + (16 + r * 26 + (i % 2) * 3) + '" width="9" height="' + (20 - (i % 2) * 3) + '" fill="' + cols[(i + r) % 6] + '"' + S2 + "/>"; } } return s; },
        mathima: function () { return '<rect x="8" y="14" width="84" height="56" fill="#2f3b36"' + S + '/><text x="50" y="52" font-size="24" text-anchor="middle" fill="#f6ecd6" font-family="Georgia, serif">α β γ</text><path d="M30,70 L22,92 M70,70 L78,92" ' + S + '/><path d="M70,66 L84,66" stroke="#fff" stroke-width="4"/>'; },
        diavasma: function () { return '<path d="M50,30 C36,20 18,20 8,26 L8,80 C18,74 36,74 50,84 C64,74 82,74 92,80 L92,26 C82,20 64,20 50,30 Z" fill="#fffaf0"' + S + '/><path d="M50,30 L50,84 M16,38 C26,34 36,34 44,40 M16,50 C26,46 36,46 44,52 M56,40 C64,34 74,34 84,38 M56,52 C64,46 74,46 84,50" fill="none"' + S2 + "/>"; },
        diavazo: function () { return '<circle cx="50" cy="30" r="20" fill="#f0c3a0"' + S + '/><circle cx="43" cy="34" r="2.6" fill="' + INK + '"/><circle cx="57" cy="34" r="2.6" fill="' + INK + '"/><path d="M50,58 C38,50 22,50 14,54 L14,90 C22,86 38,86 50,94 C62,86 78,86 86,90 L86,54 C78,50 62,50 50,58 Z" fill="' + C.blue2 + '"' + S + '/><path d="M50,58 L50,94" ' + S2 + "/>"; },
        deftera: function () { return week(0); }, triti: function () { return week(1); }, tetarti: function () { return week(2); },
        pempti: function () { return week(3); }, paraskevi: function () { return week(4); }, savvato: function () { return week(5); },
        ora: function () { return '<circle cx="50" cy="52" r="34" fill="#fffaf0"' + S + '/><path d="M50,52 L50,18 A34,34 0 0 1 79.4,35 Z" fill="' + C.lemon + '" opacity=".8"/>' + '<path d="M50,52 L50,24 M50,52 L70,40" ' + S + '/><circle cx="50" cy="52" r="34" fill="none"' + S + "/>"; },
        mera: function () { return '<rect x="6" y="6" width="88" height="88" rx="14" fill="#cfeaf7"/>' + sun(50, 50, 22); },
        mesimeri: function () { return '<rect x="6" y="6" width="88" height="88" rx="14" fill="#bfe4f6"/><path d="M10,70 C30,30 70,30 90,70" fill="none" stroke="' + C.gray + '" stroke-width="2" stroke-dasharray="4 4"/>' + sun(50, 30, 12) + '<rect x="6" y="70" width="88" height="24" rx="6" fill="' + C.leaf2 + '"/><ellipse cx="50" cy="80" rx="18" ry="6" fill="#fff"' + S2 + "/>"; },
        vradi: function () { return '<rect x="6" y="6" width="88" height="88" rx="14" fill="#38407a"/><path d="M60,22 C46,24 40,40 46,52 C52,62 66,64 74,58 C60,58 52,46 56,34 C58,28 60,24 60,22 Z" fill="#fff3c4"/><circle cx="26" cy="26" r="2" fill="#fff"/><circle cx="34" cy="50" r="1.6" fill="#fff"/><circle cx="80" cy="30" r="1.6" fill="#fff"/><rect x="6" y="72" width="88" height="22" rx="6" fill="#d8885a"/>'; },
        ti_mera: function () { return sun(30, 40, 14) + '<path d="M54,70 L66,20" ' + S + '/><text x="78" y="50" font-size="24" text-anchor="middle" font-weight="700" fill="' + INK + '">3×</text><path d="M14,80 L90,80" stroke="' + C.gray + '" stroke-width="3"/><circle cx="28" cy="80" r="4" fill="' + C.blue + '"/><circle cx="50" cy="80" r="4" fill="' + C.blue + '"/><circle cx="72" cy="80" r="4" fill="' + C.blue + '"/>'; },
        parko: function () { return '<rect x="6" y="66" width="88" height="26" rx="8" fill="' + C.leaf2 + '"/>' + tree(30, 78, 0.38, false) + tree(72, 74, 0.32, false) + '<g transform="translate(52,90) scale(.32)">' + bench(0, 0, 1) + "</g>"; },
        volta: function () { return '<path d="M10,86 C30,60 70,70 90,20" fill="none" stroke="' + C.stone + '" stroke-width="16" stroke-linecap="round"/>' + [[18, 76], [32, 66], [48, 64], [62, 54], [74, 40], [84, 28]].map(function (p, i) { return '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="4" ry="6" fill="' + INK + '" transform="rotate(' + (40 + i * 6) + " " + p[0] + " " + p[1] + ')"/>'; }).join(""); },
        mousiki: function () { return '<path d="M34,74 L34,24 L74,14 L74,64" fill="none"' + S + '/><path d="M34,24 L74,14 L74,26 L34,36 Z" fill="' + INK + '"/><ellipse cx="26" cy="74" rx="10" ry="8" fill="' + C.purple + '"' + S + '/><ellipse cx="66" cy="64" rx="10" ry="8" fill="' + C.purple + '"' + S + "/>"; },
        violi: function () { return '<g transform="rotate(-30 50 54)"><path d="M50,90 C34,90 30,72 40,64 C30,56 32,38 44,36 L46,24 L54,24 L56,36 C68,38 70,56 60,64 C70,72 66,90 50,90 Z" fill="#a15a2b"' + S + '/><path d="M47,24 L47,6 L53,6 L53,24" fill="' + INK + '"/><path d="M46,58 C44,62 44,66 46,70 M54,58 C56,62 56,66 54,70" fill="none"' + S2 + '/><path d="M48,40 L48,82 M52,40 L52,82" stroke="#f6ecd6" stroke-width="1.2"/></g>'; },
        akouo: function () { return '<path d="M44,20 C24,20 18,40 22,54 C26,66 34,64 34,76 C34,90 54,92 56,78 C58,68 64,64 64,48 C64,30 56,20 44,20 Z" fill="#f0c3a0"' + S + '/><path d="M34,46 C34,36 50,32 50,46 C50,54 42,54 42,60" fill="none"' + S2 + '/><path d="M74,40 C80,46 80,56 74,62 M82,32 C92,42 92,60 82,70" fill="none"' + S + "/>"; },
        filos: function () { return stick(40, 92, 1.4, C.blue, false) + heart(74, 30, 1.3); },
        fili: function () { return stick(40, 92, 1.4, C.pink, true) + heart(74, 30, 1.3); },
        omorfos: function () { return '<path d="M50,92 L50,52" stroke="' + C.leaf + '" stroke-width="4"/><path d="M50,72 C40,62 30,66 30,72 C40,76 46,76 50,72" fill="' + C.leaf2 + '"' + S2 + "/>" + [0, 1, 2, 3, 4].map(function (i) { var a = i * Math.PI * 2 / 5 - Math.PI / 2; return '<circle cx="' + (50 + Math.cos(a) * 14).toFixed(1) + '" cy="' + (36 + Math.sin(a) * 14).toFixed(1) + '" r="11" fill="' + C.pink + '"' + S2 + "/>"; }).join("") + '<circle cx="50" cy="36" r="8" fill="' + C.lemon + '"' + S2 + '/><path d="M80,16 L80,28 M74,22 L86,22 M18,20 L18,30 M13,25 L23,25" ' + S2 + "/>"; },
        perimeno: function () { return '<g transform="translate(50,96) scale(.38)">' + bench(0, 0, 1) + "</g>" + stick(46, 84, 1.1, C.purple, false) + '<g transform="translate(36,-12) scale(.42)">' + clock(3, 50) + "</g>"; },
        sychna: function () { return week(-1, [1, 1, 0, 1, 1, 1, 0]); },
        kamia_fora: function () { return week(-1, [0, 0, 0, 1, 0, 0, 0]); },
        kathe: function () { return week(-1, [1, 1, 1, 1, 1, 1, 1]) + '<path d="M4,90 L96,90" stroke="' + C.leaf + '" stroke-width="4"/>'; },
        polles_fores: function () { return '<path d="M16,20 L16,80 M28,20 L28,80 M40,20 L40,80 M52,20 L52,80 M8,70 L60,30" ' + S + '/><path d="M70,30 L70,80 M82,30 L82,80" ' + S + '/><text x="78" y="22" font-size="18" text-anchor="middle" fill="' + INK + '">…</text>'; },
        xairetismata: function () { return '<g transform="rotate(-12 50 56)"><path d="M30,92 L30,52 C30,46 38,46 38,52 L38,30 C38,24 46,24 46,30 L46,24 C46,18 54,18 54,24 L54,30 C54,24 62,24 62,30 L62,58 C66,50 76,52 72,62 L62,86 C60,90 56,92 52,92 Z" fill="#f0c3a0"' + S + '/></g><path d="M12,30 C8,40 8,50 12,60 M22,24 C16,38 16,52 22,66" fill="none"' + S2 + "/>"; },
        filia_polla: function () { return '<path d="M20,52 C30,36 44,40 50,46 C56,40 70,36 80,52 C70,66 30,66 20,52 Z" fill="' + C.red + '"' + S + '/><path d="M24,52 C40,56 60,56 76,52" fill="none"' + S2 + "/>" + heart(20, 22, 1) + heart(80, 20, 0.8) + heart(78, 82, 0.9); },
        mou_aresei: function () { return heart(50, 46, 3.2, C.pink) + '<path d="M40,56 L40,46 L46,36 C48,32 52,34 51,38 L50,44 L60,44 C64,44 64,48 62,50 C64,52 63,56 60,56 C62,58 60,62 57,62 L44,62 Z" fill="#f0c3a0"' + S2 + "/>"; },
        pao: function () { return '<circle cx="40" cy="20" r="10" fill="#f0c3a0"' + S2 + '/><path d="M40,30 L36,58 M38,40 L24,50 M38,40 L52,48 M36,58 L24,82 M36,58 L50,80" ' + S + '/><path d="M60,64 L90,64 M82,56 L90,64 L82,72" fill="none"' + S + "/>"; },
    };

    function icon(id) {
        var f = ICONS[id];
        return svg("0 0 100 100", f ? f() : '<text x="50" y="60" text-anchor="middle" font-size="40">?</text>', "icon");
    }

    // ---------------------------------------------------------------- картинки к просьбам
    function questPic(kind) {
        var g = "";
        if (kind === "ad") {
            g = '<rect width="300" height="150" rx="10" fill="#fffaf0"' + S + "/>" + '<g transform="translate(12,26) scale(.95)">' + ICONS.mikros() + "</g>" + '<g transform="translate(105,26) scale(.95)">' + ICONS.ftinos() + "</g>" + '<g transform="translate(196,26) scale(.95)">' + ICONS.konta() + "</g>";
        } else if (kind === "sign") {
            g = '<rect width="300" height="150" rx="10" fill="' + C.lemon + '"' + S + "/>" + '<g transform="translate(12,26) scale(.95)">' + ICONS.mageirevo() + "</g>" + '<g transform="translate(105,26) scale(.95)">' + ICONS.fagito() + "</g>" + '<g transform="translate(196,26) scale(.95)">' + ICONS.troo() + "</g>";
        } else if (kind === "week") {
            g = '<rect width="300" height="150" rx="10" fill="#fffaf0"' + S + "/>";
            for (var i = 0; i < 7; i++) {
                var x = 14 + i * 40;
                g += '<rect x="' + x + '" y="30" width="34" height="90" rx="6" fill="' + (i < 5 ? "#cfe8c4" : "#e7dcc6") + '"' + S2 + "/>";
                if (i < 5) { g += '<g transform="translate(' + (x + 2) + ',52) scale(.3)">' + ICONS.diavasma() + "</g>"; }
                if (i === 5) { g += '<path d="M' + (x + 24) + ',54 C' + (x + 12) + ',54 ' + (x + 8) + ',72 ' + (x + 20) + ',78 C' + (x + 8) + ',80 ' + (x + 2) + ',62 ' + (x + 14) + ',56 Z" fill="#7d8fc0"/><g transform="translate(' + (x + 2) + ',80) scale(.3)">' + ICONS.violi() + "</g>"; }
                if (i === 6) { g += '<path d="M' + (x + 8) + ",60 L" + (x + 26) + ",88 M" + (x + 26) + ",60 L" + (x + 8) + ',88" ' + S + "/>"; }
            }
            g += '<path d="M20,22 L176,22" stroke="' + C.leaf + '" stroke-width="4"/><circle cx="31" cy="22" r="6" fill="' + C.blue + '"/><circle cx="191" cy="22" r="6" fill="' + C.blue + '"/><circle cx="231" cy="22" r="6" fill="' + C.blue + '"/>';
        } else if (kind === "letter") {
            g = '<rect width="300" height="150" rx="10" fill="#fffaf0"' + S + '/><path d="M14,14 L110,14 L110,80 L14,80 Z" fill="#f2e3c2"' + S2 + '/><path d="M14,14 L62,52 L110,14" fill="none"' + S2 + "/>" +
                '<g transform="translate(130,10) scale(.75)">' + week(0) + '</g><g transform="translate(205,10) scale(.75)">' + ICONS.mathima() + "</g>" +
                '<g transform="translate(130,78) scale(.68)">' + week(1) + '</g><g transform="translate(196,80) scale(.6)">' + ICONS.diavazo() + '</g><g transform="translate(250,80) scale(.6)">' + ICONS.vivliothiki() + "</g>";
        } else if (kind === "freq") {
            g = '<rect width="300" height="150" rx="10" fill="#fffaf0"' + S + "/>";
            [["giorgos", [1, 1, 1, 1, 1, 1, 1]], ["takis", [1, 1, 0, 1, 1, 0, 1]], ["anna", [0, 0, 0, 1, 0, 0, 0]]].forEach(function (row, r) {
                var y = 14 + r * 44;
                g += '<g transform="translate(14,' + (y + 38) + ') scale(.2)">' + person(row[0], 0, 0, 1) + "</g>";
                for (var d = 0; d < 7; d++) { g += '<rect x="' + (70 + d * 31) + '" y="' + (y + 6) + '" width="26" height="26" rx="5" fill="' + (row[1][d] ? C.leaf2 : "#ece2d0") + '"' + S2 + "/>"; }
            });
        } else if (kind === "meet") {
            g = '<rect width="300" height="150" rx="10" fill="#2b3160"' + S + '/><circle cx="250" cy="34" r="16" fill="#fff3c4"/>' + '<g transform="translate(150,140) scale(.9)">' + bench(0, 0, 1) + "</g>" + '<g transform="translate(110,30) scale(.7)">' + ICONS.violi() + "</g>" + '<g transform="translate(20,30) scale(.7)">' + ICONS.parko() + "</g>" + '<g transform="translate(200,62) scale(.55)">' + ICONS.vradi() + "</g>";
        }
        return svg("0 0 300 150", g, "qpic");
    }

    return { scene: scene, icon: icon, portrait: portrait, questPic: questPic, cover: cover, finaleScene: finaleScene, person: person, svg: svg };
})();
