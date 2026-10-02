import { createClient } from "@libsql/client";
import type {
	QuizAttemptDetail,
	QuizAttemptSummary,
	StudentQuizDetail,
} from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import {
	buildApp,
	type Db,
	enforceDeclaredSize,
	type MediaStore,
	type ServerApp,
} from "../app";
import type { SessionUser } from "../session";

const CORS_ORIGINS = ["http://localhost:8003"];
const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;
const OWNER = { "x-test-user": "google-verified" };

/** Store Map trong bộ nhớ — đọc hết stream để khoá hành vi "body phải tới
 * R2 nguyên vẹn" (không middleware nào được đọc mất stream upload). */
function createMemoryMediaStore() {
	const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
	/** Chạy sau khi object đã ghi, trước khi handler CAS — ép race tất định. */
	const hooks: { afterPut: (() => Promise<void>) | null } = { afterPut: null };
	const store: MediaStore = {
		async put(key, body, { contentType, size }) {
			const counted = enforceDeclaredSize(body, size);
			const bytes = new Uint8Array(
				await new Response(counted.stream).arrayBuffer(),
			);
			objects.set(key, { bytes, contentType });
			const afterPut = hooks.afterPut;
			hooks.afterPut = null;
			if (afterPut) await afterPut();
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
	return { store, objects, hooks };
}

function bytesOf(length: number, fill: number): Uint8Array {
	return new Uint8Array(length).fill(fill);
}

const sessionFor = async (headers: Headers): Promise<SessionUser | null> => {
	const userKey = headers.get("x-test-user");
	if (userKey === "google-verified") {
		return {
			userId: "u-1",
			userName: "Minh Tran",
			email: "minh@gmail.com",
			emailVerified: true,
			role: "student",
		};
	}
	if (userKey === "ambiguous") {
		return {
			userId: "u-amb",
			userName: "Trung",
			email: "trung@test.local",
			emailVerified: true,
			role: "student",
		};
	}
	return null;
};

describe("student speaking media (/api/student/attempts/:id/media)", () => {
	let app: ServerApp;
	let appWithoutStore: ServerApp;
	let libsql: Db;
	const memory = createMemoryMediaStore();
	const background: Promise<unknown>[] = [];

	/** Đợi mọi việc xoá bù trừ chạy qua runInBackground. */
	const settle = async () => {
		await Promise.all(background.splice(0));
	};

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		await libsql
			.insert(schema.organization)
			.values({ id: "org-1", name: "Academy 1" });
		await libsql.insert(schema.student).values([
			{
				id: "student-1",
				orgId: "org-1",
				name: "Minh Tran",
				email: "minh@gmail.com",
				phone: "0901234567",
			},
			{
				id: "student-amb-1",
				orgId: "org-1",
				name: "Trung A",
				email: "trung@test.local",
				phone: "0901111111",
			},
		]);
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
			["ca-s1", "prompt-speaking"],
			["ca-s2", "prompt-speaking"],
			["ca-s3", "prompt-speaking"],
			["ca-s4", "prompt-speaking"],
			["ca-s5", "prompt-speaking"],
			["ca-r1", "prompt-reading"],
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

		const baseDeps = {
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: sessionFor,
			authHandler: () => new Response("auth OK"),
		};
		app = buildApp({
			...baseDeps,
			getMediaStore: () => memory.store,
			runInBackground: (promise) => {
				background.push(promise);
			},
		});
		appWithoutStore = buildApp(baseDeps);
	});

	/** Start hoặc resume (200) attempt của lượt giao — idempotent như route. */
	async function startAttempt(assignmentId: string): Promise<string> {
		const res = await app.request(
			`/api/student/assignments/${assignmentId}/quiz/start`,
			{
				method: "POST",
				headers: {
					...OWNER,
					Origin: STUDENT_ORIGIN,
					"Content-Type": "application/json",
				},
				body: "{}",
			},
		);
		expect([200, 201]).toContain(res.status);
		return ((await res.json()) as { attemptId: string }).attemptId;
	}

	async function putMedia(
		attemptId: string,
		body: Uint8Array,
		overrides: Record<string, string | null> = {},
		target: ServerApp = app,
	): Promise<Response> {
		const headers: Record<string, string> = {
			...OWNER,
			Origin: STUDENT_ORIGIN,
			"Content-Type": "audio/mpeg",
			"Content-Length": String(body.byteLength),
			"X-File-Name": encodeURIComponent("bài nói part2.mp3"),
		};
		for (const [name, value] of Object.entries(overrides)) {
			if (value === null) delete headers[name];
			else headers[name] = value;
		}
		return target.request(`/api/student/attempts/${attemptId}/media`, {
			method: "PUT",
			headers,
			body,
		});
	}

	async function deleteMedia(attemptId: string): Promise<Response> {
		return app.request(`/api/student/attempts/${attemptId}/media`, {
			method: "DELETE",
			headers: { ...OWNER, Origin: STUDENT_ORIGIN },
		});
	}

	async function getMedia(attemptId: string): Promise<Response> {
		return app.request(`/api/student/attempts/${attemptId}/media`, {
			headers: OWNER,
		});
	}

	async function submit(attemptId: string): Promise<Response> {
		return app.request(`/api/student/attempts/${attemptId}/submit`, {
			method: "POST",
			headers: {
				...OWNER,
				Origin: STUDENT_ORIGIN,
				"Content-Type": "application/json",
			},
			body: "{}",
		});
	}

	async function targetSubmittedAt(assignmentId: string) {
		const [row] = await libsql
			.select({ submittedAt: schema.classAssignmentTarget.submittedAt })
			.from(schema.classAssignmentTarget)
			.where(
				and(
					eq(schema.classAssignmentTarget.assignmentId, assignmentId),
					eq(schema.classAssignmentTarget.studentId, "student-1"),
				),
			);
		return row?.submittedAt ?? null;
	}

	test("speaking media upload, replace, play back and submit", async () => {
		const attemptId = await startAttempt("ca-s1");

		const first = await putMedia(attemptId, bytesOf(2048, 1));
		expect(first.status).toBe(200);
		const firstBody = (await first.json()) as {
			media: { name: string; type: string; size: number; uploadedAt: string };
		};
		expect(firstBody.media).toMatchObject({
			name: "bài nói part2.mp3",
			type: "audio/mpeg",
			size: 2048,
		});
		expect(Number.isNaN(Date.parse(firstBody.media.uploadedAt))).toBe(false);

		// Resume: take payload trả attempt.media (không lộ object key).
		const take = await app.request("/api/student/assignments/ca-s1/quiz", {
			headers: OWNER,
		});
		const takeBody = (await take.json()) as StudentQuizDetail;
		expect(takeBody.attempt?.media).toMatchObject({ size: 2048 });
		expect(JSON.stringify(takeBody)).not.toContain("quiz-media/");
		// "Hướng dẫn thêm" của giáo viên là hướng dẫn cho học viên ở Speaking.
		expect(takeBody.note).toBe("<p>Nói tự nhiên, không đọc giấy.</p>");

		// Thay file: key mới, object cũ bị xoá → store chỉ còn 1 object.
		const replaced = await putMedia(attemptId, bytesOf(3000, 7), {
			"Content-Type": "video/mp4",
			"X-File-Name": "answer-v2.mp4",
		});
		expect(replaced.status).toBe(200);
		await settle();
		expect(memory.objects.size).toBe(1);

		const played = await getMedia(attemptId);
		expect(played.status).toBe(200);
		expect(played.headers.get("content-type")).toBe("video/mp4");
		expect(played.headers.get("x-content-type-options")).toBe("nosniff");
		expect(played.headers.get("content-security-policy")).toContain("sandbox");
		expect(played.headers.get("cross-origin-resource-policy")).toBe(
			"same-site",
		);
		expect(played.headers.get("cache-control")).toBe("private, no-store");
		expect(played.headers.get("content-disposition")).toContain(
			"filename*=UTF-8''answer-v2.mp4",
		);
		const playedBytes = new Uint8Array(await played.arrayBuffer());
		expect(playedBytes).toEqual(bytesOf(3000, 7));

		const submitted = await submit(attemptId);
		expect(submitted.status).toBe(200);
		expect(await targetSubmittedAt("ca-s1")).not.toBeNull();

		const summary = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: OWNER,
		});
		const summaryBody = (await summary.json()) as QuizAttemptSummary;
		expect(summaryBody.skill).toBe("speaking");
		expect(summaryBody.media).toMatchObject({
			name: "answer-v2.mp4",
			type: "video/mp4",
			size: 3000,
		});
		expect(summaryBody.totalCount).toBe(0);

		const detail = await app.request(
			`/api/student/attempts/${attemptId}/detail`,
			{ headers: OWNER },
		);
		const detailBody = (await detail.json()) as QuizAttemptDetail;
		expect(detailBody.skill).toBe("speaking");
		expect(detailBody.media?.name).toBe("answer-v2.mp4");

		// Sau nộp: vẫn phát lại được, nhưng không thay/xoá được nữa.
		expect((await getMedia(attemptId)).status).toBe(200);
		const lateDelete = await deleteMedia(attemptId);
		expect(lateDelete.status).toBe(409);
		expect(await lateDelete.json()).toMatchObject({
			code: "ATTEMPT_SUBMITTED",
		});
	});

	test("speaking submit without media is rejected and never stamps the assignment target", async () => {
		const attemptId = await startAttempt("ca-s2");

		for (let round = 0; round < 2; round += 1) {
			const res = await submit(attemptId);
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({
				error: "media required",
				code: "MEDIA_REQUIRED",
			});
		}
		// Nhánh self-heal của submit không được chạy khi attempt còn in_progress.
		expect(await targetSubmittedAt("ca-s2")).toBeNull();

		expect((await putMedia(attemptId, bytesOf(100, 2))).status).toBe(200);
		const removed = await deleteMedia(attemptId);
		expect(removed.status).toBe(200);
		await settle();
		expect(
			[...memory.objects.keys()].some((key) => key.includes(attemptId)),
		).toBe(false);
		expect((await submit(attemptId)).status).toBe(400);

		// DELETE idempotent khi đã không còn file.
		expect((await deleteMedia(attemptId)).status).toBe(200);
		expect((await getMedia(attemptId)).status).toBe(404);

		const [attempt] = await libsql
			.select({ status: schema.quizAttempt.status })
			.from(schema.quizAttempt)
			.where(eq(schema.quizAttempt.id, attemptId));
		expect(attempt?.status).toBe("in_progress");
	});

	test("media upload guards reject before anything is stored", async () => {
		const attemptId = await startAttempt("ca-s3");
		const readingAttempt = await startAttempt("ca-r1");
		const before = memory.objects.size;
		const body = bytesOf(64, 3);

		const cases: Array<{
			name: string;
			res: () => Response | Promise<Response>;
			status: number;
			error?: string;
		}> = [
			{
				name: "missing Content-Length",
				res: () =>
					app.request(`/api/student/attempts/${attemptId}/media`, {
						method: "PUT",
						headers: {
							...OWNER,
							Origin: STUDENT_ORIGIN,
							"Content-Type": "audio/mpeg",
							"X-File-Name": "a.mp3",
						},
						body: new ReadableStream<Uint8Array>({
							start(controller) {
								controller.enqueue(body);
								controller.close();
							},
						}),
						duplex: "half",
						// workers-types không khai báo duplex (Node undici cần cho
						// stream body) — cast hẹp chỉ tại điểm xây request test.
					} as RequestInit & { duplex: "half" }),
				status: 411,
				error: "length required",
			},
			{
				name: "empty body",
				res: () => putMedia(attemptId, new Uint8Array(0)),
				status: 400,
				error: "empty file",
			},
			{
				name: "declared size above 50MB",
				res: () =>
					putMedia(attemptId, body, {
						"Content-Length": String(50 * 1024 * 1024 + 1),
					}),
				status: 413,
				error: "payload too large",
			},
			{
				name: "non-media content type",
				res: () =>
					putMedia(attemptId, body, { "Content-Type": "application/pdf" }),
				status: 415,
				error: "unsupported media type",
			},
			{
				name: "missing file name",
				res: () => putMedia(attemptId, body, { "X-File-Name": null }),
				status: 400,
				error: "invalid file name",
			},
			{
				name: "malformed URI file name",
				res: () => putMedia(attemptId, body, { "X-File-Name": "%E0%A4%A" }),
				status: 400,
				error: "invalid file name",
			},
			{
				name: "non-speaking paper",
				res: () => putMedia(readingAttempt, body),
				status: 400,
				error: "media not allowed",
			},
			{
				name: "same-org other student",
				res: () => putMedia(attemptId, body, { "x-test-user": "ambiguous" }),
				status: 404,
			},
			{
				name: "foreign origin",
				res: () =>
					putMedia(attemptId, body, { Origin: "https://evil.example" }),
				status: 403,
				error: "origin not allowed",
			},
			{
				name: "body longer than declared Content-Length",
				res: () =>
					putMedia(attemptId, bytesOf(20, 1), { "Content-Length": "10" }),
				status: 400,
				error: "size mismatch",
			},
		];

		for (const testCase of cases) {
			const res = await testCase.res();
			expect(res.status, testCase.name).toBe(testCase.status);
			if (testCase.error) {
				expect(
					((await res.json()) as { error: string }).error,
					testCase.name,
				).toBe(testCase.error);
			}
			await settle();
			expect(memory.objects.size, testCase.name).toBe(before);
		}
	});

	test("upload after submit is 409 ATTEMPT_SUBMITTED and leaves no object", async () => {
		const attemptId = await startAttempt("ca-s4");
		expect((await putMedia(attemptId, bytesOf(10, 1))).status).toBe(200);
		expect((await submit(attemptId)).status).toBe(200);
		await settle();
		const before = memory.objects.size;

		const late = await putMedia(attemptId, bytesOf(10, 2));
		expect(late.status).toBe(409);
		expect(await late.json()).toEqual({
			error: "attempt already submitted",
			code: "ATTEMPT_SUBMITTED",
		});
		await settle();
		expect(memory.objects.size).toBe(before);

		// Double submit sau khi đã nộp vẫn idempotent.
		expect((await submit(attemptId)).status).toBe(200);
	});

	test("reading summary reports its skill and no media", async () => {
		const [attempt] = await libsql
			.select({ id: schema.quizAttempt.id })
			.from(schema.quizAttempt)
			.where(eq(schema.quizAttempt.assignmentId, "ca-r1"));
		const attemptId = attempt?.id ?? "";
		expect((await submit(attemptId)).status).toBe(200);
		const summary = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: OWNER,
		});
		const body = (await summary.json()) as QuizAttemptSummary;
		expect(body.skill).toBe("reading");
		expect(body.media).toBeNull();
		expect(body.totalCount).toBe(1);
	});

	test("media routes return 503 without a media store", async () => {
		const attemptId = await startAttempt("ca-s3");
		const put = await putMedia(attemptId, bytesOf(5, 1), {}, appWithoutStore);
		expect(put.status).toBe(503);
		const del = await appWithoutStore.request(
			`/api/student/attempts/${attemptId}/media`,
			{ method: "DELETE", headers: { ...OWNER, Origin: STUDENT_ORIGIN } },
		);
		expect(del.status).toBe(503);
		const get = await appWithoutStore.request(
			`/api/student/attempts/${attemptId}/media`,
			{ headers: OWNER },
		);
		expect(get.status).toBe(503);
	});

	test("unauthenticated media requests return 401", async () => {
		for (const method of ["PUT", "DELETE", "GET"]) {
			const res = await app.request("/api/student/attempts/any/media", {
				method,
				headers:
					method === "GET"
						? {}
						: { Origin: STUDENT_ORIGIN, "Content-Type": "audio/mpeg" },
				...(method === "PUT" ? { body: bytesOf(4, 1) } : {}),
			});
			expect(res.status, method).toBe(401);
		}
	});

	test("POST/PATCH to a media path still go through the JSON guard", async () => {
		for (const method of ["POST", "PATCH"]) {
			const res = await app.request("/api/student/attempts/any/media", {
				method,
				headers: {
					...OWNER,
					Origin: STUDENT_ORIGIN,
					"Content-Type": "text/plain",
				},
				body: "hello",
			});
			expect(res.status, method).toBe(415);
		}
	});

	test("CORS preflight allows media upload headers for PUT and DELETE", async () => {
		for (const method of ["PUT", "DELETE"]) {
			const res = await app.request("/api/student/attempts/x/media", {
				method: "OPTIONS",
				headers: {
					Origin: STUDENT_ORIGIN,
					"Access-Control-Request-Method": method,
					"Access-Control-Request-Headers":
						"content-type,x-file-name,x-student-org-id",
				},
			});
			expect(res.headers.get("access-control-allow-origin")).toBe(
				STUDENT_ORIGIN,
			);
			const allowHeaders = (
				res.headers.get("access-control-allow-headers") ?? ""
			).toLowerCase();
			expect(allowHeaders).toContain("x-file-name");
			expect(allowHeaders).toContain("content-type");
			expect(allowHeaders).toContain("x-student-org-id");
			expect(res.headers.get("access-control-allow-methods")).toContain(method);
		}
	});

	test("PUT that loses the CAS to a concurrent change returns MEDIA_CONFLICT and discards its object", async () => {
		const attemptId = await startAttempt("ca-s5");
		expect((await putMedia(attemptId, bytesOf(10, 1))).status).toBe(200);
		await settle();
		const keysBefore = new Set(memory.objects.keys());

		// Tab khác thay file đúng lúc request này đã ghi object nhưng chưa CAS.
		memory.hooks.afterPut = async () => {
			await libsql
				.update(schema.quizAttempt)
				.set({ mediaKey: `quiz-media/org-1/${attemptId}/other-tab` })
				.where(eq(schema.quizAttempt.id, attemptId));
		};
		const res = await putMedia(attemptId, bytesOf(10, 9), {
			"X-File-Name": "late.mp3",
		});
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({
			error: "media changed",
			code: "MEDIA_CONFLICT",
		});
		await settle();
		// Object của request thua bị xoá; object cũ (DB đã rời đi) giữ nguyên
		// cho job đối chiếu — không có object mới nào sót lại.
		expect(new Set(memory.objects.keys())).toEqual(keysBefore);
	});

	test("media GET encodes the file name per RFC 8187", async () => {
		const id = await startAttempt("ca-s3");
		expect(
			(
				await putMedia(id, bytesOf(8, 4), {
					"X-File-Name": encodeURIComponent("it's (1).mp3"),
				})
			).status,
		).toBe(200);
		const res = await getMedia(id);
		expect(res.headers.get("content-disposition")).toBe(
			"inline; filename*=UTF-8''it%27s%20%281%29.mp3",
		);
	});

	test("PUT/DELETE outside the media route still go through the JSON guard", async () => {
		for (const method of ["PUT", "DELETE"]) {
			const res = await app.request("/api/student/attempts/any/answer", {
				method,
				headers: {
					...OWNER,
					Origin: STUDENT_ORIGIN,
					"Content-Type": "text/plain",
				},
				body: "hello",
			});
			expect(res.status, method).toBe(415);
		}
	});

	test("auto-graded take payload still withholds the teacher note", async () => {
		const take = await app.request("/api/student/assignments/ca-r1/quiz", {
			headers: OWNER,
		});
		const body = (await take.json()) as Record<string, unknown>;
		expect(body).not.toHaveProperty("note");
		expect(JSON.stringify(body)).not.toContain("chỉ lộ sau khi nộp");
	});
});
