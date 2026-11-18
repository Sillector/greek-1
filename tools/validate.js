// Проверка квеста до сборки. Запуск: node tools/validate.js <slug> [--json]
// Шаги: (1) форма данных  (2) слова и страницы  (3) тултипы  (4) покрытие ≥3 контекста  (5) ответы
//       (6) прогон до финала и постепенность (слова приходят волнами за просьбами)  (7) утверждения о сцене (claims)  (8) расстановка (жители и таблички не в стенах)
"use strict";
var fs = require("fs");
var path = require("path");
var L = require("./lib/quest.js");

var slug = process.argv[2];
if (!slug) { console.error("использование: node tools/validate.js <slug>"); process.exit(2); }
var q = L.loadQuest(slug);
var errors = [], warns = [], info = [];
function err(step, m) { errors.push("(" + step + ") " + m); }
function warn(step, m) { warns.push("(" + step + ") " + m); }
function ok(step, m) { info.push("(" + step + ") " + m); }

// ---------------------------------------------------------------- (1) форма
var REQ = ["meta", "intro", "words", "pages", "gloss", "world", "npcs", "signs", "quests", "mystery", "finale", "claims"];
REQ.forEach(function (k) { if (q[k] == null) { err(1, "нет раздела «" + k + "»"); } });
if (errors.length) { report(); }
["slug", "saveKey", "title", "titleGr", "titleRu", "cover", "mysteryBtn"].forEach(function (k) { if (!q.meta[k]) { err(1, "meta." + k + " пусто"); } });
if (q.meta.slug !== slug) { err(1, "meta.slug «" + q.meta.slug + "» ≠ папке «" + slug + "»"); }
var zoneIds = {}, ZB = {};
q.world.zones.forEach(function (z) {
    if (zoneIds[z.id]) { err(1, "зона " + z.id + " дважды"); } zoneIds[z.id] = 1; ZB[z.id] = z;
    if (!z.name) { err(1, "у зоны " + z.id + " нет name"); }
    if (z.kind === "interior") { if (!z.size || z.size.length !== 2) { err(1, "интерьер " + z.id + ": size [w,d]"); } }
    else if (!z.radius && !z.rect) { err(1, "открытая зона " + z.id + ": нужен radius или rect"); }
    if (z.lock && z.kind !== "interior" && (!z.border || z.border.type === "none")) { err(1, "зона " + z.id + " заперта, но без ограды с калиткой (border) — замок некуда повесить"); }
});
if (!zoneIds[q.world.start]) { err(1, "world.start «" + q.world.start + "» — нет такой зоны"); }
var cat = L.catalog().models, SZ = L.sizes();
var usedModels = {};
JSON.stringify(q, function (k, v) { if (typeof v === "string" && /^[a-z]+\/[A-Za-z0-9_\-.]+$/.test(v) && (k === "m" || k === "model" || k === "hold" || k === "gateModel" || k === "heroModel" || /^\d+$/.test(k))) { if (cat[v]) { usedModels[v] = 1; } else if (k !== "0" || v.indexOf("/") > 0) { if (k === "m" || k === "model" || k === "hold") { err(1, "нет модели в каталоге: " + v); } } } return v; });
// интерьеры должны иметь дверь в здании
q.world.zones.forEach(function (z) {
    if (z.kind !== "interior") { return; }
    var found = false;
    q.world.zones.forEach(function (o) { (function walk(list) { (list || []).forEach(function (it) { if (it.door && it.door.to === z.id) { found = true; } if (it.on) { walk(it.on); } }); })(o.props); });
    if (!found) { err(1, "в интерьер " + z.id + " не ведёт ни одна дверь (prop с door.to)"); }
});
Object.keys(q.npcs).forEach(function (id) {
    var n = q.npcs[id];
    if (!zoneIds[n.zone]) { err(1, "житель " + id + ": нет зоны " + n.zone); }
    if (!n.gender || !/^[fm]$/.test(n.gender)) { err(1, "житель " + id + ": gender f|m"); }
    if (!n.lines || !n.lines.length) { err(1, "житель " + id + ": нет реплик"); }
    if (!n.at) { err(1, "житель " + id + ": нет at"); }
    if (n.model && !cat[n.model]) { err(1, "житель " + id + ": нет модели " + n.model); }
});
Object.keys(q.signs).forEach(function (id) {
    var s = q.signs[id];
    if (!s.place || !zoneIds[s.place.zone]) { err(1, "табличка " + id + ": нет place.zone"); return; }
    if (s.place.mount === "facade") {
        var ok2 = false;
        q.world.zones.forEach(function (o) { (o.props || []).forEach(function (it) { (it.deco || []).forEach(function (d) { if (d.p === "nameplate" && d.sign === id) { ok2 = true; } }); }); });
        if (!ok2) { err(1, "табличка " + id + " на фасаде, но ни одно здание не несёт deco nameplate с sign «" + id + "»"); }
    } else if (!s.place.at) { err(1, "табличка " + id + ": нет place.at"); }
});
(q.quests || []).forEach(function (qq) {
    if (!q.npcs[qq.npc]) { err(1, "просьба " + qq.id + ": нет жителя " + qq.npc); }
    (qq.needPages || []).forEach(function (p) { if (!q.pages.some(function (x) { return x.id === p; })) { err(1, "просьба " + qq.id + ": нет страницы " + p); } });
});
// предметы, лавки, поручения «купи»
var ITEMS = q.items || {};
Object.keys(ITEMS).forEach(function (id) {
    var it = ITEMS[id];
    if (!it.gr) { err(1, "предмет " + id + ": нет gr"); }
    if (!it.picto || !L.pictoPath(slug, it.picto)) { err(1, "предмет " + id + ": нет пиктограммы «" + it.picto + "»"); }
    if (it.word && !q.words[it.word]) { err(1, "предмет " + id + ": word «" + it.word + "» — нет такого слова"); }
});
var sellers = {}, sources = {};
Object.keys(q.npcs).forEach(function (id) {
    (q.npcs[id].shop || []).forEach(function (s) {
        if (!ITEMS[s.item]) { err(1, "лавка " + id + ": нет предмета " + s.item); }
        if (!(s.price > 0)) { err(1, "лавка " + id + ": у " + s.item + " нет цены"); }
        (sellers[s.item] = sellers[s.item] || []).push(id);
    });
    (q.npcs[id].buys || []).forEach(function (s) { if (!ITEMS[s.item]) { err(1, "скупка " + id + ": нет предмета " + s.item); } });
});
var KINDS = { errand: 1, deliver: 1, trade: 1 };
q.quests.forEach(function (qq) {
    [qq.give, qq.reward].forEach(function (g) { if (g && g.item) { (sources[g.item] = sources[g.item] || []).push(qq.id); } });
});
q.quests.forEach(function (qq) {
    if (qq.kind && !KINDS[qq.kind] && qq.kind !== "gaps") { err(1, "просьба " + qq.id + ": неизвестный kind " + qq.kind); }
    if (KINDS[qq.kind]) {
        var w = qq.want || (qq.give && qq.give.item ? { item: qq.give.item } : null);
        if (!w) { err(1, qq.kind + " " + qq.id + ": нужно want {item, n}"); return; }
        if (!ITEMS[w.item]) { err(1, qq.kind + " " + qq.id + ": нет предмета " + w.item); }
        [qq.give, qq.reward].forEach(function (g) { if (g && g.item && !ITEMS[g.item]) { err(1, qq.kind + " " + qq.id + ": несуществующий предмет " + g.item); } });
        if (qq.to && !q.npcs[qq.to]) { err(1, qq.kind + " " + qq.id + ": нет жителя " + qq.to); }
        if (qq.kind === "errand" && !(qq.give && qq.give.money)) { warn(1, "поручение «купи» " + qq.id + ": денег не дают (give.money) — купить хватит, только если остались прошлые"); }
        if (qq.kind === "deliver") {
            if (!(qq.give && qq.give.item)) { err(1, "доставка " + qq.id + ": житель должен дать предмет (give.item)"); }
            if (!qq.to || qq.to === qq.npc) { err(1, "доставка " + qq.id + ": to — другой житель (B ≠ A)"); }
        }
        if (qq.kind === "trade" && !qq.reward) { err(1, "обмен " + qq.id + ": что дают взамен? (reward)"); }
        var own = qq.give && qq.give.item === w.item;
        var otherSrc = (sources[w.item] || []).filter(function (id) { return id !== qq.id; });
        if (!own && !sellers[w.item] && !otherSrc.length) { err(1, qq.kind + " " + qq.id + ": " + w.item + " неоткуда взять — никто не продаёт и ни одно поручение не даёт"); }
        if (qq.kind === "errand" && sellers[w.item] && !own) {
            var cheapest = Math.min.apply(null, sellers[w.item].map(function (n) { return q.npcs[n].shop.filter(function (s) { return s.item === w.item; })[0].price; }));
            if (((qq.give && qq.give.money) || 0) < cheapest * (w.n || 1)) { warn(1, "поручение " + qq.id + ": денег дают " + ((qq.give && qq.give.money) || 0) + " €, а купить стоит " + cheapest * (w.n || 1) + " €"); }
        }
    } else if (!qq.parts) { err(1, "просьба " + qq.id + ": нет parts (или kind: errand/deliver/trade)"); }
});
q.world.zones.forEach(function (z) { if (z.lock && z.lock.quests) { z.lock.quests.forEach(function (x) { if (!q.quests.some(function (qq) { return qq.id === x; })) { err(1, "зона " + z.id + " ждёт несуществующую просьбу " + x); } }); } });
if (!q.mystery.lines || !q.mystery.ru || q.mystery.lines.length !== q.mystery.ru.length) { err(1, "mystery: lines и ru должны быть одной длины"); }
if (!q.finale.zone || !zoneIds[q.finale.zone]) { err(1, "finale.zone не задана или нет такой зоны"); }
var finaleQuest = q.quests.filter(function (x) { return x.finale; });
if (q.finale.trigger !== "mystery" && finaleQuest.length !== 1) { err(1, "финал: нужна ровно одна просьба с finale:true или finale.trigger = \"mystery\""); }
ok(1, "зон " + q.world.zones.length + ", жителей " + Object.keys(q.npcs).length + ", табличек " + Object.keys(q.signs).length + ", просьб " + q.quests.length + ", моделей " + Object.keys(usedModels).length);

