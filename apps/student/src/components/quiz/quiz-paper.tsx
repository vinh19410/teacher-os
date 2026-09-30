import {
	ASSIGNMENT_IMAGE_SRC_PATTERN,
	type AssignmentQuestion,
	answerKindByType,
	isImageBasedType,
	isOptionBankable,
	quizTypeDisplay,
	type StudentQuizDetail,
} from "@teacher-os/api/contracts";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { OptionBankList } from "@teacher-os/ui/components/assignments/option-bank-list";
import { PinOverlay } from "@teacher-os/ui/components/assignments/pin-overlay";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import {
	type QuizChoiceRow,
	QuizQuestionItem,
	questionChoiceRows,
} from "@/components/quiz/quiz-question-item";
import type { QuizReviewInfo } from "@/components/quiz/quiz-review-item";
import type { QuizPart, QuizPartQuestion } from "@/lib/quiz-parts";

/** Các field đề cần để render paper (subset của StudentQuizDetail). */
export type QuizPaperDetail = Pick<
	StudentQuizDetail,
	| "skill"
	| "type"
	| "band"
	| "intro"
	| "prompt"
	| "passage"
	| "transcript"
	| "cueTopic"
	| "cuePoints"
	| "audioName"
	| "imageUrl"
	| "optionBank"
>;

const SKILL_LABELS: Record<string, string> = {
	reading: "Reading",
	listening: "Listening",
	writing: "Writing",
	speaking: "Speaking",
};

