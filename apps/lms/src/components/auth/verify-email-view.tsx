import { Link } from "@tanstack/react-router";
import { roleHomePath } from "@teacher-os/auth/role";
import { CircleAlert, Loader2, MailCheck } from "lucide-react";
import { useState } from "react";
import { authClient, getSessionUserRole } from "@/lib/auth-client";
import { redirectAssign, reloadPage } from "@/lib/navigation";

interface VerifyEmailViewProps {
	verified?: string;
	error?: string;
}

function getRolePortalCta(role: string | null): {
	href: string;
	label: string;
} {
	if (role === "teacher") {
		return { href: roleHomePath("teacher"), label: "Vào trang giáo viên" };
	}
	if (role === "admin") {
		return { href: roleHomePath("admin"), label: "Vào trang quản trị" };
	}
	return { href: roleHomePath("student"), label: "Vào cổng học viên" };
}

export function VerifyEmailView({ verified, error }: VerifyEmailViewProps) {
	const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">(
		"idle",
	);
	const [resendFailed, setResendFailed] = useState(false);
	const { data: session, isPending } = authClient.useSession();
	const user = session?.user;

	const success = !error && verified === "ok";
	const userEmail = user?.email;
	const canResend = Boolean(userEmail && user?.emailVerified === false);
	const role = getSessionUserRole(session);
	const cta = getRolePortalCta(role);

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
				if (
					msg.includes("EMAIL_ALREADY_VERIFIED") ||
					res.error.code === "EMAIL_ALREADY_VERIFIED"
				) {
					reloadPage();
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

	if (success) {
		return (
			<div className="text-center">
				<div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
					<MailCheck aria-hidden="true" className="size-7 text-primary" />
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
						disabled={isPending}
						onClick={() => redirectAssign(cta.href)}
						className="inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary font-medium text-primary-foreground text-sm shadow-xs outline-none transition-all hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
					>
						{cta.label}
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="text-center">
			<div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-danger-soft">
				<CircleAlert aria-hidden="true" className="size-7 text-destructive" />
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
					<p className="mt-6 text-foreground text-sm" role="status">
						Đã gửi lại — kiểm tra hộp thư
					</p>
				) : (
					<div className="mt-6 flex flex-wrap justify-center">
						<button
							type="button"
							onClick={() => void handleResend()}
							disabled={resendStatus === "sending"}
							className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm shadow-xs outline-none transition-all hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
						>
							{resendStatus === "sending" ? (
								<>
									<Loader2 aria-hidden="true" className="size-4 animate-spin" />
									Đang gửi…
								</>
							) : (
								"Gửi lại email xác thực"
							)}
						</button>
						{resendFailed && (
							<p role="alert" className="mt-2 w-full text-destructive text-sm">
								Không gửi được email mới. Vui lòng thử lại.
							</p>
						)}
					</div>
				)
			) : !isPending && !canResend ? (
				<p className="mt-6">
					<Link
						to="/login"
						className="font-medium text-primary text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
					>
						Về đăng nhập
					</Link>
				</p>
			) : null}
		</div>
	);
}
