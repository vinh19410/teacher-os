import { createClient } from "@libsql/client";
import type { TeacherSubmission } from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type MediaStore } from "../app";
import type { SessionUser } from "../session";

const CORS_ORIGINS = ["http://localhost:8001", "http://localhost:8003"];
const TEACHER_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;
const TEACHER = { "x-test-user": "teacher-1" };

function createMemoryMediaStore() {
	const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
	const store: MediaStore = {
		async put(key, body, { contentType }) {
			const bytes = new Uint8Array(await new Response(body).arrayBuffer());
			objects.set(key, { bytes, contentType });
		},
		async get(key) {
			const object = objects.get(key);
			if (!object) return null;
			return {
				body: new Response(object.bytes).body as ReadableStream<Uint8Array>,
				contentType: object.contentType,
				size: object.bytes.byteLength,
			};
		},
		async delete(key) {
			objects.delete(key);
		},
	};
	return { store, objects };
}

const sessionFor = async (headers: Headers): Promise<SessionUser | null> => {
	const userKey = headers.get("x-test-user");
	if (userKey === "teacher-1") {
		return {
			userId: "t-1",
			userName: "Cô Lan",
			role: "teacher",
		};
	}
	if (userKey === "teacher-2") {
		return {
			userId: "t-2",
			userName: "Thầy Nam",
			role: "teacher",
		};
	}
	if (userKey === "student-u") {
		return {
			userId: "u-s",
			userName: "Minh",
			email: "minh@gmail.com",
			emailVerified: true,
			role: "student",
		};
	}
	return null;
};

