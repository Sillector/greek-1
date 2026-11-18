// Интерфейс игры.
(function () {
    "use strict";
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
    var st = load();
    var askShown = {};          // в этой сессии просьба уже показана
    var remindShown = {};       // напоминание о взятом поручении уже показано
    var selectedChip = null;    // выбранная фишка в дневнике
    var journalPage = null;     // открытая страница дневника
    var journalTab = "pages";
    var activeGap = null;       // поле ввода в окне просьбы
    var currentNpc = null;
    var use3d = false;          // 3D-мир готов
    var bubbleNpc = null;       // над кем висит реплика
    var finaleWho = null;       // кто говорит в финале

    // ---------------------------------------------------------------- сохранение
    function load() {
        try {
            var raw = localStorage.getItem(GAME_KEY);
            if (raw) {
                var s = JSON.parse(raw);
                var base = newState();
                Object.keys(base).forEach(function (k) { if (s[k] === undefined) { s[k] = base[k]; } });
                return s;
            }
        } catch (e) { /* без сохранения */ }
        return newState();
    }
    function save() { try { localStorage.setItem(GAME_KEY, JSON.stringify(st)); } catch (e) { /* молча */ } }

    // ---------------------------------------------------------------- текст с подсказками
    function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

    function wordClass(id) {
        if (isKnown(st, id)) { return "known"; }
        if (st.guesses[id]) { return "guessed"; }
        return "unknown";
    }

    function renderLine(str, opts) {
        opts = opts || {};
        return parseLine(str).map(function (seg) {
            if (seg.w) {
                return '<span class="gw t ' + wordClass(seg.w) + '" data-w="' + seg.w + '" tabindex="0">' + esc(seg.s) + "</span>";
            }
            var out = "", last = 0, m;
            var re = new RegExp(GREEK_RE.source, "g");
            while ((m = re.exec(seg.t))) {
                out += esc(seg.t.slice(last, m.index));
                out += '<span class="gw g" data-g="' + esc(m[0]) + '">' + esc(m[0]) + "</span>";
                last = m.index + m[0].length;
            }
            return out + esc(seg.t.slice(last));
        }).join("");
    }

    function plain(str) { return parseLine(str).map(function (s) { return s.w ? s.s : s.t; }).join(""); }

    function speakBtn(text, who) {
        return '<button class="speak" type="button" data-say="' + esc(plain(text)) + '"' + (who ? ' data-who="' + who + '"' : "") + ' title="Произнести" aria-label="Произнести">' +
            '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8c1.5 1.2 1.5 6.8 0 8M18.5 5.5c3 2.5 3 10.5 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
    }

    // ---------------------------------------------------------------- всплывающая подсказка
    var tip = $("#tip");
    function tipFor(el) {
        if (el.classList.contains("g")) {
            var g = glossLookup(el.dataset.g);
            return g ? "<b>" + esc(g[0]) + "</b> — " + esc(g[1]) : "";
        }
        var id = el.dataset.w, w = WORDS[id];
        if (isKnown(st, id)) { return "<b>" + esc(w.gr) + "</b> — " + esc(w.ru); }
        if (st.guesses[id]) { return '<span class="tip-guess">ваша догадка:</span> «' + esc(st.guesses[id]) + "»"; }
        return '<span class="tip-unknown">незнакомое слово</span><br><small>догадку запишите в дневник</small>';
    }
    function showTip(el) {
        var html = tipFor(el);
        if (!html) { return; }
        tip.innerHTML = html;
        tip.classList.add("on");
        var r = el.getBoundingClientRect();
        var tw = tip.offsetWidth, th = tip.offsetHeight;
        var x = Math.min(window.innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2));
        var y = r.top - th - 10;
        if (y < 6) { y = r.bottom + 10; }
        tip.style.left = x + "px"; tip.style.top = y + "px";
    }
    function hideTip() { tip.classList.remove("on"); }
    document.addEventListener("mouseover", function (e) { var el = e.target.closest && e.target.closest(".gw"); if (el) { showTip(el); } });
    document.addEventListener("mouseout", function (e) { var el = e.target.closest && e.target.closest(".gw"); if (el) { hideTip(); } });
    document.addEventListener("focusin", function (e) { if (e.target.classList && e.target.classList.contains("gw")) { showTip(e.target); } });
    document.addEventListener("focusout", function (e) { if (e.target.classList && e.target.classList.contains("gw")) { hideTip(); } });

    // ---------------------------------------------------------------- догадка прямо у слова
    var popWord = null;
    function openWordPop(el) {
        var id = el.dataset.w, w = WORDS[id], pop = $("#wordpop");
        popWord = id;
        hideTip();
        var pg = pageOf(id);
        var html = '<div class="wp-head"><span class="wp-gr gr">' + esc(el.textContent) + "</span>" + speakBtn(el.textContent) +
            (el.textContent.toLowerCase() !== w.gr.toLowerCase() ? '<span class="wp-lemma">словарная форма: <b class="gr">' + esc(w.gr) + "</b></span>" : "") + "</div>";
        if (isKnown(st, id)) {
            html += '<div class="wp-known">значит: <b>' + esc(w.ru) + "</b></div>";
        } else {
            html += '<label class="wp-label" for="wp-in">Как вы думаете, что это значит?</label>' +
                '<div class="wp-row"><input id="wp-in" type="text" autocomplete="off" spellcheck="false" placeholder="ваша догадка" value="' + esc(st.guesses[id] || "") + '">' +
                '<button type="button" class="btn small primary" id="wp-save">Записать</button></div>' +
                '<div class="wp-note">' + (pg && pageAvailable(st, pg) ? 'Все слова этой группы найдены — <button type="button" class="linkbtn" id="wp-page" data-page="' + pg.id + '">открыть страницу с картинками</button>.' :
                    "Догадка попадёт в дневник. Проверить её можно, когда найдутся все слова группы (" + pg.words.filter(function (x) { return st.seen[x]; }).length + " из " + pg.words.length + ").") + "</div>";
        }
        pop.innerHTML = html;
        pop.classList.add("on");
        SPEECH.say(el.textContent, null);
        var r = el.getBoundingClientRect();
        var pw = pop.offsetWidth, ph = pop.offsetHeight;
        var x = Math.min(window.innerWidth - pw - 10, Math.max(10, r.left + r.width / 2 - pw / 2));
        var y = r.bottom + 10;
        if (y + ph > window.innerHeight - 10) { y = r.top - ph - 10; }
        pop.style.left = x + "px"; pop.style.top = Math.max(10, y) + "px";
        var inp = $("#wp-in");
        if (inp) {
            inp.focus(); inp.select();
            inp.addEventListener("input", function () { st.guesses[id] = inp.value; save(); }); // черновик догадки не теряется
            inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); saveWordPop(); } if (e.key === "Escape") { closeWordPop(); } });
        }
    }
    function saveWordPop() {
        var inp = $("#wp-in");
        if (!inp || !popWord) { return; }
        st.guesses[popWord] = inp.value.trim();
        save();
        SOUND.blip();
        refreshWords();
        closeWordPop();
    }
    function closeWordPop() { var p = $("#wordpop"); if (p) { p.classList.remove("on"); } popWord = null; }
    function refreshWords() {
        $$(".gw.t[data-w]").forEach(function (el) {
            el.classList.remove("known", "guessed", "unknown");
            el.classList.add(wordClass(el.dataset.w));
        });
    }

    // ---------------------------------------------------------------- тосты
    function toast(html, kind) {
        var t = document.createElement("div");
        t.className = "toast " + (kind || "");
        t.innerHTML = html;
        var box = $("#toasts");
        box.appendChild(t);
        while (box.children.length > 3) { box.firstChild.remove(); }
        setTimeout(function () { t.classList.add("out"); }, 3800);
        setTimeout(function () { t.remove(); }, 4400);
    }

    // ---------------------------------------------------------------- шапка
    function renderTop() {
        var seals = PAGES.map(function (p) {
            return '<span class="seal-dot ' + (st.sealed[p.id] ? "on" : pageAvailable(st, p) ? "open" : "") + '" title="' + (st.sealed[p.id] ? "Страница «" + p.title + "» разгадана" : "Страница дневника") + '"></span>';
        }).join("");
        $("#seals").innerHTML = seals;
        $("#count").textContent = knownCount(st) + " / " + totalWords();
        var fresh = Object.keys(st.newPages).filter(function (k) { return !st.sealed[k]; }).length;
        $("#btn-journal .badge").textContent = fresh || "";
        $("#btn-journal").classList.toggle("has-new", fresh > 0);
        $("#btn-sound").classList.toggle("off", !st.sound);
        renderInv();
    }

    // ---------------------------------------------------------------- сумка (инвентарь) слева
    var HAS_INV = Object.keys(ITEMS).length > 0 || QUESTS.some(isErrand) || Object.keys(NPCS).some(function (k) { return NPCS[k].shop; });
    function coinHtml() { return '<span class="coin" aria-hidden="true">€</span>'; }
    function renderInv() {
        var box = $("#inv");
        if (!box) { return; }
        if (!HAS_INV) { box.style.display = "none"; return; }
        var I = inv(st), ids = Object.keys(I.items).filter(function (k) { return I.items[k] > 0; });
        box.innerHTML = '<div class="inv-head">Сумка</div>' +
            '<div class="inv-money" title="Деньги">' + coinHtml() + "<b>" + I.money + "</b> €</div>" +
            (ids.length ? ids.map(function (k) {
                var it = ITEMS[k] || { gr: k };
                return '<div class="inv-item"><span class="inv-pic">' + (it.picto ? ART.picto(it.picto) : "") + '</span><span class="inv-name gr">' + renderLine(it.gr) + '</span><span class="inv-n">×' + I.items[k] + "</span></div>";
            }).join("") : '<div class="inv-empty">пусто</div>');
    }
    function bump(sel) { var el = $(sel); if (!el) { return; } el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
    function itemLabel(id) { var it = ITEMS[id]; return it ? renderLine(it.gr) : esc(id); }

    // ---------------------------------------------------------------- лавка торговца
    var shopNpc = null, shopQty = {};
    function openShop(npcId) {
        hideBubble();
        shopNpc = npcId;
        var list = shopList(st, npcId);
        list.forEach(function (s) { seeText(itemName(s.item)); hear(npcId, itemName(s.item)); });
        save();
        renderShop("");
        openOverlay("#shop");
        SOUND.page();
    }
    function renderShop(msg) {
        var npcId = shopNpc, list = shopList(st, npcId), I = inv(st);
        var rows = list.map(function (s) {
            var n = shopQty[s.item] || 1, ok = canBuy(st, npcId, s.item, n);
            return '<div class="sh-row"><span class="sh-name gr">' + itemLabel(s.item) + speakBtn(plain(itemName(s.item))) + "</span>" +
                '<span class="sh-price">' + s.price + " €</span>" +
                '<span class="sh-qty"><button type="button" class="sh-q" data-item="' + s.item + '" data-d="-1" aria-label="меньше">−</button><b>' + n + '</b><button type="button" class="sh-q" data-item="' + s.item + '" data-d="1" aria-label="больше">+</button></span>' +
                '<button type="button" class="btn small primary sh-buy" data-buy="' + s.item + '"' + (ok ? "" : ' disabled title="Не хватает денег"') + ">Купить</button>" +
                '<span class="sh-have">' + (ok ? "" : "не хватает денег: нужно " + s.price * n + " €") + "</span></div>";
        }).join("");
        // продать: всё из сумки, что этот торговец берёт, — по той же цене
        var sells = buysList(st, npcId).filter(function (s) { return itemCount(st, s.item) > 0; }).map(function (s) {
            var can = sellable(st, npcId, s.item), have = itemCount(st, s.item);
            return '<div class="sh-row sell"><span class="sh-name gr">' + itemLabel(s.item) + speakBtn(plain(itemName(s.item))) + "</span>" +
                '<span class="sh-price">+' + s.price + " €</span>" +
                '<span class="sh-qty"><b>×' + have + "</b></span>" +
                '<button type="button" class="btn small sh-buy" data-sell="' + s.item + '"' + (can ? "" : " disabled") + ">Продать 1</button>" +
                '<span class="sh-have">' + (can ? "" : "это нужно для поручения — оставьте") + "</span></div>";
        }).join("");
        $("#shop-card").innerHTML =
            '<div class="q-top"><div class="q-portrait">' + ART.portrait(npcId) + '</div><div class="q-ask"><div class="q-name">Лавка · ' + esc(NPCS[npcId].name) + "</div>" +
            '<div class="sh-sub">Выберите, что купить. Названия — по-гречески: наведите на слово. Купили не то — продайте обратно, деньги вернутся.</div></div>' +
            '<div class="sh-wallet">' + coinHtml() + "<b>" + I.money + "</b> €</div></div>" +
            '<div class="sh-h">Купить</div><div class="sh-list">' + (rows || '<div class="inv-empty">Сейчас продавать нечего.</div>') + "</div>" +
            (sells ? '<div class="sh-h">Продать из сумки</div><div class="sh-list">' + sells + "</div>" : "") +
            '<div class="q-foot"><span class="q-msg" id="sh-msg">' + (msg || "") + '</span><button type="button" class="btn" data-close="#shop">Готово</button></div>';
    }
    function shopBuy(itemId) {
        var n = shopQty[itemId] || 1, r = buy(st, shopNpc, itemId, n);
        if (!r.ok) {
            SOUND.thud();
            renderShop(r.why === "money" ? "Не хватает денег: нужно " + r.need + " €, а у вас " + r.have + " €." : "Этого здесь нет.");
            return;
        }
        save(); SOUND.blip();
        shopQty[itemId] = 1;
        renderShop('Куплено: <span class="gr">' + itemLabel(itemId) + "</span> ×" + n + " — " + r.paid + " €. Если не то — продайте обратно.");
        renderInv(); bump("#inv");
        if (use3d) { WORLD.setMarkers(markers()); }
    }
    function shopSell(itemId) {
        var r = sell(st, shopNpc, itemId, 1);
        if (!r.ok) { SOUND.thud(); renderShop(r.why === "keep" ? "Это нужно для поручения — оставьте." : "Этого у вас нет."); return; }
        save(); SOUND.click();
        renderShop('Продано: <span class="gr">' + itemLabel(itemId) + "</span> — +" + r.got + " €.");
        renderInv(); bump("#inv");
        if (use3d) { WORLD.setMarkers(markers()); }
    }

    // ---------------------------------------------------------------- поручения «купи и принеси»
    function errandHint(q) {
        var w = errandWant(q), I = inv(st);
        if (q.kind === "trade") { return "Принесите то, о чём просят, — получите взамен."; }
        if (q.kind === "deliver") { return "Отнесите это: " + esc(NPCS[errandTo(q)].ru || NPCS[errandTo(q)].name) + "."; }
        if (w && itemCount(st, w.item) > 0) { return "Нужно больше — столько, сколько просят. Докупите у торговца."; }
        var bought = Object.keys(I.items).filter(function (k) { return I.items[k] > 0; });
        if (bought.length) { return "Кажется, это не то, о чём просят. Купленное можно продать торговцу обратно — деньги вернутся."; }
        return "Деньги — в сумке слева. Купите у торговца то, о чём просят, и принесите.";
    }
    function takeErrandNow(qid) {
        var q = questById(qid);
        if (!q || !questReady(st, q) || !takeErrand(st, q)) { return; }
        var g = q.give || {}, to = errandTo(q);
        if (g.item) { seeText(itemName(g.item)); }
        save(); SOUND.blip();
        renderInv(); bump("#inv");
        toast('<span class="t-ico">👜</span> В сумке: ' + (g.money ? "<b>" + g.money + " €</b>" : "") + (g.money && g.item ? " и " : "") + (g.item ? '<span class="gr">' + itemLabel(g.item) + "</span>" + ((g.n || 1) > 1 ? " ×" + g.n : "") : ""), "good");
        var b = $("#bubble .b-act"); if (b) { b.outerHTML = '<div class="b-hint">' + (to !== q.npc ? "Отнесите это: " + esc(NPCS[to].ru || NPCS[to].name) + "." : errandHint(q)) + "</div>"; }
        if (use3d) { WORLD.setMarkers(markers()); }
    }
    function deliverNow(q) {
        if (!deliver(st, q)) { return false; }
        save(); SOUND.success();
        var w = errandWant(q), rw = q.reward;
        if (w) { toast('<span class="t-ico">👜</span> Отдано: <span class="gr">' + itemLabel(w.item) + "</span>" + ((w.n || 1) > 1 ? " ×" + w.n : ""), "good"); }
        if (rw) { setTimeout(function () { toast('<span class="t-ico">🎁</span> Взамен: ' + (rw.item ? '<span class="gr">' + itemLabel(rw.item) + "</span>" + ((rw.n || 1) > 1 ? " ×" + rw.n : "") : "") + (rw.money ? " <b>" + rw.money + " €</b>" : ""), "good"); bump("#inv"); }, 700); }
        renderInv();
        afterQuest(q);
        return true;
    }


    // ---------------------------------------------------------------- сцена
    function markers() {
        var mk = {};
        Object.keys(NPCS).forEach(function (id) {
            var q = npcQuest(st, id);
            if (q) { mk[id] = questReady(st, q) ? "ready" : "wait"; }
            var d = npcDelivery(st, id);
            if (d && wantOk(st, d)) { mk[id] = "ready"; }
            // непрочитанные реплики: своя метка «…» или красная точка поверх «?» / «!»
            if (npcUnread(st, id)) { mk[id] = mk[id] ? mk[id] + "+new" : "new"; }
        });
        return mk;
    }

    function renderScene() {
        if (use3d) { WORLD.show(st.loc, st, markers()); }
        hideBubble();
        renderPlaces();
        renderTop();
        locTitle(st.loc);
    }

    function renderPlaces() {
        $("#places").innerHTML = Q.world.zones.filter(function (z) { return z.nav !== false; }).map(function (l) {
            var open = locUnlocked(st, l.id);
            return '<button type="button" class="place ' + (l.id === st.loc ? "here " : "") + (open ? "" : "locked") + '" data-go="' + l.id + '">' +
                '<span class="pl-ico">' + (l.picto ? ART.picto(l.picto) : "") + '</span><span class="pl-name">' + (open ? renderLine(l.name) : '<span class="pl-locked">🔒 закрыто</span>') + "</span></button>";
        }).join("");
    }
    function locTitle(id) {
        var z = ZONES[id];
        $("#loc-name").innerHTML = z ? renderLine(z.name) : "";
    }

    function go(loc) {
        if (!locUnlocked(st, loc)) { toast(Q.meta.lockedText || "Туда пока не пройти. Помогите жителям — и путь откроется.", "muted"); SOUND.thud(); return; }
        hideBubble(true);
        st.loc = loc; save();
        SOUND.click();
        if (use3d) { hideBubble(true); WORLD.travel(loc); }
    }

    // ---------------------------------------------------------------- реплики
    // reset: разговор сбрасывается — следующий начнётся с первой реплики
    function hideBubble(reset) {
        var b = $("#bubble");
        if (reset && currentNpc && b.classList.contains("on")) {
            st.npcLine[currentNpc] = 0;
            askShown[currentNpc] = false;
            remindShown[currentNpc] = false;
            save();
        }
        b.classList.remove("on");
        if (use3d && currentNpc) { WORLD.calm(currentNpc); }
        currentNpc = null;
        bubbleNpc = null;
        closeWordPop();
        SPEECH.stop();
    }

    function placeBubble(npcId) {
        if (use3d) { bubbleNpc = npcId; WORLD.talk(npcId); positionBubble(); return; }
        var n = NPCS[npcId];
        var b = $("#bubble");
        var right = n.x > 55;
        b.style.top = "auto";
        b.style.bottom = (100 - n.y + 4) + "%";
        b.style.left = right ? "auto" : Math.max(1, n.x - 4) + "%";
        b.style.right = right ? Math.max(1, 100 - n.x - 4) + "%" : "auto";
        b.classList.toggle("right", right);
    }

    // реплика висит над головой жителя и едет за ним вместе с камерой
    function positionBubble() {
        if (!bubbleNpc) { return; }
        var a = WORLD.anchor(bubbleNpc);
        var b = $("#bubble");
        if (!a || a.behind) { return; }
        var bw = b.offsetWidth, bh = b.offsetHeight;
        var right = a.x > a.w * 0.58;
        var left = right ? a.x - bw + 34 : a.x - 34;
        left = Math.max(8, Math.min(a.w - bw - 8, left));
        var top = Math.max(8, Math.min(a.h - bh - 8, a.y - bh - 16));
        b.style.left = left + "px"; b.style.top = top + "px"; b.style.right = "auto"; b.style.bottom = "auto";
        b.style.setProperty("--tail", Math.max(14, Math.min(bw - 34, a.x - left - 10)) + "px");
        b.classList.toggle("tail-off", a.y - bh - 16 < 8);
    }
    function positionFinale() {
        if (!finaleWho) { return; }
        var fb = $("#f-bubble"), a = WORLD.anchor(finaleWho, 2.0);
        if (!fb || !a) { return; }
        var sr = $("#stage").getBoundingClientRect();
        var bw = fb.offsetWidth, bh = fb.offsetHeight;
        var x = sr.left + a.x, y = sr.top + a.y;
        var left = finaleSide(finaleWho) === "left" ? x - bw + 40 : x - 40;
        left = Math.max(12, Math.min(window.innerWidth - bw - 12, left));
        fb.style.left = left + "px"; fb.style.top = Math.max(76, y - bh - 18) + "px";
        fb.style.setProperty("--tail", Math.max(14, Math.min(bw - 34, x - left - 10)) + "px");
    }

    function seeText(str) {
        var r = markSeen(st, str);
        r.newPages.forEach(function (pid) {
            var p = pageById(pid);
            toast('<span class="t-ico">📖</span> В дневнике новая страница: <b>' + esc(p.title) + "</b>", "page");
            SOUND.page();
        });
        save();
        renderTop();
        return r;
    }

    function hear(who, str) {
        var key = who + "|" + str;
        if (st.heard.indexOf(key) < 0) { st.heard.push(key); }
    }

    function talk(npcId) {
        SOUND.click();
        if (currentNpc && currentNpc !== npcId) { hideBubble(true); }
        currentNpc = npcId;
        var dq = npcDelivery(st, npcId);
        if (dq) {
            if (wantOk(st, dq)) { deliverNow(dq); return; }
            if (!remindShown[npcId]) { remindShown[npcId] = true; showLine(npcId, dq.remind || dq.ask, '<div class="b-hint">' + errandHint(dq) + "</div>"); return; }
        }
        var q = npcQuest(st, npcId);
        if (q && !askShown[npcId]) {
            askShown[npcId] = true;
            showAsk(npcId, q);
            return;
        }
        var lines = npcLines(st, npcId);
        var i = (st.npcLine[npcId] || 0) % lines.length;
        st.npcLine[npcId] = i + 1;
        if (q && st.npcLine[npcId] >= lines.length) { askShown[npcId] = false; }
        showLine(npcId, lines[i].t);
    }

    function showLine(npcId, text, extraHtml) {
        seeText(text);
        hear(npcId, text);
        save();
        if (use3d) { WORLD.setMarkers(markers()); }
        var b = $("#bubble");
        b.innerHTML = '<div class="b-name">' + esc(NPCS[npcId].name) + "</div>" +
            '<div class="b-text gr">' + renderLine(text) + speakBtn(text, npcId) + "</div>" + (extraHtml || "") +
            (isTrader(st, npcId) ? '<button type="button" class="btn small b-shop" data-shop="' + npcId + '">🛒 Купить / продать</button>' : "") +
            '<div class="b-more">нажмите на жителя ещё раз ›</div>';
        placeBubble(npcId);
        b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
        SPEECH.say(plain(text), NPCS[npcId]);
    }

    function showAsk(npcId, q) {
        var ready = questReady(st, q);
        var extra;
        if (isErrand(q) && !needsTake(q)) {
            extra = '<div class="b-hint">' + (ready ? errandHint(q) : "Вы пока не понимаете, о чём просят. Разгадайте слова в дневнике.") + "</div>";
        } else if (ready && isErrand(q)) {
            extra = '<div class="b-act"><button type="button" class="btn small primary" data-errand="' + q.id + '">' + (q.give && q.give.money ? "Взять деньги" : q.give && q.give.item ? "Взять" : "Хорошо") + "</button></div>";
        } else if (ready) {
            extra = '<button type="button" class="btn small primary" data-quest="' + q.id + '">Помочь</button>';
        } else {
            var need = (q.needPages || []).filter(function (p) { return !st.sealed[p]; }).map(pageById);
            var ready2 = need.filter(function (pg) { return pageAvailable(st, pg); }).map(function (pg) { return "«" + pg.title + "»"; });
            var notYet = need.length - ready2.length;
            extra = '<div class="b-hint">Вы пока не понимаете, о чём вас просят. ' +
                (ready2.length ? "Разгадайте в дневнике: " + ready2.join(", ") + ". " : "") +
                (notYet ? (notYet === 1 ? "Одну нужную группу слов вы ещё не нашли целиком" : "Ещё " + notYet + " нужные группы слов вы не нашли целиком") + " — поговорите с жителями." : "") + "</div>";
        }
        showLine(npcId, q.ask, extra);
    }

    // ---------------------------------------------------------------- таблички
    function openSign(id) {
        var s = SIGNS[id];
        SOUND.page();
        s.lines.forEach(seeText);
        $("#sign-card").className = "sign-card " + s.style;
        $("#sign-card").innerHTML = '<div class="sign-title">' + esc(s.title) + "</div>" +
            s.lines.map(function (l) { return '<div class="sign-line gr">' + renderLine(l) + speakBtn(l) + "</div>"; }).join("");
        s.lines.forEach(function (l) { hear("sign:" + id, l); });
        save();
        openOverlay("#sign");
    }

    // ---------------------------------------------------------------- оверлеи
    function openOverlay(sel) { $(sel).classList.add("on"); document.body.classList.add("modal"); }
    function closeOverlay(sel) { $(sel).classList.remove("on"); if (!$$(".overlay.on").length) { document.body.classList.remove("modal"); } hideTip(); }

    // ---------------------------------------------------------------- дневник
    function openJournal(tab, pageId) {
        journalTab = tab || journalTab || "pages";
        if (pageId) { journalPage = pageId; }
        if (!journalPage || !pageAvailable(st, pageById(journalPage))) {
            var first = PAGES.filter(function (p) { return pageAvailable(st, p) && !st.sealed[p.id]; })[0] || PAGES.filter(function (p) { return pageAvailable(st, p); })[0];
            journalPage = first ? first.id : null;
        }
        SOUND.page();
        renderJournal();
        openOverlay("#journal");
    }

    function renderJournal() {
        $$("#journal .tab").forEach(function (t) { t.classList.toggle("on", t.dataset.tab === journalTab); });
        var body = $("#j-body");
        if (journalTab === "pages") { body.innerHTML = journalPagesHtml(); bindPage(); }
        else if (journalTab === "heard") { body.innerHTML = heardHtml(); }
        else if (journalTab === "words") { body.innerHTML = unknownHtml(); bindUnknown(); }
        else if (journalTab === "mystery") { body.innerHTML = mysteryHtml(); bindMystery(); }
        else if (journalTab === "review") { body.innerHTML = reviewHtml(); bindReview(); }
    }

    function journalPagesHtml() {
        var ribbons = PAGES.map(function (p, i) {
            var av = pageAvailable(st, p), sealed = st.sealed[p.id];
            var seen = p.words.filter(function (w) { return st.seen[w]; }).length;
            return '<button type="button" class="ribbon ' + (p.id === journalPage ? "on " : "") + (sealed ? "sealed " : av ? "open " : "locked ") + (st.newPages[p.id] && !sealed ? "new" : "") + '" data-page="' + p.id + '"' + (av ? "" : " disabled") + ">" +
                '<span class="r-num">' + (i + 1) + "</span>" +
                '<span class="r-title">' + (av ? esc(p.title) : "слов: " + seen + " из " + p.words.length) + "</span>" +
                (sealed ? '<span class="r-seal"></span>' : "") + "</button>";
        }).join("");
        var right = journalPage ? pageHtml(pageById(journalPage)) :
            '<div class="j-empty"><p>Страницы появляются, когда вы встретите все слова одной группы.</p><p>Говорите с жителями и читайте таблички — подсвеченные слова записываются сами.</p></div>';
        return '<div class="j-left"><div class="j-h">Страницы</div>' + ribbons + '<div class="j-stat">разгадано слов: <b>' + knownCount(st) + "</b> из " + totalWords() + "</div></div>" +
            '<div class="j-right">' + right + "</div>";
    }

    function pageHtml(p) {
        var sealed = st.sealed[p.id];
        var pl = st.placement[p.id] || {};
        var placed = {};
        Object.keys(pl).forEach(function (k) { if (pl[k]) { placed[pl[k]] = k; } });
        var order = slotOrder(p);
        var idx = PAGES.indexOf(p) + 1;
        var slots = order.map(function (slot) {
            var w = sealed ? slot : pl[slot];
            var chip = w ? chipHtml(w, true) : '<span class="drop-ph">положите слово</span>';
            var val = w ? (sealed ? WORDS[w].ru : st.guesses[w] || "") : "";
            return '<div class="slot ' + (w ? "filled" : "") + '" data-slot="' + slot + '">' +
                '<div class="pic">' + ART.icon(slot) + "</div>" +
                '<div class="drop" data-slot="' + slot + '">' + chip + "</div>" +
                '<input class="tr" type="text" data-w="' + (w || "") + '" placeholder="' + (w ? "что это значит?" : "…") + '" value="' + esc(val) + '"' + (w && !sealed ? "" : " disabled") + ' autocomplete="off" spellcheck="false">' +
                "</div>";
        }).join("");
        var tray = sealed ? "" : p.words.filter(function (w) { return !placed[w]; }).map(function (w) { return chipHtml(w, false); }).join("");
        return '<div class="page ' + (sealed ? "sealed" : "") + '" data-page="' + p.id + '">' +
            '<div class="p-head"><span class="p-num">стр. ' + idx + "</span><h3>" + esc(p.title) + "</h3></div>" +
            '<div class="slots n' + p.words.length + '">' + slots + "</div>" +
            (sealed ? '<div class="p-sealed"><span class="wax"></span>Страница разгадана</div>' :
                '<div class="tray" data-tray="1">' + (tray || '<span class="tray-empty">все слова разложены</span>') + "</div>" +
                '<div class="p-foot"><span class="p-help">Положите каждое слово к его картинке. Перевод — ваш черновик: когда страница сойдётся, верный перевод впишется сам.</span>' +
                '<button type="button" class="btn ghost-light" id="hint-page">💡 Подсказка</button><button type="button" class="btn ghost-light" id="giveup-page">Сдаться</button>' +
                '<button type="button" class="btn primary" id="check-page">Проверить страницу</button></div><div class="p-msg" id="page-msg"></div>') +
            "</div>";
    }

    function chipHtml(w, inSlot) {
        return '<span class="chip ' + (inSlot ? "in" : "") + (selectedChip === w ? " sel" : "") + '" draggable="true" data-chip="' + w + '">' +
            '<span class="gw t ' + wordClass(w) + '" data-w="' + w + '">' + esc(WORDS[w].gr) + "</span>" + speakBtn(WORDS[w].gr.replace(/, -.*$/, "")) +
            (!inSlot && st.guesses[w] ? '<span class="chip-guess">' + esc(st.guesses[w]) + "</span>" : "") + "</span>";
    }

    function placeChip(pageId, slot, w) {
        var pl = st.placement[pageId] || (st.placement[pageId] = {});
        Object.keys(pl).forEach(function (k) { if (pl[k] === w) { pl[k] = null; } });
        pl[slot] = w;
        selectedChip = null;
        SOUND.click();
        save();
        renderJournal();
        var inp = $('.slot[data-slot="' + slot + '"] .tr');
        if (inp && !inp.value) { inp.focus(); }
    }

    function bindPage() {
        var page = $(".page");
        if (!page || page.classList.contains("sealed")) { return; }
        var pid = page.dataset.page;
        $$(".chip", page).forEach(function (c) {
            c.addEventListener("dragstart", function (e) { e.dataTransfer.setData("text/plain", c.dataset.chip); c.classList.add("dragging"); });
            c.addEventListener("dragend", function () { c.classList.remove("dragging"); });
        });
        $$(".drop", page).forEach(function (d) {
            d.addEventListener("dragover", function (e) { e.preventDefault(); d.classList.add("over"); });
            d.addEventListener("dragleave", function () { d.classList.remove("over"); });
            d.addEventListener("drop", function (e) { e.preventDefault(); var w = e.dataTransfer.getData("text/plain"); if (w) { placeChip(pid, d.dataset.slot, w); } });
        });
        var tray = $(".tray", page);
        tray.addEventListener("dragover", function (e) { e.preventDefault(); });
        tray.addEventListener("drop", function (e) {
            e.preventDefault();
            var w = e.dataTransfer.getData("text/plain");
            var pl = st.placement[pid] || {};
            Object.keys(pl).forEach(function (k) { if (pl[k] === w) { pl[k] = null; } });
            save(); renderJournal();
        });
        $$(".tr", page).forEach(function (inp) {
            inp.addEventListener("input", function () { if (inp.dataset.w) { st.guesses[inp.dataset.w] = inp.value; save(); } });
            inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { checkCurrentPage(); } });
        });
    }

    function checkCurrentPage() {
        var p = pageById(journalPage);
        if (!p || st.sealed[p.id]) { return; }
        var r = checkPage(st, p);
        var msg = $("#page-msg");
        if (r.ok) {
            st.sealed[p.id] = 1;
            delete st.newPages[p.id];
            selectedChip = null;
            var fixed = 0;
            p.words.forEach(function (w) { if (!checkRu(w, st.guesses[w] || "")) { fixed++; } st.guesses[w] = WORDS[w].ru; });
            save();
            SOUND.seal();
            renderJournal();
            var pg = $(".page");
            if (pg) { pg.classList.add("just-sealed"); }
            if (fixed) { var pm = $(".p-sealed"); if (pm) { pm.insertAdjacentHTML("beforeend", '<span class="p-fixed">переводы вписаны сами' + (fixed ? " (поправлено: " + fixed + ")" : "") + "</span>"); } }
            toast('<span class="t-ico">✦</span> Страница «' + esc(p.title) + "» сошлась! Теперь эти слова понятны везде.", "good");
            QUESTS.forEach(function (q) { if (questReady(st, q) && q.needPages.indexOf(p.id) >= 0) { toast('<span class="t-ico">!</span> Кажется, теперь вы поймёте просьбу: <b>' + esc(NPCS[q.npc].name) + "</b>", "page"); } });
            renderTop();
            if (mysteryOpen(st) && !st.mystery.solved && !st.mystery.toldOpen) { st.mystery.toldOpen = 1; save(); toast('<span class="t-ico">✦</span> Теперь можно перевести «' + esc(Q.mystery.title) + "». Загляните в дневник.", "good"); }
        } else {
            r.wrong.forEach(function (w) { st.mistakes[w] = (st.mistakes[w] || 0) + 1; });
            save();
            SOUND.thud();
            page = $(".page");
            page.classList.remove("shake"); void page.offsetWidth; page.classList.add("shake");
            var pl = st.placement[p.id] || {};
            var empty = p.words.filter(function (w) { return !pl[w]; }).length;
            msg.textContent = empty ? "Разложите все слова по картинкам." :
                r.wrong.length === 1 ? "Не сходится… но ошибка, кажется, всего одна." : "Не сходится. Перечитайте, где звучали эти слова.";
        }
    }
    var page;

    function unknownHtml() {
        var groups = PAGES.filter(function (p) { return !pageAvailable(st, p) && p.words.some(function (w) { return st.seen[w]; }); });
        if (!groups.length) {
            return '<div class="j-empty">Здесь собираются слова из групп, которые вы нашли ещё не целиком.<br>Сейчас таких нет: все встреченные слова уже на страницах с картинками.</div>';
        }
        return '<div class="unk"><p class="unk-help">Слова, чьи страницы ещё не открылись. Записывайте догадки здесь или прямо у слова в разговоре. Когда найдутся все слова группы, откроется страница с картинками — догадки перейдут туда сами.</p>' +
            groups.map(function (p) {
                var found = p.words.filter(function (w) { return st.seen[w]; });
                return '<div class="unk-group"><div class="unk-h">Группа ' + (PAGES.indexOf(p) + 1) + ' <span>найдено ' + found.length + " из " + p.words.length + "</span></div>" +
                    found.map(function (w) {
                        return '<div class="unk-row"><span class="unk-gr gr" data-w="' + w + '" title="Нажмите, чтобы услышать">' + esc(WORDS[w].gr) + speakBtn(WORDS[w].gr.replace(/, -.*$/, "")) + "</span>" +
                            '<input class="unk-in" data-w="' + w + '" type="text" autocomplete="off" spellcheck="false" placeholder="ваша догадка" value="' + esc(st.guesses[w] || "") + '"></div>';
                    }).join("") +
                    new Array(p.words.length - found.length + 1).join('<div class="unk-row ghost"><span class="unk-gr">? ? ?</span><span class="unk-ph">ещё не встречалось</span></div>') +
                    "</div>";
            }).join("") + "</div>";
    }
    function bindUnknown() {
        $$(".unk-in").forEach(function (inp) {
            inp.addEventListener("input", function () { st.guesses[inp.dataset.w] = inp.value; save(); });
        });
    }

    function heardHtml() {
        if (!st.heard.length) { return '<div class="j-empty">Здесь будут все услышанные реплики и прочитанные таблички.</div>'; }
        var groups = {};
        st.heard.forEach(function (k) {
            var i = k.indexOf("|"), who = k.slice(0, i), t = k.slice(i + 1);
            (groups[who] || (groups[who] = [])).push(t);
        });
        return '<div class="heard">' + Object.keys(groups).map(function (who) {
            var name = who.indexOf("sign:") === 0 ? "Табличка: " + SIGNS[who.slice(5)].title : who === "mystery" ? Q.mystery.title : NPCS[who].name;
            return '<div class="h-group"><div class="h-who">' + esc(name) + "</div>" +
                groups[who].map(function (t) { return '<div class="h-line gr">' + renderLine(t) + speakBtn(t, NPCS[who] ? who : "") + "</div>"; }).join("") + "</div>";
        }).join("") + "</div>";
    }

    // ---------------------------------------------------------------- глобальная задача: текст, который переводим в финале
    var M = Q.mystery;
    function mysteryLineHtml(i, mode) {
        var html = '<div class="my-line" data-line="' + i + '"><div class="my-gr gr">' + renderLine(M.lines[i]) + speakBtn(M.lines[i]) + "</div>";
        var done = st.mystery.lines[i], ws = mysteryWords(i);
        if (mode === "translate" && ws.length) {
            if (done) {
                html += '<div class="my-ru done">' + esc(mysteryRu(i)) + "</div>";
            } else {
                var inp = (st.mystery.inputs[i] = st.mystery.inputs[i] || {});
                html += '<div class="my-words">' + ws.map(function (w) {
                    return '<label class="my-w"><span class="gr">' + esc(lemmaSay(w)) + '</span><input class="my-in" data-line="' + i + '" data-w="' + w + '" type="text" autocomplete="off" spellcheck="false" placeholder="перевод" value="' + esc(inp[w] || "") + '"></label>';
                }).join("") + '<button type="button" class="btn small primary my-check" data-line="' + i + '">Проверить строку</button></div><div class="my-msg" data-line="' + i + '"></div>';
            }
        } else if (mode === "solved" && ws.length) {
            html += '<div class="my-ru done">' + esc(mysteryRu(i)) + "</div>";
        }
        return html + "</div>";
    }
    function mysteryHtml() {
        var open = mysteryOpen(st), solved = st.mystery.solved;
        var mode = solved ? "solved" : open ? "translate" : "read";
        var head = '<div class="my-head"><div class="my-kind">' + esc(M.kind || "") + "</div><h3>" + esc(M.title) + "</h3>" + (M.where ? '<div class="my-where">' + esc(M.where) + "</div>" : "") + "</div>";
        var note;
        if (mode === "read") {
            var need = (M.need && M.need.pages) || PAGES.map(function (p) { return p.id; });
            var left = need.filter(function (p) { return !st.sealed[p]; }).length;
            var qneed = ((M.need && M.need.quests) || []).filter(function (q) { return !st.quests[q]; }).length;
            note = '<div class="my-note">Это и есть главная задача: к концу истории вы переведёте этот текст сами. Наведите на слова — простые подскажут перевод. ' +
                "Перевод откроется, когда " + (left ? "в дневнике останется разгадать ещё <b>" + left + "</b> " + (left === 1 ? "страницу" : left < 5 ? "страницы" : "страниц") : "дневник будет разгадан") +
                (qneed ? " и вы поможете жителям (ещё: " + qneed + ")" : "") + ".</div>";
        } else if (mode === "translate") {
            var doneN = M.lines.filter(function (_, i) { return st.mystery.lines[i] || !mysteryWords(i).length; }).length;
            note = '<div class="my-note">Переведите каждое подсвеченное слово по-русски — по памяти или подглядывая в дневник. Строка засчитывается целиком, и тогда проявится её смысл. Готово строк: <b>' + doneN + "</b> из " + M.lines.length + ".</div>";
        } else {
            note = '<div class="my-note good">Текст переведён.</div>';
        }
        var body = '<div class="my-text ' + (M.look || "paper") + '">' + M.lines.map(function (_, i) { return mysteryLineHtml(i, mode); }).join("") + "</div>";
        var tail = "";
        if (mode === "translate" && mysteryLinesDone(st) && M.question && !st.mystery.answered) {
            tail = '<div class="my-q"><div class="my-q-ask">' + esc(M.question.ask) + '</div><div class="my-q-opts">' +
                M.question.options.map(function (o, k) { return '<button type="button" class="btn my-opt" data-k="' + k + '">' + esc(o) + "</button>"; }).join("") + '</div><div class="my-msg" id="my-q-msg"></div></div>';
        }
        if (mode === "solved" && M.reveal) { tail = '<div class="my-reveal">' + M.reveal.map(function (p) { return "<p>" + p + "</p>"; }).join("") + "</div>"; }
        return '<div class="mystery">' + head + note + body + tail + "</div>";
    }
    function bindMystery() {
        $$(".my-in").forEach(function (inp) {
            inp.addEventListener("input", function () {
                var i = inp.dataset.line, o = st.mystery.inputs[i] || (st.mystery.inputs[i] = {});
                o[inp.dataset.w] = inp.value; save();
            });
            inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); checkMyLine(+inp.dataset.line); } });
        });
    }
    function checkMyLine(i) {
        var r = checkMysteryLine(i, st.mystery.inputs[i] || {});
        var msg = $('.my-msg[data-line="' + i + '"]');
        if (!r.ok) {
            SOUND.thud();
            r.wrong.forEach(function (w) { st.mistakes[w] = (st.mistakes[w] || 0) + 1; });
            save();
            $$('.my-in[data-line="' + i + '"]').forEach(function (inp) { inp.classList.toggle("bad", r.wrong.indexOf(inp.dataset.w) >= 0); });
            if (msg) { msg.textContent = r.wrong.length === 1 ? "Почти: одно слово не так." : "Не сходится: неверных слов — " + r.wrong.length + "."; }
            return;
        }
        st.mystery.lines[i] = 1; save();
        SOUND.seal();
        SPEECH.say(plain(M.lines[i]), null);
        renderJournal();
        var el = $('.my-line[data-line="' + i + '"]'); if (el) { el.classList.add("just"); }
        if (mysteryLinesDone(st) && !M.question) { solveMystery(); }
    }
    function solveMystery() {
        st.mystery.solved = true; st.mystery.answered = true; save();
        SOUND.success();
        renderJournal(); renderScene();
        toast('<span class="t-ico">✦</span> ' + esc(M.solvedToast || "Текст переведён!"), "good");
        if (Q.finale && Q.finale.trigger === "mystery") { setTimeout(function () { closeOverlay("#journal"); startFinale(); }, 1600); }
    }
    // ---------------------------------------------------------------- повторение: перетащить перевод к слову
    var rv = { queue: null, round: [], left: [], tiles: [], sel: null, done: 0, roundNo: 0 };
    var ROUND = 7;
    function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function buildReviewQueue() {
        var known = Object.keys(WORDS).filter(function (w) { return isKnown(st, w); });
        var bad = reviewList(st).filter(function (w) { return known.indexOf(w) >= 0; });
        var rest = shuffle(known.filter(function (w) { return bad.indexOf(w) < 0; }));
        // ошибочные — первыми и ещё раз ближе к концу (чаще)
        var q = bad.concat(rest);
        var again = bad.slice(0, Math.max(0, Math.min(bad.length, 8)));
        if (again.length && q.length > ROUND) { q = q.concat(again); }
        return q;
    }
    function nextRound() {
        if (!rv.queue || !rv.queue.length) { rv.queue = buildReviewQueue(); rv.roundNo = 0; }
        var r = [];
        while (rv.queue.length && r.length < ROUND) { var w = rv.queue.shift(); if (r.indexOf(w) < 0) { r.push(w); } }
        rv.round = r; rv.left = r.slice(); rv.tiles = shuffle(r); rv.sel = null; rv.roundNo++;
    }
    function reviewHtml() {
        if (!Object.keys(WORDS).some(function (w) { return isKnown(st, w); })) {
            return '<div class="j-empty">Повторять пока нечего: разгадайте хотя бы одну страницу дневника.</div>';
        }
        if (!rv.round.length) { nextRound(); }
        if (!rv.left.length) {
            return '<div class="rv-done"><div class="rv-big">✓</div><h3>Раунд ' + rv.roundNo + ' пройден!</h3><p>' + (rv.queue.length ? "Осталось слов в повторении: " + rv.queue.length + "." : "Вы прошли все закреплённые слова.") + '</p><button type="button" class="btn primary" id="rv-next">' + (rv.queue.length ? "Следующий раунд" : "Начать заново") + "</button></div>";
        }
        var bad = reviewList(st);
        var left = rv.round.map(function (w) {
            var gone = rv.left.indexOf(w) < 0;
            return '<div class="rv-target' + (gone ? " gone" : "") + (bad.indexOf(w) >= 0 ? " was-bad" : "") + '" data-w="' + w + '"><span class="rv-pic">' + ART.icon(w) + '</span><span class="rv-gr gr">' + esc(WORDS[w].gr) + "</span>" + speakBtn(WORDS[w].gr.replace(/, -.*$/, "")) + '<span class="rv-slot">' + (gone ? esc(WORDS[w].ru) : "перетащите перевод") + "</span></div>";
        }).join("");
        var tiles = rv.tiles.filter(function (w) { return rv.left.indexOf(w) >= 0; }).map(function (w) {
            return '<button type="button" class="rv-tile' + (rv.sel === w ? " sel" : "") + '" data-w="' + w + '">' + esc(WORDS[w].ru) + "</button>";
        }).join("");
        return '<div class="rv"><div class="rv-head"><b>Раунд ' + rv.roundNo + '</b> · перетащите русский перевод на греческое слово (или нажмите плитку, затем слово). Слова, где вы ошибались, идут первыми.</div>' +
            '<div class="rv-cols"><div class="rv-left">' + left + '</div><div class="rv-right"><div class="rv-tray">' + tiles + "</div></div></div></div>";
    }
    function rvTry(tileW, targetW, tileEl) {
        var target = $('.rv-target[data-w="' + targetW + '"]');
        if (!target || target.classList.contains("gone")) { return false; }
        if (tileW === targetW) {
            SOUND.blip();
            rv.left.splice(rv.left.indexOf(targetW), 1);
            if (st.mistakes[targetW]) { st.mistakes[targetW] = Math.max(0, st.mistakes[targetW] - 1); save(); }
            target.classList.add("flash-ok");
            SPEECH.say(WORDS[targetW].gr.replace(/, -.*$/, ""), null);
            if (tileEl) { tileEl.classList.add("used"); }
            clearTimeout(rv.timer);
            rv.timer = setTimeout(function () { if (journalTab === "review" && $("#journal").classList.contains("on")) { renderJournal(); } }, 650);
            return true;
        }
        SOUND.thud();
        st.mistakes[targetW] = (st.mistakes[targetW] || 0) + 1;
        st.mistakes[tileW] = (st.mistakes[tileW] || 0) + 1;
        save();
        target.classList.remove("flash-bad"); void target.offsetWidth; target.classList.add("flash-bad");
        if (tileEl) { tileEl.classList.remove("bounce"); void tileEl.offsetWidth; tileEl.classList.add("bounce"); }
        return false;
    }
    function bindReview() {
        var next = $("#rv-next");
        if (next) { next.addEventListener("click", function () { SOUND.click(); rv.round = []; renderJournal(); }); return; }
        $$(".rv-tile").forEach(function (tile) {
            tile.addEventListener("pointerdown", function (e) {
                if (e.button !== undefined && e.button !== 0) { return; }
                var startX = e.clientX, startY = e.clientY, ghost = null, moved = false;
                function move(ev) {
                    if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6) { return; }
                    if (!moved) {
                        moved = true;
                        ghost = tile.cloneNode(true); ghost.classList.add("ghost");
                        document.body.appendChild(ghost);
                        tile.classList.add("lifted");
                    }
                    ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px";
                    $$(".rv-target").forEach(function (t) { t.classList.remove("over"); });
                    var el = document.elementFromPoint(ev.clientX, ev.clientY);
                    var tg = el && el.closest(".rv-target:not(.gone)");
                    if (tg) { tg.classList.add("over"); }
                }
                function up(ev) {
                    document.removeEventListener("pointermove", move);
                    document.removeEventListener("pointerup", up);
                    $$(".rv-target").forEach(function (t) { t.classList.remove("over"); });
                    if (!moved) { return; } // это клик — обработает click
                    if (ghost) { ghost.remove(); }
                    tile.classList.remove("lifted");
                    var el = document.elementFromPoint(ev.clientX, ev.clientY);
                    var tg = el && el.closest(".rv-target");
                    if (tg) { rvTry(tile.dataset.w, tg.dataset.w, tile); } else { tile.classList.remove("bounce"); void tile.offsetWidth; tile.classList.add("bounce"); }
                    tile.dataset.dragged = "1";
                    setTimeout(function () { delete tile.dataset.dragged; }, 50);
                }
                document.addEventListener("pointermove", move);
                document.addEventListener("pointerup", up);
            });
            tile.addEventListener("click", function () {
                if (tile.dataset.dragged) { return; }
                rv.sel = rv.sel === tile.dataset.w ? null : tile.dataset.w;
                SOUND.click();
                $$(".rv-tile").forEach(function (t) { t.classList.toggle("sel", t.dataset.w === rv.sel); });
            });
        });
        $$(".rv-target").forEach(function (tg) {
            tg.addEventListener("click", function (e) {
                if (e.target.closest(".speak")) { return; }
                if (!rv.sel) { SPEECH.say(WORDS[tg.dataset.w].gr.replace(/, -.*$/, ""), null); return; }
                var tileEl = $('.rv-tile[data-w="' + rv.sel + '"]');
                rvTry(rv.sel, tg.dataset.w, tileEl);
                rv.sel = null;
                $$(".rv-tile").forEach(function (t) { t.classList.remove("sel"); });
            });
        });
    }

    // ---------------------------------------------------------------- просьбы
    var GK = [
        ["ς", "ε", "ρ", "τ", "υ", "θ", "ι", "ο", "π"],
        ["α", "σ", "δ", "φ", "γ", "η", "ξ", "κ", "λ"],
        ["ζ", "χ", "ψ", "ω", "β", "ν", "μ"],
        ["ά", "έ", "ή", "ί", "ό", "ύ", "ώ"],
    ];
    var CODE2GR = { KeyA: "α", KeyB: "β", KeyG: "γ", KeyD: "δ", KeyE: "ε", KeyZ: "ζ", KeyH: "η", KeyU: "θ", KeyI: "ι", KeyK: "κ", KeyL: "λ", KeyM: "μ",
        KeyN: "ν", KeyJ: "ξ", KeyO: "ο", KeyP: "π", KeyR: "ρ", KeyS: "σ", KeyT: "τ", KeyY: "υ", KeyF: "φ", KeyX: "χ", KeyC: "ψ", KeyV: "ω", KeyW: "ς" };
    var ACC = { "α": "ά", "ε": "έ", "η": "ή", "ι": "ί", "ο": "ό", "υ": "ύ", "ω": "ώ" };
    var deadAccent = false;

    function insertAt(inp, ch) {
        var s = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
        var e = inp.selectionEnd != null ? inp.selectionEnd : inp.value.length;
        inp.value = inp.value.slice(0, s) + ch + inp.value.slice(e);
        inp.selectionStart = inp.selectionEnd = s + ch.length;
        inp.dispatchEvent(new Event("input"));
    }

    function openQuest(qid) {
        var q = questById(qid);
        if (!q || !questReady(st, q)) { return; }
        SOUND.page();
        var gi = 0;
        var sentence = q.parts.map(function (p) {
            if (typeof p === "string") { return renderLine(p); }
            var i = gi++;
            return '<span class="gap"><input class="gap-in" data-i="' + i + '" type="text" autocomplete="off" spellcheck="false" style="width:' + Math.max(6, dec(p.a[0]).length + 3) + 'ch">' +
                (p.hint ? '<span class="gap-hint">' + esc(p.hint) + "</span>" : "") + "</span>";
        }).join("");
        var kb = GK.map(function (row) { return '<div class="kb-row">' + row.map(function (c) { return '<button type="button" class="kb-key" data-ch="' + c + '">' + c + "</button>"; }).join("") + "</div>"; }).join("") +
            '<div class="kb-row"><button type="button" class="kb-key wide" data-ch=" ">пробел</button><button type="button" class="kb-key wide" data-bs="1">⌫</button></div>';
        $("#quest-card").innerHTML =
            '<div class="q-top"><div class="q-portrait">' + ART.portrait(q.npc) + '</div><div class="q-ask"><div class="q-name">' + esc(NPCS[q.npc].name) + ' просит:</div><div class="gr">' + renderLine(q.ask) + speakBtn(q.ask, q.npc) + "</div></div></div>" +
            '<div class="q-pic">' + ART.questPic(q.pic) + "</div>" +
            '<div class="q-sentence gr">' + sentence + "</div>" +
            '<div class="q-kb">' + kb + '<div class="kb-note">Можно печатать на любой раскладке — буквы станут греческими. Ударения можно не ставить.</div></div>' +
            '<div class="q-foot"><span class="q-msg" id="q-msg"></span><button type="button" class="btn ghost-light" id="q-hint" data-q="' + q.id + '">💡 Подсказка</button><button type="button" class="btn ghost-light" id="q-giveup" data-q="' + q.id + '">Сдаться</button><button type="button" class="btn" data-close="#quest">Отложить</button><button type="button" class="btn primary" id="q-check" data-q="' + q.id + '">Готово</button></div>';
        openOverlay("#quest");
        var first = $(".gap-in");
        activeGap = first;
        if (first) { first.focus(); }
        // черновик: что уже вписано, сохраняется при любом закрытии и перезагрузке
        var draft = st.questDrafts[q.id] || [];
        $$(".gap-in").forEach(function (inp, i) {
            if (draft[i]) { inp.value = draft[i]; }
            inp.addEventListener("focus", function () { activeGap = inp; });
            inp.addEventListener("keydown", gapKey);
            inp.addEventListener("input", function () {
                var d = st.questDrafts[q.id] || (st.questDrafts[q.id] = []);
                d[i] = inp.value;
                save();
            });
        });
    }

    function gapKey(e) {
        var inp = e.target;
        if (e.ctrlKey || e.metaKey || e.altKey) { return; }
        if (e.key === "Enter") { e.preventDefault(); $("#q-check").click(); return; }
        if (/^[Ͱ-Ͽἀ-῿]$/.test(e.key)) { deadAccent = false; return; } // настоящая греческая раскладка
        if (e.code === "Semicolon" || e.key === "´") { e.preventDefault(); deadAccent = true; return; }
        var ch = CODE2GR[e.code];
        if (ch) {
            e.preventDefault();
            if (deadAccent && ACC[ch]) { ch = ACC[ch]; }
            deadAccent = false;
            if (e.shiftKey) { ch = ch.toUpperCase(); }
            insertAt(inp, ch);
        }
    }

    // ---------------------------------------------------------------- подсказка и «сдаться»
    function weigh(w, n) { st.mistakes[w] = (st.mistakes[w] || 0) + n; save(); }
    function firstLetter(s) { return s.normalize("NFC").charAt(0); }

    function questHint(qid) {
        var q = questById(qid), gaps = questGaps(q), ins = $$(".gap-in");
        var i = activeGap && !activeGap.disabled && !checkGr(gaps[+activeGap.dataset.i].a, activeGap.value) ? +activeGap.dataset.i : -1;
        if (i < 0) { for (var k = 0; k < gaps.length; k++) { if (!checkGr(gaps[k].a, ins[k].value)) { i = k; break; } } }
        if (i < 0) { $("#q-msg").textContent = "Всё уже вписано верно — нажмите «Готово»."; return; }
        var g = gaps[i], w = WORDS[g.w];
        var box = ins[i].parentNode, old = box.querySelector(".gap-tip");
        if (old) { old.remove(); }
        box.insertAdjacentHTML("beforeend", '<span class="gap-tip">«' + esc(w.ru) + "» · начинается на <b>" + esc(firstLetter(dec(g.a[0]))) + "</b></span>");
        ins[i].focus();
        weigh(g.w, 1);
        SOUND.blip();
    }

    function questGiveUp(btn) {
        if (!btn.classList.contains("confirm")) {
            btn.classList.add("confirm"); btn.textContent = "Точно? Показать ответы";
            setTimeout(function () { if (btn.isConnected) { btn.classList.remove("confirm"); btn.textContent = "Сдаться"; } }, 4000);
            return;
        }
        var q = questById(btn.dataset.q), gaps = questGaps(q);
        $$(".gap-in").forEach(function (inp, i) {
            inp.value = dec(gaps[i].a[0]); inp.classList.add("hinted");
            var box = inp.parentNode, old = box.querySelector(".gap-tip"); if (old) { old.remove(); }
            box.insertAdjacentHTML("beforeend", '<span class="gap-tip hinted-tag">подсказано · «' + esc(WORDS[gaps[i].w].ru) + "»</span>");
            weigh(gaps[i].w, 2);
            inp.dispatchEvent(new Event("input"));
        });
        var sentence = q.parts.map(function (p) { return typeof p === "string" ? plain(p) : dec(p.a[0]); }).join("");
        SPEECH.say(sentence, NPCS[q.npc]);
        $("#q-msg").textContent = "Ответы вписаны. Эти слова попадут в «Повторение» почаще.";
        btn.disabled = true; $("#q-hint").disabled = true;
        setTimeout(function () { if ($("#quest").classList.contains("on")) { checkQuestNow(q.id); } }, 2600);
    }

    function pageHint() {
        var p = pageById(journalPage); if (!p || st.sealed[p.id]) { return; }
        var pl = st.placement[p.id] || {};
        var slot = slotOrder(p).filter(function (s) { return pl[s] !== s; })[0];
        if (!slot) { $("#page-msg").textContent = "Все слова лежат на своих местах — проверяйте!"; return; }
        $$(".slot").forEach(function (s) { s.classList.remove("hint-on"); var o = s.querySelector(".slot-tip"); if (o) { o.remove(); } });
        var el = $('.slot[data-slot="' + slot + '"]');
        el.classList.add("hint-on");
        el.insertAdjacentHTML("afterbegin", '<span class="slot-tip">сюда: слово на <b>' + esc(firstLetter(WORDS[slot].gr.replace(/^(η|ο|το|τη|την)\s+/, ""))) + "…</b>, «" + esc(WORDS[slot].ru) + "»</span>");
        weigh(slot, 1);
        SOUND.blip();
    }

    function pageGiveUp(btn) {
        if (!btn.classList.contains("confirm")) {
            btn.classList.add("confirm"); btn.textContent = "Точно? Разложить за меня";
            setTimeout(function () { if (btn.isConnected) { btn.classList.remove("confirm"); btn.textContent = "Сдаться"; } }, 4000);
            return;
        }
        var p = pageById(journalPage); if (!p) { return; }
        st.placement[p.id] = {};
        p.words.forEach(function (w) { st.placement[p.id][w] = w; weigh(w, 2); });
        st.hinted = st.hinted || {}; st.hinted[p.id] = 1;
        save();
        SPEECH.say(p.words.map(function (w) { return WORDS[w].gr.replace(/, -.*$/, ""); }).join(", "), null);
        checkCurrentPage();
        var pm = $(".p-sealed"); if (pm) { pm.insertAdjacentHTML("beforeend", '<span class="hinted-tag">подсказано</span>'); }
    }

    function checkQuestNow(qid) {
        var q = questById(qid);
        var inputs = $$(".gap-in").map(function (i) { return i.value; });
        var r = checkQuest(q, inputs);
        var gaps = questGaps(q);
        if (!r.ok) {
            SOUND.thud();
            r.wrong.forEach(function (i) { var w = gaps[i].w; st.mistakes[w] = (st.mistakes[w] || 0) + 1; });
            save();
            var card = $("#quest-card");
            card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
            var empty = inputs.filter(function (v) { return !v.trim(); }).length;
            $("#q-msg").textContent = empty ? "Заполните все пропуски." : r.wrong.length === 1 ? "Почти! Одна ошибка." : "Не то. Загляните в дневник.";
            return;
        }
        $$(".gap-in").forEach(function (inp, i) { inp.value = dec(gaps[i].a[0]); inp.disabled = true; inp.classList.add("ok"); });
        SOUND.success();
        st.quests[q.id] = 1;
        delete st.questDrafts[q.id];
        save();
        $("#q-msg").innerHTML = '<span class="ok-msg">Получилось!</span>';
        setTimeout(function () { afterQuest(q); }, 1100);
    }

    function afterQuest(q) {
        closeOverlay("#quest");
        if (q.finale) { startFinale(); return; }
        renderScene();
        // какие места открылись этой просьбой
        Q.world.zones.forEach(function (z) {
            if (z.lock && z.lock.quests && z.lock.quests.indexOf(q.id) >= 0 && locUnlocked(st, z.id)) {
                toast('<span class="t-ico">➜</span> Открылось новое место: ' + renderLine(z.name), "good");
            }
        });
        if (q.toast) { setTimeout(function () { toast(q.toast, "page"); }, 2500); }
        var who = isErrand(q) ? errandTo(q) : q.npc;
        var lines = npcLines(st, who);
        var storyIdx = -1;
        lines.forEach(function (l, i) { if (l.story && storyIdx < 0) { storyIdx = i; } });
        if (storyIdx >= 0) { st.npcLine[who] = storyIdx; save(); }
        currentNpc = who;
        showLine(who, q.thanks);
        if (mysteryOpen(st) && !st.mystery.solved && !st.mystery.toldOpen) { st.mystery.toldOpen = 1; save(); setTimeout(function () { toast('<span class="t-ico">✦</span> Теперь можно перевести «' + esc(M.title) + "». Загляните в дневник.", "good"); }, 1800); }
    }
    // ---------------------------------------------------------------- вступление и финал
    function showStory(html, btn, onNext) {
        $("#story-card").innerHTML = html + '<div class="s-foot"><button type="button" class="btn primary" id="story-next">' + btn + "</button></div>";
        openOverlay("#story");
        $("#story-next").onclick = function () { SOUND.click(); onNext(); };
    }

    function startIntro() {
        var I = Q.intro;
        showStory("<h2>" + esc(I.title) + "</h2>" + I.paragraphs.map(function (p) { return "<p>" + p + "</p>"; }).join(""),
            I.button || "Посмотреть", function () {
                // текст главной задачи слова НЕ открывает: по нему значение не вывести, слова надо встретить в мире
                M.lines.forEach(function (l) { hear("mystery", l); });
                showStory('<div class="my-text intro ' + (M.look || "paper") + '"><div class="my-kind">' + esc(M.kind || "") + "</div>" + M.lines.map(function (l) { return '<div class="my-gr gr">' + renderLine(l) + "</div>"; }).join("") + "</div>" +
                    '<p class="s-hint">' + (I.hint || 'Наведите на слова. Простые подскажут перевод сразу. <span class="hl">Подсвеченные</span> — незнакомые: их значение придётся понять самим и записать в дневник. Этот текст — ваша главная задача: в конце вы его переведёте.') + "</p>",
                    I.enter || "Начать", function () { st.intro = true; save(); closeOverlay("#story"); renderScene(); showControls(); });
            });
    }
    function finaleSide(who) {
        var F = Q.finale, order = [];
        (F.lines || []).forEach(function (l) { if (order.indexOf(l.who) < 0) { order.push(l.who); } });
        return order.indexOf(who) % 2 === 0 ? "left" : "right";
    }
    function startFinale() {
        var F = Q.finale;
        st.finale = true; save();
        var fs = $("#finale");
        hideBubble();
        fs.innerHTML = '<div class="f-bubble" id="f-bubble"></div><div class="f-foot"><button type="button" class="btn primary" id="f-next">Дальше ›</button></div>';
        fs.classList.add("world");
        document.body.classList.add("finale-on");
        WORLD.finale(true);
        fs.classList.add("on");
        document.body.classList.add("modal");
        SOUND.seal();
        var i = 0;
        function step() {
            if (i >= F.lines.length) { epilogue(); return; }
            var f = F.lines[i++];
            seeText(f.t);
            var b = $("#f-bubble");
            b.className = "f-bubble on " + finaleSide(f.who);
            b.innerHTML = '<div class="b-name">' + esc(NPCS[f.who].name) + '</div><div class="gr">' + renderLine(f.t) + speakBtn(f.t, f.who) + "</div>";
            finaleWho = f.who; WORLD.say(f.who); positionFinale();
            SPEECH.say(plain(f.t), NPCS[f.who]);
        }
        $("#f-next").onclick = function () { SOUND.click(); step(); };
        step();
    }
    function epilogue() {
        var E = Q.finale.epilogue;
        $("#finale").classList.remove("on");
        finaleWho = null; $("#finale").classList.remove("world"); document.body.classList.remove("finale-on"); WORLD.finale(false);
        showStory("<h2>" + esc(E.title) + "</h2>" + E.paragraphs.map(function (p) { return "<p>" + p.replace(/\{known\}/g, String(knownCount(st))).replace(/\{total\}/g, String(totalWords())) + "</p>"; }).join("") +
            (E.last ? '<p class="gr big">' + renderLine(E.last) + "</p>" : ""),
            "Повторить трудные слова", function () { closeOverlay("#story"); renderScene(); openJournal("review"); });
    }
    // ---------------------------------------------------------------- панель «Голоса»
    var SAMPLE = {};
    ["f", "m"].forEach(function (g) {
        var id = Object.keys(NPCS).filter(function (k) { return NPCS[k].gender === g; })[0];
        if (id) { SAMPLE[g] = { who: id, t: plain(NPCS[id].lines[0].t) }; }
    });
    function namesOf(g) { return Object.keys(NPCS).filter(function (k) { return NPCS[k].gender === g; }).map(function (k) { return NPCS[k].ru || NPCS[k].name; }).join(", "); }
    function renderVoices() {
        var vs = SPEECH.voices();
        var gname = { f: "женский", m: "мужской", "?": "пол не известен" };
        var list = vs.length ? "<ul class='vc-list'>" + vs.map(function (v) {
            return "<li><b>" + esc(v.name) + "</b> <span>" + esc(v.lang) + " · " + gname[v.gender] + " · " + (v.local ? "в системе" : "сетевой") + "</span></li>";
        }).join("") + "</ul>" : "<p class='vc-warn'>Греческих голосов в этом браузере нет — озвучки не будет. Откройте игру в Microsoft Edge.</p>";
        function row(g, label) {
            if (!SAMPLE[g]) { return ""; }
            var cur = st.voicePrefs[g] || "";
            var eff = SPEECH.choice(NPCS[SAMPLE[g].who]);
            return '<div class="vc-row"><div class="vc-who">' + label + '</div>' +
                '<select class="vc-sel" data-g="' + g + '"><option value="">авто' + (cur ? "" : eff ? " — " + esc(eff.voice) : "") + "</option>" +
                vs.map(function (v) { return '<option value="' + esc(v.name) + '"' + (cur === v.name ? " selected" : "") + ">" + esc(v.name) + "</option>"; }).join("") + "</select>" +
                '<button type="button" class="btn small primary vc-play" data-g="' + g + '"' + (vs.length ? "" : " disabled") + '>▶ Прослушать</button>' +
                '<div class="vc-eff">' + (eff ? "звучит: " + esc(eff.voice) + ", тон " + eff.pitch + ", скорость " + eff.rate : "") + "</div></div>";
        }
        $("#voices-card").innerHTML = '<div class="vc-head"><h3>Голоса озвучки</h3><button type="button" class="btn ghost close dark" data-close="#voices">✕</button></div>' +
            "<div class='vc-sub'>Найденные греческие голоса:</div>" + list +
            (vs.length && !SPEECH.hasFemale() ? '<p class="vc-warn">Женского греческого голоса в этом браузере нет — откройте игру в Microsoft Edge. Пока женщины говорят тем же голосом, но заметно выше.</p>' : "") +
            row("f", "Женщины<br><small>" + esc(namesOf("f")) + "</small>") + row("m", "Мужчины<br><small>" + esc(namesOf("m")) + "</small>");
    }
    function openVoices() { renderVoices(); openOverlay("#voices"); }
    SPEECH.onChange(function () { if ($("#voices").classList.contains("on")) { renderVoices(); } });
    document.addEventListener("change", function (e) {
        if (e.target.classList && e.target.classList.contains("vc-sel")) {
            st.voicePrefs[e.target.dataset.g] = e.target.value;
            SPEECH.setPrefs(st.voicePrefs); save(); renderVoices();
            var sm = SAMPLE[e.target.dataset.g]; if (sm) { SPEECH.say(sm.t, NPCS[sm.who]); }
        }
    });

    // ---------------------------------------------------------------- события
    document.addEventListener("click", function (e) {
        var t = e.target;
        if (!t || !t.closest) { return; }
        var sp = t.closest(".speak");
        if (sp) { e.stopPropagation(); SPEECH.say(sp.dataset.say, sp.dataset.who ? NPCS[sp.dataset.who] : null); return; }
        var hotEl = t.closest(".hot");
        if (hotEl && $("#scene-holder").contains(hotEl)) {
            if (hotEl.dataset.npc) { talk(hotEl.dataset.npc); }
            else if (hotEl.dataset.sign) { hideBubble(true); openSign(hotEl.dataset.sign); }
            else if (hotEl.dataset.go) { go(hotEl.dataset.go); }
            return;
        }
        var pl = t.closest(".place");
        if (pl) { go(pl.dataset.go); return; }
        var qb = t.closest("[data-quest]");
        if (qb) { openQuest(qb.dataset.quest); return; }
        var eb = t.closest("[data-errand]");
        if (eb) { takeErrandNow(eb.dataset.errand); return; }
        var shb = t.closest("[data-shop]");
        if (shb) { openShop(shb.dataset.shop); return; }
        var byb = t.closest("[data-buy]");
        if (byb) { shopBuy(byb.dataset.buy); return; }
        var slb = t.closest("[data-sell]");
        if (slb) { shopSell(slb.dataset.sell); return; }
        var sq = t.closest(".sh-q");
        if (sq) { var it = sq.dataset.item; shopQty[it] = Math.max(1, Math.min(9, (shopQty[it] || 1) + (+sq.dataset.d))); SOUND.click(); renderShop($("#sh-msg") ? $("#sh-msg").innerHTML : ""); return; }
        var cl = t.closest("[data-close]");
        if (cl) { closeOverlay(cl.dataset.close); return; }
        var vp = t.closest(".vc-play");
        if (vp) { var g = vp.dataset.g; if (SAMPLE[g]) { SPEECH.say(SAMPLE[g].t, NPCS[SAMPLE[g].who]); } return; }
        if (t.closest("#q-check")) { checkQuestNow($("#q-check").dataset.q); return; }
        var mc = t.closest(".my-check");
        if (mc) { checkMyLine(+mc.dataset.line); return; }
        var mo = t.closest(".my-opt");
        if (mo) {
            if (checkMysteryAnswer(+mo.dataset.k)) { solveMystery(); }
            else { SOUND.thud(); mo.classList.add("bad"); var qm = $("#my-q-msg"); if (qm) { qm.textContent = "Перечитайте перевод — ответ в нём."; } }
            return;
        }
        var key = t.closest(".kb-key");
        if (key && activeGap && !activeGap.disabled) {
            if (key.dataset.bs) { var v = activeGap.value; activeGap.value = v.slice(0, -1); }
            else { insertAt(activeGap, key.dataset.ch); }
            activeGap.focus();
            SOUND.click();
            return;
        }
        // дневник
        var tab = t.closest("#journal .tab");
        if (tab) { journalTab = tab.dataset.tab; SOUND.page(); renderJournal(); return; }
        var rb = t.closest(".ribbon");
        if (rb && !rb.disabled) { journalPage = rb.dataset.page; selectedChip = null; SOUND.page(); renderJournal(); return; }
        if (t.closest("#check-page")) { checkCurrentPage(); return; }
        if (t.closest("#hint-page")) { pageHint(); return; }
        if (t.closest("#giveup-page")) { pageGiveUp(t.closest("#giveup-page")); return; }
        if (t.closest("#q-hint")) { questHint(t.closest("#q-hint").dataset.q); return; }
        if (t.closest("#q-giveup")) { questGiveUp(t.closest("#q-giveup")); return; }
        var chip = t.closest(".chip");
        if (chip && $("#journal").contains(chip)) {
            var w = chip.dataset.chip;
            if (chip.classList.contains("in")) {
                var pgid = journalPage, pl2 = st.placement[pgid] || {};
                Object.keys(pl2).forEach(function (k) { if (pl2[k] === w) { pl2[k] = null; } });
                selectedChip = w; save(); renderJournal(); return;
            }
            selectedChip = selectedChip === w ? null : w; SOUND.click(); SPEECH.say(WORDS[w].gr.replace(/, -.*$/, ""), null); renderJournal(); return;
        }
        var ug = t.closest(".unk-gr");
        if (ug && ug.dataset.w) { SPEECH.say(WORDS[ug.dataset.w].gr.replace(/, -.*$/, ""), null); return; }
        var drop = t.closest(".drop, .slot");
        if (drop && selectedChip && $("#journal").contains(drop) && !t.closest("input")) { placeChip(journalPage, drop.dataset.slot, selectedChip); return; }
        // клик по незнакомому слову в репликах — открыть дневник
        if (t.closest("#wordpop")) {
            if (t.closest("#wp-save")) { saveWordPop(); }
            else if (t.closest("#wp-page")) { var pid = t.closest("#wp-page").dataset.page; closeWordPop(); openJournal("pages", pid); }
            return;
        }
        var gw = t.closest(".gw.t");
        if (gw && !gw.closest(".chip")) { openWordPop(gw); return; }
        if ($("#wordpop").classList.contains("on")) { closeWordPop(); }
        if (t.closest(".overlay") && t.classList.contains("overlay") && !t.closest("#story") && !t.closest("#finale")) { closeOverlay("#" + t.id); return; }
        if (!t.closest("#bubble") && !t.closest("#wordpop") && !t.closest(".overlay") && !t.closest("#top") && !t.closest("#toasts")) { hideBubble(true); }
    });

    document.addEventListener("keydown", function (e) {
        // E закрывает таблички и окна (кроме ввода текста: там E — буква). Событие дальше не идёт, чтобы мир не открыл табличку снова
        if (e.code === "KeyE" && !e.repeat && !(e.target.closest && e.target.closest("input, textarea, select, [contenteditable]"))) {
            var shut = false;
            if ($("#wordpop").classList.contains("on")) { closeWordPop(); shut = true; }
            else {
                ["#sign", "#shop", "#quest", "#voices", "#journal"].forEach(function (s) { if ($(s).classList.contains("on")) { closeOverlay(s); shut = true; } });
            }
            if (shut) { e.preventDefault(); e.stopPropagation(); return; }
        }
        if (e.key === "Escape") {
            ["#quest", "#sign", "#journal", "#voices", "#shop"].forEach(function (s) { if ($(s).classList.contains("on")) { closeOverlay(s); } });
            hideBubble(true);
        }
        if (e.key === "Enter" && e.target.classList && e.target.classList.contains("hot")) { e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
        if ((e.key === "j" || e.key === "о") && !e.target.closest("input") && !document.body.classList.contains("modal")) { openJournal(); }
    });

    $("#btn-journal").addEventListener("click", function () { openJournal("pages"); });
    $("#btn-mystery").addEventListener("click", function () { openJournal("mystery"); });
    $("#btn-voices").addEventListener("click", openVoices);
    $("#btn-sound").addEventListener("click", function () { st.sound = !st.sound; SOUND.setOn(st.sound); save(); renderTop(); });
    $("#btn-reset").addEventListener("click", function () {
        if (confirm("Начать игру заново? Весь прогресс будет стёрт.")) {
            try { localStorage.removeItem(GAME_KEY); } catch (e) { /* молча */ }
            location.reload();
        }
    });

    // ---------------------------------------------------------------- старт
    function begin() {
        SOUND.start();
        SPEECH.setPrefs(st.voicePrefs);
        SOUND.setOn(st.sound);
        $("#cover").classList.add("gone");
        $("#app").classList.remove("hidden");
        document.body.classList.remove("cover-on");
        st.started = true; save();
        renderScene();
        if (!st.intro) { startIntro(); }
        if (st.finale) { toast("Вы уже прошли историю. Повторение — в дневнике.", "muted"); }
    }
    // ---------------------------------------------------------------- 3D-квартал
    // подошли к табличке — её текст всплывает крупно (кликабельные слова, подсказки, озвучка)
    var peekId = null;
    function signPeek() {
        var n = WORLD.near(), id = n && n.kind === "sign" && !document.body.classList.contains("modal") ? n.id : null;
        if (id === peekId) { return; }
        peekId = id;
        var box = $("#sign-peek");
        if (!id) { box.classList.remove("on"); return; }
        var s = SIGNS[id];
        s.lines.forEach(seeText);
        s.lines.forEach(function (l) { hear("sign:" + id, l); });
        save();
        box.className = "sign-peek " + s.style;
        box.innerHTML = '<div class="sp-title">' + esc(s.title) + '<span>подошли поближе — читайте; наведите на слово</span></div>' +
            s.lines.map(function (l) { return '<div class="sp-line gr">' + renderLine(l) + speakBtn(l) + "</div>"; }).join("");
        box.classList.remove("on"); void box.offsetWidth; box.classList.add("on");
    }
    function fallback2d() {
        use3d = false;
        document.body.classList.add("no3d");
        $("#scene-holder").innerHTML = '<div class="no3d-msg"><h3>Нужен браузер с WebGL</h3><p>Игра трёхмерная. Откройте её в свежем Chrome, Edge или Firefox — и включите аппаратное ускорение.</p></div>';
        $("#btn-start").textContent = "WebGL недоступен";
    }
    function startReady() {
        var btn = $("#btn-start");
        btn.disabled = false;
        btn.textContent = st.intro ? "Продолжить" : "Начать";
        $(".cover-note").textContent = "озвучка на греческом · прогресс сохраняется";
    }
    if (window.WORLD && WORLD.init) {
        WORLD.init($("#scene-holder"), function (ok) {
            if (!ok) { fallback2d(); return; }
            use3d = true;
            document.body.classList.add("w3d");
            WORLD.show(st.loc, st, markers());
            startReady();
        });
        WORLD.onPick(function (a) {
            if (a.kind === "npc") { talk(a.id); }
            else if (a.kind === "mystery") { hideBubble(true); openJournal("mystery"); }
            else if (a.kind === "sign") { hideBubble(true); openSign(a.id); }
        });
        // герой сам дошёл до другого места
        WORLD.onLoc(function (loc) {
            if (!st.started) { return; }
            st.loc = loc; save();
            renderPlaces();
            locTitle(loc);
        });
        WORLD.onLocked(function (loc) { hideBubble(true); toast(Q.meta.lockedText || "Заперто. Помогите жителям — и путь откроется.", "muted"); SOUND.thud(); });
        WORLD.onFrame(function () {
            positionBubble(); positionFinale(); signPeek();
            // отошли от жителя — разговор закрывается и начнётся сначала
            if (currentNpc && $("#bubble").classList.contains("on") && WORLD.dist(currentNpc) > 4.2) { hideBubble(true); }
        });
    } else { fallback2d(); }
    $("#btn-start").disabled = true;
    $("#btn-start").textContent = "Строим мир…";
    $("#btn-start").addEventListener("click", function () {
        if (use3d) { WORLD.cover(false); WORLD.start(st.loc); }
        var fresh = !st.intro;
        begin();
        if (use3d && !fresh) { showControls(); }
    });
    function showControls() {
        var c = $("#controls");
        if (!c) { return; }
        c.classList.add("on");
        clearTimeout(showControls.t);
        showControls.t = setTimeout(function () { c.classList.remove("on"); }, 14000);
    }
    document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("#controls")) { $("#controls").classList.remove("on"); } if (e.target.closest && e.target.closest(".world-hint")) { showControls(); } });

    // для отладки и снимков экрана
    window.__G = { mysteryHtml: function () { return mysteryHtml(); }, solveMystery: function () { return solveMystery(); }, world: window.WORLD, openVoices: openVoices, rv: rv, st: st, render: renderScene, openJournal: openJournal, openQuest: openQuest, openSign: openSign, openShop: openShop, takeErrand: takeErrandNow, renderInv: renderInv, talk: talk, go: go, begin: begin, save: save, startFinale: startFinale, seeText: seeText };
})();
