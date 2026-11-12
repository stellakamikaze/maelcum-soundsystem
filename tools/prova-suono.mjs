#!/usr/bin/env node
// Prova reale del suono: Chrome headless, pagina vera, audio vero. Niente mock.
// Legge gli AnalyserNode con un suo calcolo, indipendente da quello della scena, e confronta
// i valori con la posizione delle membrane nella scena, frame per frame.
// Uso: node tools/prova-suono.mjs <url> <cartella> [--taratura] [--veleno] [--wav=<file audio di prova>]
// PROVA_GL=metal usa la GPU del Mac (60 fps); senza, Chrome disegna in software a circa 5 fps.
// --veleno: sostituisce alle membrane misurate la vecchia formula, inviluppo vero per un seno
// inventato. I controlli sulla forma d'onda devono fallire: se passano, la prova non vale.
// Esce 1 se un controllo fallisce, 2 se la pagina non c'è. L'esito completo sta in <cartella>/prova.json.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const url = args[0] || "http://127.0.0.1:4174/?scena=piena"; // ?scena=piena: il cortile in qualità alta, senza discesa automatica
const cartella = args[1] || "qa";
const TARATURA = args.includes("--taratura");
const VELENO = args.includes("--veleno");
const WAV = args.find((a) => a.startsWith("--wav="))?.slice(6);
fs.mkdirSync(cartella, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

async function apri({ w = 1280, h = 800, calma = false } = {}) {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), "prova-chrome-"));
  const porta = 9800 + Math.floor(Math.random() * 150);
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${porta}`, `--user-data-dir=${profilo}`, `--window-size=${w},${h}`,
    ...(process.env.PROVA_GL ? [`--use-angle=${process.env.PROVA_GL}`] : ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]), "--ignore-gpu-blocklist", "--no-first-run", "about:blank",
  ], { stdio: "ignore" });
  let ws;
  for (let i = 0; i < 50 && !ws; i++) {
    await attendi(200);
    try {
      const lista = await (await fetch(`http://127.0.0.1:${porta}/json`)).json();
      const p = lista.find((t) => t.type === "page");
      if (p) ws = new WebSocket(p.webSocketDebuggerUrl);
    } catch { /* non ancora pronto */ }
  }
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const attese = new Map();
  const eventi = new Map();
  const errori = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && attese.has(m.id)) { attese.get(m.id)(m); attese.delete(m.id); }
    else if (m.method === "Runtime.exceptionThrown") errori.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    else if (m.method && eventi.has(m.method)) eventi.get(m.method)(m.params);
  });
  const cdp = (method, params = {}) => new Promise((r) => {
    const n = ++id;
    attese.set(n, r);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const valuta = async (expr) => {
    const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "eccezione in pagina");
    return r.result?.result?.value;
  };
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  if (calma) await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await cdp("Page.navigate", { url });
  await attendi(4000);
  // Clic veri col mouse: la policy di autoplay del browser resta attiva e conta solo un gesto vero.
  const clicca = async (sel) => {
    const q = JSON.parse(await valuta(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); })()`));
    const base = { ...q, button: "left", clickCount: 1, pointerType: "mouse" };
    await cdp("Input.dispatchMouseEvent", { ...base, type: "mouseMoved", button: "none", clickCount: 0 });
    await cdp("Input.dispatchMouseEvent", { ...base, type: "mousePressed", buttons: 1 });
    await cdp("Input.dispatchMouseEvent", { ...base, type: "mouseReleased", buttons: 0 });
  };
  return {
    cdp, valuta, clicca, errori, eventi,
    scatta: async (nome) => {
      const r = await cdp("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(cartella, `${nome}.png`), Buffer.from(r.result.data, "base64"));
    },
    chiudi: () => { ws.close(); chrome.kill(); },
  };
}

// Campionatore in pagina: gira a ogni frame dopo la scena. Calcola da sé l'RMS dagli AnalyserNode
// e legge lo spostamento degli oggetti three.js delle membrane.
// La lettura avviene nello stesso istante della scena: la prova si aggancia a leggi() e rifà il conto
// sui campioni per conto suo. Più tardi il segnale a 50 Hz avrebbe già cambiato segno.
const CAMPIONA = (secondi) => `(async () => {
  const { motore, torri } = window.maelcum;
  const buf = new Float32Array(2048);
  const leggi = motore.vie.leggi;
  let misura = null;
  motore.vie.leggi = (dt) => {
    const fuori = leggi(dt);
    const n = Math.min(2048, Math.max(256, Math.round(dt * motore.ctx.sampleRate)));
    const punte = [];
    const rms = motore.vie.analisi.map((a) => {
      a.getFloatTimeDomainData(buf);
      let q = 0;
      let p = 0;
      for (let k = 0; k < 2048; k++) {
        q += buf[k] * buf[k];
        if (k >= 2048 - n && Math.abs(buf[k]) > Math.abs(p)) p = buf[k];
      }
      punte.push(p);
      return Math.sqrt(q / 2048);
    });
    misura = { rms, punte };
    return fuori;
  };
  const righe = [];
  const t0 = performance.now();
  const membrane = torri[0].membrane;
  const casse = torri[0].casse;
  while (performance.now() - t0 < ${secondi} * 1000) {
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    if (!misura) continue;
    // posizione col segno, lungo l'asse del cono, in frazioni di corsa
    const mem = membrane.map((m) => m.oggetto.position.clone().sub(m.riposo).dot(m.asse) / m.corsa);
    const legno = casse.map((c) => c.oggetto.position.distanceTo(c.riposo));
    const led = window.maelcum.meter.get("MASTER|METER L").accesi();
    righe.push({ t: performance.now() - t0, ...misura, mem, legno, led });
    misura = null;
  }
  motore.vie.leggi = leggi;
  return JSON.stringify(righe);
})()`;
const campiona = async (p, secondi) => JSON.parse(await p.valuta(CAMPIONA(secondi)));

const media = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const rmsVia = (righe, v) => Math.sqrt(media(righe.map((r) => r.rms[v] ** 2)));
const dbVie = (righe) => [0, 1, 2, 3, 4].map((v) => +db(rmsVia(righe, v)).toFixed(1));
const pearson = (x, y) => {
  const mx = media(x), my = media(y);
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; }
  return a / Math.sqrt(b * c || 1e-30);
};
// Medie su finestre di w frame: il livello e la corsa del cono si confrontano su tempi musicali.
const finestre = (a, w) => {
  const o = [];
  for (let i = 0; i + w <= a.length; i += w) o.push(media(a.slice(i, i + w)));
  return o;
};
const ass = (righe) => righe.flatMap((r) => r.mem.map(Math.abs));
const ordinato = (a, q) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)];

const esito = [];
function controllo(nome, ok, dettaglio) {
  esito.push({ nome, ok, dettaglio });
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}  ${dettaglio}`);
}
const dati = {};

