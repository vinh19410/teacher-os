import { ASSIGNMENT_IMAGE_SRC_PATTERN } from "@teacher-os/api/contracts";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { AnswerKeyGrid, QUESTION_MAX_COUNT } from "./answer-key-grid";
import {
	emptyItem,
	isBankableType,
	type QuestionItem,
	qStartOf,
	TYPE_HINTS,
} from "./assignment-presets";
import {
	applyBulkKeyPaste,
	type BulkKeyPasteLineError,
} from "./bulk-key-paste";
import { OptionBankEditor } from "./option-bank-editor";

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
}) {
	const qStart = qStartOf(skill, partId);
	// Guarded by skill too — a drifted draft must not surface the URL field
	// for a non-reading skill where no validation gate pairs with it (#269).
	const isDiagram = skill === "reading" && typeId === "diagram";
	// Same scheme policy as the contract — the thumbnail never renders an
	// unsafe URL, even while the field still carries a draft value.
	const safeImageUrl = imageUrl.trim();
	const showThumbnail =
		isDiagram &&
		safeImageUrl.length > 0 &&
		ASSIGNMENT_IMAGE_SRC_PATTERN.test(safeImageUrl);
	const hint = TYPE_HINTS[typeId];
	const atMax = items.length >= QUESTION_MAX_COUNT;
	const [pasteOpen, setPasteOpen] = useState(false);
	const [pasteRaw, setPasteRaw] = useState("");
	const [pasteOutcome, setPasteOutcome] = useState<{
		errors: BulkKeyPasteLineError[];
		appliedCount: number;
	} | null>(null);
	// A skill/part/type wipe resets the questions — a paste panel holding the
	// old type's raw lines must not survive it (review: INFO #3).
	// biome-ignore lint/correctness/useExhaustiveDependencies: skill/partId/typeId are the reset identity, not data used in the body — deliberate reset-on-structural-change
	useEffect(() => {
		setPasteOpen(false);
		setPasteRaw("");
		setPasteOutcome(null);
	}, [skill, partId, typeId]);
	const addQuestion = () => {
		if (atMax) return false;
		onItemsChange([...items, emptyItem(typeId)]);
		return true;
	};
	const insertPresetIntro = () => {
		if (!hint) return;
		if (!intro.trim() || KNOWN_HINTS.has(intro.trim())) {
			onIntroChange(hint);
			return;
		}
		// Custom teacher text: never overwrite silently.
		if (window.confirm("Thay câu lệnh hiện tại bằng câu lệnh chuẩn?")) {
			onIntroChange(hint);
		}
	};
	const applyPaste = () => {
		const outcome = applyBulkKeyPaste({
			raw: pasteRaw,
			typeId,
			qStart,
			items,
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
	return (
		<div className="flex flex-col gap-4 rounded-md border border-line bg-bg p-4">
			<div>
				<h3 className="font-display font-semibold text-base">
					Câu hỏi và đáp án đúng
				</h3>
				<p className="text-muted-fg text-xs">
					Đáp án đúng chỉ dùng để chấm tự động; học viên không thấy.
				</p>
			</div>
			{hint && (
				<button
					type="button"
					onClick={insertPresetIntro}
					className="self-start rounded-full border border-line bg-bg px-[14px] py-[6px] font-medium text-xs transition-all hover:border-fg"
				>
					Chèn câu lệnh chuẩn
				</button>
			)}
			<Field label="Hướng dẫn đề">
				<Textarea
					value={intro}
					placeholder={hint}
					onChange={(event) => onIntroChange(event.target.value)}
					className="min-h-24"
				/>
			</Field>
			{isBankableType(skill, typeId) && (
				<OptionBankEditor
					typeId={typeId}
					bank={optionBank}
					items={items}
					showErrors={showErrors}
					error={optionBankError}
					onBankChange={onBankChange}
					onItemsChange={onItemsChange}
				/>
			)}
			{isDiagram && (
				<div className="flex flex-col gap-1">
					<Field
						label="Ảnh biểu đồ (URL)"
						help="Chỉ nhận link ảnh https. Học viên thấy ảnh này khi làm đề."
						error={imageUrlError}
					>
						<Input
							value={imageUrl}
							placeholder="https://…"
							maxLength={500}
							onChange={(event) => onImageUrlChange(event.target.value)}
						/>
					</Field>
					{showThumbnail && (
						<img
							src={safeImageUrl}
							alt="Ảnh biểu đồ đề Reading"
							className="max-h-48 rounded-md border border-line"
							referrerPolicy="no-referrer"
							loading="lazy"
						/>
					)}
				</div>
			)}
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="font-medium text-muted-fg text-xs">
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
				optionBank={optionBank}
				onItemsChange={onItemsChange}
				onAddQuestion={addQuestion}
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
					<p className="text-muted-fg text-xs">
						Tối đa {QUESTION_MAX_COUNT} câu — khớp giới hạn của đề.
					</p>
				)}
			</div>
			<p className="text-right font-mono text-[11px] text-meta">
				{items
					.map(
						(item, index) => `${qStart + index} ${item.answer.trim() || "—"}`,
					)
					.join(" · ")}
			</p>
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
			className="flex flex-col gap-2 rounded-md border border-line bg-bg p-3"
		>
			<p className="text-muted-fg text-xs">
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
					<p className="text-danger text-xs">
						{appliedCount}/{totalLines} dòng đã áp dụng — {errors.length} dòng
						cần sửa:
					</p>
					<ul className="flex flex-col gap-0.5">
						{errors.map((error) => (
							<li key={error.line} className="text-danger text-xs">
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