// ---------------------------------------------------------------- (2) слова и страницы
var E = L.engine(q);
var W = q.words, wordIds = Object.keys(W);
var inPage = {};
q.pages.forEach(function (p) {
    if (p.words.length < 3 || p.words.length > 5) { err(2, "страница " + p.id + ": слов " + p.words.length + " (нужно 3–5)"); }
    p.words.forEach(function (w) { if (!W[w]) { err(2, "страница " + p.id + ": нет слова " + w); } if (inPage[w]) { err(2, "слово " + w + " на двух страницах"); } inPage[w] = p.id; });
});
wordIds.forEach(function (w) {
    if (!inPage[w]) { err(2, "слово " + w + " не лежит ни на одной странице дневника"); }
    if (!/^[a-z0-9_]+$/.test(w)) { err(2, "id слова «" + w + "»: только латиница, цифры, _"); }
    var o = W[w];
    if (!o.gr || !o.ru) { err(2, "слово " + w + ": нужны gr и ru"); }
    var pic = o.picto || w;
    if (!L.pictoPath(slug, pic)) { err(2, "слово " + w + ": нет пиктограммы «" + pic + "» (assets/pictos или quests/" + slug + "/pictos)"); }
});
ok(2, "слов " + wordIds.length + " на " + q.pages.length + " страницах");

