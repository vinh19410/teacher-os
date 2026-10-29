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
import { useEffect, useState } from "react";
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
export const PUBLISH_GRADE_FORBIDDEN_TOOLTIP =
	"Chỉ Giáo viên đứng lớp được chốt trả bài";

export function GradeForm({
	skill,
	part,
	initial,
	saving,
	error,
	savedAt,
	onSave,
	onOverallChange,
	draftMode,
	savingDraft,
	draftError,
	onSaveDraft,
	canPublish = true,
}: {
	skill: GradableSkill;
	part: string;
	initial: QuizAttemptGrade | null;
	saving: boolean;
	error: string | null;
	savedAt: string | null;
	onSave(input: QuizGradeInput): void;
	/** Band tổng sống đẩy lên PageHead của route — form chỉ tính, không
	 * tự render con số lớn (design `Grading`). */
	onOverallChange?(band: string): void;
	/** TOS-30: bài có draft AI → nút chính "Chốt trả bài", thêm nút phụ
	 * "Lưu bản nháp" (cùng scores/feedback hiện tại). */
	draftMode?: boolean;
	savingDraft?: boolean;
	draftError?: string | null;
	onSaveDraft?(input: QuizGradeInput): void;
	/** TOS-33 D1: `canPublishGrade(role)` — `ta` chỉ được Lưu bản nháp,
	 * nút Chốt trả bài bị khóa kèm tooltip. */
	canPublish?: boolean;
}) {
	const keys = criteriaForSkill(skill);
	const [scores, setScores] = useState<Record<string, number | null>>(() =>
		Object.fromEntries(keys.map((key) => [key, initial?.scores[key] ?? null])),
	);
	const [feedback, setFeedback] = useState(initial?.feedback ?? "");

	const complete = keys.every((key) => scores[key] !== null);
	const values = complete ? keys.map((key) => scores[key] as number) : [];
	const overallText = complete ? formatBand(ieltsOverallBand(values)) : "—";

	// Band tổng sống lên PageHead qua callback — route là nơi render con số.
	useEffect(() => {
		onOverallChange?.(overallText);
	}, [onOverallChange, overallText]);

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (!complete || saving || !canPublish) return;
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

			<Field label="Nhận xét cho học viên">
				<Textarea
					id="grade-feedback"
					maxLength={QUIZ_FEEDBACK_MAX}
					placeholder="Tuỳ chọn…"
					value={feedback}
					onChange={(event) => setFeedback(event.target.value)}
				/>
			</Field>
			<p className="text-muted-foreground text-xs">
				{feedback.length}/{QUIZ_FEEDBACK_MAX}
			</p>

			{error !== null && (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			)}
			{draftError != null && (
				<p role="alert" className="text-destructive text-sm">
					{draftError}
				</p>
			)}
			{savedAt !== null && (
				<p className="text-sm text-success" data-testid="grade-saved">
					Đã lưu · {fmtWhen(savedAt)}
				</p>
			)}

			<div className="flex flex-col gap-2">
				{draftMode && (
					<Button
						type="button"
						variant="outline"
						className="w-full"
						disabled={!complete || savingDraft || saving}
						data-testid="save-draft"
						onClick={() => {
							if (!complete || savingDraft || saving) return;
							onSaveDraft?.({
								scores: Object.fromEntries(
									keys.map((key) => [key, scores[key] as number]),
								),
								feedback,
							});
						}}
					>
						{savingDraft ? "Đang lưu bản nháp…" : "Lưu bản nháp"}
					</Button>
				)}
				<Button
					type="submit"
					className="w-full"
					data-testid="publish-grade"
					disabled={!complete || saving || !canPublish}
					title={!canPublish ? PUBLISH_GRADE_FORBIDDEN_TOOLTIP : undefined}
				>
					{saving ? "Đang lưu…" : draftMode ? "Chốt trả bài" : "Lưu điểm"}
				</Button>
				{!canPublish && (
					<p
						data-testid="publish-forbidden-hint"
						className="text-center text-muted-foreground text-xs"
					>
						{PUBLISH_GRADE_FORBIDDEN_TOOLTIP}
					</p>
				)}
			</div>
		</form>
	);
}
