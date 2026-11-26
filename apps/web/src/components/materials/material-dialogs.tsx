import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	isSafeMaterialUrl,
	MATERIAL_DESCRIPTION_MAX,
	MATERIAL_FOLDER_NAME_MAX,
	MATERIAL_TITLE_MAX,
	type MaterialFolderView,
	type MaterialView,
} from "@teacher-os/api/material-contracts";
import { Upload } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { FolderSelect } from "@/components/materials/folder-select";
import {
	MATERIAL_FILE_ACCEPT,
	type MaterialUploadBatchSummary,
	MaterialUploadQueueList,
	useMaterialUploadQueue,
} from "@/components/materials/material-upload-queue";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { isHttpError } from "@/lib/kernel-load-state";
import { folderSubtreeIds } from "@/lib/material-folders";
import { reauth } from "@/lib/reauth";
import {
	createMaterialFolder,
	createMaterialLink,
	deleteMaterial,
	deleteMaterialFolder,
	isMaterialRequestError,
	materialErrorMessage,
	materialsAllQueryKey,
	updateMaterial,
	updateMaterialFolder,
	uploadMaterialFile,
} from "@/lib/repos/materials";

const ROOT_LABEL = "Chưa xếp thư mục";

/**
 * Mutation dùng chung của các dialog: 401 → đăng nhập lại, lỗi khác hiện
 * inline (dialog vẫn mở để sửa), thành công → invalidate cả cụm ngân hàng,
 * toast rồi đóng.
 */
function useMaterialWrite<TInput, TResult>(
	fn: (input: TInput) => Promise<TResult>,
	options: { successText: string; onDone: (result: TResult) => void },
) {
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const mutation = useMutation({
		mutationFn: fn,
		onMutate: () => setError(null),
		onSuccess: async (result) => {
			toast.success(options.successText);
			await queryClient.invalidateQueries({ queryKey: materialsAllQueryKey });
			options.onDone(result);
		},
		onError: async (err) => {
			if (isHttpError(err) && err.status === 401) {
				reauth();
				return;
			}
			setError(materialErrorMessage(err));
			// 404/409 hoặc thua race chu trình/độ sâu (#646): dữ liệu trên máy đã cũ — tải lại cây thư mục.
			if (
				(isHttpError(err) && (err.status === 404 || err.status === 409)) ||
				(isMaterialRequestError(err) &&
					(err.materialCode === "FOLDER_CYCLE" ||
						err.materialCode === "FOLDER_TOO_DEEP"))
			) {
				await queryClient.invalidateQueries({
					queryKey: materialsAllQueryKey,
				});
			}
		},
	});
	return { mutation, error, setError };
}

function FormError({ message }: { message: string | null }) {
	if (!message) return null;
	return (
		<p role="alert" className="text-destructive text-sm">
			{message}
		</p>
	);
}

function DialogFooter({
	formId,
	pending,
	submitLabel,
	onClose,
	destructive,
}: {
	formId: string;
	pending: boolean;
	submitLabel: string;
	onClose: () => void;
	destructive?: boolean;
}) {
	return (
		<>
			<Button variant="outline" size="sm" disabled={pending} onClick={onClose}>
				Hủy
			</Button>
			<Button
				type="submit"
				form={formId}
				size="sm"
				variant={destructive ? "destructive" : "default"}
				disabled={pending}
				aria-busy={pending}
			>
				{pending ? "Đang lưu…" : submitLabel}
			</Button>
		</>
	);
}

export type FolderDialogMode =
	| { type: "create"; parentId: string | null }
	| { type: "rename"; folder: MaterialFolderView }
	| { type: "move"; folder: MaterialFolderView };

