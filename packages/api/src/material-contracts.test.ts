import { describe, expect, test } from "vitest";
import {
	checkMaterialUpload,
	isSafeMaterialUrl,
	lessonMaterialAttachSchema,
	MATERIAL_DOC_MAX_BYTES,
	MATERIAL_MEDIA_MAX_BYTES,
	materialFolderCreateSchema,
	materialFolderUpdateSchema,
	materialLinkCreateSchema,
	materialUpdateSchema,
	resolveMaterialMimeType,
} from "./material-contracts";

const DOCX =
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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

	test("caps documents at 25MB and media at 100MB", () => {
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
	test("keeps an allowed browser type", () => {
		expect(resolveMaterialMimeType("a.bin", "application/pdf")).toBe(
			"application/pdf",
		);
	});
	test("maps aliases and falls back to the extension", () => {
		expect(resolveMaterialMimeType("voice.m4a", "audio/x-m4a")).toBe(
			"audio/mp4",
		);
		expect(resolveMaterialMimeType("Bai 1.DOCX", "")).toBe(DOCX);
		expect(resolveMaterialMimeType("clip.mp4", "")).toBe("video/mp4");
	});
	test("returns null for unsupported files", () => {
		expect(resolveMaterialMimeType("page.html", "text/html")).toBeNull();
		expect(resolveMaterialMimeType("noext", "")).toBeNull();
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
