import { describe, expect, test } from "vitest";
import {
	isRoleBlocked,
	markRoleBlocked,
	subscribeRoleBlocked,
} from "./role-block";

describe("role-block single-flight flag", () => {
	test("starts clear; mark flips it and notifies subscribers exactly once", () => {
		expect(isRoleBlocked()).toBe(false);
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
});
