import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	parsePromoteArgs,
	runPromoteStudyPacksProdCli,
} from "../../scripts/promote-study-packs-prod";
import { parseSyncAudioArgs } from "../../scripts/sync-study-pack-audio";
import { resolveR2BucketName, syncStudyPackAudioToR2 } from "./r2-audio";
import type { ParsedStudyPackSeedData } from "./study-packs";

function sampleSeedData(): ParsedStudyPackSeedData {
	return {
		packs: [
			{
				id: "syspack-first-step-gt2",
				title: "First Step/GT2",
				description: "",
				level: "IELTS First Step",
				status: "ready",
			},
		],
		exercises: [
			{
				id: "sysex-first-step-gt2-b02",
				skill: "listening",
				part: "s1",
				type: "notes",
				title: "Listening B02",
				band: "5.5",
				level: "IELTS First Step",
				intro: "Listen",
				passage: "",
				audioUrl: "",
				audioKey: "study-packs/first-step-gt2/sysex-first-step-gt2-b02.mp3",
				transcript: "Sample transcript text",
				questions: [{ stem: "Q1 ____", answer: "test", alts: "" }],
				optionBank: [],
				note: "",
				status: "ready",
			},
		],
		items: [
			{
				id: "syspackitem-first-step-gt2-d01",
				packId: "syspack-first-step-gt2",
				dayIndex: 1,
				sourceKind: "library_exercise",
				sourceId: "sysex-first-step-gt2-b02",
				note: "",
			},
		],
	};
}

