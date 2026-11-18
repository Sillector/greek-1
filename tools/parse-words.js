// Разбор пула слов в заготовку раздела "words" квеста.
// Запуск: node tools/parse-words.js <файл.txt> [--out quests/<slug>/words.json]   (или через stdin)
// Понимает два формата (можно вперемешку):
//   1) как вставляет ученик:  «η πόλη» / пустая строка / «город» / пустая строка / …  (греческая строка, затем русская)
//   2) «слово — перевод», «слово - перевод», «слово<Tab>перевод», «слово: перевод»
// Выдаёт { words: { id: { gr, ru, alt, pos, gender? } }, order: [...] } — дальше id, alt и picto правятся руками/скилом.
"use strict";
var fs = require("fs");

var args = process.argv.slice(2);
var outIdx = args.indexOf("--out");
var out = outIdx >= 0 ? args[outIdx + 1] : null;
var file = args.filter(function (a, i) { return a !== "--out" && i !== outIdx + 1; })[0];
var text = file ? fs.readFileSync(file, "utf8") : fs.readFileSync(0, "utf8");

var GR = /[Ͱ-Ͽἀ-῿]/;
var TR = { α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o" };
function translit(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ου/g, "ou").replace(/αι/g, "ai").replace(/ει|οι/g, "i").replace(/μπ/g, "b").replace(/ντ/g, "d").replace(/γκ/g, "g").split("").map(function (c) { return TR[c] != null ? TR[c] : /[a-z0-9]/.test(c) ? c : "_"; }).join("")
        .replace(/_+/g, "_").replace(/^_|_$/g, "");
}
var DAYS = /^(τη|την|το)\s+(Δευτέρα|Τρίτη|Τετάρτη|Πέμπτη|Παρασκευή|Σάββατο|Κυριακή)$/i;

var pairs = [];
var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    var m = /^(.+?)\s*(?:—|–|\t|:|\s-\s)\s*(.+)$/.exec(l);
    if (m && GR.test(m[1]) && !GR.test(m[2])) { pairs.push([m[1].trim(), m[2].trim()]); continue; }
    if (GR.test(l) && i + 1 < lines.length && !GR.test(lines[i + 1])) { pairs.push([l, lines[i + 1]]); i++; continue; }
    console.error("пропущено (не понял): " + l);
}

var words = {}, order = [];
pairs.forEach(function (p) {
    var gr = p[0].replace(/\s+/g, " "), ruAll = p[1];
    var variants = ruAll.split(/\s*[\/,;]\s*/).map(function (s) { return s.replace(/[!.?]+$/, "").trim(); }).filter(Boolean);
    var o = { gr: gr, ru: ruAll.replace(/\s+/g, " "), alt: [] };
    variants.forEach(function (v) { if (v.toLowerCase() !== o.ru.toLowerCase() && o.alt.indexOf(v) < 0) { o.alt.push(v); } });
    var art = /^(ο|η|το|οι|τα)\s+/.exec(gr);
    if (DAYS.test(gr)) { o.pos = "day"; }
    else if (art) { o.pos = "noun"; o.gender = { "ο": "m", "η": "f", "το": "n", "οι": "pl", "τα": "pl" }[art[1]]; }
    else if (/,\s*-/.test(gr)) { o.pos = "adj"; }
    else if (/[ωώ]$/.test(gr) || /^μου αρέσει/.test(gr)) { o.pos = "verb"; }
    else if (/[!]/.test(gr) || /\s/.test(gr)) { o.pos = "phrase"; }
    else { o.pos = "adv"; }
    var base = DAYS.test(gr) ? gr.replace(/^(τη|την|το)\s+/i, "") : gr.replace(/^(ο|η|το|οι|τα)\s+/, "").replace(/,.*$/, "").replace(/[!?.]/g, "");
    var id = translit(base) || "w";
    if (o.pos === "day") { id = "day_" + id; }
    var k = id, n = 2;
    while (words[k]) { k = id + "_" + n++; }
    words[k] = o; order.push(k);
});
var res = JSON.stringify({ words: words, order: order }, null, 1);
if (out) { fs.writeFileSync(out, res); console.error("слов: " + order.length + " → " + out); } else { process.stdout.write(res + "\n"); }
