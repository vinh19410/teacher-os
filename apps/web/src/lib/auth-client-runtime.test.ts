import { describe, expect, it } from "vitest";
import { authClient } from "./auth-client";

describe("real authClient runtime proxy integrity", () => {
	it("preserves all core better-auth client methods through the proxy without dropping them via spread", () => {
		expect(typeof authClient.signIn?.email).toBe("function");
		expect(typeof authClient.signIn?.social).toBe("function");
		expect(typeof authClient.signUp?.email).toBe("function");
		expect(typeof authClient.useSession).toBe("function");
		expect(typeof authClient.getSession).toBe("function");
		expect(typeof authClient.getCachedSession).toBe("function");
		expect(typeof authClient.clearSessionCache).toBe("function");
		expect(typeof authClient.signOut).toBe("function");
		expect(typeof authClient.updateUser).toBe("function");
	});
});
