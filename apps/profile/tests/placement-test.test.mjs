import assert from "node:assert/strict";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { buildProfile } from "../build.mjs";
import {
	buildPlacementSummary,
	flattenQuestions,
	gradeAttempt,
	LEAD_PLACEMENT_MAX,
} from "../public/kiem-tra-dau-vao/grading.js";
import { createProfileServer } from "../serve.mjs";

const publicDir = new URL("../public/", import.meta.url);
const testDir = new URL("../public/kiem-tra-dau-vao/", import.meta.url);
const questionsUrl = new URL("questions.json", testDir);
const questionsRaw = readFileSync(questionsUrl, "utf8");
const questionsData = JSON.parse(questionsRaw);
const homeHtml = readFileSync(new URL("index.html", publicDir), "utf8");

function extractHomeCourseValues() {
	const selectMatch = homeHtml.match(
		/<select[^>]*\bname="course"[^>]*>([\s\S]*?)<\/select>/,
	);
	assert.ok(selectMatch, "select[name=course] must exist in index.html");
	return [...selectMatch[1].matchAll(/<option\s+value="([^"]+)"/g)].map(
		(m) => m[1],
	);
}

function hasKeyRecursive(value, targetKey) {
	if (!value || typeof value !== "object") return false;
	if (Array.isArray(value)) {
		return value.some((item) => hasKeyRecursive(item, targetKey));
	}
	if (Object.hasOwn(value, targetKey)) return true;
	return Object.values(value).some((v) => hasKeyRecursive(v, targetKey));
}

test("questions.json has 15 Vocab+Grammar (8 grammar, 7 vocab) and 5 Listening clips (15 questions), unique IDs, valid answers, existing audio < 2MB, and no transcript", () => {
	assert.equal(questionsData.version, 1);
	assert.ok(
		questionsData.status === "draft" || questionsData.status === "approved",
	);
	assert.equal(
		hasKeyRecursive(questionsData, "transcript"),
		false,
		"questions.json must never contain transcript",
	);

	assert.equal(questionsData.parts.length, 2);
	const [vgPart, listeningPart] = questionsData.parts;
	assert.equal(vgPart.id, "vocab-grammar");
	assert.equal(listeningPart.id, "listening");

	assert.equal(vgPart.questions.length, 15);
	const grammarCount = vgPart.questions.filter(
		(q) => q.kind === "grammar",
	).length;
	const vocabCount = vgPart.questions.filter((q) => q.kind === "vocab").length;
	assert.equal(grammarCount, 8);
	assert.equal(vocabCount, 7);

	assert.equal(listeningPart.clips.length, 5);
	const clipIds = new Set();
	let listeningQuestionCount = 0;

	for (const clip of listeningPart.clips) {
		assert.ok(clip.id && !clipIds.has(clip.id), `duplicate clip id ${clip.id}`);
		clipIds.add(clip.id);
		assert.equal(clip.maxPlays, 2);
		assert.equal(clip.questions.length, 3);
		listeningQuestionCount += clip.questions.length;

		const audioUrl = new URL(clip.src, testDir);
		assert.ok(existsSync(audioUrl), `missing audio file ${clip.src}`);
		const stat = statSync(audioUrl);
		assert.ok(stat.size > 10_000, `audio file too small: ${clip.src}`);
		assert.ok(
			stat.size <= 2 * 1024 * 1024,
			`audio file exceeds 2MB: ${clip.src}`,
		);
	}
	assert.equal(listeningQuestionCount, 15);

	const flat = flattenQuestions(questionsData);
	assert.equal(flat.length, 30);
	const qIds = new Set();
	for (const q of flat) {
		assert.ok(q.id && !qIds.has(q.id), `duplicate question id ${q.id}`);
		qIds.add(q.id);
		assert.ok(typeof q.prompt === "string" && q.prompt.trim().length > 0);
		assert.ok(Array.isArray(q.options) && q.options.length === 4);
		for (const opt of q.options) {
			assert.ok(typeof opt === "string" && opt.trim().length > 0);
		}
		assert.ok(
			Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4,
			`invalid answer index on ${q.id}`,
		);
	}
});

