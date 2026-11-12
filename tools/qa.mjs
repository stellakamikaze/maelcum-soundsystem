#!/usr/bin/env node
// QA visivo: Chrome headless via DevTools Protocol. Apre la pagina, (opz.) preme "Accendi",
// aspetta, cambia inquadratura, scatta screenshot e raccoglie gli errori della console.
// Uso: node tools/qa.mjs <url> <cartella> [larghezza x altezza] [--accendi] [--attesa=secondi] [--vista=mixer,sessione,impianto,stack]
//      [--mani] [--fx] [--fps=secondi] [--perdi-contesto] [--senza-webgl] [--dpr=2] [--calma] [--fermo] [--costo] [--cpu=4] [--confronta=cartella]
// --calma chiede il movimento ridotto, --fermo non preme Play: insieme danno screenshot ripetibili.
// --confronta misura la differenza di pixel con gli screenshot dello stesso nome in un'altra cartella.
// --fps conta i frame e i render al secondo e legge renderer.info; stampa anche le richieste a /img/.
// QA_GL=metal usa la GPU del Mac, senza Chrome disegna in software.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const args = process.argv.slice(2);
const url = args[0] || "http://127.0.0.1:4174/";
const cartella = args[1] || "qa";
const dim = (args.find((a) => /^\d+x\d+$/.test(a)) || "1440x900").split("x").map(Number);
const accendi = args.includes("--accendi");
const viste = (args.find((a) => a.startsWith("--vista="))?.slice(8) || "").split(",").filter(Boolean);
// secondi d'attesa dopo "Accendi": sul sito vero gli stem (25 MB) arrivano dalla rete
const attesa = Number(args.find((a) => a.startsWith("--attesa="))?.slice(9) || 9) * 1000;
fs.mkdirSync(cartella, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profilo = fs.mkdtempSync(path.join(os.tmpdir(), "qa-chrome-"));
const porta = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${porta}`, `--user-data-dir=${profilo}`,
  `--window-size=${dim[0]},${dim[1]}`, "--autoplay-policy=no-user-gesture-required",
  `--host-resolver-rules=${process.env.QA_RESOLVE || ""}`, ...(process.env.QA_GL ? [`--use-angle=${process.env.QA_GL}`] : ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]), "--ignore-gpu-blocklist", "--no-first-run",
  "about:blank",
], { stdio: "ignore" });

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 50 && !ws; i++) {
  await attendi(200);
  try {
    const lista = await (await fetch(`http://127.0.0.1:${porta}/json`)).json();
    const pagina = lista.find((t) => t.type === "page");
    if (pagina) ws = new WebSocket(pagina.webSocketDebuggerUrl);
  } catch { /* Chrome non ancora pronto */ }
}
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const attese = new Map();
const console_ = [];
const immagini = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && attese.has(m.id)) {
    attese.get(m.id)(m);
    attese.delete(m.id);
  } else if (m.method === "Runtime.consoleAPICalled") {
    console_.push(`[${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
  } else if (m.method === "Runtime.exceptionThrown") {
    console_.push(`[eccezione] ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  } else if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/img/")) {
    immagini.push(m.params.request.url);
  } else if (m.method === "Network.responseReceived" && m.params.response.status >= 400) {
    console_.push(`[rete ${m.params.response.status}] ${m.params.response.url}`);
  } else if (m.method === "Log.entryAdded") {
    console_.push(`[log ${m.params.entry.level}] ${m.params.entry.text}`);
  }
});
const cdp = (method, params = {}) => new Promise((r) => {
  const n = ++id;
  attese.set(n, r);
  ws.send(JSON.stringify({ id: n, method, params }));
});
const valuta = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const scatta = async (nome) => {
  const r = await cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(cartella, `${nome}.png`), Buffer.from(r.result.data, "base64"));
  console.log(`screenshot: ${path.join(cartella, nome)}.png`);
};

