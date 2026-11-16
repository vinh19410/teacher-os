import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProfile } from "../build.mjs";
import {
	pickSupportedRecorderMime,
	resolveSpeakingUploadMeta,
} from "../public/kiem-tra-dau-vao/grading.js";
import {
	buildHighlightSegments,
	errorNumberLabel,
	numberErrors,
} from "../public/kiem-tra-dau-vao/ket-qua/highlight.js";

const resultDir = new URL(
	"../public/kiem-tra-dau-vao/ket-qua/",
	import.meta.url,
);
const err = (partial) => ({
	id: partial.id ?? `e-${partial.quote}`,
	category: "grammar",
	correction: "",
	explanation: "",
	start: null,
	end: null,
	...partial,
});

test("buildHighlightSegments sorts errors, numbers them and reassembles the text", () => {
	const text = "I goed to school and eated lunch.";
	const errors = [
		err({ quote: "eated", start: 21, end: 26, category: "spelling" }),
		err({ quote: "goed", start: 2, end: 6 }),
	];
	const segs = buildHighlightSegments(text, errors);
	assert.equal(segs.map((s) => s.text).join(""), text);
	const marked = segs.filter((s) => s.error);
	assert.deepEqual(
		marked.map((s) => [s.text, s.error.number]),
		[
			["goed", 1],
			["eated", 2],
		],
	);
	assert.equal(marked[1].error.category, "spelling");
});

test("buildHighlightSegments skips null offsets, out-of-range and overlapping errors", () => {
	const text = "She go to school";
	const errors = [
		err({ quote: "go to", start: 4, end: 9 }),
		err({ quote: "to school", start: 7, end: 16 }),
		err({ quote: "missing" }),
		err({ quote: "far", start: 100, end: 110 }),
	];
	const segs = buildHighlightSegments(text, errors);
	assert.equal(segs.map((s) => s.text).join(""), text);
	assert.deepEqual(
		segs.filter((s) => s.error).map((s) => s.text),
		["go to"],
	);
});

test("numberErrors puts unlocated errors last and keeps their original order", () => {
	const numbered = numberErrors([
		err({ id: "a", quote: "x" }),
		err({ id: "b", quote: "y", start: 5, end: 6 }),
		err({ id: "c", quote: "z" }),
	]);
	assert.deepEqual(
		numbered.map((e) => [e.id, e.number]),
		[
			["b", 1],
			["a", 2],
			["c", 3],
		],
	);
	assert.equal(errorNumberLabel(1), "①");
	assert.equal(errorNumberLabel(21), "(21)");
});

test("buildHighlightSegments handles empty input and non-BMP offsets in UTF-16 units", () => {
	assert.deepEqual(buildHighlightSegments("", []), []);
	assert.deepEqual(buildHighlightSegments("abc", undefined), [
		{ text: "abc", error: null },
	]);
	const text = "😀 bad word";
	const segs = buildHighlightSegments(text, [
		err({ quote: "bad", start: 3, end: 6 }),
	]);
	assert.equal(segs.find((s) => s.error)?.text, "bad");
});

test("pickSupportedRecorderMime prefers audio/webm opus and never returns video", () => {
	const make = (supported) => ({
		isTypeSupported: (m) => supported.includes(m),
	});
	assert.equal(
		pickSupportedRecorderMime(
			make(["audio/webm;codecs=opus", "audio/webm", "video/webm"]),
		),
		"audio/webm;codecs=opus",
	);
	assert.equal(pickSupportedRecorderMime(make(["audio/mp4"])), "audio/mp4");
	assert.equal(
		pickSupportedRecorderMime(make(["audio/ogg", "video/webm"])),
		"audio/ogg",
	);
	assert.equal(pickSupportedRecorderMime(make(["video/webm"])), "");
	assert.equal(pickSupportedRecorderMime(undefined), "");
	assert.equal(pickSupportedRecorderMime({}), "");
});

test("resolveSpeakingUploadMeta maps recorder mimes to audio content types", () => {
	assert.deepEqual(resolveSpeakingUploadMeta("audio/webm;codecs=opus"), {
		contentType: "audio/webm",
		filename: "speaking.webm",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("audio/mp4"), {
		contentType: "audio/mp4",
		filename: "speaking.m4a",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("audio/ogg;codecs=opus"), {
		contentType: "audio/ogg",
		filename: "speaking.ogg",
	});
});

test("result page renders server data without innerHTML and is private", () => {
	const js = readFileSync(new URL("result.js", resultDir), "utf8");
	const hl = readFileSync(new URL("highlight.js", resultDir), "utf8");
	const html = readFileSync(new URL("index.html", resultDir), "utf8");
	for (const src of [js, hl]) {
		assert.ok(
			!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src),
		);
	}
	assert.match(html, /<meta name="robots" content="noindex/);
	assert.match(html, /<meta name="referrer" content="no-referrer">/);
	assert.match(js, /referrerPolicy: "no-referrer"/);
	assert.match(html, /<meta name="lead-api" content="[^"]+">/);
});

test("buildProfile copies the result page and injects the lead API", async () => {
	const dist = mkdtempSync(join(tmpdir(), "profile-result-"));
	try {
		await buildProfile({
			distUrl: new URL(`file://${dist}/dist/`),
			leadApiUrl: "https://api.example.test",
			studentPortalUrl: "",
		});
		const built = readFileSync(
			join(dist, "dist", "kiem-tra-dau-vao", "ket-qua", "index.html"),
			"utf8",
		);
		assert.match(
			built,
			/<meta name="lead-api" content="https:\/\/api\.example\.test">/,
		);
		for (const f of ["result.js", "highlight.js", "result.css"]) {
			assert.ok(
				readFileSync(
					join(dist, "dist", "kiem-tra-dau-vao", "ket-qua", f),
					"utf8",
				).length > 0,
			);
		}
	} finally {
		rmSync(dist, { recursive: true, force: true });
	}
});
