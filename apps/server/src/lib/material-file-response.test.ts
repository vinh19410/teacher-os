import { describe, expect, test } from "vitest";
import { materialFileResponse } from "./material-file-response";
import type { MediaStore } from "./media-store";

const EXPECTED_STRICT_CSP =
	"default-src 'none'; frame-ancestors 'none'; sandbox";
const EXPECTED_INLINE_CSP =
	"default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; sandbox allow-same-origin";

function createSingleObjectStore(
	bytes: Uint8Array,
	contentType = "text/html",
): MediaStore {
	return {
		async put() {},
		async get(key, range) {
			if (key !== "org-1/mat-1") return null;
			const slice = range
				? bytes.slice(range.offset, range.offset + range.length)
				: bytes;
			return {
				body: new Response(slice).body as ReadableStream<Uint8Array>,
				contentType,
				size: bytes.byteLength,
				...(range ? { range } : {}),
			};
		},
		async delete() {},
	};
}

describe("materialFileResponse CSP and MIME isolation (#647)", () => {
	const store = createSingleObjectStore(new Uint8Array([1, 2, 3, 4, 5, 6]));

	test("inline allowlisted media (200) enables media-src self + sandbox allow-same-origin without allow-scripts", async () => {
		const res = await materialFileResponse(
			store,
			{
				objectKey: "org-1/mat-1",
				mimeType: "Audio/MPEG; charset=binary",
				sizeBytes: 6,
				originalName: "Bài nghe (1).mp3",
				kind: "media",
			},
			{ rangeHeader: undefined, download: false },
		);
		expect(res).not.toBeNull();
		expect(res?.status).toBe(200);
		expect(res?.headers.get("Content-Disposition")).toMatch(/^inline;/);
		expect(res?.headers.get("Content-Type")).toBe("audio/mpeg");
		expect(res?.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(res?.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
		expect(res?.headers.get("Referrer-Policy")).toBe("no-referrer");
		const csp = res?.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toBe(EXPECTED_INLINE_CSP);
		expect(csp).not.toContain("allow-scripts");
		expect(csp).not.toContain("script-src");
	});

	test("206 Partial Content honors inline vs forced download CSP", async () => {
		const inlineRange = await materialFileResponse(
			store,
			{
				objectKey: "org-1/mat-1",
				mimeType: "video/mp4",
				sizeBytes: 6,
				originalName: "clip.mp4",
				kind: "media",
			},
			{ rangeHeader: "bytes=0-3", download: false },
		);
		expect(inlineRange?.status).toBe(206);
		expect(inlineRange?.headers.get("Content-Disposition")).toMatch(/^inline;/);
		expect(inlineRange?.headers.get("Content-Security-Policy")).toBe(
			EXPECTED_INLINE_CSP,
		);

		const downloadRange = await materialFileResponse(
			store,
			{
				objectKey: "org-1/mat-1",
				mimeType: "video/mp4",
				sizeBytes: 6,
				originalName: "clip.mp4",
				kind: "media",
			},
			{ rangeHeader: "bytes=0-3", download: true },
		);
		expect(downloadRange?.status).toBe(206);
		expect(downloadRange?.headers.get("Content-Disposition")).toMatch(
			/^attachment;/,
		);
		expect(downloadRange?.headers.get("Content-Security-Policy")).toBe(
			EXPECTED_STRICT_CSP,
		);
	});

	test("media with download=true forces attachment and strict CSP", async () => {
		const res = await materialFileResponse(
			store,
			{
				objectKey: "org-1/mat-1",
				mimeType: "audio/mpeg",
				sizeBytes: 6,
				originalName: "a.mp3",
				kind: "media",
			},
			{ rangeHeader: undefined, download: true },
		);
		expect(res?.status).toBe(200);
		expect(res?.headers.get("Content-Disposition")).toMatch(/^attachment;/);
		expect(res?.headers.get("Content-Security-Policy")).toBe(
			EXPECTED_STRICT_CSP,
		);
	});

	test.each([
		{ mimeType: null, expectedType: "application/octet-stream" },
		{ mimeType: "text/html", expectedType: "application/octet-stream" },
		{ mimeType: "__proto__", expectedType: "application/octet-stream" },
		{ mimeType: "application/pdf", expectedType: "application/pdf" },
	])(
		"kind=media with non-media mimeType ($mimeType) downgrades to attachment + strict CSP + safe Content-Type",
		async ({ mimeType, expectedType }) => {
			const res = await materialFileResponse(
				store,
				{
					objectKey: "org-1/mat-1",
					mimeType,
					sizeBytes: 6,
					originalName: "suspect",
					kind: "media",
				},
				{ rangeHeader: undefined, download: false },
			);
			expect(res?.status).toBe(200);
			expect(res?.headers.get("Content-Disposition")).toMatch(/^attachment;/);
			expect(res?.headers.get("Content-Security-Policy")).toBe(
				EXPECTED_STRICT_CSP,
			);
			expect(res?.headers.get("Content-Type")).toBe(expectedType);
		},
	);

	test("document kind=file uses attachment and strict CSP", async () => {
		const res = await materialFileResponse(
			store,
			{
				objectKey: "org-1/mat-1",
				mimeType: "application/pdf",
				sizeBytes: 6,
				originalName: "bai.pdf",
				kind: "file",
			},
			{ rangeHeader: undefined, download: false },
		);
		expect(res?.status).toBe(200);
		expect(res?.headers.get("Content-Disposition")).toMatch(/^attachment;/);
		expect(res?.headers.get("Content-Type")).toBe("application/pdf");
		expect(res?.headers.get("Content-Security-Policy")).toBe(
			EXPECTED_STRICT_CSP,
		);
	});

	test("416 Range Not Satisfiable uses strict CSP and isolation headers", async () => {
		const res = await materialFileResponse(
			store,
			{
				objectKey: "org-1/mat-1",
				mimeType: "audio/mpeg",
				sizeBytes: 6,
				originalName: "a.mp3",
				kind: "media",
			},
			{ rangeHeader: "bytes=99-100", download: false },
		);
		expect(res?.status).toBe(416);
		expect(res?.headers.get("Content-Security-Policy")).toBe(
			EXPECTED_STRICT_CSP,
		);
		expect(res?.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
		expect(res?.headers.get("Referrer-Policy")).toBe("no-referrer");
	});
});