describe("teacher grading (/api/grading/:attemptId)", () => {
	let app: ReturnType<typeof buildApp>;
	let libsql: Db;
	const memory = createMemoryMediaStore();

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		await libsql.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);
		await libsql.insert(schema.user).values([
			{
				id: "t-1",
				name: "Cô Lan",
				email: "lan@test.local",
				role: "teacher",
			},
			{
				id: "t-2",
				name: "Thầy Nam",
				email: "nam@test.local",
				role: "teacher",
			},
		]);
		await libsql.insert(schema.membership).values([
			{ id: "mem-1", orgId: "org-1", userId: "t-1", role: "teacher" },
			{ id: "mem-2", orgId: "org-2", userId: "t-2", role: "teacher" },
		]);
		await libsql.insert(schema.student).values({
			id: "student-1",
			orgId: "org-1",
			name: "Minh Tran",
			email: "minh@gmail.com",
			phone: "0901234567",
		});
		await libsql.insert(schema.classTable).values({
			id: "class-1",
			orgId: "org-1",
			name: "IELTS Foundation",
			level: "IELTS 5.0–6.0",
			mode: "Online",
			schedule: "T2 & T5 18:30–20:00",
			sessionsDone: 0,
			sessionsTotal: 20,
			status: "active",
		});
		await libsql.insert(schema.assignmentPrompt).values([
			{
				id: "prompt-writing",
				orgId: "org-1",
				task: "task2",
				genre: "essay",
				skill: "writing",
				part: "task2",
				type: "essay",
				title: "Writing Task 2",
				prompt: "<p>Some people think that children should learn to code.</p>",
				questions: "[]",
				optionBank: "[]",
				note: "<p>Ít nhất 250 từ.</p>",
				status: "ready",
			},
			{
				id: "prompt-speaking",
				orgId: "org-1",
				task: "task1",
				genre: "",
				skill: "speaking",
				part: "part2",
				type: "place",
				title: "Speaking Part 2",
				intro: "<p>Ghi âm một lần.</p>",
				prompt: "",
				passage: "",
				cueTopic: "a place you like to visit",
				cuePoints: "where it is\nwhy you like it",
				questions: "[]",
				optionBank: "[]",
				note: "<p>Nói tự nhiên, không đọc giấy.</p>",
				status: "ready",
			},
			{
				id: "prompt-reading",
				orgId: "org-1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "info",
				title: "Reading",
				prompt: "Read.",
				passage: "<p>Passage</p>",
				questions: JSON.stringify([
					{ stem: "Q1", opts: null, answer: "A", alts: "", pin: null },
				]),
				optionBank: "[]",
				note: "<p>Đáp án câu 1 là A — chỉ lộ sau khi nộp.</p>",
				status: "ready",
			},
		]);
		const assignments: Array<[string, string]> = [
			["ca-w", "prompt-writing"],
			["ca-w-open", "prompt-writing"],
			["ca-s", "prompt-speaking"],
			["ca-s2", "prompt-speaking"],
			["ca-r", "prompt-reading"],
		];
		for (const [id, promptId] of assignments) {
			await libsql.insert(schema.classAssignment).values({
				id,
				orgId: "org-1",
				classId: "class-1",
				promptId,
				title: `Quiz ${id}`,
				due: "2099-01-10",
			});
			await libsql.insert(schema.classAssignmentTarget).values({
				id: `cat-${id}`,
				orgId: "org-1",
				assignmentId: id,
				studentId: "student-1",
				submittedAt: null,
			});
		}
		await libsql.insert(schema.quizAttempt).values([
			{
				id: "att-w",
				orgId: "org-1",
				assignmentId: "ca-w",
				studentId: "student-1",
				status: "submitted",
				questionsSnapshot: "[]",
				essay: "My essay line 1\nline 2",
				submittedAt: new Date("2026-10-05T01:00:00Z"),
			},
			{
				id: "att-w-open",
				orgId: "org-1",
				assignmentId: "ca-w-open",
				studentId: "student-1",
				status: "in_progress",
				questionsSnapshot: "[]",
			},
			{
				id: "att-s",
				orgId: "org-1",
				assignmentId: "ca-s",
				studentId: "student-1",
				status: "submitted",
				questionsSnapshot: "[]",
				mediaKey: "quiz-media/org-1/att-s/k1",
				mediaName: "bai-noi.mp3",
				mediaType: "audio/mpeg",
				mediaSize: 4,
				mediaUploadedAt: new Date("2026-10-05T01:30:00Z"),
				submittedAt: new Date("2026-10-05T01:35:00Z"),
			},
			{
				id: "att-s2",
				orgId: "org-1",
				assignmentId: "ca-s2",
				studentId: "student-1",
				status: "submitted",
				questionsSnapshot: "[]",
				mediaKey: "quiz-media/org-1/att-s2/k2",
				mediaName: "bai-noi-2.mp3",
				mediaType: "audio/mpeg",
				mediaSize: 2,
				mediaUploadedAt: new Date("2026-10-05T02:00:00Z"),
				submittedAt: new Date("2026-10-05T02:05:00Z"),
			},
			{
				id: "att-r",
				orgId: "org-1",
				assignmentId: "ca-r",
				studentId: "student-1",
				status: "submitted",
				questionsSnapshot: JSON.stringify([
					{ stem: "Q1", opts: null, answer: "A", alts: "", pin: null },
				]),
				answers: JSON.stringify({ 0: "A" }),
				correctCount: 1,
				submittedAt: new Date("2026-10-05T03:00:00Z"),
			},
		]);
		memory.objects.set("quiz-media/org-1/att-s/k1", {
			bytes: new Uint8Array([1, 2, 3, 4]),
			contentType: "audio/mpeg",
		});
		memory.objects.set("quiz-media/org-1/att-s2/k2", {
			bytes: new Uint8Array([9, 9]),
			contentType: "audio/mpeg",
		});

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: sessionFor,
			authHandler: () => new Response("auth OK"),
			getMediaStore: () => memory.store,
		});
	});

	const gradeBody = (scores: unknown, feedback = "Tốt.") =>
		JSON.stringify({ scores, feedback });

	async function postGrade(
		attemptId: string,
		body: string,
		user: Record<string, string> = TEACHER,
		origin = TEACHER_ORIGIN,
	) {
		return app.request(`/api/grading/${attemptId}/grade`, {
			method: "POST",
			headers: {
				...user,
				origin,
				"content-type": "application/json",
			},
			body,
		});
	}

	test("GET trả bài Writing kèm đề, essay, học viên và grade null", async () => {
		const res = await app.request("/api/grading/att-w", { headers: TEACHER });
		expect(res.status).toBe(200);
		const json = (await res.json()) as TeacherSubmission;
		expect(json.skill).toBe("writing");
		expect(json.essay).toBe("My essay line 1\nline 2");
		expect(json.media).toBeNull();
		expect(json.grade).toBeNull();
		expect(json.student.name).toBe("Minh Tran");
		expect(json.prompt.prompt).toContain("Some people think");
		expect(json.className).toBe("IELTS Foundation");
	});

	test("GET trả bài Speaking kèm metadata file nói", async () => {
		const res = await app.request("/api/grading/att-s", { headers: TEACHER });
		expect(res.status).toBe(200);
		const json = (await res.json()) as TeacherSubmission;
		expect(json.skill).toBe("speaking");
		expect(json.essay).toBeNull();
		expect(json.media?.name).toBe("bai-noi.mp3");
		expect(json.media?.size).toBe(4);
	});

	test("GET bài thuộc org khác trả 404 (IDOR)", async () => {
		const res = await app.request("/api/grading/att-w", {
			headers: { "x-test-user": "teacher-2" },
		});
		expect(res.status).toBe(404);
	});

	test("GET attempt chưa nộp trả 409 NOT_SUBMITTED", async () => {
		const res = await app.request("/api/grading/att-w-open", {
			headers: TEACHER,
		});
		expect(res.status).toBe(409);
		const json = (await res.json()) as { code?: string };
		expect(json.code).toBe("NOT_SUBMITTED");
	});

	test("GET đề reading trả 400 SKILL_NOT_GRADABLE", async () => {
		const res = await app.request("/api/grading/att-r", { headers: TEACHER });
		expect(res.status).toBe(400);
		const json = (await res.json()) as { code?: string };
		expect(json.code).toBe("SKILL_NOT_GRADABLE");
	});

	test("GET bằng session học viên trả 403 (role gate app)", async () => {
		const res = await app.request("/api/grading/att-w", {
			headers: { "x-test-user": "student-u" },
		});
		expect(res.status).toBe(403);
	});

	test("GET media Speaking stream đúng bytes và header khoá cứng", async () => {
		const res = await app.request("/api/grading/att-s/media", {
			headers: TEACHER,
		});
		expect(res.status).toBe(200);
		const bytes = new Uint8Array(await res.arrayBuffer());
		expect([...bytes]).toEqual([1, 2, 3, 4]);
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		expect(res.headers.get("content-security-policy")).toBe(
			"default-src 'none'; sandbox",
		);
		expect(res.headers.get("cache-control")).toBe("private, no-store");
		expect(res.headers.get("cross-origin-resource-policy")).toBe("same-site");
	});

	test("GET media trả 404 cho Writing và cho attempt org khác", async () => {
		const resWriting = await app.request("/api/grading/att-w/media", {
			headers: TEACHER,
		});
		expect(resWriting.status).toBe(404);
		const resForeign = await app.request("/api/grading/att-s/media", {
			headers: { "x-test-user": "teacher-2" },
		});
		expect(resForeign.status).toBe(404);
	});

	test("POST grade lần đầu tính band 6.5 và GET thấy điểm", async () => {
		const res = await postGrade(
			"att-w",
			gradeBody(
				{
					task: 6,
					coherence: 6.5,
					lexical: 6,
					grammar: 6.5,
				},
				"Tốt.\nCần thêm ví dụ.",
			),
		);
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			band: number;
			feedback: string;
			gradedAt: string;
		};
		expect(json.band).toBe(6.5);
		expect(json.feedback).toBe("Tốt.\nCần thêm ví dụ.");
		expect(json.gradedAt).toBeTruthy();

		const after = await app.request("/api/grading/att-w", { headers: TEACHER });
		const submission = (await after.json()) as TeacherSubmission;
		expect(submission.grade?.band).toBe(6.5);
		expect(submission.grade?.scores.task).toBe(6);
	});

	test("POST grade lần hai ghi đè: band 7, feedback rỗng", async () => {
		const res = await postGrade(
			"att-w",
			gradeBody({ task: 7, coherence: 7, lexical: 7, grammar: 7 }, ""),
		);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { band: number };
		expect(json.band).toBe(7);

		const after = await app.request("/api/grading/att-w", { headers: TEACHER });
		const submission = (await after.json()) as TeacherSubmission;
		expect(submission.grade?.band).toBe(7);
		expect(submission.grade?.feedback).toBe("");
	});

	test("POST grade Speaking chỉ nhận bộ tiêu chí Speaking", async () => {
		const wrong = await postGrade(
			"att-s",
			gradeBody({ task: 7, coherence: 7, lexical: 7, grammar: 7 }),
		);
		expect(wrong.status).toBe(400);
		const right = await postGrade(
			"att-s",
			gradeBody({ fluency: 7, lexical: 7, grammar: 7, pronunciation: 7 }),
		);
		expect(right.status).toBe(200);
		const json = (await right.json()) as { band: number };
		expect(json.band).toBe(7);
	});

	test.each([
		["thiếu một tiêu chí", { task: 6, coherence: 6, lexical: 6 }],
		["thừa key", { task: 6, coherence: 6, lexical: 6, grammar: 6, extra: 5 }],
		["điểm lẻ 0.25", { task: 6.25, coherence: 6, lexical: 6, grammar: 6 }],
		["điểm trên 9", { task: 9.5, coherence: 6, lexical: 6, grammar: 6 }],
		["điểm âm", { task: -1, coherence: 6, lexical: 6, grammar: 6 }],
	])("POST grade scores sai (%s) trả 400", async (_name, scores) => {
		const res = await postGrade("att-w", gradeBody(scores));
		expect(res.status).toBe(400);
	});

	test("POST grade nhận xét quá 5000 ký tự trả 400", async () => {
		const res = await postGrade(
			"att-w",
			gradeBody(
				{ task: 6, coherence: 6, lexical: 6, grammar: 6 },
				"a".repeat(5001),
			),
		);
		expect(res.status).toBe(400);
	});

	test("POST grade thiếu feedback trả 400", async () => {
		const res = await postGrade(
			"att-w",
			JSON.stringify({
				scores: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
			}),
		);
		expect(res.status).toBe(400);
	});

	test("POST grade chặn attempt chưa nộp, đề reading và org khác", async () => {
		const open = await postGrade(
			"att-w-open",
			gradeBody({ task: 6, coherence: 6, lexical: 6, grammar: 6 }),
		);
		expect(open.status).toBe(409);
		const reading = await postGrade(
			"att-r",
			gradeBody({ task: 6, coherence: 6, lexical: 6, grammar: 6 }),
		);
		expect(reading.status).toBe(400);
		const json = (await reading.json()) as { code?: string };
		expect(json.code).toBe("SKILL_NOT_GRADABLE");
		const foreign = await postGrade(
			"att-w",
			gradeBody({ task: 6, coherence: 6, lexical: 6, grammar: 6 }),
			{ "x-test-user": "teacher-2" },
		);
		expect(foreign.status).toBe(404);
	});

	test("POST grade với origin lạ trả 403", async () => {
		const res = await postGrade(
			"att-w",
			gradeBody({ task: 6, coherence: 6, lexical: 6, grammar: 6 }),
			TEACHER,
			"https://evil.example",
		);
		expect(res.status).toBe(403);
	});

	test("Snapshot kernel mang attemptId/gradedAt/band theo target", async () => {
		const res = await app.request("/api/kernel", { headers: TEACHER });
		expect(res.status).toBe(200);
		const snapshot = (await res.json()) as {
			classAssignments: Array<{
				id: string;
				targets: Array<{
					studentId: string;
					attemptId: string | null;
					gradedAt: string | null;
					band: number | null;
				}>;
			}>;
		};
		const graded = snapshot.classAssignments.find((a) => a.id === "ca-w");
		expect(graded?.targets[0]).toMatchObject({
			studentId: "student-1",
			attemptId: "att-w",
			band: 7,
		});
		expect(graded?.targets[0]?.gradedAt).toBeTruthy();
		const open = snapshot.classAssignments.find((a) => a.id === "ca-w-open");
		expect(open?.targets[0]).toMatchObject({
			studentId: "student-1",
			attemptId: null,
			band: null,
			gradedAt: null,
		});
	});

	test("Summary học viên có grade khi đã chấm, không có key khi chưa", async () => {
		const graded = await app.request("/api/student/attempts/att-w", {
			headers: { "x-test-user": "student-u" },
		});
		expect(graded.status).toBe(200);
		const gradedJson = (await graded.json()) as {
			grade?: { band: number; feedback: string };
			part?: string;
		};
		expect(gradedJson.grade?.band).toBe(7);
		expect(gradedJson.grade?.feedback).toBe("");
		expect(gradedJson.part).toBe("task2");

		const ungraded = await app.request("/api/student/attempts/att-s2", {
			headers: { "x-test-user": "student-u" },
		});
		expect(ungraded.status).toBe(200);
		const ungradedJson = (await ungraded.json()) as Record<string, unknown>;
		expect("grade" in ungradedJson).toBe(false);
		expect("part" in ungradedJson).toBe(false);
	});

	test.each([
		["GET bài nộp", "/api/grading/att-w", "GET", undefined],
		["GET media", "/api/grading/att-s/media", "GET", undefined],
	])("Không session trả 401 (%s)", async (_name, url, method) => {
		const res = await app.request(url, { method });
		expect(res.status).toBe(401);
	});

	test("POST grade không session trả 401", async () => {
		const res = await postGrade(
			"att-w",
			gradeBody({ task: 6, coherence: 6, lexical: 6, grammar: 6 }),
			{},
		);
		expect(res.status).toBe(401);
	});
});

