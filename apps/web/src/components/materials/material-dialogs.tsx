import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	isSafeMaterialUrl,
	MATERIAL_DESCRIPTION_MAX,
	MATERIAL_FOLDER_NAME_MAX,
	MATERIAL_TITLE_MAX,
	type MaterialFolderView,
	type MaterialView,
} from "@teacher-os/api/material-contracts";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { FolderSelect } from "@/components/materials/folder-select";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { isHttpError } from "@/lib/kernel-load-state";
import { folderSubtreeIds } from "@/lib/material-folders";
import { reauth } from "@/lib/reauth";
import {
	createMaterialFolder,
	createMaterialLink,
	deleteMaterial,
	deleteMaterialFolder,
	formatBytes,
	materialErrorMessage,
	materialsAllQueryKey,
	prepareMaterialUpload,
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
			// 404/409: dữ liệu trên máy đã cũ — tải lại để giao diện khớp server.
			if (isHttpError(err) && (err.status === 404 || err.status === 409)) {
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
	const [parentId, setParentId] = useState<string | null>(
		mode.type === "create" ? mode.parentId : mode.folder.parentId,
	);
	const { mutation, error, setError } = useMaterialWrite(
		() => {
			if (mode.type === "create") {
				return createMaterialFolder({ name: name.trim(), parentId });
			}
			if (mode.type === "rename") {
				return updateMaterialFolder(mode.folder.id, { name: name.trim() });
			}
			return updateMaterialFolder(mode.folder.id, { parentId });
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
	const exclude =
		mode.type === "move"
			? folderSubtreeIds(folders, mode.folder.id)
			: undefined;

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
							value={parentId}
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
	"PDF, PNG/JPG/WEBP, DOCX/PPTX/XLSX tối đa 25 MB; MP3/M4A/MP4 tối đa 100 MB.";

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
	const [file, setFile] = useState<File | null>(null);
	const [folderId, setFolderId] = useState(defaultFolderId);
	const { mutation, error, setError } = useMaterialWrite(
		(input: { file: File; mimeType: string }) =>
			uploadMaterialFile({ ...input, folderId }),
		{ successText: "Đã tải file lên.", onDone: onClose },
	);

	function pick(next: File | null) {
		setFile(next);
		setError(null);
		if (next) {
			const prep = prepareMaterialUpload(next);
			if (!prep.ok) setError(prep.message);
		}
	}

	function submit(e: FormEvent) {
		e.preventDefault();
		if (!file) {
			setError("Chọn một file để tải lên.");
			return;
		}
		const prep = prepareMaterialUpload(file);
		if (!prep.ok) {
			setError(prep.message);
			return;
		}
		mutation.mutate({ file, mimeType: prep.mimeType });
	}

	return (
		<Modal
			open
			onClose={onClose}
			title="Tải file lên"
			footer={
				<DialogFooter
					formId={formId}
					pending={mutation.isPending}
					submitLabel="Tải lên"
					onClose={onClose}
				/>
			}
		>
			<form id={formId} onSubmit={submit} noValidate>
				<Field label="File" help={UPLOAD_HELP}>
					<Input
						type="file"
						className="h-auto py-1.5"
						accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.mp3,.m4a,.mp4"
						onChange={(e) => pick(e.target.files?.[0] ?? null)}
						disabled={mutation.isPending}
					/>
				</Field>
				{file && (
					<p className="break-all text-muted-foreground text-xs">
						{`${file.name} · ${formatBytes(file.size)}`}
					</p>
				)}
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
