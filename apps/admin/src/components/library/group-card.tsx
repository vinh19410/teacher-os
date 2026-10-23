import { quizTypeDisplay } from "@teacher-os/api/contracts";
import {
	countClozeMarkers,
	type LibraryQuestionGroup,
	type LibrarySkill,
	librarySkillTypes,
} from "@teacher-os/api/library-contracts";
import { htmlToPlainText } from "@teacher-os/api/rich-text";
import type { QuestionItem } from "@teacher-os/ui/components/assignments/editor/assignment-presets";
import { CardControls } from "@teacher-os/ui/components/assignments/editor/card-controls";
import { QuestionKeyEditor } from "@teacher-os/ui/components/assignments/editor/question-key-editor";
import { Button } from "@teacher-os/ui/components/web-kit/button";
import { Field, Select } from "@teacher-os/ui/components/web-kit/field";
import { CLOZE_EDITOR_TYPES } from "@teacher-os/ui/lib/cloze";
import { useEffect, useRef, useState } from "react";
import { CardTabs } from "./card-tabs";

/**
 * Thẻ MỘT nhóm câu (#424 Task 3.3 + #420 Task 4.5). Ba tab nhưng chỉ MỘT
 * instance `QuestionKeyEditor` luôn mount (đổi tab không mất text đang gõ
 * và cờ blur của grid); tab Thiết lập ẩn wrapper chứ không unmount editor.
 * Thân thẻ cũng luôn mount (ẩn bằng `hidden`) để focus theo cây điều
 * hướng cuộn tới đúng hàng (`group-{slot}-{gi}-q{offset}` luôn trong DOM).
 */

export type GroupCardTab = "intro" | "settings" | "questions";

const EXCERPT_MAX = 80;

/** Trích dẫn hướng dẫn nhóm: rich HTML → text thuần, rút gọn — không render
 * HTML, không slice thô chuỗi gốc (S4). */
export function instructionExcerpt(instruction: string): string {
	const plain = htmlToPlainText(instruction).trim().replace(/\s+/g, " ");
	if (plain.length <= EXCERPT_MAX) return plain;
	return `${plain.slice(0, EXCERPT_MAX)}…`;
}

