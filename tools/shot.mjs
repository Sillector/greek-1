// Снимки и проверка проходимости собранной игры в безголовом Chrome (WebGL через SwiftShader).
// Запуск: node --experimental-websocket tools/shot.mjs <slug> [план.json] [--port 9361]
//   без плана — обход по умолчанию: обложка, вступление, каждая открытая зона, каждый житель в разговоре,
//   табличка вблизи, дневник, текст главной задачи, финал; плюс WORLD.debug.reach() — дойдёт ли герой до всех.
// Снимки: quests/<slug>/_shots/. Порт по умолчанию 9360 (свободные 9360–9369), профиль — во временной папке.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const slug = args[0];
if (!slug) { console.error("использование: node --experimental-websocket tools/shot.mjs <slug> [plan.json] [--port N]"); process.exit(2); }
const portArg = args.indexOf("--port");
const port = portArg > 0 ? +args[portArg + 1] : 9360;
const planFile = args[1] && !args[1].startsWith("--") ? args[1] : null;
const game = path.join(ROOT, "games", slug, "index.html");
if (!fs.existsSync(game)) { console.error("нет сборки: " + game + " — сначала node tools/build.js " + slug); process.exit(2); }
const outDir = path.join(ROOT, "quests", slug, "_shots");
fs.mkdirSync(outDir, { recursive: true });
const quest = JSON.parse(fs.readFileSync(path.join(ROOT, "quests", slug, "quest.json"), "utf8"));

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => fs.existsSync(p));
if (!CHROME) { console.error("Chrome не найден"); process.exit(2); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "game-greek-shot-"));
const W0 = 1400, H0 = 900;
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--allow-file-access-from-files", `--window-size=${W0},${H0}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let k = 0; k < 200 && !target; k++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); target = list.find((t) => t.type === "page"); } catch (e) { /* ждём */ }
    if (!target) { await sleep(250); }
}
if (!target) { console.error("Chrome не поднял порт " + port); chrome.kill(); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map(), logs = [];
ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") { logs.push("EXCEPTION " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); }
    if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) { logs.push(m.params.type + " " + m.params.args.map((a) => a.value || a.description).join(" ")); }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expr) {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) { logs.push("EVAL " + expr.slice(0, 60) + ": " + (r.result.exceptionDetails.exception?.description || "").split("\n")[0]); return undefined; }
    return r.result?.result?.value;
}
async function shot(name) {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(outDir, name), Buffer.from(r.result.data, "base64"));
    console.log("снимок", path.join("quests", slug, "_shots", name));
}
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W0, height: H0, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: pathToFileURL(game).href });
// ждём сборку мира
for (let k = 0; k < 120; k++) { if (await ev("window.WORLD && (WORLD.ok || WORLD.error) ? 1 : 0")) { break; } await sleep(500); }
const err0 = await ev("WORLD.error || ''");
if (err0) { console.log("МИР НЕ ПОСТРОИЛСЯ: " + err0); }
await ev(`try{localStorage.removeItem(QUEST.meta.saveKey)}catch(e){};1`);

