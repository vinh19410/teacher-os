import { describe, expect, test } from "vitest";
import {
	checkMaterialUpload,
	isSafeMaterialUrl,
	lessonMaterialAttachSchema,
	MATERIAL_DOC_MAX_BYTES,
	MATERIAL_MAGIC_PEEK_BYTES,
	MATERIAL_MEDIA_MAX_BYTES,
	MATERIAL_MIME,
	matchesMaterialMagic,
	materialExtensionMatches,
	materialFolderCreateSchema,
	materialFolderUpdateSchema,
	materialLinkCreateSchema,
	materialUpdateSchema,
	resolveMaterialMimeType,
} from "./material-contracts";

const DOCX =
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX =
	"application/vnd.openxmlformats-officedocument.presentationml.presentation";
const XLSX =
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function minimalZipHeader(
	method = 8,
	name = "[Content_Types].xml",
): Uint8Array {
	const nameBytes = new TextEncoder().encode(name);
	const out = new Uint8Array(30 + nameBytes.byteLength);
	out.set([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0]);
	out[8] = method & 0xff;
	out[9] = (method >> 8) & 0xff;
	out[26] = nameBytes.byteLength & 0xff;
	out[27] = (nameBytes.byteLength >> 8) & 0xff;
	out.set(nameBytes, 30);
	return out;
}

describe("checkMaterialUpload", () => {
	test.each([
		["application/pdf", "file"],
		["image/png", "file"],
		["image/jpeg", "file"],
		["image/webp", "file"],
		[DOCX, "file"],
		[
			"application/vnd.openxmlformats-officedocument.presentationml.presentation",
			"file",
		],
		[
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"file",
		],
		["audio/mpeg", "media"],
		["audio/mp4", "media"],
		["video/mp4", "media"],
	])("accepts %s as %s", (mimeType, kind) => {
		expect(checkMaterialUpload({ mimeType, size: 1024 })).toMatchObject({
			ok: true,
			kind,
			mimeType,
		});
	});

	test("normalizes parameters and case", () => {
		expect(
			checkMaterialUpload({ mimeType: "Application/PDF; charset=x", size: 1 }),
		).toMatchObject({ ok: true, mimeType: "application/pdf" });
	});

	test.each([
		"text/html",
		"image/svg+xml",
		"application/zip",
		"application/msword",
		"video/webm",
		"audio/x-m4a",
		"",
	])("rejects %s", (mimeType) => {
		expect(checkMaterialUpload({ mimeType, size: 10 })).toEqual({
			ok: false,
			reason: "type",
		});
	});

	test("rejects empty or invalid size", () => {
		expect(
			checkMaterialUpload({ mimeType: "application/pdf", size: 0 }),
		).toEqual({ ok: false, reason: "empty" });
		expect(
			checkMaterialUpload({ mimeType: "application/pdf", size: Number.NaN }),
		).toEqual({ ok: false, reason: "empty" });
	});

	test("caps documents at 25MB and media at 95MB (below 100MB Cloudflare edge limit)", () => {
		expect(MATERIAL_MEDIA_MAX_BYTES).toBe(95 * 1024 * 1024);
		expect(MATERIAL_MEDIA_MAX_BYTES).toBeLessThan(100_000_000);
		expect(
			checkMaterialUpload({
				mimeType: "application/pdf",
				size: MATERIAL_DOC_MAX_BYTES,
			}).ok,
		).toBe(true);
		expect(
			checkMaterialUpload({
				mimeType: "application/pdf",
				size: MATERIAL_DOC_MAX_BYTES + 1,
			}),
		).toEqual({ ok: false, reason: "size", maxBytes: MATERIAL_DOC_MAX_BYTES });
		expect(
			checkMaterialUpload({
				mimeType: "video/mp4",
				size: MATERIAL_DOC_MAX_BYTES + 1,
			}).ok,
		).toBe(true);
		expect(
			checkMaterialUpload({
				mimeType: "video/mp4",
				size: 96 * 1024 * 1024,
			}),
		).toEqual({
			ok: false,
			reason: "size",
			maxBytes: 95 * 1024 * 1024,
		});
		expect(
			checkMaterialUpload({
				mimeType: "video/mp4",
				size: MATERIAL_MEDIA_MAX_BYTES + 1,
			}),
		).toEqual({
			ok: false,
			reason: "size",
			maxBytes: MATERIAL_MEDIA_MAX_BYTES,
		});
	});
});

