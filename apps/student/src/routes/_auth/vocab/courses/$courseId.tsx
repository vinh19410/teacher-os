import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import { VocabCourseSwitcherDialog } from "@/components/vocab/vocab-course-switcher-dialog";
import {
	findStartHereDeckId,
	VocabLessonCard,
} from "@/components/vocab/vocab-lesson-card";
import { useStudentMe } from "@/lib/repos/student";
import {
	useVocabLibraryCourseDecks,
	useVocabLibraryCourses,
} from "@/lib/repos/vocab";

export const Route = createFileRoute("/_auth/vocab/courses/$courseId")({
	validateSearch: (input: { q?: string }): { q?: string } => ({
		q:
			typeof input.q === "string" && input.q.trim().length > 0
				? input.q.trim()
				: undefined,
	}),
	component: VocabCourseLessonsPage,
});

export interface VocabCourseLessonsViewProps {
	courseId: string;
	searchQuery?: string;
	onSearchChange?: (query: string) => void;
	onSelectCourse?: (courseId: string) => void;
}

export function VocabCourseLessonsView({
	courseId,
	searchQuery = "",
	onSearchChange,
	onSelectCourse,
}: VocabCourseLessonsViewProps) {
	const [inputValue, setInputValue] = useState<string>(searchQuery);
	const [debouncedQuery, setDebouncedQuery] = useState<string>(searchQuery);
	const [switcherOpen, setSwitcherOpen] = useState(false);
	const scrolledCourseRef = useRef<string | null>(null);
	const containerRef = useRef<HTMLElement>(null);

	useEffect(() => {
		setInputValue(searchQuery);
		setDebouncedQuery(searchQuery);
	}, [searchQuery]);

	useEffect(() => {
		const timer = setTimeout(() => {
			const trimmed = inputValue.trim();
			setDebouncedQuery(trimmed);
			onSearchChange?.(trimmed);
		}, 300);
		return () => clearTimeout(timer);
	}, [inputValue, onSearchChange]);

	const coursesQuery = useVocabLibraryCourses();
	const decksQuery = useVocabLibraryCourseDecks(courseId);

	const courses = coursesQuery.data?.courses ?? [];
	const selectedCourse = useMemo(() => {
		return (
			courses.find((c) => c.id === courseId) ?? decksQuery.data?.course ?? null
		);
	}, [courseId, courses, decksQuery.data?.course]);

	const decks = decksQuery.data?.decks ?? [];
	const startHereDeckId = useMemo(() => findStartHereDeckId(decks), [decks]);

	// Auto-scroll 1 lần tới bài "Bắt đầu tại đây" khi dữ liệu khóa học load xong
	useEffect(() => {
		if (
			scrolledCourseRef.current !== null &&
			scrolledCourseRef.current !== courseId
		) {
			scrolledCourseRef.current = null;
		}
		if (decks.length === 0 || !startHereDeckId) return;
		if (scrolledCourseRef.current === courseId) return;

		const el = containerRef.current?.querySelector<HTMLElement>(
			'[data-testid="vocab-lesson-start-here"]',
		);
		if (el && typeof el.scrollIntoView === "function") {
			scrolledCourseRef.current = courseId;
			el.scrollIntoView({ behavior: "smooth", block: "center" });
		}
	}, [courseId, decks.length, startHereDeckId]);

	const normalizedFilter = debouncedQuery.trim().toLowerCase();
	const filteredDecks = useMemo(() => {
		if (!normalizedFilter) return decks;
		return decks.filter(
			(deck) =>
				deck.title.toLowerCase().includes(normalizedFilter) ||
				(deck.description ?? "").toLowerCase().includes(normalizedFilter),
		);
	}, [decks, normalizedFilter]);

	return (
		<section
			ref={containerRef}
			data-testid="vocab-course-lessons-section"
			className="space-y-6"
		>
			<div className="space-y-3">
				<Link
					to="/vocab/courses"
					data-testid="vocab-course-back-btn"
					className="inline-block font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em] transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
				>
					← Tất cả khóa học
				</Link>

				<div className="flex flex-wrap items-stretch justify-between gap-3">
					<button
						type="button"
						data-testid="vocab-course-switcher"
						aria-haspopup="dialog"
						aria-expanded={switcherOpen}
						onClick={() => setSwitcherOpen(true)}
						className="group flex flex-1 items-center justify-between gap-4 rounded-md rounded-xl border bg-card px-5 py-4 text-left shadow-sm transition-colors duration-150 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
					>
						<div className="min-w-0 space-y-1">
							<p className="font-mono text-[10px] text-primary uppercase tracking-[0.2em]">
								Khóa học đang chọn · Bấm để đổi khóa
							</p>
							<h1
								data-testid="vocab-selected-course-title"
								className="font-extrabold text-2xl text-foreground tracking-[-0.03em] group-hover:text-primary"
							>
								{selectedCourse?.name ?? "Danh sách bài học"}
							</h1>
							{selectedCourse?.description ? (
								<p className="line-clamp-2 text-muted-foreground text-sm">
									{selectedCourse.description}
								</p>
							) : null}
						</div>
						<span
							aria-hidden="true"
							className="shrink-0 rounded-md rounded-md border border-input bg-transparent px-3 py-1.5 font-mono text-foreground text-xs transition-colors group-hover:border-primary group-hover:text-primary"
						>
							Đổi khóa ▾
						</span>
					</button>

					<div className="flex w-full items-end sm:w-72">
						<input
							type="search"
							data-testid="vocab-course-deck-search"
							aria-label="Tìm bài học trong khóa"
							placeholder="Tìm bài học trong khóa..."
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							className="w-full rounded-md border border-input bg-muted px-3.5 py-2.5 text-foreground text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
						/>
					</div>
				</div>
			</div>

			{decksQuery.isLoading ? (
				<div
					data-testid="vocab-course-decks-loading"
					className="rounded-md rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm shadow-sm"
				>
					Đang tải danh sách bài học...
				</div>
			) : decksQuery.isError ? (
				<div
					data-testid="vocab-course-decks-error"
					className="rounded-md rounded-xl border bg-card p-6 text-center text-danger text-sm shadow-sm"
				>
					Không thể tải danh sách bài học. Vui lòng thử lại.
				</div>
			) : filteredDecks.length === 0 ? (
				<div
					data-testid="vocab-course-decks-empty"
					className="rounded-md rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm shadow-sm"
				>
					Không tìm thấy bài học phù hợp.
				</div>
			) : (
				<div
					data-testid="vocab-lesson-grid"
					className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
				>
					{filteredDecks.map((deck) => (
						<VocabLessonCard
							key={deck.id}
							deck={deck}
							courseId={courseId}
							isStartHere={deck.id === startHereDeckId}
						/>
					))}
				</div>
			)}

			<VocabCourseSwitcherDialog
				open={switcherOpen}
				currentCourseId={courseId}
				courses={courses}
				onClose={() => setSwitcherOpen(false)}
				onSelectCourse={(nextCourseId) => {
					setSwitcherOpen(false);
					setInputValue("");
					setDebouncedQuery("");
					onSelectCourse?.(nextCourseId);
				}}
			/>
		</section>
	);
}

function VocabCourseLessonsPage() {
	const { courseId } = Route.useParams();
	const search = Route.useSearch();
	const meQuery = useStudentMe();
	const navigate = useNavigate();

	const handleSearchChange = useCallback(
		(query: string) => {
			const trimmed = query.trim();
			if ((search.q ?? "") === trimmed) return;
			void navigate({
				to: "/vocab/courses/$courseId",
				params: { courseId },
				search: trimmed ? { q: trimmed } : {},
				replace: true,
			});
		},
		[courseId, navigate, search.q],
	);

	const handleSelectCourse = useCallback(
		(nextCourseId: string) => {
			void navigate({
				to: "/vocab/courses/$courseId",
				params: { courseId: nextCourseId },
				search: {},
			});
		},
		[navigate],
	);

	if (meQuery.isLoading) {
		return <Loader />;
	}

	const me = meQuery.data;

	return (
		<StudentShell userName={me?.student.name} userEmail={me?.user.email}>
			<VocabCourseLessonsView
				courseId={courseId}
				searchQuery={search.q ?? ""}
				onSearchChange={handleSearchChange}
				onSelectCourse={handleSelectCourse}
			/>
		</StudentShell>
	);
}
