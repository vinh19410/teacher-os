import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	ASSIGNMENT_PART_TYPES,
	ASSIGNMENT_PROMPT_ERROR_CODES,
} from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../../app";
import { createFakeAiGrader } from "../../lib/ai-grading/fake-grader";
import type { SessionUser } from "../../session";

const CORS_ORIGINS = ["http://localhost:8001", "http://localhost:8003"];
const TEACHER_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../../packages/db/src/migrations", import.meta.url).href,
);

const TEACHER_1 = { "x-test-user": "teacher-1" };
const TA_1 = { "x-test-user": "ta-1" };
const TEACHER_2 = { "x-test-user": "teacher-2" };

const sessionFor = async (headers: Headers): Promise<SessionUser | null> => {
	const key = headers.get("x-test-user");
	if (key === "teacher-1") {
		return { userId: "t-1", userName: "Cô Mỹ", role: "teacher" };
	}
	if (key === "ta-1") {
		return { userId: "ta-1", userName: "Trợ giảng", role: "teacher" };
	}
	if (key === "teacher-2") {
		return { userId: "t-2", userName: "Thầy An", role: "teacher" };
	}
	return null;
};

const vocabPart = ASSIGNMENT_PART_TYPES.vocabulary.parts[0] ?? "topic";
const vocabType =
	ASSIGNMENT_PART_TYPES.vocabulary.types[vocabPart]?.[0] ?? "mcq";
const readingPart = ASSIGNMENT_PART_TYPES.reading.parts[0] ?? "p1";
const readingType =
	ASSIGNMENT_PART_TYPES.reading.types[readingPart]?.[0] ?? "tfng";

