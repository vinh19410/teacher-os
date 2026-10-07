import type { QuizAttemptGrade } from "@teacher-os/api/contracts";
import {
	criteriaForSkill,
	criterionLabel,
	formatBand,
	type GradableSkill,
} from "@teacher-os/api/lib/ielts-band";
import { useEffect, useState } from "react";
import { formatVietnamSubmittedAt } from "@/lib/attempt-format";
import { cn } from "@/lib/cn";

const APP_MEDIA_QUERY = "(min-width: 921px)";

/**
 * Kết quả chấm Writing/Speaking đọc-chi (#319). Band + nhận xét render qua
 * JSX text node (plain text, không dangerouslySetInnerHTML). Band tổng luôn
 * derive từ scores (ieltsOverallBand) — server đã gửi sẵn, hiển thị lại.
 *
 * `scrollable` (#336) gói trọn hành vi vùng cuộn cho nhánh Writing chia 2
 * khung: max-h + overflow + overscroll-contain, focusable bằng bàn phím.
 * `tabIndex` chỉ bật ≥ 921px (nơi card thực sự cuộn) — dưới breakpoint card
 * không cuộn, tab stop là nhiễu. node env không có window → mặc định
 * desktop để test markup tĩnh; jsdom CÓ matchMedia (luôn matches=false) →
 * rơi nhánh mobile.
 */
export function AttemptGradeCard({
	grade,
	skill,
	part,
	scrollable = false,
	className,
}: {
	grade: QuizAttemptGrade;
	skill: GradableSkill;
	part: string;
	/** #336: nhánh Writing chia khung bật vùng cuộn + keyboard access. */
	scrollable?: boolean;
	className?: string;
}) {
	// node env không có window → mặc định desktop để test markup tĩnh; jsdom
	// CÓ matchMedia (luôn matches=false) → rơi nhánh mobile.
	const [isWide, setIsWide] = useState(
		() =>
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function" ||
			window.matchMedia(APP_MEDIA_QUERY).matches,
	);

	useEffect(() => {
		// Không cuộn thì không cần nghe resize (nhánh Speaking).
		if (!scrollable || typeof window.matchMedia !== "function") return;
		const mq = window.matchMedia(APP_MEDIA_QUERY);
		const onChange = (e: MediaQueryListEvent) => setIsWide(e.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [scrollable]);

	return (
		<section
			aria-labelledby="grade-heading"
			className={cn(
				"mt-6 rounded-md border border-line bg-bg p-4",
				scrollable &&
					"app:max-h-[calc(100svh-6rem)] app:overflow-y-auto app:overscroll-contain focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
				className,
			)}
			data-testid="attempt-grade"
			tabIndex={scrollable && isWide ? 0 : undefined}
		>
			<h2 id="grade-heading" className="font-display font-semibold text-fg">
				Kết quả chấm của giáo viên
			</h2>
			<p className="mt-2">
				<span
					className="font-display font-semibold text-3xl text-fg"
					data-testid="grade-band"
				>
					{formatBand(grade.band)}
				</span>{" "}
				<span className="text-muted-fg text-sm">Band tổng</span>
			</p>
			<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
				{criteriaForSkill(skill).map((key) =>
					grade.scores[key] !== undefined ? (
						<div key={key} className="contents">
							<dt className="text-muted-fg">
								{criterionLabel(skill, key, part)}
							</dt>
							<dd className="font-medium text-fg">
								{formatBand(grade.scores[key])}
							</dd>
						</div>
					) : null,
				)}
			</dl>
			{grade.feedback.trim() !== "" && (
				<>
					<h3 className="mt-4 font-medium text-fg text-sm">Nhận xét</h3>
					<p
						className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-[1.7]"
						data-testid="grade-feedback"
					>
						{grade.feedback}
					</p>
				</>
			)}
			<p className="mt-3 text-muted-fg text-xs">
				Chấm lúc {formatVietnamSubmittedAt(grade.gradedAt)}
			</p>
		</section>
	);
}
