import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthField, fieldErrors } from "@/components/auth/auth-field";
import { NoticeInfo } from "@/components/auth/notices";
import { resetFieldErrors } from "@/components/auth/reset-field-errors";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-error";
import { signInSchema } from "@/lib/sign-in-schema";

const SENT_NOTICE =
	"If an account exists for that email, we sent a reset link. It expires in 1 hour.";
const TOO_MANY_REQUESTS = "Too many requests. Wait a minute and try again.";
const SEND_FAILED = "Couldn't send the reset email. Try again.";

/** Gap to better-auth's 3 requests / 60s limit on request-password-reset. */
const RESEND_COOLDOWN_SECONDS = 60;

const forgotPasswordSchema = signInSchema.pick({ email: true });

export default function ForgotPasswordForm() {
	const [sent, setSent] = useState(false);
	const [cooldown, setCooldown] = useState(0);

	useEffect(() => {
		if (cooldown <= 0) return;
		const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
		return () => clearTimeout(timer);
	}, [cooldown]);

	const form = useForm({
		defaultValues: { email: "" },
		onSubmit: async ({ value }) => {
			if (cooldown > 0) return;
			try {
				// redirectTo is built from our own origin only: better-auth rejects
				// origins outside trustedOrigins, and nothing from the URL may
				// steer it (open-redirect guard).
				const { error } = await authClient.requestPasswordReset({
					email: value.email.trim(),
					redirectTo: `${window.location.origin}/reset-password`,
				});
				if (error) {
					toast.error(
						error.status === 429
							? TOO_MANY_REQUESTS
							: authErrorMessage(error, SEND_FAILED),
					);
					return;
				}
				setSent(true);
				setCooldown(RESEND_COOLDOWN_SECONDS);
			} catch {
				toast.error(SEND_FAILED);
			}
		},
		validators: { onSubmit: forgotPasswordSchema },
	});

	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				form.handleSubmit();
			}}
			className="grid gap-4"
		>
			{sent && <NoticeInfo>{SENT_NOTICE}</NoticeInfo>}

			<form.Field name="email">
				{(field) => (
					<AuthField
						id="fp-email"
						name="email"
						label="Email"
						type="email"
						required
						autoComplete="email"
						placeholder="you@school.edu"
						value={field.state.value}
						onChange={(value) => {
							field.handleChange(value);
							resetFieldErrors(form, "email");
						}}
						onBlur={field.handleBlur}
						errors={fieldErrors(field.state.meta.errors)}
					/>
				)}
			</form.Field>

			<form.Subscribe
				selector={(state) => ({
					canSubmit: state.canSubmit,
					isSubmitting: state.isSubmitting,
				})}
			>
				{({ canSubmit, isSubmitting }) => (
					<SubmitButton
						disabled={!canSubmit || isSubmitting || cooldown > 0}
						spinning={isSubmitting}
						spinningLabel="Sending…"
						label={cooldown > 0 ? `Resend in ${cooldown}s` : "Send reset link"}
					/>
				)}
			</form.Subscribe>
		</form>
	);
}
