import { QUIZ_MEDIA_MAX_BYTES, QUIZ_MEDIA_TYPES } from "../contracts";
import { LIBRARY_AUDIO_MIME } from "../library-contracts";

/**
 * Nhận diện chữ ký nhị phân (magic-byte) trên tối đa 64 byte đầu luồng cho
 * đủ 12 MIME trong `QUIZ_MEDIA_TYPES` và 9 MIME audio trong `LIBRARY_AUDIO_MIME`
 * (#681). Chặn các payload giả mạo và polyglot HTML / UTF-16 BOM ở tiền tố đầu
 * file trước khi ghi kho; không thay thế `nosniff` + CSP `sandbox` khi phát lại.
 */

export const QUIZ_MEDIA_MAGIC_PEEK_BYTES = 64;

const BANNED_IMAGE_FTYP_BRANDS: Readonly<Record<string, true>> = {
	heic: true,
	heix: true,
	hevc: true,
	hevx: true,
	mif1: true,
	msf1: true,
	avif: true,
	avis: true,
	"jp2 ": true,
};

const QT_MOOV_CHILD_ATOMS: Readonly<Record<string, true>> = {
	mvhd: true,
	cmov: true,
	trak: true,
	udta: true,
	meta: true,
};

const QT_PADDING_ATOMS: Readonly<Record<string, true>> = {
	free: true,
	skip: true,
	pnot: true,
	junk: true,
};

const QT_TOP_LEVEL_ATOMS: Readonly<Record<string, true>> = {
	ftyp: true,
	moov: true,
	mdat: true,
	wide: true,
	free: true,
	skip: true,
	pnot: true,
	junk: true,
};

function hasBytesAt(
	buf: Uint8Array,
	offset: number,
	expected: readonly number[],
): boolean {
	if (buf.byteLength < offset + expected.length) return false;
	for (let i = 0; i < expected.length; i += 1) {
		if (buf[offset + i] !== expected[i]) return false;
	}
	return true;
}

function readFourCcAlnumSpace(buf: Uint8Array, offset: number): string | null {
	if (buf.byteLength < offset + 4) return null;
	let out = "";
	for (let i = 0; i < 4; i += 1) {
		const b = buf[offset + i] ?? 0;
		const valid =
			b === 0x20 ||
			(b >= 0x30 && b <= 0x39) ||
			(b >= 0x41 && b <= 0x5a) ||
			(b >= 0x61 && b <= 0x7a);
		if (!valid) return null;
		out += String.fromCharCode(b);
	}
	return out;
}

function matchesId3v2(head: Uint8Array): boolean {
	if (head.byteLength < 10 || !hasBytesAt(head, 0, [0x49, 0x44, 0x33])) {
		return false;
	}
	const major = head[3] ?? 0;
	const rev = head[4] ?? 0xff;
	const flags = head[5] ?? 0xff;
	if (major < 2 || major > 4 || rev > 2) return false;
	const reservedMask = major === 2 ? 0x3f : major === 3 ? 0x1f : 0x0f;
	if ((flags & reservedMask) !== 0) return false;
	const syncBits =
		(head[6] ?? 0x80) |
		(head[7] ?? 0x80) |
		(head[8] ?? 0x80) |
		(head[9] ?? 0x80);
	if ((syncBits & 0x80) !== 0) return false;

	const hasExtendedHeader = major >= 3 && (flags & 0x40) !== 0;
	if (head.byteLength >= 14 && !hasExtendedHeader && head[10] !== 0x00) {
		const idLen = major === 2 ? 3 : 4;
		for (let i = 0; i < idLen; i += 1) {
			const ch = head[10 + i] ?? 0;
			const isUpperOrDigit =
				(ch >= 0x30 && ch <= 0x39) || (ch >= 0x41 && ch <= 0x5a);
			if (!isUpperOrDigit) return false;
		}
	}
	return true;
}

function matchesMpegLayer3Sync(head: Uint8Array): boolean {
	if (head.byteLength < 4) return false;
	const b0 = head[0] ?? 0;
	const b1 = head[1] ?? 0;
	const b2 = head[2] ?? 0;
	return (
		b0 === 0xff &&
		(b1 & 0xe0) === 0xe0 &&
		(b1 & 0x18) !== 0x08 &&
		(b1 & 0x06) === 0x02 &&
		(b2 & 0xf0) !== 0x00 &&
		(b2 & 0xf0) !== 0xf0 &&
		(b2 & 0x0c) !== 0x0c
	);
}

