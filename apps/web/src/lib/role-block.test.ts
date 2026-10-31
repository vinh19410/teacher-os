import { ACCOUNT_ERROR_CODES } from "@teacher-os/api/contracts";
import { beforeEach, describe, expect, test } from "vitest";
import {
	getRoleBlockReason,
	isRoleBlocked,
	markRoleBlocked,
	resetRoleBlockedForTest,
	subscribeRoleBlocked,
} from "./role-block";

beforeEach(() => {
	resetRoleBlockedForTest();
});

describe("role-block single-flight flag", () => {
	test("starts clear; mark flips it and notifies subscribers exactly once", () => {
		expect(isRoleBlocked()).toBe(false);
		expect(getRoleBlockReason()).toBeUndefined();
		const notifications: number[] = [];
		const unsubscribe = subscribeRoleBlocked(() => {
			notifications.push(notifications.length);
		});

		markRoleBlocked();
		markRoleBlocked(); // second call is a no-op (single-flight)

		expect(isRoleBlocked()).toBe(true);
		expect(notifications).toEqual([0]);
		unsubscribe();
	});

	test("stores blockReason when marked with ACCOUNT_TEACHER_EMAIL_UNVERIFIED (#524)", () => {
		markRoleBlocked(ACCOUNT_ERROR_CODES.TEACHER_EMAIL_UNVERIFIED);
		expect(isRoleBlocked()).toBe(true);
		expect(getRoleBlockReason()).toBe(
			ACCOUNT_ERROR_CODES.TEACHER_EMAIL_UNVERIFIED,
		);
	});
});
