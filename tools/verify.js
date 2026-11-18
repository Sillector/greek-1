// Проверка игры: node tools/verify.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const problems = [];
const say = (s) => console.log(s);

// (1) синтаксис
const jsFiles = ["js/data.js", "js/logic.js", "js/art.js", "js/sound.js", "js/ui.js", "js/world.js", "js/models.js", "js/lib/three.min.js", "js/lib/GLTFLoader.js", "tools/verify.js", "tools/pack-models.js"].filter((f) => fs.existsSync(path.join(root, f)));
for (const f of jsFiles) {
    try { new vm.Script(fs.readFileSync(path.join(root, f), "utf8"), { filename: f }); }
    catch (e) { problems.push(`синтаксис ${f}: ${e.message}`); }
}
say(`(1) синтаксис: проверено файлов ${jsFiles.length}`);

// контекст с данными и логикой
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "js/data.js"), "utf8") + "\n" + fs.readFileSync(path.join(root, "js/logic.js"), "utf8") +
    "\n;this.G={WORDS,PAGES,GLOSS,NAMES,NPCS,SIGNS,QUESTS,POSTCARD,FINALE,LOCS,parseLine,lineTargets,untranslatedTokens,checkRu,checkGr,newState,checkPage,questReady,questOpen,checkQuest,questGaps,locUnlocked,markSeen,pageAvailable,allSealed,normGr,glossLookup,npcLines,slotOrder};", ctx);
const G = ctx.G;
const W = Object.keys(G.WORDS);

// все тексты игры с источником
const texts = []; // {src, key, t}
G.POSTCARD.forEach((t, i) => texts.push({ src: "открытка", key: "pc" + i, t, ctx: true }));
for (const [id, n] of Object.entries(G.NPCS)) { n.lines.forEach((l, i) => texts.push({ src: "житель " + id, key: id + i, t: l.t, ctx: true })); }
for (const [id, s] of Object.entries(G.SIGNS)) { s.lines.forEach((t, i) => texts.push({ src: "табличка " + id, key: id + i, t, ctx: true })); }
for (const q of G.QUESTS) {
    texts.push({ src: "просьба " + q.id, key: q.id + "ask", t: q.ask });
    texts.push({ src: "просьба " + q.id, key: q.id + "thx", t: q.thanks });
    q.parts.forEach((p, i) => { if (typeof p === "string") { texts.push({ src: "просьба " + q.id, key: q.id + "p" + i, t: p }); } });
}
G.FINALE.forEach((f, i) => texts.push({ src: "финал", key: "f" + i, t: f.t }));
G.LOCS.forEach((l) => texts.push({ src: "локация", key: "loc" + l.id, t: l.name }));

// (2) нет греческого без тултипа; разметка ссылается на существующие слова
const lemmas = new Set();
for (const x of texts) {
    for (const seg of G.parseLine(x.t)) { if (seg.w && !G.WORDS[seg.w]) { problems.push(`${x.src}: неизвестное целевое слово ${seg.w}`); } }
    const miss = G.untranslatedTokens(x.t);
    if (miss.length) { problems.push(`${x.src}: нет перевода для [${miss.join(", ")}] в «${x.t}»`); }
    for (const seg of G.parseLine(x.t)) {
        if (seg.w) { continue; }
        for (const tk of seg.t.match(/[Ͱ-Ͽἀ-῿]+/g) || []) {
            const g = G.glossLookup(tk);
            if (g && G.GLOSS[Object.keys(G.GLOSS).find((k) => G.normGr(k) === G.normGr(tk))]) { lemmas.add(g[0]); }
        }
    }
}
say(`(2) тултипы: всё греческое вне 50 слов покрыто глоссарием; простых лемм в ходу: ${lemmas.size}`);
if (lemmas.size > 65) { problems.push(`слишком много простых лемм: ${lemmas.size}`); }

// (3) использовано слов и контексты
const lines = {}, sources = {};
for (const x of texts.filter((t) => t.ctx)) {
    for (const w of G.lineTargets(x.t)) {
        (lines[w] ||= new Set()).add(x.key);
        (sources[w] ||= new Set()).add(x.src);
    }
}
const used = W.filter((w) => lines[w]);
const weak = W.filter((w) => !lines[w] || lines[w].size < 3 || sources[w].size < 2);
say(`(3) использовано целевых слов: ${used.length} из 50; минимум реплик/табличек на слово: ${Math.min(...W.map((w) => (lines[w] ? lines[w].size : 0)))}, источников: ${Math.min(...W.map((w) => (sources[w] ? sources[w].size : 0)))}`);
if (used.length < 40) { problems.push("использовано меньше 40 слов"); }
for (const w of weak) { problems.push(`слово ${w}: контекстов ${lines[w] ? lines[w].size : 0}, источников ${sources[w] ? sources[w].size : 0} (нужно ≥3 и ≥2)`); }

