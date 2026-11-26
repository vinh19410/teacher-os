/**
 * Hàng đợi tải nhiều file tài liệu thuần TypeScript (không phụ thuộc React):
 * kiểm định từng file trước khi gửi, chống trùng theo dấu vân tay, chạy song
 * song có trần concurrency, cô lập lỗi từng file và dừng hàng đợi ngay khi 401.
 */
import { isHttpError } from "@/lib/kernel-load-state";
import {
	materialErrorMessage,
	prepareMaterialUpload,
} from "@/lib/repos/materials";

export const MATERIAL_FILE_ACCEPT =
	".pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.mp3,.m4a,.mp4";

export const MATERIAL_UPLOAD_CONCURRENCY = 3;

export type MaterialUploadItemStatus =
	| "pending"
	| "uploading"
	| "done"
	| "invalid"
	| "error";

export interface MaterialUploadQueueItem {
	id: string;
	file: File;
	fingerprint: string;
	status: MaterialUploadItemStatus;
	mimeType: string | null;
	errorMessage: string | null;
}

export type ValidMaterialUploadQueueItem = MaterialUploadQueueItem & {
	mimeType: string;
};

export interface MaterialUploadBatchSummary {
	total: number;
	validTotal: number;
	pending: number;
	uploading: number;
	done: number;
	invalid: number;
	error: number;
	completedValid: number;
	progressPercent: number;
	isUploading: boolean;
}

export interface MergeUploadQueueFilesResult {
	items: MaterialUploadQueueItem[];
	addedCount: number;
	skippedDuplicates: number;
}

export interface RunUploadQueueOptions<TResult> {
	items: readonly MaterialUploadQueueItem[];
	targetStatuses: readonly ("pending" | "error")[];
	concurrency?: number;
	upload: (item: ValidMaterialUploadQueueItem) => Promise<TResult>;
	onItemStart?: (id: string) => void;
	onItemSuccess?: (id: string, result: TResult) => void;
	onItemError?: (id: string, message: string, error: unknown) => void;
	onUnauthorized?: () => void;
}

export interface RunUploadQueueResult<TResult> {
	succeeded: Array<{ id: string; result: TResult }>;
	failed: Array<{ id: string; message: string; error: unknown }>;
	unauthorized: boolean;
	shouldInvalidate: boolean;
}

/** Dấu vân tay phát hiện file trùng trong cùng hàng đợi chọn. */
export function materialFileFingerprint(file: File): string {
	return `${file.name}\0${file.size}\0${file.lastModified}`;
}

/** Tạo phần tử hàng đợi kèm kết quả kiểm tra MIME và dung lượng phía client. */
export function createUploadQueueItem(
	file: File,
	id?: string,
): MaterialUploadQueueItem {
	const prep = prepareMaterialUpload(file);
	const itemId = id ?? crypto.randomUUID();
	const fingerprint = materialFileFingerprint(file);
	if (prep.ok) {
		return {
			id: itemId,
			file,
			fingerprint,
			status: "pending",
			mimeType: prep.mimeType,
			errorMessage: null,
		};
	}
	return {
		id: itemId,
		file,
		fingerprint,
		status: "invalid",
		mimeType: null,
		errorMessage: prep.message,
	};
}

/**
 * Gộp danh sách file mới vào hàng đợi hiện có và lọc bỏ file trùng dấu vân tay
 * (so với cả hàng đợi nền lẫn các file đứng trước trong cùng đợt chọn).
 */
export function mergeUploadQueueFiles(
	existing: readonly MaterialUploadQueueItem[],
	incoming: readonly File[],
	options?: { replaceIfOnlyInvalid?: boolean },
): MergeUploadQueueFilesResult {
	const shouldReplace =
		options?.replaceIfOnlyInvalid === true &&
		existing.length > 0 &&
		existing.every((item) => item.status === "invalid");
	const base = shouldReplace ? [] : [...existing];
	const seen = new Set(base.map((item) => item.fingerprint));
	const items = [...base];
	let addedCount = 0;
	let skippedDuplicates = 0;

	for (const file of incoming) {
		const fingerprint = materialFileFingerprint(file);
		if (seen.has(fingerprint)) {
			skippedDuplicates += 1;
			continue;
		}
		seen.add(fingerprint);
		items.push(createUploadQueueItem(file));
		addedCount += 1;
	}

	return { items, addedCount, skippedDuplicates };
}

