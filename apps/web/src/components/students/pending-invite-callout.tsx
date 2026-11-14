import { CLASS_ERROR_CODES } from "@teacher-os/api/contracts";
import { RefreshCw } from "lucide-react";
import {
	type KeyboardEvent,
	type MouseEvent,
	useEffect,
	useState,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	useResendInvitation,
	useResendStudentInvite,
} from "@/lib/repos/invitations";

export type ResendInviteTarget =
	| {
			kind: "invitation";
			invitationId: string;
			email: string;
	  }
	| {
			kind: "student";
			studentId: string;
			enrollmentId?: string;
			recipientLabel: string;
	  };

function extractErrorDetails(err: unknown): {
	message: string;
	retryAfterSeconds?: number;
} {
	if (err && typeof err === "object") {
		const isClassPaused =
			"code" in err && err.code === CLASS_ERROR_CODES.CLASS_PAUSED;
		const message = isClassPaused
			? "Lớp đang tạm dừng — không thể gửi lại lời mời."
			: "message" in err &&
					typeof err.message === "string" &&
					err.message.trim()
				? err.message
				: "Không thể gửi lại lời mời. Vui lòng thử lại sau.";
		const retryAfterSeconds =
			"retryAfterSeconds" in err &&
			typeof err.retryAfterSeconds === "number" &&
			err.retryAfterSeconds > 0
				? err.retryAfterSeconds
				: undefined;
		return { message, retryAfterSeconds };
	}
	return { message: "Không thể gửi lại lời mời. Vui lòng thử lại sau." };
}

export function ResendInviteButton({
	target,
	size = "sm",
	compact = false,
	disabled = false,
	onResent,
}: {
	target: ResendInviteTarget;
	size?: "sm" | "default";
	compact?: boolean;
	disabled?: boolean;
	onResent?: () => void;
}) {
	const resendInvitation = useResendInvitation();
	const resendStudent = useResendStudentInvite();
	const [cooldownSeconds, setCooldownSeconds] = useState(0);

	useEffect(() => {
		if (cooldownSeconds <= 0) return;
		const timer = setInterval(() => {
			setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
		}, 1000);
		return () => clearInterval(timer);
	}, [cooldownSeconds]);

	const isPending = resendInvitation.isPending || resendStudent.isPending;

	const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
		e.stopPropagation();
		if (disabled || isPending || cooldownSeconds > 0) return;
		const recipient =
			target.kind === "invitation" ? target.email : target.recipientLabel;
		try {
			if (target.kind === "invitation") {
				await resendInvitation.mutateAsync(target.invitationId);
			} else {
				await resendStudent.mutateAsync({
					studentId: target.studentId,
					...(target.enrollmentId ? { enrollmentId: target.enrollmentId } : {}),
				});
			}
			toast.success(`Đã gửi lại lời mời tới ${recipient}`);
			onResent?.();
		} catch (err: unknown) {
			const { message, retryAfterSeconds } = extractErrorDetails(err);
			if (retryAfterSeconds) {
				setCooldownSeconds(retryAfterSeconds);
			}
			toast.error(message);
		}
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
		if (e.key === "Enter" || e.key === " ") {
			e.stopPropagation();
		}
	};

	const label = isPending
		? "Đang gửi..."
		: cooldownSeconds > 0
			? `Gửi lại (${cooldownSeconds}s)`
			: "Gửi lại lời mời";

	return (
		<Button
			type="button"
			variant="secondary"
			size={size}
			disabled={disabled || isPending || cooldownSeconds > 0}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			aria-label={label}
		>
			<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
			<span className={compact ? "hidden sm:inline" : undefined}>{label}</span>
		</Button>
	);
}

export function PendingInviteCallout({
	target,
	studentName,
	email,
	onResent,
}: {
	target: ResendInviteTarget;
	studentName?: string;
	email: string;
	onResent?: () => void;
}) {
	const description =
		target.kind === "invitation"
			? `Lời mời tới ${email} đang chờ học viên chấp nhận trên Student Portal.`
			: studentName
				? `Hồ sơ "${studentName}" (${email}) đã có trong tổ chức nhưng học viên chưa hoàn tất tham gia trên Student Portal.`
				: `Email ${email} đã có hồ sơ học viên nhưng chưa hoàn tất tham gia trên Student Portal.`;

	return (
		<div className="flex flex-col gap-2.5 rounded-md border border-border bg-muted/60 p-3 text-sm">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Badge variant="warn" dot>
					Chờ xác nhận
				</Badge>
				<ResendInviteButton target={target} onResent={onResent} />
			</div>
			<p className="text-muted-foreground text-xs leading-relaxed">
				{description}
			</p>
		</div>
	);
}
