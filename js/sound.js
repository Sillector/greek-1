// Звук: синтез WebAudio, без файлов. Включается только после клика игрока.
var SOUND = (function () {
    var ctx = null, master = null, amb = null, on = true, cicadaTimer = null;

    function init() {
        if (ctx) { return; }
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { return; }
        try { ctx = new AC(); } catch (e) { ctx = null; return; }
        master = ctx.createGain();
        master.gain.value = on ? 0.5 : 0;
        master.connect(ctx.destination);
    }

    function noiseBuffer(sec) {
        var b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
        var d = b.getChannelData(0);
        for (var i = 0; i < d.length; i++) { d[i] = Math.random() * 2 - 1; }
        return b;
    }

    function ambient() {
        if (!ctx || amb) { return; }
        // ветер
        var src = ctx.createBufferSource();
        src.buffer = noiseBuffer(4); src.loop = true;
        var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 500; bp.Q.value = 0.6;
        var g = ctx.createGain(); g.gain.value = 0.035;
        var lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
        var lg = ctx.createGain(); lg.gain.value = 220;
        lfo.connect(lg); lg.connect(bp.frequency);
        src.connect(bp); bp.connect(g); g.connect(master);
        src.start(); lfo.start();
        amb = { src: src, g: g };
        // цикады — короткие трели время от времени
        cicadaTimer = setInterval(function () { if (on && Math.random() < 0.5) { cicada(); } }, 4200);
    }

    function cicada() {
        if (!ctx) { return; }
        var t = ctx.currentTime;
        var o = ctx.createOscillator(); o.type = "square"; o.frequency.value = 4300 + Math.random() * 600;
        var am = ctx.createOscillator(); am.frequency.value = 38;
        var amg = ctx.createGain(); amg.gain.value = 0.5;
        var g = ctx.createGain(); g.gain.value = 0;
        var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3000;
        am.connect(amg); amg.connect(g.gain);
        o.connect(hp); hp.connect(g); g.connect(master);
        var dur = 1.2 + Math.random() * 1.5;
        var env = ctx.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.012, t + 0.3); env.gain.linearRampToValueAtTime(0, t + dur);
        g.disconnect(); g.connect(env); env.connect(master);
        o.start(t); am.start(t); o.stop(t + dur + 0.1); am.stop(t + dur + 0.1);
    }

    // щипок струны (Карплус — Стронг)
    function pluck(freq, when, vol) {
        if (!ctx || !on) { return; }
        var t = ctx.currentTime + (when || 0);
        var sr = ctx.sampleRate, n = Math.round(sr / freq), len = Math.round(sr * 1.6);
        var buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        var ring = new Float32Array(n);
        for (var i = 0; i < n; i++) { ring[i] = Math.random() * 2 - 1; }
        var p = 0;
        for (var k = 0; k < len; k++) {
            var nx = (p + 1) % n;
            var v = (ring[p] + ring[nx]) * 0.497;
            d[k] = ring[p]; ring[p] = v; p = nx;
        }
        var s = ctx.createBufferSource(); s.buffer = buf;
        var g = ctx.createGain(); g.gain.value = vol || 0.25;
        s.connect(g); g.connect(master); s.start(t);
    }

    function chord(notes, step) { notes.forEach(function (f, i) { pluck(f, i * (step || 0.07), 0.2); }); }

    function click() { pluck(880, 0, 0.08); }
    function blip() { pluck(660, 0, 0.12); pluck(990, 0.05, 0.08); }
    function seal() { chord([392, 494, 587, 784, 988], 0.09); }
    function success() { chord([523, 659, 784, 1047], 0.08); }
    function thud() {
        if (!ctx || !on) { return; }
        var t = ctx.currentTime;
        var o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.25);
        var g = ctx.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.32);
    }
    function page() {
        if (!ctx || !on) { return; }
        var t = ctx.currentTime;
        var s = ctx.createBufferSource(); s.buffer = noiseBuffer(0.3);
        var f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.setValueAtTime(1200, t); f.frequency.linearRampToValueAtTime(3000, t + 0.25);
        var g = ctx.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.28);
        s.connect(f); f.connect(g); g.connect(master); s.start(t);
    }

    // скрипка в финале: пила + вибрато + фильтр, простой вальс
    function violin() {
        if (!ctx || !on) { return; }
        var mel = [[659, 1], [587, 0.5], [523, 0.5], [587, 1], [659, 1], [784, 1.5], [659, 0.5], [587, 1], [523, 1], [494, 1], [523, 2],
            [659, 1], [587, 0.5], [523, 0.5], [587, 1], [659, 1], [880, 1.5], [784, 0.5], [659, 1], [587, 1], [523, 3]];
        var t = ctx.currentTime + 0.2, beat = 0.45;
        mel.forEach(function (n) {
            var dur = n[1] * beat;
            var o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = n[0];
            var vib = ctx.createOscillator(); vib.frequency.value = 5.5;
            var vg = ctx.createGain(); vg.gain.value = n[0] * 0.006;
            vib.connect(vg); vg.connect(o.frequency);
            var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200; lp.Q.value = 2;
            var g = ctx.createGain();
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.08); g.gain.setValueAtTime(0.06, t + dur - 0.08); g.gain.linearRampToValueAtTime(0, t + dur);
            o.connect(lp); lp.connect(g); g.connect(master);
            o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
            // аккомпанемент щипками
            pluck(n[0] / 2, t - ctx.currentTime, 0.08);
            t += dur;
        });
    }

    function setOn(v) {
        on = !!v;
        if (master) { master.gain.value = on ? 0.5 : 0; }
    }

    return {
        start: function () { init(); if (ctx && ctx.state === "suspended") { ctx.resume(); } },
        setOn: setOn, isOn: function () { return on; },
        click: click, blip: blip, seal: seal, success: success, thud: thud, page: page, violin: violin,
    };
})();

