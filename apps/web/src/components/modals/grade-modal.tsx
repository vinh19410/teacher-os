import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import type { KernelFormNotice } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

const DEFAULT_SCORE = "6.0";

/**
 * operationIds whose comment POST ended outcome-unknown (may or may not be
 * committed server-side). A reopen for that assignment reuses the id so the
 * server dedupes instead of inserting a duplicate comment; every resolved
 * outcome (refreshed/committed/definite) clears the entry.
 */
const unresolvedCommentOps = new Map<string, string>();

export function GradeModal({
	open,
	onClose,
	assignmentId,
}: {
	open: boolean;
	onClose: () => void;
	assignmentId: string;
}) {
	const { assignmentById, dispatch, refresh } = useData();
	const assignment = assignmentById(assignmentId);
	const [task, setTask] = useState(DEFAULT_SCORE);
	const [coherence, setCoherence] = useState(DEFAULT_SCORE);
	const [lexical, setLexical] = useState(DEFAULT_SCORE);
	const [grammar, setGrammar] = useState(DEFAULT_SCORE);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState<string | undefined>();
	const [saving, setSaving] = useState(false);
	const [notice, setNotice] = useState<KernelFormNotice | undefined>();
	const [gradeSaved, setGradeSaved] = useState(false);
	const [commentOperationId, setCommentOperationId] = useState<string>(() =>
		crypto.randomUUID(),
	);
	const inputsDisabled = saving || gradeSaved;

	function readScores() {
		return {
			task: Number.parseFloat(task),
			coherence: Number.parseFloat(coherence),
			lexical: Number.parseFloat(lexical),
			grammar: Number.parseFloat(grammar),
		};
	}

	// The modal stays mounted across assignments (route component reuse),
	// so a fresh open must drop the previous assignment's scores and error —
	// otherwise grading B silently submits A's persisted scores.
	// assignmentId is intentionally in deps: the param can change while the
	// modal is open, and only the dep re-runs this reset.
	useEffect(() => {
		if (!open) return;
		setTask(DEFAULT_SCORE);
		setCoherence(DEFAULT_SCORE);
		setLexical(DEFAULT_SCORE);
		setGrammar(DEFAULT_SCORE);
		setFeedback("");
		setError(undefined);
		setNotice(undefined);
		setGradeSaved(false);
		// Reuse an unresolved (outcome-unknown) operationId so the replay
		// dedupes server-side instead of duplicating the comment.
		setCommentOperationId(
			unresolvedCommentOps.get(assignmentId) ?? crypto.randomUUID(),
		);
	}, [open, assignmentId]);

	if (!assignment) return null;

	async function submit(e: FormEvent) {
		e.preventDefault();
		// A pending committed/unknown notice blocks replay: the grade or
		// comment may already be saved, and re-submitting could duplicate.
		if (saving || notice !== undefined) return;
		const feedbackText = feedback.trim();
		setSaving(true);
		try {
			if (!gradeSaved) {
				const scores = readScores();
				const invalid = Object.values(scores).some(
					(v) => Number.isNaN(v) || v < 0 || v > 9,
				);
				if (invalid) {
					setError("Điểm mỗi tiêu chí từ 0 đến 9 (bước 0.5).");
					return;
				}
				const graded = await dispatch({
					type: "grade-assignment",
					assignmentId,
					scores,
				});
				if (graded.kind === "definite-failure") {
					setError("Không lưu được điểm — thử lại.");
					return;
				}
				if (graded.kind !== "refreshed") {
					setNotice(
						graded.kind === "committed"
							? { kind: "committed" }
							: { kind: "unknown" },
					);
					return;
				}
				setGradeSaved(true);
			}

			if (feedbackText) {
				const comment = await dispatch({
					type: "add-comment-bank",
					text: feedbackText,
					operationId: commentOperationId,
				});
				if (comment.kind === "definite-failure") {
					// Nothing was committed under this id — regenerate so a retry
					// with edited text cannot hit the operationId-payload 409.
					unresolvedCommentOps.delete(assignmentId);
					setCommentOperationId(crypto.randomUUID());
					setError("Điểm đã lưu, nhưng nhận xét chưa lưu — thử lại.");
					return;
				}
				if (comment.kind === "outcome-unknown") {
					// Keep the operationId: replaying with it dedupes to 200 if
					// the lost response actually followed a committed write.
					unresolvedCommentOps.set(assignmentId, commentOperationId);
					setNotice({ kind: "unknown" });
					return;
				}
				if (comment.kind === "committed") {
					unresolvedCommentOps.delete(assignmentId);
					setNotice({ kind: "committed" });
					return;
				}
				unresolvedCommentOps.delete(assignmentId);
			}
		} finally {
			setSaving(false);
		}
		setError(undefined);
		setNotice(undefined);
		setFeedback("");
		onClose();
	}

	async function reconcileAndFinish() {
		if (saving) return;
		setSaving(true);
		const applied = await refresh();
		setSaving(false);
		if (!applied) {
			setNotice({ kind: "reconcile-failed" });
			return;
		}
		unresolvedCommentOps.delete(assignmentId);
		setNotice(undefined);
		setError(undefined);
		setFeedback("");
		onClose();
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title={`Chấm bài — ${assignment.title}`}
		>
			<form onSubmit={submit}>
				<div className="grid grid-cols-2 gap-3">
					<Field label="Task Response">
						<Input
							type="number"
							step="0.5"
							min="0"
							max="9"
							value={task}
							disabled={inputsDisabled}
							onChange={(e) => setTask(e.target.value)}
						/>
					</Field>
					<Field label="Coherence">
						<Input
							type="number"
							step="0.5"
							min="0"
							max="9"
							value={coherence}
							disabled={inputsDisabled}
							onChange={(e) => setCoherence(e.target.value)}
						/>
					</Field>
					<Field label="Lexical">
						<Input
							type="number"
							step="0.5"
							min="0"
							max="9"
							value={lexical}
							disabled={inputsDisabled}
							onChange={(e) => setLexical(e.target.value)}
						/>
					</Field>
					<Field label="Grammar">
						<Input
							type="number"
							step="0.5"
							min="0"
							max="9"
							value={grammar}
							disabled={inputsDisabled}
							onChange={(e) => setGrammar(e.target.value)}
						/>
					</Field>
				</div>
				<Field label="Nhận xét">
					<Textarea
						value={feedback}
						onChange={(e) => setFeedback(e.target.value)}
						disabled={inputsDisabled}
						maxLength={2000}
						placeholder="Nhập nhận xét…"
					/>
				</Field>
				{error && (
					<p role="alert" className="mb-3 text-danger text-xs">
						{error}
					</p>
				)}
				{notice && (
					<KernelSubmitNotice
						notice={notice}
						onReconcile={reconcileAndFinish}
						disabled={saving}
					/>
				)}
				<div className="flex justify-end gap-2 border-line border-t pt-4">
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={onClose}
						disabled={saving}
					>
						Hủy
					</Button>
					<Button
						type="submit"
						size="sm"
						disabled={saving || notice !== undefined}
					>
						{saving ? "Đang lưu…" : "Lưu & duyệt"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
