import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AdminAuthShell } from "@/components/auth/admin-auth-shell";
import { AuthField, fieldErrors } from "@/components/auth/auth-field";
import { resetFieldErrors } from "@/components/auth/reset-field-errors";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-error";
import { NAME_MIN, signUpSchema } from "@/lib/auth-schemas";

const SIGNUP_FAILED =
	"Không thể tạo tài khoản. Email này có thể không nằm trong danh sách quản trị được cấp.";

/**
 * Route /register KHÔNG được link từ bất kỳ đâu (không đăng ký công khai):
 * chỉ phục vụ bootstrap admin đầu tiên. Server (phase 1) chặn mọi email
 * ngoài ADMIN_EMAILS nên đăng ký ngoài danh sách sẽ thất bại ở server.
 */
export const Route = createFileRoute("/register")({
	component: RouteComponent,
});

function RouteComponent() {
	const search = useSearch({ strict: false }) as { returnUrl?: string };
	const returnUrl = search.returnUrl;
	const [done, setDone] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	const form = useForm({
		defaultValues: { name: "", email: "", password: "" },
		onSubmit: async ({ value }) => {
			setSubmitting(true);
			try {
				const { error } = await authClient.signUp.email({
					name: value.name.trim(),
					email: value.email.trim(),
					password: value.password,
				});
				if (error) {
					toast.error(authErrorMessage(error, SIGNUP_FAILED));
					return;
				}
				setDone(true);
				window.location.assign(
					returnUrl?.startsWith("/") ? returnUrl : "/library/tests",
				);
			} catch {
				toast.error(SIGNUP_FAILED);
			} finally {
				setSubmitting(false);
			}
		},
		validators: {
			onSubmit: signUpSchema,
		},
	});

	return (
		<AdminAuthShell formLabel="Tạo tài khoản quản trị">
			<div className="grid gap-2 text-center">
				<h1 className="font-bold text-2xl">Tạo tài khoản quản trị</h1>
				<p className="text-balance text-muted-foreground text-sm">
					Chỉ email trong danh sách quản trị được cấp mới đăng ký được.
				</p>
			</div>

			{done && (
				<p role="status" className="text-center text-sm">
					Đã tạo tài khoản. Đang chuyển tiếp…
				</p>
			)}

			<form
				noValidate
				id="register-form"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void form.handleSubmit();
				}}
				className="grid gap-4"
			>
				<form.Field name="name">
					{(field) => {
						const errors = fieldErrors(field.state.meta.errors);
						return (
							<AuthField
								id="register-name"
								label="Tên"
								autoComplete="name"
								placeholder="Tên hiển thị"
								value={field.state.value}
								onChange={(next) => {
									resetFieldErrors(form, "name");
									field.handleChange(next);
								}}
								onBlur={field.handleBlur}
								errors={errors}
								hint={NAME_MIN}
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
								id="register-email"
								label="Email"
								type="email"
								autoComplete="email"
								placeholder="admin@example.com"
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
								id="register-password"
								label="Mật khẩu"
								type="password"
								autoComplete="new-password"
								placeholder="Ít nhất 8 ký tự"
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
							disabled={!canSubmit || isSubmitting || done}
							spinning={isSubmitting || submitting}
							spinningLabel="Đang tạo tài khoản…"
							label="Tạo tài khoản"
						/>
					)}
				</form.Subscribe>
			</form>

			<p className="text-center text-muted-foreground text-sm">
				<Link
					to="/login"
					search={{ returnUrl }}
					className="font-medium text-primary text-sm underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					Đã có tài khoản? Đăng nhập
				</Link>
			</p>
		</AdminAuthShell>
	);
}
