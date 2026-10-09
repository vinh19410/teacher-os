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
 * `scrollable` (#336) = nhánh Writing chia 2 khung: heading + "Chấm lúc"
 * nằm NGOÀI card để biên trên card thẳng hàng card bài viết (cột trái cùng
 * cấu trúc heading → meta → card). Section giữ max-h + sticky; card bên
 * trong (flex-1 min-h-0) cuộn riêng, overscroll-contain, focusable bằng bàn
 * phím — heading luôn nhìn thấy khi dính sticky. `tabIndex` chỉ bật
 * ≥ 921px (nơi card thực sự cuộn) — dưới breakpoint card không cuộn, tab
 * stop là nhiễu. node env không có window → mặc định desktop để test markup
 * tĩnh; jsdom CÓ matchMedia (luôn matches=false) → rơi nhánh mobile.
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
	/** #336: nhánh Writing chia khung — heading ngoài card + vùng cuộn. */
	scrollable?: boolean;
	className?: string;
}) {
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

	// Nhãn "Band tổng" mono uppercase + số band extrabold cam (design Results:
	// "BAND" mono, số display 8xl — hạ còn 7xl/5xl cho vừa card học viên).
	const bandBlock = (bandSizeClass: string) => (
		<p className="mt-2">
			<span className="font-mono text-[11px] text-meta uppercase tracking-[0.2em]">
				Band tổng
			</span>
			<span
				className={cn(
					"mt-1 block font-display font-extrabold text-hot leading-none tracking-[-0.03em]",
					bandSizeClass,
				)}
				data-testid="grade-band"
			>
				{formatBand(grade.band)}
			</span>
		</p>
	);
	// Tiêu chí dạng hàng `border-t` theo design `Results` — nhãn trái, điểm mono phải.
	const criteriaBlock = (
		<dl className="mt-3">
			{criteriaForSkill(skill).map((key) =>
				grade.scores[key] !== undefined ? (
					<div
						key={key}
						className="flex items-baseline justify-between gap-4 border-line border-t py-2 text-sm"
					>
						<dt className="text-meta">{criterionLabel(skill, key, part)}</dt>
						<dd className="font-medium font-mono text-fg">
							{formatBand(grade.scores[key])}
						</dd>
					</div>
				) : null,
			)}
		</dl>
	);
	const feedbackBlock =
		grade.feedback.trim() !== "" ? (
			<>
				<h3 className="mt-4 font-medium text-fg text-sm">Nhận xét</h3>
				<p
					className="mt-1 whitespace-pre-wrap break-words text-[15px] italic leading-[1.7]"
					data-testid="grade-feedback"
				>
					{grade.feedback}
				</p>
			</>
		) : null;

	if (scrollable) {
		return (
			<section
				aria-labelledby="grade-heading"
				className={cn(
					"app:flex app:max-h-[calc(100svh-6rem)] app:flex-col",
					className,
				)}
				data-testid="attempt-grade"
			>
				<h2
					id="grade-heading"
					className="mt-6 mb-1 app:shrink-0 font-display font-extrabold text-fg tracking-[-0.02em]"
				>
					Kết quả chấm của giáo viên
				</h2>
				<p className="app:shrink-0 font-mono text-meta text-xs">
					Chấm lúc {formatVietnamSubmittedAt(grade.gradedAt)}
				</p>
				<div
					className="neu mt-2 app:min-h-0 app:flex-1 app:overflow-y-auto app:overscroll-contain rounded-lg p-5 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
					data-testid="attempt-grade-body"
					tabIndex={isWide ? 0 : undefined}
				>
					{bandBlock("text-7xl")}
					{criteriaBlock}
					{feedbackBlock}
				</div>
			</section>
		);
	}

	return (
		<section
			aria-labelledby="grade-heading"
			className={cn("neu mt-6 rounded-lg p-5", className)}
			data-testid="attempt-grade"
		>
			<h2
				id="grade-heading"
				className="font-display font-extrabold text-fg tracking-[-0.02em]"
			>
				Kết quả chấm của giáo viên
			</h2>
			{bandBlock("text-5xl")}
			{criteriaBlock}
			{feedbackBlock}
			<p className="mt-3 font-mono text-meta text-xs">
				Chấm lúc {formatVietnamSubmittedAt(grade.gradedAt)}
			</p>
		</section>
	);
}
