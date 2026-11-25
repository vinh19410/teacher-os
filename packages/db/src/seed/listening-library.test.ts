import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { describe, expect, test, vi } from "vitest";
import {
	parseImportListeningArgs,
	runImportListeningCli,
} from "../../scripts/import-listening-library";
import {
	DEFAULT_LISTENING_DATA_DIR,
	LISTENING_AUDIO_R2_PREFIX,
	LISTENING_IMAGE_R2_PREFIX,
	loadListeningLibraryDataset,
	type RawListeningFile,
	syncListeningMediaToR2,
	transformListeningFile,
	upsertListeningLibraryToDb,
	verifyListeningLibraryInDb,
} from "./listening-library";
import { createLibsqlRunner } from "./vocab-library";

function sampleRaw(
	overrides: Partial<RawListeningFile> = {},
): RawListeningFile {
	return {
		id: "test-uuid-001",
		title: "Sample Listening Test",
		source: "C18T2",
		section: 2,
		time_minutes: 10,
		audio_url: "https://audio.stepielts.com/listening-audio/abc.mp3",
		transcript: "Speaker 0: Welcome to the site.",
		images: [
			"https://qbgycaftkmlmbfsfwzhm.supabase.co/storage/v1/object/public/listening-images/map-001.png",
		],
		question_groups: [
			{
				range: "11-12",
				type: "MAP_LABELLING",
				instructions: "Label the map below.",
				options: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
				questions: [
					{
						number: 11,
						text: "Registration area",
						answer: "G",
						quotes: ["Go to the east road."],
					},
					{
						number: 12,
						text: "Judging area",
						answer: "I",
						quotes: ["Past the first aid tent."],
					},
				],
			},
		],
		...overrides,
	};
}

