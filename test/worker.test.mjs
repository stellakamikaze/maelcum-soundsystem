// Il cancello (cookie firmato con scadenza, limite ai tentativi), la cache per tipo di file
// e il proxy delle registrazioni (/api/r) dietro la password, con tetto in flusso e limite per IP.
import assert from "node:assert/strict";
import worker, { cacheDi } from "../worker/index.js";

const asset = (tipo) => async () => new Response("asset", { headers: { "content-type": tipo } });
const env = { PASSWORD: "segreto-solo-di-test", SEGRETO_COOKIE: "chiave-solo-di-test", ASSETS: { fetch: asset("text/html; charset=utf-8") } };
const limiteFinto = (max) => {
  let usati = 0;
  return { limit: async () => ({ success: ++usati <= max }) };
};
const inoltrate = [];
globalThis.fetch = async (u, opz = {}) => {
  inoltrate.push({ url: String(u), corpo: opz.body });
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
};
const richiesta = (headers = {}, body = "{}") =>
  new Request("https://esempio.test/api/r/v1/web/start", { method: "POST", body, headers, duplex: "half" });
const entra = (password, e = env) =>
  worker.fetch(new Request("https://esempio.test/entra", { method: "POST", body: new URLSearchParams({ password }) }), e);

// Senza cookie: pagina della password, niente a OpenReplay.
const fuori = await worker.fetch(richiesta(), env);
assert.equal(fuori.status, 200, "senza cookie torna la pagina della password");
assert.match(await fuori.text(), /Password/);
assert.equal(fuori.headers.get("cache-control"), "private, no-store");
assert.match(fuori.headers.get("content-security-policy") || "", /default-src 'none'.*form-action 'self'.*frame-ancestors 'none'/);
assert.equal(fuori.headers.get("x-content-type-options"), "nosniff");
assert.equal(fuori.headers.get("x-frame-options"), "DENY");
assert.match(fuori.headers.get("strict-transport-security") || "", /max-age=31536000/);
assert.deepEqual(inoltrate, [], "senza password niente arriva a OpenReplay");

// Password giusta: cookie "<scadenza>.<firma>" per 30 giorni.
const ok = await entra(env.PASSWORD);
assert.equal(ok.status, 303);
const setCookie = ok.headers.get("set-cookie");
assert.match(setCookie, /Max-Age=2592000/);
const cookie = setCookie.split(";")[0];
const [scade] = cookie.split("=")[1].split(".");
assert.ok(Math.abs(Number(scade) - (Date.now() / 1000 + 2592000)) < 5, "scadenza a 30 giorni");

const dentro = await worker.fetch(richiesta({ cookie }), env);
assert.equal(dentro.status, 200);
assert.equal(inoltrate[0].url, "https://replay.stellakamikaze.org/ingest/v1/web/start");

// Password sbagliata: 401 e nessun cookie.
const no = await entra("sbagliata");
assert.equal(no.status, 401);
assert.equal(no.headers.get("set-cookie"), null);

// Cookie scaduto, falsificato, o del vecchio schema (HMAC della password): pagina della password.
const vecchio = "hb_sessione=" + "a".repeat(64);
const scaduto = `hb_sessione=${Math.floor(Date.now() / 1000) - 10}.${cookie.split(".")[1]}`;
const altraChiave = await worker.fetch(new Request("https://esempio.test/"), { ...env, SEGRETO_COOKIE: "altra" });
for (const c of [vecchio, scaduto, cookie.replace(/.$/, (x) => (x === "0" ? "1" : "0"))]) {
  const r = await worker.fetch(new Request("https://esempio.test/", { headers: { cookie: c } }), env);
  assert.match(await r.text(), /Password/, `cookie non valido: ${c.slice(0, 30)}`);
}
assert.match(await altraChiave.text(), /Password/);
const conAltraChiave = await worker.fetch(new Request("https://esempio.test/", { headers: { cookie } }), { ...env, SEGRETO_COOKIE: "altra" });
assert.match(await conAltraChiave.text(), /Password/, "cambiare SEGRETO_COOKIE fa rientrare tutti");

// Limite ai tentativi: il sesto in un minuto riceve 429.
const conLimite = { ...env, LIMITE_ENTRA: limiteFinto(5) };
const stati = [];
for (let i = 0; i < 6; i++) stati.push((await entra("sbagliata", conLimite)).status);
assert.deepEqual(stati, [401, 401, 401, 401, 401, 429]);

// POST non modulo: 400, non 500.
const rotto = await worker.fetch(
  new Request("https://esempio.test/entra", { method: "POST", body: "x", headers: { "content-type": "multipart/form-data; boundary=manca" } }),
  env,
);
assert.equal(rotto.status, 400);

// Cache per tipo di file.
assert.equal(cacheDi("/", "text/html; charset=utf-8"), "private, no-store");
assert.equal(cacheDi("/assets/index-abc.js", "text/javascript"), "private, max-age=31536000, immutable");
assert.equal(cacheDi("/audio/bass.mp3", "audio/mpeg"), "private, max-age=604800");
assert.equal(cacheDi("/img/cielo.jpg", "image/jpeg"), "private, max-age=604800");
assert.equal(cacheDi("/uscita.worklet.js", "text/javascript"), "private, no-cache");
const js = await worker.fetch(new Request("https://esempio.test/assets/index-abc.js", { headers: { cookie } }), { ...env, ASSETS: { fetch: asset("text/javascript") } });
assert.equal(js.headers.get("cache-control"), "private, max-age=31536000, immutable");
assert.equal(js.headers.get("cross-origin-embedder-policy"), "require-corp");

// /api/r: corpo chunked oltre 5 MB → 413 senza inoltro; oltre 120 al minuto → 429.
const prima = inoltrate.length;
let mandati = 0;
const flusso = new ReadableStream({
  pull(c) {
    if (mandati > 5 * 1024 * 1024) return c.close();
    mandati += 1024 * 1024;
    c.enqueue(new Uint8Array(1024 * 1024));
  },
});
const grande = await worker.fetch(richiesta({ cookie }, flusso), env);
assert.equal(grande.status, 413);
assert.equal(inoltrate.length, prima);
const conLimiteR = { ...env, LIMITE_REGISTRAZIONI: limiteFinto(1) };
assert.equal((await worker.fetch(richiesta({ cookie }), conLimiteR)).status, 200);
assert.equal((await worker.fetch(richiesta({ cookie }), conLimiteR)).status, 429);

console.log("worker: cancello con cookie a scadenza, limiti, cache e proxy /api/r, ok");
