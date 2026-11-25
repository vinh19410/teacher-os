import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type ClassMaterialLinkCreateInput,
	isSafeMaterialUrl,
	MATERIAL_DESCRIPTION_MAX,
	MATERIAL_TITLE_MAX,
	MATERIAL_URL_MAX,
} from "@teacher-os/api/material-contracts";
import { Library, Link2, Unlink, Upload } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Section } from "@/components/ui/section";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import {
	attachClassMaterial,
	classMaterialsQueryKey,
	createClassMaterialLink,
	detachClassMaterial,
	fetchClassMaterials,
	materialErrorMessage,
	materialsAllQueryKey,
	uploadClassMaterial,
	useCanWriteMaterials,
} from "@/lib/repos/materials";

function ClassMaterialLinkDialog({
	classId,
	onClose,
}: {
	classId: string;
	onClose: () => void;
}) {
	const formId = useId();
	const queryClient = useQueryClient();
	const [title, setTitle] = useState("");
	const [url, setUrl] = useState("");
	const [description, setDescription] = useState("");
	const [error, setError] = useState<string | null>(null);

	const createLink = useMutation({
		mutationFn: (input: ClassMaterialLinkCreateInput) =>
			createClassMaterialLink(classId, input),
		onMutate: () => setError(null),
		onSuccess: async () => {
			toast.success("Đã thêm liên kết vào tài liệu chung.");
			await queryClient.invalidateQueries({ queryKey: materialsAllQueryKey });
			onClose();
		},
		onError: async (err) => {
			if (isHttpError(err) && err.status === 401) {
				reauth();
				return;
			}
			setError(materialErrorMessage(err));
			if (isHttpError(err) && (err.status === 404 || err.status === 409)) {
				await queryClient.invalidateQueries({ queryKey: materialsAllQueryKey });
			}
		},
	});

	function submit(e: FormEvent) {
		e.preventDefault();
		if (createLink.isPending) return;
		const trimmedTitle = title.trim();
		const trimmedUrl = url.trim();
		const trimmedDescription = description.trim();
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
		if (trimmedDescription.length > MATERIAL_DESCRIPTION_MAX) {
			setError(`Mô tả tối đa ${MATERIAL_DESCRIPTION_MAX} ký tự.`);
			return;
		}
		createLink.mutate({
			title: trimmedTitle,
			url: trimmedUrl,
			description: trimmedDescription,
		});
	}

	return (
		<Modal
			open
			onClose={createLink.isPending ? () => undefined : onClose}
			title="Thêm liên kết"
			footer={
				<>
					<Button
						variant="outline"
						size="sm"
						disabled={createLink.isPending}
						onClick={onClose}
					>
						Hủy
					</Button>
					<Button
						type="submit"
						form={formId}
						size="sm"
						disabled={createLink.isPending}
						aria-busy={createLink.isPending}
					>
						{createLink.isPending ? "Đang lưu…" : "Thêm liên kết"}
					</Button>
				</>
			}
		>
			<form id={formId} onSubmit={submit} noValidate>
				<Field label="Tiêu đề">
					<Input
						value={title}
						maxLength={MATERIAL_TITLE_MAX}
						onChange={(e) => setTitle(e.target.value)}
						disabled={createLink.isPending}
					/>
				</Field>
				<Field label="Đường dẫn">
					<Input
						type="url"
						inputMode="url"
						value={url}
						maxLength={MATERIAL_URL_MAX}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://…"
						disabled={createLink.isPending}
					/>
				</Field>
				<Field label="Mô tả (không bắt buộc)">
					<Textarea
						value={description}
						maxLength={MATERIAL_DESCRIPTION_MAX}
						onChange={(e) => setDescription(e.target.value)}
						disabled={createLink.isPending}
					/>
				</Field>
				{error && (
					<p role="alert" className="text-destructive text-sm">
						{error}
					</p>
				)}
			</form>
		</Modal>
	);
}

/**
 * Tab "Tài liệu chung" cấp lớp học: liệt kê tài liệu dùng xuyên suốt cả lớp
 * (không gắn vào buổi cụ thể). Giáo viên/quản trị viên có thể chọn từ kho tài
 * liệu, tải file lên hoặc thêm liên kết mới (đều lưu vào Ngân hàng tài liệu ở
 * mục Chưa xếp thư mục) và gỡ khỏi lớp; trợ giảng chỉ xem/mở/tải xuống.
 */
