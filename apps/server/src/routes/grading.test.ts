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