export function QuizPaper({
	detail,
	parts,
	answers,
	onAnswer,
	currentQuestion,
	mode = "take",
	review,
	hidePassage = false,
}: {
	detail: QuizPaperDetail;
	parts: QuizPart[];
	/** Answers học viên keyed theo `q` (0-based); width cloze theo GIÁ TRỊ này. */
	answers: Record<number, string>;
	onAnswer: (q: number, value: string) => void;
	/** Câu đang được highlight từ navigator (null = không câu nào). */
	currentQuestion: number | null;
	/** review = chấm xong: input disabled, giá trị = đáp án học viên. */
	mode?: "take" | "review";
	/** Dữ liệu review theo `q` (chip verdict + đáp án + giải thích). */
	review?: Record<number, QuizReviewInfo>;
	/** Split-pane reading: passage đã render ở pane trái — paper không lặp. */
	hidePassage?: boolean;
}) {
	const reviewMode = mode === "review";
	const skill = detail.skill;
	const typeId = detail.type;
	const isAuto = skill === "reading" || skill === "listening";
	const bankKind = answerKindByType[typeId];
	const rawImageUrl = detail.imageUrl.trim();
	const diagramImageUrl =
		isImageBasedType(skill, typeId) &&
		ASSIGNMENT_IMAGE_SRC_PATTERN.test(rawImageUrl)
			? rawImageUrl
			: "";
	const questions: QuizPartQuestion[] = parts.flatMap((part) => part.questions);
	const hasPins = questions.some((question) => question.pin != null);
	// PinOverlay chỉ khả dụng khi ảnh đề hợp lệ — thiếu ảnh thì câu pin fallback
	// về hàng cloze/choice thường để VẪN trả lời được (code-review F4).
	const usePinOverlay = hasPins && diagramImageUrl !== "";
	const choiceRowsByQ = new Map<number, QuizChoiceRow[]>();
	for (const question of questions) {
		// Câu có pin trả lời qua input trên ảnh (PinOverlay) — không nhân đôi
		// widget bằng radio pills dưới list. Widget key theo type HIỆU DỤNG của
		// câu (đề trộn dạng), fallback type đề.
		choiceRowsByQ.set(
			question.q,
			usePinOverlay && question.pin != null
				? []
				: questionChoiceRows(
						question,
						question.type ?? typeId,
						detail.optionBank,
					),
		);
	}
	// PinOverlay đòi AssignmentQuestion (answer/alts required ở authoring side)
	// nhưng chỉ ĐỌC `pin` + key answers theo OFFSET trong mảng — nên phải truyền
	// ĐỦ questions (không lọc pin), qStart=1: offset == q == key answers map.
	const pinOverlay = usePinOverlay ? (
		<PinOverlay
			imageUrl={diagramImageUrl}
			items={questions as unknown as AssignmentQuestion[]}
			qStart={1}
			answers={answers}
			onAnswer={reviewMode ? () => undefined : onAnswer}
			imageAlt="Ảnh đề bài"
		/>
	) : null;

	return (
		<article className="flex flex-col gap-4">
			<p className="font-mono text-[11px] text-muted-fg uppercase tracking-[0.08em]">
				{SKILL_LABELS[skill] ?? skill} · Band {detail.band}
			</p>

			{skill === "listening" && (
				<p className="rounded-md border border-line bg-surface p-3 text-sm">
					🔊 {detail.audioName.trim() || "Chưa đính file nghe"}
				</p>
			)}

			{skill === "reading" &&
				!hidePassage &&
				!isEmptyRichText(detail.passage) && (
					<RichTextBody
						text={detail.passage}
						className="text-sm leading-[1.55]"
					/>
				)}

			{usePinOverlay ? (
				// Review: fieldset disabled khoá toàn bộ input pin; onAnswer vẫn
				// truyền để PinOverlay giữ controlled value (đáp án học viên).
				reviewMode ? (
					<fieldset disabled className="m-0 border-0 p-0">
						{pinOverlay}
					</fieldset>
				) : (
					pinOverlay
				)
			) : diagramImageUrl ? (
				<img
					src={diagramImageUrl}
					alt="Ảnh đề bài"
					className="max-h-72 rounded-md border border-line"
					referrerPolicy="no-referrer"
					loading="lazy"
				/>
			) : null}

			{isAuto && !isEmptyRichText(detail.intro) && (
				<RichTextBody text={detail.intro} className="text-muted-fg text-sm" />
			)}

			{isOptionBankable(skill, typeId) && bankKind && (
				<OptionBankList bank={detail.optionBank} kind={bankKind} />
			)}

			{skill === "speaking" && (
				<div className="text-sm">
					<p>Describe {detail.cueTopic.trim() || "the topic"}.</p>
					<p className="mt-2 font-medium">You should say:</p>
					<ul className="ml-5 list-disc text-muted-fg">
						{detail.cuePoints
							.split("\n")
							.filter(Boolean)
							.map((point) => (
								<li key={point}>{point}</li>
							))}
					</ul>
				</div>
			)}

			{!isAuto && skill !== "speaking" && !isEmptyRichText(detail.prompt) && (
				<RichTextBody text={detail.prompt} className="text-sm leading-[1.55]" />
			)}

			<div className="flex flex-col gap-4">
				{parts.map((part) => {
					// Header cụm: đúng cấu trúc đề thi thật — số câu + nhãn dạng bài
					// + instruction chuẩn IELTS từ map dùng chung. Type lạ (đề cũ
					// snapshot) fallback label = chính type id, instruction rỗng.
					const display = quizTypeDisplay(part.typeId);
					return (
						<section
							key={part.id}
							aria-label={`${part.label} · ${display.label}`}
						>
							{isAuto && (
								<header className="mb-2 flex flex-col gap-0.5">
									<h2 className="font-display font-semibold">{part.label}</h2>
									<p className="font-medium text-[13px]">{display.label}</p>
									{display.instruction && (
										<p className="text-muted-fg text-sm">
											{display.instruction}
										</p>
									)}
								</header>
							)}
							<div className="flex flex-col gap-2.5">
								{part.questions.map((question) => (
									<QuizQuestionItem
										key={question.q}
										question={question}
										choiceRows={choiceRowsByQ.get(question.q) ?? []}
										type={question.type ?? typeId}
										answers={answers}
										onAnswer={onAnswer}
										current={currentQuestion === question.q}
										mode={mode}
										review={review?.[question.q]}
									/>
								))}
							</div>
						</section>
					);
				})}
			</div>

			{questions.length === 0 && (
				<p className="text-muted-fg text-sm" role="note">
					Đề này không có câu hỏi tự chấm — liên hệ giáo viên để biết thêm hướng
					dẫn nộp bài.
				</p>
			)}
		</article>
	);
}
