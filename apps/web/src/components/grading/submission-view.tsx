import {
	ASSIGNMENT_IMAGE_SRC_PATTERN,
	type TeacherSubmission,
	WRITING_MIN_WORDS,
} from "@teacher-os/api/contracts";
import { formatMediaSize } from "@teacher-os/api/lib/quiz-media";
import { countWords } from "@teacher-os/api/lib/word-count";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import { EssayWithHighlights } from "@teacher-os/ui/components/quiz/essay-with-highlights";
import { SectionLabel } from "@/components/ui/section-label";
import {
	AnnotatableEssay,
	type AnnotatableEssayProps,
} from "./annotatable-essay";
import { SubmissionMediaPlayer } from "./submission-media-player";

/**
 * Đề bài + bài làm của một lượt nộp Writing/Speaking (#319). Essay và nhận
 * xét là plain text render qua JSX text node — không dùng
 * dangerouslySetInnerHTML, không có bề mặt XSS. Ảnh Task 1 chỉ render khi
 * URL qua pattern allowlist; `referrerPolicy` ngăn URL trang chấm lộ qua
 * Referer tới host ảnh. `annotation` bật công cụ highlight cho bài Writing
 * (#332) — vắng mặt thì essay chỉ hiển thị kèm highlight sẵn có.
 */
export function SubmissionView({
	submission: sub,
	annotation,
}: {
	submission: TeacherSubmission;
	annotation?: Omit<AnnotatableEssayProps, "essay" | "annotations">;
}) {
	const minWords = WRITING_MIN_WORDS[sub.part];
	const imageUrl = sub.prompt.imageUrl.trim();
	return (
		<div className="flex flex-col gap-6">
			{sub.objective && (
				<div
					data-testid="hybrid-objective-score"
					className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-sm"
				>
					<span className="text-muted-foreground">
						Phần trắc nghiệm (chấm tự động)
					</span>
					<strong className="font-semibold text-foreground tabular-nums">
						{sub.objective.correctCount}/{sub.objective.totalCount} câu đúng
					</strong>
				</div>
			)}
			<section aria-label="Đề bài">
				<SectionLabel>Đề bài</SectionLabel>
				<div className="flex flex-col gap-3">
					{sub.skill === "writing" ? (
						<>
							<RichTextBody text={sub.prompt.prompt} />
							{imageUrl !== "" &&
								ASSIGNMENT_IMAGE_SRC_PATTERN.test(imageUrl) && (
									<img
										src={imageUrl}
										alt="Hình minh hoạ đề Task 1"
										referrerPolicy="no-referrer"
										loading="lazy"
										className="max-h-96 rounded-md border border-border"
									/>
								)}
						</>
					) : (
						<>
							{sub.prompt.prompt !== "" && (
								<RichTextBody text={sub.prompt.prompt} />
							)}
							{sub.prompt.cueTopic !== "" && (
								<div className="rounded-lg border border-border bg-muted/50 p-4">
									<p className="font-medium text-foreground text-sm">
										Describe {sub.prompt.cueTopic}
									</p>
									<ul className="mt-2 list-disc pl-5 text-muted-foreground text-sm">
										{sub.prompt.cuePoints
											.split("\n")
											.filter(Boolean)
											.map((point) => (
												<li key={point}>{point}</li>
											))}
									</ul>
								</div>
							)}
						</>
					)}
				</div>
			</section>

			<section aria-label="Bài làm của học viên">
				<SectionLabel>Bài làm của học viên</SectionLabel>
				{sub.skill === "writing" ? (
					sub.essay !== null && sub.essay.trim() !== "" ? (
						<div className="flex flex-col gap-2">
							<p
								className="text-muted-foreground text-sm"
								data-testid="essay-word-count"
							>
								Chọn chữ để chú thích · {countWords(sub.essay)} từ
								{minWords !== undefined ? ` · tối thiểu ${minWords}` : ""}
							</p>
							{annotation ? (
								<AnnotatableEssay
									essay={sub.essay}
									annotations={sub.annotations ?? []}
									{...annotation}
								/>
							) : (
								<EssayWithHighlights
									essay={sub.essay}
									annotations={sub.annotations ?? []}
									data-testid="essay-text"
									className="border-border border-l-2 pl-5 text-foreground text-lg leading-[1.9]"
								/>
							)}
						</div>
					) : (
						<p className="text-muted-foreground text-sm">
							Học viên đã nộp bài trống.
						</p>
					)
				) : sub.media !== null ? (
					<div className="flex flex-col gap-2">
						<p className="text-muted-foreground text-xs">
							{sub.media.name} · {formatMediaSize(sub.media.size)}
						</p>
						<SubmissionMediaPlayer
							key={sub.media.uploadedAt}
							media={sub.media}
							attemptId={sub.attemptId}
						/>
					</div>
				) : (
					<p className="text-muted-foreground text-sm">
						Bài này được nộp khi chưa có file bài nói.
					</p>
				)}
			</section>
		</div>
	);
}
