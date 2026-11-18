// Логика движка: без DOM и без three.js — проверяется в node (tools/validate.js) через vm.
// Всё содержимое игры — в window.QUEST (см. docs/content-schema.md). Ниже — короткие имена для удобства.
var Q = (typeof QUEST !== "undefined") ? QUEST : (typeof window !== "undefined" ? window.QUEST : null);
var WORDS = Q.words, PAGES = Q.pages, GLOSS = Q.gloss || {}, NAMES = Q.names || {}, NPCS = Q.npcs, SIGNS = Q.signs || {}, QUESTS = Q.quests || [], ITEMS = Q.items || {};
var ZONES = {};
Q.world.zones.forEach(function (z) { ZONES[z.id] = z; });
var GAME_KEY = Q.meta.saveKey;
var WORD_IDS = Object.keys(WORDS);

var GREEK_RE = /[Ͱ-Ͽἀ-῿]+/g;

// ---------- ответы хранятся в собранной игре обфусцированными ("~" + base64(xor)) ----------
function dec(s) {
    if (typeof s !== "string" || s.charAt(0) !== "~") { return s; }
    var b = typeof atob === "function" ? atob(s.slice(1)) : Buffer.from(s.slice(1), "base64").toString("binary");
    var k = Q.meta.saveKey, out = "";
    for (var i = 0; i < b.length; i++) { out += String.fromCharCode(b.charCodeAt(i) ^ k.charCodeAt(i % k.length)); }
    try { return decodeURIComponent(escape(out)); } catch (e) { return out; }
}
function decArr(a) { return (a || []).map(dec); }

