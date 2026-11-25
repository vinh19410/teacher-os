import {
	PRACTICE_SKILLS,
	type PracticeSkill,
	type StudentQuizDetail,
} from "@teacher-os/api/contracts";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import { Button } from "@teacher-os/ui/components/button";
import { sanitizeRichText } from "@teacher-os/ui/lib/rich-text-sanitize";
import { Clock, FileText, Headphones, Layers } from "lucide-react";
import { PRACTICE_SKILL_LABELS } from "@/components/practice/practice-skill-labels";
import type { QuizRuntimeExitTarget } from "@/components/quiz/quiz-runtime-header";

function isPracticeSkill(skill: string): skill is PracticeSkill {
	return (PRACTICE_SKILLS as readonly string[]).includes(skill);
}

/** Định dạng thời lượng đề tự luyện: `undefined` → ẩn; `null` → không giới hạn; `> 0` → phút/giây. */
export function formatPracticeTimeLimit(
	seconds: number | null | undefined,
): string | null {
	if (seconds === undefined) return null;
	if (seconds === null) return "Không giới hạn thời gian";
	if (!Number.isFinite(seconds) || seconds <= 0) return null;
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	if (mins > 0 && secs > 0) return `${mins} phút ${secs} giây`;
	if (mins > 0) return `${mins} phút`;
	return `${secs} giây`;
}

/** Đích quay lại danh sách đề tự luyện theo kỹ năng hiện tại. */
export function getPracticeExitTarget(skill: string): QuizRuntimeExitTarget {
	if (isPracticeSkill(skill)) {
		return { to: "/practice/$skill", params: { skill } };
	}
	return { to: "/practice" };
}

/** Kiểm tra mô tả rich-text thực sự có nội dung hiển thị sau khi sanitize (tránh khung rỗng khi chỉ chứa `<script>`/`<p></p>`). */
function hasVisibleRichText(raw: string | null | undefined): raw is string {
	if (!raw) return false;
	const candidate =
		typeof document !== "undefined" ? sanitizeRichText(raw) : raw;
	return !isEmptyRichText(candidate);
}

function buildGeneralInstructions(
	skill: string,
	minWords: number | null,
): string[] {
	const commonStart =
		"Thời gian làm bài và lượt làm chỉ bắt đầu được ghi nhận khi bạn bấm Bắt đầu làm bài.";
	switch (skill) {
		case "reading":
			return [
				commonStart,
				"Đọc kỹ bài đọc và hoàn thành các câu hỏi; bài làm được lưu tự động trong lúc bạn làm.",
				"Sau khi nộp bài, bạn có thể xem điểm và đối chiếu đáp án chi tiết.",
			];
		case "listening":
			return [
				commonStart,
				"Kiểm tra loa hoặc tai nghe trước khi vào bài; trình phát âm thanh sẽ xuất hiện khi bạn vào làm bài.",
				"Câu trả lời được lưu tự động trong lúc làm; sau khi nộp bài bạn sẽ xem được điểm và đáp án chi tiết.",
			];
		case "writing":
			return [
				commonStart,
				minWords !== null
					? `Đọc kỹ yêu cầu đề bài và viết bài trong khung soạn thảo (khuyến nghị tối thiểu ${minWords} từ).`
					: "Đọc kỹ yêu cầu đề bài và viết bài trong khung soạn thảo.",
				"Bài viết được lưu tự động trong lúc làm và sẽ được giáo viên chấm sau khi nộp.",
			];
		case "speaking":
			return [
				commonStart,
				"Chuẩn bị micro hoặc thiết bị ghi âm/quay video trước khi vào bài.",
				"Bạn sẽ tải lên 1 tệp audio/video (tối đa 50 MB) và giáo viên sẽ chấm sau khi nộp.",
			];
		default:
			return [commonStart, "Bài làm được lưu tự động trong khi bạn làm bài."];
	}
}

/**
 * Màn hình giới thiệu đề tự luyện trước khi tạo attempt và tính giờ (#883).
 * Render inline tại `/learn/quizzes/practice/$testId` khi `attempt === null`
 * (không chồng `alertdialog` modal; tuyệt đối không hiển thị `detail.band`).
 */
