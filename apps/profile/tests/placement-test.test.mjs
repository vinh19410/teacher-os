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
import {
	buildLeadPayload,
	leadErrorMessage,
	normalizeVietnamPhone,
	validateLeadForm,
} from "../public/kiem-tra-dau-vao/lead-gate.js";
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
	assert.match(
		testPageHtml,
		/<link\s+rel="canonical"\s+href="https:\/\/msmy\.io\.vn\/kiem-tra-dau-vao\/"\s*\/?>/,
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
		assert.match(
			builtIndex,
			/<link\s+rel="canonical"\s+href="https:\/\/msmy\.io\.vn\/"\s*\/?>/,
		);
		const builtTestIndex = readFileSync(
			join(distDir, "kiem-tra-dau-vao", "index.html"),
			"utf8",
		);
		assert.match(
			builtTestIndex,
			/<meta name="lead-api" content="http:\/\/localhost:8100">/,
		);
		assert.match(
			builtTestIndex,
			/<link\s+rel="canonical"\s+href="https:\/\/msmy\.io\.vn\/kiem-tra-dau-vao\/"\s*\/?>/,
		);
	} finally {
		rmSync(tmpRoot, { recursive: true, force: true });
	}
});

test("validateLeadForm kiểm tra họ tên, email bắt buộc, SĐT Việt Nam (0…/84…/+84…), ngày sinh và ghi chú (#534)", () => {
	assert.equal(normalizeVietnamPhone("0909 123 456"), "0909123456");
	assert.equal(normalizeVietnamPhone("+84 909 123 456"), "0909123456");
	assert.equal(normalizeVietnamPhone("84909123456"), "0909123456");
	assert.equal(normalizeVietnamPhone("090912345"), null);

	const missingAll = validateLeadForm({});
	assert.equal(missingAll.ok, false);
	assert.ok(missingAll.errors.name);
	assert.ok(missingAll.errors.email);
	assert.ok(missingAll.errors.phone);

	const shortName = validateLeadForm({
		name: "A",
		email: "hocvien@example.com",
		phone: "0909123456",
	});
	assert.equal(shortName.ok, false);
	assert.ok(shortName.errors.name);

	const badEmail = validateLeadForm({
		name: "Nguyễn Minh Anh",
		email: "khong-phai-email",
		phone: "0909123456",
	});
	assert.equal(badEmail.ok, false);
	assert.ok(badEmail.errors.email);

	const badPhone = validateLeadForm({
		name: "Nguyễn Minh Anh",
		email: "minhanh@example.com",
		phone: "090912345",
	});
	assert.equal(badPhone.ok, false);
	assert.ok(badPhone.errors.phone);

	const futureBirth = validateLeadForm({
		name: "Nguyễn Minh Anh",
		email: "minhanh@example.com",
		phone: "+84 909 123 456",
		birthDate: "2099-01-01",
	});
	assert.equal(futureBirth.ok, false);
	assert.ok(futureBirth.errors.birthDate);

	const invalidCalendarBirth = validateLeadForm({
		name: "Nguyễn Minh Anh",
		email: "minhanh@example.com",
		phone: "84909123456",
		birthDate: "2026-02-30",
	});
	assert.equal(invalidCalendarBirth.ok, false);
	assert.ok(invalidCalendarBirth.errors.birthDate);

	const tooLongNote = validateLeadForm({
		name: "Nguyễn Minh Anh",
		email: "minhanh@example.com",
		phone: "0909123456",
		note: "a".repeat(501),
	});
	assert.equal(tooLongNote.ok, false);
	assert.ok(tooLongNote.errors.note);

	const validMinimal = validateLeadForm({
		name: "  Nguyễn Minh Anh  ",
		email: "  minhanh@example.com ",
		phone: "+84 909 123 456",
	});
	assert.equal(validMinimal.ok, true);
	assert.deepEqual(validMinimal.errors, {});
	assert.equal(validMinimal.normalized.name, "Nguyễn Minh Anh");
	assert.equal(validMinimal.normalized.email, "minhanh@example.com");
	assert.equal(validMinimal.normalized.phone, "0909123456");
});

test("buildLeadPayload luôn gắn source=placement-test, bỏ trường rỗng, cắt placement <= 300 ký tự và giữ đủ trường khi đồng bộ điểm (#534)", () => {
	const gatePayload = buildLeadPayload({
		lead: {
			name: "  Lê Hoàng Nam ",
			phone: "+84 912 345 678",
			email: " nam@example.com ",
			birthDate: "",
			course: "",
			studyMode: "",
			note: "",
		},
		elapsedMs: 1200,
	});
	assert.equal(gatePayload.source, "placement-test");
	assert.equal(gatePayload.name, "Lê Hoàng Nam");
	assert.equal(gatePayload.phone, "0912345678");
	assert.equal(gatePayload.email, "nam@example.com");
	assert.ok(gatePayload.elapsedMs >= 1200);
	assert.ok(gatePayload.elapsedMs >= 3500);
	assert.equal("birthDate" in gatePayload, false);
	assert.equal("course" in gatePayload, false);
	assert.equal("studyMode" in gatePayload, false);
	assert.equal("note" in gatePayload, false);
	assert.equal("placement" in gatePayload, false);

	const longPlacement = `Kiểm tra đầu vào: ${"X".repeat(350)}`;
	const syncPayload = buildLeadPayload({
		lead: {
			name: "Lê Hoàng Nam",
			phone: "0912345678",
			email: "nam@example.com",
			birthDate: "2004-08-20",
			course: "ielts-pre",
			studyMode: "group-online",
			note: "Mục tiêu 6.5",
		},
		placement: longPlacement,
		elapsedMs: 48_000,
	});
	assert.equal(syncPayload.source, "placement-test");
	assert.equal(syncPayload.birthDate, "2004-08-20");
	assert.equal(syncPayload.course, "ielts-pre");
	assert.equal(syncPayload.studyMode, "group-online");
	assert.equal(syncPayload.note, "Mục tiêu 6.5");
	assert.equal(syncPayload.elapsedMs, 48_000);
	assert.equal(syncPayload.placement.length, LEAD_PLACEMENT_MAX);
});

test("leadErrorMessage ánh xạ đúng lỗi 400, 429, 503 và lỗi mạng sang tiếng Việt (#534)", () => {
	const err400 = leadErrorMessage(400, {
		code: "LEAD_INVALID",
		fields: ["email", "phone"],
	});
	assert.equal(err400.kind, "field");
	assert.deepEqual(err400.fields, ["email", "phone"]);

	const err429 = leadErrorMessage(429, { code: "LEAD_RATE_LIMITED" });
	assert.equal(err429.kind, "rate_limit");
	assert.match(err429.message, /quá nhiều lượt đăng ký/i);

	const err503 = leadErrorMessage(503, { code: "LEAD_INTAKE_DISABLED" });
	assert.equal(err503.kind, "busy");
	assert.match(err503.message, /Hệ thống đang bận/i);

	const errNet = leadErrorMessage(0, null);
	assert.equal(errNet.kind, "busy");
	assert.match(errNet.message, /Zalo cô Mỹ/);
});
