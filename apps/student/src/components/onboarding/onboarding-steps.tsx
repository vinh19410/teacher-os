import {
	DAILY_STUDY_HOUR_OPTIONS,
	type DailyStudyHourOption,
	EXAM_INTERESTS,
	type ExamInterest,
	IELTS_TARGET_BANDS,
	LEARNING_GOAL_OPTIONS,
	type LearningGoalOption,
	type StudentOnboardingPayload,
	TOEIC_TARGET_SCORES,
} from "@teacher-os/api/contracts";
import { Textarea } from "@teacher-os/ui/components/textarea";
import { Check } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/cn";

export const EXAM_LABELS: Record<ExamInterest, string> = {
	ielts: "IELTS",
	toeic: "TOEIC",
};

export const GOAL_LABELS: Record<LearningGoalOption, string> = {
	"study-abroad": "Du học",
	career: "Thăng tiến công việc",
	certification: "Thi chứng chỉ",
	communication: "Giao tiếp tự tin",
	academic: "Học tập & nghiên cứu",
	other: "Khác",
};

export const HOUR_LABELS: Record<DailyStudyHourOption, string> = {
	"under-1": "Dưới 1 giờ",
	"1-2": "1–2 giờ",
	"2-3": "2–3 giờ",
	"3-plus": "Hơn 3 giờ",
};

export interface OptionButtonProps {
	selected: boolean;
	label: string;
	description?: string;
	onClick: () => void;
	className?: string;
}

export function OptionButton({
	selected,
	label,
	description,
	onClick,
	className,
}: OptionButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex w-full items-center justify-between rounded-[var(--radius-lg)] border p-4 text-left transition-all focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
				selected
					? "border-accent-blue/40 bg-accent-soft font-medium text-fg"
					: "border-line bg-bg text-fg hover:border-line-hover",
				className,
			)}
		>
			<div className="space-y-0.5">
				<div className="font-medium text-sm">{label}</div>
				{description ? (
					<div className="text-muted-fg text-xs">{description}</div>
				) : null}
			</div>
			<div
				className={cn(
					"ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
					selected
						? "border-accent-blue bg-accent-blue text-accent-on"
						: "border-line bg-transparent",
				)}
			>
				{selected ? <Check className="h-3 w-3 stroke-[3]" /> : null}
			</div>
		</button>
	);
}

export function ExamInterestStep({
	value,
	onSelect,
}: {
	value: ExamInterest | null;
	onSelect: (v: ExamInterest) => void;
}) {
	return (
		<div className="space-y-4">
			<div>
				<h2 className="font-semibold text-fg text-lg">
					Bạn đang quan tâm chứng chỉ nào?
				</h2>
				<p className="mt-1 text-muted-fg text-xs">
					Chọn bài thi bạn muốn ôn luyện để xây dựng mục tiêu học tập rõ ràng.
				</p>
			</div>
			<div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
				{EXAM_INTERESTS.map((interest) => (
					<OptionButton
						key={interest}
						selected={value === interest}
						label={EXAM_LABELS[interest]}
						description={
							interest === "ielts"
								? "Academic & General Training"
								: "Listening & Reading"
						}
						onClick={() => onSelect(interest)}
					/>
				))}
			</div>
		</div>
	);
}

