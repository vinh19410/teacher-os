import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { parseImportListeningArgs } from "../../scripts/import-listening-library";
import {
	DEFAULT_LISTENING_DATA_DIR,
	LISTENING_AUDIO_R2_PREFIX,
	LISTENING_IMAGE_R2_PREFIX,
	type RawListeningFile,
	syncListeningMediaToR2,
	transformListeningFile,
} from "./listening-library";

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
