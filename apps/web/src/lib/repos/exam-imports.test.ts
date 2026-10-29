import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createExamImport,
	lookupExamImportByFingerprint,
} from "./exam-imports";

/**
 * TOS-25 (#471): `createExamImport` trả union job | duplicate (response 200
 * của POST giờ có 2 shape) và `lookupExamImportByFingerprint` parse
 * `{ duplicate }`. Transport POST raw-body đã đóng băng từ TOS-24 — ở đây
 * chỉ khoá hành vi parse/narrow + error mapping liên quan dedupe.
 */

const jobDto = {
	id: "job-1",
	fileName: "cambridge-sample.pdf",
	mimeType: "application/pdf",
	sizeBytes: 2048,
	pageCount: 2,
	contentFingerprint: "a".repeat(64),
	heldCredits: 5,
	importStatus: "completed",
	draft: null,
	errorCode: null,
	createdAt: "2026-10-27T00:00:00Z",
	startedAt: "2026-10-27T00:00:00Z",
	completedAt: "2026-10-27T00:01:00Z",
};

const duplicateDto = {
	jobId: "job-1",
	title: "Cambridge IELTS Sample",
	completedAt: "2026-10-27T00:01:00Z",
};

const file = new File([new Uint8Array(8).fill(0x25)], "sample.pdf", {
	type: "application/pdf",
});

describe("exam-imports repo (TOS-25)", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("createExamImport: 200 job DTO → { kind: 'created', job }", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => jobDto,
		});
		globalThis.fetch = fetchMock;

		const result = await createExamImport({
			file,
			baseUrl: "http://localhost:8000",
		});
		expect(result).toEqual({ kind: "created", job: jobDto });
	});

	it("createExamImport: 200 {duplicateOf} → { kind: 'duplicate', duplicate }", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ duplicateOf: duplicateDto }),
		});
		globalThis.fetch = fetchMock;

		const result = await createExamImport({
			file,
			baseUrl: "http://localhost:8000",
		});
		expect(result).toEqual({ kind: "duplicate", duplicate: duplicateDto });
	});

	it("createExamImport: 200 body không khớp union → throw (không nuốt)", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ vôDanh: true }),
		});
		globalThis.fetch = fetchMock;

		await expect(
			createExamImport({ file, baseUrl: "http://localhost:8000" }),
		).rejects.toThrow();
	});

	it("lookupExamImportByFingerprint: 200 → duplicate; null → null", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ duplicate: duplicateDto }),
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ duplicate: null }),
			});
		globalThis.fetch = fetchMock;

		const hit = await lookupExamImportByFingerprint(
			"a".repeat(64),
			"http://localhost:8000",
		);
		expect(hit).toEqual(duplicateDto);
		// URL encode query param.
		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			`http://localhost:8000/api/exam-imports/lookup?fingerprint=${"a".repeat(64)}`,
			{ credentials: "include", signal: undefined },
		);
		const miss = await lookupExamImportByFingerprint(
			"b".repeat(64),
			"http://localhost:8000",
		);
		expect(miss).toBeNull();
	});

	it("lookupExamImportByFingerprint: server lỗi → throw cho caller fail-open", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: async () => ({}),
		});
		globalThis.fetch = fetchMock;

		await expect(
			lookupExamImportByFingerprint("a".repeat(64), "http://localhost:8000"),
		).rejects.toThrow(/Failed to lookup/);
	});
});
