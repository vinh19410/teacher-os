/**
 * Full-test builder route tests (phase-02 Task 2.1/2.2) — chạy qua real
 * handler chain (cors → bootstrap → origin guard → kernel → assignments)
 * từ buildApp; seam duy nhất là session lookup (giữ nguyên pattern
 * kernel.test.ts). Mọi round-trip đọc lại qua GET /api/kernel vì DTO map
 * field tường minh — "a missing entry silently drops the field".
 */

import { createClient } from "@libsql/client";
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db } from "../../app";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

interface TestSession {
	userId: string;
	userName: string;
	token: string;
}

interface CallOptions {
	method?: string;
	session?: TestSession;
	origin?: string | null;
	body?: unknown;
}

/** Test-app handles: session inserts, raw HTTP calls, snapshot reads. */
interface TestApp {
	insertUser(name: string): Promise<TestSession>;
	call(path: string, options?: CallOptions): Promise<Response>;
	kernel(session: TestSession): Promise<KernelSnapshot>;
	db: Db;
}

async function createTestApp(): Promise<TestApp> {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const db = libsql as unknown as Db;

	async function getSessionUser(headers: Headers) {
		const cookie = headers.get("cookie") ?? "";
		const token = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
		if (!token) return null;
		const [row] = await libsql
			.select({
				userId: authSession.userId,
				expiresAt: authSession.expiresAt,
				userName: authUser.name,
			})
			.from(authSession)
			.innerJoin(authUser, eq(authSession.userId, authUser.id))
			.where(eq(authSession.token, token));
		if (!row || row.expiresAt.getTime() <= Date.now()) return null;
		return {
			userId: row.userId,
			userName: row.userName,
			role: "teacher" as const,
		};
	}

	const app = buildApp({
		getDb: () => db,
		corsOrigin: CORS_ORIGIN,
		getSessionUser,
		authHandler: () => new Response("auth stub", { status: 404 }),
	});

	async function insertUser(name: string): Promise<TestSession> {
		const userId = crypto.randomUUID();
		const token = crypto.randomUUID();
		await libsql
			.insert(authUser)
			.values({ id: userId, name, email: `${userId}@test.local` });
		await libsql.insert(authSession).values({
			id: crypto.randomUUID(),
			expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
			token,
			userId,
		});
		return { userId, userName: name, token };
	}

	async function call(path: string, options: CallOptions = {}) {
		const headers: Record<string, string> = {};
		if (options.session)
			headers.cookie = `better-auth.session_token=${options.session.token}`;
		if (options.origin !== null) headers.origin = options.origin ?? CORS_ORIGIN;
		if (options.body !== undefined)
			headers["content-type"] = "application/json";
		return app.request(path, {
			method: options.method ?? "GET",
			headers,
			body:
				options.body !== undefined ? JSON.stringify(options.body) : undefined,
		});
	}

	async function kernel(session: TestSession): Promise<KernelSnapshot> {
		const res = await call("/api/kernel", { session });
		expect(res.status).toBe(200);
		return (await res.json()) as KernelSnapshot;
	}

	return { insertUser, call, kernel, db };
}

/** Full prompt-bank body (create schema là .strict()) với override. */
function promptBody(overrides: Record<string, unknown>) {
	return {
		skill: "reading",
		part: "p1",
		type: "tfng",
		title: "Reading Passage 1",
		band: "7.0",
		source: "Cambridge IELTS 12",
		prompt: "",
		passage: "A passage about early railways.",
		intro: "",
		transcript: "",
		cueTopic: "",
		cuePoints: "",
		audioName: "",
		imageUrl: "",
		questions: [{ stem: "Railways appeared before cars.", answer: "TRUE" }],
		optionBank: [],
		note: "",
		status: "draft",
		...overrides,
	};
}

