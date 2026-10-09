import {
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
}

export function OnboardingWizard({ onCompleted }: OnboardingWizardProps) {
	const [step, setStep] = useState(0);
	const [answers, setAnswers] = useState<{
		examInterest: ExamInterest | null;
		targetScore: string | null;
		learningGoals: LearningGoalOption[];
		learningGoalsNote: string;
		dailyStudyHours: DailyStudyHourOption | null;
	}>({
		examInterest: null,
		targetScore: null,
		learningGoals: [],
		learningGoalsNote: "",
		dailyStudyHours: null,
	});

	const submitMutation = useSubmitOnboarding();

	const isStep0Valid =
		answers.examInterest !== null &&
		EXAM_INTERESTS.includes(answers.examInterest);

	const isStep1Valid =
		answers.targetScore !== null &&
		answers.examInterest !== null &&
		(answers.examInterest === "ielts"
			? (IELTS_TARGET_BANDS as readonly string[]).includes(answers.targetScore)
			: (TOEIC_TARGET_SCORES as readonly string[]).includes(
					answers.targetScore,
				));

	const isStep2Valid =
		answers.learningGoals.length >= 1 &&
		answers.learningGoalsNote.length <= 200;

	const isStep3Valid =
		answers.dailyStudyHours !== null &&
		DAILY_STUDY_HOUR_OPTIONS.includes(answers.dailyStudyHours);

	const isCurrentStepValid = (() => {
		switch (step) {
			case 0:
				return isStep0Valid;
			case 1:
				return isStep1Valid;
			case 2:
				return isStep2Valid;
			case 3:
				return isStep3Valid;
			default:
				return true;
		}
	})();

	const handleSubmit = async () => {
		if (
			!answers.examInterest ||
			!answers.targetScore ||
			answers.learningGoals.length === 0 ||
			!answers.dailyStudyHours
		) {
			toast.error("Vui lòng điền đầy đủ các thông tin bắt buộc.");
			return;
		}

		const payload: StudentOnboardingPayload = {
			examInterest: answers.examInterest,
			targetScore: answers.targetScore,
			learningGoals: answers.learningGoals,
			learningGoalsNote: answers.learningGoalsNote.trim() || undefined,
			dailyStudyHours: answers.dailyStudyHours,
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
		<div className="neu mx-auto w-full max-w-[560px] space-y-6 rounded-lg p-6 sm:p-8">
			{/* Progress Indicator */}
			<div className="space-y-2">
				<div className="flex items-center justify-between font-mono text-[11px] text-meta uppercase tracking-[0.18em]">
					<span>Thiết lập mục tiêu học tập</span>
					<span>Bước {Math.min(step + 1, 4)}/4</span>
				</div>
				<div className="flex gap-1.5">
					{[0, 1, 2, 3].map((idx) => (
						<div
							key={idx}
							className={cn(
								"h-1.5 flex-1 rounded-full transition-colors",
								step >= idx ? "bg-hot" : "bg-surface",
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
								// Reset target score if exam changed
								targetScore: prev.examInterest === v ? prev.targetScore : null,
							}))
						}
					/>
				)}

				{step === 1 && answers.examInterest && (
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

				{step === 2 && (
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

				{step === 3 && (
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

				{step === 4 && answers.examInterest && answers.targetScore && (
					<OnboardingSummary
						answers={{
							examInterest: answers.examInterest,
							targetScore: answers.targetScore,
							learningGoals: answers.learningGoals,
							learningGoalsNote: answers.learningGoalsNote.trim() || undefined,
							dailyStudyHours: answers.dailyStudyHours ?? "1-2",
						}}
					/>
				)}
			</div>

			{/* Action Footer */}
			<div className="flex items-center justify-between border-line border-t pt-4">
				{step > 0 ? (
					<button
						type="button"
						onClick={() => setStep((s) => s - 1)}
						className="neu-sm inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-medium text-fg text-sm transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
					>
						<ArrowLeft className="h-4 w-4" />
						<span>Quay lại</span>
					</button>
				) : (
					<div />
				)}

				{step < 4 ? (
					<button
						type="button"
						disabled={!isCurrentStepValid}
						aria-disabled={!isCurrentStepValid}
						onClick={() => setStep((s) => s + 1)}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-medium text-sm transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
							isCurrentStepValid
								? "cursor-pointer bg-fg text-bg hover:bg-hot hover:text-accent-on"
								: "neu-in cursor-not-allowed text-muted-fg opacity-50",
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
						className="inline-flex items-center gap-2 rounded-lg bg-fg px-5 py-2 font-medium text-bg text-sm transition-colors hover:bg-hot hover:text-accent-on focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
