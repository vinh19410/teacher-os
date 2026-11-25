import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/kernel-load-state";
import {
	createUploadQueueItem,
	MATERIAL_FILE_ACCEPT,
	MATERIAL_UPLOAD_CONCURRENCY,
	type MaterialUploadQueueItem,
	materialFileFingerprint,
	mergeUploadQueueFiles,
	runUploadQueue,
	summarizeUploadQueue,
} from "@/lib/material-upload-queue";
import { MaterialRequestError } from "@/lib/repos/materials";

function makeFile(
	name: string,
	options: { type?: string; size?: number; lastModified?: number } = {},
): File {
	const file = new File(["sample"], name, {
		type: options.type ?? "application/pdf",
		lastModified: options.lastModified ?? 1_700_000_000_000,
	});
	if (options.size !== undefined) {
		Object.defineProperty(file, "size", { value: options.size });
	}
	return file;
}

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("material-upload-queue core helpers", () => {
	it("exports expected accept list and default concurrency", () => {
		expect(MATERIAL_FILE_ACCEPT).toBe(
			".pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.mp3,.m4a,.mp4",
		);
		expect(MATERIAL_UPLOAD_CONCURRENCY).toBe(3);
	});

	it("creates pending items for valid files and invalid items for rejected files", () => {
		const validFile = makeFile("bai-doc.pdf", { type: "", size: 1024 });
		const validItem = createUploadQueueItem(validFile, "item-1");
		expect(validItem).toEqual({
			id: "item-1",
			file: validFile,
			fingerprint: materialFileFingerprint(validFile),
			status: "pending",
			mimeType: "application/pdf",
			errorMessage: null,
		});

		const invalidFile = makeFile("script.html", {
			type: "text/html",
			size: 512,
		});
		const invalidItem = createUploadQueueItem(invalidFile, "item-2");
		expect(invalidItem.id).toBe("item-2");
		expect(invalidItem.status).toBe("invalid");
		expect(invalidItem.mimeType).toBeNull();
		expect(invalidItem.errorMessage).toMatch(/Định dạng chưa hỗ trợ/);

		const oversized = createUploadQueueItem(
			makeFile("huge.pdf", {
				type: "application/pdf",
				size: 26 * 1024 * 1024,
			}),
		);
		expect(oversized.id).toBeTruthy();
		expect(oversized.status).toBe("invalid");
		expect(oversized.errorMessage).toBe("File quá lớn — tối đa 25 MB.");
	});

	it("summarizes queue counts, progress percent, and uploading flag", () => {
		expect(summarizeUploadQueue([])).toEqual({
			total: 0,
			validTotal: 0,
			pending: 0,
			uploading: 0,
			done: 0,
			invalid: 0,
			error: 0,
			completedValid: 0,
			progressPercent: 0,
			isUploading: false,
		});

		const items: MaterialUploadQueueItem[] = [
			createUploadQueueItem(makeFile("a.pdf"), "1"),
			{ ...createUploadQueueItem(makeFile("b.pdf"), "2"), status: "uploading" },
			{ ...createUploadQueueItem(makeFile("c.pdf"), "3"), status: "done" },
			{
				...createUploadQueueItem(makeFile("d.pdf"), "4"),
				status: "error",
				errorMessage: "Lỗi",
			},
			createUploadQueueItem(makeFile("bad.html", { type: "text/html" }), "5"),
		];

		expect(summarizeUploadQueue(items)).toEqual({
			total: 5,
			validTotal: 4,
			pending: 1,
			uploading: 1,
			done: 1,
			invalid: 1,
			error: 1,
			completedValid: 2,
			progressPercent: 50,
			isUploading: true,
		});

		const invalidOnly = [
			createUploadQueueItem(makeFile("bad.html", { type: "text/html" }), "bad"),
		];
		expect(summarizeUploadQueue(invalidOnly).progressPercent).toBe(0);
		expect(summarizeUploadQueue(invalidOnly, true).isUploading).toBe(true);
	});
});

