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
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";

/** 19 mức điểm IELTS 0–9 bước 0.5, value là String(n), nhãn `formatBand`. */
const BAND_OPTIONS = Array.from({ length: 19 }, (_, i) => i / 2);

/**
 * Form chấm 4 tiêu chí IELTS (#319). Band tổng tự tính từ scores đã chọn
 * (`ieltsOverallBand`) và chỉ hiện khi đủ 4 tiêu chí; nút Lưu disable tới
 * khi đủ. `key` theo `gradedAt` ở caller để sau khi lưu form remount với
 * giá trị server mới.
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
	const [scores, setScores] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			keys.map((key) => [key, String(initial?.scores[key] ?? "")]),
		),
	);
	const [feedback, setFeedback] = useState(initial?.feedback ?? "");

	const complete = keys.every((key) => scores[key] !== "");
	const values = keys.map((key) => Number(scores[key]));

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (!complete || saving) return;
				onSave({
					scores: Object.fromEntries(
						keys.map((key) => [key, Number(scores[key])]),
					),
					feedback,
				});
			}}
		>
			{keys.map((key) => (
				<Field key={key} label={criterionLabel(skill, key, part)}>
					<Select
						id={`grade-${key}`}
						value={scores[key]}
						onChange={(event) =>
							setScores((prev) => ({ ...prev, [key]: event.target.value }))
						}
					>
						<option value="">—</option>
						{BAND_OPTIONS.map((band) => (
							<option key={band} value={String(band)}>
								{formatBand(band)}
							</option>
						))}
					</Select>
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
