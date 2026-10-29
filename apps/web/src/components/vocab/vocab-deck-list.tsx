import type { KernelVocabDeckRow } from "@teacher-os/api/contracts";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SectionLabel } from "@/components/ui/section-label";
import { useData } from "@/lib/data-store";
import { STUDENT_PORTAL_ENABLED } from "@/lib/student-portal";
import { VocabDeckEditorDialog } from "./vocab-deck-editor";
import { VocabLibraryDialog } from "./vocab-library-dialog";
import { VocabSuggestDialog } from "./vocab-suggest-dialog";

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
	const [newTitle, setNewTitle] = useState("");
	const [createSaving, setCreateSaving] = useState(false);
	const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
	const [suggestingDeck, setSuggestingDeck] = useState<{
		id: string;
		title: string;
	} | null>(null);
	const [deletingDeck, setDeletingDeck] = useState<{
		id: string;
		title: string;
	} | null>(null);
	const handleCreate = async () => {
		const title = newTitle.trim();
		if (title.length === 0 || createSaving) return;
		setCreateSaving(true);
		try {
			const result = await dispatch({
				type: "create-vocab-deck",
				payload: { classId: targetClassId, title },
			});
			if (result.kind !== "refreshed") return;
			setNewTitle("");
			setCreateOpen(false);
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
				onClose={() => setCreateOpen(false)}
				title="Tạo bộ từ vựng mới"
				footer={
					<>
						<Button
							variant="secondary"
							onClick={() => setCreateOpen(false)}
							type="button"
						>
							Hủy
						</Button>
						<Button
							type="button"
							data-testid="vocab-create-deck-submit"
							disabled={newTitle.trim().length === 0 || createSaving}
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
						: STUDENT_PORTAL_ENABLED
							? "Học sinh trong lớp sẽ thấy bộ từ này trên cổng học viên."
							: "Bộ từ vựng này thuộc về lớp."}
				</p>
				<Input
					value={newTitle}
					onChange={(e) => setNewTitle(e.target.value)}
					placeholder="Ví dụ: Topic 1: Environment"
					aria-label="Tiêu đề bộ từ"
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

			{editingDeckId ? (
				<VocabDeckEditorDialog
					deckId={editingDeckId}
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
		</Card>
	);
}