describe("mergeUploadQueueFiles", () => {
	it("appends new files and deduplicates within a single drop and across calls", () => {
		const f1 = makeFile("unit1.pdf", { size: 100, lastModified: 1000 });
		const f1Clone = makeFile("unit1.pdf", { size: 100, lastModified: 1000 });
		const f2 = makeFile("unit2.pdf", { size: 200, lastModified: 1000 });
		const f1Modified = makeFile("unit1.pdf", { size: 100, lastModified: 2000 });

		const first = mergeUploadQueueFiles([], [f1, f1Clone, f2]);
		expect(first.addedCount).toBe(2);
		expect(first.skippedDuplicates).toBe(1);
		expect(first.items.map((item) => item.file.name)).toEqual([
			"unit1.pdf",
			"unit2.pdf",
		]);

		const second = mergeUploadQueueFiles(first.items, [f2, f1Modified]);
		expect(second.addedCount).toBe(1);
		expect(second.skippedDuplicates).toBe(1);
		expect(second.items).toHaveLength(3);
		expect(second.items[2]?.file).toBe(f1Modified);
	});

	it("replaces an invalid-only list when replaceIfOnlyInvalid is true while preserving mixed lists", () => {
		const bad1 = makeFile("bad.html", { type: "text/html", size: 20 });
		const bad2 = makeFile("bad.exe", {
			type: "application/octet-stream",
			size: 30,
		});
		const good = makeFile("good.pdf", { size: 100 });
		const good2 = makeFile("good2.pdf", { size: 120 });

		const invalidOnly = mergeUploadQueueFiles([], [bad1, bad2]).items;
		const replaced = mergeUploadQueueFiles(invalidOnly, [good, bad1], {
			replaceIfOnlyInvalid: true,
		});
		expect(replaced.addedCount).toBe(2);
		expect(replaced.skippedDuplicates).toBe(0);
		expect(replaced.items.map((item) => item.file.name)).toEqual([
			"good.pdf",
			"bad.html",
		]);

		// Danh sách hỗn hợp (pending + invalid) phải giữ nguyên các mục cũ.
		const preserved = mergeUploadQueueFiles(replaced.items, [good2, bad1], {
			replaceIfOnlyInvalid: true,
		});
		expect(preserved.addedCount).toBe(1);
		expect(preserved.skippedDuplicates).toBe(1);
		expect(preserved.items.map((item) => item.file.name)).toEqual([
			"good.pdf",
			"bad.html",
			"good2.pdf",
		]);
	});
});