// страницы покрывают все слова ровно по разу
const onPages = G.PAGES.flatMap((p) => p.words);
if (new Set(onPages).size !== onPages.length) { problems.push("слово на двух страницах"); }
for (const w of W) { if (!onPages.includes(w)) { problems.push(`слово ${w} не на странице`); } }
for (const p of G.PAGES) { if (p.words.length < 3 || p.words.length > 5) { problems.push(`страница ${p.id}: ${p.words.length} слов`); } }

// (4) проверка ответов: позитивные и негативные примеры
const ru = [
    ["poli", "Город", true], ["poli", " город ", true], ["poli", "горд", false], ["ftinos", "дешёвый", true], ["ftinos", "дешовый", true],
    ["ftinos", "дорогой", false], ["akrivos", "дорогой", true], ["konta", "рядом", true], ["konta", "близко, рядом", true],
    ["kamia_fora", "иногда", true], ["kamia_fora", "часто", false], ["xairetismata", "Привет!", true], ["filia_polla", "целую", true],
    ["deftera", "в понедельник", true], ["deftera", "понедельник", true], ["deftera", "во вторник", false], ["mou_aresei", "мне нравится", true],
    ["vivliothiki", "библеотека", true], ["vivliothiki", "книга", false], ["troo", "есть", true], ["edo", "там", false],
    ["mesimeri", "полдень", true], ["vradi", "утро", false], ["violi", "скрипка", true], ["violi", "гитара", false],
];
let okRu = 0;
for (const [w, s, exp] of ru) { if (G.checkRu(w, s) === exp) { okRu++; } else { problems.push(`checkRu(${w}, «${s}») ожидалось ${exp}`); } }
const gr = [
    [["μικρό"], "μικρο", true], [["μικρό"], "ΜΙΚΡΌ", true], [["μικρό"], "μικρός", false], [["καμιά φορά"], "καμια  φορα", true],
    [["τρως"], "τρωσ", true], [["τρως"], "τρως", true], [["πάρκο"], "παρκ", false], [["περιμένει"], "περιμενει", true], [["Σάββατο"], "σαββατο", true],
];
let okGr = 0;
for (const [a, s, exp] of gr) { if (G.checkGr(a, s) === exp) { okGr++; } else { problems.push(`checkGr(${a}, «${s}») ожидалось ${exp}`); } }
say(`(4) проверка ответов: русских примеров ${okRu}/${ru.length}, греческих ${okGr}/${gr.length}`);
for (const w of W) { if (!G.WORDS[w].alt.length) { problems.push(`у ${w} нет вариантов перевода`); } }
for (const q of G.QUESTS) { for (const g of G.questGaps(q)) { if (!g.a || !g.a.length || !G.WORDS[g.w]) { problems.push(`${q.id}: пропуск без ответа`); } } }

// (5) прогон: правильные ответы закрывают все страницы и просьбы, финал открывается
const st = G.newState();
const show = (t) => G.markSeen(st, t);
G.POSTCARD.forEach(show);
const order = [];
let guard = 0;
while (guard++ < 200) {
    // все доступные реплики и таблички открытых локаций
    for (const [id, n] of Object.entries(G.NPCS)) { if (G.locUnlocked(st, n.loc)) { G.npcLines(st, id).forEach((l) => show(l.t)); } }
    for (const s of Object.values(G.SIGNS)) { if (G.locUnlocked(st, s.loc)) { s.lines.forEach(show); } }
    // доступные страницы — сначала неверно, потом верно
    for (const p of G.PAGES) {
        if (st.sealed[p.id] || !G.pageAvailable(st, p)) { continue; }
        st.placement[p.id] = {};
        const order2 = G.slotOrder(p);
        order2.forEach((slot, i) => { st.placement[p.id][slot] = order2[(i + 1) % order2.length]; st.guesses[slot] = G.WORDS[slot].alt[0]; });
        if (G.checkPage(st, p).ok) { problems.push(`страница ${p.id} принята с перепутанными словами`); }
        order2.forEach((slot) => { st.placement[p.id][slot] = slot; });
        st.guesses[order2[0]] = "абракадабра";
        if (!G.checkPage(st, p).ok) { problems.push(`страница ${p.id} не принята при верном сопоставлении и неверной догадке`); }
        st.placement[p.id][order2[0]] = null;
        if (G.checkPage(st, p).ok) { problems.push(`страница ${p.id} принята с пустой картинкой`); }
        st.placement[p.id][order2[0]] = order2[0];
        if (!G.checkPage(st, p).ok) { problems.push(`страница ${p.id} не принята при верных ответах`); }
        st.sealed[p.id] = 1;
        order.push(p.id);
    }
    // готовые просьбы
    let did = false;
    for (const q of G.QUESTS) {
        if (!G.questReady(st, q)) { continue; }
        const gaps = G.questGaps(q);
        if (G.checkQuest(q, gaps.map(() => "λάθος")).ok) { problems.push(`${q.id} принят с неверными ответами`); }
        if (gaps.length > 1 && G.checkQuest(q, gaps.map((g, i) => (i ? g.a[0] : "λάθος"))).ok) { problems.push(`${q.id} принят с одной ошибкой`); }
        if (!G.checkQuest(q, gaps.map((g) => g.a[0])).ok) { problems.push(`${q.id} не принят при верных ответах`); }
        // пропуски — только по закреплённым словам
        for (const g of gaps) { if (!q.needPages.includes(G.PAGES.find((p) => p.words.includes(g.w)).id)) { problems.push(`${q.id}: слово ${g.w} не с требуемой страницы`); } }
        st.quests[q.id] = 1; order.push(q.id); did = true;
    }
    if (!did && G.PAGES.every((p) => st.sealed[p.id]) && G.QUESTS.every((q) => st.quests[q.id])) { break; }
    if (!did && !G.PAGES.some((p) => !st.sealed[p.id] && G.pageAvailable(st, p))) {
        if (!G.QUESTS.every((q) => st.quests[q.id])) {
            problems.push(`тупик: страницы ${G.PAGES.filter((p) => !st.sealed[p.id]).map((p) => p.id + "(нет: " + p.words.filter((w) => !st.seen[w]).join(",") + ")").join(" ")}, просьбы ${G.QUESTS.filter((q) => !st.quests[q.id]).map((q) => q.id).join(" ")}`);
        }
        break;
    }
}
const finaleOpen = G.allSealed(st) && G.QUESTS.every((q) => st.quests[q.id]);
say(`(5) прогон: порядок ${order.join(" ")}; финал ${finaleOpen ? "открывается" : "НЕ открывается"}`);
if (!finaleOpen) { problems.push("финал не открывается"); }

