import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { studentQuizDetailSchema } from "@teacher-os/api/contracts";
import { buildQuizPartsFromGroups } from "@teacher-os/api/lib/quiz-parts";
import {
	libraryPartUpsertSchema,
	validateTestReady,
} from "@teacher-os/api/library-contracts";
import * as schema from "@teacher-os/db/schema/index";
import {
	loadListeningLibraryDataset,
	upsertListeningLibraryToDb,
	verifyListeningLibraryInDb,
} from "@teacher-os/db/seed/listening-library";
import { createLibsqlRunner } from "@teacher-os/db/seed/vocab-library";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "./app";
import type { MediaStore } from "./lib/media-store";
import type { SessionUser } from "./session";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

describe("IELTS Listening library dataset validation & full import end-to-end", () => {
	const dataset = loadListeningLibraryDataset();
	let app: ServerApp;
	let db: Db;
	let client: ReturnType<typeof createClient>;

	beforeAll(async () => {
		client = createClient({ url: "file::memory:" });
		const drizzleDb = drizzle(client, { schema });
		await migrate(drizzleDb, { migrationsFolder: MIGRATIONS_DIR });
		db = drizzleDb as unknown as Db;

		await db
			.insert(schema.organization)
			.values([{ id: "org-1", name: "Academy 1" }]);
		await db.insert(schema.student).values([
			{
				id: "s-1",
				orgId: "org-1",
				name: "Minh",
				email: "minh@test.local",
			},
		]);

		// Fake R2 store serving any imported listening audio or image key.
		const sampleMp3 = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
		const samplePng = new Uint8Array([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		]);
		const store: MediaStore = {
			async put() {},
			async get(key) {
				if (key.startsWith("library-listening/")) {
					return {
						body: new Response(sampleMp3).body as ReadableStream,
						contentType: "audio/mpeg",
						size: sampleMp3.byteLength,
					};
				}
				if (key.startsWith("library-images/")) {
					return {
						body: new Response(samplePng).body as ReadableStream,
						contentType: "image/png",
						size: samplePng.byteLength,
					};
				}
				return null;
			},
			async delete() {},
		};

		app = buildApp({
			getDb: () => db,
			corsOrigin: ["http://localhost:8003"],
			getLibraryAudioStore: () => store,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> =>
				headers.get("x-test-user") === "minh"
					? {
							userId: "u-minh",
							userName: "Minh",
							email: "minh@test.local",
							emailVerified: true,
							role: "student",
						}
					: null,
			authHandler: () => new Response("ok"),
		});
	});

	test("all 498 listening files pass libraryPartUpsertSchema, and 497 ready tests pass validateTestReady with zero errors", () => {
		expect(dataset.items).toHaveLength(498);
		expect(dataset.readyCount).toBe(497);
		expect(dataset.draftCount).toBe(1);

		const contractFailures: string[] = [];
		for (const item of dataset.items) {
			const payload = {
				part: item.part.part,
				type: item.part.type,
				title: item.part.title,
				band: item.part.band,
				source: item.part.source,
				intro: item.part.intro,
				passage: item.part.passage,
				transcript: item.part.transcript,
				imageUrl: item.part.imageUrl,
				questions: item.part.questions,
				optionBank: item.part.optionBank,
				note: item.part.note,
				audioName: item.part.audioName,
				groups: item.part.groups,
			};
			const parsed = libraryPartUpsertSchema.safeParse(payload);
			if (!parsed.success) {
				contractFailures.push(
					`${item.fileName} upsert failed: ${JSON.stringify(parsed.error.issues)}`,
				);
				continue;
			}
			if (item.status === "ready") {
				const readyIssues = validateTestReady("listening", [parsed.data]);
				if (readyIssues.length > 0) {
					contractFailures.push(
						`${item.fileName} ready failed: ${JSON.stringify(readyIssues)}`,
					);
				}
			}
		}

		expect(contractFailures).toEqual([]);
	});

	test("idempotent SQLite import persists all 498 tests and syncs multi-bank, map, diagram, summary-bank, flow-bank, mcq4, and mcq_many to Student Practice", async () => {
		const runner = createLibsqlRunner(client);

		// Import twice to confirm full idempotency.
		await upsertListeningLibraryToDb(runner, dataset.items);
		await upsertListeningLibraryToDb(runner, dataset.items);

		const verify = await verifyListeningLibraryInDb(runner, dataset);
		expect(verify.ok).toBe(true);
		expect(verify.actualTests).toBe(498);
		expect(verify.actualReady).toBe(497);
		expect(verify.actualDraft).toBe(1);
		expect(verify.stepIeltsMatches).toBe(0);
		expect(verify.unknownCollectionMatches).toBe(0);
		expect(verify.unknownPartSourceMatches).toBe(0);

		// Trigger student practice sync on listening catalog with facets.
		const catalogRes = await app.request(
			"/api/student/practice?skill=listening&page=1&facets=1",
			{
				headers: { "x-test-user": "minh", "x-student-org-id": "org-1" },
			},
		);
		expect(catalogRes.status).toBe(200);
		const catalog = (await catalogRes.json()) as {
			total: number;
			items: Array<{
				testId: string;
				title: string;
				collection: string | null;
				testGroup: string | null;
			}>;
			facets?: { collections: string[] };
		};
		expect(catalog.total).toBe(497);
		expect(catalog.facets?.collections).toContain("Other sources");
		expect(catalog.facets?.collections).not.toContain("Unknown");

		// Bikes test appears once with consistent "Other sources" · "Section 4" metadata
		const bikesRes = await app.request(
			"/api/student/practice?skill=listening&q=Talking+about+the+history+of+bikes",
			{
				headers: { "x-test-user": "minh", "x-student-org-id": "org-1" },
			},
		);
		expect(bikesRes.status).toBe(200);
		const bikesCatalog = (await bikesRes.json()) as {
			total: number;
			items: Array<{
				title: string;
				collection: string | null;
				testGroup: string | null;
			}>;
		};
		expect(bikesCatalog.total).toBe(1);
		expect(bikesCatalog.items[0]?.title).toBe(
			"Talking about the history of bikes",
		);
		expect(bikesCatalog.items[0]?.collection).toBe("Other sources");
		expect(bikesCatalog.items[0]?.testGroup).toBe("Section 4");

		// Spot-check critical test shapes end-to-end through Student Practice API!
		const spotlightFiles = [
			// Multi-bank: Map (8 opts) + Summary with word bank (7 opts) in one section
			"Forecast-Quy-2-2025-S2-fitness-center-launching.json",
			// Map labelling with 10 options (A-J) and R2 image
			"C16T1-S2-plan-of-stevensons-site.json",
			// Listening diagram label with R2 image (no bank, no pin)
			"Actual-Test-S4-solar-water-purifier.json",
			// Matching features with reused letters (3 opts for 4 questions)
			"Actual-Test-S1-employment-agency-possible-jobs.json",
			// Two consecutive mcq_many clusters
			"Actual-Test-S2-coconut-beach-resort.json",
			// 4-option MCQ
			"Unknown-S1-coffee-and-donuts.json",
			// Table completion with HTML table
			"Actual-Test-S1-apartment-in-arillas.json",
			// Short answer
			"Collection-S2-bicycle-for-the-world.json",
			// True / False / Not Given
			"Unknown-S1-advice.json",
		];

		for (const fileName of spotlightFiles) {
			const sourceItem = dataset.items.find((i) => i.fileName === fileName);
			expect(sourceItem, `missing spotlight ${fileName}`).toBeDefined();
			if (!sourceItem) continue;

			const [orgCopy] = await db
				.select({ id: schema.assignmentTest.id })
				.from(schema.assignmentTest)
				.where(eq(schema.assignmentTest.libraryRef, sourceItem.testId))
				.limit(1);
			expect(orgCopy, `not synced to org: ${fileName}`).toBeDefined();
			if (!orgCopy) continue;

			const quizRes = await app.request(
				`/api/student/practice/${orgCopy.id}/quiz`,
				{
					headers: { "x-test-user": "minh", "x-student-org-id": "org-1" },
				},
			);
			expect(quizRes.status).toBe(200);
			const parsedDetail = studentQuizDetailSchema.parse(await quizRes.json());
			expect(parsedDetail.hasAudio).toBe(true);
			expect(parsedDetail.groups?.length).toBe(sourceItem.part.groups.length);

			const parts = buildQuizPartsFromGroups(
				parsedDetail.questions,
				parsedDetail.groups,
				parsedDetail.type,
				parsedDetail.intro,
			);
			expect(parts).toHaveLength(sourceItem.part.groups.length);

			// Multi-bank check: each group retains its own independent optionBank!
			if (fileName === "Forecast-Quy-2-2025-S2-fitness-center-launching.json") {
				expect(parts[0]?.optionBank).toHaveLength(8);
				expect(parts[1]?.optionBank).toHaveLength(7);
				expect(parts[1]?.optionBank?.[0]).toBe("good for shoulders");
			}

			// Audio endpoint check
			const audioRes = await app.request(
				`/api/student/practice/${orgCopy.id}/audio`,
				{
					headers: { "x-test-user": "minh", "x-student-org-id": "org-1" },
				},
			);
			expect(audioRes.status).toBe(200);
			expect(audioRes.headers.get("content-type")).toBe("audio/mpeg");

			// Re-hosted R2 image check
			if (sourceItem.media.imageKey) {
				const imgName = sourceItem.media.imageKey.replace(
					"library-images/",
					"",
				);
				const imgRes = await app.request(`/public/library-images/${imgName}`);
				expect(imgRes.status).toBe(200);
				expect(imgRes.headers.get("content-type")).toBe(
					sourceItem.media.imageContentType,
				);
			}
		}
	}, 30_000);
});