export function FolderDialog({
	mode,
	folders,
	onClose,
	onSaved,
}: {
	mode: FolderDialogMode;
	folders: readonly MaterialFolderView[];
	onClose: () => void;
	onSaved?: (folder: MaterialFolderView) => void;
}) {
	const formId = useId();
	const [name, setName] = useState(
		mode.type === "create" ? "" : mode.folder.name,
	);
	const exclude =
		mode.type === "move"
			? folderSubtreeIds(folders, mode.folder.id)
			: undefined;
	const rawParentId =
		mode.type === "create" ? mode.parentId : mode.folder.parentId;
	const [parentId, setParentId] = useState<string | null>(() =>
		rawParentId !== null &&
		!exclude?.has(rawParentId) &&
		folders.some((f) => f.id === rawParentId)
			? rawParentId
			: null,
	);
	const effectiveParentId =
		parentId !== null &&
		!exclude?.has(parentId) &&
		folders.some((f) => f.id === parentId)
			? parentId
			: null;
	const { mutation, error, setError } = useMaterialWrite(
		() => {
			if (mode.type === "create") {
				return createMaterialFolder({
					name: name.trim(),
					parentId: effectiveParentId,
				});
			}
			if (mode.type === "rename") {
				return updateMaterialFolder(mode.folder.id, { name: name.trim() });
			}
			return updateMaterialFolder(mode.folder.id, {
				parentId: effectiveParentId,
			});
		},
		{
			successText:
				mode.type === "create"
					? "Đã tạo thư mục."
					: mode.type === "rename"
						? "Đã đổi tên thư mục."
						: "Đã di chuyển thư mục.",
			onDone: (folder) => {
				onSaved?.(folder);
				onClose();
			},
		},
	);
	const title =
		mode.type === "create"
			? "Thư mục mới"
			: mode.type === "rename"
				? "Đổi tên thư mục"
				: `Di chuyển “${mode.folder.name}”`;

	function submit(e: FormEvent) {
		e.preventDefault();
		if (mode.type !== "move") {
			const trimmed = name.trim();
			if (!trimmed) {
				setError("Nhập tên thư mục.");
				return;
			}
			if (trimmed.length > MATERIAL_FOLDER_NAME_MAX) {
				setError(`Tên thư mục tối đa ${MATERIAL_FOLDER_NAME_MAX} ký tự.`);
				return;
			}
		}
		mutation.mutate(undefined);
	}

	return (
		<Modal
			open
			onClose={onClose}
			title={title}
			footer={
				<DialogFooter
					formId={formId}
					pending={mutation.isPending}
					submitLabel={mode.type === "create" ? "Tạo thư mục" : "Lưu"}
					onClose={onClose}
				/>
			}
		>
			<form id={formId} onSubmit={submit} noValidate>
				{mode.type !== "move" && (
					<Field label="Tên thư mục">
						<Input
							value={name}
							maxLength={MATERIAL_FOLDER_NAME_MAX}
							onChange={(e) => setName(e.target.value)}
							placeholder="Ví dụ: IELTS Writing"
							disabled={mutation.isPending}
						/>
					</Field>
				)}
				{mode.type !== "rename" && (
					<Field label={mode.type === "create" ? "Nằm trong" : "Chuyển vào"}>
						<FolderSelect
							folders={folders}
							value={effectiveParentId}
							onChange={setParentId}
							rootLabel="Thư mục gốc"
							exclude={exclude}
							disabled={mutation.isPending}
						/>
					</Field>
				)}
				<FormError message={error} />
			</form>
		</Modal>
	);
}

