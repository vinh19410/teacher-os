import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import * as schema from "@teacher-os/db/schema/index";
import {
	libraryTest,
	libraryTestPart,
} from "@teacher-os/db/schema/library-test";
import { organization } from "@teacher-os/db/schema/organization";
import { libraryExercise } from "@teacher-os/db/schema/study-pack";
import { eq, getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import type { Db } from "../app";
import {
	D1_PACK_ITEM_INSERT_CHUNK,
	D1_PROMPT_CLONE_INSERT_CHUNK,
	materializePrompts,
	validateStudyPackItems,
} from "./study-pack-clone";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

describe("study-pack-clone (validateStudyPackItems & materializePrompts)", () => {
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		await db.insert(organization).values([
			{
				id: "org-clone-1",
				name: "Org Clone 1",
				createdAt: new Date(),
			},
			{
				id: "org-clone-2",
				name: "Org Clone 2",
				createdAt: new Date(),
			},
		]);

		await db.insert(assignmentPrompt).values([
			{
				id: "prompt-reading-ready",
				orgId: "org-clone-1",
				task: "task2",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "Org Reading Prompt",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "<p>Passage</p>",
				questions: JSON.stringify([
					{ stem: "Statement 1", opts: null, answer: "TRUE", alts: "" },
				]),
				status: "ready",
			},
			{
				id: "prompt-writing-ready",
				orgId: "org-clone-1",
				task: "task2",
				genre: "opinion",
				skill: "writing",
				part: "task2",
				type: "opinion",
				title: "Org Writing Prompt",
				band: "7.0",
				source: "",
				prompt: "<p>Write an essay</p>",
				status: "ready",
			},
			{
				id: "prompt-speaking-ready",
				orgId: "org-clone-1",
				task: "task2",
				genre: "",
				skill: "speaking",
				part: "part1",
				type: "qa",
				title: "Org Speaking Prompt",
				band: "7.0",
				source: "",
				prompt: "<p>Speak</p>",
				status: "ready",
			},
			{
				id: "prompt-reading-draft",
				orgId: "org-clone-1",
				task: "task2",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "Org Draft Prompt",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "<p>Draft</p>",
				status: "draft",
			},
		]);

		await db.insert(libraryTest).values([
			{
				id: "lt-reading-ready",
				title: "Cambridge 18 Test 1",
				skill: "reading",
				status: "ready",
			},
			{
				id: "lt-listening-ready",
				title: "Cambridge 18 Listening 1",
				skill: "listening",
				status: "ready",
			},
		]);

		await db.insert(libraryTestPart).values([
			{
				id: "ltp-reading-p1",
				testId: "lt-reading-ready",
				part: "p1",
				type: "",
				title: "",
				band: "7.0",
				source: "Cam 18",
				intro: "<p>Read the passage carefully.</p>",
				passage: "<p>Urban farming in the 21st century.</p>",
				questions: JSON.stringify([
					{ stem: "Q1 stem", opts: null, answer: "TRUE", alts: "" },
					{ stem: "Q2 stem", opts: null, answer: "A", alts: "" },
				]),
				optionBank: "[]",
				groups: JSON.stringify([
					{
						id: "g-1",
						type: "tfng",
						instruction: "<p>Write TRUE, FALSE or NOT GIVEN.</p>",
						startIndex: 0,
						count: 1,
						optionBank: [],
						answersInline: false,
						splitContent: false,
						dragDrop: false,
					},
					{
						id: "g-2",
						type: "match_features",
						instruction: "<p>Match each feature with the correct person.</p>",
						startIndex: 1,
						count: 1,
						optionBank: ["Dr Smith", "Prof Lee"],
						answersInline: false,
						splitContent: false,
						dragDrop: false,
					},
				]),
				note: "Key notes",
			},
			{
				id: "ltp-listening-s1",
				testId: "lt-listening-ready",
				part: "s1",
				type: "gap",
				title: "Section 1",
				band: "7.0",
				source: "Cam 18",
				intro: "",
				passage: "",
				questions: JSON.stringify([
					{ stem: "Name: ____", opts: null, answer: "Smith", alts: "" },
				]),
			},
		]);

		await db.insert(libraryExercise).values([
			{
				id: "lex-grammar-1",
				skill: "grammar",
				part: "g1",
				type: "transform",
				title: "Passive Voice Drill",
				band: "6.5",
				intro: "<p>Rewrite each sentence.</p>",
				passage: "",
				questions: JSON.stringify([
					{
						stem: "They built the bridge in 1990. -> The bridge ____ in 1990.",
						opts: null,
						answer: "was built",
						alts: "",
					},
				]),
				optionBank: "[]",
				note: "Use past simple passive",
				status: "ready",
			},
			{
				id: "lex-vocab-draft",
				skill: "vocabulary",
				part: "v1",
				type: "mcq",
				title: "Draft Vocab",
				band: "6.5",
				questions: "[]",
				status: "draft",
			},
		]);
	});

	test("D1 chunk constants stay within 100-bind safety ceiling", () => {
		expect(D1_PROMPT_CLONE_INSERT_CHUNK).toBe(3);
		expect(
			Object.keys(getTableColumns(assignmentPrompt)).length *
				D1_PROMPT_CLONE_INSERT_CHUNK,
		).toBeLessThanOrEqual(100);
		expect(D1_PACK_ITEM_INSERT_CHUNK).toBe(10);
	});

	test("validateStudyPackItems rejects org_prompt in system pack, listening library part, writing/speaking and draft items", async () => {
		const sysWithOrgPrompt = await validateStudyPackItems(db, null, [
			{ sourceKind: "org_prompt", sourceId: "prompt-reading-ready" },
		]);
		expect(sysWithOrgPrompt).toEqual({
			ok: false,
			status: 422,
			error: "system pack cannot reference org_prompt",
		});

		const listeningPart = await validateStudyPackItems(db, "org-clone-1", [
			{ sourceKind: "library_test_part", sourceId: "ltp-listening-s1" },
		]);
		expect(listeningPart).toEqual({
			ok: false,
			status: 422,
			error: "listening library parts are not supported in study packs yet",
		});

		const writingPrompt = await validateStudyPackItems(db, "org-clone-1", [
			{ sourceKind: "org_prompt", sourceId: "prompt-writing-ready" },
		]);
		expect(writingPrompt.ok).toBe(false);
		if (!writingPrompt.ok) {
			expect(writingPrompt.status).toBe(422);
		}

		const speakingPrompt = await validateStudyPackItems(db, "org-clone-1", [
			{ sourceKind: "org_prompt", sourceId: "prompt-speaking-ready" },
		]);
		expect(speakingPrompt.ok).toBe(false);
		if (!speakingPrompt.ok) {
			expect(speakingPrompt.status).toBe(422);
		}

		const draftPrompt = await validateStudyPackItems(db, "org-clone-1", [
			{ sourceKind: "org_prompt", sourceId: "prompt-reading-draft" },
		]);
		expect(draftPrompt.ok).toBe(false);
		if (!draftPrompt.ok) {
			expect(draftPrompt.status).toBe(422);
		}

		const draftExercise = await validateStudyPackItems(db, "org-clone-1", [
			{ sourceKind: "library_exercise", sourceId: "lex-vocab-draft" },
		]);
		expect(draftExercise.ok).toBe(false);
		if (!draftExercise.ok) {
			expect(draftExercise.status).toBe(422);
		}

		const crossOrgPrompt = await validateStudyPackItems(db, "org-clone-2", [
			{ sourceKind: "org_prompt", sourceId: "prompt-reading-ready" },
		]);
		expect(crossOrgPrompt.ok).toBe(false);
		if (!crossOrgPrompt.ok) {
			expect(crossOrgPrompt.status).toBe(404);
		}
	});

	test("materializePrompts is idempotent and flattens groups/optionBank/title of library_test_part", async () => {
		const items = [
			{ sourceKind: "org_prompt" as const, sourceId: "prompt-reading-ready" },
			{ sourceKind: "library_test_part" as const, sourceId: "ltp-reading-p1" },
			{ sourceKind: "library_exercise" as const, sourceId: "lex-grammar-1" },
		];

		const first = await materializePrompts(db, "org-clone-1", items);
		expect(first.ok).toBe(true);
		if (!first.ok) return;

		const second = await materializePrompts(db, "org-clone-1", items);
		expect(second.ok).toBe(true);
		if (!second.ok) return;

		expect(first.items.map((i) => i.promptId)).toEqual(
			second.items.map((i) => i.promptId),
		);
		expect(first.items[0]?.promptId).toBe("prompt-reading-ready");

		const clonedRows = await db
			.select()
			.from(assignmentPrompt)
			.where(eq(assignmentPrompt.orgId, "org-clone-1"));
		const libraryClones = clonedRows.filter((row) => row.libraryRef !== null);
		expect(libraryClones).toHaveLength(2);

		const partClone = libraryClones.find(
			(row) => row.libraryRef === "library_test_part:ltp-reading-p1",
		);
		expect(partClone).toBeDefined();
		expect(partClone?.title).toBe("Cambridge 18 Test 1 — P1");
		expect(partClone?.skill).toBe("reading");
		expect(partClone?.part).toBe("p1");
		expect(partClone?.type).toBe("tfng");
		expect(partClone?.intro).toContain("Read the passage carefully.");
		expect(partClone?.intro).toContain("Write TRUE, FALSE or NOT GIVEN.");
		expect(partClone?.intro).toContain(
			"Match each feature with the correct person.",
		);
		expect(JSON.parse(partClone?.optionBank ?? "[]")).toEqual([
			"Dr Smith",
			"Prof Lee",
		]);
		expect(JSON.parse(partClone?.questions ?? "[]")).toEqual([
			{
				stem: "Q1 stem",
				opts: null,
				answer: "TRUE",
				alts: "",
				type: "tfng",
			},
			{
				stem: "Q2 stem",
				opts: null,
				answer: "A",
				alts: "",
				type: "match_features",
			},
		]);

		const exerciseClone = libraryClones.find(
			(row) => row.libraryRef === "library_exercise:lex-grammar-1",
		);
		expect(exerciseClone).toBeDefined();
		expect(exerciseClone?.skill).toBe("grammar");
		expect(exerciseClone?.part).toBe("g1");
		expect(exerciseClone?.type).toBe("transform");
		expect(exerciseClone?.status).toBe("ready");
	});
});
