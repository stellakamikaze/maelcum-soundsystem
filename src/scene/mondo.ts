// Il cortile di notte: selciato, due muri di mattoni ad angolo, cielo con la foschia al sodio,
// il lampione, il flight case col mixer e i quattro pedali, il fumo che respira col sub.

import * as THREE from "three";
import type { Visivo } from "./mixer";
import { creaPedali } from "./pedali";

export interface Mondo {
  gruppo: THREE.Group;
  tavolo: THREE.Group; // il mixer va posato qui sopra
  pedali: Visivo[];
  // aggiorna dice se il fumo si è mosso: fermo, la scena non ha bisogno di ridisegnarlo
  fumo: { aggiorna(dt: number, spinte: { pos: THREE.Vector3; forza: number; larghezza: number }[]): boolean; quante(n: number): void };
  lampada: THREE.PointLight;
  ombre: (THREE.PointLight | THREE.SpotLight)[]; // le tre luci che fanno ombra: lampione, faretto davanti, lampada da lavoro
}

const caricatore = new THREE.TextureLoader();
function texture(nome: string, ripeti: [number, number]): THREE.Texture {
  const t = caricatore.load(`${import.meta.env.BASE_URL}img/${nome}.jpg`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...ripeti);
  t.anisotropy = 8;
  return t;
}