// ---------------- pagina principale ----------------
const p = await apri();
const isolata = await p.valuta("crossOriginIsolated");
console.log("isolata:", isolata);
if (!isolata) {
  // Senza pagina non si prova niente: esce 2, così un server spento non sembra un veleno bocciato.
  console.error(`Pagina non raggiungibile o senza COOP/COEP: ${url}. Avvia la preview.`);
  p.chiudi();
  process.exit(2);
}
if ((await p.valuta("document.body.dataset.scena")) !== "piena") {
  // La prova misura le membrane delle torri: nella vista dall'alto non esistono.
  console.error(`La prova vuole il cortile: usa ?scena=piena (qualità alta, fissa) al posto di ${url}.`);
  p.chiudi();
  process.exit(2);
}
await p.clicca("#accendi");
for (let i = 0; i < 60; i++) {
  await attendi(500);
  if (await p.valuta("document.querySelector('#avvio').classList.contains('via')")) break;
}
await attendi(3000);

// 1. niente autoplay: acceso e carico, ma muto
const fermo = await campiona(p, 2);
const statoFermo = JSON.parse(await p.valuta("JSON.stringify({ ctx: maelcum.motore.ctx.state, suona: maelcum.motore.meter.deck.map((d) => d.suona), etichetta: document.querySelector('#tutti span').textContent })"));
controllo("niente autoplay: dopo Accendi i deck sono fermi", !statoFermo.suona.some(Boolean) && statoFermo.etichetta === "Play", JSON.stringify(statoFermo));
controllo("in silenzio gli analyser stanno sotto -100 dBFS", Math.max(...fermo.flatMap((r) => r.rms)) < 1e-5, `rms massimo ${Math.max(...fermo.flatMap((r) => r.rms)).toExponential(1)}`);
controllo("in silenzio le membrane stanno a riposo", Math.max(...ass(fermo)) < 1e-6, `spostamento massimo ${Math.max(...ass(fermo)).toExponential(1)} corse, ${fermo.length} frame`);
await p.scatta("1-fermo");

