import { useQuery } from "@tanstack/react-query";
import {
	ASSIGNMENT_IMAGE_SRC_PATTERN,
	type AssignmentQuestion,
	isImageBasedType,
	optionBankKindFor,
	quizTypeDisplay,
	type StudyPackItemDetailView,
	type StudyPackItemView,
} from "@teacher-os/api/contracts";
import { isAcceptedAnswer } from "@teacher-os/api/lib/grade-quiz";
import { inferQuestionTypes } from "@teacher-os/api/lib/infer-question-types";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { ClozeStemText } from "@teacher-os/ui/components/assignments/cloze-stem";
import { OptionBankList } from "@teacher-os/ui/components/assignments/option-bank-list";
import { PinOverlay } from "@teacher-os/ui/components/assignments/pin-overlay";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import {
	type QuizChoiceRow,
	questionChoiceRows,
} from "@teacher-os/ui/components/quiz/quiz-question-item";
import { parseTableStem } from "@teacher-os/ui/lib/cloze";
import {
	Check,
	ChevronDown,
	ChevronUp,
	FileText,
	RefreshCw,
	Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAutoSkill } from "@/components/assignments/assignment-presets";
import { PreviewQuizSimulation } from "@/components/assignments/preview-quiz-simulation";
import { formatPackSkillLabel } from "@/components/study-packs/study-pack-editor-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { buildQuizSim, type QuizSimulation } from "@/lib/assignment-quiz-sim";
import { cn } from "@/lib/cn";
import { isValidPin } from "@/lib/image-pin";
import {
	fetchStudyPackItemAudio,
	getStudyPackItemDetail,
} from "@/lib/repos/study-pack";
import { useQuizSimulation } from "@/lib/use-quiz-simulation";

export interface StudyPackItemViewerProps {
	packId: string;
	item: StudyPackItemView;
	activeTab: "key" | "sim";
	onTabChange: (tab: "key" | "sim") => void;
}

interface AudioState {
	itemKey: string;
	blobUrl: string | null;
	loading: boolean;
	error: string | null;
}

const INITIAL_AUDIO_STATE: AudioState = {
	itemKey: "",
	blobUrl: null,
	loading: false,
	error: null,
};

function isChoiceCorrect(rowValue: string, q: AssignmentQuestion): boolean {
	if (isAcceptedAnswer(rowValue, q.answer, q.alts)) return true;
	const tokens = q.answer
		.split(/[,;]+/)
		.map((s) => s.trim().toUpperCase())
		.filter(Boolean);
	return tokens.length > 1 && tokens.includes(rowValue.trim().toUpperCase());
}

function getChoiceRows(
	question: AssignmentQuestion,
	qType: string,
	optionBank: readonly string[],
): QuizChoiceRow[] {
	const rows = questionChoiceRows(question, qType, optionBank);
	if (rows.length > 0) return rows;
	if (question.opts && question.opts.length > 0) {
		return question.opts.map((text, idx) => {
			const label = String.fromCharCode(65 + idx);
			return { label, text, value: label };
		});
	}
	return [];
}

function toQuizSimulation(
	packId: string,
	detail: StudyPackItemDetailView,
): QuizSimulation | null {
	if (!isAutoSkill(detail.skill) || detail.questions.length === 0) {
		return null;
	}
	const base = buildQuizSim(
		{
			task: detail.part || "part1",
			genre: detail.type || "mcq",
			title: detail.title,
			band: detail.band,
			source: detail.source,
			prompt: detail.prompt,
			note: detail.exerciseNote,
			status: detail.status === "draft" ? "draft" : "ready",
			skill: detail.skill,
			part: detail.part,
			type: detail.type,
			passage: detail.passage,
			intro: detail.intro,
			audioName: detail.audioName,
			imageUrl: detail.imageUrl,
			optionBank: detail.optionBank,
			items: detail.questions,
			writing: null,
		},
		`${packId}:${detail.id}`,
	);
	if (!base) return null;
	return {
		...base,
		detail: {
			...base.detail,
			level: detail.level ?? null,
			hasAudio: detail.hasAudio,
		},
	};
}