await cdp("Runtime.enable");
await cdp("Log.enable");
await cdp("Page.enable");
await cdp("Network.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: dim[0], height: dim[1], deviceScaleFactor: Number(args.find((a) => a.startsWith("--dpr="))?.slice(6) || 1), mobile: dim[0] < 600 });
// --cpu=4 rallenta la CPU di quattro volte, come un telefono di fascia media; sotto 600 px di larghezza il tocco è attivo
const freno = Number(args.find((a) => a.startsWith("--cpu="))?.slice(6) || 1);
if (freno > 1) await cdp("Emulation.setCPUThrottlingRate", { rate: freno });
if (dim[0] < 600) await cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
if (args.includes("--calma")) await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
// --senza-webgl: il canvas rifiuta il contesto 3D, come su un browser senza WebGL
if (args.includes("--senza-webgl")) {
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: "const vero = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (tipo, ...resto) { return /webgl/.test(tipo) ? null : vero.call(this, tipo, ...resto); };" });
}
await cdp("Page.navigate", { url });
await attendi(5000);
// sito con cancello: la password arriva dalla variabile d'ambiente QA_PASSWORD, mai da argv
if (process.env.QA_PASSWORD && (await valuta("!!document.querySelector('form[action=\"/entra\"]')"))) {
  await valuta(`(() => { document.querySelector('#password').value = ${JSON.stringify(process.env.QA_PASSWORD)}; document.querySelector('form').submit(); })()`);
  await attendi(6000);
  console.log("accesso:", await valuta("document.title"));
}
console.log("isolata:", await valuta("crossOriginIsolated"));
await scatta(`avvio-${dim[0]}`);
if (accendi) {
  await valuta("document.querySelector('#accendi').click()");
  await attendi(attesa);
  if (!args.includes("--fermo")) await valuta("document.querySelector('#tutti').click()"); // Accendi carica soltanto: il suono parte da Play
  await attendi(2000);
  await scatta(`sessione-${dim[0]}`);
  for (const v of viste) {
    await valuta(`document.querySelector('[data-vista=${v}]')?.click()`);
    await attendi(3500);
    await scatta(`${v}-${dim[0]}`);
  }
  if (args.includes("--mani")) {
    // mani vere: mouse sul fader del CDJ 2 (basso) fino in fondo, poi KILL fisso sulla via SUB
    await valuta("document.querySelector('[data-vista=mixer]')?.click()");
    await attendi(3000);
    const schermo = async (id, dy = 0) => JSON.parse(await valuta(`(() => { const { camera, visivi, THREE } = window.maelcum; const p = visivi.get(${JSON.stringify(id)}).presa; p.updateWorldMatrix(true, false); const v = p.localToWorld(new THREE.Vector3(0, ${dy}, 0)).project(camera); return JSON.stringify({ x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }); })()`));
    const mouse = (type, { x, y }) => cdp("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse" });
    const piccoBasso = async () => { let m = 0; for (let k = 0; k < 10; k++) { m = Math.max(m, await valuta("window.maelcum.motore.meter.deck[1].livello")); await attendi(100); } return m; };
    const prima = await piccoBasso();
    const su = await schermo("CDJ 2|FADER", 0.03);
    const giu = await schermo("CDJ 2|FADER", -0.06);
    await mouse("mousePressed", su);
    for (let k = 1; k <= 10; k++) await mouse("mouseMoved", { x: su.x + (giu.x - su.x) * k / 10, y: su.y + (giu.y - su.y) * k / 10 });
    await mouse("mouseReleased", giu);
    await attendi(1500);
    const fader = await valuta("window.maelcum.mani.valori.get('CDJ 2|FADER')");
    const dopo = await piccoBasso();
    console.log(`mani: fader CDJ 2 = ${fader?.toFixed(1)} %, livello del basso ${prima?.toFixed(3)} -> ${dopo?.toFixed(5)}`);
    const kill = await schermo("5-WAY|SUB|KILL", 0.003);
    await mouse("mousePressed", kill);
    await mouse("mouseReleased", kill);
    await attendi(500);
    console.log("mani: KILL SUB =", await valuta("window.maelcum.mani.valori.get('5-WAY|SUB|KILL')"));
    await scatta(`mani-${dim[0]}`);
  }
  if (args.includes("--fx")) {
    // mandata della melodica al bus 1 (eco), poi SELF del ritorno 1 quasi aperto: l'eco deve tornare
    const rit = async () => { let m = 0; for (let k = 0; k < 12; k++) { m = Math.max(m, await valuta("window.maelcum.motore.meter.ritorni[0]")); await attendi(150); } return m; };
    const zero = await rit();
    await valuta("(() => { const m = window.maelcum.mani; m.imposta('CDJ 4|FX1', 1); m.imposta('CDJ 3|FX1', 1); })()");
    await attendi(2500);
    const eco = await rit();
    await valuta("window.maelcum.mani.imposta('FX — 4 RITORNI|RET 1|SELF', 92)");
    await attendi(3000);
    const anello = await rit();
    const db = (x) => (20 * Math.log10(Math.max(x, 1e-9)) + 24).toFixed(1);
    console.log(`fx: ritorno 1 a vuoto ${db(zero)} dBu, con le mandate ${db(eco)} dBu, con SELF al 92 % ${db(anello)} dBu`);
  }
  console.log("audio:", await valuta("(() => { const m = window.maelcum?.motore; return m ? JSON.stringify({ stato: m.ctx.state, fs: m.ctx.sampleRate, deck: m.meter.deck, five: m.meter.five, master: m.meter.master, buchi: m.meter.buchi }) : 'motore assente'; })()"));
  console.log("stato:", await valuta("document.querySelector('#stato').textContent"));
  console.log("deck:", await valuta("[...document.querySelectorAll('.deck .titolo')].map(e=>e.textContent.trim()).join(' | ')"));
}
// frame e render al secondo: i frame dicono quanto regge il browser, i render quanto disegna la pagina
const misura = async (nome, secondi) => {
  const r = JSON.parse(await valuta(`new Promise((fine) => {
    const info = window.maelcum?.renderer?.info;
    const disegni = () => window.maelcum?.disegni?.() ?? 0;
    const r0 = disegni();
    let n = 0;
    const t0 = performance.now();
    const giro = () => { n++; if (performance.now() - t0 < ${secondi * 1000}) requestAnimationFrame(giro); else {
      const s = (performance.now() - t0) / 1000;
      fine(JSON.stringify({ fps: n / s, render: info ? (disegni() - r0) / s : null, chiamate: info?.render.calls ?? null, triangoli: info?.render.triangles ?? null, texture: info?.memory.textures ?? null }));
    } };
    requestAnimationFrame(giro);
  })`));
  const n = (x, d = 1) => (x === null ? "n.d." : x.toFixed(d));
  console.log(`fps (${nome}): ${n(r.fps)} frame/s, ${n(r.render)} render/s, ${n(r.chiamate, 0)} draw call, ${n(r.triangoli, 0)} triangoli, ${n(r.texture, 0)} texture`);
};
const secondiFps = Number(args.find((a) => a.startsWith("--fps="))?.slice(6) || 0);
if (secondiFps > 0) {
  if (accendi) await misura("in Play", secondiFps);
  if (accendi) {
    await valuta("document.querySelector('#tutti').click()");
    await attendi(1500);
  }
  await misura("a riposo", secondiFps);
  console.log(`immagini: ${immagini.length} richieste a /img/`);
  console.log("qualità:", await valuta("document.querySelector('#scena').dataset.qualita ?? document.body.dataset.scena"));
}
if (args.includes("--perdi-contesto")) {
  const esito = await valuta(`new Promise((fine) => {
    const gl = window.maelcum?.renderer?.getContext();
    const est = gl?.getExtension("WEBGL_lose_context");
    if (!est) return fine("estensione assente");
    est.loseContext();
    setTimeout(() => {
      const avviso = document.querySelector("#stato").textContent;
      est.restoreContext();
      setTimeout(() => fine(JSON.stringify({ avviso, dopo: document.querySelector("#stato").textContent, perso: gl.isContextLost() })), 1500);
    }, 800);
  })`);
  console.log("contesto perso:", esito);
  await scatta(`contesto-${dim[0]}`);
}
if (args.includes("--costo")) {
  // Costo di un disegno: 40 disegni forzati, ognuno atteso fino alla fine del lavoro della scheda grafica.
  // Non dipende dal vsync né da quanto si muove la scena: dice quanto pesa un frame.
  const r = JSON.parse(await valuta(`(() => {
    const { renderer, forza } = window.maelcum;
    if (!forza) return JSON.stringify({ errore: "la scena non espone forza()" });
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    const giro = () => { forza(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    for (let k = 0; k < 5; k++) giro();
    const tempi = [];
    for (let k = 0; k < 40; k++) { const t = performance.now(); giro(); tempi.push(performance.now() - t); }
    tempi.sort((a, b) => a - b);
    return JSON.stringify({ mediana: tempi[20], minimo: tempi[0], chiamate: renderer.info.render.calls, pixel: gl.drawingBufferWidth * gl.drawingBufferHeight });
  })()`));
  console.log(r.errore ? `costo: ${r.errore}` : `costo: mediana ${r.mediana.toFixed(1)} ms a disegno (minimo ${r.minimo.toFixed(1)}), ${r.chiamate} draw call, ${(r.pixel / 1e6).toFixed(2)} milioni di pixel`);
}
const riferimento = args.find((a) => a.startsWith("--confronta="))?.slice(12);
if (riferimento) {
  // differenza di pixel, contata dal browser: nessuna dipendenza in più
  for (const nome of fs.readdirSync(cartella).filter((f) => f.endsWith(".png") && fs.existsSync(path.join(riferimento, f)))) {
    const b64 = (f) => fs.readFileSync(f).toString("base64");
    const r = JSON.parse(await valuta(`(async () => {
      const carica = async (b) => { const i = new Image(); i.src = "data:image/png;base64," + b; await i.decode(); const c = new OffscreenCanvas(i.width, i.height); const g = c.getContext("2d"); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height); };
      const [a, b] = await Promise.all([carica(${JSON.stringify(b64(path.join(cartella, nome)))}), carica(${JSON.stringify(b64(path.join(riferimento, nome)))})]);
      if (a.width !== b.width || a.height !== b.height) return JSON.stringify({ errore: "misure diverse" });
      let somma = 0, oltre = 0;
      for (let k = 0; k < a.data.length; k += 4) {
        const d = Math.max(Math.abs(a.data[k] - b.data[k]), Math.abs(a.data[k + 1] - b.data[k + 1]), Math.abs(a.data[k + 2] - b.data[k + 2]));
        somma += d;
        if (d > 8) oltre++;
      }
      const n = a.data.length / 4;
      return JSON.stringify({ media: somma / n, oltre: 100 * oltre / n });
    })()`));
    console.log(`confronto ${nome}: ${r.errore ?? `differenza media ${r.media.toFixed(2)} su 255, ${r.oltre.toFixed(2)} % dei pixel oltre 8`}`);
  }
}
fs.writeFileSync(path.join(cartella, "console.txt"), console_.join("\n") + "\n");
console.log(`console: ${console_.length} righe -> ${path.join(cartella, "console.txt")}`);
ws.close();
chrome.kill();
await attendi(500);
try { fs.rmSync(profilo, { recursive: true, force: true }); } catch { /* Chrome tiene ancora file aperti */ }
process.exit(0);
