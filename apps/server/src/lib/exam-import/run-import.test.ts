import { createClient } from "@libsql/client";
import {
	type ExtractedExam,
	extractedExamSchema,
} from "@teacher-os/api/contracts";
import {
	creditUsageLog,
	creditWallet,
} from "@teacher-os/db/schema/credit-wallet";
import { examImportJob } from "@teacher-os/db/schema/exam-import-job";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Db } from "../../app";
import {
	ensureWallet,
	readWallet,
	releaseCredits,
	reserveCredits,
} from "../credits/wallet";
import type { MediaStore } from "../media-store";
import type { ExamExtractor } from "./extractor";
import { createFakeExamExtractor } from "./fake-extractor";
import {
	classifyImportError,
	EmptyResultError,
	hasValidQuestionGroup,
	runImport,
} from "./run-import";

const MIGRATIONS_DIR = new URL(
	"../../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

const EXAM: ExtractedExam = extractedExamSchema.parse({
	title: "Đề test",
	skill: "reading",
	timeLimitMinutes: 30,
	parts: [
		{
			passage: "passage",
			questions: [
				{ stem: "Câu 1?", opts: ["A", "B"], answer: "A", confidence: 0.9 },
			],
		},
	],
});

function memoryStore(): { store: MediaStore } {
	const objects = new Map<string, Uint8Array>();
	return {
		store: {
			async put(_key, body) {
				objects.set(
					_key,
					new Uint8Array(await new Response(body).arrayBuffer()),
				);
			},
			async get(key) {
				const bytes = objects.get(key);
				if (!bytes) return null;
				return {
					body: new Response(bytes).body as ReadableStream<Uint8Array>,
					contentType: "application/pdf",
					size: bytes.byteLength,
				};
			},
			async delete(key) {
				objects.delete(key);
			},
		},
	};
}

describe("run-import (TOS-27 D2)", () => {
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
	});

	beforeEach(async () => {
		await db.delete(creditUsageLog);
		await db.delete(creditWallet);
		await db.delete(examImportJob);
		// Ví sạch 30 Cr — job đưa vào runImport phải ĐÃ reserve (hợp đồng
		// của hàm: INSERT + reserve xong trước khi gọi).
		await ensureWallet(db, "org-1");
		await reserveCredits(db, {
			orgId: "org-1",
			actorUserId: "u-1",
			amount: 5,
			refId: "job-under-test",
		});
	});

	test("hasValidQuestionGroup: cần ≥1 câu có stem + answer không rỗng", () => {
		expect(hasValidQuestionGroup(EXAM)).toBe(true);
		expect(
			hasValidQuestionGroup({
				...EXAM,
				parts: [{ passage: "dài", questions: [] }],
			}),
		).toBe(false);
		expect(
			hasValidQuestionGroup({
				...EXAM,
				parts: [
					{
						passage: "",
						questions: [
							{ stem: "Câu không đáp án?", opts: ["A", "B"], confidence: 0.9 },
						],
					},
				],
			}),
		).toBe(false);
		expect(hasValidQuestionGroup({ ...EXAM, parts: [] })).toBe(false);
	});

	test("classifyImportError: timeout > empty_result > ai_error", () => {
		expect(classifyImportError(new Error("x"), true)).toBe("timeout");
		expect(classifyImportError(new EmptyResultError(), false)).toBe(
			"empty_result",
		);
		expect(classifyImportError(new Error("boom"), false)).toBe("ai_error");
	});

	test("timeout 50ms với extractor treo: released + reason timeout", async () => {
		await db.insert(schema.organization).values({ id: "org-1", name: "A" });
		await ensureWallet(db, "org-1");
		const jobId = "job-timeout";
		await db.insert(examImportJob).values({
			id: jobId,
			orgId: "org-1",
			createdBy: "u-1",
			fileKey: "k",
			fileName: "x.pdf",
			mimeType: "application/pdf",
			sizeBytes: 1,
			contentFingerprint: "c".repeat(64),
			heldCredits: 5,
			importStatus: "processing",
			startedAt: new Date(),
		});
		const hanging: ExamExtractor = {
			extract: () => new Promise(() => {}),
		};
		const result = await runImport({
			db,
			extractor: hanging,
			store: memoryStore().store,
			orgId: "org-1",
			userId: "u-1",
			jobId,
			fileKey: "k",
			data: new ArrayBuffer(1),
			mimeType: "application/pdf",
			fileName: "x.pdf",
			putFile: true,
			timeoutMs: 50,
		});
		expect(result).toEqual({ ok: false, kind: "refunded", reason: "timeout" });
		const wallet = await readWallet(db, "org-1");
		expect(wallet).toEqual({ balance: 30, held: 0 });
	});

	test("timeout với extractor tôn trọng AbortSignal (ném lỗi khi signal.aborted) vẫn phân loại reason timeout", async () => {
		await ensureWallet(db, "org-1");
		const jobId = "job-signal-timeout";
		await db.insert(examImportJob).values({
			id: jobId,
			orgId: "org-1",
			createdBy: "u-1",
			fileKey: "k",
			fileName: "x.pdf",
			mimeType: "application/pdf",
			sizeBytes: 1,
			contentFingerprint: "f".repeat(64),
			heldCredits: 5,
			importStatus: "processing",
			startedAt: new Date(),
		});
		const signalRespecting: ExamExtractor = {
			extract: (_input, sig) => {
				const deferred = Promise.withResolvers<{
					exam: ExtractedExam;
					pageCount: number | null;
				}>();
				sig?.addEventListener("abort", () => {
					deferred.reject(new Error("aborted by signal"));
				});
				return deferred.promise;
			},
		};
		const result = await runImport({
			db,
			extractor: signalRespecting,
			store: memoryStore().store,
			orgId: "org-1",
			userId: "u-1",
			jobId,
			fileKey: "k",
			data: new ArrayBuffer(1),
			mimeType: "application/pdf",
			fileName: "x.pdf",
			putFile: true,
			timeoutMs: 30,
		});
		expect(result).toEqual({ ok: false, kind: "refunded", reason: "timeout" });
		expect(await readWallet(db, "org-1")).toEqual({ balance: 30, held: 0 });
	});

	test("kết quả AI về muộn sau khi đã release: KHÔNG settle", async () => {
		await ensureWallet(db, "org-1");
		const jobId = "job-late";
		await db.insert(examImportJob).values({
			id: jobId,
			orgId: "org-1",
			createdBy: "u-1",
			fileKey: "k",
			fileName: "x.pdf",
			mimeType: "application/pdf",
			sizeBytes: 1,
			contentFingerprint: "d".repeat(64),
			heldCredits: 5,
			importStatus: "processing",
			startedAt: new Date(),
		});
		let resolveExtract: (value: {
			exam: ExtractedExam;
			pageCount: number | null;
		}) => void = () => {};
		const lazy: ExamExtractor = {
			extract: () =>
				new Promise((resolve) => {
					resolveExtract = resolve;
				}),
		};
		const pending = runImport({
			db,
			extractor: lazy,
			store: memoryStore().store,
			orgId: "org-1",
			userId: "u-1",
			jobId,
			fileKey: "k",
			data: new ArrayBuffer(1),
			mimeType: "application/pdf",
			fileName: "x.pdf",
			putFile: true,
			timeoutMs: 5_000,
		});
		// Mô phỏng stale sweep chen giữa: release + mark failed_refunded.
		await releaseCredits(db, {
			orgId: "org-1",
			actorUserId: "u-1",
			amount: 5,
			refId: jobId,
		});
		await db
			.update(examImportJob)
			.set({ importStatus: "failed_refunded", errorReason: "timeout" })
			.where(eq(examImportJob.id, jobId));
		resolveExtract({ exam: EXAM, pageCount: 1 });
		const result = await pending;
		// Settle muộn bị chặn bởi precondition `held >= amount` của ví —
		// balance nguyên, job giữ kết quả failed của sweep.
		expect(result).toEqual({ ok: false, kind: "refunded", reason: "timeout" });
		expect(await readWallet(db, "org-1")).toEqual({ balance: 30, held: 0 });
		const [row] = await db
			.select()
			.from(examImportJob)
			.where(eq(examImportJob.id, jobId));
		expect(row?.importStatus).toBe("failed_refunded");
		expect(row?.draftJson).toBeNull();
	});

	test("extract thành công: settle + mark completed điều kiện processing", async () => {
		await ensureWallet(db, "org-1");
		const jobId = "job-ok";
		await db.insert(examImportJob).values({
			id: jobId,
			orgId: "org-1",
			createdBy: "u-1",
			fileKey: "k",
			fileName: "x.pdf",
			mimeType: "application/pdf",
			sizeBytes: 1,
			contentFingerprint: "e".repeat(64),
			heldCredits: 5,
			importStatus: "processing",
			startedAt: new Date(),
		});
		const { store } = memoryStore();
		const result = await runImport({
			db,
			extractor: createFakeExamExtractor(),
			store,
			orgId: "org-1",
			userId: "u-1",
			jobId,
			fileKey: "k",
			data: new ArrayBuffer(1),
			mimeType: "application/pdf",
			fileName: "x.pdf",
			putFile: true,
		});
		expect(result.ok).toBe(true);
		const wallet = await readWallet(db, "org-1");
		expect(wallet).toEqual({ balance: 25, held: 0 });
	});
});
