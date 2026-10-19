import { VocabDeckList } from "./vocab-deck-list";

/**
 * Tab "Bộ từ vựng" trong trang Từ vựng hub (`/vocab`, #363):
 * hiển thị toàn bộ deck của org (deck riêng + deck lớp), tạo deck riêng,
 * clone từ thư viện, mở editor, và gợi ý deck cho học viên.
 */
export function VocabHubDecks() {
	return <VocabDeckList classId={null} />;
}
