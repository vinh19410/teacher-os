import {
	CURRENT_LEVEL_OPTIONS,
	type CurrentLevelOption,
	DAILY_STUDY_HOUR_OPTIONS,
	type DailyStudyHourOption,
	ENTRY_SCORE_MAX_LENGTH,
	EXAM_INTERESTS,
	type ExamInterest,
	IELTS_TARGET_BANDS,
	LEARNING_GOAL_OPTIONS,
	type LearningGoalOption,
	type StudentOnboardingPayload,
	TOEIC_TARGET_SCORES,
} from "@teacher-os/api/contracts";
import { Input } from "@teacher-os/ui/components/input";
import { Textarea } from "@teacher-os/ui/components/textarea";
import { Check } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/cn";

export const EXAM_LABELS: Record<ExamInterest, string> = {
	ielts: "IELTS",
	toeic: "TOEIC",
};
export const CURRENT_LEVEL_LABELS: Record<
	ExamInterest,
	Record<CurrentLevelOption, { label: string; sub?: string }>
> = {
	ielts: {
		beginner: { label: "Mới bắt đầu", sub: "Mất gốc hoặc chưa học IELTS" },
		basic: { label: "Dưới 4.5", sub: "Trình độ cơ bản" },
		intermediate: { label: "4.5 – 5.5", sub: "Giao tiếp và xử lý đề cơ bản" },
		"upper-intermediate": { label: "6.0 – 6.5", sub: "Đã có nền tảng vững" },
		advanced: { label: "7.0 trở lên", sub: "Thành thạo" },
		unsure: { label: "Chưa rõ", sub: "Chưa từng thi hoặc tự đánh giá" },
	},
	toeic: {
		beginner: { label: "Mới bắt đầu", sub: "Mất gốc hoặc chưa học TOEIC" },
		basic: { label: "Dưới 350", sub: "Trình độ cơ bản" },
		intermediate: { label: "350 – 550", sub: "Nắm được ngữ pháp nền" },
		"upper-intermediate": { label: "550 – 750", sub: "Khả năng nghe đọc tốt" },
		advanced: { label: "750 trở lên", sub: "Thành thạo trong công việc" },
		unsure: { label: "Chưa rõ", sub: "Chưa từng thi hoặc tự đánh giá" },
	},
};

