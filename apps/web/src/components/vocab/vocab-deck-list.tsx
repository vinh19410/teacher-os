import type {
	KernelVocabDeckRow,
	KernelVocabGroupRow,
} from "@teacher-os/api/contracts";
import { formatVocabLessonDeckTitle } from "@teacher-os/api/lib/vocab-csv";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SectionLabel } from "@/components/ui/section-label";
import { useData } from "@/lib/data-store";
import { VocabCsvImportDialog } from "./vocab-csv-import-dialog";
import { VocabDeckEditorDialog } from "./vocab-deck-editor";
import { VocabGroupManagerModal } from "./vocab-group-manager-modal";
import { VocabGroupSelectField } from "./vocab-group-select-field";
import { VocabLibraryDialog } from "./vocab-library-dialog";
import { VocabSuggestDialog } from "./vocab-suggest-dialog";

function formatDeckLessonMeta(
	lessonNumber: number | null | undefined,
	topic: string | null | undefined,
): string | null {
	const cleanTopic = topic?.trim() ?? "";
	const hasLesson =
		typeof lessonNumber === "number" &&
		Number.isInteger(lessonNumber) &&
		lessonNumber >= 1;
	if (hasLesson && cleanTopic) {
		return `Buổi ${String(lessonNumber).padStart(2, "0")} · ${cleanTopic}`;
	}
	if (hasLesson) {
		return `Buổi ${String(lessonNumber).padStart(2, "0")}`;
	}
	return cleanTopic || null;
}

function DeckMetadataFields({
	groups,
	groupId,
	lessonNumber,
	topic,
	title,
	lessonInvalid,
	suggestedTitle,
	disabled = false,
	groupTestIdPrefix,
	onGroupChange,
	onLessonChange,
	onTopicChange,
	onTitleChange,
}: {
	groups: ReadonlyArray<KernelVocabGroupRow>;
	groupId: string;
	lessonNumber: string;
	topic: string;
	title: string;
	lessonInvalid: boolean;
	suggestedTitle: string;
	disabled?: boolean;
	groupTestIdPrefix: string;
	onGroupChange: (groupId: string) => void;
	onLessonChange: (value: string) => void;
	onTopicChange: (value: string) => void;
	onTitleChange: (value: string) => void;
}) {
	const lessonInputId = useId();
	const topicInputId = useId();
	const titleInputId = useId();

	return (
		<>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<label
						htmlFor={lessonInputId}
						className="font-medium text-foreground text-sm leading-none"
					>
						Buổi học (Lesson)
					</label>
					<Input
						id={lessonInputId}
						type="number"
						min={1}
						max={9999}
						value={lessonNumber}
						onChange={(e) => onLessonChange(e.target.value)}
						placeholder="Ví dụ: 1"
						aria-label="Số buổi học"
						aria-invalid={lessonInvalid || undefined}
						disabled={disabled}
					/>
					{lessonInvalid ? (
						<span className="text-destructive text-xs">
							Số buổi học phải là số nguyên từ 1 đến 9999.
						</span>
					) : null}
				</div>
				<div className="flex flex-col gap-1.5">
					<label
						htmlFor={topicInputId}
						className="font-medium text-foreground text-sm leading-none"
					>
						Chủ đề (Topic)
					</label>
					<Input
						id={topicInputId}
						maxLength={200}
						value={topic}
						onChange={(e) => onTopicChange(e.target.value)}
						placeholder="Ví dụ: Friends & Introductions"
						aria-label="Chủ đề"
						disabled={disabled}
					/>
				</div>
			</div>
			<VocabGroupSelectField
				groups={groups}
				value={groupId}
				onChange={onGroupChange}
				disabled={disabled}
				testIdPrefix={groupTestIdPrefix}
			/>
			<div className="flex flex-col gap-1.5">
				<label
					htmlFor={titleInputId}
					className="font-medium text-foreground text-sm leading-none"
				>
					Tiêu đề bộ từ
				</label>
				<Input
					id={titleInputId}
					maxLength={200}
					value={title}
					onChange={(e) => onTitleChange(e.target.value)}
					placeholder={suggestedTitle || "Ví dụ: Topic 1: Environment"}
					aria-label="Tiêu đề bộ từ"
					disabled={disabled}
				/>
			</div>
		</>
	);
}

