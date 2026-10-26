import { createClient } from "@libsql/client";
import type {
	GradingQueueResponse,
	TeacherSubmission,
} from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type MediaStore } from "../app";
import type { SessionUser } from "../session";
import { loadGradingQueue } from "./grading";

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
		for (const id of ["ca-w", "ca-w2", "ca-w3", "ca-w4", "ca-s"]) {
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
				id: "att-w-html",
				orgId: "org-1",
				assignmentId: "ca-w4",
				studentId: "student-1",
				status: "submitted",
				questionsSnapshot: "[]",
				essay:
					"<p>Remote learning has widened the gap.</p><p>Cost &amp; time matter.</p>",
				submittedAt: new Date("2026-10-06T01:15:00Z"),
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

	test("Essay chứa HTML (<p>, &amp;): GET trả plain, POST/PATCH trả offset plain nhưng DB lưu offset raw, lọc bỏ annotation nằm trọn trong thẻ (#382)", async () => {
		const before = await getSubmission("att-w-html");
		expect(before.essay).toBe(
			"Remote learning has widened the gap.\nCost & time matter.",
		);

		// "Cost & time" trên plain = 37..48, ứng với raw 46..61 ("Cost &amp; time").
		const created = await postAnnotation("att-w-html", {
			start: 37,
			end: 48,
			note: "rõ ý",
		});
		expect(created.status).toBe(201);
		const createdBody = (await created.json()) as {
			id: string;
			start: number;
			end: number;
			note: string;
		};
		expect(createdBody).toMatchObject({
			start: 37,
			end: 48,
			note: "rõ ý",
		});

		const [stored] = await libsql
			.select()
			.from(schema.quizAttemptAnnotation)
			.where(eq(schema.quizAttemptAnnotation.id, createdBody.id));
		expect(stored?.startOffset).toBe(46);
		expect(stored?.endOffset).toBe(61);

		const patched = await patchAnnotation("att-w-html", createdBody.id, {
			note: "rõ ý — giữ nguyên",
		});
		expect(patched.status).toBe(200);
		expect(await patched.json()).toMatchObject({
			id: createdBody.id,
			start: 37,
			end: 48,
			note: "rõ ý — giữ nguyên",
		});

		// Annotation cũ nằm trọn trong thẻ mở `<p>` (raw 0..3) bị lọc bỏ khỏi GET.
		await libsql.insert(schema.quizAttemptAnnotation).values({
			id: "ann-tag-only",
			orgId: "org-1",
			attemptId: "att-w-html",
			startOffset: 0,
			endOffset: 3,
			note: "trong thẻ",
		});

		const after = await getSubmission("att-w-html");
		expect(after.annotations).toEqual([
			{
				id: createdBody.id,
				start: 37,
				end: 48,
				note: "rõ ý — giữ nguyên",
			},
		]);
	});
});

type HonoApp = {
	request(
		input: RequestInfo | URL,
		requestInit?: RequestInit,
	): Response | Promise<Response>;
};

