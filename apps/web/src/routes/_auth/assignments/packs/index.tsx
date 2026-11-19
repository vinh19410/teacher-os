import { useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import {
	STUDY_PACK_LEVELS,
	type StudyPackSummaryView,
} from "@teacher-os/api/contracts";
import { canPublishGrade } from "@teacher-os/auth/role";
import { ArrowLeft, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { StudyPackEditorModal } from "@/components/study-packs/study-pack-editor-modal";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { Modal } from "@/components/ui/modal";
import { PageHead } from "@/components/ui/page-head";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import { deleteStudyPack, fetchStudyPacks } from "@/lib/repos/study-pack";

export const Route = createFileRoute("/_auth/assignments/packs/")({
	validateSearch: (
		input: { scope?: string; level?: string } = {},
	): { scope?: "all" | "org" | "system"; level?: string } => ({
		scope:
			input.scope === "all" || input.scope === "org" || input.scope === "system"
				? input.scope
				: undefined,
		level:
			typeof input.level === "string" && input.level.trim().length > 0
				? input.level.trim()
				: undefined,
	}),
	component: StudyPacksRoute,
});

const ALL_FILTER_LABEL = "Tất cả";
const SCOPE_OPTIONS = ["Tất cả", "Trung tâm", "Hệ thống"] as const;

export function StudyPacksRoute() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const searchParams = useSearch({ from: "/_auth/assignments/packs/" });
	const { data } = useData();
	const canManagePacks = canPublishGrade(data.viewer?.role);

	const [packs, setPacks] = useState<StudyPackSummaryView[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const scope: "all" | "org" | "system" = searchParams.scope ?? "all";
	const levelFilter = searchParams.level ?? "all";

	const setFilters = useCallback(
		(nextScope: "all" | "org" | "system", nextLevel: string) => {
			void navigate({
				to: "/assignments/packs",
				search: {
					...(nextScope !== "all" ? { scope: nextScope } : {}),
					...(nextLevel !== "all" ? { level: nextLevel } : {}),
				},
				replace: true,
			});
		},
		[navigate],
	);

	// Shared Create / Edit modal state for study packs
	const [editorOpen, setEditorOpen] = useState(false);
	const [editingPack, setEditingPack] = useState<StudyPackSummaryView | null>(
		null,
	);
	const [deletingPack, setDeletingPack] = useState<StudyPackSummaryView | null>(
		null,
	);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [busyId, setBusyId] = useState<string | null>(null);

	const loadPacks = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetchStudyPacks();
			setPacks(res.packs);
		} catch {
			setError("Không tải được danh sách bộ đề. Vui lòng thử lại.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadPacks();
	}, [loadPacks]);

	const scopeFilteredPacks = useMemo(() => {
		if (scope === "all") return packs;
		return packs.filter((p) => p.scope === scope);
	}, [packs, scope]);

	const scopeCounts = useMemo(
		() => ({
			"Tất cả": packs.length,
			"Trung tâm": packs.filter((p) => p.scope === "org").length,
			"Hệ thống": packs.filter((p) => p.scope === "system").length,
		}),
		[packs],
	);

	const { levelOptions, levelCounts } = useMemo(() => {
		const countsByLevel = new Map<string, number>();
		for (const p of scopeFilteredPacks) {
			const lvl = p.level?.trim();
			if (!lvl) continue;
			countsByLevel.set(lvl, (countsByLevel.get(lvl) ?? 0) + 1);
		}
		if (levelFilter !== "all" && !countsByLevel.has(levelFilter)) {
			countsByLevel.set(levelFilter, 0);
		}
		const orderedLevels = [
			...STUDY_PACK_LEVELS.filter((lvl) => countsByLevel.has(lvl)),
			...[...countsByLevel.keys()].filter(
				(lvl) => !(STUDY_PACK_LEVELS as readonly string[]).includes(lvl),
			),
		];
		const counts: Record<string, number> = {
			[ALL_FILTER_LABEL]: scopeFilteredPacks.length,
		};
		for (const lvl of orderedLevels) {
			counts[lvl] = countsByLevel.get(lvl) ?? 0;
		}
		return {
			levelOptions: [ALL_FILTER_LABEL, ...orderedLevels],
			levelCounts: counts,
		};
	}, [scopeFilteredPacks, levelFilter]);

	const filteredPacks = useMemo(
		() =>
			levelFilter === "all"
				? scopeFilteredPacks
				: scopeFilteredPacks.filter((p) => p.level === levelFilter),
		[scopeFilteredPacks, levelFilter],
	);

	function openCreateModal() {
		setEditingPack(null);
		setEditorOpen(true);
	}

	function openEditModal(pack: StudyPackSummaryView) {
		setEditingPack(pack);
		setEditorOpen(true);
	}

	async function handleConfirmDelete() {
		if (!deletingPack) return;
		const target = deletingPack;
		setDeleteError(null);
		setDeleting(true);
		setBusyId(target.id);
		try {
			await deleteStudyPack(target.id);
			toast.success("Đã xoá bộ đề.");
			void queryClient.removeQueries({
				queryKey: ["study-pack-detail", target.id],
			});
			setPacks((prev) => prev.filter((p) => p.id !== target.id));
			setDeletingPack(null);
		} catch (err) {
			const status =
				err && typeof err === "object" && "status" in err ? err.status : null;
			const message =
				status === 409
					? "Không thể xoá bộ đề đã gán cho lớp học."
					: "Không thể xoá bộ đề. Vui lòng thử lại.";
			setDeleteError(message);
			toast.error(message);
		} finally {
			setDeleting(false);
			setBusyId(null);
		}
	}

	return (
		<div>
			<Link
				to="/assignments"
				className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-4")}
			>
				<ArrowLeft className="size-4" />
				Bài tập
			</Link>

			<PageHead
				kicker="Ngân hàng đề"
				title="Bộ đề tự học"
				lead="Sắp xếp các bài Reading, Listening, Grammar, Vocabulary theo từng ngày để gán lịch tự học cho lớp."
				action={
					canManagePacks ? (
						<Button onClick={openCreateModal}>
							<Plus className="size-4" />
							Tạo bộ đề
						</Button>
					) : undefined
				}
			/>

			<div className="mb-6 flex flex-col gap-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<ChipFilter
						ariaLabel="Nguồn bộ đề"
						options={[...SCOPE_OPTIONS]}
						value={
							scope === "org"
								? "Trung tâm"
								: scope === "system"
									? "Hệ thống"
									: "Tất cả"
						}
						onChange={(selected) => {
							const nextScope =
								selected === "Trung tâm"
									? "org"
									: selected === "Hệ thống"
										? "system"
										: "all";
							setFilters(nextScope, levelFilter);
						}}
						counts={scopeCounts}
					/>

					<p
						aria-live="polite"
						role="status"
						className="text-muted-foreground text-sm tabular-nums"
					>
						{loading ? "Đang tải bộ đề…" : `${filteredPacks.length} bộ đề`}
					</p>
				</div>

				{levelOptions.length > 1 && (
					<div>
						<ChipFilter
							ariaLabel="Trình độ bộ đề"
							options={levelOptions}
							value={levelFilter === "all" ? ALL_FILTER_LABEL : levelFilter}
							onChange={(selected) =>
								setFilters(
									scope,
									selected === ALL_FILTER_LABEL ? "all" : selected,
								)
							}
							counts={levelCounts}
						/>
					</div>
				)}
			</div>

			{error && (
				<Card className="mb-6 border-destructive/40 bg-destructive/5 p-4">
					<p className="text-destructive text-sm">{error}</p>
					<Button
						variant="outline"
						size="sm"
						className="mt-2"
						onClick={() => void loadPacks()}
					>
						Thử lại
					</Button>
				</Card>
			)}

			{!loading && !error && filteredPacks.length === 0 && (
				<Card variant="white" className="p-8 text-center">
					<h2 className="font-semibold text-foreground text-lg">
						{packs.length === 0
							? "Chưa có bộ đề nào"
							: "Không tìm thấy bộ đề phù hợp với bộ lọc"}
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
						{packs.length === 0
							? "Tạo bộ đề mới từ ngân hàng đề tự chấm để gán cho các lớp học."
							: "Thử chọn lại Tất cả để xem toàn bộ bộ đề."}
					</p>
					{packs.length > 0 ? (
						<div className="mt-5 flex justify-center">
							<Button
								variant="outline"
								onClick={() => setFilters("all", "all")}
							>
								Xóa bộ lọc
							</Button>
						</div>
					) : (
						canManagePacks && (
							<div className="mt-5 flex justify-center">
								<Button onClick={openCreateModal}>Tạo bộ đề đầu tiên</Button>
							</div>
						)
					)}
				</Card>
			)}

			{!loading && filteredPacks.length > 0 && (
				<div className="grid gap-4 md:grid-cols-2">
					{filteredPacks.map((pack) => (
						<Card
							key={pack.id}
							variant="white"
							className="flex flex-col justify-between gap-4 p-5"
						>
							<div className="space-y-2">
								<div className="flex items-start justify-between gap-3">
									<h2 className="font-semibold text-base text-foreground">
										<Link
											to="/assignments/packs/$packId"
											params={{ packId: pack.id }}
											className="rounded-sm hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
										>
											{pack.title}
										</Link>
									</h2>
									<div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
										<Badge
											variant={
												pack.scope === "system" ? "secondary" : "outline"
											}
										>
											{pack.scope === "system" ? "Hệ thống" : "Trung tâm"}
										</Badge>
										{pack.level && (
											<Badge variant="secondary">{pack.level}</Badge>
										)}
										<Badge
											variant={
												pack.status === "ready" ? "success" : "secondary"
											}
											dot
										>
											{pack.status === "ready" ? "Sẵn sàng" : "Nháp"}
										</Badge>
									</div>
								</div>
								{pack.description && (
									<p className="text-muted-foreground text-sm">
										{pack.description}
									</p>
								)}
								<p className="text-muted-foreground text-xs tabular-nums">
									{pack.dayCount} ngày · {pack.itemCount} bài tập
								</p>
							</div>

							<div className="flex flex-wrap items-center gap-2 border-border border-t pt-3">
								<Link
									to="/assignments/packs/$packId"
									params={{ packId: pack.id }}
									className={buttonVariants({ variant: "outline", size: "sm" })}
								>
									<Eye className="size-3.5" />
									Xem chi tiết
								</Link>
								{canManagePacks && (
									<>
										<Button
											variant="outline"
											size="sm"
											disabled={busyId === pack.id}
											onClick={() => openEditModal(pack)}
										>
											<Pencil className="size-3.5" />
											Chỉnh sửa
										</Button>
										<Button
											variant="danger"
											size="sm"
											disabled={busyId === pack.id}
											onClick={() => {
												setDeleteError(null);
												setDeletingPack(pack);
											}}
										>
											<Trash2 className="size-3.5" />
											Xoá
										</Button>
									</>
								)}
							</div>
						</Card>
					))}
				</div>
			)}

			<StudyPackEditorModal
				open={editorOpen}
				onClose={() => setEditorOpen(false)}
				editingPack={editingPack}
				onSaved={async (saved) => {
					queryClient.setQueryData(["study-pack-detail", saved.id], {
						pack: saved,
					});
					await loadPacks();
				}}
			/>

			<Modal
				open={Boolean(deletingPack)}
				onClose={() => {
					if (!deleting) setDeletingPack(null);
				}}
				title="Xoá bộ đề"
				description={
					deletingPack
						? `Bạn có chắc muốn xoá bộ đề "${deletingPack.title}"? Hành động này không thể hoàn tác.`
						: undefined
				}
			>
				<div className="space-y-4">
					{deleteError && (
						<p role="alert" className="text-destructive text-sm">
							{deleteError}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<Button
							variant="outline"
							disabled={deleting}
							onClick={() => setDeletingPack(null)}
						>
							Huỷ
						</Button>
						<Button
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