// Произношение: системный синтез речи el-GR. Женских персонажей — женским голосом, мужских — мужским.
// Голоса подгружаются поздно (особенно сетевые в Edge), поэтому выбор пересчитывается на каждом voiceschanged и перед каждой репликой.
var SPEECH = (function () {
    // известные греческие голоса (часть имени) -> пол. Edge: «Microsoft Athina Online (Natural) - Greek (Greece)», «Microsoft Nestoras Online (Natural) - Greek (Greece)»
    var KNOWN = {
        athina: "f", melina: "f", eleni: "f", maria: "f", sofia: "f", katerina: "f", ioanna: "f", dimitra: "f",
        stefanos: "m", nestoras: "m", nikos: "m", giorgos: "m", dimitris: "m", konstantinos: "m",
    };
    var greek = [], byGender = { f: null, m: null }, any = null, logged = false, lastSig = "";
    var prefs = { f: "", m: "" }; // ручной выбор из панели «Голоса»
    var listeners = [];

    function genderOf(v) {
        var n = (v.name || "").toLowerCase();
        for (var k in KNOWN) { if (n.indexOf(k) >= 0) { return KNOWN[k]; } }
        if (/female|woman|γυναίκ|жен/.test(n)) { return "f"; }
        if (/\bmale\b|\bman\b|άνδρ|муж/.test(n)) { return "m"; }
        return "?";
    }

    function pick() {
        if (!window.speechSynthesis) { return; }
        var vs = window.speechSynthesis.getVoices() || [];
        greek = vs.filter(function (v) { return /^el(-|_|$)/i.test(v.lang) || /greek/i.test(v.name); });
        // естественные (Natural/Online) звучат лучше — ставим их первыми, затем локальные
        greek.sort(function (a, b) {
            var na = /natural|online/i.test(a.name) ? 1 : 0, nb = /natural|online/i.test(b.name) ? 1 : 0;
            return nb - na || (b.localService ? 1 : 0) - (a.localService ? 1 : 0);
        });
        byGender = { f: null, m: null };
        greek.forEach(function (v) { var g = genderOf(v); if ((g === "f" || g === "m") && !byGender[g]) { byGender[g] = v; } });
        any = greek[0] || null;
        document.documentElement.classList.toggle("has-greek-voice", !!any);
        var sig = greek.map(function (v) { return v.name; }).join("|");
        if (vs.length && sig !== lastSig) {
            lastSig = sig;
            console.info("[Λεμονιές] греческие голоса: " + (greek.length ? greek.map(function (v) { return v.name + " (" + v.lang + ", пол: " + genderOf(v) + (v.localService ? ", локальный" : ", сетевой") + ")"; }).join("; ") : "не найдено — озвучки не будет"));
            listeners.forEach(function (f) { try { f(); } catch (e) { /* молча */ } });
        }
    }
    try {
        if (window.speechSynthesis) {
            pick();
            if (window.speechSynthesis.addEventListener) { window.speechSynthesis.addEventListener("voiceschanged", pick); }
            else { window.speechSynthesis.onvoiceschanged = pick; }
            // некоторые браузеры отдают голоса только через время и без события
            [300, 1000, 2500, 5000].forEach(function (ms) { setTimeout(pick, ms); });
        }
    } catch (e) { /* без речи */ }

    function byName(n) { for (var i = 0; i < greek.length; i++) { if (greek[i].name === n) { return greek[i]; } } return null; }

    // какой голос получит пол g: ручной выбор → голос нужного пола → любой греческий
    function voiceForGender(g) {
        var manual = g && prefs[g] ? byName(prefs[g]) : null;
        if (manual) { return { voice: manual, own: genderOf(manual) === g || genderOf(manual) === "?" ? true : genderOf(manual) === g, manual: true }; }
        if (g && byGender[g]) { return { voice: byGender[g], own: true }; }
        return { voice: byGender.m || byGender.f || any, own: false };
    }

    // who: { gender, pitch?, rate? } — житель; null — нейтральное чтение слова (мужской/нейтральный голос)
    function voiceFor(who) {
        var g = who && who.gender;
        var c = g ? voiceForGender(g) : { voice: byGender.m || any, own: true };
        var pitch = 1, rate = 0.85;
        if (who) {
            if (c.voice && genderOf(c.voice) !== g) {
                // нужного пола нет — заметно сдвигаем тон
                if (g === "f") { pitch = 1.55; rate = 0.93; }
                if (g === "m") { pitch = 0.82; }
            }
            if (who.pitch) { pitch *= (genderOf(c.voice || {}) !== g && g === "f") ? Math.max(0.97, who.pitch) : who.pitch; }
            if (who.rate) { rate = Math.max(rate, who.rate); }
        }
        return { voice: c.voice, pitch: Math.max(0.1, Math.min(2, pitch)), rate: rate };
    }

    function speak(text, c) {
        if (!c.voice) { return; }
        try {
            window.speechSynthesis.cancel();
            var u = new SpeechSynthesisUtterance(text);
            u.lang = c.voice.lang || "el-GR"; u.voice = c.voice; u.rate = c.rate; u.pitch = c.pitch;
            window.speechSynthesis.speak(u);
        } catch (e) { /* молча */ }
    }

    return {
        available: function () { pick(); return !!any; },
        voices: function () { return greek.map(function (v) { return { name: v.name, lang: v.lang, gender: genderOf(v), local: v.localService }; }); },
        hasFemale: function () { return !!byGender.f; },
        current: function (g) { var c = voiceForGender(g); return c.voice ? c.voice.name : ""; },
        choice: function (who) { pick(); var c = voiceFor(who); return c.voice ? { voice: c.voice.name, pitch: +c.pitch.toFixed(2), rate: c.rate } : null; },
        setPrefs: function (p) { prefs = { f: (p && p.f) || "", m: (p && p.m) || "" }; },
        onChange: function (f) { listeners.push(f); },
        say: function (text, who) { pick(); if (!any) { return; } speak(text, voiceFor(who)); },
        stop: function () { try { window.speechSynthesis.cancel(); } catch (e) { /* молча */ } },
    };
})();
