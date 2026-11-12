import "@fontsource/big-shoulders-stencil-display/600";
import "@fontsource/big-shoulders-stencil-display/900";
import "@fontsource/big-shoulders-text/400";
import "@fontsource/big-shoulders-text/600";
import "./stile.css";
import * as THREE from "three";
import { costruisciLayout } from "./panel/layout";
import { creaMixer, type Visivo } from "./scene/mixer";
import { ricorda, sceltaIniziale, TELEFONO } from "./scene/qualita";
import { creaDiagnosi } from "./diagnosi";
import { creaLeggera } from "./scene/leggera";
import { creaPedali } from "./scene/pedali";
import type { Scena } from "./scene/scena";
import { creaInterazione, type Interazione } from "./scene/interazione";
import { Motore, picco } from "./engine/motore";
import { AUTORE, BPM as BPM_TRACCIA, caricaStem, STEM, stemPresenti, TITOLO } from "./audio/traccia";
import { BPM as BPM_RIDDIM, creaRiddim, NOMI_STEM } from "./audio/riddim";
import { NOMI_VIE, segui, statoVuoto } from "./audio/vie";
import type { Legame } from "./panel/binding";

const $ = <T extends HTMLElement>(sel: string): T => {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error(`manca ${sel}`);
  return e;
};

// Riduzione del movimento: si legge a ogni frame, così vale anche se cambia a pagina aperta.
const calma = window.matchMedia("(prefers-reduced-motion: reduce)");

// ---------------- scena ----------------
// Di default il cortile, alla qualità che il computer regge (scene/qualita.ts). La vista dall'alto
// ("minima") è l'ultimo gradino: la sceglie chi guarda, dal tasto in alto a destra.
const canvas = $<HTMLCanvasElement>("#scena");
const scelta = sceltaIniziale(new URLSearchParams(location.search));
const dallAlto = scelta.qualita === "minima";
const layout = costruisciLayout();
const mixer = creaMixer(layout, { leggero: dallAlto });
let avvisoGrafica = "";
const cambia = $<HTMLAnchorElement>("#cambia-scena");
async function creaScena(): Promise<Scena> {
  const contesto = { canvas, mixer, calma };
  if (scelta.qualita !== "minima") {
    try {
      return (await import("./scene/piena")).creaPiena(contesto, {
        gradino: scelta.qualita,
        sorveglia: scelta.sorveglia,
        ombreVive: new URLSearchParams(location.search).get("ombre") === "vive",
        suGradino: ricorda,
        suLenta: () => {
          avvisoGrafica = "Il cortile va a scatti su questo computer: prova la vista dall'alto.";
          $("#stato").textContent = avvisoGrafica;
          cambia.classList.add("consigliata");
        },
      });
    } catch {
      /* il cortile non parte: si prova la vista dall'alto */
    }
  }
  try {
    return creaLeggera(contesto);
  } catch {
    // senza WebGL il suono parte lo stesso: restano i deck, le tracce e i selettori
    avvisoGrafica = "Questo browser non apre la grafica 3D (WebGL): il suono funziona, i comandi del mixer no.";
    return { nome: "nessuna", camera: new THREE.OrthographicCamera(), renderer: null, torri: [], pedali: creaPedali().pedali, disattivaOrbita: () => {}, richiedi: () => {}, disegni: () => 0, aggiorna: () => {}, dopoAccensione: () => {} };
  }
}
const scena = await creaScena();
document.body.dataset.scena = scena.nome;
$("#stato").textContent = avvisoGrafica;
if (scena.nome === "piena") {
  cambia.textContent = "Dall'alto";
  cambia.href = "?qualita=minima";
} else {
  document.querySelectorAll("#viste button").forEach((b) => b.remove());
  cambia.textContent = "Cortile";
  cambia.href = "?qualita=bassa";
  canvas.setAttribute("aria-label", "Il mixer maelcum visto dall'alto, con i quattro pedali");
}
// La scheda grafica può chiudere la scena (memoria finita, driver): la pagina lo dice e aspetta che torni.
let graficaPersa = false;
canvas.addEventListener("webglcontextlost", (ev) => {
  ev.preventDefault();
  graficaPersa = true;
  avvisoGrafica = `La scheda grafica ha chiuso la scena: il suono continua.${scena.nome === "piena" ? " Se non torna, apri la vista dall'alto." : ""}`;
  $("#stato").textContent = avvisoGrafica;
});
canvas.addEventListener("webglcontextrestored", () => {
  graficaPersa = false;
  avvisoGrafica = "";
  $("#stato").textContent = "";
  scena.richiedi(true);
});

