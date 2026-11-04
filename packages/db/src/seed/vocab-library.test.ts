import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArgs, runSeedCli } from "../../scripts/seed-vocab-library";
import * as schema from "../schema/index";
import {
	assertNonProdD1Database,
	EXPECTED_COUNTS,
	ensureVocabLibrarySeeded,
	parseVocabLibraryCsvTexts,
	resolveStagingD1DatabaseId,
	seedVocabLibrary,
	verifyContentParity,
	verifyCounts,
} from "./vocab-library";

const MIGRATIONS_DIR = new URL("../migrations", import.meta.url).pathname;

describe("vocab-library seed pipeline (#361)", () => {
	const tmpDirs: string[] = [];

	afterEach(() => {
		for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("parses RFC4180 quoted commas, single quotes, and preserves deterministic IDs", () => {
		const parsed = parseVocabLibraryCsvTexts({
			coursesCsv: [
				"id,courseName,courseDescription,courseTarget,order",
				'6,"IELTS CƠ BẢN","Hơn 1200 từ, cụm từ IELTS","Ôn IELTS 6.5, Reading & Listening",2',
			].join("\n"),
			lessonsCsv: [
				"id,lessonName,lessonDescription,image,order,courseId",
				'334,"Teacher\'s Awareness, Part 1","84.Nhận thức của con người",https://example.com/img.webp,84,6',
			].join("\n"),
			lessonDetailsCsv: [
				"id,lessonDetailId,content,phonetic,position,trans,sentenceVi,sentenceEn,picture,audio,lessonId,courseId",
				'44753,345,implement,/ˈɪmplɪment/,v,"Thực hiện, thể hiện","Họ thực hiện kế hoạch, dự án.","They implement the plan\'s goals.",https://example.com/pic.png,https://mochien3.1-api.mochidemy.com/public/audios/question/implement.mp3,334,6',
			].join("\n"),
		});

		expect(parsed.courses).toEqual([
			{
				id: "libcourse-6",
				name: "IELTS CƠ BẢN",
				description: "Hơn 1200 từ, cụm từ IELTS",
				target: "Ôn IELTS 6.5, Reading & Listening",
				sortOrder: 2,
			},
		]);
		expect(parsed.decks).toEqual([
			{
				id: "libdeck-334",
				courseId: "libcourse-6",
				title: "Teacher's Awareness, Part 1",
				description: "84.Nhận thức của con người",
				imageUrl: "https://example.com/img.webp",
				sortOrder: 84,
			},
		]);
		expect(parsed.words).toEqual([
			{
				id: "libword-44753",
				deckId: "libdeck-334",
				word: "implement",
				ipa: "/ˈɪmplɪment/",
				pos: "v",
				translation: "Thực hiện, thể hiện",
				sentenceVi: "Họ thực hiện kế hoạch, dự án.",
				sentenceEn: "They implement the plan's goals.",
				pictureUrl: "https://example.com/pic.png",
				audioUrl:
					"https://mochien3.1-api.mochidemy.com/public/audios/question/implement.mp3",
				sortOrder: 0,
			},
		]);
	});

	it("throws clear error on missing required column or duplicate key id", () => {
		expect(() =>
			parseVocabLibraryCsvTexts({
				coursesCsv: "id,courseName,courseDescription\n1,Course 1,Desc",
				lessonsCsv:
					"id,lessonName,lessonDescription,image,order,courseId\n10,Lesson 1,1.Bài 1,,1,1",
				lessonDetailsCsv:
					"id,content,phonetic,position,trans,sentenceVi,sentenceEn,picture,audio,lessonId,courseId\n100,word,/w/,n,t,sv,se,,https://a.mp3,10,1",
			}),
		).toThrow(/\[courses\.csv\] missing required column "courseTarget"/);

		expect(() =>
			parseVocabLibraryCsvTexts({
				coursesCsv:
					"id,courseName,courseDescription,courseTarget,order\n1,C1,D,T,1\n1,C2,D,T,2",
				lessonsCsv:
					"id,lessonName,lessonDescription,image,order,courseId\n10,Lesson 1,1.Bài 1,,1,1",
				lessonDetailsCsv:
					"id,content,phonetic,position,trans,sentenceVi,sentenceEn,picture,audio,lessonId,courseId\n100,word,/w/,n,t,sv,se,,https://a.mp3,10,1",
			}),
		).toThrow(/\[courses\.csv\] duplicate key column "id" value "1"/);
	});

	it("seeds all 20/968/10160 rows idempotently on libsql and verifies exact id-sets", async () => {
		const dir = mkdtempSync(join(tmpdir(), "vocab-lib-seed-test-"));
		tmpDirs.push(dir);
		const dbFile = join(dir, "test.db");

		const client = createClient({ url: `file:${dbFile}` });
		try {
			const db = drizzle(client, { schema });
			await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

			const firstRun = await seedVocabLibrary(client);
			expect(firstRun.counts).toEqual(EXPECTED_COUNTS);

			const secondRun = await seedVocabLibrary(client);
			expect(secondRun.counts).toEqual(EXPECTED_COUNTS);

			const verification = await verifyCounts(client);
			expect(verification.ok).toBe(true);
			expect(await verifyContentParity(client)).toBe(true);
			expect(verification.tables.course).toEqual({
				expected: EXPECTED_COUNTS.course,
				actual: EXPECTED_COUNTS.course,
				missing: 0,
				extra: 0,
				match: true,
			});
			expect(verification.tables.deck).toEqual({
				expected: EXPECTED_COUNTS.deck,
				actual: EXPECTED_COUNTS.deck,
				missing: 0,
				extra: 0,
				match: true,
			});
			expect(verification.tables.word).toEqual({
				expected: EXPECTED_COUNTS.word,
				actual: EXPECTED_COUNTS.word,
				missing: 0,
				extra: 0,
				match: true,
			});

			const sampleWord = await client.execute(
				"SELECT id FROM vocab_library_word LIMIT 1",
			);
			expect(String(sampleWord.rows[0]?.id)).toMatch(/^libword-\d+$/);

			const sampleDeck = await client.execute(
				"SELECT description FROM vocab_library_deck WHERE id = 'libdeck-334' LIMIT 1",
			);
			expect(sampleDeck.rows[0]?.description).toBe(
				"84.Nhận thức của con người",
			);
			const firstCourse1Deck = await client.execute(
				"SELECT title, description FROM vocab_library_deck WHERE course_id = 'libcourse-1' ORDER BY sort_order LIMIT 1",
			);
			expect(firstCourse1Deck.rows[0]?.description).toBe("1.Trường học");

			// Swap one leaf word ID so total row count stays 10160, proving verifyCounts checks id-set rather than count only.
			await client.execute(
				"UPDATE vocab_library_word SET id = 'libword-999999' WHERE id = 'libword-44753'",
			);
			const swappedVerification = await verifyCounts(client);
			expect(swappedVerification.ok).toBe(false);
			expect(swappedVerification.tables.word.actual).toBe(EXPECTED_COUNTS.word);
			expect(swappedVerification.tables.word.missing).toBe(1);
			expect(swappedVerification.tables.word.extra).toBe(1);
			expect(swappedVerification.tables.word.match).toBe(false);
		} finally {
			client.close();
		}
	}, 30_000);

	it("resolves staging D1 database ID fail-closed and blocks non-staging / paginated / ambiguous responses (#573)", async () => {
		await expect(
			resolveStagingD1DatabaseId({
				stage: "prod",
				accountId: "acc-1",
				apiToken: "tok-1",
				fetchImpl: vi.fn(),
			}),
		).rejects.toThrow(/restricted to "staging"/);

		await expect(
			resolveStagingD1DatabaseId({
				stage: "production",
				accountId: "acc-1",
				apiToken: "tok-1",
				fetchImpl: vi.fn(),
			}),
		).rejects.toThrow(/restricted to "staging"/);

		await expect(
			resolveStagingD1DatabaseId({
				stage: "",
				accountId: "acc-1",
				apiToken: "tok-1",
				fetchImpl: vi.fn(),
			}),
		).rejects.toThrow(/restricted to "staging"/);

		const validUuid = "11111111-2222-3333-4444-555555555555";
		const listFetch = vi.fn(async (input: RequestInfo | URL) => {
			expect(String(input)).toBe(
				"https://api.cloudflare.com/client/v4/accounts/acc-1/d1/database?name=teacher-os-database-staging-&per_page=100",
			);
			return new Response(
				JSON.stringify({
					success: true,
					result: [
						{
							uuid: validUuid,
							name: "teacher-os-database-staging-abcdefghijklmnop",
						},
						{
							uuid: "99999999-9999-9999-9999-999999999999",
							name: "teacher-os-database-prod-abcdefghijklmnop",
						},
					],
					result_info: { page: 1, per_page: 100, count: 2, total_count: 2 },
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		});

		const resolved = await resolveStagingD1DatabaseId({
			stage: "staging",
			accountId: "acc-1",
			apiToken: "tok-1",
			fetchImpl: listFetch,
		});
		expect(resolved).toBe(validUuid);

		// Pagination truncation via total_count > result.length (when total_pages is undefined)
		await expect(
			resolveStagingD1DatabaseId({
				stage: "staging",
				accountId: "acc-1",
				apiToken: "tok-1",
				fetchImpl: vi.fn(async () => {
					return new Response(
						JSON.stringify({
							success: true,
							result: [
								{
									uuid: validUuid,
									name: "teacher-os-database-staging-abcdefghijklmnop",
								},
							],
							result_info: {
								page: 1,
								per_page: 100,
								count: 1,
								total_count: 101,
							},
						}),
						{ status: 200 },
					);
				}),
			}),
		).rejects.toThrow(/pagination/i);

		// Zero or multiple staging matches fail closed
		await expect(
			resolveStagingD1DatabaseId({
				stage: "staging",
				accountId: "acc-1",
				apiToken: "tok-1",
				fetchImpl: vi.fn(async () => {
					return new Response(
						JSON.stringify({
							success: true,
							result: [],
							result_info: { page: 1, per_page: 100, count: 0, total_count: 0 },
						}),
						{ status: 200 },
					);
				}),
			}),
		).rejects.toThrow(/Expected exactly 1 staging D1 database/);

		await expect(
			resolveStagingD1DatabaseId({
				stage: "staging",
				accountId: "acc-1",
				apiToken: "tok-1",
				fetchImpl: vi.fn(async () => {
					return new Response(
						JSON.stringify({
							success: true,
							result: [
								{
									uuid: validUuid,
									name: "teacher-os-database-staging-abcdefghijklmnop",
								},
								{
									uuid: "22222222-2222-2222-2222-222222222222",
									name: "teacher-os-database-staging-qrstuvwxyz234567",
								},
							],
							result_info: { page: 1, per_page: 100, count: 2, total_count: 2 },
						}),
						{ status: 200 },
					);
				}),
			}),
		).rejects.toThrow(/Expected exactly 1 staging D1 database/);
	});

	it("enforces prod license gate on --d1, masks/redacts D1 UUID & token, and retries HTTP 429 (#573)", async () => {
		expect(() => parseArgs(["--d1", "--d1-stage", "prod"])).toThrow(
			/restricted to "staging"/,
		);
		expect(() =>
			parseArgs(["--file", "x.db", "--d1-stage", "staging"]),
		).toThrow(/requires --d1/);
		expect(() => parseArgs(["--d1", "--prune", "--if-needed"])).toThrow(
			/Cannot combine --if-needed with --prune/,
		);

		// Conflict when both D1_DATABASE_ID and --d1-stage are set
		await expect(
			runSeedCli(["--d1", "--d1-stage", "staging", "--verify"], {
				env: {
					CLOUDFLARE_ACCOUNT_ID: "acc-1",
					CLOUDFLARE_API_TOKEN: "secret-tok-999",
					D1_DATABASE_ID: "explicit-db-id",
				},
				fetchImpl: vi.fn(),
			}),
		).rejects.toThrow(/Cannot combine D1_DATABASE_ID/);

		// Raw --d1 with D1_DATABASE_ID pointing at prod DB is blocked by license gate
		await expect(
			assertNonProdD1Database({
				accountId: "acc-1",
				databaseId: "prod-uuid-777",
				apiToken: "secret-tok-999",
				fetchImpl: vi.fn(async () => {
					return new Response(
						JSON.stringify({
							success: true,
							result: {
								uuid: "prod-uuid-777",
								name: "teacher-os-database-prod-abcdefghijklmnop",
							},
						}),
						{ status: 200 },
					);
				}),
			}),
		).rejects.toThrow(/blocked by license gate/i);

		// Column-0 ::add-mask:: before logs, 429 retry, and secret/UUID redaction on failure
		const stagingUuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const secretToken = "cf-super-secret-token-xyz";
		const stdoutChunks: string[] = [];
		let queryCallCount = 0;

		const miniData = parseVocabLibraryCsvTexts({
			coursesCsv:
				"id,courseName,courseDescription,courseTarget,order\n1,Course 1,Desc,Target,0",
			lessonsCsv:
				"id,lessonName,lessonDescription,image,order,courseId\n10,Lesson 1,1.Bài 1,,0,1",
			lessonDetailsCsv:
				"id,content,phonetic,position,trans,sentenceVi,sentenceEn,picture,audio,lessonId,courseId\n100,word,,n,nghĩa,,,https://example.com/p.png,https://mochien3.1-api.mochidemy.com/a.mp3,10,1",
		});

		await runSeedCli(["--d1", "--d1-stage", "staging", "--verify"], {
			env: {
				CLOUDFLARE_ACCOUNT_ID: "acc-1",
				CLOUDFLARE_API_TOKEN: secretToken,
				GITHUB_ACTIONS: "true",
			},
			data: miniData,
			retryDelayMs: 0,
			writeStdout: (chunk) => {
				stdoutChunks.push(chunk);
			},
			fetchImpl: async (input) => {
				const url = String(input);
				if (url.includes("/d1/database?name=")) {
					return new Response(
						JSON.stringify({
							success: true,
							result: [
								{
									uuid: stagingUuid,
									name: "teacher-os-database-staging-abcdefghijklmnop",
								},
							],
							result_info: { page: 1, per_page: 100, count: 1, total_count: 1 },
						}),
						{ status: 200 },
					);
				}
				queryCallCount++;
				if (queryCallCount === 1) {
					return new Response(
						JSON.stringify({
							success: false,
							errors: [{ message: "rate limited" }],
						}),
						{ status: 429 },
					);
				}
				if (url.endsWith(`/d1/database/${stagingUuid}/query`)) {
					return new Response(
						JSON.stringify({
							success: true,
							result: [
								{
									success: true,
									results: [{ id: "libcourse-1" }],
								},
							],
						}),
						{ status: 200 },
					);
				}
				return new Response("not found", { status: 404 });
			},
		}).catch(() => {
			// verifyCounts on mocked uniform IDs may mismatch deck/word ids; we check mask & retry here
		});

		expect(stdoutChunks[0]).toBe(`::add-mask::${stagingUuid}\n`);
		expect(queryCallCount).toBeGreaterThanOrEqual(2);

		// Verify error redaction strips both stagingUuid and secretToken
		let caughtMessage = "";
		try {
			await runSeedCli(["--d1", "--d1-stage", "staging"], {
				env: {
					CLOUDFLARE_ACCOUNT_ID: "acc-1",
					CLOUDFLARE_API_TOKEN: secretToken,
				},
				data: miniData,
				retryDelayMs: 0,
				writeStdout: () => {},
				fetchImpl: async (input) => {
					const url = String(input);
					if (url.includes("/d1/database?name=")) {
						return new Response(
							JSON.stringify({
								success: true,
								result: [
									{
										uuid: stagingUuid,
										name: "teacher-os-database-staging-abcdefghijklmnop",
									},
								],
								result_info: {
									page: 1,
									per_page: 100,
									count: 1,
									total_count: 1,
								},
							}),
							{ status: 200 },
						);
					}
					return new Response(
						`upstream error at ${url} with token ${secretToken}`,
						{ status: 403 },
					);
				},
			});
		} catch (err) {
			caughtMessage = err instanceof Error ? err.message : String(err);
		}
		expect(caughtMessage).not.toBe("");
		expect(caughtMessage).not.toContain(stagingUuid);
		expect(caughtMessage).not.toContain(secretToken);
		expect(caughtMessage).toContain("[REDACTED]");
	});

	it("ensureVocabLibrarySeeded (--if-needed) skips upsert when IDs & SHA-256 content match and re-seeds when content drifts (#573)", async () => {
		const dir = mkdtempSync(join(tmpdir(), "vocab-lib-if-needed-"));
		tmpDirs.push(dir);
		const dbFile = join(dir, "test.db");

		const miniData = parseVocabLibraryCsvTexts({
			coursesCsv:
				"id,courseName,courseDescription,courseTarget,order\n1,Course 1,,Target 1,0",
			lessonsCsv:
				"id,lessonName,lessonDescription,image,order,courseId\n10,Lesson 1,1.Bài 1,,0,1",
			lessonDetailsCsv:
				"id,content,phonetic,position,trans,sentenceVi,sentenceEn,picture,audio,lessonId,courseId\n100,hello,,n,xin chào,,,,https://mochien3.1-api.mochidemy.com/hello.mp3,10,1",
		});

		const client = createClient({ url: `file:${dbFile}` });
		try {
			const db = drizzle(client, { schema });
			await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

			// 1. Empty DB -> seeds and verifies
			const first = await ensureVocabLibrarySeeded(client, {
				data: miniData,
				ifNeeded: true,
				verify: true,
			});
			expect(first.seeded).toBe(true);
			expect(first.statementsExecuted).toBeGreaterThan(0);
			expect(first.counts).toEqual({ course: 1, deck: 1, word: 1 });
			expect(first.verification?.ok).toBe(true);

			// 2. Already seeded & content identical (including NULL columns) -> skips upsert
			expect(await verifyContentParity(client, { data: miniData })).toBe(true);
			const second = await ensureVocabLibrarySeeded(client, {
				data: miniData,
				ifNeeded: true,
				verify: true,
			});
			expect(second.seeded).toBe(false);
			expect(second.statementsExecuted).toBe(0);
			expect(second.counts).toEqual({ course: 1, deck: 1, word: 1 });

			// 3. Mutate audio_url while keeping primary key ID unchanged -> content parity false -> re-seeds
			await client.execute(
				"UPDATE vocab_library_word SET audio_url = 'https://stale.example.com/old.mp3' WHERE id = 'libword-100'",
			);
			expect((await verifyCounts(client, { data: miniData })).ok).toBe(true);
			expect(await verifyContentParity(client, { data: miniData })).toBe(false);

			const third = await ensureVocabLibrarySeeded(client, {
				data: miniData,
				ifNeeded: true,
				verify: true,
			});
			expect(third.seeded).toBe(true);
			expect(third.verification?.ok).toBe(true);

			const restored = await client.execute(
				"SELECT audio_url FROM vocab_library_word WHERE id = 'libword-100'",
			);
			expect(restored.rows[0]?.audio_url).toBe(
				"https://mochien3.1-api.mochidemy.com/hello.mp3",
			);
		} finally {
			client.close();
		}
	});

	it("CLI --help executes cleanly via workspace tsx binary (#573)", () => {
		const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
		const output = execFileSync(
			"pnpm",
			["exec", "tsx", "scripts/seed-vocab-library.ts", "--help"],
			{ cwd: pkgDir, encoding: "utf8" },
		);
		expect(output).toContain("--d1-stage");
		expect(output).toContain("--if-needed");
	});
});