async function createPrompt(
	t: TestApp,
	session: TestSession,
	overrides: Record<string, unknown>,
): Promise<string> {
	const res = await t.call("/api/assignments/prompts", {
		session,
		method: "POST",
		body: promptBody(overrides),
	});
	expect(res.status).toBe(201);
	const { id } = (await res.json()) as { id: string };
	return id;
}
async function getOrgId(t: TestApp, session: TestSession): Promise<string> {
	const [membershipRow] = await t.db
		.select({ orgId: schema.membership.orgId })
		.from(schema.membership)
		.where(eq(schema.membership.userId, session.userId));
	if (!membershipRow) throw new Error("membership not found");
	return membershipRow.orgId;
}

async function createStudent(t: TestApp, orgId: string): Promise<string> {
	const studentId = crypto.randomUUID();
	await t.db.insert(schema.student).values({
		id: studentId,
		orgId,
		name: "Học viên Test",
	});
	return studentId;
}

async function createPracticeAttempt(
	t: TestApp,
	options: {
		orgId: string;
		testId: string;
		studentId: string;
		status?: "in_progress" | "submitted";
	},
): Promise<string> {
	const attemptId = crypto.randomUUID();
	await t.db.insert(schema.quizAttempt).values({
		id: attemptId,
		orgId: options.orgId,
		studentId: options.studentId,
		testId: options.testId,
		mode: "practice",
		status: options.status ?? "submitted",
		questionsSnapshot: "[]",
		answers: "{}",
	});
	return attemptId;
}