function matchesWav(head: Uint8Array, totalSize?: number): boolean {
	if (
		head.byteLength < 20 ||
		!hasBytesAt(head, 8, [0x57, 0x41, 0x56, 0x45]) ||
		readFourCcAlnumSpace(head, 12) === null
	) {
		return false;
	}
	const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
	const riffSize = view.getUint32(4, true);
	const subSize = view.getUint32(16, true);
	const cap =
		totalSize !== undefined
			? Math.min(totalSize, QUIZ_MEDIA_MAX_BYTES)
			: QUIZ_MEDIA_MAX_BYTES;

	if (hasBytesAt(head, 0, [0x52, 0x46, 0x36, 0x34])) {
		return (
			riffSize === 0xffffffff &&
			hasBytesAt(head, 12, [0x64, 0x73, 0x36, 0x34]) &&
			subSize >= 28 &&
			subSize <= 1024
		);
	}
	if (!hasBytesAt(head, 0, [0x52, 0x49, 0x46, 0x46])) return false;
	if (riffSize !== 0xffffffff && (riffSize < 12 || riffSize > cap + 8)) {
		return false;
	}
	if (hasBytesAt(head, 12, [0x66, 0x6d, 0x74, 0x20])) {
		return subSize >= 16 && subSize <= 1024;
	}
	return subSize <= cap;
}

function matchesOgg(head: Uint8Array): boolean {
	if (head.byteLength < 27 || !hasBytesAt(head, 0, [0x4f, 0x67, 0x67, 0x53])) {
		return false;
	}
	const flags = head[5] ?? 0xff;
	if (
		head[4] !== 0x00 ||
		(flags & 0xf8) !== 0 ||
		(flags & 0x02) !== 0x02 ||
		(flags & 0x01) !== 0
	) {
		return false;
	}
	const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
	return view.getUint32(18, true) === 0 && (head[26] ?? 0) >= 1;
}

