/**
 * reauth single-flight — real module, mocked auth-client transport only.
 * The module flag means one redirect per document, so a single test drives
 * both calls.
 */
import { expect, test, vi } from "vitest";

const signOutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/auth-client", () => ({
	authClient: { signOut: signOutMock },
}));

import { reauth } from "@/lib/reauth";

test("reauth() is single-flight and encodes the current location as returnUrl", async () => {
	const assign = vi.fn();
	vi.stubGlobal("window", {
		location: { assign, pathname: "/x", search: "", hash: "" },
	});
	try {
		reauth();
		reauth();
		await Promise.resolve();
		expect(signOutMock).toHaveBeenCalledTimes(1);
		expect(assign).toHaveBeenCalledTimes(1);
		expect(assign).toHaveBeenCalledWith("/login?returnUrl=%2Fx");
	} finally {
		vi.unstubAllGlobals();
	}
});