export function TargetScoreStep({
	examInterest,
	value,
	onSelect,
}: {
	examInterest: ExamInterest;
	value: string | null;
	onSelect: (v: string) => void;
}) {
	const options =
		examInterest === "ielts" ? IELTS_TARGET_BANDS : TOEIC_TARGET_SCORES;

	return (
		<div className="space-y-4">
			<div>
				<h2 className="font-semibold text-fg text-lg">
					Điểm mục tiêu của bạn?
				</h2>
				<p className="mt-1 text-muted-fg text-xs">
					Mục tiêu điểm số bạn muốn đạt được trong kỳ thi{" "}
					{EXAM_LABELS[examInterest]}.
				</p>
			</div>
			<div className="grid grid-cols-2 gap-2.5 pt-2 sm:grid-cols-3">
				{options.map((opt) => {
					const displayLabel = examInterest === "ielts" ? `Band ${opt}` : opt;
					const selected = value === opt;
					return (
						<button
							key={opt}
							type="button"
							onClick={() => onSelect(opt)}
							className={cn(
								"rounded-[var(--radius-lg)] border p-3.5 text-center transition-all focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
								selected
									? "border-accent-blue/40 bg-accent-soft font-semibold text-fg shadow-sm"
									: "border-line bg-bg text-fg hover:border-line-hover",
							)}
						>
							<div className="font-semibold text-base">{displayLabel}</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

export function LearningGoalsStep({
	value,
	onToggle,
	note,
	onNoteChange,
}: {
	value: LearningGoalOption[];
	onToggle: (goal: LearningGoalOption) => void;
	note: string;
	onNoteChange: (v: string) => void;
}) {
	return (
		<div className="space-y-4">
			<div>
				<h2 className="font-semibold text-fg text-lg">
					Mục tiêu học tiếng Anh của bạn là gì?
				</h2>
				<p className="mt-1 text-muted-fg text-xs">
					Bạn có thể chọn nhiều mục tiêu phù hợp với định hướng của mình.
				</p>
			</div>
			<div className="grid grid-cols-1 gap-2.5 pt-2 sm:grid-cols-2">
				{LEARNING_GOAL_OPTIONS.map((goal) => {
					const selected = value.includes(goal);
					return (
						<button
							key={goal}
							type="button"
							onClick={() => onToggle(goal)}
							className={cn(
								"flex items-center justify-between rounded-[var(--radius-lg)] border p-3 text-left transition-all focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
								selected
									? "border-accent-blue/40 bg-accent-soft font-medium text-fg"
									: "border-line bg-bg text-fg hover:border-line-hover",
							)}
						>
							<span className="text-sm">{GOAL_LABELS[goal]}</span>
							<div
								className={cn(
									"flex h-4 w-4 items-center justify-center rounded border transition-colors",
									selected
										? "border-accent-blue bg-accent-blue text-accent-on"
										: "border-line bg-transparent",
								)}
							>
								{selected ? <Check className="h-3 w-3 stroke-[3]" /> : null}
							</div>
						</button>
					);
				})}
			</div>
			<div className="pt-2">
				<label
					htmlFor="learning-goals-note"
					className="mb-1.5 block font-medium text-fg text-xs"
				>
					Ghi chú thêm (tùy chọn)
				</label>
				<Textarea
					id="learning-goals-note"
					value={note}
					onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
						onNoteChange(e.target.value)
					}
					maxLength={200}
					placeholder="Ví dụ: Cần chứng chỉ trước tháng 12 để làm hồ sơ tốt nghiệp..."
					className="min-h-20 border-line bg-bg text-sm focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0"
				/>
				<div className="mt-1 text-right text-[11px] text-muted-fg">
					{note.length}/200
				</div>
			</div>
		</div>
	);
}

export function StudyHoursStep({
	value,
	onSelect,
}: {
	value: DailyStudyHourOption | null;
	onSelect: (v: DailyStudyHourOption) => void;
}) {
	return (
		<div className="space-y-4">
			<div>
				<h2 className="font-semibold text-fg text-lg">
					Mỗi ngày bạn dành bao nhiêu thời gian cho tiếng Anh?
				</h2>
				<p className="mt-1 text-muted-fg text-xs">
					Thời gian tự học và luyện tập trung bình mỗi ngày.
				</p>
			</div>
			<div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
				{DAILY_STUDY_HOUR_OPTIONS.map((hour) => (
					<OptionButton
						key={hour}
						selected={value === hour}
						label={HOUR_LABELS[hour]}
						onClick={() => onSelect(hour)}
					/>
				))}
			</div>
		</div>
	);
}

export function OnboardingSummary({
	answers,
}: {
	answers: StudentOnboardingPayload;
}) {
	const targetDisplay =
		answers.examInterest === "ielts"
			? `Band ${answers.targetScore}`
			: answers.targetScore;
	const goalsDisplay = answers.learningGoals
		.map((g) => GOAL_LABELS[g] ?? g)
		.join(", ");

	return (
		<div className="space-y-4">
			<div>
				<h2 className="font-semibold text-fg text-lg">
					Xác nhận thông tin của bạn
				</h2>
				<p className="mt-1 text-muted-fg text-xs">
					Vui lòng kiểm tra lại các thông tin trước khi hoàn thành thiết lập mục
					tiêu.
				</p>
			</div>
			<div className="divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface/50 text-sm">
				<div className="flex items-center justify-between p-3.5">
					<span className="text-muted-fg">Chứng chỉ quan tâm</span>
					<span className="font-medium text-fg">
						{EXAM_LABELS[answers.examInterest]}
					</span>
				</div>
				<div className="flex items-center justify-between p-3.5">
					<span className="text-muted-fg">Điểm mục tiêu</span>
					<span className="font-medium text-fg">{targetDisplay}</span>
				</div>
				<div className="flex flex-col gap-1 p-3.5">
					<div className="flex items-start justify-between">
						<span className="text-muted-fg">Mục tiêu học</span>
						<span className="max-w-[60%] text-right font-medium text-fg">
							{goalsDisplay}
						</span>
					</div>
					{answers.learningGoalsNote ? (
						<div className="mt-1 rounded border border-line/60 bg-bg/60 p-2 text-muted-fg text-xs italic">
							"{answers.learningGoalsNote}"
						</div>
					) : null}
				</div>
				<div className="flex items-center justify-between p-3.5">
					<span className="text-muted-fg">Thời gian mỗi ngày</span>
					<span className="font-medium text-fg">
						{HOUR_LABELS[answers.dailyStudyHours]}
					</span>
				</div>
			</div>
		</div>
	);
}
