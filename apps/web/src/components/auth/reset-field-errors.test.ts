import { FormApi } from "@tanstack/react-form";
import { describe, expect, test } from "vitest";
import z from "zod";

import { resetFieldErrors } from "./reset-field-errors";

const schema = z.object({
	email: z
		.string()
		.trim()
		.min(1, "Email is required")
		.pipe(z.email("Invalid email address")),
	password: z.string().min(1, "Password is required"),
});

// Issue #165: TanStack Form v1 keeps the onSubmit errorMap entry forever
// (nothing re-validates that cause), canSubmit stays false after the first
// invalid submit, and handleSubmit() early-returns on !canSubmit — the user
// can never recover without a reload. resetFieldErrors is the escape hatch:
// clearing the edited field's errors must restore submit-ability.
describe("resetFieldErrors (issue #165 submit deadlock)", () => {
	test("failed submit locks canSubmit; editing each field with reset recovers and resubmits", async () => {
		let submissions = 0;
		const form = new FormApi({
			defaultValues: { email: "", password: "" },
			validators: { onSubmit: schema },
			onSubmit: async () => {
				submissions += 1;
			},
		});

		form.setFieldValue("email", "not-an-email");
		form.setFieldValue("password", "x");
		await form.handleSubmit();
		expect(submissions).toBe(0);
		expect(form.state.canSubmit).toBe(false);

		// Editing only the email leaves the password gate in place.
		form.setFieldValue("email", "teacher@school.edu");
		resetFieldErrors(form, "email");
		expect(form.getFieldMeta("email")?.errors).toEqual([]);

		// After both fields are corrected (and cleared), submit recovers.
		form.setFieldValue("password", "validpassword");
		resetFieldErrors(form, "password");
		await form.handleSubmit();
		expect(submissions).toBe(1);
		expect(form.state.canSubmit).toBe(true);
	});

	test("clearing one field keeps untouched fields' errors visible", async () => {
		const form = new FormApi({
			defaultValues: { email: "", password: "" },
			validators: { onSubmit: schema },
			onSubmit: async () => {},
		});
		await form.handleSubmit();
		expect(form.getFieldMeta("password")?.errors?.length).toBeGreaterThan(0);

		form.setFieldValue("email", "teacher@school.edu");
		resetFieldErrors(form, "email");
		expect(form.getFieldMeta("email")?.errors).toEqual([]);
		expect(form.getFieldMeta("password")?.errors?.length).toBeGreaterThan(0);
	});

	test("resetting a pristine field is a no-op", () => {
		const form = new FormApi({
			defaultValues: { email: "", password: "" },
			validators: { onSubmit: schema },
			onSubmit: async () => {},
		});
		resetFieldErrors(form, "email");
		expect(form.state.canSubmit).toBe(true);
	});
});
