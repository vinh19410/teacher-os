export interface RandomSource {
	/** Returns a uniform integer in `0 <= n < bound` (or `0` if `bound <= 1`). */
	nextInt(bound: number): number;
}

/**
 * Cryptographically strong RandomSource for browser and Cloudflare Workers.
 * Uses rejection sampling over `crypto.getRandomValues` to avoid modulo bias.
 */
export const cryptoRandom: RandomSource = {
	nextInt(bound: number): number {
		const max = Math.floor(bound);
		if (max <= 1) return 0;
		const limit = Math.floor(0x1_0000_0000 / max) * max;
		const buf = new Uint32Array(1);
		while (true) {
			crypto.getRandomValues(buf);
			const val = buf[0] ?? 0;
			if (val < limit) return val % max;
		}
	},
};

/**
 * Deterministic Mulberry32 PRNG for unit and model tests.
 */
export class SeededRandom implements RandomSource {
	private state: number;

	constructor(seed = 1) {
		this.state = seed >>> 0;
	}

	nextInt(bound: number): number {
		const max = Math.floor(bound);
		if (max <= 1) return 0;
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		const unsigned = (t ^ (t >>> 14)) >>> 0;
		return unsigned % max;
	}
}

/**
 * Full Fisher–Yates shuffle in place per docs/srs-spec.md §3.1.
 */
export function shuffleInPlace<T>(items: T[], rng: RandomSource): void {
	for (let i = items.length - 1; i >= 1; i--) {
		const j = rng.nextInt(i + 1);
		if (j !== i) {
			const tmp = items[i] as T;
			items[i] = items[j] as T;
			items[j] = tmp;
		}
	}
}
