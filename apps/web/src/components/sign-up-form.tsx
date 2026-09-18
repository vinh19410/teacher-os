import { useForm } from "@tanstack/react-form";
import { useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AuthField, fieldErrors } from "@/components/auth/auth-field";
import { NoticeOk } from "@/components/auth/notices";
import { resetFieldErrors } from "@/components/auth/reset-field-errors";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-error";
import { cn } from "@/lib/cn";
import { validateReturnUrl } from "@/lib/kernel-load-state";
import { signUpSchema } from "@/lib/sign-up-schema";

export default function SignUpForm({
	hidden,
	onSubmittingChange,
}: {
	hidden: boolean;
	onSubmittingChange?: (submitting: boolean) => void;
}) {
	const { returnUrl } = useSearch({ from: "/login" });
	const [accountCreated, setAccountCreated] = useState(false);

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
			name: "",
		},
		onSubmit: async ({ value }) => {
			onSubmittingChange?.(true);
			const AUTH_FAILED =
				"Couldn't create your account. Check your connection and try again.";
			try {
				// Layer 1: the auth call. A rejected fetch throws (no callbacks
				// fire), so the catch below owns it — silent failures shipped the
				// QC #125 incident.
				const { error } = await authClient.signUp.email({
					email: value.email,
					password: value.password,
					name: value.name,
				});
				if (error) {
					toast.error(authErrorMessage(error, AUTH_FAILED));
					return;
				}
				// Layer 2: session verification — its own failure path with its
				// own copy; a lost cookie must never read as "signup failed".
				let session: { user?: { id: string } } | null = null;
				try {
					session = (await authClient.getSession()).data;
				} catch {
					session = null;
				}
				if (!session?.user) {
					toast.error(
						"Your account is ready, but we couldn't start your session. Please sign in.",
					);
					return;
				}
				setAccountCreated(true);
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
			onSubmit: signUpSchema,
		},
	});

	return (
		<form
			noValidate
			hidden={hidden}
			id="panel-signup"
			role="tabpanel"
			aria-labelledby="tab-signup"
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				form.handleSubmit();
			}}
			className="fade-in slide-in-from-bottom-1 animate-in duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:animate-none"
		>
			{accountCreated && (
				<NoticeOk title="Account created">Opening your workspace…</NoticeOk>
			)}

			<form.Field name="name">
				{(field) => (
					<AuthField
						id="su-name"
						name="name"
						label="Name"
						type="text"
						required
						autoComplete="name"
						placeholder="Your name"
						value={field.state.value}
						onChange={(value) => {
							field.handleChange(value);
							resetFieldErrors(form, "name");
						}}
						onBlur={field.handleBlur}
						errors={fieldErrors(field.state.meta.errors)}
					/>
				)}
			</form.Field>

			<form.Field name="email">
				{(field) => (
					<AuthField
						id="su-email"
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
				{(field) => {
					const met = field.state.value.length >= 8;
					return (
						<AuthField
							id="su-password"
							name="password"
							label="Password"
							type="password"
							required
							autoComplete="new-password"
							placeholder="At least 8 characters"
							hint={
								<span
									className={cn(
										"flex items-center gap-[6px] transition-colors duration-[150ms] motion-reduce:transition-none",
										met
											? "text-[color-mix(in_oklab,var(--success),black_24%)]"
											: "text-muted-fg",
									)}
								>
									<span
										aria-hidden="true"
										className={cn(
											"grid h-[14px] w-[14px] flex-none place-items-center rounded-full border-[1.5px]",
											met ? "border-success bg-success" : "border-line",
										)}
									>
										{met && (
											<span className="block h-[4px] w-[7px] -translate-y-[1px] rotate-[-45deg] border-bg border-b-[1.6px] border-l-[1.6px]" />
										)}
									</span>
									At least 8 characters
								</span>
							}
							value={field.state.value}
							onChange={(value) => {
								field.handleChange(value);
								resetFieldErrors(form, "password");
							}}
							onBlur={field.handleBlur}
							errors={fieldErrors(field.state.meta.errors)}
						/>
					);
				}}
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
						spinningLabel="Creating account…"
						label="Create account"
					/>
				)}
			</form.Subscribe>
		</form>
	);
}
