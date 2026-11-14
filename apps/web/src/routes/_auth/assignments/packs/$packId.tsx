import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
	useSearch,
} from "@tanstack/react-router";
import type { StudyPackItemView } from "@teacher-os/api/contracts";
import { canPublishGrade } from "@teacher-os/auth/role";
import {
	ArrowLeft,
	Check,
	ChevronLeft,
	ChevronRight,
	Copy,
	Pencil,
	RefreshCw,
	Search,
	Send,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AssignPackToClassModal } from "@/components/study-packs/assign-pack-to-class-modal";
import {
	formatPackSkillLabel,
	StudyPackEditorModal,
} from "@/components/study-packs/study-pack-editor-modal";
import { StudyPackItemViewer } from "@/components/study-packs/study-pack-item-viewer";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import {
	cloneStudyPack,
	deleteStudyPack,
	fetchStudyPackDetail,
} from "@/lib/repos/study-pack";

export interface PackDetailSearch {
	skill?: string;
	q?: string;
	item?: string;
	tab?: "key" | "sim";
}

export const Route = createFileRoute("/_auth/assignments/packs/$packId")({
	validateSearch: (
		input: { skill?: string; q?: string; item?: string; tab?: string } = {},
	): PackDetailSearch => ({
		skill:
			typeof input.skill === "string" && input.skill.trim().length > 0
				? input.skill.trim()
				: undefined,
		q: typeof input.q === "string" && input.q.length > 0 ? input.q : undefined,
		item:
			typeof input.item === "string" && input.item.trim().length > 0
				? input.item.trim()
				: undefined,
		tab: input.tab === "sim" ? "sim" : input.tab === "key" ? "key" : undefined,
	}),
	component: StudyPackDetailRoute,
});

const ALL_SKILL_LABEL = "Tất cả";

function buildDetailSearch(next: {
	skill?: string;
	q?: string;
	item?: string;
	tab?: "key" | "sim";
}): PackDetailSearch {
	const search: PackDetailSearch = {};
	if (next.skill && next.skill !== "all") search.skill = next.skill;
	if (next.q && next.q.trim().length > 0) search.q = next.q;
	if (next.item) search.item = next.item;
	if (next.tab && next.tab !== "key") search.tab = next.tab;
	return search;
}

function getHttpStatus(err: unknown): number | null {
	return err &&
		typeof err === "object" &&
		"status" in err &&
		typeof err.status === "number"
		? err.status
		: null;
}

