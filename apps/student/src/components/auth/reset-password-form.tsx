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
import { PASSWORD_MIN } from "@/lib/auth-schemas";

const INVALID_LINK_MESSAGE = "Liên kết đặt lại không hợp lệ hoặc đã hết hạn.";
const MISMATCH_MESSAGE = "Mật khẩu nhập lại không khớp";
const UPDATE_FAILED_MESSAGE = "Không đổi được mật khẩu. Vui lòng thử lại.";

const resetPasswordSchema = z
	.object({
		newPassword: z.string().min(8, PASSWORD_MIN),
		confirmPassword: z.string(),
	})
	.refine((value) => value.newPassword === value.confirmPassword, {
		message: MISMATCH_MESSAGE,
		path: ["confirmPassword"],
	});

const linkClassName =
	"-mx-2 rounded-[4px] px-2 py-[6px] font-[590] text-hot text-sm underline-offset-[3px] transition-colors duration-[150ms] hover:text-accent-active hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

function InvalidLinkView() {
	return (
		<div>
			<NoticeInfo>{INVALID_LINK_MESSAGE}</NoticeInfo>
			<p className="text-center text-sm">
				<Link to="/forgot-password" className={linkClassName}>
					Gửi lại liên kết đặt lại
				</Link>
			</p>
		</div>
	);
}

export function ResetPasswordForm({
	token,
	linkError,
}: {
	token: string | null;
	linkError: boolean;
}) {
	const [tokenRejected, setTokenRejected] = useState(false);
	const [done, setDone] = useState(false);

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
					if (error.code === "INVALID_TOKEN") {
						setTokenRejected(true);
						return;
					}
					toast.error(UPDATE_FAILED_MESSAGE);
					return;
				}
				setDone(true);
			} catch {
				toast.error(UPDATE_FAILED_MESSAGE);
			}
		},
		validators: {
			onSubmit: resetPasswordSchema,
		},
	});

	if (!token || linkError || tokenRejected) {
		return <InvalidLinkView />;
	}

	if (done) {
		return (
			<div>
				<NoticeOk title="Đã đổi mật khẩu." />
				<p className="text-center text-sm">
					<Link to="/login" className={linkClassName}>
						Đăng nhập
					</Link>
				</p>
			</div>
		);
	}

	return (
		<form
			noValidate
			id="reset-password-form"
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<form.Field name="newPassword">
				{(field) => {
					const errors = fieldErrors(field.state.meta.errors);
					return (
						<AuthField
							id="reset-password"
							label="Mật khẩu mới"
							type="password"
							autoComplete="new-password"
							placeholder="Ít nhất 8 ký tự"
							passwordToggle
							value={field.state.value}
							onChange={(next) => {
								resetFieldErrors(form, "newPassword");
								field.handleChange(next);
							}}
							onBlur={field.handleBlur}
							errors={errors}
							required
						/>
					);
				}}
			</form.Field>

			<form.Field name="confirmPassword">
				{(field) => {
					const errors = fieldErrors(field.state.meta.errors);
					return (
						<AuthField
							id="reset-confirm"
							label="Nhập lại mật khẩu mới"
							type="password"
							autoComplete="new-password"
							placeholder="Nhập lại mật khẩu mới"
							passwordToggle
							value={field.state.value}
							onChange={(next) => {
								resetFieldErrors(form, "confirmPassword");
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
						disabled={!canSubmit || isSubmitting}
						spinning={isSubmitting}
						spinningLabel="Đang đổi mật khẩu…"
						label="Đổi mật khẩu"
					/>
				)}
			</form.Subscribe>
		</form>
	);
}
