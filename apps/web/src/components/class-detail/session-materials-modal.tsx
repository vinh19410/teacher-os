import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	isSafeMaterialUrl,
	type LessonMaterialCategory,
	type LessonMaterialLinkCreateInput,
	type LessonMaterialView,
	MATERIAL_DESCRIPTION_MAX,
	MATERIAL_TITLE_MAX,
	MATERIAL_URL_MAX,
} from "@teacher-os/api/material-contracts";
import {
	ArrowLeft,
	ArrowLeftRight,
	BookOpen,
	ClipboardList,
	Download,
	Library,
	Link2,
	Plus,
	Scissors,
	Unlink,
	Upload,
} from "lucide-react";
import {
	type FormEvent,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { fmtDueDisplay } from "@/components/assignments/assignment-status";
import {
	SliceBookModal,
	type SliceSessionOption,
} from "@/components/class-detail/slice-book-modal";
import { UPLOAD_HELP } from "@/components/materials/material-dialogs";
import {
	MaterialItem,
	MaterialOpenActions,
} from "@/components/materials/material-item";
import { MaterialBankBrowser } from "@/components/materials/material-picker";
import {
	MaterialInlinePreview,
	materialPreviewMime,
} from "@/components/materials/material-preview";
import {
	MATERIAL_FILE_ACCEPT,
	MaterialUploadQueueList,
	useMaterialUploadQueue,
} from "@/components/materials/material-upload-queue";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { isHttpError } from "@/lib/kernel-load-state";
import type { ClassAssignment } from "@/lib/mock-data";
import { reauth } from "@/lib/reauth";
import {
	attachSessionMaterial,
	createSessionMaterialLink,
	detachSessionMaterial,
	fetchSessionMaterials,
	materialErrorMessage,
	materialFileUrl,
	materialsAllQueryKey,
	sessionMaterialsQueryKey,
	updateSessionMaterialCategory,
	uploadSessionMaterial,
	useCanWriteMaterials,
} from "@/lib/repos/materials";

function noopClose() {
	// Khóa đóng hộp thoại trong khi hàng đợi tải file đang chạy.
}

function formatSliceBadge(item: LessonMaterialView): string | null {
	if (item.sourcePageStart == null || item.sourcePageEnd == null) return null;
	const pages =
		item.sourcePageStart === item.sourcePageEnd
			? `tr. ${item.sourcePageStart}`
			: `tr. ${item.sourcePageStart}–${item.sourcePageEnd}`;
	return item.sourceTitle
		? `${item.sourceTitle} · ${pages}`
		: `Sách gốc · ${pages}`;
}

/**
 * Tài liệu & bài tập của một buổi học (lớp + ngày): tách 2 tab độc lập
 * **Bài giảng** (`lecture` + tài liệu giáo trình copy xuống #655) và
 * **Bài tập buổi học** (`homework` + bài tập tương tác gắn buổi). Dùng 2
 * `useMaterialUploadQueue` độc lập để chuyển tab giữa chừng không làm lệch
 * phân loại file. Parent chỉ mount khi mở.
 */
export function SessionMaterialsModal({
	classId,
	dateISO,
	sessionLabel,
	sliceSessions,
	allowSlice = true,
	sessionAssignments = [],
	onOpenAssignPrompt,
	onClose,
}: {
	classId: string;
	dateISO: string;
	sessionLabel: string;
	sliceSessions?: readonly SliceSessionOption[];
	allowSlice?: boolean;
	sessionAssignments?: readonly ClassAssignment[];
	onOpenAssignPrompt?: () => void;
	onClose: () => void;
}) {
	const [activeTab, setActiveTab] = useState<LessonMaterialCategory>("lecture");
	const [view, setView] = useState<"list" | "pick" | "link">("list");
	const [sliceOpen, setSliceOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [linkTitle, setLinkTitle] = useState("");
	const [linkUrl, setLinkUrl] = useState("");
	const [linkDescription, setLinkDescription] = useState("");
	const linkFormId = useId();
	const queryClient = useQueryClient();
	const canWrite = useCanWriteMaterials();
	const activeView = canWrite ? view : "list";
	const clearLectureQueueRef = useRef<() => void>(() => {});
	const clearHomeworkQueueRef = useRef<() => void>(() => {});

	const lectureQueue = useMaterialUploadQueue({
		upload: (input) =>
			uploadSessionMaterial({
				classId,
				date: dateISO,
				...input,
				category: "lecture",
			}),
		onBatchSettled: ({ run, summary }) => {
			if (run.succeeded.length === 0) return;
			if (
				summary.total === 1 &&
				summary.done === 1 &&
				summary.error === 0 &&
				summary.invalid === 0
			) {
				toast.success("Đã tải lên và gắn vào buổi học.");
				clearLectureQueueRef.current();
				return;
			}
			if (summary.done > 1 && summary.error === 0 && summary.invalid === 0) {
				toast.success(`Đã tải lên ${summary.done} file và gắn vào buổi học.`);
				return;
			}
			toast.success(
				run.succeeded.length === 1
					? "Đã tải lên 1 file và gắn vào buổi học."
					: `Đã tải lên ${run.succeeded.length} file và gắn vào buổi học.`,
			);
		},
	});
	const clearLectureQueue = lectureQueue.clear;
	clearLectureQueueRef.current = clearLectureQueue;

	const homeworkQueue = useMaterialUploadQueue({
		upload: (input) =>
			uploadSessionMaterial({
				classId,
				date: dateISO,
				...input,
				category: "homework",
			}),
		onBatchSettled: ({ run, summary }) => {
			if (run.succeeded.length === 0) return;
			if (
				summary.total === 1 &&
				summary.done === 1 &&
				summary.error === 0 &&
				summary.invalid === 0
			) {
				toast.success("Đã tải lên bài tập cho buổi học.");
				clearHomeworkQueueRef.current();
				return;
			}
			if (summary.done > 1 && summary.error === 0 && summary.invalid === 0) {
				toast.success(`Đã tải lên ${summary.done} file bài tập cho buổi học.`);
				return;
			}
			toast.success(
				run.succeeded.length === 1
					? "Đã tải lên 1 file bài tập cho buổi học."
					: `Đã tải lên ${run.succeeded.length} file bài tập cho buổi học.`,
			);
		},
	});
	const clearHomeworkQueue = homeworkQueue.clear;
	clearHomeworkQueueRef.current = clearHomeworkQueue;

	useEffect(() => {
		if (!canWrite) {
			setView("list");
			setSliceOpen(false);
			setError(null);
			clearLectureQueue();
			clearHomeworkQueue();
		}
	}, [canWrite, clearLectureQueue, clearHomeworkQueue]);

	const sessionKey = sessionMaterialsQueryKey(classId, dateISO);
	const sessionQuery = useQuery({
		queryKey: sessionKey,
		queryFn: ({ signal }) => fetchSessionMaterials(classId, dateISO, signal),
	});
	const items = sessionQuery.data?.items ?? [];
	// Tài liệu giáo trình của buổi — server resolve theo vị trí buổi N ↔ bài N.
	const curriculum = sessionQuery.data?.curriculumMaterials ?? [];
	const attachedIds = useMemo(() => new Set(items.map((m) => m.id)), [items]);

	const lectureItems = useMemo(
		() => items.filter((m) => (m.category ?? "lecture") === "lecture"),
		[items],
	);
	const homeworkItems = useMemo(
		() => items.filter((m) => m.category === "homework"),
		[items],
	);

	const handleError = async (err: unknown) => {
		if (isHttpError(err) && err.status === 401) {
			reauth();
			return;
		}
		setError(materialErrorMessage(err));
		if (isHttpError(err) && (err.status === 404 || err.status === 409)) {
			await queryClient.invalidateQueries({ queryKey: materialsAllQueryKey });
		}
	};
	const onWriteSuccess = async (text: string) => {
		toast.success(text);
		// Số buổi dùng của tài liệu đổi theo — làm mới cả ngân hàng.
		await queryClient.invalidateQueries({ queryKey: materialsAllQueryKey });
	};

	const attach = useMutation({
		mutationFn: ({
			materialId,
			category,
		}: {
			materialId: string;
			category: LessonMaterialCategory;
		}) => attachSessionMaterial(classId, dateISO, materialId, { category }),
		onMutate: () => setError(null),
		onSuccess: (_, vars) =>
			onWriteSuccess(
				vars.category === "homework"
					? "Đã gắn bài tập vào buổi học."
					: "Đã gắn tài liệu vào buổi học.",
			),
		onError: handleError,
	});

	const detach = useMutation({
		mutationFn: (materialId: string) =>
			detachSessionMaterial(classId, dateISO, materialId),
		onMutate: () => setError(null),
		onSuccess: () => onWriteSuccess("Đã gỡ tài liệu khỏi buổi học."),
		onError: handleError,
	});

	const switchCategory = useMutation({
		mutationFn: ({
			materialId,
			category,
		}: {
			materialId: string;
			category: LessonMaterialCategory;
		}) => updateSessionMaterialCategory(classId, dateISO, materialId, category),
		onMutate: () => setError(null),
		onSuccess: (_, vars) =>
			onWriteSuccess(
				vars.category === "homework"
					? "Đã chuyển sang mục Bài tập buổi học."
					: "Đã chuyển sang mục Bài giảng.",
			),
		onError: handleError,
	});

	const createLink = useMutation({
		mutationFn: (input: LessonMaterialLinkCreateInput) =>
			createSessionMaterialLink(classId, dateISO, input),
		onMutate: () => setError(null),
		onSuccess: async (_, vars) => {
			setLinkTitle("");
			setLinkUrl("");
			setLinkDescription("");
			setView("list");
			await onWriteSuccess(
				vars.category === "homework"
					? "Đã thêm liên kết bài tập vào buổi học."
					: "Đã thêm liên kết bài giảng vào buổi học.",
			);
		},
		onError: handleError,
	});

	const isAnyUploading = lectureQueue.isUploading || homeworkQueue.isUploading;
	const activeQueue = activeTab === "lecture" ? lectureQueue : homeworkQueue;
	const busy =
		attach.isPending ||
		detach.isPending ||
		switchCategory.isPending ||
		createLink.isPending ||
		isAnyUploading;

	const fileInput = useRef<HTMLInputElement>(null);
	function pickFiles(files: FileList | null) {
		const picked = files ? Array.from(files) : [];
		if (fileInput.current) fileInput.current.value = "";
		if (picked.length === 0 || busy) return;
		setError(null);
		void activeQueue.uploadFilesNow(picked);
	}

	function handleCreateLinkSubmit(e: FormEvent) {
		e.preventDefault();
		if (createLink.isPending) return;
		const trimmedTitle = linkTitle.trim();
		const trimmedUrl = linkUrl.trim();
		const trimmedDesc = linkDescription.trim();
		if (!trimmedTitle) {
			setError("Nhập tiêu đề tài liệu.");
			return;
		}
		if (trimmedTitle.length > MATERIAL_TITLE_MAX) {
			setError(`Tiêu đề tối đa ${MATERIAL_TITLE_MAX} ký tự.`);
			return;
		}
		if (!isSafeMaterialUrl(trimmedUrl)) {
			setError("Liên kết phải bắt đầu bằng http:// hoặc https://.");
			return;
		}
		if (trimmedUrl.length > MATERIAL_URL_MAX) {
			setError(`Đường dẫn tối đa ${MATERIAL_URL_MAX} ký tự.`);
			return;
		}
		if (trimmedDesc.length > MATERIAL_DESCRIPTION_MAX) {
			setError(`Mô tả tối đa ${MATERIAL_DESCRIPTION_MAX} ký tự.`);
			return;
		}
		createLink.mutate({
			title: trimmedTitle,
			url: trimmedUrl,
			description: trimmedDesc,
			category: activeTab,
		});
	}

	const fallbackSliceSessions = useMemo<SliceSessionOption[]>(
		() =>
			sliceSessions && sliceSessions.length > 0
				? [...sliceSessions]
				: [
						{
							dateISO,
							index: 1,
							label: `Buổi ${sessionLabel}`,
							defaultTitle: `Bài giảng buổi ${sessionLabel}`,
						},
					],
		[sliceSessions, dateISO, sessionLabel],
	);

	const lectureTotal = lectureItems.length + curriculum.length;
	const homeworkTotal = homeworkItems.length + sessionAssignments.length;

	return (
		<>
			<Modal
				open
				onClose={isAnyUploading ? noopClose : onClose}
				scrollableBody
				title={
					activeView === "list"
						? `Tài liệu buổi ${sessionLabel}`
						: activeView === "pick"
							? activeTab === "homework"
								? "Chọn bài tập từ ngân hàng tài liệu"
								: "Chọn từ ngân hàng tài liệu"
							: activeTab === "homework"
								? "Thêm liên kết bài tập"
								: "Thêm liên kết bài giảng"
				}
				footer={
					activeView === "pick" ? (
						<Button
							variant="outline"
							size="sm"
							disabled={busy}
							onClick={() => {
								setError(null);
								setView("list");
							}}
						>
							<ArrowLeft aria-hidden="true" />
							Quay lại
						</Button>
					) : activeView === "link" ? (
						<>
							<Button
								variant="outline"
								size="sm"
								disabled={createLink.isPending}
								onClick={() => {
									setError(null);
									setView("list");
								}}
							>
								<ArrowLeft aria-hidden="true" />
								Quay lại
							</Button>
							<Button
								type="submit"
								form={linkFormId}
								size="sm"
								disabled={createLink.isPending}
								aria-busy={createLink.isPending}
							>
								{createLink.isPending ? "Đang lưu…" : "Thêm liên kết"}
							</Button>
						</>
					) : (
						<Button
							variant="outline"
							size="sm"
							disabled={isAnyUploading}
							onClick={() => {
								if (!isAnyUploading) onClose();
							}}
						>
							Đóng
						</Button>
					)
				}
			>
				{error && (
					<p role="alert" className="text-destructive text-sm">
						{error}
					</p>
				)}
				{activeView === "pick" ? (
					<MaterialBankBrowser
						selectedIds={attachedIds}
						pendingId={
							attach.isPending ? attach.variables?.materialId : undefined
						}
						disabled={busy}
						onPick={(ref) =>
							attach.mutate({ materialId: ref.id, category: activeTab })
						}
					/>
				) : activeView === "link" ? (
					<form
						id={linkFormId}
						onSubmit={handleCreateLinkSubmit}
						noValidate
						className="flex flex-col gap-3"
					>
						<Field label="Tiêu đề">
							<Input
								value={linkTitle}
								maxLength={MATERIAL_TITLE_MAX}
								onChange={(e) => setLinkTitle(e.target.value)}
								placeholder={
									activeTab === "homework"
										? "Ví dụ: Link bài tập về nhà buổi này"
										: "Ví dụ: Slide bài giảng"
								}
								disabled={createLink.isPending}
							/>
						</Field>
						<Field label="Đường dẫn">
							<Input
								type="url"
								inputMode="url"
								value={linkUrl}
								maxLength={MATERIAL_URL_MAX}
								onChange={(e) => setLinkUrl(e.target.value)}
								placeholder="https://…"
								disabled={createLink.isPending}
							/>
						</Field>
						<Field label="Mô tả (không bắt buộc)">
							<Textarea
								value={linkDescription}
								maxLength={MATERIAL_DESCRIPTION_MAX}
								onChange={(e) => setLinkDescription(e.target.value)}
								disabled={createLink.isPending}
							/>
						</Field>
					</form>
				) : (
					<div className="flex min-w-0 flex-col gap-4">
						{/* Hai tab tách biệt Bài giảng và Bài tập buổi học */}
						<div
							role="tablist"
							aria-label="Phân loại tài liệu buổi học"
							className="inline-flex w-fit rounded-md bg-muted p-1"
						>
							<button
								type="button"
								role="tab"
								aria-selected={activeTab === "lecture"}
								onClick={() => {
									setActiveTab("lecture");
									setError(null);
								}}
								className={cn(
									"inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-medium text-xs transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
									activeTab === "lecture"
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<BookOpen aria-hidden="true" className="size-3.5" />
								<span>Bài giảng</span>
								<span
									aria-hidden="true"
									className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums"
								>
									{lectureTotal}
								</span>
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={activeTab === "homework"}
								onClick={() => {
									setActiveTab("homework");
									setError(null);
								}}
								className={cn(
									"inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-medium text-xs transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
									activeTab === "homework"
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<ClipboardList aria-hidden="true" className="size-3.5" />
								<span>Bài tập buổi học</span>
								<span
									aria-hidden="true"
									className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums"
								>
									{homeworkTotal}
								</span>
							</button>
						</div>

						{canWrite && (
							<div className="flex min-w-0 shrink-0 flex-col gap-2">
								<div className="flex flex-wrap gap-2">
									{activeTab === "lecture" && allowSlice && (
										<Button
											variant="outline"
											size="sm"
											disabled={busy}
											onClick={() => {
												setError(null);
												setSliceOpen(true);
											}}
										>
											<Scissors aria-hidden="true" />
											Cắt từ sách gốc
										</Button>
									)}
									{activeTab === "homework" && onOpenAssignPrompt && (
										<Button
											variant="outline"
											size="sm"
											disabled={busy}
											onClick={onOpenAssignPrompt}
										>
											<Plus aria-hidden="true" />
											Giao bài từ ngân hàng đề
										</Button>
									)}
									<Button
										variant="outline"
										size="sm"
										disabled={busy}
										onClick={() => {
											setError(null);
											setView("pick");
										}}
									>
										<Library aria-hidden="true" />
										Chọn từ ngân hàng
									</Button>
									<Button
										variant="outline"
										size="sm"
										disabled={busy}
										aria-busy={activeQueue.isUploading}
										onClick={() => fileInput.current?.click()}
									>
										<Upload aria-hidden="true" />
										{activeQueue.isUploading
											? activeQueue.summary.validTotal > 1
												? `Đang tải lên (${activeQueue.summary.completedValid}/${activeQueue.summary.validTotal})…`
												: "Đang tải lên…"
											: "Tải lên mới"}
									</Button>
									<Button
										variant="outline"
										size="sm"
										disabled={busy}
										onClick={() => {
											setError(null);
											setView("link");
										}}
									>
										<Link2 aria-hidden="true" />
										Thêm liên kết
									</Button>
									<input
										ref={fileInput}
										type="file"
										multiple
										className="sr-only"
										tabIndex={-1}
										aria-label="Chọn file tải lên cho buổi học"
										accept={MATERIAL_FILE_ACCEPT}
										onChange={(e) => pickFiles(e.target.files)}
									/>
								</div>
								<p className="text-muted-foreground text-xs">
									{activeTab === "homework"
										? `Có thể tải lên hoặc gắn bài tập trước hoặc sau buổi học. ${UPLOAD_HELP}`
										: `${UPLOAD_HELP} File tải lên được lưu vào ngân hàng tài liệu (Chưa xếp thư mục).`}
								</p>
								{activeQueue.items.length > 0 && (
									<MaterialUploadQueueList
										compact
										items={activeQueue.items}
										summary={activeQueue.summary}
										disabled={busy}
										suppressAlert={Boolean(error)}
										onRetryFailed={() => {
											if (busy) return;
											setError(null);
											void activeQueue.retryFailed();
										}}
										onDismiss={activeQueue.clear}
									/>
								)}
							</div>
						)}

						{sessionQuery.isPending ? (
							<p className="text-muted-foreground text-sm">
								Đang tải tài liệu…
							</p>
						) : sessionQuery.isError ? (
							<div role="alert" className="text-sm">
								<p>{materialErrorMessage(sessionQuery.error)}</p>
								<Button
									variant="link"
									size="sm"
									className="px-0"
									onClick={() => void sessionQuery.refetch()}
								>
									Thử lại
								</Button>
							</div>
						) : activeTab === "lecture" ? (
							lectureItems.length === 0 && curriculum.length === 0 ? (
								<p
									className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm"
									data-testid="session-materials-empty"
								>
									{canWrite
										? "Chưa có tài liệu nào cho buổi này. Cắt từ sách gốc, chọn từ ngân hàng hoặc tải file mới."
										: "Chưa có tài liệu nào cho buổi này."}
								</p>
							) : (
								<>
									{lectureItems.length > 0 && (
										<ul className="grid gap-2" aria-label="Tài liệu đã gắn">
											{lectureItems.map((item) => {
												const sliceBadge = formatSliceBadge(item);
												return (
													<MaterialItem
														key={item.id}
														item={item}
														detail={
															sliceBadge ? (
																<Badge
																	variant="secondary"
																	title={sliceBadge}
																	className="max-w-full truncate text-[11px] tabular-nums"
																>
																	{sliceBadge}
																</Badge>
															) : undefined
														}
														leading={
															materialPreviewMime(item) ? (
																<MaterialInlinePreview item={item} />
															) : undefined
														}
														actions={
															<>
																<MaterialOpenActions item={item} />
																{canWrite && (
																	<>
																		<Button
																			variant="ghost"
																			size="sm"
																			disabled={busy}
																			aria-label={`Chuyển ${item.title} sang bài tập`}
																			title="Chuyển sang Bài tập buổi học"
																			onClick={() =>
																				switchCategory.mutate({
																					materialId: item.id,
																					category: "homework",
																				})
																			}
																		>
																			<ArrowLeftRight aria-hidden="true" />
																			<span className="max-sm:sr-only">
																				Sang bài tập
																			</span>
																		</Button>
																		<Button
																			variant="ghost"
																			size="sm"
																			disabled={busy}
																			aria-label={`Gỡ ${item.title}`}
																			onClick={() => detach.mutate(item.id)}
																		>
																			<Unlink aria-hidden="true" />
																			<span className="max-sm:sr-only">Gỡ</span>
																		</Button>
																	</>
																)}
															</>
														}
													/>
												);
											})}
										</ul>
									)}
									{curriculum.length > 0 && (
										<div className="grid gap-2">
											<p className="text-muted-foreground text-xs">
												Copy theo bài của buổi — thêm/gỡ ở giáo trình của lớp.
											</p>
											<ul
												className="grid gap-2"
												aria-label="Tài liệu từ giáo trình"
												data-testid="session-curriculum-materials"
											>
												{curriculum.map((item) => (
													<MaterialItem
														key={item.id}
														item={item}
														leading={
															materialPreviewMime(item) ? (
																<MaterialInlinePreview item={item} />
															) : undefined
														}
														actions={
															<>
																<a
																	href={materialFileUrl(item.id, true)}
																	className={buttonVariants({
																		variant: "ghost",
																		size: "sm",
																	})}
																	aria-label={`Tải xuống ${item.title}`}
																>
																	<Download aria-hidden="true" />
																	<span className="max-sm:sr-only">
																		Tải xuống
																	</span>
																</a>
																<Badge variant="secondary">Từ giáo trình</Badge>
															</>
														}
													/>
												))}
											</ul>
										</div>
									)}
								</>
							)
						) : homeworkItems.length === 0 &&
							sessionAssignments.length === 0 ? (
							<p
								className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm"
								data-testid="session-homework-empty"
							>
								{canWrite
									? "Chưa có bài tập nào cho buổi này. Tải file, thêm liên kết hoặc giao bài từ ngân hàng đề (trước hoặc sau buổi học)."
									: "Chưa có bài tập nào cho buổi này."}
							</p>
						) : (
							<div className="flex flex-col gap-4">
								{sessionAssignments.length > 0 && (
									<div className="flex flex-col gap-2">
										<p className="font-medium text-muted-foreground text-xs">
											Bài tập tương tác đã giao cho buổi này
										</p>
										<ul
											className="grid gap-2"
											aria-label="Bài tập tương tác của buổi"
										>
											{sessionAssignments.map((ca) => {
												const doneCount = ca.targets.filter(
													(t) => t.submittedAt !== null,
												).length;
												return (
													<li
														key={ca.id}
														className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm"
													>
														<div className="min-w-0 flex-1">
															<p className="truncate font-medium">{ca.title}</p>
															<p className="text-muted-foreground text-xs tabular-nums">
																Hạn {fmtDueDisplay(ca.due, ca.dueAt)} ·{" "}
																{doneCount}/{ca.targets.length} đã nộp
															</p>
														</div>
														<Badge variant="secondary">Làm trên hệ thống</Badge>
													</li>
												);
											})}
										</ul>
									</div>
								)}
								{homeworkItems.length > 0 && (
									<div className="flex flex-col gap-2">
										{sessionAssignments.length > 0 && (
											<p className="font-medium text-muted-foreground text-xs">
												Tài liệu & liên kết bài tập
											</p>
										)}
										<ul
											className="grid gap-2"
											aria-label="Tài liệu bài tập đã gắn"
										>
											{homeworkItems.map((item) => (
												<MaterialItem
													key={item.id}
													item={item}
													leading={
														materialPreviewMime(item) ? (
															<MaterialInlinePreview item={item} />
														) : undefined
													}
													actions={
														<>
															<MaterialOpenActions item={item} />
															{canWrite && (
																<>
																	<Button
																		variant="ghost"
																		size="sm"
																		disabled={busy}
																		aria-label={`Chuyển ${item.title} sang bài giảng`}
																		title="Chuyển sang Bài giảng"
																		onClick={() =>
																			switchCategory.mutate({
																				materialId: item.id,
																				category: "lecture",
																			})
																		}
																	>
																		<ArrowLeftRight aria-hidden="true" />
																		<span className="max-sm:sr-only">
																			Sang bài giảng
																		</span>
																	</Button>
																	<Button
																		variant="ghost"
																		size="sm"
																		disabled={busy}
																		aria-label={`Gỡ ${item.title}`}
																		onClick={() => detach.mutate(item.id)}
																	>
																		<Unlink aria-hidden="true" />
																		<span className="max-sm:sr-only">Gỡ</span>
																	</Button>
																</>
															)}
														</>
													}
												/>
											))}
										</ul>
									</div>
								)}
							</div>
						)}
					</div>
				)}
			</Modal>
			{sliceOpen && allowSlice && canWrite && (
				<SliceBookModal
					classId={classId}
					sessions={fallbackSliceSessions}
					initialDateISO={dateISO}
					onClose={() => setSliceOpen(false)}
					onUploaded={() => {
						void sessionQuery.refetch();
					}}
				/>
			)}
		</>
	);
}
