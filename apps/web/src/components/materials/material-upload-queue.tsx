import { useQueryClient } from "@tanstack/react-query";
import {
	AlertCircle,
	CheckCircle2,
	Clock,
	Loader2,
	X,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import {
	MATERIAL_FILE_ACCEPT,
	type MaterialUploadBatchSummary,
	type MaterialUploadItemStatus,
	type MaterialUploadQueueItem,
	mergeUploadQueueFiles,
	type RunUploadQueueOptions,
	type RunUploadQueueResult,
	runUploadQueue,
	summarizeUploadQueue,
	type ValidMaterialUploadQueueItem,
} from "@/lib/material-upload-queue";
import { reauth } from "@/lib/reauth";
import { formatBytes, materialsAllQueryKey } from "@/lib/repos/materials";

export {
	MATERIAL_FILE_ACCEPT,
	type MaterialUploadBatchSummary,
	type MaterialUploadItemStatus,
	type MaterialUploadQueueItem,
	type RunUploadQueueOptions,
	type RunUploadQueueResult,
	type ValidMaterialUploadQueueItem,
};

export interface MaterialUploadBatchSettledOutcome<TResult> {
	run: RunUploadQueueResult<TResult>;
	items: readonly MaterialUploadQueueItem[];
	summary: MaterialUploadBatchSummary;
}

export interface UseMaterialUploadQueueOptions<TResult> {
	upload: (input: { file: File; mimeType: string }) => Promise<TResult>;
	onFileUploaded?: (result: TResult, item: MaterialUploadQueueItem) => void;
	onBatchSettled?: (
		outcome: MaterialUploadBatchSettledOutcome<TResult>,
	) => void | Promise<void>;
	concurrency?: number;
}

/**
 * Hook quản lý hàng đợi tải nhiều file tài liệu: giữ state đồng bộ qua ref để
 * tránh closure cũ khi chạy song song, invalidate cache ngân hàng đúng một lần
 * cuối đợt và tự bỏ cập nhật nếu component đã unmount.
 */
export function useMaterialUploadQueue<TResult>(
	options: UseMaterialUploadQueueOptions<TResult>,
) {
	const queryClient = useQueryClient();
	const uploadRef = useRef(options.upload);
	uploadRef.current = options.upload;
	const onFileUploadedRef = useRef(options.onFileUploaded);
	onFileUploadedRef.current = options.onFileUploaded;
	const onBatchSettledRef = useRef(options.onBatchSettled);
	onBatchSettledRef.current = options.onBatchSettled;
	const concurrencyRef = useRef(options.concurrency);
	concurrencyRef.current = options.concurrency;

	const [items, setItems] = useState<MaterialUploadQueueItem[]>([]);
	const itemsRef = useRef<MaterialUploadQueueItem[]>(items);
	const [running, setRunning] = useState(false);
	const runningRef = useRef(false);
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const commitItems = useCallback((next: MaterialUploadQueueItem[]) => {
		itemsRef.current = next;
		if (mountedRef.current) {
			setItems(next);
		}
	}, []);

	const updateItemById = useCallback(
		(
			id: string,
			updater: (item: MaterialUploadQueueItem) => MaterialUploadQueueItem,
		): MaterialUploadQueueItem | undefined => {
			let updated: MaterialUploadQueueItem | undefined;
			const next = itemsRef.current.map((item) => {
				if (item.id !== id) return item;
				updated = updater(item);
				return updated;
			});
			commitItems(next);
			return updated;
		},
		[commitItems],
	);

	const addFiles = useCallback(
		(
			files: FileList | readonly File[],
			addOptions?: { replaceIfOnlyInvalid?: boolean },
		) => {
			if (runningRef.current) {
				return {
					items: itemsRef.current,
					addedCount: 0,
					skippedDuplicates: 0,
				};
			}
			const fileArray = Array.from(files);
			if (fileArray.length === 0) {
				return {
					items: itemsRef.current,
					addedCount: 0,
					skippedDuplicates: 0,
				};
			}
			const merged = mergeUploadQueueFiles(
				itemsRef.current,
				fileArray,
				addOptions,
			);
			commitItems(merged.items);
			return merged;
		},
		[commitItems],
	);

	const removeItem = useCallback(
		(id: string) => {
			if (runningRef.current) return;
			commitItems(itemsRef.current.filter((item) => item.id !== id));
		},
		[commitItems],
	);

	const clear = useCallback(() => {
		if (runningRef.current) return;
		commitItems([]);
	}, [commitItems]);

	const execute = useCallback(
		async (
			targetStatuses: readonly ("pending" | "error")[],
			itemsOverride?: readonly MaterialUploadQueueItem[],
		): Promise<RunUploadQueueResult<TResult> | null> => {
			if (runningRef.current) return null;
			const source = itemsOverride ?? itemsRef.current;
			const targetSet = new Set<MaterialUploadItemStatus>(targetStatuses);
			const hasTargets = source.some(
				(item) => targetSet.has(item.status) && item.mimeType !== null,
			);
			if (!hasTargets) return null;

			if (itemsOverride && itemsOverride !== itemsRef.current) {
				commitItems([...itemsOverride]);
			}

			runningRef.current = true;
			if (mountedRef.current) {
				setRunning(true);
			}

			let run: RunUploadQueueResult<TResult>;
			try {
				run = await runUploadQueue({
					items: source,
					targetStatuses,
					concurrency: concurrencyRef.current,
					upload: (item) =>
						uploadRef.current({ file: item.file, mimeType: item.mimeType }),
					onItemStart: (id) => {
						updateItemById(id, (item) => ({
							...item,
							status: "uploading",
							errorMessage: null,
						}));
					},
					onItemSuccess: (id, result) => {
						const updated = updateItemById(id, (item) => ({
							...item,
							status: "done",
							errorMessage: null,
						}));
						if (mountedRef.current && updated) {
							onFileUploadedRef.current?.(result, updated);
						}
					},
					onItemError: (id, message) => {
						updateItemById(id, (item) => ({
							...item,
							status: "error",
							errorMessage: message,
						}));
					},
					onUnauthorized: () => {
						reauth();
					},
				});
			} finally {
				runningRef.current = false;
				if (mountedRef.current) {
					setRunning(false);
				}
			}

			if (run.shouldInvalidate) {
				await queryClient.invalidateQueries({ queryKey: materialsAllQueryKey });
			}
			if (!run.unauthorized && mountedRef.current) {
				await onBatchSettledRef.current?.({
					run,
					items: itemsRef.current,
					summary: summarizeUploadQueue(itemsRef.current, false),
				});
			}
			return run;
		},
		[commitItems, queryClient, updateItemById],
	);

	const startUpload = useCallback(
		(itemsOverride?: readonly MaterialUploadQueueItem[]) =>
			execute(["pending"], itemsOverride),
		[execute],
	);

	const retryFailed = useCallback(() => execute(["error"]), [execute]);

	const uploadFilesNow = useCallback(
		async (files: FileList | readonly File[]) => {
			if (runningRef.current) {
				return { items: itemsRef.current, run: null };
			}
			const fileArray = Array.from(files);
			if (fileArray.length === 0) {
				return { items: itemsRef.current, run: null };
			}
			const nextItems = mergeUploadQueueFiles([], fileArray).items;
			commitItems(nextItems);
			if (nextItems.some((item) => item.status === "pending")) {
				const run = await execute(["pending"], nextItems);
				return { items: itemsRef.current, run };
			}
			return { items: nextItems, run: null };
		},
		[commitItems, execute],
	);

	const summary = summarizeUploadQueue(items, running);

	return {
		items,
		summary,
		isUploading: running,
		addFiles,
		removeItem,
		clear,
		startUpload,
		uploadFilesNow,
		retryFailed,
	};
}

const STATUS_LABELS: Record<MaterialUploadItemStatus, string> = {
	pending: "Chờ tải",
	uploading: "Đang tải…",
	done: "Đã tải",
	invalid: "Không hợp lệ",
	error: "Lỗi",
};

const STATUS_LABEL_CLASS: Record<MaterialUploadItemStatus, string> = {
	pending: "text-muted-foreground",
	uploading: "text-foreground",
	done: "text-success",
	invalid: "text-destructive",
	error: "text-destructive",
};

function StatusIcon({ status }: { status: MaterialUploadItemStatus }) {
	switch (status) {
		case "pending":
			return (
				<Clock aria-hidden="true" className="size-3.5 text-muted-foreground" />
			);
		case "uploading":
			return (
				<Loader2
					aria-hidden="true"
					className="size-3.5 animate-spin text-primary motion-reduce:animate-none"
				/>
			);
		case "done":
			return (
				<CheckCircle2 aria-hidden="true" className="size-3.5 text-success" />
			);
		case "invalid":
			return (
				<AlertCircle aria-hidden="true" className="size-3.5 text-destructive" />
			);
		case "error":
			return (
				<XCircle aria-hidden="true" className="size-3.5 text-destructive" />
			);
	}
}

function formatQueueStatusText(summary: MaterialUploadBatchSummary): string {
	if (summary.isUploading) {
		return `Đang tải ${summary.completedValid}/${summary.validTotal} file…`;
	}
	if (summary.validTotal > 0 && summary.completedValid > 0) {
		if (
			summary.done === summary.validTotal &&
			summary.error === 0 &&
			summary.invalid === 0
		) {
			return `Đã tải xong ${summary.done}/${summary.validTotal} file.`;
		}
		const parts = [`Đã tải ${summary.done}/${summary.validTotal} file`];
		if (summary.error > 0) parts.push(`${summary.error} lỗi`);
		if (summary.invalid > 0) parts.push(`${summary.invalid} không hợp lệ`);
		return parts.join(" · ");
	}
	return `${summary.total} file đã chọn${summary.invalid > 0 ? ` (${summary.validTotal} hợp lệ, ${summary.invalid} không hợp lệ)` : ""}`;
}

function formatQueueAlertMessage(
	items: readonly MaterialUploadQueueItem[],
	summary: MaterialUploadBatchSummary,
): string | null {
	if (summary.isUploading || (summary.invalid === 0 && summary.error === 0)) {
		return null;
	}
	const problemItems = items.filter(
		(item) => item.status === "invalid" || item.status === "error",
	);
	if (problemItems.length === 1) {
		const only = problemItems[0];
		if (only?.errorMessage) return only.errorMessage;
		return only?.status === "error"
			? "1 file tải lên thất bại. Xem chi tiết bên dưới."
			: "1 file không hợp lệ. Xem chi tiết bên dưới.";
	}
	if (problemItems.length > 1) {
		if (summary.error > 0) {
			return `${summary.error} file tải lên thất bại${summary.invalid > 0 ? ` và ${summary.invalid} file không hợp lệ` : ""}. Xem chi tiết từng file bên dưới.`;
		}
		return `${summary.invalid} file không hợp lệ${summary.validTotal > 0 ? " sẽ được bỏ qua khi tải lên" : ""}. Xem chi tiết từng file bên dưới.`;
	}
	return null;
}

export interface MaterialUploadQueueListProps {
	items: readonly MaterialUploadQueueItem[];
	summary: MaterialUploadBatchSummary;
	compact?: boolean;
	allowRemove?: boolean;
	onRemove?: (id: string) => void;
	onRetryFailed?: () => void;
	onDismiss?: () => void;
	showProgress?: boolean;
	suppressAlert?: boolean;
	className?: string;
}

/**
 * Danh sách hàng đợi tải nhiều file dùng chung: thanh tiến độ tổng, vùng
 * `aria-live="polite"` duy nhất, một `role="alert"` tổng hợp khi có lỗi và
 * danh sách cuộn hiển thị trạng thái từng file.
 */
export function MaterialUploadQueueList({
	items,
	summary,
	compact = false,
	allowRemove = false,
	onRemove,
	onRetryFailed,
	onDismiss,
	showProgress = true,
	suppressAlert = false,
	className,
}: MaterialUploadQueueListProps) {
	if (items.length === 0) return null;

	const statusText = formatQueueStatusText(summary);
	const problemItems = items.filter(
		(item) => item.status === "invalid" || item.status === "error",
	);
	// Khi có đúng 1 file lỗi có thông điệp cụ thể, gắn role="alert" trực tiếp lên
	// dòng lỗi của file đó để tránh lặp câu lỗi đỏ 2 lần trong cùng hộp thoại.
	const singleAlertItemId =
		!suppressAlert &&
		!summary.isUploading &&
		problemItems.length === 1 &&
		problemItems[0]?.errorMessage
			? problemItems[0].id
			: null;
	const alertMessage =
		suppressAlert || singleAlertItemId !== null
			? null
			: formatQueueAlertMessage(items, summary);
	const shouldShowProgress =
		showProgress &&
		summary.validTotal > 0 &&
		(summary.isUploading || summary.completedValid > 0);
	const hasActions =
		!summary.isUploading && ((summary.error > 0 && onRetryFailed) || onDismiss);

	return (
		<div
			className={cn(
				"grid min-w-0 gap-2 rounded-lg border border-border bg-card",
				compact ? "p-2.5" : "p-3",
				className,
			)}
		>
			<div className="grid min-w-0 gap-1.5">
				<p
					aria-live="polite"
					className="min-w-0 break-words font-medium text-foreground text-xs tabular-nums"
				>
					{statusText}
				</p>
				{shouldShowProgress && <Progress value={summary.progressPercent} />}
			</div>

			{alertMessage && (
				<p role="alert" className="break-words text-destructive text-xs">
					{alertMessage}
				</p>
			)}

			<ul
				aria-label="Hàng đợi tải lên"
				className={cn(
					"grid min-w-0 gap-1.5 overflow-y-auto",
					compact ? "max-h-44" : "max-h-56",
				)}
			>
				{items.map((item) => {
					const canRemove =
						allowRemove &&
						!summary.isUploading &&
						item.status !== "done" &&
						Boolean(onRemove);
					return (
						<li
							key={item.id}
							className={cn(
								"flex min-w-0 items-start gap-2 rounded-md border border-border bg-card",
								compact ? "px-2 py-1.5" : "px-2.5 py-2",
							)}
						>
							<span
								aria-hidden="true"
								className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-muted"
							>
								<StatusIcon status={item.status} />
							</span>
							<div className="min-w-0 flex-1">
								<p
									className="truncate font-medium text-foreground text-xs"
									title={item.file.name}
								>
									{item.file.name}
								</p>
								<div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
									<span className="text-muted-foreground tabular-nums">
										{formatBytes(item.file.size)}
									</span>
									<span aria-hidden="true" className="text-muted-foreground">
										·
									</span>
									<span className={STATUS_LABEL_CLASS[item.status]}>
										{STATUS_LABELS[item.status]}
									</span>
								</div>
								{item.errorMessage && (
									<p
										role={singleAlertItemId === item.id ? "alert" : undefined}
										className="mt-1 break-words text-destructive text-xs"
									>
										{item.errorMessage}
									</p>
								)}
							</div>
							{canRemove && onRemove && (
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									className="size-7 shrink-0 text-muted-foreground hover:text-foreground focus-visible:shadow-[var(--focus-ring)] [&_svg]:size-3.5"
									aria-label={`Bỏ ${item.file.name}`}
									onClick={() => onRemove(item.id)}
								>
									<X aria-hidden="true" className="size-3.5" />
								</Button>
							)}
						</li>
					);
				})}
			</ul>

			{hasActions && (
				<div className="flex flex-wrap items-center justify-end gap-2">
					{summary.error > 0 && onRetryFailed && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="focus-visible:shadow-[var(--focus-ring)]"
							onClick={onRetryFailed}
						>
							{`Thử lại ${summary.error} file lỗi`}
						</Button>
					)}
					{onDismiss && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="focus-visible:shadow-[var(--focus-ring)]"
							aria-label="Ẩn tiến độ tải lên"
							onClick={onDismiss}
						>
							Ẩn
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
