import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
const homeHtml = readFileSync(new URL("index.html", publicDir), "utf8");
const testPageHtml = readFileSync(new URL("index.html", testDir), "utf8");

function makeSampleFixture() {
	const vgQuestions = Array.from({ length: 15 }, (_, idx) => ({
		id: `vg-${String(idx + 1).padStart(2, "0")}`,
		kind: idx < 8 ? "grammar" : "vocab",
		level: "A1",
		prompt: `VG Question ${idx + 1}`,
		options: ["A", "B", "C", "D"],
		answer: idx % 4,
	}));

	const clips = Array.from({ length: 5 }, (_, cIdx) => ({
		id: `clip-${cIdx + 1}`,
		src: `/public/placement-test/audio/00000000-0000-4000-8000-00000000000${cIdx + 1}`,
		maxPlays: 2,
		level: "B1",
		title: `Đoạn nghe ${cIdx + 1}`,
		questions: Array.from({ length: 3 }, (__, qIdx) => {
			const num = cIdx * 3 + qIdx + 1;
			return {
				id: `l-${String(num).padStart(2, "0")}`,
				level: "B1",
				prompt: `Listening Question ${num}`,
				options: ["A", "B", "C", "D"],
				answer: num % 4,
			};
		}),
	}));

	return {
		version: 1,
		bands: [
			{
				min: 0,
				max: 8,
				cefr: "A1",
				course: "ielts-foundation",
				courseLabel: "IELTS Foundation (0–3.0)",
			},
			{
				min: 9,
				max: 15,
				cefr: "A2",
				course: "ielts-first-step",
				courseLabel: "IELTS First Step (3.0–3.5)",
			},
			{
				min: 16,
				max: 22,
				cefr: "B1",
				course: "ielts-pre",
				courseLabel: "Pre IELTS (4.0–4.5)",
			},
			{
				min: 23,
				max: 30,
				cefr: "B2+",
				course: "ielts-advanced",
				courseLabel: "IELTS Advanced (5.0–7.5+)",
			},
		],
		parts: [
			{
				id: "vocab-grammar",
				title: "Vocab + Grammar",
				questions: vgQuestions,
			},
			{
				id: "listening",
				title: "Listening",
				clips,
			},
		],
	};
}

test("HTML tĩnh của trang chủ và trang kiểm tra đầu vào không còn chuỗi '30 câu' hay file questions.json tĩnh", () => {
	assert.equal(existsSync(new URL("questions.json", testDir)), false);
	assert.equal(/30\s*câu/i.test(homeHtml), false);
	assert.equal(/30\s*câu/i.test(testPageHtml), false);
	assert.match(
		testPageHtml,
		/<meta\s+name="lead-api"\s+content="https:\/\/api\.teacheros\.io\.vn"\s*\/?>/,
	);
});

test("gradeAttempt và buildPlacementSummary tính đúng ngưỡng 0, 8/9, 15/16, 22/23, 30, trả kèm courseLabel và cắt summary ở 300 ký tự", () => {
	const fixture = makeSampleFixture();
	const flat = flattenQuestions(fixture);
	assert.equal(flat.length, 30);

	const pickCorrectN = (n) => {
		const answers = {};
		for (let i = 0; i < flat.length; i++) {
			const q = flat[i];
			answers[q.id] = i < n ? q.answer : (q.answer + 1) % 4;
		}
		return answers;
	};

	const r0 = gradeAttempt(fixture, {});
	assert.equal(r0.totalScore, 0);
	assert.equal(r0.vocabGrammar.score, 0);
	assert.equal(r0.listening.score, 0);
	assert.equal(r0.band.cefr, "A1");
	assert.equal(r0.band.course, "ielts-foundation");
	assert.equal(r0.band.courseLabel, "IELTS Foundation (0–3.0)");

	const r8 = gradeAttempt(fixture, pickCorrectN(8));
	assert.equal(r8.totalScore, 8);
	assert.equal(r8.band.cefr, "A1");

	const r9 = gradeAttempt(fixture, pickCorrectN(9));
	assert.equal(r9.totalScore, 9);
	assert.equal(r9.band.cefr, "A2");
	assert.equal(r9.band.courseLabel, "IELTS First Step (3.0–3.5)");

	const r15 = gradeAttempt(fixture, pickCorrectN(15));
	assert.equal(r15.totalScore, 15);
	assert.equal(r15.band.cefr, "A2");

	const r16 = gradeAttempt(fixture, pickCorrectN(16));
	assert.equal(r16.totalScore, 16);
	assert.equal(r16.band.cefr, "B1");
	assert.equal(r16.band.course, "ielts-pre");
	assert.equal(r16.band.courseLabel, "Pre IELTS (4.0–4.5)");

	const r22 = gradeAttempt(fixture, pickCorrectN(22));
	assert.equal(r22.totalScore, 22);
	assert.equal(r22.band.cefr, "B1");

	const r23 = gradeAttempt(fixture, pickCorrectN(23));
	assert.equal(r23.totalScore, 23);
	assert.equal(r23.band.cefr, "B2+");
	assert.equal(r23.band.course, "ielts-advanced");

	const r30 = gradeAttempt(fixture, pickCorrectN(30));
	assert.equal(r30.totalScore, 30);
	assert.equal(r30.vocabGrammar.score, 15);
	assert.equal(r30.listening.score, 15);
	assert.equal(r30.band.cefr, "B2+");

	const summary = buildPlacementSummary(r22);
	assert.equal(
		summary,
		"Kiểm tra đầu vào: 22/30 (Vocab + Grammar 15/15, Listening 7/15) – CEFR B1",
	);
	assert.ok(summary.length <= LEAD_PLACEMENT_MAX);
});

