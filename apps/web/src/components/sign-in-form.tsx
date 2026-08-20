import { useForm } from "@tanstack/react-form";
import { useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { AuthField } from "@/components/auth/auth-field";
import { NoticeInfo, NoticeOk } from "@/components/auth/notices";
import { authClient } from "@/lib/auth-client";
import { validateReturnUrl } from "@/lib/kernel-load-state";

const fieldErrors = (errors: readonly unknown[]): string[] =>
	errors
		.map((error) => (error as { message?: string } | undefined)?.message)
		.filter((message): message is string => typeof message === "string");

export default function SignInForm({
	hidden,
	onSubmittingChange,
}: {
	hidden: boolean;
	onSubmittingChange?: (submitting: boolean) => void;
}) {
	const { returnUrl } = useSearch({ from: "/login" });
	const [showForgotNote, setShowForgotNote] = useState(false);
	const [signedIn, setSignedIn] = useState(false);

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			onSubmittingChange?.(true);
			try {
				await authClient.signIn.email(
					{
						email: value.email,
						password: value.password,
					},
					{
						onSuccess: () => {
							setSignedIn(true);
							// Full page load: the workspace boots through the kernel
							// load gate with the fresh session.
							window.location.assign(validateReturnUrl(returnUrl));
						},
						onError: (error) => {
							toast.error(error.error.message || error.error.statusText);
						},
					},
				);
			} finally {
				onSubmittingChange?.(false);
			}
		},
		validators: {
			onSubmit: z.object({
				email: z.email("Invalid email address"),
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
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
			className="fade-in slide-in-from-bottom-1 animate-in duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:animate-none"
		>
			{showForgotNote && !signedIn && (
				<NoticeInfo>
					Password reset isn't enabled in this pilot yet. Contact your admin to
					recover access.
				</NoticeInfo>
			)}
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
						autoComplete="email"
						placeholder="you@school.edu"
						value={field.state.value}
						onChange={field.handleChange}
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
						autoComplete="current-password"
						placeholder="••••••••"
						passwordToggle
						labelRowExtra={
							<button
								type="button"
								onClick={() => setShowForgotNote((visible) => !visible)}
								className="-mr-1 rounded-[4px] px-1 py-[6px] font-[510] text-accent-blue text-xs underline-offset-[3px] transition-colors duration-[150ms] hover:text-accent-active hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
							>
								Forgot password?
							</button>
						}
						value={field.state.value}
						onChange={field.handleChange}
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
					<button
						type="submit"
						disabled={!canSubmit || isSubmitting}
						className="mt-2 flex h-12 w-full items-center justify-center gap-[9px] rounded-[var(--radius-pill)] bg-accent-blue font-[590] text-accent-on text-sm tracking-[0.02em] transition-[background,transform] duration-[150ms] ease-[cubic-bezier(0.28,0,0.22,1)] hover:bg-accent-hover focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.97] active:bg-accent-active disabled:pointer-events-none disabled:opacity-40"
					>
						{isSubmitting && (
							<span
								aria-hidden="true"
								className="h-4 w-4 animate-spin rounded-full border-2 border-[color-mix(in_oklab,var(--accent-on),transparent_70%)] border-t-accent-on"
							/>
						)}
						{isSubmitting ? "Signing in…" : "Sign in"}
					</button>
				)}
			</form.Subscribe>
		</form>
	);
}
