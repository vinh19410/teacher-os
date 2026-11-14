import {
	MAX_PACK_DAYS,
	MAX_PACK_ITEMS_PER_DAY,
	MAX_PACK_TOTAL_ITEMS,
	STUDY_PACK_LEVELS,
	STUDY_PACK_SKILLS,
	type StudyPackDetailView,
	type StudyPackItemInput,
	type StudyPackSummaryView,
} from "@teacher-os/api/contracts";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { skillOf } from "@/components/assignments/assignment-presets";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import {
	createStudyPack,
	fetchStudyPackDetail,
	updateStudyPack,
} from "@/lib/repos/study-pack";

interface DraftPackItem extends StudyPackItemInput {
	uid: string;
	dayText: string;
	title: string;
	skill: string;
}

function tupleKeyOf(
	dayIndex: number,
	sourceKind: string,
	sourceId: string,
): string {
	return `${dayIndex}:${sourceKind}:${sourceId}`;
}

function nextDraftUid(): string {
	return typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
		? crypto.randomUUID()
		: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const ALLOWED_SKILLS = new Set<string>(STUDY_PACK_SKILLS);

/**
 * Formats a study pack skill slug into its Vietnamese display label.
 */
export function formatPackSkillLabel(skill: string): string {
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

function isPackDetailView(
	pack: StudyPackSummaryView | StudyPackDetailView,
): pack is StudyPackDetailView {
	return "items" in pack && Array.isArray(pack.items);
}

function mapDetailToDraftItems(pack: StudyPackDetailView): DraftPackItem[] {
	return pack.items.map((it) => ({
		uid: nextDraftUid(),
		dayIndex: it.dayIndex,
		dayText: String(it.dayIndex),
		sourceKind: it.sourceKind,
		sourceId: it.sourceId,
		note: it.note,
		title: it.title,
		skill: it.skill,
	}));
}

export interface StudyPackEditorModalProps {
	open: boolean;
	onClose: () => void;
	editingPack?: StudyPackSummaryView | StudyPackDetailView | null;
	onSaved: (pack: StudyPackDetailView) => void | Promise<void>;
}

/**
 * Shared Create/Edit modal for org study packs, used by both `/assignments/packs`
 * and `/assignments/packs/$packId`.
 */
export function StudyPackEditorModal({
	open,
	onClose,
	editingPack = null,
	onSaved,
}: StudyPackEditorModalProps) {
	const { data } = useData();
	const editingPackId = editingPack?.id ?? null;

	const [loadingDetail, setLoadingDetail] = useState(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [packLevel, setPackLevel] = useState("");
	const [status, setStatus] = useState<"draft" | "ready">("ready");
	const [items, setItems] = useState<DraftPackItem[]>([]);
	const [formError, setFormError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	// Item builder controls
	const [promptSearch, setPromptSearch] = useState("");
	const [itemDayIndex, setItemDayIndex] = useState<number>(1);
	const [itemPromptId, setItemPromptId] = useState<string>("");
	const [itemNote, setItemNote] = useState<string>("");

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

	const filteredPrompts = useMemo(() => {
		const term = promptSearch.trim().toLowerCase();
		if (!term) return eligiblePrompts;
		return eligiblePrompts.filter((p) => {
			const skillName = formatPackSkillLabel(
				p.skill ?? "reading",
			).toLowerCase();
			return (
				p.title.toLowerCase().includes(term) ||
				(p.skill ?? "").toLowerCase().includes(term) ||
				skillName.includes(term)
			);
		});
	}, [eligiblePrompts, promptSearch]);

	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	const editingPackRef = useRef(editingPack);
	editingPackRef.current = editingPack;
	const sessionKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (!open) {
			sessionKeyRef.current = null;
			return;
		}
		const sessionKey = editingPackId ?? "__create__";
		if (sessionKeyRef.current === sessionKey) return;
		sessionKeyRef.current = sessionKey;

		const targetPack = editingPackRef.current;
		let active = true;
		setFormError(null);
		setPromptSearch("");
		setItemNote("");
		setItemPromptId("");

		if (!targetPack) {
			setLoadingDetail(false);
			setTitle("");
			setDescription("");
			setPackLevel("");
			setStatus("ready");
			setItems([]);
			setItemDayIndex(1);
			return () => {
				active = false;
			};
		}

		setTitle(targetPack.title);
		setDescription(targetPack.description);
		setPackLevel(targetPack.level ?? "");
		setStatus(targetPack.status);

		if (isPackDetailView(targetPack)) {
			setLoadingDetail(false);
			setItems(mapDetailToDraftItems(targetPack));
			const maxDay = targetPack.items.reduce(
				(max, it) => Math.max(max, it.dayIndex),
				0,
			);
			setItemDayIndex(Math.min(MAX_PACK_DAYS, maxDay + 1));
			return () => {
				active = false;
			};
		}

		setItems([]);
		setItemDayIndex(1);
		setLoadingDetail(true);
		void fetchStudyPackDetail(targetPack.id)
			.then((res) => {
				if (!active) return;
				setTitle(res.pack.title);
				setDescription(res.pack.description);
				setPackLevel(res.pack.level ?? "");
				setStatus(res.pack.status);
				setItems(mapDetailToDraftItems(res.pack));
				const maxDay = res.pack.items.reduce(
					(max, it) => Math.max(max, it.dayIndex),
					0,
				);
				setItemDayIndex(Math.min(MAX_PACK_DAYS, maxDay + 1));
			})
			.catch(() => {
				if (!active) return;
				toast.error("Không tải được chi tiết bộ đề.");
				onCloseRef.current();
			})
			.finally(() => {
				if (active) setLoadingDetail(false);
			});

		return () => {
			active = false;
		};
	}, [open, editingPackId]);

	useEffect(() => {
		if (filteredPrompts.length === 0) {
			if (itemPromptId !== "") setItemPromptId("");
			return;
		}
		if (!filteredPrompts.some((p) => p.id === itemPromptId)) {
			setItemPromptId(filteredPrompts[0].id);
		}
	}, [filteredPrompts, itemPromptId]);

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
		const tupleKey = tupleKeyOf(itemDayIndex, "org_prompt", itemPromptId);
		if (
			items.some(
				(it) =>
					tupleKeyOf(it.dayIndex, it.sourceKind, it.sourceId) === tupleKey,
			)
		) {
			setFormError("Bài tập này đã có trong ngày đã chọn.");
			return;
		}
		const prompt = eligiblePrompts.find((p) => p.id === itemPromptId);
		if (!prompt) {
			setFormError("Không tìm thấy bài tập đã chọn.");
			return;
		}
		const nextItem: DraftPackItem = {
			uid: nextDraftUid(),
			dayIndex: itemDayIndex,
			dayText: String(itemDayIndex),
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

	function handleUpdateItemDayText(targetUid: string, rawText: string) {
		setFormError(null);
		setItems((prev) =>
			prev.map((it) =>
				it.uid === targetUid ? { ...it, dayText: rawText } : it,
			),
		);
	}

	function handleCommitItemDay(targetUid: string) {
		const target = items.find((it) => it.uid === targetUid);
		if (!target) return;
		const trimmed = target.dayText.trim();
		const nextDay = trimmed === "" ? Number.NaN : Number(trimmed);
		if (!Number.isInteger(nextDay) || nextDay < 1 || nextDay > MAX_PACK_DAYS) {
			setFormError(`Ngày học phải từ 1 đến ${MAX_PACK_DAYS}.`);
			return;
		}
		if (nextDay === target.dayIndex) {
			if (target.dayText !== String(target.dayIndex)) {
				setItems((prev) =>
					prev.map((it) =>
						it.uid === targetUid ? { ...it, dayText: String(nextDay) } : it,
					),
				);
			}
			return;
		}
		const nextTuple = tupleKeyOf(nextDay, target.sourceKind, target.sourceId);
		if (
			items.some(
				(it) =>
					it.uid !== targetUid &&
					tupleKeyOf(it.dayIndex, it.sourceKind, it.sourceId) === nextTuple,
			)
		) {
			setFormError("Bài tập này đã có trong ngày đã chọn.");
			return;
		}
		const dayCount = items.filter(
			(it) => it.uid !== targetUid && it.dayIndex === nextDay,
		).length;
		if (dayCount >= MAX_PACK_ITEMS_PER_DAY) {
			setFormError(
				`Mỗi ngày tối đa ${MAX_PACK_ITEMS_PER_DAY} bài tập (Ngày ${nextDay}).`,
			);
			return;
		}
		setFormError(null);
		setItems((prev) =>
			prev
				.map((it) =>
					it.uid === targetUid
						? { ...it, dayIndex: nextDay, dayText: String(nextDay) }
						: it,
				)
				.sort((a, b) => a.dayIndex - b.dayIndex),
		);
	}

	function handleUpdateItemNote(targetUid: string, nextNote: string) {
		setItems((prev) =>
			prev.map((it) => (it.uid === targetUid ? { ...it, note: nextNote } : it)),
		);
	}

	function handleRemoveItem(uid: string) {
		setItems((prev) => prev.filter((it) => it.uid !== uid));
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

		// Parse and validate every draft item's edited dayText before submitting.
		const normalizedItems: StudyPackItemInput[] = [];
		const seenTuples = new Set<string>();
		const countsByDay = new Map<number, number>();
		for (const it of items) {
			const trimmedDay = it.dayText.trim();
			const parsedDay = trimmedDay === "" ? Number.NaN : Number(trimmedDay);
			if (
				!Number.isInteger(parsedDay) ||
				parsedDay < 1 ||
				parsedDay > MAX_PACK_DAYS
			) {
				setFormError(`Ngày học phải từ 1 đến ${MAX_PACK_DAYS}.`);
				return;
			}
			const tuple = tupleKeyOf(parsedDay, it.sourceKind, it.sourceId);
			if (seenTuples.has(tuple)) {
				setFormError("Bài tập này đã có trong ngày đã chọn.");
				return;
			}
			seenTuples.add(tuple);
			const nextCount = (countsByDay.get(parsedDay) ?? 0) + 1;
			if (nextCount > MAX_PACK_ITEMS_PER_DAY) {
				setFormError(
					`Mỗi ngày tối đa ${MAX_PACK_ITEMS_PER_DAY} bài tập (Ngày ${parsedDay}).`,
				);
				return;
			}
			countsByDay.set(parsedDay, nextCount);
			normalizedItems.push({
				dayIndex: parsedDay,
				sourceKind: it.sourceKind,
				sourceId: it.sourceId,
				note: it.note.trim(),
			});
		}
		normalizedItems.sort((a, b) => a.dayIndex - b.dayIndex);

		setSaving(true);
		try {
			const payload = {
				title: trimmedTitle,
				description: description.trim(),
				level: packLevel,
				status,
				items: normalizedItems,
			};
			const res = editingPackId
				? await updateStudyPack(editingPackId, payload)
				: await createStudyPack(payload);
			toast.success(editingPackId ? "Đã cập nhật bộ đề." : "Đã tạo bộ đề mới.");
			onClose();
			try {
				await onSaved(res.pack);
			} catch {
				// Save already succeeded; parent query/cache refresh handles retry.
			}
		} catch {
			setFormError("Không lưu được bộ đề. Vui lòng kiểm tra lại dữ liệu.");
			toast.error("Không lưu được bộ đề.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={editingPackId ? "Chỉnh sửa bộ đề" : "Tạo bộ đề tự học"}
			scrollableBody
		>
			{loadingDetail ? (
				<p className="text-muted-foreground text-sm">
					Đang tải chi tiết bộ đề…
				</p>
			) : (
				<form className="space-y-4" onSubmit={(e) => void handleSavePack(e)}>
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

					<div className="grid gap-3 sm:grid-cols-2">
						<Field label="Trình độ" htmlFor="pack-level">
							<Select
								id="pack-level"
								value={packLevel}
								onChange={(e) => setPackLevel(e.target.value)}
							>
								<option value="">Chưa gắn trình độ</option>
								{STUDY_PACK_LEVELS.map((lvl) => (
									<option key={lvl} value={lvl}>
										{lvl}
									</option>
								))}
							</Select>
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
					</div>

					<div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
						<p className="font-medium text-foreground text-sm">
							Thêm bài tập theo ngày
						</p>
						{eligiblePrompts.length === 0 ? (
							<p className="text-muted-foreground text-xs">
								Chưa có đề Sẵn sàng thuộc kỹ năng Reading, Listening, Grammar
								hoặc Vocabulary trong ngân hàng đề. Hãy tạo đề trước tại mục Bài
								tập.
							</p>
						) : (
							<div className="space-y-3">
								{eligiblePrompts.length > 3 && (
									<Field label="Tìm bài tập" htmlFor="pack-prompt-search">
										<Input
											id="pack-prompt-search"
											value={promptSearch}
											onChange={(e) => setPromptSearch(e.target.value)}
											placeholder="Lọc theo tên hoặc kỹ năng…"
										/>
									</Field>
								)}
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
											{filteredPrompts.length === 0 ? (
												<option value="">Không có bài phù hợp</option>
											) : (
												filteredPrompts.map((p) => (
													<option key={p.id} value={p.id}>
														[{formatPackSkillLabel(p.skill ?? "reading")}]{" "}
														{p.title}
													</option>
												))
											)}
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
											disabled={filteredPrompts.length === 0}
										>
											+ Thêm bài vào ngày
										</Button>
									</div>
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
										key={item.uid}
										className="space-y-2 rounded-sm bg-muted/50 px-3 py-2 text-sm"
									>
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0">
												<span className="font-medium text-foreground">
													Ngày {item.dayIndex}:
												</span>{" "}
												<span className="text-foreground">{item.title}</span>{" "}
												<span className="text-muted-foreground text-xs">
													({formatPackSkillLabel(item.skill)})
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
												onClick={() => handleRemoveItem(item.uid)}
											>
												Xoá
											</Button>
										</div>
										{editingPackId && (
											<div className="grid gap-2 sm:grid-cols-[88px_1fr]">
												<Input
													type="number"
													min={1}
													max={MAX_PACK_DAYS}
													aria-label={`Ngày học cho ${item.title}`}
													value={item.dayText}
													onChange={(e) =>
														handleUpdateItemDayText(item.uid, e.target.value)
													}
													onBlur={() => handleCommitItemDay(item.uid)}
													className="h-8 text-xs"
												/>
												<Input
													aria-label={`Ghi chú cho ${item.title}`}
													value={item.note}
													onChange={(e) =>
														handleUpdateItemNote(item.uid, e.target.value)
													}
													placeholder="Ghi chú buổi học"
													className="h-8 text-xs"
												/>
											</div>
										)}
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
						<Button type="button" variant="outline" onClick={onClose}>
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
	);
}
