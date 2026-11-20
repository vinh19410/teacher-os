import { CircleAlert, Loader2, LogOut, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import {
	getBlockedErrorMessage,
	needsEmailVerificationResend,
} from "@/lib/auth-error";
import { redirectAssign, redirectReplace } from "@/lib/navigation";

interface BlockedAccountCardProps {
	error?: string;
	email: string | null;
}

/**
 * Thẻ cảnh báo chống vòng lặp khi người dùng đã có phiên đăng nhập nhưng bị
 * chặn bởi gate quyền/allowlist hoặc chưa xác thực email từ `/admin` / `/teacher`.
 * Không tự động redirect để người dùng luôn có thể đăng xuất hoặc gửi lại email xác thực.
 */
export function BlockedAccountCard({ error, email }: BlockedAccountCardProps) {
	const [signingOut, setSigningOut] = useState(false);
	const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">(
		"idle",
	);
	const [resendFailed, setResendFailed] = useState(false);

	const showResend = needsEmailVerificationResend(error);
	const message = getBlockedErrorMessage(error);

	const handleSignOut = async () => {
		setSigningOut(true);
		try {
			const res = await authClient.signOut();
			if (res && typeof res === "object" && "error" in res && res.error) {
				toast.error("Không thể đăng xuất. Vui lòng thử lại.");
				setSigningOut(false);
				return;
			}
			redirectAssign("/login");
		} catch {
			toast.error("Không thể đăng xuất. Vui lòng thử lại.");
			setSigningOut(false);
		}
	};

	const handleResendVerification = async () => {
		if (!email) {
			toast.error("Không xác định được email tài khoản để gửi lại.");
			return;
		}
		setResendStatus("sending");
		setResendFailed(false);
		try {
			const res = await authClient.sendVerificationEmail({
				email,
				callbackURL: `${window.location.origin}/verify-email?verified=ok`,
			});
			if (res?.error) {
				const msg = res.error.message || "";
				if (
					msg.includes("EMAIL_ALREADY_VERIFIED") ||
					res.error.code === "EMAIL_ALREADY_VERIFIED"
				) {
					redirectReplace("/");
					return;
				}
				setResendFailed(true);
				setResendStatus("idle");
				return;
			}
			setResendStatus("sent");
		} catch {
			setResendFailed(true);
			setResendStatus("idle");
		}
	};

	return (
		<div
			role="alert"
			className="grid gap-4 rounded-xl border border-destructive/30 bg-card p-5 text-card-foreground shadow-sm"
		>
			<div className="flex items-start gap-3">
				<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-destructive">
					<CircleAlert aria-hidden="true" className="size-5" />
				</span>
				<div className="grid gap-1">
					<h1 className="font-semibold text-base tracking-tight">
						Không thể truy cập trang này
					</h1>
					<p className="text-muted-foreground text-sm leading-relaxed">
						{message}
					</p>
					{email && (
						<p className="mt-1 text-muted-foreground text-xs">
							Đang đăng nhập:{" "}
							<span className="font-medium text-foreground">{email}</span>
						</p>
					)}
				</div>
			</div>

			<div className="grid gap-2">
				{showResend &&
					(resendStatus === "sent" ? (
						<p
							role="status"
							className="rounded-md bg-success-soft px-3 py-2 text-center text-foreground text-sm"
						>
							Đã gửi lại email xác thực — vui lòng kiểm tra hộp thư của bạn.
						</p>
					) : (
						<>
							<button
								type="button"
								disabled={resendStatus === "sending" || signingOut}
								onClick={() => void handleResendVerification()}
								className="inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 font-medium text-sm shadow-xs outline-none transition-all hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30"
							>
								{resendStatus === "sending" ? (
									<>
										<Loader2
											aria-hidden="true"
											className="size-4 animate-spin"
										/>
										Đang gửi…
									</>
								) : (
									<>
										<Mail aria-hidden="true" className="size-4" />
										Gửi lại email xác thực
									</>
								)}
							</button>
							{resendFailed && (
								<p
									role="alert"
									className="text-center text-destructive text-xs"
								>
									Không gửi được email xác thực. Vui lòng thử lại.
								</p>
							)}
						</>
					))}

				<button
					type="button"
					disabled={signingOut || resendStatus === "sending"}
					onClick={() => void handleSignOut()}
					className="inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm shadow-xs outline-none transition-all hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
				>
					{signingOut ? (
						<>
							<Loader2 aria-hidden="true" className="size-4 animate-spin" />
							Đang đăng xuất…
						</>
					) : (
						<>
							<LogOut aria-hidden="true" className="size-4" />
							Đăng xuất để đổi tài khoản
						</>
					)}
				</button>
			</div>
		</div>
	);
}
