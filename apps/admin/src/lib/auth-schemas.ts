import z from "zod";

export const EMAIL_REQUIRED = "Vui lòng nhập email";
export const EMAIL_INVALID = "Email không hợp lệ";
export const PASSWORD_REQUIRED = "Vui lòng nhập mật khẩu";
export const NAME_MIN = "Tên phải có ít nhất 2 ký tự";
export const PASSWORD_MIN = "Mật khẩu phải có ít nhất 8 ký tự";

export const signInSchema = z.object({
	email: z.string().trim().min(1, EMAIL_REQUIRED).pipe(z.email(EMAIL_INVALID)),
	password: z.string().min(1, PASSWORD_REQUIRED),
});

export const signUpSchema = z.object({
	name: z.string().min(2, NAME_MIN),
	email: z.email(EMAIL_INVALID),
	password: z.string().min(8, PASSWORD_MIN),
});