// ---------------- suggerimento ----------------
const sugg = $("#suggerimento");
function suggerisci(testo: string | null, x: number, y: number): void {
  if (!testo) {
    sugg.hidden = true;
    return;
  }
  sugg.hidden = false;
  sugg.textContent = testo;
  const w = sugg.offsetWidth;
  sugg.style.left = `${Math.min(x + 16, window.innerWidth - w - 8)}px`;
  sugg.style.top = `${Math.max(8, y - 38)}px`;
}

// ---------------- motore e mani ----------------
let motore: Motore | null = null;
const visivi = new Map<string, Visivo>(mixer.visivi);
for (const p of scena.pedali) visivi.set(p.id, p);
// ogni comando che si muove chiede un render: la vista leggera disegna solo allora
for (const v of visivi.values()) {
  const imposta = v.imposta;
  v.imposta = (x) => {
    imposta(x);
    scena.richiedi(true);
  };
}
const inCoda: { l: Legame; v: number }[] = [];
function manda(l: Legame, v: number): void {
  if (!l.dev) return;
  if (!motore) {
    inCoda.push({ l, v });
    return;
  }
  motore.param(l.dev, l.p, v, l.i);
}
const mani: Interazione = creaInterazione({
  camera: scena.camera,
  dom: canvas,
  visivi,
  manda,
  suggerisci,
  disattivaOrbita: scena.disattivaOrbita,
});

// ---------------- deck ----------------
interface Deck {
  el: HTMLElement;
  titolo: HTMLElement;
  tempo: HTMLElement;
  corsa: HTMLElement;
  livello: HTMLElement;
  play: HTMLButtonElement;
  nome: string;
}
const decks: Deck[] = [];
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = "audio/*";
const TUTTA_LA_TRACCIA = -1; // il file scelto dal tasto Traccia: va sul deck 1 e svuota gli altri
let deckScelto = 0;
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f && deckScelto === TUTTA_LA_TRACCIA) void caricaFile(f);
  else if (f) void carica(deckScelto, f);
  fileInput.value = "";
});
const ICONA_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="icona-pausa" d="M4 3h3v10H4zM9 3h3v10H9z"/><path class="icona-play" d="M4 2.5v11l9-5.5z"/></svg>';
const ICONA_CARICA = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 5.5 8 2l3.5 3.5M2.5 11v2.5h11V11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
for (let i = 0; i < 4; i++) {
  const el = document.createElement("div");
  el.className = "deck";
  el.dataset.deck = String(i);
  el.innerHTML = `<i class="livello"></i><span class="num">${i + 1}</span>
    <div class="titolo"><strong class="vuoto">vuoto</strong><span>–</span></div>
    <div class="azioni"><button type="button" class="play" aria-pressed="false" aria-label="Suona il deck ${i + 1}">${ICONA_PLAY}</button>
    <button type="button" class="carica" aria-label="Carica un file sul deck ${i + 1}">${ICONA_CARICA}</button></div>
    <div class="corsa"><i></i></div>`;
  $("#deck").append(el);
  const d: Deck = {
    el,
    titolo: el.querySelector("strong") as HTMLElement,
    tempo: el.querySelector(".titolo span") as HTMLElement,
    corsa: el.querySelector(".corsa i") as HTMLElement,
    livello: el.querySelector(".livello") as HTMLElement,
    play: el.querySelector(".play") as HTMLButtonElement,
    nome: "",
  };
  decks.push(d);
  d.play.addEventListener("click", () => {
    if (!motore) return;
    const on = d.play.getAttribute("aria-pressed") !== "true";
    motore.play([i], on);
  });
  (el.querySelector(".carica") as HTMLButtonElement).addEventListener("click", () => {
    deckScelto = i;
    fileInput.click();
  });
}

