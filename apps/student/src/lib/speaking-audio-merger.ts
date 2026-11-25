import {
	readBlobHeadBytes,
	SPEAKING_MAGIC_PEEK_BYTES,
} from "@/lib/placement-speaking-backup";
import { resolveSpeakingUploadMeta } from "@/lib/placement-test-helpers";

export const SPEAKING_TARGET_SAMPLE_RATE = 16_000;

export interface SpeakingAudioSegment {
	blob: Blob;
	durationMs: number;
}

export interface MergedSpeakingAudio {
	blob: Blob;
	mimeType: string;
	durationSec: number;
}

function writeAscii(view: DataView, offset: number, text: string): void {
	for (let i = 0; i < text.length; i++) {
		view.setUint8(offset + i, text.charCodeAt(i));
	}
}

/**
 * Đóng gói mẫu âm thanh mono float32 (-1..1) thành Blob WAV 16-bit PCM.
 */
export function encodePcm16Wav(
	samples: Float32Array,
	sampleRate = SPEAKING_TARGET_SAMPLE_RATE,
): Blob {
	const dataByteLength = samples.length * 2;
	const buffer = new ArrayBuffer(44 + dataByteLength);
	const view = new DataView(buffer);

	writeAscii(view, 0, "RIFF");
	view.setUint32(4, 36 + dataByteLength, true);
	writeAscii(view, 8, "WAVE");
	writeAscii(view, 12, "fmt ");
	view.setUint32(16, 16, true); // PCM fmt chunk size
	view.setUint16(20, 1, true); // PCM format
	view.setUint16(22, 1, true); // Mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true); // ByteRate = sampleRate * 1 * 2
	view.setUint16(32, 2, true); // BlockAlign = 1 * 2
	view.setUint16(34, 16, true); // BitsPerSample
	writeAscii(view, 36, "data");
	view.setUint32(40, dataByteLength, true);

	let offset = 44;
	for (let i = 0; i < samples.length; i++) {
		const raw = samples[i] ?? 0;
		const clamped = Math.max(-1, Math.min(1, raw));
		const int16 =
			clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
		view.setInt16(offset, int16, true);
		offset += 2;
	}

	return new Blob([buffer], { type: "audio/wav" });
}

function mixAudioBufferToMono(audioBuffer: AudioBuffer): Float32Array {
	const channelCount = Math.max(1, audioBuffer.numberOfChannels);
	const length = audioBuffer.length;
	if (channelCount === 1) {
		return new Float32Array(audioBuffer.getChannelData(0));
	}
	const mono = new Float32Array(length);
	for (let ch = 0; ch < channelCount; ch++) {
		const data = audioBuffer.getChannelData(ch);
		for (let i = 0; i < length; i++) {
			mono[i] = (mono[i] ?? 0) + (data[i] ?? 0) / channelCount;
		}
	}
	return mono;
}

function resampleMono(
	mono: Float32Array,
	sourceRate: number,
	targetRate: number,
): Float32Array {
	if (mono.length === 0 || sourceRate <= 0 || sourceRate === targetRate) {
		return mono;
	}
	const ratio = sourceRate / targetRate;
	const targetLength = Math.max(1, Math.round(mono.length / ratio));
	const out = new Float32Array(targetLength);

	if (ratio > 1) {
		// Box-filter averaging khi downsample để tránh aliasing.
		for (let i = 0; i < targetLength; i++) {
			const start = Math.floor(i * ratio);
			const end = Math.min(
				mono.length,
				Math.max(start + 1, Math.floor((i + 1) * ratio)),
			);
			let sum = 0;
			for (let j = start; j < end; j++) {
				sum += mono[j] ?? 0;
			}
			out[i] = sum / (end - start);
		}
		return out;
	}

	for (let i = 0; i < targetLength; i++) {
		const pos = i * ratio;
		const left = Math.floor(pos);
		const right = Math.min(mono.length - 1, left + 1);
		const frac = pos - left;
		const a = mono[left] ?? 0;
		const b = mono[right] ?? 0;
		out[i] = a + (b - a) * frac;
	}
	return out;
}

function resolveAudioContextConstructor():
	| (new () => AudioContext)
	| undefined {
	if (typeof window === "undefined") return undefined;
	const win = window as unknown as {
		AudioContext?: new () => AudioContext;
		webkitAudioContext?: new () => AudioContext;
	};
	return win.AudioContext ?? win.webkitAudioContext;
}

async function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
	if (typeof blob.arrayBuffer === "function") {
		return blob.arrayBuffer();
	}
	if (typeof FileReader !== "undefined") {
		return new Promise<ArrayBuffer>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				if (reader.result && typeof reader.result !== "string") {
					resolve(reader.result);
				} else {
					reject(new Error("FileReader did not return ArrayBuffer"));
				}
			};
			reader.onerror = () =>
				reject(reader.error ?? new Error("FileReader error"));
			reader.readAsArrayBuffer(blob);
		});
	}
	return new Response(blob).arrayBuffer();
}