export function LinkDialog({
	folders,
	defaultFolderId,
	onClose,
}: {
	folders: readonly MaterialFolderView[];
	defaultFolderId: string | null;
	onClose: () => void;
}) {
	const formId = useId();
	const [title, setTitle] = useState("");
	const [url, setUrl] = useState("");
	const [description, setDescription] = useState("");
	const [folderId, setFolderId] = useState(defaultFolderId);
	const { mutation, error, setError } = useMaterialWrite(
		() =>
			createMaterialLink({
				title: title.trim(),
				url: url.trim(),
				description: description.trim(),
				folderId,
			}),
		{ successText: "Đã thêm liên kết.", onDone: onClose },
	);

	function submit(e: FormEvent) {
		e.preventDefault();
		if (!title.trim()) {
			setError("Nhập tiêu đề tài liệu.");
			return;
		}
		if (!isSafeMaterialUrl(url.trim())) {
			setError("Liên kết phải bắt đầu bằng http:// hoặc https://.");
			return;
		}
		mutation.mutate(undefined);
	}

	return (
		<Modal
			open
			onClose={onClose}
			title="Thêm liên kết"
			footer={
				<DialogFooter
					formId={formId}
					pending={mutation.isPending}
					submitLabel="Thêm liên kết"
					onClose={onClose}
				/>
			}
		>
			<form id={formId} onSubmit={submit} noValidate>
				<Field label="Tiêu đề">
					<Input
						value={title}
						maxLength={MATERIAL_TITLE_MAX}
						onChange={(e) => setTitle(e.target.value)}
						disabled={mutation.isPending}
					/>
				</Field>
				<Field label="Đường dẫn">
					<Input
						type="url"
						inputMode="url"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://…"
						disabled={mutation.isPending}
					/>
				</Field>
				<Field label="Mô tả (không bắt buộc)">
					<Textarea
						value={description}
						maxLength={MATERIAL_DESCRIPTION_MAX}
						onChange={(e) => setDescription(e.target.value)}
						disabled={mutation.isPending}
					/>
				</Field>
				<Field label="Thư mục">
					<FolderSelect
						folders={folders}
						value={folderId}
						onChange={setFolderId}
						rootLabel={ROOT_LABEL}
						disabled={mutation.isPending}
					/>
				</Field>
				<FormError message={error} />
			</form>
		</Modal>
	);
}

/** Dòng hướng dẫn định dạng + giới hạn (khớp `MATERIAL_MIME`). */
export const UPLOAD_HELP =
	"PDF, PNG/JPG/WEBP, DOCX/PPTX/XLSX tối đa 25 MB; MP3/M4A/MP4 tối đa 95 MB.";

function noopClose() {
	// Khóa đóng hộp thoại trong khi hàng đợi tải file đang chạy.
}

function getUploadSubmitLabel(
	isUploading: boolean,
	summary: MaterialUploadBatchSummary,
): string | null {
	if (isUploading) {
		return summary.validTotal > 1
			? `Đang tải (${summary.completedValid}/${summary.validTotal})…`
			: "Đang tải lên…";
	}
	if (summary.pending > 0) {
		return summary.pending === 1
			? "Tải lên"
			: `Tải lên ${summary.pending} file`;
	}
	if (summary.error > 0) {
		return `Thử lại ${summary.error} file lỗi`;
	}
	if (summary.done > 0) {
		return null;
	}
	return "Tải lên";
}

