import type { AssignmentQuestion } from "@teacher-os/api/contracts";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import {
	type AnswerKeyPartChange,
	answerKeyPartChanges,
	runAnswerKeyApply,
} from "@/lib/repos/assignment-tests";
import {
	compareAnswerKey,
	parseTestAnswerKey,
	summarizeAnswerKeyDiff,
	type TestAnswerCell,
	type TestAnswerDiffRow,
	type TestAnswerDiffStatus,
	type TestAnswerKind,
	testAnswerCells,
} from "@/lib/test-answer-key";

/**
 * Answers checking panel (phase-05 Tasks 5.2/5.3) — hành vi Selfomy cho
 * full-test builder: **View All Answers** (grid theo số câu tuyệt đối),
 * **Paste answer key** (`1. A` / `1. True` / `1. Car / Cars` mỗi dòng),
 * **Compare** (diff expected vs actual), **Apply** (PATCH answer/alts vào
 * prompt từng part — confirm + chỉ liệt kê câu thực sự khác).
 *
 * Controlled component (mirror BulkKeyPastePanel): shell giữ keyText, mọi
 * dữ liệu đề đến từ snapshot qua `slots` — panel không fetch riêng. Số câu
 * LUÔN là số tuyệt đối từ computeTestRanges (qStart của slot), không bao
 * giờ index part-local.
 */

/** Slot part có prompt gán — shell build từ slotViews + assigned. */
export interface AnswersPanelSlot {
	part: string;
	label: string;
	promptId: string;
	/** Số câu bắt đầu từ computeTestRanges. */
	qStart: number;
	/** kindOf(prompt.type ?? genre) — quyết định chuẩn hóa đáp án. */
	kind: TestAnswerKind;
	questions: AssignmentQuestion[];
}

const KIND_LABEL: Record<TestAnswerKind, string> = {
	tfng: "TFNG",
	ynng: "YNNG",
	mcq4: "MCQ",
	mcq3: "MCQ",
	roman: "i–viii",
	letter: "A–H",
	text: "TEXT",
};

const DIFF_STATUS_CLASS: Record<TestAnswerDiffStatus, string> = {
	match: "text-success",
	mismatch: "text-danger",
	missing: "text-warn",
	extra: "text-warn",
};