describe("resolveMaterialMimeType", () => {
	test("keeps an allowed browser type only when extension matches", () => {
		expect(resolveMaterialMimeType("a.pdf", "application/pdf")).toBe(
			"application/pdf",
		);
		expect(resolveMaterialMimeType("a.bin", "application/pdf")).toBeNull();
		expect(resolveMaterialMimeType("Đề 1.pdf ", "application/pdf")).toBe(
			"application/pdf",
		);
	});
	test("maps browser/OS aliases and falls back when browserType is empty or octet-stream", () => {
		expect(resolveMaterialMimeType("voice.m4a", "audio/x-m4a")).toBe(
			"audio/mp4",
		);
		expect(resolveMaterialMimeType("voice.m4a", "video/mp4")).toBe("audio/mp4");
		expect(resolveMaterialMimeType("voice.m4a", "audio/mp4a-latm")).toBe(
			"audio/mp4",
		);
		expect(resolveMaterialMimeType("track.mp3", "audio/x-mp3")).toBe(
			"audio/mpeg",
		);
		expect(resolveMaterialMimeType("x.jpg", "image/jpg")).toBe("image/jpeg");
		expect(resolveMaterialMimeType("x.jpg", "image/pjpeg")).toBe("image/jpeg");
		expect(resolveMaterialMimeType("x.png", "image/x-png")).toBe("image/png");
		expect(resolveMaterialMimeType("Bai 1.DOCX", "")).toBe(DOCX);
		expect(
			resolveMaterialMimeType("Bai 1.docx", "application/x-zip-compressed"),
		).toBe(DOCX);
		expect(resolveMaterialMimeType("clip.mp4", "")).toBe("video/mp4");
		expect(
			resolveMaterialMimeType("clip.mp4", "application/octet-stream"),
		).toBe("video/mp4");
		expect(
			resolveMaterialMimeType(
				"clip.mp4",
				"APPLICATION/OCTET-STREAM; charset=binary",
			),
		).toBe("video/mp4");
	});
	test("returns null for dangerous browser types, mismatches, dotfiles, and prototype keys", () => {
		expect(resolveMaterialMimeType("page.html", "text/html")).toBeNull();
		expect(resolveMaterialMimeType("doc.pdf", "text/html")).toBeNull();
		expect(resolveMaterialMimeType("answer.mp3", "text/html")).toBeNull();
		expect(resolveMaterialMimeType("payload.html", "audio/mpeg")).toBeNull();
		expect(resolveMaterialMimeType("mismatch.pdf", "audio/mpeg")).toBeNull();
		expect(resolveMaterialMimeType("noext", "")).toBeNull();
		expect(resolveMaterialMimeType(".pdf", "application/pdf")).toBeNull();
		expect(resolveMaterialMimeType("..pdf", "application/pdf")).toBeNull();
		expect(
			resolveMaterialMimeType(".hidden.pdf", "application/pdf"),
		).toBeNull();
		expect(resolveMaterialMimeType("\u200B.pdf", "")).toBeNull();
		expect(
			resolveMaterialMimeType(`${"a".repeat(200)}.pdf`, "application/pdf"),
		).toBeNull();
		expect(resolveMaterialMimeType("a.toString", "")).toBeNull();
		expect(resolveMaterialMimeType("a.mp3", "constructor")).toBeNull();
	});
});

describe("materialExtensionMatches", () => {
	test("matches canonical MIME against sanitized extension case-insensitively", () => {
		expect(materialExtensionMatches("Bài 1.PDF", "application/pdf")).toBe(true);
		expect(materialExtensionMatches("a.jpg", "image/jpeg")).toBe(true);
		expect(materialExtensionMatches("a.jpeg", "image/jpeg")).toBe(true);
		expect(materialExtensionMatches("voice.m4a", "audio/mp4")).toBe(true);
	});
	test("rejects mismatched extensions, dotfiles, and prototype properties", () => {
		expect(materialExtensionMatches("payload.html", "audio/mpeg")).toBe(false);
		expect(materialExtensionMatches("x.pdf", "audio/mpeg")).toBe(false);
		expect(materialExtensionMatches(".mp3", "audio/mpeg")).toBe(false);
		expect(materialExtensionMatches("..mp3", "audio/mpeg")).toBe(false);
		expect(materialExtensionMatches(".hidden.mp3", "audio/mpeg")).toBe(false);
		expect(materialExtensionMatches("a.constructor", "audio/mpeg")).toBe(false);
	});
});