// ---------------------------------------------------------------- (3) тултипы: весь греческий — либо целевое слово, либо глоссарий
var T = L.texts(q), miss = {};
T.forEach(function (t) {
    E.parseLine(t.t).forEach(function (seg) { if (seg.w && !W[seg.w]) { err(3, t.src + ": разметка [[" + seg.w + "]] — нет такого слова"); } });
    E.untranslatedTokens(t.t).forEach(function (tk) { (miss[tk] = miss[tk] || []).push(t.src); });
});
(q.intro.paragraphs || []).forEach(function (p, i) { (p.match(/[Ͱ-Ͽἀ-῿]+/g) || []).forEach(function (tk) { if (!E.glossLookup(tk)) { (miss[tk] = miss[tk] || []).push("intro:" + i); } }); });
Object.keys(miss).forEach(function (tk) { err(3, "греческое без перевода: «" + tk + "» в " + miss[tk].slice(0, 3).join(", ")); });
var lemmas = {};
Object.keys(q.gloss).forEach(function (k) { lemmas[q.gloss[k][0]] = 1; });
if (Object.keys(lemmas).length > 70) { warn(3, "простых лемм в глоссарии " + Object.keys(lemmas).length + " — для A1 многовато (норма ≤ 60–70)"); }
ok(3, "весь греческий покрыт: целевых слов " + wordIds.length + ", простых лемм " + Object.keys(lemmas).length);

// ---------------------------------------------------------------- (4) покрытие: каждое слово ≥ 3 разных места, ≥ 2 источника
var ctxs = {};
T.forEach(function (t) {
    if (t.nameOnly) { return; }
    var kind = t.src.split(":")[0] + (t.src.indexOf("npc:") === 0 ? ":" + t.src.split(":")[1] : "");
    E.lineTargets(t.t).forEach(function (w) { var c = ctxs[w] || (ctxs[w] = { lines: {}, kinds: {} }); c.lines[t.src + "|" + t.t] = 1; c.kinds[kind] = 1; });
});
var minL = 99, minK = 99;
wordIds.forEach(function (w) {
    var c = ctxs[w] || { lines: {}, kinds: {} }, nl = Object.keys(c.lines).length, nk = Object.keys(c.kinds).length;
    minL = Math.min(minL, nl); minK = Math.min(minK, nk);
    if (nl < 3) { err(4, "слово " + w + " (" + W[w].gr + "): контекстов " + nl + " (нужно ≥ 3)"); }
    else if (nk < 2) { err(4, "слово " + w + ": все контексты у одного источника — нужно ≥ 2 разных (жители / таблички / просьбы / текст задачи)"); }
});
ok(4, "минимум контекстов на слово: " + minL + ", источников: " + minK);