describe("GET /api/grading (queue #383)", () => {
	let app: HonoApp;
	let libsql: Db;

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
		await libsql.insert(schema.student).values([
			{
				id: "student-1",
				orgId: "org-1",
				name: "Minh Tran",
				email: "minh@gmail.com",
				phone: "0901234567",
			},
			{
				id: "student-2",
				orgId: "org-2",
				name: "Khánh",
				email: "khanh@gmail.com",
				phone: "0909999999",
			},
		]);
		await libsql.insert(schema.classTable).values([
			{
				id: "class-1",
				orgId: "org-1",
				name: "IELTS Foundation",
				level: "IELTS 5.0–6.0",
				mode: "Online",
				schedule: "T2 & T5 18:30–20:00",
				sessionsDone: 0,
				sessionsTotal: 20,
				status: "active",
			},
			{
				id: "class-2",
				orgId: "org-2",
				name: "Org 2 Class",
				level: "IELTS 6.0",
				mode: "Online",
				schedule: "T3",
				sessionsDone: 0,
				sessionsTotal: 10,
				status: "active",
			},
		]);
		await libsql.insert(schema.assignmentPrompt).values([
			{
				id: "p-w-t1",
				orgId: "org-1",
				task: "task1",
				genre: "chart",
				skill: "writing",
				part: "task1",
				type: "chart",
				title: "Writing Task 1 Prompt",
				prompt: "<p>Chart prompt</p>",
				questions: "[]",
				optionBank: "[]",
				note: "",
				status: "ready",
			},
			{
				id: "p-w-t2",
				orgId: "org-1",
				task: "task2",
				genre: "essay",
				skill: "writing",
				part: "task2",
				type: "essay",
				title: "Writing Task 2 Prompt",
				prompt: "<p>Essay prompt</p>",
				questions: "[]",
				optionBank: "[]",
				note: "",
				status: "ready",
			},
			{
				id: "p-s-p2",
				orgId: "org-1",
				task: "task1",
				genre: "",
				skill: "speaking",
				part: "part2",
				type: "place",
				title: "Speaking Part 2 Prompt",
				prompt: "",
				questions: "[]",
				optionBank: "[]",
				note: "",
				status: "ready",
			},
			{
				id: "p-r-p1",
				orgId: "org-1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "mcq",
				title: "Reading Prompt",
				prompt: "",
				questions: "[]",
				optionBank: "[]",
				note: "",
				status: "ready",
			},
			{
				id: "p-org2-w",
				orgId: "org-2",
				task: "task2",
				genre: "essay",
				skill: "writing",
				part: "task2",
				type: "essay",
				title: "Org 2 Writing",
				prompt: "<p>Org 2</p>",
				questions: "[]",
				optionBank: "[]",
				note: "",
				status: "ready",
			},
		]);
		await libsql.insert(schema.classAssignment).values([
			{
				id: "ca-assign-w",
				orgId: "org-1",
				classId: "class-1",
				promptId: "p-w-t2",
				title: "Bài giao Writing tuần 1",
				due: "2026-10-30",
			},
			{
				id: "ca-assign-r",
				orgId: "org-1",
				classId: "class-1",
				promptId: "p-r-p1",
				title: "Bài giao Reading",
				due: "2026-10-30",
			},
			{
				id: "ca-org2",
				orgId: "org-2",
				classId: "class-2",
				promptId: "p-org2-w",
				title: "Bài giao Org 2",
				due: "2026-10-30",
			},
		]);

		// Đề tự luyện: 1 đề 2 part (task1 + task2), 1 đề speaking 0 part, 1 đề reading.
		await libsql.insert(schema.assignmentTest).values([
			{
				id: "test-w-2parts",
				orgId: "org-1",
				title: "Mock Writing Full (2 parts)",
				skill: "writing",
				status: "ready",
			},
			{
				id: "test-s-nopart",
				orgId: "org-1",
				title: "Mock Speaking No Part",
				skill: "speaking",
				status: "ready",
			},
			{
				id: "test-r-practice",
				orgId: "org-1",
				title: "Mock Reading Practice",
				skill: "reading",
				status: "ready",
			},
		]);
		await libsql.insert(schema.assignmentTestPart).values([
			{
				id: "atp-2",
				testId: "test-w-2parts",
				promptId: "p-w-t2",
				part: "task2",
				position: 2,
			},
			{
				id: "atp-1",
				testId: "test-w-2parts",
				promptId: "p-w-t1",
				part: "task1",
				position: 1,
			},
		]);

		await libsql.insert(schema.quizAttempt).values([
			// 1. Assignment writing — đã chấm (nộp mới nhất nhưng đã chấm -> đứng sau bài chờ chấm)
			{
				id: "q-assign-graded",
				orgId: "org-1",
				assignmentId: "ca-assign-w",
				studentId: "student-1",
				mode: "assignment",
				status: "submitted",
				questionsSnapshot: "[]",
				essay: "Graded essay",
				startedAt: new Date("2026-10-20T08:00:00.000Z"),
				submittedAt: new Date("2026-10-20T09:00:00.000Z"),
				gradeScores: { task: 6.5, coherence: 6.5, lexical: 6.5, grammar: 6.5 },
				gradeFeedback: "Tốt",
				gradedAt: new Date("2026-10-20T10:00:00.000Z"),
			},
			// 2. Practice writing (2 parts) — chờ chấm (nộp sớm hơn bài đã chấm nhưng phải đứng trước)
			{
				id: "q-prac-w-await",
				orgId: "org-1",
				assignmentId: null,
				testId: "test-w-2parts",
				studentId: "student-1",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: "[]",
				essay: "Practice essay",
				startedAt: new Date("2026-10-19T08:00:00.000Z"),
				submittedAt: new Date("2026-10-19T09:00:00.000Z"),
			},
			// 3. Practice speaking (0 parts) — chờ chấm (nộp mới hơn q-prac-w-await -> đứng đầu tiên)
			{
				id: "q-prac-s-await",
				orgId: "org-1",
				assignmentId: null,
				testId: "test-s-nopart",
				studentId: "student-1",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: "[]",
				startedAt: new Date("2026-10-19T10:00:00.000Z"),
				submittedAt: new Date("2026-10-19T11:00:00.000Z"),
			},
			// Các dòng phải bị loại:
			// - in_progress
			{
				id: "q-in-progress",
				orgId: "org-1",
				assignmentId: null,
				testId: "test-w-2parts",
				studentId: "student-1",
				mode: "practice",
				status: "in_progress",
				questionsSnapshot: "[]",
				startedAt: new Date("2026-10-20T11:00:00.000Z"),
			},
			// - reading assignment
			{
				id: "q-reading-assign",
				orgId: "org-1",
				assignmentId: "ca-assign-r",
				studentId: "student-1",
				mode: "assignment",
				status: "submitted",
				questionsSnapshot: "[]",
				startedAt: new Date("2026-10-20T11:00:00.000Z"),
				submittedAt: new Date("2026-10-20T11:30:00.000Z"),
			},
			// - reading practice
			{
				id: "q-reading-prac",
				orgId: "org-1",
				assignmentId: null,
				testId: "test-r-practice",
				studentId: "student-1",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: "[]",
				startedAt: new Date("2026-10-20T11:00:00.000Z"),
				submittedAt: new Date("2026-10-20T11:30:00.000Z"),
			},
			// - practice đề đã xoá (testId null)
			{
				id: "q-deleted-test",
				orgId: "org-1",
				assignmentId: null,
				testId: null,
				studentId: "student-1",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: "[]",
				startedAt: new Date("2026-10-20T11:00:00.000Z"),
				submittedAt: new Date("2026-10-20T11:30:00.000Z"),
			},
			// - org khác (IDOR)
			{
				id: "q-org2",
				orgId: "org-2",
				assignmentId: "ca-org2",
				studentId: "student-2",
				mode: "assignment",
				status: "submitted",
				questionsSnapshot: "[]",
				startedAt: new Date("2026-10-20T11:00:00.000Z"),
				submittedAt: new Date("2026-10-20T11:30:00.000Z"),
			},
		]);

		app = buildApp({
			getDb: () => libsql,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: sessionFor,
			authHandler: () => new Response("auth OK"),
		});
	});

	test("trả 401 khi không có session và 403 khi gọi bằng session học viên", async () => {
		const unauth = await app.request("/api/grading");
		expect(unauth.status).toBe(401);
		const studentRes = await app.request("/api/grading", {
			headers: { "x-test-user": "student-u" },
		});
		expect(studentRes.status).toBe(403);
	});

	test("hợp nhất assignment + practice, không nhân bản đề 2 part, fallback part rỗng, lọc đúng org/skill/status và sắp chờ chấm trước", async () => {
		const res = await app.request("/api/grading", { headers: TEACHER });
		expect(res.status).toBe(200);
		const body = (await res.json()) as GradingQueueResponse;
		expect(body.items.map((i) => i.attemptId)).toEqual([
			"q-prac-s-await",
			"q-prac-w-await",
			"q-assign-graded",
		]);

		// Đề speaking không có part -> part: ""
		expect(body.items[0]).toEqual({
			attemptId: "q-prac-s-await",
			mode: "practice",
			classId: "",
			className: "Luyện tập",
			title: "Mock Speaking No Part",
			due: "",
			student: { id: "student-1", name: "Minh Tran" },
			skill: "speaking",
			part: "",
			submittedAt: "2026-10-19T11:00:00.000Z",
			grade: null,
		});

		// Đề writing 2 part -> chỉ 1 dòng, part lấy từ position nhỏ nhất (task1)
		expect(body.items[1]).toEqual({
			attemptId: "q-prac-w-await",
			mode: "practice",
			classId: "",
			className: "Luyện tập",
			title: "Mock Writing Full (2 parts)",
			due: "",
			student: { id: "student-1", name: "Minh Tran" },
			skill: "writing",
			part: "task1",
			submittedAt: "2026-10-19T09:00:00.000Z",
			grade: null,
		});

		// Bài giao theo lớp đã chấm
		expect(body.items[2]).toEqual({
			attemptId: "q-assign-graded",
			mode: "assignment",
			classId: "class-1",
			className: "IELTS Foundation",
			title: "Bài giao Writing tuần 1",
			due: "2026-10-30",
			student: { id: "student-1", name: "Minh Tran" },
			skill: "writing",
			part: "task2",
			submittedAt: "2026-10-20T09:00:00.000Z",
			grade: {
				scores: { task: 6.5, coherence: 6.5, lexical: 6.5, grammar: 6.5 },
				band: 6.5,
				feedback: "Tốt",
				gradedAt: "2026-10-20T10:00:00.000Z",
			},
		});
	});

	test("bảo toàn bài chờ chấm khi vượt giới hạn nhánh (branchLimit = 2) và chia chunk >50 đề tự luyện", async () => {
		// Thêm 2 bài practice ĐÃ CHẤM nộp mới hơn q-prac-w-await và q-prac-s-await
		await libsql.insert(schema.quizAttempt).values([
			{
				id: "q-prac-graded-new-1",
				orgId: "org-1",
				assignmentId: null,
				testId: "test-w-2parts",
				studentId: "student-1",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: "[]",
				startedAt: new Date("2026-10-21T01:00:00.000Z"),
				submittedAt: new Date("2026-10-21T02:00:00.000Z"),
				gradeScores: { task: 7, coherence: 7, lexical: 7, grammar: 7 },
				gradeFeedback: "OK",
				gradedAt: new Date("2026-10-21T03:00:00.000Z"),
			},
			{
				id: "q-prac-graded-new-2",
				orgId: "org-1",
				assignmentId: null,
				testId: "test-w-2parts",
				studentId: "student-1",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: "[]",
				startedAt: new Date("2026-10-21T04:00:00.000Z"),
				submittedAt: new Date("2026-10-21T05:00:00.000Z"),
				gradeScores: { task: 7.5, coherence: 7.5, lexical: 7.5, grammar: 7.5 },
				gradeFeedback: "OK 2",
				gradedAt: new Date("2026-10-21T06:00:00.000Z"),
			},
		]);

		// Với branchLimit = 2 trên nhánh practice (đang có 2 bài chờ chấm cũ + 2 bài đã chấm mới),
		// cả 2 bài chờ chấm cũ PHẢI được giữ lại, 2 bài đã chấm mới bị cắt bởi limit(2).
		const limited = await loadGradingQueue(libsql, "org-1", 2);
		const practiceIds = limited
			.filter((i) => i.mode === "practice")
			.map((i) => i.attemptId);
		expect(practiceIds).toEqual(["q-prac-s-await", "q-prac-w-await"]);

		// Seed thêm 55 đề practice khác nhau (vượt ngưỡng chunk 50 của D1) để kiểm chứng chunking
		for (let i = 0; i < 55; i++) {
			const tid = `test-bulk-${i}`;
			await libsql.insert(schema.assignmentTest).values({
				id: tid,
				orgId: "org-1",
				title: `Bulk Writing ${i}`,
				skill: "writing",
				status: "ready",
			});
			await libsql.insert(schema.assignmentTestPart).values({
				id: `atp-bulk-${i}`,
				testId: tid,
				promptId: i % 2 === 0 ? "p-w-t1" : "p-w-t2",
				part: i % 2 === 0 ? "task1" : "task2",
				position: 1,
			});
			await libsql.insert(schema.quizAttempt).values({
				id: `q-bulk-${i}`,
				orgId: "org-1",
				assignmentId: null,
				testId: tid,
				studentId: "student-1",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: "[]",
				startedAt: new Date("2026-10-18T01:00:00.000Z"),
				submittedAt: new Date("2026-10-18T02:00:00.000Z"),
			});
		}

		const full = await loadGradingQueue(libsql, "org-1");
		const bulkItems = full.filter((i) => i.attemptId.startsWith("q-bulk-"));
		expect(bulkItems).toHaveLength(55);
		expect(bulkItems.find((i) => i.attemptId === "q-bulk-0")?.part).toBe(
			"task1",
		);
		expect(bulkItems.find((i) => i.attemptId === "q-bulk-54")?.part).toBe(
			"task1",
		);
		expect(bulkItems.find((i) => i.attemptId === "q-bulk-53")?.part).toBe(
			"task2",
		);
	});
});