// (6) 3D: модели из кода есть в models.js, размер в пределах, у каждого жителя и таблички есть место в квартале
{
    const worldSrc = fs.readFileSync(path.join(root, "js/world.js"), "utf8");
    const mjs = fs.readFileSync(path.join(root, "js/models.js"), "utf8");
    const mctx = { window: {} }; vm.createContext(mctx); vm.runInContext(mjs, mctx);
    const have = new Set(Object.keys(mctx.window.MODELS.glb));
    const refs = new Set((worldSrc.match(/"(chars|sub|com|food|nat|furn)\/[A-Za-z0-9_-]+"/g) || []).map((s) => s.slice(1, -1)));
    // составные имена: "nat/" + цветы, "food/" + блюда на столах, кастрюли
    for (const m of worldSrc.matchAll(/\["(flower_[A-Za-z]+|tree_[A-Za-z]+)"/g)) { refs.add("nat/" + m[1]); }
    for (const m of worldSrc.matchAll(/\[\["([a-z-]+)", /g)) { refs.add("food/" + m[1]); }
    for (const m of worldSrc.matchAll(/\["([a-z-]+)", -?[0-9.]+, -?[0-9.]+(, [0-9.]+)?\]/g)) { refs.add("food/" + m[1]); }
    refs.add("food/pan-stew"); refs.add("food/pot-stew");
    const missing = [...refs].filter((k) => !have.has(k));
    const mb = fs.statSync(path.join(root, "js/models.js")).size / 1048576;
    const npcPlaced = Object.keys(G.NPCS).filter((id) => new RegExp('addNpc\\("' + id + '"').test(worldSrc));
    const signPlaced = Object.keys(G.SIGNS).filter((id) => new RegExp('signPanel\\("' + id + '"').test(worldSrc));
    say(`(6) 3D: моделей в коде ${refs.size}, в models.js ${have.size}, нет: ${missing.length}; models.js ${mb.toFixed(2)} МБ; жителей в квартале ${npcPlaced.length}/${Object.keys(G.NPCS).length}, табличек ${signPlaced.length}/${Object.keys(G.SIGNS).length}`);
    for (const k of missing) { problems.push(`модель ${k} не упакована в models.js`); }
    if (mb > 30) { problems.push(`models.js больше 30 МБ: ${mb.toFixed(1)}`); }
    for (const id of Object.keys(G.NPCS)) { if (!npcPlaced.includes(id)) { problems.push(`житель ${id} не поставлен в 3D`); } }
    for (const id of Object.keys(G.SIGNS)) { if (!signPlaced.includes(id)) { problems.push(`табличка ${id} не повешена в 3D`); } }
}

if (problems.length) {
    console.log("\nПРОБЛЕМЫ (" + problems.length + "):\n" + problems.join("\n"));
    process.exit(1);
}
console.log(`\nOK: 50 слов на ${G.PAGES.length} страницах, ${G.QUESTS.length} просьб с пропусками, ${Object.keys(G.NPCS).length} жителей, ${Object.keys(G.SIGNS).length} табличек`);
