/**
 * Decision table for direct-action outcomes: every KernelCommandResult maps
 * to a truthful toast + reconcile policy. Pure — no toast import needed here.
 */
import { CLASS_ERROR_CODES } from "@teacher-os/api/contracts";
import { beforeEach, describe, expect, test, vi } from "vitest";

const toastMock = vi.hoisted(() => ({
	success: vi.fn(),
	info: vi.fn(),
	warning: vi.fn(),
	error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import { HttpError } from "./kernel-load-state";
import {
	CLASS_PAUSED_MESSAGE,
	FUTURE_SESSION_MESSAGE,
	occurrenceSummary,
	planDirectOutcome,
	reportDirectOutcome,
} from "./kernel-outcome";

describe("planDirectOutcome", () => {
	test("refreshed reports success and settles", () => {
		expect(
			planDirectOutcome({ kind: "refreshed", id: "l-1" }, "Đã điểm danh."),
		).toEqual({
			toastKind: "success",
			message: "Đã điểm danh.",
			reconcile: "none",
		});
	});

	test("committed is info — saved server-side, snapshot refresh failed", () => {
		expect(planDirectOutcome({ kind: "committed" }, "x")).toEqual({
			toastKind: "info",
			message: "Đã lưu trên máy chủ nhưng chưa tải lại được dữ liệu.",
			reconcile: "none",
		});
	});

	test("a plain 4xx definite failure is an error that settles", () => {
		const plan = planDirectOutcome(
			{ kind: "definite-failure", status: 400, error: new Error("bad") },
			"x",
		);
		expect(plan.toastKind).toBe("error");
		expect(plan.message).toBe(
			"Không lưu được — dữ liệu chưa được ghi lên máy chủ.",
		);
		expect(plan.reconcile).toBe("none");
	});

	test("409 is the duplicate-guard: info + heal, never a false write failure", () => {
		const plan = planDirectOutcome(
			{
				kind: "definite-failure",
				status: 409,
				error: new HttpError(409, "POST /api/lessons/l1/check-in failed: 409"),
			},
			"Đã điểm danh.",
		);
		expect(plan.toastKind).toBe("info");
		expect(plan.message).toMatch(/được cập nhật trước đó/);
		expect(plan.reconcile).toBe("heal-409");
	});

	test("409 on reorder/delete uses set-mismatch copy, not duplicate-guard", () => {
		const plan = planDirectOutcome(
			{
				kind: "definite-failure",
				status: 409,
				error: new HttpError(409, "POST reorder failed: 409"),
			},
			"Đã đổi thứ tự module.",
			"reorder-modules",
		);
		expect(plan.message).toMatch(/Thứ tự đã đổi/);
		expect(plan.message).not.toMatch(/được cập nhật trước đó/);
		expect(plan.reconcile).toBe("heal-409");
	});

	test("outcome-unknown warns and reconciles — never claims unsaved", () => {
		const plan = planDirectOutcome(
			{ kind: "outcome-unknown", error: new TypeError("fetch failed") },
			"x",
		);
		expect(plan.toastKind).toBe("warning");
		expect(plan.message).toMatch(/có thể đã lưu/);
		expect(plan.message).not.toMatch(/chưa được ghi/);
		expect(plan.reconcile).toBe("check");
	});
});

describe("future-session rejection (422)", () => {
	const futureSession = {
		kind: "definite-failure" as const,
		status: 422,
		error: new Error("future-session"),
		reason: "future-session",
	};

	test("planDirectOutcome: dedicated copy, and reconciles so a stale tab resyncs", () => {
		expect(planDirectOutcome(futureSession, "x")).toEqual({
			toastKind: "error",
			message: FUTURE_SESSION_MESSAGE,
			reconcile: "check",
		});
		expect(FUTURE_SESSION_MESSAGE).toBe(
			"Chưa tới ngày học — chưa thể điểm danh.",
		);
	});

	test("occurrenceSummary: same copy on the class-detail path", () => {
		expect(occurrenceSummary(futureSession, "x")).toEqual({
			kind: "error",
			message: FUTURE_SESSION_MESSAGE,
		});
	});

	test("a 422 without the future-session reason keeps the generic failure copy", () => {
		const other = { ...futureSession, reason: "something-else" };
		expect(planDirectOutcome(other, "x").message).toBe(
			"Không lưu được — dữ liệu chưa được ghi lên máy chủ.",
		);
		expect(occurrenceSummary(other, "x").message).toBe(
			"Không lưu được — dữ liệu chưa được ghi lên máy chủ.",
		);
	});
});

describe("class-paused rejection (409 CLASS_PAUSED)", () => {
	const classPaused = {
		kind: "definite-failure" as const,
		status: 409,
		code: CLASS_ERROR_CODES.CLASS_PAUSED,
		error: new HttpError(409, "Lớp đang tạm dừng", {
			code: CLASS_ERROR_CODES.CLASS_PAUSED,
		}),
		reason: "Lớp đang tạm dừng",
	};

	beforeEach(() => {
		toastMock.success.mockReset();
		toastMock.info.mockReset();
		toastMock.warning.mockReset();
		toastMock.error.mockReset();
	});

	test("planDirectOutcome maps CLASS_PAUSED to single error toast and heal-409 reconcile", () => {
		expect(planDirectOutcome(classPaused, "Đã điểm danh.")).toEqual({
			toastKind: "error",
			message: CLASS_PAUSED_MESSAGE,
			reconcile: "heal-409",
		});
	});

	test("occurrenceSummary maps CLASS_PAUSED to Vietnamese error message", () => {
		expect(occurrenceSummary(classPaused, "Đã điểm danh.")).toEqual({
			kind: "error",
			message: CLASS_PAUSED_MESSAGE,
		});
	});

	test("reportDirectOutcome suppresses conflicting toast.info when toastKind is error and refresh succeeds", async () => {
		const refresh = vi.fn().mockResolvedValue(true);
		await reportDirectOutcome(
			classPaused,
			"Đã điểm danh.",
			refresh,
			"check-in",
		);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(toastMock.error).toHaveBeenCalledTimes(1);
		expect(toastMock.error).toHaveBeenCalledWith(CLASS_PAUSED_MESSAGE);
		expect(toastMock.info).not.toHaveBeenCalled();
	});
});
