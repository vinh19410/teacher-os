import { describe, expect, test } from "vitest";
import { buildApp } from "../app";
import { mediaObjectResponse, toQuizAttemptMedia } from "./media-response";
import type { StoredMedia } from "./media-store";

function makeStoredMedia(
	bytes: Uint8Array = new Uint8Array([1, 2, 3, 4]),
	contentType = "audio/mpeg",
): StoredMedia {
	return {
		body: new ReadableStream({
			start(controller) {
				controller.enqueue(bytes);
				controller.close();
			},
		}),
		size: bytes.byteLength,
		contentType,
	};
}

describe("mediaObjectResponse security contract (#675)", () => {
	test("serves allowlisted media and exam-import source types inline with strict sandbox CSP (no allow-same-origin) and COOP", () => {
		for (const [rawMime, expectedMime] of [
			["audio/mpeg", "audio/mpeg"],
			["Audio/MPEG; codecs=mp3", "audio/mpeg"],
			["video/mp4", "video/mp4"],
			["application/pdf", "application/pdf"],
			["image/png", "image/png"],
			["image/jpeg", "image/jpeg"],
			["image/webp", "image/webp"],
			[
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			],
		] as const) {
			const res = mediaObjectResponse(makeStoredMedia(), {
				mediaType: rawMime,
				mediaName: "bài nói (1) 'test'*.mp3",
			});
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe(expectedMime);
			expect(res.headers.get("content-security-policy")).toBe(
				"default-src 'none'; sandbox",
			);
			expect(res.headers.get("content-security-policy")).not.toContain(
				"allow-same-origin",
			);
			expect(res.headers.get("content-security-policy")).not.toContain(
				"allow-scripts",
			);
			expect(res.headers.get("x-content-type-options")).toBe("nosniff");
			expect(res.headers.get("cache-control")).toBe("private, no-store");
			expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin");
			expect(res.headers.get("content-disposition")).toBe(
				"inline; filename*=UTF-8''b%C3%A0i%20n%C3%B3i%20%281%29%20%27test%27%2A.mp3",
			);
		}
	});

	test("falls back to object.contentType when meta.mediaType is null, empty, or whitespace", () => {
		for (const emptyType of [null, "", "   "]) {
			const res = mediaObjectResponse(
				makeStoredMedia(new Uint8Array([9, 8]), "audio/webm"),
				{
					mediaType: emptyType,
					mediaName: "clip.webm",
				},
			);
			expect(res.headers.get("content-type")).toBe("audio/webm");
			expect(res.headers.get("content-disposition")).toMatch(/^inline;/);
		}
	});

	test("clamps unallowlisted or empty MIME types (HTML, SVG, JS, blank) to application/octet-stream + attachment", () => {
		for (const [metaType, objectType] of [
			["text/html", "audio/mpeg"],
			["image/svg+xml", "image/png"],
			["application/javascript", "audio/mpeg"],
			["audio/", ""],
			["", "   "],
		] as const) {
			const res = mediaObjectResponse(
				makeStoredMedia(new Uint8Array([1]), objectType),
				{
					mediaType: metaType,
					mediaName: "payload.html",
				},
			);
			expect(res.headers.get("content-type")).toBe("application/octet-stream");
			expect(res.headers.get("content-disposition")).toBe(
				"attachment; filename*=UTF-8''payload.html",
			);
			expect(res.headers.get("content-security-policy")).toBe(
				"default-src 'none'; sandbox",
			);
		}
	});

	test("toQuizAttemptMedia maps metadata without exposing storage key", () => {
		expect(
			toQuizAttemptMedia({
				mediaKey: null,
				mediaName: "a.mp3",
				mediaType: "audio/mpeg",
				mediaSize: 12,
				mediaUploadedAt: null,
			}),
		).toBeNull();

		expect(
			toQuizAttemptMedia({
				mediaKey: "quiz-media/org-1/a1/k1",
				mediaName: "a.mp3",
				mediaType: "audio/mpeg",
				mediaSize: 12,
				mediaUploadedAt: new Date("2026-11-11T00:00:00.000Z"),
			}),
		).toEqual({
			name: "a.mp3",
			type: "audio/mpeg",
			size: 12,
			uploadedAt: "2026-11-11T00:00:00.000Z",
		});
	});

	test("buildApp enforces Cross-Origin-Resource-Policy: same-site and Referrer-Policy: no-referrer across all 7 mediaObjectResponse routes", async () => {
		const app = buildApp({
			getDb: () => {
				throw new Error("db should not be reached on unauthenticated request");
			},
			authHandler: async () => new Response("ok"),
			getSessionUser: async () => null,
			corsOrigin: "http://localhost:8001",
		});

		for (const path of [
			"/api/student/attempts/att-1/media",
			"/api/grading/att-1/media",
			"/api/placement-test/audio/aud-1",
			"/api/exam-imports/job-1/file",
			"/api/admin/library/tests/test-1/parts/s1/audio",
			"/api/student/vocab/audio/word-1",
			"/api/kernel/vocab/words/word-1/audio",
		]) {
			const res = await app.request(path);
			expect(res.headers.get("cross-origin-resource-policy"), path).toBe(
				"same-site",
			);
			expect(res.headers.get("referrer-policy"), path).toBe("no-referrer");
		}
	});
});
