import {
	ASSIGNMENT_IMAGE_SRC_PATTERN,
	isImageBasedType,
	optionBankKindFor,
	QUIZ_ESSAY_MAX,
	type QuizVerdict,
	quizTypeDisplay,
	type StudentQuizDetail,
	WRITING_MIN_WORDS,
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
	grammar: "Grammar",
	vocabulary: "Vocabulary",
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
	writingSection = null,
	essay,
	onEssayChange,
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
	/** #574: phần Writing đính kèm của đề tự chấm (không đụng key 0 của answers). */
	writingSection?: { part: string; type: string; prompt: string } | null;
	essay?: string;
	onEssayChange?: (value: string) => void;
}) {
	const reviewMode = mode === "review";
	const skill = detail.skill;
	const typeId = detail.type;
	const isAuto =
		skill === "reading" ||
		skill === "listening" ||
		skill === "grammar" ||
		skill === "vocabulary";
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
	// Chỉ cắt intro khi parts THẬT SỰ được dựng từ intro (source "intro" —
	// #301). Part nhóm thư viện (#433, source "group") mang instructionHtml
	// của nhóm nhưng KHÔNG được nuốt preamble — kể cả khi intro có marker
	// "Questions X–Y" (red-team RT11).
	const introSplit = parts.some((part) => part.source === "intro")
		? splitQuizIntro(detail.intro, questions.length)
		: null;
	const introPreamble = introSplit ? introSplit.preamble : detail.intro;
	const hasGroupSource = parts.some((part) => part.source === "group");
	// Bank vẫn prompt-level nhưng hiện khi type đề HOẶC bất kỳ câu bankable
	// (đề trộn dạng) — cụm bankable phải có list để học viên chọn (#286 H2).
	// Part nhóm (#433) bank nằm trên từng part: KHÔNG render bank cấp đề khi
	// rỗng — schema cấm bank part-level khi có nhóm nên bank rỗng ở đây là
	// hợp lệ, không phải dữ liệu hỏng (red-team RT2 — alert "Thiếu ngân hàng
	// lựa chọn" chỉ dành cho đề không nhóm).
	const bankKind = optionBankKindFor(
		skill,
		typeId,
		questions.map((question) => question.type),
	);
	const showDetailBank =
		bankKind !== undefined && (!hasGroupSource || detail.optionBank.length > 0);
	const hasPins = questions.some((question) => question.pin != null);
	// PinOverlay chỉ khả dụng khi ảnh đề hợp lệ — thiếu ảnh thì câu pin fallback
	// về hàng cloze/choice thường để VẪN trả lời được (code-review F4).
	// Part nhóm (#433, red-team RT5/C3): nhóm image-based hợp lệ ở vị trí bất
	// kỳ → gate theo typeId của các part; caller cũ (take screen) giữ gate
	// theo type đề — đề học viên có cluster ảnh nhưng type đề không ảnh vẫn
	// như cũ (không đổi hành vi take screen).
	const imageTypeMatch = hasGroupSource
		? parts.some((part) => isImageBasedType(skill, part.typeId))
		: isImageBasedType(skill, typeId);
	const diagramImageUrl =
		imageTypeMatch && ASSIGNMENT_IMAGE_SRC_PATTERN.test(rawImageUrl)
			? rawImageUrl
			: "";
	const usePinOverlay = hasPins && diagramImageUrl !== "";
	// Bank riêng của part (nhóm) ưu tiên bank cấp đề — câu trong part nhóm
	// chọn từ bank của nhóm mình (red-team R5).
	const choiceRowsByQ = new Map<number, QuizChoiceRow[]>();
	for (const part of parts) {
		const partBank = part.optionBank ?? detail.optionBank;
		for (const question of part.questions) {
			// Câu có pin trả lời qua input trên ảnh (PinOverlay) — không nhân đôi
			// widget bằng radio pills dưới list. Widget key theo type HIỆU DỤNG
			// của câu (đề trộn dạng), fallback type đề.
			choiceRowsByQ.set(
				question.q,
				usePinOverlay && question.pin != null
					? []
					: questionChoiceRows(question, question.type ?? typeId, partBank),
			);
		}
	}
	// PinOverlay chỉ ĐỌC `pin` + key answers theo `item.q ?? offset` — truyền
	// ĐỦ questions (không lọc pin): QuizPartQuestion mang `q`/`number` toàn
	// cục nên multi-part (#433) không đè đáp án; caller web không có `q` giữ
	// fallback offset == q (red-team RT1/C2).
	// Verdict soi bài (#351) keyed theo `q` — dựng từ review record.
	const pinVerdicts: Record<number, QuizVerdict> | undefined =
		reviewMode && review
			? Object.fromEntries(
					Object.entries(review).map(([q, info]) => [Number(q), info.verdict]),
				)
			: undefined;
	const pinOverlay = usePinOverlay ? (
		<PinOverlay
			imageUrl={diagramImageUrl}
			items={questions}
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

			{(skill === "reading" || skill === "grammar" || skill === "vocabulary") &&
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

			{showDetailBank && (
				<OptionBankList bank={detail.optionBank} kind={bankKind} />
			)}

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
					// Part có instruction riêng (section intro #301 hoặc nhóm thư
					// viện #433) hiển thị instruction đó thay 2 dòng chuẩn; chỉ có
					// marker fallback về chuẩn.
					const display = quizTypeDisplay(part.typeId);
					const hasOwnInstruction =
						part.instructionHtml !== undefined &&
						!isEmptyRichText(part.instructionHtml ?? "");
					// Part nhóm (#433): header không kèm nhãn dạng bài khi có
					// instruction riêng — cùng ngôn ngữ với section intro.
					const fromOwnSource =
						part.source === "intro" ||
						(part.source === "group" && hasOwnInstruction);
					// Option bank riêng của nhóm — render ngay dưới header nhóm
					// (red-team RT2/R5); part thường không có bank riêng.
					const partBankKind = part.optionBank?.length
						? optionBankKindFor(
								skill,
								part.typeId,
								part.questions.map((question) => question.type),
							)
						: undefined;
					return (
						<section
							key={part.id}
							aria-label={
								fromOwnSource ? part.label : `${part.label} · ${display.label}`
							}
						>
							{isAuto && (
								<header className="mb-2 flex flex-col gap-0.5">
									<h2 className="font-semibold">{part.label}</h2>
									{hasOwnInstruction ? (
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
							{partBankKind && (
								<OptionBankList
									bank={part.optionBank ?? []}
									kind={partBankKind}
								/>
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

			{isAuto && writingSection != null && (
				<section
					aria-labelledby="hybrid-writing-heading"
					className="mt-8 flex flex-col gap-3 border-border border-t pt-6"
					data-testid="hybrid-writing-section"
				>
					<header className="flex flex-col gap-0.5">
						<h2 id="hybrid-writing-heading" className="font-semibold">
							Phần 2 · Writing (
							{writingSection.part === "task1" ? "Task 1" : "Task 2"})
						</h2>
						{WRITING_MIN_WORDS[writingSection.part] !== undefined && (
							<p className="font-mono text-muted-foreground text-xs">
								Tối thiểu {WRITING_MIN_WORDS[writingSection.part]} từ
							</p>
						)}
					</header>
					{!isEmptyRichText(writingSection.prompt) && (
						<RichTextBody
							text={writingSection.prompt}
							className="text-sm leading-[1.55]"
						/>
					)}
					<QuizEssayInput
						value={essay ?? ""}
						onChange={(value) => onEssayChange?.(value)}
						readOnly={reviewMode}
						maxLength={QUIZ_ESSAY_MAX}
					/>
				</section>
			)}

			{questions.length === 0 &&
				!isWritingEssay &&
				!isSpeaking &&
				writingSection == null && (
					<p className="text-muted-foreground text-sm" role="note">
						Đề này không có câu hỏi tự chấm — liên hệ giáo viên để biết thêm
						hướng dẫn nộp bài.
					</p>
				)}
		</article>
	);
}
