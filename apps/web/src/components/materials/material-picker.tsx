import { useQuery } from "@tanstack/react-query";
import { MATERIAL_LINKS_MAX } from "@teacher-os/api/contracts";
import {
	MATERIAL_FOLDER_MAX_DEPTH,
	MATERIAL_ROOT_FOLDER,
	type MaterialView,
	type SyllabusBankMaterialRef,
} from "@teacher-os/api/material-contracts";
import { Library, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { UPLOAD_HELP } from "@/components/materials/material-dialogs";
import { MaterialItem } from "@/components/materials/material-item";
import {
	MATERIAL_FILE_ACCEPT,
	MaterialUploadQueueList,
	useMaterialUploadQueue,
} from "@/components/materials/material-upload-queue";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { flattenFolderTree } from "@/lib/material-folders";
import { mergeUploadQueueFiles } from "@/lib/material-upload-queue";
import {
	fetchMaterialFolders,
	fetchMaterials,
	type MaterialListParams,
	materialErrorMessage,
	materialFoldersQueryKey,
	materialListQueryKey,
	uploadMaterialFile,
	useCanWriteMaterials,
} from "@/lib/repos/materials";

const ALL_FOLDERS = "";

/**
 * Projection an toàn của một tài liệu ngân hàng để giữ trong state form
 * (#655): cùng hình dạng `SyllabusBankMaterialRef`, không cột teacher-only.
 * `position` chỉ để hiển thị — payload gửi đi chỉ chứa materialIds.
 */
export function bankMaterialRef(
	item: MaterialView,
	position: number,
): SyllabusBankMaterialRef {
	return {
		id: item.id,
		title: item.title,
		description: item.description,
		kind: item.kind,
		url: item.url,
		mimeType: item.mimeType,
		sizeBytes: item.sizeBytes,
		originalName: item.originalName,
		position,
	};
}

/**
 * Nội dung duyệt ngân hàng tài liệu: lọc thư mục + tìm kiếm (debounce 300ms)
 * và danh sách dòng với nút gắn. Tài liệu đã có trong `selectedIds` hiện
 * "Đã gắn" và khoá nút. Dùng chung cho buổi học (SessionMaterialsModal) và
 * các form tạo buổi/thêm-sửa bài học (#655).
 */
export function MaterialBankBrowser({
	selectedIds,
	pendingId,
	disabled,
	maxSelected,
	onPick,
}: {
	selectedIds: ReadonlySet<string>;
	/** Id đang gắn dở (để dòng đó hiện "Đang gắn…"). */
	pendingId: string | undefined;
	disabled: boolean;
	/** Trần số tài liệu được gắn (form tạo buổi/bài #655) — vắng mặt là
	 * không trần (modal gắn tài liệu của buổi có sẵn). */
	maxSelected?: number;
	onPick: (ref: SyllabusBankMaterialRef) => void;
}) {
	const folderSelectId = useId();
	const searchId = useId();
	const canWrite = useCanWriteMaterials();
	const [folderId, setFolderId] = useState(ALL_FOLDERS);
	const [query, setQuery] = useState("");
	const [debounced, setDebounced] = useState("");
	const atCap = maxSelected !== undefined && selectedIds.size >= maxSelected;
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
						{rows.map(({ folder, depth }) => {
							const clampedDepth = Math.min(
								depth,
								MATERIAL_FOLDER_MAX_DEPTH - 1,
							);
							return (
								<option key={folder.id} value={folder.id}>
									{`${"\u00a0\u00a0".repeat(clampedDepth)}${clampedDepth > 0 ? "└ " : ""}${folder.name}`}
								</option>
							);
						})}
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
						: canWrite
							? "Ngân hàng chưa có tài liệu. Dùng “Tải lên mới” hoặc thêm ở trang Tài liệu."
							: "Ngân hàng tài liệu của trung tâm hiện chưa có học liệu nào."}
				</p>
			) : (
				<ul
					className="grid max-h-[50vh] gap-2 overflow-y-auto"
					aria-label="Tài liệu trong ngân hàng"
				>
					{items.map((item) => {
						const attached = selectedIds.has(item.id);
						return (
							<MaterialItem
								key={item.id}
								item={item}
								actions={
									<Button
										variant={attached ? "ghost" : "outline"}
										size="sm"
										disabled={attached || disabled || atCap}
										aria-label={
											attached ? `Đã gắn ${item.title}` : `Gắn ${item.title}`
										}
										onClick={() =>
											onPick(bankMaterialRef(item, selectedIds.size))
										}
									>
										{attached
											? "Đã gắn"
											: pendingId === item.id
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

function slotCapError(needed: number, currentCount: number): string | null {
	const remaining = Math.max(0, MATERIAL_LINKS_MAX - currentCount);
	if (needed <= remaining) return null;
	if (remaining === 0) {
		return `Tối đa ${MATERIAL_LINKS_MAX} tài liệu cho một buổi/bài — gỡ bớt để chọn thêm.`;
	}
	return `Chỉ gắn thêm được tối đa ${remaining} tài liệu nữa (đang có ${currentCount}/${MATERIAL_LINKS_MAX}). Hãy chọn ít file hơn hoặc gỡ bớt tài liệu đã chọn.`;
}

/**
 * Chọn tài liệu ngân hàng ngay trong form (tạo buổi học, thêm/sửa bài học):
 * chips đã chọn (× để gỡ), "+ Chọn từ ngân hàng" mở modal duyệt, "+ Tải file lên"
 * đẩy một hoặc nhiều file lên NGÂN HÀNG (đường `/materials/files`, luôn về
 * thư mục gốc — không phải đường theo buổi) rồi chọn luôn các file vừa tạo.
 * Controlled: cha giữ `selected` qua `onPick`/`onRemove`.
 */
export function MaterialPicker({
	selected,
	onPick,
	onRemove,
	disabled = false,
}: {
	selected: readonly SyllabusBankMaterialRef[];
	onPick: (ref: SyllabusBankMaterialRef) => void;
	onRemove: (id: string) => void;
	disabled?: boolean;
}) {
	const canWrite = useCanWriteMaterials();
	const [browsing, setBrowsing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const selectedLengthRef = useRef(selected.length);
	selectedLengthRef.current = selected.length;
	const nextPositionRef = useRef(selected.length);
	const clearUploadQueueRef = useRef<() => void>(() => undefined);

	// Trần contract (`materialIds` max MATERIAL_LINKS_MAX) — chặn trước ở
	// picker thay vì để server trả 422 với thông báo chung.
	const atCap = selected.length >= MATERIAL_LINKS_MAX;

	const uploadQueue = useMaterialUploadQueue({
		upload: (input) =>
			// Đường upload NGÂN HÀNG (như trang Tài liệu): file luôn về thư mục gốc.
			uploadMaterialFile({ ...input, folderId: null }),
		onFileUploaded: (material) => {
			const pos = nextPositionRef.current;
			nextPositionRef.current += 1;
			onPick(bankMaterialRef(material, pos));
		},
		onBatchSettled: ({ run, summary }) => {
			if (run.succeeded.length === 0) return;
			if (
				summary.total === 1 &&
				summary.done === 1 &&
				summary.error === 0 &&
				summary.invalid === 0
			) {
				toast.success("Đã tải lên ngân hàng tài liệu.");
				clearUploadQueueRef.current();
				return;
			}
			if (summary.done > 1 && summary.error === 0 && summary.invalid === 0) {
				toast.success(
					`Đã tải lên ${summary.done} file vào ngân hàng tài liệu.`,
				);
				return;
			}
			toast.success(
				run.succeeded.length === 1
					? "Đã tải lên 1 file vào ngân hàng tài liệu."
					: `Đã tải lên ${run.succeeded.length} file vào ngân hàng tài liệu.`,
			);
		},
	});
	const clearUploadQueue = uploadQueue.clear;
	clearUploadQueueRef.current = clearUploadQueue;

	useEffect(() => {
		if (!canWrite) {
			setError(null);
			clearUploadQueue();
		}
	}, [canWrite, clearUploadQueue]);

	function pickFiles(files: FileList | null) {
		const picked = files ? Array.from(files) : [];
		if (fileInput.current) fileInput.current.value = "";
		if (picked.length === 0 || disabled || uploadQueue.isUploading) return;
		const precheck = mergeUploadQueueFiles([], picked);
		const validCount = precheck.items.filter(
			(item) => item.status === "pending",
		).length;
		const capErr = slotCapError(validCount, selectedLengthRef.current);
		if (capErr) {
			uploadQueue.clear();
			setError(capErr);
			return;
		}
		setError(null);
		nextPositionRef.current = selectedLengthRef.current;
		void uploadQueue.uploadFilesNow(picked);
	}

	function handleRetryFailed() {
		if (disabled || uploadQueue.isUploading) return;
		const capErr = slotCapError(
			uploadQueue.summary.error,
			selectedLengthRef.current,
		);
		if (capErr) {
			setError(capErr);
			return;
		}
		setError(null);
		nextPositionRef.current = selectedLengthRef.current;
		void uploadQueue.retryFailed();
	}

	return (
		// biome-ignore lint/a11y/useSemanticElements: role="group" + aria-label đặt tên nhóm chips/nút theo pattern ChipFilter cho SR/e2e
		<div
			role="group"
			aria-label="Tài liệu ngân hàng"
			className="grid min-w-0 gap-2"
		>
			{selected.length > 0 && (
				<ul aria-label="Tài liệu đã chọn" className="flex flex-wrap gap-1.5">
					{selected.map((item) => (
						<li key={item.id}>
							<span className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary bg-primary py-0.5 pr-1 pl-2.5 text-primary-foreground text-xs">
								<span className="truncate">{item.title}</span>
								<button
									type="button"
									disabled={disabled}
									aria-label={`Gỡ ${item.title}`}
									onClick={() => onRemove(item.id)}
									className="shrink-0 rounded-full p-0.5 transition-colors duration-[150ms] hover:bg-primary-foreground/20 disabled:pointer-events-none disabled:opacity-40"
								>
									<X aria-hidden="true" className="size-3.5" />
								</button>
							</span>
						</li>
					))}
				</ul>
			)}
			<div className="flex flex-wrap gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={disabled || uploadQueue.isUploading}
					onClick={() => {
						setError(null);
						setBrowsing(true);
					}}
				>
					<Library aria-hidden="true" />
					Chọn từ ngân hàng
				</Button>
				{canWrite && (
					<>
						<Button
							variant="outline"
							size="sm"
							disabled={disabled || atCap || uploadQueue.isUploading}
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
							aria-label="Chọn file tải lên ngân hàng tài liệu"
							accept={MATERIAL_FILE_ACCEPT}
							onChange={(e) => pickFiles(e.target.files)}
						/>
					</>
				)}
			</div>
			{(canWrite || atCap) && (
				<p className="text-muted-foreground text-xs">
					{canWrite
						? `${UPLOAD_HELP} File tải lên được lưu vào ngân hàng tài liệu (Chưa xếp thư mục).`
						: ""}
					{atCap
						? `${canWrite ? " " : ""}Tối đa ${MATERIAL_LINKS_MAX} tài liệu cho một buổi/bài — gỡ bớt để chọn thêm.`
						: ""}
				</p>
			)}
			{canWrite && uploadQueue.items.length > 0 && (
				<MaterialUploadQueueList
					compact
					items={uploadQueue.items}
					summary={uploadQueue.summary}
					disabled={disabled}
					suppressAlert={Boolean(error)}
					onRetryFailed={handleRetryFailed}
					onDismiss={uploadQueue.clear}
				/>
			)}
			{error && (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			)}
			{browsing && (
				<Modal
					open
					onClose={() => setBrowsing(false)}
					title="Chọn từ ngân hàng tài liệu"
					footer={
						<Button
							variant="outline"
							size="sm"
							onClick={() => setBrowsing(false)}
						>
							Đóng
						</Button>
					}
				>
					<MaterialBankBrowser
						selectedIds={new Set(selected.map((m) => m.id))}
						pendingId={undefined}
						disabled={disabled || uploadQueue.isUploading}
						maxSelected={MATERIAL_LINKS_MAX}
						onPick={onPick}
					/>
				</Modal>
			)}
		</div>
	);
}