async function carica(i: number, f: File): Promise<void> {
  if (!motore) return;
  const d = decks[i];
  d.titolo.textContent = "carico…";
  try {
    const buf = await motore.ctx.decodeAudioData(await f.arrayBuffer());
    motore.caricaTraccia(i, buf);
    d.nome = f.name.replace(/\.[^.]+$/, "");
    d.titolo.textContent = d.nome;
    d.titolo.classList.remove("vuoto");
    motore.play([i], true, true);
  } catch {
    d.titolo.textContent = "file non leggibile";
    d.tempo.textContent = "prova un wav, mp3 o m4a";
  }
}

const rilascia = $("#rilascia");
window.addEventListener("dragover", (ev) => {
  ev.preventDefault();
  if (!motore) return;
  rilascia.hidden = false;
  const sotto = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>(".deck");
  decks.forEach((d) => d.el.classList.toggle("bersaglio", d.el === sotto));
});
window.addEventListener("dragleave", (ev) => {
  if (ev.relatedTarget === null) {
    rilascia.hidden = true;
    decks.forEach((d) => d.el.classList.remove("bersaglio"));
  }
});
window.addEventListener("drop", (ev) => {
  ev.preventDefault();
  rilascia.hidden = true;
  decks.forEach((d) => d.el.classList.remove("bersaglio"));
  const f = ev.dataTransfer?.files?.[0];
  const sotto = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>(".deck");
  if (f && sotto) void carica(Number(sotto.dataset.deck), f);
});

// ---------------- traccia ----------------
type IdTraccia = "brano" | "riddim" | "file";
const pannelloTracce = $("#tracce");
const elencoTracce = $("#elenco-tracce");
const apriTracce = $<HTMLButtonElement>("#apri-tracce");
const voci: { id: IdTraccia; titolo: string; nota: string }[] = [
  { id: "brano", titolo: TITOLO, nota: `${AUTORE}, ${STEM.length} stem` },
  { id: "riddim", titolo: "Riddim di prova", nota: `Sintetico, ${NOMI_STEM.length} stem` },
  { id: "file", titolo: "Un tuo file", nota: "Va sul deck 1, gli altri restano vuoti" },
];
const tastiTraccia = new Map<IdTraccia, HTMLButtonElement>();
for (const v of voci) {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.traccia = v.id;
  b.setAttribute("aria-pressed", "false");
  b.innerHTML = "<strong></strong><small></small>";
  (b.querySelector("strong") as HTMLElement).textContent = v.titolo;
  (b.querySelector("small") as HTMLElement).textContent = v.nota;
  b.addEventListener("click", () => {
    if (v.id === "file") {
      deckScelto = TUTTA_LA_TRACCIA;
      fileInput.click();
    } else void cambiaTraccia(v.id);
  });
  elencoTracce.append(b);
  tastiTraccia.set(v.id, b);
}
function segnaTraccia(id: IdTraccia): void {
  for (const [k, b] of tastiTraccia) b.setAttribute("aria-pressed", String(k === id));
}
function occupaTracce(on: boolean): void {
  for (const b of tastiTraccia.values()) b.disabled = on;
}

function mostraDeck(i: number, nome: string): void {
  const d = decks[i];
  d.nome = nome;
  d.titolo.textContent = nome || "vuoto";
  d.titolo.classList.toggle("vuoto", !nome);
  d.tempo.textContent = "–";
  d.corsa.style.width = "0";
}

// Carica una traccia base sui 4 deck e la lascia ferma: il suono parte solo col tasto Play.
async function caricaBase(id: "brano" | "riddim", avanza: (testo: string) => void): Promise<void> {
  const m = motore;
  if (!m) return;
  m.play([0, 1, 2, 3], false);
  let stem: AudioBuffer[] | null = null;
  let nomi = NOMI_STEM;
  let bpm = BPM_RIDDIM;
  let caricata: IdTraccia = "riddim";
  if (id === "brano") {
    try {
      stem = await caricaStem(m.ctx, (f) => avanza(`Carico ${TITOLO}… ${Math.round(f * 100)} %`));
      nomi = STEM.map((s) => s.nome);
      bpm = BPM_TRACCIA;
      caricata = "brano";
    } catch {
      $("#stato").textContent = `${TITOLO} non è disponibile: parte il riddim di prova.`;
    }
  }
  stem ??= await creaRiddim(m.ctx.sampleRate);
  m.tempoEco(bpm);
  const comune = Math.max(...stem.map(picco));
  stem.forEach((b, i) => {
    m.caricaTraccia(i, b, comune);
    mostraDeck(i, nomi[i]);
  });
  segnaTraccia(caricata);
}