/** Tổng hợp số lượng theo trạng thái và phần trăm tiến độ cho các file hợp lệ. */
export function summarizeUploadQueue(
	items: readonly MaterialUploadQueueItem[],
	runningOverride?: boolean,
): MaterialUploadBatchSummary {
	let pending = 0;
	let uploading = 0;
	let done = 0;
	let invalid = 0;
	let error = 0;

	for (const item of items) {
		switch (item.status) {
			case "pending":
				pending += 1;
				break;
			case "uploading":
				uploading += 1;
				break;
			case "done":
				done += 1;
				break;
			case "invalid":
				invalid += 1;
				break;
			case "error":
				error += 1;
				break;
		}
	}

	const validTotal = pending + uploading + done + error;
	const completedValid = done + error;
	const progressPercent =
		validTotal === 0 ? 0 : Math.round((completedValid / validTotal) * 100);

	return {
		total: items.length,
		validTotal,
		pending,
		uploading,
		done,
		invalid,
		error,
		completedValid,
		progressPercent,
		isUploading: runningOverride === true || uploading > 0,
	};
}

function hasResolvedMimeType(
	item: MaterialUploadQueueItem,
): item is ValidMaterialUploadQueueItem {
	return item.mimeType !== null;
}

/**
 * Chạy tải lên cho các phần tử thuộc `targetStatuses` với tối đa `concurrency`
 * luồng đồng thời. Lỗi của một file không chặn các file còn lại, ngoại trừ 401
 * (hết phiên) sẽ dừng nhận việc mới và gọi `onUnauthorized` tối đa một lần.
 */
export async function runUploadQueue<TResult>(
	options: RunUploadQueueOptions<TResult>,
): Promise<RunUploadQueueResult<TResult>> {
	const targetSet = new Set<MaterialUploadItemStatus>(options.targetStatuses);
	const targets: ValidMaterialUploadQueueItem[] = [];
	for (const item of options.items) {
		if (targetSet.has(item.status) && hasResolvedMimeType(item)) {
			targets.push(item);
		}
	}

	if (targets.length === 0) {
		return {
			succeeded: [],
			failed: [],
			unauthorized: false,
			shouldInvalidate: false,
		};
	}

	const rawConcurrency = options.concurrency ?? MATERIAL_UPLOAD_CONCURRENCY;
	const concurrency = Number.isFinite(rawConcurrency)
		? Math.max(1, Math.floor(rawConcurrency))
		: MATERIAL_UPLOAD_CONCURRENCY;

	let cursor = 0;
	let unauthorized = false;
	const succeeded: Array<{ id: string; result: TResult }> = [];
	const failed: Array<{ id: string; message: string; error: unknown }> = [];

	async function worker(): Promise<void> {
		while (true) {
			if (unauthorized) return;
			const index = cursor;
			if (index >= targets.length) return;
			cursor += 1;
			const item = targets[index];
			if (!item) return;

			options.onItemStart?.(item.id);
			let result: TResult;
			try {
				result = await options.upload(item);
			} catch (error) {
				const message = materialErrorMessage(error);
				failed.push({ id: item.id, message, error });
				options.onItemError?.(item.id, message, error);
				if (isHttpError(error) && error.status === 401 && !unauthorized) {
					unauthorized = true;
					options.onUnauthorized?.();
				}
				continue;
			}
			succeeded.push({ id: item.id, result });
			options.onItemSuccess?.(item.id, result);
		}
	}

	const workerCount = Math.min(concurrency, targets.length);
	await Promise.all(Array.from({ length: workerCount }, () => worker()));

	const shouldInvalidate =
		succeeded.length > 0 ||
		failed.some(
			(entry) =>
				isHttpError(entry.error) &&
				(entry.error.status === 404 || entry.error.status === 409),
		);

	return {
		succeeded,
		failed,
		unauthorized,
		shouldInvalidate,
	};
}
