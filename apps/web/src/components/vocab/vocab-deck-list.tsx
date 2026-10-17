import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SectionLabel } from "@/components/ui/section-label";
import { useData } from "@/lib/data-store";
import { VocabDeckEditorDialog } from "./vocab-deck-editor";

/**
 * Section "Từ vựng" trong trang chi tiết lớp (#359): danh sách deck
 * (đếm từ aggregate từ kernel snapshot) + tạo deck mới. Editor từ vựng
 * mở dưới modal khi teacher chọn soạn 1 deck. Xoá deck là hành động phá
 * huỷ — confirm bằng dialog riêng (--destructive).
 */
export function VocabDeckList({ classId }: { classId: string }) {
	const { data, dispatch } = useData();
	const decks = data.vocabDecks.filter((deck) => deck.classId === classId);

	const [createOpen, setCreateOpen] = useState(false);
	const [newTitle, setNewTitle] = useState("");
	const [createSaving, setCreateSaving] = useState(false);
	const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
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
				payload: { classId, title },
			});
			if (result.kind !== "refreshed") return; // lỗi đã báo bởi command bus
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
				<Button size="sm" onClick={() => setCreateOpen(true)}>
					Tạo bộ từ
				</Button>
			</div>

			{decks.length === 0 ? (
				<p className="mt-4 text-muted-fg text-sm">
					Chưa có bộ từ vựng nào cho lớp này. Tạo bộ từ để học sinh học và ôn
					tập theo 5 cấp độ trí nhớ.
				</p>
			) : (
				<div className="mt-4 divide-y divide-line rounded-md border border-line">
					{decks.map((deck) => (
						<div
							key={deck.id}
							data-testid={`vocab-deck-row-${deck.id}`}
							className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
						>
							<div className="min-w-0">
								<p className="truncate font-medium text-fg text-sm">
									{deck.title}
								</p>
								<p className="mt-0.5 font-mono text-[11px] text-muted-fg">
									{deck.wordCount} từ · {deck.lang}
								</p>
							</div>
							<div className="flex flex-none items-center gap-2">
								<Button
									size="sm"
									variant="secondary"
									data-testid={`vocab-edit-deck-${deck.id}`}
									onClick={() => setEditingDeckId(deck.id)}
								>
									Soạn từ vựng
								</Button>
								<Button
									size="sm"
									variant="ghost"
									data-testid={`vocab-delete-deck-${deck.id}`}
									onClick={() =>
										setDeletingDeck({ id: deck.id, title: deck.title })
									}
								>
									Xoá
								</Button>
							</div>
						</div>
					))}
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
				<p className="text-muted-fg text-sm">
					Học sinh trong lớp sẽ thấy bộ từ này trên cổng học viên.
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
				<p className="text-muted-fg text-sm">
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
		</Card>
	);
}
