// Lo stack di Horns & Bricks, il soundsystem di Filippo. Formazione dal repo maelcum_mixer
// (docs/export-chatgpt, sezione 15 "Speaker-way reference"), per lato, dal basso:
//   SUB   Mogale Super Scooper, 18 Sound 18LW2400 da 18"
//   KICK  HD15 15MB1000 da 15", frontale con porte
//   MID   18 Sound 12MB700 da 12" su tromba
//   HIGH  18 Sound ND1460, driver a compressione su tromba
//   SUPER super tweeter a proiettile
// Le misure delle casse sono stimate: i piani della Super Scooper non sono pubblici.
// Ogni membrana si muove con la sua banda; le casse dei bassi tremano col sub.
// Le corse sono esagerate rispetto ai driver veri: un centimetro lungo l'asse a 5 metri non si vede.

import * as THREE from "three";

export type Via = 0 | 1 | 2 | 3 | 4;

export interface Membrana {
  via: Via;
  oggetto: THREE.Object3D;
  riposo: THREE.Vector3;
  corsa: number; // metri a livello pieno
  asse: THREE.Vector3;
  gola: THREE.MeshStandardMaterial; // la parte che prende la luce col livello della sua via
  bagliore: number; // emissione a livello pieno
}

export interface Stack {
  gruppo: THREE.Group;
  membrane: Membrana[];
  casse: { oggetto: THREE.Object3D; riposo: THREE.Vector3; via: Via }[];
  bocche: { pos: THREE.Vector3; oggetto: THREE.Object3D; via: Via; larghezza: number }[]; // per il fumo, in coordinate della cassa
}

const T = 0.018; // multistrato da 18 mm

export interface Materiali {
  legno: THREE.MeshStandardMaterial;
  interno: THREE.MeshStandardMaterial;
  cono: THREE.MeshStandardMaterial;
  cupola: THREE.MeshStandardMaterial;
  metallo: THREE.MeshStandardMaterial;
  griglia: THREE.MeshStandardMaterial;
}

export function creaMateriali(legno: THREE.Texture): Materiali {
  const l = legno.clone();
  l.wrapS = l.wrapT = THREE.RepeatWrapping;
  l.colorSpace = THREE.SRGBColorSpace;
  return {
    legno: new THREE.MeshStandardMaterial({ map: l, roughness: 0.85, metalness: 0.02, color: 0xc9c2b8 }),
    interno: new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.95 }),
    cono: new THREE.MeshStandardMaterial({ color: 0x1d1c1a, roughness: 0.9, side: THREE.DoubleSide }),
    cupola: new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.5 }),
    metallo: new THREE.MeshStandardMaterial({ color: 0x8a8782, roughness: 0.35, metalness: 0.85 }),
    griglia: new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.7, metalness: 0.4 }),
  };
}

function tavola(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  box.castShadow = true;
  box.receiveShadow = true;
  return box;
}

// Il pezzo di ogni driver che si accende col livello della sua via, nella tinta del lampione.
function golaDi(m: Materiali): THREE.MeshStandardMaterial {
  const g = m.cupola.clone();
  g.emissive = new THREE.Color(0xffa24a);
  g.emissiveIntensity = 0;
  return g;
}

// Un cono d'altoparlante visto di fronte, rivolto verso +z, con la cupola.
function cono(r: number, m: Materiali, gola: THREE.MeshStandardMaterial): THREE.Group {
  const g = new THREE.Group();
  const profilo: THREE.Vector2[] = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    profilo.push(new THREE.Vector2(r * (0.18 + 0.82 * t), -r * 0.45 * Math.pow(1 - t, 1.4)));
  }
  const membrana = new THREE.Mesh(new THREE.LatheGeometry(profilo, 40), m.cono);
  membrana.rotation.x = Math.PI / 2;
  const sosp = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.05, 8, 40), m.cupola);
  const cupola = new THREE.Mesh(new THREE.SphereGeometry(r * 0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), gola);
  cupola.rotation.x = Math.PI / 2;
  cupola.position.z = -r * 0.42;
  g.add(membrana, sosp, cupola);
  return g;
}