// ---------------------------------------------------------------- (5) ответы: русские и греческие, позитивные и негативные примеры
var posRu = 0, negRu = 0, posGr = 0, negGr = 0;
wordIds.forEach(function (w) {
    var o = W[w];
    [o.ru].concat(o.alt || []).forEach(function (v) { if (!E.checkRu(w, v)) { err(5, "слово " + w + ": свой вариант «" + v + "» не принимается проверкой"); } else { posRu++; } });
    if (o.ru.length > 6 && !E.checkRu(w, o.ru.slice(0, -2) + o.ru.slice(-1))) { warn(5, "слово " + w + ": одна опечатка в «" + o.ru + "» не прощается"); }
    var p = q.pages.filter(function (pg) { return pg.words.indexOf(w) >= 0; })[0];
    // чужой перевод с той же страницы не должен подходить (иначе перевод загадки неоднозначен)
    (p ? p.words : []).forEach(function (o2) { if (o2 !== w && E.checkRu(w, W[o2].ru)) { warn(5, "перевод слова " + o2 + " («" + W[o2].ru + "») принимается и для " + w); } else if (o2 !== w) { negRu++; } });
});
q.quests.forEach(function (qq) {
    E.questGaps(qq).forEach(function (g) {
        if (!W[g.w]) { err(5, "просьба " + qq.id + ": пропуск со словом " + g.w + " — нет такого слова"); return; }
        if (!g.a || !g.a.length) { err(5, "просьба " + qq.id + ": пропуск без ответа"); return; }
        if (!E.checkGr(g.a, g.a[0])) { err(5, "просьба " + qq.id + ": ответ «" + g.a[0] + "» не принимается"); } else { posGr++; }
        var noAcc = g.a[0].normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (!E.checkGr(g.a, noAcc)) { err(5, "просьба " + qq.id + ": ответ без ударений не принимается"); } else { posGr++; }
        if (E.checkGr(g.a, g.a[0] + "ς")) { err(5, "просьба " + qq.id + ": принимается лишняя буква"); } else { negGr++; }
    });
});
ok(5, "русских примеров: верных " + posRu + ", чужих отвергнуто " + negRu + "; греческих: верных " + posGr + ", неверных отвергнуто " + negGr);

