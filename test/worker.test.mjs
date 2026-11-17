// Il proxy delle registrazioni (/api/r) sta dietro la password e inoltra a OpenReplay.
import assert from "node:assert/strict";
import worker from "../worker/index.js";

const env = { PASSWORD: "segreto-solo-di-test", ASSETS: { fetch: async () => new Response("asset") } };
const inoltrate = [];
globalThis.fetch = async (u) => {
  inoltrate.push(String(u));
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
};
const richiesta = (headers = {}) =>
  new Request("https://esempio.test/api/r/v1/web/start", { method: "POST", body: "{}", headers });

const fuori = await worker.fetch(richiesta(), env);
assert.equal(fuori.status, 200, "senza cookie torna la pagina della password");
assert.match(await fuori.text(), /Password/);
assert.deepEqual(inoltrate, [], "senza password niente arriva a OpenReplay");

const entra = await worker.fetch(
  new Request("https://esempio.test/entra", { method: "POST", body: new URLSearchParams({ password: env.PASSWORD }) }),
  env,
);
const cookie = entra.headers.get("set-cookie").split(";")[0];
const dentro = await worker.fetch(richiesta({ cookie }), env);
assert.equal(dentro.status, 200);
assert.deepEqual(inoltrate, ["https://replay.stellakamikaze.org/ingest/v1/web/start"]);
console.log("worker: proxy /api/r dietro la password, ok");
