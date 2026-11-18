import { ASSIGNMENT_IMAGE_SRC_PATTERN } from "@teacher-os/api/contracts";
import { isLibraryBankableType } from "@teacher-os/api/library-contracts";
import { htmlToPlainText } from "@teacher-os/api/rich-text";
import { Button } from "@teacher-os/ui/components/web-kit/button";
import {
	Field,
	Input,
	Textarea,
} from "@teacher-os/ui/components/web-kit/field";
import { RichTextEditor } from "@teacher-os/ui/components/web-kit/rich-text-editor";
import {
	CLOZE_EDITOR_TYPES,
	parseTableStem,
	TABLECOMP_TYPE,
} from "@teacher-os/ui/lib/cloze";
import { cn } from "@teacher-os/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { AnswerKeyGrid, QUESTION_MAX_COUNT } from "./answer-key-grid";
import {
	emptyItem,
	isBankableType,
	isImageBased,
	OPTION_BANK_MAX,
	type QuestionItem,
	qStartOf,
	TYPE_HINTS,
} from "./assignment-presets";
import {
	applyBulkKeyPaste,
	type BulkKeyPasteLineError,
} from "./bulk-key-paste";
import { ClozeEditor } from "./cloze-editor";
import { McqManyEditor } from "./mcq-many-editor";
import { OptionBankEditor } from "./option-bank-editor";
import { PinEditor } from "./pin-editor";
import { TableGridEditor } from "./table-grid-editor";

const KNOWN_HINTS = new Set(Object.values(TYPE_HINTS).map((hint) => hint));

