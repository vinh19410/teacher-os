import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { AuthField, fieldErrors } from "@/components/auth/auth-field";
import { NoticeInfo } from "@/components/auth/notices";
import { resetFieldErrors } from "@/components/auth/reset-field-errors";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import { EMAIL_INVALID, EMAIL_REQUIRED } from "@/lib/auth-schemas";

const RESEND_COOLDOWN_SECONDS = 60;
const SENT_MESSAGE =
	"Nếu email này có tài khoản, chúng tôi đã gửi liên kết đặt lại. Liên kết hết hạn sau 1 giờ.";
const RATE_LIMITED_MESSAGE =
	"Bạn thử quá nhiều lần. Vui lòng đợi một phút rồi thử lại.";
const SEND_FAILED_MESSAGE = "Không gửi được email đặt lại. Vui lòng thử lại.";

const forgotPasswordSchema = z.object({
	email: z.string().trim().min(1, EMAIL_REQUIRED).pipe(z.email(EMAIL_INVALID)),
});

export function ForgotPasswordForm() {
	const [sent, setSent] = useState(false);
	const [cooldown, setCooldown] = useState(0);

	useEffect(() => {
		if (cooldown <= 0) return;
		const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
		return () => clearTimeout(timer);
	}, [cooldown]);

	const form = useForm({
		defaultValues: { email: "" },
		onSubmit: async ({ value }) => {
			if (cooldown > 0) return;
			try {
				const { error } = await authClient.requestPasswordReset({
					email: value.email.trim(),
					redirectTo: `${window.location.origin}/reset-password`,
				});
				if (error) {
					toast.error(
						error.status === 429 ? RATE_LIMITED_MESSAGE : SEND_FAILED_MESSAGE,
					);
					return;
				}
				setSent(true);
				setCooldown(RESEND_COOLDOWN_SECONDS);
			} catch {
				toast.error(SEND_FAILED_MESSAGE);
			}
		},
		validators: {
			onSubmit: forgotPasswordSchema,
		},
	});

	return (
		<form
			noValidate
			id="forgot-password-form"
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void form.handleSubmit();
			}}
		>
			{sent && <NoticeInfo>{SENT_MESSAGE}</NoticeInfo>}

			<form.Field name="email">
				{(field) => {
					const errors = fieldErrors(field.state.meta.errors);
					return (
						<AuthField
							id="forgot-email"
							label="Email"
							type="email"
							autoComplete="email"
							placeholder="hocvien@example.com"
							value={field.state.value}
							onChange={(next) => {
								resetFieldErrors(form, "email");
								field.handleChange(next);
							}}
							onBlur={field.handleBlur}
							errors={errors}
							required
						/>
					);
				}}
			</form.Field>

			<form.Subscribe
				selector={(state) => [state.canSubmit, state.isSubmitting] as const}
			>
				{([canSubmit, isSubmitting]) => (
					<SubmitButton
						disabled={!canSubmit || isSubmitting || cooldown > 0}
						spinning={isSubmitting}
						spinningLabel="Đang gửi…"
						label={
							cooldown > 0
								? `Gửi lại sau ${cooldown} giây`
								: "Gửi liên kết đặt lại"
						}
					/>
				)}
			</form.Subscribe>

			<p className="mt-[22px] text-center text-muted-fg text-sm">
				<Link
					to="/login"
					className="-mx-2 rounded-[4px] px-2 py-[6px] font-[590] text-hot text-sm underline-offset-[3px] transition-colors duration-[150ms] hover:text-accent-active hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
				>
					Quay lại đăng nhập
				</Link>
			</p>
		</form>
	);
}