// Una tromba a sezione rettangolare: quattro pareti da bocca (wb x hb) a gola (wg x hg), lunga L.
function tromba(wb: number, hb: number, wg: number, hg: number, L: number, m: Materiali, curva = 1.6): THREE.Mesh {
  const seg = 10;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const anello = (t: number): THREE.Vector3[] => {
    const f = Math.pow(t, curva); // profilo esponenziale approssimato
    const w = wg + (wb - wg) * f;
    const h = hg + (hb - hg) * f;
    const z = -L * (1 - t);
    return [new THREE.Vector3(-w / 2, -h / 2, z), new THREE.Vector3(w / 2, -h / 2, z), new THREE.Vector3(w / 2, h / 2, z), new THREE.Vector3(-w / 2, h / 2, z)];
  };
  for (let s = 0; s <= seg; s++) {
    const a = anello(s / seg);
    for (let k = 0; k < 4; k++) {
      pos.push(a[k].x, a[k].y, a[k].z, a[(k + 1) % 4].x, a[(k + 1) % 4].y, a[(k + 1) % 4].z);
      uv.push(0, s / seg, 1, s / seg);
    }
  }
  for (let s = 0; s < seg; s++) {
    for (let k = 0; k < 4; k++) {
      const a = (s * 4 + k) * 2;
      const b = ((s + 1) * 4 + k) * 2;
      idx.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m.interno.clone());
  (mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  (mesh.material as THREE.MeshStandardMaterial).color.set(0x1b1916);
  mesh.receiveShadow = true;
  return mesh;
}

// Guscio aperto davanti: fianchi, cielo, fondo, schiena.
function guscio(w: number, h: number, d: number, m: Materiali): THREE.Group {
  const g = new THREE.Group();
  const lati = [
    tavola(T, h, d, m.legno).translateX(-w / 2 + T / 2),
    tavola(T, h, d, m.legno).translateX(w / 2 - T / 2),
    tavola(w, T, d, m.legno).translateY(h / 2 - T / 2),
    tavola(w, T, d, m.legno).translateY(-h / 2 + T / 2),
    tavola(w, h, T, m.interno).translateZ(-d / 2 + T / 2),
  ];
  g.add(...lati);
  return g;
}

// Super Scooper: un 18" sul pannello alto inclinato, che spara giù dentro lo scoop curvo;
// la bocca è tutta la parte bassa del fronte.
function scoop(m: Materiali, st: Stack, via: Via): THREE.Group {
  const w = 0.74, h = 1.0, d = 0.86;
  const g = guscio(w, h, d, m);
  const tw = w - 2 * T;
  // il riflettore curvo: dal fondo della bocca risale verso la schiena e il cielo
  const passi = 7;
  for (let k = 0; k < passi; k++) {
    const a0 = (k / passi) * (Math.PI / 2);
    const a1 = ((k + 1) / passi) * (Math.PI / 2);
    const R = d * 0.62;
    const cx = d / 2 - R;
    const y0 = -h / 2 + T + R * (1 - Math.cos(a0)) * 0.95;
    const y1 = -h / 2 + T + R * (1 - Math.cos(a1)) * 0.95;
    const z0 = cx + R * Math.cos(a0) * 0 + (d / 2 - R * Math.sin(a0)) - cx;
    const z1 = cx + (d / 2 - R * Math.sin(a1)) - cx;
    const lun = Math.hypot(y1 - y0, z1 - z0);
    const pezzo = tavola(tw, T, lun, m.interno);
    pezzo.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2 - 0.02);
    pezzo.rotation.x = Math.atan2(y1 - y0, -(z1 - z0));
    g.add(pezzo);
  }
  // pannello del driver: in alto, inclinato verso il fronte e verso il basso
  const baffle = tavola(tw, 0.56, T, m.legno);
  baffle.position.set(0, h * 0.2, -d * 0.02);
  baffle.rotation.x = -0.9;
  g.add(baffle);
  const gola = golaDi(m);
  const c = cono(0.215, m, gola);
  c.position.set(0, h * 0.2 - 0.012, -d * 0.02 + 0.014);
  c.rotation.x = -0.9 + Math.PI;
  c.rotateX(Math.PI);
  g.add(c);
  const asse = new THREE.Vector3(0, -Math.sin(0.9), Math.cos(0.9)).normalize();
  st.membrane.push({ via, oggetto: c, riposo: c.position.clone(), corsa: 0.05, asse, gola, bagliore: 0.6 });
  // fronte chiuso sopra la bocca
  const fascia = tavola(w, h * 0.34, T, m.legno);
  fascia.position.set(0, h / 2 - (h * 0.34) / 2, d / 2 - T / 2);
  g.add(fascia);
  st.bocche.push({ pos: new THREE.Vector3(0, -h * 0.25, d / 2), oggetto: g, via, larghezza: w * 0.8 });
  return g;
}

// Kick: un 15" frontale e due porte a fessura.
function kickBin(m: Materiali, st: Stack, via: Via): THREE.Group {
  const w = 0.66, h = 0.62, d = 0.6;
  const g = guscio(w, h, d, m);
  const forma = new THREE.Shape();
  forma.moveTo(-w / 2 + T, -h / 2 + T);
  forma.lineTo(w / 2 - T, -h / 2 + T);
  forma.lineTo(w / 2 - T, h / 2 - T);
  forma.lineTo(-w / 2 + T, h / 2 - T);
  const foro = new THREE.Path();
  foro.absarc(0, 0.02, 0.19, 0, Math.PI * 2, true);
  forma.holes.push(foro);
  for (const x of [-0.27, 0.27]) {
    const p = new THREE.Path();
    p.moveTo(x - 0.022, -0.24);
    p.lineTo(x - 0.022, 0.24);
    p.lineTo(x + 0.022, 0.24);
    p.lineTo(x + 0.022, -0.24);
    forma.holes.push(p);
  }
  const fronte = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: T, bevelEnabled: false }), m.legno);
  fronte.position.z = d / 2 - 0.05;
  fronte.castShadow = true;
  g.add(fronte);
  const gola = golaDi(m);
  const c = cono(0.185, m, gola);
  c.position.set(0, 0.02, d / 2 - 0.055);
  g.add(c);
  st.membrane.push({ via, oggetto: c, riposo: c.position.clone(), corsa: 0.03, asse: new THREE.Vector3(0, 0, 1), gola, bagliore: 0.6 });
  st.bocche.push({ pos: new THREE.Vector3(0, -h * 0.4, d / 2), oggetto: g, via, larghezza: w * 0.7 });
  return g;
}