async function cambiaTraccia(id: "brano" | "riddim"): Promise<void> {
  occupaTracce(true);
  await caricaBase(id, (testo) => (tastiTraccia.get(id)?.querySelector("small") as HTMLElement).replaceChildren(testo));
  const voce = voci.find((v) => v.id === id);
  if (voce) (tastiTraccia.get(id)?.querySelector("small") as HTMLElement).textContent = voce.nota;
  occupaTracce(false);
}

async function caricaFile(f: File): Promise<void> {
  const m = motore;
  if (!m) return;
  occupaTracce(true);
  try {
    const buf = await m.ctx.decodeAudioData(await f.arrayBuffer());
    m.play([0, 1, 2, 3], false);
    m.caricaTraccia(0, buf);
    mostraDeck(0, f.name.replace(/\.[^.]+$/, ""));
    for (let i = 1; i < 4; i++) {
      m.svuotaDeck(i);
      mostraDeck(i, "");
    }
    segnaTraccia("file");
  } catch {
    $("#stato").textContent = "File non leggibile: prova un wav, un mp3 o un m4a.";
  }
  occupaTracce(false);
}

const tasto = $<HTMLButtonElement>("#tutti");
tasto.addEventListener("click", () => {
  if (!motore) return;
  const on = !motore.meter.deck.some((d) => d.suona);
  motore.play([0, 1, 2, 3], on);
});
window.addEventListener("keydown", (ev) => {
  if (ev.code === "Space" && motore && document.activeElement === document.body) {
    ev.preventDefault();
    tasto.click();
  }
});

const micBtn = $<HTMLButtonElement>("#mic");
micBtn.addEventListener("click", async () => {
  if (!motore) return;
  const on = micBtn.getAttribute("aria-pressed") !== "true";
  try {
    await motore.microfono(on);
    micBtn.setAttribute("aria-pressed", String(on));
  } catch {
    $("#stato").textContent = "Microfono non disponibile: controlla il permesso del browser.";
  }
});

