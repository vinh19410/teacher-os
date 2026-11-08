import {
	CURRENT_LEVEL_OPTIONS,
	type CurrentLevelOption,
	DAILY_STUDY_HOUR_OPTIONS,
	type DailyStudyHourOption,
	EXAM_INTERESTS,
	type ExamInterest,
	IELTS_TARGET_BANDS,
	type LearningGoalOption,
	type StudentOnboardingPayload,
	TOEIC_TARGET_SCORES,
} from "@teacher-os/api/contracts";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	CurrentLevelStep,
	ExamInterestStep,
	LearningGoalsStep,
	OnboardingSummary,
	StudyHoursStep,
	TargetScoreStep,
} from "@/components/onboarding/onboarding-steps";
import { cn } from "@/lib/cn";
import { useSubmitOnboarding } from "@/lib/repos/student";

export interface OnboardingWizardProps {
	onCompleted: () => void;
	/** Điểm đầu vào đã có (giáo viên nhập trước) — điền sẵn để học viên thấy và sửa có chủ đích. */
	initialEntryScore?: string | null;
}

export function OnboardingWizard({
	onCompleted,
	initialEntryScore,
}: OnboardingWizardProps) {
	const [step, setStep] = useState(0);
	const [answers, setAnswers] = useState<{
		examInterest: ExamInterest | null;
		currentLevel: CurrentLevelOption | null;
		targetScore: string | null;
		entryScore: string;
		learningGoals: LearningGoalOption[];
		learningGoalsNote: string;
		dailyStudyHours: DailyStudyHourOption | null;
	}>({
		examInterest: null,
		currentLevel: null,
		targetScore: null,
		entryScore: initialEntryScore ?? "",
		learningGoals: [],
		learningGoalsNote: "",
		dailyStudyHours: null,
	});
	const submitMutation = useSubmitOnboarding();

	const isExamStepValid =
		answers.examInterest !== null &&
		EXAM_INTERESTS.includes(answers.examInterest);

	const isLevelStepValid =
		answers.currentLevel !== null &&
		CURRENT_LEVEL_OPTIONS.includes(answers.currentLevel);

	const isTargetStepValid =
		answers.targetScore !== null &&
		answers.examInterest !== null &&
		(answers.examInterest === "ielts"
			? (IELTS_TARGET_BANDS as readonly string[]).includes(answers.targetScore)
			: (TOEIC_TARGET_SCORES as readonly string[]).includes(
					answers.targetScore,
				));

	const isGoalsStepValid =
		answers.learningGoals.length >= 1 &&
		answers.learningGoalsNote.length <= 200;

	const isHoursStepValid =
		answers.dailyStudyHours !== null &&
		DAILY_STUDY_HOUR_OPTIONS.includes(answers.dailyStudyHours);

	const isCurrentStepValid = (() => {
		switch (step) {
			case 0:
				return isExamStepValid;
			case 1:
				return isLevelStepValid;
			case 2:
				return isTargetStepValid;
			case 3:
				return isGoalsStepValid;
			case 4:
				return isHoursStepValid;
			default:
				return true;
		}
	})();

	const handleSubmit = async () => {
		if (
			!answers.examInterest ||
			!answers.currentLevel ||
			!answers.targetScore ||
			answers.learningGoals.length === 0 ||
			!answers.dailyStudyHours
		) {
			toast.error("Vui lòng điền đầy đủ các thông tin bắt buộc.");
			return;
		}

		const payload: StudentOnboardingPayload = {
			examInterest: answers.examInterest,
			currentLevel: answers.currentLevel,
			targetScore: answers.targetScore,
			learningGoals: answers.learningGoals,
			learningGoalsNote: answers.learningGoalsNote.trim() || undefined,
			dailyStudyHours: answers.dailyStudyHours,
			entryScore: answers.entryScore.trim() || undefined,
		};

		try {
			await submitMutation.mutateAsync(payload);
			toast.success("Thiết lập mục tiêu thành công!");
			onCompleted();
		} catch {
			toast.error("Không thể lưu thông tin. Vui lòng thử lại.");
		}
	};

	return (
		<div className="mx-auto w-full max-w-[560px] space-y-6 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
			{/* Progress Indicator */}
			<div className="space-y-2">
				<div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
					<span>Thiết lập mục tiêu học tập</span>
					<span>Bước {Math.min(step + 1, 5)}/5</span>
				</div>
				<div className="flex gap-1.5">
					{[0, 1, 2, 3, 4].map((idx) => (
						<div
							key={idx}
							className={cn(
								"h-1.5 flex-1 rounded-full transition-colors",
								step >= idx ? "bg-primary" : "bg-muted",
							)}
						/>
					))}
				</div>
			</div>

			{/* Step Body */}
			<div className="py-1">
				{step === 0 && (
					<ExamInterestStep
						value={answers.examInterest}
						onSelect={(v) =>
							setAnswers((prev) => ({
								...prev,
								examInterest: v,
								// Reset target score and level if exam changed
								targetScore: prev.examInterest === v ? prev.targetScore : null,
								currentLevel:
									prev.examInterest === v ? prev.currentLevel : null,
							}))
						}
					/>
				)}
				{step === 1 && answers.examInterest && (
					<CurrentLevelStep
						examInterest={answers.examInterest}
						value={answers.currentLevel}
						onSelect={(v) =>
							setAnswers((prev) => ({
								...prev,
								currentLevel: v,
							}))
						}
						entryScore={answers.entryScore}
						onEntryScoreChange={(entryScore) =>
							setAnswers((prev) => ({ ...prev, entryScore }))
						}
					/>
				)}

				{step === 2 && answers.examInterest && (
					<TargetScoreStep
						examInterest={answers.examInterest}
						value={answers.targetScore}
						onSelect={(v) =>
							setAnswers((prev) => ({
								...prev,
								targetScore: v,
							}))
						}
					/>
				)}

				{step === 3 && (
					<LearningGoalsStep
						value={answers.learningGoals}
						onToggle={(g) =>
							setAnswers((prev) => ({
								...prev,
								learningGoals: prev.learningGoals.includes(g)
									? prev.learningGoals.filter((item) => item !== g)
									: [...prev.learningGoals, g],
							}))
						}
						note={answers.learningGoalsNote}
						onNoteChange={(note) =>
							setAnswers((prev) => ({
								...prev,
								learningGoalsNote: note,
							}))
						}
					/>
				)}

				{step === 4 && (
					<StudyHoursStep
						value={answers.dailyStudyHours}
						onSelect={(v) =>
							setAnswers((prev) => ({
								...prev,
								dailyStudyHours: v,
							}))
						}
					/>
				)}

				{step === 5 &&
					answers.examInterest &&
					answers.currentLevel &&
					answers.targetScore && (
						<OnboardingSummary
							answers={{
								examInterest: answers.examInterest,
								currentLevel: answers.currentLevel,
								targetScore: answers.targetScore,
								learningGoals: answers.learningGoals,
								learningGoalsNote:
									answers.learningGoalsNote.trim() || undefined,
								dailyStudyHours: answers.dailyStudyHours ?? "1-2",
								entryScore: answers.entryScore.trim() || undefined,
							}}
						/>
					)}
			</div>

			{/* Action Footer */}
			<div className="flex items-center justify-between border-border border-t pt-4">
				{step > 0 ? (
					<button
						type="button"
						onClick={() => setStep((s) => s - 1)}
						className="inline-flex items-center gap-1.5 rounded-md border border-input bg-transparent px-3.5 py-2 font-medium text-foreground text-sm transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
					>
						<ArrowLeft className="h-4 w-4" />
						<span>Quay lại</span>
					</button>
				) : (
					<div />
				)}

				{step < 5 ? (
					<button
						type="button"
						disabled={!isCurrentStepValid}
						aria-disabled={!isCurrentStepValid}
						onClick={() => setStep((s) => s + 1)}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-medium text-sm transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
							isCurrentStepValid
								? "cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
								: "cursor-not-allowed rounded-md bg-muted text-muted-foreground",
						)}
					>
						<span>Tiếp tục</span>
						<ArrowRight className="h-4 w-4" />
					</button>
				) : (
					<button
						type="button"
						disabled={submitMutation.isPending}
						onClick={handleSubmit}
						className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					>
						{submitMutation.isPending ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								<span>Đang lưu…</span>
							</>
						) : (
							<span>Hoàn thành</span>
						)}
					</button>
				)}
			</div>
		</div>
	);
}
