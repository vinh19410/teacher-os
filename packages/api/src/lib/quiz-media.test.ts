import { describe, expect, test } from "vitest";
import { QUIZ_MEDIA_MAX_BYTES, QUIZ_MEDIA_TYPES } from "../contracts";
import { LIBRARY_AUDIO_MIME } from "../library-contracts";
import {
	libraryAudioExtensionMatches,
	matchesLibraryAudioMagic,
	matchesQuizMediaMagic,
	QUIZ_MEDIA_MAGIC_PEEK_BYTES,
	quizMediaExtensionMatches,
	resolveLibraryAudioMimeType,
	resolveQuizMediaType,
	validateQuizMediaFiles,
} from "./quiz-media";

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.replace(/\s+/g, "");
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i += 1) {
		out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

const ENC = new TextEncoder();

function fileOfSize(name: string, type: string, size: number): File {
	const file = new File(["x"], name, { type });
	Object.defineProperty(file, "size", { value: size });
	return file;
}

/** Genuine 64-byte prefixes produced by ffmpeg across all 7 container families. */
const FFMPEG_HEADERS = {
	mp3Id3: hexToBytes(
		"4944330400000000003354495432000000060000035465737400545353450000000f0000034c61766636302e31362e3130300000000000000000000000fffb40",
	),
	mp3Raw: hexToBytes(
		"fffb50c40003c00001a400000020000034800000044c414d45332e31303055555555555555555555555555555555555555555555555555555555555555555555",
	),
	wav: hexToBytes(
		"524946468606000057415645666d74201000000001000100803e0000007d0000020010004c4953541a000000494e464f495346540e0000004c61766636302e31",
	),
	wavRf64: hexToBytes(
		"52463634ffffffff57415645647336341c000000aa060000000000004006000000000000200300000000000000000000666d74201000000001000100803e0000",
	),
	oggOpus: hexToBytes(
		"4f67675300020000000000000000ef133b2f000000007afe6a0201134f707573486561640101380180bb00000000004f67675300000000000000000000ef133b",
	),
	webmOpus: hexToBytes(
		"1a45dfa39f4286810142f7810142f2810442f381084282847765626d4287810442858102185380670100000000000205114d9b74ba4dbb8b53ab841549a96653",
	),
	aacAdts: hexToBytes(
		"fff15040039ffcde02004c61766336302e33312e313032000230400efff15040017ffc01182007fff15040017ffc01182007fff15040017ffc01182007",
	),
	m4a: hexToBytes(
		"0000001c667479704d344120000002004d34412069736f6d69736f320000000866726565000000296d646174de02004c61766336302e33312e31303200023040",
	),
	mp4: hexToBytes(
		"000000206674797069736f6d0000020069736f6d69736f32617663316d7034310000000866726565000002d96d646174000002ae0605ffffaadc45e9bde6d948",
	),
	movQt: hexToBytes(
		"00000014667479707174202000000200717420200000000877696465000002d96d646174000002ae0605ffffaadc45e9bde6d948b7962cd820d923eeef783236",
	),
};

describe("QUIZ_MEDIA_MAGIC_PEEK_BYTES", () => {
	test("equals 64 bytes", () => {
		expect(QUIZ_MEDIA_MAGIC_PEEK_BYTES).toBe(64);
	});
});

describe("validateQuizMediaFiles — preserve reason:'name' ordering (#681 RT#1)", () => {
	test("over-length filename (>200 chars) returns reason 'name', not 'type'", () => {
		const longFile = fileOfSize(`${"a".repeat(201)}.mp3`, "audio/mpeg", 10);
		expect(validateQuizMediaFiles([longFile], QUIZ_MEDIA_MAX_BYTES)).toEqual({
			ok: false,
			reason: "name",
			file: longFile,
		});
	});

	test("control-char-only filename returns reason 'name'", () => {
		const ctrl = fileOfSize("\u200B   ", "audio/mpeg", 10);
		expect(validateQuizMediaFiles([ctrl], QUIZ_MEDIA_MAX_BYTES)).toEqual({
			ok: false,
			reason: "name",
			file: ctrl,
		});
	});

	test("dotfile or dangerous browser MIME returns reason 'type'", () => {
		const dot = fileOfSize(".mp3", "audio/mpeg", 10);
		expect(validateQuizMediaFiles([dot], QUIZ_MEDIA_MAX_BYTES)).toEqual({
			ok: false,
			reason: "type",
			file: dot,
		});
		const html = fileOfSize("answer.mp3", "text/html", 10);
		expect(validateQuizMediaFiles([html], QUIZ_MEDIA_MAX_BYTES)).toEqual({
			ok: false,
			reason: "type",
			file: html,
		});
	});
});

describe("resolveQuizMediaType & resolveLibraryAudioMimeType (#681)", () => {
	test("falls back to extension when browserType is empty or application/octet-stream", () => {
		expect(resolveQuizMediaType("part2.mp3", "")).toBe("audio/mpeg");
		expect(
			resolveQuizMediaType("part2.m4a", "APPLICATION/OCTET-STREAM; charset=x"),
		).toBe("audio/mp4");
		expect(resolveQuizMediaType("rec.aac", "application/octet-stream")).toBe(
			"audio/aac",
		);
		expect(resolveQuizMediaType("clip.wav", "")).toBe("audio/wav");
		expect(resolveQuizMediaType("clip.wave", "")).toBe("audio/wav");
		expect(resolveQuizMediaType("clip.weba", "")).toBe("audio/webm");
		expect(resolveQuizMediaType("clip.ogg", "")).toBe("audio/ogg");
		expect(resolveQuizMediaType("clip.oga", "")).toBe("audio/ogg");
		expect(resolveQuizMediaType("clip.opus", "")).toBe("audio/ogg");
		expect(resolveQuizMediaType("clip.mp4", "")).toBe("video/mp4");
		expect(resolveQuizMediaType("clip.mov", "")).toBe("video/quicktime");
		expect(resolveQuizMediaType("clip.qt", "")).toBe("video/quicktime");
		expect(resolveQuizMediaType("clip.webm", "")).toBe("video/webm");

		expect(resolveLibraryAudioMimeType("clip.webm", "")).toBe("audio/webm");
		expect(
			resolveLibraryAudioMimeType("clip.webm", "application/octet-stream"),
		).toBe("audio/webm");
		expect(resolveLibraryAudioMimeType("clip.mp4", "")).toBeNull();
		expect(resolveLibraryAudioMimeType("clip.mov", "")).toBeNull();
	});

	test("accepts real OS and browser MIME aliases across iOS/Android/Windows/macOS/Linux", () => {
		expect(resolveQuizMediaType("memo.m4a", "audio/x-m4a")).toBe("audio/x-m4a");
		expect(resolveQuizMediaType("voice.m4a", "video/mp4")).toBe("audio/mp4");
		expect(resolveLibraryAudioMimeType("voice.m4a", "video/mp4")).toBe(
			"audio/mp4",
		);
		expect(resolveQuizMediaType("voice.m4a", "audio/m4a")).toBe("audio/mp4");
		expect(resolveQuizMediaType("voice.m4a", "audio/mp4a-latm")).toBe(
			"audio/mp4",
		);
		expect(resolveQuizMediaType("voice.m4a", "audio/aac")).toBe("audio/aac");

		// Windows 10/11 Registry HKCR\.aac\Content Type
		expect(resolveQuizMediaType("win.aac", "audio/vnd.dlna.adts")).toBe(
			"audio/aac",
		);
		expect(resolveLibraryAudioMimeType("win.aac", "audio/vnd.dlna.adts")).toBe(
			"audio/aac",
		);
		expect(resolveQuizMediaType("win.aac", "audio/adts")).toBe("audio/aac");
		expect(resolveQuizMediaType("rec.aac", "audio/x-hx-aac-adts")).toBe(
			"audio/aac",
		);
		expect(resolveQuizMediaType("rec.aac", "audio/x-aac")).toBe("audio/aac");
		expect(resolveQuizMediaType("rec.aac", "audio/aacp")).toBe("audio/aac");

		expect(resolveQuizMediaType("track.mp3", "audio/mp3")).toBe("audio/mpeg");
		expect(resolveQuizMediaType("track.mp3", "audio/x-mp3")).toBe("audio/mpeg");
		expect(resolveQuizMediaType("track.mp3", "audio/x-mpeg")).toBe(
			"audio/mpeg",
		);
		expect(resolveQuizMediaType("track.mp3", "audio/mpeg3")).toBe("audio/mpeg");

		expect(resolveQuizMediaType("clip.wav", "audio/x-wav")).toBe("audio/x-wav");
		expect(resolveQuizMediaType("clip.wav", "audio/wave")).toBe("audio/wave");
		expect(resolveQuizMediaType("clip.wav", "audio/vnd.wave")).toBe(
			"audio/wav",
		);

		// WhatsApp / Telegram / Linux shared-mime-info Opus & Ogg
		expect(resolveQuizMediaType("note.opus", "audio/opus")).toBe("audio/ogg");
		expect(resolveLibraryAudioMimeType("note.opus", "audio/opus")).toBe(
			"audio/ogg",
		);
		expect(resolveQuizMediaType("note.opus", "audio/x-opus+ogg")).toBe(
			"audio/ogg",
		);
		expect(resolveQuizMediaType("note.ogg", "audio/x-vorbis+ogg")).toBe(
			"audio/ogg",
		);
		expect(resolveQuizMediaType("note.ogg", "audio/x-speex+ogg")).toBe(
			"audio/ogg",
		);
		expect(resolveQuizMediaType("note.ogg", "application/ogg")).toBe(
			"audio/ogg",
		);
		expect(resolveQuizMediaType("note.oga", "video/ogg")).toBe("audio/ogg");

		// Disk .webm files get video/webm from OS MIME DB
		expect(resolveQuizMediaType("disk.webm", "video/webm")).toBe("video/webm");
		expect(resolveQuizMediaType("mic.webm", "audio/webm;codecs=opus")).toBe(
			"audio/webm",
		);
		expect(resolveLibraryAudioMimeType("disk.webm", "video/webm")).toBe(
			"audio/webm",
		);

		expect(resolveQuizMediaType("C:\\fakepath\\IMG_0001.MOV ", "")).toBe(
			"video/quicktime",
		);
	});

	test("rejects dangerous MIME, extension mismatch, dotfiles, and Object.prototype keys", () => {
		expect(resolveQuizMediaType("answer.mp3", "text/html")).toBeNull();
		expect(resolveQuizMediaType("answer.mp3", "image/svg+xml")).toBeNull();
		expect(resolveQuizMediaType("payload.html", "audio/mpeg")).toBeNull();
		expect(resolveQuizMediaType("bai.pdf", "audio/mpeg")).toBeNull();
		expect(resolveQuizMediaType(".mp3", "audio/mpeg")).toBeNull();
		expect(resolveQuizMediaType("..mp3", "")).toBeNull();
		expect(resolveQuizMediaType(".hidden.m4a", "audio/mp4")).toBeNull();
		expect(resolveQuizMediaType("a.toString", "")).toBeNull();
		expect(resolveQuizMediaType("a.mp3", "constructor")).toBeNull();

		expect(
			resolveLibraryAudioMimeType("payload.html", "audio/mpeg"),
		).toBeNull();
		expect(resolveLibraryAudioMimeType("v.mov", "video/quicktime")).toBeNull();
		expect(resolveLibraryAudioMimeType("v.mp4", "video/mp4")).toBeNull();
	});
});

describe("quizMediaExtensionMatches & libraryAudioExtensionMatches", () => {
	test("enforces compatible extension-to-MIME pairs and rejects .m4a + video/mp4 bypass", () => {
		expect(quizMediaExtensionMatches("Bài 1.MP3", "audio/mpeg")).toBe(true);
		expect(quizMediaExtensionMatches("voice.m4a", "audio/mp4")).toBe(true);
		expect(quizMediaExtensionMatches("voice.m4a", "audio/x-m4a")).toBe(true);
		expect(quizMediaExtensionMatches("voice.m4a", "audio/aac")).toBe(true);
		expect(quizMediaExtensionMatches("voice.m4a", "video/mp4")).toBe(false);
		expect(quizMediaExtensionMatches("clip.webm", "video/webm")).toBe(true);
		expect(quizMediaExtensionMatches("clip.webm", "audio/webm")).toBe(true);
		expect(quizMediaExtensionMatches("note.opus", "audio/ogg")).toBe(true);
		expect(quizMediaExtensionMatches("clip.qt", "video/quicktime")).toBe(true);

		expect(quizMediaExtensionMatches("payload.html", "audio/mpeg")).toBe(false);
		expect(quizMediaExtensionMatches(".mp3", "audio/mpeg")).toBe(false);
		expect(quizMediaExtensionMatches("a.constructor", "audio/mpeg")).toBe(
			false,
		);

		expect(libraryAudioExtensionMatches("clip.webm", "audio/webm")).toBe(true);
		expect(libraryAudioExtensionMatches("clip.webm", "video/webm")).toBe(false);
		expect(libraryAudioExtensionMatches("clip.mp4", "video/mp4")).toBe(false);
	});
});

describe("matchesQuizMediaMagic & matchesLibraryAudioMagic", () => {
	test("accepts genuine ffmpeg-produced headers for all 12 QUIZ_MEDIA_TYPES (including slab-offset subarray)", () => {
		const cases: Array<{ mime: string; head: Uint8Array; totalSize: number }> =
			[
				{ mime: "audio/mpeg", head: FFMPEG_HEADERS.mp3Id3, totalSize: 869 },
				{ mime: "audio/mpeg", head: FFMPEG_HEADERS.mp3Raw, totalSize: 626 },
				{ mime: "audio/mp4", head: FFMPEG_HEADERS.m4a, totalSize: 856 },
				{ mime: "audio/x-m4a", head: FFMPEG_HEADERS.m4a, totalSize: 856 },
				{ mime: "audio/aac", head: FFMPEG_HEADERS.aacAdts, totalSize: 61 },
				{ mime: "audio/aac", head: FFMPEG_HEADERS.mp3Id3, totalSize: 869 },
				{ mime: "audio/aac", head: FFMPEG_HEADERS.m4a, totalSize: 856 },
				{ mime: "audio/wav", head: FFMPEG_HEADERS.wav, totalSize: 1678 },
				{ mime: "audio/x-wav", head: FFMPEG_HEADERS.wav, totalSize: 1678 },
				{ mime: "audio/wave", head: FFMPEG_HEADERS.wavRf64, totalSize: 1714 },
				{ mime: "audio/webm", head: FFMPEG_HEADERS.webmOpus, totalSize: 565 },
				{ mime: "audio/ogg", head: FFMPEG_HEADERS.oggOpus, totalSize: 176 },
				{ mime: "video/mp4", head: FFMPEG_HEADERS.mp4, totalSize: 1586 },
				{ mime: "video/mp4", head: FFMPEG_HEADERS.movQt, totalSize: 1533 },
				{
					mime: "video/quicktime",
					head: FFMPEG_HEADERS.movQt,
					totalSize: 1533,
				},
				{ mime: "video/webm", head: FFMPEG_HEADERS.webmOpus, totalSize: 565 },
			];

		const covered = new Set<string>();
		for (const item of cases) {
			covered.add(item.mime);
			expect(
				matchesQuizMediaMagic(item.mime, item.head, item.totalSize),
				item.mime,
			).toBe(true);

			// Simulate Node Buffer slab pool with non-zero byteOffset (RT#10)
			const slab = new Uint8Array(17 + item.head.byteLength);
			slab.fill(0x3c);
			slab.set(item.head, 17);
			const slice = slab.subarray(17);
			expect(
				matchesQuizMediaMagic(item.mime, slice, item.totalSize),
				`${item.mime} slab`,
			).toBe(true);

			if (Object.hasOwn(LIBRARY_AUDIO_MIME, item.mime)) {
				expect(
					matchesLibraryAudioMagic(item.mime, slice, item.totalSize),
					`${item.mime} library`,
				).toBe(true);
			} else {
				expect(
					matchesLibraryAudioMagic(item.mime, slice, item.totalSize),
					`${item.mime} library reject video`,
				).toBe(false);
			}
		}
		expect([...covered].sort()).toEqual(Object.keys(QUIZ_MEDIA_TYPES).sort());
	});

	test("accepts CoreAudio WAV (FLLR/JUNK), streaming WAV (0xffffffff), Matroska EBML, and legacy QuickTime (wide+mdat, moov+mvhd, >4KiB free)", () => {
		// CoreAudio WAV with FLLR padding chunk first
		const coreAudioWav = new Uint8Array(24);
		coreAudioWav.set(ENC.encode("RIFF"), 0);
		new DataView(coreAudioWav.buffer).setUint32(4, 100, true);
		coreAudioWav.set(ENC.encode("WAVEFLLR"), 8);
		new DataView(coreAudioWav.buffer).setUint32(16, 28, true);
		expect(matchesQuizMediaMagic("audio/wav", coreAudioWav, 108)).toBe(true);

		// Streaming WAV with riffSize = 0xffffffff
		const streamWav = new Uint8Array(24);
		streamWav.set(ENC.encode("RIFF"), 0);
		new DataView(streamWav.buffer).setUint32(4, 0xffffffff, true);
		streamWav.set(ENC.encode("WAVEfmt "), 8);
		new DataView(streamWav.buffer).setUint32(16, 16, true);
		expect(matchesQuizMediaMagic("audio/wav", streamWav, 4096)).toBe(true);

		// Matroska DocType
		const mkv = hexToBytes(
			"1a45dfa3a34286810142f7810142f2810442f381084282886d6174726f736b614287810442858102",
		);
		expect(matchesQuizMediaMagic("video/webm", mkv, 1000)).toBe(true);

		// Legacy QuickTime wide (8B) + mdat (16B)
		const wideMdat = hexToBytes("0000000877696465000000106d64617400000000");
		expect(matchesQuizMediaMagic("video/quicktime", wideMdat, 24)).toBe(true);

		// Legacy QuickTime moov + mvhd
		const moovMvhd = hexToBytes("000000806d6f6f760000006c6d76686400000000");
		expect(matchesQuizMediaMagic("video/quicktime", moovMvhd, 512)).toBe(true);

		// Legacy QuickTime qt-faststart 8 KiB free padding atom
		const faststartFree = hexToBytes(
			"0000200066726565000000000000000000000000",
		);
		expect(matchesQuizMediaMagic("video/quicktime", faststartFree, 16384)).toBe(
			true,
		);
	});

	test("blocks generation-1 and generation-2 HTML/UTF-16 polyglots and brand/boxSize spoofs", () => {
		const vectors = [
			ENC.encode("<!doctype html><html><script>alert(1)</script></html>"),
			new Uint8Array([0xff, 0xfe, 0x20, 0x00, 0x3c, 0x00, 0x68, 0x00]),
			ENC.encode("ID3<html><script>alert(1)</script>"),
			ENC.encode("ID3\x04<html><script>alert(1)</script>"),
			ENC.encode("RIFF<!--WAVE<html><script>alert(1)</script>"),
			ENC.encode("RIFF<a  WAVEfmt ><script>alert(1)</script>"),
			ENC.encode("OggS<html><script>alert(1)</script></html>"),
			ENC.encode("OggS\x00\x02<html><script>alert(1)</script></html>"),
			new Uint8Array([
				0x1a,
				0x45,
				0xdf,
				0xa3,
				...ENC.encode("<html><!--webm--><script>alert(1)</script>"),
			]),
			ENC.encode("<!--ftyp--><html><script>alert(1)</script></html>"),
			ENC.encode("<!--mdat--><html><script>alert(1)</script></html>"),
			new Uint8Array([
				0,
				0,
				0,
				8,
				...ENC.encode("wide<!--mdat--><html><script>"),
			]),
			new Uint8Array([
				0,
				0,
				0,
				8,
				...ENC.encode("free<html><script>alert(1)</script>"),
			]),
		];

		for (const mime of Object.keys(QUIZ_MEDIA_TYPES)) {
			for (const payload of vectors) {
				expect(
					matchesQuizMediaMagic(mime, payload, payload.byteLength),
					`${mime} must reject polyglot`,
				).toBe(false);
			}
		}

		// qt   brand banned on audio/mp4 & audio/x-m4a
		expect(matchesQuizMediaMagic("audio/mp4", FFMPEG_HEADERS.movQt, 1533)).toBe(
			false,
		);
		expect(
			matchesQuizMediaMagic("audio/x-m4a", FFMPEG_HEADERS.movQt, 1533),
		).toBe(false);

		// ftyp boxSize > totalSize rejected
		expect(matchesQuizMediaMagic("audio/mp4", FFMPEG_HEADERS.m4a, 16)).toBe(
			false,
		);

		// HEIC / AVIF image brands banned even on video/quicktime
		const heic = hexToBytes("000000186674797068656963000000006d69663168656963");
		expect(matchesQuizMediaMagic("video/quicktime", heic, 1024)).toBe(false);
		expect(matchesQuizMediaMagic("video/mp4", heic, 1024)).toBe(false);
	});
});