// 2. Play: l'analyser si muove e le membrane lo seguono
await p.clicca("#tutti");
await attendi(2500);
const suona = await campiona(p, TARATURA ? 40 : 14);
dati.suona = suona;
if (VELENO) {
  const FREQ = [9, 13, 21, 29, 37];
  for (const r of suona) r.mem = r.rms.map((x, v) => {
    const e = Math.min(1, Math.max(0, (db(x) + 49) / 24));
    return 0.55 * e + 0.45 * e * Math.sin((r.t / 1000) * Math.PI * 2 * FREQ[v]);
  });
}
console.log(`frame campionati: ${suona.length}, ${(suona.length / (suona.at(-1).t / 1000)).toFixed(1)} al secondo`);
console.log("rms per via (dBFS):", dbVie(suona).join("  "), " ", ["SUB", "KICK", "MID", "HIGH", "SUPER"].join(" "));
if (TARATURA) {
  const p95 = [0, 1, 2, 3, 4].map((v) => +db(ordinato(suona.map((r) => r.rms[v]), 0.95)).toFixed(1));
  console.log("TARATURA 95° percentile dBFS:", p95.join(", "));
}
for (let v = 0; v < 5; v++) {
  const rms = suona.map((r) => r.rms[v]);
  const nome = ["SUB", "KICK", "MID", "HIGH", "SUPER"][v];
  const dbv = rms.map(db);
  const varia = ordinato(dbv, 0.9) - ordinato(dbv, 0.1);
  const w = Math.max(3, Math.round(suona.length / (suona.at(-1).t / 1000) / 5)); // circa 200 ms
  const rLiv = pearson(finestre(dbv, w), finestre(suona.map((x) => Math.abs(x.mem[v])), w));
  // Variazioni fra frame consecutivi: tolgono l'inviluppo lento, resta il tremito. Un seno inventato dà zero.
  const delta = (a) => a.slice(1).map((x, i) => x - a[i]);
  const rOnda = pearson(delta(suona.map((x) => x.punte[v])), delta(suona.map((x) => x.mem[v])));
  controllo(`${nome}: il valore dell'analyser cambia col brano`, varia > 3, `escursione 10-90% ${varia.toFixed(1)} dB`);
  controllo(`${nome}: la corsa della membrana segue il livello`, rLiv > 0.6, `Pearson ${rLiv.toFixed(2)} su finestre di ${w} frame`);
  controllo(`${nome}: la membrana segue la forma d'onda col suo segno`, rOnda > 0.5, `Pearson ${rOnda.toFixed(2)} su ${rms.length} frame, corsa media ${media(suona.map((x) => Math.abs(x.mem[v]))).toFixed(3)}`);
}
const ledDist = suona.map((r) => r.led);
controllo("i LED del master seguono il segnale", Math.max(...ledDist) - Math.min(...ledDist) >= 2 && Math.max(...ledDist) > 0, `LED accesi da ${Math.min(...ledDist)} a ${Math.max(...ledDist)} di 20`);
await p.scatta("2-play");

