import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import { useStudentMe } from "@/lib/repos/student";
import { useVocabLibraryCourses } from "@/lib/repos/vocab";

export const Route = createFileRoute("/_auth/vocab/courses/")({
	validateSearch: (input: { q?: string }): { q?: string } => ({
		q:
			typeof input.q === "string" && input.q.trim().length > 0
				? input.q.trim()
				: undefined,
	}),
	component: VocabCoursesPage,
});

export interface VocabCoursesCatalogViewProps {
	searchQuery?: string;
	onSearchChange?: (query: string) => void;
	onSelectCourse?: (courseId: string) => void;
}

export function VocabCoursesCatalogView({
	searchQuery = "",
	onSearchChange,
	onSelectCourse,
}: VocabCoursesCatalogViewProps) {
	const [inputValue, setInputValue] = useState<string>(searchQuery);
	const [debouncedQuery, setDebouncedQuery] = useState<string>(searchQuery);

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
	const courses = coursesQuery.data?.courses ?? [];

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

	return (
		<section data-testid="vocab-courses-section" className="space-y-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="space-y-1">
					<Link
						to="/vocab"
						data-testid="vocab-courses-back-to-overview"
						className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em] transition-colors hover:text-primary"
					>
						← Từ vựng
					</Link>
					<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
						Thư viện từ vựng
					</p>
					<h1 className="font-extrabold text-3xl text-foreground leading-[0.95] tracking-[-0.045em]">
						Khóa học từ vựng
					</h1>
				</div>
				<input
					type="search"
					data-testid="vocab-course-search"
					aria-label="Tìm khóa học từ vựng"
					placeholder="Tìm khóa học từ vựng..."
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					className="w-full rounded-md border border-input bg-muted px-3.5 py-2 text-foreground text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:w-72"
				/>
			</div>

			{coursesQuery.isLoading ? (
				<div
					data-testid="vocab-courses-loading"
					className="rounded-md rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm shadow-sm"
				>
					Đang tải danh sách khóa học từ vựng...
				</div>
			) : coursesQuery.isError ? (
				<div
					data-testid="vocab-courses-error"
					className="rounded-md rounded-xl border bg-card p-6 text-center text-danger text-sm shadow-sm"
				>
					Không thể tải danh sách khóa học từ vựng. Vui lòng thử lại.
				</div>
			) : filteredCourses.length === 0 ? (
				<div
					data-testid="vocab-courses-empty"
					className="rounded-md rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm shadow-sm"
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
							onClick={() => onSelectCourse?.(course.id)}
							className="group flex w-full flex-col justify-between gap-4 rounded-md rounded-xl border bg-card p-5 text-left shadow-sm transition-colors duration-150 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
						>
							<div className="space-y-1.5">
								{course.target ? (
									<span
										aria-hidden="true"
										className="inline-block rounded rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-widest"
									>
										{course.target}
									</span>
								) : null}
								<h2 className="font-extrabold text-foreground text-lg group-hover:text-primary">
									{course.name}
								</h2>
								{course.description ? (
									<p className="line-clamp-2 text-muted-foreground text-sm">
										{course.description}
									</p>
								) : null}
							</div>

							<div
								aria-hidden="true"
								className="flex flex-wrap items-center gap-2 font-mono text-xs"
							>
								<span className="rounded-full rounded-md bg-muted px-2.5 py-0.5 text-muted-foreground">
									{course.deckCount} bài
								</span>
								<span className="rounded-full rounded-md bg-muted px-2.5 py-0.5 text-muted-foreground">
									{course.wordCount} từ
								</span>
								{course.reviewWordCount > 0 ? (
									<span
										data-testid={`vocab-course-review-${course.id}`}
										className="rounded-full rounded-md bg-muted px-2.5 py-0.5 text-foreground"
									>
										Đã học {course.reviewWordCount}/{course.wordCount} từ
									</span>
								) : null}
								{course.learnedWordCount > 0 ? (
									<span
										data-testid={`vocab-course-learned-${course.id}`}
										className="rounded-full rounded-md bg-muted px-2.5 py-0.5 text-success"
									>
										{course.learnedWordCount} thành thạo
									</span>
								) : null}
								{course.dueWordCount > 0 ? (
									<span
										data-testid={`vocab-course-due-${course.id}`}
										className="rounded-full bg-primary px-2.5 py-0.5 text-primary-foreground"
									>
										{course.dueWordCount} đến hạn
									</span>
								) : null}
							</div>
						</button>
					))}
				</div>
			)}
		</section>
	);
}

function VocabCoursesPage() {
	const search = Route.useSearch();
	const meQuery = useStudentMe();
	const navigate = useNavigate();

	const handleSearchChange = useCallback(
		(query: string) => {
			const trimmed = query.trim();
			if ((search.q ?? "") === trimmed) return;
			void navigate({
				to: "/vocab/courses",
				search: trimmed ? { q: trimmed } : {},
				replace: true,
			});
		},
		[navigate, search.q],
	);

	const handleSelectCourse = useCallback(
		(courseId: string) => {
			void navigate({
				to: "/vocab/courses/$courseId",
				params: { courseId },
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
			<VocabCoursesCatalogView
				searchQuery={search.q ?? ""}
				onSearchChange={handleSearchChange}
				onSelectCourse={handleSelectCourse}
			/>
		</StudentShell>
	);
}
