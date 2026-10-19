import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
	useVocabLibraryCourseDecks,
	useVocabLibraryCourses,
} from "@/lib/repos/vocab";

export interface VocabCourseCatalogProps {
	selectedCourseId?: string | null;
	searchQuery?: string;
	onSelectCourse?: (courseId: string | null) => void;
	onSearchChange?: (query: string) => void;
}

export function VocabCourseCatalog({
	selectedCourseId,
	searchQuery,
	onSelectCourse,
	onSearchChange,
}: VocabCourseCatalogProps = {}) {
	const [internalCourseId, setInternalCourseId] = useState<string | null>(null);
	const activeCourseId =
		selectedCourseId !== undefined ? selectedCourseId : internalCourseId;

	const [inputValue, setInputValue] = useState<string>(searchQuery ?? "");
	const [debouncedQuery, setDebouncedQuery] = useState<string>(
		searchQuery ?? "",
	);

	useEffect(() => {
		if (searchQuery !== undefined) {
			setInputValue(searchQuery);
			setDebouncedQuery(searchQuery);
		}
	}, [searchQuery]);

	useEffect(() => {
		const timer = setTimeout(() => {
			const trimmed = inputValue.trim();
			setDebouncedQuery(trimmed);
			onSearchChange?.(trimmed);
		}, 300);
		return () => clearTimeout(timer);
	}, [inputValue, onSearchChange]);

	const handleSelectCourse = (courseId: string | null) => {
		setInputValue("");
		setDebouncedQuery("");
		if (selectedCourseId === undefined) {
			setInternalCourseId(courseId);
		}
		onSelectCourse?.(courseId);
	};

	const coursesQuery = useVocabLibraryCourses();
	const decksQuery = useVocabLibraryCourseDecks(activeCourseId);

	const courses = coursesQuery.data?.courses ?? [];
	const selectedCourse = useMemo(() => {
		if (!activeCourseId) return null;
		return (
			courses.find((c) => c.id === activeCourseId) ??
			decksQuery.data?.course ??
			null
		);
	}, [activeCourseId, courses, decksQuery.data?.course]);

	const normalizedFilter = debouncedQuery.trim().toLowerCase();

	const filteredCourses = useMemo(() => {
		if (!normalizedFilter) return courses;
		return courses.filter(
			(course) =>
				course.name.toLowerCase().includes(normalizedFilter) ||
				(course.description ?? "").toLowerCase().includes(normalizedFilter) ||
				(course.target ?? "").toLowerCase().includes(normalizedFilter),
		);
	}, [courses, normalizedFilter]);

	const decks = decksQuery.data?.decks ?? [];
	const filteredDecks = useMemo(() => {
		if (!normalizedFilter) return decks;
		return decks.filter((deck) =>
			deck.title.toLowerCase().includes(normalizedFilter),
		);
	}, [decks, normalizedFilter]);

	return (
		<section data-testid="vocab-courses-section" className="space-y-4">
			{!activeCourseId ? (
				<>
					<div className="flex flex-wrap items-end justify-between gap-3">
						<div>
							<p className="font-mono text-[11px] text-meta uppercase tracking-[0.15em]">
								Thư viện từ vựng
							</p>
							<h2 className="mt-1 font-display font-extrabold text-fg text-xl tracking-[-0.02em]">
								Khóa học từ vựng
							</h2>
						</div>
						<input
							type="search"
							data-testid="vocab-course-search"
							aria-label="Tìm khóa học từ vựng"
							placeholder="Tìm khóa học từ vựng..."
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							className="w-full rounded-md border border-line-strong bg-surface px-3.5 py-2 text-fg text-sm placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot/40 sm:w-72"
						/>
					</div>

					{coursesQuery.isLoading ? (
						<div
							data-testid="vocab-courses-loading"
							className="neu rounded-md p-6 text-center text-meta text-sm"
						>
							Đang tải danh sách khóa học từ vựng...
						</div>
					) : coursesQuery.isError ? (
						<div
							data-testid="vocab-courses-error"
							className="neu rounded-md p-6 text-center text-danger text-sm"
						>
							Không thể tải danh sách khóa học từ vựng. Vui lòng thử lại.
						</div>
					) : filteredCourses.length === 0 ? (
						<div
							data-testid="vocab-courses-empty"
							className="neu rounded-md p-6 text-center text-meta text-sm"
						>
							Không tìm thấy khóa học từ vựng phù hợp.
						</div>
					) : (
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							{filteredCourses.map((course) => (
								<button
									key={course.id}
									type="button"
									data-testid={`vocab-course-card-${course.id}`}
									onClick={() => handleSelectCourse(course.id)}
									className="neu group flex w-full flex-col justify-between gap-4 rounded-md p-5 text-left transition-colors duration-150 hover:border-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot/40"
								>
									<div className="space-y-1.5">
										{course.target ? (
											<span
												aria-hidden="true"
												className="neu-in inline-block rounded px-1.5 py-0.5 font-mono text-[10px] text-meta uppercase tracking-widest"
											>
												{course.target}
											</span>
										) : null}
										<h3 className="font-display font-extrabold text-fg text-lg group-hover:text-hot">
											{course.name}
										</h3>
										{course.description ? (
											<p className="line-clamp-2 text-meta text-sm">
												{course.description}
											</p>
										) : null}
									</div>

									<div
										aria-hidden="true"
										className="flex flex-wrap items-center gap-2 font-mono text-xs"
									>
										<span className="neu-in rounded-full px-2.5 py-0.5 text-meta">
											{course.deckCount} bài
										</span>
										<span className="neu-in rounded-full px-2.5 py-0.5 text-meta">
											{course.wordCount} từ
										</span>
										{course.reviewWordCount > 0 ? (
											<span
												data-testid={`vocab-course-review-${course.id}`}
												className="neu-in rounded-full px-2.5 py-0.5 text-fg"
											>
												Đã học {course.reviewWordCount}/{course.wordCount} từ
											</span>
										) : null}
										{course.learnedWordCount > 0 ? (
											<span
												data-testid={`vocab-course-learned-${course.id}`}
												className="neu-in rounded-full px-2.5 py-0.5 text-ok"
											>
												{course.learnedWordCount} thành thạo
											</span>
										) : null}
										{course.dueWordCount > 0 ? (
											<span
												data-testid={`vocab-course-due-${course.id}`}
												className="rounded-full bg-hot px-2.5 py-0.5 text-accent-on"
											>
												{course.dueWordCount} đến hạn
											</span>
										) : null}
									</div>
								</button>
							))}
						</div>
					)}
				</>
			) : (
				<>
					<div className="flex flex-wrap items-end justify-between gap-3">
						<div className="space-y-1">
							<button
								type="button"
								data-testid="vocab-course-back-btn"
								onClick={() => handleSelectCourse(null)}
								className="font-mono text-meta text-xs transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot/40"
							>
								← Tất cả khóa học
							</button>
							<h2
								data-testid="vocab-selected-course-title"
								className="font-display font-extrabold text-fg text-xl tracking-[-0.02em]"
							>
								{selectedCourse?.name ?? "Danh sách bài học"}
							</h2>
							{selectedCourse?.description ? (
								<p className="text-meta text-sm">
									{selectedCourse.description}
								</p>
							) : null}
						</div>

						<input
							type="search"
							data-testid="vocab-course-deck-search"
							aria-label="Tìm bài học trong khóa"
							placeholder="Tìm bài học trong khóa..."
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							className="w-full rounded-md border border-line-strong bg-surface px-3.5 py-2 text-fg text-sm placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot/40 sm:w-72"
						/>
					</div>

					{decksQuery.isLoading ? (
						<div
							data-testid="vocab-course-decks-loading"
							className="neu rounded-md p-6 text-center text-meta text-sm"
						>
							Đang tải danh sách bài học...
						</div>
					) : decksQuery.isError ? (
						<div
							data-testid="vocab-course-decks-error"
							className="neu rounded-md p-6 text-center text-danger text-sm"
						>
							Không thể tải danh sách bài học. Vui lòng thử lại.
						</div>
					) : filteredDecks.length === 0 ? (
						<div
							data-testid="vocab-course-decks-empty"
							className="neu rounded-md p-6 text-center text-meta text-sm"
						>
							Không tìm thấy bài học phù hợp.
						</div>
					) : (
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							{filteredDecks.map((deck) => (
								<Link
									key={deck.id}
									to="/vocab/$deckId"
									params={{ deckId: deck.id }}
									data-testid={`vocab-course-deck-${deck.id}`}
									className="neu group flex flex-col justify-between gap-4 rounded-md p-5 transition-colors duration-150 hover:border-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot/40"
								>
									<div>
										<h3 className="font-display font-extrabold text-fg text-lg group-hover:text-hot">
											{deck.title}
										</h3>
									</div>
									<div
										aria-hidden="true"
										className="flex flex-wrap items-center gap-2 font-mono text-xs"
									>
										<span className="neu-in rounded-full px-2.5 py-0.5 text-meta">
											{deck.wordCount} từ
										</span>
										{deck.newCount > 0 ? (
											<span
												data-testid={`vocab-course-deck-new-${deck.id}`}
												className="neu-in rounded-full px-2.5 py-0.5 text-hot"
											>
												{deck.newCount} từ mới
											</span>
										) : null}
										{deck.reviewCount > 0 ? (
											<span
												data-testid={`vocab-course-deck-review-${deck.id}`}
												className="neu-in rounded-full px-2.5 py-0.5 text-fg"
											>
												{deck.reviewCount} đã học
											</span>
										) : null}
										{deck.learnedCount > 0 ? (
											<span
												data-testid={`vocab-course-deck-learned-${deck.id}`}
												className="neu-in rounded-full px-2.5 py-0.5 text-ok"
											>
												{deck.learnedCount} thành thạo
											</span>
										) : null}
										{deck.dueCount > 0 ? (
											<span
												data-testid={`vocab-course-deck-due-${deck.id}`}
												className="rounded-full bg-hot px-2.5 py-0.5 text-accent-on"
											>
												{deck.dueCount} đến hạn
											</span>
										) : null}
									</div>
								</Link>
							))}
						</div>
					)}
				</>
			)}
		</section>
	);
}