describe("DELETE /api/assignments/prompts/:id — xóa bản nháp nguyên tử", () => {
	let app: ServerApp;
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const rawDb = drizzle(client, { schema });
		await migrate(rawDb, { migrationsFolder: MIGRATIONS_DIR });
		db = rawDb as unknown as Db;

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Ms My IELTS" },
			{ id: "org-2", name: "Other Org" },
		]);
		await db.insert(schema.user).values([
			{ id: "t-1", name: "Cô Mỹ", email: "my@test.local", role: "teacher" },
			{
				id: "ta-1",
				name: "Trợ giảng",
				email: "ta@test.local",
				role: "teacher",
			},
			{ id: "t-2", name: "Thầy An", email: "an@test.local", role: "teacher" },
		]);
		await db.insert(schema.membership).values([
			{ id: "mem-1", orgId: "org-1", userId: "t-1", role: "teacher" },
			{ id: "mem-ta", orgId: "org-1", userId: "ta-1", role: "ta" },
			{ id: "mem-2", orgId: "org-2", userId: "t-2", role: "teacher" },
		]);
		await db.insert(schema.student).values({
			id: "st-1",
			orgId: "org-1",
			name: "Minh",
			email: "minh@test.local",
			phone: "0901111111",
		});
		await db.insert(schema.classTable).values({
			id: "cls-1",
			orgId: "org-1",
			name: "IELTS 6.5",
			level: "IELTS 6.0–6.5",
			mode: "Online",
			schedule: "T3 & T6 19:00–20:30",
			sessionsDone: 0,
			sessionsTotal: 20,
			status: "active",
		});
		await db.insert(schema.enrollment).values({
			id: "enr-1",
			orgId: "org-1",
			classId: "cls-1",
			studentId: "st-1",
			status: "active",
		});

		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: sessionFor,
			authHandler: () => new Response("ok"),
			getAiGrader: () => createFakeAiGrader(),
		});
	});

	async function callAs(
		userHeaders: Record<string, string>,
		path: string,
		method = "GET",
		body?: unknown,
	) {
		const headers: Record<string, string> = {
			...userHeaders,
			origin: TEACHER_ORIGIN,
		};
		let payload: string | undefined;
		if (body !== undefined) {
			headers["content-type"] = "application/json";
			payload = JSON.stringify(body);
		}
		return app.request(path, { method, headers, body: payload });
	}

	async function createPrompt(
		userHeaders: Record<string, string>,
		overrides: Record<string, unknown> = {},
	): Promise<string> {
		const res = await callAs(userHeaders, "/api/assignments/prompts", "POST", {
			skill: "vocabulary",
			part: vocabPart,
			type: vocabType,
			title: "Vocab draft delete test",
			band: "6.5",
			source: "Unit 1",
			prompt: "",
			passage: "",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			questions: [
				{
					stem: "Q1: choose synonym",
					opts: ["a", "b", "c", "d"],
					answer: "B",
					alts: "",
				},
			],
			optionBank: [],
			note: "",
			status: "draft",
			...overrides,
		});
		expect(res.status).toBe(201);
		const json = (await res.json()) as { id: string };
		return json.id;
	}

	test("deletes an unreferenced org draft and returns 200 { id }", async () => {
		const promptId = await createPrompt(TEACHER_1, { status: "draft" });
		const delRes = await callAs(
			TEACHER_1,
			`/api/assignments/prompts/${promptId}`,
			"DELETE",
		);
		expect(delRes.status).toBe(200);
		expect(await delRes.json()).toEqual({ id: promptId });

		const rows = await db
			.select({ id: schema.assignmentPrompt.id })
			.from(schema.assignmentPrompt)
			.where(eq(schema.assignmentPrompt.id, promptId));
		expect(rows).toHaveLength(0);
	});

	test("forbids ta role from deleting a draft (403)", async () => {
		const promptId = await createPrompt(TEACHER_1, { status: "draft" });
		const delRes = await callAs(
			TA_1,
			`/api/assignments/prompts/${promptId}`,
			"DELETE",
		);
		expect(delRes.status).toBe(403);
		const rows = await db
			.select({ id: schema.assignmentPrompt.id })
			.from(schema.assignmentPrompt)
			.where(eq(schema.assignmentPrompt.id, promptId));
		expect(rows).toHaveLength(1);
	});

	test("returns 404 for unknown id, other org, libraryRef, or demo prompt", async () => {
		const unknownRes = await callAs(
			TEACHER_1,
			"/api/assignments/prompts/missing-id",
			"DELETE",
		);
		expect(unknownRes.status).toBe(404);

		const org2PromptId = await createPrompt(TEACHER_2, { status: "draft" });
		const crossOrgRes = await callAs(
			TEACHER_1,
			`/api/assignments/prompts/${org2PromptId}`,
			"DELETE",
		);
		expect(crossOrgRes.status).toBe(404);

		await db.insert(schema.assignmentPrompt).values({
			id: "lib-draft-1",
			orgId: "org-1",
			task: "task2",
			genre: "",
			skill: "writing",
			part: "task2",
			type: "discuss",
			title: "Library ref draft",
			band: "7.0",
			source: "",
			prompt: "<p>Prompt</p>",
			status: "draft",
			libraryRef: "lib-item-1",
		});
		const libRes = await callAs(
			TEACHER_1,
			"/api/assignments/prompts/lib-draft-1",
			"DELETE",
		);
		expect(libRes.status).toBe(404);

		await db.insert(schema.assignmentPrompt).values({
			id: "demo-prompt:1",
			orgId: "org-1",
			task: "task2",
			genre: "",
			skill: "writing",
			part: "task2",
			type: "discuss",
			title: "Demo draft",
			band: "7.0",
			source: "",
			prompt: "<p>Prompt</p>",
			status: "draft",
		});
		const demoRes = await callAs(
			TEACHER_1,
			"/api/assignments/prompts/demo-prompt:1",
			"DELETE",
		);
		expect(demoRes.status).toBe(404);
	});

	test("rejects ready prompts with 409 PROMPT_DELETE_NOT_DRAFT", async () => {
		const promptId = await createPrompt(TEACHER_1, { status: "ready" });
		const delRes = await callAs(
			TEACHER_1,
			`/api/assignments/prompts/${promptId}`,
			"DELETE",
		);
		expect(delRes.status).toBe(409);
		const body = (await delRes.json()) as { code?: string };
		expect(body.code).toBe(ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_NOT_DRAFT);

		const rows = await db
			.select({ id: schema.assignmentPrompt.id })
			.from(schema.assignmentPrompt)
			.where(eq(schema.assignmentPrompt.id, promptId));
		expect(rows).toHaveLength(1);
	});

	test("rejects flipped draft referenced by class_assignment and preserves student targets (409 PROMPT_DELETE_REFERENCED)", async () => {
		const promptId = await createPrompt(TEACHER_1, { status: "ready" });
		const assignRes = await callAs(
			TEACHER_1,
			"/api/classes/cls-1/assignments",
			"POST",
			{
				promptId,
				due: "2099-12-20",
				note: "",
				studentIds: ["st-1"],
			},
		);
		expect(assignRes.status).toBe(201);
		const { id: caId } = (await assignRes.json()) as { id: string };

		// Flip ready -> draft via PATCH
		const patchRes = await callAs(
			TEACHER_1,
			`/api/assignments/prompts/${promptId}`,
			"PATCH",
			{ status: "draft" },
		);
		expect(patchRes.status).toBe(200);

		// Attempting delete MUST NOT cascade-delete class_assignment or targets
		const delRes = await callAs(
			TEACHER_1,
			`/api/assignments/prompts/${promptId}`,
			"DELETE",
		);
		expect(delRes.status).toBe(409);
		const body = (await delRes.json()) as { code?: string };
		expect(body.code).toBe(ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_REFERENCED);

		const [caRow] = await db
			.select({ id: schema.classAssignment.id })
			.from(schema.classAssignment)
			.where(eq(schema.classAssignment.id, caId));
		expect(caRow?.id).toBe(caId);

		const targets = await db
			.select({ id: schema.classAssignmentTarget.id })
			.from(schema.classAssignmentTarget)
			.where(eq(schema.classAssignmentTarget.assignmentId, caId));
		expect(targets).toHaveLength(1);
	});

	test("rejects draft referenced by assignment_test_part (409 PROMPT_DELETE_REFERENCED)", async () => {
		const promptId = await createPrompt(TEACHER_1, {
			skill: "reading",
			part: readingPart,
			type: readingType,
			passage: "<p>Reading passage</p>",
			questions: [{ stem: "Q1", opts: null, answer: "TRUE", alts: "" }],
			status: "draft",
		});
		const testId = "test-ref-1";
		await db.insert(schema.assignmentTest).values({
			id: testId,
			orgId: "org-1",
			title: "Full test ref",
			skill: "reading",
			status: "draft",
		});
		await db.insert(schema.assignmentTestPart).values({
			id: "atp-ref-1",
			testId,
			promptId,
			part: readingPart,
			position: 0,
		});

		const delRes = await callAs(
			TEACHER_1,
			`/api/assignments/prompts/${promptId}`,
			"DELETE",
		);
		expect(delRes.status).toBe(409);
		const body = (await delRes.json()) as { code?: string };
		expect(body.code).toBe(ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_REFERENCED);
	});

	test("rejects draft referenced by study_pack_item (409 PROMPT_DELETE_REFERENCED)", async () => {
		const promptId = await createPrompt(TEACHER_1, { status: "draft" });
		const packId = "pack-ref-1";
		await db.insert(schema.studyPack).values({
			id: packId,
			orgId: "org-1",
			title: "Pack ref",
			status: "draft",
		});
		await db.insert(schema.studyPackItem).values({
			id: "spi-ref-1",
			packId,
			dayIndex: 1,
			position: 0,
			sourceKind: "org_prompt",
			sourceId: promptId,
			note: "",
		});

		const delRes = await callAs(
			TEACHER_1,
			`/api/assignments/prompts/${promptId}`,
			"DELETE",
		);
		expect(delRes.status).toBe(409);
		const body = (await delRes.json()) as { code?: string };
		expect(body.code).toBe(ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_REFERENCED);
	});
});
