import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
	type ClassSession,
	type ClassSessionLesson,
	formatSessionDate,
	sessionIsEligibleDate,
	sessionRowTargets,
} from "@/lib/class-sessions";
import { todayISOVietnam } from "@/lib/week-grid";

/**
 * Per-occurrence actions + edit form (#98 Phase 4 / option 3 of #93).
 *
 * Threaded-contract rules (same discipline as the #91 roster modal):
 * - this file never imports dispatch/useDirectKernelAction — every write is
 *   a callback prop returning an `OccurrenceActionResult` the route owns;
 * - exactly ONE summary toast per action, composed at the ROUTE from the
 *   server-truthful `{updated, skipped}` payload (never snapshot-derived);
 * - names below are display-only; targeting keys off `dateISO` identity so a
 *   successful moveDate can never re-bind to another bucket when chronology
 *   reorders (red-team round-2 N4) — the parent closes after a successful
 *   move and toasts the summary;
 * - the parent mounts with `key={dateISO}`, so state below (prefill C4)
 *   initializes once per bound occurrence without effect plumbing.
 */
export interface OccurrenceActionResult {
	ok: boolean;
	updated?: number;
	skipped?: number;
	/** Machine reason carried by HttpError (the 409/404 family). */
	reason?: string;
}

export type OccurrenceEditPayload = Partial<{
	moveDate: string;
	time: string;
	dur: number;
	topic: string;
	zoom: string;
}>;

export interface SessionActionsModalProps {
	session: ClassSession | null;
	studentById: (id: string) => { name: string } | undefined;
	onClose: () => void;
	onComplete: (dateISO: string) => Promise<OccurrenceActionResult>;
	onCancelOccurrence: (dateISO: string) => Promise<OccurrenceActionResult>;
	onSaveEdit: (
		dateISO: string,
		payload: OccurrenceEditPayload,
	) => Promise<OccurrenceActionResult>;
}

function bucketHead(
	rows: ClassSessionLesson[],
): ClassSessionLesson | undefined {
	return [...rows].sort((a, b) => a.id.localeCompare(b.id))[0];
}

