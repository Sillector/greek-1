// 2D-графика интерфейса: пиктограммы дневника, портреты жителей, картинки просьб.
// Пиктограммы — из библиотеки assets/pictos (+ пиктограммы квеста), их вкладывает сборка в window.PICTOS.
var ART = (function () {
    var INK = "#2b2a33";
    function svg(vb, inner, cls) {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '"' + (cls ? ' class="' + cls + '"' : "") + ' preserveAspectRatio="xMidYMid meet">' + inner + "</svg>";
    }
    var S = ' stroke="' + INK + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
    var S2 = ' stroke="' + INK + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

    // ---------------------------------------------------------------- люди (внешность — QUEST.npcs[id].looks)
    var DEFAULT_LOOK = { skin: "#e8b48f", hair: "#3a2b25", style: "short", top: "#6f9c84", bottom: "#4a4f6b" };
    function looks(id) { var n = QUEST.npcs[id]; return (n && n.looks) || DEFAULT_LOOK; }
    function hair(o) {
        switch (o.style) {
            case "bob":
                return '<path d="M-34,-168 C-38,-212 38,-212 34,-168 L36,-140 C24,-136 26,-160 20,-176 C6,-186 -12,-186 -22,-174 C-26,-160 -24,-138 -36,-140 Z" fill="' + o.hair + '"' + S + "/>";
            case "bun":
                return '<circle cx="0" cy="-212" r="14" fill="' + o.hair + '"' + S + '/><path d="M-31,-166 C-34,-206 34,-206 31,-166 C24,-188 -24,-188 -31,-166 Z" fill="' + o.hair + '"' + S + "/>";
            case "pony":
                return '<path d="M28,-186 C52,-178 54,-140 44,-124 C40,-140 36,-156 26,-168 Z" fill="' + o.hair + '"' + S + '/><path d="M-31,-164 C-36,-208 36,-208 31,-164 C20,-186 -8,-190 -31,-164 Z" fill="' + o.hair + '"' + S + "/>";
            case "long":
                return '<path d="M-34,-168 C-40,-214 40,-214 34,-168 L38,-112 C26,-110 26,-150 22,-176 C6,-186 -12,-186 -22,-174 C-26,-150 -26,-110 -38,-112 Z" fill="' + o.hair + '"' + S + "/>";
            case "chef":
                return '<path d="M-26,-188 L-24,-210 C-44,-214 -40,-244 -18,-238 C-14,-258 14,-258 18,-238 C40,-244 44,-214 24,-210 L26,-188 Z" fill="#fff"' + S + '/><path d="M-26,-188 L26,-188" fill="none"' + S + "/>";
            case "cap":
                return '<path d="M-30,-176 C-30,-212 30,-212 30,-176 Z" fill="' + (o.cap || "#c9473d") + '"' + S + '/><path d="M20,-178 L48,-176 C46,-170 30,-170 18,-172 Z" fill="' + (o.cap || "#c9473d") + '"' + S + "/>";
            case "hat":
                return '<ellipse cx="0" cy="-190" rx="48" ry="9" fill="' + (o.cap || "#c9a24a") + '"' + S + '/><path d="M-26,-190 C-26,-226 26,-226 26,-190 Z" fill="' + (o.cap || "#c9a24a") + '"' + S + "/>";
            case "scarf":
                return '<path d="M-36,-160 C-40,-218 40,-218 36,-160 C30,-150 26,-176 0,-182 C-26,-176 -30,-150 -36,-160 Z" fill="' + (o.cap || "#7d5ba6") + '"' + S + "/>";
            case "bald":
                return "";
            default:
                return '<path d="M-31,-166 C-34,-208 34,-208 31,-166 C22,-186 -22,-186 -31,-166 Z" fill="' + o.hair + '"' + S + "/>";
        }
    }
    function face(o) {
        var f = "";
        f += '<circle cx="-11" cy="-170" r="3.4" fill="' + INK + '"/><circle cx="11" cy="-170" r="3.4" fill="' + INK + '"/>';
        f += '<circle cx="-18" cy="-158" r="5" fill="#f08f86" opacity=".45"/><circle cx="18" cy="-158" r="5" fill="#f08f86" opacity=".45"/>';
        if (o.mous) { f += '<path d="M-14,-152 C-8,-158 -2,-156 0,-152 C2,-156 8,-158 14,-152 C8,-148 2,-150 0,-152 C-2,-150 -8,-148 -14,-152 Z" fill="' + (o.old ? "#d8d6d0" : o.hair) + '"' + S2 + "/>"; }
        else { f += '<path d="M-7,-153 C-3,-148 3,-148 7,-153" fill="none"' + S2 + "/>"; }
        if (o.beard) { f += '<path d="M-24,-160 C-22,-134 22,-134 24,-160 C14,-146 -14,-146 -24,-160 Z" fill="' + (o.old ? "#d8d6d0" : o.hair) + '"' + S2 + "/>"; }
        if (o.glasses) { f += '<circle cx="-11" cy="-170" r="8" fill="none"' + S2 + '/><circle cx="11" cy="-170" r="8" fill="none"' + S2 + '/><path d="M-3,-170 L3,-170" ' + S2 + "/>"; }
        if (o.old) { f += '<path d="M-20,-182 L-6,-180 M6,-180 L20,-182" fill="none" stroke="' + INK + '" stroke-width="1.6" stroke-linecap="round"/>'; }
        return f;
    }
    function person(id, x, y, s, extra) {
        var o = looks(id);
        var g = '<g transform="translate(' + x + "," + y + ") scale(" + s + ')">';
        g += '<ellipse cx="0" cy="2" rx="40" ry="8" fill="#000" opacity=".12"/>';
        if (o.dress) {
            g += '<path d="M-30,-58 L-36,-6 L36,-6 L30,-58 Z" fill="' + o.bottom + '"' + S + "/>";
            g += '<path d="M-14,-6 L-14,0 M14,-6 L14,0" ' + S + "/>";
        } else {
            g += '<path d="M-20,-60 L-18,-2 L-4,-2 L-2,-40 L2,-40 L4,-2 L18,-2 L20,-60 Z" fill="' + o.bottom + '"' + S + "/>";
        }
        g += '<path d="M-34,-130 C-36,-80 -32,-60 -30,-54 L30,-54 C32,-60 36,-80 34,-130 C20,-142 -20,-142 -34,-130 Z" fill="' + o.top + '"' + S + "/>";
        if (o.dots) { g += '<g fill="#fff" opacity=".8"><circle cx="-14" cy="-110" r="3"/><circle cx="10" cy="-96" r="3"/><circle cx="-6" cy="-80" r="3"/><circle cx="16" cy="-120" r="3"/><circle cx="-20" cy="-70" r="3"/><circle cx="18" cy="-74" r="3"/></g>'; }
        if (o.stripes) { g += '<g stroke="#fff" stroke-width="5" opacity=".7"><path d="M-33,-112 L33,-112 M-32,-94 L32,-94 M-31,-76 L31,-76"/></g>'; }
        if (o.apron) { g += '<path d="M-22,-112 L22,-112 L26,-50 L-26,-50 Z" fill="' + (o.apronColor || "#f2efe8") + '"' + S2 + '/><path d="M-10,-90 L10,-90" ' + S2 + "/>"; }
        if (o.phones) { g += '<path d="M-22,-134 C-26,-118 26,-118 22,-134" fill="none" stroke="#3a3a48" stroke-width="5"/><circle cx="-22" cy="-132" r="6" fill="#3a3a48"/><circle cx="22" cy="-132" r="6" fill="#3a3a48"/>'; }
        g += '<path d="M-32,-124 C-50,-104 -50,-82 -42,-66" fill="none" stroke="' + o.top + '" stroke-width="15" stroke-linecap="round"/>';
        g += '<circle cx="-42" cy="-64" r="8" fill="' + o.skin + '"' + S2 + "/>";
        g += '<path d="M32,-124 C50,-104 50,-82 42,-66" fill="none" stroke="' + o.top + '" stroke-width="15" stroke-linecap="round"/>';
        g += '<circle cx="42" cy="-64" r="8" fill="' + o.skin + '"' + S2 + "/>";
        g += '<rect x="-8" y="-146" width="16" height="14" fill="' + o.skin + '"/>';
        g += '<circle cx="0" cy="-172" r="31" fill="' + o.skin + '"' + S + "/>";
        g += hair(o) + face(o);
        if (extra) { g += extra; }
        return g + "</g>";
    }
    function portrait(id) {
        return svg("-70 -250 140 150", '<circle cx="0" cy="-175" r="70" fill="#f3e6c9"/>' + person(id, 0, 0, 1), "portrait");
    }

    // ---------------------------------------------------------------- пиктограммы
    var P = window.PICTOS || {};
    function inner(id) {
        var s = P[id];
        if (!s) { return null; }
        return s.replace(/^\s*<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    }
    function vbOf(id) { var m = /viewBox="([^"]+)"/.exec(P[id] || ""); return m ? m[1] : "0 0 100 100"; }
    function pictoOfWord(wordId) { var w = QUEST.words[wordId]; return (w && w.picto) || wordId; }
    // иконка слова (на странице дневника и в повторении)
    function icon(wordId) {
        var id = pictoOfWord(wordId), body = inner(id);
        return svg(body ? vbOf(id) : "0 0 100 100", body || '<text x="50" y="62" text-anchor="middle" font-size="44" fill="' + INK + '">?</text>', "icon");
    }
    // картинка к просьбе: одна пиктограмма (часто широкая) или ряд пиктограмм
    function questPic(pic) {
        if (!pic) { return ""; }
        if (typeof pic === "string") {
            var b = inner(pic);
            return b ? svg(vbOf(pic), b, "qpic") : "";
        }
        var n = pic.length, w = 100 * n + 20 * (n + 1), g = '<rect width="' + w + '" height="140" rx="10" fill="#fffaf0"' + S + "/>";
        pic.forEach(function (id, i) { var b2 = inner(id) || ""; g += '<svg x="' + (20 + i * 120) + '" y="20" width="100" height="100" viewBox="' + vbOf(id) + '">' + b2 + "</svg>"; });
        return svg("0 0 " + w + " 140", g, "qpic");
    }
    function picto(id) { var b = inner(id); return b ? svg(vbOf(id), b, "icon") : ""; }

    return { icon: icon, portrait: portrait, questPic: questPic, picto: picto, person: person, svg: svg };
})();
