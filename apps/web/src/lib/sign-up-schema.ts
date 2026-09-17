import z from "zod";

import { EMAIL_INVALID } from "./sign-in-schema";

export const NAME_MIN = "Name must be at least 2 characters";
export const PASSWORD_MIN = "Password must be at least 8 characters";

/**
 * Sign-up validation — extracted verbatim from sign-up-form.tsx (#165) so
 * the schema is unit-testable like signInSchema. Messages are frozen
 * user-visible copy (the #142 required-first follow-up builds on them).
 */
export const signUpSchema = z.object({
	name: z.string().min(2, NAME_MIN),
	email: z.email(EMAIL_INVALID),
	password: z.string().min(8, PASSWORD_MIN),
});