export function GroupCard({
	skill,
	slot,
	index,
	group,
	items,
	qStart,
	open,
	onToggle,
	activeTab,
	onTabChange,
	openRow,
	onOpenRowChange,
	rowIdPrefix,
	onPatch,
	onItemsChange,
	onMove,
	onRemove,
	canMoveUp,
	canMoveDown,
	imageUrl,
	onImageUrlChange,
	showErrors,
	status,
	errorFor,
	lockAddQuestion,
}: {
	skill: LibrarySkill;
	slot: string;
	/** Thứ tự nhóm trong part (0-based). */
	index: number;
	group: LibraryQuestionGroup;
	/** Dải câu của nhóm (`value.questions.slice(start, start+count)`). */
	items: QuestionItem[];
	/** Số thứ tự câu đầu của part (fold) — nhóm cộng `startIndex`. */
	qStart: number;
	open: boolean;
	onToggle: () => void;
	activeTab: GroupCardTab;
	onTabChange: (tab: GroupCardTab) => void;
	openRow: number | null;
	onOpenRowChange: (row: number | null) => void;
	/** Dùng làm `partId` của editor → id hàng `group-{slot}-{gi}-q{n}`. */
	rowIdPrefix: string;
	onPatch: (
		patch: Partial<
			Pick<
				LibraryQuestionGroup,
				| "type"
				| "instruction"
				| "optionBank"
				| "answersInline"
				| "splitContent"
				| "dragDrop"
			>
		>,
	) => void;
	onItemsChange: (items: QuestionItem[]) => void;
	onMove: (dir: -1 | 1) => void;
	onRemove: () => void;
	canMoveUp: boolean;
	canMoveDown: boolean;
	imageUrl: string;
	onImageUrlChange: (imageUrl: string) => void;
	showErrors: boolean;
	status: "draft" | "ready";
	errorFor: (field: string) => string | undefined;
	/** Tổng part đạt 40 câu — chặn thêm câu mới (schema chặn 40/PART). */
	lockAddQuestion?: boolean;
}) {
	const [confirmRemove, setConfirmRemove] = useState(false);
	const cancelRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (confirmRemove) cancelRef.current?.focus();
	}, [confirmRemove]);

	useEffect(() => {
		if (!confirmRemove) return;
		const onKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") setConfirmRemove(false);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [confirmRemove]);

	const label = `nhóm câu ${index + 1}`;
	const typeError = errorFor(`groups.${index}.type`);
	const answersInlineError = errorFor(`groups.${index}.answersInline`);
	const optionBankError = errorFor(`groups.${index}.optionBank`);
	const blankCount = items.filter(
		(item) => countClozeMarkers(item.stem) === 1,
	).length;
	const blanksMismatch = group.answersInline && blankCount !== items.length;
	const questionsTabError =
		optionBankError !== undefined ||
		errorFor("imageUrl") !== undefined ||
		(showErrors &&
			items.some((item) => !item.stem.trim() || !item.answer.trim()));

	const tabs = [
		{ id: "intro" as const, label: "Hướng dẫn" },
		{
			id: "settings" as const,
			label: "Thiết lập",
			hasError: typeError !== undefined || answersInlineError !== undefined,
		},
		{
			id: "questions" as const,
			label: "Câu hỏi",
			count: items.length,
			hasError: questionsTabError,
		},
	];

	const handleItemsChange = (next: QuestionItem[]) => {
		// Part đã đủ 40 câu → từ chối thêm (QKE đếm per-nhóm; schema chặn
		// 40/PART nên cửa chặn cuối nằm ở đây).
		if (lockAddQuestion && next.length > items.length) return;
		// Hàng mới thêm tự mở (F6/A3) — appends luôn ở cuối dải.
		if (next.length > items.length) onOpenRowChange(next.length - 1);
		onItemsChange(next);
	};

	const first = qStart + group.startIndex;
	const typeOptions = librarySkillTypes(skill).includes(group.type)
		? librarySkillTypes(skill)
		: [group.type, ...librarySkillTypes(skill)];

	return (
		<section
			id={`group-${slot}-${index}`}
			aria-label={`Nhóm câu ${index + 1}`}
			className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
		>
			<header className="flex flex-wrap items-center gap-2">
				<span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs">
					Nhóm câu {index + 1}
				</span>
				<span className="text-muted-foreground text-xs">
					{quizTypeDisplay(group.type).label} · Câu {first}–
					{first + group.count - 1}
				</span>
				{instructionExcerpt(group.instruction) && (
					<span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
						{instructionExcerpt(group.instruction)}
					</span>
				)}
				<CardControls
					label={label}
					open={open}
					onToggle={onToggle}
					onMoveUp={canMoveUp ? () => onMove(-1) : undefined}
					onMoveDown={canMoveDown ? () => onMove(1) : undefined}
					onRemove={() => setConfirmRemove(true)}
				/>
			</header>

			{/* Thân luôn mount (ẩn bằng hidden) — focus theo cây cuộn tới hàng
			    trong nhóm đóng được mà không cần render điều kiện. */}
			<div hidden={!open} className="flex flex-col gap-3">
				<CardTabs
					tabs={tabs}
					active={activeTab}
					onSelect={(id) => onTabChange(id as GroupCardTab)}
					idPrefix={`${rowIdPrefix}-tabs`}
					size="sm"
					aria-label={`Các tab ${label}`}
				/>
				{/* MỘT instance QKE cho cả 3 tab; tab Thiết lập ẩn wrapper. */}
				<div hidden={activeTab === "settings"}>
					<QuestionKeyEditor
						skill={skill}
						partId={rowIdPrefix}
						typeId={group.type}
						intro={group.instruction}
						items={items}
						showErrors={showErrors}
						status={status}
						imageUrl={imageUrl}
						optionBank={group.optionBank}
						onIntroChange={(instruction) => onPatch({ instruction })}
						onImageUrlChange={onImageUrlChange}
						onItemsChange={handleItemsChange}
						onBankChange={(optionBank) => onPatch({ optionBank })}
						imageUrlError={errorFor("imageUrl")}
						optionBankError={optionBankError}
						qStartOverride={qStart + group.startIndex}
						showExplanation
						view={activeTab === "intro" ? "intro" : "questions"}
						collapsibleRows
						openRow={openRow}
						onOpenRowChange={onOpenRowChange}
					/>
				</div>
				<div hidden={activeTab !== "settings"} className="flex flex-col gap-3">
					<Field
						label="Dạng bài"
						required
						htmlFor={`${rowIdPrefix}-type`}
						error={typeError}
					>
						<Select
							id={`${rowIdPrefix}-type`}
							value={group.type}
							onChange={(event) => onPatch({ type: event.target.value })}
						>
							{typeOptions.map((type) => (
								<option key={type} value={type}>
									{type}
								</option>
							))}
						</Select>
					</Field>
					<div className="flex flex-col gap-2 text-sm">
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={group.answersInline}
								disabled={!CLOZE_EDITOR_TYPES.has(group.type)}
								onChange={(event) =>
									onPatch({ answersInline: event.target.checked })
								}
							/>
							Ô trả lời nằm trong hướng dẫn
						</label>
						<p className="text-muted-foreground text-xs">
							Chỉ dùng cho dạng điền từ.
						</p>
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={group.splitContent}
								onChange={(event) =>
									onPatch({ splitContent: event.target.checked })
								}
							/>
							Tách nội dung và câu hỏi
						</label>
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={group.dragDrop}
								onChange={(event) =>
									onPatch({ dragDrop: event.target.checked })
								}
							/>
							Cho phép kéo thả đáp án
						</label>
						{answersInlineError && (
							<p role="alert" className="text-destructive text-xs">
								{answersInlineError}
							</p>
						)}
						{group.answersInline && (
							<p
								className={
									blanksMismatch
										? "text-destructive text-xs"
										: "text-muted-foreground text-xs"
								}
							>
								Câu có ô trống: {blankCount}/{items.length}
							</p>
						)}
					</div>
				</div>
			</div>

			{confirmRemove && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<button
						type="button"
						aria-label="Đóng hộp thoại"
						tabIndex={-1}
						className="absolute inset-0 cursor-default bg-black/50"
						onClick={() => setConfirmRemove(false)}
					/>
					<div
						role="dialog"
						aria-modal="true"
						aria-labelledby={`${rowIdPrefix}-remove-title`}
						className="relative flex w-full max-w-md flex-col gap-4 rounded-xl border bg-card p-5 shadow-lg"
					>
						<div>
							<h2
								id={`${rowIdPrefix}-remove-title`}
								className="font-semibold text-base"
							>
								Xóa nhóm câu {index + 1}?
							</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								Toàn bộ {group.count} câu trong nhóm (câu hỏi, đáp án, giải
								thích) sẽ bị xóa vĩnh viễn. Không thể hoàn tác.
							</p>
						</div>
						<div className="flex justify-end gap-2">
							<Button
								ref={cancelRef}
								variant="outline"
								onClick={() => setConfirmRemove(false)}
							>
								Hủy
							</Button>
							<Button
								variant="destructive"
								onClick={() => {
									setConfirmRemove(false);
									onRemove();
								}}
							>
								Xóa nhóm câu
							</Button>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}
