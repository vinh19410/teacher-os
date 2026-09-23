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
import { signUpSchema } from "@/lib/auth-schemas";
import { validateReturnUrl } from "@/lib/validate-return-url";

export function SignUpForm({
	hidden,
	onSubmittingChange,
}: {
	hidden: boolean;
	onSubmittingChange?: (submitting: boolean) => void;
}) {
	const search = useSearch({ strict: false }) as { returnUrl?: string };
	const returnUrl = search.returnUrl;
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
				"Không thể tạo tài khoản. Vui lòng kiểm tra kết nối và thử lại.";
			try {
				const { error } = await authClient.signUp.email({
					email: value.email.trim(),
					password: value.password,
					name: value.name.trim(),
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
					toast.error(
						"Tài khoản đã tạo nhưng chưa thể bắt đầu phiên đăng nhập. Vui lòng đăng nhập lại.",
					);
					return;
				}

				setAccountCreated(true);
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
				void form.handleSubmit();
			}}
			className="fade-in slide-in-from-bottom-1 animate-in duration-[220ms] ease-[cubic-bezier(0.28,0,0.22,1)] motion-reduce:animate-none"
		>
			{accountCreated && (
				<NoticeOk title="Tài khoản đã tạo">
					Đang mở cổng thông tin học viên…
				</NoticeOk>
			)}

			<form.Field name="name">
				{(field) => {
					const errors = fieldErrors(field.state.meta.errors);
					return (
						<AuthField
							id="signup-name"
							label="Họ và tên"
							type="text"
							autoComplete="name"
							placeholder="Nguyễn Văn A"
							value={field.state.value}
							onChange={(next) => {
								resetFieldErrors(form, "name");
								field.handleChange(next);
							}}
							onBlur={field.handleBlur}
							errors={errors}
							required
						/>
					);
				}}
			</form.Field>

			<form.Field name="email">
				{(field) => {
					const errors = fieldErrors(field.state.meta.errors);
					return (
						<AuthField
							id="signup-email"
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
							id="signup-password"
							label="Mật khẩu"
							type="password"
							autoComplete="new-password"
							placeholder="Tối thiểu 8 ký tự"
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
						disabled={!canSubmit || isSubmitting || accountCreated}
						spinning={isSubmitting}
						spinningLabel="Đang tạo tài khoản…"
						label="Tạo tài khoản"
					/>
				)}
			</form.Subscribe>
		</form>
	);
}
