import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	hasControlOrBidiChars,
	MATERIAL_SOURCE_TITLE_MAX,
	MATERIAL_TITLE_MAX,
	type MaterialView,
} from "@teacher-os/api/material-contracts";
import {
	AlertTriangle,
	BookOpen,
	CheckCircle2,
	Eye,
	EyeOff,
	FileText,
	Loader2,
	RotateCcw,
	Scissors,
	Upload,
	XCircle,
} from "lucide-react";
import {
	lazy,
	Suspense,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { isHttpError } from "@/lib/kernel-load-state";
import {
	buildSlicedPdfFile,
	inspectPdfDocument,
	type LoadedPdfSource,
	PDF_SOURCE_MAX_BYTES,
	PdfSliceError,
	readBlobBytes,
	sanitizeSourceTitle,
	slicePdfPages,
	validatePageRange,
} from "@/lib/pdf-slicer";
import { reauth } from "@/lib/reauth";
import {
	classMaterialsQueryKey,
	fetchClassMaterials,
	fetchMaterialFileBytes,
	fetchMaterials,
	formatBytes,
	materialErrorMessage,
	materialListQueryKey,
	materialsAllQueryKey,
	uploadSessionMaterial,
} from "@/lib/repos/materials";

// pdfjs-dist nặng — chỉ lazy-load khi giáo viên bật xem nhanh sách gốc.
const BlobDocumentView = lazy(() =>
	import("@teacher-os/ui/components/document-preview/blob-document-view").then(
		(m) => ({ default: m.BlobDocumentView }),
	),
);

export interface SliceSessionOption {
	dateISO: string;
	index: number;
	label: string;
	defaultTitle: string;
}

export interface SliceBookModalProps {
	classId: string;
	sessions: readonly SliceSessionOption[];
	/** Mở từ 1 buổi cụ thể trong SessionMaterialsModal → chọn sẵn buổi đó. */
	initialDateISO?: string;
	onClose: () => void;
	onUploaded?: () => void;
}

type SourceTab = "local" | "bank" | "shared";
type RowStatus = "idle" | "running" | "done" | "error";

interface RowState {
	selected: boolean;
	pageStart: string;
	pageEnd: string;
	title: string;
	status: RowStatus;
	error?: string;
}

interface LoadedBook {
	title: string;
	sizeBytes: number;
	source: LoadedPdfSource;
	blobUrl: string;
}

function noopClose() {
	// Khóa đóng hộp thoại khi đang cắt & tải lên PDF.
}

function isPdfItem(
	item: Pick<MaterialView, "kind" | "mimeType" | "originalName">,
): boolean {
	if (item.kind !== "file") return false;
	if (item.mimeType?.toLowerCase() === "application/pdf") return true;
	return Boolean(item.originalName?.toLowerCase().endsWith(".pdf"));
}

function buildInitialRows(
	sessions: readonly SliceSessionOption[],
	initialDateISO?: string,
): Record<string, RowState> {
	const map: Record<string, RowState> = {};
	for (const s of sessions) {
		map[s.dateISO] = {
			selected: initialDateISO ? s.dateISO === initialDateISO : false,
			pageStart: "",
			pageEnd: "",
			title: s.defaultTitle,
			status: "idle",
		};
	}
	return map;
}

export function SliceBookModal({
	classId,
	sessions,
	initialDateISO,
	onClose,
	onUploaded,
}: SliceBookModalProps) {
	const queryClient = useQueryClient();
	const localFileInputId = useId();
	const localFileInputRef = useRef<HTMLInputElement>(null);

	const [sourceTab, setSourceTab] = useState<SourceTab>("local");
	const [bankSearch, setBankSearch] = useState("");
	const [loadingBook, setLoadingBook] = useState(false);
	const [bookError, setBookError] = useState<string | null>(null);
	const [loadedBook, setLoadedBook] = useState<LoadedBook | null>(null);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [bulkMode, setBulkMode] = useState(
		() =>
			!initialDateISO || !sessions.some((s) => s.dateISO === initialDateISO),
	);
	const [rows, setRows] = useState<Record<string, RowState>>(() =>
		buildInitialRows(sessions, initialDateISO),
	);
	const [isRunning, setIsRunning] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	const mountedRef = useRef(true);
	const loadSeqRef = useRef(0);
	const loadAbortRef = useRef<AbortController | null>(null);
	const blobUrlRef = useRef<string | null>(null);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			loadSeqRef.current += 1;
			loadAbortRef.current?.abort();
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
				blobUrlRef.current = null;
			}
		};
	}, []);

	function replaceLoadedBook(next: LoadedBook | null) {
		if (blobUrlRef.current) {
			URL.revokeObjectURL(blobUrlRef.current);
		}
		blobUrlRef.current = next?.blobUrl ?? null;
		setLoadedBook(next);
		setPreviewOpen(false);
		setFormError(null);
	}

	const bankQuery = useQuery({
		queryKey: materialListQueryKey({ kind: "file" }),
		queryFn: ({ signal }) => fetchMaterials({ kind: "file" }, signal),
		enabled: sourceTab === "bank",
	});

	const sharedQuery = useQuery({
		queryKey: classMaterialsQueryKey(classId),
		queryFn: ({ signal }) => fetchClassMaterials(classId, signal),
		enabled: sourceTab === "shared",
	});

	const bankPdfs = useMemo(() => {
		const list = (bankQuery.data ?? []).filter(isPdfItem);
		const q = bankSearch.trim().toLowerCase();
		if (!q) return list;
		return list.filter(
			(m) =>
				m.title.toLowerCase().includes(q) ||
				(m.originalName ?? "").toLowerCase().includes(q),
		);
	}, [bankQuery.data, bankSearch]);

	const sharedPdfs = useMemo(
		() => (sharedQuery.data ?? []).filter(isPdfItem),
		[sharedQuery.data],
	);

	async function loadBytesAsBook(
		bytes: Uint8Array,
		title: string,
		seq: number,
	) {
		const source = await inspectPdfDocument(bytes);
		if (!mountedRef.current || seq !== loadSeqRef.current) {
			return;
		}
		const safeTitle =
			sanitizeSourceTitle(title, MATERIAL_SOURCE_TITLE_MAX) || "Sách PDF gốc";
		const blobUrl = URL.createObjectURL(
			new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
		);
		replaceLoadedBook({
			title: safeTitle,
			sizeBytes: bytes.byteLength,
			source,
			blobUrl,
		});
		// Đặt lại trạng thái dòng về idle khi đổi sách gốc
		setRows((prev) => {
			const next: Record<string, RowState> = {};
			for (const [key, val] of Object.entries(prev)) {
				next[key] = { ...val, status: "idle", error: undefined };
			}
			return next;
		});
	}

	async function handlePickLocalFile(file: File | null) {
		if (!file || isRunning) return;
		loadAbortRef.current?.abort();
		const seq = loadSeqRef.current + 1;
		loadSeqRef.current = seq;
		setBookError(null);
		if (file.size > PDF_SOURCE_MAX_BYTES) {
			setBookError(
				new PdfSliceError("SOURCE_TOO_LARGE", PDF_SOURCE_MAX_BYTES).message,
			);
			return;
		}
		setLoadingBook(true);
		try {
			const bytes = await readBlobBytes(file);
			if (!mountedRef.current || seq !== loadSeqRef.current) return;
			await loadBytesAsBook(bytes, file.name, seq);
		} catch (err) {
			if (!mountedRef.current || seq !== loadSeqRef.current) return;
			replaceLoadedBook(null);
			setBookError(
				err instanceof PdfSliceError
					? err.message
					: "Không đọc được file PDF này. Kiểm tra lại định dạng file.",
			);
		} finally {
			if (mountedRef.current && seq === loadSeqRef.current) {
				setLoadingBook(false);
			}
		}
	}

	async function handlePickRemotePdf(materialId: string, title: string) {
		if (isRunning) return;
		loadAbortRef.current?.abort();
		const seq = loadSeqRef.current + 1;
		loadSeqRef.current = seq;
		const controller = new AbortController();
		loadAbortRef.current = controller;
		setBookError(null);
		setLoadingBook(true);
		try {
			const bytes = await fetchMaterialFileBytes(materialId, controller.signal);
			if (
				controller.signal.aborted ||
				!mountedRef.current ||
				seq !== loadSeqRef.current
			) {
				return;
			}
			await loadBytesAsBook(bytes, title, seq);
		} catch (err) {
			if (
				controller.signal.aborted ||
				!mountedRef.current ||
				seq !== loadSeqRef.current
			) {
				return;
			}
			replaceLoadedBook(null);
			if (err instanceof PdfSliceError) {
				setBookError(err.message);
			} else {
				setBookError(materialErrorMessage(err));
			}
		} finally {
			if (
				!controller.signal.aborted &&
				mountedRef.current &&
				seq === loadSeqRef.current
			) {
				setLoadingBook(false);
			}
		}
	}

	function updateRow(dateISO: string, patch: Partial<RowState>) {
		setFormError(null);
		setRows((prev) => {
			const cur = prev[dateISO];
			if (!cur) return prev;
			return {
				...prev,
				[dateISO]: {
					...cur,
					...patch,
					status: cur.status === "done" ? "idle" : cur.status,
					error: undefined,
				},
			};
		});
	}

	const visibleSessions = useMemo(() => {
		if (!bulkMode && initialDateISO) {
			return sessions.filter((s) => s.dateISO === initialDateISO);
		}
		return sessions;
	}, [bulkMode, initialDateISO, sessions]);

	const selectedSessions = useMemo(
		() =>
			visibleSessions.filter((s) =>
				!bulkMode && initialDateISO
					? s.dateISO === initialDateISO
					: Boolean(rows[s.dateISO]?.selected),
			),
		[visibleSessions, bulkMode, initialDateISO, rows],
	);

	const failedCount = selectedSessions.filter(
		(s) => rows[s.dateISO]?.status === "error",
	).length;
	const pendingCount = selectedSessions.filter(
		(s) => rows[s.dateISO]?.status !== "done",
	).length;

	async function runSliceAndUpload(onlyFailed: boolean) {
		if (!loadedBook || isRunning) return;
		setFormError(null);

		const targets = selectedSessions.filter((s) => {
			const st = rows[s.dateISO];
			if (!st) return false;
			if (onlyFailed) return st.status === "error";
			return st.status !== "done";
		});

		if (targets.length === 0) {
			setFormError("Chọn ít nhất một buổi học và nhập khoảng trang cần cắt.");
			return;
		}

		// Kiểm tra trước toàn bộ khoảng trang & tiêu đề của các buổi được chọn
		const validationErrors: Record<string, string> = {};
		for (const s of targets) {
			const st = rows[s.dateISO];
			const start = Number(st?.pageStart.trim());
			const end = Number(st?.pageEnd.trim());
			const rangeCheck = validatePageRange(
				start,
				end,
				loadedBook.source.pageCount,
			);
			if (!rangeCheck.ok) {
				validationErrors[s.dateISO] = rangeCheck.message;
				continue;
			}
			const trimmedTitle = (st?.title ?? "").trim();
			if (!trimmedTitle) {
				validationErrors[s.dateISO] = "Nhập tiêu đề bài giảng.";
			} else if (trimmedTitle.length > MATERIAL_TITLE_MAX) {
				validationErrors[s.dateISO] =
					`Tiêu đề tối đa ${MATERIAL_TITLE_MAX} ký tự.`;
			} else if (hasControlOrBidiChars(trimmedTitle)) {
				validationErrors[s.dateISO] =
					"Tiêu đề chứa ký tự điều khiển không hợp lệ.";
			}
		}

		if (Object.keys(validationErrors).length > 0) {
			setRows((prev) => {
				const next = { ...prev };
				for (const [dateISO, errMsg] of Object.entries(validationErrors)) {
					const cur = next[dateISO];
					if (cur) next[dateISO] = { ...cur, status: "error", error: errMsg };
				}
				return next;
			});
			setFormError(
				"Vui lòng kiểm tra lại khoảng trang ở các buổi đang báo lỗi.",
			);
			return;
		}

		setIsRunning(true);
		let succeeded = 0;
		let failed = 0;

		try {
			for (const s of targets) {
				const st = rows[s.dateISO];
				if (!st) continue;
				const pageStart = Number(st.pageStart.trim());
				const pageEnd = Number(st.pageEnd.trim());
				const rowTitle = st.title.trim();

				setRows((prev) => ({
					...prev,
					[s.dateISO]: {
						...prev[s.dateISO],
						status: "running",
						error: undefined,
					},
				}));

				try {
					const slicedBytes = await slicePdfPages(
						loadedBook.source,
						pageStart,
						pageEnd,
					);
					const file = buildSlicedPdfFile(
						slicedBytes,
						rowTitle,
						pageStart,
						pageEnd,
					);
					await uploadSessionMaterial({
						classId,
						date: s.dateISO,
						file,
						mimeType: "application/pdf",
						category: "lecture",
						title: rowTitle,
						sourceTitle: loadedBook.title,
						pageStart,
						pageEnd,
					});
					succeeded += 1;
					setRows((prev) => ({
						...prev,
						[s.dateISO]: {
							...prev[s.dateISO],
							status: "done",
							error: undefined,
						},
					}));
				} catch (err) {
					if (isHttpError(err) && err.status === 401) {
						reauth();
						return;
					}
					failed += 1;
					const msg =
						err instanceof PdfSliceError
							? err.message
							: materialErrorMessage(err);
					setRows((prev) => ({
						...prev,
						[s.dateISO]: {
							...prev[s.dateISO],
							status: "error",
							error: msg,
						},
					}));
				}
			}

			if (succeeded > 0) {
				await queryClient.invalidateQueries({ queryKey: materialsAllQueryKey });
				onUploaded?.();
			}
			if (succeeded > 0 && failed === 0) {
				toast.success(
					succeeded === 1
						? "Đã cắt bài giảng và gắn vào buổi học."
						: `Đã cắt và gắn bài giảng cho ${succeeded} buổi học.`,
				);
				onClose();
			} else if (succeeded > 0 && failed > 0) {
				toast.success(
					`Đã gắn bài giảng cho ${succeeded} buổi; còn ${failed} buổi gặp lỗi.`,
				);
			}
		} finally {
			setIsRunning(false);
		}
	}

	const canSubmit =
		Boolean(loadedBook) &&
		!loadingBook &&
		!isRunning &&
		selectedSessions.length > 0 &&
		pendingCount > 0;

	return (
		<Modal
			open
			onClose={isRunning ? noopClose : onClose}
			title="Cắt bài giảng từ sách PDF gốc"
			description="Chọn sách PDF gốc rồi nhập khoảng trang cho từng buổi học — hệ thống cắt thành file PDF riêng để học viên chỉ xem đúng phần bài giảng của buổi."
			size="xl"
			scrollableBody
			footer={
				<div className="flex w-full flex-wrap items-center justify-between gap-2">
					<p className="text-muted-foreground text-xs">
						{loadedBook
							? `${loadedBook.title} · ${loadedBook.source.pageCount} trang`
							: "Bước 1: Chọn sách PDF gốc (tối đa 100 MB)"}
					</p>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={isRunning}
							onClick={() => {
								if (!isRunning) onClose();
							}}
						>
							Đóng
						</Button>
						{failedCount > 0 && !isRunning && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => void runSliceAndUpload(true)}
							>
								<RotateCcw aria-hidden="true" className="size-3.5" />
								Thử lại {failedCount} buổi lỗi
							</Button>
						)}
						<Button
							type="button"
							size="sm"
							disabled={!canSubmit}
							aria-busy={isRunning}
							onClick={() => void runSliceAndUpload(false)}
						>
							<Scissors aria-hidden="true" className="size-3.5" />
							{isRunning
								? "Đang cắt và tải lên…"
								: selectedSessions.length > 1
									? `Cắt & gắn ${pendingCount} buổi`
									: "Cắt & gắn bài giảng"}
						</Button>
					</div>
				</div>
			}
		>
			<div className="flex min-w-0 flex-col gap-5">
				{/* Bước 1: Chọn sách PDF gốc */}
				<section className="flex flex-col gap-3" aria-label="Chọn sách PDF gốc">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h4 className="font-semibold text-sm">1. Chọn sách PDF gốc</h4>
						{loadedBook && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={isRunning}
								onClick={() => setPreviewOpen((v) => !v)}
							>
								{previewOpen ? (
									<>
										<EyeOff aria-hidden="true" className="size-3.5" />
										Ẩn xem trước sách
									</>
								) : (
									<>
										<Eye aria-hidden="true" className="size-3.5" />
										Xem nhanh sách gốc
									</>
								)}
							</Button>
						)}
					</div>

					{/* Chọn nguồn sách (ưu tiên nguồn riêng của giáo viên) */}
					<div
						role="tablist"
						aria-label="Nguồn sách PDF gốc"
						className="inline-flex w-fit flex-wrap rounded-md bg-muted p-1"
					>
						{(
							[
								{ id: "local", label: "File PDF từ máy tính" },
								{ id: "bank", label: "Ngân hàng tài liệu" },
								{ id: "shared", label: "Tài liệu chung của lớp" },
							] as const
						).map((t) => (
							<button
								key={t.id}
								type="button"
								role="tab"
								aria-selected={sourceTab === t.id}
								disabled={isRunning}
								onClick={() => {
									setSourceTab(t.id);
									setBookError(null);
								}}
								className={cn(
									"rounded-sm px-3 py-1.5 font-medium text-xs transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
									sourceTab === t.id
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{t.label}
							</button>
						))}
					</div>

					{sourceTab === "local" && (
						<div className="flex flex-col gap-2">
							<input
								ref={localFileInputRef}
								id={localFileInputId}
								type="file"
								accept="application/pdf,.pdf"
								aria-label="Chọn file sách PDF từ máy tính"
								className="sr-only"
								disabled={isRunning || loadingBook}
								onChange={(e) => {
									const picked = e.target.files?.[0] ?? null;
									e.target.value = "";
									void handlePickLocalFile(picked);
								}}
							/>
							<button
								type="button"
								disabled={isRunning || loadingBook}
								onClick={() => localFileInputRef.current?.click()}
								className="flex min-h-24 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-input border-dashed p-4 text-center transition-colors hover:bg-accent/50 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60"
							>
								<Upload
									aria-hidden="true"
									className="size-5 text-muted-foreground"
								/>
								<span className="font-medium text-sm">
									{loadedBook
										? "Chọn file PDF khác từ máy tính"
										: "Bấm để chọn sách PDF từ máy tính"}
								</span>
								<span className="text-muted-foreground text-xs">
									File sách gốc chỉ xử lý trên trình duyệt và không tải nguyên
									cuốn lên lớp (tối đa 100 MB).
								</span>
							</button>
						</div>
					)}

					{sourceTab === "bank" && (
						<div className="flex flex-col gap-2">
							<Input
								value={bankSearch}
								onChange={(e) => setBankSearch(e.target.value)}
								placeholder="Tìm file PDF trong ngân hàng tài liệu…"
								aria-label="Tìm file PDF trong ngân hàng tài liệu"
								disabled={isRunning}
							/>
							{bankQuery.isPending ? (
								<p className="text-muted-foreground text-xs">
									Đang tải danh sách PDF…
								</p>
							) : bankQuery.isError ? (
								<p role="alert" className="text-destructive text-xs">
									{materialErrorMessage(bankQuery.error)}
								</p>
							) : bankPdfs.length === 0 ? (
								<p className="rounded-md border border-dashed p-3 text-center text-muted-foreground text-xs">
									Chưa có file PDF nào trong ngân hàng tài liệu khớp bộ lọc.
								</p>
							) : (
								<ul
									className="grid max-h-44 gap-1.5 overflow-y-auto"
									aria-label="Danh sách PDF ngân hàng tài liệu"
								>
									{bankPdfs.map((item) => (
										<li
											key={item.id}
											className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm"
										>
											<span className="flex min-w-0 items-center gap-2">
												<FileText
													aria-hidden="true"
													className="size-4 shrink-0 text-muted-foreground"
												/>
												<span className="truncate font-medium">
													{item.title}
												</span>
												{item.sizeBytes ? (
													<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
														{formatBytes(item.sizeBytes)}
													</span>
												) : null}
											</span>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={isRunning || loadingBook}
												onClick={() =>
													void handlePickRemotePdf(item.id, item.title)
												}
											>
												Chọn sách
											</Button>
										</li>
									))}
								</ul>
							)}
						</div>
					)}

					{sourceTab === "shared" && (
						<div className="flex flex-col gap-2">
							<div
								role="note"
								className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn-soft p-3 text-foreground text-xs"
							>
								<AlertTriangle
									aria-hidden="true"
									className="mt-0.5 size-4 shrink-0 text-warn"
								/>
								<p>
									Lưu ý: Học viên trong lớp đang xem được toàn bộ file nằm ở tab{" "}
									<strong>Tài liệu chung</strong>. Nếu bạn chỉ muốn học viên xem
									từng chương theo buổi, hãy chọn sách từ{" "}
									<strong>File PDF từ máy tính</strong> hoặc{" "}
									<strong>Ngân hàng tài liệu</strong>.
								</p>
							</div>
							{sharedQuery.isPending ? (
								<p className="text-muted-foreground text-xs">
									Đang tải tài liệu chung của lớp…
								</p>
							) : sharedQuery.isError ? (
								<p role="alert" className="text-destructive text-xs">
									{materialErrorMessage(sharedQuery.error)}
								</p>
							) : sharedPdfs.length === 0 ? (
								<p className="rounded-md border border-dashed p-3 text-center text-muted-foreground text-xs">
									Lớp chưa có file PDF nào trong Tài liệu chung.
								</p>
							) : (
								<ul
									className="grid max-h-44 gap-1.5 overflow-y-auto"
									aria-label="Danh sách PDF tài liệu chung"
								>
									{sharedPdfs.map((item) => (
										<li
											key={item.id}
											className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm"
										>
											<span className="flex min-w-0 items-center gap-2">
												<FileText
													aria-hidden="true"
													className="size-4 shrink-0 text-muted-foreground"
												/>
												<span className="truncate font-medium">
													{item.title}
												</span>
											</span>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={isRunning || loadingBook}
												onClick={() =>
													void handlePickRemotePdf(item.id, item.title)
												}
											>
												Chọn sách
											</Button>
										</li>
									))}
								</ul>
							)}
						</div>
					)}

					{loadingBook && (
						<p
							role="status"
							className="flex items-center gap-2 text-muted-foreground text-sm"
						>
							<Loader2 aria-hidden="true" className="size-4 animate-spin" />
							Đang đọc cấu trúc trang sách PDF…
						</p>
					)}

					{bookError && (
						<p role="alert" className="text-destructive text-sm">
							{bookError}
						</p>
					)}

					{loadedBook && (
						<div
							data-testid="slice-book-loaded"
							className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex min-w-0 items-center gap-2">
									<BookOpen
										aria-hidden="true"
										className="size-4 shrink-0 text-primary"
									/>
									<span className="truncate font-medium text-sm">
										{loadedBook.title}
									</span>
								</div>
								<div className="flex items-center gap-2">
									<Badge variant="secondary" className="tabular-nums">
										{loadedBook.source.pageCount} trang
									</Badge>
									<span className="text-muted-foreground text-xs tabular-nums">
										{formatBytes(loadedBook.sizeBytes)}
									</span>
								</div>
							</div>
							{previewOpen && (
								<div className="max-h-72 overflow-y-auto rounded-md border bg-background p-2">
									<Suspense
										fallback={
											<p
												role="status"
												className="p-3 text-muted-foreground text-xs"
											>
												Đang tải bản xem trước sách…
											</p>
										}
									>
										<BlobDocumentView
											blobUrl={loadedBook.blobUrl}
											mimeType="application/pdf"
											label={`Xem trước ${loadedBook.title}`}
										/>
									</Suspense>
								</div>
							)}
						</div>
					)}
				</section>

				{/* Bước 2: Nhập khoảng trang theo buổi học */}
				<section
					className="flex flex-col gap-3"
					aria-label="Phân trang cho buổi học"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h4 className="font-semibold text-sm">
							2. Chọn khoảng trang cho buổi học
						</h4>
						{initialDateISO && sessions.length > 1 && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={isRunning}
								onClick={() => setBulkMode((v) => !v)}
							>
								{bulkMode
									? "Chỉ cắt cho buổi đang mở"
									: "Cắt cho nhiều buổi cùng lúc"}
							</Button>
						)}
					</div>

					{sessions.length === 0 ? (
						<p className="rounded-md border border-dashed p-4 text-center text-muted-foreground text-sm">
							Chưa có buổi học thực tế nào để gắn bài giảng.
						</p>
					) : (
						<ul className="grid gap-2" aria-label="Danh sách buổi học để cắt">
							{visibleSessions.map((s) => {
								const st = rows[s.dateISO];
								if (!st) return null;
								const isSelected =
									!bulkMode && initialDateISO
										? s.dateISO === initialDateISO
										: st.selected;
								return (
									<li
										key={s.dateISO}
										data-testid={`slice-row-${s.dateISO}`}
										className={cn(
											"flex flex-col gap-2 rounded-lg border p-3 transition-colors",
											isSelected ? "border-primary/50 bg-card" : "bg-muted/20",
										)}
									>
										<div className="flex flex-wrap items-center justify-between gap-2">
											{bulkMode ? (
												<label className="flex min-w-0 items-center gap-2 font-medium text-sm">
													<input
														type="checkbox"
														checked={st.selected}
														disabled={isRunning || st.status === "done"}
														onChange={(e) =>
															updateRow(s.dateISO, {
																selected: e.target.checked,
															})
														}
														className="size-4 accent-primary"
													/>
													<span className="truncate">{s.label}</span>
												</label>
											) : (
												<div className="flex min-w-0 items-center gap-2 font-medium text-sm">
													<span className="truncate">{s.label}</span>
												</div>
											)}
											<RowStatusBadge status={st.status} />
										</div>

										<div className="grid grid-cols-1 gap-2 sm:grid-cols-[96px_96px_1fr]">
											<div className="flex flex-col gap-1">
												<label
													htmlFor={`slice-start-${s.dateISO}`}
													className="text-muted-foreground text-xs"
												>
													Từ trang
												</label>
												<Input
													id={`slice-start-${s.dateISO}`}
													type="number"
													min={1}
													max={loadedBook?.source.pageCount}
													inputMode="numeric"
													placeholder="1"
													value={st.pageStart}
													disabled={
														!loadedBook || isRunning || st.status === "done"
													}
													onChange={(e) =>
														updateRow(s.dateISO, {
															pageStart: e.target.value,
															selected:
																e.target.value.trim() !== ""
																	? true
																	: st.selected,
														})
													}
													className="tabular-nums"
												/>
											</div>
											<div className="flex flex-col gap-1">
												<label
													htmlFor={`slice-end-${s.dateISO}`}
													className="text-muted-foreground text-xs"
												>
													Đến trang
												</label>
												<Input
													id={`slice-end-${s.dateISO}`}
													type="number"
													min={1}
													max={loadedBook?.source.pageCount}
													inputMode="numeric"
													placeholder={
														loadedBook
															? String(
																	Math.min(10, loadedBook.source.pageCount),
																)
															: "10"
													}
													value={st.pageEnd}
													disabled={
														!loadedBook || isRunning || st.status === "done"
													}
													onChange={(e) =>
														updateRow(s.dateISO, {
															pageEnd: e.target.value,
															selected:
																e.target.value.trim() !== ""
																	? true
																	: st.selected,
														})
													}
													className="tabular-nums"
												/>
											</div>
											<div className="flex flex-col gap-1">
												<label
													htmlFor={`slice-title-${s.dateISO}`}
													className="text-muted-foreground text-xs"
												>
													Tên bài giảng
												</label>
												<Input
													id={`slice-title-${s.dateISO}`}
													value={st.title}
													maxLength={MATERIAL_TITLE_MAX}
													disabled={
														!loadedBook || isRunning || st.status === "done"
													}
													onChange={(e) =>
														updateRow(s.dateISO, { title: e.target.value })
													}
												/>
											</div>
										</div>
										{st.error && (
											<p role="alert" className="text-destructive text-xs">
												{st.error}
											</p>
										)}
									</li>
								);
							})}
						</ul>
					)}

					{formError && (
						<p role="alert" className="text-destructive text-sm">
							{formError}
						</p>
					)}
				</section>
			</div>
		</Modal>
	);
}

function RowStatusBadge({ status }: { status: RowStatus }) {
	switch (status) {
		case "running":
			return (
				<Badge variant="secondary" className="gap-1">
					<Loader2 aria-hidden="true" className="size-3 animate-spin" />
					Đang cắt…
				</Badge>
			);
		case "done":
			return (
				<Badge variant="success" className="gap-1">
					<CheckCircle2 aria-hidden="true" className="size-3" />
					Đã gắn
				</Badge>
			);
		case "error":
			return (
				<Badge variant="danger" className="gap-1">
					<XCircle aria-hidden="true" className="size-3" />
					Lỗi
				</Badge>
			);
		default:
			return null;
	}
}