// #454 phase 3 — chấm bài phát grade_returned theo attempt, khóa canonical
// chống nhân đôi khi chấm lại; fail-open khi hàng đợi ghi lỗi.
describe("grade_returned notification (/api/grading/:attemptId/grade #454)", () => {
	let app: ReturnType<typeof buildApp>;
	let libsql: Db;
	let client: ReturnType<typeof createClient>;

	beforeAll(async () => {
		client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		await libsql.insert(schema.organization).values({
			id: "org-1",
			name: "Academy 1",
		});
		await libsql.insert(schema.user).values({
			id: "t-1",
			name: "Cô Lan",
			email: "lan@test.local",
			role: "teacher",
		});
		await libsql.insert(schema.membership).values({
			id: "mem-1",
			orgId: "org-1",
			userId: "t-1",
			role: "teacher",
		});
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
		await libsql.insert(schema.assignmentPrompt).values({
			id: "prompt-g",
			orgId: "org-1",
			task: "task1",
			genre: "",
			skill: "speaking",
			part: "part2",
			type: "place",
			title: "Speaking Part 2",
			prompt: "Describe a place.",
			questions: "[]",
			optionBank: "[]",
			note: "",
			status: "ready",
		});
		await libsql.insert(schema.classAssignment).values({
			id: "ca-g",
			orgId: "org-1",
			classId: "class-1",
			promptId: "prompt-g",
			title: "Speaking Part 2",
			due: "2099-01-10",
		});
		await libsql.insert(schema.quizAttempt).values({
			id: "att-g",
			orgId: "org-1",
			assignmentId: "ca-g",
			studentId: "student-1",
			status: "submitted",
			questionsSnapshot: "[]",
			submittedAt: new Date("2026-10-05T01:00:00Z"),
		});

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: TEACHER_ORIGIN,
			getSessionUser: sessionFor,
			authHandler: () => new Response("auth OK"),
		});
	});

	async function postGrade(attemptId: string) {
		return app.request(`/api/grading/${attemptId}/grade`, {
			method: "POST",
			headers: {
				...TEACHER,
				origin: TEACHER_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				scores: { fluency: 6, lexical: 6.5, grammar: 6, pronunciation: 6 },
				feedback: "Tốt.",
			}),
		});
	}

	test("chấm thành công phát đúng 1 grade_returned theo attempt", async () => {
		const res = await postGrade("att-g");
		expect(res.status).toBe(200);
		const rows = await libsql.select().from(schema.notificationRecord);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			orgId: "org-1",
			studentId: "student-1",
			eventType: "grade_returned",
			idempotencyKey: "grade_returned:att-g",
		});
	});

	test("chấm lại (ghi đè) không nhân đôi thông báo", async () => {
		const res = await postGrade("att-g");
		expect(res.status).toBe(200);
		const rows = await libsql.select().from(schema.notificationRecord);
		expect(rows).toHaveLength(1);
	});

	test("404 attempt lạ → 0 dòng mới", async () => {
		const res = await postGrade("att-khong-ton-tai");
		expect(res.status).toBe(404);
		expect(await libsql.select().from(schema.notificationRecord)).toHaveLength(
			1,
		);
	});

	test("hàng đợi ghi lỗi (mất bảng ghi) → request vẫn 2xx", async () => {
		await client.execute("DROP TABLE notification_record");
		const res = await postGrade("att-g");
		expect(res.status).toBe(200);
	});
});
