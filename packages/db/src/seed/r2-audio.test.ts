import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	parsePromoteArgs,
	runPromoteStudyPacksProdCli,
} from "../../scripts/promote-study-packs-prod";
import { parseSyncAudioArgs } from "../../scripts/sync-study-pack-audio";
import {
	headR2Object,
	resolveR2BucketName,
	syncStudyPackAudioToR2,
} from "./r2-audio";
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

	it("headR2Object checks metadata via R2 objects prefix list without HEAD and requires exact key match", async () => {
		const mockFetch: typeof fetch = async (input, init) => {
			const method = init?.method ?? "GET";
			if (method === "HEAD") {
				return new Response(null, { status: 405 });
			}
			const parsed = new URL(String(input));
			const prefix = parsed.searchParams.get("prefix") ?? "";
			expect(parsed.searchParams.get("limit")).toBe("1");
			if (prefix === "study-packs/exact.mp3") {
				return new Response(
					JSON.stringify({
						success: true,
						result: [{ key: "study-packs/exact.mp3", size: 4096 }],
					}),
					{ status: 200 },
				);
			}
			if (prefix === "study-packs/prefix-only.mp3") {
				return new Response(
					JSON.stringify({
						success: true,
						result: [{ key: "study-packs/prefix-only.mp3.bak", size: 123 }],
					}),
					{ status: 200 },
				);
			}
			return new Response(JSON.stringify({ success: true, result: [] }), {
				status: 200,
			});
		};

		expect(
			await headR2Object({
				accountId: "acc-1",
				bucketName: "bucket-1",
				objectKey: "study-packs/exact.mp3",
				apiToken: "tok-1",
				fetchImpl: mockFetch,
			}),
		).toEqual({ exists: true, size: 4096 });

		expect(
			await headR2Object({
				accountId: "acc-1",
				bucketName: "bucket-1",
				objectKey: "study-packs/prefix-only.mp3",
				apiToken: "tok-1",
				fetchImpl: mockFetch,
			}),
		).toEqual({ exists: false, size: null });

		expect(
			await headR2Object({
				accountId: "acc-1",
				bucketName: "bucket-1",
				objectKey: "study-packs/missing.mp3",
				apiToken: "tok-1",
				fetchImpl: mockFetch,
			}),
		).toEqual({ exists: false, size: null });
	});

	it("supports dry-run and staging->prod R2 object copy with verification", async () => {
		const objects = new Map<string, Uint8Array>([
			[
				"staging-bucket/study-packs/first-step-gt2/sysex-first-step-gt2-b02.mp3",
				new Uint8Array([0xff, 0xfb, 0x10, 0xc4]),
			],
		]);
		const mockFetch: typeof fetch = async (input, init) => {
			const parsed = new URL(String(input));
			const method = init?.method ?? "GET";
			if (method === "HEAD") {
				return new Response(null, { status: 405 });
			}
			const listMatch = parsed.pathname.match(
				/\/r2\/buckets\/([^/]+)\/objects$/,
			);
			if (listMatch && method === "GET") {
				const bucket = decodeURIComponent(listMatch[1] ?? "");
				const prefix = parsed.searchParams.get("prefix") ?? "";
				const limit = Number.parseInt(
					parsed.searchParams.get("limit") ?? "100",
					10,
				);
				const result = [...objects.entries()]
					.filter(([fullKey]) => fullKey.startsWith(`${bucket}/${prefix}`))
					.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
					.slice(0, limit)
					.map(([fullKey, buf]) => ({
						key: fullKey.slice(bucket.length + 1),
						size: buf.byteLength,
					}));
				return new Response(JSON.stringify({ success: true, result }), {
					status: 200,
				});
			}
			const match = parsed.pathname.match(
				/\/r2\/buckets\/([^/]+)\/objects\/(.+)$/,
			);
			if (!match) return new Response("bad url", { status: 400 });
			const bucket = decodeURIComponent(match[1] ?? "");
			const key = decodeURIComponent(match[2] ?? "");
			const fullKey = `${bucket}/${key}`;

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

	it("uploads from local --audio-dir and refuses prod sync/promote without required safety flags", async () => {
		expect(() => parseSyncAudioArgs(["--stage", "prod"])).toThrow(
			"requires --allow-prod",
		);
		expect(() =>
			parsePromoteArgs([
				"--d1",
				"--mode",
				"apply",
				"--pack",
				"First Step/GT2 — Mô hình Kỷ luật (15 phút/ngày)",
			]),
		).toThrow("requires --allow-prod");
		expect(
			parsePromoteArgs([
				"--d1",
				"--mode",
				"dry-run",
				"--pack",
				"First Step/GT2 — Mô hình Kỷ luật (15 phút/ngày)",
			]).mode,
		).toBe("dry-run");

		const dir = mkdtempSync(join(tmpdir(), "r2-local-audio-"));
		tmpDirs.push(dir);
		writeFileSync(
			join(dir, "sysex-first-step-gt2-b02.mp3"),
			new Uint8Array([0x49, 0x44, 0x33, 0x03]),
		);

		const uploadedKeys: string[] = [];
		const mockFetch: typeof fetch = async (input, init) => {
			const parsed = new URL(String(input));
			const method = init?.method ?? "GET";
			if (method === "HEAD") {
				return new Response(null, { status: 405 });
			}
			if (
				parsed.pathname.includes("/r2/buckets") &&
				!parsed.pathname.includes("/objects")
			) {
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
			if (parsed.pathname.endsWith("/objects") && method === "GET") {
				const prefix = parsed.searchParams.get("prefix") ?? "";
				const found = uploadedKeys.filter((key) => key.startsWith(prefix));
				return new Response(
					JSON.stringify({
						success: true,
						result: found.map((key) => ({ key, size: 4 })),
					}),
					{ status: 200 },
				);
			}
			if (method === "PUT") {
				const objMatch = parsed.pathname.match(/\/objects\/(.+)$/);
				if (objMatch?.[1]) {
					uploadedKeys.push(decodeURIComponent(objMatch[1]));
				}
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

	it("promote-study-packs-prod --d1 --mode dry-run inspects staging & prod R2/D1 without writing and redacts tokens", async () => {
		const writes: string[] = [];
		const stagingDbId = "11111111-1111-4111-8111-111111111111";
		const prodDbId = "22222222-2222-4222-8222-222222222222";
		const mockFetch: typeof fetch = async (input, init) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			if (method === "PUT") {
				writes.push(url);
			}
			if (url.includes("/r2/buckets") && !url.includes("/objects")) {
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
			if (url.includes("/d1/database?")) {
				return new Response(
					JSON.stringify({
						success: true,
						result: [
							{
								uuid: stagingDbId,
								name: "teacher-os-database-staging-abcd2345efgh6723",
							},
							{
								uuid: prodDbId,
								name: "teacher-os-database-prod-zyxw7654utsr3223",
							},
						],
					}),
					{ status: 200 },
				);
			}
			if (url.includes("/objects?")) {
				const isStagingBucket = url.includes("staging-abcd2345efgh6723");
				const parsed = new URL(url);
				const prefix = parsed.searchParams.get("prefix") ?? "";
				return new Response(
					JSON.stringify({
						success: true,
						result: isStagingBucket ? [{ key: prefix, size: 1024 }] : [],
					}),
					{ status: 200 },
				);
			}
			if (url.endsWith("/query")) {
				const body = JSON.parse(String(init?.body ?? "{}")) as { sql?: string };
				const sql = body.sql ?? "";
				if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)) {
					writes.push(sql);
				}
				if (sql.includes("sqlite_master")) {
					return new Response(
						JSON.stringify({
							success: true,
							result: [
								{
									success: true,
									results: [
										{ name: "study_pack" },
										{ name: "study_pack_exercise" },
										{ name: "study_pack_item" },
									],
								},
							],
						}),
						{ status: 200 },
					);
				}
				if (sql.includes("PRAGMA table_info('study_pack')")) {
					return new Response(
						JSON.stringify({
							success: true,
							result: [{ success: true, results: [{ name: "level" }] }],
						}),
						{ status: 200 },
					);
				}
				if (sql.includes("PRAGMA table_info('study_pack_exercise')")) {
					return new Response(
						JSON.stringify({
							success: true,
							result: [{ success: true, results: [{ name: "audio_key" }] }],
						}),
						{ status: 200 },
					);
				}
				const isStagingDb = url.includes(stagingDbId);
				if (isStagingDb && sql.includes("FROM study_pack WHERE")) {
					return new Response(
						JSON.stringify({
							success: true,
							result: [
								{
									success: true,
									results: [
										{
											id: "syspack-first-step-gt2",
											org_id: null,
											title: "First Step/GT2 — Mô hình Kỷ luật (15 phút/ngày)",
											description: "Desc",
											level: "IELTS First Step",
											status: "ready",
											source_pack_id: null,
											created_by: null,
											created_at: 1000,
											updated_at: 1000,
										},
									],
								},
							],
						}),
						{ status: 200 },
					);
				}
				if (isStagingDb && sql.includes("FROM study_pack_item")) {
					return new Response(
						JSON.stringify({
							success: true,
							result: [
								{
									success: true,
									results: [
										{
											id: "syspackitem-first-step-gt2-d02",
											pack_id: "syspack-first-step-gt2",
											day_index: 2,
											position: 0,
											source_kind: "library_exercise",
											source_id: "sysex-first-step-gt2-b02",
											note: "",
										},
									],
								},
							],
						}),
						{ status: 200 },
					);
				}
				if (isStagingDb && sql.includes("FROM study_pack_exercise")) {
					return new Response(
						JSON.stringify({
							success: true,
							result: [
								{
									success: true,
									results: [
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
											audio_url: "",
											audio_key:
												"study-packs/first-step-gt2/sysex-first-step-gt2-b02.mp3",
											transcript: "Sample",
											questions: "[]",
											option_bank: "[]",
											note: "",
											status: "ready",
											created_by: null,
											created_at: 1000,
											updated_at: 1000,
										},
									],
								},
							],
						}),
						{ status: 200 },
					);
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
		await runPromoteStudyPacksProdCli(
			[
				"--d1",
				"--mode",
				"dry-run",
				"--pack",
				"First Step/GT2 — Mô hình Kỷ luật (15 phút/ngày)",
				"--public-logs",
			],
			{
				env: {
					CLOUDFLARE_ACCOUNT_ID: "acc-1",
					CLOUDFLARE_API_TOKEN: "super-secret-token-value",
				},
				fetchImpl: mockFetch,
				writeStdout: (s) => {
					stdout += s;
				},
			},
		);

		expect(writes).toHaveLength(0);
		expect(stdout).toContain("DRY-RUN complete (read-only");
		expect(stdout).toContain(
			"DRY-RUN R2 audio: total=1, existingOnProd=0, toCopyFromStaging=1, missingOnStaging=0",
		);
		expect(stdout).not.toContain("super-secret-token-value");
		expect(stdout).not.toContain(stagingDbId);
		expect(stdout).not.toContain(prodDbId);
	});
});
