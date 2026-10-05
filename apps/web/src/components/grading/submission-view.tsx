import {
	ASSIGNMENT_IMAGE_SRC_PATTERN,
	type TeacherSubmission,
	WRITING_MIN_WORDS,
} from "@teacher-os/api/contracts";
import { formatMediaSize } from "@teacher-os/api/lib/quiz-media";
import { countWords } from "@teacher-os/api/lib/word-count";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import { SectionLabel } from "@/components/ui/section-label";
import { SubmissionMediaPlayer } from "./submission-media-player";

/**
 * Đề bài + bài làm của một lượt nộp Writing/Speaking (#319). Essay và nhận
 * xét là plain text render qua JSX text node — không dùng
 * dangerouslySetInnerHTML, không có bề mặt XSS. Ảnh Task 1 chỉ render khi
 * URL qua pattern allowlist; `referrerPolicy` ngăn URL trang chấm lộ qua
 * Referer tới host ảnh.
 */
export function SubmissionView({
	submission: sub,
}: {
	submission: TeacherSubmission;
}) {
	const minWords = WRITING_MIN_WORDS[sub.part];
	const imageUrl = sub.prompt.imageUrl.trim();
	return (
		<div className="flex flex-col gap-6">
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
										className="max-h-96 rounded-md border border-line"
									/>
								)}
						</>
					) : (
						<>
							{sub.prompt.prompt !== "" && (
								<RichTextBody text={sub.prompt.prompt} />
							)}
							{sub.prompt.cueTopic !== "" && (
								<div className="rounded-md border border-line bg-card p-4">
									<p className="font-medium text-fg text-sm">
										Describe {sub.prompt.cueTopic}
									</p>
									<ul className="mt-2 list-disc pl-5 text-muted-fg text-sm">
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
								className="font-mono text-meta text-xs"
								data-testid="essay-word-count"
							>
								{countWords(sub.essay)} từ
								{minWords !== undefined ? ` · tối thiểu ${minWords}` : ""}
							</p>
							<div
								data-testid="essay-text"
								className="whitespace-pre-wrap rounded-md border border-line bg-card p-4 text-fg text-sm leading-relaxed"
							>
								{sub.essay}
							</div>
						</div>
					) : (
						<p className="text-muted-fg text-sm">Học viên đã nộp bài trống.</p>
					)
				) : sub.media !== null ? (
					<div className="flex flex-col gap-2">
						<p className="font-mono text-meta text-xs">
							{sub.media.name} · {formatMediaSize(sub.media.size)}
						</p>
						<SubmissionMediaPlayer
							key={sub.media.uploadedAt}
							media={sub.media}
							attemptId={sub.attemptId}
						/>
					</div>
				) : (
					<p className="text-muted-fg text-sm">
						Bài này được nộp khi chưa có file bài nói.
					</p>
				)}
			</section>
		</div>
	);
}
