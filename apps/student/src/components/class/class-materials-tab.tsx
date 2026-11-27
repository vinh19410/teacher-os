import {
	isSafeMaterialUrl,
	type StudentClassMaterialView,
} from "@teacher-os/api/material-contracts";
import { Button, buttonVariants } from "@teacher-os/ui/components/button";
import {
	Download,
	ExternalLink,
	FileText,
	Film,
	Image as ImageIcon,
	Link2,
	Music,
	Search,
	X,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	extractSafeHostname,
	formatMaterialTypeLabel,
	type MaterialKindFilter,
	normalizeVietnameseSearch,
} from "@/components/class/class-detail-helpers";
import { formatFileSize } from "@/components/class/lesson-materials";
import { StudentClassMaterialPreviewButton } from "@/components/class/student-material-preview";
import { cn } from "@/lib/cn";
import { HttpError } from "@/lib/query-client";
import {
	classMaterialFileUrl,
	getActiveStudentOrgId,
	useClassMaterials,
} from "@/lib/repos/student";
import { subscribeActiveStudentOrg } from "@/lib/student-org-storage";

const CARD_CLASS =
	"rounded-xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6";

const KIND_FILTERS: readonly { id: MaterialKindFilter; label: string }[] = [
	{ id: "all", label: "Tất cả" },
	{ id: "file", label: "Tài liệu" },
	{ id: "media", label: "Audio – Video" },
	{ id: "link", label: "Liên kết" },
];

const KIND_GROUPS: readonly {
	kind: StudentClassMaterialView["kind"];
	title: string;
}[] = [
	{ kind: "file", title: "Tài liệu" },
	{ kind: "media", title: "Audio – Video" },
	{ kind: "link", title: "Liên kết" },
];

function isVideoMaterial(m: StudentClassMaterialView): boolean {
	return m.mimeType?.trim().toLowerCase().startsWith("video/") ?? false;
}

function isImageMaterial(m: StudentClassMaterialView): boolean {
	return m.mimeType?.trim().toLowerCase().startsWith("image/") ?? false;
}

function MaterialTileIcon({
	material,
}: {
	material: StudentClassMaterialView;
}) {
	const cls = "size-5";
	if (material.kind === "link") {
		return <Link2 aria-hidden="true" className={cls} />;
	}
	if (material.kind === "media") {
		return isVideoMaterial(material) ? (
			<Film aria-hidden="true" className={cls} />
		) : (
			<Music aria-hidden="true" className={cls} />
		);
	}
	if (isImageMaterial(material)) {
		return <ImageIcon aria-hidden="true" className={cls} />;
	}
	return <FileText aria-hidden="true" className={cls} />;
}

function ClassMaterialItemRow({
	material,
	classId,
}: {
	material: StudentClassMaterialView;
	classId: string;
}) {
	const fileUrl = classMaterialFileUrl(classId, material.id);
	const downloadUrl = classMaterialFileUrl(classId, material.id, true);
	const typeLabel = formatMaterialTypeLabel(material);
	const host =
		material.kind === "link" ? extractSafeHostname(material.url) : null;
	const size =
		material.kind !== "link" ? formatFileSize(material.sizeBytes) : "";
	const detailMeta = host || size;

	return (
		<li
			data-testid="class-material"
			data-kind={material.kind}
			className="flex min-w-0 flex-col gap-3 px-4 py-3.5"
		>
			<div className="flex min-w-0 flex-wrap items-start gap-3">
				<span
					aria-hidden="true"
					className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground"
				>
					<MaterialTileIcon material={material} />
				</span>

				<div className="min-w-0 flex-1 basis-[180px]">
					<p className="break-words font-medium text-foreground text-sm sm:text-base">
						{material.title}
					</p>
					<p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs sm:text-sm">
						<span className="tabular-nums">
							{typeLabel}
							{detailMeta ? ` · ${detailMeta}` : ""}
						</span>
					</p>
					{material.description && (
						<p className="mt-1 whitespace-pre-line break-words text-muted-foreground text-xs">
							{material.description}
						</p>
					)}
				</div>

				<div className="flex basis-full flex-wrap items-center gap-2 sm:basis-auto sm:justify-end">
					{material.kind === "link" ? (
						material.url && isSafeMaterialUrl(material.url) ? (
							<a
								href={material.url}
								target="_blank"
								rel="noopener noreferrer"
								className={buttonVariants({ variant: "outline", size: "sm" })}
							>
								<ExternalLink aria-hidden="true" className="size-3.5" />
								Mở liên kết
								<span className="sr-only"> (tab mới): {material.title}</span>
							</a>
						) : null
					) : (
						<>
							{material.kind === "file" && (
								<StudentClassMaterialPreviewButton
									material={material}
									classId={classId}
								/>
							)}
							{material.kind === "media" && (
								<a
									href={fileUrl}
									target="_blank"
									rel="noopener noreferrer"
									className={buttonVariants({ variant: "outline", size: "sm" })}
								>
									<ExternalLink aria-hidden="true" className="size-3.5" />
									Mở<span className="sr-only"> {material.title}</span>
								</a>
							)}
							<a
								href={downloadUrl}
								className={buttonVariants({ variant: "outline", size: "sm" })}
							>
								<Download aria-hidden="true" className="size-3.5" />
								Tải<span className="sr-only"> {material.title}</span>
							</a>
						</>
					)}
				</div>
			</div>

			{material.kind === "media" &&
				(isVideoMaterial(material) ? (
					// biome-ignore lint/a11y/useMediaCaption: tài liệu giáo viên tải lên, không có track phụ đề
					<video
						controls
						preload="none"
						src={fileUrl}
						aria-label={material.title}
						className="max-h-80 w-full rounded-md bg-muted"
					/>
				) : (
					// biome-ignore lint/a11y/useMediaCaption: tài liệu giáo viên tải lên, không có track phụ đề
					<audio
						controls
						preload="none"
						src={fileUrl}
						aria-label={material.title}
						className="w-full"
					/>
				))}
		</li>
	);
}

