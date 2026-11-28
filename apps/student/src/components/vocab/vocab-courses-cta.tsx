import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { Library } from "lucide-react";
import { cn } from "@/lib/cn";

export interface VocabLibrarySummary {
	courseCount: number;
	lessonCount: number;
}

export function deriveVocabLibrarySummary(
	courses: readonly { deckCount: number }[] | null | undefined,
): VocabLibrarySummary | null {
	if (!courses || courses.length === 0) {
		return null;
	}
	const lessonCount = courses.reduce((sum, c) => sum + c.deckCount, 0);
	if (lessonCount <= 0) {
		return null;
	}
	return {
		courseCount: courses.length,
		lessonCount,
	};
}

/**
 * Card CTA thuần dẫn từ `/practice/vocabulary` dashboard sang catalog `/practice/vocabulary/courses`.
 * Tự ẩn khi thư viện rỗng/lỗi/đang tải (`summary === null`) để không quảng cáo nội dung không có (#573).
 */
export function VocabCoursesCta({
	summary,
}: {
	summary: VocabLibrarySummary | null;
}) {
	if (!summary) {
		return null;
	}

	return (
		<section aria-label="Thư viện từ vựng">
			<Link
				to="/practice/vocabulary/courses"
				data-testid="vocab-courses-cta"
				className="group flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted p-6 transition-colors duration-150 hover:bg-muted/80 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
			>
				<div className="flex min-w-0 items-center gap-4">
					<span
						aria-hidden="true"
						className="grid size-12 shrink-0 place-items-center rounded-lg bg-background text-foreground shadow-xs"
					>
						<Library className="size-6" />
					</span>
					<div className="min-w-0">
						<p className="font-semibold text-foreground group-hover:text-primary">
							Thư viện từ vựng
						</p>
						<p className="text-muted-foreground text-sm tabular-nums">
							{`Thư viện từ vựng · ${summary.courseCount} khóa · ${summary.lessonCount} bài · tự học theo chủ đề`}
						</p>
					</div>
				</div>
				<span
					aria-hidden="true"
					className={cn(
						buttonVariants({ variant: "outline" }),
						"shrink-0 border-input",
					)}
				>
					Khám phá thư viện
				</span>
			</Link>
		</section>
	);
}