describe("assignment tests routes (full-test builder)", () => {
	let t: TestApp;
	let orgA: TestSession;
	let orgB: TestSession;
	let readingP1: string;
	let readingP1Alt: string;
	let readingP2: string;
	let writingTask2: string;

	beforeAll(async () => {
		t = await createTestApp();
		orgA = await t.insertUser("Giáo viên test A");
		orgB = await t.insertUser("Giáo viên test B");
		// Bootstrap org + membership — bootstrapMiddleware chạy trên /api/*,
		// readyz nằm ngoài /api nên warm-up bằng GET /api/kernel.
		for (const session of [orgA, orgB]) {
			await t.kernel(session);
		}
		readingP1 = await createPrompt(t, orgA, {});
		readingP1Alt = await createPrompt(t, orgA, {
			title: "Reading Passage 1 Alt",
		});
		readingP2 = await createPrompt(t, orgA, {
			part: "p2",
			type: "headings",
			title: "Reading Passage 2",
			questions: [{ stem: "Choose the correct heading.", answer: "" }],
		});
		writingTask2 = await createPrompt(t, orgA, {
			skill: "writing",
			part: "task2",
			type: "discuss",
			title: "Writing Task 2",
			prompt: "Some people think…",
			passage: "",
			questions: [],
		});
	});

	test("CRUD round-trips every field through the kernel snapshot", async () => {
		const created = await t.call("/api/assignments/tests", {
			session: orgA,
			method: "POST",
			body: {
				title: "IELTS Reading Full Test 5",
				description: "Bộ đề đọc full 3 passage",
				skill: "reading",
				timeLimitSeconds: 3600,
				collection: "Cambridge IELTS 12",
				testGroup: "TEST 5",
			},
		});
		expect(created.status).toBe(201);
		const { id } = (await created.json()) as { id: string };

		let snapshot = await t.kernel(orgA);
		let row = snapshot.assignmentTests.find((r) => r.id === id);
		expect(row).toMatchObject({
			id,
			title: "IELTS Reading Full Test 5",
			description: "Bộ đề đọc full 3 passage",
			skill: "reading",
			timeLimitSeconds: 3600,
			collection: "Cambridge IELTS 12",
			testGroup: "TEST 5",
			status: "draft",
		});
		expect(row?.parts).toEqual([]);

		// Ghép parts theo thứ tự ngược preset — position phải ra p1=0, p2=1.
		const putParts = await t.call(`/api/assignments/tests/${id}/parts`, {
			session: orgA,
			method: "PUT",
			body: [
				{ part: "p2", promptId: readingP2 },
				{ part: "p1", promptId: readingP1, qStartOverride: 14 },
			],
		});
		expect(putParts.status).toBe(200);
		snapshot = await t.kernel(orgA);
		row = snapshot.assignmentTests.find((r) => r.id === id);
		expect(row?.parts).toEqual([
			{
				testId: id,
				promptId: readingP1,
				part: "p1",
				position: 0,
				qStartOverride: 14,
			},
			{
				testId: id,
				promptId: readingP2,
				part: "p2",
				position: 1,
				qStartOverride: null,
			},
		]);

		const patched = await t.call(`/api/assignments/tests/${id}`, {
			session: orgA,
			method: "PATCH",
			body: { title: "Reading Test 5 — bản sửa", status: "ready" },
		});
		expect(patched.status).toBe(200);
		snapshot = await t.kernel(orgA);
		row = snapshot.assignmentTests.find((r) => r.id === id);
		expect(row).toMatchObject({
			title: "Reading Test 5 — bản sửa",
			status: "ready",
		});
		// PATCH meta không đụng parts.
		expect(row?.parts.length).toBe(2);

		const removed = await t.call(`/api/assignments/tests/${id}`, {
			session: orgA,
			method: "DELETE",
		});
		expect(removed.status).toBe(200);
		snapshot = await t.kernel(orgA);
		expect(snapshot.assignmentTests.find((r) => r.id === id)).toBeUndefined();
	});

	test("PUT parts with two parts in the same slot is rejected 400", async () => {
		const created = await t.call("/api/assignments/tests", {
			session: orgA,
			method: "POST",
			body: { title: "Dup slot", skill: "reading", timeLimitSeconds: null },
		});
		const { id } = (await created.json()) as { id: string };
		const res = await t.call(`/api/assignments/tests/${id}/parts`, {
			session: orgA,
			method: "PUT",
			body: [
				{ part: "p1", promptId: readingP1 },
				{ part: "p1", promptId: readingP2 },
			],
		});
		expect(res.status).toBe(400);
	});

	test("PUT parts with a wrong-skill prompt is rejected 400", async () => {
		const created = await t.call("/api/assignments/tests", {
			session: orgA,
			method: "POST",
			body: {
				title: "Skill mismatch",
				skill: "reading",
				timeLimitSeconds: null,
			},
		});
		const { id } = (await created.json()) as { id: string };
		const res = await t.call(`/api/assignments/tests/${id}/parts`, {
			session: orgA,
			method: "PUT",
			body: [{ part: "p1", promptId: writingTask2 }],
		});
		expect(res.status).toBe(400);
	});

	test("PUT parts cannot reference a prompt of another org (IDOR)", async () => {
		const foreignPrompt = await createPrompt(t, orgB, {
			title: "Prompt của org B",
		});
		const created = await t.call("/api/assignments/tests", {
			session: orgA,
			method: "POST",
			body: { title: "IDOR", skill: "reading", timeLimitSeconds: null },
		});
		const { id } = (await created.json()) as { id: string };
		const res = await t.call(`/api/assignments/tests/${id}/parts`, {
			session: orgA,
			method: "PUT",
			body: [{ part: "p1", promptId: foreignPrompt }],
		});
		expect(res.status).toBe(400);
	});

	test("unauthenticated requests are rejected 401", async () => {
		const post = await t.call("/api/assignments/tests", {
			method: "POST",
			body: { title: "No auth", skill: "reading", timeLimitSeconds: null },
		});
		expect(post.status).toBe(401);
		const put = await t.call("/api/assignments/tests/any/parts", {
			method: "PUT",
			body: [],
		});
		expect(put.status).toBe(401);
	});
	describe("PUT /api/assignments/tests/:id/parts — test parts lock theo quiz_attempt (#633)", () => {
		let testId: string;
		let orgAId: string;
		let studentAId: string;
		let initialPartRows: Array<{
			id: string;
			part: string;
			promptId: string;
			qStartOverride: number | null;
		}>;

		beforeAll(async () => {
			orgAId = await getOrgId(t, orgA);
			studentAId = await createStudent(t, orgAId);
		});

		test("đổi prompt khi có attempt submitted → 409 TEST_PARTS_LOCKED, DB không đổi", async () => {
			const post = await t.call("/api/assignments/tests", {
				session: orgA,
				method: "POST",
				body: {
					title: "Test đã có attempt",
					skill: "reading",
					timeLimitSeconds: null,
				},
			});
			expect(post.status).toBe(201);
			const postJson = (await post.json()) as { id: string };
			testId = postJson.id;

			// Gán part ban đầu: p1 -> readingP1
			const putInitial = await t.call(
				`/api/assignments/tests/${testId}/parts`,
				{
					session: orgA,
					method: "PUT",
					body: [{ part: "p1", promptId: readingP1 }],
				},
			);
			expect(putInitial.status).toBe(200);

			initialPartRows = await t.db
				.select({
					id: schema.assignmentTestPart.id,
					part: schema.assignmentTestPart.part,
					promptId: schema.assignmentTestPart.promptId,
					qStartOverride: schema.assignmentTestPart.qStartOverride,
				})
				.from(schema.assignmentTestPart)
				.where(eq(schema.assignmentTestPart.testId, testId))
				.orderBy(schema.assignmentTestPart.part);
			expect(initialPartRows.length).toBe(1);

			// Tạo attempt submitted
			await createPracticeAttempt(t, {
				orgId: orgAId,
				studentId: studentAId,
				testId,
				status: "submitted",
			});

			// Đổi p1 -> readingP2: phải bị 409 TEST_PARTS_LOCKED
			const putChange = await t.call(`/api/assignments/tests/${testId}/parts`, {
				session: orgA,
				method: "PUT",
				body: [{ part: "p1", promptId: readingP1Alt }],
			});
			expect(putChange.status).toBe(409);
			expect(await putChange.json()).toMatchObject({
				error: "test parts locked",
				code: "TEST_PARTS_LOCKED",
			});

			// Kiểm tra DB giữ nguyên bản ghi cũ (cùng id)
			const currentPartRows = await t.db
				.select({
					id: schema.assignmentTestPart.id,
					part: schema.assignmentTestPart.part,
					promptId: schema.assignmentTestPart.promptId,
					qStartOverride: schema.assignmentTestPart.qStartOverride,
				})
				.from(schema.assignmentTestPart)
				.where(eq(schema.assignmentTestPart.testId, testId))
				.orderBy(schema.assignmentTestPart.part);
			expect(currentPartRows).toEqual(initialPartRows);
		});

		test("đổi prompt khi có attempt in_progress → 409 TEST_PARTS_LOCKED", async () => {
			const post = await t.call("/api/assignments/tests", {
				session: orgA,
				method: "POST",
				body: {
					title: "Test attempt in_progress",
					skill: "reading",
					timeLimitSeconds: null,
				},
			});
			const tid = ((await post.json()) as { id: string }).id;

			await t.call(`/api/assignments/tests/${tid}/parts`, {
				session: orgA,
				method: "PUT",
				body: [{ part: "p1", promptId: readingP1 }],
			});

			await createPracticeAttempt(t, {
				orgId: orgAId,
				studentId: studentAId,
				testId: tid,
				status: "in_progress",
			});

			const res = await t.call(`/api/assignments/tests/${tid}/parts`, {
				session: orgA,
				method: "PUT",
				body: [{ part: "p1", promptId: readingP1Alt }],
			});
			expect(res.status).toBe(409);
			expect(await res.json()).toMatchObject({
				code: "TEST_PARTS_LOCKED",
			});
		});

		test("gỡ part khi có attempt → 409 TEST_PARTS_LOCKED", async () => {
			// testId đã có attempt: gửi rỗng [] để gỡ part
			const res = await t.call(`/api/assignments/tests/${testId}/parts`, {
				session: orgA,
				method: "PUT",
				body: [],
			});
			expect(res.status).toBe(409);
			expect(await res.json()).toMatchObject({
				code: "TEST_PARTS_LOCKED",
			});
		});

		test("thêm part khi có attempt → 409 TEST_PARTS_LOCKED", async () => {
			// testId đang có 1 part (p1): thêm p2
			const res = await t.call(`/api/assignments/tests/${testId}/parts`, {
				session: orgA,
				method: "PUT",
				body: [
					{ part: "p1", promptId: readingP1 },
					{ part: "p2", promptId: readingP2 },
				],
			});
			expect(res.status).toBe(409);
			expect(await res.json()).toMatchObject({
				code: "TEST_PARTS_LOCKED",
			});
		});

		test("đổi qStartOverride khi có attempt → 409 TEST_PARTS_LOCKED", async () => {
			// testId đang có p1 với qStartOverride = null: đổi thành 15
			const res = await t.call(`/api/assignments/tests/${testId}/parts`, {
				session: orgA,
				method: "PUT",
				body: [{ part: "p1", promptId: readingP1, qStartOverride: 15 }],
			});
			expect(res.status).toBe(409);
			expect(await res.json()).toMatchObject({
				code: "TEST_PARTS_LOCKED",
			});
		});

		test("gửi lại danh sách part giống hệt khi có attempt → 200 idempotent không đổi row ID", async () => {
			// Tạo test 2 parts
			const post = await t.call("/api/assignments/tests", {
				session: orgA,
				method: "POST",
				body: {
					title: "Test 2 parts idempotent",
					skill: "reading",
					timeLimitSeconds: null,
				},
			});
			const postJson = (await post.json()) as { id: string };
			const tid = postJson.id;

			await t.call(`/api/assignments/tests/${tid}/parts`, {
				session: orgA,
				method: "PUT",
				body: [
					{ part: "p1", promptId: readingP1 },
					{ part: "p2", promptId: readingP2, qStartOverride: 14 },
				],
			});

			const beforeRows = await t.db
				.select({
					id: schema.assignmentTestPart.id,
					part: schema.assignmentTestPart.part,
					promptId: schema.assignmentTestPart.promptId,
					qStartOverride: schema.assignmentTestPart.qStartOverride,
				})
				.from(schema.assignmentTestPart)
				.where(eq(schema.assignmentTestPart.testId, tid))
				.orderBy(schema.assignmentTestPart.part);
			expect(beforeRows.length).toBe(2);

			await createPracticeAttempt(t, {
				orgId: orgAId,
				studentId: studentAId,
				testId: tid,
			});

			// Gửi lại giống hệt nhưng đảo thứ tự mảng và qStartOverride: undefined thay vì null
			const putSame = await t.call(`/api/assignments/tests/${tid}/parts`, {
				session: orgA,
				method: "PUT",
				body: [
					{ part: "p2", promptId: readingP2, qStartOverride: 14 },
					{ part: "p1", promptId: readingP1 }, // qStartOverride undefined
				],
			});
			expect(putSame.status).toBe(200);

			const afterRows = await t.db
				.select({
					id: schema.assignmentTestPart.id,
					part: schema.assignmentTestPart.part,
					promptId: schema.assignmentTestPart.promptId,
					qStartOverride: schema.assignmentTestPart.qStartOverride,
				})
				.from(schema.assignmentTestPart)
				.where(eq(schema.assignmentTestPart.testId, tid))
				.orderBy(schema.assignmentTestPart.part);
			expect(afterRows).toEqual(beforeRows);
		});

		test("test chưa có bài làm vẫn đổi part bình thường (200)", async () => {
			const post = await t.call("/api/assignments/tests", {
				session: orgA,
				method: "POST",
				body: {
					title: "Test chưa có attempt",
					skill: "reading",
					timeLimitSeconds: null,
				},
			});
			const postJson = (await post.json()) as { id: string };
			const tid = postJson.id;

			const put1 = await t.call(`/api/assignments/tests/${tid}/parts`, {
				session: orgA,
				method: "PUT",
				body: [{ part: "p1", promptId: readingP1 }],
			});
			expect(put1.status).toBe(200);

			const put2 = await t.call(`/api/assignments/tests/${tid}/parts`, {
				session: orgA,
				method: "PUT",
				body: [{ part: "p1", promptId: readingP1Alt }],
			});
			expect(put2.status).toBe(200);
		});

		test("org khác có attempt trùng testId không gây khóa test của org hiện tại", async () => {
			const post = await t.call("/api/assignments/tests", {
				session: orgA,
				method: "POST",
				body: {
					title: "Test org isolation",
					skill: "reading",
					timeLimitSeconds: null,
				},
			});
			const postJson = (await post.json()) as { id: string };
			const tid = postJson.id;

			await t.call(`/api/assignments/tests/${tid}/parts`, {
				session: orgA,
				method: "PUT",
				body: [{ part: "p1", promptId: readingP1 }],
			});

			const orgBId = await getOrgId(t, orgB);
			const studentBId = await createStudent(t, orgBId);
			// Tạo attempt thuộc orgB gắn với tid này
			await createPracticeAttempt(t, {
				orgId: orgBId,
				studentId: studentBId,
				testId: tid,
			});

			// orgA đổi part vẫn thành công vì attempt không thuộc orgA
			const res = await t.call(`/api/assignments/tests/${tid}/parts`, {
				session: orgA,
				method: "PUT",
				body: [{ part: "p1", promptId: readingP1Alt }],
			});
			expect(res.status).toBe(200);
		});

		test("hồi quy: gỡ part trên test có attempt bị từ chối 409 và PATCH đổi nội dung prompt đó vẫn bị 409 PROMPT_CONTENT_LOCKED (#630 + #633)", async () => {
			const promptToLock = await createPrompt(t, orgA, {
				title: "Prompt trong test có attempt",
				passage: "Nội dung ban đầu",
			});
			const post = await t.call("/api/assignments/tests", {
				session: orgA,
				method: "POST",
				body: {
					title: "Test chứa prompt cần khóa",
					skill: "reading",
					timeLimitSeconds: null,
				},
			});
			const postJson = (await post.json()) as { id: string };
			const tid = postJson.id;

			const put = await t.call(`/api/assignments/tests/${tid}/parts`, {
				session: orgA,
				method: "PUT",
				body: [{ part: "p1", promptId: promptToLock }],
			});
			expect(put.status).toBe(200);

			await createPracticeAttempt(t, {
				orgId: orgAId,
				studentId: studentAId,
				testId: tid,
			});

			// Cố tình gỡ part ra khỏi test
			const putRemove = await t.call(`/api/assignments/tests/${tid}/parts`, {
				session: orgA,
				method: "PUT",
				body: [],
			});
			expect(putRemove.status).toBe(409);
			expect(await putRemove.json()).toMatchObject({
				code: "TEST_PARTS_LOCKED",
			});

			// Thử đổi nội dung prompt đã gắn test đó: vẫn phải bị 409 PROMPT_CONTENT_LOCKED
			const patchPrompt = await t.call(
				`/api/assignments/prompts/${promptToLock}`,
				{
					session: orgA,
					method: "PATCH",
					body: {
						passage: "Cố tình sửa nội dung sau khi gỡ part thất bại",
					},
				},
			);
			expect(patchPrompt.status).toBe(409);
			expect(await patchPrompt.json()).toMatchObject({
				code: "PROMPT_CONTENT_LOCKED",
			});
		});
	});
});