export interface ClassMaterialsTabProps {
	classId: string;
	kindFilter?: MaterialKindFilter;
	onKindFilterChange?: (next: MaterialKindFilter) => void;
	query?: string;
	onQueryChange?: (next: string) => void;
}

/**
 * Tab "Tài liệu chung" cấp lớp học cho học viên (chỉ đọc):
 * hỗ trợ tìm kiếm tiếng Việt không dấu (debounce đồng bộ URL), lọc theo loại,
 * nhóm theo `kind`, xem trước PDF/ảnh on-demand qua portal dialog, phát
 * audio/video nội tuyến và tải file nguyên bản.
 */
export function ClassMaterialsTab({
	classId,
	kindFilter,
	onKindFilterChange,
	query = "",
	onQueryChange,
}: ClassMaterialsTabProps) {
	useSyncExternalStore(
		subscribeActiveStudentOrg,
		getActiveStudentOrgId,
		getActiveStudentOrgId,
	);
	const materialsQuery = useClassMaterials(classId, true);
	const searchId = useId();
	const searchInputRef = useRef<HTMLInputElement | null>(null);

	const [localKind, setLocalKind] = useState<MaterialKindFilter>("all");
	const activeKind = kindFilter ?? localKind;
	const setKind = useCallback(
		(next: MaterialKindFilter) => {
			if (onKindFilterChange) {
				onKindFilterChange(next);
			} else {
				setLocalKind(next);
			}
		},
		[onKindFilterChange],
	);

	const [draft, setDraft] = useState(query);
	const lastEmittedRef = useRef(query);
	const onQueryChangeRef = useRef(onQueryChange);
	onQueryChangeRef.current = onQueryChange;
	const prevClassIdRef = useRef(classId);

	useEffect(() => {
		if (prevClassIdRef.current === classId) return;
		prevClassIdRef.current = classId;
		setLocalKind("all");
		lastEmittedRef.current = query;
		setDraft(query);
	}, [classId, query]);

	useEffect(() => {
		if (query === lastEmittedRef.current) return;
		lastEmittedRef.current = query;
		setDraft(query);
	}, [query]);

	useEffect(() => {
		const trimmed = draft.trim();
		if (trimmed === lastEmittedRef.current) return;
		const timer = setTimeout(() => {
			lastEmittedRef.current = trimmed;
			onQueryChangeRef.current?.(trimmed);
		}, 300);
		return () => clearTimeout(timer);
	}, [draft]);

	const handleClearSearch = useCallback(() => {
		lastEmittedRef.current = "";
		setDraft("");
		onQueryChangeRef.current?.("");
		searchInputRef.current?.focus();
	}, []);

	const notFound =
		materialsQuery.error instanceof HttpError &&
		materialsQuery.error.status === 404;

	const items = useMemo(
		() => (notFound ? [] : (materialsQuery.data ?? [])),
		[notFound, materialsQuery.data],
	);

	const normalizedSearch = useMemo(
		() => normalizeVietnameseSearch(draft),
		[draft],
	);

	const visibleItems = useMemo(() => {
		return items.filter((m) => {
			if (activeKind !== "all" && m.kind !== activeKind) return false;
			if (!normalizedSearch) return true;
			const haystack = normalizeVietnameseSearch(
				[
					m.title,
					m.description,
					m.originalName ?? "",
					extractSafeHostname(m.url) ?? "",
				].join(" "),
			);
			return haystack.includes(normalizedSearch);
		});
	}, [items, activeKind, normalizedSearch]);

	const grouped = useMemo(
		() =>
			KIND_GROUPS.map((group) => ({
				...group,
				items: visibleItems.filter((m) => m.kind === group.kind),
			})).filter((group) => group.items.length > 0),
		[visibleItems],
	);

	if (materialsQuery.isLoading) {
		return (
			<div className={CARD_CLASS}>
				<p role="status" className="text-muted-foreground text-sm">
					Đang tải tài liệu chung…
				</p>
			</div>
		);
	}

	if (materialsQuery.isError && !notFound) {
		return (
			<div className={CARD_CLASS}>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p role="alert" className="text-destructive text-sm">
						Không tải được tài liệu chung. Vui lòng thử lại sau ít phút.
					</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={materialsQuery.isFetching}
						onClick={() => void materialsQuery.refetch()}
					>
						Thử lại
					</Button>
				</div>
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div className={CARD_CLASS}>
				<p
					data-testid="class-materials-empty"
					className="text-muted-foreground text-sm"
				>
					Lớp chưa có tài liệu chung nào. Giáo viên sẽ chia sẻ tài liệu dùng cho
					cả khóa tại đây.
				</p>
			</div>
		);
	}

	const trimmedDraft = draft.trim();
	const isFiltering = trimmedDraft.length > 0 || activeKind !== "all";

	return (
		<div className="space-y-6">
			<h2 className="sr-only">Tài liệu chung</h2>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="min-w-0 max-w-full flex-1 basis-[240px] sm:max-w-[420px]">
					<label
						htmlFor={searchId}
						className="mb-1 block font-medium text-foreground text-sm"
					>
						Tìm tài liệu
					</label>
					<div className="relative flex items-center">
						<Search
							aria-hidden="true"
							className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
						/>
						<input
							ref={searchInputRef}
							id={searchId}
							type="search"
							autoComplete="off"
							maxLength={200}
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							placeholder="Ví dụ: collocation, Cambridge 15"
							className="h-10 w-full rounded-lg border border-input bg-background py-2 pr-9 pl-9 text-base text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:shadow-[var(--focus-ring)] md:text-sm [&::-webkit-search-cancel-button]:appearance-none"
						/>
						{draft.length > 0 && (
							<button
								type="button"
								onClick={handleClearSearch}
								aria-label="Xóa từ khóa tìm kiếm"
								className="absolute right-2 grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:shadow-[var(--focus-ring)]"
							>
								<X aria-hidden="true" className="size-4" />
							</button>
						)}
					</div>
				</div>

				{/* biome-ignore lint/a11y/useSemanticElements: nhóm nút lọc dùng role="group" + aria-label theo pattern ChipFilter cho SR/e2e */}
				<div
					role="group"
					aria-label="Lọc theo loại tài liệu"
					className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1"
				>
					{KIND_FILTERS.map((opt) => {
						const active = activeKind === opt.id;
						return (
							<button
								key={opt.id}
								type="button"
								aria-pressed={active}
								onClick={() => setKind(opt.id)}
								className={cn(
									"min-h-8 cursor-pointer rounded-md px-3 font-medium text-xs transition-colors duration-150 sm:text-sm",
									active
										? "bg-background font-semibold text-foreground shadow-xs"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{opt.label}
							</button>
						);
					})}
				</div>
			</div>

			{visibleItems.length === 0 ? (
				<div
					aria-live="polite"
					className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border border-dashed px-4 py-5 text-muted-foreground text-sm"
				>
					{trimmedDraft.length > 0 ? (
						<>
							<span className="break-words">
								Không tìm thấy tài liệu khớp “{trimmedDraft}”. Thử từ khóa ngắn
								hơn hoặc bỏ dấu.
							</span>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handleClearSearch}
							>
								Xóa tìm kiếm
							</Button>
						</>
					) : (
						<>
							<span>Lớp chưa có tài liệu thuộc loại này.</span>
							{activeKind !== "all" && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setKind("all")}
								>
									Xóa bộ lọc
								</Button>
							)}
						</>
					)}
				</div>
			) : (
				<div className="space-y-6">
					{isFiltering && (
						<p
							aria-live="polite"
							className="text-muted-foreground text-xs tabular-nums"
						>
							Hiển thị {visibleItems.length}/{items.length} tài liệu
						</p>
					)}
					{grouped.map((group) => {
						const headingId = `mat-group-${group.kind}`;
						return (
							<section
								key={group.kind}
								aria-labelledby={headingId}
								className="space-y-3"
							>
								<div className="flex items-baseline justify-between gap-3">
									<h3
										id={headingId}
										className="font-semibold text-base text-foreground tracking-tight sm:text-lg"
									>
										{group.title}
									</h3>
									<span className="text-muted-foreground text-sm tabular-nums">
										{group.items.length} mục
									</span>
								</div>
								<ul
									aria-label={group.title}
									className="divide-y overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm"
								>
									{group.items.map((m) => (
										<ClassMaterialItemRow
											key={m.id}
											material={m}
											classId={classId}
										/>
									))}
								</ul>
							</section>
						);
					})}
				</div>
			)}
		</div>
	);
}
