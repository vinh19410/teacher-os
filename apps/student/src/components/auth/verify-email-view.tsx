import { CircleAlert, Loader2, MailCheck } from "lucide-react";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

interface VerifyEmailViewProps {
	verified?: string;
	error?: string;
}

export function VerifyEmailView({ verified, error }: VerifyEmailViewProps) {
	const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">(
		"idle",
	);
	const [resendFailed, setResendFailed] = useState(false);
	const { data: session, isPending } = authClient.useSession();
	const user = session?.user;

	// Trạng thái trang chỉ đọc từ query marker mà callbackURL nướng sẵn:
	// redirect thành công của better-auth giữ nguyên callback URL, lỗi thì
	// append &error=<code>. Marker phải là giá trị parseSearch mặc định
	// của TanStack Router giữ nguyên string — giá trị JSON-parsable ("1",
	// "true") bị parse thành number/boolean rồi URL-sync prune mất param.
	// Mirror logic 3 nhánh của view web.
	const success = !error && verified === "ok";
	const userEmail = user?.email;
	const canResend = Boolean(userEmail && user?.emailVerified === false);

	const handleResend = async () => {
		if (!userEmail) return;
		setResendStatus("sending");
		setResendFailed(false);
		try {
			const res = await authClient.sendVerificationEmail({
				email: userEmail,
				callbackURL: `${window.location.origin}/verify-email?verified=ok`,
			});
			if (res.error) {
				const msg = res.error.message || "";
				// Đã verify trong lúc trôi qua → reload để card đọc lại session
				// mới (precedent student-error-view).
				if (
					msg.includes("EMAIL_ALREADY_VERIFIED") ||
					res.error.code === "EMAIL_ALREADY_VERIFIED"
				) {
					window.location.reload();
					return;
				}
				setResendFailed(true);
				setResendStatus("idle");
				return;
			}
			// Copy thành công thay nút — không toast đôi lúc sai trạng thái.
			setResendStatus("sent");
		} catch {
			// Giữ nút bấm lại được, nhưng nói rõ lần gửi đã lỗi — về idle câm
			// lặng thì user tưởng bấm không ăn.
			setResendFailed(true);
			setResendStatus("idle");
			return;
		}
	};

	if (success) {
		return (
			<div className="text-center">
				<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
					<MailCheck className="h-7 w-7 text-accent-blue" />
				</div>
				<h2 className="font-[620] font-display text-[28px] leading-[1.15] tracking-[-0.015em] max-[420px]:text-[24px]">
					Email đã được xác thực
				</h2>
				<p className="mt-2 text-muted-fg text-sm">
					Địa chỉ email của bạn đã được xác nhận. Bạn sẵn sàng bắt đầu.
				</p>
				<div className="mt-6 flex justify-center">
					<button
						type="button"
						onClick={() => window.location.assign("/")}
						className="w-full rounded-full bg-accent-blue px-[18px] py-[10px] font-medium text-accent-on text-sm transition-colors duration-[150ms] hover:bg-accent-hover focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
					>
						Vào cổng học viên
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="text-center">
			<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft">
				<CircleAlert className="h-7 w-7 text-danger" />
			</div>
			<h2 className="font-[620] font-display text-[28px] leading-[1.15] tracking-[-0.015em] max-[420px]:text-[24px]">
				Liên kết không hoạt động
			</h2>
			<p className="mt-2 text-muted-fg text-sm">
				Liên kết xác thực không hợp lệ, đã được sử dụng hoặc đã hết hạn. Hãy yêu
				cầu liên kết mới hoặc đăng nhập để tiếp tục.
			</p>
			{!isPending && canResend && userEmail ? (
				resendStatus === "sent" ? (
					<p className="mt-6 text-sm text-success">
						Đã gửi lại — kiểm tra hộp thư
					</p>
				) : (
					<div className="mt-6 flex flex-wrap justify-center">
						<button
							type="button"
							onClick={() => void handleResend()}
							disabled={resendStatus === "sending"}
							className="flex items-center gap-2 rounded-full bg-accent-blue px-[18px] py-[10px] font-medium text-accent-on text-sm transition-colors duration-[150ms] hover:bg-accent-hover focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
						>
							{resendStatus === "sending" ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />
									Đang gửi…
								</>
							) : (
								"Gửi lại email"
							)}
						</button>
						{resendFailed && (
							<p className="mt-2 w-full text-danger text-sm">
								Không gửi được email mới. Vui lòng thử lại.
							</p>
						)}
					</div>
				)
			) : !isPending && !canResend ? (
				<p className="mt-6">
					<a
						href="/login"
						className="font-[590] text-accent-blue text-sm underline-offset-[3px] hover:underline"
					>
						Về đăng nhập
					</a>
				</p>
			) : null}
		</div>
	);
}
