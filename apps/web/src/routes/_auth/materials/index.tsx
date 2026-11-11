import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import {
	isMaterialKind,
	MATERIAL_FOLDER_MAX_DEPTH,
	MATERIAL_KINDS,
	MATERIAL_ROOT_FOLDER,
	MATERIAL_SEARCH_MAX,
	type MaterialFolderView,
	type MaterialKind,
	type MaterialView,
} from "@teacher-os/api/material-contracts";
import {
	Folder,
	FolderInput,
	FolderPlus,
	Library,
	Link2,
	Pencil,
	Trash2,
	Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	DeleteDialog,
	type DeleteTarget,
	EditMaterialDialog,
	FolderDialog,
	type FolderDialogMode,
	LinkDialog,
	UploadDialog,
} from "@/components/materials/material-dialogs";
import {
	MATERIAL_KIND_LABELS,
	MaterialItem,
	MaterialOpenActions,
} from "@/components/materials/material-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { inputCls } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import { cn } from "@/lib/cn";
import { flattenFolderTree, folderPath } from "@/lib/material-folders";
import {
	fetchMaterialFolders,
	fetchMaterials,
	materialFoldersQueryKey,
	materialListQueryKey,
	useCanWriteMaterials,
} from "@/lib/repos/materials";

/**
 * Ngân hàng tài liệu của trung tâm: cây thư mục bên trái, danh sách tài
 * liệu bên phải. Bộ lọc sống trong URL (?q=&kind=&folderId=) để reload/
 * back/share giữ nguyên; ô tìm kiếm debounce 300ms mới đẩy lên URL.
 * `folderId` vắng = mọi thư mục, `root` = tài liệu chưa xếp thư mục.
 */

export interface MaterialsSearch {
	q?: string;
	kind?: MaterialKind;
	folderId?: string;
}

/** Chuẩn hóa search params — giá trị lạ/mặc định rơi về undefined. */
export function validateMaterialsSearch(input: {
	q?: unknown;
	kind?: unknown;
	folderId?: unknown;
}): MaterialsSearch {
	const rawQ =
		typeof input.q === "string"
			? input.q
			: typeof input.q === "number"
				? String(input.q)
				: "";
	const q =
		rawQ.trim().length > 0 ? rawQ.slice(0, MATERIAL_SEARCH_MAX) : undefined;
	const kind =
		typeof input.kind === "string" && isMaterialKind(input.kind)
			? input.kind
			: undefined;
	const folderId =
		typeof input.folderId === "string" && input.folderId.trim() !== ""
			? input.folderId.trim()
			: undefined;
	return {
		...(q ? { q } : {}),
		...(kind ? { kind } : {}),
		...(folderId ? { folderId } : {}),
	};
}

export const Route = createFileRoute("/_auth/materials/")({
	validateSearch: validateMaterialsSearch,
	component: MaterialsRoute,
});

const ALL_KINDS_LABEL = "Tất cả";
const KIND_FILTERS: ReadonlyArray<{ label: string; id: "all" | MaterialKind }> =
	[
		{ label: ALL_KINDS_LABEL, id: "all" },
		...MATERIAL_KINDS.map((kind) => ({
			label: MATERIAL_KIND_LABELS[kind],
			id: kind,
		})),
	];

type DialogState =
	| { type: "folder"; mode: FolderDialogMode }
	| { type: "link" }
	| { type: "upload" }
	| { type: "edit"; item: MaterialView }
	| { type: "delete"; target: DeleteTarget }
	| null;

