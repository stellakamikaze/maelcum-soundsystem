// Il contratto comune alle due scene: la piena (cortile, torri, bloom) e la leggera (solo il mixer
// dall'alto). main.ts parla solo con questa interfaccia.

import type * as THREE from "three";
import type { StatoVia } from "../audio/vie";
import type { Mixer, Visivo } from "./mixer";
import type { Stack } from "./stack";

export interface Contesto {
  canvas: HTMLCanvasElement;
  mixer: Mixer;
  calma: MediaQueryList; // prefers-reduced-motion
}

export interface Fotogramma {
  dtVero: number;
  dt: number; // dtVero limitato a 50 ms
  t: number;
  acceso: boolean; // il motore audio esiste
  occupata: boolean; // una mano sta trascinando un comando
  vie: StatoVia[];
}

export interface Scena {
  nome: "piena" | "leggera" | "nessuna";
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer | null;
  torri: Stack[]; // vuoto nella vista leggera
  pedali: Visivo[];
  disattivaOrbita(on: boolean): void;
  richiedi(forma?: boolean): void; // qualcosa è cambiato: serve un render. forma: un oggetto si è spostato, cambia anche la sua ombra
  disegni(): number; // quante volte la scena ha disegnato: lo leggono gli strumenti di misura
  forza?(): void; // disegna subito, senza aspettare un cambiamento: serve alle misure
  aggiorna(f: Fotogramma): void; // una volta per frame: anima e, se serve, disegna
  dopoAccensione(): void;
}
