// Mani sul pannello: raycast sui comandi, trascinamento delle manopole, corsa dei fader,
// levette a tre posizioni (il kill a molla torna su quando lasci), bottoni con luce.

import * as THREE from "three";
import type { Visivo } from "./mixer";
import { legame, type Legame } from "../panel/binding";

export interface Interazione {
  valori: Map<string, number>;
  imposta(id: string, v: number, manda?: boolean): void;
  occupata(): boolean;
}

export interface OpzioniInterazione {
  camera: THREE.Camera;
  dom: HTMLElement;
  visivi: Map<string, Visivo>;
  manda(l: Legame, v: number): void;
  suggerisci(testo: string | null, x: number, y: number): void;
  disattivaOrbita(on: boolean): void;
}

function nomeLeggibile(id: string): string {
  return id
    .replace("FX — 4 RITORNI|", "")
    .replace("FILTRO (4 canali)", "FILTRO")
    .split("|")
    .join(" · ");
}

export function creaInterazione(o: OpzioniInterazione): Interazione {
  const valori = new Map<string, number>();
  const legami = new Map<string, Legame>();
  const prese: THREE.Object3D[] = [];
  const perPresa = new Map<THREE.Object3D, Visivo>();
  const latchKill = new Map<string, number>();
  for (const v of o.visivi.values()) {
    const l = legame(v.id);
    legami.set(v.id, l);
    prese.push(v.presa);
    perPresa.set(v.presa, v);
  }
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const valoreParam = (l: Legame, v: number): number => {
    if (l.forma === "tre" || l.forma === "kill") {
      const p = l.posizioni ?? [0, 1, 2];
      return v > 0 ? p[0] : v < 0 ? p[2] : p[1];
    }
    return v;
  };

  function imposta(id: string, v: number, manda = true): void {
    const vis = o.visivi.get(id);
    const l = legami.get(id);
    if (!vis || !l) return;
    valori.set(id, v);
    vis.imposta(v);
    if (manda && l.dev) o.manda(l, valoreParam(l, v));
  }

  // valori iniziali: i default del prototipo, il pannello parte trasparente
  for (const [id, l] of legami) {
    const iniziale = l.forma === "tre" ? (l.posizioni ? l.posizioni.indexOf(l.def) === 0 ? 1 : l.posizioni.indexOf(l.def) === 2 ? -1 : 0 : 0) : l.def;
    imposta(id, iniziale, true);
  }

  const descrivi = (id: string): string => {
    const l = legami.get(id);
    const v = valori.get(id) ?? 0;
    if (!l) return id;
    let val: string;
    if (l.forma === "interruttore") val = v ? "acceso" : "spento";
    else if (l.forma === "kill") val = v > 0 ? "KILL fisso" : v < 0 ? "KILL a molla" : "via aperta";
    else if (l.forma === "tre") {
      if (id.endsWith("FILTRO")) val = v > 0 ? "HPF" : v < 0 ? "LPF" : "OFF";
      else val = v < 0 ? "PHONO" : "LINE";
    } else val = l.formato ? `${Math.round(v)} %  ·  ${l.formato(v)}` : `${Math.round(v)} %`;
    const inerte = l.dev ? "" : "  ·  non nel prototipo";
    return `${nomeLeggibile(id)}  —  ${val}${inerte}`;
  };

  const colpisci = (ev: PointerEvent): { vis: Visivo; punto: THREE.Vector3 } | null => {
    const r = o.dom.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, o.camera);
    const h = ray.intersectObjects(prese, false)[0];
    if (!h) return null;
    const vis = perPresa.get(h.object);
    return vis ? { vis, punto: h.point } : null;
  };

  // posizione del puntatore lungo la corsa del fader, in 0..100
  const lungoFader = (vis: Visivo, ev: PointerEvent): number => {
    if (vis.comando.tipo !== "fader") return 0;
    const presa = vis.presa;
    presa.updateWorldMatrix(true, false);
    const meta = (vis.comando.corsa / 2) * 0.001;
    const alto = presa.localToWorld(new THREE.Vector3(0, meta, 0)).project(o.camera);
    const basso = presa.localToWorld(new THREE.Vector3(0, -meta, 0)).project(o.camera);
    const r = o.dom.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * 2 - 1;
    const py = -((ev.clientY - r.top) / r.height) * 2 + 1;
    const dx = alto.x - basso.x;
    const dy = alto.y - basso.y;
    const t = ((px - basso.x) * dx + (py - basso.y) * dy) / (dx * dx + dy * dy);
    return THREE.MathUtils.clamp(t * 100, 0, 100);
  };

  let trascina: { vis: Visivo; y0: number; v0: number } | null = null;
  let molla: string | null = null;

  o.dom.addEventListener("pointerdown", (ev) => {
    const c = colpisci(ev);
    if (!c) return;
    const { vis } = c;
    const l = legami.get(vis.id);
    if (!l) return;
    ev.preventDefault();
    o.disattivaOrbita(true);
    o.dom.setPointerCapture(ev.pointerId);
    const v = valori.get(vis.id) ?? 0;
    if (l.forma === "continuo") {
      if (vis.comando.tipo === "fader") imposta(vis.id, lungoFader(vis, ev));
      trascina = { vis, y0: ev.clientY, v0: valori.get(vis.id) ?? 0 };
    } else if (l.forma === "interruttore") {
      imposta(vis.id, v ? 0 : 1);
    } else {
      // metà alta o bassa della leva, misurata sullo schermo rispetto al suo perno
      const perno = vis.presa.localToWorld(new THREE.Vector3(0, 0, -0.006)).project(o.camera);
      const r = o.dom.getBoundingClientRect();
      const su = -((ev.clientY - r.top) / r.height) * 2 + 1 > perno.y;
      if (l.forma === "kill") {
        if (su) {
          const nuovo = v > 0 ? 0 : 1;
          latchKill.set(vis.id, nuovo);
          imposta(vis.id, nuovo);
        } else {
          molla = vis.id;
          imposta(vis.id, -1);
        }
      } else if (vis.comando.tipo === "levetta" && !vis.comando.tre) {
        imposta(vis.id, su ? 1 : -1);
      } else {
        const meta = su ? 1 : -1;
        imposta(vis.id, v === meta ? 0 : meta);
      }
    }
    o.suggerisci(descrivi(vis.id), ev.clientX, ev.clientY);
  });

  o.dom.addEventListener("pointermove", (ev) => {
    if (trascina) {
      const { vis } = trascina;
      if (vis.comando.tipo === "fader") imposta(vis.id, lungoFader(vis, ev));
      else {
        const fine = ev.shiftKey ? 0.08 : 0.4;
        imposta(vis.id, THREE.MathUtils.clamp(trascina.v0 + (trascina.y0 - ev.clientY) * fine, 0, 100));
      }
      o.suggerisci(descrivi(vis.id), ev.clientX, ev.clientY);
      return;
    }
    const c = colpisci(ev);
    o.dom.style.cursor = c ? (legami.get(c.vis.id)?.forma === "continuo" ? "ns-resize" : "pointer") : "";
    o.suggerisci(c ? descrivi(c.vis.id) : null, ev.clientX, ev.clientY);
  });

  const rilascia = (ev: PointerEvent): void => {
    if (molla) {
      imposta(molla, latchKill.get(molla) ?? 0);
      o.suggerisci(descrivi(molla), ev.clientX, ev.clientY);
      molla = null;
    }
    trascina = null;
    o.disattivaOrbita(false);
  };
  o.dom.addEventListener("pointerup", rilascia);
  o.dom.addEventListener("pointercancel", rilascia);

  o.dom.addEventListener("dblclick", (ev) => {
    const c = colpisci(ev as PointerEvent);
    const l = c && legami.get(c.vis.id);
    if (c && l && l.forma === "continuo") {
      imposta(c.vis.id, l.def);
      o.suggerisci(descrivi(c.vis.id), ev.clientX, ev.clientY);
    }
  });

  o.dom.addEventListener(
    "wheel",
    (ev) => {
      const c = colpisci(ev as unknown as PointerEvent);
      const l = c && legami.get(c.vis.id);
      if (!c || !l || l.forma !== "continuo") return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const v = valori.get(c.vis.id) ?? 0;
      imposta(c.vis.id, THREE.MathUtils.clamp(v - Math.sign(ev.deltaY) * (ev.shiftKey ? 0.5 : 2), 0, 100));
      o.suggerisci(descrivi(c.vis.id), ev.clientX, ev.clientY);
    },
    { passive: false, capture: true },
  );

  return { valori, imposta, occupata: () => trascina !== null || molla !== null };
}
