import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Library, Unlink, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Modal } from "@/components/ui/modal";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import {
	attachSessionMaterial,
	detachSessionMaterial,
	fetchSessionMaterials,
	materialErrorMessage,
	materialFileUrl,
	materialsAllQueryKey,
	sessionMaterialsQueryKey,
	uploadSessionMaterial,
	useCanWriteMaterials,
} from "@/lib/repos/materials";

function noopClose() {
	// Khóa đóng hộp thoại trong khi hàng đợi tải file đang chạy.
}

/**
 * Tài liệu của một buổi học (lớp + ngày): liệt kê tài liệu đã gắn, gỡ, chọn
 * thêm từ ngân hàng (duyệt thư mục + tìm kiếm) hoặc tải file mới — file tải
 * lên luôn nằm trong ngân hàng, buổi học chỉ tham chiếu. Kèm danh sách chỉ
 * đọc "Từ giáo trình" (#655): tài liệu copy theo buổi N ↔ bài N, thêm/gỡ ở
 * giáo trình của lớp. Parent chỉ mount khi mở nên không có query nào chạy
 * cho các buổi đang đóng.
 */
export function SessionMaterialsModal({
	classId,
	dateISO,
	sessionLabel,
	onClose,
}: {
	classId: string;
	dateISO: string;
	sessionLabel: string;
	onClose: () => void;
}) {
	const [view, setView] = useState<"list" | "pick">("list");
	const [error, setError] = useState<string | null>(null);
	const queryClient = useQueryClient();
	const canWrite = useCanWriteMaterials();
	const activeView = canWrite ? view : "list";
	const clearUploadQueueRef = useRef<() => void>(() => {});

	const uploadQueue = useMaterialUploadQueue({
		upload: (input) =>
			uploadSessionMaterial({ classId, date: dateISO, ...input }),
		onBatchSettled: ({ run, summary }) => {
			if (run.succeeded.length === 0) return;
			if (
				summary.total === 1 &&
				summary.done === 1 &&
				summary.error === 0 &&
				summary.invalid === 0
			) {
				toast.success("Đã tải lên và gắn vào buổi học.");
				clearUploadQueueRef.current();
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
	const clearUploadQueue = uploadQueue.clear;
	clearUploadQueueRef.current = clearUploadQueue;

	useEffect(() => {
		if (!canWrite) {
			setView("list");
			setError(null);
			clearUploadQueue();
		}
	}, [canWrite, clearUploadQueue]);
	const sessionKey = sessionMaterialsQueryKey(classId, dateISO);
	const sessionQuery = useQuery({
		queryKey: sessionKey,
		queryFn: ({ signal }) => fetchSessionMaterials(classId, dateISO, signal),
	});
	const items = sessionQuery.data?.items ?? [];
	// Tài liệu giáo trình của buổi — server resolve theo vị trí buổi N ↔ bài N.
	const curriculum = sessionQuery.data?.curriculumMaterials ?? [];
	const attachedIds = new Set(items.map((m) => m.id));

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
		mutationFn: (materialId: string) =>
			attachSessionMaterial(classId, dateISO, materialId),
		onMutate: () => setError(null),
		onSuccess: () => onWriteSuccess("Đã gắn tài liệu vào buổi học."),
		onError: handleError,
	});
	const detach = useMutation({
		mutationFn: (materialId: string) =>
			detachSessionMaterial(classId, dateISO, materialId),
		onMutate: () => setError(null),
		onSuccess: () => onWriteSuccess("Đã gỡ tài liệu khỏi buổi học."),
		onError: handleError,
	});
	const busy = attach.isPending || detach.isPending || uploadQueue.isUploading;

	const fileInput = useRef<HTMLInputElement>(null);
	function pickFiles(files: FileList | null) {
		const picked = files ? Array.from(files) : [];
		if (fileInput.current) fileInput.current.value = "";
		if (picked.length === 0 || busy) return;
		setError(null);
		void uploadQueue.uploadFilesNow(picked);
	}

	return (
		<Modal
			open
			onClose={uploadQueue.isUploading ? noopClose : onClose}
			scrollableBody
			title={
				activeView === "list"
					? `Tài liệu buổi ${sessionLabel}`
					: "Chọn từ ngân hàng tài liệu"
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
				) : (
					<Button
						variant="outline"
						size="sm"
						disabled={uploadQueue.isUploading}
						onClick={() => {
							if (!uploadQueue.isUploading) onClose();
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
					pendingId={attach.isPending ? attach.variables : undefined}
					disabled={busy}
					onPick={(ref) => attach.mutate(ref.id)}
				/>
			) : (
				<>
					{canWrite && (
						<div className="flex min-w-0 shrink-0 flex-col gap-2">
							<div className="flex flex-wrap gap-2">
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
									aria-busy={uploadQueue.isUploading}
									onClick={() => fileInput.current?.click()}
								>
									<Upload aria-hidden="true" />
									{uploadQueue.isUploading
										? uploadQueue.summary.validTotal > 1
											? `Đang tải lên (${uploadQueue.summary.completedValid}/${uploadQueue.summary.validTotal})…`
											: "Đang tải lên…"
										: "Tải lên mới"}
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
								{`${UPLOAD_HELP} File tải lên được lưu vào ngân hàng tài liệu (Chưa xếp thư mục).`}
							</p>
							{uploadQueue.items.length > 0 && (
								<MaterialUploadQueueList
									compact
									items={uploadQueue.items}
									summary={uploadQueue.summary}
									disabled={busy}
									suppressAlert={Boolean(error)}
									onRetryFailed={() => {
										if (busy) return;
										setError(null);
										void uploadQueue.retryFailed();
									}}
									onDismiss={uploadQueue.clear}
								/>
							)}
						</div>
					)}
					{sessionQuery.isPending ? (
						<p className="text-muted-foreground text-sm">Đang tải tài liệu…</p>
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
					) : items.length === 0 && curriculum.length === 0 ? (
						<p
							className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm"
							data-testid="session-materials-empty"
						>
							{canWrite
								? "Chưa có tài liệu nào cho buổi này. Chọn từ ngân hàng hoặc tải file mới."
								: "Chưa có tài liệu nào cho buổi này."}
						</p>
					) : (
						<>
							{items.length > 0 && (
								<ul className="grid gap-2" aria-label="Tài liệu đã gắn">
									{items.map((item) => (
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
													)}
												</>
											}
										/>
									))}
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
															<span className="max-sm:sr-only">Tải xuống</span>
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
					)}
				</>
			)}
		</Modal>
	);
}
