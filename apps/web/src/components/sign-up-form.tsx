import { useForm } from "@tanstack/react-form";
import { useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { AuthField } from "@/components/auth/auth-field";
import { NoticeOk } from "@/components/auth/notices";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { validateReturnUrl } from "@/lib/kernel-load-state";

const fieldErrors = (errors: readonly unknown[]): string[] =>
	errors
		.map((error) => (error as { message?: string } | undefined)?.message)
		.filter((message): message is string => typeof message === "string");

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
			try {
				await authClient.signUp.email(
					{
						email: value.email,
						password: value.password,
						name: value.name,
					},
					{
						onSuccess: () => {
							setAccountCreated(true);
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
				name: z.string().min(2, "Name must be at least 2 characters"),
				email: z.email("Invalid email address"),
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
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
						autoComplete="name"
						placeholder="Your name"
						value={field.state.value}
						onChange={field.handleChange}
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
				{(field) => {
					const met = field.state.value.length >= 8;
					return (
						<AuthField
							id="su-password"
							name="password"
							label="Password"
							type="password"
							autoComplete="new-password"
							placeholder="At least 8 characters"
							passwordToggle
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
							onChange={field.handleChange}
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
						{isSubmitting ? "Creating account…" : "Create account"}
					</button>
				)}
			</form.Subscribe>
		</form>
	);
}
