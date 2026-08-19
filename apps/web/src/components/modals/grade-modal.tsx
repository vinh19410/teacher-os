import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";

const DEFAULT_SCORE = "6.0";

export function GradeModal({
	open,
	onClose,
	assignmentId,
}: {
	open: boolean;
	onClose: () => void;
	assignmentId: string;
}) {
	const { assignmentById, dispatch } = useData();
	const assignment = assignmentById(assignmentId);
	const [task, setTask] = useState(DEFAULT_SCORE);
	const [coherence, setCoherence] = useState(DEFAULT_SCORE);
	const [lexical, setLexical] = useState(DEFAULT_SCORE);
	const [grammar, setGrammar] = useState(DEFAULT_SCORE);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState<string | undefined>();
	const [saving, setSaving] = useState(false);
	const [gradeSaved, setGradeSaved] = useState(false);
	const [commentOperationId, setCommentOperationId] = useState(() =>
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
	// biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
	useEffect(() => {
		if (!open) return;
		setTask(DEFAULT_SCORE);
		setCoherence(DEFAULT_SCORE);
		setLexical(DEFAULT_SCORE);
		setGrammar(DEFAULT_SCORE);
		setFeedback("");
		setError(undefined);
		setGradeSaved(false);
		setCommentOperationId(crypto.randomUUID());
	}, [open, assignmentId]);

	if (!assignment) return null;

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
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
				const gradedId = await dispatch({
					type: "grade-assignment",
					assignmentId,
					scores,
				});
				if (gradedId === undefined) {
					setError("Không lưu được điểm — thử lại.");
					return;
				}
				setGradeSaved(true);
			}

			if (feedbackText) {
				const commentId = await dispatch({
					type: "add-comment-bank",
					text: feedbackText,
					operationId: commentOperationId,
				});
				if (commentId === undefined) {
					setError("Điểm đã lưu, nhưng nhận xét chưa lưu — thử lại.");
					return;
				}
			}
		} finally {
			setSaving(false);
		}
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
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={onClose}
						disabled={saving}
					>
						Hủy
					</Button>
					<Button type="submit" size="sm" disabled={saving}>
						{saving ? "Đang lưu…" : "Lưu & duyệt"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
