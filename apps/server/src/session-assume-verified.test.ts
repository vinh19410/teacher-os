import { describe, expect, test } from "vitest";
import { type Auth, getSessionUser } from "./session";

const authWith = (emailVerified: boolean) =>
	({
		api: {
			getSession: async () => ({
				user: {
					id: "u1",
					name: "Student",
					email: "s@example.com",
					emailVerified,
					role: "student",
				},
			}),
		},
	}) as unknown as Auth;

describe("getSessionUser assumeEmailVerified", () => {
	test("unverified user stays unverified by default", async () => {
		const user = await getSessionUser(authWith(false), new Headers());
		expect(user?.emailVerified).toBe(false);
	});

	test("flag reports an existing unverified user as verified", async () => {
		const user = await getSessionUser(authWith(false), new Headers(), true);
		expect(user?.emailVerified).toBe(true);
	});
});