export function QuestionKeyEditor({
	skill,
	partId,
	typeId,
	intro,
	items,
	showErrors,
	status,
	imageUrl,
	optionBank = [],
	onIntroChange,
	onImageUrlChange,
	onItemsChange,
	onBankChange,
	imageUrlError,
	optionBankError,
	questionsError,
	qStartOverride,
	showExplanation = false,
	view = "all",
	collapsibleRows = false,
	openRow = null,
	onOpenRowChange,
	imageId,
	maxBank = OPTION_BANK_MAX,
	libraryReadingMode = false,
	maxQuestions = QUESTION_MAX_COUNT,
	lockAddQuestion = false,
}: {
	skill: string;
	partId: string;
	typeId: string;
	intro: string;
	items: QuestionItem[];
	showErrors: boolean;
	/** FR9: missing stem/answer only block a `ready` save. */
	status: "draft" | "ready";
	imageUrl: string;
	/** Phase-02 FR3 — structured option bank for bankable matching types. */
	optionBank?: string[];
	onIntroChange: (value: string) => void;
	onImageUrlChange: (value: string) => void;
	onItemsChange: (items: QuestionItem[]) => void;
	onBankChange: (bank: string[]) => void;
	/** Pre-gated by the composer: only set when showErrors is on. */
	imageUrlError?: string;
	optionBankError?: string;
	/** Phase-03 FR7 — composer-level marker/caps mirror, shown at the block. */
	questionsError?: string;
	/** #424 Task 1.1 — số câu đầu (nhóm Selfomy); mặc định `qStartOf`. */
	qStartOverride?: number;
	/** #424 Task 1.1 — ô giải thích mỗi câu trong grid. */
	showExplanation?: boolean;
	/** #424 Task 1.3 — tách khối hướng dẫn khỏi khối câu hỏi (tab của
	 * GroupCard). Hai khối LUÔN mount; `view` chỉ điều khiển `hidden` — đổi
	 * tab không mất text đang gõ và cờ blur của grid. */
	view?: "all" | "intro" | "questions";
	/** #424 Task 1.6 — bật chế độ hàng thu gọn của grid (passthrough). */
	collapsibleRows?: boolean;
	openRow?: number | null;
	onOpenRowChange?: (index: number | null) => void;
	imageId?: string;
	maxBank?: number;
	libraryReadingMode?: boolean;
	maxQuestions?: number;
	lockAddQuestion?: boolean;
}) {
	const actualImageId = imageId ?? `assignment-field-image-${partId}`;
	const qStart = qStartOverride ?? qStartOf(skill, partId);
	const isMcqMany = typeId === "mcq_many";
	const supportsLibraryToggle =
		libraryReadingMode && (typeId === "summary" || typeId === "fill_blank");
	const [summaryWordBankOpen, setSummaryWordBankOpen] = useState(false);
	const wordBankChecked =
		libraryReadingMode &&
		typeId === "summary" &&
		(optionBank.length > 0 || summaryWordBankOpen);
	const [completionMode, setCompletionMode] = useState<"cloze" | "table">(() =>
		items.some((item) => parseTableStem(item.stem) !== null)
			? "table"
			: "cloze",
	);
	const itemsRef = useRef(items);
	itemsRef.current = items;

	// Bank là prompt-level nhưng editor hiện khi type đề HOẶC bất kỳ câu
	// bankable (đề trộn dạng) — không thì cụm bankable không có chỗ nhập bank
	// mà instruction take screen vẫn nói "choose from the option bank".
	const bankableCheck = libraryReadingMode
		? isLibraryBankableType
		: isBankableType;
	const bankTypeId =
		typeId === "summary"
			? wordBankChecked
				? "summary"
				: null
			: bankableCheck(skill, typeId)
				? typeId
				: (items.find(
						(item) =>
							item.type &&
							(item.type !== "summary" || optionBank.length > 0) &&
							bankableCheck(skill, item.type),
					)?.type ?? null);
	// Phase-04 FR2/FR3 — image-based pairs (reading diagram + listening map,
	// skill-qualified) surface the URL field + pin editor; `map` gains the
	// field it never had while writing task1's shared `map` id stays clear.
	const isImage = isImageBased(skill, typeId);
	// Same scheme policy as the contract — the thumbnail never renders an
	// unsafe URL, even while the field still carries a draft value.
	const safeImageUrl = imageUrl.trim();
	const showThumbnail =
		isImage &&
		safeImageUrl.length > 0 &&
		ASSIGNMENT_IMAGE_SRC_PATTERN.test(safeImageUrl);
	const hint = TYPE_HINTS[typeId];
	const atMax = lockAddQuestion || items.length >= maxQuestions;
	// Phase-03: the 8 cloze completion types get the click-to-blank editor,
	// tablecomp gets the grid editor; `shortans` keeps the phase-01 text rows
	// (no content block — coordinator scope note).
	// `gap` (Grammar/Vocabulary) reuses the click-to-blank editor without being an IELTS completion type.
	// Library Reading mode (#762): `summary`/`fill_blank` support cloze/table toggle, `diagram` shows ClozeEditor.
	const showClozeEditor = supportsLibraryToggle
		? completionMode === "cloze"
		: CLOZE_EDITOR_TYPES.has(typeId) ||
			typeId === "gap" ||
			(libraryReadingMode && (typeId === "fill_blank" || typeId === "diagram"));
	const showTableEditor = supportsLibraryToggle
		? completionMode === "table"
		: typeId === TABLECOMP_TYPE;
	const [pasteOpen, setPasteOpen] = useState(false);
	const [pasteRaw, setPasteRaw] = useState("");
	const [pasteOutcome, setPasteOutcome] = useState<{
		errors: BulkKeyPasteLineError[];
		appliedCount: number;
	} | null>(null);
	// Phase-04 FR3 — pin → row selection (one-way: the pin editor drives it).
	const [selectedPin, setSelectedPin] = useState<number | null>(null);
	// A skill/part/type wipe resets the questions — a paste panel holding the
	// old type's raw lines (or a pin selection pointing at wiped rows) must
	// not survive it (review: INFO #3).
	// biome-ignore lint/correctness/useExhaustiveDependencies: skill/partId/typeId are the reset identity, not data used in the body — deliberate reset-on-structural-change
	useEffect(() => {
		setPasteOpen(false);
		setPasteRaw("");
		setPasteOutcome(null);
		setSelectedPin(null);
		setSummaryWordBankOpen(false);
		setCompletionMode(
			itemsRef.current.some((item) => parseTableStem(item.stem) !== null)
				? "table"
				: "cloze",
		);
	}, [skill, partId, typeId]);
	const handleToggleSummaryWordBank = (checked: boolean) => {
		if (checked) {
			setSummaryWordBankOpen(true);
			return;
		}
		if (
			optionBank.length > 0 &&
			!window.confirm(
				"Tắt ngân hàng từ sẽ xóa toàn bộ các từ trong ngân hàng. Tiếp tục?",
			)
		) {
			return;
		}
		setSummaryWordBankOpen(false);
		if (optionBank.length > 0) {
			onBankChange([]);
		}
	};
	const addQuestion = () => {
		if (atMax) return false;
		const fresh = emptyItem(typeId);
		const lastItem = items.at(-1);
		if (
			typeId === "mcq" &&
			(lastItem?.type ?? typeId) === "mcq" &&
			lastItem?.opts?.length === 3
		) {
			fresh.opts = ["", "", ""];
		}
		onItemsChange([...items, fresh]);
		return true;
	};
	const insertPresetIntro = () => {
		if (!hint) return;
		// intro is rich HTML — compare on the extracted plain text so both a
		// legacy plain hint and its editor round-trip count as "the preset".
		const introPlain = htmlToPlainText(intro).trim();
		if (!introPlain || KNOWN_HINTS.has(introPlain)) {
			onIntroChange(`<p>${hint}</p>`);
			return;
		}
		// Custom teacher text: never overwrite silently.
		if (window.confirm("Thay câu lệnh hiện tại bằng câu lệnh chuẩn?")) {
			onIntroChange(`<p>${hint}</p>`);
		}
	};
	const applyPaste = () => {
		const outcome = applyBulkKeyPaste({
			raw: pasteRaw,
			typeId,
			qStart,
			items,
			optionBank,
			maxBank,
		});
		onItemsChange(outcome.items);
		if (outcome.errors.length > 0) {
			setPasteOutcome({
				errors: outcome.errors,
				appliedCount: outcome.appliedCount,
			});
			return;
		}
		setPasteOpen(false);
		setPasteRaw("");
		setPasteOutcome(null);
	};
	const closePaste = () => {
		setPasteOpen(false);
		setPasteOutcome(null);
	};
	const requirePin =
		isImage &&
		status === "ready" &&
		!(libraryReadingMode && skill === "reading");
	return (
		<div className="flex flex-col gap-4 rounded-md rounded-md bg-muted p-4">
			<div>
				<h3 className="font-semibold text-base">Câu hỏi và đáp án đúng</h3>
				<p className="text-muted-foreground text-xs">
					Đáp án đúng chỉ dùng để chấm tự động; học viên không thấy.
				</p>
			</div>
			<div hidden={view === "questions"}>
				{hint && (
					<button
						type="button"
						onClick={insertPresetIntro}
						className="self-start rounded-md rounded-md border border-input bg-transparent px-[14px] py-[6px] font-medium text-xs transition-colors hover:text-primary"
					>
						Chèn câu lệnh chuẩn
					</button>
				)}
				<Field label="Hướng dẫn đề">
					<RichTextEditor
						value={intro}
						onChange={onIntroChange}
						placeholder={hint}
						contentClassName="[&_.ProseMirror]:min-h-24"
					/>
				</Field>
			</div>
			<div hidden={view === "intro"} className="flex flex-col gap-3">
				{supportsLibraryToggle && (
					<fieldset
						aria-label="Chế độ soạn nội dung"
						className="m-0 flex flex-wrap items-center gap-1.5 border-0 p-0"
					>
						<button
							type="button"
							aria-pressed={completionMode === "cloze"}
							onClick={() => setCompletionMode("cloze")}
							className={cn(
								"rounded-full border px-[10px] py-[4px] font-medium text-xs focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
								completionMode === "cloze"
									? "border-primary bg-primary text-primary-foreground"
									: "border-border text-muted-foreground hover:border-primary",
							)}
						>
							Đoạn văn (Cloze)
						</button>
						<button
							type="button"
							aria-pressed={completionMode === "table"}
							onClick={() => setCompletionMode("table")}
							className={cn(
								"rounded-full border px-[10px] py-[4px] font-medium text-xs focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
								completionMode === "table"
									? "border-primary bg-primary text-primary-foreground"
									: "border-border text-muted-foreground hover:border-primary",
							)}
						>
							Bảng (Grid)
						</button>
					</fieldset>
				)}
				{libraryReadingMode && typeId === "summary" && (
					<label className="flex cursor-pointer items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={wordBankChecked}
							onChange={(event) =>
								handleToggleSummaryWordBank(event.target.checked)
							}
							className="size-4 shrink-0 accent-primary"
						/>
						<span>Dùng ngân hàng từ (Word Bank)</span>
					</label>
				)}
				{showClozeEditor && (
					<ClozeEditor
						typeId={typeId}
						items={items}
						maxBlanks={maxQuestions}
						onApply={onItemsChange}
					/>
				)}
				{showTableEditor && (
					<TableGridEditor
						items={items}
						maxBlanks={maxQuestions}
						onApply={onItemsChange}
					/>
				)}
				{showErrors && questionsError && (
					<p role="alert" className="text-destructive text-xs">
						{questionsError}
					</p>
				)}
				{bankTypeId && (
					<OptionBankEditor
						typeId={bankTypeId}
						bank={optionBank}
						items={items}
						showErrors={showErrors}
						error={optionBankError}
						maxBank={maxBank}
						title={
							bankTypeId === "summary" ? "Ngân hàng từ (Word Bank)" : undefined
						}
						onBankChange={onBankChange}
						onItemsChange={onItemsChange}
					/>
				)}
				{isImage && (
					<div className="flex flex-col gap-1">
						<Field
							label={
								skill === "listening" ? "Ảnh bản đồ (URL)" : "Ảnh biểu đồ (URL)"
							}
							help="Chỉ nhận link ảnh https. Học viên thấy ảnh này khi làm đề."
							error={imageUrlError}
							htmlFor={actualImageId}
						>
							<Input
								id={actualImageId}
								className="scroll-mt-24 scroll-mb-28"
								value={imageUrl}
								placeholder="https://…"
								maxLength={500}
								onChange={(event) => onImageUrlChange(event.target.value)}
							/>
						</Field>
						{showThumbnail && (
							<PinEditor
								imageUrl={safeImageUrl}
								items={items}
								qStart={qStart}
								selectedIndex={selectedPin}
								onItemsChange={onItemsChange}
								onSelect={setSelectedPin}
							/>
						)}
					</div>
				)}
				{isMcqMany ? (
					<McqManyEditor
						items={items}
						qStart={qStart}
						showErrors={showErrors}
						requireFilled={status === "ready"}
						showExplanation={showExplanation}
						maxTotalQuestions={maxQuestions}
						lockAddQuestion={lockAddQuestion}
						onItemsChange={onItemsChange}
					/>
				) : (
					<>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="font-medium text-muted-foreground text-xs">
								{items.length}/{QUESTION_MAX_COUNT} câu
							</span>
							<Button
								type="button"
								size="sm"
								variant="secondary"
								onClick={() => setPasteOpen(true)}
							>
								Thêm key hàng loạt
							</Button>
						</div>
						{pasteOpen && (
							<BulkKeyPastePanel
								value={pasteRaw}
								onValueChange={(next) => {
									setPasteRaw(next);
									// A stale outcome list must not linger over edited content.
									if (pasteOutcome) setPasteOutcome(null);
								}}
								errors={pasteOutcome?.errors ?? []}
								appliedCount={pasteOutcome?.appliedCount ?? 0}
								onApply={applyPaste}
								onClose={closePaste}
							/>
						)}
						{/* Remount on skill/part/type change so the index-keyed blur flags
					never leak across wipes (review #3). */}
						<AnswerKeyGrid
							key={`${skill}-${partId}-${typeId}`}
							typeId={typeId}
							skill={skill}
							partId={partId}
							items={items}
							showErrors={showErrors}
							requireFilled={status === "ready"}
							requirePin={requirePin}
							selectedIndex={selectedPin}
							optionBank={optionBank}
							maxBank={maxBank}
							onItemsChange={onItemsChange}
							onAddQuestion={addQuestion}
							qStartOverride={qStart}
							showExplanation={showExplanation}
							collapsible={collapsibleRows}
							openRow={openRow}
							onOpenRowChange={onOpenRowChange}
							libraryReadingMode={libraryReadingMode}
						/>
						<div className="flex flex-col gap-1">
							<Button
								type="button"
								variant="secondary"
								onClick={addQuestion}
								disabled={atMax}
							>
								Thêm câu
							</Button>
							{atMax && (
								<p className="text-muted-foreground text-xs">
									Tối đa {QUESTION_MAX_COUNT} câu — khớp giới hạn của đề.
								</p>
							)}
						</div>
						<p className="text-right text-muted-foreground text-xs">
							{items
								.map(
									(item, index) =>
										`${qStart + index} ${item.answer.trim() || "—"}`,
								)
								.join(" · ")}
						</p>
					</>
				)}
			</div>
		</div>
	);
}

