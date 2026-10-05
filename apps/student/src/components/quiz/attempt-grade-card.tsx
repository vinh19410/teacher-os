import type { QuizAttemptGrade } from "@teacher-os/api/contracts";
import {
	criteriaForSkill,
	criterionLabel,
	formatBand,
	type GradableSkill,
} from "@teacher-os/api/lib/ielts-band";
import { formatVietnamSubmittedAt } from "@/lib/attempt-format";

/**
 * Kết quả chấm Writing/Speaking đọc-chi (#319). Band + nhận xét render qua
 * JSX text node (plain text, không dangerouslySetInnerHTML). Band tổng luôn
 * derive từ scores (ieltsOverallBand) — server đã gửi sẵn, hiển thị lại.
 */
export function AttemptGradeCard({
	grade,
	skill,
	part,
}: {
	grade: QuizAttemptGrade;
	skill: GradableSkill;
	part: string;
}) {
	return (
		<section
			aria-labelledby="grade-heading"
			className="mt-6 rounded-md border border-line bg-bg p-4"
			data-testid="attempt-grade"
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
						className="mt-1 whitespace-pre-wrap text-[15px] leading-[1.7]"
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
