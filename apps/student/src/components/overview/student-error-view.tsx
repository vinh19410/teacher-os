import {
	ACCOUNT_ERROR_CODES,
	STUDENT_ERROR_CODES,
} from "@teacher-os/api/contracts";
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
	let icon = <AlertCircle className="size-8 text-muted-foreground" />;

	const isEmailUnverified = code === STUDENT_ERROR_CODES.EMAIL_UNVERIFIED;

	// Nút resend thành công giữ viền outline; nhãn "Đã gửi" đổi sang chữ
	// thường (không còn màu hot) theo ngôn ngữ v2.
	const resendButtonClassName = `inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background px-4 py-2 font-medium text-sm shadow-xs outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 ${
		resendStatus === "sent" ? "text-muted-foreground" : "text-primary"
	}`;

	if (code === ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL) {
		title = "Đây là tài khoản giáo viên";
		description =
			"Tài khoản này thuộc hệ thống giáo viên, không đăng nhập được cổng học viên. Vui lòng đăng xuất và dùng tài khoản học viên.";
		icon = <ShieldAlert className="size-8 text-destructive" />;
	} else if (code === STUDENT_ERROR_CODES.NOT_LINKED) {
		title = "Tài khoản chưa được liên kết";
		description = `Email ${userEmail ? `(${userEmail})` : ""} hiện chưa tham gia lớp học nào. Nếu giáo viên đã gửi lời mời, vui lòng bấm vào biểu tượng Chuông thông báo ở góc trên để chấp nhận tham gia lớp.`;
		icon = <AlertCircle className="size-8 text-primary" />;
	} else if (isEmailUnverified) {
		title = "Email chưa được xác thực";
		description = userEmail
			? `Chúng tôi đã gửi liên kết xác thực đến ${userEmail}. Mở email và nhấn nút “Xác thực email” để kích hoạt hồ sơ học viên. Nếu không thấy, hãy kiểm tra mục Spam hoặc gửi lại liên kết.`
			: "Chúng tôi đã gửi liên kết xác thực đến email của bạn. Mở email và nhấn nút “Xác thực email” để kích hoạt hồ sơ học viên. Nếu không thấy, hãy kiểm tra mục Spam hoặc gửi lại liên kết.";
		icon = <MailCheck className="size-8 text-primary" />;
	} else if (code === STUDENT_ERROR_CODES.AMBIGUOUS) {
		title = "Thông tin tài khoản chưa rõ ràng";
		description =
			"Hệ thống ghi nhận nhiều hơn một hồ sơ học viên trùng với email của bạn. Vui lòng liên hệ trung tâm để được chuẩn hóa danh tính.";
		icon = <ShieldAlert className="size-8 text-destructive" />;
	}

	return (
		<div className="flex min-h-[70svh] items-center justify-center p-4">
			<div className="w-full max-w-[480px] rounded-xl border bg-card p-6 text-center shadow-sm sm:p-8">
				<div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
					{icon}
				</div>

				<h2 className="font-semibold text-lg tracking-tight">{title}</h2>
				<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
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
										className={resendButtonClassName}
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
									className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background px-4 py-2 font-medium text-sm shadow-xs outline-none transition-all hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
								>
									<RefreshCw className="h-4 w-4" />
									<span>Tôi đã xác thực — Kiểm tra lại</span>
								</button>
							</div>

							<button
								type="button"
								onClick={handleSignOut}
								className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
							>
								<LogOut className="h-3.5 w-3.5" />
								<span>Đăng xuất</span>
							</button>
						</>
					) : (
						<button
							type="button"
							onClick={handleSignOut}
							className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background px-4 py-2 font-medium text-sm shadow-xs outline-none transition-all hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
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