/**
 * Bọc `decodeAudioData` tương thích cả dạng Promise (trình duyệt hiện đại) lẫn
 * dạng callback (iOS WebKit cũ) mà không phát sinh unhandled rejection.
 */
function decodeAudioBuffer(
	ctx: AudioContext,
	arrayBuffer: ArrayBuffer,
): Promise<AudioBuffer> {
	return new Promise<AudioBuffer>((resolve, reject) => {
		let settled = false;
		const settleResolve = (buf: AudioBuffer) => {
			if (settled) return;
			settled = true;
			resolve(buf);
		};
		const settleReject = (err: unknown) => {
			if (settled) return;
			settled = true;
			reject(err ?? new Error("Audio decode failed"));
		};

		try {
			const maybePromise = ctx.decodeAudioData(
				arrayBuffer,
				settleResolve,
				settleReject,
			);
			if (maybePromise && typeof maybePromise.then === "function") {
				maybePromise.then(settleResolve, settleReject);
			}
		} catch (err) {
			settleReject(err);
		}
	});
}

/**
 * Ghép các đoạn ghi âm từng câu theo đúng thứ tự thành 1 file WAV 16 kHz mono 16-bit PCM.
 * Nếu trình duyệt không hỗ trợ AudioContext hoặc decodeAudioData lỗi, fallback an toàn sang nối blob gốc.
 */
export async function mergeSpeakingAudioSegments(
	segments: readonly (SpeakingAudioSegment | undefined | null)[],
): Promise<MergedSpeakingAudio> {
	const valid = segments.filter(
		(seg): seg is SpeakingAudioSegment =>
			seg != null && Boolean(seg.blob) && seg.blob.size > 0,
	);

	if (valid.length === 0) {
		return {
			blob: new Blob([], { type: "audio/webm" }),
			mimeType: "audio/webm",
			durationSec: 0,
		};
	}

	const fallbackDurationSec = Math.max(
		1,
		Math.round(
			valid.reduce((acc, seg) => acc + Math.max(0, seg.durationMs), 0) / 1000,
		),
	);

	const AudioCtx = resolveAudioContextConstructor();
	if (AudioCtx) {
		let ctx: AudioContext | null = null;
		try {
			ctx = new AudioCtx();
			const decodedChunks: Float32Array[] = [];
			let totalSamples = 0;

			for (const seg of valid) {
				const arrayBuffer = await readBlobAsArrayBuffer(seg.blob);
				const audioBuffer = await decodeAudioBuffer(ctx, arrayBuffer);
				const mono = mixAudioBufferToMono(audioBuffer);
				const resampled = resampleMono(
					mono,
					audioBuffer.sampleRate,
					SPEAKING_TARGET_SAMPLE_RATE,
				);
				decodedChunks.push(resampled);
				totalSamples += resampled.length;
			}

			if (totalSamples > 0) {
				const merged = new Float32Array(totalSamples);
				let offset = 0;
				for (const chunk of decodedChunks) {
					merged.set(chunk, offset);
					offset += chunk.length;
				}
				const wavBlob = encodePcm16Wav(merged, SPEAKING_TARGET_SAMPLE_RATE);
				const decodedDurationSec = Math.max(
					1,
					Math.round(totalSamples / SPEAKING_TARGET_SAMPLE_RATE),
				);
				return {
					blob: wavBlob,
					mimeType: "audio/wav",
					durationSec: decodedDurationSec,
				};
			}
		} catch {
			// Fallback sang nối blob gốc nếu decodeAudioData thất bại.
		} finally {
			if (ctx && typeof ctx.close === "function") {
				await ctx.close().catch(() => {});
			}
		}
	}

	const only = valid[0];
	if (valid.length === 1 && only) {
		const headBytes = await readBlobHeadBytes(
			only.blob,
			SPEAKING_MAGIC_PEEK_BYTES,
		);
		const mimeType = resolveSpeakingUploadMeta(
			only.blob.type || "",
			headBytes,
		).contentType;
		return {
			blob: only.blob,
			mimeType,
			durationSec: fallbackDurationSec,
		};
	}

	const firstBlob = valid[0]?.blob;
	const headBytes = firstBlob
		? await readBlobHeadBytes(firstBlob, SPEAKING_MAGIC_PEEK_BYTES)
		: null;
	const primaryMime = resolveSpeakingUploadMeta(
		firstBlob?.type || "",
		headBytes,
	).contentType;
	return {
		blob: new Blob(
			valid.map((seg) => seg.blob),
			{ type: primaryMime },
		),
		mimeType: primaryMime,
		durationSec: fallbackDurationSec,
	};
}