export function ClassSharedMaterialsTab({ classId }: { classId: string }) {
	const queryClient = useQueryClient();
	const canWrite = useCanWriteMaterials();
	const [pickerOpen, setPickerOpen] = useState(false);
	const [linkModalOpen, setLinkModalOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pickerError, setPickerError] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const clearUploadQueueRef = useRef<() => void>(() => undefined);

	const uploadQueue = useMaterialUploadQueue({
		upload: (input) => uploadClassMaterial({ classId, ...input }),
		onBatchSettled: ({ run, summary }) => {
			if (run.succeeded.length === 0) return;
			if (
				summary.total === 1 &&
				summary.done === 1 &&
				summary.error === 0 &&
				summary.invalid === 0
			) {
				toast.success("Đã tải lên và thêm vào tài liệu chung.");
				clearUploadQueueRef.current();
				return;
			}
			if (summary.done > 1 && summary.error === 0 && summary.invalid === 0) {
				toast.success(`Đã tải lên ${summary.done} file vào tài liệu chung.`);
				return;
			}
			toast.success(
				run.succeeded.length === 1
					? "Đã tải lên 1 file vào tài liệu chung."
					: `Đã tải lên ${run.succeeded.length} file vào tài liệu chung.`,
			);
		},
	});
	const clearUploadQueue = uploadQueue.clear;
	clearUploadQueueRef.current = clearUploadQueue;

	useEffect(() => {
		if (!canWrite) {
			setPickerOpen(false);
			setLinkModalOpen(false);
			setError(null);
			setPickerError(null);
			clearUploadQueue();
		}
	}, [canWrite, clearUploadQueue]);

	const itemsQuery = useQuery({
		queryKey: classMaterialsQueryKey(classId),
		queryFn: ({ signal }) => fetchClassMaterials(classId, signal),
	});
	const items = itemsQuery.data ?? [];
	const attachedIds = new Set(items.map((m) => m.id));

	const handleMutationError = async (
		err: unknown,
		setTargetError: (msg: string | null) => void,
	) => {
		if (isHttpError(err) && err.status === 401) {
			reauth();
			return;
		}
		setTargetError(materialErrorMessage(err));
		if (isHttpError(err) && (err.status === 404 || err.status === 409)) {
			await queryClient.invalidateQueries({ queryKey: materialsAllQueryKey });
		}
	};

	const onWriteSuccess = async (text: string) => {
		toast.success(text);
		await queryClient.invalidateQueries({ queryKey: materialsAllQueryKey });
	};

	const attach = useMutation({
		mutationFn: (materialId: string) =>
			attachClassMaterial(classId, materialId),
		onMutate: () => setPickerError(null),
		onSuccess: () => onWriteSuccess("Đã gắn tài liệu vào lớp."),
		onError: (err) => handleMutationError(err, setPickerError),
	});

	const detach = useMutation({
		mutationFn: (materialId: string) =>
			detachClassMaterial(classId, materialId),
		onMutate: () => setError(null),
		onSuccess: () => onWriteSuccess("Đã gỡ tài liệu khỏi lớp."),
		onError: (err) => handleMutationError(err, setError),
	});

	const busy = attach.isPending || uploadQueue.isUploading || detach.isPending;

	function pickFiles(files: FileList | null) {
		const picked = files ? Array.from(files) : [];
		if (fileInput.current) fileInput.current.value = "";
		if (picked.length === 0 || busy) return;
		setError(null);
		void uploadQueue.uploadFilesNow(picked);
	}

	return (
		<Section
			title="Tài liệu chung"
			count={itemsQuery.isSuccess ? items.length : undefined}
		>
			<div className="flex min-w-0 flex-col gap-4">
				{canWrite && (
					<div className="flex min-w-0 flex-col gap-2">
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={busy}
								onClick={() => {
									setError(null);
									setPickerError(null);
									setPickerOpen(true);
								}}
							>
								<Library aria-hidden="true" />
								Chọn từ kho tài liệu
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
									: "Tải file lên"}
							</Button>
							<input
								ref={fileInput}
								type="file"
								multiple
								className="sr-only"
								tabIndex={-1}
								aria-label="Chọn file tải lên cho lớp học"
								accept={MATERIAL_FILE_ACCEPT}
								onChange={(e) => pickFiles(e.target.files)}
							/>
							<Button
								variant="outline"
								size="sm"
								disabled={busy}
								onClick={() => {
									setError(null);
									setLinkModalOpen(true);
								}}
							>
								<Link2 aria-hidden="true" />
								Thêm liên kết
							</Button>
						</div>
						<p className="text-muted-foreground text-xs">
							{`${UPLOAD_HELP} File tải lên và liên kết mới được lưu vào Ngân hàng tài liệu (Chưa xếp thư mục).`}
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

				{error && (
					<p role="alert" className="text-destructive text-sm">
						{error}
					</p>
				)}

				{itemsQuery.isPending ? (
					<p role="status" className="text-muted-foreground text-sm">
						Đang tải tài liệu…
					</p>
				) : itemsQuery.isError ? (
					<div role="alert" className="text-sm">
						<p>{materialErrorMessage(itemsQuery.error)}</p>
						<Button
							variant="link"
							size="sm"
							className="px-0"
							onClick={() => void itemsQuery.refetch()}
						>
							Thử lại
						</Button>
					</div>
				) : items.length === 0 ? (
					<div
						className="rounded-lg border border-dashed p-6 text-center"
						data-testid="class-shared-materials-empty"
					>
						<p className="text-muted-foreground text-sm">
							{canWrite
								? "Tài liệu chung dùng xuyên suốt cả lớp (đề cương, bảng phát âm, tài liệu tham khảo) sẽ hiện ở đây. Chọn từ kho tài liệu, tải file lên hoặc thêm liên kết đầu tiên."
								: "Lớp hiện chưa có tài liệu chung nào."}
						</p>
					</div>
				) : (
					<ul className="grid gap-2" aria-label="Tài liệu chung của lớp">
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
			</div>

			{canWrite && pickerOpen && (
				<Modal
					open
					onClose={() => {
						setPickerOpen(false);
						setPickerError(null);
					}}
					title="Chọn từ kho tài liệu"
					footer={
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setPickerOpen(false);
								setPickerError(null);
							}}
						>
							Đóng
						</Button>
					}
				>
					{pickerError && (
						<p role="alert" className="text-destructive text-sm">
							{pickerError}
						</p>
					)}
					<MaterialBankBrowser
						selectedIds={attachedIds}
						pendingId={attach.isPending ? attach.variables : undefined}
						disabled={busy}
						onPick={(ref) => attach.mutate(ref.id)}
					/>
				</Modal>
			)}

			{canWrite && linkModalOpen && (
				<ClassMaterialLinkDialog
					classId={classId}
					onClose={() => setLinkModalOpen(false)}
				/>
			)}
		</Section>
	);
}
