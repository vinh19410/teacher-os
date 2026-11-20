import {
	evaluateZoomJoinWindow,
	formatZoomJoinWindowMessage,
	isValidZoomJoinUrl,
	ZOOM_JOIN_ERROR_CODES,
} from "@teacher-os/api/zoom-window";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { Video } from "lucide-react";
import { type MouseEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import {
	healStudentOrgMismatch,
	isHttpError,
	isStudentOrgMismatchError,
	isTeacherOnStudentPortalError,
	reauth,
} from "@/lib/query-client";
import {
	requestStudentZoomJoin,
	type StudentZoomJoinResult,
} from "@/lib/repos/student";

export interface ZoomJoinButtonProps {
	classId: string;
	date: string | null;
	time: string;
	dur?: number;
	variant?: "default" | "outline";
	size?: "default" | "sm";
	iconClassName?: string;
	className?: string;
	nowMs?: number;
	onRequestJoin?: (
		classId: string,
		date: string,
	) => Promise<StudentZoomJoinResult>;
}

function safeCloseWindow(win: Window | null): void {
	if (!win || win.closed) return;
	try {
		win.close();
	} catch {
		// Bỏ qua nếu môi trường chặn đóng cửa sổ
	}
}

/**
 * Nút "Vào lớp (Zoom)" dùng chung toàn student portal: luôn xác thực khung
 * giờ `[start - 30 phút, end)` với đồng hồ máy chủ trước khi mở link Zoom.
 * Khi ước lượng cục bộ đang trong khung giờ, mở sẵn tab trong cùng click gesture
 * để không bị trình duyệt chặn popup.
 */
export function ZoomJoinButton({
	classId,
	date,
	time,
	dur,
	variant = "default",
	size = "default",
	iconClassName,
	className,
	nowMs,
	onRequestJoin,
}: ZoomJoinButtonProps) {
	const [pending, setPending] = useState(false);
	const pendingRef = useRef(false);

	const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
		e.stopPropagation();
		if (pendingRef.current) return;

		if (!date) {
			toast.info(formatZoomJoinWindowMessage({ status: "invalid" }));
			return;
		}

		const localEval =
			dur != null
				? evaluateZoomJoinWindow({
						date,
						time,
						dur,
						nowMs: nowMs ?? Date.now(),
					})
				: null;

		let preOpened: Window | null = null;
		if (localEval == null || localEval.status === "open") {
			try {
				preOpened = window.open("", "_blank");
				if (preOpened) {
					preOpened.opener = null;
				}
			} catch {
				preOpened = null;
			}
		}

		pendingRef.current = true;
		setPending(true);
		try {
			const requestJoin = onRequestJoin ?? requestStudentZoomJoin;
			const result = await requestJoin(classId, date);

			if (result.ok) {
				if (!isValidZoomJoinUrl(result.data.joinUrl)) {
					safeCloseWindow(preOpened);
					toast.error("Link Zoom không hợp lệ.");
					return;
				}
				const safeJoinUrl = result.data.joinUrl.trim();
				if (preOpened && !preOpened.closed) {
					preOpened.location.assign(safeJoinUrl);
				} else {
					let opened: Window | null = null;
					try {
						opened = window.open(safeJoinUrl, "_blank", "noopener,noreferrer");
					} catch {
						opened = null;
					}
					if (!opened) {
						toast.info(
							"Trình duyệt đang chặn mở tab mới. Hãy cho phép cửa sổ bật lên để vào lớp.",
						);
					}
				}
				return;
			}

			safeCloseWindow(preOpened);
			if (
				result.error.code === ZOOM_JOIN_ERROR_CODES.TOO_EARLY ||
				result.error.code === ZOOM_JOIN_ERROR_CODES.ENDED
			) {
				const status =
					result.error.code === ZOOM_JOIN_ERROR_CODES.TOO_EARLY
						? "too_early"
						: "ended";
				toast.info(
					result.error.error ||
						formatZoomJoinWindowMessage({
							status,
							date: result.error.date ?? date,
							time: result.error.time ?? time,
							dur: result.error.dur ?? dur,
							openAt: result.error.openAt,
							closeAt: result.error.closeAt,
						}),
				);
			} else {
				toast.error(
					result.error.error || "Không thể mở phòng học Zoom lúc này.",
				);
			}
		} catch (error) {
			safeCloseWindow(preOpened);
			if (isHttpError(error) && error.status === 401) {
				reauth();
				return;
			}
			if (isTeacherOnStudentPortalError(error)) {
				return;
			}
			if (isStudentOrgMismatchError(error)) {
				healStudentOrgMismatch();
				toast.info("Đang đồng bộ lại thông tin lớp học. Vui lòng thử lại.");
				return;
			}
			toast.error(
				"Không thể kết nối máy chủ để mở phòng Zoom. Vui lòng thử lại.",
			);
		} finally {
			pendingRef.current = false;
			setPending(false);
		}
	};

	return (
		<button
			type="button"
			disabled={pending}
			aria-busy={pending || undefined}
			onClick={(e) => {
				void handleClick(e);
			}}
			className={cn(
				buttonVariants({ variant, size }),
				"cursor-pointer whitespace-normal text-center focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0",
				className,
			)}
		>
			<Video aria-hidden="true" className={iconClassName ?? "size-3.5"} />
			Vào lớp (Zoom)
		</button>
	);
}