function parseDeckMetaDraft(
	lessonText: string,
	topicText: string,
	titleText: string,
) {
	const trimmedLesson = lessonText.trim();
	let parsedLesson: number | null = null;
	if (trimmedLesson.length > 0) {
		if (!/^\d+$/.test(trimmedLesson)) {
			parsedLesson = Number.NaN;
		} else {
			const num = Number.parseInt(trimmedLesson, 10);
			parsedLesson = num >= 1 && num <= 9999 ? num : Number.NaN;
		}
	}
	const lessonInvalid = parsedLesson !== null && Number.isNaN(parsedLesson);
	const validLesson =
		parsedLesson !== null && !Number.isNaN(parsedLesson) ? parsedLesson : null;
	const cleanTopic = topicText.trim();
	const suggestedTitle = formatVocabLessonDeckTitle(validLesson, cleanTopic);
	const effectiveTitle = titleText.trim() || suggestedTitle;
	return {
		lessonInvalid,
		validLesson,
		cleanTopic,
		suggestedTitle,
		effectiveTitle,
	};
}

function DeckListRow({
	deck,
	sourceBadgeLabel,
	groupName,
	pendingCount,
	onSuggest,
	onRename,
	onEdit,
	onDelete,
}: {
	deck: KernelVocabDeckRow;
	sourceBadgeLabel: string;
	groupName: string | null;
	pendingCount: number;
	onSuggest: (deck: { id: string; title: string }) => void;
	onRename: (deck: KernelVocabDeckRow) => void;
	onEdit: (deckId: string) => void;
	onDelete: (deck: { id: string; title: string }) => void;
}) {
	const lessonMeta = formatDeckLessonMeta(deck.lessonNumber, deck.topic);
	return (
		<div
			data-testid={`vocab-deck-row-${deck.id}`}
			className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
		>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<p className="truncate font-medium text-foreground text-sm">
						{deck.title}
					</p>
					<span
						data-testid={`vocab-deck-source-badge-${deck.id}`}
						className="rounded rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-widest"
					>
						{sourceBadgeLabel}
					</span>
					{groupName ? (
						<span
							data-testid={`vocab-deck-group-badge-${deck.id}`}
							className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-foreground text-xs"
						>
							{groupName}
						</span>
					) : null}
					{deck.sourceLibraryDeckId ? (
						<span
							data-testid={`vocab-deck-library-badge-${deck.id}`}
							className="rounded rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-widest"
						>
							Thư viện
						</span>
					) : null}
					{pendingCount > 0 ? (
						<span
							data-testid={`vocab-deck-pending-badge-${deck.id}`}
							className="rounded rounded-md border border-input bg-transparent px-1.5 py-0.5 font-mono text-[10px] text-primary uppercase tracking-widest"
						>
							{pendingCount} chờ
						</span>
					) : null}
					{lessonMeta ? (
						<span
							data-testid={`vocab-deck-lesson-meta-${deck.id}`}
							className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground text-xs"
						>
							{lessonMeta}
						</span>
					) : null}
				</div>
				<p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
					{deck.wordCount} từ · {deck.lang}
				</p>
			</div>
			<div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
				<Button
					size="sm"
					variant="secondary"
					data-testid={`vocab-suggest-deck-${deck.id}`}
					onClick={() => onSuggest({ id: deck.id, title: deck.title })}
				>
					Gợi ý
				</Button>
				<Button
					size="sm"
					variant="secondary"
					data-testid={`vocab-rename-deck-${deck.id}`}
					onClick={() => onRename(deck)}
				>
					Sửa
				</Button>
				<Button
					size="sm"
					variant="secondary"
					data-testid={`vocab-edit-deck-${deck.id}`}
					onClick={() => onEdit(deck.id)}
				>
					Soạn từ vựng
				</Button>
				<Button
					size="sm"
					variant="ghost"
					data-testid={`vocab-delete-deck-${deck.id}`}
					onClick={() => onDelete({ id: deck.id, title: deck.title })}
				>
					Xoá
				</Button>
			</div>
		</div>
	);
}