describe("listening-library transformer", () => {
	test("normalizes Cambridge source, re-hosted R2 imageUrl, and audioKey cleanly without Step IELTS branding", () => {
		const item = transformListeningFile(sampleRaw(), "C18T2-S2-sample.json", {
			imageBaseUrl: "https://api.staging.teacheros.io.vn/public/library-images",
		});
		expect(item.status).toBe("ready");
		expect(item.collection).toBe("Cambridge IELTS 18");
		expect(item.testGroup).toBe("Test 2");
		expect(item.part.part).toBe("s2");
		expect(item.part.audioKey).toBe(
			`${LISTENING_AUDIO_R2_PREFIX}test-uuid-001.mp3`,
		);
		expect(item.media.imageKey).toBe(`${LISTENING_IMAGE_R2_PREFIX}map-001.png`);
		expect(item.part.imageUrl).toBe(
			"https://api.staging.teacheros.io.vn/public/library-images/map-001.png",
		);
		expect(item.part.groups[0]?.optionBank).toHaveLength(9);
		expect(item.part.questions[0]?.explanation).toContain(
			"<blockquote>Go to the east road.</blockquote>",
		);
	});

	test("collapses multi-blank stems to at most one ____ marker and fills empty stems from body", () => {
		const item = transformListeningFile(
			sampleRaw({
				images: [],
				question_groups: [
					{
						range: "1-3",
						type: "NOTE_COMPLETION",
						instructions: "Complete the notes.",
						body: "Hobbies: [1] and [2]\nContact: [3]",
						body_html:
							"<table><tbody><tr><td>Hobbies: [1] and [2]</td></tr><tr><td>Contact: [3]</td></tr></tbody></table>",
						questions: [
							{
								number: 1,
								text: "Hobbies: [1] and [2]",
								answer: "swimming / swim",
							},
							{
								number: 2,
								text: "Hobbies: [1] and [2]",
								answer: "cycling",
							},
							{
								number: 3,
								text: "",
								answer: "0912345678",
							},
						],
					},
				],
			}),
			"sample-notes.json",
		);
		expect(item.status).toBe("ready");
		expect(item.part.questions[0]?.stem).toBe("Hobbies: ____ and (2)");
		expect(item.part.questions[0]?.answer).toBe("swimming");
		expect(item.part.questions[0]?.alts).toBe("swim");
		expect(item.part.questions[1]?.stem).toBe("Hobbies: (1) and ____");
		expect(item.part.questions[2]?.stem).toBe("Contact: ____");
		expect(item.part.groups[0]?.instruction).toContain("<table>");
		expect(item.part.groups[0]?.instruction).toContain("<strong>(1)</strong>");
	});

	test("marks source-corrupted answers outside optionBank as draft with explanation in note", () => {
		const item = transformListeningFile(
			sampleRaw({
				images: [],
				question_groups: [
					{
						range: "1-2",
						type: "SUMMARY_COMPLETION",
						instructions: "Choose A–C.",
						options: [
							{ label: "A", text: "One" },
							{ label: "B", text: "Two" },
							{ label: "C", text: "Three" },
						],
						questions: [
							{ number: 1, text: "Item 1", answer: "A" },
							{ number: 2, text: "Item 2", answer: "F" },
						],
					},
				],
			}),
			"corrupt.json",
		);
		expect(item.status).toBe("draft");
		expect(item.draftReasons.some((r) => r.includes('answer "F"'))).toBe(true);
		expect(item.part.note).toContain("nháp");
	});

	test("Talking about the history of bikes Q5 blank aligns grammatically with audio answer 'more smoothly'", () => {
		const fileName = "Unknown-S4-talking-about-the-history-of-bikes.json";
		const raw = JSON.parse(
			readFileSync(join(DEFAULT_LISTENING_DATA_DIR, fileName), "utf8"),
		) as RawListeningFile;
		const item = transformListeningFile(raw, fileName);

		expect(item.status).toBe("ready");
		expect(item.testId).toBe("lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3");
		expect(item.partId).toBe(
			"lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4",
		);
		expect(item.collection).toBe("Other sources");
		expect(item.testGroup).toBe("Section 4");
		expect(item.part.source).toBe("Other sources — Section 4");
		expect(item.part.questions[4]?.stem).toBe("easier; ride ____");
		expect(item.part.questions[4]?.answer).toBe("more smoothly");
		expect(item.part.questions[4]?.alts).toBe("");
		expect(item.part.groups[0]?.instruction).toContain(
			"<td><p>easier; ride <strong>(5)</strong></p></td>",
		);
		expect(item.part.groups[0]?.instruction).not.toContain(
			"easier and <strong>(5)</strong> ride",
		);
	});

	test("normalizes Unknown, blank, and missing raw source to Other sources while preserving named sources", () => {
		for (const rawSource of ["Unknown", "  unknown  ", "", undefined]) {
			const item = transformListeningFile(
				sampleRaw({ source: rawSource }),
				"Unknown-S2-sample.json",
			);
			expect(item.collection).toBe("Other sources");
			expect(item.testGroup).toBe("Section 2");
			expect(item.part.source).toBe("Other sources — Section 2");
		}
		const named = transformListeningFile(
			sampleRaw({ source: "Actual Test" }),
			"Actual-Test-S2-sample.json",
		);
		expect(named.collection).toBe("Actual Test");
		expect(named.part.source).toBe("Actual Test — Section 2");
	});
});

