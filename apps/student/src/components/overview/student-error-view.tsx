import { STUDENT_ERROR_CODES } from "@teacher-os/api/contracts";
import {
	AlertCircle,
	Check,
	Loader2,
	LogOut,
	MailCheck,
	RefreshCw,
	ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { NoticeInfo } from "@/components/auth/notices";
import { authClient } from "@/lib/auth-client";

interface StudentErrorViewProps {
	code?: string;
	userEmail?: string;
}

export function StudentErrorView({ code, userEmail }: StudentErrorViewProps) {
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
				callbackURL: `${window.location.origin}/login`,
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
				setResendError(msg || "Không thể gửi lại email. Vui lòng thử lại sau.");
				return;
			}
			setResendStatus("sent");
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("EMAIL_ALREADY_VERIFIED")) {
				window.location.reload();
				return;
			}
			setResendStatus("idle");
			setResendError("Không thể gửi lại email. Vui lòng thử lại sau.");
		}
	};

	let title = "Không thể truy cập cổng học viên";
	let description =
		"Đã xảy ra lỗi trong quá trình xác thực thông tin học viên. Vui lòng thử lại sau.";
	let icon = <AlertCircle className="h-8 w-8 text-muted-fg" />;

	const isEmailUnverified = code === STUDENT_ERROR_CODES.EMAIL_UNVERIFIED;

	if (code === STUDENT_ERROR_CODES.NOT_LINKED) {
		title = "Tài khoản chưa được liên kết";
		description = `Email ${userEmail ? `(${userEmail})` : ""} chưa được liên kết với hồ sơ học viên nào trên hệ thống. Vui lòng thông báo cho giáo viên để thêm email này vào danh sách lớp.`;
		icon = <AlertCircle className="h-8 w-8 text-muted-fg" />;
	} else if (isEmailUnverified) {
		title = "Email chưa được xác thực";
		description = userEmail
			? `Chúng tôi đã gửi liên kết xác thực đến ${userEmail}. Mở email và nhấn nút “Xác thực email” để kích hoạt hồ sơ học viên. Nếu không thấy, hãy kiểm tra mục Spam hoặc gửi lại liên kết.`
			: "Chúng tôi đã gửi liên kết xác thực đến email của bạn. Mở email và nhấn nút “Xác thực email” để kích hoạt hồ sơ học viên. Nếu không thấy, hãy kiểm tra mục Spam hoặc gửi lại liên kết.";
		icon = <MailCheck className="h-8 w-8 text-accent-blue" />;
	} else if (code === STUDENT_ERROR_CODES.AMBIGUOUS) {
		title = "Thông tin tài khoản chưa rõ ràng";
		description =
			"Hệ thống ghi nhận nhiều hơn một hồ sơ học viên trùng với email của bạn. Vui lòng liên hệ trung tâm để được chuẩn hóa danh tính.";
		icon = <ShieldAlert className="h-8 w-8 text-danger" />;
	}

	return (
		<div className="flex min-h-[70svh] items-center justify-center p-4">
			<div className="w-full max-w-[480px] rounded-[var(--radius-lg)] border border-line bg-surface/50 p-6 text-center shadow-[var(--elev-raised)] sm:p-8">
				<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface">
					{icon}
				</div>

				<h2 className="font-[620] font-display text-[22px] text-fg tracking-tight">
					{title}
				</h2>
				<p className="mt-2 text-[14px] text-muted-fg leading-relaxed">
					{description}
				</p>

				{isEmailUnverified && resendError && (
					<div className="mt-4 text-left">
						<NoticeInfo>{resendError}</NoticeInfo>
					</div>
				)}

				<div className="mt-6 flex flex-col items-center gap-3">
					{isEmailUnverified ? (
						<>
							<div className="flex flex-wrap items-center justify-center gap-3">
								{userEmail && (
									<button
										type="button"
										onClick={handleResend}
										disabled={resendStatus === "sending"}
										className={`flex items-center gap-2 rounded-[var(--radius-pill)] border px-5 py-2.5 font-[510] text-[14px] transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none ${
											resendStatus === "sent"
												? "border-success/30 bg-success-soft text-success"
												: "border-accent-blue/30 bg-accent-soft text-accent-blue hover:bg-accent-soft/80"
										}`}
									>
										{resendStatus === "sending" ? (
											<>
												<Loader2 className="h-4 w-4 animate-spin" />
												<span>Đang gửi…</span>
											</>
										) : resendStatus === "sent" ? (
											<>
												<Check className="h-4 w-4" />
												<span>Đã gửi lại — kiểm tra hộp thư</span>
											</>
										) : (
											<>
												<MailCheck className="h-4 w-4" />
												<span>Gửi lại email</span>
											</>
										)}
									</button>
								)}

								<button
									type="button"
									onClick={() => window.location.reload()}
									className="flex items-center gap-2 rounded-[var(--radius-pill)] border border-line bg-bg px-5 py-2.5 font-[510] text-[14px] text-fg transition-colors hover:border-line-hover hover:bg-surface focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
								>
									<RefreshCw className="h-4 w-4" />
									<span>Tôi đã xác thực — Kiểm tra lại</span>
								</button>
							</div>

							<button
								type="button"
								onClick={handleSignOut}
								className="mt-1 flex items-center gap-1.5 font-[480] text-[13px] text-muted-fg hover:text-fg"
							>
								<LogOut className="h-3.5 w-3.5" />
								<span>Đăng xuất</span>
							</button>
						</>
					) : (
						<button
							type="button"
							onClick={handleSignOut}
							className="flex items-center gap-2 rounded-[var(--radius-pill)] border border-line bg-bg px-5 py-2.5 font-[510] text-[14px] text-fg transition-colors hover:border-line-hover hover:bg-surface focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
						>
							<LogOut className="h-4 w-4" />
							<span>Đăng xuất</span>
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