test("serve.mjs thay meta lead-api ở cả trang chủ và /kiem-tra-dau-vao/, giữ redirect 301 và chặn path traversal", async () => {
	const server = createProfileServer("http://localhost:8100");
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address();
	const base = `http://127.0.0.1:${port}`;

	try {
		const res301 = await fetch(`${base}/kiem-tra-dau-vao?ref=hero`, {
			redirect: "manual",
		});
		assert.equal(res301.status, 301);
		assert.equal(res301.headers.get("location"), "/kiem-tra-dau-vao/?ref=hero");

		const resDoubleSlash = await fetch(`${base}//kiem-tra-dau-vao?ref=probe`, {
			redirect: "manual",
		});
		assert.equal(resDoubleSlash.status, 301);
		assert.equal(
			resDoubleSlash.headers.get("location"),
			"/kiem-tra-dau-vao/?ref=probe",
		);

		const resHome = await fetch(`${base}/`);
		assert.equal(resHome.status, 200);
		assert.match(
			await resHome.text(),
			/<meta name="lead-api" content="http:\/\/localhost:8100">/,
		);

		const res200 = await fetch(`${base}/kiem-tra-dau-vao/`);
		assert.equal(res200.status, 200);
		assert.match(res200.headers.get("content-type") ?? "", /text\/html/);
		const pageHtml = await res200.text();
		assert.match(pageHtml, /Bài Kiểm Tra Đầu Vào/);
		assert.match(
			pageHtml,
			/<meta name="lead-api" content="http:\/\/localhost:8100">/,
		);

		const res400 = await fetch(`${base}/%E0%A4%A`);
		assert.equal(res400.status, 400);

		const res403 = await fetch(`${base}/..%2fpackage.json`);
		assert.equal(res403.status, 403);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
});

test("build.mjs copy public sang dist, không có questions.json và thay meta lead-api ở cả hai trang HTML", async () => {
	const tmpRoot = mkdtempSync(join(tmpdir(), "profile-build-test-"));
	try {
		const distDir = join(tmpRoot, "dist");
		await buildProfile({
			distUrl: pathToFileURL(distDir),
			leadApiUrl: "http://localhost:8100",
		});

		assert.equal(
			existsSync(join(distDir, "kiem-tra-dau-vao", "questions.json")),
			false,
		);
		const builtIndex = readFileSync(join(distDir, "index.html"), "utf8");
		assert.match(
			builtIndex,
			/<meta name="lead-api" content="http:\/\/localhost:8100">/,
		);
		const builtTestIndex = readFileSync(
			join(distDir, "kiem-tra-dau-vao", "index.html"),
			"utf8",
		);
		assert.match(
			builtTestIndex,
			/<meta name="lead-api" content="http:\/\/localhost:8100">/,
		);
	} finally {
		rmSync(tmpRoot, { recursive: true, force: true });
	}
});
