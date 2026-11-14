// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	CLASS_ERROR_CODES,
	type StudentClass,
} from "@teacher-os/api/contracts";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/query-client";
import {
	countActiveEnrolledClasses,
	resolveAcceptEnrollmentErrorMessage,
	useAcceptClassEnrollment,
} from "@/lib/repos/student";

afterEach(() => {
	vi.restoreAllMocks();
});

function makeStudentClass(overrides: Partial<StudentClass> = {}): StudentClass {
	return {
		id: "c1",
		name: "Class 1",
		level: "IELTS",
		mode: "1:1",
		schedule: "",
		sessionsDone: 0,
		sessionsTotal: 8,
		status: "active",
		nextSession: null,
		enrollmentId: "e1",
		enrollmentStatus: "active",
		teacher: null,
		...overrides,
	};
}

describe("Student paused class & accept enrollment helpers (#694)", () => {
	it("counts only active-enrollment AND active-status classes for Lớp đang học", () => {
		const classes: StudentClass[] = [
			makeStudentClass({
				id: "c1",
				status: "active",
				enrollmentStatus: "active",
			}),
			makeStudentClass({
				id: "c2",
				status: "paused",
				enrollmentStatus: "active",
			}),
			makeStudentClass({
				id: "c3",
				status: "active",
				enrollmentStatus: "invited",
			}),
			makeStudentClass({
				id: "c4",
				status: "paused",
				enrollmentStatus: "invited",
			}),
		];

		expect(countActiveEnrolledClasses(classes)).toBe(1);
	});

	it("maps HttpError codes/statuses to Vietnamese messages without leaking raw English HTTP errors", () => {
		expect(
			resolveAcceptEnrollmentErrorMessage(
				new HttpError(409, "Class is paused", {
					code: CLASS_ERROR_CODES.CLASS_PAUSED,
				}),
			),
		).toBe("Lớp đang tạm dừng — chưa thể tham gia lúc này.");

		expect(
			resolveAcceptEnrollmentErrorMessage(
				new HttpError(404, "Failed to accept enrollment: 404"),
			),
		).toBe("Lời mời tham gia lớp không còn hiệu lực.");

		expect(
			resolveAcceptEnrollmentErrorMessage(
				new Error("Failed to accept enrollment: 500"),
			),
		).toBe("Không thể xác nhận tham gia lớp. Vui lòng thử lại.");
	});

	it("useAcceptClassEnrollment invalidates overview, schedule, class, notifications on success", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		const client = new QueryClient({
			defaultOptions: { mutations: { retry: false } },
		});
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");

		const wrapper = ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client }, children);
		const { result } = renderHook(() => useAcceptClassEnrollment(), {
			wrapper,
		});

		await act(async () => {
			await result.current.mutateAsync("enr-1");
		});

		const invalidatedKeys = invalidateSpy.mock.calls.map(
			(call) => call[0]?.queryKey,
		);
		expect(invalidatedKeys).toContainEqual(["student", "overview"]);
		expect(invalidatedKeys).toContainEqual(["student", "schedule"]);
		expect(invalidatedKeys).toContainEqual(["student", "class"]);
		expect(invalidatedKeys).toContainEqual(["student", "notifications"]);
	});

	it("useAcceptClassEnrollment invalidates overview and notifications on 409 CLASS_PAUSED / 404 race", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					error: "Class is paused",
					code: CLASS_ERROR_CODES.CLASS_PAUSED,
				}),
				{
					status: 409,
					headers: { "Content-Type": "application/json" },
				},
			),
		);
		const client = new QueryClient({
			defaultOptions: { mutations: { retry: false } },
		});
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");

		const wrapper = ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client }, children);
		const { result } = renderHook(() => useAcceptClassEnrollment(), {
			wrapper,
		});

		await act(async () => {
			try {
				await result.current.mutateAsync("enr-1");
			} catch {
				// expected
			}
		});

		const invalidatedKeys = invalidateSpy.mock.calls.map(
			(call) => call[0]?.queryKey,
		);
		expect(invalidatedKeys).toContainEqual(["student", "overview"]);
		expect(invalidatedKeys).toContainEqual(["student", "schedule"]);
		expect(invalidatedKeys).toContainEqual(["student", "class"]);
		expect(invalidatedKeys).toContainEqual(["student", "notifications"]);
	});
});
