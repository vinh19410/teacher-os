/**
 * Bộ tạo fixture nhị phân hợp lệ tối thiểu dùng chung cho các route test
 * upload của `apps/server` (#681). Các helper dùng header thật của từng họ
 * container — trùng khớp header `ffmpeg` thật mà `packages/api/src/lib/
 * quiz-media.test.ts` đã xác thực — để không tự bịa byte hợp lệ rồi lệch
 * với matcher dùng chung tại `@teacher-os/api`.
 */

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.replace(/\s+/g, "");
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i += 1) {
		out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

function withFill(
	header: Uint8Array,
	length: number,
	fill: number,
): Uint8Array {
	const out = new Uint8Array(Math.max(length, header.byteLength));
	out.set(header);
	out.fill(fill, header.byteLength);
	return out;
}

const FFMPEG_HEADERS = {
	mp3Id3:
		"4944330400000000003354495432000000060000035465737400545353450000000f0000034c61766636302e31362e3130300000000000000000000000fffb40",
	mp3Raw: "fffb9064",
	wav: "524946468606000057415645666d74201000000001000100803e0000007d0000020010004c4953541a000000494e464f495346540e0000004c61766636302e31",
	wavRf64:
		"52463634ffffffff57415645647336341c000000aa060000000000004006000000000000200300000000000000000000666d74201000000001000100803e0000",
	ogg: "4f67675300020000000000000000ef133b2f000000007afe6a0201134f707573486561640101380180bb00000000004f67675300000000000000000000ef133b",
	webm: "1a45dfa39f4286810142f7810142f2810442f381084282847765626d4287810442858102185380670100000000000205114d9b74ba4dbb8b53ab841549a96653",
	m4a: "0000001c667479704d344120000002004d34412069736f6d69736f320000000866726565000000296d646174de02004c61766336302e33312e31303200023040",
	movQt:
		"00000014667479707174202000000200717420200000000877696465000002d96d646174000002ae0605ffffaadc45e9bde6d948b7962cd820d923eeef783236",
	movWideMdat: "0000000877696465000000106d64617400000000",
	aacAdts:
		"fff15040039ffcde02004c61766336302e33312e313032000230400efff15040017ffc01182007fff15040017ffc01182007fff15040017ffc01182007",
	png: "89504e470d0a1a0a0000000d49484452000000040000000408020000002693092900000009704859730000000100000001004f25c4d60000000f49444154789c",
	jpeg: "ffd8ffe000104a46494600010200000100010000fffe00104c61766336302e33312e31303200ffdb004300080404040404050505050505060606060606060606",
};

/** MPEG-1 Layer III frame (`FF FB 90 64`) + fill. `length >= 4`. */
export function mp3Bytes(length = 16, fill = 1): Uint8Array {
	return withFill(hexToBytes(FFMPEG_HEADERS.mp3Raw), length, fill);
}

/**
 * ID3v2.4 hợp lệ 14 byte mở đầu (major 4, flags 0, 4 synchsafe size byte,
 * padding `00` tại `10..13` — vượt qua kiểm frame ID chống `ID3<html>`)
 * + UTF-8 tag text. Trùng header ID3v2.4 của các fixture MP3 thật trong repo
 * (`speaking-sample.mp3`, `placement-seed/clip-*.mp3`).
 */
export function mp3Id3Bytes(tagText = ""): Uint8Array {
	const header = new Uint8Array([
		0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0,
	]);
	const tag = new TextEncoder().encode(tagText);
	const out = new Uint8Array(header.byteLength + tag.byteLength);
	out.set(header);
	out.set(tag, header.byteLength);
	return out;
}

/** M4A `ftypM4A ` + `free` + `mdat` header thật (`ffmpeg`). `length >= 16`. */
export function mp4Bytes(length = 16, fill = 7, brand = "M4A "): Uint8Array {
	if (brand === "M4A ") {
		return withFill(hexToBytes(FFMPEG_HEADERS.m4a), length, fill);
	}
	if (brand === "qt  ") {
		return withFill(hexToBytes(FFMPEG_HEADERS.movQt), length, fill);
	}
	const brandBytes = new TextEncoder().encode(brand.padEnd(4, " ").slice(0, 4));
	const header = new Uint8Array([
		0,
		0,
		0,
		16,
		0x66,
		0x74,
		0x79,
		0x70,
		...brandBytes,
		0,
		0,
		0,
		0,
	]);
	return withFill(header, length, fill);
}

/** Legacy QuickTime `wide` (8B) + `mdat` (size 16) không có `ftyp`. */
export function movLegacyWideMdatBytes(length = 24, fill = 8): Uint8Array {
	return withFill(hexToBytes(FFMPEG_HEADERS.movWideMdat), length, fill);
}

/** WAV `RIFF` + `WAVEfmt ` header thật (`ffmpeg`, PCM 16 kHz mono). */
export function wavBytes(length = 24, fill = 2): Uint8Array {
	return withFill(hexToBytes(FFMPEG_HEADERS.wav), length, fill);
}

/** WAV `RF64` + `ds64` header thật (`ffmpeg -rf64 always`). */
export function wavRf64Bytes(length = 28, fill = 2): Uint8Array {
	return withFill(hexToBytes(FFMPEG_HEADERS.wavRf64), length, fill);
}

/** OGG Opus BOS trang đầu (`ffmpeg -c:a libopus`). `length >= 28`. */
export function oggBytes(length = 28, fill = 3): Uint8Array {
	return withFill(hexToBytes(FFMPEG_HEADERS.ogg), length, fill);
}

/** WebM Opus EBML + DocType "webm" (`ffmpeg -c:a libopus`). `length >= 36`. */
export function webmBytes(length = 36, fill = 4): Uint8Array {
	return withFill(hexToBytes(FFMPEG_HEADERS.webm), length, fill);
}

/** AAC ADTS header thật (`ffmpeg -c:a aac -f adts`). `length >= 7`. */
export function aacAdtsBytes(length = 16, fill = 5): Uint8Array {
	return withFill(hexToBytes(FFMPEG_HEADERS.aacAdts), length, fill);
}

/** PNG `89 50 4E 47 0D 0A 1A 0A` + IHDR thật (`ffmpeg`). `length >= 8`. */
export function pngBytes(length = 16, fill = 9): Uint8Array {
	return withFill(hexToBytes(FFMPEG_HEADERS.png), length, fill);
}

/** JPEG `FF D8 FF E0` (JFIF APP0) thật (`ffmpeg`). `length >= 4`. */
export function jpegBytes(length = 16, fill = 10): Uint8Array {
	return withFill(hexToBytes(FFMPEG_HEADERS.jpeg), length, fill);
}

/** `FTYPM4A ` M4A cho ca dương `.m4a` + `audio/mp4` (`mp4Bytes(16, 7, "M4A ")`). */
export const m4aFtypBytes = (length = 16, fill = 7): Uint8Array =>
	mp4Bytes(length, fill, "M4A ");

/** QuickTime `ftypqt  ` MOV (`movQtFtypBytes`). */
export const movQtFtypBytes = (length = 20, fill = 6): Uint8Array =>
	mp4Bytes(length, fill, "qt  ");
