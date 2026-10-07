import {
	QUIZ_FEEDBACK_MAX,
	type QuizAttemptGrade,
	type QuizGradeInput,
} from "@teacher-os/api/contracts";
import {
	criteriaForSkill,
	criterionLabel,
	formatBand,
	type GradableSkill,
	ieltsOverallBand,
} from "@teacher-os/api/lib/ielts-band";
import { useState } from "react";
import { fmtWhen } from "@/components/assignments/assignment-status";
import { BandSlider } from "@/components/grading/band-slider";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";

/**
 * Form chấm 4 tiêu chí IELTS (#319) bằng BandSlider (#331). Mỗi tiêu chí là
 * `number | null` — `null` nghĩa là chưa chọn, nút Lưu chỉ mở khi đủ 4.
 * Band tổng tự tính từ scores đã chọn (`ieltsOverallBand`) và chỉ hiện khi
 * đủ. `key` theo `gradedAt` ở caller để sau khi lưu form remount với giá
 * trị server mới.
 */
export function GradeForm({
	skill,
	part,
	initial,
	saving,
	error,
	savedAt,
	onSave,
}: {
	skill: GradableSkill;
	part: string;
	initial: QuizAttemptGrade | null;
	saving: boolean;
	error: string | null;
	savedAt: string | null;
	onSave(input: QuizGradeInput): void;
}) {
	const keys = criteriaForSkill(skill);
	const [scores, setScores] = useState<Record<string, number | null>>(() =>
		Object.fromEntries(keys.map((key) => [key, initial?.scores[key] ?? null])),
	);
	const [feedback, setFeedback] = useState(initial?.feedback ?? "");

	const complete = keys.every((key) => scores[key] !== null);
	const values = complete ? keys.map((key) => scores[key] as number) : [];

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (!complete || saving) return;
				onSave({
					scores: Object.fromEntries(
						keys.map((key) => [key, scores[key] as number]),
					),
					feedback,
				});
			}}
		>
			{keys.map((key) => (
				<Field key={key} label={criterionLabel(skill, key, part)}>
					<BandSlider
						id={`grade-${key}`}
						value={scores[key]}
						onChange={(band) => setScores((prev) => ({ ...prev, [key]: band }))}
					/>
				</Field>
			))}

			<p className="text-fg text-sm">
				Band tổng{" "}
				<span
					data-testid="grade-overall-band"
					aria-live="polite"
					className="font-semibold"
				>
					{complete ? formatBand(ieltsOverallBand(values)) : "—"}
				</span>
			</p>

			<Field label="Nhận xét cho học viên">
				<Textarea
					id="grade-feedback"
					maxLength={QUIZ_FEEDBACK_MAX}
					placeholder="Tuỳ chọn…"
					value={feedback}
					onChange={(event) => setFeedback(event.target.value)}
				/>
			</Field>
			<p className="text-meta text-xs">
				{feedback.length}/{QUIZ_FEEDBACK_MAX}
			</p>

			{error !== null && (
				<p role="alert" className="text-danger text-sm">
					{error}
				</p>
			)}
			{savedAt !== null && (
				<p className="text-sm text-success" data-testid="grade-saved">
					Đã lưu · {fmtWhen(savedAt)}
				</p>
			)}

			<Button type="submit" disabled={!complete || saving}>
				{saving ? "Đang lưu…" : "Lưu điểm"}
			</Button>
		</form>
	);
}
