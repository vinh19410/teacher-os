import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";

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
	const [task, setTask] = useState("6.0");
	const [coherence, setCoherence] = useState("6.0");
	const [lexical, setLexical] = useState("6.0");
	const [grammar, setGrammar] = useState("6.0");
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState<string | undefined>();
	const [saving, setSaving] = useState(false);

	if (!assignment) return null;

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		const scores = {
			task: Number.parseFloat(task),
			coherence: Number.parseFloat(coherence),
			lexical: Number.parseFloat(lexical),
			grammar: Number.parseFloat(grammar),
		};
		const invalid = Object.values(scores).some(
			(v) => Number.isNaN(v) || v < 0 || v > 9,
		);
		if (invalid) {
			setError("Điểm mỗi tiêu chí từ 0 đến 9 (bước 0.5).");
			return;
		}
		setSaving(true);
		try {
			// Bus resolves the graded id on success, undefined on write/refresh
			// failure — stay open so the typed scores are not lost.
			const gradedId = await dispatch({
				type: "grade-assignment",
				assignmentId,
				scores,
			});
			if (gradedId === undefined) {
				setError("Không lưu được điểm — thử lại.");
				return;
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
			onClose={onClose}
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
							onChange={(e) => setGrammar(e.target.value)}
						/>
					</Field>
				</div>
				<Field label="Nhận xét" error={error}>
					<Textarea
						value={feedback}
						onChange={(e) => setFeedback(e.target.value)}
						placeholder="Nhập nhận xét…"
					/>
				</Field>
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button variant="secondary" size="sm" onClick={onClose}>
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
