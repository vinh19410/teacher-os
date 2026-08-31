import z from "zod";

export const EMAIL_REQUIRED = "Email is required";
export const EMAIL_INVALID = "Invalid email address";
export const PASSWORD_REQUIRED = "Password is required";

/**
 * Sign-in validation (issue #114): required-first messages, and NO password
 * length rule — length is a sign-up policy; the server (better-auth) verifies
 * credentials on sign-in. The trim() only feeds validation: TanStack Form
 * consumes just the schema issues and discards the parsed output, so the
 * submit handler must trim the email payload itself.
 */
export const signInSchema = z.object({
	email: z.string().trim().min(1, EMAIL_REQUIRED).pipe(z.email(EMAIL_INVALID)),
	password: z.string().min(1, PASSWORD_REQUIRED),
});
