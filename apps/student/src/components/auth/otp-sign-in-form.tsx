import { useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AuthField } from "@/components/auth/auth-field";
import { NoticeOk } from "@/components/auth/notices";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-error";
import { validateReturnUrl } from "@/lib/validate-return-url";

interface OtpSignInFormProps {
	onSubmittingChange?: (submitting: boolean) => void;
	onSwitchToPassword?: () => void;
}

export function OtpSignInForm({
	onSubmittingChange,
	onSwitchToPassword,
}: OtpSignInFormProps) {
	const search = useSearch({ strict: false });
	const returnUrl =
		search &&
		typeof search === "object" &&
		"returnUrl" in search &&
		typeof search.returnUrl === "string"
			? search.returnUrl
			: undefined;

	const [step, setStep] = useState<"email" | "otp">("email");
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [emailError, setEmailError] = useState("");
	const [otpError, setOtpError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [signedIn, setSignedIn] = useState(false);
	const [countdown, setCountdown] = useState(0);

	useEffect(() => {
		if (countdown <= 0) return;
		const timer = setTimeout(() => {
			setCountdown((prev) => prev - 1);
		}, 1000);
		return () => clearTimeout(timer);
	}, [countdown]);

	const updateSubmitting = (submitting: boolean) => {
		setIsSubmitting(submitting);
		onSubmittingChange?.(submitting);
	};

	const validateEmail = (val: string): boolean => {
		const trimmed = val.trim();
		if (!trimmed) {
			setEmailError("Vui lòng nhập địa chỉ email.");
			return false;
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
			setEmailError("Địa chỉ email không đúng định dạng.");
			return false;
		}
		setEmailError("");
		return true;
	};

	const handleSendOtp = async (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!validateEmail(email)) return;

		updateSubmitting(true);
		try {
			const { error } = await authClient.emailOtp.sendVerificationOtp({
				email: email.trim(),
				type: "sign-in",
			});

			if (error) {
				toast.error(
					authErrorMessage(
						error,
						"Không thể gửi mã xác thực. Vui lòng thử lại.",
					),
				);
				return;
			}

			setStep("otp");
			setCountdown(60);
			setOtp("");
			setOtpError("");
			toast.success("Mã xác thực 6 số đã được gửi tới email của bạn.");
		} catch {
			toast.error("Không thể gửi mã xác thực. Vui lòng thử lại.");
		} finally {
			updateSubmitting(false);
		}
	};

	const handleVerifyOtp = async (e?: React.FormEvent) => {
		e?.preventDefault();
		const trimmedOtp = otp.trim();
		if (!trimmedOtp) {
			setOtpError("Vui lòng nhập mã xác thực 6 số.");
			return;
		}
		if (trimmedOtp.length !== 6 || !/^\d{6}$/.test(trimmedOtp)) {
			setOtpError("Mã xác thực phải gồm đúng 6 chữ số.");
			return;
		}
		setOtpError("");

		updateSubmitting(true);
		try {
			const { error } = await authClient.signIn.emailOtp({
				email: email.trim(),
				otp: trimmedOtp,
			});

			if (error) {
				let errMsg = "";
				let errCode = "";
				if (error && typeof error === "object") {
					if ("message" in error && typeof error.message === "string") {
						errMsg = error.message;
					}
					if ("code" in error && typeof error.code === "string") {
						errCode = error.code;
					}
				}
				const lowerMsg = errMsg.toLowerCase();
				if (
					errCode === "ROLE_MISMATCH" ||
					errMsg.includes("ROLE_MISMATCH") ||
					errMsg.includes("giáo viên")
				) {
					toast.error(
						"Tài khoản giáo viên không thể đăng nhập vào cổng học viên.",
					);
				} else if (
					errCode === "TOO_MANY_ATTEMPTS" ||
					lowerMsg.includes("too many attempts") ||
					lowerMsg.includes("quá nhiều lần")
				) {
					toast.error(
						"Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.",
					);
				} else if (
					errCode === "INVALID_OTP" ||
					errCode === "OTP_EXPIRED" ||
					lowerMsg.includes("invalid otp") ||
					lowerMsg.includes("otp expired") ||
					lowerMsg.includes("hết hạn")
				) {
					toast.error("Mã xác thực không đúng hoặc đã hết hạn.");
				} else {
					toast.error(
						authErrorMessage(error, "Mã xác thực không đúng hoặc đã hết hạn."),
					);
				}
				return;
			}

			let session: { user?: { id: string } } | null = null;
			try {
				session = (await authClient.getSession()).data;
			} catch {
				session = null;
			}

			if (!session?.user) {
				toast.error("Không thể khởi tạo phiên đăng nhập. Vui lòng thử lại.");
				return;
			}

			setSignedIn(true);
			window.location.assign(validateReturnUrl(returnUrl));
		} catch {
			toast.error("Mã xác thực không đúng hoặc đã hết hạn.");
		} finally {
			updateSubmitting(false);
		}
	};

	return (
		<div className="space-y-4">
			{signedIn && (
				<NoticeOk title="Đăng nhập thành công">
					Đang mở cổng thông tin học viên…
				</NoticeOk>
			)}

			{step === "email" ? (
				<form
					noValidate
					onSubmit={handleSendOtp}
					className="fade-in slide-in-from-bottom-1 grid animate-in gap-4 duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:animate-none"
				>
					<AuthField
						id="otp-email"
						label="Email học viên"
						type="email"
						autoComplete="email"
						placeholder="hocvien@example.com"
						value={email}
						onChange={(val) => {
							setEmail(val);
							if (emailError) validateEmail(val);
						}}
						onBlur={() => {
							if (email) validateEmail(email);
						}}
						errors={emailError ? [emailError] : []}
						required
					/>

					<SubmitButton
						disabled={isSubmitting}
						spinning={isSubmitting}
						spinningLabel="Đang gửi mã…"
						label="Gửi mã đăng nhập"
					/>
				</form>
			) : (
				<form
					noValidate
					onSubmit={handleVerifyOtp}
					className="fade-in slide-in-from-bottom-1 grid animate-in gap-4 duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:animate-none"
				>
					<div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
						<div className="flex items-center justify-between gap-2">
							<span className="truncate text-muted-foreground">
								Gửi tới: <strong className="text-foreground">{email}</strong>
							</span>
							<button
								type="button"
								disabled={isSubmitting}
								onClick={() => {
									setStep("email");
									setOtp("");
									setOtpError("");
								}}
								className="whitespace-nowrap font-medium text-primary text-xs underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
							>
								Đổi email
							</button>
						</div>
					</div>

					<div className="grid gap-2">
						<label
							htmlFor="otp-code"
							className="font-medium text-sm leading-none"
						>
							Mã xác thực 6 số <span className="text-destructive">*</span>
						</label>
						<input
							id="otp-code"
							name="otp"
							type="text"
							inputMode="numeric"
							autoComplete="one-time-code"
							pattern="[0-9]*"
							maxLength={6}
							placeholder="000000"
							value={otp}
							onChange={(e) => {
								const val = e.target.value.replace(/\D/g, "").slice(0, 6);
								setOtp(val);
								if (otpError) setOtpError("");
							}}
							disabled={isSubmitting}
							aria-invalid={Boolean(otpError)}
							aria-describedby={otpError ? "otp-code-error" : undefined}
							className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-center font-bold font-mono text-xl tracking-[0.3em] shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30"
						/>
						{otpError && (
							<p id="otp-code-error" className="text-destructive text-sm">
								{otpError}
							</p>
						)}
					</div>

					<SubmitButton
						disabled={isSubmitting || otp.length !== 6}
						spinning={isSubmitting}
						spinningLabel="Đang xác thực…"
						label="Đăng nhập"
					/>

					<div className="flex items-center justify-between text-xs">
						<span className="text-muted-foreground">Chưa nhận được mã?</span>
						<button
							type="button"
							disabled={countdown > 0 || isSubmitting}
							onClick={() => handleSendOtp()}
							className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
						>
							{countdown > 0 ? `Gửi lại sau ${countdown}s` : "Gửi lại mã"}
						</button>
					</div>
				</form>
			)}

			{onSwitchToPassword && (
				<div className="pt-2 text-center text-xs">
					<button
						type="button"
						disabled={isSubmitting}
						onClick={onSwitchToPassword}
						className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
					>
						Đăng nhập bằng mật khẩu
					</button>
				</div>
			)}
		</div>
	);
}