// Medio: il 12" in fondo a una tromba a bocca quadrata.
function midHorn(m: Materiali, st: Stack, via: Via): THREE.Group {
  const w = 0.58, h = 0.48, d = 0.62;
  const g = guscio(w, h, d, m);
  const t = tromba(w - 2 * T, h - 2 * T, 0.2, 0.17, d * 0.78, m, 1.7);
  t.position.z = d / 2;
  g.add(t);
  const gola = golaDi(m);
  const c = cono(0.12, m, gola);
  c.position.set(0, 0, d / 2 - d * 0.78 + 0.01);
  g.add(c);
  st.membrane.push({ via, oggetto: c, riposo: c.position.clone(), corsa: 0.018, asse: new THREE.Vector3(0, 0, 1), gola, bagliore: 1.6 });
  return g;
}

// Alti: ND1460 avvitato dietro una tromba larga e bassa, con le alette.
function highHorn(m: Materiali, st: Stack, via: Via): THREE.Group {
  const w = 0.52, h = 0.28, d = 0.42;
  const g = guscio(w, h, d, m);
  const t = tromba(w - 2 * T, h - 2 * T, 0.04, 0.04, d * 0.9, m, 2.2);
  t.position.z = d / 2;
  g.add(t);
  for (const x of [-0.12, 0.12]) {
    const aletta = tavola(0.006, h - 2 * T, d * 0.45, m.metallo);
    aletta.position.set(x, 0, d / 2 - d * 0.22);
    aletta.rotation.y = -x * 1.4;
    g.add(aletta);
  }
  const driver = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.09, 24), m.metallo);
  driver.rotation.x = Math.PI / 2;
  driver.position.z = -d / 2 - 0.035;
  g.add(driver);
  const gola = golaDi(m);
  const diaf = new THREE.Mesh(new THREE.CircleGeometry(0.02, 20), gola);
  diaf.position.z = d / 2 - d * 0.9 + 0.002;
  g.add(diaf);
  st.membrane.push({ via, oggetto: diaf, riposo: diaf.position.clone(), corsa: 0.008, asse: new THREE.Vector3(0, 0, 1), gola, bagliore: 2.4 });
  return g;
}

function proiettile(m: Materiali, st: Stack, via: Via): THREE.Group {
  const g = new THREE.Group();
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.12, 24), m.metallo);
  corpo.rotation.x = Math.PI / 2;
  corpo.castShadow = true;
  const profilo: THREE.Vector2[] = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    profilo.push(new THREE.Vector2(0.04 + 0.05 * Math.pow(t, 2.2), 0.06 + 0.07 * t));
  }
  const bocca = new THREE.Mesh(new THREE.LatheGeometry(profilo, 30), m.metallo);
  bocca.rotation.x = Math.PI / 2;
  const gola = golaDi(m);
  const plug = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 20), gola);
  plug.rotation.x = Math.PI / 2;
  plug.position.z = 0.1;
  g.add(corpo, bocca, plug);
  st.membrane.push({ via, oggetto: plug, riposo: plug.position.clone(), corsa: 0.006, asse: new THREE.Vector3(0, 0, 1), gola, bagliore: 2.4 });
  return g;
}

// Una torre: una cassa per via, impilate come mattoni sfalsati.
export function creaTorre(m: Materiali, specchio: 1 | -1): Stack {
  const st: Stack = { gruppo: new THREE.Group(), membrane: [], casse: [], bocche: [] };
  let y = 0;
  const posa = (o: THREE.Group, x: number, h: number, z: number, via: Via): void => {
    o.position.set(x * specchio, y + h / 2, z);
    st.gruppo.add(o);
    st.casse.push({ oggetto: o, riposo: o.position.clone(), via });
    y += h;
  };
  posa(scoop(m, st, 0), 0, 1.0, 0, 0);
  posa(kickBin(m, st, 1), 0.05, 0.62, -0.08, 1);
  posa(midHorn(m, st, 2), -0.03, 0.48, -0.1, 2);
  posa(highHorn(m, st, 3), 0.04, 0.28, -0.12, 3);
  const p = proiettile(m, st, 4);
  p.position.set(0.04 * specchio, y + 0.065, -0.05);
  st.gruppo.add(p);
  return st;
}
