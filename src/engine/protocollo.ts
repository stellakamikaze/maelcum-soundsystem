import type { SpecAnello } from "./ring";

export type Ruolo = "deck" | "five" | "fx";

export interface SpecMotore {
  sampleRate: number;
  ctl: SharedArrayBuffer;
  anelli: Record<string, SpecAnello>;
  obiettivo: number; // frame tenuti negli anelli interni
  obiettivoUscita: number; // frame tenuti nell'anello d'uscita
}

export type Dispositivo =
  | "channel"
  | "send"
  | "filtro"
  | "five"
  | "mic"
  | "master"
  | "ret"
  | "faderRitorno"
  | "pedale";

export type MessaggioMotore =
  | { tipo: "avvia"; ruolo: Ruolo; i?: number; spec: SpecMotore }
  | { tipo: "param"; dev: Dispositivo; i?: number; p: string; v: number }
  | { tipo: "traccia"; L: Float32Array; R: Float32Array; trim: number }
  | { tipo: "play"; on: boolean; daFrame: number; riavvolgi: boolean }
  | { tipo: "versione5way"; completo: boolean }
  | { tipo: "bpm"; bpm: number };

export type MessaggioDalMotore =
  | { tipo: "pronto"; ruolo: Ruolo; i?: number }
  | { tipo: "meter"; ruolo: "deck"; i: number; v: number; pos: number; durata: number; suona: boolean }
  | { tipo: "meter"; ruolo: "five"; v: number }
  | {
      tipo: "meter";
      ruolo: "fx";
      ritorni: number[];
      clipRitorni: number[];
      master: number[];
      led: number;
      protezione: number;
    };