// ---------------------------------------------------------------- (6) прогон: от старта до финала, как игрок, без подглядывания
var st = E.newState(), log = [], steps = 0, wave = 0, wordWave = {}, pageWave = {}, buyMistakes = 0;
function seeAll() {
    var changed = false;
    function see(t) { var r = E.markSeen(st, t); if (r.fresh.length) { changed = true; } }
    q.world.zones.forEach(function (z) {
        if (!E.locUnlocked(st, z.id)) { return; }
        Object.keys(q.signs).forEach(function (id) { if (q.signs[id].place.zone === z.id) { q.signs[id].lines.forEach(see); } });
        Object.keys(q.npcs).forEach(function (id) { if (q.npcs[id].zone === z.id) { E.npcLines(st, id).forEach(function (l) { see(l.t); }); var qq = E.npcQuest(st, id); if (qq) { see(qq.ask); } E.shopList(st, id).forEach(function (s) { see(E.itemName(s.item)); }); } });
    });
    if (!st.intro) { st.intro = true; changed = true; } // текст главной задачи слова не открывает (как в игре)
    wordIds.forEach(function (w) { if (st.seen[w] && wordWave[w] == null) { wordWave[w] = wave; } });
    q.pages.forEach(function (p) { if (pageWave[p.id] == null && E.pageAvailable(st, p)) { pageWave[p.id] = wave; } });
    return changed;
}
for (var guard = 0; guard < 60; guard++) {
    steps++;
    var ch = seeAll();
    q.pages.forEach(function (p) {
        if (!st.sealed[p.id] && E.pageAvailable(st, p)) {
            st.placement[p.id] = {}; p.words.forEach(function (w) { st.placement[p.id][w] = w; });
            if (E.checkPage(st, p).ok) { st.sealed[p.id] = 1; ch = true; log.push("стр. " + p.id); }
        }
    });
    var doneOne = false; // по одной просьбе за шаг: так видно, что открывает каждая
    q.quests.forEach(function (qq) {
        if (!doneOne && E.isErrand(qq) && !st.quests[qq.id]) {
            // купи / отнеси / обменяй: взять, добыть нужное (в т.ч. «купил не то → продал → купил»), отдать
            var eq = E.questById(qq.id);
            if (E.needsTake(eq) && !E.errandTaken(st, eq)) {
                if (!E.questReady(st, eq)) { return; }
                E.takeErrand(st, eq); ch = true;
                if (eq.give && eq.give.item) { E.markSeen(st, E.itemName(eq.give.item)); }
            }
            if (!E.deliverable(st, eq)) { return; }
            var w = E.errandWant(eq);
            // тупик: нужный дальше предмет, которого больше нигде не купить, продать нельзя
            if (w && E.itemCount(st, w.item) > 0 && !E.buyableAnywhere(st, w.item)) {
                Object.keys(q.npcs).forEach(function (m) {
                    var snap = JSON.stringify(st.inv);
                    if (E.sell(st, m, w.item, 1).ok) { err(6, qq.id + ": " + w.item + " нужен для поручения, но его можно продать у " + m + " — тупик"); st.inv = JSON.parse(snap); }
                });
            }
            if (w && !E.wantOk(st, eq)) {
                var need = (w.n || 1) - E.itemCount(st, w.item);
                var m = Object.keys(q.npcs).filter(function (k) { return E.priceAt(st, k, w.item) != null; })[0];
                if (m) {
                    // ошибка игрока: купил не то — продаёт обратно и покупает нужное; деньги не теряются
                    var other = E.shopList(st, m).filter(function (s) { return s.item !== w.item && E.canBuy(st, m, s.item, 1); })[0];
                    if (other) {
                        var before = st.inv.money;
                        E.buy(st, m, other.item, 1);
                        var sr = E.sell(st, m, other.item, 1);
                        if (!sr.ok || st.inv.money !== before) { err(6, qq.id + ": купил не то (" + other.item + " у " + m + ") — продать обратно не вышло, деньги " + before + " → " + st.inv.money); }
                        else { buyMistakes++; }
                    }
                    var br = E.buy(st, m, w.item, need);
                    if (!br.ok) { err(6, qq.id + ": не купить " + w.item + " ×" + need + " у " + m + " (" + br.why + (br.why === "money" ? ": нужно " + br.need + " €, есть " + br.have : "") + ")"); }
                }
            }
            if ((E.npcDelivery(st, E.errandTo(eq)) || {}).id === qq.id && E.deliver(st, eq)) {
                ch = true; doneOne = true; wave += 1; log.push(qq.id); E.markSeen(st, qq.thanks);
                if (eq.reward && eq.reward.item) { E.markSeen(st, E.itemName(eq.reward.item)); }
                wordIds.forEach(function (w2) { if (st.seen[w2] && wordWave[w2] == null) { wordWave[w2] = wave; } });
            }
            return;
        }
        if (!doneOne && !st.quests[qq.id] && E.questReady(st, qq)) {
            var ans = E.questGaps(qq).map(function (g) { return E.decArr(g.a)[0]; });
            if (E.checkQuest(qq, ans).ok) { st.quests[qq.id] = 1; ch = true; doneOne = true; wave += 1; log.push(qq.id); E.markSeen(st, qq.thanks); wordIds.forEach(function (w) { if (st.seen[w] && wordWave[w] == null) { wordWave[w] = wave; } }); }
        }
    });
    if (!st.mystery.solved && E.mysteryOpen(st)) {
        var all = true;
        q.mystery.lines.forEach(function (_, i) {
            var inp = {}; E.mysteryWords(i).forEach(function (w) { inp[w] = W[w].ru; });
            if (E.checkMysteryLine(i, inp).ok) { st.mystery.lines[i] = 1; } else { all = false; }
        });
        if (all && (!q.mystery.question || E.checkMysteryAnswer(+E.dec(q.mystery.question.answer)))) { st.mystery.solved = true; ch = true; log.push("перевод"); }
    }
    if (!ch) { break; }
}
var unseen = wordIds.filter(function (w) { return !st.seen[w]; });
if (unseen.length) { err(6, "слова так и не встретились игроку: " + unseen.join(", ")); }
var unsealed = q.pages.filter(function (p) { return !st.sealed[p.id]; }).map(function (p) { return p.id; });
if (unsealed.length) { err(6, "страницы не открываются: " + unsealed.join(", ")); }
var undone = q.quests.filter(function (x) { return !st.quests[x.id]; }).map(function (x) { return x.id; });
if (undone.length) { err(6, "просьбы недостижимы: " + undone.join(", ") + (undone.some(function (id) { var x = q.quests.filter(function (y) { return y.id === id; })[0]; return x.kind === "errand" && E.errandTaken(st, x); }) ? " (поручение взято, но не выполнить: нет денег / торговец закрыт / нет товара) — в сумке: " + JSON.stringify(st.inv) : "")); }
if (!st.mystery.solved) { err(6, "глобальная задача не решается (mystery.need / ответы / вопрос)"); }
var finaleOk = q.finale.trigger === "mystery" ? st.mystery.solved : finaleQuest.length && st.quests[finaleQuest[0].id];
if (!finaleOk) { err(6, "финал не открывается"); }
q.world.zones.forEach(function (z) { if (!E.locUnlocked(st, z.id)) { err(6, "зона " + z.id + " так и не открылась"); } });
// после финальной просьбы ничего не должно оставаться нерешённым
// постепенность: на старте (открытые зоны, до первой просьбы) — только часть слов; остальное приходит волнами за просьбами
(function () {
    var N = wordIds.length, P = q.pages.length, nq = q.quests.length;
    var byWave = {}; wordIds.forEach(function (w) { var k = wordWave[w]; if (k != null) { byWave[k] = (byWave[k] || 0) + 1; } });
    var w0 = byWave[0] || 0, p0 = q.pages.filter(function (p) { return pageWave[p.id] === 0; }).length;
    var waves = Object.keys(byWave).length;
    var lateHalf = wordIds.filter(function (w) { return wordWave[w] != null && wordWave[w] >= Math.ceil(nq / 2); }).length;
    var maxW0 = Math.ceil(N * 0.35), maxP0 = Math.max(1, Math.ceil(P / 4));
    var dist = Object.keys(byWave).sort(function (a, b) { return a - b; }).map(function (k) { return k + ":" + byWave[k]; }).join(" ");
    if (w0 > maxW0) { err(6, "постепенность: на старте игроку уже встречаются " + w0 + " из " + N + " слов (можно ≤ " + maxW0 + ", 35%) — спрячьте остальные за просьбы: реплики с req, закрытые зоны, таблички в закрытых зонах"); }
    if (p0 > maxP0) { err(6, "постепенность: на старте собирается страниц " + p0 + " из " + P + " (можно ≤ " + maxP0 + ")"); }
    if (waves < Math.min(4, nq + 1)) { err(6, "постепенность: новые слова приходят только " + waves + " волнами — нужно ≥ " + Math.min(4, nq + 1) + " (старт + после просьб)"); }
    if (lateHalf < Math.ceil(N * 0.25)) { err(6, "постепенность: во второй половине игры (после " + Math.ceil(nq / 2) + "-й просьбы) появляется " + lateHalf + " слов — нужно ≥ " + Math.ceil(N * 0.25) + ", иначе конец пустой"); }
    q.quests.forEach(function (qq, i) { /* просьба без новых слов после неё — допустимо для последней */ });
    ok(6, "постепенность: слов по волнам (номер просьбы:новых слов) " + dist + "; на старте слов " + w0 + "/" + N + ", страниц " + p0 + "/" + P);
})();
ok(6, "прогон: " + log.join(" ") + (finaleOk ? " → финал" : "") + (buyMistakes ? " (с ошибкой «купил не то → продал → купил нужное»: " + buyMistakes + ")" : ""));

