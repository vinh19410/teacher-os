import {
	ASSIGNMENT_IMAGE_SRC_PATTERN,
	type AssignmentQuestion,
	isImageBasedType,
	optionBankKindFor,
	QUIZ_ESSAY_MAX,
	type QuizVerdict,
	quizTypeDisplay,
	type StudentQuizDetail,
} from "@teacher-os/api/contracts";
import { splitQuizIntro } from "@teacher-os/api/lib/quiz-intro-sections";
import type {
	QuizPart,
	QuizPartQuestion,
} from "@teacher-os/api/lib/quiz-parts";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { OptionBankList } from "@teacher-os/ui/components/assignments/option-bank-list";
import { PinOverlay } from "@teacher-os/ui/components/assignments/pin-overlay";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import { QuizEssayInput } from "@teacher-os/ui/components/quiz/quiz-essay-input";
import {
	type QuizChoiceRow,
	QuizQuestionItem,
	questionChoiceRows,
} from "@teacher-os/ui/components/quiz/quiz-question-item";
import type { QuizReviewInfo } from "@teacher-os/ui/components/quiz/quiz-review-item";

/** Các field đề cần để render paper (subset của StudentQuizDetail). */
export type QuizPaperDetail = Pick<
	StudentQuizDetail,
	| "skill"
	| "type"
	| "band"
	| "intro"
	| "prompt"
	| "passage"
	| "cueTopic"
	| "cuePoints"
	| "audioName"
	| "imageUrl"
	| "optionBank"
	| "note"
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
	const questions: QuizPartQuestion[] = parts.flatMap((part) => part.questions);
	// Đề Writing prompt-only (#304): essay bind key `0` của map `answers` —
	// cùng namespace với câu hỏi thật nên chỉ render khi đề RỖNG câu (fail
	// an toàn: dữ liệu vi phạm invariant rơi về empty-state, không đè nhau).
	const isWritingEssay = skill === "writing" && questions.length === 0;
	// Speaking (#305) nộp bằng file bài nói ở panel riêng của take screen —
	// paper chỉ hiển thị đề: intro giáo viên, cue card (Part 2), câu hỏi
	// `prompt` (Part 1/3), không có empty-state "không có câu hỏi tự chấm".
	const isSpeaking = skill === "speaking";
	const cueTopic = detail.cueTopic.trim();
	const cuePoints = detail.cuePoints
		.split("\n")
		.map((point) => point.trim())
		.filter(Boolean);
	const hasCueCard = isSpeaking && (cueTopic !== "" || cuePoints.length > 0);
	const rawImageUrl = detail.imageUrl.trim();
	const diagramImageUrl =
		isImageBasedType(skill, typeId) &&
		ASSIGNMENT_IMAGE_SRC_PATTERN.test(rawImageUrl)
			? rawImageUrl
			: "";
	// Chỉ cắt intro khi parts THẬT SỰ được dựng từ intro (có instructionHtml):
	// caller nào quên truyền intro cho buildQuizParts vẫn thấy nguyên blob ở
	// đầu trang, không bao giờ mất nội dung.
	const introSplit = parts.some((part) => part.instructionHtml !== undefined)
		? splitQuizIntro(detail.intro, questions.length)
		: null;
	const introPreamble = introSplit ? introSplit.preamble : detail.intro;
	// Bank vẫn prompt-level nhưng hiện khi type đề HOẶC bất kỳ câu bankable
	// (đề trộn dạng) — cụm bankable phải có list để học viên chọn (#286 H2).
	const bankKind = optionBankKindFor(
		skill,
		typeId,
		questions.map((question) => question.type),
	);
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
	// Verdict soi bài (#351) cũng keyed theo offset đó — dựng từ review record.
	const pinVerdicts: Record<number, QuizVerdict> | undefined =
		reviewMode && review
			? Object.fromEntries(
					Object.entries(review).map(([q, info]) => [Number(q), info.verdict]),
				)
			: undefined;
	const pinOverlay = usePinOverlay ? (
		<PinOverlay
			imageUrl={diagramImageUrl}
			items={questions as unknown as AssignmentQuestion[]}
			qStart={1}
			answers={answers}
			onAnswer={reviewMode ? () => undefined : onAnswer}
			verdicts={pinVerdicts}
			imageAlt="Ảnh đề bài"
		/>
	) : null;

	return (
		<article className="flex flex-col gap-4 rounded-xl bg-card text-foreground">
			<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
				{SKILL_LABELS[skill] ?? skill} · Band {detail.band}
			</p>

			{skill === "listening" && (
				<p className="rounded-md border border-border bg-muted p-3 text-sm">
					🔊 {detail.audioName.trim() || "Chưa đính file nghe"}
				</p>
			)}

			{skill === "reading" &&
				!hidePassage &&
				!isEmptyRichText(detail.passage) && (
					<RichTextBody
						text={detail.passage}
						className="text-sm leading-[1.85]"
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
					className="max-h-72 rounded-md border border-border"
					referrerPolicy="no-referrer"
					loading="lazy"
				/>
			) : null}

			{isAuto && !isEmptyRichText(introPreamble) && (
				<RichTextBody
					text={introPreamble}
					className="text-muted-foreground text-sm"
				/>
			)}

			{bankKind && <OptionBankList bank={detail.optionBank} kind={bankKind} />}

			{/* Speaking (#305): hướng dẫn của giáo viên ngay dưới eyebrow — ô
			 * "Hướng dẫn thêm" (`note`) của composer; `intro` cho dữ liệu cũ. */}
			{isSpeaking &&
				[detail.intro, detail.note ?? ""]
					.filter((text) => !isEmptyRichText(text))
					.map((text) => (
						<RichTextBody
							key={text}
							text={text}
							className="text-muted-foreground text-sm"
						/>
					))}

			{/* Cue card chỉ khi đề có topic (Part 2) — Part 1/3 là câu hỏi
			 * trong `prompt`, không còn cue card rỗng "the topic". */}
			{hasCueCard && (
				<div className="rounded-md border border-border bg-muted/50 p-4 text-sm">
					{cueTopic !== "" && <p>Describe {cueTopic}.</p>}
					{cuePoints.length > 0 && (
						<>
							<p className="mt-2 font-medium">You should say:</p>
							<ul className="ml-5 list-disc text-muted-foreground">
								{cuePoints.map((point) => (
									<li key={point}>{point}</li>
								))}
							</ul>
						</>
					)}
				</div>
			)}

			{/* Part 2 có cue card thì không hiện `prompt`: composer ẩn ô câu hỏi
			 * ở Part 2 nhưng vẫn lưu prompt cũ khi giáo viên đổi part. */}
			{!isAuto && !hasCueCard && !isEmptyRichText(detail.prompt) && (
				<RichTextBody text={detail.prompt} className="text-sm leading-[1.55]" />
			)}

			{isWritingEssay && (
				<QuizEssayInput
					value={answers[0] ?? ""}
					onChange={(value) => onAnswer(0, value)}
					readOnly={reviewMode}
					maxLength={QUIZ_ESSAY_MAX}
				/>
			)}

			<div className="flex flex-col gap-4">
				{parts.map((part) => {
					// Header cụm: đúng cấu trúc đề thi thật — số câu + nhãn dạng bài
					// + instruction chuẩn IELTS từ map dùng chung. Type lạ (đề cũ
					// snapshot) fallback label = chính type id, instruction rỗng.
					// Part từ section intro (#301) hiển thị instruction của giáo viên
					// thay 2 dòng chuẩn; section chỉ có marker fallback về chuẩn.
					const display = quizTypeDisplay(part.typeId);
					const fromIntro = part.instructionHtml !== undefined;
					const hasOwn =
						fromIntro && !isEmptyRichText(part.instructionHtml ?? "");
					return (
						<section
							key={part.id}
							aria-label={
								fromIntro ? part.label : `${part.label} · ${display.label}`
							}
						>
							{isAuto && (
								<header className="mb-2 flex flex-col gap-0.5">
									<h2 className="font-semibold">{part.label}</h2>
									{hasOwn ? (
										<RichTextBody
											text={part.instructionHtml ?? ""}
											className="text-muted-foreground text-sm"
										/>
									) : (
										<>
											<p className="font-medium text-[13px]">{display.label}</p>
											{display.instruction && (
												<p className="text-muted-foreground text-sm">
													{display.instruction}
												</p>
											)}
										</>
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

			{questions.length === 0 && !isWritingEssay && !isSpeaking && (
				<p className="text-muted-foreground text-sm" role="note">
					Đề này không có câu hỏi tự chấm — liên hệ giáo viên để biết thêm hướng
					dẫn nộp bài.
				</p>
			)}
		</article>
	);
}
