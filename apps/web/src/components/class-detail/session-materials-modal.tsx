import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MATERIAL_ROOT_FOLDER } from "@teacher-os/api/material-contracts";
import { ArrowLeft, Library, Unlink, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { UPLOAD_HELP } from "@/components/materials/material-dialogs";
import {
	MaterialItem,
	MaterialOpenActions,
} from "@/components/materials/material-item";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { isHttpError } from "@/lib/kernel-load-state";
import { flattenFolderTree } from "@/lib/material-folders";
import { reauth } from "@/lib/reauth";
import {
	attachSessionMaterial,
	detachSessionMaterial,
	fetchMaterialFolders,
	fetchMaterials,
	fetchSessionMaterials,
	type MaterialListParams,
	materialErrorMessage,
	materialFoldersQueryKey,
	materialListQueryKey,
	materialsAllQueryKey,
	prepareMaterialUpload,
	sessionMaterialsQueryKey,
	uploadSessionMaterial,
} from "@/lib/repos/materials";

const ALL_FOLDERS = "";

/**
 * Tài liệu của một buổi học (lớp + ngày): liệt kê tài liệu đã gắn, gỡ, chọn
 * thêm từ ngân hàng (duyệt thư mục + tìm kiếm) hoặc tải file mới — file tải
 * lên luôn nằm trong ngân hàng, buổi học chỉ tham chiếu. Parent chỉ mount
 * khi mở nên không có query nào chạy cho các buổi đang đóng.
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
	const sessionKey = sessionMaterialsQueryKey(classId, dateISO);
	const sessionQuery = useQuery({
		queryKey: sessionKey,
		queryFn: ({ signal }) => fetchSessionMaterials(classId, dateISO, signal),
	});
	const attachedIds = new Set((sessionQuery.data ?? []).map((m) => m.id));

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
	const upload = useMutation({
		mutationFn: (input: { file: File; mimeType: string }) =>
			uploadSessionMaterial({ classId, date: dateISO, ...input }),
		onMutate: () => setError(null),
		onSuccess: () => onWriteSuccess("Đã tải lên và gắn vào buổi học."),
		onError: handleError,
	});
	const busy = attach.isPending || detach.isPending || upload.isPending;

	const fileInput = useRef<HTMLInputElement>(null);
	function pickFile(file: File | undefined) {
		if (fileInput.current) fileInput.current.value = "";
		if (!file) return;
		const prep = prepareMaterialUpload(file);
		if (!prep.ok) {
			setError(prep.message);
			return;
		}
		upload.mutate({ file, mimeType: prep.mimeType });
	}

	const items = sessionQuery.data ?? [];

	return (
		<Modal
			open
			onClose={onClose}
			title={
				view === "list"
					? `Tài liệu buổi ${sessionLabel}`
					: "Chọn từ ngân hàng tài liệu"
			}
			footer={
				view === "pick" ? (
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setError(null);
							setView("list");
						}}
					>
						<ArrowLeft aria-hidden="true" />
						Quay lại
					</Button>
				) : (
					<Button variant="outline" size="sm" onClick={onClose}>
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
			{view === "pick" ? (
				<MaterialPicker
					attachedIds={attachedIds}
					attachingId={attach.isPending ? attach.variables : undefined}
					disabled={busy}
					onAttach={(id) => attach.mutate(id)}
				/>
			) : (
				<>
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
							aria-busy={upload.isPending}
							onClick={() => fileInput.current?.click()}
						>
							<Upload aria-hidden="true" />
							{upload.isPending ? "Đang tải lên…" : "Tải lên mới"}
						</Button>
						<input
							ref={fileInput}
							type="file"
							className="sr-only"
							tabIndex={-1}
							aria-label="Chọn file tải lên cho buổi học"
							accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.mp3,.m4a,.mp4"
							onChange={(e) => pickFile(e.target.files?.[0])}
						/>
					</div>
					<p className="text-muted-foreground text-xs">
						{`${UPLOAD_HELP} File tải lên được lưu vào ngân hàng tài liệu (Chưa xếp thư mục).`}
					</p>
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
					) : items.length === 0 ? (
						<p
							className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm"
							data-testid="session-materials-empty"
						>
							Chưa có tài liệu nào cho buổi này. Chọn từ ngân hàng hoặc tải file
							mới.
						</p>
					) : (
						<ul className="grid gap-2" aria-label="Tài liệu đã gắn">
							{items.map((item) => (
								<MaterialItem
									key={item.id}
									item={item}
									actions={
										<>
											<MaterialOpenActions item={item} />
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
									}
								/>
							))}
						</ul>
					)}
				</>
			)}
		</Modal>
	);
}

function MaterialPicker({
	attachedIds,
	attachingId,
	disabled,
	onAttach,
}: {
	attachedIds: ReadonlySet<string>;
	attachingId: string | undefined;
	disabled: boolean;
	onAttach: (materialId: string) => void;
}) {
	const folderSelectId = useId();
	const searchId = useId();
	const [folderId, setFolderId] = useState(ALL_FOLDERS);
	const [query, setQuery] = useState("");
	const [debounced, setDebounced] = useState("");
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(query.trim()), 300);
		return () => clearTimeout(timer);
	}, [query]);

	const foldersQuery = useQuery({
		queryKey: materialFoldersQueryKey,
		queryFn: ({ signal }) => fetchMaterialFolders(signal),
	});
	const params: MaterialListParams = {
		...(debounced ? { q: debounced } : {}),
		...(folderId !== ALL_FOLDERS ? { folderId } : {}),
	};
	const listQuery = useQuery({
		queryKey: materialListQueryKey(params),
		queryFn: ({ signal }) => fetchMaterials(params, signal),
	});
	const rows = flattenFolderTree(foldersQuery.data ?? []);
	const items = listQuery.data ?? [];

	return (
		<>
			<div className="grid gap-3 sm:grid-cols-2">
				<Field label="Thư mục" htmlFor={folderSelectId}>
					<Select
						id={folderSelectId}
						value={folderId}
						onChange={(e) => setFolderId(e.target.value)}
					>
						<option value={ALL_FOLDERS}>Tất cả thư mục</option>
						<option value={MATERIAL_ROOT_FOLDER}>Chưa xếp thư mục</option>
						{rows.map(({ folder, depth }) => (
							<option key={folder.id} value={folder.id}>
								{`${"  ".repeat(depth)}${depth > 0 ? "└ " : ""}${folder.name}`}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Tìm kiếm" htmlFor={searchId}>
					<Input
						id={searchId}
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Tiêu đề, mô tả…"
					/>
				</Field>
			</div>
			{listQuery.isPending ? (
				<p className="text-muted-foreground text-sm">Đang tải tài liệu…</p>
			) : listQuery.isError ? (
				<div role="alert" className="text-sm">
					<p>{materialErrorMessage(listQuery.error)}</p>
					<Button
						variant="link"
						size="sm"
						className="px-0"
						onClick={() => void listQuery.refetch()}
					>
						Thử lại
					</Button>
				</div>
			) : items.length === 0 ? (
				<p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
					{debounced || folderId !== ALL_FOLDERS
						? "Không có tài liệu phù hợp."
						: "Ngân hàng chưa có tài liệu. Dùng “Tải lên mới” hoặc thêm ở trang Tài liệu."}
				</p>
			) : (
				<ul
					className="grid max-h-[50vh] gap-2 overflow-y-auto"
					aria-label="Tài liệu trong ngân hàng"
				>
					{items.map((item) => {
						const attached = attachedIds.has(item.id);
						return (
							<MaterialItem
								key={item.id}
								item={item}
								actions={
									<Button
										variant={attached ? "ghost" : "outline"}
										size="sm"
										disabled={attached || disabled}
										aria-label={
											attached ? `Đã gắn ${item.title}` : `Gắn ${item.title}`
										}
										onClick={() => onAttach(item.id)}
									>
										{attached
											? "Đã gắn"
											: attachingId === item.id
												? "Đang gắn…"
												: "Gắn"}
									</Button>
								}
							/>
						);
					})}
				</ul>
			)}
		</>
	);
}