test("bands cover 0..30 continuously without gaps or overlaps and every course is in select[name=course]", () => {
	const bands = questionsData.bands;
	assert.ok(Array.isArray(bands) && bands.length === 4);
	const sorted = [...bands].sort((a, b) => a.min - b.min);
	assert.equal(sorted[0].min, 0);
	assert.equal(sorted[sorted.length - 1].max, 30);

	const validCourses = new Set(extractHomeCourseValues());
	for (let i = 0; i < sorted.length; i++) {
		const b = sorted[i];
		assert.ok(b.min <= b.max);
		if (i > 0) {
			assert.equal(
				b.min,
				sorted[i - 1].max + 1,
				`gap or overlap between bands at ${b.min}`,
			);
		}
		assert.ok(
			validCourses.has(b.course),
			`band course ${b.course} not found in index.html select[name=course]`,
		);
	}
});

test("gradeAttempt and buildPlacementSummary evaluate boundaries 0, 8/9, 15/16, 22/23, 30 and cap summary at 300 chars", () => {
	const flat = flattenQuestions(questionsData);

	const pickCorrectN = (n) => {
		const answers = {};
		for (let i = 0; i < flat.length; i++) {
			const q = flat[i];
			answers[q.id] = i < n ? q.answer : (q.answer + 1) % 4;
		}
		return answers;
	};

	// 0/30 (all blank)
	const r0 = gradeAttempt(questionsData, {});
	assert.equal(r0.totalScore, 0);
	assert.equal(r0.vocabGrammar.score, 0);
	assert.equal(r0.listening.score, 0);
	assert.equal(r0.band.cefr, "A1");
	assert.equal(r0.band.course, "ielts-foundation");

	// Boundary 8 vs 9
	const r8 = gradeAttempt(questionsData, pickCorrectN(8));
	assert.equal(r8.totalScore, 8);
	assert.equal(r8.band.cefr, "A1");
	assert.equal(r8.band.course, "ielts-foundation");

	const r9 = gradeAttempt(questionsData, pickCorrectN(9));
	assert.equal(r9.totalScore, 9);
	assert.equal(r9.band.cefr, "A2");
	assert.equal(r9.band.course, "ielts-first-step");

	// Boundary 15 vs 16
	const r15 = gradeAttempt(questionsData, pickCorrectN(15));
	assert.equal(r15.totalScore, 15);
	assert.equal(r15.band.cefr, "A2");
	assert.equal(r15.band.course, "ielts-first-step");

	const r16 = gradeAttempt(questionsData, pickCorrectN(16));
	assert.equal(r16.totalScore, 16);
	assert.equal(r16.band.cefr, "B1");
	assert.equal(r16.band.course, "ielts-pre");

	// Boundary 22 vs 23
	const r22 = gradeAttempt(questionsData, pickCorrectN(22));
	assert.equal(r22.totalScore, 22);
	assert.equal(r22.band.cefr, "B1");
	assert.equal(r22.band.course, "ielts-pre");

	const r23 = gradeAttempt(questionsData, pickCorrectN(23));
	assert.equal(r23.totalScore, 23);
	assert.equal(r23.band.cefr, "B2+");
	assert.equal(r23.band.course, "ielts-advanced");

	// 30/30
	const r30 = gradeAttempt(questionsData, pickCorrectN(30));
	assert.equal(r30.totalScore, 30);
	assert.equal(r30.vocabGrammar.score, 15);
	assert.equal(r30.listening.score, 15);
	assert.equal(r30.band.cefr, "B2+");
	assert.equal(r30.band.course, "ielts-advanced");

	const summary = buildPlacementSummary(r22);
	assert.equal(
		summary,
		"Kiểm tra đầu vào: 22/30 (Vocab + Grammar 15/15, Listening 7/15) – CEFR B1",
	);
	assert.ok(summary.length <= LEAD_PLACEMENT_MAX);
});