export function UploadDialog({
	folders,
	defaultFolderId,
	onClose,
}: {
	folders: readonly MaterialFolderView[];
	defaultFolderId: string | null;
	onClose: () => void;
}) {
	const formId = useId();
	const fileInputId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [folderId, setFolderId] = useState(defaultFolderId);
	const effectiveFolderId =
		folderId !== null && folders.some((f) => f.id === folderId)
			? folderId
			: null;
	const [dragOver, setDragOver] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);

	const queue = useMaterialUploadQueue({
		upload: (input) =>
			uploadMaterialFile({ ...input, folderId: effectiveFolderId }),
		onBatchSettled: ({ run, summary }) => {
			if (
				run.succeeded.length > 0 &&
				summary.uploading === 0 &&
				summary.error === 0 &&
				summary.invalid === 0 &&
				summary.pending === 0
			) {
				toast.success(
					summary.done === 1
						? "Đã tải file lên."
						: `Đã tải lên ${summary.done} file.`,
				);
				onClose();
			} else if (run.succeeded.length > 0) {
				toast.success(
					run.succeeded.length === 1
						? "Đã tải 1 file lên."
						: `Đã tải lên ${run.succeeded.length} file.`,
				);
			}
		},
	});

	const { summary } = queue;
	const submitLabel = getUploadSubmitLabel(queue.isUploading, summary);

	function handleAddFiles(files: FileList | readonly File[] | null) {
		if (!files || files.length === 0 || queue.isUploading) return;
		setFormError(null);
		const result = queue.addFiles(files, { replaceIfOnlyInvalid: true });
		if (result.skippedDuplicates > 0 && result.addedCount === 0) {
			setDuplicateNotice("File vừa chọn đã có trong danh sách.");
		} else {
			setDuplicateNotice(null);
		}
	}

	function submit(e: FormEvent) {
		e.preventDefault();
		if (queue.isUploading) return;
		if (queue.items.length === 0) {
			setFormError("Chọn ít nhất một file để tải lên.");
			return;
		}
		if (summary.pending > 0) {
			setFormError(null);
			setDuplicateNotice(null);
			void queue.startUpload();
			return;
		}
		if (summary.error > 0) {
			setFormError(null);
			setDuplicateNotice(null);
			void queue.retryFailed();
		}
	}

	return (
		<Modal
			open
			onClose={queue.isUploading ? noopClose : onClose}
			title="Tải file lên"
			scrollableBody
			footer={
				<>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={queue.isUploading}
						onClick={() => {
							if (!queue.isUploading) onClose();
						}}
					>
						{summary.done > 0 || summary.error > 0 ? "Đóng" : "Hủy"}
					</Button>
					{submitLabel !== null && (
						<Button
							type="submit"
							form={formId}
							size="sm"
							disabled={queue.isUploading}
							aria-busy={queue.isUploading}
						>
							{submitLabel}
						</Button>
					)}
				</>
			}
		>
			<form id={formId} onSubmit={submit} noValidate>
				<Field label="File" htmlFor={fileInputId} help={UPLOAD_HELP}>
					{/* Input đặt ngoài nút kéo-thả để kích hoạt chọn file không tạo vòng lặp sự kiện click. */}
					<input
						ref={fileInputRef}
						id={fileInputId}
						type="file"
						multiple
						accept={MATERIAL_FILE_ACCEPT}
						aria-describedby={`${fileInputId}-help`}
						tabIndex={-1}
						className="sr-only"
						disabled={queue.isUploading}
						onChange={(e) => {
							handleAddFiles(e.target.files);
							// Xóa value sau khi đọc để có thể chọn lại cùng file ở đợt sau.
							e.target.value = "";
						}}
					/>
					<button
						type="button"
						disabled={queue.isUploading}
						aria-describedby={`${fileInputId}-help`}
						onClick={() => fileInputRef.current?.click()}
						onDragEnter={(e) => {
							e.preventDefault();
							if (!queue.isUploading) setDragOver(true);
						}}
						onDragOver={(e) => {
							e.preventDefault();
							if (!queue.isUploading) setDragOver(true);
						}}
						onDragLeave={(e) => {
							if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
								setDragOver(false);
							}
						}}
						onDrop={(e) => {
							e.preventDefault();
							setDragOver(false);
							if (queue.isUploading) return;
							handleAddFiles(e.dataTransfer?.files ?? null);
						}}
						className={cn(
							"flex min-h-28 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-5 text-center transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
							dragOver && !queue.isUploading
								? "border-primary bg-accent"
								: "border-input hover:bg-accent/50",
							queue.isUploading && "pointer-events-none opacity-60",
						)}
					>
						<Upload
							aria-hidden="true"
							className="size-5 text-muted-foreground"
						/>
						<p className="font-medium text-foreground text-sm">
							Kéo thả nhiều file vào đây, hoặc bấm để chọn
						</p>
						{queue.items.length > 0 && (
							<p className="text-muted-foreground text-xs">
								Có thể chọn thêm nhiều đợt trước khi tải lên.
							</p>
						)}
					</button>
				</Field>
				{duplicateNotice && (
					<p className="text-muted-foreground text-xs">{duplicateNotice}</p>
				)}
				<MaterialUploadQueueList
					items={queue.items}
					summary={summary}
					allowRemove
					onRemove={(id) => {
						setFormError(null);
						setDuplicateNotice(null);
						queue.removeItem(id);
					}}
				/>
				<Field label="Thư mục">
					<FolderSelect
						folders={folders}
						value={effectiveFolderId}
						onChange={setFolderId}
						rootLabel={ROOT_LABEL}
						disabled={queue.isUploading}
					/>
				</Field>
				<FormError message={formError} />
			</form>
		</Modal>
	);
}