function QuestionKeyCard({
	index,
	question,
	qType,
	optionBank,
}: {
	index: number;
	question: AssignmentQuestion;
	qType: string;
	optionBank: readonly string[];
}) {
	const choiceRows = getChoiceRows(question, qType, optionBank);
	const tableInfo = parseTableStem(question.stem);
	const altsText = question.alts.trim();
	const hasExplanation =
		typeof question.explanation === "string" &&
		!isEmptyRichText(question.explanation);

	return (
		<div className="space-y-2.5 rounded-lg border border-border bg-card p-4">
			<div className="flex items-start gap-2 text-sm">
				<span className="shrink-0 font-semibold text-foreground tabular-nums">
					Câu {index + 1}.
				</span>
				<div className="min-w-0 flex-1 text-foreground">
					{tableInfo ? (
						<span>
							Hàng {tableInfo.row} — Cột {tableInfo.col}
							{tableInfo.rowTitle || tableInfo.colTitle ? ": " : ""}
							{[tableInfo.rowTitle, tableInfo.colTitle]
								.filter(Boolean)
								.join(" / ")}
						</span>
					) : question.stem.trim() ? (
						<ClozeStemText
							stem={question.stem}
							answer={question.answer}
							typeId={qType}
							number={index + 1}
						/>
					) : (
						<span className="text-muted-foreground">
							Chọn đáp án phù hợp cho câu {index + 1}.
						</span>
					)}
				</div>
			</div>

			{choiceRows.length > 0 ? (
				<ul className="space-y-1.5">
					{choiceRows.map((row) => {
						const correct = isChoiceCorrect(row.value, question);
						return (
							<li
								key={`${row.value}-${row.text}`}
								className={cn(
									"flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
									correct
										? "border-verdict-correct bg-verdict-correct-soft text-verdict-correct"
										: "border-border bg-background text-foreground",
								)}
							>
								<span className="min-w-0 flex-1">
									{row.label ? (
										<>
											<span className="font-mono font-semibold">
												{row.label}.
											</span>{" "}
											{row.text}
										</>
									) : (
										row.text
									)}
								</span>
								{correct && (
									<span className="inline-flex shrink-0 items-center gap-1 font-medium text-xs">
										<Check className="size-3.5" />
										Đáp án đúng
									</span>
								)}
							</li>
						);
					})}
				</ul>
			) : (
				<div className="flex flex-wrap items-center gap-2 rounded-md border border-verdict-correct bg-verdict-correct-soft px-3 py-2 text-sm text-verdict-correct">
					<Check className="size-4 shrink-0" />
					<span className="font-medium">Đáp án đúng:</span>
					<span className="font-semibold">{question.answer || "—"}</span>
					{altsText && (
						<span className="text-xs opacity-90">(Chấp nhận: {altsText})</span>
					)}
				</div>
			)}

			{hasExplanation && question.explanation && (
				<div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm">
					<p className="mb-1 font-medium text-muted-foreground text-xs">
						Giải thích
					</p>
					<RichTextBody
						text={question.explanation}
						className="text-foreground text-sm leading-relaxed"
					/>
				</div>
			)}
		</div>
	);
}

/**
 * Displays a single Study Pack item with two accessible tabs:
 * - "Đề & Đáp án" (teacher review mode with highlighted answer keys & explanations)
 * - "Làm thử" (interactive quiz simulation reusing PreviewQuizSimulation)
 */