test("serve.mjs serves /kiem-tra-dau-vao/ 200 HTML, redirects /kiem-tra-dau-vao 301 preserving query, serves .mp3 with MIME + 206 Range, rejects /%FF with 400 and path traversal with 403", async () => {
	const server = createProfileServer("http://localhost:8100");
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address();
	const base = `http://127.0.0.1:${port}`;

	try {
		// 1. 301 redirect without trailing slash, preserving query string
		const res301 = await fetch(`${base}/kiem-tra-dau-vao?ref=hero`, {
			redirect: "manual",
		});
		assert.equal(res301.status, 301);
		assert.equal(res301.headers.get("location"), "/kiem-tra-dau-vao/?ref=hero");

		// 2. Open-redirect protection on leading double slashes
		const resDoubleSlash = await fetch(`${base}//kiem-tra-dau-vao?ref=probe`, {
			redirect: "manual",
		});
		assert.equal(resDoubleSlash.status, 301);
		assert.equal(
			resDoubleSlash.headers.get("location"),
			"/kiem-tra-dau-vao/?ref=probe",
		);

		// 3. 200 HTML on /kiem-tra-dau-vao/
		const res200 = await fetch(`${base}/kiem-tra-dau-vao/`);
		assert.equal(res200.status, 200);
		assert.match(res200.headers.get("content-type") ?? "", /text\/html/);
		const pageHtml = await res200.text();
		assert.match(pageHtml, /Bài Kiểm Tra Đầu Vào/);

		// 4. .mp3 MIME type + Accept-Ranges + 206 Partial Content
		const resMp3 = await fetch(`${base}/kiem-tra-dau-vao/audio/clip-1.mp3`);
		assert.equal(resMp3.status, 200);
		assert.equal(resMp3.headers.get("content-type"), "audio/mpeg");
		assert.equal(resMp3.headers.get("accept-ranges"), "bytes");
		const fullBytes = new Uint8Array(await resMp3.arrayBuffer());
		assert.ok(fullBytes.byteLength > 10_000);

		const resRange = await fetch(`${base}/kiem-tra-dau-vao/audio/clip-1.mp3`, {
			headers: { Range: "bytes=0-99" },
		});
		assert.equal(resRange.status, 206);
		assert.equal(resRange.headers.get("content-type"), "audio/mpeg");
		assert.equal(
			resRange.headers.get("content-range"),
			`bytes 0-99/${fullBytes.byteLength}`,
		);
		const partialBytes = new Uint8Array(await resRange.arrayBuffer());
		assert.equal(partialBytes.byteLength, 100);
		assert.deepEqual(partialBytes, fullBytes.subarray(0, 100));

		// Invalid range -> 416
		const res416 = await fetch(`${base}/kiem-tra-dau-vao/audio/clip-1.mp3`, {
			headers: {
				Range: `bytes=${fullBytes.byteLength + 500}-${fullBytes.byteLength + 600}`,
			},
		});
		assert.equal(res416.status, 416);

		// 5. Malformed URI does not crash server -> 400
		const res400 = await fetch(`${base}/%E0%A4%A`);
		assert.equal(res400.status, 400);

		// 6. Encoded path traversal (/..%2fpackage.json) -> 403
		const res403 = await fetch(`${base}/..%2fpackage.json`);
		assert.equal(res403.status, 403);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
});

test("build.mjs blocks build when status !== approved and succeeds when status === approved", async () => {
	const tmpRoot = mkdtempSync(join(tmpdir(), "profile-build-test-"));
	try {
		const draftJsonPath = join(tmpRoot, "questions-draft.json");
		const approvedJsonPath = join(tmpRoot, "questions-approved.json");
		const distDir = join(tmpRoot, "dist");

		writeFileSync(
			draftJsonPath,
			JSON.stringify({ ...questionsData, status: "draft" }),
			"utf8",
		);
		writeFileSync(
			approvedJsonPath,
			JSON.stringify({ ...questionsData, status: "approved" }),
			"utf8",
		);

		await assert.rejects(
			() =>
				buildProfile({
					questionsUrl: pathToFileURL(draftJsonPath),
					distUrl: pathToFileURL(distDir),
				}),
			/questions\.json đang ở trạng thái "draft".*approved/,
		);

		await buildProfile({
			questionsUrl: pathToFileURL(approvedJsonPath),
			distUrl: pathToFileURL(distDir),
			leadApiUrl: "http://localhost:8100",
		});

		const builtIndex = readFileSync(join(distDir, "index.html"), "utf8");
		assert.match(
			builtIndex,
			/<meta name="lead-api" content="http:\/\/localhost:8100">/,
		);
		assert.ok(existsSync(join(distDir, "kiem-tra-dau-vao", "index.html")));
	} finally {
		rmSync(tmpRoot, { recursive: true, force: true });
	}
});