/**
 * Danh sách bộ từ vựng (#359, #363):
 * - Khi truyền `classId` (trang chi tiết lớp): chỉ hiển thị bộ từ thuộc lớp đó (`deck.classId === classId`).
 * - Khi `classId` là `null` hoặc không truyền (trang Từ vựng hub `/vocab`): mặc định lọc theo nguồn
 *   "Ngân hàng riêng" (`classId === null`) để tránh hiển thị lặp với các bản đã clone vào lớp học,
 *   đồng thời cung cấp bộ lọc nguồn ("Ngân hàng riêng" / "Theo lớp" / "Lớp {name}" / "Tất cả nguồn")
 *   kết hợp bộ lọc nhóm bộ từ.
 */
export function VocabDeckList({ classId = null }: { classId?: string | null }) {
	const { data, dispatch } = useData();
	const targetClassId =
		typeof classId === "string" && classId.length > 0 ? classId : null;
	const isHubMode = targetClassId === null;

	const allScopedDecks = useMemo(() => {
		if (!isHubMode) {
			return data.vocabDecks.filter(
				(deck) => deck.classId != null && deck.classId === targetClassId,
			);
		}
		return data.vocabDecks;
	}, [data.vocabDecks, isHubMode, targetClassId]);

	const classNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const cls of data.classes) {
			map.set(cls.id, cls.name);
		}
		return map;
	}, [data.classes]);

	const { independentCount, classDeckCount, sourceOptions } = useMemo(() => {
		if (!isHubMode) {
			return {
				independentCount: 0,
				classDeckCount: allScopedDecks.length,
				sourceOptions: [] as Array<{ value: string; label: string }>,
			};
		}
		let independent = 0;
		let inClasses = 0;
		const classCounts = new Map<string, number>();
		for (const deck of allScopedDecks) {
			if (deck.classId == null) {
				independent += 1;
			} else {
				inClasses += 1;
				classCounts.set(deck.classId, (classCounts.get(deck.classId) ?? 0) + 1);
			}
		}
		const sortedClasses = [...classCounts.entries()]
			.map(([id, count]) => ({
				id,
				name: classNameById.get(id) ?? id,
				count,
			}))
			.sort((a, b) => a.name.localeCompare(b.name, "vi"));

		const options: Array<{ value: string; label: string }> = [
			{ value: "independent", label: `Ngân hàng riêng (${independent})` },
		];
		if (inClasses > 0) {
			options.push({
				value: "all-classes",
				label: `Theo lớp (${inClasses})`,
			});
			for (const cls of sortedClasses) {
				options.push({
					value: `class:${cls.id}`,
					label: `Lớp ${cls.name} (${cls.count})`,
				});
			}
			options.push({
				value: "all",
				label: `Tất cả nguồn (${allScopedDecks.length})`,
			});
		}
		return {
			independentCount: independent,
			classDeckCount: inClasses,
			sourceOptions: options,
		};
	}, [allScopedDecks, classNameById, isHubMode]);

	const [sourceFilter, setSourceFilter] = useState<string>("independent");
	const effectiveSourceFilter = useMemo(() => {
		if (!isHubMode) return "all";
		return sourceOptions.some((opt) => opt.value === sourceFilter)
			? sourceFilter
			: "independent";
	}, [isHubMode, sourceFilter, sourceOptions]);

	const decks = useMemo(() => {
		if (!isHubMode) return allScopedDecks;
		if (effectiveSourceFilter === "independent") {
			return allScopedDecks.filter((deck) => deck.classId == null);
		}
		if (effectiveSourceFilter === "all-classes") {
			return allScopedDecks.filter((deck) => deck.classId != null);
		}
		if (effectiveSourceFilter.startsWith("class:")) {
			const filterClassId = effectiveSourceFilter.slice("class:".length);
			return allScopedDecks.filter((deck) => deck.classId === filterClassId);
		}
		return allScopedDecks;
	}, [allScopedDecks, effectiveSourceFilter, isHubMode]);

	const pendingCountByDeckId = useMemo(() => {
		const map = new Map<string, number>();
		for (const sug of data.vocabSuggestions ?? []) {
			map.set(sug.deckId, (map.get(sug.deckId) ?? 0) + 1);
		}
		return map;
	}, [data.vocabSuggestions]);

	const sortedGroups = useMemo(
		() =>
			[...data.vocabGroups].sort((a, b) => a.name.localeCompare(b.name, "vi")),
		[data.vocabGroups],
	);

	const groupNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const group of data.vocabGroups) {
			map.set(group.id, group.name);
		}
		return map;
	}, [data.vocabGroups]);

	const { deckCountByGroupId, ungroupedCount } = useMemo(() => {
		const counts = new Map<string, number>();
		let ungrouped = 0;
		for (const deck of decks) {
			if (deck.groupId && groupNameById.has(deck.groupId)) {
				counts.set(deck.groupId, (counts.get(deck.groupId) ?? 0) + 1);
			} else {
				ungrouped += 1;
			}
		}
		return { deckCountByGroupId: counts, ungroupedCount: ungrouped };
	}, [decks, groupNameById]);

	const [groupFilter, setGroupFilter] = useState<string>("all");
	const effectiveGroupFilter = useMemo(() => {
		if (groupFilter === "all" || groupFilter === "ungrouped") {
			return groupFilter;
		}
		return groupNameById.has(groupFilter) ? groupFilter : "all";
	}, [groupFilter, groupNameById]);

	const filteredDecks = useMemo(() => {
		if (effectiveGroupFilter === "all") return decks;
		if (effectiveGroupFilter === "ungrouped") {
			return decks.filter(
				(deck) => !deck.groupId || !groupNameById.has(deck.groupId),
			);
		}
		return decks.filter((deck) => deck.groupId === effectiveGroupFilter);
	}, [decks, effectiveGroupFilter, groupNameById]);

	const showSourceFilter = isHubMode && classDeckCount > 0;
	const showGroupFilter =
		decks.length > 0 &&
		(sortedGroups.length > 0 || effectiveGroupFilter !== "all");
	const showFilterBar = showSourceFilter || showGroupFilter;
	const hasActiveFilter =
		effectiveGroupFilter !== "all" ||
		(isHubMode && effectiveSourceFilter !== "independent");

	const handleClearFilters = () => {
		setGroupFilter("all");
		if (isHubMode) {
			setSourceFilter("independent");
		}
	};

	const [createOpen, setCreateOpen] = useState(false);
	const [libraryOpen, setLibraryOpen] = useState(false);
	const [csvImportOpen, setCsvImportOpen] = useState(false);
	const [groupManagerOpen, setGroupManagerOpen] = useState(false);
	const [newTitle, setNewTitle] = useState("");
	const [newLessonNumber, setNewLessonNumber] = useState("");
	const [newTopic, setNewTopic] = useState("");
	const [newGroupId, setNewGroupId] = useState("");
	const [createSaving, setCreateSaving] = useState(false);
	const [renamingDeck, setRenamingDeck] = useState<KernelVocabDeckRow | null>(
		null,
	);
	const [renameTitle, setRenameTitle] = useState("");
	const [renameLessonNumber, setRenameLessonNumber] = useState("");
	const [renameTopic, setRenameTopic] = useState("");
	const [renameGroupId, setRenameGroupId] = useState("");
	const [renameSaving, setRenameSaving] = useState(false);
	const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
	const [suggestingDeck, setSuggestingDeck] = useState<{
		id: string;
		title: string;
	} | null>(null);
	const [deletingDeck, setDeletingDeck] = useState<{
		id: string;
		title: string;
	} | null>(null);

	const createDraft = useMemo(
		() => parseDeckMetaDraft(newLessonNumber, newTopic, newTitle),
		[newLessonNumber, newTopic, newTitle],
	);
	const renameDraft = useMemo(
		() => parseDeckMetaDraft(renameLessonNumber, renameTopic, renameTitle),
		[renameLessonNumber, renameTopic, renameTitle],
	);

	const resetCreateForm = () => {
		setNewTitle("");
		setNewLessonNumber("");
		setNewTopic("");
		setNewGroupId("");
	};

	const closeCreateModal = () => {
		setCreateOpen(false);
		resetCreateForm();
	};

	const openRenameModal = (deck: KernelVocabDeckRow) => {
		setRenamingDeck(deck);
		setRenameTitle(deck.title);
		setRenameLessonNumber(
			deck.lessonNumber != null ? String(deck.lessonNumber) : "",
		);
		setRenameTopic(deck.topic ?? "");
		setRenameGroupId(
			deck.groupId && groupNameById.has(deck.groupId) ? deck.groupId : "",
		);
	};

	const closeRenameModal = () => {
		setRenamingDeck(null);
		setRenameTitle("");
		setRenameLessonNumber("");
		setRenameTopic("");
		setRenameGroupId("");
	};

	const handleCreate = async () => {
		if (
			createDraft.effectiveTitle.length === 0 ||
			createDraft.lessonInvalid ||
			createSaving
		) {
			return;
		}
		setCreateSaving(true);
		try {
			const effectiveNewGroupId =
				newGroupId.length > 0 && groupNameById.has(newGroupId)
					? newGroupId
					: "";
			const result = await dispatch({
				type: "create-vocab-deck",
				payload: {
					classId: targetClassId,
					title: createDraft.effectiveTitle,
					...(effectiveNewGroupId.length > 0
						? { groupId: effectiveNewGroupId }
						: {}),
					...(createDraft.validLesson !== null
						? { lessonNumber: createDraft.validLesson }
						: {}),
					...(createDraft.cleanTopic.length > 0
						? { topic: createDraft.cleanTopic }
						: {}),
				},
			});
			if (result.kind === "refreshed") {
				closeCreateModal();
				return;
			}
			if (result.kind === "committed") {
				toast.warning(
					"Đã tạo bộ từ nhưng chưa đồng bộ danh sách — vui lòng tải lại trang.",
				);
				return;
			}
			toast.error("Không thể tạo bộ từ. Vui lòng thử lại.");
		} finally {
			setCreateSaving(false);
		}
	};

	const handleRename = async () => {
		if (
			!renamingDeck ||
			renameDraft.effectiveTitle.length === 0 ||
			renameDraft.lessonInvalid ||
			renameSaving
		) {
			return;
		}
		setRenameSaving(true);
		try {
			const initialGroupId =
				renamingDeck.groupId && groupNameById.has(renamingDeck.groupId)
					? renamingDeck.groupId
					: "";
			const effectiveRenameGroupId =
				renameGroupId.length > 0 && groupNameById.has(renameGroupId)
					? renameGroupId
					: "";
			const groupChanged = effectiveRenameGroupId !== initialGroupId;
			const result = await dispatch({
				type: "rename-vocab-deck",
				payload: {
					deckId: renamingDeck.id,
					title: renameDraft.effectiveTitle,
					lessonNumber: renameDraft.validLesson,
					topic:
						renameDraft.cleanTopic.length > 0 ? renameDraft.cleanTopic : null,
					...(groupChanged
						? {
								groupId:
									effectiveRenameGroupId.length > 0
										? effectiveRenameGroupId
										: null,
							}
						: {}),
				},
			});
			if (result.kind === "refreshed") {
				toast.success(`Đã cập nhật bộ từ "${renameDraft.effectiveTitle}".`);
				closeRenameModal();
				return;
			}
			if (result.kind === "committed") {
				toast.warning(
					"Đã lưu thay đổi nhưng chưa đồng bộ danh sách — vui lòng tải lại trang.",
				);
				return;
			}
			toast.error("Không thể cập nhật bộ từ. Vui lòng thử lại.");
		} finally {
			setRenameSaving(false);
		}
	};

	const handleDeleteConfirm = async () => {
		if (!deletingDeck) return;
		const result = await dispatch({
			type: "delete-vocab-deck",
			deckId: deletingDeck.id,
		});
		if (result.kind === "refreshed") {
			toast.success(`Đã xoá bộ từ "${deletingDeck.title}".`);
		} else if (result.kind === "committed") {
			toast.warning(
				"Đã xoá bộ từ nhưng chưa đồng bộ danh sách — vui lòng tải lại trang.",
			);
		} else {
			toast.error("Không thể xoá bộ từ. Vui lòng thử lại.");
		}
		setDeletingDeck(null);
	};

	return (
		<Card className="p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<SectionLabel>Từ vựng SRS</SectionLabel>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						variant="secondary"
						data-testid="vocab-manage-groups-btn"
						onClick={() => setGroupManagerOpen(true)}
					>
						Quản lý nhóm
					</Button>
					<Button
						size="sm"
						variant="secondary"
						data-testid="vocab-import-csv-btn"
						onClick={() => setCsvImportOpen(true)}
					>
						Import CSV
					</Button>
					<Button
						size="sm"
						variant="secondary"
						data-testid="vocab-add-from-library"
						onClick={() => setLibraryOpen(true)}
					>
						Thêm từ thư viện
					</Button>
					<Button size="sm" onClick={() => setCreateOpen(true)}>
						Tạo bộ từ
					</Button>
				</div>
			</div>

			{showFilterBar ? (
				<div className="mt-4 flex flex-wrap items-center justify-between gap-2">
					<div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
						{showSourceFilter ? (
							<Select
								data-testid="vocab-deck-source-filter"
								aria-label="Lọc bộ từ theo nguồn"
								value={effectiveSourceFilter}
								onChange={(e) => setSourceFilter(e.target.value)}
								className="w-full min-w-0 max-w-full sm:w-56"
							>
								{sourceOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</Select>
						) : null}
						{showGroupFilter ? (
							<Select
								data-testid="vocab-deck-group-filter"
								aria-label="Lọc bộ từ theo nhóm"
								value={effectiveGroupFilter}
								onChange={(e) => setGroupFilter(e.target.value)}
								className="w-full min-w-0 max-w-full sm:w-64"
							>
								<option value="all">Tất cả nhóm</option>
								{sortedGroups.map((group) => (
									<option key={group.id} value={group.id}>
										{group.name} ({deckCountByGroupId.get(group.id) ?? 0})
									</option>
								))}
								{ungroupedCount > 0 || effectiveGroupFilter === "ungrouped" ? (
									<option value="ungrouped">
										Chưa phân nhóm ({ungroupedCount})
									</option>
								) : null}
							</Select>
						) : null}
						{hasActiveFilter ? (
							<span
								aria-live="polite"
								data-testid="vocab-deck-group-filter-count"
								className="text-muted-foreground text-xs tabular-nums"
							>
								Hiển thị {filteredDecks.length} / {decks.length} bộ từ
							</span>
						) : null}
					</div>
					{hasActiveFilter && filteredDecks.length > 0 ? (
						<Button
							type="button"
							size="sm"
							variant="ghost"
							data-testid="vocab-deck-group-filter-clear"
							onClick={handleClearFilters}
						>
							Xóa bộ lọc
						</Button>
					) : null}
				</div>
			) : null}

			{allScopedDecks.length === 0 ? (
				<p className="mt-4 text-muted-foreground text-sm">
					{isHubMode
						? "Chưa có bộ từ vựng nào. Tạo bộ từ mới hoặc thêm từ thư viện để gợi ý cho học viên."
						: "Chưa có bộ từ vựng nào cho lớp này. Tạo bộ từ để học sinh học và ôn tập theo 5 cấp độ trí nhớ."}
				</p>
			) : isHubMode &&
				decks.length === 0 &&
				effectiveSourceFilter === "independent" &&
				independentCount === 0 &&
				classDeckCount > 0 ? (
				<div
					data-testid="vocab-deck-source-empty"
					className="mt-4 flex flex-col items-start gap-2 rounded-md border border-border bg-muted/30 p-4 text-muted-foreground text-sm"
				>
					<p>
						Chưa có bộ từ nào trong ngân hàng riêng. Hiện có {classDeckCount} bộ
						từ đang gắn trong các lớp học.
					</p>
					<Button
						type="button"
						size="sm"
						variant="secondary"
						data-testid="vocab-deck-show-class-decks"
						onClick={() => setSourceFilter("all-classes")}
					>
						Xem bộ từ theo lớp
					</Button>
				</div>
			) : filteredDecks.length === 0 ? (
				<div
					data-testid="vocab-deck-group-filter-empty"
					className="mt-4 flex flex-col items-start gap-2 rounded-md border border-border bg-muted/30 p-4 text-muted-foreground text-sm"
				>
					<p>
						{effectiveGroupFilter !== "all"
							? "Không có bộ từ nào trong nhóm đã chọn."
							: "Không có bộ từ nào khớp bộ lọc đã chọn."}
					</p>
					<Button
						type="button"
						size="sm"
						variant="secondary"
						data-testid="vocab-deck-group-filter-clear"
						onClick={handleClearFilters}
					>
						Xóa bộ lọc
					</Button>
				</div>
			) : (
				<div className="mt-4 divide-y divide-border rounded-md border border-border">
					{filteredDecks.map((deck) => {
						const sourceBadgeLabel =
							deck.classId === null
								? "Riêng"
								: `Lớp ${classNameById.get(deck.classId) ?? deck.classId}`;
						const groupName = deck.groupId
							? (groupNameById.get(deck.groupId) ?? null)
							: null;
						return (
							<DeckListRow
								key={deck.id}
								deck={deck}
								sourceBadgeLabel={sourceBadgeLabel}
								groupName={groupName}
								pendingCount={pendingCountByDeckId.get(deck.id) ?? 0}
								onSuggest={setSuggestingDeck}
								onRename={openRenameModal}
								onEdit={setEditingDeckId}
								onDelete={setDeletingDeck}
							/>
						);
					})}
				</div>
			)}

			<Modal
				open={createOpen}
				onClose={closeCreateModal}
				title="Tạo bộ từ vựng mới"
				footer={
					<>
						<Button
							variant="secondary"
							onClick={closeCreateModal}
							type="button"
						>
							Hủy
						</Button>
						<Button
							type="button"
							data-testid="vocab-create-deck-submit"
							disabled={
								createDraft.effectiveTitle.length === 0 ||
								createDraft.lessonInvalid ||
								createSaving
							}
							onClick={() => void handleCreate()}
						>
							{createSaving ? "Đang tạo..." : "Tạo bộ từ"}
						</Button>
					</>
				}
			>
				<p className="text-muted-foreground text-sm">
					{isHubMode
						? "Bộ từ vựng độc lập thuộc trung tâm — bạn có thể gợi ý cho từng học viên bất kỳ lúc nào."
						: "Học sinh trong lớp sẽ thấy bộ từ này trên cổng học viên."}
				</p>
				<DeckMetadataFields
					groups={data.vocabGroups}
					groupId={newGroupId}
					lessonNumber={newLessonNumber}
					topic={newTopic}
					title={newTitle}
					lessonInvalid={createDraft.lessonInvalid}
					suggestedTitle={createDraft.suggestedTitle}
					disabled={createSaving}
					groupTestIdPrefix="vocab-create-deck-group"
					onGroupChange={setNewGroupId}
					onLessonChange={setNewLessonNumber}
					onTopicChange={setNewTopic}
					onTitleChange={setNewTitle}
				/>
			</Modal>

			<Modal
				open={renamingDeck !== null}
				onClose={closeRenameModal}
				title="Chỉnh sửa bộ từ vựng"
				footer={
					<>
						<Button
							variant="secondary"
							onClick={closeRenameModal}
							type="button"
						>
							Hủy
						</Button>
						<Button
							type="button"
							data-testid="vocab-rename-deck-submit"
							disabled={
								renameDraft.effectiveTitle.length === 0 ||
								renameDraft.lessonInvalid ||
								renameSaving
							}
							onClick={() => void handleRename()}
						>
							{renameSaving ? "Đang lưu..." : "Lưu thay đổi"}
						</Button>
					</>
				}
			>
				<DeckMetadataFields
					groups={data.vocabGroups}
					groupId={renameGroupId}
					lessonNumber={renameLessonNumber}
					topic={renameTopic}
					title={renameTitle}
					lessonInvalid={renameDraft.lessonInvalid}
					suggestedTitle={renameDraft.suggestedTitle}
					disabled={renameSaving}
					groupTestIdPrefix="vocab-edit-deck-group"
					onGroupChange={setRenameGroupId}
					onLessonChange={setRenameLessonNumber}
					onTopicChange={setRenameTopic}
					onTitleChange={setRenameTitle}
				/>
			</Modal>

			<Modal
				open={deletingDeck !== null}
				onClose={() => setDeletingDeck(null)}
				title="Xoá bộ từ vựng?"
				footer={
					<>
						<Button
							variant="secondary"
							onClick={() => setDeletingDeck(null)}
							type="button"
						>
							Hủy
						</Button>
						<Button
							type="button"
							variant="danger"
							data-testid="vocab-delete-deck-confirm"
							onClick={() => void handleDeleteConfirm()}
						>
							Xoá bộ từ
						</Button>
					</>
				}
			>
				<p className="text-muted-foreground text-sm">
					Bộ từ "{deletingDeck?.title}" và toàn bộ từ vựng, tiến độ học của học
					sinh trên bộ này sẽ bị xoá vĩnh viễn. Lịch sử ôn tập không bị mất.
				</p>
			</Modal>

			<VocabGroupManagerModal
				open={groupManagerOpen}
				onClose={() => setGroupManagerOpen(false)}
			/>

			{editingDeckId ? (
				<VocabDeckEditorDialog
					deckId={editingDeckId}
					deckTitle={
						decks.find((deck) => deck.id === editingDeckId)?.title ?? undefined
					}
					onClose={() => setEditingDeckId(null)}
				/>
			) : null}
			{suggestingDeck ? (
				<VocabSuggestDialog
					deckId={suggestingDeck.id}
					deckTitle={suggestingDeck.title}
					onClose={() => setSuggestingDeck(null)}
				/>
			) : null}
			<VocabLibraryDialog
				open={libraryOpen}
				classId={targetClassId}
				onClose={() => setLibraryOpen(false)}
			/>
			<VocabCsvImportDialog
				open={csvImportOpen}
				mode="create-decks"
				classId={targetClassId}
				onClose={() => setCsvImportOpen(false)}
			/>
		</Card>
	);
}
