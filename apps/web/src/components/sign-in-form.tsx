import { useForm } from "@tanstack/react-form";
import { Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AuthField, fieldErrors } from "@/components/auth/auth-field";
import { NoticeOk } from "@/components/auth/notices";
import { resetFieldErrors } from "@/components/auth/reset-field-errors";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-error";
import { validateReturnUrl } from "@/lib/kernel-load-state";
import { signInSchema } from "@/lib/sign-in-schema";

export default function SignInForm({
	hidden,
	onSubmittingChange,
}: {
	hidden: boolean;
	onSubmittingChange?: (submitting: boolean) => void;
}) {
	const { returnUrl } = useSearch({ from: "/login" });
	const [signedIn, setSignedIn] = useState(false);

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			onSubmittingChange?.(true);
			const AUTH_FAILED =
				"Couldn't sign you in. Check your email and password, then try again.";
			try {
				// Layer 1: the auth call. A rejected fetch throws (no callbacks
				// fire), so the catch below owns it — silent failures shipped the
				// QC #125 incident. The schema's trim() only feeds validation
				// (TanStack Form discards the parsed output), so trim the
				// payload here or a padded email passes the client yet fails
				// auth with a misleading "wrong password" toast (#114).
				const { error } = await authClient.signIn.email({
					email: value.email.trim(),
					password: value.password,
				});
				if (error) {
					toast.error(authErrorMessage(error, AUTH_FAILED));
					return;
				}
				// Layer 2: session verification — its own failure path with its
				// own copy; a lost cookie must never read as "sign-in failed".
				let session: { user?: { id: string } } | null = null;
				try {
					session = (await authClient.getSession()).data;
				} catch {
					session = null;
				}
				if (!session?.user) {
					toast.error(
						"We couldn't start your session. Please try signing in again.",
					);
					return;
				}
				setSignedIn(true);
				// Full page load: the workspace boots through the kernel
				// load gate with the fresh session.
				window.location.assign(validateReturnUrl(returnUrl));
			} catch {
				toast.error(AUTH_FAILED);
			} finally {
				onSubmittingChange?.(false);
			}
		},
		validators: {
			// Sign-in semantics (#114): required-first messages, no sign-up
			// min-length rule — see lib/sign-in-schema.ts.
			onSubmit: signInSchema,
		},
	});

	return (
		<form
			noValidate
			hidden={hidden}
			id="panel-signin"
			role="tabpanel"
			aria-labelledby="tab-signin"
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				form.handleSubmit();
			}}
			className="fade-in slide-in-from-bottom-1 grid animate-in gap-4 duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:animate-none"
		>
			{signedIn && (
				<NoticeOk title="Signed in">Opening your workspace…</NoticeOk>
			)}

			<form.Field name="email">
				{(field) => (
					<AuthField
						id="si-email"
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

			<form.Field name="password">
				{(field) => (
					<AuthField
						id="si-password"
						name="password"
						label="Password"
						type="password"
						required
						autoComplete="current-password"
						placeholder="••••••••"
						passwordToggle
						labelRowExtra={
							<Link
								to="/forgot-password"
								className="font-medium text-primary text-xs underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
							>
								Forgot password?
							</Link>
						}
						value={field.state.value}
						onChange={(value) => {
							field.handleChange(value);
							resetFieldErrors(form, "password");
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
						spinningLabel="Signing in…"
						label="Sign in"
					/>
				)}
			</form.Subscribe>
		</form>
	);
}