// ---------------- selettori del prototipo ----------------
interface Selettore {
  nome: string;
  scelte: string[];
  def: number;
  nota?: string;
  applica(v: number): void;
}
const tuttiCanali = (p: string) => (v: number) => motore?.param("channel", p, v);
const filtri = (p: string) => (v: number) => motore?.param("filtro", p, v);
const cinque = (p: string) => (v: number) => motore?.param("five", p, v);
const selettori: Selettore[] = [
  { nome: "5-way", scelte: ["semplice (-S)", "completo"], def: 0, nota: "Il completo calcola tutte le varianti a ogni campione: pesa quasi un core intero.", applica: (v) => motore?.versione5way(v === 1) },
  { nome: "Crossover del 5-way", scelte: ["A", "B", "C", "D", "E"], def: 4, nota: "Solo nel completo. E = l'impianto di Filippo, 80 / 170 / 1,2k / 6k Hz (la -S usa sempre E).", applica: cinque("xo") },
  { nome: "Growl", scelte: ["dec. 99", "libero"], def: 0, nota: "Solo nel completo (la -S usa libero).", applica: cinque("gv") },
  { nome: "Nastro", scelte: ["oggi", "completo", "exciter", "classe A", "libero"], def: 0, nota: "Solo nel completo (la -S usa exciter).", applica: cinque("nver") },
  { nome: "Incroci del canale", scelte: ["A 150/500/2,5k", "C", "D"], def: 0, applica: tuttiCanali("incroci") },
  { nome: "Curva dell'EQ", scelte: ["lineare", "Pioneer"], def: 0, applica: tuttiCanali("curva") },
  { nome: "EQ del canale", scelte: ["isolator", "serie"], def: 0, applica: tuttiCanali("eqtipo") },
  { nome: "Core del filtro", scelte: ["OTA (a′)", "pulito (c-B)"], def: 0, applica: filtri("core") },
  { nome: "Pendenza", scelte: ["Butterworth", "Linkwitz-Riley", "Bessel"], def: 0, applica: filtri("pend") },
  { nome: "Limitatore del pulito", scelte: ["2+2", "3+3", "OTA"], def: 0, applica: filtri("lim") },
];
for (const s of selettori) {
  const box = document.createElement("div");
  box.className = "selettore";
  const etichetta = document.createElement("label");
  etichetta.textContent = s.nome;
  const scelte = document.createElement("div");
  scelte.className = "scelte";
  scelte.setAttribute("role", "group");
  s.scelte.forEach((t, v) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = t;
    b.setAttribute("aria-pressed", String(v === s.def));
    b.addEventListener("click", () => {
      scelte.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      s.applica(v);
    });
    scelte.append(b);
  });
  box.append(etichetta, scelte);
  if (s.nota) {
    const n = document.createElement("small");
    n.textContent = s.nota;
    box.append(n);
  }
  $("#selettori").append(box);
}
// Prototipo e Traccia stanno nello stesso posto: se ne apre uno alla volta.
const apriProto = $<HTMLButtonElement>("#apri-prototipo");
const pannelloProto = $("#prototipo");
const pannelli: [HTMLButtonElement, HTMLElement][] = [[apriProto, pannelloProto], [apriTracce, pannelloTracce]];
function apriPannello(scelto: HTMLElement | null): void {
  for (const [tastoPannello, pannello] of pannelli) {
    const aperto = pannello === scelto;
    tastoPannello.setAttribute("aria-expanded", String(aperto));
    pannello.hidden = !aperto;
  }
}
for (const [tastoPannello, pannello] of pannelli) {
  tastoPannello.addEventListener("click", () => apriPannello(pannello.hidden ? pannello : null));
}
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") apriPannello(null);
});

// ---------------- accensione ----------------
const accendi = $<HTMLButtonElement>("#accendi");
const controlloStem = stemPresenti();
void controlloStem.then((ci) => {
  (tastiTraccia.get("brano") as HTMLButtonElement).hidden = !ci;
  const elenco = new Intl.ListFormat("it").format((ci ? STEM.map((s) => s.nome) : NOMI_STEM).map((n) => n.toLowerCase()));
  const brano = ci ? `${TITOLO} di ${AUTORE}, divisa in ${STEM.length} stem` : `il riddim di prova, in ${NOMI_STEM.length} stem`;
  $("#nota-avvio").textContent = `Carico ${brano}: ${elenco}, uno per deck. Il suono parte quando premi Play.`;
});
accendi.addEventListener("click", async () => {
  accendi.disabled = true;
  accendi.textContent = "Scaldo le valvole…";
  try {
    // ?riserva=N (in frame) serve alle prove; senza, il telefono tiene un quarto di secondo di suono pronto
    const riserva = Number(new URLSearchParams(location.search).get("riserva")) || (TELEFONO ? 12000 : 1024);
    motore = await Motore.crea(riserva);
    (window as unknown as { maelcum: unknown }).maelcum = { motore, mani, camera: scena.camera, renderer: scena.renderer, scena: scena.nome, disegni: scena.disegni, forza: scena.forza, visivi, THREE, torri: scena.torri, vie, nomiVie: NOMI_VIE, meter: mixer.meter, calma };
    for (const { l, v } of inCoda.splice(0)) manda(l, v);
    for (const s of selettori) if (s.nome !== "5-way") s.applica(s.def);
    await caricaBase((await controlloStem) ? "brano" : "riddim", (testo) => (accendi.textContent = testo));
    $("#avvio").classList.add("via");
    document.body.classList.add("accesa");
    for (const sel of ["#marchio", "#viste", "#barra"]) $(sel).hidden = false;
    scena.dopoAccensione();
  } catch (e) {
    accendi.disabled = false;
    accendi.textContent = "Riprova";
    $("#nota-avvio").textContent = e instanceof Error ? e.message : String(e);
  }
});

