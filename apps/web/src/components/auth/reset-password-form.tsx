import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { AuthField, fieldErrors } from "@/components/auth/auth-field";
import { NoticeInfo, NoticeOk } from "@/components/auth/notices";
import { resetFieldErrors } from "@/components/auth/reset-field-errors";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN } from "@/lib/sign-up-schema";

const INVALID_LINK = "This reset link is invalid or has expired.";
const UPDATE_FAILED = "Couldn't update your password. Try again.";
const PASSWORDS_MISMATCH = "Passwords do not match";

const LINK_CLASS =
	"rounded-[4px] text-meta text-sm underline underline-offset-[3px] transition-colors duration-[150ms] hover:text-hot focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

const resetPasswordSchema = z
	.object({
		newPassword: z.string().min(8, PASSWORD_MIN),
		confirmPassword: z.string(),
	})
	.refine((value) => value.newPassword === value.confirmPassword, {
		message: PASSWORDS_MISMATCH,
		path: ["confirmPassword"],
	});

function InvalidLinkView() {
	return (
		<div>
			<NoticeInfo>{INVALID_LINK}</NoticeInfo>
			<Link to="/forgot-password" className={LINK_CLASS}>
				Request a new link
			</Link>
		</div>
	);
}

/**
 * `token` is captured by the route from the mail link and never read from the
 * URL here; it only travels in the resetPassword request body.
 */
export default function ResetPasswordForm({
	token,
}: {
	token: string | undefined;
}) {
	const [done, setDone] = useState(false);
	const [tokenRejected, setTokenRejected] = useState(false);

	const form = useForm({
		defaultValues: { newPassword: "", confirmPassword: "" },
		onSubmit: async ({ value }) => {
			if (!token) return;
			try {
				const { error } = await authClient.resetPassword({
					newPassword: value.newPassword,
					token,
				});
				if (error) {
					// Only a rejected token ends the flow; network/5xx/429 leave the
					// token unconsumed so the user can retry on the same form.
					if (error.code === "INVALID_TOKEN") {
						setTokenRejected(true);
						return;
					}
					toast.error(UPDATE_FAILED);
					return;
				}
				setDone(true);
			} catch {
				toast.error(UPDATE_FAILED);
			}
		},
		validators: { onSubmit: resetPasswordSchema },
	});

	if (!token || tokenRejected) {
		return <InvalidLinkView />;
	}

	if (done) {
		return (
			<div>
				<NoticeOk title="Password updated" />
				<Link to="/login" className={LINK_CLASS}>
					Sign in
				</Link>
			</div>
		);
	}

	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				form.handleSubmit();
			}}
		>
			<form.Field name="newPassword">
				{(field) => (
					<AuthField
						id="rp-new-password"
						name="newPassword"
						label="New password"
						type="password"
						required
						autoComplete="new-password"
						placeholder="••••••••"
						passwordToggle
						value={field.state.value}
						onChange={(value) => {
							field.handleChange(value);
							resetFieldErrors(form, "newPassword");
							// The mismatch error lives on the confirm field; clear it too
							// or canSubmit stays false after the user fixes this value.
							resetFieldErrors(form, "confirmPassword");
						}}
						onBlur={field.handleBlur}
						errors={fieldErrors(field.state.meta.errors)}
					/>
				)}
			</form.Field>

			<form.Field name="confirmPassword">
				{(field) => (
					<AuthField
						id="rp-confirm-password"
						name="confirmPassword"
						label="Confirm password"
						type="password"
						required
						autoComplete="new-password"
						placeholder="••••••••"
						passwordToggle
						value={field.state.value}
						onChange={(value) => {
							field.handleChange(value);
							resetFieldErrors(form, "confirmPassword");
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
						disabled={!canSubmit || isSubmitting}
						spinning={isSubmitting}
						spinningLabel="Updating…"
						label="Update password"
					/>
				)}
			</form.Subscribe>
		</form>
	);
}
