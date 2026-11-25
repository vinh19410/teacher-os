// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockSignOut, mockResetPassword } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockSignOut: vi.fn(),
	mockResetPassword: vi.fn(),
}));

vi.mock("better-auth/react", () => ({
	createAuthClient: () => ({
		getSession: mockGetSession,
		signOut: mockSignOut,
		resetPassword: mockResetPassword,
	}),
}));

import { clearSessionCache, getCachedSession } from "./auth-client";
import {
	clearStudentQueryCacheIfUserChanged,
	resetStudentSessionUserForTests,
	studentQueryClient,
	syncStudentSessionUser,
} from "./query-client";
import { ACTIVE_STUDENT_USER_KEY } from "./student-org-storage";

describe("student auth-client cross-tab storage cache invalidation", () => {
	beforeEach(() => {
		clearSessionCache();
		resetStudentSessionUserForTests();
		studentQueryClient.clear();
		window.localStorage.clear();
		vi.clearAllMocks();
	});

	afterEach(() => {
		clearSessionCache();
		resetStudentSessionUserForTests();
		studentQueryClient.clear();
		window.localStorage.clear();
	});

	it("invalidates session cache immediately when another tab updates ACTIVE_STUDENT_USER_KEY or clears localStorage", async () => {
		const studentA = {
			data: {
				user: { id: "u-a", name: "Student A", role: "student" },
				session: { id: "s-a" },
			},
			error: null,
		};
		const studentB = {
			data: {
				user: { id: "u-b", name: "Student B", role: "student" },
				session: { id: "s-b" },
			},
			error: null,
		};
		mockGetSession
			.mockResolvedValueOnce(studentA)
			.mockResolvedValueOnce(studentB)
			.mockResolvedValueOnce({ data: null, error: null });

		expect(await getCachedSession()).toEqual(studentA);
		expect(mockGetSession).toHaveBeenCalledTimes(1);

		// Unrelated key must NOT invalidate cache
		window.dispatchEvent(
			new StorageEvent("storage", { key: "some_other_key", newValue: "1" }),
		);
		expect(await getCachedSession({ allowStale: true })).toEqual(studentA);
		expect(mockGetSession).toHaveBeenCalledTimes(1);

		// Another tab switches student user -> ACTIVE_STUDENT_USER_KEY storage event invalidates cache immediately
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: ACTIVE_STUDENT_USER_KEY,
				oldValue: "u-a",
				newValue: "u-b",
			}),
		);
		expect(await getCachedSession({ allowStale: true })).toEqual(studentB);
		expect(mockGetSession).toHaveBeenCalledTimes(2);

		// Storage clear (key === null) also invalidates cache immediately
		window.dispatchEvent(new StorageEvent("storage", { key: null }));
		expect(await getCachedSession({ allowStale: true })).toEqual({
			data: null,
			error: null,
		});
		expect(mockGetSession).toHaveBeenCalledTimes(3);
	});

	it("clears studentQueryClient in RAM on cross-tab ACTIVE_STUDENT_USER_KEY storage event and preload user mismatch without overwriting localStorage", () => {
		syncStudentSessionUser("u-a");
		studentQueryClient.setQueryData(["student", "quiz", "a-1"], {
			owner: "u-a",
		});
		expect(window.localStorage.getItem(ACTIVE_STUDENT_USER_KEY)).toBe("u-a");

		// Another tab switches user in localStorage and fires storage event
		window.localStorage.setItem(ACTIVE_STUDENT_USER_KEY, "u-b");
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: ACTIVE_STUDENT_USER_KEY,
				oldValue: "u-a",
				newValue: "u-b",
			}),
		);
		expect(
			studentQueryClient.getQueryData(["student", "quiz", "a-1"]),
		).toBeUndefined();
		expect(window.localStorage.getItem(ACTIVE_STUDENT_USER_KEY)).toBe("u-b");

		// Preloading u-b after storage clear tracks RAM owner so a subsequent switch clears RAM even if storage event is missed
		clearStudentQueryCacheIfUserChanged("u-b");
		studentQueryClient.setQueryData(["student", "quiz", "b-1"], {
			owner: "u-b",
		});
		clearStudentQueryCacheIfUserChanged("u-c");
		expect(
			studentQueryClient.getQueryData(["student", "quiz", "b-1"]),
		).toBeUndefined();

		// Fallback if storage event was missed (e.g. bfcache): preload helper clears RAM without mutating localStorage
		syncStudentSessionUser("u-a");
		studentQueryClient.setQueryData(["student", "quiz", "a-2"], {
			owner: "u-a",
		});
		const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
		clearStudentQueryCacheIfUserChanged("u-b");
		expect(
			studentQueryClient.getQueryData(["student", "quiz", "a-2"]),
		).toBeUndefined();
		expect(setItemSpy).not.toHaveBeenCalled();
		setItemSpy.mockRestore();
	});
});