describe("essay annotations (/api/grading/:attemptId/annotations)", () => {
	let app: ReturnType<typeof buildApp>;
	let libsql: Db;
	// Essay cố định cho bộ test highlight: "It was a fine day in Hanoi."
	// "fine" = (9, 13), "day" = (14, 17).
	const ANNOT_ESSAY = "It was a fine day in Hanoi.";

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		await libsql.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);
		await libsql.insert(schema.user).values([
			{
				id: "t-1",
				name: "Cô Lan",
				email: "lan@test.local",
				role: "teacher",
			},
			{
				id: "t-2",
				name: "Thầy Nam",
				email: "nam@test.local",
				role: "teacher",
			},
		]);
		await libsql.insert(schema.membership).values([
			{ id: "mem-1", orgId: "org-1", userId: "t-1", role: "teacher" },
			{ id: "mem-2", orgId: "org-2", userId: "t-2", role: "teacher" },
		]);
		await libsql.insert(schema.student).values({
			id: "student-1",
			orgId: "org-1",
			name: "Minh Tran",
			email: "minh@gmail.com",
			phone: "0901234567",
		});
		await libsql.insert(schema.classTable).values({
			id: "class-1",
			orgId: "org-1",
			name: "IELTS Foundation",
			level: "IELTS 5.0–6.0",
			mode: "Online",
			schedule: "T2 & T5 18:30–20:00",
			sessionsDone: 0,
			sessionsTotal: 20,
			status: "active",
		});
		await libsql.insert(schema.assignmentPrompt).values([
			{
				id: "prompt-writing",
				orgId: "org-1",
				task: "task2",
				genre: "essay",
				skill: "writing",
				part: "task2",
				type: "essay",
				title: "Writing Task 2",
				prompt: "<p>Some people think that children should learn to code.</p>",
				questions: "[]",
				optionBank: "[]",
				note: "<p>Ít nhất 250 từ.</p>",
				status: "ready",
			},
			{
				id: "prompt-speaking",
				orgId: "org-1",
				task: "task1",
				genre: "",
				skill: "speaking",
				part: "part2",
				type: "place",
				title: "Speaking Part 2",
				intro: "<p>Ghi âm một lần.</p>",
				prompt: "",
				passage: "",
				cueTopic: "a place you like to visit",
				cuePoints: "where it is\nwhy you like it",
				questions: "[]",
				optionBank: "[]",
				note: "<p>Nói tự nhiên, không đọc giấy.</p>",
				status: "ready",
			},
		]);
		for (const id of ["ca-w", "ca-w2", "ca-w3", "ca-s"]) {
			const promptId = id === "ca-s" ? "prompt-speaking" : "prompt-writing";
			await libsql.insert(schema.classAssignment).values({
				id,
				orgId: "org-1",
				classId: "class-1",
				promptId,
				title: `Quiz ${id}`,
				due: "2099-01-10",
			});
			await libsql.insert(schema.classAssignmentTarget).values({
				id: `cat-${id}`,
				orgId: "org-1",
				assignmentId: id,
				studentId: "student-1",
				submittedAt: null,
			});
		}
		await libsql.insert(schema.quizAttempt).values([
			{
				id: "att-w",
				orgId: "org-1",
				assignmentId: "ca-w",
				studentId: "student-1",
				status: "submitted",
				questionsSnapshot: "[]",
				essay: "Another essay for cross-attempt checks.",
				submittedAt: new Date("2026-10-06T00:30:00Z"),
			},
			{
				id: "att-w2",
				orgId: "org-1",
				assignmentId: "ca-w2",
				studentId: "student-1",
				status: "submitted",
				questionsSnapshot: "[]",
				essay: ANNOT_ESSAY,
				submittedAt: new Date("2026-10-06T01:00:00Z"),
			},
			{
				id: "att-w2-open",
				orgId: "org-1",
				assignmentId: "ca-w3",
				studentId: "student-1",
				status: "in_progress",
				questionsSnapshot: "[]",
			},
			{
				id: "att-s",
				orgId: "org-1",
				assignmentId: "ca-s",
				studentId: "student-1",
				status: "submitted",
				questionsSnapshot: "[]",
				mediaKey: "quiz-media/org-1/att-s/k1",
				mediaName: "bai-noi.mp3",
				mediaType: "audio/mpeg",
				mediaSize: 4,
				mediaUploadedAt: new Date("2026-10-06T01:30:00Z"),
				submittedAt: new Date("2026-10-06T01:35:00Z"),
			},
		]);

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: sessionFor,
			authHandler: () => new Response("auth OK"),
		});
	});

	const jsonHeaders = (
		user: Record<string, string> = TEACHER,
		origin = TEACHER_ORIGIN,
		withContentType = true,
	): Record<string, string> => {
		const headers: Record<string, string> = { ...user, origin };
		if (withContentType) headers["content-type"] = "application/json";
		return headers;
	};

	const postAnnotation = (
		attemptId: string,
		body: unknown,
		user: Record<string, string> = TEACHER,
		origin = TEACHER_ORIGIN,
		withContentType = true,
	) =>
		app.request(`/api/grading/${attemptId}/annotations`, {
			method: "POST",
			headers: jsonHeaders(user, origin, withContentType),
			body: typeof body === "string" ? body : JSON.stringify(body),
		});

	const patchAnnotation = (
		attemptId: string,
		annotationId: string,
		body: unknown,
		user: Record<string, string> = TEACHER,
	) =>
		app.request(`/api/grading/${attemptId}/annotations/${annotationId}`, {
			method: "PATCH",
			headers: jsonHeaders(user),
			body: JSON.stringify(body),
		});

	const deleteAnnotation = (
		attemptId: string,
		annotationId: string,
		user: Record<string, string> = TEACHER,
	) =>
		app.request(`/api/grading/${attemptId}/annotations/${annotationId}`, {
			method: "DELETE",
			headers: jsonHeaders(user),
		});

	const getSubmission = async (attemptId: string) => {
		const res = await app.request(`/api/grading/${attemptId}`, {
			headers: TEACHER,
		});
		return (await res.json()) as TeacherSubmission;
	};

	/** Body error mang `code` (OVERLAP, INVALID_SPAN…) — đọc gọn một dòng. */
	const errorCode = async (res: Response) =>
		((await res.json()) as { code?: string }).code;

	test("POST hợp lệ trả 201 và GET thấy annotation", async () => {
		const res = await postAnnotation("att-w2", {
			start: 9,
			end: 13,
			note: "Dùng 'pleasant' tự nhiên hơn.",
		});
		expect(res.status).toBe(201);
		const created = (await res.json()) as {
			id: string;
			start: number;
			end: number;
			note: string;
		};
		expect(created).toMatchObject({
			start: 9,
			end: 13,
			note: "Dùng 'pleasant' tự nhiên hơn.",
		});
		expect(created.id).toBeTruthy();

		const submission = await getSubmission("att-w2");
		expect(submission.annotations).toHaveLength(1);
		expect(submission.annotations?.[0]).toMatchObject({
			start: 9,
			end: 13,
			note: "Dùng 'pleasant' tự nhiên hơn.",
		});
	});

	test("POST thứ tự ngược thì GET vẫn sắp theo start", async () => {
		const res = await postAnnotation("att-w2", {
			start: 22,
			end: 27,
			note: "",
		});
		expect(res.status).toBe(201);
		const submission = await getSubmission("att-w2");
		expect(submission.annotations?.map((a) => [a.start, a.end])).toEqual([
			[9, 13],
			[22, 27],
		]);
	});

	test("POST chồng một phần trả 409 OVERLAP; chạm biên vẫn 201", async () => {
		const overlap = await postAnnotation("att-w2", {
			start: 10,
			end: 14,
			note: "",
		});
		expect(overlap.status).toBe(409);
		expect(await errorCode(overlap)).toBe("OVERLAP");
		const touching = await postAnnotation("att-w2", {
			start: 14,
			end: 17,
			note: "",
		});
		expect(touching.status).toBe(201);
	});

	test("POST offset sai biên/toàn khoảng trắng/quá dài trả 400 INVALID_SPAN", async () => {
		const beyond = await postAnnotation("att-w2", {
			start: 0,
			end: 1000,
			note: "",
		});
		expect(beyond.status).toBe(400);
		expect(await errorCode(beyond)).toBe("INVALID_SPAN");
		const whitespace = await postAnnotation("att-w2", {
			start: 6,
			end: 7,
			note: "",
		});
		expect(whitespace.status).toBe(400);
		expect(await errorCode(whitespace)).toBe("INVALID_SPAN");
	});

	test("POST body sai (end<=start, thừa key, note quá dài) trả 400", async () => {
		const reversed = await postAnnotation("att-w2", { start: 5, end: 5 });
		expect(reversed.status).toBe(400);
		const extraKey = await postAnnotation("att-w2", {
			start: 0,
			end: 2,
			note: "",
			extra: true,
		});
		expect(extraKey.status).toBe(400);
		const longNote = await postAnnotation("att-w2", {
			start: 0,
			end: 2,
			note: "x".repeat(1001),
		});
		expect(longNote.status).toBe(400);
	});

	test("POST trên attempt Speaking trả 400 SKILL_NOT_ANNOTATABLE", async () => {
		const res = await postAnnotation("att-s", { start: 0, end: 2, note: "" });
		expect(res.status).toBe(400);
		expect(await errorCode(res)).toBe("SKILL_NOT_ANNOTATABLE");
		const submission = await getSubmission("att-s");
		expect(submission.annotations).toEqual([]);
	});

	test("POST attempt chưa nộp trả 409 NOT_SUBMITTED", async () => {
		const res = await postAnnotation("att-w2-open", {
			start: 0,
			end: 2,
			note: "",
		});
		expect(res.status).toBe(409);
		expect(await errorCode(res)).toBe("NOT_SUBMITTED");
	});

	test("POST giáo viên org khác trả 404 (IDOR)", async () => {
		const res = await postAnnotation(
			"att-w2",
			{ start: 0, end: 2, note: "" },
			{ "x-test-user": "teacher-2" },
		);
		expect(res.status).toBe(404);
	});

	test("PATCH đổi note thì GET thấy note mới", async () => {
		const submission = await getSubmission("att-w2");
		const target = submission.annotations?.find((a) => a.start === 9);
		expect(target).toBeTruthy();
		const res = await patchAnnotation("att-w2", target?.id ?? "", {
			note: "Chữa lại: dùng quá khứ đơn.",
		});
		expect(res.status).toBe(200);
		const updated = (await res.json()) as { note: string };
		expect(updated.note).toBe("Chữa lại: dùng quá khứ đơn.");
		const after = await getSubmission("att-w2");
		expect(after.annotations?.find((a) => a.start === 9)?.note).toBe(
			"Chữa lại: dùng quá khứ đơn.",
		);
	});

	test("PATCH/DELETE annotationId của attempt khác cùng org trả 404", async () => {
		const submission = await getSubmission("att-w2");
		const foreignId = submission.annotations?.[0]?.id ?? "";
		expect(foreignId).toBeTruthy();
		const patched = await patchAnnotation("att-w2", foreignId, { note: "x" });
		expect(patched.status).toBe(200);
		// att-w (writing, org-1) nhưng annotation thuộc att-w2 → 0 rows.
		const wrongAttempt = await app.request(
			`/api/grading/att-w/annotations/${foreignId}`,
			{ method: "PATCH", headers: jsonHeaders(), body: '{"note":"x"}' },
		);
		expect(wrongAttempt.status).toBe(404);
		const wrongAttemptDelete = await app.request(
			`/api/grading/att-w/annotations/${foreignId}`,
			{ method: "DELETE", headers: jsonHeaders() },
		);
		expect(wrongAttemptDelete.status).toBe(404);
	});

	test("PATCH annotation không tồn tại trả 404", async () => {
		const res = await patchAnnotation("att-w2", "no-such-id", { note: "x" });
		expect(res.status).toBe(404);
	});

	test("DELETE trả 204 và GET không còn annotation", async () => {
		const submission = await getSubmission("att-w2");
		const before = submission.annotations?.length ?? 0;
		const target = submission.annotations?.[submission.annotations.length - 1];
		expect(target).toBeTruthy();
		const res = await deleteAnnotation("att-w2", target?.id ?? "");
		expect(res.status).toBe(204);
		const after = await getSubmission("att-w2");
		expect(after.annotations).toHaveLength(before - 1);
	});

	test("Không session trả 401 cho cả 3 route", async () => {
		const post = await postAnnotation("att-w2", { start: 0, end: 2 }, {});
		expect(post.status).toBe(401);
		const patch = await patchAnnotation("att-w2", "any", { note: "" }, {});
		expect(patch.status).toBe(401);
		const del = await deleteAnnotation("att-w2", "any", {});
		expect(del.status).toBe(401);
	});

	test("Origin lạ trả 403, session học viên trả 403", async () => {
		const evil = await postAnnotation(
			"att-w2",
			{ start: 0, end: 2 },
			TEACHER,
			"https://evil.example",
		);
		expect(evil.status).toBe(403);
		const student = await postAnnotation(
			"att-w2",
			{ start: 0, end: 2 },
			{ "x-test-user": "student-u" },
		);
		expect(student.status).toBe(403);
	});

	test("POST thiếu Content-Type application/json trả 415", async () => {
		const res = await postAnnotation(
			"att-w2",
			{ start: 0, end: 2 },
			TEACHER,
			TEACHER_ORIGIN,
			false,
		);
		expect(res.status).toBe(415);
	});

	test("PATCH/DELETE giáo viên org khác trả 404 (IDOR)", async () => {
		const submission = await getSubmission("att-w2");
		const foreignId = submission.annotations?.[0]?.id ?? "";
		const patched = await patchAnnotation(
			"att-w2",
			foreignId,
			{ note: "x" },
			{ "x-test-user": "teacher-2" },
		);
		expect(patched.status).toBe(404);
		const deleted = await deleteAnnotation("att-w2", foreignId, {
			"x-test-user": "teacher-2",
		});
		expect(deleted.status).toBe(404);
	});

	test("POST highlight thứ 201 trả 400 TOO_MANY_ANNOTATIONS", async () => {
		const submission = await getSubmission("att-w2");
		const current = submission.annotations?.length ?? 0;
		await libsql.insert(schema.quizAttemptAnnotation).values(
			Array.from({ length: 200 - current }, (_, i) => ({
				id: `seed-ann-${i}`,
				orgId: "org-1",
				attemptId: "att-w2",
				startOffset: 0,
				endOffset: 1,
			})),
		);
		// Mọi slot đã bị seed chiếm (0,1) — POST đoạn khác vẫn chạm trần 200.
		const res = await postAnnotation("att-w2", { start: 3, end: 4, note: "" });
		expect(res.status).toBe(400);
		expect(await errorCode(res)).toBe("TOO_MANY_ANNOTATIONS");
	});
});
