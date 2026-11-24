import {
	ASSIGNMENT_ANSWER_CHOICES,
	ASSIGNMENT_IMAGE_SRC_PATTERN,
	answerKindByType,
	extendedAnswerChoices,
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
import {
	isLibraryImageBasedType,
	libraryOptionBankKindFor,
} from "@teacher-os/api/library-contracts";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { OptionBankList } from "@teacher-os/ui/components/assignments/option-bank-list";
import { PinOverlay } from "@teacher-os/ui/components/assignments/pin-overlay";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import { QuizEssayInput } from "@teacher-os/ui/components/quiz/quiz-essay-input";
import { QuizInlineInstruction } from "@teacher-os/ui/components/quiz/quiz-inline-instruction";
import {
	type QuizChoiceRow,
	QuizQuestionItem,
	questionAnchorId,
	questionChoiceRows,
} from "@teacher-os/ui/components/quiz/quiz-question-item";
import {
	QuizReviewChip,
	type QuizReviewInfo,
} from "@teacher-os/ui/components/quiz/quiz-review-item";
import {
	VERDICT_ACCENT_CLASSES,
	VERDICT_BLOCK_CLASSES,
	VerdictIcon,
} from "@teacher-os/ui/components/quiz/quiz-verdict";
import {
	type ParsedInlineInstruction,
	parseInlineInstruction,
} from "@teacher-os/ui/lib/inline-instruction";
import {
	COMPLETION_TYPE_REGEX,
	deduplicateGroupIntroPreamble,
	isEffectivelyEmptyInstruction,
	isPositionalSectionBank,
	resolvePartInstruction,
	scopeFlattenedOptionBank,
} from "@teacher-os/ui/lib/quiz-instruction";
import { cn } from "@teacher-os/ui/lib/utils";
import { type SyntheticEvent, useMemo } from "react";

/** Các field đề cần để render paper (subset của StudentQuizDetail). */
export type QuizPaperDetail = Pick<
	StudentQuizDetail,
	| "skill"
	| "type"
	| "band"
	| "level"
	| "intro"
	| "prompt"
	| "passage"
	| "cueTopic"
	| "cuePoints"
	| "audioName"
	| "hasAudio"
	| "imageUrl"
	| "optionBank"
	| "note"
>;

function isPositionalOnlyBank(
	bank: readonly string[],
	kind: keyof typeof ASSIGNMENT_ANSWER_CHOICES,
): boolean {
	if (bank.length === 0) {
		return false;
	}
	if (kind === "letter") {
		return isPositionalSectionBank(bank);
	}
	if (kind !== "roman") {
		return false;
	}
	const alphabet = extendedAnswerChoices(kind);
	return bank.every(
		(entry, index) =>
			entry.trim().toUpperCase() === (alphabet[index] ?? "").toUpperCase(),
	);
}

const SKILL_LABELS: Record<string, string> = {
	reading: "Reading",
	listening: "Listening",
	writing: "Writing",
	speaking: "Speaking",
	grammar: "Grammar",
	vocabulary: "Vocabulary",
};

/** Standalone choice question types whose stems carry their own prompts/options
 * and must never be collapsed into inline instruction slots. */
const NON_INLINE_QUESTION_TYPES = new Set([
	"mcq",
	"mcq1",
	"mcq3",
	"mcq_many",
	"tfng",
	"ynng",
]);

const REQUIRED_BANK_QUESTION_TYPES = new Set([
	"headings",
	"info",
	"features",
	"match_names",
	"matching",
	"sentend",
	"map",
	"match2",
	"match",
]);

const EMPTY_MATCHED_INSTRUCTIONS: ReadonlyMap<string, string> = new Map();

type PartRenderUnit =
	| { kind: "single"; question: QuizPartQuestion; effectiveType: string }
	| { kind: "mcq_many"; questions: QuizPartQuestion[] };

function canClusterMcqMany(
	prev: QuizPartQuestion,
	curr: QuizPartQuestion,
): boolean {
	const prevSet = prev.answerSet?.trim();
	const currSet = curr.answerSet?.trim();
	if (prevSet || currSet) {
		return Boolean(prevSet && currSet && prevSet === currSet);
	}
	return (
		prev.stem === curr.stem &&
		JSON.stringify(prev.opts ?? null) === JSON.stringify(curr.opts ?? null)
	);
}

function buildPartRenderUnits(
	part: QuizPart,
	promptType: string,
): PartRenderUnit[] {
	const units: PartRenderUnit[] = [];
	for (const question of part.questions) {
		const effectiveType =
			question.type ?? (part.source === "group" ? part.typeId : promptType);
		if (effectiveType === "mcq_many") {
			const last = units[units.length - 1];
			const prev =
				last?.kind === "mcq_many"
					? last.questions[last.questions.length - 1]
					: undefined;
			if (
				last?.kind === "mcq_many" &&
				prev &&
				canClusterMcqMany(prev, question)
			) {
				last.questions.push(question);
				continue;
			}
			units.push({ kind: "mcq_many", questions: [question] });
			continue;
		}
		units.push({ kind: "single", question, effectiveType });
	}
	return units;
}

function QuizMcqManyCard({
	questions,
	answers,
	onAnswer,
	currentQuestion,
	mode,
	review,
}: {
	questions: QuizPartQuestion[];
	answers: Record<number, string>;
	onAnswer: (q: number, value: string) => void;
	currentQuestion: number | null;
	mode: "take" | "review";
	review?: Record<number, QuizReviewInfo>;
}) {
	const reviewMode = mode === "review";
	const firstQ = questions[0];
	if (!firstQ) return null;
	const k = questions.length;
	const firstNum = firstQ.number;
	const lastNum = questions[k - 1]?.number ?? firstNum;
	const rangeLabel =
		firstNum === lastNum
			? `Question ${firstNum}`
			: `Questions ${firstNum}–${lastNum}`;
	const opts = firstQ.opts ?? [];
	const optionLetters = ASSIGNMENT_ANSWER_CHOICES.letter.slice(0, opts.length);
	const current =
		currentQuestion !== null &&
		questions.some((question) => question.q === currentQuestion);

	const rawSelected = reviewMode
		? questions.map((q) => (review?.[q.q]?.answer ?? answers[q.q] ?? "").trim())
		: questions.map((q) => (answers[q.q] ?? "").trim());
	const selectedLetters = new Set(
		rawSelected.filter((letter) =>
			optionLetters.includes(letter as (typeof optionLetters)[number]),
		),
	);
	const atLimit = selectedLetters.size >= k;

	const keyLetters = new Set(
		questions
			.map((q) => review?.[q.q]?.key?.trim() ?? "")
			.filter((letter) => letter.length > 0),
	);
	const reviewInfos = questions
		.map((q) => review?.[q.q])
		.filter((info): info is QuizReviewInfo => Boolean(info));
	const clusterVerdict: QuizVerdict | null =
		reviewMode && reviewInfos.length > 0
			? reviewInfos.every((info) => info.verdict === "correct")
				? "correct"
				: reviewInfos.every((info) => info.verdict === "skipped")
					? "skipped"
					: "wrong"
			: null;

	const ownExplanations = Array.from(
		new Set(
			reviewInfos
				.map((info) => info.explanation?.trim() ?? "")
				.filter((text) => text.length > 0 && !isEmptyRichText(text)),
		),
	);
	const fallbackNote =
		ownExplanations.length === 0
			? (reviewInfos.find(
					(info) => info.note.trim().length > 0 && !isEmptyRichText(info.note),
				)?.note ?? null)
			: null;
	const explanations =
		ownExplanations.length > 0
			? ownExplanations
			: fallbackNote
				? [fallbackNote]
				: [];

	const toggleLetter = (letter: string) => {
		if (reviewMode) return;
		const nextSet = new Set(selectedLetters);
		if (nextSet.has(letter)) {
			nextSet.delete(letter);
		} else {
			if (nextSet.size >= k) return;
			nextSet.add(letter);
		}
		const sorted = optionLetters.filter((item) => nextSet.has(item));
		for (let index = 0; index < k; index += 1) {
			const question = questions[index];
			if (!question) continue;
			const nextValue = sorted[index] ?? "";
			if ((answers[question.q] ?? "") !== nextValue) {
				onAnswer(question.q, nextValue);
			}
		}
	};

	const frameClass = clusterVerdict
		? "border-transparent"
		: current
			? "border-primary bg-accent"
			: "border-transparent bg-transparent";

	return (
		<fieldset
			id={questionAnchorId(firstQ.q)}
			tabIndex={-1}
			aria-label={rangeLabel}
			data-question={firstQ.q}
			data-verdict={clusterVerdict ?? undefined}
			disabled={reviewMode}
			className={cn(
				"scroll-mt-24 rounded-md border px-3 py-2.5 text-sm transition-colors focus-visible:outline-none",
				frameClass,
				clusterVerdict && VERDICT_BLOCK_CLASSES[clusterVerdict],
				reviewMode && current && "outline-2 outline-primary outline-offset-2",
			)}
		>
			{questions.slice(1).map((question) => (
				<span
					key={question.q}
					id={questionAnchorId(question.q)}
					aria-hidden="true"
					className="sr-only"
				/>
			))}
			<div className="flex flex-wrap items-center justify-between gap-2">
				<strong className="font-semibold">{rangeLabel}</strong>
				<span className="rounded-full border border-border px-2 py-0.5 font-medium text-muted-foreground text-xs">
					Chọn {k} đáp án
				</span>
			</div>
			{reviewMode && reviewInfos.length > 0 && (
				<div className="mt-1.5 flex flex-wrap items-center gap-2">
					{questions.map((question) => {
						const info = review?.[question.q];
						if (!info) return null;
						return (
							<span
								key={question.q}
								className="inline-flex items-center gap-1 text-xs"
							>
								<strong>{question.number}.</strong>
								<QuizReviewChip info={info} />
							</span>
						);
					})}
				</div>
			)}
			<p className="mt-1 leading-[1.6]">{firstQ.stem}</p>
			<div className="mt-2 flex flex-col gap-1.5">
				{opts.map((optText, index) => {
					const letter = ASSIGNMENT_ANSWER_CHOICES.letter[index];
					if (!letter) return null;
					const selected = selectedLetters.has(letter);
					const isKey = keyLetters.has(letter);
					const optionDisabled = reviewMode || (!selected && atLimit);

					let reviewStyle: {
						rowClass: string;
						textClass: string;
						accent: string;
						mark: "check" | "you" | "key" | null;
					} | null = null;
					if (reviewMode) {
						if (selected && isKey) {
							reviewStyle = {
								rowClass:
									"border-verdict-correct/60 bg-verdict-correct-soft text-verdict-correct",
								textClass: "text-verdict-correct",
								accent: VERDICT_ACCENT_CLASSES.correct,
								mark: "check",
							};
						} else if (selected && !isKey) {
							reviewStyle = {
								rowClass: "border-verdict-wrong/60 bg-verdict-wrong-soft",
								textClass: "text-verdict-wrong line-through",
								accent: VERDICT_ACCENT_CLASSES.wrong,
								mark: "you",
							};
						} else if (!selected && isKey) {
							reviewStyle = {
								rowClass: "border-2 border-verdict-correct",
								textClass: "text-verdict-correct",
								accent: VERDICT_ACCENT_CLASSES.correct,
								mark: "key",
							};
						} else {
							reviewStyle = {
								rowClass: "border-transparent text-muted-foreground",
								textClass: "text-muted-foreground",
								accent: VERDICT_ACCENT_CLASSES.skipped,
								mark: null,
							};
						}
					}

					return (
						<label
							key={letter}
							className={cn(
								"flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors",
								reviewMode ? "cursor-default" : "cursor-pointer",
								reviewStyle
									? reviewStyle.rowClass
									: selected
										? "border-primary bg-muted text-foreground ring-1 ring-primary"
										: "border-input bg-transparent",
								!reviewMode && !selected && !atLimit && "hover:border-primary",
								!reviewMode &&
									!selected &&
									atLimit &&
									"cursor-not-allowed opacity-50",
							)}
						>
							<input
								type="checkbox"
								checked={selected}
								disabled={optionDisabled}
								aria-label={`${rangeLabel} lựa chọn ${letter}`}
								onChange={() => toggleLetter(letter)}
								className={cn(
									"size-4 shrink-0",
									reviewStyle ? reviewStyle.accent : "accent-primary",
								)}
							/>
							<span className="w-5 shrink-0 text-center font-medium font-mono text-muted-foreground">
								{letter}
							</span>
							<span
								className={cn(
									selected && "font-medium",
									reviewStyle
										? reviewStyle.textClass
										: !selected && "text-foreground",
								)}
							>
								{optText}
							</span>
							{reviewStyle?.mark && (
								<span className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em]">
									<VerdictIcon
										verdict={reviewStyle.mark === "you" ? "wrong" : "correct"}
										className="size-3"
									/>
									{reviewStyle.mark === "check" && "Đúng"}
									{reviewStyle.mark === "you" && "Bạn chọn"}
									{reviewStyle.mark === "key" && "Đáp án đúng"}
								</span>
							)}
						</label>
					);
				})}
			</div>
			{reviewMode && (keyLetters.size > 0 || explanations.length > 0) && (
				<div
					data-testid="quiz-review-item"
					className="mt-2 border-border border-t pt-2 text-[13px]"
				>
					{keyLetters.size > 0 && (
						<p className="text-muted-foreground">
							Đáp án:{" "}
							<span className="font-medium font-mono text-verdict-correct">
								{optionLetters
									.filter((letter) => keyLetters.has(letter))
									.join(", ") || [...keyLetters].join(", ")}
							</span>
						</p>
					)}
					{explanations.map((text, index) => (
						<details
							key={`${index}-${text.slice(0, 20)}`}
							className="mt-1.5"
							data-testid="quiz-review-explanation"
						>
							<summary className="cursor-pointer select-none rounded-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-ring">
								Giải thích
							</summary>
							<RichTextBody
								text={text}
								legacyWhitespace="pre-wrap"
								className="mt-1 text-muted-foreground leading-[1.55]"
							/>
						</details>
					))}
				</div>
			)}
		</fieldset>
	);
}

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
	audioSrc,
	audioCrossOrigin,
	audioLoading = false,
	audioError = false,
	onAudioError,
	onAudioRetry,
	transcript,
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
	/** URL phát bài nghe Listening (stream trực tiếp hoặc blob URL). */
	audioSrc?: string | null;
	audioCrossOrigin?: "anonymous" | "use-credentials";
	audioLoading?: boolean;
	audioError?: boolean;
	onAudioError?: (event: SyntheticEvent<HTMLAudioElement>) => void;
	onAudioRetry?: () => void;
	/** Transcript bài nghe — chỉ truyền sau khi nộp bài (reviewMode). */
	transcript?: string;
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
	const hasIntroSplit = introSplit !== null;
	const rawIntroPreamble = introSplit ? introSplit.preamble : detail.intro;
	const hasGroupSource = parts.some((part) => part.source === "group");
	const { cleanedPreamble: introPreamble, matchedInstructionsByPartId } =
		useMemo(() => {
			if (!hasGroupSource && (hasIntroSplit || parts.length <= 1)) {
				return {
					cleanedPreamble: rawIntroPreamble,
					matchedInstructionsByPartId: EMPTY_MATCHED_INSTRUCTIONS,
				};
			}
			return deduplicateGroupIntroPreamble(rawIntroPreamble, parts);
		}, [hasGroupSource, hasIntroSplit, rawIntroPreamble, parts]);
	const scopedBankResult = useMemo(() => {
		if (hasGroupSource) {
			return { partitioned: null, isBankScoped: true };
		}
		return scopeFlattenedOptionBank(
			parts,
			detail.optionBank,
			matchedInstructionsByPartId,
			{ skill, introPreamble },
		);
	}, [
		hasGroupSource,
		parts,
		detail.optionBank,
		matchedInstructionsByPartId,
		skill,
		introPreamble,
	]);
	const partitionedBanks = scopedBankResult.partitioned;
	const hasPartitionedBanks = partitionedBanks !== null;
	const isBankScoped = scopedBankResult.isBankScoped;
	// Bank vẫn prompt-level nhưng hiện khi type đề HOẶC bất kỳ câu bankable
	// (đề trộn dạng) — cụm bankable phải có list để học viên chọn (#286 H2).
	// Part nhóm (#433) hoặc đã tách bank theo part (#877) render per-part qua
	// showPartBank.
	const bankKind = libraryOptionBankKindFor(
		skill,
		typeId,
		questions.map((question) => question.type),
		detail.optionBank,
	);
	const showDetailBank =
		!hasGroupSource &&
		!hasPartitionedBanks &&
		bankKind !== undefined &&
		!isPositionalOnlyBank(detail.optionBank, bankKind);
	const hasPins = questions.some((question) => question.pin != null);
	// PinOverlay chỉ khả dụng khi ảnh đề hợp lệ — thiếu ảnh thì câu pin fallback
	// về hàng cloze/choice thường để VẪN trả lời được (code-review F4).
	// Part nhóm (#433, red-team RT5/C3): nhóm image-based hợp lệ ở vị trí bất
	// kỳ → gate theo typeId của các part; caller cũ (take screen) giữ gate
	// theo type đề — đề học viên có cluster ảnh nhưng type đề không ảnh vẫn
	// như cũ (không đổi hành vi take screen).
	const imageTypeMatch = hasGroupSource
		? parts.some((part) => isLibraryImageBasedType(skill, part.typeId))
		: isLibraryImageBasedType(skill, typeId);
	const diagramImageUrl =
		imageTypeMatch && ASSIGNMENT_IMAGE_SRC_PATTERN.test(rawImageUrl)
			? rawImageUrl
			: "";
	const usePinOverlay = hasPins && diagramImageUrl !== "";
	const { parsedInlineByPartId, introConsumedByInline } = useMemo(() => {
		const byPartId = new Map<string, ParsedInlineInstruction>();
		let introConsumed = false;
		if (!isAuto) {
			return {
				parsedInlineByPartId: byPartId,
				introConsumedByInline: introConsumed,
			};
		}

		const hasIntroCandidate =
			parts.length === 1 && !isEmptyRichText(introPreamble);

		for (const part of parts) {
			const hasOwnInstruction = !isEffectivelyEmptyInstruction(
				part.instructionHtml,
			);
			const matchedInstruction = matchedInstructionsByPartId.get(part.id);
			const hasMatchedInstruction =
				!isEffectivelyEmptyInstruction(matchedInstruction);
			let candidateHtml = "";
			let usesIntro = false;
			if (hasOwnInstruction) {
				candidateHtml = part.instructionHtml ?? "";
			} else if (hasMatchedInstruction) {
				candidateHtml = matchedInstruction ?? "";
			} else if (hasIntroCandidate) {
				candidateHtml = introPreamble;
				usesIntro = true;
			}
			if (!candidateHtml) continue;

			const eligibleQuestions = part.questions
				.filter((question) => {
					if (usePinOverlay && question.pin != null) return false;
					const effectiveType =
						question.type ?? (part.source === "group" ? part.typeId : typeId);
					if (NON_INLINE_QUESTION_TYPES.has(effectiveType)) return false;
					if (question.opts && question.opts.length > 0) return false;
					return true;
				})
				.map((question) => ({ q: question.q, number: question.number }));

			if (eligibleQuestions.length === 0) continue;

			const parsed = parseInlineInstruction(candidateHtml, eligibleQuestions);
			if (parsed) {
				byPartId.set(part.id, parsed);
				if (usesIntro) {
					introConsumed = true;
				}
			}
		}

		return {
			parsedInlineByPartId: byPartId,
			introConsumedByInline: introConsumed,
		};
	}, [
		isAuto,
		parts,
		introPreamble,
		matchedInstructionsByPartId,
		typeId,
		usePinOverlay,
	]);
	const completionPartCount = parts.filter(
		(part) => part.typeId in COMPLETION_TYPE_REGEX,
	).length;
	// Bank riêng của part (nhóm) ưu tiên bank cấp đề — câu trong part nhóm
	// chọn từ bank của nhóm mình (red-team R5). Part nhóm không bank tuyệt
	// đối không mượn detail.optionBank (#875).
	const hasRequiredBankQuestion = questions.some((q) =>
		REQUIRED_BANK_QUESTION_TYPES.has(q.type ?? typeId),
	);
	const choiceRowsByQ = new Map<number, QuizChoiceRow[]>();
	const optionBankByQ = new Map<number, readonly string[]>();
	for (const part of parts) {
		const partHasRequiredBankQuestion = part.questions.some((q) =>
			REQUIRED_BANK_QUESTION_TYPES.has(
				q.type ?? (part.source === "group" ? part.typeId : typeId),
			),
		);
		for (const question of part.questions) {
			const effectiveType =
				question.type ?? (part.source === "group" ? part.typeId : typeId);
			const isQOptionalBank =
				effectiveType === "summary" || effectiveType === "flow";
			const qBank =
				part.source === "group"
					? (part.optionBank ?? [])
					: hasPartitionedBanks
						? (part.optionBank ??
							(isQOptionalBank && partHasRequiredBankQuestion
								? []
								: (partitionedBanks.get(part.id) ?? [])))
						: (part.optionBank ??
							(isQOptionalBank && hasRequiredBankQuestion
								? []
								: detail.optionBank));
			// Câu có pin trả lời qua input trên ảnh (PinOverlay) — không nhân đôi
			// widget bằng radio pills dưới list. Widget key theo type HIỆU DỤNG
			// của câu (đề trộn dạng), fallback type đề.
			choiceRowsByQ.set(
				question.q,
				usePinOverlay && question.pin != null
					? []
					: questionChoiceRows(question, effectiveType, qBank),
			);
			const bankKindForQ =
				isQOptionalBank && qBank.length > 0
					? "letter"
					: answerKindByType[effectiveType];
			if (
				qBank.length > 0 &&
				(bankKindForQ === "letter" || bankKindForQ === "roman")
			) {
				optionBankByQ.set(question.q, qBank);
			}
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
				{SKILL_LABELS[skill] ?? skill}
				{detail.level?.trim() ? ` · ${detail.level.trim()}` : ""}
			</p>

			{skill === "listening" && (
				<div className="flex flex-col gap-2 rounded-md border border-border bg-muted p-3 text-sm">
					{audioError ? (
						<div
							role="alert"
							className="flex flex-wrap items-center justify-between gap-2 text-danger text-sm"
						>
							<span>Không tải được file nghe.</span>
							{onAudioRetry && (
								<button
									type="button"
									onClick={onAudioRetry}
									className="rounded-md border border-border bg-background px-2.5 py-1 font-medium text-foreground text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
								>
									Thử lại
								</button>
							)}
						</div>
					) : audioSrc ? (
						// biome-ignore lint/a11y/useMediaCaption: Listening exam audio; transcript unlocks after submit (#702)
						<audio
							controls
							preload="metadata"
							crossOrigin={audioCrossOrigin}
							src={audioSrc}
							aria-label="Bài nghe"
							className="w-full"
							data-testid="quiz-audio-player"
							onError={onAudioError}
						/>
					) : audioLoading || detail.hasAudio ? (
						<p className="text-muted-foreground text-sm">Đang tải file nghe…</p>
					) : (
						<p>🔊 {detail.audioName.trim() || "Chưa đính file nghe"}</p>
					)}
				</div>
			)}

			{reviewMode && transcript && !isEmptyRichText(transcript) && (
				<details
					open
					className="rounded-lg border border-border bg-muted/40 p-4 text-sm"
					data-testid="quiz-review-transcript"
				>
					<summary className="cursor-pointer font-semibold text-foreground">
						Transcript bài nghe
					</summary>
					<div className="mt-2 whitespace-pre-line text-muted-foreground leading-relaxed">
						{transcript}
					</div>
				</details>
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
					className="block max-h-[28rem] w-auto max-w-full rounded-md border border-border"
					referrerPolicy="no-referrer"
					loading="lazy"
				/>
			) : null}

			{isAuto && !introConsumedByInline && !isEmptyRichText(introPreamble) && (
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
					const matchedInstruction = matchedInstructionsByPartId.get(part.id);
					const isPartOptionalBank =
						part.typeId === "summary" ||
						part.typeId === "flow" ||
						part.typeId === "flowchart";
					const partScopedBank = hasPartitionedBanks
						? (partitionedBanks.get(part.id) ?? [])
						: undefined;
					const effectivePartBank =
						part.source === "group"
							? (part.optionBank ?? [])
							: part.optionBank !== undefined
								? part.optionBank
								: partScopedBank !== undefined
									? partScopedBank
									: isPartOptionalBank && hasRequiredBankQuestion
										? []
										: detail.optionBank;
					const displayInstruction = resolvePartInstruction(
						part.typeId,
						part.questions,
						display.instruction,
						{
							partBank: effectivePartBank,
							isBankScoped,
							matchedInstruction,
							contextIntro:
								parts.length <= 1
									? detail.intro
									: hasIntroSplit || completionPartCount === 1
										? introPreamble
										: undefined,
						},
					);
					const hasPartOwnInstruction = !isEffectivelyEmptyInstruction(
						part.instructionHtml,
					);
					const hasMatchedInstruction =
						!isEffectivelyEmptyInstruction(matchedInstruction);
					const hasOwnInstruction =
						hasPartOwnInstruction || hasMatchedInstruction;
					const instructionToShow = hasPartOwnInstruction
						? part.instructionHtml
						: hasMatchedInstruction
							? matchedInstruction
							: undefined;
					// Part nhóm (#433): header không kèm nhãn dạng bài khi có
					// instruction riêng — cùng ngôn ngữ với section intro.
					const fromOwnSource =
						part.source === "intro" ||
						(part.source === "group" && hasOwnInstruction);
					// Option bank riêng của nhóm hoặc đã tách theo part (#877) — render
					// ngay dưới header nhóm; giữ guard .length > 0 để không hiện alert
					// thiếu bank (RT2).
					const partBankToRender: string[] | undefined =
						part.source === "group"
							? (part.optionBank ?? [])
							: part.optionBank !== undefined
								? part.optionBank
								: partScopedBank !== undefined
									? partScopedBank
									: undefined;
					const partBankKind =
						partBankToRender && partBankToRender.length > 0
							? libraryOptionBankKindFor(
									skill,
									part.typeId,
									part.questions.map((question) => question.type),
									partBankToRender,
								)
							: undefined;
					const renderUnits = buildPartRenderUnits(part, typeId);
					const parsedInline = parsedInlineByPartId.get(part.id) ?? null;
					const remainingUnits = parsedInline
						? renderUnits.filter(
								(unit) =>
									unit.kind !== "single" ||
									!parsedInline.boundQuestionQs.has(unit.question.q),
							)
						: renderUnits;
					const showPartBank =
						partBankKind !== undefined &&
						partBankToRender !== undefined &&
						partBankToRender.length > 0 &&
						!isPositionalOnlyBank(partBankToRender, partBankKind);
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
									{parsedInline ? null : hasOwnInstruction ? (
										<RichTextBody
											text={instructionToShow ?? ""}
											className="text-muted-foreground text-sm"
										/>
									) : (
										<>
											<p className="font-medium text-[13px]">{display.label}</p>
											{displayInstruction && (
												<p className="text-muted-foreground text-sm">
													{displayInstruction}
												</p>
											)}
										</>
									)}
								</header>
							)}
							{showPartBank &&
								(parsedInline ? (
									<div className="mb-3">
										<OptionBankList
											bank={partBankToRender ?? []}
											kind={partBankKind}
										/>
									</div>
								) : (
									<OptionBankList
										bank={partBankToRender ?? []}
										kind={partBankKind}
									/>
								))}
							{parsedInline && (
								<QuizInlineInstruction
									parsed={parsedInline}
									questions={part.questions}
									choiceRowsByQ={choiceRowsByQ}
									optionBankByQ={optionBankByQ}
									answers={answers}
									onAnswer={onAnswer}
									currentQuestion={currentQuestion}
									mode={mode}
									review={review}
								/>
							)}
							{remainingUnits.length > 0 && (
								<div
									className={cn(
										"flex flex-col gap-2.5",
										parsedInline && "mt-2.5",
									)}
								>
									{remainingUnits.map((unit) =>
										unit.kind === "mcq_many" ? (
											<QuizMcqManyCard
												key={`mcq-many-${unit.questions[0]?.q ?? 0}`}
												questions={unit.questions}
												answers={answers}
												onAnswer={onAnswer}
												currentQuestion={currentQuestion}
												mode={mode}
												review={review}
											/>
										) : (
											<QuizQuestionItem
												key={unit.question.q}
												question={unit.question}
												choiceRows={choiceRowsByQ.get(unit.question.q) ?? []}
												type={unit.effectiveType}
												answers={answers}
												onAnswer={onAnswer}
												current={currentQuestion === unit.question.q}
												mode={mode}
												review={review?.[unit.question.q]}
											/>
										),
									)}
								</div>
							)}
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