const H = `window.__s=(t)=>new Promise(r=>setTimeout(r,t));`;
await ev(H);
let steps;
if (planFile) { steps = JSON.parse(fs.readFileSync(planFile, "utf8")).steps; }
else {
    // обход по умолчанию
    const zones = quest.world.zones.filter((z) => z.kind !== "interior" && z.nav !== false).map((z) => z.id);
    const npcIds = Object.keys(quest.npcs);
    const signIds = Object.keys(quest.signs).filter((s) => quest.signs[s].place.mount !== "facade").slice(0, 2);
    // всё открыть, чтобы снять каждую зону и каждого жителя (замки в обходе не мешают)
    const openAll = `(()=>{var s=__G.st;QUEST.quests.forEach(q=>{if(!q.finale)s.quests[q.id]=1});__G.render();return 1})()`;
    steps = [
        { wait: 1500, shot: "01-cover.png" },
        { eval: `document.getElementById('btn-start').click();1`, wait: 900, shot: "02-intro.png" },
        { eval: `document.getElementById('story-next').click();1`, wait: 700, shot: "03-task-text.png" },
        { eval: `document.getElementById('story-next').click();document.getElementById('controls').classList.remove('on');1`, wait: 1500, shot: "04-start.png" },
        { eval: `JSON.stringify(WORLD.debug.reach().filter(x=>!x.ok))`, print: "НЕ ДОЙТИ" },
        { eval: openAll },
        ...zones.map((z, i) => ({ eval: `WORLD.debug.spawn(${JSON.stringify(z)});WORLD.snap();1`, wait: 1300, shot: `1${i}-zone-${z}.png` })),
        ...npcIds.map((n, i) => [{ eval: `(()=>{var p=WORLD.debug.npcPos(${JSON.stringify(n)});var z=QUEST.npcs[${JSON.stringify(n)}].zone;var zz=QUEST.world.zones.filter(x=>x.id==z)[0];if(zz.kind==='interior'){WORLD.debug.spawn(z)}else{WORLD.debug.place(p.x+1.4,p.z+1.4,0)};WORLD.snap();return 1})()`, wait: 900 },
            { eval: `WORLD.debug.click('npc',${JSON.stringify(n)});1`, wait: 2600, shot: `2${i}-talk-${n}.png` }]).flat(),
        ...signIds.map((s, i) => ({ eval: `(()=>{var a=WORLD.debug.sign(${JSON.stringify(s)});var zz=QUEST.world.zones.filter(x=>x.id==QUEST.signs[${JSON.stringify(s)}].place.zone)[0];WORLD.debug.place(a.x,a.z,0);WORLD.snap();return 1})()`, wait: 1600, shot: `3${i}-sign-${s}.png` })),
        { eval: `(()=>{var s=__G.st;QUEST.pages.forEach(p=>p.words.forEach(w=>s.seen[w]=1));__G.save();__G.openJournal('pages');return 1})()`, wait: 900, shot: "40-journal.png" },
        { eval: `(()=>{var s=__G.st;QUEST.pages.slice(0,-1).forEach(p=>s.sealed[p.id]=1);__G.openJournal('review');return 1})()`, wait: 900, shot: "41-review.png" },
        { eval: `(()=>{var s=__G.st;QUEST.pages.forEach(p=>s.sealed[p.id]=1);__G.openJournal('mystery');return 1})()`, wait: 900, shot: "42-task-translate.png" },
        { eval: `(()=>{document.querySelector('[data-close="#journal"]').click();var q=QUEST.quests.filter(x=>!x.finale)[0];__G.st.quests[q.id]=0;__G.openQuest(q.id);return 1})()`, wait: 900, shot: "43-request.png" },
        { eval: `(()=>{document.querySelectorAll('.overlay.on').forEach(o=>o.classList.remove('on'));document.body.classList.remove('modal');__G.startFinale();return 1})()`, wait: 3500, shot: "50-finale.png" },
    ];
}
for (const st of steps) {
    if (st.eval) { const v = await ev(st.eval); if (st.print) { console.log(st.print + ": " + v); } }
    if (st.size) { await send("Emulation.setDeviceMetricsOverride", { width: st.size[0], height: st.size[1], deviceScaleFactor: 1, mobile: false }); await sleep(600); }
    if (st.wait) { await sleep(st.wait); }
    if (st.shot) { await shot(st.shot); }
}
const stats = await ev("JSON.stringify(WORLD.stats())");
console.log("сцена:", stats);
console.log(logs.length ? "КОНСОЛЬ:\n" + logs.join("\n") : "КОНСОЛЬ: чисто");
ws.close();
chrome.kill();
await sleep(300);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome ещё держит файлы */ }
process.exit(0);