describe("matchesMaterialMagic", () => {
	const enc = (s: string) => new TextEncoder().encode(s);

	test("exports 64-byte peek constant and accepts valid signatures for all 10 MIMEs", () => {
		expect(MATERIAL_MAGIC_PEEK_BYTES).toBe(64);
		expect(
			matchesMaterialMagic("application/pdf", enc("%PDF-1.7\n1 0 obj")),
		).toBe(true);
		expect(
			matchesMaterialMagic(
				"image/png",
				new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
			),
		).toBe(true);
		expect(
			matchesMaterialMagic(
				"image/jpeg",
				new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
			),
		).toBe(true);
		expect(
			matchesMaterialMagic("image/webp", enc("RIFF$\x00\x00\x00WEBPVP8 ")),
		).toBe(true);
		const zip = minimalZipHeader(8);
		expect(matchesMaterialMagic(DOCX, zip)).toBe(true);
		expect(matchesMaterialMagic(PPTX, zip)).toBe(true);
		expect(matchesMaterialMagic(XLSX, zip)).toBe(true);
		expect(
			matchesMaterialMagic(
				"audio/mpeg",
				new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0x23]),
			),
		).toBe(true);
		expect(
			matchesMaterialMagic(
				"audio/mpeg",
				new Uint8Array([0xff, 0xfb, 0x90, 0x64]),
			),
		).toBe(true);
		const m4a = new Uint8Array([
			0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, 0, 0, 0, 0,
		]);
		const mp4 = new Uint8Array([
			0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
		]);
		expect(matchesMaterialMagic("audio/mp4", m4a)).toBe(true);
		expect(matchesMaterialMagic("video/mp4", mp4)).toBe(true);
	});

	test("rejects HTML, plain text, polyglots, UTF-16LE BOM, non-MP4 ftyp brands, and truncated buffers", () => {
		const html = enc("<!doctype html><html><script>alert(1)</script></html>");
		const text = enc("hello world plain text payload");
		for (const mime of Object.keys(MATERIAL_MIME)) {
			expect(matchesMaterialMagic(mime, html)).toBe(false);
			expect(matchesMaterialMagic(mime, text)).toBe(false);
			expect(matchesMaterialMagic(mime, new Uint8Array(0))).toBe(false);
			expect(matchesMaterialMagic(mime, new Uint8Array([0x25, 0x50]))).toBe(
				false,
			);
		}
		// UTF-16LE BOM + space + <html> ("FF FE 20 00 3C 00...") & ASCII ID3<html>
		const utf16Html = new Uint8Array([
			0xff, 0xfe, 0x20, 0x00, 0x3c, 0x00, 0x68, 0x00, 0x74, 0x00,
		]);
		expect(matchesMaterialMagic("audio/mpeg", utf16Html)).toBe(false);
		expect(
			matchesMaterialMagic("audio/mpeg", enc("ID3<html><script>alert(1)")),
		).toBe(false);
		// Invalid MPEG header variants: reserved version, ADTS layer 00, Layer I 0xFE, free bitrate 0x00, all-0xFF
		expect(
			matchesMaterialMagic(
				"audio/mpeg",
				new Uint8Array([0xff, 0xe8, 0x90, 0x00]),
			),
		).toBe(false);
		expect(
			matchesMaterialMagic(
				"audio/mpeg",
				new Uint8Array([0xff, 0xf1, 0x50, 0x80]),
			),
		).toBe(false);
		expect(
			matchesMaterialMagic(
				"audio/mpeg",
				new Uint8Array([0xff, 0xfe, 0x90, 0x00]),
			),
		).toBe(false);
		expect(
			matchesMaterialMagic(
				"audio/mpeg",
				new Uint8Array([0xff, 0xfb, 0x00, 0x00]),
			),
		).toBe(false);
		expect(
			matchesMaterialMagic(
				"audio/mpeg",
				new Uint8Array([0xff, 0xff, 0xff, 0xff]),
			),
		).toBe(false);
		// HTML comment polyglots & banned ISO-BMFF brands
		expect(
			matchesMaterialMagic("video/mp4", enc("<!--ftyp--><html><script>")),
		).toBe(false);
		expect(
			matchesMaterialMagic("audio/mp4", enc("<!--ftyp--><html><script>")),
		).toBe(false);
		expect(
			matchesMaterialMagic(
				"video/mp4",
				new Uint8Array([
					0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20,
				]),
			),
		).toBe(false);
		expect(
			matchesMaterialMagic(
				"video/mp4",
				new Uint8Array([
					0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
				]),
			),
		).toBe(false);
		expect(
			matchesMaterialMagic(
				"video/mp4",
				new Uint8Array([
					0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
				]),
			),
		).toBe(false);
		expect(
			matchesMaterialMagic("image/webp", enc("RIFF<!--WEBP--><html>")),
		).toBe(false);
		expect(
			matchesMaterialMagic("image/webp", enc("RIFF$\x00\x00\x00WAVEfmt ")),
		).toBe(false);
		expect(
			matchesMaterialMagic("application/pdf", enc("%PDF-<html><script>")),
		).toBe(false);
		expect(matchesMaterialMagic("application/pdf", enc("  %PDF-1.4\n"))).toBe(
			false,
		);
		expect(
			matchesMaterialMagic(
				DOCX,
				enc("PK\x03\x04<html><script>alert(1)</script>"),
			),
		).toBe(false);
		expect(matchesMaterialMagic("text/html", enc("%PDF-1.7\n"))).toBe(false);
	});
});