// ---------------------------------------------------------------- (7) утверждения о сцене
var LA = E.LAYOUT, Wd = q.world;
function zoneRadius(ref) {
    var id = ref.split(":")[1], z = ZB[id];
    if (!z || z.kind === "interior") { return 0; }
    return z.radius || Math.min(z.rect[0], z.rect[1]) / 2;
}
function edgeDist(a, b) {
    var pa = LA.point(Wd, SZ, q.npcs, a), pb = LA.point(Wd, SZ, q.npcs, b);
    if (!pa || !pb) { return null; }
    var d = LA.dist(pa, pb);
    if (a.indexOf("zone:") === 0) { d -= zoneRadius(a); }
    if (b.indexOf("zone:") === 0) { d -= zoneRadius(b); }
    return Math.max(0, d);
}
function priceOf(ref) {
    if (ref.indexOf("prop:") === 0) {
        var p = LA.findProp(Wd, SZ, ref.slice(5));
        if (!p) { return null; }
        if (p.item.value != null) { return p.item.value; }
        var m = /(\d+(?:[.,]\d+)?)/.exec(p.item.text || ""); return m ? parseFloat(m[1].replace(",", ".")) : null;
    }
    if (ref.indexOf("sign:") === 0) {
        var parts = ref.split(":"), s = q.signs[parts[1]], line = s && s.lines[+parts[2]];
        var mm = line && /(\d+(?:[.,]\d+)?)\s*€/.exec(line); return mm ? parseFloat(mm[1].replace(",", ".")) : null;
    }
    return null;
}
function colorName(hex) {
    if (/^[a-z]+$/.test(hex)) { return hex; }
    var n = parseInt(String(hex).replace("#", ""), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (d < 0.12) { return l > 0.8 ? "white" : l < 0.25 ? "black" : "gray"; }
    var h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    if (h < 18 || h >= 335) { return "red"; } if (h < 42) { return "orange"; } if (h < 70) { return "yellow"; } if (h < 165) { return "green"; } if (h < 255) { return "blue"; } if (h < 300) { return "purple"; } return "pink";
}
var claimBySrc = {};
var checked = 0, offscreen = [];
(q.claims || []).forEach(function (c) {
    if (!c.id || !c.type) { err(7, "утверждение без id/type"); return; }
    (c.src || []).forEach(function (s) { (c.words || []).forEach(function (w) { claimBySrc[s + "|" + w] = c.id; }); claimBySrc[s + "|*"] = c.id; });
    var bad = null;
    if (c.type === "size") {
        var v = LA.measure(Wd, SZ, c.subject, c.metric), vs = (c.vs || []).map(function (r) { return LA.measure(Wd, SZ, r, c.metric); });
        if (v == null || vs.some(function (x) { return x == null; })) { bad = "не измерить " + [c.subject].concat(c.vs).join(", "); }
        else if (c.is === "small" && !vs.every(function (x) { return v <= x * 0.85; })) { bad = c.subject + " = " + v.toFixed(1) + ", а должно быть заметно меньше " + vs.map(function (x) { return x.toFixed(1); }).join(" / "); }
        else if (c.is === "big" && !vs.every(function (x) { return v >= x * 1.15; })) { bad = c.subject + " = " + v.toFixed(1) + ", а должно быть заметно больше " + vs.map(function (x) { return x.toFixed(1); }).join(" / "); }
    } else if (c.type === "bigger") {
        var a = LA.measure(Wd, SZ, c.a, c.metric), b = LA.measure(Wd, SZ, c.b, c.metric);
        if (a == null || b == null) { bad = "не измерить " + c.a + " / " + c.b; }
        else if (a < b * (c.by || 1.3)) { bad = c.a + " = " + a.toFixed(1) + ", " + c.b + " = " + b.toFixed(1) + " — нужно в " + (c.by || 1.3) + " раза больше"; }
    } else if (c.type === "near" || c.type === "far") {
        var d = edgeDist(c.a, c.b);
        if (d == null) { bad = "не найти " + c.a + " / " + c.b; }
        else if (c.type === "near" && d > (c.max || 20)) { bad = c.a + " ↔ " + c.b + ": " + d.toFixed(1) + " м, а «рядом» — не дальше " + (c.max || 20) + " м"; }
        else if (c.type === "far" && d < (c.min || 25)) { bad = c.a + " ↔ " + c.b + ": " + d.toFixed(1) + " м, а «далеко» — не ближе " + (c.min || 25) + " м"; }
    } else if (c.type === "price") {
        var pr = priceOf(c.item);
        if (pr == null) { bad = "нет цены у " + c.item; }
        else if (c.word === "cheap" && pr > c.max) { bad = c.item + ": " + pr + " € — для «дёшево» больше порога " + c.max; }
        else if (c.word === "expensive" && pr < c.min) { bad = c.item + ": " + pr + " € — для «дорого» меньше порога " + c.min; }
    } else if (c.type === "at") {
        var n = q.npcs[c.npc];
        if (!n) { bad = "нет жителя " + c.npc; }
        else if (c.area) {
            var zid = c.area.split(".")[0], ar = ZB[zid] && (ZB[zid].areas || []).filter(function (x) { return x.id === c.area.split(".")[1]; })[0];
            if (!ar || n.zone !== zid) { bad = c.npc + " не в " + c.area; }
            else if (Math.abs(n.at[0] - ar.rect[0]) > ar.rect[2] / 2 || Math.abs(n.at[1] - ar.rect[1]) > ar.rect[3] / 2) { bad = c.npc + " стоит вне " + c.area; }
        } else if (n.zone !== c.zone) { bad = c.npc + " в зоне " + n.zone + ", а не " + c.zone; }
    } else if (c.type === "has") {
        if (c.ref.indexOf("backdrop:") === 0) { if (!((Wd.env || {}).backdrop || []).some(function (b) { return b.kind === c.ref.slice(9); })) { bad = "нет фона " + c.ref; } }
        else if (c.ref.indexOf("prop:") === 0) { var pp = LA.findProp(Wd, SZ, c.ref.slice(5)); if (!pp) { bad = "нет предмета " + c.ref; } else if (c.zone && pp.zone !== c.zone) { bad = c.ref + " стоит в " + pp.zone + ", а не в " + c.zone; } }
        else if (c.ref.indexOf("tag:") === 0) {
            var tag = c.ref.slice(4), any = LA.placed(Wd, SZ).some(function (x) { return (!c.zone || x.zone === c.zone) && x.item.m && cat[x.item.m] && cat[x.item.m].tags.indexOf(tag) >= 0; });
            if (!any) { bad = "в " + (c.zone || "мире") + " нет модели с тегом " + tag; }
        } else { bad = "непонятная ссылка " + c.ref; }
    } else if (c.type === "schedule") {
        var sg = q.signs[c.sign];
        var line = sg && sg.lines.filter(function (l) { return l.indexOf("[[" + c.day) >= 0; })[0];
        if (!line) { bad = "в табличке " + c.sign + " нет дня " + c.day; }
        else { var closed = /—\s*$|κλειστ/i.test(line.replace(/\[\[[^\]]+\]\]/g, "")); if (closed === !!c.open) { bad = c.sign + ": «" + line + "» — " + (closed ? "закрыто" : "открыто") + ", а утверждение говорит обратное"; } }
    } else if (c.type === "color") {
        var cp = LA.findProp(Wd, SZ, (c.ref || "").replace(/^prop:/, ""));
        var hex = cp && (cp.item.color || (cp.item.m && cat[cp.item.m] && cat[cp.item.m].color));
        if (!cp) { bad = "нет предмета " + c.ref; }
        else if (!hex) { bad = c.ref + ": у предмета нет цвета (color у процедурного или color в assets/catalog.overrides.json)"; }
        else { var nm = colorName(hex); if (nm !== c.color) { bad = c.ref + ": цвет " + hex + " — это " + nm + ", а текст говорит " + c.color; } }
    } else if (c.type === "time") {
        if (((Wd.env || {}).time || "day") !== c.value) { bad = "время суток в мире " + ((Wd.env || {}).time || "day") + ", а не " + c.value; }
    } else if (c.type === "offscreen") {
        if (!c.note) { bad = "offscreen без пояснения note"; } else { offscreen.push(c.id); }
    } else { bad = "неизвестный тип " + c.type; }
    if (bad) { err(7, "утверждение " + c.id + ": " + bad); } else if (c.type !== "offscreen") { checked++; }
});
// линтер: каждая фраза со «зрительным» словом (claimKind) должна иметь утверждение
var lint = 0;
T.forEach(function (t) {
    if (t.nameOnly) { return; }
    var line = t.line;
    E.lineTargets(t.t).forEach(function (w) {
        if (!W[w] || !W[w].claimKind) { return; }
        lint++;
        if (!claimBySrc[t.src + "|" + w]) { err(7, t.src + ": «" + E.lemmaSay(w) + "» (" + W[w].claimKind + ") — нет утверждения о сцене (claims) с src «" + t.src + "» и словом " + w + ": «" + t.t + "»"); }
    });
});
ok(7, "утверждений проверено по сцене: " + checked + ", за кадром (с пояснением): " + offscreen.length + ", фраз со зрительными словами: " + lint);

