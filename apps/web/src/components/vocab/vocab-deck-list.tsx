import type { KernelVocabDeckRow } from "@teacher-os/api/contracts";
import { formatVocabLessonDeckTitle } from "@teacher-os/api/lib/vocab-csv";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SectionLabel } from "@/components/ui/section-label";
import { useData } from "@/lib/data-store";
import { VocabCsvImportDialog } from "./vocab-csv-import-dialog";
import { VocabDeckEditorDialog } from "./vocab-deck-editor";
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

function DeckListRow({
	deck,
	sourceBadgeLabel,
	pendingCount,
	onSuggest,
	onEdit,
	onDelete,
}: {
	deck: KernelVocabDeckRow;
	sourceBadgeLabel: string;
	pendingCount: number;
	onSuggest: (deck: { id: string; title: string }) => void;
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
			<div className="flex flex-none items-center gap-2">
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
 * - Khi `classId` là `null` hoặc không truyền (trang Từ vựng hub `/vocab`): hiển thị toàn bộ deck của org
 *   (cả deck riêng `classId = null` lẫn deck lớp), kèm badge nguồn ("Riêng" / "Lớp {name}") và nút "Gợi ý".
 */
export function VocabDeckList({ classId = null }: { classId?: string | null }) {
	const { data, dispatch } = useData();
	const targetClassId =
		typeof classId === "string" && classId.length > 0 ? classId : null;
	const isHubMode = targetClassId === null;

	const decks = useMemo(() => {
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

	const pendingCountByDeckId = useMemo(() => {
		const map = new Map<string, number>();
		for (const sug of data.vocabSuggestions ?? []) {
			map.set(sug.deckId, (map.get(sug.deckId) ?? 0) + 1);
		}
		return map;
	}, [data.vocabSuggestions]);

	const [createOpen, setCreateOpen] = useState(false);
	const [libraryOpen, setLibraryOpen] = useState(false);
	const [csvImportOpen, setCsvImportOpen] = useState(false);
	const [newTitle, setNewTitle] = useState("");
	const [newLessonNumber, setNewLessonNumber] = useState("");
	const [newTopic, setNewTopic] = useState("");
	const [createSaving, setCreateSaving] = useState(false);
	const lessonInputId = useId();
	const topicInputId = useId();
	const titleInputId = useId();
	const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
	const [suggestingDeck, setSuggestingDeck] = useState<{
		id: string;
		title: string;
	} | null>(null);
	const [deletingDeck, setDeletingDeck] = useState<{
		id: string;
		title: string;
	} | null>(null);

	const trimmedLesson = newLessonNumber.trim();
	const parsedLesson = useMemo(() => {
		if (trimmedLesson.length === 0) return null;
		if (!/^\d+$/.test(trimmedLesson)) return Number.NaN;
		const num = Number.parseInt(trimmedLesson, 10);
		return num >= 1 && num <= 9999 ? num : Number.NaN;
	}, [trimmedLesson]);
	const lessonInvalid = parsedLesson !== null && Number.isNaN(parsedLesson);
	const validLesson =
		parsedLesson !== null && !Number.isNaN(parsedLesson) ? parsedLesson : null;
	const cleanTopic = newTopic.trim();
	const suggestedTitle = formatVocabLessonDeckTitle(validLesson, cleanTopic);
	const effectiveTitle = newTitle.trim() || suggestedTitle;

	const resetCreateForm = () => {
		setNewTitle("");
		setNewLessonNumber("");
		setNewTopic("");
	};

	const closeCreateModal = () => {
		setCreateOpen(false);
		resetCreateForm();
	};

	const handleCreate = async () => {
		if (effectiveTitle.length === 0 || lessonInvalid || createSaving) return;
		setCreateSaving(true);
		try {
			const result = await dispatch({
				type: "create-vocab-deck",
				payload: {
					classId: targetClassId,
					title: effectiveTitle,
					...(validLesson !== null ? { lessonNumber: validLesson } : {}),
					...(cleanTopic.length > 0 ? { topic: cleanTopic } : {}),
				},
			});
			if (result.kind !== "refreshed") return;
			closeCreateModal();
		} finally {
			setCreateSaving(false);
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

			{decks.length === 0 ? (
				<p className="mt-4 text-muted-foreground text-sm">
					{isHubMode
						? "Chưa có bộ từ vựng nào. Tạo bộ từ mới hoặc thêm từ thư viện để gợi ý cho học viên."
						: "Chưa có bộ từ vựng nào cho lớp này. Tạo bộ từ để học sinh học và ôn tập theo 5 cấp độ trí nhớ."}
				</p>
			) : (
				<div className="mt-4 divide-y divide-border rounded-md border border-border">
					{decks.map((deck) => {
						const sourceBadgeLabel =
							deck.classId === null
								? "Riêng"
								: `Lớp ${classNameById.get(deck.classId) ?? deck.classId}`;
						return (
							<DeckListRow
								key={deck.id}
								deck={deck}
								sourceBadgeLabel={sourceBadgeLabel}
								pendingCount={pendingCountByDeckId.get(deck.id) ?? 0}
								onSuggest={setSuggestingDeck}
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
								effectiveTitle.length === 0 || lessonInvalid || createSaving
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
							value={newLessonNumber}
							onChange={(e) => setNewLessonNumber(e.target.value)}
							placeholder="Ví dụ: 1"
							aria-label="Số buổi học"
							aria-invalid={lessonInvalid || undefined}
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
							value={newTopic}
							onChange={(e) => setNewTopic(e.target.value)}
							placeholder="Ví dụ: Friends & Introductions"
							aria-label="Chủ đề"
						/>
					</div>
				</div>
				<div className="flex flex-col gap-1.5">
					<label
						htmlFor={titleInputId}
						className="font-medium text-foreground text-sm leading-none"
					>
						Tiêu đề bộ từ
					</label>
					<Input
						id={titleInputId}
						value={newTitle}
						onChange={(e) => setNewTitle(e.target.value)}
						placeholder={suggestedTitle || "Ví dụ: Topic 1: Environment"}
						aria-label="Tiêu đề bộ từ"
					/>
				</div>
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