export function StudyPackItemViewer({
	packId,
	item,
	activeTab,
	onTabChange,
}: StudyPackItemViewerProps) {
	const itemKey = `${packId}:${item.id}`;
	const [audioState, setAudioState] = useState<AudioState>(INITIAL_AUDIO_STATE);
	const [transcriptOpen, setTranscriptOpen] = useState(false);
	const audioAbortRef = useRef<AbortController | null>(null);
	const autoAudioRequestedKeyRef = useRef<string>("");

	const {
		data: detail,
		isPending,
		isError,
		refetch,
	} = useQuery({
		queryKey: ["study-pack-item-detail", packId, item.id],
		queryFn: () => getStudyPackItemDetail(packId, item.id),
	});

	// Revoke any active Blob URL whenever it is replaced or unmounted.
	useEffect(() => {
		const url = audioState.blobUrl;
		return () => {
			if (url) URL.revokeObjectURL(url);
		};
	}, [audioState.blobUrl]);

	// Reset viewer-local audio and transcript state when switching items.
	useEffect(() => {
		audioAbortRef.current?.abort();
		audioAbortRef.current = null;
		autoAudioRequestedKeyRef.current = "";
		setTranscriptOpen(false);
		setAudioState({
			itemKey,
			blobUrl: null,
			loading: false,
			error: null,
		});
		return () => {
			audioAbortRef.current?.abort();
			audioAbortRef.current = null;
		};
	}, [itemKey]);

	const loadAudio = useCallback(async () => {
		audioAbortRef.current?.abort();
		const controller = new AbortController();
		audioAbortRef.current = controller;
		const targetKey = `${packId}:${item.id}`;
		setAudioState((prev) => ({
			itemKey: targetKey,
			blobUrl: prev.itemKey === targetKey ? prev.blobUrl : null,
			loading: true,
			error: null,
		}));
		try {
			const nextUrl = await fetchStudyPackItemAudio(
				packId,
				item.id,
				controller.signal,
			);
			if (controller.signal.aborted) {
				URL.revokeObjectURL(nextUrl);
				return;
			}
			setAudioState({
				itemKey: targetKey,
				blobUrl: nextUrl,
				loading: false,
				error: null,
			});
		} catch {
			if (!controller.signal.aborted) {
				setAudioState({
					itemKey: targetKey,
					blobUrl: null,
					loading: false,
					error: "Không tải được file nghe. Vui lòng thử lại.",
				});
			}
		}
	}, [packId, item.id]);

	const currentAudioUrl =
		audioState.itemKey === itemKey ? audioState.blobUrl : null;
	const currentAudioLoading =
		audioState.itemKey === itemKey ? audioState.loading : false;
	const currentAudioError =
		audioState.itemKey === itemKey ? audioState.error : null;

	// Auto-fetch audio when switching to "Làm thử" on a listening item with audio.
	useEffect(() => {
		if (
			activeTab === "sim" &&
			detail?.hasAudio &&
			detail.skill === "listening" &&
			!currentAudioUrl &&
			!currentAudioLoading &&
			!currentAudioError &&
			autoAudioRequestedKeyRef.current !== itemKey
		) {
			autoAudioRequestedKeyRef.current = itemKey;
			void loadAudio();
		}
	}, [
		activeTab,
		detail?.hasAudio,
		detail?.skill,
		currentAudioUrl,
		currentAudioLoading,
		currentAudioError,
		itemKey,
		loadAudio,
	]);

	const sim = useMemo(
		() => (detail ? toQuizSimulation(packId, detail) : null),
		[packId, detail],
	);
	const { answers, grade, onAnswer, essay, onEssayChange, submit, reset } =
		useQuizSimulation(sim);

	if (isPending) {
		return (
			<Card variant="white" className="space-y-4 p-6">
				<div className="h-5 w-40 animate-pulse rounded bg-muted" />
				<div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
				<div className="h-32 w-full animate-pulse rounded bg-muted" />
			</Card>
		);
	}

	if (isError || !detail) {
		return (
			<Card variant="white" className="space-y-3 p-6">
				<p className="font-medium text-destructive text-sm">
					Không tải được chi tiết bài tập này.
				</p>
				<Button variant="outline" size="sm" onClick={() => void refetch()}>
					<RefreshCw className="size-3.5" />
					Thử lại
				</Button>
			</Card>
		);
	}

	const typeId = detail.type || "mcq";
	const questionTypes = inferQuestionTypes(detail.questions, typeId);
	const bankKind = optionBankKindFor(detail.skill, typeId, questionTypes);
	const typeDisplay = detail.type ? quizTypeDisplay(detail.type) : null;
	const rawImageUrl = detail.imageUrl.trim();
	const validImageUrl =
		rawImageUrl && ASSIGNMENT_IMAGE_SRC_PATTERN.test(rawImageUrl)
			? rawImageUrl
			: "";
	const hasPins = detail.questions.some((q) => isValidPin(q.pin));
	const itemNote = item.note.trim();
	const exerciseNote = detail.exerciseNote.trim();
	const hasItemNote = !isEmptyRichText(itemNote);
	const hasExerciseNote = !isEmptyRichText(exerciseNote);
	const sameNotes = hasItemNote && itemNote === exerciseNote;
	const hasAnyNote = hasItemNote || hasExerciseNote;
	const hasTranscript = !isEmptyRichText(detail.transcript);
	const canSimulate = isAutoSkill(detail.skill) && sim !== null;

	return (
		<div className="space-y-4">
			<Tabs
				tabs={[
					{ id: "key", label: "Đề & Đáp án" },
					{ id: "sim", label: "Làm thử" },
				]}
				active={activeTab}
				onChange={(next) => {
					if (next === "key" || next === "sim") {
						onTabChange(next);
					}
				}}
				className="mb-0"
			/>

			{activeTab === "key" ? (
				<Card variant="white" className="space-y-5 p-5 sm:p-6">
					<header className="space-y-2 border-border border-b pb-4">
						<div className="flex flex-wrap items-center gap-1.5">
							<Badge variant="outline">Buổi {item.dayIndex}</Badge>
							<Badge variant="secondary">
								{formatPackSkillLabel(detail.skill)}
							</Badge>
							{detail.band && <Badge variant="secondary">{detail.band}</Badge>}
							{detail.level && (
								<Badge variant="secondary">{detail.level}</Badge>
							)}
							{detail.questions.length > 0 && (
								<Badge variant="outline" className="tabular-nums">
									{detail.questions.length} câu
								</Badge>
							)}
						</div>
						<h2 className="font-semibold text-foreground text-xl">
							{detail.title}
						</h2>
						{(detail.source || typeDisplay?.label) && (
							<p className="text-muted-foreground text-xs">
								{[typeDisplay?.label, detail.source]
									.filter(Boolean)
									.join(" · ")}
							</p>
						)}
					</header>

					{hasAnyNote && (
						<div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3.5 text-sm">
							{sameNotes ? (
								<>
									<p className="font-medium text-foreground text-xs">Ghi chú</p>
									<RichTextBody
										text={itemNote}
										legacyWhitespace="pre-wrap"
										className="text-muted-foreground text-sm"
									/>
								</>
							) : (
								<>
									{hasItemNote && (
										<div>
											<p className="font-medium text-foreground text-xs">
												Ghi chú buổi học
											</p>
											<RichTextBody
												text={itemNote}
												legacyWhitespace="pre-wrap"
												className="text-muted-foreground text-sm"
											/>
										</div>
									)}
									{hasExerciseNote && (
										<div>
											<p className="font-medium text-foreground text-xs">
												Ghi chú bài tập
											</p>
											<RichTextBody
												text={exerciseNote}
												legacyWhitespace="pre-wrap"
												className="text-muted-foreground text-sm"
											/>
										</div>
									)}
								</>
							)}
						</div>
					)}

					{!isEmptyRichText(detail.intro) && (
						<div className="space-y-1">
							<p className="font-medium text-muted-foreground text-xs">
								Hướng dẫn
							</p>
							<RichTextBody
								text={detail.intro}
								className="whitespace-pre-wrap text-foreground text-sm leading-relaxed"
							/>
						</div>
					)}

					{!isEmptyRichText(detail.prompt) && (
						<div className="space-y-1">
							<p className="font-medium text-muted-foreground text-xs">
								Yêu cầu đề bài
							</p>
							<RichTextBody
								text={detail.prompt}
								className="whitespace-pre-wrap text-foreground text-sm leading-relaxed"
							/>
						</div>
					)}

					{(detail.hasAudio || hasTranscript) && (
						<div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
							{detail.hasAudio && (
								<div className="space-y-2.5">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div className="flex items-center gap-2 text-sm">
											<Volume2 className="size-4 text-muted-foreground" />
											<span className="font-medium text-foreground">
												{detail.audioName || "File nghe Listening"}
											</span>
										</div>
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={currentAudioLoading}
											onClick={() => void loadAudio()}
										>
											<Volume2 className="size-3.5" />
											{currentAudioLoading
												? "Đang tải…"
												: currentAudioUrl
													? "Tải lại file nghe"
													: "Nghe thử"}
										</Button>
									</div>

									{currentAudioError && (
										<p role="alert" className="text-destructive text-xs">
											{currentAudioError}
										</p>
									)}

									{currentAudioUrl && (
										<audio
											controls
											preload="metadata"
											src={currentAudioUrl}
											data-testid="study-pack-preview-audio"
											className="w-full"
										>
											<track kind="captions" />
										</audio>
									)}
								</div>
							)}

							{hasTranscript && (
								<div>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										aria-expanded={transcriptOpen}
										onClick={() => setTranscriptOpen((prev) => !prev)}
										className="px-2 text-xs"
									>
										<FileText className="size-3.5" />
										Transcript
										{transcriptOpen ? (
											<ChevronUp className="size-3.5" />
										) : (
											<ChevronDown className="size-3.5" />
										)}
									</Button>
									{transcriptOpen && (
										<div className="mt-2 rounded-md border border-border bg-card p-3.5">
											<RichTextBody
												text={detail.transcript}
												className="whitespace-pre-wrap font-normal text-foreground text-sm leading-[1.85]"
											/>
										</div>
									)}
								</div>
							)}
						</div>
					)}

					{validImageUrl &&
						(hasPins &&
						(isImageBasedType(detail.skill, typeId) ||
							questionTypes.some((qt) =>
								isImageBasedType(detail.skill, qt),
							)) ? (
							<PinOverlay
								imageUrl={validImageUrl}
								items={detail.questions}
								qStart={1}
							/>
						) : (
							<img
								src={validImageUrl}
								alt={`Hình minh hoạ ${detail.title}`}
								className="max-h-80 rounded-lg border border-border object-contain"
								referrerPolicy="no-referrer"
								loading="lazy"
							/>
						))}

					{!isEmptyRichText(detail.passage) && (
						<div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4 sm:p-5">
							<p className="font-medium text-muted-foreground text-xs">
								Nội dung bài đọc
							</p>
							<RichTextBody
								text={detail.passage}
								className="whitespace-pre-wrap font-normal text-[15px] text-foreground leading-[1.85]"
							/>
						</div>
					)}

					{detail.optionBank.length > 0 && (
						<OptionBankList
							bank={detail.optionBank}
							kind={bankKind ?? "letter"}
						/>
					)}

					<section
						aria-label="Danh sách câu hỏi và đáp án"
						className="space-y-3"
					>
						<h3 className="font-semibold text-foreground text-sm">
							Câu hỏi & Đáp án ({detail.questions.length})
						</h3>
						{detail.questions.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								Bài tập này không có danh sách câu hỏi tự chấm.
							</p>
						) : (
							<div className="space-y-3">
								{detail.questions.map((question, idx) => (
									<QuestionKeyCard
										key={`${detail.id}-q-${idx}`}
										index={idx}
										question={question}
										qType={questionTypes[idx] ?? typeId}
										optionBank={detail.optionBank}
									/>
								))}
							</div>
						)}
					</section>
				</Card>
			) : canSimulate && sim ? (
				<div className="space-y-3">
					{detail.hasAudio && currentAudioError && (
						<Card className="flex flex-wrap items-center justify-between gap-2 border-destructive/40 bg-destructive/5 p-3">
							<p className="text-destructive text-xs">{currentAudioError}</p>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => void loadAudio()}
							>
								<RefreshCw className="size-3.5" />
								Tải lại file nghe
							</Button>
						</Card>
					)}
					<PreviewQuizSimulation
						key={sim.simKey}
						sim={sim}
						answers={answers}
						grade={grade}
						onAnswer={onAnswer}
						essay={essay}
						onEssayChange={onEssayChange}
						onSubmit={submit}
						onReset={reset}
						audioSrc={currentAudioUrl}
						audioLoading={currentAudioLoading}
						audioError={currentAudioError}
						transcript={detail.transcript}
					/>
				</div>
			) : (
				<Card variant="white" className="space-y-3 p-6 text-center">
					<p className="font-medium text-foreground text-sm">
						{!isAutoSkill(detail.skill)
							? `Kỹ năng ${formatPackSkillLabel(detail.skill)} chưa hỗ trợ làm thử trực tiếp.`
							: "Bài tập này chưa có câu hỏi tự chấm để làm thử."}
					</p>
					<p className="text-muted-foreground text-xs">
						Bạn có thể xem toàn bộ nội dung đề và đáp án ở tab Đề & Đáp án.
					</p>
					<div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => onTabChange("key")}
						>
							Mở Đề & Đáp án
						</Button>
					</div>
				</Card>
			)}
		</div>
	);
}