// ---------------------------------------------------------------- (8) расстановка: жители и места чтения не внутри предметов
var placed = LA.placed(Wd, SZ), C = LA.resolve(Wd);
function insideRect(px, pz, it, x, z, sz, pad) {
    var a = -(it.rot || 0), dx = px - x, dz = pz - z, c = Math.cos(a), s = Math.sin(a);
    var lx = dx * c + dz * s, lz = -dx * s + dz * c;
    return Math.abs(lx) < sz[0] / 2 - pad && Math.abs(lz) < sz[2] / 2 - pad;
}
var clash = 0;
Object.keys(q.npcs).forEach(function (id) {
    var n = q.npcs[id], c = C[n.zone], px = c[0] + n.at[0], pz = c[1] + n.at[1];
    placed.forEach(function (p) {
        if (!p.size || p.item.col === false || (p.item.y || 0) > 0.5) { return; }
        if (p.zone !== n.zone && ZB[n.zone].kind === "interior") { return; }
        if (insideRect(px, pz, p.item, p.x, p.z, p.size, 0.05)) { err(8, "житель " + id + " стоит внутри предмета " + (p.item.id || p.item.m || p.item.p)); clash++; }
    });
    var z = ZB[n.zone];
    if (!LA.inZone(z, c, px, pz, z.kind === "interior" ? -0.3 : 0.5)) { err(8, "житель " + id + " за пределами зоны " + n.zone); }
});
placed.forEach(function (p) {
    var it = p.item;
    if (it.m && it.h && p.size && Math.max(p.size[0], p.size[2]) > 6 * it.h && Math.max(p.size[0], p.size[2]) > 1.5) {
        warn(8, "модель " + it.m + (it.id ? " (" + it.id + ")" : "") + " в " + p.zone + ": плоская, а задана высотой h=" + it.h + " — выйдет шириной " + Math.max(p.size[0], p.size[2]).toFixed(1) + " м; задайте w");
    }
});
(q.world.zones || []).forEach(function (z) { (z.props || []).forEach(function (it) { (it.food || []).forEach(function (f) { var s = SZ[f[0]]; if (s && f[3] && Math.max(s[0], s[2]) / s[1] * f[3] > 1.2) { warn(8, "еда " + f[0] + " на столе в " + z.id + " выйдет шириной " + (Math.max(s[0], s[2]) / s[1] * f[3]).toFixed(1) + " м"); } }); }); });
ok(8, "жители и предметы не пересекаются" + (clash ? " — пересечений: " + clash : "") + "; проходимость пешком проверяет tools/shot.mjs (reach)");

report();
function report() {
    var json = process.argv.indexOf("--json") > 0;
    if (json) { console.log(JSON.stringify({ ok: !errors.length, errors: errors, warns: warns, info: info }, null, 1)); }
    else {
        info.forEach(function (m) { console.log("✓ " + m); });
        warns.forEach(function (m) { console.log("! " + m); });
        errors.forEach(function (m) { console.log("✗ " + m); });
        console.log(errors.length ? "\nИТОГ: ошибок " + errors.length + (warns.length ? ", предупреждений " + warns.length : "") : "\nИТОГ: OK" + (warns.length ? " (предупреждений " + warns.length + ")" : ""));
    }
    process.exit(errors.length ? 1 : 0);
}
