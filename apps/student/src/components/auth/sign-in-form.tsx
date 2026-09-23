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
import { signInSchema } from "@/lib/auth-schemas";
import { validateReturnUrl } from "@/lib/validate-return-url";

export function SignInForm({
	hidden,
	onSubmittingChange,
}: {
	hidden: boolean;
	onSubmittingChange?: (submitting: boolean) => void;
}) {
	const search = useSearch({ strict: false }) as { returnUrl?: string };
	const returnUrl = search.returnUrl;
	const [signedIn, setSignedIn] = useState(false);

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			onSubmittingChange?.(true);
			const AUTH_FAILED =
				"Không thể đăng nhập. Vui lòng kiểm tra email và mật khẩu rồi thử lại.";
			try {
				const { error } = await authClient.signIn.email({
					email: value.email.trim(),
					password: value.password,
				});
				if (error) {
					toast.error(authErrorMessage(error, AUTH_FAILED));
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
				toast.error(AUTH_FAILED);
			} finally {
				onSubmittingChange?.(false);
			}
		},
		validators: {
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
				void form.handleSubmit();
			}}
			className="fade-in slide-in-from-bottom-1 animate-in duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:animate-none"
		>
			{signedIn && (
				<NoticeOk title="Đăng nhập thành công">
					Đang mở cổng thông tin học viên…
				</NoticeOk>
			)}

			<form.Field name="email">
				{(field) => {
					const errors = fieldErrors(field.state.meta.errors);
					return (
						<AuthField
							id="signin-email"
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

			<form.Field name="password">
				{(field) => {
					const errors = fieldErrors(field.state.meta.errors);
					return (
						<AuthField
							id="signin-password"
							label="Mật khẩu"
							type="password"
							autoComplete="current-password"
							placeholder="Nhập mật khẩu"
							passwordToggle
							value={field.state.value}
							onChange={(next) => {
								resetFieldErrors(form, "password");
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
						disabled={!canSubmit || isSubmitting || signedIn}
						spinning={isSubmitting}
						spinningLabel="Đang đăng nhập…"
						label="Đăng nhập"
					/>
				)}
			</form.Subscribe>
		</form>
	);
}
