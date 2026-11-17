// Чистая логика игры: без DOM, проверяется в node через vm.

var GREEK_RE = /[Ͱ-Ͽἀ-῿]+/g;

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
    var variants = w.alt.concat([w.ru]);
    // перевод может быть дан через запятую или слэш — принимаем любую из частей
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
    for (var i = 0; i < answers.length; i++) {
        if (normGr(answers[i]) === x) { return true; }
    }
    return false;
}

// Разбор строки с разметкой [[id|форма]]
function parseLine(str) {
    var out = [];
    var re = /\[\[([a-z_]+)(?:\|([^\]]+))?\]\]/g;
    var last = 0, m;
    str = String(str);
    while ((m = re.exec(str))) {
        if (m.index > last) { out.push({ t: str.slice(last, m.index) }); }
        out.push({ w: m[1], s: m[2] || WORDS[m[1]].gr });
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
function newState() {
    return {
        v: 1, started: false, intro: false, finale: false,
        loc: "plateia",
        seen: {}, guesses: {}, placement: {}, sealed: {}, quests: {},
        npcLine: {}, heard: [], mistakes: {}, newPages: {}, sound: true, voicePrefs: { f: "", m: "" }, questDrafts: {},
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
    // гарантируем, что хотя бы одно слово не на «своём» месте по алфавиту — не важно; порядок фиксирован
    return arr;
}

// placement[pageId][slotWordId] = placedWordId
function checkPage(state, page) {
    var pl = state.placement[page.id] || {};
    var wrong = [];
    page.words.forEach(function (slot) {
        var placed = pl[slot];
        if (placed !== slot) { wrong.push(slot); } // перевод — черновик игрока, верный вписывается сам
    });
    return { ok: wrong.length === 0, wrong: wrong };
}

function questById(id) {
    for (var i = 0; i < QUESTS.length; i++) { if (QUESTS[i].id === id) { return QUESTS[i]; } }
    return null;
}

function locUnlocked(state, loc) {
    if (loc === "plateia" || loc === "spiti" || loc === "estiatorio") { return true; }
    if (loc === "vivliothiki" || loc === "panepistimio") { return !!state.quests.q1; }
    if (loc === "parko") { return PARK_NEEDS.every(function (q) { return state.quests[q]; }); }
    return false;
}

// Просьба «висит» у жителя: локация открыта, не выполнена, предыдущие условия выполнены
function questOpen(state, q) {
    if (state.quests[q.id]) { return false; }
    if (!locUnlocked(state, NPCS[q.npc].loc)) { return false; }
    var needQ = q.needQuests || [];
    return needQ.every(function (x) { return state.quests[x]; });
}

function questReady(state, q) {
    return questOpen(state, q) && q.needPages.every(function (p) { return state.sealed[p]; });
}

function questGaps(q) {
    return q.parts.filter(function (p) { return typeof p === "object"; });
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

function npcLines(state, npcId) {
    var ok = NPCS[npcId].lines.filter(function (l) {
        if (l.req && !state.quests[l.req]) { return false; }
        if (l.until && state.quests[l.until]) { return false; }
        return true;
    });
    // сюжетные реплики после просьбы — в начале разговора
    return ok.filter(function (l) { return l.story; }).concat(ok.filter(function (l) { return !l.story; }));
}

function markSeen(state, str) {
    var fresh = [];
    lineTargets(str).forEach(function (w) {
        if (!state.seen[w]) { state.seen[w] = 1; fresh.push(w); }
    });
    // новые доступные страницы
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

function allSealed(state) {
    return PAGES.every(function (p) { return state.sealed[p.id]; });
}

function reviewList(state) {
    var ids = Object.keys(state.mistakes).filter(function (k) { return state.mistakes[k] > 0; });
    ids.sort(function (a, b) { return state.mistakes[b] - state.mistakes[a]; });
    return ids;
}