// ---------------- analisi delle 5 vie e animazione ----------------
const vie = NOMI_VIE.map(statoVuoto);
const lettureMute = NOMI_VIE.map(() => ({ rms: 0, punta: 0 }));
function ascolta(dt: number): void {
  const letture = motore?.vie?.leggi(dt) ?? lettureMute;
  vie.forEach((s, via) => segui(s, letture[via], via, dt));
}

const etichettaPlay = $("#tutti span");
const dbu = (picco: number, rif: number): number => 20 * Math.log10(Math.max(picco, 1e-9) / rif);
function aggiornaMeter(): void {
  if (!motore) return;
  const m = motore.meter;
  let cambiato = false; // un LED ha cambiato stato: serve un render
  const led = (id: string, valore: number, clip?: boolean): void => {
    if (mixer.meter.get(id)?.imposta(valore, clip)) cambiato = true;
  };
  m.deck.forEach((d, i) => {
    led(`CDJ ${i + 1}|METER`, dbu(d.livello, 0.25));
    const dk = decks[i];
    dk.play.setAttribute("aria-pressed", String(d.suona));
    dk.livello.style.transform = `scaleY(${THREE.MathUtils.clamp((dbu(d.livello, 0.25) + 30) / 42, 0, 1)})`;
    if (d.durata > 0) {
      const sr = motore?.ctx.sampleRate ?? 48000;
      const s = (x: number) => `${Math.floor(x / sr / 60)}:${String(Math.floor((x / sr) % 60)).padStart(2, "0")}`;
      dk.tempo.textContent = `${s(d.pos)} / ${s(d.durata)}`;
      dk.corsa.style.width = `${(100 * d.pos) / d.durata}%`;
    }
  });
  const inMoto = m.deck.some((d) => d.suona);
  tasto.setAttribute("aria-pressed", String(inMoto));
  etichettaPlay.textContent = inMoto ? "Pausa" : "Play";
  led("5-WAY|METER", dbu(m.five, 0.25));
  m.ritorni.forEach((v, r) => led(`FX — 4 RITORNI|RET ${r + 1}|METER`, 20 * Math.log10(Math.max(v, 1e-9)) + 24, m.clipRitorni[r] > 0));
  led("MASTER|METER L", 20 * Math.log10(Math.max(m.master[0], 1e-9)) + 24, m.master[2] > 0);
  led("MASTER|METER R", 20 * Math.log10(Math.max(m.master[1], 1e-9)) + 24, m.master[3] > 0);
  if (mixer.led3.get("MIC|LED")?.(m.led)) cambiato = true;
  if (cambiato) scena.richiedi();
  const stato: string[] = avvisoGrafica ? [avvisoGrafica] : [];
  if (m.protezione < 0.97) stato.push(`Protezione per le orecchie: ${(20 * Math.log10(m.protezione)).toFixed(1)} dB`);
  if (m.buchi > 0) stato.push(`Audio a vuoto (${m.buchi} blocchi): la CPU non tiene il passo`);
  $("#stato").textContent = stato.join(" · ");
}

const orologio = new THREE.Timer();
const diagnosi = creaDiagnosi({
  canvas,
  scena: scena.nome,
  disegni: scena.disegni,
  audio: () => (motore ? { stato: motore.ctx.state, buchi: motore.meter.buchi, riserva: motore.meter.riserva, fs: motore.ctx.sampleRate, ritardo: Math.round(((motore.ctx.baseLatency || 0) + (motore.ctx.outputLatency || 0)) * 1000) } : null),
});
let tMeter = 0;
function frame(): void {
  orologio.update();
  const dtVero = orologio.getDelta();
  const dt = Math.min(dtVero, 0.05);
  diagnosi?.(dtVero);
  if (scena.torri.length) ascolta(dtVero);
  if ((tMeter += dt) > 1 / 30) {
    tMeter = 0;
    aggiornaMeter();
  }
  if (!graficaPersa) scena.aggiorna({ dtVero, dt, t: orologio.getElapsed(), acceso: motore !== null, occupata: mani.occupata(), vie });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