function normGr(s) {
    return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/ς/g, "σ")
        .replace(/[^Ͱ-Ͽἀ-῿ ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normRu(s) {
    return String(s || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/\([^)]*\)/g, " ")
        .replace(/[^a-zа-я\- ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function lev(a, b) {
    if (a === b) { return 0; }
    var m = a.length, n = b.length;
    if (!m) { return n; }
    if (!n) { return m; }
    var prev = [], cur = [];
    for (var j = 0; j <= n; j++) { prev[j] = j; }
    for (var i = 1; i <= m; i++) {
        cur = [i];
        for (var k = 1; k <= n; k++) {
            cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[n];
}

// Русский перевод: регистр, ё/е, пробелы, синонимы, одна опечатка в словах длиннее 5 букв.
function checkRu(wordId, input) {
    var w = WORDS[wordId];
    var x = normRu(input);
    if (!w || !x) { return false; }
    var variants = (w.alt || []).concat([w.ru]);
    var parts = [x].concat(x.split(/\s*[,\/;]\s*|\s+или\s+/).filter(Boolean));
    for (var p = 0; p < parts.length; p++) {
        var y = parts[p].trim();
        for (var v = 0; v < variants.length; v++) {
            var z = normRu(variants[v]);
            if (!z) { continue; }
            if (y === z) { return true; }
            if (z.length > 5 && lev(y, z) <= 1) { return true; }
        }
    }
    return false;
}

// Греческий ответ в пропуске: без ударений, регистра, конечной сигмы.
function checkGr(answers, input) {
    var x = normGr(input);
    if (!x) { return false; }
    answers = decArr(answers);
    for (var i = 0; i < answers.length; i++) {
        if (normGr(answers[i]) === x) { return true; }
    }
    return false;
}

// Словарная форма без «, -ή, -ό» — то, что произносим и показываем на фишке
function lemmaSay(id) { return WORDS[id].gr.replace(/, -.*$/, ""); }

// Разбор строки с разметкой [[id|форма]]
function parseLine(str) {
    var out = [];
    var re = /\[\[([a-z0-9_]+)(?:\|([^\]]+))?\]\]/g;
    var last = 0, m;
    str = String(str);
    while ((m = re.exec(str))) {
        if (m.index > last) { out.push({ t: str.slice(last, m.index) }); }
        out.push({ w: m[1], s: m[2] || lemmaSay(m[1]) });
        last = m.index + m[0].length;
    }
    if (last < str.length) { out.push({ t: str.slice(last) }); }
    return out;
}

function lineTargets(str) {
    return parseLine(str).filter(function (seg) { return seg.w; }).map(function (seg) { return seg.w; });
}

var _GLOSS_N = null;
function glossLookup(token) {
    if (!_GLOSS_N) {
        _GLOSS_N = {};
        Object.keys(GLOSS).forEach(function (k) { _GLOSS_N[normGr(k)] = GLOSS[k]; });
        Object.keys(NAMES).forEach(function (k) { _GLOSS_N[normGr(k)] = [k.charAt(0).toUpperCase() + k.slice(1), NAMES[k]]; });
    }
    return _GLOSS_N[normGr(token)] || null;
}

// Греческие слова вне разметки, у которых нет перевода в глоссарии
function untranslatedTokens(str) {
    var miss = [];
    parseLine(str).forEach(function (seg) {
        if (seg.w) { return; }
        var toks = seg.t.match(GREEK_RE) || [];
        toks.forEach(function (tk) { if (!glossLookup(tk)) { miss.push(tk); } });
    });
    return miss;
}

// ---------- состояние ----------
function startZone() { return Q.world.start || Q.world.zones[0].id; }
function newState() {
    return {
        v: 2, started: false, intro: false, finale: false,
        loc: startZone(),
        seen: {}, guesses: {}, placement: {}, sealed: {}, quests: {},
        npcLine: {}, heard: [], mistakes: {}, newPages: {}, sound: true, voicePrefs: { f: "", m: "" }, questDrafts: {},
        mystery: { lines: {}, inputs: {}, solved: false, answered: false },
        inv: { money: 0, items: {} }, errands: {},
    };
}

function pageOf(wordId) {
    for (var i = 0; i < PAGES.length; i++) {
        if (PAGES[i].words.indexOf(wordId) >= 0) { return PAGES[i]; }
    }
    return null;
}

function pageById(id) {
    for (var i = 0; i < PAGES.length; i++) { if (PAGES[i].id === id) { return PAGES[i]; } }
    return null;
}

function isKnown(state, wordId) {
    var p = pageOf(wordId);
    return !!(p && state.sealed[p.id]);
}

function pageAvailable(state, page) {
    return page.words.every(function (w) { return state.seen[w]; });
}

// Перемешанный, но постоянный порядок картинок на странице
function slotOrder(page) {
    var arr = page.words.slice();
    var seed = 0;
    for (var i = 0; i < page.id.length; i++) { seed = seed * 31 + page.id.charCodeAt(i); }
    for (var k = arr.length - 1; k > 0; k--) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        var j = seed % (k + 1);
        var t = arr[k]; arr[k] = arr[j]; arr[j] = t;
    }
    return arr;
}

// placement[pageId][slotWordId] = placedWordId; засчитывается сопоставление, перевод вписывается сам
function checkPage(state, page) {
    var pl = state.placement[page.id] || {};
    var wrong = [];
    page.words.forEach(function (slot) { if (pl[slot] !== slot) { wrong.push(slot); } });
    return { ok: wrong.length === 0, wrong: wrong };
}

function questById(id) {
    for (var i = 0; i < QUESTS.length; i++) { if (QUESTS[i].id === id) { return QUESTS[i]; } }
    return null;
}

// Условие из данных: { quests:[...], pages:[...], mystery:true } — всё должно быть выполнено
function condMet(state, c) {
    if (!c) { return true; }
    if (c.quests && !c.quests.every(function (q) { return state.quests[q]; })) { return false; }
    if (c.pages && !c.pages.every(function (p) { return state.sealed[p]; })) { return false; }
    if (c.allPages && !allSealed(state)) { return false; }
    if (c.mystery && !(state.mystery && state.mystery.solved)) { return false; }
    return true;
}

function locUnlocked(state, zoneId) {
    var z = ZONES[zoneId];
    if (!z) { return false; }
    return condMet(state, z.lock);
}

// Просьба «висит» у жителя: место открыто, не выполнена, условия выполнены
function questOpen(state, q) {
    if (state.quests[q.id]) { return false; }
    if (isErrand(q) && needsTake(q) && errandTaken(state, q)) { return false; } // поручение уже взято — дальше его ведёт npcDelivery
    if (!locUnlocked(state, NPCS[q.npc].zone)) { return false; }
    return condMet(state, q.after);
}

function questReady(state, q) {
    return questOpen(state, q) && (q.needPages || []).every(function (p) { return state.sealed[p]; });
}

function questGaps(q) {
    return (q.parts || []).filter(function (p) { return typeof p === "object"; });
}

function checkQuest(q, inputs) {
    var gaps = questGaps(q);
    var wrong = [];
    gaps.forEach(function (g, i) { if (!checkGr(g.a, inputs[i] || "")) { wrong.push(i); } });
    return { ok: wrong.length === 0, wrong: wrong };
}

function npcQuest(state, npcId) {
    for (var i = 0; i < QUESTS.length; i++) {
        var q = QUESTS[i];
        if (q.npc === npcId && questOpen(state, q)) { return q; }
    }
    return null;
}

function lineVisible(state, l) {
    if (l.req && !state.quests[l.req]) { return false; }
    if (l.until && state.quests[l.until]) { return false; }
    if (l.reqMystery && !(state.mystery && state.mystery.solved)) { return false; }
    return true;
}

function npcLines(state, npcId) {
    var ok = NPCS[npcId].lines.filter(function (l) { return lineVisible(state, l); });
    // сюжетные реплики после просьбы — в начале разговора
    return ok.filter(function (l) { return l.story; }).concat(ok.filter(function (l) { return !l.story; }));
}

// есть ли у жителя реплики, которые ученик ещё не слышал (ключи state.heard — «кто|текст»)
function npcUnread(state, npcId) {
    if (!locUnlocked(state, NPCS[npcId].zone)) { return false; }
    var fresh = function (t) { return state.heard.indexOf(npcId + "|" + t) < 0; };
    var q = npcQuest(state, npcId);
    if (q && fresh(q.ask)) { return true; }
    return npcLines(state, npcId).some(function (l) { return fresh(l.t); });
}

function markSeen(state, str) {
    var fresh = [];
    lineTargets(str).forEach(function (w) {
        if (!state.seen[w]) { state.seen[w] = 1; fresh.push(w); }
    });
    var newPages = [];
    PAGES.forEach(function (p) {
        if (!state.sealed[p.id] && !state.newPages[p.id] && pageAvailable(state, p) && p.words.some(function (w) { return fresh.indexOf(w) >= 0; })) {
            state.newPages[p.id] = 1;
            newPages.push(p.id);
        }
    });
    return { fresh: fresh, newPages: newPages };
}

function knownCount(state) {
    var n = 0;
    PAGES.forEach(function (p) { if (state.sealed[p.id]) { n += p.words.length; } });
    return n;
}
function totalWords() { var n = 0; PAGES.forEach(function (p) { n += p.words.length; }); return n; }

function allSealed(state) {
    return PAGES.every(function (p) { return state.sealed[p.id]; });
}

function reviewList(state) {
    var ids = Object.keys(state.mistakes).filter(function (k) { return state.mistakes[k] > 0; });
    ids.sort(function (a, b) { return state.mistakes[b] - state.mistakes[a]; });
    return ids;
}

// ---------- инвентарь, лавки, поручения: купи / отнеси / обменяй ----------
// items: { id: { gr: "[[milo|μήλο]]" | "καφές", picto, word? } } — имя предмета (разметка как в репликах)
// npcs.X.shop: [{ item, price, req?, until? }] — торговец продаёт; npcs.X.buys: [{ item, price }] — что берёт обратно
//   (по умолчанию — свои товары по той же цене: игра учебная, без штрафа)
// quests[] с kind:
//   "errand"  — купи: житель даёт деньги (give.money), просит купить want у торговца и принести (to, по умолчанию он же);
//   "deliver" — отнеси: житель A даёт предмет (give.item), его надо отдать жителю to = B (B ≠ A); want по умолчанию = give;
//   "trade"   — обменяй: житель просит want и взамен даёт reward (брать заранее не нужно).
//   reward: { item, n } | { money } — что получаешь, когда отдал (у deliver это и есть обмен у B: отдал X — получил Y).
function isErrand(q) { return !!q && (q.kind === "errand" || q.kind === "deliver" || q.kind === "trade"); }
function needsTake(q) { return q.kind !== "trade"; }
function errandTo(q) { return q.to || q.npc; }
function errandWant(q) { return q.want || (q.give && q.give.item ? { item: q.give.item, n: q.give.n || 1 } : null); }
function inv(state) {
    if (!state.inv) { state.inv = { money: 0, items: {} }; }
    if (!state.inv.items) { state.inv.items = {}; }
    if (!state.errands) { state.errands = {}; }
    return state.inv;
}
function itemCount(state, id) { return inv(state).items[id] || 0; }
function addItem(state, id, n) { var I = inv(state); I.items[id] = (I.items[id] || 0) + (n || 1); }
function removeItem(state, id, n) { var I = inv(state); I.items[id] = Math.max(0, (I.items[id] || 0) - (n || 1)); if (!I.items[id]) { delete I.items[id]; } }
function itemName(id) { var it = ITEMS[id]; return it ? it.gr : id; }
function shopList(state, npcId) {
    var n = NPCS[npcId];
    if (!n || !n.shop || !locUnlocked(state, n.zone)) { return []; }
    return n.shop.filter(function (s) { return lineVisible(state, s); });
}
function buysList(state, npcId) {
    var n = NPCS[npcId];
    if (!n || !locUnlocked(state, n.zone)) { return []; }
    if (n.buys) { return n.buys.filter(function (s) { return lineVisible(state, s); }); }
    return shopList(state, npcId);
}
function isTrader(state, npcId) { return shopList(state, npcId).length > 0 || buysList(state, npcId).length > 0; }
function priceAt(state, npcId, itemId) {
    var l = shopList(state, npcId);
    for (var i = 0; i < l.length; i++) { if (l[i].item === itemId) { return l[i].price; } }
    return null;
}
function sellPrice(state, npcId, itemId) {
    var l = buysList(state, npcId);
    for (var i = 0; i < l.length; i++) { if (l[i].item === itemId) { return l[i].price; } }
    return null;
}
// можно ли где-то купить (у любого торговца открытого места) — тогда продать не страшно: купишь снова
function buyableAnywhere(state, itemId) {
    return Object.keys(NPCS).some(function (k) { return priceAt(state, k, itemId) != null; });
}
// сколько штук нужно для невыполненных поручений и больше нигде не купить — их продать нельзя (без тупиков)
function reserved(state, itemId) {
    if (buyableAnywhere(state, itemId)) { return 0; }
    var n = 0;
    QUESTS.forEach(function (q) {
        if (!isErrand(q) || state.quests[q.id]) { return; }
        var w = errandWant(q);
        if (w && w.item === itemId) { n += w.n || 1; }
    });
    return n;
}
function sellable(state, npcId, itemId) {
    if (sellPrice(state, npcId, itemId) == null) { return 0; }
    return Math.max(0, itemCount(state, itemId) - reserved(state, itemId));
}
function canBuy(state, npcId, itemId, n) { var p = priceAt(state, npcId, itemId); return p != null && inv(state).money >= p * (n || 1); }
function buy(state, npcId, itemId, n) {
    n = n || 1;
    var p = priceAt(state, npcId, itemId), I = inv(state);
    if (p == null) { return { ok: false, why: "none" }; }
    if (I.money < p * n) { return { ok: false, why: "money", need: p * n, have: I.money }; }
    I.money -= p * n; addItem(state, itemId, n);
    return { ok: true, paid: p * n };
}
function sell(state, npcId, itemId, n) {
    n = n || 1;
    var p = sellPrice(state, npcId, itemId);
    if (p == null) { return { ok: false, why: "none" }; }
    if (sellable(state, npcId, itemId) < n) { return { ok: false, why: itemCount(state, itemId) >= n ? "keep" : "have" }; }
    removeItem(state, itemId, n); inv(state).money += p * n;
    return { ok: true, got: p * n };
}
function errandTaken(state, q) { inv(state); return state.errands[q.id] === 1; }
function grant(state, g) {
    if (!g) { return; }
    if (g.money) { inv(state).money += g.money; }
    if (g.item) { addItem(state, g.item, g.n || 1); }
}
function takeErrand(state, q) {
    inv(state);
    if (state.errands[q.id] || state.quests[q.id]) { return false; }
    state.errands[q.id] = 1;
    grant(state, q.give);
    return true;
}
function wantOk(state, q) { var w = errandWant(q); return !w || itemCount(state, w.item) >= (w.n || 1); }
// поручение можно закрыть у этого жителя: взято (или это обмен — брать не надо), место открыто
function deliverable(state, q) {
    if (!isErrand(q) || state.quests[q.id] || !locUnlocked(state, NPCS[errandTo(q)].zone)) { return false; }
    return needsTake(q) ? errandTaken(state, q) : questReady(state, q);
}
function deliver(state, q) {
    if (!deliverable(state, q) || !wantOk(state, q)) { return false; }
    var w = errandWant(q);
    if (w) { removeItem(state, w.item, w.n || 1); }
    grant(state, q.reward);
    state.errands[q.id] = 1;
    state.quests[q.id] = 1;
    return true;
}
function npcDelivery(state, npcId) {
    for (var i = 0; i < QUESTS.length; i++) {
        var q = QUESTS[i];
        if (isErrand(q) && errandTo(q) === npcId && deliverable(state, q)) { return q; }
    }
    return null;
}

// ---------- глобальная задача: текст, который игрок переводит в финале ----------
function mystery() { return Q.mystery; }
function mysteryOpen(state) { return condMet(state, Q.mystery.need || { allPages: true }); }
// слова строки, которые игрок переводит (уникальные, по порядку)
function mysteryWords(lineIdx) {
    var seen = {}, out = [];
    lineTargets(Q.mystery.lines[lineIdx]).forEach(function (w) { if (!seen[w]) { seen[w] = 1; out.push(w); } });
    return out;
}
function checkMysteryLine(lineIdx, inputs) {
    var ws = mysteryWords(lineIdx), wrong = [];
    ws.forEach(function (w) { if (!checkRu(w, inputs[w] || "")) { wrong.push(w); } });
    return { ok: wrong.length === 0, wrong: wrong };
}
function mysteryLinesDone(state) {
    return Q.mystery.lines.every(function (_, i) { return state.mystery.lines[i] || !mysteryWords(i).length; });
}
function mysteryRu(i) { return dec(Q.mystery.ru[i]); }
function checkMysteryAnswer(idx) {
    var q = Q.mystery.question;
    return !q || String(idx) === dec(q.answer);
}