export function PracticeIntroScreen({
	detail,
	questionCount,
	hasHybridWriting,
	minWords,
	speakingPartLabel,
	starting,
	onStart,
	onBack,
}: {
	detail: StudentQuizDetail;
	questionCount: number;
	hasHybridWriting: boolean;
	minWords: number | null;
	speakingPartLabel: string | null;
	starting: boolean;
	onStart: () => void;
	onBack: () => void;
}) {
	const isWriting = detail.skill === "writing";
	const isSpeaking = detail.skill === "speaking";
	const skillLabel = isPracticeSkill(detail.skill)
		? PRACTICE_SKILL_LABELS[detail.skill]
		: detail.skill;
	const collectionMeta = [detail.collection, detail.testGroup]
		.map((value) => value?.trim())
		.filter((value): value is string => Boolean(value))
		.join(" · ");
	const durationLabel = formatPracticeTimeLimit(detail.timeLimitSeconds);
	const descriptionHtml = hasVisibleRichText(detail.description)
		? detail.description
		: null;
	const instructions = buildGeneralInstructions(detail.skill, minWords);

	const scopeLabel = isSpeaking
		? `Bài nói${speakingPartLabel ? ` · ${speakingPartLabel}` : ""} · nộp 1 file audio/video (tối đa 50 MB)`
		: isWriting
			? `Bài viết${minWords !== null ? ` · tối thiểu ${minWords} từ` : ""}`
			: hasHybridWriting
				? `${questionCount} câu hỏi + Bài viết`
				: `${questionCount} câu hỏi`;

	return (
		<main
			data-testid="practice-intro-screen"
			className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center px-4 py-8"
		>
			<section className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
				<div className="flex flex-wrap items-center gap-2">
					<span className="inline-flex items-center rounded-md border border-border bg-muted px-2.5 py-0.5 font-medium text-foreground text-xs">
						{skillLabel}
					</span>
					{collectionMeta ? (
						<span className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-0.5 text-muted-foreground text-xs">
							{collectionMeta}
						</span>
					) : null}
				</div>

				<h2 className="mt-3 break-words font-semibold text-2xl text-foreground tracking-tight sm:text-3xl">
					{detail.title}
				</h2>

				<dl className="mt-6 grid gap-3 sm:grid-cols-2">
					<div className="rounded-lg border border-border bg-muted/40 p-3.5">
						<dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
							<FileText className="size-3.5 shrink-0" aria-hidden="true" />
							<span>Quy mô bài</span>
						</dt>
						<dd className="mt-1 break-words font-medium text-foreground text-sm tabular-nums">
							{scopeLabel}
						</dd>
					</div>

					{typeof detail.partsCount === "number" ? (
						<div className="rounded-lg border border-border bg-muted/40 p-3.5">
							<dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
								<Layers className="size-3.5 shrink-0" aria-hidden="true" />
								<span>Cấu trúc</span>
							</dt>
							<dd className="mt-1 font-medium text-foreground text-sm tabular-nums">
								{detail.partsCount} phần
							</dd>
						</div>
					) : null}

					{durationLabel !== null ? (
						<div className="rounded-lg border border-border bg-muted/40 p-3.5">
							<dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
								<Clock className="size-3.5 shrink-0" aria-hidden="true" />
								<span>Thời lượng</span>
							</dt>
							<dd className="mt-1 font-medium text-foreground text-sm tabular-nums">
								{durationLabel}
							</dd>
						</div>
					) : null}

					{detail.skill === "listening" && detail.hasAudio ? (
						<div className="rounded-lg border border-border bg-muted/40 p-3.5">
							<dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
								<Headphones className="size-3.5 shrink-0" aria-hidden="true" />
								<span>Âm thanh</span>
							</dt>
							<dd className="mt-1 font-medium text-foreground text-sm">
								Có file nghe
							</dd>
						</div>
					) : null}
				</dl>

				{descriptionHtml !== null ? (
					<div
						data-testid="practice-intro-description"
						className="mt-5 rounded-lg border border-border bg-background p-4"
					>
						<p className="mb-1.5 font-medium text-foreground text-xs">
							Mô tả đề
						</p>
						<RichTextBody
							text={descriptionHtml}
							className="text-muted-foreground text-sm leading-relaxed"
						/>
					</div>
				) : null}

				<div className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
					<h3 className="font-semibold text-foreground text-sm">
						Hướng dẫn chung
					</h3>
					<ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground text-sm leading-relaxed">
						{instructions.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</div>

				<div className="mt-6 flex flex-col-reverse gap-2.5 border-border border-t pt-5 sm:flex-row sm:items-center sm:justify-end">
					<Button
						type="button"
						variant="outline"
						onClick={onBack}
						disabled={starting}
						className="w-full sm:w-auto"
					>
						Quay lại danh sách
					</Button>
					<Button
						type="button"
						variant="default"
						data-testid="practice-start-btn"
						onClick={onStart}
						disabled={starting}
						className="w-full sm:w-auto"
					>
						{starting ? "Đang bắt đầu…" : "Bắt đầu làm bài"}
					</Button>
				</div>
			</section>
		</main>
	);
}
