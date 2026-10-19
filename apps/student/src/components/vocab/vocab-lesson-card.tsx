import { Link } from "@tanstack/react-router";
import type { VocabStudentLibraryDeck } from "@teacher-os/api/contracts";
import { useState } from "react";

const WORD_COUNT_NOISE_RE = /^\d+\s*từ vựng$/i;

export type LessonStatus = "completed" | "in-progress" | "new";

/**
 * Subtitle tiếng Việt cho lesson card kiểu MochiVocab:
 * - Render nguyên văn `deck.description` (CSV đã có sẵn prefix số "1.Trường học",
 *   tuyệt đối KHÔNG cộng thêm `sortOrder.` để tránh nhân đôi số — B1).
 * - Trả về `null` nếu description rỗng hoặc chỉ là chuỗi rác dạng "10 từ vựng" (B4).
 */
export function deriveLessonSubtitle(
	deck: Pick<VocabStudentLibraryDeck, "description">,
): string | null {
	const raw = deck.description?.trim() ?? "";
	if (!raw) return null;
	if (WORD_COUNT_NOISE_RE.test(raw)) return null;
	return raw;
}

/**
 * Trạng thái học của một bài từ vựng:
 * - `completed`: có từ và đã thuộc hết (`learnedCount >= wordCount`)
 * - `in-progress`: đã bắt đầu học (`reviewCount > 0`) nhưng chưa completed
 * - `new`: chưa học từ nào
 */
export function deriveLessonStatus(
	deck: Pick<
		VocabStudentLibraryDeck,
		"wordCount" | "learnedCount" | "reviewCount"
	>,
): LessonStatus {
	if (deck.wordCount > 0 && deck.learnedCount >= deck.wordCount) {
		return "completed";
	}
	if (deck.reviewCount > 0) {
		return "in-progress";
	}
	return "new";
}

/**
 * Tìm id bài học đầu tiên chưa hoàn thành trong danh sách gốc của khóa
 * để gắn điểm "Bắt đầu tại đây" và auto-scroll resume.
 */
export function findStartHereDeckId(
	decks: ReadonlyArray<
		Pick<VocabStudentLibraryDeck, "id" | "wordCount" | "learnedCount">
	>,
): string | null {
	for (const deck of decks) {
		const isCompleted =
			deck.wordCount > 0 && deck.learnedCount >= deck.wordCount;
		if (!isCompleted) {
			return deck.id;
		}
	}
	return null;
}

export interface VocabLessonCardProps {
	deck: VocabStudentLibraryDeck;
	courseId: string;
	isStartHere?: boolean;
}

export function VocabLessonCard({
	deck,
	courseId,
	isStartHere = false,
}: VocabLessonCardProps) {
	const [failedUrl, setFailedUrl] = useState<string | null>(null);

	const subtitle = deriveLessonSubtitle(deck);
	const status = deriveLessonStatus(deck);
	const showImage = Boolean(deck.imageUrl) && failedUrl !== deck.imageUrl;

	return (
		<Link
			to="/vocab/$deckId"
			params={{ deckId: deck.id }}
			search={{ course: courseId }}
			data-testid={`vocab-course-deck-${deck.id}`}
			className={`neu group relative flex flex-col justify-between gap-2.5 rounded-md p-3 transition-colors duration-150 hover:border-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot/40 ${
				isStartHere ? "border-hot" : ""
			}`}
		>
			{isStartHere ? (
				<span
					data-testid="vocab-lesson-start-here"
					className="inline-flex items-center gap-1 self-start rounded-full bg-hot px-2 py-0.5 font-mono text-[10px] text-accent-on uppercase tracking-wider"
				>
					<span aria-hidden="true">▸</span> Bắt đầu tại đây
				</span>
			) : null}

			<div className="space-y-2">
				<div className="neu-in relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm">
					{showImage ? (
						<img
							src={deck.imageUrl ?? undefined}
							alt=""
							loading="lazy"
							decoding="async"
							data-testid={`vocab-lesson-img-${deck.id}`}
							onError={() => setFailedUrl(deck.imageUrl)}
							className="aspect-square h-full w-full object-contain p-2"
						/>
					) : (
						<div
							data-testid={`vocab-lesson-img-fallback-${deck.id}`}
							aria-hidden="true"
							className="flex h-full w-full flex-col items-center justify-center p-2 text-center"
						>
							<span className="line-clamp-2 font-display font-extrabold text-fg text-xs">
								{deck.title}
							</span>
							<span className="mt-1 font-mono text-[10px] text-meta">
								{deck.wordCount} từ
							</span>
						</div>
					)}
				</div>

				<div>
					<h3
						data-testid={`vocab-lesson-title-${deck.id}`}
						className="line-clamp-2 font-display font-extrabold text-fg text-sm leading-snug group-hover:text-hot"
					>
						{deck.title}
					</h3>
					{subtitle ? (
						<p
							data-testid={`vocab-lesson-subtitle-${deck.id}`}
							className="mt-0.5 line-clamp-2 text-meta text-xs leading-snug"
						>
							{subtitle}
						</p>
					) : null}
				</div>
			</div>

			<div
				aria-hidden="true"
				className="flex flex-wrap items-center gap-1.5 pt-1 font-mono text-[10px]"
			>
				{status === "completed" ? (
					<span
						data-testid={`vocab-lesson-status-${deck.id}`}
						className="neu-in rounded-full px-2 py-0.5 text-success"
					>
						Hoàn thành
					</span>
				) : status === "in-progress" ? (
					<span
						data-testid={`vocab-lesson-status-${deck.id}`}
						className="neu-in rounded-full px-2 py-0.5 text-hot"
					>
						Đang học {deck.reviewCount}/{deck.wordCount}
					</span>
				) : (
					<span className="neu-in rounded-full px-2 py-0.5 text-meta">
						{deck.wordCount} từ
					</span>
				)}

				{deck.dueCount > 0 ? (
					<span
						data-testid={`vocab-course-deck-due-${deck.id}`}
						className="rounded-full bg-hot px-2 py-0.5 text-accent-on"
					>
						{deck.dueCount} đến hạn
					</span>
				) : null}
			</div>
		</Link>
	);
}
