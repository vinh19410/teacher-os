import type { VocabStudentLibraryCourse } from "@teacher-os/api/contracts";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface VocabCourseSwitcherDialogProps {
	open: boolean;
	currentCourseId: string;
	courses: readonly VocabStudentLibraryCourse[];
	onSelectCourse: (courseId: string) => void;
	onClose: () => void;
}

/**
 * Dialog đổi khóa học kiểu MochiVocab (ribbon click -> modal danh sách 20 khóa).
 * Tự viết overlay focus-trapped theo pattern `quiz-lifecycle-dialogs.tsx` và `DESIGN.md`:
 * `role="dialog"`, `aria-modal="true"`, Escape đóng, Tab xoay trong panel, backdrop click đóng.
 */
export function VocabCourseSwitcherDialog({
	open,
	currentCourseId,
	courses,
	onSelectCourse,
	onClose,
}: VocabCourseSwitcherDialogProps) {
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");

	useEffect(() => {
		if (!open) {
			setQuery("");
			return;
		}
		searchInputRef.current?.focus();
	}, [open]);

	const filteredCourses = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return courses;
		return courses.filter(
			(course) =>
				course.name.toLowerCase().includes(normalized) ||
				(course.description ?? "").toLowerCase().includes(normalized) ||
				(course.target ?? "").toLowerCase().includes(normalized),
		);
	}, [courses, query]);

	if (!open) return null;

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onClose();
			return;
		}
		if (event.key !== "Tab" || panelRef.current === null) return;
		const focusables = panelRef.current.querySelectorAll<HTMLElement>(
			"button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
		);
		if (focusables.length === 0) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first?.focus();
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			<button
				type="button"
				tabIndex={-1}
				aria-label="Đóng hộp thoại"
				data-testid="vocab-course-switcher-backdrop"
				onClick={onClose}
				className="fixed inset-0 bg-black/60 backdrop-blur-sm"
			/>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				data-testid="vocab-course-switcher-dialog"
				onKeyDown={handleKeyDown}
				className="neu relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-md p-5 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot/40"
			>
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="font-mono text-[10px] text-hot uppercase tracking-[0.2em]">
							Danh sách khóa học
						</p>
						<h2
							id={titleId}
							className="mt-1 font-display font-extrabold text-fg text-xl tracking-[-0.02em]"
						>
							Chọn khóa học từ vựng
						</h2>
					</div>
					<button
						type="button"
						data-testid="vocab-course-switcher-close"
						aria-label="Đóng danh sách khóa học"
						onClick={onClose}
						className="neu-sm rounded-md px-2.5 py-1 font-mono text-fg text-xs transition-colors hover:text-hot focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot/40"
					>
						✕
					</button>
				</div>

				<div className="mt-4">
					<input
						ref={searchInputRef}
						type="search"
						data-testid="vocab-course-switcher-search"
						aria-label="Tìm nhanh khóa học"
						placeholder="Tìm nhanh khóa học..."
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						className="w-full rounded-md border border-line-strong bg-surface px-3.5 py-2 text-fg text-sm placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot/40"
					/>
				</div>

				<div
					data-testid="vocab-course-switcher-list"
					className="mt-4 space-y-2 overflow-y-auto pr-1"
				>
					{filteredCourses.length === 0 ? (
						<p className="py-6 text-center text-meta text-sm">
							Không tìm thấy khóa học phù hợp.
						</p>
					) : (
						filteredCourses.map((course) => {
							const isCurrent = course.id === currentCourseId;
							return (
								<button
									key={course.id}
									type="button"
									data-testid={`vocab-switcher-course-${course.id}`}
									aria-current={isCurrent ? "true" : undefined}
									onClick={() => onSelectCourse(course.id)}
									className={`flex w-full items-center justify-between gap-3 rounded-md p-3.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot/40 ${
										isCurrent
											? "neu-in text-hot"
											: "neu-sm text-fg hover:border-fg"
									}`}
								>
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-bold font-display text-sm">
												{course.name}
											</span>
											{isCurrent ? (
												<span
													aria-hidden="true"
													className="neu-sm rounded-full px-2 py-0.5 font-mono text-[10px] text-hot uppercase"
												>
													Đang xem
												</span>
											) : null}
										</div>
										{course.description ? (
											<p className="line-clamp-1 text-meta text-xs">
												{course.description}
											</p>
										) : null}
									</div>

									<div
										aria-hidden="true"
										className="shrink-0 text-right font-mono text-[11px] text-meta"
									>
										<div>{course.deckCount} bài</div>
										{course.reviewWordCount > 0 ? (
											<div className="text-fg">
												{course.reviewWordCount}/{course.wordCount} từ
											</div>
										) : (
											<div>{course.wordCount} từ</div>
										)}
									</div>
								</button>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
}