describe("study-pack R2 audio sync & prod promote CLI (#814)", () => {
	const tmpDirs: string[] = [];

	afterEach(() => {
		for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("resolves staging and prod R2 buckets fail-closed and blocks prod override on staging", async () => {
		const mockFetch: typeof fetch = async () =>
			new Response(
				JSON.stringify({
					success: true,
					result: {
						buckets: [
							{ name: "teacher-os-library-audio-staging-abcd2345efgh6723" },
							{ name: "teacher-os-library-audio-prod-zyxw7654utsr3223" },
						],
					},
				}),
				{ status: 200 },
			);

		expect(
			await resolveR2BucketName({
				stage: "staging",
				accountId: "acc-1",
				apiToken: "tok-1",
				fetchImpl: mockFetch,
			}),
		).toBe("teacher-os-library-audio-staging-abcd2345efgh6723");

		expect(
			await resolveR2BucketName({
				stage: "prod",
				accountId: "acc-1",
				apiToken: "tok-1",
				fetchImpl: mockFetch,
			}),
		).toBe("teacher-os-library-audio-prod-zyxw7654utsr3223");

		await expect(
			resolveR2BucketName({
				stage: "staging",
				accountId: "acc-1",
				apiToken: "tok-1",
				explicitBucket: "teacher-os-library-audio-prod-zyxw7654utsr3223",
			}),
		).rejects.toThrow("Refusing production-like bucket");

		await expect(
			resolveR2BucketName({
				stage: "prod",
				accountId: "acc-1",
				apiToken: "tok-1",
				explicitBucket: "teacher-os-library-audio-staging-abcd2345efgh6723",
			}),
		).rejects.toThrow("Refusing staging-like bucket");
	});

	it("supports dry-run and staging->prod R2 object copy with verification", async () => {
		const objects = new Map<string, Uint8Array>([
			[
				"staging-bucket/study-packs/first-step-gt2/sysex-first-step-gt2-b02.mp3",
				new Uint8Array([0xff, 0xfb, 0x10, 0xc4]),
			],
		]);
		const mockFetch: typeof fetch = async (input, init) => {
			const url = String(input);
			const match = url.match(/\/r2\/buckets\/([^/]+)\/objects\/(.+)$/);
			if (!match) return new Response("bad url", { status: 400 });
			const bucket = decodeURIComponent(match[1] ?? "");
			const key = decodeURIComponent(match[2] ?? "");
			const fullKey = `${bucket}/${key}`;
			const method = init?.method ?? "GET";

			if (method === "HEAD") {
				const buf = objects.get(fullKey);
				return buf
					? new Response(null, {
							status: 200,
							headers: { "content-length": String(buf.byteLength) },
						})
					: new Response(null, { status: 404 });
			}
			if (method === "GET") {
				const buf = objects.get(fullKey);
				return buf
					? new Response(Buffer.from(buf), { status: 200 })
					: new Response(null, { status: 404 });
			}
			if (method === "PUT") {
				const body = init?.body as Buffer;
				objects.set(fullKey, new Uint8Array(body));
				return new Response(JSON.stringify({ success: true }), { status: 200 });
			}
			return new Response("method not allowed", { status: 405 });
		};

		const data = sampleSeedData();
		let out = "";
		const dry = await syncStudyPackAudioToR2({
			accountId: "acc-1",
			apiToken: "tok-1",
			targetBucket: "prod-bucket",
			sourceBucket: "staging-bucket",
			data,
			dryRun: true,
			fetchImpl: mockFetch,
			writeStdout: (s) => {
				out += s;
			},
		});
		expect(dry).toEqual({
			total: 1,
			existing: 0,
			uploaded: 0,
			missing: 1,
			verified: 0,
		});
		expect(out).toContain("WOULD UPLOAD");
		expect(
			objects.has(
				"prod-bucket/study-packs/first-step-gt2/sysex-first-step-gt2-b02.mp3",
			),
		).toBe(false);

		const copied = await syncStudyPackAudioToR2({
			accountId: "acc-1",
			apiToken: "tok-1",
			targetBucket: "prod-bucket",
			sourceBucket: "staging-bucket",
			data,
			verify: true,
			fetchImpl: mockFetch,
			writeStdout: () => {},
		});
		expect(copied).toEqual({
			total: 1,
			existing: 0,
			uploaded: 1,
			missing: 0,
			verified: 1,
		});
		expect(
			objects.get(
				"prod-bucket/study-packs/first-step-gt2/sysex-first-step-gt2-b02.mp3",
			),
		).toEqual(new Uint8Array([0xff, 0xfb, 0x10, 0xc4]));
	});

	it("uploads from local --audio-dir and refuses prod sync/promote without --allow-prod", async () => {
		expect(() => parseSyncAudioArgs(["--stage", "prod"])).toThrow(
			"requires --allow-prod",
		);
		expect(() => parsePromoteArgs([])).toThrow("requires --allow-prod");
		expect(parsePromoteArgs(["--dry-run"]).dryRun).toBe(true);

		const dir = mkdtempSync(join(tmpdir(), "r2-local-audio-"));
		tmpDirs.push(dir);
		writeFileSync(
			join(dir, "sysex-first-step-gt2-b02.mp3"),
			new Uint8Array([0x49, 0x44, 0x33, 0x03]),
		);

		const uploadedKeys: string[] = [];
		const mockFetch: typeof fetch = async (input, init) => {
			const url = String(input);
			if (url.includes("/r2/buckets") && !url.includes("/objects/")) {
				return new Response(
					JSON.stringify({
						success: true,
						result: {
							buckets: [
								{ name: "teacher-os-library-audio-staging-abcd2345efgh6723" },
								{ name: "teacher-os-library-audio-prod-zyxw7654utsr3223" },
							],
						},
					}),
					{ status: 200 },
				);
			}
			const method = init?.method ?? "GET";
			if (method === "HEAD") {
				return uploadedKeys.includes(url)
					? new Response(null, {
							status: 200,
							headers: { "content-length": "4" },
						})
					: new Response(null, { status: 404 });
			}
			if (method === "PUT") {
				uploadedKeys.push(url);
				return new Response(JSON.stringify({ success: true }), { status: 200 });
			}
			return new Response(null, { status: 404 });
		};

		const data = sampleSeedData();
		const res = await syncStudyPackAudioToR2({
			accountId: "acc-1",
			apiToken: "tok-1",
			targetBucket: "teacher-os-library-audio-staging-abcd2345efgh6723",
			audioDir: dir,
			data,
			verify: true,
			fetchImpl: mockFetch,
			writeStdout: () => {},
		});
		expect(res.uploaded).toBe(1);
		expect(res.verified).toBe(1);
	});

	it("promote-study-packs-prod --dry-run inspects prod R2 & D1 without writing and redacts tokens", async () => {
		const writes: string[] = [];
		const mockFetch: typeof fetch = async (input, init) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			if (method === "PUT") {
				writes.push(url);
			}
			if (url.includes("/r2/buckets") && !url.includes("/objects/")) {
				return new Response(
					JSON.stringify({
						success: true,
						result: {
							buckets: [
								{ name: "teacher-os-library-audio-prod-zyxw7654utsr3223" },
							],
						},
					}),
					{ status: 200 },
				);
			}
			if (url.includes("/d1/database?")) {
				return new Response(
					JSON.stringify({
						success: true,
						result: [
							{
								uuid: "11111111-1111-4111-8111-111111111111",
								name: "teacher-os-database-prod-zyxw7654utsr3223",
							},
						],
					}),
					{ status: 200 },
				);
			}
			if (url.includes("/objects/")) {
				return new Response(null, { status: 404 });
			}
			if (url.endsWith("/query")) {
				const body = JSON.parse(String(init?.body ?? "{}")) as { sql?: string };
				if (/INSERT|UPDATE|DELETE/i.test(body.sql ?? "")) {
					writes.push(body.sql ?? "");
				}
				return new Response(
					JSON.stringify({
						success: true,
						result: [{ success: true, results: [] }],
					}),
					{ status: 200 },
				);
			}
			return new Response(null, { status: 404 });
		};

		let stdout = "";
		await runPromoteStudyPacksProdCli(["--dry-run"], {
			env: {
				CLOUDFLARE_ACCOUNT_ID: "acc-1",
				CLOUDFLARE_API_TOKEN: "super-secret-token-value",
			},
			fetchImpl: mockFetch,
			writeStdout: (s) => {
				stdout += s;
			},
		});

		expect(writes).toHaveLength(0);
		expect(stdout).toContain("DRY-RUN D1 status: countsOk=false");
		expect(stdout).toContain(
			"R2 summary: total=32, existing=0, uploaded=0, missing=32",
		);
		expect(stdout).not.toContain("super-secret-token-value");
	});
});
