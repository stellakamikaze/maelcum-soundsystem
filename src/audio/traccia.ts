// Traccia base del gioco: "Midnight Stars" di Mighty Massa (Rise Up / Midnight Stars, 2019),
// separata in 4 stem con Demucs (scripts/stem.sh). Il brano è strumentale: al posto della voce
// il quarto deck porta le melodie (fiati, synth e residui), il terzo lo skank (chitarra e piano).
// Gli mp3 stanno in public/audio/, fuori da git: se mancano, l'avvio ripiega sul riddim sintetico.

// Con un brano nuovo cambiano TITOLO, AUTORE e BPM: le eco si tarano sul BPM.
export const TITOLO = "Midnight Stars";
export const AUTORE = "Mighty Massa";
export const BPM = 130.8; // misurati sul brano
export const STEM = [
  { file: "drums", nome: "Batteria" },
  { file: "bass", nome: "Basso" },
  { file: "skank", nome: "Skank" },
  { file: "melodie", nome: "Melodie" },
];

// Vero se il primo stem è online. Il server di Vite risponde 200 con l'HTML anche ai file assenti,
// quindi conta il tipo.
export async function stemPresenti(): Promise<boolean> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}audio/${STEM[0].file}.mp3`, { method: "HEAD" });
    return r.ok && (r.headers.get("Content-Type") ?? "").startsWith("audio/");
  } catch {
    return false;
  }
}

// Scarica e decodifica gli stem; avanzamento in 0..1 sui byte scaricati.
export async function caricaStem(ctx: BaseAudioContext, avanzamento: (f: number) => void): Promise<AudioBuffer[]> {
  const risposte = await Promise.all(STEM.map((s) => fetch(`${import.meta.env.BASE_URL}audio/${s.file}.mp3`)));
  for (const r of risposte) if (!r.ok || !r.body) throw new Error(`stem assente (${r.status})`);
  const totali = risposte.map((r) => Number(r.headers.get("Content-Length")) || 0);
  const totale = totali.reduce((a, b) => a + b, 0);
  const letti = STEM.map(() => 0);
  const dati = await Promise.all(
    risposte.map(async (r, i) => {
      const lettore = (r.body as ReadableStream<Uint8Array>).getReader();
      const pezzi: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await lettore.read();
        if (done) break;
        pezzi.push(value);
        letti[i] += value.length;
        if (totale) avanzamento(letti.reduce((a, b) => a + b, 0) / totale);
      }
      return new Blob(pezzi as BlobPart[]).arrayBuffer();
    }),
  );
  return Promise.all(dati.map((d) => ctx.decodeAudioData(d)));
}