function spriteFumo(): THREE.Texture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d");
  if (!g) throw new Error("canvas");
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,0.55)");
  gr.addColorStop(0.5, "rgba(255,255,255,0.18)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

export function creaMondo(): Mondo {
  const gruppo = new THREE.Group();

  const suolo = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ map: texture("selciato", [26, 26]), roughness: 0.78, metalness: 0.05, color: 0x9a9088 }),
  );
  suolo.rotation.x = -Math.PI / 2;
  suolo.receiveShadow = true;
  gruppo.add(suolo);

  const mattoni = new THREE.MeshStandardMaterial({ map: texture("mattoni", [7, 3]), roughness: 0.92, color: 0xb7a69a });
  const muroFondo = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 0.5), mattoni);
  muroFondo.position.set(0, 4.5, -7.2);
  muroFondo.receiveShadow = true;
  const mattoniLato = mattoni.clone();
  mattoniLato.map = texture("mattoni", [4.5, 3]);
  const muroLato = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 16), mattoniLato);
  muroLato.position.set(-9.5, 4.5, 0.6);
  muroLato.receiveShadow = true;
  gruppo.add(muroFondo, muroLato);

  // finestre accese nel muro di fondo, ai lati dello stack, come nel render di riferimento
  const vetro = new THREE.MeshStandardMaterial({ color: 0x2a1a0c, emissive: 0xff9a3c, emissiveIntensity: 0.16, roughness: 0.3 });
  const ferro = new THREE.MeshStandardMaterial({ color: 0x0d0c0b, roughness: 0.6, metalness: 0.4 });
  for (const x of [-5.9, 5.9]) {
    const y = 3.7;
    const vano = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.0, 0.12), new THREE.MeshStandardMaterial({ color: 0x120d09, roughness: 1 }));
    vano.position.set(x, y, -6.92);
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), vetro);
    fin.position.set(x, y, -6.85);
    gruppo.add(vano, fin);
    for (let k = -1; k <= 1; k++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.8, 0.03), ferro);
      v.position.set(x + k * 0.37, y, -6.83);
      gruppo.add(v);
    }
    for (let k = -1; k <= 1; k++) {
      const o = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.035, 0.03), ferro);
      o.position.set(x, y + k * 0.45, -6.83);
      gruppo.add(o);
    }
  }

  const cieloTex = caricatore.load(`${import.meta.env.BASE_URL}img/cielo.jpg`);
  cieloTex.colorSpace = THREE.SRGBColorSpace;
  const cielo = new THREE.Mesh(new THREE.PlaneGeometry(90, 30), new THREE.MeshBasicMaterial({ map: cieloTex, fog: false, color: 0x9a9a9a }));
  cielo.position.set(0, 14, -26);
  gruppo.add(cielo);

  // lampione al sodio sul muro di fondo
  const braccio = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9), new THREE.MeshStandardMaterial({ color: 0x111 }));
  braccio.rotation.x = Math.PI / 2;
  braccio.position.set(1.6, 5.6, -6.6);
  const bulbo = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xffa040, emissiveIntensity: 9 }));
  bulbo.position.set(1.6, 5.5, -6.15);
  const lampada = new THREE.PointLight(0xffa24a, 70, 26, 1.6);
  lampada.position.copy(bulbo.position).add(new THREE.Vector3(0, -0.2, 0.2));
  lampada.castShadow = true;
  lampada.shadow.mapSize.set(2048, 2048);
  lampada.shadow.bias = -0.0008;
  gruppo.add(braccio, bulbo, lampada);

  // un altro lampione fuori campo, davanti a sinistra: accende le facce delle casse
  const davanti = new THREE.SpotLight(0xffa04a, 95, 22, 0.55, 0.75, 1.5);
  davanti.position.set(-4.2, 6.2, 4.5);
  davanti.target.position.set(0, 1.2, -3.7);
  davanti.castShadow = true;
  davanti.shadow.mapSize.set(2048, 2048);
  davanti.shadow.bias = -0.0006;
  const luna = new THREE.DirectionalLight(0x7f8cff, 0.35);
  luna.position.set(6, 9, 6);
  gruppo.add(davanti, davanti.target, luna);

  // flight case: il tavolo del mixer
  const caseTex = texture("flightcase", [2, 1]);
  const caseMat = new THREE.MeshStandardMaterial({ map: caseTex, roughness: 0.6, metalness: 0.1 });
  const alluminio = new THREE.MeshStandardMaterial({ color: 0xa9a9a4, roughness: 0.3, metalness: 0.9 });
  const tavolo = new THREE.Group();
  tavolo.position.set(0, 0, -0.9);
  const cassa = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.86, 0.78), caseMat);
  cassa.position.y = 0.43;
  cassa.castShadow = cassa.receiveShadow = true;
  tavolo.add(cassa);
  for (const y of [0.02, 0.84]) {
    for (const z of [-0.39, 0.39]) {
      const prof = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.03, 0.02), alluminio);
      prof.position.set(0, y, z);
      tavolo.add(prof);
    }
  }
  for (const x of [-0.74, 0.74]) for (const z of [-0.39, 0.39]) {
    const ang = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), alluminio);
    ang.position.set(x, 0.84, z);
    tavolo.add(ang);
  }
  gruppo.add(tavolo);

  // lampada da lavoro sul case
  const stelo = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.45), new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.6, roughness: 0.4 }));
  stelo.position.set(-0.62, 1.08, -1.12);
  stelo.rotation.z = 0.25;
  const paralume = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.09, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x151515, side: THREE.DoubleSide }));
  paralume.position.set(-0.55, 1.3, -1.08);
  paralume.rotation.set(0.4, 0, -1.0);
  const lavoro = new THREE.SpotLight(0xffb36b, 1.6, 3.2, 0.8, 0.7, 1.4);
  lavoro.position.set(-0.52, 1.28, -1.05);
  lavoro.target.position.set(0.05, 0.9, -0.85);
  lavoro.castShadow = true;
  lavoro.shadow.mapSize.set(1024, 1024);
  gruppo.add(stelo, paralume, lavoro, lavoro.target);

  // pedali: quattro scatole sul case, a destra del mixer
  const { scatole, pedali } = creaPedali();
  scatole.forEach((g, i) => {
    g.position.set(0.6 + (i % 2) * 0.085, 0.86, -1.18 + Math.floor(i / 2) * 0.14 + 0.06);
    g.rotation.y = -0.08;
    gruppo.add(g);
  });

  // fumo basso davanti alle casse
  const N = 420;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  // seme fisso: il fumo nasce uguale a ogni apertura, e due screenshot si possono confrontare
  let seme = 0x9e3779b9;
  const caso = (): number => {
    seme = (seme + 0x6d2b79f5) | 0;
    let x = Math.imul(seme ^ (seme >>> 15), 1 | seme);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const casuale = (a: number, b: number): number => a + caso() * (b - a);
  const nasci = (k: number): void => {
    pos[3 * k] = casuale(-6, 6);
    pos[3 * k + 1] = casuale(0.05, 0.75);
    pos[3 * k + 2] = casuale(-4.4, -1.6);
    vel[3 * k] = casuale(-0.04, 0.04);
    vel[3 * k + 1] = casuale(0, 0.02);
    vel[3 * k + 2] = casuale(-0.02, 0.03);
  };
  for (let k = 0; k < N; k++) nasci(k);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const OPACITA = 0.06;
  const velo = new THREE.PointsMaterial({ map: spriteFumo(), size: 1.5, transparent: true, opacity: OPACITA, depthWrite: false, color: 0xd9b48c, sizeAttenuation: true });
  const punti = new THREE.Points(geo, velo);
  let vivi = N;
  gruppo.add(punti);
  const fumo = {
    // meno particelle, più dense: la foschia resta, gli sprite da sovrapporre calano
    quante(n: number): void {
      vivi = Math.min(N, Math.max(0, n));
      geo.setDrawRange(0, vivi);
      velo.opacity = Math.min(0.16, OPACITA * Math.sqrt(N / Math.max(1, vivi)));
      punti.visible = vivi > 0;
    },
    aggiorna(dt: number, spinte: { pos: THREE.Vector3; forza: number; larghezza: number }[]): boolean {
      let mosso = 0;
      for (let k = 0; k < vivi; k++) {
        const i = 3 * k;
        const x0 = pos[i], y0 = pos[i + 1], z0 = pos[i + 2];
        for (const s of spinte) {
          const dx = pos[i] - s.pos.x;
          const dy = pos[i + 1] - s.pos.y;
          const dz = pos[i + 2] - s.pos.z;
          if (dz > -0.2 && dz < 3 && Math.abs(dx) < s.larghezza + dz * 0.4 && dy < 1.2) {
            const f = (s.forza * dt * 1.6) / (1 + dz * dz);
            vel[i + 2] += f;
            vel[i] += Math.sign(dx) * f * 0.3;
            vel[i + 1] += f * 0.15;
          }
        }
        vel[i] *= 0.985;
        vel[i + 1] = vel[i + 1] * 0.985 - 0.0004;
        vel[i + 2] *= 0.985;
        pos[i] += vel[i] * dt * 4;
        pos[i + 1] = Math.max(0.05, pos[i + 1] + vel[i + 1] * dt * 4);
        pos[i + 2] += vel[i + 2] * dt * 4;
        if (pos[i + 2] > 1.2 || Math.abs(pos[i]) > 8 || pos[i + 1] > 2) nasci(k);
        mosso = Math.max(mosso, Math.abs(pos[i] - x0), Math.abs(pos[i + 1] - y0), Math.abs(pos[i + 2] - z0));
      }
      if (mosso < 2e-4) return false; // sotto i due decimi di millimetro a frame non si vede
      geo.attributes.position.needsUpdate = true;
      return true;
    },
  };

  return { gruppo, tavolo, pedali, fumo, lampada, ombre: [lampada, davanti, lavoro] };
}
