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
				<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
					<MailCheck className="size-7 text-primary" />
				</div>
				<h2 className="font-semibold text-xl tracking-tight">
					Email đã được xác thực
				</h2>
				<p className="mt-2 text-muted-foreground text-sm">
					Địa chỉ email của bạn đã được xác nhận. Bạn sẵn sàng bắt đầu.
				</p>
				<div className="mt-6 flex justify-center">
					<button
						type="button"
						onClick={() => window.location.assign("/")}
						className="inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary font-medium text-primary-foreground text-sm shadow-xs outline-none transition-all hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
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
				<CircleAlert className="size-7 text-destructive" />
			</div>
			<h2 className="font-semibold text-xl tracking-tight">
				Liên kết không hoạt động
			</h2>
			<p className="mt-2 text-muted-foreground text-sm">
				Liên kết xác thực không hợp lệ, đã được sử dụng hoặc đã hết hạn. Hãy yêu
				cầu liên kết mới hoặc đăng nhập để tiếp tục.
			</p>
			{!isPending && canResend && userEmail ? (
				resendStatus === "sent" ? (
					<p className="mt-6 text-foreground text-sm">
						Đã gửi lại — kiểm tra hộp thư
					</p>
				) : (
					<div className="mt-6 flex flex-wrap justify-center">
						<button
							type="button"
							onClick={() => void handleResend()}
							disabled={resendStatus === "sending"}
							className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary font-medium text-primary-foreground text-sm shadow-xs outline-none transition-all hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
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
							<p className="mt-2 w-full text-destructive text-sm">
								Không gửi được email mới. Vui lòng thử lại.
							</p>
						)}
					</div>
				)
			) : !isPending && !canResend ? (
				<p className="mt-6">
					<a
						href="/login"
						className="font-medium text-primary text-sm underline-offset-4 hover:underline"
					>
						Về đăng nhập
					</a>
				</p>
			) : null}
		</div>
	);
}