export function EditMaterialDialog({
	item,
	folders,
	onClose,
}: {
	item: MaterialView;
	folders: readonly MaterialFolderView[];
	onClose: () => void;
}) {
	const formId = useId();
	const [title, setTitle] = useState(item.title);
	const [description, setDescription] = useState(item.description);
	const [folderId, setFolderId] = useState(item.folderId);
	const { mutation, error, setError } = useMaterialWrite(
		() =>
			updateMaterial(item.id, {
				title: title.trim(),
				description: description.trim(),
				folderId,
			}),
		{ successText: "Đã lưu tài liệu.", onDone: onClose },
	);

	function submit(e: FormEvent) {
		e.preventDefault();
		if (!title.trim()) {
			setError("Nhập tiêu đề tài liệu.");
			return;
		}
		mutation.mutate(undefined);
	}

	return (
		<Modal
			open
			onClose={onClose}
			title="Sửa tài liệu"
			footer={
				<DialogFooter
					formId={formId}
					pending={mutation.isPending}
					submitLabel="Lưu"
					onClose={onClose}
				/>
			}
		>
			<form id={formId} onSubmit={submit} noValidate>
				<Field label="Tiêu đề">
					<Input
						value={title}
						maxLength={MATERIAL_TITLE_MAX}
						onChange={(e) => setTitle(e.target.value)}
						disabled={mutation.isPending}
					/>
				</Field>
				<Field label="Mô tả">
					<Textarea
						value={description}
						maxLength={MATERIAL_DESCRIPTION_MAX}
						onChange={(e) => setDescription(e.target.value)}
						disabled={mutation.isPending}
					/>
				</Field>
				<Field label="Thư mục">
					<FolderSelect
						folders={folders}
						value={folderId}
						onChange={setFolderId}
						rootLabel={ROOT_LABEL}
						disabled={mutation.isPending}
					/>
				</Field>
				<FormError message={error} />
			</form>
		</Modal>
	);
}

export type DeleteTarget =
	| { type: "material"; item: MaterialView }
	| { type: "folder"; folder: MaterialFolderView };

export function DeleteDialog({
	target,
	onClose,
	onDeleted,
}: {
	target: DeleteTarget;
	onClose: () => void;
	onDeleted?: () => void;
}) {
	const formId = useId();
	const { mutation, error } = useMaterialWrite(
		() =>
			target.type === "material"
				? deleteMaterial(target.item.id)
				: deleteMaterialFolder(target.folder.id),
		{
			successText:
				target.type === "material" ? "Đã xóa tài liệu." : "Đã xóa thư mục.",
			onDone: () => {
				onDeleted?.();
				onClose();
			},
		},
	);
	const name =
		target.type === "material" ? target.item.title : target.folder.name;
	return (
		<Modal
			open
			onClose={onClose}
			title={target.type === "material" ? "Xóa tài liệu" : "Xóa thư mục"}
			footer={
				<DialogFooter
					formId={formId}
					pending={mutation.isPending}
					submitLabel="Xóa"
					onClose={onClose}
					destructive
				/>
			}
		>
			<form
				id={formId}
				onSubmit={(e) => {
					e.preventDefault();
					mutation.mutate(undefined);
				}}
			>
				<p className="text-sm">
					{target.type === "material"
						? `Xóa “${name}” khỏi ngân hàng tài liệu? Không thể hoàn tác.`
						: `Xóa thư mục “${name}”? Chỉ xóa được thư mục rỗng.`}
				</p>
				<FormError message={error} />
			</form>
		</Modal>
	);
}