export function AnswersCheckingPanel({
	slots,
	keyText,
	onKeyTextChange,
	busy,
	onPatchPart,
}: {
	slots: AnswersPanelSlot[];
	keyText: string;
	onKeyTextChange: (value: string) => void;
	/** submit.saving của shell — khóa nút Apply khi đang ghi. */
	busy: boolean;
	/** Ghi 1 part (PATCH update-assignment-prompt); resolve false = lỗi. */
	onPatchPart: (change: AnswerKeyPartChange) => Promise<boolean>;
}) {
	const [applying, setApplying] = useState(false);
	const [applyMessage, setApplyMessage] = useState<string | null>(null);
	const [applyError, setApplyError] = useState<string | null>(null);

	// Compare live từ keyText — mọi phép tính đều pure lib đã test riêng.
	const cells = useMemo(() => testAnswerCells(slots), [slots]);
	const parsed = useMemo(
		() =>
			parseTestAnswerKey(
				keyText,
				slots.map((slot) => ({
					part: slot.part,
					qStart: slot.qStart,
					count: slot.questions.length,
					kind: slot.kind,
				})),
			),
		[keyText, slots],
	);
	const diffs = useMemo(
		() => compareAnswerKey(parsed.entries, cells),
		[parsed, cells],
	);
	const summary = summarizeAnswerKeyDiff(diffs);
	const changes = useMemo(
		() => answerKeyPartChanges(diffs, slots),
		[diffs, slots],
	);
	const labelByPart = new Map(slots.map((slot) => [slot.part, slot.label]));
	const changingCount = changes.reduce(
		(sum, change) => sum + change.numbers.length,
		0,
	);

	async function handleApply() {
		if (
			!window.confirm(
				`Ghi đè đáp án ${changingCount} câu ở ${changes.length} part? Câu đã khớp giữ nguyên.`,
			)
		)
			return;
		setApplying(true);
		setApplyError(null);
		setApplyMessage(null);
		// Tuần tự từng part — lỗi thì dừng, KHÔNG rollback part đã ghi
		// (idempotent: chạy lại chỉ đụng câu còn lệch).
		const outcome = await runAnswerKeyApply(changes, onPatchPart);
		setApplying(false);
		if (outcome.failedPart) {
			setApplyError(
				`Ghi lỗi ở part "${
					labelByPart.get(outcome.failedPart) ?? outcome.failedPart
				}" — các part trước đã ghi xong và không hoàn tác; chạy lại Apply để tiếp phần còn lệch.`,
			);
			return;
		}
		setApplyMessage(
			`Đã ghi ${outcome.appliedQuestions} câu ở ${outcome.appliedParts} part — bảng so khớp đã tải lại theo dữ liệu mới.`,
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{/* 1. View All Answers — grid số câu tuyệt đối + kind chip. */}
			<section className="flex flex-col gap-2" aria-label="Toàn bộ đáp án">
				<span className="font-medium text-xs">
					View All Answers — {cells.length} câu
				</span>
				{cells.length === 0 ? (
					<p className="text-muted-fg text-xs">
						Chưa có câu hỏi nào được gán vào test — gán part có câu hỏi trước
						khi soát đáp án.
					</p>
				) : (
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
						{cells.map((cell) => (
							<AnswerCellView key={cell.number} cell={cell} />
						))}
					</div>
				)}
			</section>

			{/* 2. Paste answer key. */}
			<section className="flex flex-col gap-2" aria-label="Dán answer key">
				<span className="font-medium text-xs">Paste answer key</span>
				<Textarea
					value={keyText}
					aria-label="Nội dung key dán vào"
					placeholder={"1. A\n2. True\n3. Car / Cars"}
					onChange={(event) => onKeyTextChange(event.target.value)}
					className="min-h-32 font-mono"
				/>
				<p className="text-muted-fg text-xs">
					Mỗi dòng 1 câu: <code>1. A</code> / <code>1. True</code> /{" "}
					<code>1. Car / Cars</code>
				</p>
				{parsed.errors.length > 0 && (
					<div role="alert" className="flex flex-col gap-1">
						<p className="text-danger text-xs">
							{parsed.errors.length} dòng cần sửa (dòng hợp lệ vẫn so sánh
							được):
						</p>
						<ul className="flex flex-col gap-0.5">
							{parsed.errors.map((error) => (
								<li key={error.line} className="text-danger text-xs">
									Dòng {error.line}: {error.message}
								</li>
							))}
						</ul>
					</div>
				)}
			</section>

			{/* 3. Compare + Apply — chỉ hiện khi key có dòng hợp lệ. */}
			{parsed.entries.length > 0 && (
				<section
					className="flex flex-col gap-2"
					aria-label="So sánh key với đề"
				>
					<span className="font-medium text-xs">
						Compare — {summary.match} match, {summary.mismatch} mismatch
						{summary.missing > 0 ? `, ${summary.missing} missing` : ""}
						{summary.extra > 0 ? `, ${summary.extra} extra` : ""}
					</span>
					<ul className="flex flex-col divide-y divide-line rounded-md border border-line">
						{diffs.map((row) => (
							<AnswerDiffRowView key={row.number} row={row} />
						))}
					</ul>

					{changes.length > 0 ? (
						<div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3">
							{/* Confirm preview: chỉ câu thực sự khác actual. */}
							<p className="font-medium text-xs">
								Sẽ đổi {changingCount} câu ở {changes.length} part:
							</p>
							<ul className="flex flex-col gap-0.5">
								{changes.map((change) => (
									<li key={change.part} className="text-xs">
										{labelByPart.get(change.part) ?? change.part}: câu{" "}
										{change.numbers.join(", ")}
									</li>
								))}
							</ul>
							<Button
								type="button"
								size="sm"
								className="self-start"
								disabled={busy || applying}
								onClick={() => void handleApply()}
							>
								{busy || applying
									? "Đang ghi…"
									: `Áp dụng ${changingCount} thay đổi`}
							</Button>
							<p className="text-[11px] text-muted-fg">
								Ghi answer/alts thẳng vào prompt gốc của từng part — câu đã khớp
								không ghi lại.
							</p>
							{applyError && (
								<p role="alert" className="text-danger text-xs">
									{applyError}
								</p>
							)}
							{applyMessage && (
								<p role="status" className="text-success text-xs">
									{applyMessage}
								</p>
							)}
						</div>
					) : (
						<p className="text-success text-xs">
							Key khớp toàn bộ — không có gì để ghi.
						</p>
					)}
				</section>
			)}
		</div>
	);
}

function AnswerCellView({ cell }: { cell: TestAnswerCell }) {
	const answered = cell.answer.trim().length > 0;
	const full = cell.alts ? `${cell.answer} / ${cell.alts}` : cell.answer;
	return (
		<div
			title={answered ? full : "Chưa có đáp án"}
			className={`flex flex-col gap-0.5 rounded-md border px-2 py-1.5 ${
				answered ? "border-line" : "border-warn/40 bg-warn-soft"
			}`}
		>
			<span className="flex items-center justify-between gap-1">
				<span className="font-mono text-xs">Q{cell.number}</span>
				<span className="text-[10px] text-muted-fg">
					{KIND_LABEL[cell.kind]}
				</span>
			</span>
			<span className="truncate text-xs">
				{answered ? full : <span className="text-warn">Chưa có đáp án</span>}
			</span>
		</div>
	);
}

function AnswerDiffRowView({ row }: { row: TestAnswerDiffRow }) {
	const expected = row.expected
		? row.expected.alts
			? `${row.expected.answer} / ${row.expected.alts}`
			: row.expected.answer
		: "—";
	const actual = row.actual
		? row.actual.alts
			? `${row.actual.answer} / ${row.actual.alts}`
			: row.actual.answer || "—"
		: "—";
	return (
		<li
			data-status={row.status}
			className={`flex items-center gap-2 px-2 py-1 text-xs ${DIFF_STATUS_CLASS[row.status]}`}
		>
			<span className="w-10 shrink-0 font-mono">Q{row.number}</span>
			<span className="w-16 shrink-0">{row.status}</span>
			<span className="min-w-0 truncate">{`${expected} → ${actual}`}</span>
		</li>
	);
}