function MaterialsRoute() {
	const navigate = useNavigate();
	const searchParams = useSearch({ from: "/_auth/materials/" });
	const kindFilter = searchParams.kind;
	const folderFilter = searchParams.folderId;

	const [query, setQuery] = useState(() => searchParams.q ?? "");
	const lastEmittedQuery = useRef(query);
	const [dialog, setDialog] = useState<DialogState>(null);
	const canWrite = useCanWriteMaterials();

	useEffect(() => {
		if (!canWrite) setDialog(null);
	}, [canWrite]);

	const foldersQuery = useQuery({
		queryKey: materialFoldersQueryKey,
		queryFn: ({ signal }) => fetchMaterialFolders(signal),
	});
	// Loại lọc ở client để chip có badge đếm theo cùng q + thư mục.
	const listParams = {
		...(searchParams.q?.trim() ? { q: searchParams.q.trim() } : {}),
		...(folderFilter ? { folderId: folderFilter } : {}),
	};
	const listQuery = useQuery({
		queryKey: materialListQueryKey(listParams),
		queryFn: ({ signal }) => fetchMaterials(listParams, signal),
	});

	function applyFilters(next: MaterialsSearch) {
		lastEmittedQuery.current = next.q ?? "";
		void navigate({
			to: "/materials",
			search: validateMaterialsSearch(next),
			replace: true,
		});
	}

	// q đổi từ phía URL (back/forward, link chia sẻ) → đồng bộ xuống ô nhập.
	useEffect(() => {
		const urlQ = searchParams.q ?? "";
		if (urlQ !== lastEmittedQuery.current) {
			lastEmittedQuery.current = urlQ;
			setQuery(urlQ);
		}
	}, [searchParams.q]);

	// Ngừng gõ 300ms → đẩy q lên URL.
	useEffect(() => {
		const timer = setTimeout(() => {
			if (query === lastEmittedQuery.current) return;
			lastEmittedQuery.current = query;
			applyFilters({ q: query, kind: kindFilter, folderId: folderFilter });
		}, 300);
		return () => clearTimeout(timer);
	}, [query, kindFilter, folderFilter, navigate]);

	const folders = foldersQuery.data ?? [];
	const selectedFolder =
		folderFilter && folderFilter !== MATERIAL_ROOT_FOLDER
			? (folders.find((f) => f.id === folderFilter) ?? null)
			: null;
	const missingFolder =
		foldersQuery.isSuccess &&
		folderFilter !== undefined &&
		folderFilter !== MATERIAL_ROOT_FOLDER &&
		selectedFolder === null;
	/** Thư mục mặc định cho tài liệu mới = thư mục đang xem. */
	const defaultFolderId = selectedFolder?.id ?? null;

	const allItems = listQuery.data ?? [];
	const items = kindFilter
		? allItems.filter((item) => item.kind === kindFilter)
		: allItems;
	const kindCounts = (() => {
		if (!listQuery.data) return undefined;
		const counts: Record<string, number> = {
			[ALL_KINDS_LABEL]: allItems.length,
		};
		for (const kind of MATERIAL_KINDS) {
			counts[MATERIAL_KIND_LABELS[kind]] = allItems.filter(
				(item) => item.kind === kind,
			).length;
		}
		return counts;
	})();
	const hasFilter =
		Boolean(searchParams.q?.trim()) ||
		kindFilter !== undefined ||
		folderFilter !== undefined;

	const selectFolder = (folderId: string | undefined) =>
		applyFilters({ q: query, kind: kindFilter, folderId });

	return (
		<div className="min-w-0">
			<PageHead
				title="Tài liệu"
				lead="Ngân hàng tài liệu dùng chung của trung tâm: file, liên kết, audio/video. Gắn vào buổi học từ trang lớp."
				action={
					canWrite ? (
						<>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setDialog({ type: "link" })}
							>
								<Link2 aria-hidden="true" />
								Thêm liên kết
							</Button>
							<Button size="sm" onClick={() => setDialog({ type: "upload" })}>
								<Upload aria-hidden="true" />
								Tải file lên
							</Button>
						</>
					) : undefined
				}
			/>

			<div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:items-start">
				<FolderPanel
					folders={folders}
					status={foldersQuery.status}
					onRetry={() => void foldersQuery.refetch()}
					selected={folderFilter}
					selectedFolder={selectedFolder}
					onSelect={selectFolder}
					onDialog={setDialog}
					canWrite={canWrite}
				/>

				<div className="flex min-w-0 flex-col gap-4">
					<Card className="flex flex-col gap-4 p-5">
						<input
							type="search"
							value={query}
							maxLength={MATERIAL_SEARCH_MAX}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Tìm theo tiêu đề, mô tả hoặc tên file…"
							aria-label="Tìm tài liệu"
							className={inputCls}
						/>
						<div className="flex flex-col gap-1.5">
							<span className="font-medium text-muted-foreground text-xs">
								Loại tài liệu
							</span>
							<ChipFilter
								options={KIND_FILTERS.map((f) => f.label)}
								value={
									KIND_FILTERS.find((f) => f.id === (kindFilter ?? "all"))
										?.label ?? ALL_KINDS_LABEL
								}
								onChange={(label) => {
									const id = KIND_FILTERS.find((f) => f.label === label)?.id;
									applyFilters({
										q: query,
										kind: id && id !== "all" ? id : undefined,
										folderId: folderFilter,
									});
								}}
								ariaLabel="Loại tài liệu"
								counts={kindCounts}
							/>
						</div>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p
								aria-live="polite"
								className="text-muted-foreground text-xs tabular-nums"
							>
								{listQuery.data
									? `${items.length} tài liệu${
											selectedFolder
												? ` trong “${selectedFolder.name}”`
												: folderFilter === MATERIAL_ROOT_FOLDER
													? " chưa xếp thư mục"
													: ""
										}`
									: ""}
							</p>
							{hasFilter && (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setQuery("");
										applyFilters({});
									}}
								>
									Xóa bộ lọc
								</Button>
							)}
						</div>
					</Card>

					{missingFolder && (
						<Card className="p-5 text-sm" role="status">
							Thư mục này không còn tồn tại.{" "}
							<button
								type="button"
								className="font-medium underline underline-offset-4 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
								onClick={() => selectFolder(undefined)}
							>
								Xem tất cả tài liệu
							</button>
						</Card>
					)}

					{listQuery.isPending ? (
						<Card className="p-8 text-center text-muted-foreground text-sm">
							Đang tải tài liệu…
						</Card>
					) : listQuery.isError ? (
						<Card className="p-8 text-center" role="alert">
							<p className="text-sm">Không tải được danh sách tài liệu.</p>
							<Button
								variant="outline"
								size="sm"
								className="mt-3"
								onClick={() => void listQuery.refetch()}
							>
								Thử lại
							</Button>
						</Card>
					) : items.length === 0 ? (
						hasFilter ? (
							<Card className="p-8 text-center" data-testid="materials-empty">
								<p className="text-muted-foreground text-sm">
									Không có tài liệu nào phù hợp với bộ lọc.
								</p>
							</Card>
						) : (
							<Card className="p-8 text-center" data-testid="materials-empty">
								<Library
									aria-hidden="true"
									className="mx-auto size-8 text-muted-foreground"
								/>
								<h2 className="mt-3 font-semibold text-lg">
									Chưa có tài liệu nào
								</h2>
								<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
									{canWrite
										? "Ngân hàng tài liệu chứa file, liên kết và audio/video dùng chung cho mọi lớp. Thêm tài liệu đầu tiên để gắn vào buổi học."
										: "Ngân hàng tài liệu của trung tâm hiện chưa có học liệu nào."}
								</p>
								{canWrite && (
									<div className="mt-4 flex flex-wrap justify-center gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => setDialog({ type: "link" })}
										>
											Thêm liên kết
										</Button>
										<Button
											size="sm"
											onClick={() => setDialog({ type: "upload" })}
										>
											Tải file lên
										</Button>
									</div>
								)}
							</Card>
						)
					) : (
						<ul className="grid gap-2" aria-label="Danh sách tài liệu">
							{items.map((item) => {
								const path =
									folderFilter === undefined
										? folderPath(folders, item.folderId)
										: null;
								return (
									<MaterialItem
										key={item.id}
										item={item}
										detail={
											<>
												{path && (
													<span className="inline-flex items-center gap-1">
														<Folder aria-hidden="true" className="size-3" />
														{path}
													</span>
												)}
												{item.usageCount > 0 ? (
													<Badge variant="outline">
														{`Dùng ở ${item.usageCount} buổi`}
													</Badge>
												) : (
													<span>Chưa dùng ở buổi nào</span>
												)}
											</>
										}
										actions={
											<>
												<MaterialOpenActions item={item} />
												{canWrite && (
													<>
														<Button
															variant="ghost"
															size="sm"
															aria-label={`Sửa ${item.title}`}
															onClick={() => setDialog({ type: "edit", item })}
														>
															<Pencil aria-hidden="true" />
															<span className="max-sm:sr-only">Sửa</span>
														</Button>
														<Button
															variant="ghost"
															size="sm"
															aria-label={`Xóa ${item.title}`}
															onClick={() =>
																setDialog({
																	type: "delete",
																	target: { type: "material", item },
																})
															}
														>
															<Trash2 aria-hidden="true" />
															<span className="max-sm:sr-only">Xóa</span>
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
				</div>
			</div>

			{canWrite && dialog?.type === "folder" && (
				<FolderDialog
					mode={dialog.mode}
					folders={folders}
					onClose={() => setDialog(null)}
					onSaved={(folder) => {
						if (dialog.mode.type === "create") selectFolder(folder.id);
					}}
				/>
			)}
			{canWrite && dialog?.type === "link" && (
				<LinkDialog
					folders={folders}
					defaultFolderId={defaultFolderId}
					onClose={() => setDialog(null)}
				/>
			)}
			{canWrite && dialog?.type === "upload" && (
				<UploadDialog
					folders={folders}
					defaultFolderId={defaultFolderId}
					onClose={() => setDialog(null)}
				/>
			)}
			{canWrite && dialog?.type === "edit" && (
				<EditMaterialDialog
					item={dialog.item}
					folders={folders}
					onClose={() => setDialog(null)}
				/>
			)}
			{canWrite && dialog?.type === "delete" && (
				<DeleteDialog
					target={dialog.target}
					onClose={() => setDialog(null)}
					onDeleted={() => {
						if (
							dialog.target.type === "folder" &&
							dialog.target.folder.id === folderFilter
						) {
							selectFolder(undefined);
						}
					}}
				/>
			)}
		</div>
	);
}

function FolderPanel({
	folders,
	status,
	onRetry,
	selected,
	selectedFolder,
	onSelect,
	onDialog,
	canWrite,
}: {
	folders: readonly MaterialFolderView[];
	status: "pending" | "error" | "success";
	onRetry: () => void;
	selected: string | undefined;
	selectedFolder: MaterialFolderView | null;
	onSelect: (folderId: string | undefined) => void;
	onDialog: (dialog: DialogState) => void;
	canWrite: boolean;
}) {
	const rows = flattenFolderTree(folders);
	const itemCls = (active: boolean) =>
		cn(
			"flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors focus-visible:shadow-[var(--focus-ring)]",
			active
				? "bg-primary text-primary-foreground"
				: "text-foreground hover:bg-accent hover:text-accent-foreground",
		);
	return (
		<Card className="flex min-w-0 flex-col gap-3 p-4">
			<div className="flex items-center justify-between gap-2">
				<h2 className="font-medium text-sm">Thư mục</h2>
				{canWrite && (
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							onDialog({
								type: "folder",
								mode: {
									type: "create",
									parentId: selectedFolder?.id ?? null,
								},
							})
						}
					>
						<FolderPlus aria-hidden="true" />
						Thư mục mới
					</Button>
				)}
			</div>
			<nav aria-label="Thư mục tài liệu">
				<ul className="flex flex-col gap-0.5">
					<li>
						<button
							type="button"
							className={itemCls(selected === undefined)}
							aria-current={selected === undefined ? "true" : undefined}
							onClick={() => onSelect(undefined)}
						>
							<Library aria-hidden="true" className="size-4 shrink-0" />
							Tất cả tài liệu
						</button>
					</li>
					<li>
						<button
							type="button"
							className={itemCls(selected === MATERIAL_ROOT_FOLDER)}
							aria-current={
								selected === MATERIAL_ROOT_FOLDER ? "true" : undefined
							}
							onClick={() => onSelect(MATERIAL_ROOT_FOLDER)}
						>
							<Folder aria-hidden="true" className="size-4 shrink-0" />
							Chưa xếp thư mục
						</button>
					</li>
					{rows.map(({ folder, depth }) => {
						const clampedDepth = Math.min(depth, MATERIAL_FOLDER_MAX_DEPTH - 1);
						return (
							<li key={folder.id}>
								<button
									type="button"
									className={itemCls(selected === folder.id)}
									// Thụt lề theo cấp — kẹp tối đa MATERIAL_FOLDER_MAX_DEPTH - 1 để không tràn panel.
									style={{ paddingLeft: `${0.5 + clampedDepth * 0.875}rem` }}
									aria-current={selected === folder.id ? "true" : undefined}
									onClick={() => onSelect(folder.id)}
								>
									<Folder aria-hidden="true" className="size-4 shrink-0" />
									<span className="truncate">{folder.name}</span>
								</button>
							</li>
						);
					})}
				</ul>
			</nav>
			{status === "pending" && (
				<p className="text-muted-foreground text-xs">Đang tải thư mục…</p>
			)}
			{status === "error" && (
				<div role="alert" className="text-xs">
					<p>Không tải được thư mục.</p>
					<Button variant="link" size="sm" className="px-0" onClick={onRetry}>
						Thử lại
					</Button>
				</div>
			)}
			{status === "success" && folders.length === 0 && (
				<p className="text-muted-foreground text-xs">
					{canWrite
						? "Chưa có thư mục. Tạo thư mục để sắp xếp tài liệu theo khóa, kỹ năng…"
						: "Chưa có thư mục."}
				</p>
			)}
			{canWrite && selectedFolder && (
				<fieldset
					aria-label={`Thao tác thư mục ${selectedFolder.name}`}
					className="flex flex-wrap gap-1 border-t pt-3"
				>
					<Button
						variant="ghost"
						size="sm"
						onClick={() =>
							onDialog({
								type: "folder",
								mode: { type: "rename", folder: selectedFolder },
							})
						}
					>
						<Pencil aria-hidden="true" />
						Đổi tên
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() =>
							onDialog({
								type: "folder",
								mode: { type: "move", folder: selectedFolder },
							})
						}
					>
						<FolderInput aria-hidden="true" />
						Di chuyển
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() =>
							onDialog({
								type: "delete",
								target: { type: "folder", folder: selectedFolder },
							})
						}
					>
						<Trash2 aria-hidden="true" />
						Xóa thư mục
					</Button>
				</fieldset>
			)}
		</Card>
	);
}