// 3. i comandi agiscono sul suono: stessa misura prima e dopo, sulla sola via interessata
const ATTESA_AB = 10;
const giro = async (nome, id, valore, via, attesoCalo) => {
  const ripristino = await p.valuta(`maelcum.mani.valori.get(${JSON.stringify(id)})`);
  // prima e dopo si misurano sugli stessi secondi del brano: i deck si riavvolgono
  const daCapo = async () => { await p.valuta("maelcum.motore.play([0, 1, 2, 3], true, true)"); await attendi(400); };
  await daCapo();
  const prima = await campiona(p, ATTESA_AB);
  await p.valuta(`maelcum.mani.imposta(${JSON.stringify(id)}, ${valore})`);
  await attendi(200);
  await daCapo();
  const dopo = await campiona(p, ATTESA_AB);
  await p.valuta(`maelcum.mani.imposta(${JSON.stringify(id)}, ${ripristino})`);
  await attendi(300);
  const a = db(rmsVia(prima, via)), b = db(rmsVia(dopo, via));
  const memA = media(prima.map((r) => Math.abs(r.mem[via]))), memB = media(dopo.map((r) => Math.abs(r.mem[via])));
  controllo(nome, a - b > attesoCalo, `via ${via}: ${a.toFixed(1)} -> ${b.toFixed(1)} dBFS, membrana ${memA.toFixed(3)} -> ${memB.toFixed(3)} corse; tutte le vie dopo: ${dbVie(dopo).join(" ")}`);
  return { prima, dopo };
};
await giro("KILL SUB del 5-way toglie la via SUB", "5-WAY|SUB|KILL", 1, 0, 10);
await giro("fader del basso (CDJ 2) abbassa il SUB", "CDJ 2|FADER", 0, 0, 6);
await giro("fader della batteria (CDJ 1) abbassa la via SUPER, dove stanno i piatti", "CDJ 1|FADER", 0, 4, 6);
await giro("fader delle melodie (CDJ 4) abbassa le trombe medie", "CDJ 4|FADER", 0, 2, 3);
{
  const prima = await campiona(p, 3);
  const led0 = media(prima.map((r) => r.led));
  const master = await p.valuta("maelcum.mani.valori.get('MASTER|MASTER')");
  await p.valuta("maelcum.mani.imposta('MASTER|MASTER', 0)");
  await attendi(1200);
  const dopo = await campiona(p, 3);
  await p.valuta(`maelcum.mani.imposta('MASTER|MASTER', ${master})`);
  await attendi(800);
  controllo("MASTER a zero porta a zero analyser, membrane e LED", Math.max(...dopo.flatMap((r) => r.rms)) < 1e-3 && media(ass(dopo)) < 0.02 && media(dopo.map((r) => r.led)) < led0, `rms ${dbVie(prima).join(" ")} -> ${dbVie(dopo).join(" ")}; LED ${led0.toFixed(1)} -> ${media(dopo.map((r) => r.led)).toFixed(1)}; membrane ${media(ass(dopo)).toFixed(4)}`);
}

// 4. pausa: gli stem restano a fase
await p.clicca("#tutti");
await attendi(1500);
const posizioni = JSON.parse(await p.valuta("JSON.stringify(maelcum.motore.meter.deck.map((d) => d.pos))"));
const dopoPausa = await campiona(p, 2);
controllo("Pausa: i quattro deck si fermano sullo stesso campione", new Set(posizioni).size === 1, posizioni.join(" "));
controllo("Pausa: analyser e membrane tornano a zero", Math.max(...dopoPausa.slice(-5).flatMap((r) => r.rms)) < 1e-5 && Math.max(...ass(dopoPausa.slice(-5))) < 0.01, `ultimo frame: membrane ${dopoPausa.at(-1).mem.map((x) => x.toFixed(3)).join(" ")}`);