function matchesWebm(head: Uint8Array): boolean {
	if (head.byteLength < 16 || !hasBytesAt(head, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
		return false;
	}
	const v0 = head[4] ?? 0;
	if (v0 === 0) return false;
	let vintLen = 1;
	let mask = 0x80;
	while (vintLen <= 8 && (v0 & mask) === 0) {
		vintLen += 1;
		mask >>= 1;
	}
	if (vintLen > 8 || 4 + vintLen >= head.byteLength) return false;
	const firstChild = head[4 + vintLen] ?? 0;
	if (firstChild !== 0x42 && firstChild !== 0xec && firstChild !== 0xbf) {
		return false;
	}
	for (let pos = 4 + vintLen; pos <= head.byteLength - 7; pos += 1) {
		if (head[pos] === 0x42 && head[pos + 1] === 0x82) {
			if (
				head[pos + 2] === 0x84 &&
				hasBytesAt(head, pos + 3, [0x77, 0x65, 0x62, 0x6d])
			) {
				return true;
			}
			if (
				head[pos + 2] === 0x88 &&
				hasBytesAt(
					head,
					pos + 3,
					[0x6d, 0x61, 0x74, 0x72, 0x6f, 0x73, 0x6b, 0x61],
				)
			) {
				return true;
			}
		}
	}
	return false;
}

function matchesAdtsSync(head: Uint8Array): boolean {
	if (head.byteLength < 7) return false;
	const b0 = head[0] ?? 0;
	const b1 = head[1] ?? 0;
	const b2 = head[2] ?? 0;
	const b3 = head[3] ?? 0;
	const b4 = head[4] ?? 0;
	const b5 = head[5] ?? 0;
	const sfIndex = (b2 >> 2) & 0x0f;
	const frameLen = ((b3 & 0x03) << 11) | (b4 << 3) | ((b5 >> 5) & 0x07);
	return b0 === 0xff && (b1 & 0xf6) === 0xf0 && sfIndex < 13 && frameLen >= 7;
}

function matchesIsoBmffFtyp(
	head: Uint8Array,
	totalSize: number | undefined,
	allowQtBrand: boolean,
): boolean {
	if (head.byteLength < 16 || !hasBytesAt(head, 4, [0x66, 0x74, 0x79, 0x70])) {
		return false;
	}
	const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
	const rawSize = view.getUint32(0, false);
	let effectiveSize = rawSize;
	let brandOffset = 8;
	if (rawSize === 1) {
		if (head.byteLength < 24 || view.getUint32(8, false) !== 0) return false;
		effectiveSize = view.getUint32(12, false);
		if (effectiveSize < 24) return false;
		brandOffset = 16;
	} else if (rawSize < 16) {
		return false;
	}
	if (
		effectiveSize > 4096 ||
		effectiveSize % 4 !== 0 ||
		(totalSize !== undefined && effectiveSize > totalSize)
	) {
		return false;
	}
	const brand = readFourCcAlnumSpace(head, brandOffset);
	if (brand === null || Object.hasOwn(BANNED_IMAGE_FTYP_BRANDS, brand)) {
		return false;
	}
	return allowQtBrand || brand !== "qt  ";
}

function matchesLegacyQuickTimeAtom(
	head: Uint8Array,
	totalSize?: number,
): boolean {
	if (head.byteLength < 16) return false;
	const cap =
		totalSize !== undefined
			? Math.min(totalSize, QUIZ_MEDIA_MAX_BYTES)
			: QUIZ_MEDIA_MAX_BYTES;
	const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
	const size = view.getUint32(0, false);
	const type = readFourCcAlnumSpace(head, 4);
	if (type === null) return false;

	if (type === "wide") {
		if (size !== 8 || readFourCcAlnumSpace(head, 12) !== "mdat") return false;
		const mdatSize = view.getUint32(8, false);
		return (
			mdatSize === 0 || mdatSize === 1 || (mdatSize >= 8 && mdatSize <= cap)
		);
	}
	if (type === "moov") {
		if (size < 16 || size > cap) return false;
		const childSize = view.getUint32(8, false);
		const childType = readFourCcAlnumSpace(head, 12);
		return (
			childSize >= 8 &&
			childSize <= size - 8 &&
			childType !== null &&
			Object.hasOwn(QT_MOOV_CHILD_ATOMS, childType)
		);
	}
	if (type === "mdat") {
		if (size === 0) return true;
		if (size === 1) {
			const hi = view.getUint32(8, false);
			const lo = view.getUint32(12, false);
			return hi === 0 && lo >= 16 && lo <= cap;
		}
		return size >= 8 && size <= cap;
	}
	if (Object.hasOwn(QT_PADDING_ATOMS, type)) {
		if (size < 8 || size > cap) return false;
		if (size <= head.byteLength - 8) {
			const nextType = readFourCcAlnumSpace(head, size + 4);
			return nextType !== null && Object.hasOwn(QT_TOP_LEVEL_ATOMS, nextType);
		}
		return true;
	}
	return false;
}

export function matchesQuizMediaMagic(
	mimeType: string,
	head: Uint8Array,
	totalSize?: number,
): boolean {
	if (
		totalSize !== undefined &&
		(!Number.isSafeInteger(totalSize) || totalSize <= 0)
	) {
		return false;
	}
	const normalized = (mimeType.split(";")[0] ?? "").trim().toLowerCase();
	if (!Object.hasOwn(QUIZ_MEDIA_TYPES, normalized)) return false;

	if (normalized === "audio/mpeg") {
		return matchesId3v2(head) || matchesMpegLayer3Sync(head);
	}
	if (
		normalized === "audio/wav" ||
		normalized === "audio/x-wav" ||
		normalized === "audio/wave"
	) {
		return matchesWav(head, totalSize);
	}
	if (normalized === "audio/ogg") {
		return matchesOgg(head);
	}
	if (normalized === "audio/webm" || normalized === "video/webm") {
		return matchesWebm(head);
	}
	if (normalized === "audio/aac") {
		return (
			matchesAdtsSync(head) ||
			matchesId3v2(head) ||
			matchesIsoBmffFtyp(head, totalSize, false)
		);
	}
	if (normalized === "audio/mp4" || normalized === "audio/x-m4a") {
		return matchesIsoBmffFtyp(head, totalSize, false);
	}
	if (normalized === "video/mp4") {
		return matchesIsoBmffFtyp(head, totalSize, true);
	}
	if (normalized === "video/quicktime") {
		return (
			matchesIsoBmffFtyp(head, totalSize, true) ||
			matchesLegacyQuickTimeAtom(head, totalSize)
		);
	}
	return false;
}

export function matchesLibraryAudioMagic(
	mimeType: string,
	head: Uint8Array,
	totalSize?: number,
): boolean {
	const normalized = (mimeType.split(";")[0] ?? "").trim().toLowerCase();
	return (
		Object.hasOwn(LIBRARY_AUDIO_MIME, normalized) &&
		matchesQuizMediaMagic(normalized, head, totalSize)
	);
}