export function StudyPackDetailRoute() {
	const { packId } = useParams({ from: "/_auth/assignments/packs/$packId" });
	const searchParams = useSearch({ from: "/_auth/assignments/packs/$packId" });
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data } = useData();
	const canManagePacks = canPublishGrade(data.viewer?.role ?? "teacher");

	const {
		data: packRes,
		isPending,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: ["study-pack-detail", packId],
		queryFn: () => fetchStudyPackDetail(packId),
	});

	const pack = packRes?.pack ?? null;

	const skillFilter = searchParams.skill ?? "all";
	const activeTab: "key" | "sim" = searchParams.tab ?? "key";

	const [query, setQuery] = useState(() => searchParams.q ?? "");
	const lastEmittedQuery = useRef(query);

	// Default to master list on <lg viewports unless an item was explicitly linked via ?item=
	const [mobileShowDetail, setMobileShowDetail] = useState(() =>
		Boolean(searchParams.item),
	);

	// Modals & action busy states
	const [assignOpen, setAssignOpen] = useState(false);
	const [editorOpen, setEditorOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [cloning, setCloning] = useState(false);
	const [deleting, setDeleting] = useState(false);

	// Sync external ?q= updates (back/forward or shared links) into input state.
	useEffect(() => {
		const urlQ = searchParams.q ?? "";
		if (urlQ !== lastEmittedQuery.current) {
			lastEmittedQuery.current = urlQ;
			setQuery(urlQ);
		}
	}, [searchParams.q]);

	const updateSearch = useCallback(
		(next: Partial<PackDetailSearch>, replace = true) => {
			const merged = {
				skill: "skill" in next ? next.skill : skillFilter,
				q: "q" in next ? next.q : query,
				item: "item" in next ? next.item : searchParams.item,
				tab: "tab" in next ? next.tab : activeTab,
			};
			if ("q" in next) {
				lastEmittedQuery.current = next.q ?? "";
			}
			void navigate({
				to: "/assignments/packs/$packId",
				params: { packId },
				search: buildDetailSearch(merged),
				replace,
			});
		},
		[navigate, packId, skillFilter, query, searchParams.item, activeTab],
	);

	// Debounce ?q= updates by 300ms so typing stays responsive.
	useEffect(() => {
		const timer = setTimeout(() => {
			if (query === lastEmittedQuery.current) return;
			lastEmittedQuery.current = query;
			void navigate({
				to: "/assignments/packs/$packId",
				params: { packId },
				search: buildDetailSearch({
					skill: skillFilter,
					q: query,
					item: searchParams.item,
					tab: activeTab,
				}),
				replace: true,
			});
		}, 300);
		return () => clearTimeout(timer);
	}, [query, skillFilter, searchParams.item, activeTab, navigate, packId]);

	const items = useMemo(
		() =>
			[...(pack?.items ?? [])].sort(
				(a, b) => a.dayIndex - b.dayIndex || a.position - b.position,
			),
		[pack?.items],
	);

	const queryMatchedItems = useMemo(() => {
		const term = query.trim().toLowerCase();
		if (!term) return items;
		return items.filter(
			(it) =>
				it.title.toLowerCase().includes(term) ||
				it.note.toLowerCase().includes(term) ||
				`buổi ${it.dayIndex}`.includes(term) ||
				`ngày ${it.dayIndex}`.includes(term),
		);
	}, [items, query]);

	const { skillOptions, skillCounts, skillLabelToSlug } = useMemo(() => {
		const countsBySkill = new Map<string, number>();
		for (const it of queryMatchedItems) {
			countsBySkill.set(it.skill, (countsBySkill.get(it.skill) ?? 0) + 1);
		}
		if (skillFilter !== "all" && !countsBySkill.has(skillFilter)) {
			countsBySkill.set(skillFilter, 0);
		}
		const slugs = [...countsBySkill.keys()];
		const options: string[] = [ALL_SKILL_LABEL];
		const counts: Record<string, number> = {
			[ALL_SKILL_LABEL]: queryMatchedItems.length,
		};
		const labelMap = new Map<string, string>([[ALL_SKILL_LABEL, "all"]]);
		for (const slug of slugs) {
			const label = formatPackSkillLabel(slug);
			options.push(label);
			counts[label] = countsBySkill.get(slug) ?? 0;
			labelMap.set(label, slug);
		}
		return {
			skillOptions: options,
			skillCounts: counts,
			skillLabelToSlug: labelMap,
		};
	}, [queryMatchedItems, skillFilter]);

	const filteredItems = useMemo(() => {
		if (skillFilter === "all") return queryMatchedItems;
		return queryMatchedItems.filter((it) => it.skill === skillFilter);
	}, [queryMatchedItems, skillFilter]);

	const selectedItem: StudyPackItemView | null = useMemo(() => {
		if (filteredItems.length === 0) return null;
		if (searchParams.item) {
			const exact = filteredItems.find((it) => it.id === searchParams.item);
			if (exact) return exact;
		}
		return filteredItems[0];
	}, [filteredItems, searchParams.item]);

	const selectedIndex = selectedItem
		? filteredItems.findIndex((it) => it.id === selectedItem.id)
		: -1;
	const prevItem = selectedIndex > 0 ? filteredItems[selectedIndex - 1] : null;
	const nextItem =
		selectedIndex >= 0 && selectedIndex < filteredItems.length - 1
			? filteredItems[selectedIndex + 1]
			: null;

	function selectItem(itemId: string) {
		setMobileShowDetail(true);
		updateSearch({ item: itemId });
	}

	async function handleClone() {
		if (!pack) return;
		setCloning(true);
		try {
			const res = await cloneStudyPack(pack.id);
			toast.success("Đã nhân bản bộ đề về trung tâm.");
			queryClient.setQueryData(["study-pack-detail", res.pack.id], res);
			await navigate({
				to: "/assignments/packs/$packId",
				params: { packId: res.pack.id },
				search: {},
			});
		} catch {
			toast.error("Không thể nhân bản bộ đề. Vui lòng thử lại.");
		} finally {
			setCloning(false);
		}
	}

	async function handleConfirmDelete() {
		if (!pack) return;
		setDeleteError(null);
		setDeleting(true);
		try {
			await deleteStudyPack(pack.id);
			toast.success("Đã xoá bộ đề.");
			setDeleteOpen(false);
			void queryClient.removeQueries({
				queryKey: ["study-pack-detail", pack.id],
			});
			await navigate({ to: "/assignments/packs", search: {} });
		} catch (err) {
			const status = getHttpStatus(err);
			const message =
				status === 409
					? "Không thể xoá bộ đề đã gán cho lớp học."
					: "Không thể xoá bộ đề. Vui lòng thử lại.";
			setDeleteError(message);
			toast.error(message);
		} finally {
			setDeleting(false);
		}
	}

	const httpStatus = getHttpStatus(error);
	const isNotFound = httpStatus === 404 || (!isPending && !isError && !pack);

	if (isPending) {
		return (
			<div className="space-y-6">
				<div className="h-5 w-32 animate-pulse rounded bg-muted" />
				<div className="h-9 w-72 animate-pulse rounded bg-muted" />
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
					<div className="h-96 animate-pulse rounded-xl bg-muted" />
					<div className="h-96 animate-pulse rounded-xl bg-muted" />
				</div>
			</div>
		);
	}

	if (isNotFound) {
		return (
			<div className="space-y-4">
				<Link
					to="/assignments/packs"
					search={{}}
					className={buttonVariants({ variant: "ghost", size: "sm" })}
				>
					<ArrowLeft className="size-4" />
					Bộ đề tự học
				</Link>
				<Card variant="white" className="space-y-3 p-8 text-center">
					<h1 className="font-semibold text-foreground text-xl">
						Không tìm thấy bộ đề
					</h1>
					<p className="mx-auto max-w-md text-muted-foreground text-sm">
						Bộ đề này có thể đã bị xoá hoặc bạn không có quyền truy cập.
					</p>
					<div className="pt-2">
						<Link
							to="/assignments/packs"
							search={{}}
							className={buttonVariants({ variant: "default" })}
						>
							Quay lại Bộ đề tự học
						</Link>
					</div>
				</Card>
			</div>
		);
	}

	if (isError || !pack) {
		return (
			<div className="space-y-4">
				<Link
					to="/assignments/packs"
					search={{}}
					className={buttonVariants({ variant: "ghost", size: "sm" })}
				>
					<ArrowLeft className="size-4" />
					Bộ đề tự học
				</Link>
				<Card variant="white" className="space-y-3 p-6">
					<p className="font-medium text-destructive text-sm">
						Không tải được thông tin bộ đề. Vui lòng thử lại.
					</p>
					<div>
						<Button variant="outline" size="sm" onClick={() => void refetch()}>
							<RefreshCw className="size-3.5" />
							Thử lại
						</Button>
					</div>
				</Card>
			</div>
		);
	}

	const canAssign = canManagePacks && pack.status === "ready";
	const selectedSkillChipValue =
		skillFilter === "all" ? ALL_SKILL_LABEL : formatPackSkillLabel(skillFilter);
	const hasActiveFilters = query.trim() !== "" || skillFilter !== "all";

	return (
		<div className="space-y-6">
			<div>
				<Link
					to="/assignments/packs"
					search={{}}
					className={cn(
						buttonVariants({ variant: "ghost", size: "sm" }),
						"mb-3 -ml-2",
					)}
				>
					<ArrowLeft className="size-4" />
					Bộ đề tự học
				</Link>

				<div className="flex flex-col justify-between gap-4 border-border border-b pb-5 lg:flex-row lg:items-start">
					<div className="min-w-0 space-y-2">
						<div className="flex flex-wrap items-center gap-1.5">
							<Badge
								variant={pack.scope === "system" ? "secondary" : "outline"}
							>
								{pack.scope === "system" ? "Hệ thống" : "Trung tâm"}
							</Badge>
							{pack.level && <Badge variant="secondary">{pack.level}</Badge>}
							{pack.scope === "org" && (
								<Badge
									variant={pack.status === "ready" ? "success" : "secondary"}
									dot
								>
									{pack.status === "ready" ? "Sẵn sàng" : "Nháp"}
								</Badge>
							)}
							<Badge variant="outline" className="tabular-nums">
								{pack.dayCount} ngày · {pack.itemCount} bài tập
							</Badge>
						</div>

						<h1 className="font-semibold text-2xl text-foreground tracking-tight sm:text-3xl">
							{pack.title}
						</h1>

						{pack.description && (
							<p className="max-w-3xl text-muted-foreground text-sm leading-relaxed">
								{pack.description}
							</p>
						)}
					</div>

					{canManagePacks && (
						<div className="flex shrink-0 flex-wrap items-center gap-2">
							{canAssign && (
								<Button onClick={() => setAssignOpen(true)}>
									<Send className="size-4" />
									Gán cho lớp
								</Button>
							)}
							{pack.scope === "system" && (
								<Button
									variant="outline"
									disabled={cloning}
									onClick={() => void handleClone()}
								>
									<Copy className="size-4" />
									{cloning ? "Đang nhân bản…" : "Nhân bản về trung tâm"}
								</Button>
							)}
							{pack.scope === "org" && (
								<>
									<Button variant="outline" onClick={() => setEditorOpen(true)}>
										<Pencil className="size-4" />
										Chỉnh sửa
									</Button>
									<Button
										variant="danger"
										onClick={() => {
											setDeleteError(null);
											setDeleteOpen(true);
										}}
									>
										<Trash2 className="size-4" />
										Xoá
									</Button>
								</>
							)}
						</div>
					)}
				</div>
			</div>

			{items.length === 0 ? (
				<Card variant="white" className="space-y-3 p-8 text-center">
					<h2 className="font-semibold text-foreground text-lg">
						Bộ đề chưa có bài tập nào
					</h2>
					<p className="mx-auto max-w-md text-muted-foreground text-sm">
						{pack.scope === "org" && canManagePacks
							? "Nhấn Chỉnh sửa để thêm bài tập theo ngày cho bộ đề này."
							: "Các buổi học trong bộ đề sẽ hiển thị tại đây khi được cập nhật."}
					</p>
					{pack.scope === "org" && canManagePacks && (
						<div className="pt-1">
							<Button variant="outline" onClick={() => setEditorOpen(true)}>
								<Pencil className="size-4" />
								Chỉnh sửa bộ đề
							</Button>
						</div>
					)}
				</Card>
			) : (
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
					{/* Left rail: Filters + Study Pack Day Schedule */}
					<aside
						className={cn(
							mobileShowDetail ? "hidden lg:block" : "block",
							"min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start",
						)}
					>
						<Card variant="white" className="space-y-4 p-4">
							<div className="relative">
								<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									aria-label="Tìm bài tập trong bộ đề"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="Tìm theo tên bài, buổi, ghi chú…"
									className="pl-9"
								/>
							</div>

							{skillOptions.length > 2 && (
								<ChipFilter
									ariaLabel="Lọc kỹ năng trong bộ đề"
									options={skillOptions}
									value={selectedSkillChipValue}
									onChange={(label) => {
										const nextSlug = skillLabelToSlug.get(label) ?? "all";
										updateSearch({ skill: nextSlug });
									}}
									counts={skillCounts}
								/>
							)}

							<div className="flex items-center justify-between gap-2">
								<p
									aria-live="polite"
									role="status"
									className="text-muted-foreground text-xs tabular-nums"
								>
									Hiển thị {filteredItems.length}/{items.length} bài tập
								</p>
								{hasActiveFilters && (
									<button
										type="button"
										onClick={() => {
											setQuery("");
											updateSearch({ q: "", skill: "all" });
										}}
										className="font-medium text-foreground text-xs underline underline-offset-2 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
									>
										Xoá bộ lọc
									</button>
								)}
							</div>

							{filteredItems.length === 0 ? (
								<div className="rounded-lg border border-border border-dashed p-4 text-center">
									<p className="text-muted-foreground text-sm">
										Không tìm thấy bài tập phù hợp.
									</p>
								</div>
							) : (
								<nav aria-label="Danh sách buổi học">
									<ul className="space-y-2 lg:max-h-[calc(100vh-20rem)] lg:overflow-y-auto lg:pr-1">
										{filteredItems.map((it) => {
											const isSelected = selectedItem?.id === it.id;
											return (
												<li key={it.id}>
													<button
														type="button"
														aria-current={isSelected ? "true" : undefined}
														onClick={() => selectItem(it.id)}
														className={cn(
															"flex w-full items-start justify-between gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
															isSelected
																? "border-primary bg-muted text-foreground ring-1 ring-primary"
																: "border-border bg-card text-foreground hover:bg-muted/50",
														)}
													>
														<div className="min-w-0 flex-1 space-y-1">
															<div className="flex flex-wrap items-center gap-1.5">
																<Badge
																	variant="outline"
																	className="text-[11px] tabular-nums"
																>
																	Buổi {it.dayIndex}
																</Badge>
																<span className="text-muted-foreground text-xs">
																	{formatPackSkillLabel(it.skill)}
																</span>
															</div>
															<p className="truncate font-medium text-sm">
																{it.title}
															</p>
															{it.note && (
																<p className="line-clamp-1 text-muted-foreground text-xs">
																	{it.note}
																</p>
															)}
														</div>
														{isSelected && (
															<Check
																className="mt-1 size-4 shrink-0 text-primary"
																aria-hidden="true"
															/>
														)}
													</button>
												</li>
											);
										})}
									</ul>
								</nav>
							)}
						</Card>
					</aside>

					{/* Right pane: Selected Item Detail Viewer */}
					<section
						aria-label="Chi tiết buổi học"
						className={cn(
							mobileShowDetail ? "block" : "hidden lg:block",
							"min-w-0 space-y-4",
						)}
					>
						{selectedItem ? (
							<>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => setMobileShowDetail(false)}
										className="lg:hidden"
									>
										<ChevronLeft className="size-4" />
										Danh sách buổi ({filteredItems.length})
									</Button>

									<div className="ml-auto flex items-center gap-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={!prevItem}
											onClick={() => prevItem && selectItem(prevItem.id)}
										>
											<ChevronLeft className="size-4" />
											Buổi trước
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={!nextItem}
											onClick={() => nextItem && selectItem(nextItem.id)}
										>
											Buổi sau
											<ChevronRight className="size-4" />
										</Button>
									</div>
								</div>

								<StudyPackItemViewer
									packId={pack.id}
									item={selectedItem}
									activeTab={activeTab}
									onTabChange={(nextTab) => updateSearch({ tab: nextTab })}
								/>
							</>
						) : (
							<Card variant="white" className="p-8 text-center">
								<p className="text-muted-foreground text-sm">
									Chọn một buổi học ở danh sách để xem nội dung và đáp án.
								</p>
							</Card>
						)}
					</section>
				</div>
			)}

			<AssignPackToClassModal
				open={assignOpen}
				onClose={() => setAssignOpen(false)}
				pack={pack}
			/>

			<StudyPackEditorModal
				open={editorOpen}
				onClose={() => setEditorOpen(false)}
				editingPack={pack}
				onSaved={(updated) => {
					queryClient.setQueryData(["study-pack-detail", pack.id], {
						pack: updated,
					});
				}}
			/>

			<Modal
				open={deleteOpen}
				onClose={() => {
					if (!deleting) setDeleteOpen(false);
				}}
				title="Xoá bộ đề"
				description={`Bạn có chắc muốn xoá bộ đề "${pack.title}"? Hành động này không thể hoàn tác.`}
			>
				<div className="space-y-4">
					{deleteError && (
						<p role="alert" className="text-destructive text-sm">
							{deleteError}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={deleting}
							onClick={() => setDeleteOpen(false)}
						>
							Huỷ
						</Button>
						<Button
							type="button"
							variant="danger"
							disabled={deleting}
							onClick={() => void handleConfirmDelete()}
						>
							{deleting ? "Đang xoá…" : "Xác nhận xoá"}
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
