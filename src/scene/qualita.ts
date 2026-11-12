// I gradini di qualità del cortile. La scena è la stessa: cambiano risoluzione, bloom, fumo e quante
// volte al secondo si disegna. Le misure dicono che il costo di un disegno segue i pixel (circa 2,4 ms
// per milione su un Mac mini M, più 4 ms fissi): la risoluzione è la leva che conta.
// Si parte da "media". La pagina misura i frame e scende da sola; non sale: "alta" si chiede con
// ?qualita=alta. "minima" è la vista dall'alto e non parte mai da sola: la sceglie chi guarda.

import * as THREE from "three";

export type Gradino = "alta" | "media" | "bassa" | "essenziale";
export type Qualita = Gradino | "minima";

export interface Livello {
  dpr: number; // tetto del pixelRatio
  tetto: number; // disegni al secondo quando la scena si muove; 0 = a ogni frame
  fumo: number; // particelle
  bloom: "pieno" | "ridotto" | "spento"; // spento: niente composer, un solo passaggio
  ombre: THREE.ShadowMapType;
  mappe: [number, number, number]; // lato delle mappe d'ombra: lampione (un cubo, sei facce), faretto, lampada da lavoro
  respiro: boolean; // la camera che ondeggia prima dell'accensione
  opaco: boolean; // materiali senza riflessi (Lambert): lo shader di ogni pixel costa molto meno
  soglia: number; // sotto questi frame al secondo si scende di un gradino
}

export const LIVELLI: Record<Gradino, Livello> = {
  alta: { dpr: 2, tetto: 0, fumo: 420, bloom: "pieno", ombre: THREE.PCFShadowMap, mappe: [2048, 2048, 1024], respiro: true, opaco: false, soglia: 45 },
  media: { dpr: 1.5, tetto: 30, fumo: 220, bloom: "ridotto", ombre: THREE.PCFShadowMap, mappe: [1024, 2048, 1024], respiro: true, opaco: false, soglia: 26 },
  bassa: { dpr: 1, tetto: 30, fumo: 120, bloom: "spento", ombre: THREE.BasicShadowMap, mappe: [512, 1024, 512], respiro: false, opaco: false, soglia: 20 },
  // sotto la risoluzione dello schermo: il canvas si allarga da sé, e di notte con la nebbia regge
  essenziale: { dpr: 0.75, tetto: 20, fumo: 60, bloom: "spento", ombre: THREE.BasicShadowMap, mappe: [512, 512, 512], respiro: false, opaco: true, soglia: 14 },
};
export const SOTTO: Record<Gradino, Gradino | null> = { alta: "media", media: "bassa", bassa: "essenziale", essenziale: null };

// Telefono: dito al posto del mouse e schermo stretto. I pixel CSS sono pochi (390x844), quindi la
// risoluzione pesa poco e sotto 1,5 il pannello non si legge: i tetti del pixelRatio raddoppiano.
// Lì pesano la CPU e il numero di disegni: si parte da "bassa".
export const TELEFONO = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820;
export const SCALA_SCHERMO = TELEFONO ? 2 : 1;

const CHIAVE = "maelcum.qualita";
const valida = (x: string | null): x is Qualita => x === "alta" || x === "media" || x === "bassa" || x === "essenziale" || x === "minima";

// Il browser può negare la memoria locale (navigazione privata): si riparte da media, senza errori.
export function ricorda(q: Qualita): void {
  try {
    localStorage.setItem(CHIAVE, q);
  } catch {
    /* memoria negata */
  }
}

export interface Scelta {
  qualita: Qualita;
  sorveglia: boolean; // falso quando l'indirizzo fissa la qualità per una prova
}

// Ordine: l'indirizzo (?qualita=, e ?scena=piena per le prove), poi la visita di prima, poi media.
export function sceltaIniziale(indirizzo: URLSearchParams): Scelta {
  if (indirizzo.get("scena") === "piena") return { qualita: "alta", sorveglia: false };
  const chiesta = indirizzo.get("qualita");
  if (valida(chiesta)) {
    ricorda(chiesta);
    return { qualita: chiesta, sorveglia: indirizzo.get("fissa") === null };
  }
  let salvata: string | null = null;
  try {
    salvata = localStorage.getItem(CHIAVE);
  } catch {
    /* memoria negata */
  }
  return { qualita: valida(salvata) ? salvata : TELEFONO ? "bassa" : "media", sorveglia: true };
}

// Conta i frame mentre la scena si muove, a finestre di 2 secondi. Due finestre di fila sotto soglia: troppo lenta.
export function creaSorveglianza(): { misura(dt: number, inMoto: boolean, soglia: number): boolean; azzera(): void } {
  let attesa = 3; // l'avvio non conta: shader e texture arrivano adesso
  let tempo = 0;
  let frame = 0;
  let lente = 0;
  let prima = false;
  return {
    azzera(): void {
      attesa = 3;
      tempo = frame = lente = 0;
    },
    misura(dt: number, inMoto: boolean, soglia: number): boolean {
      // una scheda nascosta non disegna: non è lentezza. Un frame da un secondo sì, e conta
      const valido = inMoto && prima && !document.hidden && dt < 3;
      prima = inMoto;
      if (attesa > 0) {
        attesa -= Math.min(dt, 1);
        return false;
      }
      if (!valido) return false;
      tempo += dt;
      frame++;
      if (tempo < 2) return false;
      lente = frame / tempo < soglia ? lente + 1 : 0;
      tempo = frame = 0;
      if (lente < 2) return false;
      lente = 0;
      return true;
    },
  };
}
