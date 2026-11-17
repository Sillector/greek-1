// Снимки экрана безголовым Chrome через CDP.
// node --experimental-websocket tools/shot.mjs plan.json outDir
// plan: { url, width, height, steps: [{ eval?, wait?, shot? }] }
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const [planFile, outDir] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
const port = plan.port || 9341;
const profile = path.join(os.tmpdir(), "lemonies-shot-profile-" + port);
const chromePaths = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"];
const exe = chromePaths.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--hide-scrollbars", "--disable-extensions", "--mute-audio", `--window-size=${plan.width || 1400},${plan.height || 900}`, "about:blank"], { stdio: "ignore" });

let ver = null;
for (let i = 0; i < 100 && !ver; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(300); }
}
if (!ver) { console.error("chrome не поднялся"); chrome.kill(); process.exit(1); }
const tgt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") { logs.push("EXCEPTION " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); }
    if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) { logs.push(m.params.type + ": " + m.params.args.map((a) => a.value ?? a.description).join(" ")); }
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") { logs.push("LOG " + m.params.entry.text + " " + (m.params.entry.url || "")); }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: plan.width || 1400, height: plan.height || 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: plan.url });
await sleep(1500);
for (const s of plan.steps) {
    if (s.width) { await send("Emulation.setDeviceMetricsOverride", { width: s.width, height: s.height || 900, deviceScaleFactor: 1, mobile: false }); }
    if (s.eval) {
        const r = await send("Runtime.evaluate", { expression: s.eval, awaitPromise: true, returnByValue: true });
        if (r.result?.exceptionDetails) { logs.push("EVAL ERROR in step " + JSON.stringify(s.eval).slice(0, 80) + ": " + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); }
        else if (s.print) { console.log("print:", JSON.stringify(r.result?.result?.value)); }
    }
    await sleep(s.wait ?? 500);
    if (s.shot) {
        const r = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(outDir, s.shot), Buffer.from(r.result.data, "base64"));
        console.log("shot", s.shot);
    }
}
console.log(logs.length ? "КОНСОЛЬ:\n" + logs.join("\n") : "консоль: без ошибок");
ws.close();
chrome.kill();
process.exit(0);