describe("isSafeMaterialUrl", () => {
	test.each(["https://example.com/a?b=1", "http://example.com"])(
		"accepts %s",
		(url) => {
			expect(isSafeMaterialUrl(url)).toBe(true);
		},
	);
	test.each([
		"javascript:alert(1)",
		"JAVASCRIPT:alert(1)",
		"data:text/html,<script>alert(1)</script>",
		"file:///etc/passwd",
		"ftp://example.com",
		"//example.com",
		"example.com",
		"",
	])("rejects %s", (url) => {
		expect(isSafeMaterialUrl(url)).toBe(false);
	});
});

describe("material schemas", () => {
	test("link create trims and defaults", () => {
		expect(
			materialLinkCreateSchema.parse({
				title: "  Video  ",
				url: " https://youtu.be/x ",
			}),
		).toEqual({
			title: "Video",
			description: "",
			url: "https://youtu.be/x",
			folderId: null,
		});
	});

	test("link create rejects javascript: and over-long fields", () => {
		expect(
			materialLinkCreateSchema.safeParse({
				title: "x",
				url: "javascript:alert(1)",
			}).success,
		).toBe(false);
		expect(
			materialLinkCreateSchema.safeParse({
				title: "x".repeat(201),
				url: "https://a.b",
			}).success,
		).toBe(false);
		expect(
			materialLinkCreateSchema.safeParse({
				title: "x",
				description: "d".repeat(1001),
				url: "https://a.b",
			}).success,
		).toBe(false);
		expect(
			materialLinkCreateSchema.safeParse({
				title: "x",
				url: "https://a.b",
				extra: 1,
			}).success,
		).toBe(false);
	});

	test("update requires at least one field", () => {
		expect(materialUpdateSchema.safeParse({}).success).toBe(false);
		expect(materialUpdateSchema.safeParse({ folderId: null }).success).toBe(
			true,
		);
		expect(materialUpdateSchema.safeParse({ title: "" }).success).toBe(false);
	});

	test("folder schemas", () => {
		expect(materialFolderCreateSchema.parse({ name: " Unit 1 " })).toEqual({
			name: "Unit 1",
			parentId: null,
		});
		expect(materialFolderCreateSchema.safeParse({ name: "" }).success).toBe(
			false,
		);
		expect(materialFolderCreateSchema.safeParse({ name: "a‮b" }).success).toBe(
			false,
		);
		expect(materialFolderUpdateSchema.safeParse({}).success).toBe(false);
		expect(
			materialFolderUpdateSchema.safeParse({ parentId: null }).success,
		).toBe(true);
	});

	test("attach requires a material id", () => {
		expect(lessonMaterialAttachSchema.safeParse({}).success).toBe(false);
		expect(
			lessonMaterialAttachSchema.parse({ materialId: "m-1" }).materialId,
		).toBe("m-1");
	});
});