export function BulkKeyPastePanel({
	value,
	onValueChange,
	errors,
	appliedCount,
	onApply,
	onClose,
}: {
	value: string;
	onValueChange: (value: string) => void;
	errors: BulkKeyPasteLineError[];
	appliedCount: number;
	onApply: () => void;
	onClose: () => void;
}) {
	const totalLines = value.split(/\r?\n/).filter((line) => line.trim()).length;
	return (
		<div
			role="dialog"
			aria-label="Thêm key hàng loạt"
			className="flex flex-col gap-2 rounded-md rounded-md bg-muted p-3"
		>
			<p className="text-muted-foreground text-xs">
				Mỗi dòng: <code>1. TRUE</code> hoặc{" "}
				<code>3. câu lệnh / alt1 / alt2</code>. Dòng số <code>n</code> ghi vào
				đúng câu <code>Qn</code> của phần này — dòng sai số hoặc trùng số sẽ
				được báo riêng, phần hợp lệ vẫn áp dụng.
			</p>
			<Textarea
				value={value}
				aria-label="Nội dung key dán vào"
				placeholder={"1. TRUE\n2. FALSE\n3. northern / north"}
				onChange={(event) => onValueChange(event.target.value)}
				className="min-h-32 font-mono"
			/>
			{errors.length > 0 && (
				<div role="alert" className="flex flex-col gap-1">
					<p className="text-destructive text-xs">
						{appliedCount}/{totalLines} dòng đã áp dụng — {errors.length} dòng
						cần sửa:
					</p>
					<ul className="flex flex-col gap-0.5">
						{errors.map((error) => (
							<li key={error.line} className="text-destructive text-xs">
								Dòng {error.line}: {error.message}
							</li>
						))}
					</ul>
				</div>
			)}
			<div className="flex gap-2">
				<Button type="button" size="sm" onClick={onApply}>
					Áp dụng
				</Button>
				<Button type="button" size="sm" variant="ghost" onClick={onClose}>
					Đóng
				</Button>
			</div>
		</div>
	);
}
