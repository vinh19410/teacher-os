import { createFileRoute, Link } from "@tanstack/react-router";
import {
	MAX_PACK_DAYS,
	MAX_PACK_ITEMS_PER_DAY,
	MAX_PACK_TOTAL_ITEMS,
	STUDY_PACK_SKILLS,
	type StudyPackDetailView,
	type StudyPackItemInput,
	type StudyPackSummaryView,
} from "@teacher-os/api/contracts";
import { ArrowLeft, Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import { skillOf } from "@/components/assignments/assignment-presets";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHead } from "@/components/ui/page-head";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import {
	cloneStudyPack,
	createStudyPack,
	deleteStudyPack,
	fetchStudyPackDetail,
	fetchStudyPacks,
	updateStudyPack,
} from "@/lib/repos/study-pack";

export const Route = createFileRoute("/_auth/assignments/packs")({
	component: StudyPacksRoute,
});

interface DraftPackItem extends StudyPackItemInput {
	key: string;
	title: string;
	skill: string;
}

const ALLOWED_SKILLS = new Set<string>(STUDY_PACK_SKILLS);

function formatSkillLabel(skill: string): string {
	if (
		skill === "reading" ||
		skill === "listening" ||
		skill === "grammar" ||
		skill === "vocabulary"
	) {
		return skillOf(skill).name;
	}
	return skill;
}

