/**
 * Pure Web Audio API decoder/resampler that merges per-task Speaking audio blobs
 * into a single 16 kHz mono 16-bit PCM WAV (`audio/wav`) with safe fallback.
 */

export const TARGET_SPEAKING_SAMPLE_RATE = 16000;

function writeAscii(view, offset, str) {
	for (let i = 0; i < str.length; i += 1) {
		view.setUint8(offset + i, str.charCodeAt(i));
	}
}

/**
 * Encodes mono Float32 PCM samples (-1..1) into a 16-bit little-endian WAV ArrayBuffer.
 */
export function encodeWavPcm16(
	samples,
	sampleRate = TARGET_SPEAKING_SAMPLE_RATE,
) {
	const safeSamples =
		samples instanceof Float32Array ? samples : new Float32Array(samples ?? 0);
	const dataLength = safeSamples.length * 2;
	const buffer = new ArrayBuffer(44 + dataLength);
	const view = new DataView(buffer);

	writeAscii(view, 0, "RIFF");
	view.setUint32(4, 36 + dataLength, true);
	writeAscii(view, 8, "WAVE");
	writeAscii(view, 12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM format
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true); // byteRate = sampleRate * 1 * 2
	view.setUint16(32, 2, true); // blockAlign = 1 * 2
	view.setUint16(34, 16, true); // bitsPerSample
	writeAscii(view, 36, "data");
	view.setUint32(40, dataLength, true);

	let offset = 44;
	for (let i = 0; i < safeSamples.length; i += 1) {
		const clamped = Math.max(-1, Math.min(1, safeSamples[i]));
		const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
		view.setInt16(offset, int16, true);
		offset += 2;
	}

	return buffer;
}

function decodeAudioBuffer(ctx, arrayBuffer) {
	return new Promise((resolve, reject) => {
		let settled = false;
		const ok = (buf) => {
			if (!settled) {
				settled = true;
				resolve(buf);
			}
		};
		const fail = (err) => {
			if (!settled) {
				settled = true;
				reject(err);
			}
		};
		try {
			const maybePromise = ctx.decodeAudioData(arrayBuffer, ok, fail);
			if (maybePromise && typeof maybePromise.then === "function") {
				maybePromise.then(ok, fail);
			}
		} catch (err) {
			fail(err);
		}
	});
}

function mixAudioBufferToMono(audioBuffer) {
	const length = audioBuffer.length;
	const numChannels = Math.max(1, audioBuffer.numberOfChannels || 1);
	if (numChannels === 1) {
		return new Float32Array(audioBuffer.getChannelData(0));
	}
	const mono = new Float32Array(length);
	for (let c = 0; c < numChannels; c += 1) {
		const channelData = audioBuffer.getChannelData(c);
		for (let i = 0; i < length; i += 1) {
			mono[i] += channelData[i] / numChannels;
		}
	}
	return mono;
}

function resampleMonoLinear(samples, fromRate, toRate) {
	if (
		!samples ||
		samples.length === 0 ||
		fromRate === toRate ||
		fromRate <= 0
	) {
		return samples;
	}
	const ratio = fromRate / toRate;
	const targetLength = Math.max(1, Math.round(samples.length / ratio));
	const out = new Float32Array(targetLength);
	for (let i = 0; i < targetLength; i += 1) {
		const pos = i * ratio;
		const idx = Math.floor(pos);
		const frac = pos - idx;
		const s0 = samples[idx] ?? 0;
		const s1 = samples[Math.min(idx + 1, samples.length - 1)] ?? s0;
		out[i] = s0 + (s1 - s0) * frac;
	}
	return out;
}

async function resampleToTargetRate(audioBuffer, targetRate) {
	const mono = mixAudioBufferToMono(audioBuffer);
	const sourceRate = audioBuffer.sampleRate || targetRate;
	if (sourceRate === targetRate || mono.length === 0) {
		return mono;
	}

	const OfflineCtx =
		globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
	if (typeof OfflineCtx === "function") {
		try {
			const targetLength = Math.max(
				1,
				Math.ceil((mono.length / sourceRate) * targetRate),
			);
			const offline = new OfflineCtx(1, targetLength, targetRate);
			const monoBuffer = offline.createBuffer(1, mono.length, sourceRate);
			monoBuffer.copyToChannel(mono, 0);
			const source = offline.createBufferSource();
			source.buffer = monoBuffer;
			source.connect(offline.destination);
			source.start(0);
			const rendered = await offline.startRendering();
			return new Float32Array(rendered.getChannelData(0));
		} catch {
			// Fall back to linear resampling if OfflineAudioContext fails
		}
	}

	return resampleMonoLinear(mono, sourceRate, targetRate);
}

/**
 * Merges an array of recorded speaking segments (`{ blob, durationMs }` or `Blob`)
 * into a single WAV (`audio/wav`, 16 kHz mono 16-bit PCM) Blob.
 * Falls back safely to the single Blob (1 segment) or `new Blob(blobs, { type })`
 * when Web Audio API is absent or decoding fails.
 */
export async function mergeSpeakingAudioSegments(segments) {
	const blobs = (Array.isArray(segments) ? segments : [])
		.map((seg) => (seg instanceof Blob ? seg : seg?.blob))
		.filter((blob) => blob && blob.size > 0);

	if (blobs.length === 0) {
		return null;
	}
	if (blobs.length === 1) {
		return blobs[0];
	}

	const fallbackType = blobs[0].type || "audio/webm";
	const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
	if (typeof AudioCtx !== "function") {
		return new Blob(blobs, { type: fallbackType });
	}

	let ctx = null;
	try {
		ctx = new AudioCtx();
		const resampledChunks = [];
		let totalSamples = 0;

		for (const blob of blobs) {
			const arrayBuf = await blob.arrayBuffer();
			const audioBuffer = await decodeAudioBuffer(ctx, arrayBuf);
			const mono16k = await resampleToTargetRate(
				audioBuffer,
				TARGET_SPEAKING_SAMPLE_RATE,
			);
			resampledChunks.push(mono16k);
			totalSamples += mono16k.length;
		}

		if (totalSamples === 0) {
			return new Blob(blobs, { type: fallbackType });
		}

		const mergedSamples = new Float32Array(totalSamples);
		let offset = 0;
		for (const chunk of resampledChunks) {
			mergedSamples.set(chunk, offset);
			offset += chunk.length;
		}

		const wavBuffer = encodeWavPcm16(
			mergedSamples,
			TARGET_SPEAKING_SAMPLE_RATE,
		);
		return new Blob([wavBuffer], { type: "audio/wav" });
	} catch {
		return new Blob(blobs, { type: fallbackType });
	} finally {
		if (ctx && typeof ctx.close === "function") {
			try {
				await ctx.close();
			} catch {
				// Ignore close errors
			}
		}
	}
}
