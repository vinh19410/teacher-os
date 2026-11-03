import { ACCOUNT_ERROR_CODES } from "@teacher-os/api/contracts";
import {
	Loader2,
	LogOut,
	MailCheck,
	RefreshCw,
	ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { getRoleBlockReason } from "@/lib/role-block";

/**
 * Full-screen view for a blocked session opening the teacher app
 * (plan #260, #513, #524):
 * - Student-role or non-allowlisted teacher session: only action is signing out.
 * - Allowlisted teacher session whose email is not yet verified
 *   (`ACCOUNT_TEACHER_EMAIL_UNVERIFIED`): offers resending the verification
 *   email and reloading once verified, while preserving the heading
 *   `"Đây là tài khoản học viên"` required by E2E `account-role-separation.spec.ts`.
 */
export default function AccountBlockedView() {
	const { data: session } = authClient.useSession();
	const blockReason = getRoleBlockReason();
	const userEmail = session?.user?.email;
	const isTeacherEmailUnverified =
		blockReason === ACCOUNT_ERROR_CODES.TEACHER_EMAIL_UNVERIFIED &&
		Boolean(userEmail);
	const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">(
		"idle",
	);
	const [resendError, setResendError] = useState<string | null>(null);

	const handleSignOut = async () => {
		try {
			await authClient.signOut();
		} catch {
			// Best-effort sign-out
		} finally {
			window.location.assign("/login");
		}
	};

	const handleResend = async () => {
		if (!userEmail) return;
		setResendStatus("sending");
		setResendError(null);
		try {
			const res = await authClient.sendVerificationEmail({
				email: userEmail,
				callbackURL: `${window.location.origin}/verify-email?verified=ok`,
			});
			if (res.error) {
				const msg = res.error.message || "";
				if (
					msg.includes("EMAIL_ALREADY_VERIFIED") ||
					res.error.code === "EMAIL_ALREADY_VERIFIED"
				) {
					window.location.reload();
					return;
				}
				setResendStatus("idle");
				setResendError(
					msg || "Không thể gửi lại email xác thực. Vui lòng thử lại sau.",
				);
				return;
			}
			setResendStatus("sent");
		} catch {
			setResendStatus("idle");
			setResendError("Không thể gửi lại email xác thực. Vui lòng thử lại sau.");
		}
	};

	return (
		<div className="flex min-h-[100svh] items-center justify-center p-4">
			<div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center text-card-foreground shadow-sm">
				<div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
					{isTeacherEmailUnverified ? (
						<MailCheck className="size-8 text-primary" aria-hidden="true" />
					) : (
						<ShieldAlert
							className="size-8 text-destructive"
							aria-hidden="true"
						/>
					)}
				</div>
				<h2 className="font-semibold text-lg tracking-tight">
					Đây là tài khoản học viên
				</h2>
				{isTeacherEmailUnverified ? (
					<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
						Email giáo viên ({userEmail}) chưa được xác thực. Vui lòng mở hộp
						thư và bấm liên kết xác thực trước khi truy cập ứng dụng, hoặc gửi
						lại email xác thực bên dưới.
					</p>
				) : (
					<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
						Tài khoản này không có quyền dùng ứng dụng giáo viên (thuộc cổng học
						viên hoặc email chưa nằm trong danh sách được phép). Vui lòng đăng
						xuất để tiếp tục.
					</p>
				)}
				{isTeacherEmailUnverified && resendError && (
					<p className="mt-3 text-destructive text-xs" role="alert">
						{resendError}
					</p>
				)}
				{isTeacherEmailUnverified && resendStatus === "sent" && (
					<p className="mt-3 text-primary text-xs">
						Đã gửi lại email xác thực. Vui lòng kiểm tra hộp thư của bạn.
					</p>
				)}
				<div className="mt-6 flex flex-col items-center justify-center gap-2">
					{isTeacherEmailUnverified && (
						<>
							<button
								type="button"
								onClick={() => void handleResend()}
								disabled={resendStatus === "sending"}
								className="inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background px-4 py-2 font-medium text-sm shadow-xs outline-none transition-all hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
							>
								{resendStatus === "sending" ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" />
										<span>Đang gửi…</span>
									</>
								) : (
									<>
										<MailCheck className="h-4 w-4" />
										<span>Gửi lại email xác thực</span>
									</>
								)}
							</button>
							<button
								type="button"
								onClick={() => window.location.reload()}
								className="inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background px-4 py-2 font-medium text-sm shadow-xs outline-none transition-all hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
							>
								<RefreshCw className="h-4 w-4" />
								<span>Tôi đã xác thực — Kiểm tra lại</span>
							</button>
						</>
					)}
					<button
						type="button"
						onClick={handleSignOut}
						className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background px-4 py-2 font-medium text-sm shadow-xs outline-none transition-all hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
					>
						<LogOut className="h-4 w-4" />
						<span>Đăng xuất</span>
					</button>
				</div>
			</div>
		</div>
	);
}