describe("PATCH /assignments/prompts/:id (full-test builder phase-2)", () => {
	let t: TestApp;
	let orgA: TestSession;
	let orgB: TestSession;

	beforeAll(async () => {
		t = await createTestApp();
		orgA = await t.insertUser("Giáo viên patch A");
		orgB = await t.insertUser("Giáo viên patch B");
		for (const session of [orgA, orgB]) {
			await t.kernel(session);
		}
	});

	test("PATCH round-trips a changed question answer via the snapshot", async () => {
		const promptId = await createPrompt(t, orgA, {});
		const res = await t.call(`/api/assignments/prompts/${promptId}`, {
			session: orgA,
			method: "PATCH",
			body: {
				questions: [
					{ stem: "Railways appeared before cars.", answer: "FALSE" },
				],
				note: "đã sửa đáp án",
			},
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ id: promptId });

		const snapshot = await t.kernel(orgA);
		const row = snapshot.assignmentPrompts.find((r) => r.id === promptId);
		expect(row?.questions[0]?.answer).toBe("FALSE");
		expect(row?.note).toBe("đã sửa đáp án");
	});

	test("PATCH re-derives legacy genre on type change, task stays put", async () => {
		const promptId = await createPrompt(t, orgA, {
			skill: "writing",
			part: "task2",
			type: "discuss",
			title: "Writing Task 2 genre",
			prompt: "Some people think…",
			passage: "",
			questions: [],
		});
		const res = await t.call(`/api/assignments/prompts/${promptId}`, {
			session: orgA,
			method: "PATCH",
			body: { type: "opinion" },
		});
		expect(res.status).toBe(200);
		const snapshot = await t.kernel(orgA);
		const row = snapshot.assignmentPrompts.find((r) => r.id === promptId);
		expect(row?.type).toBe("opinion");
		expect(row?.genre).toBe("opinion");
		expect(row?.task).toBe("task2");
	});

	test("PATCH rejects invalid bodies with 400", async () => {
		const promptId = await createPrompt(t, orgA, {});
		// skill/part immutable tại contract (omit khỏi update schema; strict
		// chặn key lạ), title rỗng vi phạm min(1), status lạ ngoài enum.
		for (const body of [
			{ skill: "writing" },
			{ part: "p2" },
			{ title: "" },
			{ status: "archived" },
		]) {
			const res = await t.call(`/api/assignments/prompts/${promptId}`, {
				session: orgA,
				method: "PATCH",
				body,
			});
			expect(res.status).toBe(400);
		}
	});

	test("PATCH on another org's prompt is 404 and empty patch is a no-op 200", async () => {
		const foreignPrompt = await createPrompt(t, orgB, {});
		const res = await t.call(`/api/assignments/prompts/${foreignPrompt}`, {
			session: orgA,
			method: "PATCH",
			body: { title: "đánh cắp" },
		});
		expect(res.status).toBe(404);

		const ownPrompt = await createPrompt(t, orgA, {});
		const noop = await t.call(`/api/assignments/prompts/${ownPrompt}`, {
			session: orgA,
			method: "PATCH",
			body: {},
		});
		expect(noop.status).toBe(200);
	});

	test("PATCH validates type according to effective status (#577)", async () => {
		const draftPromptId = await createPrompt(t, orgA, {
			skill: "writing",
			part: "task2",
			type: "",
			status: "draft",
			title: "Writing Draft No Type",
			prompt: "Essay prompt",
			passage: "",
			questions: [],
		});

		// 1. Chuyển sang ready khi type vẫn rỗng -> 400
		const resReadyEmpty = await t.call(
			`/api/assignments/prompts/${draftPromptId}`,
			{
				session: orgA,
				method: "PATCH",
				body: { status: "ready" },
			},
		);
		expect(resReadyEmpty.status).toBe(400);

		// 2. Chuyển sang ready kèm type hợp lệ -> 200
		const resReadyValid = await t.call(
			`/api/assignments/prompts/${draftPromptId}`,
			{
				session: orgA,
				method: "PATCH",
				body: { status: "ready", type: "opinion" },
			},
		);
		expect(resReadyValid.status).toBe(200);

		// 3. Đang ở ready mà gửi type rỗng -> 400
		const resReadyClearType = await t.call(
			`/api/assignments/prompts/${draftPromptId}`,
			{
				session: orgA,
				method: "PATCH",
				body: { type: "" },
			},
		);
		expect(resReadyClearType.status).toBe(400);

		// 4. Gửi type rác ngoài catalog -> 400
		const resInvalidType = await t.call(
			`/api/assignments/prompts/${draftPromptId}`,
			{
				session: orgA,
				method: "PATCH",
				body: { type: "unknown_type" },
			},
		);
		expect(resInvalidType.status).toBe(400);
	});
});
