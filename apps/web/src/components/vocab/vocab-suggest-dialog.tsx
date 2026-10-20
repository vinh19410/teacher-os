import type { VocabTeacherSuggestion } from "@teacher-os/api/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";

const STATUS_LABELS: Record<VocabTeacherSuggestion["status"], string> = {
	pending: "Đang chờ",
	accepted: "Đã chấp nhận",
	dismissed: "Đã ẩn",
};

function SuggestionItemRow({
	suggestion,
	studentName,
	revoking,
	onRevoke,
}: {
	suggestion: VocabTeacherSuggestion;
	studentName: string;
	revoking: boolean;
	onRevoke: (id: string) => void;
}) {
	const respondedText = suggestion.respondedAt
		? new Date(suggestion.respondedAt).toLocaleString("vi-VN", {
				dateStyle: "short",
				timeStyle: "short",
			})
		: null;

	return (
		<div
			data-testid={`vocab-suggestion-row-${suggestion.id}`}
			className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
		>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium text-foreground text-sm">
						{studentName}
					</span>
					<span
						data-testid={`vocab-suggestion-status-${suggestion.id}`}
						className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
							suggestion.status === "accepted"
								? "bg-secondary text-foreground"
								: suggestion.status === "pending"
									? "neu-sm text-primary"
									: "neu-in text-muted-foreground"
						}`}
					>
						{STATUS_LABELS[suggestion.status]}
					</span>
				</div>
				{suggestion.note ? (
					<p className="mt-0.5 text-muted-foreground text-xs">
						Ghi chú: {suggestion.note}
					</p>
				) : null}
				{respondedText ? (
					<p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
						Lúc {respondedText}
					</p>
				) : null}
			</div>
			{suggestion.status !== "dismissed" ? (
				<Button
					size="sm"
					variant="ghost"
					type="button"
					disabled={revoking}
					data-testid={`vocab-revoke-suggestion-${suggestion.id}`}
					onClick={() => onRevoke(suggestion.id)}
				>
					{revoking ? "Đang thu hồi..." : "Thu hồi"}
				</Button>
			) : null}
		</div>
	);
}

/**
 * Modal gợi ý bộ từ vựng cho học viên (#363):
 * - Fetch fresh `GET /api/kernel/vocab/decks/:deckId/suggestions` khi mở
 *   để hiển thị đúng trạng thái thực tế (pending / đã chấp nhận / đã ẩn kèm thời điểm)
 *   kể cả khi snapshot của giáo viên chưa refresh (RT-F12 / RT-F21).
 * - Gửi gợi ý qua command bus `suggest-vocab-deck` (idempotent phía server).
 * - Thu hồi gợi ý qua `revoke-vocab-suggestion` (soft flip dismissed).
 */
export function VocabSuggestDialog({
	deckId,
	deckTitle,
	onClose,
}: {
	deckId: string;
	deckTitle: string;
	onClose: () => void;
}) {
	const { data, dispatch } = useData();
	const [selectedStudentId, setSelectedStudentId] = useState<string>(
		() => data.students[0]?.id ?? "",
	);
	const [note, setNote] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [revokingId, setRevokingId] = useState<string | null>(null);
	const [suggestions, setSuggestions] = useState<VocabTeacherSuggestion[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(false);

	const studentNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const s of data.students) {
			map.set(s.id, s.name);
		}
		return map;
	}, [data.students]);

	const loadSuggestions = useCallback(async () => {
		setLoading(true);
		setLoadError(false);
		try {
			const res = await fetch(
				`${getApiBaseUrl()}/api/kernel/vocab/decks/${deckId}/suggestions`,
				{ credentials: "include" },
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as {
				suggestions: VocabTeacherSuggestion[];
			};
			setSuggestions(body.suggestions ?? []);
		} catch {
			setLoadError(true);
		} finally {
			setLoading(false);
		}
	}, [deckId]);

	useEffect(() => {
		void loadSuggestions();
	}, [loadSuggestions]);

	useEffect(() => {
		if (!selectedStudentId && data.students[0]?.id) {
			setSelectedStudentId(data.students[0].id);
		}
	}, [data.students, selectedStudentId]);

	const handleSuggest = async () => {
		if (!selectedStudentId || submitting) return;
		setSubmitting(true);
		try {
			const trimmedNote = note.trim();
			const result = await dispatch({
				type: "suggest-vocab-deck",
				payload: {
					deckId,
					studentId: selectedStudentId,
					note: trimmedNote.length > 0 ? trimmedNote : null,
				},
			});
			if (result.kind === "refreshed" || result.kind === "committed") {
				toast.success("Đã gửi gợi ý bộ từ vựng cho học viên.");
				setNote("");
				await loadSuggestions();
			}
		} finally {
			setSubmitting(false);
		}
	};

	const handleRevoke = async (suggestionId: string) => {
		if (revokingId) return;
		setRevokingId(suggestionId);
		try {
			const result = await dispatch({
				type: "revoke-vocab-suggestion",
				suggestionId,
			});
			if (result.kind === "refreshed" || result.kind === "committed") {
				toast.success("Đã thu hồi gợi ý bộ từ vựng.");
				await loadSuggestions();
			}
		} finally {
			setRevokingId(null);
		}
	};

	return (
		<Modal
			open={true}
			onClose={onClose}
			title={`Gợi ý bộ từ · ${deckTitle}`}
			footer={
				<>
					<Button
						variant="secondary"
						type="button"
						data-testid="vocab-suggest-close"
						onClick={onClose}
					>
						Hủy
					</Button>
					<Button
						type="button"
						data-testid="vocab-suggest-submit"
						disabled={!selectedStudentId || submitting}
						onClick={() => void handleSuggest()}
					>
						{submitting ? "Đang gửi..." : "Gửi gợi ý"}
					</Button>
				</>
			}
		>
			<div className="space-y-4">
				<p className="text-muted-foreground text-sm">
					Học viên được gợi ý sẽ thấy bộ từ trong mục "Gợi ý cho bạn" trên cổng
					học viên (không bắt buộc).
				</p>

				{data.students.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Chưa có học viên nào trong trung tâm.
					</p>
				) : (
					<div className="space-y-3">
						<div>
							<label
								htmlFor="vocab-suggest-student"
								className="mb-1 block font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em]"
							>
								Học viên
							</label>
							<Select
								id="vocab-suggest-student"
								aria-label="Học viên"
								data-testid="vocab-suggest-student-select"
								value={selectedStudentId}
								onChange={(e) => setSelectedStudentId(e.target.value)}
							>
								{data.students.map((st) => (
									<option key={st.id} value={st.id}>
										{st.name}
									</option>
								))}
							</Select>
						</div>

						<div>
							<label
								htmlFor="vocab-suggest-note"
								className="mb-1 block font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em]"
							>
								Lời nhắn (tùy chọn)
							</label>
							<Input
								id="vocab-suggest-note"
								aria-label="Ghi chú cho học viên"
								data-testid="vocab-suggest-note-input"
								maxLength={500}
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder="Ví dụ: Ôn trước thứ 7 nhé"
							/>
						</div>
					</div>
				)}

				<div className="space-y-2 border-border border-t pt-3">
					<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em]">
						Lịch sử gợi ý bộ từ này
					</p>
					{loading ? (
						<p className="font-mono text-muted-foreground text-xs">
							Đang tải trạng thái gợi ý...
						</p>
					) : loadError ? (
						<p className="text-primary text-xs">
							Không tải được trạng thái gợi ý của bộ từ.
						</p>
					) : suggestions.length === 0 ? (
						<p className="text-muted-foreground text-xs">
							Chưa gợi ý bộ từ này cho học viên nào.
						</p>
					) : (
						<div
							data-testid="vocab-suggestion-list"
							className="max-h-52 divide-y divide-border overflow-y-auto rounded-md border border-border"
						>
							{suggestions.map((sug) => (
								<SuggestionItemRow
									key={sug.id}
									suggestion={sug}
									studentName={
										studentNameById.get(sug.studentId) ?? sug.studentId
									}
									revoking={revokingId === sug.id}
									onRevoke={(id) => void handleRevoke(id)}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</Modal>
	);
}