describe("runUploadQueue", () => {
	it("enforces max concurrency of 3 across 7 files using deferred promises", async () => {
		const items = Array.from({ length: 7 }, (_, idx) =>
			createUploadQueueItem(
				makeFile(`file-${idx + 1}.pdf`, { size: 100 + idx }),
				`id-${idx + 1}`,
			),
		);

		let active = 0;
		let peakActive = 0;
		const deferredById = new Map<string, Deferred<string>>();
		const startedIds: string[] = [];

		const upload = vi.fn(
			(item: MaterialUploadQueueItem & { mimeType: string }) => {
				active += 1;
				peakActive = Math.max(peakActive, active);
				const deferred = createDeferred<string>();
				deferredById.set(item.id, deferred);
				return deferred.promise.finally(() => {
					active -= 1;
				});
			},
		);

		const runPromise = runUploadQueue({
			items,
			targetStatuses: ["pending"],
			upload,
			onItemStart: (id) => startedIds.push(id),
		});

		// Ban đầu chỉ đúng 3 worker chạy đồng thời.
		expect(active).toBe(3);
		expect(peakActive).toBe(3);
		expect(startedIds).toEqual(["id-1", "id-2", "id-3"]);

		// Hoàn tất từng file và xác nhận số lượng đang chạy không vượt quá 3.
		for (const id of ["id-1", "id-2", "id-3", "id-4", "id-5", "id-6", "id-7"]) {
			deferredById.get(id)?.resolve(`ok-${id}`);
			await Promise.resolve();
			await Promise.resolve();
			expect(active).toBeLessThanOrEqual(3);
		}

		const result = await runPromise;
		expect(peakActive).toBe(3);
		expect(active).toBe(0);
		expect(result.succeeded).toHaveLength(7);
		expect(result.failed).toEqual([]);
		expect(result.unauthorized).toBe(false);
		expect(result.shouldInvalidate).toBe(true);
	});

	it("isolates partial failures and continues uploading remaining files", async () => {
		const items = [
			createUploadQueueItem(makeFile("ok1.pdf", { size: 10 }), "ok-1"),
			createUploadQueueItem(makeFile("fail.pdf", { size: 20 }), "fail-1"),
			createUploadQueueItem(makeFile("ok2.pdf", { size: 30 }), "ok-2"),
			createUploadQueueItem(
				makeFile("bad.html", { type: "text/html", size: 40 }),
				"bad-1",
			),
		];
		const onItemStart = vi.fn();
		const onItemSuccess = vi.fn();
		const onItemError = vi.fn();

		const result = await runUploadQueue({
			items,
			targetStatuses: ["pending"],
			concurrency: 2,
			upload: async (item) => {
				if (item.id === "fail-1") {
					throw new MaterialRequestError(500, null);
				}
				return `uploaded:${item.id}`;
			},
			onItemStart,
			onItemSuccess,
			onItemError,
		});

		expect(result.succeeded).toEqual([
			{ id: "ok-1", result: "uploaded:ok-1" },
			{ id: "ok-2", result: "uploaded:ok-2" },
		]);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]?.id).toBe("fail-1");
		expect(result.failed[0]?.message).toBe(
			"Không lưu được — vui lòng thử lại.",
		);
		expect(result.unauthorized).toBe(false);
		expect(result.shouldInvalidate).toBe(true);
		expect(onItemStart).toHaveBeenCalledTimes(3);
		expect(onItemSuccess).toHaveBeenCalledTimes(2);
		expect(onItemError).toHaveBeenCalledTimes(1);
	});

	it("computes shouldInvalidate for 201, 404, 409, and false for 500-only failures", async () => {
		const singleItem = [
			createUploadQueueItem(makeFile("doc.pdf", { size: 10 }), "m-1"),
		];

		const res500 = await runUploadQueue({
			items: singleItem,
			targetStatuses: ["pending"],
			upload: async () => {
				throw new HttpError(500, "boom");
			},
		});
		expect(res500.shouldInvalidate).toBe(false);

		const res404 = await runUploadQueue({
			items: singleItem,
			targetStatuses: ["pending"],
			upload: async () => {
				throw new MaterialRequestError(404, "FOLDER_NOT_FOUND");
			},
		});
		expect(res404.shouldInvalidate).toBe(true);

		const res409 = await runUploadQueue({
			items: singleItem,
			targetStatuses: ["pending"],
			upload: async () => {
				throw new MaterialRequestError(409, "ALREADY_ATTACHED");
			},
		});
		expect(res409.shouldInvalidate).toBe(true);

		const res201 = await runUploadQueue({
			items: singleItem,
			targetStatuses: ["pending"],
			upload: async () => ({ id: "created" }),
		});
		expect(res201.shouldInvalidate).toBe(true);
	});

	it("stops remaining pending items and fires onUnauthorized once on 401 with multiple active workers", async () => {
		const items = Array.from({ length: 6 }, (_, idx) =>
			createUploadQueueItem(
				makeFile(`doc-${idx + 1}.pdf`, { size: 100 + idx }),
				`id-${idx + 1}`,
			),
		);
		const deferredById = new Map<string, Deferred<string>>();
		const startedIds: string[] = [];
		const onUnauthorized = vi.fn();

		const runPromise = runUploadQueue({
			items,
			targetStatuses: ["pending"],
			concurrency: 3,
			upload: (item) => {
				const deferred = createDeferred<string>();
				deferredById.set(item.id, deferred);
				return deferred.promise;
			},
			onItemStart: (id) => startedIds.push(id),
			onUnauthorized,
		});

		expect(startedIds).toEqual(["id-1", "id-2", "id-3"]);

		// Hai worker đang chạy cùng trả 401, worker thứ ba trả 500.
		deferredById.get("id-1")?.reject(new HttpError(401, "expired"));
		deferredById.get("id-2")?.reject(new HttpError(401, "expired"));
		deferredById.get("id-3")?.reject(new HttpError(500, "err"));

		const result = await runPromise;
		expect(result.unauthorized).toBe(true);
		expect(result.shouldInvalidate).toBe(false);
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
		// Các file id-4, id-5, id-6 không được bắt đầu sau khi hết phiên.
		expect(startedIds).toEqual(["id-1", "id-2", "id-3"]);
		expect(result.failed.map((f) => f.id)).toEqual(["id-1", "id-2", "id-3"]);
	});

	it("retries only error items when targetStatuses is error without re-uploading done or invalid items", async () => {
		const items: MaterialUploadQueueItem[] = [
			{
				...createUploadQueueItem(makeFile("done.pdf"), "done-1"),
				status: "done",
			},
			{
				...createUploadQueueItem(makeFile("err1.pdf"), "err-1"),
				status: "error",
				errorMessage: "Lỗi mạng",
			},
			createUploadQueueItem(
				makeFile("bad.html", { type: "text/html" }),
				"bad-1",
			),
			createUploadQueueItem(makeFile("pend.pdf"), "pend-1"),
			{
				...createUploadQueueItem(makeFile("err2.pdf"), "err-2"),
				status: "error",
				errorMessage: "Lỗi máy chủ",
			},
		];
		const uploadedIds: string[] = [];

		const result = await runUploadQueue({
			items,
			targetStatuses: ["error"],
			upload: async (item) => {
				uploadedIds.push(item.id);
				return item.id;
			},
		});

		expect(uploadedIds).toEqual(["err-1", "err-2"]);
		expect(result.succeeded.map((s) => s.id)).toEqual(["err-1", "err-2"]);
		expect(result.failed).toEqual([]);
	});

	it("skips items without a resolved mimeType and returns an empty result when nothing matches", async () => {
		const upload = vi.fn(async () => "ok");
		const malformedPending: MaterialUploadQueueItem = {
			...createUploadQueueItem(makeFile("doc.pdf"), "no-mime"),
			status: "pending",
			mimeType: null,
		};

		const result = await runUploadQueue({
			items: [malformedPending],
			targetStatuses: ["pending"],
			upload,
		});

		expect(upload).not.toHaveBeenCalled();
		expect(result).toEqual({
			succeeded: [],
			failed: [],
			unauthorized: false,
			shouldInvalidate: false,
		});
	});
});