export function StudyPacksRoute() {
	const { data } = useData();
	const [packs, setPacks] = useState<StudyPackSummaryView[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [scope, setScope] = useState<"org" | "system">("org");

	// Modal state for Create / Edit org pack
	const [editorOpen, setEditorOpen] = useState(false);
	const [editingPackId, setEditingPackId] = useState<string | null>(null);
	const [loadingDetail, setLoadingDetail] = useState(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [status, setStatus] = useState<"draft" | "ready">("ready");
	const [items, setItems] = useState<DraftPackItem[]>([]);
	const [formError, setFormError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	// Item builder row inputs
	const [itemDayIndex, setItemDayIndex] = useState<number>(1);
	const [itemPromptId, setItemPromptId] = useState<string>("");
	const [itemNote, setItemNote] = useState<string>("");

	// Detail modal for system packs
	const [viewingPack, setViewingPack] = useState<StudyPackDetailView | null>(
		null,
	);
	const [busyId, setBusyId] = useState<string | null>(null);

	const eligiblePrompts = useMemo(() => {
		return (data.assignmentPrompts ?? []).filter((prompt) => {
			const skill = prompt.skill ?? "writing";
			return (
				prompt.status === "ready" &&
				ALLOWED_SKILLS.has(skill) &&
				prompt.writing == null
			);
		});
	}, [data.assignmentPrompts]);

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

	useEffect(() => {
		if (!itemPromptId && eligiblePrompts.length > 0) {
			setItemPromptId(eligiblePrompts[0].id);
		}
	}, [eligiblePrompts, itemPromptId]);

	const filteredPacks = useMemo(
		() => packs.filter((p) => p.scope === scope),
		[packs, scope],
	);

	function openCreateModal() {
		setEditingPackId(null);
		setTitle("");
		setDescription("");
		setStatus("ready");
		setItems([]);
		setItemDayIndex(1);
		setItemPromptId(eligiblePrompts[0]?.id ?? "");
		setItemNote("");
		setFormError(null);
		setEditorOpen(true);
	}

	async function openEditModal(pack: StudyPackSummaryView) {
		setEditingPackId(pack.id);
		setTitle(pack.title);
		setDescription(pack.description);
		setStatus(pack.status);
		setItems([]);
		setItemDayIndex(1);
		setItemPromptId(eligiblePrompts[0]?.id ?? "");
		setItemNote("");
		setFormError(null);
		setEditorOpen(true);
		setLoadingDetail(true);
		try {
			const res = await fetchStudyPackDetail(pack.id);
			setTitle(res.pack.title);
			setDescription(res.pack.description);
			setStatus(res.pack.status);
			setItems(
				res.pack.items.map((it) => ({
					key: `${it.dayIndex}:${it.sourceKind}:${it.sourceId}`,
					dayIndex: it.dayIndex,
					sourceKind: it.sourceKind,
					sourceId: it.sourceId,
					note: it.note,
					title: it.title,
					skill: it.skill,
				})),
			);
			const maxDay = res.pack.items.reduce(
				(max, it) => Math.max(max, it.dayIndex),
				0,
			);
			setItemDayIndex(Math.min(MAX_PACK_DAYS, maxDay + 1));
		} catch {
			toast.error("Không tải được chi tiết bộ đề.");
			setEditorOpen(false);
		} finally {
			setLoadingDetail(false);
		}
	}

	async function handleViewSystemPack(packId: string) {
		setBusyId(packId);
		try {
			const res = await fetchStudyPackDetail(packId);
			setViewingPack(res.pack);
		} catch {
			toast.error("Không tải được chi tiết bộ đề hệ thống.");
		} finally {
			setBusyId(null);
		}
	}

	async function handleCloneSystemPack(pack: StudyPackSummaryView) {
		setBusyId(pack.id);
		try {
			await cloneStudyPack(pack.id);
			toast.success("Đã nhân bản bộ đề về trung tâm.");
			await loadPacks();
			setScope("org");
		} catch {
			toast.error("Không thể nhân bản bộ đề. Vui lòng thử lại.");
		} finally {
			setBusyId(null);
		}
	}

	async function handleDeleteOrgPack(pack: StudyPackSummaryView) {
		setBusyId(pack.id);
		try {
			await deleteStudyPack(pack.id);
			toast.success("Đã xoá bộ đề.");
			setPacks((prev) => prev.filter((p) => p.id !== pack.id));
		} catch (err) {
			const status =
				err && typeof err === "object" && "status" in err ? err.status : null;
			if (status === 409) {
				toast.error("Không thể xoá bộ đề đã gán cho lớp học.");
			} else {
				toast.error("Không thể xoá bộ đề. Vui lòng thử lại.");
			}
		} finally {
			setBusyId(null);
		}
	}

	function handleAddItem() {
		setFormError(null);
		if (!itemPromptId) {
			setFormError("Vui lòng chọn một bài tập sẵn sàng.");
			return;
		}
		if (
			!Number.isInteger(itemDayIndex) ||
			itemDayIndex < 1 ||
			itemDayIndex > MAX_PACK_DAYS
		) {
			setFormError(`Ngày học phải từ 1 đến ${MAX_PACK_DAYS}.`);
			return;
		}
		if (items.length >= MAX_PACK_TOTAL_ITEMS) {
			setFormError(`Bộ đề tối đa ${MAX_PACK_TOTAL_ITEMS} bài tập.`);
			return;
		}
		const dayCount = items.filter((it) => it.dayIndex === itemDayIndex).length;
		if (dayCount >= MAX_PACK_ITEMS_PER_DAY) {
			setFormError(
				`Mỗi ngày tối đa ${MAX_PACK_ITEMS_PER_DAY} bài tập (Ngày ${itemDayIndex}).`,
			);
			return;
		}
		const key = `${itemDayIndex}:org_prompt:${itemPromptId}`;
		if (items.some((it) => it.key === key)) {
			setFormError("Bài tập này đã có trong ngày đã chọn.");
			return;
		}
		const prompt = eligiblePrompts.find((p) => p.id === itemPromptId);
		if (!prompt) {
			setFormError("Không tìm thấy bài tập đã chọn.");
			return;
		}
		const nextItem: DraftPackItem = {
			key,
			dayIndex: itemDayIndex,
			sourceKind: "org_prompt",
			sourceId: prompt.id,
			note: itemNote.trim(),
			title: prompt.title,
			skill: prompt.skill ?? "reading",
		};
		const nextItems = [...items, nextItem].sort(
			(a, b) => a.dayIndex - b.dayIndex,
		);
		setItems(nextItems);
		setItemNote("");
		setItemDayIndex(Math.min(MAX_PACK_DAYS, itemDayIndex + 1));
	}

	function handleRemoveItem(key: string) {
		setItems((prev) => prev.filter((it) => it.key !== key));
	}

	async function handleSavePack(event: FormEvent) {
		event.preventDefault();
		setFormError(null);
		const trimmedTitle = title.trim();
		if (!trimmedTitle) {
			setFormError("Vui lòng nhập tiêu đề bộ đề.");
			return;
		}
		if (status === "ready" && items.length === 0) {
			setFormError("Bộ đề Sẵn sàng cần có ít nhất 1 bài tập.");
			return;
		}
		setSaving(true);
		try {
			const payload = {
				title: trimmedTitle,
				description: description.trim(),
				status,
				items: items.map((it) => ({
					dayIndex: it.dayIndex,
					sourceKind: it.sourceKind,
					sourceId: it.sourceId,
					note: it.note,
				})),
			};
			if (editingPackId) {
				await updateStudyPack(editingPackId, payload);
				toast.success("Đã cập nhật bộ đề.");
			} else {
				await createStudyPack(payload);
				toast.success("Đã tạo bộ đề mới.");
			}
			setEditorOpen(false);
			await loadPacks();
		} catch {
			setFormError("Không lưu được bộ đề. Vui lòng kiểm tra lại dữ liệu.");
			toast.error("Không lưu được bộ đề.");
		} finally {
			setSaving(false);
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
					<Button onClick={openCreateModal}>
						<Plus className="size-4" />
						Tạo bộ đề
					</Button>
				}
			/>

			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<fieldset
					aria-label="Phạm vi bộ đề"
					className="inline-flex rounded-md bg-muted p-1"
				>
					<button
						type="button"
						aria-pressed={scope === "org"}
						onClick={() => setScope("org")}
						className={cn(
							"rounded-sm px-3 py-1.5 font-medium text-sm transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
							scope === "org"
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						Bộ đề của tôi
					</button>
					<button
						type="button"
						aria-pressed={scope === "system"}
						onClick={() => setScope("system")}
						className={cn(
							"rounded-sm px-3 py-1.5 font-medium text-sm transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
							scope === "system"
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						Thư viện hệ thống
					</button>
				</fieldset>

				<p
					aria-live="polite"
					role="status"
					className="text-muted-foreground text-sm tabular-nums"
				>
					{loading ? "Đang tải bộ đề…" : `${filteredPacks.length} bộ đề`}
				</p>
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
						{scope === "org"
							? "Chưa có bộ đề nào của trung tâm"
							: "Chưa có bộ đề nào trong thư viện hệ thống"}
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
						{scope === "org"
							? "Tạo bộ đề mới từ ngân hàng đề tự chấm hoặc nhân bản từ thư viện hệ thống để gán cho các lớp học."
							: "Các bộ đề chuẩn hóa từ hệ thống sẽ hiển thị tại đây khi sẵn sàng."}
					</p>
					{scope === "org" && (
						<div className="mt-5 flex justify-center">
							<Button onClick={openCreateModal}>Tạo bộ đề đầu tiên</Button>
						</div>
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
										{pack.title}
									</h2>
									<Badge
										variant={pack.status === "ready" ? "success" : "secondary"}
										dot
									>
										{pack.status === "ready" ? "Sẵn sàng" : "Nháp"}
									</Badge>
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
								{pack.scope === "org" ? (
									<>
										<Button
											variant="outline"
											size="sm"
											disabled={busyId === pack.id}
											onClick={() => void openEditModal(pack)}
										>
											<Pencil className="size-3.5" />
											Chỉnh sửa
										</Button>
										<Button
											variant="danger"
											size="sm"
											disabled={busyId === pack.id}
											onClick={() => void handleDeleteOrgPack(pack)}
										>
											<Trash2 className="size-3.5" />
											Xoá
										</Button>
									</>
								) : (
									<>
										<Button
											variant="outline"
											size="sm"
											disabled={busyId === pack.id}
											onClick={() => void handleViewSystemPack(pack.id)}
										>
											<Eye className="size-3.5" />
											Xem chi tiết
										</Button>
										<Button
											variant="secondary"
											size="sm"
											disabled={busyId === pack.id}
											onClick={() => void handleCloneSystemPack(pack)}
										>
											<Copy className="size-3.5" />
											Nhân bản về trung tâm
										</Button>
									</>
								)}
							</div>
						</Card>
					))}
				</div>
			)}

			<Modal
				open={editorOpen}
				onClose={() => setEditorOpen(false)}
				title={editingPackId ? "Chỉnh sửa bộ đề" : "Tạo bộ đề tự học"}
			>
				{loadingDetail ? (
					<p className="text-muted-foreground text-sm">
						Đang tải chi tiết bộ đề…
					</p>
				) : (
					<form onSubmit={(e) => void handleSavePack(e)}>
						<Field label="Tiêu đề bộ đề" required htmlFor="pack-title">
							<Input
								id="pack-title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Ví dụ: Lộ trình 14 ngày Grammar & Reading"
							/>
						</Field>

						<Field label="Mô tả" htmlFor="pack-description">
							<Textarea
								id="pack-description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Mục tiêu và hướng dẫn ngắn cho bộ đề"
							/>
						</Field>

						<Field label="Trạng thái" htmlFor="pack-status">
							<Select
								id="pack-status"
								value={status}
								onChange={(e) => setStatus(e.target.value as "draft" | "ready")}
							>
								<option value="ready">Sẵn sàng</option>
								<option value="draft">Nháp</option>
							</Select>
						</Field>

						<div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
							<p className="font-medium text-foreground text-sm">
								Thêm bài tập theo ngày
							</p>
							{eligiblePrompts.length === 0 ? (
								<p className="text-muted-foreground text-xs">
									Chưa có đề Sẵn sàng thuộc kỹ năng Reading, Listening, Grammar
									hoặc Vocabulary trong ngân hàng đề. Hãy tạo đề trước tại mục
									Bài tập.
								</p>
							) : (
								<div className="grid gap-3 sm:grid-cols-[96px_1fr]">
									<Field label="Ngày học" htmlFor="pack-item-day">
										<Input
											id="pack-item-day"
											type="number"
											min={1}
											max={MAX_PACK_DAYS}
											value={String(itemDayIndex)}
											onChange={(e) =>
												setItemDayIndex(Number(e.target.value) || 1)
											}
										/>
									</Field>
									<Field label="Bài tập" htmlFor="pack-item-prompt">
										<Select
											id="pack-item-prompt"
											value={itemPromptId}
											onChange={(e) => setItemPromptId(e.target.value)}
										>
											{eligiblePrompts.map((p) => (
												<option key={p.id} value={p.id}>
													[{formatSkillLabel(p.skill ?? "reading")}] {p.title}
												</option>
											))}
										</Select>
									</Field>
									<div className="sm:col-span-2">
										<Field label="Ghi chú" htmlFor="pack-item-note">
											<Input
												id="pack-item-note"
												value={itemNote}
												onChange={(e) => setItemNote(e.target.value)}
												placeholder="Ghi chú cho ngày học này (không bắt buộc)"
											/>
										</Field>
									</div>
									<div className="sm:col-span-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={handleAddItem}
										>
											+ Thêm bài vào ngày
										</Button>
									</div>
								</div>
							)}
						</div>

						<div className="space-y-2">
							<p className="font-medium text-foreground text-sm">
								Danh sách bài trong bộ đề ({items.length})
							</p>
							{items.length === 0 ? (
								<p className="text-muted-foreground text-xs">
									Chưa có bài tập nào được thêm vào bộ đề.
								</p>
							) : (
								<ul className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border p-2">
									{items.map((item) => (
										<li
											key={item.key}
											className="flex items-center justify-between gap-2 rounded-sm bg-muted/50 px-3 py-2 text-sm"
										>
											<div className="min-w-0">
												<span className="font-medium text-foreground">
													Ngày {item.dayIndex}:
												</span>{" "}
												<span className="text-foreground">{item.title}</span>{" "}
												<span className="text-muted-foreground text-xs">
													({formatSkillLabel(item.skill)})
												</span>
												{item.note && (
													<p className="text-muted-foreground text-xs">
														{item.note}
													</p>
												)}
											</div>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												aria-label={`Xoá ${item.title} khỏi Ngày ${item.dayIndex}`}
												onClick={() => handleRemoveItem(item.key)}
											>
												Xoá
											</Button>
										</li>
									))}
								</ul>
							)}
						</div>

						{formError && (
							<p role="alert" className="text-destructive text-sm">
								{formError}
							</p>
						)}

						<div className="flex justify-end gap-2 pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setEditorOpen(false)}
							>
								Huỷ
							</Button>
							<Button type="submit" disabled={saving}>
								{saving
									? "Đang lưu…"
									: editingPackId
										? "Lưu thay đổi"
										: "Lưu bộ đề"}
							</Button>
						</div>
					</form>
				)}
			</Modal>

			<Modal
				open={viewingPack !== null}
				onClose={() => setViewingPack(null)}
				title={viewingPack?.title ?? "Chi tiết bộ đề"}
			>
				{viewingPack && (
					<div className="space-y-4">
						{viewingPack.description && (
							<p className="text-muted-foreground text-sm">
								{viewingPack.description}
							</p>
						)}
						<p className="text-muted-foreground text-xs tabular-nums">
							{viewingPack.dayCount} ngày · {viewingPack.itemCount} bài tập
						</p>
						<ul className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-border p-2">
							{viewingPack.items.map((it) => (
								<li
									key={it.id}
									className="flex items-center justify-between gap-2 rounded-sm bg-muted/50 px-3 py-2 text-sm"
								>
									<div>
										<span className="font-medium text-foreground">
											Ngày {it.dayIndex}:
										</span>{" "}
										<span className="text-foreground">{it.title}</span>{" "}
										<span className="text-muted-foreground text-xs">
											({formatSkillLabel(it.skill)})
										</span>
									</div>
								</li>
							))}
						</ul>
						<div className="flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setViewingPack(null)}
							>
								Đóng
							</Button>
							<Button
								type="button"
								onClick={() => {
									const packToClone = viewingPack;
									setViewingPack(null);
									void handleCloneSystemPack(packToClone);
								}}
							>
								Nhân bản về trung tâm
							</Button>
						</div>
					</div>
				)}
			</Modal>
		</div>
	);
}