// 5. scelta della traccia
await p.clicca("#apri-tracce");
await attendi(800);
await p.scatta("3-tracce");
await p.clicca("[data-traccia=riddim]");
await attendi(4000);
const titoli = await p.valuta("[...document.querySelectorAll('.deck strong')].map((e) => e.textContent).join(' | ')");
const ferma = await p.valuta("maelcum.motore.meter.deck.some((d) => d.suona)");
const scelta = await p.valuta("document.querySelector('[data-traccia=riddim]').getAttribute('aria-pressed')");
await p.clicca("#tutti");
await attendi(2500);
const riddim = await campiona(p, 5);
controllo("Traccia: il riddim si carica fermo e suona col Play", titoli.includes("Melodica") && scelta === "true" && !ferma && db(rmsVia(riddim, 0)) > -50, `${titoli}; SUB ${db(rmsVia(riddim, 0)).toFixed(1)} dBFS`);
await p.clicca("#tutti");
await attendi(1000);
if (WAV) {
  await p.cdp("Page.setInterceptFileChooserDialog", { enabled: true });
  const scelto = new Promise((r) => p.eventi.set("Page.fileChooserOpened", r));
  await p.clicca("[data-traccia=file]");
  const { backendNodeId } = await scelto;
  await p.cdp("DOM.enable");
  await p.cdp("DOM.setFileInputFiles", { files: [path.resolve(WAV)], backendNodeId });
  await attendi(2500);
  const nomi = await p.valuta("[...document.querySelectorAll('.deck strong')].map((e) => e.textContent).join(' | ')");
  await p.clicca("#tutti");
  await attendi(2000);
  const file = await campiona(p, 3);
  controllo("Traccia: un file sta sul deck 1 e suona, gli altri sono vuoti", nomi.split(" | ").slice(1).every((n) => n === "vuoto") && Math.max(...dbVie(file)) > -60, `${nomi}; vie ${dbVie(file).join(" ")}`);
  await p.clicca("#tutti");
}
controllo("nessuna eccezione in pagina", p.errori.length === 0, p.errori.join(" / ") || "0");
p.chiudi();

// ---------------- riduzione del movimento ----------------
const q = await apri({ calma: true });
await q.clicca("#accendi");
for (let i = 0; i < 60; i++) {
  await attendi(500);
  if (await q.valuta("document.querySelector('#avvio').classList.contains('via')")) break;
}
await attendi(1000);
await q.clicca("#tutti");
await attendi(3000);
const calma = await campiona(q, 8);
const salti = [];
for (let i = 1; i < calma.length; i++) salti.push(Math.abs(calma[i].mem[1] - calma[i - 1].mem[1]));
const salto = media(salti);
const passi = [];
for (let i = 1; i < suona.length; i++) passi.push(Math.abs(suona[i].mem[1] - suona[i - 1].mem[1]));
const camera = await q.valuta("JSON.stringify(maelcum.camera.position.toArray().map((v) => +v.toFixed(3)))");
await attendi(1000);
const camera2 = await q.valuta("JSON.stringify(maelcum.camera.position.toArray().map((v) => +v.toFixed(3)))");
controllo("riduzione: il media query è letto dalla pagina", await q.valuta("maelcum.calma.matches"), "matches true");
controllo("riduzione: il legno delle casse non trema", Math.max(...calma.flatMap((r) => r.legno)) === 0, `massimo ${Math.max(...calma.flatMap((r) => r.legno))} m (a movimento pieno ${Math.max(...suona.flatMap((r) => r.legno)).toFixed(5)} m)`);
controllo("riduzione: la membrana non vibra", salto < media(passi) / 5, `salto medio fra frame ${salto.toFixed(4)} corse contro ${media(passi).toFixed(4)} a movimento pieno`);
controllo("riduzione: la membrana segue ancora il livello", media(calma.map((r) => r.mem[1])) > 0.03, `spostamento medio ${media(calma.map((r) => r.mem[1])).toFixed(3)} corse`);
controllo("riduzione: la camera non vola", camera === camera2, camera);
q.chiudi();

fs.writeFileSync(path.join(cartella, "prova.json"), JSON.stringify({ esito, dati }, null, 0));
const falliti = esito.filter((e) => !e.ok).length;
console.log(`\n${esito.length - falliti}/${esito.length} PASS`);
process.exit(falliti ? 1 : 0);