export function SessionActionsModal({
	session,
	studentById,
	onClose,
	onComplete,
	onCancelOccurrence,
	onSaveEdit,
}: SessionActionsModalProps) {
	const [pending, setPending] = useState(false);
	const [confirming, setConfirming] = useState<"complete" | "cancel" | null>(
		null,
	);
	const [notice, setNotice] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);

	// Prefill (C4): initializers run once per mounted key (parent sets key).
	const head = bucketHead(session?.rows ?? []);
	const [topic, setTopic] = useState(head?.topic ?? "");
	const [zoom, setZoom] = useState(head?.zoom ?? "");
	const [time, setTime] = useState(head?.time ?? "");
	const [durText, setDurText] = useState(head ? String(head.dur) : "");
	const [moveDate, setMoveDate] = useState("");

	if (session === null) {
		return (
			<Modal open={false} onClose={onClose} title="Điều chỉnh buổi">
				<span />
			</Modal>
		);
	}

	const today = todayISOVietnam();
	const eligible = sessionIsEligibleDate(session, today);
	const targets = sessionRowTargets(session);
	const targetNames = targets.map(
		(r) => studentById(r.sid)?.name ?? "Học viên",
	);

	async function runAction(
		action: () => Promise<OccurrenceActionResult>,
	): Promise<OccurrenceActionResult> {
		setPending(true);
		setNotice(null);
		setFormError(null);
		try {
			return await action();
		} finally {
			setPending(false);
			setConfirming(null);
		}
	}

	function summarize(result: OccurrenceActionResult): string {
		if (!result.ok) {
			switch (result.reason) {
				case "use-occurrence-endpoint":
					return "Buổi này đã có định danh — hãy dùng biểu mẫu Điều chỉnh buổi.";
				case "date-occupied":
					return "Ngày đích đã có buổi khác.";
				case "not-found":
					return "Buổi không còn tồn tại.";
				default:
					return "Không lưu được — dữ liệu chưa được ghi lên máy chủ.";
			}
		}
		const total = (result.updated ?? 0) + (result.skipped ?? 0);
		return result.skipped && result.skipped > 0
			? `${result.updated}/${total} học viên (${result.skipped} đã chốt trước đó)`
			: "";
	}

	const editPayload = (): OccurrenceEditPayload => {
		const payload: OccurrenceEditPayload = {};
		if (topic !== originalTopic(head)) payload.topic = topic;
		if (time !== (head?.time ?? "")) payload.time = time;
		if (durText !== "" && durText !== String(head?.dur ?? ""))
			payload.dur = Number(durText); // empty text never mints dur:0 -> 400 noise
		if (zoom !== (head?.zoom ?? "")) payload.zoom = zoom;
		if (moveDate !== "" && moveDate !== session.dateISO)
			payload.moveDate = moveDate;
		return payload;
	};

	return (
		<Modal
			open={true}
			onClose={onClose}
			title={`Điều chỉnh buổi — ${formatSessionDate(session.dateISO)} · ${session.time}`}
			footer={
				<Button
					type="button"
					variant="secondary"
					size="sm"
					disabled={pending}
					onClick={onClose}
				>
					Đóng
				</Button>
			}
		>
			<div className="space-y-5">
				{notice && (
					<p role="status" className="text-hot text-sm">
						{notice}
					</p>
				)}

				<section className="space-y-2">
					<h3 className="font-medium text-sm">Hành động cả lớp</h3>
					{targetNames.length > 0 ? (
						<ul className="list-disc space-y-0.5 pl-5 text-fg-2 text-xs">
							{targetNames.map((name, i) => (
								<li key={`${name}-${i}`}>{name}</li>
							))}
						</ul>
					) : (
						<p className="text-muted-fg text-xs">
							Cả lớp đã chốt cho buổi này.
						</p>
					)}
					<div className="flex flex-wrap gap-2 pt-1">
						<Button
							type="button"
							size="sm"
							disabled={
								pending || !eligible || targets.length === 0 || moveDate !== ""
							}
							onClick={() => setConfirming("complete")}
						>
							Hoàn thành buổi
						</Button>
						<Button
							type="button"
							variant="danger"
							size="sm"
							disabled={pending || targets.length === 0 || moveDate !== ""}
							onClick={() => setConfirming("cancel")}
						>
							Hủy buổi
						</Button>
					</div>
					{!eligible && targets.length > 0 && (
						<p className="text-muted-fg text-xs">
							Buổi diễn ra sau hôm nay — Hoàn thành mở khi đến buổi.
						</p>
					)}
					{confirming !== null && (
						<div
							role="alertdialog"
							className="space-y-2 rounded border border-danger/40 bg-surface-warm/50 p-3"
						>
							<p className="font-medium text-sm">
								{confirming === "complete"
									? `Xác nhận hoàn thành cho ${targetNames.length} học viên?`
									: `Xác nhận hủy buổi — ${targetNames.length} học viên sẽ bị hủy:`}
							</p>
							<ul className="list-decimal pl-5 text-xs">
								{targetNames.map((n, i) => (
									<li key={`${n}-${i}`}>{n}</li>
								))}
							</ul>
							<p className="text-danger text-xs">Không thể hoàn tác.</p>
							<div className="flex gap-2">
								<Button
									type="button"
									variant={confirming === "cancel" ? "danger" : "primary"}
									size="sm"
									disabled={pending}
									onClick={() => {
										const date = session.dateISO;
										void runAction(() =>
											confirming === "complete"
												? onComplete(date)
												: onCancelOccurrence(date),
										).then((result) => {
											if (!result.ok) {
												// Success copy is the ROUTE's single toast; failures that
												// need in-modal context surface here.
												setNotice(summarize(result));
											}
										});
									}}
								>
									{pending ? "Đang lưu…" : "Xác nhận"}
								</Button>
								<Button
									type="button"
									variant="secondary"
									size="sm"
									disabled={pending}
									onClick={() => setConfirming(null)}
								>
									Quay lại
								</Button>
							</div>
						</div>
					)}
				</section>

				<section className="space-y-3 border-line-soft border-t pt-4">
					<h3 className="font-medium text-sm">Chỉnh sửa buổi</h3>
					<Field label="Chủ đề">
						<Input
							value={topic}
							onChange={(e) => setTopic(e.target.value)}
							disabled={pending}
						/>
					</Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label="Giờ bắt đầu">
							<Input
								value={time}
								onChange={(e) => setTime(e.target.value)}
								placeholder="19:00"
								disabled={pending}
							/>
						</Field>
						<Field label="Thời lượng (phút)">
							<Input
								value={durText}
								inputMode="numeric"
								onChange={(e) => setDurText(e.target.value.replace(/\D/g, ""))}
								disabled={pending}
							/>
						</Field>
					</div>
					<Field label="Dời sang ngày">
						<Input
							type="date"
							value={moveDate}
							onChange={(e) => setMoveDate(e.target.value)}
							disabled={pending}
						/>
					</Field>
					<Field label="Link Zoom">
						<Textarea
							rows={2}
							className="min-h-16"
							value={zoom}
							onChange={(e) => setZoom(e.target.value)}
							placeholder="https://…"
							disabled={pending}
						/>
					</Field>
					{formError && (
						<p role="alert" className="text-danger text-xs">
							{formError}
						</p>
					)}
					<Button
						type="button"
						size="sm"
						disabled={pending}
						onClick={() => {
							setNotice(null);
							setFormError(null);
							const payload = editPayload();
							if (Object.keys(payload).length === 0) {
								setNotice("Chưa có thay đổi nào để lưu.");
								return;
							}
							const isMove = payload.moveDate !== undefined;
							void runAction(() => onSaveEdit(session.dateISO, payload)).then(
								(result) => {
									if (result.ok && isMove) {
										// Identity moved — close so nothing stays bound to a
										// stale chronology position (N4); route owns toast.
										onClose();
										return;
									}
									if (result.ok) {
										return; // route toast already summarized the counts
									}
									if (result.reason === "date-occupied") {
										setFormError("Ngày đích đã có buổi — chọn ngày khác.");
										return;
									}
									setNotice(summarize(result));
								},
							);
						}}
					>
						{pending ? "Đang lưu…" : "Lưu thay đổi"}
					</Button>
				</section>
			</div>
		</Modal>
	);
}

function originalTopic(head: ClassSessionLesson | undefined): string {
	return head?.topic ?? "";
}