describe("verifyListeningLibraryInDb & import CLI warnings", () => {
	async function createMinimalLibraryDb(
		client: ReturnType<typeof createClient>,
	) {
		await client.executeMultiple(`
			CREATE TABLE library_test (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				description TEXT,
				skill TEXT NOT NULL,
				time_limit_seconds INTEGER NOT NULL DEFAULT 3600,
				collection TEXT,
				test_group TEXT,
				status TEXT NOT NULL DEFAULT 'draft',
				created_by TEXT,
				created_at INTEGER NOT NULL DEFAULT 0,
				updated_at INTEGER NOT NULL DEFAULT 0
			);
			CREATE TABLE library_test_part (
				id TEXT PRIMARY KEY,
				test_id TEXT NOT NULL,
				part TEXT NOT NULL,
				type TEXT NOT NULL DEFAULT '',
				title TEXT NOT NULL DEFAULT '',
				band TEXT NOT NULL DEFAULT '7.0',
				source TEXT NOT NULL DEFAULT '',
				intro TEXT NOT NULL DEFAULT '',
				passage TEXT NOT NULL DEFAULT '',
				transcript TEXT NOT NULL DEFAULT '',
				image_url TEXT NOT NULL DEFAULT '',
				questions TEXT NOT NULL DEFAULT '[]',
				option_bank TEXT NOT NULL DEFAULT '[]',
				groups TEXT NOT NULL DEFAULT '[]',
				note TEXT NOT NULL DEFAULT '',
				audio_key TEXT,
				audio_name TEXT,
				audio_content_type TEXT,
				audio_size INTEGER,
				audio_uploaded_at INTEGER,
				updated_at INTEGER NOT NULL DEFAULT 0,
				UNIQUE(test_id, part)
			);
		`);
	}

	test("verifyListeningLibraryInDb detects Unknown values in both library_test.collection and library_test_part.source", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "listen-verify-"));
		try {
			copyFileSync(
				join(
					DEFAULT_LISTENING_DATA_DIR,
					"Unknown-S4-talking-about-the-history-of-bikes.json",
				),
				join(tempDir, "Unknown-S4-talking-about-the-history-of-bikes.json"),
			);
			const dataset = loadListeningLibraryDataset({ dataDir: tempDir });
			const client = createClient({ url: "file::memory:" });
			await createMinimalLibraryDb(client);
			const runner = createLibsqlRunner(client);

			await upsertListeningLibraryToDb(runner, dataset.items);
			const clean = await verifyListeningLibraryInDb(runner, dataset);
			expect(clean.unknownCollectionMatches).toBe(0);
			expect(clean.unknownPartSourceMatches).toBe(0);
			expect(clean.ok).toBe(true);

			// Corrupt library_test.collection to Unknown -> must fail verify
			await client.execute(
				"UPDATE library_test SET collection = 'Unknown' WHERE id = 'lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3'",
			);
			const badCol = await verifyListeningLibraryInDb(runner, dataset);
			expect(badCol.unknownCollectionMatches).toBe(1);
			expect(badCol.unknownPartSourceMatches).toBe(0);
			expect(badCol.ok).toBe(false);

			// Fix collection, corrupt library_test_part.source to 'Unknown — Section 4' -> must still fail verify
			await client.execute(
				"UPDATE library_test SET collection = 'Other sources' WHERE id = 'lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3'",
			);
			await client.execute(
				"UPDATE library_test_part SET source = 'Unknown — Section 4' WHERE id = 'lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4'",
			);
			const badPart = await verifyListeningLibraryInDb(runner, dataset);
			expect(badPart.unknownCollectionMatches).toBe(0);
			expect(badPart.unknownPartSourceMatches).toBe(1);
			expect(badPart.ok).toBe(false);

			client.close();
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test("runImportListeningCli logs non-fatal duplicate warning, sanitizes workflow-command injection, and suppresses IDs/titles under --public-logs", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "listen-cli-warn-"));
		const dbPath = join(tempDir, "test.sqlite");
		const dataDir = join(tempDir, "data");
		try {
			mkdirSync(dataDir, { recursive: true });
			copyFileSync(
				join(
					DEFAULT_LISTENING_DATA_DIR,
					"Unknown-S4-talking-about-the-history-of-bikes.json",
				),
				join(dataDir, "Unknown-S4-talking-about-the-history-of-bikes.json"),
			);
			// Second fixture whose title carries a newline + workflow command to verify log sanitization
			writeFileSync(
				join(dataDir, "Inject-S2-test.json"),
				JSON.stringify(
					sampleRaw({
						id: "inject-test-uuid-002",
						title: "Inject Test\n::error::injected",
						source: "Unknown",
					}),
				),
				"utf8",
			);

			const client = createClient({ url: pathToFileURL(dbPath).toString() });
			await createMinimalLibraryDb(client);
			await client.execute({
				sql: "INSERT INTO library_test (id, title, skill, status) VALUES (?, ?, 'listening', 'ready'), (?, ?, 'listening', 'ready')",
				args: [
					"manual-secret-uuid-999",
					"Talking about the history of bikes",
					"manual-inject-uuid-888",
					"Inject Test\n::error::injected",
				],
			});
			client.close();

			// 1. Normal mode: non-fatal exit 0, sanitized warning without raw newline command injection, verify logs unknown counts
			let normalOut = "";
			const applyCode = await runImportListeningCli(
				[
					"--file",
					dbPath,
					"--data-dir",
					dataDir,
					"--mode",
					"apply",
					"--skip-media",
					"--verify",
				],
				{ writeStdout: (chunk) => (normalOut += chunk) },
			);
			expect(applyCode).toBe(0);
			expect(normalOut).toContain(
				"WARNING: Found 2 pre-existing non-lib-listen",
			);
			expect(normalOut).toContain("manual-secret-uuid-999");
			expect(normalOut).toContain("unknownCollectionMatches=0");
			expect(normalOut).toContain("unknownPartSourceMatches=0");
			// No line may start with raw GitHub Actions workflow command "::error::injected"
			const lines = normalOut.split(/\r?\n/);
			expect(lines.some((line) => line.startsWith("::error::"))).toBe(false);

			// 2. --public-logs mode: prints count only, suppresses internal UUIDs & titles
			let publicOut = "";
			const auditCode = await runImportListeningCli(
				[
					"--file",
					dbPath,
					"--data-dir",
					dataDir,
					"--mode",
					"audit",
					"--public-logs",
				],
				{ writeStdout: (chunk) => (publicOut += chunk) },
			);
			expect(auditCode).toBe(0);
			expect(publicOut).toContain(
				"WARNING: Found 2 pre-existing non-lib-listen",
			);
			expect(publicOut).toContain("details suppressed under --public-logs");
			expect(publicOut).not.toContain("manual-secret-uuid-999");
			expect(publicOut).not.toContain("manual-inject-uuid-888");
			expect(publicOut).not.toContain("Talking about the history of bikes");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe("syncListeningMediaToR2", () => {
	test("skips existing R2 objects and uploads missing audio + images idempotently", async () => {
		const item = transformListeningFile(sampleRaw(), "sample.json");
		const uploadedKeys: string[] = [];

		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				if (url.includes("/objects?prefix=")) {
					const prefix = decodeURIComponent(
						new URL(url).searchParams.get("prefix") ?? "",
					);
					// Pretend audio already exists in R2, image is missing.
					if (prefix === item.media.audioKey) {
						return new Response(
							JSON.stringify({
								success: true,
								result: [{ key: prefix, size: 123456 }],
							}),
							{ status: 200 },
						);
					}
					return new Response(JSON.stringify({ success: true, result: [] }), {
						status: 200,
					});
				}
				if (url === item.media.imageSourceUrl) {
					return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
						status: 200,
					});
				}
				if (method === "PUT" && url.includes("/objects/")) {
					uploadedKeys.push(url);
					return new Response(JSON.stringify({ success: true }), {
						status: 200,
					});
				}
				return new Response("unexpected", { status: 500 });
			},
		);

		const res = await syncListeningMediaToR2({
			items: [item],
			accountId: "acc-1",
			apiToken: "tok-1",
			bucketName: "teacher-os-library-audio-staging-abcd1234abcd1234",
			concurrency: 2,
			fetchImpl: fetchMock as unknown as typeof fetch,
			writeLog: () => undefined,
		});

		expect(res.audioExisting).toBe(1);
		expect(res.audioUploaded).toBe(0);
		expect(res.imageExisting).toBe(0);
		expect(res.imageUploaded).toBe(1);
		expect(res.failed).toEqual([]);
		expect(item.part.audioSize).toBe(123456);
		expect(uploadedKeys).toHaveLength(1);
		expect(uploadedKeys[0]).toContain("library-images/map-001.png");
	});
});

describe("parseImportListeningArgs safety gates", () => {
	test("rejects production targets and requires --confirm-stage staging for D1 apply", () => {
		expect(() =>
			parseImportListeningArgs(["--d1", "--d1-stage", "prod"]),
		).toThrow(/restricted to "staging"/);
		expect(() =>
			parseImportListeningArgs([
				"--d1",
				"--d1-stage",
				"staging",
				"--mode",
				"apply",
			]),
		).toThrow(/--confirm-stage staging/);
		const ok = parseImportListeningArgs([
			"--d1",
			"--d1-stage",
			"staging",
			"--mode",
			"apply",
			"--confirm-stage",
			"staging",
			"--verify",
		]);
		expect(ok.mode).toBe("apply");
		expect(ok.verify).toBe(true);
	});
});