export function getCurrentLevelLabel(
	level: string | null | undefined,
	examInterest?: string | null,
): string {
	if (!level) return "";
	const examKey = (
		examInterest === "toeic" ? "toeic" : "ielts"
	) as ExamInterest;
	const levelKey = level as CurrentLevelOption;
	const item = CURRENT_LEVEL_LABELS[examKey]?.[levelKey];
	return item ? item.label : level;
}

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
			aria-pressed={selected}
			onClick={onClick}
			className={cn(
				"flex w-full items-center justify-between rounded-lg border p-4 text-left transition-[color,background-color,border-color,box-shadow] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none focus-visible:ring-0",
				selected
					? "border-primary bg-muted font-medium text-foreground ring-1 ring-primary"
					: "border-input bg-transparent text-foreground hover:bg-accent",
				className,
			)}
		>
			<div className="space-y-0.5">
				<div className="font-medium text-sm">{label}</div>
				{description ? (
					<div className="text-muted-foreground text-xs">{description}</div>
				) : null}
			</div>
			<div
				aria-hidden="true"
				className={cn(
					"ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
					selected
						? "border-primary bg-primary text-primary-foreground"
						: "border-input bg-transparent",
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
				<h2 className="font-semibold text-foreground text-lg">
					Bạn đang quan tâm chứng chỉ nào?
				</h2>
				<p className="mt-1 text-muted-foreground text-xs">
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
export function CurrentLevelStep({
	examInterest,
	value,
	onSelect,
	entryScore,
	onEntryScoreChange,
}: {
	examInterest: ExamInterest;
	value: CurrentLevelOption | null;
	onSelect: (v: CurrentLevelOption) => void;
	entryScore: string;
	onEntryScoreChange: (v: string) => void;
}) {
	const labels = CURRENT_LEVEL_LABELS[examInterest];

	return (
		<div className="space-y-4">
			<div>
				<h2 className="font-semibold text-foreground text-lg">
					Trình độ hiện tại của bạn?
				</h2>
				<p className="mt-1 text-muted-foreground text-xs">
					Ước lượng trình độ của bạn trước khi bắt đầu luyện thi{" "}
					{EXAM_LABELS[examInterest]}.
				</p>
			</div>
			<div className="grid grid-cols-1 gap-2.5 pt-2 sm:grid-cols-2">
				{CURRENT_LEVEL_OPTIONS.map((opt) => {
					const info = labels[opt];
					const selected = value === opt;
					return (
						<button
							key={opt}
							type="button"
							aria-pressed={selected}
							onClick={() => onSelect(opt)}
							className={cn(
								"min-w-0 rounded-lg border p-3.5 text-left transition-[color,background-color,border-color,box-shadow] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
								selected
									? "border-primary bg-primary font-medium text-primary-foreground"
									: "border-input bg-transparent text-foreground hover:bg-accent",
							)}
						>
							<div className="break-words font-medium text-sm">
								{info.label}
							</div>
							{info.sub ? (
								<div
									className={cn(
										"mt-0.5 break-words text-xs",
										selected
											? "text-primary-foreground/80"
											: "text-muted-foreground",
									)}
								>
									{info.sub}
								</div>
							) : null}
						</button>
					);
				})}
			</div>
			<div className="pt-2">
				<label
					htmlFor="entry-score"
					className="mb-1.5 block font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]"
				>
					Điểm đầu vào (tùy chọn)
				</label>
				<Input
					id="entry-score"
					value={entryScore}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
						onEntryScoreChange(e.target.value)
					}
					maxLength={ENTRY_SCORE_MAX_LENGTH}
					placeholder="VD: 7.0 IELTS, 800 TOEIC, B2"
					autoComplete="off"
				/>
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
				<h2 className="font-semibold text-foreground text-lg">
					Điểm mục tiêu của bạn?
				</h2>
				<p className="mt-1 text-muted-foreground text-xs">
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
							aria-pressed={selected}
							onClick={() => onSelect(opt)}
							className={cn(
								"rounded-lg border p-3.5 text-center transition-[color,background-color,border-color,box-shadow] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
								selected
									? "border-primary bg-primary font-semibold text-primary-foreground"
									: "border-input bg-transparent text-foreground hover:bg-accent",
							)}
						>
							<div className="font-mono font-semibold text-base">
								{displayLabel}
							</div>
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
				<h2 className="font-semibold text-foreground text-lg">
					Mục tiêu học tiếng Anh của bạn là gì?
				</h2>
				<p className="mt-1 text-muted-foreground text-xs">
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
							aria-pressed={selected}
							onClick={() => onToggle(goal)}
							className={cn(
								"flex items-center justify-between rounded-lg border p-3 text-left transition-[color,background-color,border-color,box-shadow] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none focus-visible:ring-0",
								selected
									? "border-primary bg-muted font-medium text-foreground ring-1 ring-primary"
									: "border-input bg-transparent text-foreground hover:bg-accent",
							)}
						>
							<span className="text-sm">{GOAL_LABELS[goal]}</span>
							<div
								aria-hidden="true"
								className={cn(
									"flex h-4 w-4 items-center justify-center rounded border transition-colors",
									selected
										? "border-primary bg-primary text-primary-foreground"
										: "border-input bg-transparent",
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
					className="mb-1.5 block font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]"
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
					className="min-h-20 rounded-md border border-input bg-muted text-sm focus-visible:ring-2 focus-visible:ring-primary/40"
				/>
				<div className="mt-1 text-right font-mono text-[11px] text-muted-foreground">
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
				<h2 className="font-semibold text-foreground text-lg">
					Mỗi ngày bạn dành bao nhiêu thời gian cho tiếng Anh?
				</h2>
				<p className="mt-1 text-muted-foreground text-xs">
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
				<h2 className="font-semibold text-foreground text-lg">
					Xác nhận thông tin của bạn
				</h2>
				<p className="mt-1 text-muted-foreground text-xs">
					Vui lòng kiểm tra lại các thông tin trước khi hoàn thành thiết lập mục
					tiêu.
				</p>
			</div>
			<div className="divide-y divide-line rounded-xl border bg-card text-sm shadow-sm">
				<div className="flex items-center justify-between p-3.5">
					<span className="text-muted-foreground">Chứng chỉ quan tâm</span>
					<span className="font-medium text-foreground">
						{EXAM_LABELS[answers.examInterest]}
					</span>
				</div>
				<div className="flex items-center justify-between p-3.5">
					<span className="text-muted-foreground">Trình độ hiện tại</span>
					<span className="font-medium text-foreground">
						{getCurrentLevelLabel(answers.currentLevel, answers.examInterest)}
					</span>
				</div>
				{answers.entryScore ? (
					<div className="flex items-center justify-between p-3.5">
						<span className="text-muted-foreground">Điểm đầu vào</span>
						<span className="font-medium text-foreground">
							{answers.entryScore}
						</span>
					</div>
				) : null}
				<div className="flex items-center justify-between p-3.5">
					<span className="text-muted-foreground">Điểm mục tiêu</span>
					<span className="font-medium text-foreground">{targetDisplay}</span>
				</div>
				<div className="flex flex-col gap-1 p-3.5">
					<div className="flex items-start justify-between">
						<span className="text-muted-foreground">Mục tiêu học</span>
						<span className="max-w-[60%] text-right font-medium text-foreground">
							{goalsDisplay}
						</span>
					</div>
					{answers.learningGoalsNote ? (
						<div className="mt-1 rounded border border-border/60 bg-background/60 p-2 text-muted-foreground text-xs italic">
							"{answers.learningGoalsNote}"
						</div>
					) : null}
				</div>
				<div className="flex items-center justify-between p-3.5">
					<span className="text-muted-foreground">Thời gian mỗi ngày</span>
					<span className="font-medium text-foreground">
						{HOUR_LABELS[answers.dailyStudyHours]}
					</span>
				</div>
			</div>
		</div>
	);
}
