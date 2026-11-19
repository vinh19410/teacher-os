import type { KernelSessionMeetingRow } from "@teacher-os/api/contracts";
import { Copy, ExternalLink, Film, RefreshCw, Video } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { isHttpError } from "@/lib/kernel-load-state";
import {
	createSessionZoom,
	syncSessionRecording,
	updateSessionRecording,
} from "@/lib/repos/zoom-meeting";

export function SessionZoomPanel({
	classId,
	dateISO,
	zoom,
	status,
	meeting,
	onRefreshed,
}: {
	classId: string;
	dateISO: string | null;
	zoom: string;
	status: string;
	meeting?: KernelSessionMeetingRow;
	onRefreshed: () => Promise<boolean>;
}) {
	const [creatingZoom, setCreatingZoom] = useState(false);
	const [syncingRec, setSyncingRec] = useState(false);
	const [editingRec, setEditingRec] = useState(false);
	const [recInput, setRecInput] = useState(meeting?.recordingUrl ?? "");
	const [savingRec, setSavingRec] = useState(false);

	const joinUrl = zoom || meeting?.joinUrl || "";
	const recordingUrl = meeting?.recordingUrl || "";
	const recordingStatus = meeting?.recordingStatus ?? "none";
	const showPassword =
		recordingStatus === "ready" && Boolean(meeting?.recordingPassword);
	const isInactive = status === "cancelled" || status === "holiday";

	if (!dateISO && !joinUrl && !recordingUrl) {
		return null;
	}

	async function handleCreateZoom() {
		if (!dateISO || creatingZoom) return;
		setCreatingZoom(true);
		try {
			const res = await createSessionZoom(classId, dateISO);
			toast.success(
				res.warning
					? `Đã tạo Zoom. ${res.warning}`
					: "Đã tạo link Zoom cho buổi học.",
			);
			await onRefreshed();
		} catch (err) {
			const code = isHttpError(err) ? err.code : undefined;
			if (code === "ZOOM_NOT_CONFIGURED") {
				toast.error(
					"Chưa cấu hình Zoom cho hệ thống. Liên hệ quản trị để thêm ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET.",
				);
			} else {
				toast.error(
					err instanceof Error ? err.message : "Không tạo được Zoom.",
				);
			}
		} finally {
			setCreatingZoom(false);
		}
	}

	async function handleCopyZoom() {
		if (!joinUrl) return;
		try {
			await navigator.clipboard.writeText(joinUrl);
			toast.success("Đã sao chép link Zoom.");
		} catch {
			toast.error("Không sao chép được link.");
		}
	}

	async function handleCopyPassword() {
		if (!meeting?.recordingPassword) return;
		try {
			await navigator.clipboard.writeText(meeting.recordingPassword);
			toast.success("Đã sao chép mật khẩu recording.");
		} catch {
			toast.error("Không sao chép được mật khẩu.");
		}
	}

	async function handleSyncRecording() {
		if (!dateISO || syncingRec) return;
		setSyncingRec(true);
		try {
			const res = await syncSessionRecording(classId, dateISO);
			if (res.status === "ready") {
				toast.success(
					res.message
						? `Đã cập nhật recording. ${res.message}`
						: "Đã cập nhật link recording cho buổi học.",
				);
			} else {
				toast.info(
					res.message ||
						"Recording chưa sẵn sàng trên Zoom. Hãy thử lại sau vài phút.",
				);
			}
			await onRefreshed();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Không đồng bộ được recording.",
			);
		} finally {
			setSyncingRec(false);
		}
	}

	async function handleSaveManualRecording() {
		if (!dateISO || savingRec) return;
		const trimmed = recInput.trim();
		if (trimmed !== "" && !trimmed.startsWith("https://")) {
			toast.error("Link recording phải bắt đầu bằng https:// hoặc để trống.");
			return;
		}
		setSavingRec(true);
		try {
			await updateSessionRecording(classId, dateISO, trimmed);
			toast.success(
				trimmed ? "Đã lưu link recording." : "Đã xóa link recording.",
			);
			setEditingRec(false);
			await onRefreshed();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Không lưu được link recording.",
			);
		} finally {
			setSavingRec(false);
		}
	}

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
			<div className="flex flex-col gap-1.5">
				<span className="font-medium text-muted-foreground text-xs">
					Phòng học Zoom
				</span>
				{isInactive ? (
					<span className="text-muted-foreground text-xs">
						Buổi học đã hủy hoặc nghỉ lễ.
					</span>
				) : joinUrl ? (
					<div className="flex flex-wrap items-center gap-2">
						<a
							href={joinUrl}
							target="_blank"
							rel="noopener noreferrer"
							className={cn(
								buttonVariants({ variant: "primary", size: "sm" }),
								"inline-flex items-center gap-1.5",
							)}
						>
							<Video aria-hidden="true" className="size-3.5" />
							Mở Zoom
							<ExternalLink aria-hidden="true" className="size-3" />
						</a>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() => void handleCopyZoom()}
						>
							<Copy aria-hidden="true" className="size-3.5" />
							Sao chép
						</Button>
						<span className="w-full break-all text-muted-foreground text-xs">
							{joinUrl}
						</span>
					</div>
				) : dateISO ? (
					<div className="flex flex-wrap items-center justify-between gap-2">
						<span className="text-muted-foreground text-xs">
							Chưa có link phòng học cho buổi này.
						</span>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							disabled={creatingZoom}
							onClick={() => void handleCreateZoom()}
						>
							<Video aria-hidden="true" className="size-3.5" />
							{creatingZoom ? "Đang tạo Zoom…" : "Tạo link Zoom"}
						</Button>
					</div>
				) : (
					<span className="text-muted-foreground text-xs">Chưa có link.</span>
				)}
			</div>

			{dateISO && !isInactive && (
				<div className="flex flex-col gap-2 border-border border-t border-solid pt-2.5">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<span className="font-medium text-muted-foreground text-xs">
							Recording buổi học
						</span>
						{recordingUrl ? (
							<Badge variant="success" dot>
								Đã có recording
							</Badge>
						) : recordingStatus === "pending" ? (
							<Badge variant="warn">Đang chờ recording</Badge>
						) : recordingStatus === "failed" ? (
							<Badge variant="danger">Recording lỗi</Badge>
						) : (
							<Badge variant="muted">Chưa có</Badge>
						)}
					</div>

					<div className="flex flex-wrap items-center gap-2">
						{recordingUrl && (
							<a
								href={recordingUrl}
								target="_blank"
								rel="noopener noreferrer"
								className={cn(
									buttonVariants({ variant: "secondary", size: "sm" }),
									"inline-flex items-center gap-1.5",
								)}
							>
								<Film aria-hidden="true" className="size-3.5" />
								Xem recording
								<ExternalLink aria-hidden="true" className="size-3" />
							</a>
						)}
						{meeting?.zoomMeetingId && (
							<Button
								type="button"
								variant="secondary"
								size="sm"
								disabled={syncingRec}
								onClick={() => void handleSyncRecording()}
							>
								<RefreshCw
									aria-hidden="true"
									className={cn("size-3.5", syncingRec && "animate-spin")}
								/>
								{syncingRec ? "Đang đồng bộ…" : "Đồng bộ recording"}
							</Button>
						)}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => {
								setRecInput(recordingUrl);
								setEditingRec((prev) => !prev);
							}}
						>
							{editingRec ? "Đóng" : recordingUrl ? "Sửa link" : "Gán link tay"}
						</Button>
					</div>

					{meeting?.recordingError && (
						<p className="text-destructive text-xs">{meeting.recordingError}</p>
					)}

					{showPassword && (
						<div className="flex flex-wrap items-center gap-2 text-xs">
							<span>
								Mật khẩu recording:{" "}
								<span className="font-mono">{meeting?.recordingPassword}</span>
							</span>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								aria-label="Sao chép mật khẩu recording"
								onClick={() => void handleCopyPassword()}
							>
								<Copy aria-hidden="true" className="size-3.5" />
							</Button>
						</div>
					)}

					{editingRec && (
						<div className="flex flex-wrap items-center gap-2">
							<Input
								aria-label="Link recording"
								value={recInput}
								onChange={(e) => setRecInput(e.target.value)}
								placeholder="https://zoom.us/rec/share/..."
								disabled={savingRec}
								className="min-w-0 flex-1"
							/>
							<Button
								type="button"
								size="sm"
								disabled={savingRec}
								onClick={() => void handleSaveManualRecording()}
							>
								{savingRec ? "Đang lưu…" : "Lưu"}
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
