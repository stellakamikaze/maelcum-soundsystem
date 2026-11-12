// GENERATO da scripts/gen2worklet.mjs a partire da maelcum_mixer/proto-max/MC-MASTER.genexpr: non modificare.
// Il codice DSP è quello di Filippo, riga per riga; cambiano solo dichiarazioni e ingressi/uscite.
const pi = Math.PI, twopi = 2 * Math.PI, e = Math.E;
const min = Math.min, max = Math.max, abs = Math.abs, pow = Math.pow, exp = Math.exp;
const log = Math.log, tan = Math.tan, tanh = Math.tanh, sqrt = Math.sqrt;
const samplerate = sampleRate;
function noise() { return Math.random() * 2 - 1; }
function peek(m, i) { return m[i]; }
function poke(m, v, i) { m[i] = v; }
export const PARAMS = {"level":{"def":80,"min":0,"max":100},"mono":{"def":0,"min":0,"max":1}};
const HISTORY = {"mrp":0,"menl":0,"menr":0,"mlal":0,"mlar":0,"s_level":80};
const N_METER = 4;
class Processore extends AudioWorkletProcessor {
	constructor() {
		super();
		this.P = {};
		for (const k in PARAMS) this.P[k] = PARAMS[k].def;
		this.H = Object.assign({}, HISTORY);
		this.D = {  };
		this.M = new Float64Array(N_METER);
		this.blocchi = 0;
		this.port.onmessage = (ev) => { const d = ev.data; if (d && d.p in PARAMS) this.set(d.p, d.v); };
	}
	set(n, v) { const q = PARAMS[n]; this.P[n] = Math.min(q.max, Math.max(q.min, +v)); }
	process(inputs, outputs) {
		const inp = inputs[0] || [];
		const iL = inp[0], iR = inp[1] || inp[0];
		const o1 = outputs[0] ? outputs[0][0] : undefined, o2 = outputs[0] ? outputs[0][1] : undefined;
		const n = outputs[0] && outputs[0][0] ? outputs[0][0].length : 128;
		const { level, mono } = this.P;
		let { mrp, menl, menr, mlal, mlar, s_level } = this.H;
		const M = this.M;
		for (let __k = 0; __k < n; __k++) {
			const in1 = iL ? iL[__k] : 0, in2 = iR ? iR[__k] : 0;
			let out1 = 0, out2 = 0, out3 = 0, out4 = 0, out5 = 0, out6 = 0, t10 = 0, pm = 0, mgs = 0, mmid = 0, mside = 0, tm = 0, mgl = 0, mol = 0, mor = 0, mcr = 0, ma = 0;
			t10 = exp(-1 / (0.010 * samplerate));
			s_level = level + t10 * (s_level - level);
			pm = 1 / (0.001 * samplerate);
			mrp = mrp + min(max(mono - mrp, -pm), pm);
			mgs = pow(10, -5 * mrp) * (mrp < 1);
			mmid = 0.5 * (in1 + in2);
			mside = 0.5 * (in1 - in2) * mgs;
			tm = s_level / 100;
			mgl = (tm >= 0.8) * pow(10, 1.5000000000000004 * (tm - 0.8)) + (tm < 0.8) * (tm >= 0.05) * pow(10, -4.0 * (0.8 - tm)) + (tm < 0.05) * 0.02 * tm;
			mol = mgl * (mmid + mside);
			mor = mgl * (mmid - mside);
			mcr = exp(-1 / (0.3 * samplerate));
			ma = abs(mol) * 4.360865946243008;
			menl = max(ma, mcr * menl);
			mlal = (ma >= 15.472936263797646) * 0.479 + (ma < 15.472936263797646) * max(mlal - 1 / samplerate, 0);
			ma = abs(mor) * 4.360865946243008;
			menr = max(ma, mcr * menr);
			mlar = (ma >= 15.472936263797646) * 0.479 + (ma < 15.472936263797646) * max(mlar - 1 / samplerate, 0);
			out1 = mol;
			out2 = mor;
			out3 = menl / 17.360920030219035;
			out4 = menr / 17.360920030219035;
			out5 = mlal > 0;
			out6 = mlar > 0;
			if (o1) o1[__k] = out1;
			if (o2) o2[__k] = out2;
			if (out3 > M[0]) M[0] = out3;
			if (out4 > M[1]) M[1] = out4;
			if (out5 > M[2]) M[2] = out5;
			if (out6 > M[3]) M[3] = out6;
		}
		Object.assign(this.H, { mrp, menl, menr, mlal, mlar, s_level });
		if (N_METER && ++this.blocchi >= 8) {
			this.port.postMessage({ meter: Array.from(M) });
			M.fill(0);
			this.blocchi = 0;
		}
		return true;
	}
}
registerProcessor("mc-master", Processore);
